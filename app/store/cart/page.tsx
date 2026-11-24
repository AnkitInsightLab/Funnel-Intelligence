'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFlag, expose } from '@/lib/flags';
import { track } from '@/lib/datalayer';
import { COUPONS } from '@/lib/coupons';
import { useCart, cartTotals, inr, Tub } from '@/components/Cart';
import catalog from '@/lib/catalog.json';

export default function CartPage() {
  const { lines, setQty } = useCart();
  const t = cartTotals(lines);
  const router = useRouter();
  const hints = useFlag('fix_coupon_hints');
  useEffect(() => { if (t.items.length) expose('fix_coupon_hints', hints); }, [hints, t.items.length]);
  const pickCode = (code: string) => {
    track('coupon_hint_clicked', { coupon_code: code });
    try { sessionStorage.setItem('hn_coupon_hint', code); } catch { /* ignore */ }
    router.push('/store/checkout');
  };
  const live = Object.entries(COUPONS).filter(([, d]) => !d.expired);
  if (t.items.length === 0) return (
    <div style={{ padding: '20px 0 80px' }}><h1>Your cart is empty</h1><Link href="/store" className="sbtn" style={{ textDecoration: 'none', display: 'inline-block' }}>Shop bestsellers</Link></div>
  );
  return (
    <div style={{ padding: '8px 0 80px', maxWidth: 720 }}>
      <h1>Cart</h1>
      <div className="panel">
        {t.items.map((x) => (
          <div key={x.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #eee9de' }}>
            <Tub color={x.p.color} size={56} />
            <div style={{ flex: 1 }}><div style={{ fontWeight: 560, fontSize: 14 }}>{x.p.name}</div><span className="price">{inr(x.p.price)}</span></div>
            <div className="pdp" style={{ display: 'block', padding: 0 }}><div className="chips" style={{ alignItems: 'center' }}>
              <button onClick={() => setQty(x.id, x.qty - 1)} aria-label="Decrease">−</button>
              <span style={{ padding: '6px 8px' }}>{x.qty}</span>
              <button onClick={() => setQty(x.id, x.qty + 1)} aria-label="Increase">+</button>
            </div></div>
          </div>
        ))}
        <div style={{ display: 'grid', gap: 4, marginTop: 12, fontSize: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span className="num">{inr(t.subtotal)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {/* Planted leak: the heavy-item fee appears here for the first time, not on the product page */}
            <span>Delivery{t.heavy ? ` (heavy item over ${catalog.heavyShippingFee.minWeightKg} kg)` : ''}</span>
            <span className="num" style={t.heavy ? { color: '#b42318', fontWeight: 600 } : undefined}>{t.delivery ? inr(t.delivery) : 'Free'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16, marginTop: 6 }}><span>Total</span><span className="num">{inr(t.total)}</span></div>
        </div>
      </div>
      {hints === 'treatment' && (
        <div className="panel" style={{ marginTop: 12 }}>
          <b>Coupons for this cart</b>
          {live.map(([code, d]) => {
            const gap = d.min - t.subtotal;
            return (
              <div key={code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #eee9de', fontSize: 14 }}>
                <span><b>{code}</b> · {d.pct}% off{d.min ? ` on ₹${d.min.toLocaleString('en-IN')}+` : ''}</span>
                {gap > 0
                  ? <span style={{ color: '#64625d' }}>Add {inr(gap)} more to unlock</span>
                  : <button className="sbtn alt" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => pickCode(code)}>Use at checkout</button>}
              </div>
            );
          })}
        </div>
      )}
      <Link href="/store/checkout" className="sbtn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 14 }}>Checkout</Link>
    </div>
  );
}
