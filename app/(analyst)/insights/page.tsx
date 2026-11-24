import results from '@/lib/results.json';
import FunnelExplorer from '@/components/FunnelExplorer';
import { Funnel, LineChart, Bars, SqlBlock, Finding, pct, lakh, shortDate } from '@/components/Charts';

export const metadata = { title: 'Insights · Funnel Intelligence' };

const SRC: Record<string, string> = { meta_ads: 'Meta ads', google_ads: 'Google ads', organic: 'Organic', direct: 'Direct', email: 'Email', influencer: 'Influencer', whatsapp: 'WhatsApp (CRM)' };
const EL: Record<string, string> = {
  flavour_selector: 'Flavour selector', size_selector: 'Size / variant chips', reviews_tab: 'Reviews', lab_report_badge: 'Lab-report badge',
  nutrition_label_image: 'Nutrition label image', delivery_pincode: 'Pincode check', share_button: 'Share',
};

export default function Insights() {
  const { q, mix, release, impact, clickmap, cohortMatrix, checks, totals } = results;
  const imp = Object.fromEntries(impact.map((x) => [x.key, x]));
  const seg = q.funnel_by_segment;
  const total = { dimension: 'all', segment: 'all', revenue: totals.revenue, ...Object.fromEntries(['sessions', 'viewed', 'carted', 'checkout', 'paid'].map((k, i) => [k, q.funnel_overall[i].sessions])) } as (typeof seg)[number];
  const meta = seg.find((r) => r.dimension === 'source' && r.segment === 'meta_ads')!;
  const google = seg.find((r) => r.dimension === 'source' && r.segment === 'google_ads')!;

  // release: 7-day rolling payment failure rate, iOS vs Android
  const days = [...new Set(q.release_impact.map((r) => r.day))].sort();
  const roll = (plat: string) => days.map((_, i) => {
    if (i < 6) return null;
    const win = q.release_impact.filter((r) => r.platform === plat && r.day >= days[i - 6] && r.day <= days[i]);
    const a = win.reduce((s, r) => s + r.attempts, 0), f = win.reduce((s, r) => s + r.failures, 0);
    return a ? Math.round((1000 * f) / a) / 10 : null;
  });
  const relIdx = days.indexOf(release.date);
  const iosErr = q.payment_errors.filter((r) => r.platform === 'ios_app');
  const topIosErr = iosErr[0];

  const cart = Object.fromEntries(q.cart_by_category.map((r) => [r.cart_type, r]));
  const mg = cart['mass gainer in cart'], oc = cart['other carts'];
  const cp = Object.fromEntries(q.coupon_friction.map((r) => [r.coupon_outcome, r]));
  const so = Object.fromEntries(q.search_outcomes.map((r) => [r.search_outcome, r]));
  const st = q.search_totals[0];
  const zeroPct = (100 * st.zero_result_searches) / st.searches;
  const clicks = clickmap.filter((c) => c.kind === 'click');
  const scroll = clickmap.filter((c) => c.kind === 'scroll');
  const lab = clicks.find((c) => c.item === 'lab_report_badge')!;
  const label = clicks.find((c) => c.item === 'nutrition_label_image')!;
  const pdpAtc = (100 * results.pdp.carted) / results.pdp.pdp_sessions;
  const maxWeeks = Math.max(...cohortMatrix.map((c) => c.weeks.length));
  const shownWeeks = Math.min(9, maxWeeks);

  return (
    <>
      <h1>Insights</h1>
      <p className="lede">
        Where sessions drop, which segments drop most, and why. Each finding goes from hypothesis to the evidence to the change, and to how we would know it worked.
      </p>

      <section className="section grid g2">
        <div className="card">
          <h3>Strict session funnel, all {totals.sessions.toLocaleString('en-IN')} sessions</h3>
          <Funnel steps={q.funnel_overall} />
          <SqlBlock name="funnel_overall" />
        </div>
        <div className="card">
          <h3>Reading the funnel</h3>
          <p className="small">
            The biggest absolute loss is product view → cart ({pct((100 * q.funnel_overall[2].sessions) / q.funnel_overall[1].sessions)} continue), which is normal for supplements:
            people compare, check labels and leave. The steps that look broken are the ones with a specific segment far below the rest. Pick a cut below and look for the shaded cells.
          </p>
          <p className="small muted">
            The funnel is strict: a session counts at a step only if it reached every earlier step, so the stages always add up to the order count.
            The checks at the bottom of this page prove it.
          </p>
        </div>
      </section>

      <section className="section card">
        <h2>Funnel by segment</h2>
        <FunnelExplorer rows={seg} total={total} />
        <SqlBlock name="funnel_by_segment" />
      </section>

      <div id="mix" />
      <Finding n={1} title="Traffic grew in the cheapest, lowest-intent channel" tag={<span className="tag leak">explains the gap</span>}
        steps={{
          hypothesis: 'Orders lag traffic because new traffic converts worse, not because the site got worse.',
          segment: `Meta ads sessions: ${pct((100 * meta.paid) / meta.sessions, 2)} session conversion vs ${pct((100 * google.paid) / google.sessions, 2)} for Google ads.`,
          evidence: `Meta's share of sessions went from ${pct(mix.bySource.find((x) => x.source === 'meta_ads')!.shareFirst)} to ${pct(mix.bySource.find((x) => x.source === 'meta_ads')!.shareLast)}. At the old mix, conversion would be ${pct(mix.cvrLastAtOldMix, 2)}, not ${pct(mix.cvrLast, 2)}.`,
          change: 'Send Meta traffic to category or product landing pages matched to the ad, not the home page. Cap Meta spend on audiences below a CAC-to-AOV threshold.',
          measure: 'Meta session → product view rate and Meta session CVR, weekly. Guardrail: Meta sessions per ₹ of spend.',
        }}>
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Source</th><th className="r">Share, first 4 wks</th><th className="r">Share, last 4 wks</th><th className="r">CVR, first 4 wks</th><th className="r">CVR, last 4 wks</th></tr></thead>
            <tbody>
              {[...mix.bySource].sort((a, b) => b.shareLast - a.shareLast).map((r) => (
                <tr key={r.source}>
                  <td>{SRC[r.source]}</td><td className="r">{pct(r.shareFirst)}</td>
                  <td className="r" style={r.source === 'meta_ads' ? { color: 'var(--leak)', fontWeight: 600 } : undefined}>{pct(r.shareLast)}</td>
                  <td className="r">{pct(r.cvrFirst, 2)}</td><td className="r">{pct(r.cvrLast, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small">
          Blended conversion changed <b>{mix.changePts.toFixed(2)} pts</b>. Mix alone accounts for <b>{mix.fromMixPts.toFixed(2)} pts</b>; within-source rates actually moved
          {' '}{mix.fromRatesPts > 0 ? '+' : ''}{mix.fromRatesPts.toFixed(2)} pts. Meta sessions also land on the home page and
          reach a product page {pct((100 * meta.viewed) / meta.sessions, 0)} of the time, against {pct((100 * google.viewed) / google.sessions, 0)} for Google.
        </p>
        <SqlBlock name="mix_shift" />
      </Finding>

      <div id="ios_payments" />
      <Finding n={2} title={`${release.version} broke UPI payments on iOS`} tag={<span className="tag leak">{lakh(imp.ios_payments.revenuePerMonth)}/mo</span>}
        steps={{
          hypothesis: `Something in the ${shortDate(release.date)} iOS release made payments fail, independent of demand.`,
          segment: 'iOS app 4.2.0 users paying by UPI. Android and web are unaffected.',
          evidence: `iOS payment failures ${pct(release.iosFailPre)} → ${pct(release.iosFailPost)}; Android ${pct(release.andFailPre)} → ${pct(release.andFailPost)}. Checkout → paid on iOS fell ${Math.abs(release.didPts)} pts more than Android (difference-in-differences). ${topIosErr ? `${topIosErr.failures} of the iOS failures are ${topIosErr.error_code} on ${topIosErr.app_version}.` : ''}`,
          change: 'Hotfix the UPI intent hand-off in 4.2.x; until it ships, default iOS users to the UPI collect flow and show a retry banner.',
          measure: 'iOS UPI failure rate back under 5% within 3 days of the hotfix; daily alert if any platform/version exceeds 2× its 28-day failure rate.',
        }}>
        <h3>Payment failure rate, 7-day rolling</h3>
        <LineChart labels={days.map(shortDate)} labelEvery={14} yFmt={(v) => v.toFixed(0) + '%'} yMin={0}
          marker={{ index: relIdx, label: `${release.version} released` }}
          series={[{ name: 'iOS app', color: 'var(--leak)', values: roll('ios_app') }, { name: 'Android app (control)', color: 'var(--blue)', values: roll('android_app') }]} />
        <p className="small muted">
          Recovering the gap is worth about {imp.ios_payments.ordersPerMonth} orders a month. This one needs no A/B test: it is a regression with a clean control group, and the fix is a bug fix.
        </p>
        <SqlBlock name={['release_impact', 'release_sessions', 'payment_errors']} />
      </Finding>

      <div id="mass_gainer" />
      <Finding n={3} title="Mass gainer carts abandon at the delivery fee" tag={<span className="tag leak">{lakh(imp.mass_gainer.revenuePerMonth)}/mo</span>}
        steps={{
          hypothesis: 'Shoppers see a ₹149 heavy-item delivery fee for the first time in the cart, after deciding to buy.',
          segment: `Carts containing a 3 kg+ mass gainer (${mg.carts.toLocaleString('en-IN')} carts; AOV ${'₹' + mg.aov.toLocaleString('en-IN')}, about twice the rest).`,
          evidence: `Cart → checkout ${pct((100 * mg.checkouts) / mg.carts)} for mass gainer carts vs ${pct((100 * oc.checkouts) / oc.carts)} for all other carts. After checkout starts the gap disappears (${pct((100 * mg.orders) / mg.checkouts)} vs ${pct((100 * oc.orders) / oc.checkouts)} paid), so it is the cart, not payment.`,
          change: 'Show the delivery fee on the product page next to the price. Then test absorbing it into the 3 kg+ price (₹2,799 → ₹2,899, free delivery).',
          measure: 'Primary: mass gainer cart → checkout. Guardrails: mass gainer PDP → cart (the fee is now visible earlier) and gross margin per order.',
        }}>
        <Bars fmt={(v) => pct(v)} highlight="Mass gainer in cart" rows={[
          { label: 'Mass gainer in cart', value: (100 * mg.checkouts) / mg.carts, note: `${mg.checkouts} of ${mg.carts}` },
          { label: 'Other carts', value: (100 * oc.checkouts) / oc.carts, note: `${oc.checkouts} of ${oc.carts}` },
        ]} />
        <p className="small muted">Cart → checkout rate. You can see the fee appear in the <a href="/store/p/mass-gainer-chocolate-3kg">live store</a>: add the 3 kg gainer and open the cart.</p>
        <SqlBlock name="cart_by_category" />
      </Finding>

      <div id="coupon" />
      <Finding n={4} title="Failed coupons cut payment completion by more than a third" tag={<span className="tag leak">{lakh(imp.coupon.revenuePerMonth)}/mo</span>}
        steps={{
          hypothesis: 'Shoppers type a code they saw in an ad, get an error at the last step, and leave.',
          segment: `${cp['coupon failed'].checkouts.toLocaleString('en-IN')} checkouts with a failed coupon, ${cp['coupon failed'].min_cart_value_errors} of them MIN_CART_VALUE.`,
          evidence: `Checkout → paid: ${pct((100 * cp['coupon failed'].orders) / cp['coupon failed'].checkouts)} after a failed coupon vs ${pct((100 * cp['no coupon'].orders) / cp['no coupon'].checkouts)} with no coupon and ${pct((100 * cp['coupon applied'].orders) / cp['coupon applied'].checkouts)} with one that worked.`,
          change: 'Show eligible coupons and their minimum in the cart ("Add ₹420 for FIT15"). Turn the MIN_CART_VALUE error into an add-on suggestion.',
          measure: 'Coupon failure rate and checkout → paid for coupon users. Guardrail: discount cost per order.',
        }}>
        <Bars fmt={(v) => pct(v)} highlight="Coupon failed" rows={q.coupon_friction.map((r) => ({
          label: r.coupon_outcome[0].toUpperCase() + r.coupon_outcome.slice(1), value: (100 * r.orders) / r.checkouts, note: `${r.orders} of ${r.checkouts}`,
        }))} />
        <p className="small muted">Checkout → paid rate. Correlation caveat: shoppers who hunt coupons may be more price-sensitive anyway; the cart-side test settles it.</p>
        <SqlBlock name="coupon_friction" />
      </Finding>

      <div id="search" />
      <Finding n={5} title="One search in seven returns nothing" tag={<span className="tag leak">{lakh(imp.search.revenuePerMonth)}/mo</span>}
        steps={{
          hypothesis: 'Search matches literally, so synonyms, Hinglish and typos dead-end.',
          segment: `${st.zero_result_searches.toLocaleString('en-IN')} zero-result searches (${pct(zeroPct)} of all searches).`,
          evidence: `Sessions with a zero-result search convert at ${pct((100 * so['zero results'].orders) / so['zero results'].sessions, 2)} vs ${pct((100 * so['found results'].orders) / so['found results'].sessions, 2)} when search finds something. Top misses are below.`,
          change: 'Synonym list ("weight gainer" → mass gainer, "sasta" → sort by price), spell-correction, and a "did you mean" fallback instead of an empty page.',
          measure: 'Zero-result rate under 5%; search → product view rate. Smallest of the four leaks, so it ranks last, but it is cheap.',
        }}>
        <div className="grid g2">
          <table className="tbl">
            <thead><tr><th>Query returning zero results</th><th className="r">Searches</th></tr></thead>
            <tbody>{q.zero_result_queries.slice(0, 7).map((r) => <tr key={r.query}><td>{r.query}</td><td className="r">{r.searches}</td></tr>)}</tbody>
          </table>
          <div className="small">
            <p>Each miss is a solvable product gap: a synonym (<i>weight gainer</i>), a typo (<i>protien</i>), Hinglish intent (<i>sasta</i>),
              a size that exists only in another flavour, or a product we don&apos;t stock (<i>biotin</i>, <i>creatine gummies</i>), which is a range signal for the category team.</p>
            <p className="muted">Try <a href="/store/search?q=weight%20gainer">&ldquo;weight gainer&rdquo;</a> in the live store and watch <code>results_count: 0</code> in the data layer panel.</p>
          </div>
        </div>
        <SqlBlock name={['search_outcomes', 'zero_result_queries']} />
      </Finding>

      <section className="section card" id="clickmap">
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>Product page clickmap and scrollmap</h2>
          <span className="tag sim">from tracked events</span><span className="tag live">Clarity live on the store</span>
        </div>
        <p className="small muted" style={{ marginTop: 6 }}>
          Share of {results.pdp.pdp_sessions.toLocaleString('en-IN')} product-page sessions that clicked each element, and the add-to-cart rate of those sessions
          (page average {pct(pdpAtc)}). Elements marked dead do nothing when clicked.
        </p>
        <div className="grid g2">
          <div>
            {clicks.map((c) => (
              <div className="funnel-row" key={c.item}>
                <div>{EL[c.item] ?? c.item}{c.dead && <> <span className="tag leak">dead</span></>}</div>
                <div className="bar"><i style={{ width: `${c.pct * 2.4}%`, background: c.dead ? 'var(--leak)' : 'var(--blue)' }} /></div>
                <div className="num" style={{ textAlign: 'right' }}>{pct(c.pct)}<div className="faint small">ATC {pct(c.atcPct)}</div></div>
              </div>
            ))}
          </div>
          <div>
            <h3>How far down the page people get</h3>
            {scroll.map((c) => (
              <div className="funnel-row" key={c.item}>
                <div>Reached {c.item}%</div>
                <div className="bar"><i style={{ width: `${c.pct}%`, background: 'var(--win)' }} /></div>
                <div className="num" style={{ textAlign: 'right' }}>{pct(c.pct)}</div>
              </div>
            ))}
            <p className="small" style={{ marginTop: 10 }}>
              <b>Read:</b> {pct(lab.pct)} of shoppers click the lab-report badge and {pct(label.pct)} click the nutrition label, and both do nothing.
              People are asking for proof of quality, and the page doesn&apos;t answer. Make both open the report or label,
              and move reviews above the fold: only {pct(scroll.find((s) => s.item === '75')!.pct)} reach the 75% mark where reviews sit.
            </p>
          </div>
        </div>
        <p className="small muted">
          In production I would confirm this in Clarity (dead-click and rage-click filters, scroll map for the PDP template) before building. Clarity is installed on the
          live store, so its heatmaps fill as real visitors arrive. The numbers above come from the synthetic element_clicked and scroll_depth events.
        </p>
        <SqlBlock name={['pdp_clickmap', 'pdp_sessions']} />
      </section>

      <section className="section card" id="cohorts">
        <h2>Weekly cohort retention</h2>
        <p className="small muted">Share of users from each first-visit week who came back in week N. Users first seen before the window are excluded.</p>
        <div className="scroll-x">
          <table className="tbl heat">
            <thead><tr><th>First week</th><th className="r">Users</th>{Array.from({ length: shownWeeks }, (_, i) => <th key={i} className="r">W{i}</th>)}</tr></thead>
            <tbody>
              {cohortMatrix.map((c) => (
                <tr key={c.cohort}>
                  <td>{shortDate(c.cohort)}</td><td className="r">{c.size.toLocaleString('en-IN')}</td>
                  {Array.from({ length: shownWeeks }, (_, i) => {
                    const w = c.weeks.find((x) => x.n === i);
                    if (!w) return <td key={i} className="cell" />;
                    const a = i === 0 ? 0 : Math.min(1, w.pct / 25);
                    return <td key={i} className="cell num" style={i === 0 ? { color: 'var(--faint)' } : { background: `color-mix(in srgb, var(--blue) ${Math.round(a * 55)}%, transparent)` }}>{i === 0 ? '100' : w.pct.toFixed(1)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small">
          Week-1 return rates hold steady across cohorts, so retention is not where the growth gap comes from. That pushes the fix toward acquisition quality
          (finding 1) and the funnel leaks (2–5), not a lifecycle programme. That analysis belongs to the retention project.
        </p>
        <SqlBlock name="cohort_retention" />
      </section>

      <section className="section card" id="reconciliation">
        <h2>Reconciliation checks</h2>
        <p className="small muted">Run on every build. If any fails, the build fails, so the dashboard never shows numbers that disagree with the raw events.</p>
        <table className="tbl">
          <tbody>
            {checks.map((c) => (
              <tr key={c.name}><td style={{ width: 70 }}><span className={`tag ${c.ok ? 'live' : 'leak'}`}>{c.ok ? 'PASS' : 'FAIL'}</span></td><td>{c.name}</td><td className="r num muted">{c.detail}</td></tr>
            ))}
          </tbody>
        </table>
        <SqlBlock name="reconciliation" />
      </section>
    </>
  );
}
