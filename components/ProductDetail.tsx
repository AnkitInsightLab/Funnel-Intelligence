'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import catalog from '@/lib/catalog.json';
import { useCart, productById, inr, Tub } from './Cart';
import { track, bucket, whenReady } from '@/lib/datalayer';
import { useFlag, expose } from '@/lib/flags';

type PH = { onFeatureFlags: (cb: () => void) => void; getFeatureFlag: (k: string) => string | boolean | undefined };

export default function ProductDetail({ id }: { id: string }) {
  const p = productById(id);
  const { add } = useCart();
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [variant, setVariant] = useState<'control' | 'treatment' | null>(null);
  const [variantSource, setVariantSource] = useState('');
  const siblings = catalog.products.filter((x) => x.category === p.category && x.id !== p.id);
  const base = { product_id: p.id, category: p.category, price: p.price };
  const seenDepth = useRef(new Set<number>());
  const heavy = p.weightKg >= catalog.heavyShippingFee.minWeightKg;
  const feeFlag = useFlag('fix_fee_on_pdp');
  const labFlag = useFlag('fix_lab_report');
  const [labOpen, setLabOpen] = useState(false);
  // sample lab result: grams claims measured 2% above label; other claims simply match
  const gramClaim = p.protein.match(/^(\d+(?:\.\d+)?) g\b/);
  const measured = gramClaim ? p.protein.replace(gramClaim[1], String(Math.round(Number(gramClaim[1]) * 1.02 * 10) / 10)) : 'Matches label';
  useEffect(() => {
    if (!labOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLabOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [labOpen]);
  useEffect(() => { expose('fix_lab_report', labFlag); }, [labFlag, id]);
  useEffect(() => { if (heavy) expose('fix_fee_on_pdp', feeFlag); }, [feeFlag, heavy, id]);
  const openLab = () => {
    if (labFlag === 'treatment') { click('lab_report_badge', false); track('lab_report_opened', { product_id: p.id }); setLabOpen(true); }
    else click('lab_report_badge', true);
  };

  useEffect(() => {
    track('product_viewed', base);
    seenDepth.current = new Set();
    // experiment: PostHog flag when configured, otherwise deterministic local bucketing
    whenReady().then(() => {
      const ph = (window as unknown as { __phRaw?: PH }).__phRaw;
      const decide = (v: 'control' | 'treatment', src: string) => {
        setVariant(v); setVariantSource(src);
        track('experiment_viewed', { experiment: 'pdp_sticky_atc', variant: v });
      };
      if (ph) ph.onFeatureFlags(() => {
        const f = ph.getFeatureFlag('pdp_sticky_atc');
        decide(f === 'test' || f === 'treatment' ? 'treatment' : 'control', f === undefined ? 'PostHog (flag not found → control)' : 'PostHog feature flag');
      });
      else decide(bucket('pdp_sticky_atc'), 'local hash bucket (PostHog not configured)');
    });
    const onScroll = () => {
      const h = document.documentElement;
      const pct = ((h.scrollTop + window.innerHeight) / h.scrollHeight) * 100;
      for (const d of [25, 50, 75, 100]) {
        if (pct >= d - 1 && !seenDepth.current.has(d)) { seenDepth.current.add(d); track('scroll_depth', { scroll_pct: d, product_id: p.id }); }
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const click = (element: string, dead = false) => track('element_clicked', { element, is_dead_click: dead, product_id: p.id });
  const addToCart = () => {
    add(p.id, qty);
    track('add_to_cart', { ...base, quantity: qty });
    setAdded(true);
  };

  return (
    <div className="pdp">
      <div>
        <div style={{ background: '#f1eee6', borderRadius: 14, display: 'grid', placeItems: 'center', padding: 30 }}>
          <Tub color={p.color} size={260} />
        </div>
        <div style={{ marginTop: 14 }} className="badge-row">
          {/* Deliberately non-interactive: clicks here are tracked as dead clicks */}
          <span data-track="lab_report_badge" onClick={openLab} role={labFlag === 'treatment' ? 'button' : undefined} tabIndex={labFlag === 'treatment' ? 0 : undefined}
            onKeyDown={(e) => { if (labFlag === 'treatment' && e.key === 'Enter') openLab(); }}
            style={labFlag === 'treatment' ? { cursor: 'pointer', textDecoration: 'underline' } : undefined}>✓ Lab report: batch HN-2611</span>
          <span>Vegetarian</span><span>FSSAI licensed</span>
        </div>
        <div style={{ marginTop: 14 }}>
          <div data-track="nutrition_label_image" onClick={() => click('nutrition_label_image', true)}
            style={{ border: '1px solid #e0dbcf', borderRadius: 10, padding: 12, background: '#fff', fontSize: 13 }}>
            <b>Nutrition facts</b> (per serving)<br />{p.protein}. View full label
          </div>
        </div>
      </div>
      <div>
        <h1 style={{ fontSize: '1.6rem' }}>{p.name}</h1>
        <div style={{ color: '#64625d', fontSize: 14 }}>★ {p.rating} · {p.reviews.toLocaleString('en-IN')} reviews</div>
        <div style={{ margin: '14px 0', fontSize: 22 }}><span className="price">{inr(p.price)}</span><span className="mrp">{inr(p.mrp)}</span></div>
        {heavy && feeFlag === 'treatment' && (
          <p className="small" style={{ margin: '-8px 0 14px', color: '#3b3a37' }}>+ {inr(catalog.heavyShippingFee.fee)} delivery on {catalog.heavyShippingFee.minWeightKg} kg+ packs. Total {inr(p.price + catalog.heavyShippingFee.fee)}, no surprises at checkout.</p>
        )}

        {siblings.length > 0 && (
          <>
            <div className="small" style={{ marginBottom: 6 }}>Other options</div>
            <div className="chips" style={{ marginBottom: 14 }}>
              <button className="on">{p.name.split(',').slice(1).join(',').trim() || 'This one'}</button>
              {siblings.map((s) => (
                <button key={s.id} data-track="size_selector" onClick={() => { click('size_selector'); router.push(`/store/p/${s.slug}`); }}>
                  {s.name.split(',').slice(1).join(',').trim()}
                </button>
              ))}
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
          <div className="chips">
            <button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease quantity">−</button>
            <button className="on" aria-live="polite">{qty}</button>
            <button onClick={() => setQty(qty + 1)} aria-label="Increase quantity">+</button>
          </div>
          <button className="sbtn" onClick={addToCart}>Add to cart</button>
        </div>
        {added && <p className="msg-ok">Added. <a href="/store/cart">Go to cart →</a></p>}

        <div className="panel" style={{ marginTop: 10 }}>
          <label className="small" htmlFor="pin">Check delivery</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input id="pin" className="field" placeholder="Pincode" inputMode="numeric" maxLength={6} onFocus={() => click('delivery_pincode')} />
          </div>
          <p className="small" style={{ color: '#64625d', margin: '8px 0 0' }}>Delivery in 2–4 days.</p>
        </div>

        <div style={{ marginTop: 22 }}>
          <h3 data-track="reviews_tab" onClick={() => click('reviews_tab')} style={{ cursor: 'pointer' }}>Reviews ({p.reviews.toLocaleString('en-IN')}) ▾</h3>
          {['Mixes well, no lumps. Taste is mild.', 'Genuine product, checked the batch code.', 'Packaging could be better, product is good.'].map((r) => (
            <div key={r} style={{ borderBottom: '1px solid #e6e2d8', padding: '10px 0', fontSize: 14 }}>★★★★☆ {r}</div>
          ))}
        </div>
        <div style={{ marginTop: 22, fontSize: 14, color: '#3b3a37' }}>
          <h3>About this product</h3>
          <p>{p.protein}. Third-party tested for label accuracy and heavy metals. Best taken within 30 minutes of training.</p>
          <p style={{ height: 300 }} />
        </div>
        {variant && <p className="small" style={{ color: '#8f8c85' }}>Experiment pdp_sticky_atc: {variant} ({variantSource})</p>}
      </div>

      {labOpen && (
        <div role="dialog" aria-modal="true" aria-label="Lab report" onClick={() => setLabOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 50, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', color: '#1b1c1e', borderRadius: 14, padding: 20, maxWidth: 460, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><b>Lab report · batch HN-2611</b><button onClick={() => setLabOpen(false)} aria-label="Close" style={{ border: 0, background: 'none', fontSize: 18, cursor: 'pointer' }}>×</button></div>
            <p style={{ fontSize: 12, color: '#8f8c85', margin: '4px 0 12px' }}>Sample report for a fictional brand (portfolio demo).</p>
            <table style={{ width: '100%', fontSize: 13.5, borderCollapse: 'collapse' }}>
              <tbody>
                {[['Claim on label', p.protein], ['Measured', measured], ['Lead', '< 0.10 ppm (limit 2.5)'], ['Arsenic', '< 0.05 ppm (limit 1.1)'], ['Banned substances', 'Not detected (WADA list)'], ['Tested by', 'Independent NABL-accredited lab (demo)']].map(([k, v]) => (
                  <tr key={k}><td style={{ padding: '6px 0', color: '#64625d', borderBottom: '1px solid #eee9de' }}>{k}</td><td style={{ padding: '6px 0', textAlign: 'right', borderBottom: '1px solid #eee9de' }}>{v}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {variant === 'treatment' && (
        <div className="sticky-atc">
          <div><div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div><span className="price">{inr(p.price)}</span></div>
          <button className="sbtn" onClick={addToCart}>Add to cart</button>
        </div>
      )}
    </div>
  );
}
