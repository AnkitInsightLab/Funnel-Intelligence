import results from '@/lib/results.json';
import Calculator from '@/components/Calculator';
import { SqlBlock, pct, shortDate } from '@/components/Charts';

export const metadata = { title: 'Experiments · Funnel Intelligence' };

type Exp = (typeof results.experiments)[number];
const fmtP = (p: number) => (p < 0.0001 ? '< 0.0001' : p.toFixed(4));

function Row({ label, c, t, lift, ci, p }: { label: string; c: string; t: string; lift?: string; ci?: string; p?: string }) {
  return <tr><td>{label}</td><td className="r">{c}</td><td className="r">{t}</td><td className="r">{lift ?? ''}</td><td className="r muted">{ci ?? ''}</td><td className="r">{p ?? ''}</td></tr>;
}

function Readout({ e, verdict, tone, children }: { e: Exp; verdict: string; tone: 'live' | 'sim' | 'leak'; children: React.ReactNode }) {
  const basket = results.q.experiment_basket.filter((b) => b.experiment === e.key);
  const bc = basket.find((b) => b.variant === 'control')!, bt = basket.find((b) => b.variant === 'treatment')!;
  const pr = e.primaryResult, orr = e.ordersResult;
  return (
    <section className="section card" id={e.key}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>{e.name}</h2>
        <span className={`tag ${tone}`} style={{ fontSize: 13 }}>{verdict}</span>
      </div>
      <p className="small muted" style={{ marginTop: 6 }}>
        <code>{e.key}</code> · {e.audience} · {shortDate(results.experimentWindow.start)} to {shortDate(results.period.end)} ({e.power.weeksRun} weeks) · 50/50 by user
      </p>
      <p className="small"><b>Hypothesis.</b> {e.hypothesis}</p>
      <div className="scroll-x">
        <table className="tbl">
          <thead><tr><th>Metric</th><th className="r">Control</th><th className="r">Treatment</th><th className="r">Lift</th><th className="r">95% CI</th><th className="r">p</th></tr></thead>
          <tbody>
            <Row label="Exposed sessions" c={e.control.sessions.toLocaleString('en-IN')} t={e.treatment.sessions.toLocaleString('en-IN')} />
            <Row label={`${e.primaryLabel} (primary)`} c={pct(pr.pc, 2)} t={pct(pr.pt, 2)} lift={(pr.relLiftPct > 0 ? '+' : '') + pct(pr.relLiftPct)} ci={`${pct(pr.ciLowRel)} to ${pct(pr.ciHighRel)}`} p={fmtP(pr.p)} />
            {e.primary !== 'orders' && <Row label="Session → order" c={pct(orr.pc, 2)} t={pct(orr.pt, 2)} lift={(orr.relLiftPct > 0 ? '+' : '') + pct(orr.relLiftPct)} ci={`${pct(orr.ciLowRel)} to ${pct(orr.ciHighRel)}`} p={fmtP(orr.p)} />}
            <Row label="Revenue per exposed session" c={'₹' + e.rpv.control.toFixed(0)} t={'₹' + e.rpv.treatment.toFixed(0)} lift={(e.rpv.treatment > e.rpv.control ? '+' : '') + pct((100 * (e.rpv.treatment - e.rpv.control)) / e.rpv.control)} />
            <Row label={`AOV (guardrail: no worse than ${e.aov.guardrailPct}%)`} c={'₹' + e.aov.control.toLocaleString('en-IN')} t={'₹' + e.aov.treatment.toLocaleString('en-IN')}
              lift={(e.aov.changePct > 0 ? '+' : '') + pct(e.aov.changePct)} ci={`${pct(e.aov.ciLowPct)} to ${pct(e.aov.ciHighPct)}`} />
            <Row label="Products per order" c={bc.products_per_order.toFixed(2)} t={bt.products_per_order.toFixed(2)} lift={`${bc.multi_product_pct}% → ${bt.multi_product_pct}% multi-item`} />
          </tbody>
        </table>
      </div>
      <div className="grid g3" style={{ marginTop: 12 }}>
        <div className="small"><b>Sample ratio check.</b> χ² = {e.srm.chi2}, p = {e.srm.p}. {e.srm.ok ? 'Passes at the 0.01 threshold.' : 'Fails: the split is not 50/50, so the readout cannot be trusted.'}</div>
        <div className="small"><b>Power.</b> Planned to detect {[8, 11, 18].includes(Math.round(e.power.mdeRel * 100)) ? 'an' : 'a'} {pct(e.power.mdeRel * 100, 0)} relative lift: {e.power.neededPerArm.toLocaleString('en-IN')} per arm, about {e.power.weeksNeeded} weeks. Got {e.power.havePerArm.toLocaleString('en-IN')} per arm in {e.power.weeksRun}.</div>
        <div className="small"><b>Exposure.</b> Counted at <code>experiment_viewed</code>, when the variant is on screen, not at assignment.</div>
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </section>
  );
}

