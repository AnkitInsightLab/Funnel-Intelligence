'use client';
import { useState } from 'react';

interface Row { dimension: string; segment: string; sessions: number; viewed: number; carted: number; checkout: number; paid: number; revenue: number }
const DIMS: [string, string][] = [['source', 'Traffic source'], ['platform', 'Platform'], ['category', 'Category viewed'], ['customer', 'New vs returning']];
const LABEL: Record<string, string> = {
  meta_ads: 'Meta ads', google_ads: 'Google ads', organic: 'Organic', direct: 'Direct', email: 'Email', influencer: 'Influencer', whatsapp: 'WhatsApp (CRM)',
  android_app: 'Android app', ios_app: 'iOS app', web: 'Web', mass_gainer: 'Mass gainer', whey: 'Whey', creatine: 'Creatine',
  vitamins: 'Vitamins', pre_workout: 'Pre-workout', peanut_butter: 'Peanut butter', new: 'New', returning: 'Returning',
};

export default function FunnelExplorer({ rows, total }: { rows: Row[]; total: Row }) {
  const [dim, setDim] = useState('source');
  const data = rows.filter((r) => r.dimension === dim);
  const steps: [keyof Row, keyof Row, string][] = [['sessions', 'viewed', 'Session → view'], ['viewed', 'carted', 'View → cart'], ['carted', 'checkout', 'Cart → checkout'], ['checkout', 'paid', 'Checkout → paid']];
  const rate = (r: Row, a: keyof Row, b: keyof Row) => (100 * (r[b] as number)) / Math.max(1, r[a] as number);
  const allSteps = (r: Row) => steps.map(([a, b]) => rate(r, a, b));
  const base = allSteps(total);
  const tone = (v: number, b: number) => {
    const d = (v - b) / b;
    if (d <= -0.15) return { background: 'var(--leak-soft)', color: 'var(--leak)', fontWeight: 600 };
    if (d >= 0.15) return { background: 'var(--win-soft)', color: 'var(--win)' };
    return undefined;
  };
  return (
    <div>
      <div className="seg-tabs" role="tablist">
        {DIMS.map(([k, l]) => <button key={k} role="tab" aria-selected={dim === k} className={dim === k ? 'on' : undefined} onClick={() => setDim(k)}>{l}</button>)}
      </div>
      <div className="scroll-x">
        <table className="tbl">
          <thead>
            <tr><th>Segment</th><th className="r">Sessions</th>{steps.map(([, , l]) => <th key={l} className="r">{l}</th>)}<th className="r">Session CVR</th><th className="r">Revenue / session</th></tr>
          </thead>
          <tbody>
            {[total, ...data].map((r) => {
              const v = allSteps(r);
              const isTotal = r === total;
              return (
                <tr key={r.segment} style={isTotal ? { fontWeight: 600 } : undefined}>
                  <td>{isTotal ? 'All sessions' : LABEL[r.segment] ?? r.segment}</td>
                  <td className="r">{r.sessions.toLocaleString('en-IN')}</td>
                  {v.map((x, i) => <td key={i} className="r" style={isTotal ? undefined : tone(x, base[i])}>{x.toFixed(1)}%</td>)}
                  <td className="r">{((100 * r.paid) / r.sessions).toFixed(2)}%</td>
                  <td className="r">₹{(r.revenue / r.sessions).toFixed(0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        Shaded cells are at least 15% (relative) below or above the all-sessions rate for that step. Category is the first product viewed in the session.
      </p>
    </div>
  );
}
