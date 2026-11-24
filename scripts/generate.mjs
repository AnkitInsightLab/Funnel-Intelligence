// Synthetic event history for the fictional Halden Nutrition store.
// Deterministic (seeded RNG) so every build produces the same numbers.
//
// Planted problems — the analysis has to find these from the events alone:
//  1. iOS app 4.2 (released 10 Oct) breaks UPI payments: payment_failed with
//     error_code UPI_INTENT_TIMEOUT jumps on iOS only.
//  2. Mass gainer carts abandon before checkout: a heavy-item delivery fee is
//     shown for the first time in the cart.
//  3. Coupon failures (mostly MIN_CART_VALUE) cut payment completion.
//  4. ~1 in 7 searches return zero results; those sessions rarely buy.
//  5. Meta ads traffic share grows over the period and lands on the home page
//     with low intent, so traffic grows faster than orders (mix shift).
// Plus two experiments (2 Nov - 22 Nov): sticky add-to-cart on mobile PDP
// (real effect, but it skips the cross-sell, so AOV drops) and one-page checkout
// (small effect, underpowered). Planted bug: both experiments bucket users with the
// same FNV hash whose low bit is the parity of the id, so the two assignments are
// perfectly correlated. The SRM check on one-page checkout is how it gets caught.
// Plus PDP click and scroll behaviour, with a dead-click on the lab-report badge.

import catalog from '../lib/catalog.json' with { type: 'json' };

