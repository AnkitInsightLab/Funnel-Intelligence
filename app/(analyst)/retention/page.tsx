import Link from 'next/link';
import results from '@/lib/results.json';
import catalog from '@/lib/catalog.json';
import { Bars, LineChart, SqlBlock, lakh, pct } from '@/components/Charts';

export const metadata = { title: 'Retention · Funnel Intelligence' };

const SEGMENT_ACTION: Record<string, { invest: 'high' | 'medium' | 'low' | 'stop'; action: string }> = {
  'Needs a second order': { invest: 'high', action: 'Replenishment reminder at cycle − 3 days. Biggest measured lift of any campaign.' },
  New: { invest: 'high', action: 'Replenishment reminder + how-to-use content; the second order is the habit.' },
  'At risk (repeat buyers)': { invest: 'medium', action: 'Win-back with a new-flavour or bundle hook, no blanket discount. Proven buyers, worth one WhatsApp.' },
  Loyal: { invest: 'medium', action: 'Replenishment reminder only. No discount needed.' },
  Champions: { invest: 'stop', action: 'Stop the VIP discount: they buy anyway (holdout proves it). Early access and referral instead.' },
  Hibernating: { invest: 'low', action: 'One cheap win-back email, then suppress.' },
  Lost: { invest: 'low', action: 'Suppress from paid channels (WhatsApp); quarterly email only.' },
};
const TONE = { high: 'live', medium: 'model', low: 'sim', stop: 'leak' } as const;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const mlabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;