export default function Experiments() {
  const [sticky, onePage] = ['pdp_sticky_atc', 'one_page_checkout'].map((k) => results.experiments.find((e) => e.key === k)!);
  const ov = results.overlap;
  const ob = results.q.experiment_basket.filter((b) => b.experiment === 'one_page_checkout');
  return (
    <>
      <h1>Experiments</h1>
      <p className="lede">
        Two tests ran in November. One is a real win with a guardrail problem. The other looks like a modest win and should not be read at all.
      </p>
      <div className="banner" style={{ marginTop: 12 }}>
        <span className="tag sim">Synthetic history</span> Both readouts use the generated data. <span className="tag live">Live</span> The sticky add-to-cart test also runs on the
        <a href="/store/p/whey-protein-chocolate-1kg"> live store</a>: a PostHog feature flag when configured, otherwise a local hash bucket. Each product page shows which arm you are in.
      </div>

      <Readout e={sticky} tone="live" verdict="Ship, with the cross-sell put back">
        <p className="small">
          <b>Decision.</b> Add-to-cart is up {pct(sticky.primaryResult.relLiftPct)} (CI {pct(sticky.primaryResult.ciLowRel)} to {pct(sticky.primaryResult.ciHighRel)}) and revenue per session is up,
          so the bar works. But AOV is {pct(sticky.aov.changePct)}, {sticky.aov.breached ? 'past' : 'within'} the {sticky.aov.guardrailPct}% guardrail. Its interval is wide and includes zero,
          but the mechanism is clear in the basket: the bar adds straight to cart and skips the &ldquo;goes well with&rdquo; module, so multi-item orders fell from
          {' '}{results.q.experiment_basket.find((b) => b.experiment === 'pdp_sticky_atc' && b.variant === 'control')!.multi_product_pct}% to {results.q.experiment_basket.find((b) => b.experiment === 'pdp_sticky_atc' && b.variant === 'treatment')!.multi_product_pct}%.
          Ship the bar to 100%, open a bottom sheet with one add-on after the tap, and keep AOV as the guardrail on a follow-up test of that sheet.
        </p>
        <p className="small muted">
          Note: the session → order lift looks larger than the add-to-cart lift. Part of that is noise (the order CI is wide), and part is contamination from the bucketing bug below.
          The primary metric happens before checkout, so it is clean.
        </p>
        <p className="small muted">
          Process miss: the test was read at {sticky.power.weeksRun} of the {sticky.power.weeksNeeded} weeks the power calculation asked for. The call survives it here
          (p {sticky.primaryResult.p < 0.0001 ? '< 0.0001' : '= ' + sticky.primaryResult.p}, and the lower CI bound of {pct(sticky.primaryResult.ciLowRel)} is above the {pct(sticky.power.mdeRel * 100, 0)} we planned for),
          but the stop date should be fixed before launch, not chosen after looking.
        </p>
      </Readout>

      <Readout e={onePage} tone="leak" verdict="Invalid: re-run">
        <p className="small">
          <b>Decision: don&apos;t read it.</b> The primary metric shows +{pct(onePage.primaryResult.relLiftPct)} (p = {fmtP(onePage.primaryResult.p)}), and the sample ratio check
          {onePage.srm.ok ? ' passes. Even so, this test' : ' fails. The cause: this test'} and the sticky test assigned users with the same hash. Every one of the {ov.users.toLocaleString('en-IN')} users
          exposed to both landed in the same arm of each ({pct(ov.sameArmPct, 0)} same-arm, where independent bucketing gives about 50%):
        </p>
        <div className="scroll-x" style={{ maxWidth: 520 }}>
          <table className="tbl">
            <thead><tr><th>Sticky arm</th><th>One-page arm</th><th className="r">Users</th><th className="r">Share</th></tr></thead>
            <tbody>{ov.cells.map((c) => <tr key={c.sticky + c.one_page}><td>{c.sticky}</td><td>{c.one_page}</td><td className="r">{c.users}</td><td className="r">{pct(c.pct)}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="small" style={{ marginTop: 10 }}>
          So every Android user in one-page treatment was also assigned the sticky bar, which sends more, smaller carts into checkout. You can see it in the basket:
          multi-item orders are {ob.find((b) => b.variant === 'control')!.multi_product_pct}% in control and {ob.find((b) => b.variant === 'treatment')!.multi_product_pct}% in treatment,
          a change a checkout layout cannot cause. {onePage.srm.ok && 'The standard SRM check did not catch this; the cross-experiment overlap check did.'}
        </p>
        <p className="small">
          <b>Fix and re-run.</b> Salt the hash per experiment (the live store already does: <code>bucket()</code> in <code>lib/datalayer.ts</code>), add the overlap query to the
          pre-readout checklist, and run for {Math.ceil(onePage.power.weeksNeeded)} weeks: this test was also underpowered ({onePage.power.havePerArm} of {onePage.power.neededPerArm.toLocaleString('en-IN')} per arm needed).
        </p>
        <SqlBlock name={['experiment_overlap', 'experiment_basket']} label="Show the overlap and basket SQL" />
      </Readout>

      <section className="section">
        <h2>Pre-readout checklist I use</h2>
        <div className="card small">
          <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
            <li>Sample ratio: χ² on exposures. Stop at p &lt; 0.01.</li>
            <li>Overlap with every other running test: same-arm share near 50%.</li>
            <li>Exposure logged when the variant is on screen; no pre-exposure outcomes counted.</li>
            <li>Ran the planned duration in full weeks; no peeking-driven stop.</li>
            <li>Primary metric decided before launch; guardrails (AOV, refunds, page speed) checked with intervals.</li>
            <li>Novelty: compare week 1 vs later weeks before calling it.</li>
          </ol>
        </div>
      </section>

      <section className="section">
        <h2>Calculators</h2>
        <Calculator />
        <SqlBlock name="experiments" label="Show the readout SQL" />
      </section>
    </>
  );
}
