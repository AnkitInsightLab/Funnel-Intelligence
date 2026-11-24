'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart, cartTotals, inr } from '@/components/Cart';
import { track } from '@/lib/datalayer';
import { useFlag, expose } from '@/lib/flags';

import { COUPONS } from '@/lib/coupons';

export default function Checkout() {
  const { lines, clear } = useCart();
  const router = useRouter();
  const t = cartTotals(lines);
  const [code, setCode] = useState('');
  const [coupon, setCoupon] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [method, setMethod] = useState('upi');
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const retryFlag = useFlag('fix_payment_retry');
  const [failed, setFailed] = useState(false);

  // a coupon picked from the cart hints (fix_coupon_hints) arrives pre-filled
  useEffect(() => { try { const h = sessionStorage.getItem('hn_coupon_hint'); if (h) { setCode(h); sessionStorage.removeItem('hn_coupon_hint'); } } catch { /* ignore */ } }, []);

  const discount = coupon ? Math.round((t.subtotal * COUPONS[coupon].pct) / 100) : 0;
  const total = t.total - discount;

  useEffect(() => {
    if (!started.current && t.items.length) { started.current = true; track('checkout_started', { revenue: t.total }); }
  }, [t.items.length, t.total]);

  if (!t.items.length && !busy) return <div style={{ padding: '20px 0 80px' }}><h1>Nothing to check out</h1></div>;

  const apply = () => {
    const c = code.trim().toUpperCase();
    const def = COUPONS[c];
    let err: string | null = null;
    if (!def) err = 'NOT_APPLICABLE';
    else if (def.expired) err = 'COUPON_EXPIRED';
    else if (t.subtotal < def.min) err = 'MIN_CART_VALUE';
    if (err) {
      track('coupon_failed', { coupon_code: c, error_code: err });
      setMsg({ ok: false, text: err === 'MIN_CART_VALUE' ? `Add ${inr(def!.min - t.subtotal)} more to use ${c}.` : err === 'COUPON_EXPIRED' ? `${c} has expired.` : `${c} is not a valid code.` });
      setCoupon(null);
    } else {
      track('coupon_applied', { coupon_code: c });
      setCoupon(c); setMsg({ ok: true, text: `${c} applied: ${def!.pct}% off.` });
    }
  };

  const pay = (simulateFailure: boolean, m: string = method) => {
    setBusy(true);
    track('payment_attempted', { revenue: total, payment_method: m });
    setTimeout(() => {
      if (simulateFailure) {
        track('payment_failed', { error_code: m === 'upi' ? 'UPI_INTENT_TIMEOUT' : 'CARD_DECLINED' });
        setFailed(true);
        expose('fix_payment_retry', retryFlag);
        setMsg(retryFlag === 'treatment' ? null : { ok: false, text: 'Payment did not go through. Nothing was charged; try again.' });
        setBusy(false);
        return;
      }
      const orderId = 'HN' + Date.now().toString().slice(-7);
      // fire once per order id, even if the confirmation is re-rendered or refreshed
      try { sessionStorage.setItem('hn_last_order', JSON.stringify({ orderId, total, items: t.items.map((x) => x.id), at: Date.now() })); } catch { /* ignore */ }
      track('payment_completed', { order_id: orderId, revenue: total });
      clear();
      router.push(`/store/success?order=${orderId}`);
    }, 700);
  };

  return (
    <div style={{ padding: '8px 0 80px', maxWidth: 620 }}>
      <h1>Checkout</h1>
      <div className="panel" style={{ display: 'grid', gap: 10 }}>
        <b>Delivery address</b>
        <input className="field" placeholder="Name (demo: anything)" aria-label="Name" />
        <input className="field" placeholder="Address (demo: not stored)" aria-label="Address" />
      </div>
      <div className="panel" style={{ marginTop: 12 }}>
        <b>Coupon</b>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input className="field" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Try FIT15, FIRST10 or DIWALI20" aria-label="Coupon code" />
          <button className="sbtn alt" onClick={apply} type="button">Apply</button>
        </div>
        {msg && <p className={msg.ok ? 'msg-ok' : 'msg-err'} style={{ margin: '8px 0 0' }}>{msg.text}</p>}
      </div>
      {failed && retryFlag === 'treatment' && !busy && (
        <div className="panel" role="alert" style={{ marginTop: 12, borderColor: '#1f4d3a', background: '#f1f7f3' }}>
          <b>Your payment didn&apos;t go through. You were not charged.</b>
          <p className="small" style={{ margin: '6px 0 10px', color: '#3b3a37' }}>Your cart is saved. UPI app hand-offs sometimes time out on iPhone; paying with your UPI ID usually works.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="sbtn" type="button" onClick={() => { track('payment_retry_used', { payment_method: 'upi_id' }); setMethod('upi'); setFailed(false); pay(false, 'upi'); }}>Pay {inr(total)} with UPI ID</button>
            <button className="sbtn alt" type="button" onClick={() => { track('payment_retry_used', { payment_method: 'cod' }); setMethod('cod'); setFailed(false); pay(false, 'cod'); }}>Cash on delivery</button>
          </div>
        </div>
      )}
      <div className="panel" style={{ marginTop: 12 }}>
        <b>Payment (simulated, nothing is charged)</b>
        <div className="pdp" style={{ padding: 0, display: 'block' }}>
          <div className="chips" style={{ marginTop: 8 }}>
            {[['upi', 'UPI'], ['card', 'Card'], ['cod', 'Cash on delivery']].map(([k, l]) => (
              <button key={k} className={method === k ? 'on' : undefined} onClick={() => setMethod(k)} type="button">{l}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 4, marginTop: 12, fontSize: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span className="num">{inr(t.subtotal)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Delivery</span><span className="num">{t.delivery ? inr(t.delivery) : 'Free'}</span></div>
          {discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Discount</span><span className="num">−{inr(discount)}</span></div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16 }}><span>Pay</span><span className="num">{inr(total)}</span></div>
        </div>
        <button className="sbtn" style={{ width: '100%', marginTop: 12 }} disabled={busy} onClick={() => pay(false)}>{busy ? 'Processing…' : `Pay ${inr(total)}`}</button>
        <button type="button" onClick={() => pay(true)} disabled={busy} style={{ background: 'none', border: 0, color: '#64625d', textDecoration: 'underline', marginTop: 8, cursor: 'pointer', font: 'inherit', fontSize: 13 }}>
          Simulate a failed payment
        </button>
      </div>
    </div>
  );
}
