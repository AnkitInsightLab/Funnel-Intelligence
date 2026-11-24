// Build step: generate the synthetic history, load it into Postgres (PGlite, in
// process), run every query in analysis/analysis.sql, compute the statistics the
// SQL cannot (z-tests, confidence intervals, diff-in-diff, mix decomposition,
// the ₹ impact model) and write lib/results.json for the app.
//
//   node scripts/seed.mjs          build results.json
//   node scripts/seed.mjs --check  also fail if the funnel does not reconcile
//   node scripts/seed.mjs --csv    also write data/events.csv + data/users.csv
//                                  (to load the same history into Neon or Mixpanel)

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generate, START, DAYS, RELEASE_DAY, EXP_START_DAY } from './generate.mjs';
import catalog from '../lib/catalog.json' with { type: 'json' };

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const t0 = Date.now();
const args = new Set(process.argv.slice(2));

// ---------- 1. generate ----------
const { users, events, customers, orders, sends } = generate();
console.log(`generated ${users.length} users, ${events.length} events, ${orders.length} orders, ${sends.length} campaign sends (${Date.now() - t0} ms)`);

// ---------- 2. load into Postgres ----------
const db = new PGlite();
await db.exec(readFileSync(join(root, 'db/schema.sql'), 'utf8'));
const lit = (v) => v === null || v === undefined ? 'NULL'
  : typeof v === 'number' ? String(v)
  : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE')
  : `'${String(v).replace(/'/g, "''")}'`;

const ucols = ['user_id', 'first_seen', 'acquisition_source', 'platform', 'city_tier'];
for (let i = 0; i < users.length; i += 2000) {
  const rows = users.slice(i, i + 2000).map((u) => `(${ucols.map((c) => lit(u[c])).join(',')})`);
  await db.exec(`INSERT INTO users (${ucols.join(',')}) VALUES ${rows.join(',')}`);
}
const ecols = ['event_time', 'event_name', 'user_id', 'session_id', 'platform', 'app_version', 'utm_source', 'is_returning',
  'page_type', 'category', 'product_id', 'price', 'quantity', 'query', 'results_count', 'coupon_code', 'error_code',
  'element', 'is_dead_click', 'scroll_pct', 'experiment', 'variant', 'order_id', 'revenue'];
