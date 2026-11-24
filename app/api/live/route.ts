// Live metrics from real storefront traffic (events with source = 'live' in Neon).
// Aggregates only: no ids leave the server.
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';
const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

export async function GET() {
  if (!sql) return Response.json({ configured: false });
  try {
    const funnel = await sql`
      WITH s AS (
        SELECT session_id, min(event_time) AS started,
          bool_or(event_name = 'product_viewed') AS viewed, bool_or(event_name = 'add_to_cart') AS carted,
          bool_or(event_name = 'checkout_started') AS checkout, bool_or(event_name = 'payment_completed') AS paid,
          coalesce(sum(revenue) FILTER (WHERE event_name = 'payment_completed'), 0) AS revenue
        FROM events WHERE source = 'live' AND event_time > now() - interval '7 days'
        GROUP BY session_id
      )
      SELECT w.label,
        count(*) FILTER (WHERE s.started > now() - w.span)::int AS sessions,
        count(*) FILTER (WHERE s.started > now() - w.span AND viewed)::int AS viewed,
        count(*) FILTER (WHERE s.started > now() - w.span AND viewed AND carted)::int AS carted,
        count(*) FILTER (WHERE s.started > now() - w.span AND viewed AND carted AND checkout)::int AS checkout,
        count(*) FILTER (WHERE s.started > now() - w.span AND viewed AND carted AND checkout AND paid)::int AS paid,
        coalesce(round(sum(revenue) FILTER (WHERE s.started > now() - w.span)), 0)::float8 AS revenue
      FROM s CROSS JOIN (VALUES ('Last hour', interval '1 hour'), ('Last 24 hours', interval '24 hours'), ('Last 7 days', interval '7 days')) AS w(label, span)
      GROUP BY w.label, w.span ORDER BY w.span`;
    const recent = await sql`
      SELECT event_name, page_type, platform, utm_source, to_char(event_time AT TIME ZONE 'Asia/Kolkata', 'DD Mon HH24:MI:SS') AS at
      FROM events WHERE source = 'live' AND event_name NOT IN ('scroll_depth') ORDER BY event_time DESC LIMIT 15`;
    const total = await sql`SELECT count(*)::int AS events, count(DISTINCT session_id)::int AS sessions FROM events WHERE source = 'live'`;
    return Response.json({ configured: true, funnel, recent, total: total[0], at: new Date().toISOString() });
  } catch (e) {
    console.error('live metrics', e);
    return Response.json({ configured: true, error: 'query_failed' }, { status: 500 });
  }
}
