'use client';
// Live readout for the shipped fixes. Shows a lift only when each arm has reached the
// sample size its power calculation asks for; below that, it says how far there is to go.
import { useEffect, useState } from 'react';

interface Row { experiment: string; variant: string; sessions: number; converted: number }
interface Data { configured: boolean; rows?: Row[]; error?: string; at?: string }
interface FixLite { key: string; metricLabel: string; baselinePct: number; mdeRel: number }

const erf = (x: number) => { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x);
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); };
const phi = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));
const needed = (p1: number, rel: number) => { const p2 = p1 * (1 + rel); return Math.ceil(((1.959964 + 0.841621) ** 2 * (p1 * (1 - p1) + p2 * (1 - p2))) / (p2 - p1) ** 2); };

export default function FixReadout({ fixes }: { fixes: FixLite[] }) {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    const load = () => fetch('/api/fixes', { cache: 'no-store' }).then((r) => r.json()).then(setD).catch(() => setD({ configured: true, error: 'unreachable' }));
    load(); const t = setInterval(load, 15_000); return () => clearInterval(t);
  }, []);
  if (!d) return <p className="small muted">Loading live readout…</p>;
  if (!d.configured) return <p className="small muted"><span className="tag sim">no live store yet</span> Postgres (Neon) is not configured in this deployment, so there are no live exposures to read. Once <code>DATABASE_URL</code> is set, every fix&apos;s control and treatment counts appear here, refreshed every 15 seconds.</p>;
  if (d.error) return <p className="small down">Could not read live events ({d.error}).</p>;

  return (
    <div className="scroll-x">
      <table className="tbl">
        <thead><tr><th>Fix</th><th>Metric</th><th className="r">Control</th><th className="r">Treatment</th><th className="r">Lift</th><th>Status</th></tr></thead>
        <tbody>{fixes.map((f) => {
          const c = d.rows?.find((r) => r.experiment === f.key && r.variant === 'control') ?? { sessions: 0, converted: 0 };
          const t = d.rows?.find((r) => r.experiment === f.key && r.variant === 'treatment') ?? { sessions: 0, converted: 0 };
          const pc = c.sessions ? c.converted / c.sessions : 0, pt = t.sessions ? t.converted / t.sessions : 0;
          const optInOnly = f.mdeRel === 0;
          const need = optInOnly ? 0 : needed(f.baselinePct / 100, f.mdeRel);
          const have = Math.min(c.sessions, t.sessions);
          let status: React.ReactNode;
          if (optInOnly) status = <span className="small">{t.sessions ? `${(100 * pt).toFixed(1)}% opt-in from ${t.sessions} shown` : 'no exposures yet'}</span>;
          else if (have < need) status = <span className="small"><span className="tag sim">collecting</span> {have.toLocaleString('en-IN')} of {need.toLocaleString('en-IN')} per arm ({Math.round((100 * have) / need)}%)</span>;
          else {
            const pp = (c.converted + t.converted) / (c.sessions + t.sessions);
            const z = (pt - pc) / Math.sqrt(pp * (1 - pp) * (1 / c.sessions + 1 / t.sessions));
            const p = 2 * (1 - phi(Math.abs(z)));
            status = <span className={`tag ${p < 0.05 ? (pt > pc ? 'live' : 'leak') : 'model'}`}>{p < 0.05 ? (pt > pc ? 'win' : 'loss') : 'no clear difference'} · p {p < 0.001 ? '< 0.001' : p.toFixed(3)}</span>;
          }
          const showLift = !optInOnly && have >= need && pc > 0;
          return (
            <tr key={f.key}>
              <td><code>{f.key}</code></td><td className="small">{f.metricLabel}</td>
              <td className="r">{optInOnly ? '–' : c.sessions ? `${(100 * pc).toFixed(1)}% of ${c.sessions}` : '0'}</td>
              <td className="r">{t.sessions ? `${(100 * pt).toFixed(1)}% of ${t.sessions}` : '0'}</td>
              <td className="r">{showLift ? `${(((pt - pc) / pc) * 100).toFixed(1)}%` : '–'}</td>
              <td>{status}</td>
            </tr>
          );
        })}</tbody>
      </table>
      <p className="small muted" style={{ marginTop: 8 }}>Live store traffic only (events with source = &lsquo;live&rsquo;), refreshed every 15 s{d.at ? `, last at ${new Date(d.at).toLocaleTimeString()}` : ''}. A lift is shown only once both arms reach the sample size from the power calculation (α 0.05, power 80%), so early noise is never presented as a result.</p>
    </div>
  );
}
