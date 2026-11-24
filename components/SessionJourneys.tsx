'use client';
// Reads this browser's own data layer history (from the storefront) and shows which
// journeys it would enter, plus the exact CleverTap / MoEngage payloads for the last event.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { history, type TrackedEvent } from '@/lib/datalayer';
import { toCleverTap, toMoEngage } from '@/lib/crm';

export default function SessionJourneys() {
  const [events, setEvents] = useState<TrackedEvent[] | null>(null);
  useEffect(() => { setEvents([...history]); }, []);
  if (events === null) return null;
  const has = (n: string) => events.some((e) => e.event === n);
  const last = events.find((e) => !['page_viewed', 'scroll_depth', 'element_clicked'].includes(e.event));
  const entered = [
    has('payment_failed') && !has('payment_completed') && 'Payment failure recovery (WhatsApp utility, 15 min)',
    has('add_to_cart') && !has('checkout_started') && 'Abandoned cart (WhatsApp marketing, 1 h)',
    has('payment_completed') && 'Welcome series (email, day 2) and replenishment reminder (WhatsApp, cycle − 3 days)',
    has('coupon_failed') && !has('payment_completed') && 'Coupon rescue (email, 30 min)',
  ].filter(Boolean) as string[];

  return (
    <div className="card">
      <h2>Your own session</h2>
      {events.length === 0 ? (
        <p className="small muted">No events from this browser yet. <Link href="/store">Open the store</Link>, add something to the cart, maybe fail a payment, then come back.</p>
      ) : (
        <>
          <p className="small">From {events.length} events this browser sent, you would now be in:</p>
          {entered.length ? <ul className="small">{entered.map((j) => <li key={j}>{j}</li>)}</ul> : <p className="small muted">No journey yet (you only browsed).</p>}
          {last && (
            <div className="grid g2">
              <div>
                <div className="small muted">CleverTap upload body for your last <code>{last.event}</code></div>
                <pre className="code">{JSON.stringify({ d: [toCleverTap(last.event, last.props)] }, null, 2)}</pre>
              </div>
              <div>
                <div className="small muted">MoEngage Data API body for the same event</div>
                <pre className="code">{JSON.stringify(toMoEngage(last.event, last.props), null, 2)}</pre>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
