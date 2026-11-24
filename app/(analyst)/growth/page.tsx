import Link from 'next/link';
import results from '@/lib/results.json';
import catalog from '@/lib/catalog.json';
import GrowthPlanner from '@/components/GrowthPlanner';
import { SqlBlock, lakh, pct } from '@/components/Charts';

export const metadata = { title: 'Growth model · Funnel Intelligence' };

const SRC: Record<string, string> = { meta_ads: 'Meta ads', google_ads: 'Google ads', organic: 'Organic', direct: 'Direct', email: 'Email', influencer: 'Influencer' };

export default function Growth() {
  const { crm, impact, mix } = results;
  const g = crm.growthBase;
  const ue = catalog.unitEconomics;
  const leaks = impact.reduce((a, x) => a + x.revenuePerMonth, 0);
  const leaksPct = (100 * leaks) / g.monthlyRevenue;
  const replen = crm.campaigns.find((c) => c.key === 'replenishment_reminder')!;
  const vip = crm.campaigns.find((c) => c.key === 'vip_discount')!;
  const sticky = results.experiments.find((e) => e.key === 'pdp_sticky_atc')!;
  const meta = crm.unitEconomics.find((u) => u.source === 'meta_ads')!;
  const google = crm.unitEconomics.find((u) => u.source === 'google_ads')!;
  const paid = crm.unitEconomics.filter((u) => u.cac > 0).sort((a, b) => (b.ltvToCac ?? 0) - (a.ltvToCac ?? 0));
  const k = 30 / 28;
  const newRev = g.firstRevenue28 * k, repRev = g.repeatRevenue28 * k;

  const evidence = {
    traffic: `Paid growth at today's mix. Shift budget from Meta (LTV:CAC ${meta.ltvToCac}) to Google (${google.ltvToCac}) before adding spend.`,
    cvr: `The four funnel leaks are worth ~${pct(leaksPct, 0)} of revenue (insights); Meta landing pages address the ${Math.abs(mix.fromMixPts).toFixed(1)}-pt mix drag.`,
    aov: `Sticky add-to-cart + an add-on sheet: recovers the ${pct(Math.abs(sticky.aov.changePct))} AOV the bar lost, plus cross-sell on replenishment orders.`,
    repeat: `Replenishment reminder lifts 14-day conversion ${pct(replen.conv.relLiftPct, 0)} (30-day ${pct(replen.conv30.relLiftPct, 0)}); scaling it to push and email opt-ins widens reach.`,
  };

  return (
    <>
      <h1>Growth model: what it takes to reach 2× and 3×</h1>
      <p className="lede">
        Revenue has two engines: new customers (traffic × conversion × AOV) and repeat customers (customer base × repeat rate × AOV). Buying more traffic alone grows revenue
        and shrinks contribution. The plan below grows both engines, and every lever is tied to something measured on the other pages.
      </p>
      <div className="banner" style={{ marginTop: 12 }}>
        <span className="tag model">Model</span> Built on the last 28 days of synthetic data plus stated assumptions: gross margin {ue.grossMarginPct}%, fulfilment ₹{ue.fulfilmentPerOrder}/order,
        payment fees {ue.paymentFeePct}%, CPC Meta ₹{ue.cpc.meta_ads} / Google ₹{ue.cpc.google_ads}, influencer ₹{(ue.influencerSpendPerWeek / 1000).toFixed(0)}k/week. It is a planning tool, not a forecast.
      </div>

      <section className="section card">
        <h2>Revenue driver tree, monthly run rate</h2>
        <div className="scroll-x">
          <table className="tbl">
            <tbody>
              <tr><td><b>Revenue</b></td><td className="r"><b>{lakh(g.monthlyRevenue)}</b></td><td className="small muted">= new + repeat</td></tr>
              <tr><td style={{ paddingLeft: 24 }}>New-customer revenue</td><td className="r">{lakh(newRev)}</td><td className="small muted">sessions × first-order conversion × first AOV</td></tr>
              <tr><td style={{ paddingLeft: 48 }}>Sessions</td><td className="r">{Math.round(g.sessions28 * k).toLocaleString('en-IN')}</td><td className="small muted">Meta now {pct(mix.bySource.find((x) => x.source === 'meta_ads')!.shareLast)} of sessions</td></tr>
              <tr><td style={{ paddingLeft: 48 }}>First-order conversion</td><td className="r">{pct(g.cvrNew, 2)}</td><td className="small muted">first orders ÷ sessions</td></tr>
              <tr><td style={{ paddingLeft: 48 }}>First AOV</td><td className="r">₹{g.aovFirst.toLocaleString('en-IN')}</td><td /></tr>
              <tr><td style={{ paddingLeft: 24 }}>Repeat revenue</td><td className="r">{lakh(repRev)}</td><td className="small muted">{Math.round(g.repeatOrders28 * k).toLocaleString('en-IN')} repeat orders × ₹{g.aovRepeat.toLocaleString('en-IN')}</td></tr>
              <tr><td><b>Contribution before marketing</b></td><td className="r">{lakh(g.monthlyRevenue * (ue.grossMarginPct / 100 - ue.paymentFeePct / 100) - (g.firstOrders28 + g.repeatOrders28) * k * ue.fulfilmentPerOrder)}</td><td className="small muted">gross margin − fees − fulfilment</td></tr>
              <tr><td><b>Marketing spend</b></td><td className="r">{lakh(g.marketingSpendMonthly)}</td><td className="small muted">blended paid CAC ₹{g.blendedPaidCac.toLocaleString('en-IN')}</td></tr>
            </tbody>
          </table>
        </div>
        <SqlBlock name="run_rate" />
      </section>

      <section className="section card">
        <h2>Unit economics by acquisition channel</h2>
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Channel</th><th className="r">Spend, 13 wks</th><th className="r">New customers</th><th className="r">CAC</th><th className="r">180-day revenue</th><th className="r">180-day contribution</th><th className="r">LTV : CAC</th><th className="r">Payback</th></tr></thead>
            <tbody>{paid.map((u) => (
              <tr key={u.source}>
                <td>{SRC[u.source]}</td><td className="r">{lakh(u.spend)}</td><td className="r">{u.newCustomers.toLocaleString('en-IN')}</td><td className="r">₹{u.cac.toLocaleString('en-IN')}</td>
                <td className="r">₹{u.revenue180.toLocaleString('en-IN')}</td><td className="r">₹{u.contribution180.toLocaleString('en-IN')}</td>
                <td className="r" style={{ color: (u.ltvToCac ?? 0) < 3 ? 'var(--leak)' : 'var(--win)', fontWeight: 600 }}>{u.ltvToCac}×</td>
                <td className="r">{u.paybackMonths} mo</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <p className="small" style={{ marginTop: 8 }}>
          Meta brings customers who are also worth less (₹{meta.revenue180.toLocaleString('en-IN')} in 180 days vs ₹{google.revenue180.toLocaleString('en-IN')} from Google). Its LTV:CAC of {meta.ltvToCac}× is under the usual 3× bar.
          Meta is the channel growing fastest, so this is where growth and profit pull apart. Fix the landing pages before adding Meta budget.
        </p>
        <p className="small muted">CAC = channel spend ÷ customers whose first visit came from that channel. 180-day values use customers acquired at least 180 days ago. Organic, direct and email have no media cost.</p>
        <SqlBlock name={['clv_by_source', 'new_customers_by_source']} />
      </section>

      <section className="section">
        <h2>Plan to 2× and 3×</h2>
        <GrowthPlanner base={g} evidence={evidence} />
      </section>

      <section className="section grid g2">
        <div className="card small">
          <h3>The 2× plan, in order</h3>
          <ol style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 6 }}>
            <li><b>Month 1: fix the leaks</b> (iOS payments, delivery fee, coupons, search). ~{lakh(leaks)}/month at today&apos;s traffic, no extra spend. <Link href="/roadmap">Roadmap →</Link></li>
            <li><b>Month 1–2: stop the VIP discount</b> ({lakh(Math.abs(vip.incContribution))} of contribution lost so far, ₹{vip.discountGiven.toLocaleString('en-IN')} in discounts) and scale the replenishment reminder to every opted-in 1–2 order customer.</li>
            <li><b>Month 2–3: Meta landing pages</b>, then move budget toward the channels above 3× LTV:CAC.</li>
            <li><b>Month 3+: grow paid traffic</b> only once conversion and repeat have moved, so each new customer is worth more than they cost.</li>
          </ol>
        </div>
        <div className="card small">
          <h3>Metrics I would put on the weekly review</h3>
          <table className="tbl"><tbody>
            {[
              ['North star', 'Weekly orders from customers acquired in the last 12 months (new + repeat)'],
              ['Acquisition', 'Sessions by source, product-view rate, first-order conversion, CAC by channel'],
              ['Conversion', 'Strict funnel by platform and app version, payment success, zero-result search rate'],
              ['Retention', '60-day second-order rate, repeat share of revenue, customers due / at risk'],
              ['Monetisation', 'AOV, items per order, discount as % of revenue'],
              ['Profit', 'Contribution after marketing, LTV:CAC and payback by channel'],
            ].map(([a, b]) => <tr key={a}><td><b>{a}</b></td><td className="muted">{b}</td></tr>)}
          </tbody></table>
        </div>
      </section>
    </>
  );
}
