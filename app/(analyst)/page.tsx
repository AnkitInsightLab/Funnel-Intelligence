import Link from 'next/link';
import results from '@/lib/results.json';
import { FIXES } from '@/lib/fixes';
import { LineChart, lakh, pct, shortDate, SqlBlock } from '@/components/Charts';

export default function Summary() {
  const { headline: h, mix, release, impact, totals, period } = results;
  const wk = results.q.weekly_kpis;
  const idx = (k: 'sessions' | 'orders' | 'revenue') => wk.map((w) => Math.round((100 * w[k]) / wk[0][k]));
  const first4 = wk.slice(0, 4), last4 = wk.slice(-4);
  const s = (rows: typeof wk, k: 'sessions' | 'orders' | 'revenue') => rows.reduce((a, w) => a + w[k], 0);
  const sorted = [...impact].sort((a, b) => b.revenuePerMonth - a.revenuePerMonth);
  const totalImpact = impact.reduce((a, x) => a + x.revenuePerMonth, 0);
  const sticky = results.experiments.find((e) => e.key === 'pdp_sticky_atc')!;

  return (
    <>
      <p className="small faint" style={{ marginBottom: 6 }}>
        PM summary · Halden Nutrition (fictional D2C supplements store) · {shortDate(period.start)} to {shortDate(period.end)} 2026
      </p>
      <h1>Traffic is up {pct(h.sessionsGrowthPct, 0)}. Revenue is up only {pct(h.revenueGrowthPct, 0)}. Here is where the gap goes.</h1>
      <p className="lede">
        I compared the last four weeks with the first four, cut the funnel by source, platform, category and customer type,
        and found four leaks worth about <b>{lakh(totalImpact)} a month</b> at the current run rate. One of them is a bug shipped on {shortDate(release.date)}.
      </p>
      <div className="banner" style={{ margin: '14px 0 0' }}>
        <span className="tag sim">Synthetic data</span> The 90-day history ({totals.sessions.toLocaleString('en-IN')} sessions, {totals.events.toLocaleString('en-IN')} events)
        is generated with planted problems, so every finding can be checked against a known answer.{' '}
        <span className="tag live">Live</span> The <Link href="/store">store</Link>, data layer, Mixpanel, PostHog, Clarity and Postgres tracking are real.
      </div>

      <section className="section card" style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <h2 style={{ margin: 0 }}>Customer problems → shipped fixes → how each is measured</h2>
          <Link href="/fixes" className="small">Live readout →</Link>
        </div>
        <div className="scroll-x" style={{ marginTop: 10 }}>
          <table className="tbl">
            <thead><tr><th>The customer&apos;s problem</th><th>Fix live in the store</th><th>Measured by</th></tr></thead>
            <tbody>{FIXES.map((x) => (
              <tr key={x.key}>
                <td className="small" style={{ fontStyle: 'italic', maxWidth: 320 }}>{x.problem}</td>
                <td className="small"><Link href={x.tryIt}><b>{x.title}</b></Link></td>
                <td className="small">{x.metricLabel}<div className="muted">guardrail: {x.guardrail}</div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <div className="grid g4 section" style={{ marginTop: 24 }}>
        {[
          ['Sessions, last 4 wks', s(last4, 'sessions').toLocaleString('en-IN'), h.sessionsGrowthPct],
          ['Orders, last 4 wks', s(last4, 'orders').toLocaleString('en-IN'), h.ordersGrowthPct],
          ['Revenue, last 4 wks', lakh(s(last4, 'revenue')), h.revenueGrowthPct],
          ['Session conversion', pct(h.cvrLast, 2), h.cvrLast - h.cvrFirst],
        ].map(([label, value, d], i) => (
          <div className="card kpi" key={label as string}>
            <div className="label">{label}</div>
            <div className="value">{value}</div>
            <div className={`delta ${(d as number) >= 0 ? 'up' : 'down'}`}>
              {(d as number) >= 0 ? '▲' : '▼'} {i === 3 ? `${Math.abs(d as number).toFixed(2)} pts` : pct(Math.abs(d as number))} vs first 4 weeks
            </div>
          </div>
        ))}
      </div>

      <div className="card section" style={{ marginTop: 14 }}>
        <h3>Weekly sessions, orders and revenue, indexed to week 1 = 100</h3>
        <LineChart
          labels={wk.map((w) => shortDate(w.week))}
          series={[
            { name: 'Sessions', color: 'var(--blue)', values: idx('sessions') },
            { name: 'Orders', color: 'var(--win)', values: idx('orders') },
            { name: 'Revenue', color: 'var(--leak)', values: idx('revenue') },
          ]}
          labelEvery={2}
          yFmt={(v) => String(Math.round(v))}
        />
        <SqlBlock name="weekly_kpis" />
      </div>

      <section className="section">
        <h2>The four leaks, ranked by monthly revenue at stake</h2>
        <p className="muted small">
          <span className="tag model">Model</span> Each figure is orders recoverable per month × average order value ({'₹' + totals.aov.toLocaleString('en-IN')}),
          under the stated assumption. They are sizing estimates, not results.
        </p>
        <div className="grid g2">
          {sorted.map((x, i) => (
            <Link key={x.key} href={`/insights#${x.key}`} className="card" style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <h3 style={{ margin: 0 }}>{i + 1}. {x.title}</h3>
                <span className="num" style={{ fontWeight: 650, whiteSpace: 'nowrap' }}>{lakh(x.revenuePerMonth)}/mo</span>
              </div>
              <p className="small muted" style={{ margin: '6px 0 0' }}>≈ {x.ordersPerMonth} orders a month. {x.assumption}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="section grid g2">
        <div className="card">
          <h3>Why traffic grew faster than orders</h3>
          <p className="small">
            Blended conversion moved {mix.changePts > 0 ? '+' : ''}{mix.changePts.toFixed(2)} pts. Holding the traffic mix at the first four weeks&apos; shares,
            it would have been {pct(mix.cvrLastAtOldMix, 2)} instead of {pct(mix.cvrLast, 2)}: <b>{Math.abs(mix.fromMixPts).toFixed(2)} pts come from the mix</b>,
            mostly Meta ads growing from {pct(mix.bySource.find((x) => x.source === 'meta_ads')!.shareFirst)} to {pct(mix.bySource.find((x) => x.source === 'meta_ads')!.shareLast)} of sessions.
            Within-source rates moved {mix.fromRatesPts > 0 ? '+' : ''}{mix.fromRatesPts.toFixed(2)} pts, despite the iOS bug.
          </p>
          <p className="small muted">So the growth team is buying low-intent traffic and landing it on the home page. That is a targeting and landing-page question, not a checkout one.</p>
          <Link href="/insights#mix" className="small">Mix-shift breakdown →</Link>
        </div>
        <div className="card">
          <h3>What I would ship first</h3>
          <ol className="small" style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 6 }}>
            <li><b>Hotfix iOS 4.2 UPI intent.</b> Failures went from {pct(release.iosFailPre)} to {pct(release.iosFailPost)} on iOS only; Android flat. Engineering fix, no test needed.</li>
            <li><b>Show the heavy-item delivery fee on the product page</b> and A/B test absorbing it into the price for 3 kg+ gainers.</li>
            <li><b>Ship sticky add-to-cart, with the cross-sell restored.</b> Add-to-cart +{pct(sticky.primaryResult.relLiftPct)} (p {sticky.primaryResult.p < 0.0001 ? '< 0.0001' : '= ' + sticky.primaryResult.p}), but AOV fell {pct(Math.abs(sticky.aov.changePct))}, breaching the guardrail.</li>
            <li><b>Re-run one-page checkout.</b> The readout is invalid: both tests bucketed users with the same hash.</li>
          </ol>
          <Link href="/roadmap" className="small">Full prioritised roadmap →</Link>
        </div>
      </section>

      <section className="section">
        <h2>What is in here</h2>
        <div className="grid g3">
          {[
            ['/store', 'Live store', 'An instrumented storefront. Open the data layer panel and watch each event, its payload and where it was sent.'],
            ['/insights', 'Insights', 'Funnel by segment, five findings in hypothesis → evidence → change → measure form, clickmap, cohorts, reconciliation.'],
            ['/experiments', 'Experiments', 'Two A/B readouts with lift, 95% CIs, guardrails, SRM and power, plus a sample-size calculator.'],
            ['/roadmap', 'Roadmap', 'ICE-scored backlog with a success metric and guardrail for every item.'],
            ['/tracking-plan', 'Tracking plan', 'The event taxonomy and spec engineering builds from, with a QA checklist. The store validates against it live.'],
            ['/retention', 'Retention', 'RFM segments, repeat rate, time to second order, replenishment windows, churn risk, and which segment deserves investment.'],
            ['/journeys', 'CRM journeys', 'Welcome, replenishment, win-back and VIP journeys with holdouts and incremental lift; CleverTap / MoEngage wiring; n8n workflow.'],
            ['/growth', 'Growth model', 'Revenue driver tree, CAC and LTV:CAC by channel, and an interactive plan to 2× and 3× revenue.'],
            ['/live', 'Live', 'Real visitors to the store: integration status, live funnel and conversion, latest events.'],
            ['/ask', 'AI analyst agents', 'Four specialist agents in Slack and on the web: guarded read-only SQL, approval-gated actions, a 31-question eval set.'],
            [process.env.NEXT_PUBLIC_REPO_URL || '/insights#reconciliation', 'SQL', 'Every query is in analysis/*.sql and shown under each chart. It runs on Postgres at build time.'],
          ].map(([href, t, d]) => (
            <Link key={t} href={href} className="card" style={{ textDecoration: 'none' }}>
              <h3 style={{ marginBottom: 4 }}>{t} →</h3><p className="small muted" style={{ margin: 0 }}>{d}</p>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
