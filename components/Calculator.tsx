'use client';
import { useState } from 'react';

// Same formulas the build uses for the readouts (scripts/seed.mjs).
const erf = (x: number) => {
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
};
const phi = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

function Num({ label, value, set, step = 1, suffix }: { label: string; value: number; set: (n: number) => void; step?: number; suffix?: string }) {
  return (
    <label className="small" style={{ display: 'grid', gap: 4 }}>
      <span className="muted">{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="number" value={value} step={step} min={0} onChange={(e) => set(Number(e.target.value))}
          style={{ font: 'inherit', padding: '7px 9px', border: '1px solid var(--line)', borderRadius: 7, width: '100%', background: 'var(--card)', color: 'var(--ink)' }} />
        {suffix}
      </span>
    </label>
  );
}

export default function Calculator() {
  const [base, setBase] = useState(27);
  const [mde, setMde] = useState(8);
  const [daily, setDaily] = useState(400);
  const [nc, setNc] = useState(4300); const [xc, setXc] = useState(1160);
  const [nt, setNt] = useState(4300); const [xt, setXt] = useState(1355);

  const p1 = base / 100, p2 = p1 * (1 + mde / 100);
  const n = p2 > p1 && p1 > 0 && p2 < 1 ? Math.ceil(((1.959964 + 0.841621) ** 2 * (p1 * (1 - p1) + p2 * (1 - p2))) / (p2 - p1) ** 2) : NaN;
  const days = daily > 0 ? Math.ceil((2 * n) / daily) : NaN;

  const pc = xc / nc, pt = xt / nt, pp = (xc + xt) / (nc + nt);
  const z = (pt - pc) / Math.sqrt(pp * (1 - pp) * (1 / nc + 1 / nt));
  const p = 2 * (1 - phi(Math.abs(z)));
  const se = Math.sqrt((pc * (1 - pc)) / nc + (pt * (1 - pt)) / nt);
  const valid = nc > 0 && nt > 0 && xc <= nc && xt <= nt;

  return (
    <div className="grid g2">
      <div className="card">
        <h3>Sample size before you start</h3>
        <div className="grid g3">
          <Num label="Baseline rate" value={base} set={setBase} step={0.5} suffix="%" />
          <Num label="Smallest lift worth detecting" value={mde} set={setMde} suffix="%" />
          <Num label="Eligible sessions / day" value={daily} set={setDaily} step={50} />
        </div>
        <p style={{ marginTop: 12 }}>
          <b className="num">{Number.isFinite(n) ? n.toLocaleString('en-IN') : '–'}</b> sessions per arm
          {Number.isFinite(days) && <> · about <b>{days} days</b> at 50/50</>}
        </p>
        <p className="small muted" style={{ margin: 0 }}>Two-sided α = 0.05, power 80%. Round up to full weeks so weekday mix is balanced, and decide the stop date before launch.</p>
      </div>
      <div className="card">
        <h3>Significance after you stop</h3>
        <div className="grid g4">
          <Num label="Control n" value={nc} set={setNc} step={100} />
          <Num label="Control conv." value={xc} set={setXc} step={10} />
          <Num label="Treatment n" value={nt} set={setNt} step={100} />
          <Num label="Treatment conv." value={xt} set={setXt} step={10} />
        </div>
        {valid ? (
          <p style={{ marginTop: 12 }}>
            {(100 * pc).toFixed(2)}% → {(100 * pt).toFixed(2)}% · lift <b>{((100 * (pt - pc)) / pc).toFixed(1)}%</b>
            {' '}(95% CI {((100 * (pt - pc - 1.96 * se)) / pc).toFixed(1)}% to {((100 * (pt - pc + 1.96 * se)) / pc).toFixed(1)}%) · p = <b>{p < 0.0001 ? '<0.0001' : p.toFixed(4)}</b>{' '}
            <span className={`tag ${p < 0.05 ? 'live' : 'sim'}`}>{p < 0.05 ? 'significant' : 'not significant'}</span>
          </p>
        ) : <p className="small down">Conversions can&apos;t exceed n.</p>}
        <p className="small muted" style={{ margin: 0 }}>Two-proportion z-test with an unpooled interval. Check SRM and guardrails before reading this.</p>
      </div>
    </div>
  );
}