for (let i = 0; i < events.length; i += 3000) {
  const rows = events.slice(i, i + 3000).map((e) => `(${ecols.map((c) =>
    c === 'event_time' ? `to_timestamp(${e.event_time / 1000})` : lit(e[c])).join(',')})`);
  await db.exec(`INSERT INTO events (${ecols.join(',')}) VALUES ${rows.join(',')}`);
}
// CRM layer: products, customers, 12 months of orders, campaign sends
async function insert(table, cols, rows, size = 3000, conv = {}) {
  for (let i = 0; i < rows.length; i += size) {
    const vals = rows.slice(i, i + size).map((x) => `(${cols.map((c) => (conv[c] ? conv[c](x[c]) : lit(x[c]))).join(',')})`);
    await db.exec(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${vals.join(',')}`);
  }
}
const ts = (v) => `to_timestamp(${v / 1000})`;
await insert('products', ['product_id', 'category', 'price', 'cycle_days'], catalog.products.map((p) => ({ product_id: p.id, category: p.category, price: p.price, cycle_days: p.cycleDays })));
await insert('customers', ['user_id', 'acquisition_source', 'platform', 'city_tier', 'first_order_date'], customers);
await insert('orders', ['order_id', 'user_id', 'order_time', 'revenue', 'discount', 'utm_source', 'platform', 'order_number'], orders, 3000, { order_time: ts });
await insert('order_items', ['order_id', 'product_id', 'category', 'quantity', 'price'], orders.flatMap((o) => o.items.map((i) => ({ order_id: o.order_id, ...i }))));
await insert('campaign_sends', ['campaign', 'user_id', 'send_time', 'variant', 'channel', 'delivered', 'read', 'clicked'], sends, 3000, { send_time: ts });

// materialise the session view as a table: same columns, much faster here
const viewSql = readFileSync(join(root, 'db/views.sql'), 'utf8');
await db.exec(viewSql.replace('CREATE VIEW sessions AS', 'CREATE TABLE sessions AS'));
console.log(`loaded into Postgres (${Date.now() - t0} ms)`);

// ---------- 3. run the analysis queries ----------
const analysisSql = readFileSync(join(root, 'analysis/analysis.sql'), 'utf8') + '\n' + readFileSync(join(root, 'analysis/crm.sql'), 'utf8');
const blocks = analysisSql.split(/^-- @query /m).slice(1).map((b) => {
  const name = b.slice(0, b.indexOf('\n')).trim();
  const sql = b.slice(b.indexOf('\n') + 1).trim();
  return { name, sql };
});
const q = {};
const sqlText = {};
for (const { name, sql } of blocks) {
  const res = await db.query(sql);
  q[name] = res.rows;
  sqlText[name] = sql;
}
console.log(`ran ${blocks.length} queries (${Date.now() - t0} ms)`);

// ---------- 4. statistics ----------
const erf = (x) => { // Abramowitz-Stegun 7.1.26
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
};
const phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
const r = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

function twoProp(xc, nc, xt, nt) {
  const pc = xc / nc, pt = xt / nt, pp = (xc + xt) / (nc + nt);
  const sePooled = Math.sqrt(pp * (1 - pp) * (1 / nc + 1 / nt));
  const z = (pt - pc) / sePooled;
  const p = 2 * (1 - phi(Math.abs(z)));
  const se = Math.sqrt(pc * (1 - pc) / nc + pt * (1 - pt) / nt);
  const lo = pt - pc - 1.96 * se, hi = pt - pc + 1.96 * se;
  return { pc: r(100 * pc), pt: r(100 * pt), absLiftPts: r(100 * (pt - pc)), relLiftPct: r(100 * (pt - pc) / pc, 1),
    ciLowPts: r(100 * lo), ciHighPts: r(100 * hi), ciLowRel: r(100 * lo / pc, 1), ciHighRel: r(100 * hi / pc, 1),
    z: r(z), p: r(p, 4), significant: p < 0.05 };
}
const sampleSize = (p1, relMde, alpha = 0.05, power = 0.8) => {
  const p2 = p1 * (1 + relMde);
  const za = 1.959964, zb = power === 0.8 ? 0.841621 : 1.281552;
  return Math.ceil(((za + zb) ** 2 * (p1 * (1 - p1) + p2 * (1 - p2))) / (p2 - p1) ** 2);
};

// experiments
const EXP_META = {
  pdp_sticky_atc: { name: 'Sticky add-to-cart bar on mobile product pages', primary: 'carted', primaryLabel: 'Add-to-cart rate',
    hypothesis: 'On mobile, the add-to-cart button scrolls out of view while shoppers read reviews and the label. Keeping it pinned will raise add-to-cart rate without lowering order value.',
    audience: 'Android + iOS app sessions that view a product page', mde: 0.08 },
  one_page_checkout: { name: 'One-page checkout (address + payment on one screen)', primary: 'orders', primaryLabel: 'Checkout → paid rate',
    hypothesis: 'Collapsing address and payment into one screen removes a step and lifts checkout completion.',
    audience: 'Web + Android sessions that start checkout', mde: 0.05, denominator: 'sessions' },
};
const experiments = Object.entries(EXP_META).map(([key, meta]) => {
  const rows = q.experiments.filter((x) => x.experiment === key);
  const c = rows.find((x) => x.variant === 'control'), t = rows.find((x) => x.variant === 'treatment');
  const prim = twoProp(c[meta.primary], c.sessions, t[meta.primary], t.sessions);
  const orders = twoProp(c.orders, c.sessions, t.orders, t.sessions);
  const aovC = c.revenue / c.orders, aovT = t.revenue / t.orders;
  // Welch interval on the difference in mean order value (the AOV guardrail)
  const aovSe = Math.sqrt(c.order_value_sd ** 2 / c.orders + t.order_value_sd ** 2 / t.orders);
  const n = c.sessions + t.sessions, chi = ((c.sessions - n / 2) ** 2 + (t.sessions - n / 2) ** 2) / (n / 2);
  const srmP = 2 * (1 - phi(Math.sqrt(chi)));
  const needed = sampleSize(c[meta.primary] / c.sessions, meta.mde);
  return { key, ...meta, control: c, treatment: t, primaryResult: prim, ordersResult: orders,
    aov: { control: Math.round(aovC), treatment: Math.round(aovT), changePct: r(100 * (aovT - aovC) / aovC, 1),
      ciLowPct: r(100 * (aovT - aovC - 1.96 * aovSe) / aovC, 1), ciHighPct: r(100 * (aovT - aovC + 1.96 * aovSe) / aovC, 1),
      guardrailPct: -3, breached: (aovT - aovC) / aovC < -0.03 },
    rpv: { control: r(c.revenue / c.sessions), treatment: r(t.revenue / t.sessions) },
    srm: { chi2: r(chi, 3), p: r(srmP, 3), ok: srmP > 0.01 },
    power: { mdeRel: meta.mde, neededPerArm: needed, havePerArm: Math.min(c.sessions, t.sessions),
      weeksRun: 3, weeksNeeded: r(3 * needed / Math.min(c.sessions, t.sessions), 1) } };
});

const ov = q.experiment_overlap;
const ovTotal = ov.reduce((a, x) => a + x.users, 0);
const overlap = { cells: ov.map((x) => ({ ...x, pct: r(100 * x.users / ovTotal, 1) })), users: ovTotal,
  sameArmPct: r(100 * ov.filter((x) => x.sticky === x.one_page).reduce((a, x) => a + x.users, 0) / ovTotal, 1) };

// release impact: diff-in-diff on checkout -> paid
const rs = (plat, per) => q.release_sessions.find((x) => x.platform === plat && x.period === per);
const rate = (x) => x.orders / x.checkouts;
const iosPre = rs('ios_app', 'pre'), iosPost = rs('ios_app', 'post'), andPre = rs('android_app', 'pre'), andPost = rs('android_app', 'post');
const did = (rate(iosPost) - rate(iosPre)) - (rate(andPost) - rate(andPre));
const postDays = DAYS - (RELEASE_DAY + 6);
const iosLostOrdersPerMonth = -did * iosPost.checkouts / postDays * 30;
const aovAll = q.reconciliation[0].raw_revenue / q.reconciliation[0].raw_orders;
const failRate = (plat, from, to) => {
  const rows = q.release_impact.filter((x) => x.platform === plat && x.day >= from && x.day < to);
  const a = rows.reduce((s, x) => s + x.attempts, 0), f = rows.reduce((s, x) => s + x.failures, 0);
  return r(100 * f / a, 1);
};
const release = {
  date: '2026-10-10', version: 'iOS app 4.2.0',
  iosFailPre: failRate('ios_app', '2026-08-24', '2026-10-10'), iosFailPost: failRate('ios_app', '2026-10-16', '2026-12-01'),
  andFailPre: failRate('android_app', '2026-08-24', '2026-10-10'), andFailPost: failRate('android_app', '2026-10-16', '2026-12-01'),
  iosPaidPre: r(100 * rate(iosPre), 1), iosPaidPost: r(100 * rate(iosPost), 1),
  andPaidPre: r(100 * rate(andPre), 1), andPaidPost: r(100 * rate(andPost), 1),
  didPts: r(100 * did, 1), lostOrdersPerMonth: Math.round(iosLostOrdersPerMonth),
};

// mix shift: blended CVR change split into mix vs rate
const per = (p) => q.mix_shift.filter((x) => x.period === p);
const A = per('first_4_weeks'), B = per('last_4_weeks');
const tot = (rows, k) => rows.reduce((s, x) => s + x[k], 0);
const cvrA = tot(A, 'orders') / tot(A, 'sessions'), cvrB = tot(B, 'orders') / tot(B, 'sessions');
// counterfactual: last-4-week rates at first-4-week mix
const cf = A.reduce((s, a) => { const b = B.find((x) => x.utm_source === a.utm_source); return s + (a.sessions / tot(A, 'sessions')) * (b.orders / b.sessions); }, 0);
const mix = {
  cvrFirst: r(100 * cvrA), cvrLast: r(100 * cvrB), cvrLastAtOldMix: r(100 * cf),
  changePts: r(100 * (cvrB - cvrA)), fromMixPts: r(100 * (cvrB - cf)), fromRatesPts: r(100 * (cf - cvrA)),
  bySource: A.map((a) => { const b = B.find((x) => x.utm_source === a.utm_source); return {
    source: a.utm_source, shareFirst: r(100 * a.sessions / tot(A, 'sessions'), 1), shareLast: r(100 * b.sessions / tot(B, 'sessions'), 1),
    cvrFirst: r(100 * a.orders / a.sessions), cvrLast: r(100 * b.orders / b.sessions) }; }),
};

// headline: traffic vs orders, first 4 weeks vs last 4 weeks
const wk = q.weekly_kpis;
const sum = (rows, k) => rows.reduce((s, x) => s + x[k], 0);
const first4 = wk.slice(0, 4), last4 = wk.slice(-4);
const headline = {
  sessionsGrowthPct: r(100 * (sum(last4, 'sessions') / sum(first4, 'sessions') - 1), 1),
  ordersGrowthPct: r(100 * (sum(last4, 'orders') / sum(first4, 'orders') - 1), 1),
  revenueGrowthPct: r(100 * (sum(last4, 'revenue') / sum(first4, 'revenue') - 1), 1),
  cvrFirst: r(100 * sum(first4, 'orders') / sum(first4, 'sessions')), cvrLast: r(100 * sum(last4, 'orders') / sum(last4, 'sessions')),
};

// leaks + ₹ impact model (monthly, at the 90-day run rate; a model, not a result)
const perMonth = (x) => x / DAYS * 30;
const cart = Object.fromEntries(q.cart_by_category.map((x) => [x.cart_type, x]));
const mg = cart['mass gainer in cart'], oc = cart['other carts'];
const mgGapHalf = (oc.checkouts / oc.carts - mg.checkouts / mg.carts) / 2;
const mgExtraOrders = perMonth(mg.carts * mgGapHalf * (mg.orders / mg.checkouts));
const cp = Object.fromEntries(q.coupon_friction.map((x) => [x.coupon_outcome, x]));
const cf2 = cp['coupon failed'], nc = cp['no coupon'];
const couponExtraOrders = perMonth(cf2.checkouts * (nc.orders / nc.checkouts - cf2.orders / cf2.checkouts) / 2);
const so = Object.fromEntries(q.search_outcomes.map((x) => [x.search_outcome, x]));
const zr = so['zero results'], fr = so['found results'];
const searchExtraOrders = perMonth(zr.sessions * (fr.orders / fr.sessions - zr.orders / zr.sessions) / 2);
const impact = [
  { key: 'ios_payments', title: 'iOS 4.2 broke UPI payments', ordersPerMonth: Math.round(iosLostOrdersPerMonth), assumption: 'Recover the full difference-in-differences gap vs Android once the UPI intent bug is fixed.' },
  { key: 'mass_gainer', title: 'Heavy-item delivery fee surprises mass gainer carts', ordersPerMonth: Math.round(mgExtraOrders), assumption: 'Close half the cart → checkout gap to other carts by showing the fee on the product page (or absorbing it).' },
  { key: 'coupon', title: 'Coupons fail at checkout', ordersPerMonth: Math.round(couponExtraOrders), assumption: 'Half the payment-rate gap closes when the minimum cart value is shown before the code is typed.' },
  { key: 'search', title: 'One in seven searches finds nothing', ordersPerMonth: Math.round(searchExtraOrders), assumption: 'Synonyms and spell-correction bring half of zero-result sessions to the found-results conversion rate.' },
].map((x) => ({ ...x, revenuePerMonth: Math.round(x.ordersPerMonth * aovAll) }));

// cohort matrix
const cohorts = {};
for (const x of q.cohort_retention) (cohorts[x.cohort] ||= {})[x.week_n] = x.users;
const cohortMatrix = Object.entries(cohorts).map(([cohort, w]) => ({ cohort, size: w[0], weeks: Object.keys(w).map(Number).sort((a, b) => a - b).map((n) => ({ n, pct: r(100 * w[n] / w[0], 1) })) }));

// clickmap
const pdp = q.pdp_sessions[0];
const clickmap = q.pdp_clickmap.map((x) => ({ ...x, pct: r(100 * x.sessions / pdp.pdp_sessions, 1), atcPct: r(100 * x.carted / x.sessions, 1) }));

// reconciliation
const rec = q.reconciliation[0];
const checks = [
  { name: 'Sessions in funnel = distinct session_id in events', ok: rec.raw_sessions === rec.funnel_sessions, detail: `${rec.funnel_sessions} = ${rec.raw_sessions}` },
  { name: 'Orders in funnel = payment_completed events', ok: rec.raw_orders === rec.funnel_orders, detail: `${rec.funnel_orders} = ${rec.raw_orders}` },
  { name: 'Revenue in funnel = sum of payment_completed revenue', ok: rec.raw_revenue === rec.funnel_revenue, detail: `₹${rec.funnel_revenue} = ₹${rec.raw_revenue}` },
  { name: 'No order skips a funnel step', ok: rec.orders_skipping_steps === 0, detail: `${rec.orders_skipping_steps} orders` },
  { name: 'Strict funnel "Paid" = all orders', ok: q.funnel_overall.at(-1).sessions === rec.raw_orders, detail: `${q.funnel_overall.at(-1).sessions} = ${rec.raw_orders}` },
];

// ---------- 5. CRM: campaign lift, unit economics, growth baseline ----------
const ue = catalog.unitEconomics;
const gm = ue.grossMarginPct / 100, fee = ue.paymentFeePct / 100;
// contribution of a group of orders: net revenue - COGS on list price - payment fees - fulfilment
const contribution = (revenue, discount, orders) => revenue - (revenue + discount) * (1 - gm) - revenue * fee - orders * ue.fulfilmentPerOrder;
const MSG_COST = { whatsapp: 0.8, email: 0.03 };
const CAMPAIGN_META = {
  welcome_series: { name: 'Welcome series', stage: 'New customers', trigger: 'First order placed', timing: 'Email 2 days after the first order', channel: 'Email' },
  replenishment_reminder: { name: 'Replenishment reminder', stage: 'Repeat (1–2 orders)', trigger: 'Product cycle minus 3 days', timing: 'WhatsApp 3 days before the pack runs out', channel: 'WhatsApp' },
  winback_email: { name: 'Win-back', stage: 'Inactive', trigger: '60 days since last order', timing: 'Email on day 60', channel: 'Email' },
  vip_discount: { name: 'VIP 15% code', stage: 'High-value (3+ orders)', trigger: 'Product cycle minus 3 days', timing: 'WhatsApp 3 days before run-out, code valid 14 days', channel: 'WhatsApp' },
};
const campaigns = Object.entries(CAMPAIGN_META).map(([key, meta]) => {
  const t = q.campaign_results.find((x) => x.campaign === key && x.variant === 'treatment');
  const h = q.campaign_results.find((x) => x.campaign === key && x.variant === 'holdout');
  const conv = twoProp(h.converted_14d, h.recipients, t.converted_14d, t.recipients);
  const conv30 = twoProp(h.converted_30d, h.recipients, t.converted_30d, t.recipients);
  const rprT = t.revenue_14d / t.recipients, rprH = h.revenue_14d / h.recipients;
  const rprSe = Math.sqrt(t.revenue_sd ** 2 / t.recipients + h.revenue_sd ** 2 / h.recipients);
  const msgCost = t.delivered * MSG_COST[t.channel];
  const incOrders = (t.converted_14d / t.recipients - h.converted_14d / h.recipients) * t.recipients;
  const incRevenue = (rprT - rprH) * t.recipients;
  // contribution per recipient in each arm over 30 days (conservative: nets out pull-forward),
  // then scale the difference to the treated group
  const cT = contribution(t.revenue_30d, t.discount_30d, t.orders_30d) / t.recipients;
  const cH = contribution(h.revenue_30d, h.discount_30d, h.orders_30d) / h.recipients;
  const incContribution = (cT - cH) * t.recipients - msgCost;
  return { key, ...meta, treatment: t, holdout: h, conv, conv30,
    rpr: { treatment: r(rprT), holdout: r(rprH), diff: r(rprT - rprH), ciLow: r(rprT - rprH - 1.96 * rprSe), ciHigh: r(rprT - rprH + 1.96 * rprSe) },
    funnel: { deliveredPct: r(100 * t.delivered / t.recipients, 1), readPct: r(100 * t.read / t.recipients, 1), clickedPct: r(100 * t.clicked / t.recipients, 1) },
    anywayPct: r(100 * (h.converted_14d / h.recipients) / (t.converted_14d / t.recipients), 0),
    incOrders: Math.round(incOrders), incRevenue: Math.round(incRevenue), msgCost: Math.round(msgCost), discountGiven: Math.round(t.discount_30d),
    incContribution: Math.round(incContribution), roi: msgCost > 0 ? r(incContribution / msgCost, 1) : null };
});

// unit economics by acquisition source (inside the 13-week window)
const weeks = DAYS / 7;
const srcSessions = Object.fromEntries(q.funnel_by_segment.filter((x) => x.dimension === 'source').map((x) => [x.segment, x.sessions]));
const spend = Object.fromEntries(Object.keys(srcSessions).map((k) => [k, Math.round(srcSessions[k] * (ue.cpc[k] ?? 0) + (k === 'influencer' ? ue.influencerSpendPerWeek * weeks : 0))]));
const newCust = Object.fromEntries(q.new_customers_by_source.map((x) => [x.acquisition_source, x.new_customers]));
const aov1 = q.crm_overview[0].aov_first;
const unitEconomics = q.clv_by_source.map((c) => {
  const cac = spend[c.acquisition_source] ? spend[c.acquisition_source] / (newCust[c.acquisition_source] || 1) : 0;
  const ltv180 = c.revenue_180d - c.revenue_180d * (1 - gm) - c.revenue_180d * fee - c.orders_180d * ue.fulfilmentPerOrder;
  return { source: c.acquisition_source, customers: c.customers, newCustomers: newCust[c.acquisition_source] ?? 0, spend: spend[c.acquisition_source] ?? 0,
    cac: Math.round(cac), revenue180: c.revenue_180d, orders180: c.orders_180d, contribution180: Math.round(ltv180),
    ltvToCac: cac ? r(ltv180 / cac, 2) : null, paybackMonths: cac ? r(cac / (ltv180 / 6), 1) : null };
});
const paidSpend = Object.values(spend).reduce((a, b) => a + b, 0);
const paidNew = ['meta_ads', 'google_ads', 'influencer'].reduce((a, k) => a + (newCust[k] ?? 0), 0);
const rr = q.run_rate[0];
const growthBase = {
  sessions28: rr.sessions, firstOrders28: rr.first_orders, repeatOrders28: rr.repeat_orders,
  firstRevenue28: rr.first_revenue, repeatRevenue28: rr.repeat_revenue,
  monthlyRevenue: Math.round((rr.first_revenue + rr.repeat_revenue) / 28 * 30),
  cvrNew: r(100 * rr.first_orders / rr.sessions, 2), aovFirst: Math.round(rr.first_revenue / rr.first_orders), aovRepeat: Math.round(rr.repeat_revenue / rr.repeat_orders),
  grossMarginPct: ue.grossMarginPct, fulfilment: ue.fulfilmentPerOrder, paymentFeePct: ue.paymentFeePct,
  marketingSpendMonthly: Math.round(paidSpend / DAYS * 30), blendedPaidCac: Math.round(paidSpend / Math.max(1, paidNew)),
};
const crec = q.crm_reconciliation[0];
const crmChecks = [
  { name: 'Window orders = payment_completed events', ok: crec.window_orders === crec.payment_events, detail: `${crec.window_orders} = ${crec.payment_events}` },
  { name: 'Every window order matches its event (id and revenue)', ok: crec.matched === crec.window_orders, detail: `${crec.matched} of ${crec.window_orders}` },
  { name: 'Customers table = distinct ordering customers', ok: crec.customers === crec.order_customers, detail: `${crec.customers} = ${crec.order_customers}` },
];

const results = {
  generatedAt: new Date().toISOString(),
  period: { start: new Date(START).toISOString().slice(0, 10), end: new Date(START + (DAYS - 1) * 86400000).toISOString().slice(0, 10), days: DAYS },
  experimentWindow: { start: new Date(START + EXP_START_DAY * 86400000).toISOString().slice(0, 10) },
  totals: { users: rec.users, sessions: rec.raw_sessions, events: rec.events, orders: rec.raw_orders, revenue: rec.raw_revenue, aov: Math.round(aovAll) },
  headline, mix, release, experiments, overlap, impact, cohortMatrix, clickmap, pdp, checks: [...checks, ...crmChecks],
  crm: { overview: q.crm_overview[0], campaigns, unitEconomics, spend, growthBase, campaignStartDay: '2026-04-26', holdoutPct: 20 },
  q, sql: sqlText,
};
writeFileSync(join(root, 'lib/results.json'), JSON.stringify(results));
console.log(`wrote lib/results.json (${Date.now() - t0} ms)`);
console.log('headline', headline);
console.log('mix', { ...mix, bySource: undefined });
console.log('release', release);
for (const e of experiments) console.log(e.key, e.primaryResult, 'orders', e.ordersResult, 'aov', e.aov, 'srm', e.srm, 'power', e.power);
console.log('overlap', overlap);
console.log('crm', q.crm_overview[0]);
for (const c of campaigns) console.log(c.key, 'conv', c.conv.pc, '->', c.conv.pt, 'rel', c.conv.relLiftPct, 'p', c.conv.p, '30d rel', c.conv30.relLiftPct, 'anyway', c.anywayPct, 'incOrders', c.incOrders, 'incContribution', c.incContribution, 'msg', c.msgCost, 'disc', c.discountGiven);
console.log('ue', unitEconomics.map((u) => [u.source, u.cac, u.contribution180, u.ltvToCac, u.paybackMonths].join(' ')));
console.log('growthBase', growthBase);
for (const c of [...checks, ...crmChecks]) console.log(c.ok ? 'PASS' : 'FAIL', c.name, c.detail);

if (args.has('--csv')) {
  mkdirSync(join(root, 'data'), { recursive: true });
  const csv = (rows, cols) => [cols.join(','), ...rows.map((x) => cols.map((c) => {
    const v = c === 'event_time' ? new Date(x[c]).toISOString() : x[c];
    return v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v;
  }).join(','))].join('\n');
  writeFileSync(join(root, 'data/users.csv'), csv(users, ucols));
  writeFileSync(join(root, 'data/events.csv'), csv(events, ecols));
  console.log('wrote data/users.csv, data/events.csv');
}
if (args.has('--check') && [...checks, ...crmChecks].some((c) => !c.ok)) { console.error('reconciliation failed'); process.exit(1); }
