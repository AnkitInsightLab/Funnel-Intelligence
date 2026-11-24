import Link from 'next/link';
import results from '@/lib/results.json';
import { lakh, pct } from '@/components/Charts';

export const metadata = { title: 'Roadmap · Funnel Intelligence' };

export default function Roadmap() {
  const imp = Object.fromEntries(results.impact.map((x) => [x.key, x]));
  const sticky = results.experiments.find((e) => e.key === 'pdp_sticky_atc')!;
  const r = results.release;
  // ICE: Impact (1-10, from the ₹ model), Confidence (1-10, strength of evidence), Ease (1-10, engineering effort, inverse)
  const items = [
    { title: 'Hotfix iOS 4.2 UPI intent hand-off', link: '/insights#ios_payments', impact: 8, confidence: 10, ease: 8, size: imp.ios_payments.revenuePerMonth, type: 'Bug fix',
      metric: 'iOS UPI failure rate < 5% within 3 days', guard: 'Android/web failure rate unchanged', evidence: `iOS failures ${pct(r.iosFailPre)} → ${pct(r.iosFailPost)}, Android flat; diff-in-diff ${r.didPts} pts.` },
    { title: 'Ship sticky add-to-cart + post-tap add-on sheet', link: '/experiments#pdp_sticky_atc', impact: 7, confidence: 8, ease: 8, size: null, type: 'Ship + follow-up test',
      metric: 'Add-to-cart rate holds the tested lift', guard: 'AOV within −3% of pre-launch', evidence: `ATC +${pct(sticky.primaryResult.relLiftPct)}, p ${sticky.primaryResult.p < 0.0001 ? '< 0.0001' : sticky.primaryResult.p}; AOV ${pct(sticky.aov.changePct)}.` },
    { title: 'Show heavy-item delivery fee on the product page', link: '/insights#mass_gainer', impact: 8, confidence: 7, ease: 9, size: imp.mass_gainer.revenuePerMonth, type: 'A/B test',
      metric: 'Mass gainer cart → checkout', guard: 'Mass gainer PDP → cart; margin per order', evidence: 'Cart → checkout for gainer carts is half the rest; no gap after checkout starts.' },
    { title: 'Eligible coupons + minimum shown in cart', link: '/insights#coupon', impact: 6, confidence: 6, ease: 7, size: imp.coupon.revenuePerMonth, type: 'A/B test',
      metric: 'Checkout → paid for coupon users', guard: 'Discount cost per order', evidence: 'Payment rate after a failed coupon is far below no-coupon; most failures are MIN_CART_VALUE.' },
    { title: 'Meta landing pages matched to the ad', link: '/insights#mix', impact: 7, confidence: 6, ease: 5, size: null, type: 'A/B test (with growth team)',
      metric: 'Meta session → product view, Meta CVR', guard: 'Meta CPC and sessions per ₹', evidence: 'Mix shift explains the blended conversion drop; Meta lands on home.' },
    { title: 'Make the lab-report badge and label open', link: '/insights#clickmap', impact: 4, confidence: 5, ease: 9, size: null, type: 'A/B test',
      metric: 'PDP → cart', guard: 'Time on PDP not up sharply (no confusion)', evidence: 'About 1 in 5 PDP sessions click the dead badge.' },
    { title: 'Search synonyms, spell-correct, "did you mean"', link: '/insights#search', impact: 3, confidence: 7, ease: 7, size: imp.search.revenuePerMonth, type: 'Ship (low risk)',
      metric: 'Zero-result rate < 5%', guard: 'Search → product view rate', evidence: '~15% of searches return nothing; top misses are synonyms and typos.' },
    { title: 'Re-run one-page checkout with per-test salts', link: '/experiments#one_page_checkout', impact: 5, confidence: 3, ease: 6, size: null, type: 'Re-run test',
      metric: 'Checkout → paid', guard: 'Payment failure rate; AOV', evidence: 'First run invalid (shared bucketing) and underpowered.' },
  ].map((x) => ({ ...x, ice: Math.round((x.impact * x.confidence * x.ease) / 10) / 10 }))
    .sort((a, b) => b.ice - a.ice);

  return (
    <>
      <h1>Prioritised roadmap</h1>
      <p className="lede">
        Ranked by ICE (impact × confidence × ease, each 1–10). Impact comes from the ₹ model where one exists. Confidence reflects how strong the evidence is,
        not how much I like the idea. Every item has the metric that decides it and the guardrail that stops it.
      </p>
      <div className="scroll-x section" style={{ marginTop: 20 }}>
        <table className="tbl card" style={{ padding: 0 }}>
          <thead>
            <tr><th>#</th><th>Change</th><th>Type</th><th className="r">I</th><th className="r">C</th><th className="r">E</th><th className="r">ICE</th><th className="r">₹ / month</th><th>Success metric</th><th>Guardrail</th></tr>
          </thead>
          <tbody>
            {items.map((x, i) => (
              <tr key={x.title}>
                <td className="num">{i + 1}</td>
                <td><Link href={x.link} style={{ fontWeight: 560 }}>{x.title}</Link><div className="small muted">{x.evidence}</div></td>
                <td className="small">{x.type}</td>
                <td className="r num">{x.impact}</td><td className="r num">{x.confidence}</td><td className="r num">{x.ease}</td>
                <td className="r num" style={{ fontWeight: 650 }}>{x.ice}</td>
                <td className="r num">{x.size ? lakh(x.size) : <span className="faint">–</span>}</td>
                <td className="small">{x.metric}</td><td className="small">{x.guard}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid g2 section">
        <div className="card small">
          <h3>Why this order</h3>
          <p>The iOS fix comes first even though the mass gainer leak is a bit bigger: it is a confirmed regression with a clean control group, and every day it stays costs orders.
            The sticky bar is already tested, so shipping it is cheap. The fee and coupon changes need tests because both can cut conversion earlier in the funnel.</p>
          <p className="muted" style={{ margin: 0 }}>Meta landing pages score lower on ease because they need the growth team and new pages, but they address the biggest driver of the gap. That is the conversation I would start this week.</p>
        </div>
        <div className="card small">
          <h3>What I would not do</h3>
          <p>Redesign checkout end to end. After checkout starts, conversion is healthy outside iOS and failed coupons, and the one checkout test we ran is unreadable.</p>
          <p className="muted" style={{ margin: 0 }}>Launch a retention programme for this problem. Cohort return rates are stable, so it would not close a gap that comes from acquisition mix and funnel leaks.</p>
        </div>
      </div>
      <p className="small muted section"><span className="tag model">Model</span> ₹ figures are sizing estimates at the current run rate, with the assumptions on the summary page.</p>
    </>
  );
}
