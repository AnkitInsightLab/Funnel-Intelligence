'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { history, type TrackedEvent } from '@/lib/datalayer';

interface FunnelRow { label: string; sessions: number; viewed: number; carted: number; checkout: number; paid: number; revenue: number }
interface Live { configured: boolean; error?: string; funnel?: FunnelRow[]; recent?: { event_name: string; page_type: string; platform: string; utm_source: string; at: string }[]; total?: { events: number; sessions: number }; at?: string }
interface Status { postgres: boolean; clevertap: boolean; moengage: boolean }

const CLIENT = {
  Mixpanel: !!process.env.NEXT_PUBLIC_MIXPANEL_TOKEN,
  PostHog: !!process.env.NEXT_PUBLIC_POSTHOG_KEY,
  'Microsoft Clarity': !!process.env.NEXT_PUBLIC_CLARITY_ID,
};
const pctOf = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) + '%' : '–');

export default function LivePanel() {
  const [live, setLive] = useState<Live | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [mine, setMine] = useState<TrackedEvent[]>([]);

  useEffect(() => {
    setMine([...history]);
    fetch('/api/track').then((r) => r.json()).then(setStatus).catch(() => setStatus(null));
    const load = () => fetch('/api/live', { cache: 'no-store' }).then((r) => r.json()).then(setLive).catch(() => setLive({ configured: true, error: 'unreachable' }));
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  const integrations: [string, boolean | undefined, string][] = [
    ['Mixpanel', CLIENT.Mixpanel, 'Events, funnels, Live View: browser SDK'],
    ['PostHog', CLIENT.PostHog, 'Feature flag pdp_sticky_atc + events'],
    ['Microsoft Clarity', CLIENT['Microsoft Clarity'], 'Heatmaps, scroll maps, recordings'],
    ['Postgres (Neon)', status?.postgres, 'Raw event store → this page'],
    ['CleverTap', status?.clevertap, 'Server-side /1/upload'],
    ['MoEngage', status?.moengage, 'Server-side Data API'],
  ];
  const has = (n: string) => mine.some((e) => e.event === n);
  const myFunnel: [string, boolean][] = [['Viewed a product', has('product_viewed')], ['Added to cart', has('add_to_cart')], ['Started checkout', has('checkout_started')], ['Paid', has('payment_completed')]];

  return (
    <>
      <section className="section card">
        <h2>Integrations</h2>
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Destination</th><th>Status</th><th>What it does here</th></tr></thead>
            <tbody>{integrations.map(([n, on, d]) => (
              <tr key={n}><td><b>{n}</b></td><td><span className={`tag ${on ? 'live' : on === undefined ? 'model' : 'sim'}`}>{on ? 'live' : on === undefined ? 'checking' : 'not configured'}</span></td><td className="small muted">{d}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>&ldquo;Not configured&rdquo; means no key is set for that tool in this deployment. Nothing is faked: the store&apos;s data layer panel shows the same status per event.</p>
      </section>

      <section className="section card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <h2 style={{ margin: 0 }}>Live conversion from real visitors</h2>
          {live?.at && <span className="small muted">refreshes every 10 s · {new Date(live.at).toLocaleTimeString()}</span>}
        </div>
        {!live ? <p className="small muted">Loading…</p> : !live.configured ? (
          <p className="small muted">Postgres is not configured in this deployment, so there is no live event store to read. Set <code>DATABASE_URL</code> (Neon) and run <code>db/schema.sql</code>; every store event then lands here within a second.</p>
        ) : live.error ? <p className="small down">Could not read live events ({live.error}).</p> : (
          <>
            <p className="small muted">{live.total?.events.toLocaleString('en-IN')} live events from {live.total?.sessions.toLocaleString('en-IN')} sessions so far. Strict funnel, same definition as the synthetic analysis.</p>
            <div className="scroll-x">
              <table className="tbl">
                <thead><tr><th>Window</th><th className="r">Sessions</th><th className="r">→ viewed</th><th className="r">→ cart</th><th className="r">→ checkout</th><th className="r">→ paid</th><th className="r">Session CVR</th><th className="r">Revenue</th></tr></thead>
                <tbody>{live.funnel?.map((f) => (
                  <tr key={f.label}><td>{f.label}</td><td className="r">{f.sessions}</td><td className="r">{f.viewed}</td><td className="r">{f.carted}</td><td className="r">{f.checkout}</td><td className="r">{f.paid}</td>
                    <td className="r"><b>{pctOf(f.paid, f.sessions)}</b></td><td className="r">₹{f.revenue.toLocaleString('en-IN')}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <h3 style={{ marginTop: 16 }}>Latest events</h3>
            <table className="tbl"><tbody>{live.recent?.map((r, i) => (
              <tr key={i}><td className="num small muted">{r.at}</td><td><code>{r.event_name}</code></td><td className="small">{r.page_type}</td><td className="small muted">{r.platform} · {r.utm_source}</td></tr>
            ))}</tbody></table>
          </>
        )}
      </section>

      <section className="section card">
        <h2>Your session, right now</h2>
        {mine.length === 0 ? <p className="small muted">No events from this browser yet. <Link href="/store?utm_source=portfolio">Open the store</Link> and come back.</p> : (
          <>
            <table className="tbl"><tbody>{myFunnel.map(([s, ok]) => <tr key={s}><td>{s}</td><td><span className={`tag ${ok ? 'live' : 'sim'}`}>{ok ? 'yes' : 'not yet'}</span></td></tr>)}</tbody></table>
            <p className="small muted" style={{ marginTop: 8 }}>From the {mine.length} events this browser sent. In Mixpanel, the same events appear under Events → Live view within seconds when the token is set.</p>
          </>
        )}
      </section>
    </>
  );
}
