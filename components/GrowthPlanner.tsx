'use client';
import { useState } from 'react';

export interface Base {
  sessions28: number; firstOrders28: number; repeatOrders28: number; firstRevenue28: number; repeatRevenue28: number;
  grossMarginPct: number; fulfilment: number; paymentFeePct: number; marketingSpendMonthly: number;
}
interface Levers { traffic: number; cvr: number; aov: number; repeat: number }
const PRESETS: Record<string, Levers> = {
  Today: { traffic: 0, cvr: 0, aov: 0, repeat: 0 },
  '2× plan': { traffic: 50, cvr: 15, aov: 6, repeat: 50 },
  '3× plan': { traffic: 100, cvr: 25, aov: 10, repeat: 80 },
};
const L = (n: number) => '₹' + (n / 100000).toFixed(1) + ' L';

export default function GrowthPlanner({ base, evidence }: { base: Base; evidence: Record<keyof Levers, string> }) {
  const [lv, setLv] = useState<Levers>(PRESETS['2× plan']);
  const k = 30 / 28;
  const model = (x: Levers) => {
    const newOrders = base.firstOrders28 * k * (1 + x.traffic / 100) * (1 + x.cvr / 100);
    const scale = newOrders / (base.firstOrders28 * k);
    // steady state: repeat orders scale with the new-customer base and with CRM lift
    const repeatOrders = base.repeatOrders28 * k * scale * (1 + x.repeat / 100);
    const aovF = (base.firstRevenue28 / base.firstOrders28) * (1 + x.aov / 100);
    const aovR = (base.repeatRevenue28 / base.repeatOrders28) * (1 + x.aov / 100);
    const revenue = newOrders * aovF + repeatOrders * aovR;
    // paid traffic gets more expensive as it scales (exponent 1.25 = diminishing returns)
    const marketing = base.marketingSpendMonthly * Math.pow(1 + x.traffic / 100, 1.25);
    const contribution = revenue * (base.grossMarginPct / 100 - base.paymentFeePct / 100) - (newOrders + repeatOrders) * base.fulfilment - marketing;
    return { newOrders, repeatOrders, revenue, marketing, contribution, repeatShare: (repeatOrders * aovR) / revenue };
  };
  const b = model(PRESETS.Today), m = model(lv);
  const mult = m.revenue / b.revenue;
  const sliders: [keyof Levers, string, number][] = [
    ['traffic', 'Traffic growth', 150], ['cvr', 'Conversion uplift (relative)', 50], ['aov', 'AOV uplift', 20], ['repeat', 'Repeat orders uplift (relative)', 120],
  ];
  return (
    <div className="grid g2">
      <div className="card">
        <div className="seg-tabs">
          {Object.keys(PRESETS).map((p) => <button key={p} className={JSON.stringify(PRESETS[p]) === JSON.stringify(lv) ? 'on' : undefined} onClick={() => setLv(PRESETS[p])}>{p}</button>)}
        </div>
        {sliders.map(([key, label, max]) => (
          <label key={key} className="small" style={{ display: 'grid', gap: 2, marginBottom: 12 }}>
            <span style={{ display: 'flex', justifyContent: 'space-between' }}><b>{label}</b><span className="num">+{lv[key]}%</span></span>
            <input type="range" min={0} max={max} value={lv[key]} onChange={(e) => setLv({ ...lv, [key]: Number(e.target.value) })} aria-label={label} />
            <span className="muted">{evidence[key]}</span>
          </label>
        ))}
      </div>
      <div className="card">
        <div className="kpi"><div className="label">Monthly revenue</div><div className="value">{L(m.revenue)}</div>
          <div className={`delta ${mult >= 1 ? 'up' : 'down'}`}><b>{mult.toFixed(2)}×</b> today&apos;s {L(b.revenue)}</div></div>
        <div style={{ height: 14, background: 'var(--soft)', borderRadius: 7, margin: '12px 0', position: 'relative', overflow: 'hidden' }}>
          <i style={{ position: 'absolute', inset: 0, width: `${Math.min(100, (mult / 3.5) * 100)}%`, background: mult >= 3 ? 'var(--win)' : mult >= 2 ? 'var(--blue)' : 'var(--faint)', borderRadius: 7 }} />
          {[2, 3].map((x) => <span key={x} style={{ position: 'absolute', left: `${(x / 3.5) * 100}%`, top: 0, bottom: 0, borderLeft: '2px dashed var(--ink)' }} />)}
        </div>
        <table className="tbl">
          <tbody>
            <tr><td>New-customer orders / month</td><td className="r">{Math.round(b.newOrders).toLocaleString('en-IN')} → <b>{Math.round(m.newOrders).toLocaleString('en-IN')}</b></td></tr>
            <tr><td>Repeat orders / month</td><td className="r">{Math.round(b.repeatOrders).toLocaleString('en-IN')} → <b>{Math.round(m.repeatOrders).toLocaleString('en-IN')}</b></td></tr>
            <tr><td>Repeat share of revenue</td><td className="r">{(100 * b.repeatShare).toFixed(0)}% → <b>{(100 * m.repeatShare).toFixed(0)}%</b></td></tr>
            <tr><td>Marketing spend / month</td><td className="r">{L(b.marketing)} → <b>{L(m.marketing)}</b></td></tr>
            <tr><td>Contribution after marketing</td><td className="r">{L(b.contribution)} → <b style={{ color: m.contribution < 0 ? 'var(--leak)' : undefined }}>{L(m.contribution)}</b></td></tr>
          </tbody>
        </table>
        <p className="small muted" style={{ marginTop: 10 }}>
          Steady-state model, roughly two product cycles after the changes ship. Repeat orders scale with the new-customer base. Paid traffic gets 25% more expensive per unit as it doubles.
          Try pushing traffic alone to 2×: revenue follows, contribution does not.
        </p>
      </div>
    </div>
  );
}
