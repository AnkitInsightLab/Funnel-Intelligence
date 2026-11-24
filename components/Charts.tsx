// Small dependency-free SVG charts. Server components: no JS shipped for them.
import results from '@/lib/results.json';

type Sql = keyof typeof results.sql;

export function SqlBlock({ name, label }: { name: Sql | Sql[]; label?: string }) {
  const names = Array.isArray(name) ? name : [name];
  return (
    <details className="sql">
      <summary>{label ?? 'Show the SQL'} <code style={{ fontSize: 11.5 }}>{names.join(', ')}</code></summary>
      <pre>{names.map((n) => `-- @query ${n}\n${results.sql[n]}`).join('\n\n')}</pre>
    </details>
  );
}

export interface Series { name: string; color: string; values: (number | null)[]; dashed?: boolean }

export function LineChart({ labels, series, height = 220, yFmt = (v: number) => String(v), marker, yMin, yMax, labelEvery = 1 }: {
  labels: string[]; series: Series[]; height?: number; yFmt?: (v: number) => string;
  marker?: { index: number; label: string }; yMin?: number; yMax?: number; labelEvery?: number;
}) {
  const W = 720, H = height, L = 46, R = 12, T = 12, B = 26;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const lo = yMin ?? Math.min(...all), hi = yMax ?? Math.max(...all);
  const pad = (hi - lo) * 0.08 || 1;
  const y0 = yMin ?? lo - pad, y1 = yMax ?? hi + pad;
  const x = (i: number) => L + (i * (W - L - R)) / Math.max(1, labels.length - 1);
  const y = (v: number) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const ticks = Array.from({ length: 5 }, (_, i) => y0 + ((y1 - y0) * i) / 4);
  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={series.map((s) => s.name).join(' vs ')}>
        <g className="grid">
          {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} /><text x={L - 6} y={y(t) + 4} textAnchor="end">{yFmt(t)}</text></g>)}
        </g>
        {labels.map((l, i) => ((i % labelEvery === 0 && labels.length - 1 - i >= labelEvery / 2) || i === labels.length - 1) && (
          <text key={l + i} x={x(i)} y={H - 6} textAnchor={i === labels.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'}>{l}</text>
        ))}
        {marker && (
          <g>
            <line x1={x(marker.index)} x2={x(marker.index)} y1={T} y2={H - B} stroke="var(--leak)" strokeDasharray="3 3" />
            <text x={x(marker.index) + 4} y={T + 10} style={{ fill: 'var(--leak)' }}>{marker.label}</text>
          </g>
        )}
        {series.map((s) => {
          let d = '';
          s.values.forEach((v, i) => { if (v === null) return; d += `${d && s.values[i - 1] !== null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; });
          return <path key={s.name} d={d} fill="none" stroke={s.color} strokeWidth={2.2} strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" />;
        })}
      </svg>
      <div className="legend">{series.map((s) => <span key={s.name} style={{ '--c': s.color } as React.CSSProperties}>{s.name}</span>)}</div>
    </div>
  );
}

export function Funnel({ steps }: { steps: { step: string; sessions: number }[] }) {
  const top = steps[0].sessions;
  return (
    <div>
      {steps.map((s, i) => {
        const prev = i ? steps[i - 1].sessions : null;
        return (
          <div className="funnel-row" key={s.step}>
            <div>{s.step}</div>
            <div className="bar"><i style={{ width: `${(100 * s.sessions) / top}%` }} /></div>
            <div className="num" style={{ textAlign: 'right' }}>
              {s.sessions.toLocaleString('en-IN')}
              {prev !== null && <div className="drop">{((100 * s.sessions) / prev).toFixed(1)}% of prev</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Bars({ rows, fmt = (v: number) => v.toFixed(1) + '%', color = 'var(--blue)', highlight }: {
  rows: { label: string; value: number; note?: string }[]; fmt?: (v: number) => string; color?: string; highlight?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <div>
      {rows.map((r) => (
        <div className="funnel-row" key={r.label}>
          <div>{r.label}</div>
          <div className="bar"><i style={{ width: `${(100 * r.value) / max}%`, background: r.label === highlight ? 'var(--leak)' : color }} /></div>
          <div className="num" style={{ textAlign: 'right' }}>{fmt(r.value)}{r.note && <div className="faint small">{r.note}</div>}</div>
        </div>
      ))}
    </div>
  );
}

export const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
export const lakh = (n: number) => '₹' + (n / 100000).toFixed(n >= 1e7 ? 0 : 1) + ' L';
export const pct = (n: number, d = 1) => n.toFixed(d) + '%';
export const shortDate = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function Finding({ n, title, tag, children, steps }: {
  n: number; title: string; tag?: React.ReactNode; children: React.ReactNode;
  steps: { hypothesis: string; segment: string; evidence: string; change: string; measure: string };
}) {
  return (
    <section className="section card finding" id={`finding-${n}`}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span className="faint num">0{n}</span><h2 style={{ margin: 0 }}>{title}</h2>{tag}
      </div>
      {children}
      <div className="steps">
        <div><b>Hypothesis</b>{steps.hypothesis}</div>
        <div><b>Affected segment</b>{steps.segment}</div>
        <div><b>Evidence</b>{steps.evidence}</div>
        <div><b>Change</b>{steps.change}</div>
        <div><b>How we measure it</b>{steps.measure}</div>
      </div>
    </section>
  );
}