export default function Retention() {
  const { q, crm } = results;
  const o = crm.overview;
  const t2 = q.time_to_second_stats[0];
  const trend = q.repeat_trend;
  const rfm = q.rfm;
  const churn = q.churn_risk;
  const replen = crm.campaigns.find((c) => c.key === 'replenishment_reminder')!;
  const vip = crm.campaigns.find((c) => c.key === 'vip_discount')!;
  const due = churn.find((c) => c.status.includes('due'))!;
  const atRisk = churn.find((c) => c.status.includes('at risk'))!;
  const cohorts: Record<string, Record<number, number>> = {};
  for (const r of q.purchase_cohorts) (cohorts[r.cohort] ||= {})[r.month_n] = r.customers;
  const cohortRows = Object.entries(cohorts).map(([c, m]) => ({ cohort: c, size: m[0], months: m }));
  const maxM = 6;
  const pname = (id: string) => catalog.products.find((p) => p.id === id)?.name.split(',').slice(0, 2).join(',') ?? id;
  const byOrders = q.replenishment_by_orders;
  const rate = (type: string, v: string) => { const x = byOrders.find((b) => b.customer_type === type && b.variant === v)!; return (100 * x.converted_14d) / x.recipients; };

  return (
    <>
      <h1>Retention and lifecycle</h1>
      <p className="lede">
        Most customers buy once. This page finds who comes back, when they run out, who is about to lapse, and which customers deserve money. Every message costs something,
        and many customers would have bought anyway.
      </p>
      <div className="banner" style={{ marginTop: 12 }}>
        <span className="tag sim">Synthetic</span> 12 months of orders ({o.orders.toLocaleString('en-IN')} orders, {o.customers.toLocaleString('en-IN')} customers) from the same generator as the event data.
        Orders inside the 13-week event window match the <code>payment_completed</code> events one for one (see the checks on the Insights page).
      </div>

      <div className="grid g4 section" style={{ marginTop: 20 }}>
        {[
          ['90-day repeat rate', pct(o.repeat_90d_pct), `of ${o.customers_90d_tenure.toLocaleString('en-IN')} customers with 90+ days tenure`],
          ['Median time to 2nd order', `${t2.median_days} days`, `middle half: ${t2.p25_days}–${t2.p75_days} days`],
          ['Revenue from repeat orders', pct(o.repeat_revenue_pct), `${o.orders_per_customer} orders per customer`],
          ['Repeat AOV vs first', `₹${o.aov_repeat.toLocaleString('en-IN')}`, `first order ₹${o.aov_first.toLocaleString('en-IN')}`],
        ].map(([l, v, d]) => (
          <div className="card kpi" key={l}><div className="label">{l}</div><div className="value">{v}</div><div className="delta muted">{d}</div></div>
        ))}
      </div>

      <section className="section card">
        <h2>Growth is mostly new customers</h2>
        <LineChart labels={trend.map((t) => mlabel(t.month))} labelEvery={2} yFmt={(v) => String(Math.round(v))} yMin={0}
          series={[{ name: 'First orders', color: 'var(--blue)', values: trend.map((t) => t.first_orders) }, { name: 'Repeat orders', color: 'var(--win)', values: trend.map((t) => t.repeat_orders) }]} />
        <p className="small">
          Repeat orders are {pct(o.repeat_revenue_pct, 0)} of revenue. With a {t2.median_days}-day median gap to the second order and products that run out in 3–8 weeks,
          every first order is a scheduled second order the brand can lose. That is the cheapest growth available: no CAC.
        </p>
        <SqlBlock name={['crm_overview', 'repeat_trend']} />
      </section>

      <section className="section grid g2">
        <div className="card">
          <h2>Time to second order</h2>
          <Bars fmt={(v) => v.toLocaleString('en-IN')} color="var(--win)" rows={q.time_to_second.map((b) => ({ label: `${b.bucket} days`, value: b.customers }))} />
          <p className="small muted">Customers who placed a second order, by days after the first. Most come back inside two months, so a nudge after day 60 is a win-back, not a reminder.</p>
          <SqlBlock name={['time_to_second', 'time_to_second_stats']} />
        </div>
        <div className="card">
          <h2>Purchase cohorts</h2>
          <div className="scroll-x">
            <table className="tbl heat">
              <thead><tr><th>First order</th><th className="r">Customers</th>{Array.from({ length: maxM }, (_, i) => <th key={i} className="r">M{i + 1}</th>)}</tr></thead>
              <tbody>
                {cohortRows.map((c) => (
                  <tr key={c.cohort}>
                    <td>{mlabel(c.cohort)}</td><td className="r">{c.size.toLocaleString('en-IN')}</td>
                    {Array.from({ length: maxM }, (_, i) => {
                      const v = c.months[i + 1];
                      if (v === undefined) return <td key={i} className="cell" />;
                      const p = (100 * v) / c.size;
                      return <td key={i} className="cell num" style={{ background: `color-mix(in srgb, var(--win) ${Math.round(Math.min(1, p / 20) * 55)}%, transparent)` }}>{p.toFixed(1)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">% of each monthly cohort ordering again in month N. The newest months are incomplete.</p>
          <SqlBlock name="purchase_cohorts" />
        </div>
      </section>

      <section className="section card">
        <h2>Replenishment windows</h2>
        <p className="small muted">Days between two orders of the same product by the same customer. The reminder should land just before the 25th percentile, when the earliest quarter of reorders starts.</p>
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Product</th><th className="r">Reorders</th><th className="r">25th pct</th><th className="r">Median</th><th className="r">75th pct</th><th className="r">Send reminder on day</th></tr></thead>
            <tbody>{q.replenishment.map((r) => (
              <tr key={r.product_id}><td>{pname(r.product_id)}</td><td className="r">{r.repurchases}</td><td className="r">{r.p25}</td><td className="r"><b>{r.p50}</b></td><td className="r">{r.p75}</td><td className="r">{Math.max(1, Math.round(r.p25) - 3)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <SqlBlock name="replenishment" />
      </section>

      <section className="section card">
        <h2>RFM segments and where the money should go</h2>
        <p className="small muted">Recency and monetary scored by quintile, frequency by order count, mapped to named segments. Investment calls use the campaign holdouts on the CRM journeys page.</p>
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Segment</th><th className="r">Customers</th><th className="r">Avg days since order</th><th className="r">Avg orders</th><th className="r">Avg revenue</th><th className="r">Revenue</th><th>Invest</th><th>Action</th></tr></thead>
            <tbody>{rfm.map((s) => {
              const a = SEGMENT_ACTION[s.segment];
              return (
                <tr key={s.segment}>
                  <td><b>{s.segment}</b></td><td className="r">{s.customers.toLocaleString('en-IN')}</td><td className="r">{s.avg_recency_days}</td><td className="r">{s.avg_orders}</td>
                  <td className="r">₹{s.avg_revenue.toLocaleString('en-IN')}</td><td className="r">{lakh(s.revenue)}</td>
                  <td>{a && <span className={`tag ${TONE[a.invest]}`}>{a.invest}</span>}</td><td className="small">{a?.action}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        <SqlBlock name="rfm" />
      </section>

      <section className="section grid g2">
        <div className="card">
          <h2>Churn risk</h2>
          <div className="scroll-x"><table className="tbl">
            <thead><tr><th>Status (days since last order ÷ cycle)</th><th className="r">Customers</th><th className="r">Repeat buyers</th></tr></thead>
            <tbody>{churn.map((c) => <tr key={c.status}><td>{c.status.slice(4)}</td><td className="r">{c.customers.toLocaleString('en-IN')}</td><td className="r">{c.repeat_customers.toLocaleString('en-IN')}</td></tr>)}</tbody>
          </table></div>
          <p className="small" style={{ marginTop: 8 }}>
            <b>{due.customers.toLocaleString('en-IN')}</b> customers are due now and <b>{atRisk.customers.toLocaleString('en-IN')}</b> are past 1.5× their cycle.
            The cycle-based clock is a better churn signal for consumables than a flat &ldquo;90 days inactive&rdquo;: a fish-oil buyer at day 60 is fine, a peanut-butter buyer is gone.
          </p>
          <SqlBlock name="churn_risk" />
        </div>
        <div className="card">
          <h2>Who deserves the investment</h2>
          <ol className="small" style={{ paddingLeft: 18, display: 'grid', gap: 8, margin: 0 }}>
            <li><b>One-order customers approaching run-out.</b> The reminder lifts 14-day conversion from {pct(rate('1 prior order', 'holdout'))} to {pct(rate('1 prior order', 'treatment'))}.
              It turns a one-time buyer into a habit, and it is the largest pool.</li>
            <li><b>Two-order customers, same reminder.</b> {pct(rate('2 prior orders', 'holdout'))} → {pct(rate('2 prior orders', 'treatment'))}. No discount needed.</li>
            <li><b>Not Champions.</b> The VIP code converted {pct(vip.conv.pt)} vs {pct(vip.conv.pc)} in holdout: {vip.anywayPct}% of those orders would have happened anyway,
              and it gave away ₹{vip.discountGiven.toLocaleString('en-IN')} in discounts. Replace it with early access and referrals.</li>
          </ol>
          <p className="small muted" style={{ marginTop: 10 }}>
            When to send: 3 days before the product&apos;s 25th-percentile reorder day. Send hour is an untested assumption (11:00 in the simulation); it is the next thing to split-test. How to avoid paying for sure things:
            keep a permanent 10–20% holdout per journey and judge each journey on incremental contribution, not attributed revenue. <Link href="/journeys">Campaign readouts →</Link>
          </p>
          <p className="small muted">Replenishment reminder incremental contribution so far: ₹{replen.incContribution.toLocaleString('en-IN')} on ₹{replen.msgCost.toLocaleString('en-IN')} of WhatsApp cost.</p>
        </div>
      </section>
    </>
  );
}
