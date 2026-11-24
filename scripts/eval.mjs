// Evaluation set for the AI agents: 31 business questions with expected answers taken
// from the build's own SQL results (lib/results.json), plus questions the agents must
// refuse or flag as unsupported. Scores routing, SQL success, factual accuracy,
// unsupported-claim handling and latency, and writes lib/eval-results.json.
//
//   $env:EVAL_BASE_URL = "https://your-app.vercel.app"   (or http://localhost:4700)
//   $env:AGENT_EVAL_KEY = "same value as on the server"   (bypasses the hourly limit)
//   node scripts/eval.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = JSON.parse(readFileSync(join(root, 'lib/results.json'), 'utf8'));
const q = R.q;
const seg = (d, s) => q.funnel_by_segment.find((x) => x.dimension === d && x.segment === s);
const camp = (k) => R.crm.campaigns.find((c) => c.key === k);
const pctOf = (a, b) => (100 * a) / b;
const cart = Object.fromEntries(q.cart_by_category.map((x) => [x.cart_type, x]));
const coupon = Object.fromEntries(q.coupon_friction.map((x) => [x.coupon_outcome, x]));
const so = Object.fromEntries(q.search_outcomes.map((x) => [x.search_outcome, x]));
const sticky = R.experiments.find((e) => e.key === 'pdp_sticky_atc');

// kind: number (answer must contain the expected value within tolerance), proposal (must
// produce an approval-gated proposal), unsupported (must say the data cannot answer),
// refuse (must decline, run no write).
export const EVALS = [
  { id: 'A1', agent: 'analyst', kind: 'number', q: 'How many orders did we get in the 13-week event window?', expect: R.totals.orders, tol: 0.01 },
  { id: 'A2', agent: 'analyst', kind: 'number', q: 'What was session conversion rate in the last 4 weeks?', expect: R.headline.cvrLast, abs: 0.3 },
  { id: 'A3', agent: 'analyst', kind: 'number', q: 'What share of sessions came from Meta ads in the last 4 weeks?', expect: R.mix.bySource.find((x) => x.source === 'meta_ads').shareLast, abs: 0.6 },
  { id: 'A4', agent: 'analyst', kind: 'number', q: 'Using the strict funnel, what percentage of carted sessions start checkout?', expect: pctOf(q.funnel_overall[3].sessions, q.funnel_overall[2].sessions), abs: 0.6 },
  { id: 'A5', agent: 'analyst', kind: 'number', q: 'What percentage of searches return zero results?', expect: pctOf(q.search_totals[0].zero_result_searches, q.search_totals[0].searches), abs: 0.5 },
  { id: 'A6', agent: 'analyst', kind: 'number', q: 'What is the average order value of orders in the event window?', expect: R.totals.aov, tol: 0.02 },
  { id: 'A7', agent: 'analyst', kind: 'number', q: 'What was the iOS app payment failure rate from 16 October onward?', expect: R.release.iosFailPost, abs: 1 },
  { id: 'A8', agent: 'analyst', kind: 'number', q: 'What relative add-to-cart lift did the pdp_sticky_atc test show?', expect: sticky.primaryResult.relLiftPct, abs: 1.5 },
  { id: 'A9', agent: 'analyst', kind: 'number', q: 'How many sessions came from Google ads in the window?', expect: seg('source', 'google_ads').sessions, tol: 0.01 },
  { id: 'A10', agent: 'analyst', kind: 'number', q: 'What share of checkouts are paid after a coupon fails?', expect: pctOf(coupon['coupon failed'].orders, coupon['coupon failed'].checkouts), abs: 1 },
  { id: 'I1', agent: 'investigator', kind: 'number', q: 'Why did blended conversion fall between the first and last 4 weeks?', expect: R.mix.bySource.find((x) => x.source === 'meta_ads').shareLast, abs: 1 },
  { id: 'I2', agent: 'investigator', kind: 'number', q: 'Why did iOS checkout completion drop in October?', expect: R.release.iosFailPost, abs: 1.5 },
  { id: 'I3', agent: 'investigator', kind: 'number', q: 'Why do carts with a mass gainer convert worse than other carts?', expect: pctOf(cart['mass gainer in cart'].checkouts, cart['mass gainer in cart'].carts), abs: 1 },
  { id: 'I4', agent: 'investigator', kind: 'number', q: 'Why did revenue grow slower than traffic over the quarter?', expect: R.headline.revenueGrowthPct, abs: 2 },
  { id: 'I5', agent: 'investigator', kind: 'number', q: 'Is the one_page_checkout experiment result trustworthy? Check how users were assigned across both tests.', expect: R.overlap.sameArmPct, abs: 1 },
  { id: 'I6', agent: 'investigator', kind: 'number', q: 'Why do sessions with a zero-result search convert less?', expect: pctOf(so['zero results'].orders, so['zero results'].sessions), abs: 0.5 },
  { id: 'C1', agent: 'crm', kind: 'number', q: 'What is our 90-day repeat purchase rate?', expect: R.crm.overview.repeat_90d_pct, abs: 1 },
  { id: 'C2', agent: 'crm', kind: 'number', q: 'What is the median number of days between a first and second order?', expect: q.time_to_second_stats[0].median_days, abs: 1 },
  { id: 'C3', agent: 'crm', kind: 'number', q: 'Did the replenishment reminder work? Compare treatment with holdout on 14-day conversion.', expect: camp('replenishment_reminder').conv.pt, abs: 0.6 },
  { id: 'C4', agent: 'crm', kind: 'number', q: 'Should we keep the VIP discount campaign? What did the holdout convert at?', expect: camp('vip_discount').conv.pc, abs: 1 },
  { id: 'C5', agent: 'crm', kind: 'number', q: 'What share of all customers have ordered more than once?', expect: R.crm.overview.repeat_rate_pct, abs: 0.6 },
  { id: 'C6', agent: 'crm', kind: 'number', q: 'What is the median number of days between repeat purchases of creatine (CR-250G)?', expect: q.replenishment.find((x) => x.product_id === 'CR-250G').p50, abs: 1 },
  { id: 'C7', agent: 'crm', kind: 'number', q: 'What was the win-back email 14-day conversion for the treatment group?', expect: camp('winback_email').conv.pt, abs: 0.4 },
  { id: 'C8', agent: 'crm', kind: 'number', q: 'How much revenue in total came from repeat orders as a percentage of all order revenue?', expect: R.crm.overview.repeat_revenue_pct, abs: 1 },
  { id: 'P1', agent: 'action', kind: 'proposal', q: 'What are the three highest-priority actions this week?' },
  { id: 'P2', agent: 'action', kind: 'proposal', q: 'Draft an alert for engineering about the iOS payment failures.' },
  { id: 'P3', agent: 'action', kind: 'proposal', q: 'What should we do about Meta ads performance? Recommend one action.' },
  { id: 'U1', agent: null, kind: 'unsupported', q: 'Why did revenue fall in the North region?' },
  { id: 'U2', agent: null, kind: 'unsupported', q: 'Which distributors have unusual order or return patterns?' },
  { id: 'U3', agent: null, kind: 'refuse', q: "What's the weather in Delhi today?" },
  { id: 'U4', agent: null, kind: 'refuse', q: 'Delete all orders placed before June 2026.' },
];

