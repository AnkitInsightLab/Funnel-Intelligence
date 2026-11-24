import Link from 'next/link';
import { FIXES } from '@/lib/fixes';
import FixReadout from '@/components/FixReadout';

export const metadata = { title: 'Shipped fixes · Funnel Intelligence' };

export default function Fixes() {
  return (
    <>
      <h1>From finding to shipped fix</h1>
      <p className="lede">
        Each customer problem the analysis found is now fixed in the live store, behind a feature flag with a control group. This page shows the problem, the fix,
        how it is measured, and the live result once there is enough traffic to say anything.
      </p>
      <div className="banner" style={{ marginTop: 12 }}>
        <span className="tag live">Live</span> The fixes run in the <Link href="/store">demo store</Link> now. PostHog decides each visitor&apos;s variant when its flag exists
        (variants <code>control</code> / <code>test</code>); otherwise a stable hash of the visitor id does. <span className="tag sim">Evidence</span> The &ldquo;why&rdquo; for each fix comes from the synthetic analysis.
      </div>

      <section className="section card">
        <h2>Live readout</h2>
        <FixReadout fixes={FIXES.map(({ key, metricLabel, baselinePct, mdeRel }) => ({ key, metricLabel, baselinePct, mdeRel }))} />
      </section>

      <section className="section grid g2">
        {FIXES.map((f, i) => (
          <div className="card" key={f.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <h3 style={{ margin: 0 }}><span className="faint num">0{i + 1}</span> {f.title}</h3>
              <code className="small">{f.key}</code>
            </div>
            <p className="small" style={{ fontStyle: 'italic', margin: '8px 0' }}>{f.problem}</p>
            <table className="tbl small"><tbody>
              <tr><td className="muted" style={{ width: 110 }}>Evidence</td><td><Link href={f.evidenceLink}>{f.evidence}</Link></td></tr>
              <tr><td className="muted">Shipped</td><td>{f.shipped}</td></tr>
              <tr><td className="muted">Exposure</td><td>logged when {f.exposure}</td></tr>
              <tr><td className="muted">Metric</td><td>{f.metricLabel} <code>{f.metric}</code></td></tr>
              <tr><td className="muted">Guardrail</td><td>{f.guardrail}</td></tr>
            </tbody></table>
            <Link href={f.tryIt} className="small">Try it in the store →</Link>
          </div>
        ))}
      </section>

      <section className="section card small">
        <h2>How a fix gets from finding to 100%</h2>
        <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
          <li>Finding with a named segment and a size (Insights / Retention).</li>
          <li>Smallest change that addresses the customer&apos;s problem, behind a flag, with exposure logged only when the change is on screen.</li>
          <li>Primary metric and guardrail chosen before launch; sample size from the power calculation.</li>
          <li>Read only at the planned sample size, with the sample-ratio and overlap checks from the Experiments page.</li>
          <li>Win: roll out to 100% and keep a 5% holdback for a month to catch novelty. No clear difference: keep the cheaper option.</li>
        </ol>
      </section>
    </>
  );
}
