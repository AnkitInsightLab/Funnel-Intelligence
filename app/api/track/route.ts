// Receives data layer events from the storefront and fans them out server-side:
//   Postgres (Neon)  when DATABASE_URL is set
//   CleverTap        when CLEVERTAP_ACCOUNT_ID + CLEVERTAP_PASSCODE are set  (POST /1/upload)
//   MoEngage         when MOENGAGE_APP_ID + MOENGAGE_DATA_API_KEY are set    (Data API /v1/event)
// Each destination reports its own status, so the inspector never shows a fake "sent".
import { neon } from '@neondatabase/serverless';
import { EVENTS } from '@/lib/tracking-plan';
import { toCleverTap, toMoEngage } from '@/lib/crm';

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
const CT_ID = process.env.CLEVERTAP_ACCOUNT_ID, CT_PASS = process.env.CLEVERTAP_PASSCODE;
const CT_HOST = process.env.CLEVERTAP_REGION ? `https://${process.env.CLEVERTAP_REGION}.api.clevertap.com` : 'https://api.clevertap.com';
const MOE_ID = process.env.MOENGAGE_APP_ID, MOE_KEY = process.env.MOENGAGE_DATA_API_KEY;
const MOE_HOST = `https://api-0${process.env.MOENGAGE_DC || '1'}.moengage.com`;
const ALLOWED = new Set(EVENTS.map((e) => e.name));

// tiny per-instance rate limit: a public demo should not be a free write endpoint
const hits = new Map<string, { n: number; t: number }>();
function limited(ip: string) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > 60_000) { hits.set(ip, { n: 1, t: now }); return false; }
  h.n++;
  return h.n > 120;
}

const str = (v: unknown, max = 120) => (typeof v === 'string' ? v.slice(0, max) : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const withTimeout = (p: Promise<Response>) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))]);

type Status = 'stored' | 'sent' | 'off' | 'error';

async function toPostgres(event: string, props: Record<string, unknown>): Promise<Status> {
  if (!sql) return 'off';
  await sql`
    INSERT INTO events (event_time, event_name, user_id, session_id, platform, app_version, utm_source, is_returning,
      page_type, category, product_id, price, quantity, query, results_count, coupon_code, error_code,
      element, is_dead_click, scroll_pct, experiment, variant, order_id, revenue, source)
    VALUES (now(), ${event}, ${str(props.user_id) ?? str(props.anonymous_id) ?? 'unknown'}, ${str(props.session_id) ?? 'unknown'},
      ${str(props.platform) ?? 'web'}, ${str(props.app_version)}, ${str(props.utm_source) ?? 'direct'}, ${props.is_returning === true},
      ${str(props.page_type)}, ${str(props.category)}, ${str(props.product_id)}, ${num(props.price)}, ${num(props.quantity)},
      ${str(props.query)}, ${num(props.results_count)}, ${str(props.coupon_code)}, ${str(props.error_code)},
      ${str(props.element)}, ${typeof props.is_dead_click === 'boolean' ? props.is_dead_click : null}, ${num(props.scroll_pct)},
      ${str(props.experiment)}, ${str(props.variant)}, ${str(props.order_id)}, ${num(props.revenue)}, 'live')`;
  return 'stored';
}

async function toCleverTapApi(event: string, props: Record<string, unknown>): Promise<Status> {
  if (!CT_ID || !CT_PASS) return 'off';
  // CleverTap only needs the funnel and CRM-relevant events, not scroll/click noise
  if (['scroll_depth', 'element_clicked', 'page_viewed'].includes(event)) return 'off';
  const res = await withTimeout(fetch(`${CT_HOST}/1/upload`, {
    method: 'POST',
    headers: { 'X-CleverTap-Account-Id': CT_ID, 'X-CleverTap-Passcode': CT_PASS, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ d: [toCleverTap(event, props)] }),
  }));
  if (!res.ok) console.error('clevertap', res.status, await res.text().catch(() => ''));
  return res.ok ? 'sent' : 'error';
}

async function toMoEngageApi(event: string, props: Record<string, unknown>): Promise<Status> {
  if (!MOE_ID || !MOE_KEY) return 'off';
  if (['scroll_depth', 'element_clicked', 'page_viewed'].includes(event)) return 'off';
  const res = await withTimeout(fetch(`${MOE_HOST}/v1/event/${MOE_ID}`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${MOE_ID}:${MOE_KEY}`).toString('base64'), 'Content-Type': 'application/json' },
    body: JSON.stringify(toMoEngage(event, props)),
  }));
  if (!res.ok) console.error('moengage', res.status, await res.text().catch(() => ''));
  return res.ok ? 'sent' : 'error';
}

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (limited(ip)) return Response.json({ stored: false, reason: 'rate_limited' }, { status: 429 });
  let body: { event?: string; props?: Record<string, unknown> };
  try { body = await req.json(); } catch { return Response.json({ stored: false, reason: 'bad_json' }, { status: 400 }); }
  const { event, props = {} } = body;
  if (!event || !ALLOWED.has(event)) return Response.json({ stored: false, reason: 'unknown_event' }, { status: 400 });

  const settle = (p: Promise<Status>) => p.catch((e) => { console.error(event, e); return 'error' as Status; });
  const [postgres, clevertap, moengage] = await Promise.all([
    settle(toPostgres(event, props)), settle(toCleverTapApi(event, props)), settle(toMoEngageApi(event, props)),
  ]);
  return Response.json({ stored: postgres === 'stored', destinations: { Postgres: postgres, CleverTap: clevertap, MoEngage: moengage } });
}

export async function GET() {
  return Response.json({ postgres: !!sql, clevertap: !!(CT_ID && CT_PASS), moengage: !!(MOE_ID && MOE_KEY), events: [...ALLOWED] });
}