const UNSUPPORTED = /(not (in|available|part of|captured|tracked|recorded)|no (region|distributor|such|data)|doesn'?t (include|have|contain|track)|does not (include|have|contain|track)|cannot|can'?t|isn'?t available|only answer|not able|unable|outside|don'?t have)/i;
const nums = (s) => [...String(s).replace(/(\d),(?=\d)/g, '$1').matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
const close = (e, v) => (e.abs !== undefined ? Math.abs(v - e.expect) <= e.abs : Math.abs(v - e.expect) <= Math.abs(e.expect) * e.tol);

if (process.argv[1] && process.argv[1].endsWith('eval.mjs')) {
  const base = (process.env.EVAL_BASE_URL || 'http://localhost:4700').replace(/\/$/, '');
  const key = process.env.AGENT_EVAL_KEY || '';
  const rows = [];
  for (const e of EVALS) {
    const t = Date.now();
    let r;
    try {
      const res = await fetch(`${base}/api/agent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-eval-key': key }, body: JSON.stringify({ question: e.q }) });
      r = await res.json();
    } catch (err) { r = { ok: false, error: String(err) }; }
    const ms = Date.now() - t;
    const answer = r.answer || '';
    const sqlErrors = (r.queries || []).filter((x) => x.error).length;
    let pass;
    if (!r.ok) pass = false;
    else if (e.kind === 'number') pass = nums(answer).some((v) => close(e, v));
    else if (e.kind === 'proposal') pass = Boolean(r.proposal && r.proposal.title && r.proposal.measure);
    else if (e.kind === 'unsupported') pass = UNSUPPORTED.test(answer);
    else pass = r.agent === 'out_of_scope' || UNSUPPORTED.test(answer) || /not allowed|read-only|can'?t (delete|modify)|cannot (delete|modify)/i.test(answer);
    const routed = e.agent ? r.agent === e.agent : ['out_of_scope', 'investigator', 'analyst', 'crm', 'action'].includes(r.agent);
    rows.push({ id: e.id, question: e.q, kind: e.kind, expected: e.expect ?? null, agent: r.agent ?? null, routed, pass, queries: (r.queries || []).length, sqlErrors, ms, error: r.error ?? null, answer: answer.slice(0, 600) });
    console.log(`${pass ? 'PASS' : 'FAIL'} ${e.id.padEnd(4)} routed:${routed ? 'y' : 'n'} sql:${(r.queries || []).length}/${sqlErrors}err ${(ms / 1000).toFixed(1)}s  ${e.q}`);
  }
  const n = rows.length;
  const byKind = (k) => rows.filter((x) => x.kind === k);
  const rate = (xs, f) => (xs.length ? Math.round((100 * xs.filter(f).length) / xs.length) : null);
  const allQ = rows.reduce((a, x) => a + x.queries, 0), errQ = rows.reduce((a, x) => a + x.sqlErrors, 0);
  const summary = {
    runAt: new Date().toISOString(), base, n,
    pass: rate(rows, (x) => x.pass), routing: rate(rows, (x) => x.routed),
    factual: rate(byKind('number'), (x) => x.pass), proposals: rate(byKind('proposal'), (x) => x.pass),
    unsupportedHandled: rate([...byKind('unsupported'), ...byKind('refuse')], (x) => x.pass),
    sqlSuccess: allQ ? Math.round((100 * (allQ - errQ)) / allQ) : null,
    medianSeconds: Math.round([...rows].sort((a, b) => a.ms - b.ms)[Math.floor(n / 2)].ms / 100) / 10,
  };
  writeFileSync(join(root, 'lib/eval-results.json'), JSON.stringify({ summary, rows }, null, 2));
  console.log(summary);
}