export const START = Date.UTC(2026, 7, 24); // Mon 24 Aug 2026
export const DAYS = 91;                    // 13 full weeks, to Sun 22 Nov 2026
export const RELEASE_DAY = 47;             // Sat 10 Oct 2026: iOS app 4.2
export const EXP_START_DAY = 70;           // Mon 2 Nov 2026
const DAY_MS = 86400000;
const BURN_IN_START = -274;  // 9 months of order history before the 13-week event window
export const CAMP_START_DAY = -120; // Wed 26 Apr 2026: lifecycle campaigns go live
const CAMP_LAST_SEND = DAYS - 31;   // sends need 30 days of follow-up to be measured
export const HOLDOUT = 0.2;
const CHANNEL = {
  whatsapp: { delivered: 0.95, read: 0.72, clicked: 0.21 },
  email: { delivered: 0.97, read: 0.24, clicked: 0.035 },
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generate({ users: N = 112000, seed = 20261124 } = {}) {
  const rng = mulberry32(seed);
  const chance = (p) => rng() < p;
  const pickW = (pairs) => {
    let r = rng() * pairs.reduce((s, [, w]) => s + w, 0);
    for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; }
    return pairs[pairs.length - 1][0];
  };
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

  const products = catalog.products;
  const byCat = {};
  for (const p of products) (byCat[p.category] ||= []).push(p);

  const QUERIES = [
    ['whey protein', 30, 2], ['creatine', 18, 1], ['mass gainer', 14, 2], ['multivitamin', 10, 1],
    ['peanut butter', 9, 1], ['isolate', 8, 1], ['pre workout', 6, 1], ['fish oil', 6, 1],
    ['ashwagandha', 4, 1],
    // zero-result queries: synonyms, Hinglish and items not stocked
    ['protein powder sasta', 3, 0], ['whey isolate chocolate 2kg', 3, 0], ['creatine gummies', 2.5, 0],
    ['biotin', 2.5, 0], ['protien', 2, 0], ['weight gainer', 2.5, 0], ['plant protein', 2, 0],
  ];
  const queryCat = { 'whey protein': 'whey', creatine: 'creatine', 'mass gainer': 'mass_gainer', multivitamin: 'vitamins',
    'peanut butter': 'peanut_butter', isolate: 'whey', 'pre workout': 'pre_workout', 'fish oil': 'vitamins', ashwagandha: 'vitamins' };

  const users = [];
  const events = [];
  const orders = [];
  const customers = [];
  const sends = [];
  // independent, salted bucketing for CRM holdouts (avalanche mix, unlike the planted bug)
  const holdout = (s) => { let h = hash(s); h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296 < HOLDOUT; };
  const dayTs = (d, hour = 11) => START + d * DAY_MS + (hour - 5.5) * 3600000;
  let orderSeq = 100000;

  for (let u = 0; u < N; u++) {
    // traffic grows ~80% over the quarter
    // traffic grows ~2.4x across the quarter; users from a 35-day burn-in before the
    // window keep returning, so the first weeks are not artificially "all new"
    let day;
    do { day = BURN_IN_START + Math.floor(rng() * (DAYS - BURN_IN_START)); } while (rng() > (1 + 1.4 * Math.max(0, day) / (DAYS - 1)) / 2.4);
    const t = Math.max(0, day) / (DAYS - 1);
    const source = pickW([
      ['organic', 0.30 - 0.08 * t], ['google_ads', 0.22 - 0.04 * t], ['meta_ads', 0.12 + 0.32 * t],
      ['influencer', 0.08], ['email', 0.07 - 0.02 * t], ['direct', 0.20 - 0.06 * t],
    ]);
    const platform = pickW([['android_app', 0.45], ['ios_app', 0.22], ['web', 0.33]]);
    const tier = pickW([['tier_1', 0.45], ['tier_2', 0.35], ['tier_3', 0.20]]);
    const userId = 'u_' + (100000 + u);
    if (day >= 0) users.push({ user_id: userId, first_seen: new Date(START + day * DAY_MS).toISOString().slice(0, 10), acquisition_source: source, platform, city_tier: tier });

    // preferred category drives what they look at
    const pref = pickW([['whey', 34], ['mass_gainer', 14], ['creatine', 18], ['vitamins', 16], ['pre_workout', 7], ['peanut_butter', 11]]);
    // BUG (deliberate, see header): low bit of FNV-1a = parity of the string, and the
    // two salts differ by a constant, so these assignments move together.
    const variantSticky = hash(userId + 'sticky') % 2 ? 'treatment' : 'control';
    const variantOnePage = hash(userId + 'onepage') % 2 ? 'treatment' : 'control';
    // iOS users update to 4.2 within a few days of release
    const updateLag = Math.floor(rng() * 6);

    let sDay = day;
    let sNo = 0;
    let purchases = 0;
    let lastOrderDay = null;
    let intent = null;        // { product, source } when the next session is a replenishment visit
    let discountUntil = -Infinity; // VIP code valid until this day
    const sendCampaign = (campaign, d, channel) => {
      const isHoldout = holdout(userId + ':' + campaign + ':' + d);
      const c = CHANNEL[channel];
      const delivered = !isHoldout && chance(c.delivered);
      const read = delivered && chance(c.read / c.delivered);
      const clicked = read && chance(c.clicked / c.read);
      sends.push({ campaign, user_id: userId, send_time: dayTs(d, 11), variant: isHoldout ? 'holdout' : 'treatment', channel, delivered, read, clicked });
      return { treated: !isHoldout, clicked };
    };
    while (sDay < DAYS) {
      sNo++;
      const sessionId = `${userId}_s${sNo}`;
      const hour = pickW([[9, 1], [12, 1.4], [14, 1], [18, 1.6], [21, 2.2], [22, 1.2]]);
      // IST clock time; the 50-minute cap keeps 22:xx sessions inside the same IST day
      let ts = START + sDay * DAY_MS + (hour - 5.5) * 3600000 + Math.floor(rng() * 3000000);
      const visit = intent; intent = null;
      const sessSource = visit?.source ?? (sNo === 1 ? source : pickW([['direct', 0.45], ['email', 0.25], ['organic', 0.2], [source, 0.1]]));
      const returning = sNo > 1;
      const appVersion = platform === 'ios_app' ? (sDay >= RELEASE_DAY + updateLag ? '4.2.0' : '4.1.3')
        : platform === 'android_app' ? (sDay >= 41 ? '6.8.1' : '6.7.4') : null;
      const iosBroken = appVersion === '4.2.0';
      const inExp = sDay >= EXP_START_DAY;
      const mobile = platform !== 'web';

      const base = { user_id: userId, session_id: sessionId, platform, app_version: appVersion, utm_source: sessSource, is_returning: returning };
      const ev = (name, extra = {}) => { ts += 5000 + Math.floor(rng() * 40000); events.push({ ...base, event_time: ts, event_name: name, ...extra }); };

      // landing
      const lowIntent = sessSource === 'meta_ads' && !returning;
      const landPdp = visit ? true : chance({ google_ads: 0.7, organic: 0.5, meta_ads: 0.15, influencer: 0.55, email: 0.6, direct: 0.2 }[sessSource] ?? 0.3);
      const landCat = chance(0.85) ? pref : pick(Object.keys(byCat));
      let product = visit ? visit.product : pick(byCat[landCat]);
      ev('page_viewed', { page_type: landPdp ? 'product' : 'home' });

      let viewed = landPdp;
      let searched = false;
      if (!visit && chance(landPdp ? 0.12 : 0.38)) {
        searched = true;
        const [q, , n] = pickW(QUERIES.map((x) => [x, x[1]]));
        const results = n === 0 ? 0 : 3 + Math.floor(rng() * 9);
        ev('search_performed', { page_type: 'search', query: q, results_count: results });
        if (results === 0) {
          if (chance(0.22)) { viewed = true; }
        } else {
          product = pick(byCat[queryCat[q]]);
          if (chance(0.82)) viewed = true;
        }
      }
      if (!viewed && chance(lowIntent ? 0.42 : 0.66)) viewed = true;
      if (!viewed) { sDay = nextSession(); continue; }

      ev('product_viewed', { page_type: 'product', category: product.category, product_id: product.id, price: product.price });

      // experiment 1: sticky add-to-cart bar on mobile PDP
      let stickyLift = 1;
      if (inExp && mobile) {
        ev('experiment_viewed', { page_type: 'product', experiment: 'pdp_sticky_atc', variant: variantSticky });
        if (variantSticky === 'treatment') stickyLift = 1.2;
      }

      // PDP engagement: scroll depth and clicks (clickmap)
      const depth = pickW([[25, 0.24], [50, 0.27], [75, 0.29], [100, 0.20]]);
      for (const d of [25, 50, 75, 100]) if (d <= depth) ev('scroll_depth', { page_type: 'product', product_id: product.id, scroll_pct: d });
      const clicked = {};
      for (const [el, p, dead] of [['flavour_selector', 0.36], ['size_selector', 0.29], ['reviews_tab', 0.21], ['lab_report_badge', 0.19, true],
        ['nutrition_label_image', 0.16, true], ['delivery_pincode', 0.13], ['share_button', 0.03]]) {
        if (chance(p)) { clicked[el] = true; ev('element_clicked', { page_type: 'product', product_id: product.id, element: el, is_dead_click: !!dead }); }
      }

      let pAtc = visit ? 0.72 : (lowIntent ? 0.14 : 0.25) + (returning ? 0.07 : 0) + (clicked.reviews_tab ? 0.05 : 0) + (clicked.lab_report_badge ? 0.04 : 0);
      pAtc *= stickyLift;
      if (searched && depth >= 50) pAtc += 0.02;
      if (!chance(pAtc)) { sDay = nextSession(); continue; }

      const cart = [{ p: product, q: chance(0.12) ? 2 : 1 }];
      ev('add_to_cart', { page_type: 'product', category: product.category, product_id: product.id, price: product.price, quantity: cart[0].q });
      // the sticky bar adds straight to cart and skips the "goes well with" module
      if (chance(stickyLift > 1 ? 0.06 : 0.35)) {
        const add = pick(products.filter((p) => p.price < 1600 && p.id !== product.id));
        cart.push({ p: add, q: 1 });
        ev('add_to_cart', { page_type: 'product', category: add.category, product_id: add.id, price: add.price, quantity: 1 });
      }
      const heavy = cart.some((c) => c.p.weightKg >= catalog.heavyShippingFee.minWeightKg);
      ev('page_viewed', { page_type: 'cart' });

      if (!chance(visit ? 0.86 : heavy ? 0.31 : 0.60)) { sDay = nextSession(); continue; }
      const gross = cart.reduce((s, c) => s + c.p.price * c.q, 0);
      const vip = sDay <= discountUntil;
      const value = vip ? Math.round(gross * 0.85) : gross;
      ev('checkout_started', { page_type: 'checkout', revenue: value });

      // experiment 2: one-page checkout on web + Android
      let onePageLift = 1;
      if (inExp && platform !== 'ios_app') {
        ev('experiment_viewed', { page_type: 'checkout', experiment: 'one_page_checkout', variant: variantOnePage });
        if (variantOnePage === 'treatment') onePageLift = 1.035;
      }

      let couponFailed = false;
      if (chance(0.31)) {
        const code = pick(['FIRST10', 'FIT15', 'DIWALI20', 'GAINZ']);
        if (chance(0.36)) {
          couponFailed = true;
          ev('coupon_failed', { page_type: 'checkout', coupon_code: code, error_code: chance(0.72) ? 'MIN_CART_VALUE' : 'COUPON_EXPIRED' });
        } else ev('coupon_applied', { page_type: 'checkout', coupon_code: code });
      }
      if (!chance(Math.min(0.97, (couponFailed ? 0.47 : 0.80) * onePageLift))) { sDay = nextSession(); continue; }

      const failP = iosBroken ? 0.26 : platform === 'ios_app' ? 0.045 : 0.05;
      let paid = false;
      for (let attempt = 1; attempt <= 2 && !paid; attempt++) {
        const method = pickW([['upi', 0.62], ['card', 0.18], ['cod', 0.20]]);
        ev('payment_attempted', { page_type: 'checkout', revenue: value });
        const f = method === 'cod' ? 0.01 : method === 'upi' ? failP : 0.05;
        if (chance(f)) {
          ev('payment_failed', { page_type: 'checkout', error_code: method === 'upi' ? (iosBroken ? 'UPI_INTENT_TIMEOUT' : pick(['UPI_DECLINED', 'UPI_INTENT_TIMEOUT', 'BANK_DOWN'])) : 'CARD_DECLINED' });
          if (!chance(0.42)) break;
        } else paid = true;
      }
      let lastCart = null;
      if (paid) {
        const oid = 'HN' + orderSeq++;
        ev('payment_completed', { page_type: 'confirmation', order_id: oid, revenue: value });
        purchases++;
        if (purchases === 1) customers.push({ user_id: userId, acquisition_source: source, platform, city_tier: tier, first_order_date: new Date(START + sDay * DAY_MS).toISOString().slice(0, 10) });
        orders.push({ order_id: oid, user_id: userId, order_time: ts, revenue: value, discount: gross - value,
          items: cart.map((c) => ({ product_id: c.p.id, category: c.p.category, quantity: c.q, price: c.p.price })),
          utm_source: sessSource, platform, order_number: purchases });
        if (vip) discountUntil = -Infinity;
        lastOrderDay = sDay;
        lastCart = cart;
      }
      sDay = lastCart ? afterPurchase(lastCart) : nextSession();
    }

    // No purchase this session: browse again later, or (for past buyers) drift toward lapsing.
    function nextSession() {
      if (sNo >= 40) return DAYS;
      if (purchases > 0) {
        if (chance(0.22)) return sDay + 1 + Math.floor(-Math.log(1 - rng()) * 8);
        return lapse();
      }
      if (!chance(0.24)) return DAYS;
      return sDay + 1 + Math.floor(-Math.log(1 - rng()) * 7);
    }

    // After an order: replenishment intent around the product's cycle, plus the
    // lifecycle campaigns that fire on it (welcome, replenishment, VIP).
    function afterPurchase(cart) {
      const main = cart[0].p;
      const cycle = main.cycleDays;
      let pIntent = purchases === 1 ? 0.5 : purchases === 2 ? 0.64 : 0.74;
      let tight = false;
      let viaSource = null;
      // NEW customers: welcome series by email, 2 days after the first order
      if (purchases === 1 && sDay + 2 >= CAMP_START_DAY && sDay + 2 <= CAMP_LAST_SEND) {
        const r = sendCampaign('welcome_series', sDay + 2, 'email');
        if (r.treated) pIntent *= 1.12;
        if (r.clicked) viaSource = 'email';
      }
      const sendDay = sDay + cycle - 3;
      if (sendDay >= CAMP_START_DAY && sendDay <= CAMP_LAST_SEND) {
        if (purchases >= 3) {
          // HIGH-VALUE customers: 15% VIP code on WhatsApp. They were coming back anyway.
          const r = sendCampaign('vip_discount', sendDay, 'whatsapp');
          if (r.treated) { pIntent *= 1.02; discountUntil = sendDay + 14; }
          if (r.clicked) viaSource = 'whatsapp';
        } else {
          // REPEAT customers: replenishment reminder on WhatsApp just before they run out
          const r = sendCampaign('replenishment_reminder', sendDay, 'whatsapp');
          if (r.treated) { pIntent = Math.min(0.95, pIntent * 1.3); tight = true; }
          if (r.clicked) viaSource = 'whatsapp';
        }
      }
      if (sNo >= 40 || !chance(pIntent)) {
        if (chance(0.25)) return sDay + 1 + Math.floor(-Math.log(1 - rng()) * 10);
        return lapse();
      }
      const gap = Math.max(3, Math.round(cycle * (tight ? 0.82 + 0.28 * rng() : 0.75 + 0.6 * rng())));
      const product = chance(0.85) ? main : pick(byCat[main.category]);
      intent = { product, source: viaSource ?? pickW([['direct', 0.5], ['email', 0.2], ['organic', 0.2], ['whatsapp', 0.1]]) };
      return sDay + gap;
    }

    // INACTIVE customers: a win-back email 60 days after the last order.
    function lapse() {
      if (lastOrderDay === null) return DAYS;
      const d60 = lastOrderDay + 60;
      if (d60 >= DAYS) return DAYS;
      let pBack = 0.05;
      let viaSource = null;
      if (d60 >= CAMP_START_DAY && d60 <= CAMP_LAST_SEND) {
        const r = sendCampaign('winback_email', d60, 'email');
        if (r.treated) pBack = 0.068;
        if (r.clicked) viaSource = 'email';
      }
      if (!chance(pBack)) return DAYS;
      const main = pick(products.filter((p) => p.category === pref));
      intent = { product: main, source: viaSource ?? 'direct' };
      return d60 + 1 + Math.floor(rng() * 6);
    }
  }
  // sessions before the window only built up history (returning status, purchases)
  return { users, customers, orders, sends, events: events.filter((e) => e.event_time >= START) };
}
