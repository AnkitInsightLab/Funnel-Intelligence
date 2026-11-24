'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import catalog from '@/lib/catalog.json';
import { track } from '@/lib/datalayer';
import { useFlag, expose } from '@/lib/flags';

interface LastOrder { orderId: string; total: number; items?: string[]; at?: number }

// fix_replenish_optin: offer a reminder timed to when this pack runs out
// (order date + product cycle − 3 days), with explicit consent.
function Reminder({ order }: { order: LastOrder }) {
  const flag = useFlag('fix_replenish_optin');
  const product = catalog.products.find((p) => p.id === order.items?.[0]);
  const [channel, setChannel] = useState<'whatsapp' | 'email'>('whatsapp');
  const [consent, setConsent] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => { if (product) expose('fix_replenish_optin', flag); }, [flag, product]);
  if (!product || flag !== 'treatment') return null;
  const remindOn = new Date((order.at ?? Date.now()) + (product.cycleDays - 3) * 86400000);
  const label = remindOn.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const submit = () => {
    if (!consent) return;
    track('replenish_optin', { product_id: product.id, channel, remind_on: remindOn.toISOString().slice(0, 10) });
    setDone(true);
  };
  return (
    <div className="panel" style={{ marginTop: 16, borderColor: '#1f4d3a' }}>
      {done ? (
        <p style={{ margin: 0 }}>✅ Done. We&apos;ll remind you on <b>{label}</b> by {channel === 'whatsapp' ? 'WhatsApp' : 'email'}, 3 days before your {product.name.split(',')[0]} runs out.
          <span className="small" style={{ display: 'block', color: '#8f8c85', marginTop: 6 }}>Demo: no message will actually be sent and no contact details are collected.</span></p>
      ) : (
        <>
          <b>Never run out of {product.name.split(',')[0]}</b>
          <p className="small" style={{ margin: '6px 0 10px', color: '#3b3a37' }}>One pack lasts about {product.cycleDays} days. Want a reminder on <b>{label}</b>, 3 days before it runs out? One message, no spam.</p>
          <div className="pdp" style={{ padding: 0, display: 'block' }}>
            <div className="chips">
              <button type="button" className={channel === 'whatsapp' ? 'on' : undefined} onClick={() => setChannel('whatsapp')}>WhatsApp</button>
              <button type="button" className={channel === 'email' ? 'on' : undefined} onClick={() => setChannel('email')}>Email</button>
            </div>
          </div>
          <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '10px 0' }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>I agree to receive one reminder about this product on {channel === 'whatsapp' ? 'WhatsApp' : 'email'}. I can opt out any time.</span>
          </label>
          <button className="sbtn" type="button" disabled={!consent} onClick={submit} style={{ opacity: consent ? 1 : 0.5 }}>Remind me on {label}</button>
        </>
      )}
    </div>
  );
}

function Done() {
  const orderId = useSearchParams().get('order');
  const [order, setOrder] = useState<LastOrder | null>(null);
  useEffect(() => { try { const o = JSON.parse(sessionStorage.getItem('hn_last_order') || 'null'); if (o && o.orderId === orderId) setOrder(o); } catch { /* ignore */ } }, [orderId]);
  return (
    <div style={{ padding: '30px 0 80px', maxWidth: 560 }}>
      <h1>Order placed (demo)</h1>
      <p>Order <b>{orderId}</b> was recorded as a <code>payment_completed</code> event. No payment was taken.</p>
      {order && <Reminder order={order} />}
      <p style={{ color: '#64625d', marginTop: 16 }}>Open the data layer panel (bottom right) to see the full trail from page view to payment, and which destinations received each event.</p>
      <Link href="/fixes" className="sbtn" style={{ display: 'inline-block', textDecoration: 'none' }}>See what each fix is measuring</Link>
    </div>
  );
}
export default function Success() { return <Suspense><Done /></Suspense>; }
