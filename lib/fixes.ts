// The six customer-facing fixes shipped in the live store, each behind a flag.
// Shared by the store components (flag keys), /api/fixes (metric events) and /fixes.

export interface Fix {
  key: string;            // feature flag / experiment key
  title: string;
  problem: string;        // the customer's pain, in their words
  evidence: string;       // pointer to the synthetic finding
  evidenceLink: string;
  shipped: string;        // what changed in the store
  exposure: string;       // when experiment_viewed fires
  metric: string;         // event that counts as success after exposure
  metricLabel: string;
  guardrail: string;
  baselinePct: number;    // expected control rate (from the synthetic analysis) for the sample-size maths
  mdeRel: number;         // smallest relative lift worth detecting
  tryIt: string;          // store path to see it
}

export const FIXES: Fix[] = [
  {
    key: 'fix_payment_retry', title: 'One-tap payment retry',
    problem: '"My UPI payment failed and I didn\'t know if I was charged, so I gave up."',
    evidence: 'iOS UPI payment failures jumped from about 2% to 18% after the 4.2 release', evidenceLink: '/insights#ios_payments',
    shipped: 'After a failed payment: a clear "you were not charged" message, the cart kept, and one-tap retry by UPI ID or cash on delivery.',
    exposure: 'payment fails at checkout', metric: 'payment_completed', metricLabel: 'Paid after a failed attempt',
    guardrail: 'COD share of orders (COD has higher return-to-origin)', baselinePct: 42, mdeRel: 0.25, tryIt: '/store/checkout',
  },
  {
    key: 'fix_fee_on_pdp', title: 'Delivery fee shown up front',
    problem: '"The price jumped by ₹149 in the cart. Felt like a hidden charge."',
    evidence: 'Mass gainer carts reach checkout about half as often as other carts', evidenceLink: '/insights#mass_gainer',
    shipped: 'The 3 kg+ delivery fee is shown under the price on the product page, so the cart holds no surprise.',
    exposure: 'a 3 kg+ product page is viewed', metric: 'checkout_started', metricLabel: 'Reached checkout',
    guardrail: 'Product page → add-to-cart rate (the fee is now visible earlier)', baselinePct: 9, mdeRel: 0.2, tryIt: '/store/p/mass-gainer-chocolate-3kg',
  },
  {
    key: 'fix_coupon_hints', title: 'Coupons that explain themselves',
    problem: '"I typed the code from the ad and it said not valid. Why advertise it then?"',
    evidence: 'Payment completion falls by more than a third after a failed coupon', evidenceLink: '/insights#coupon',
    shipped: 'The cart lists the codes that work now, and for the ones that don\'t yet, exactly how much more to add.',
    exposure: 'the cart is viewed with items', metric: 'payment_completed', metricLabel: 'Cart → paid',
    guardrail: 'Discount as % of revenue', baselinePct: 40, mdeRel: 0.1, tryIt: '/store/cart',
  },
  {
    key: 'fix_search_synonyms', title: 'Search that understands shoppers',
    problem: '"I searched weight gainer and it said no products. You sell mass gainer!"',
    evidence: 'About 1 in 7 searches return nothing', evidenceLink: '/insights#search',
    shipped: 'Synonyms (weight gainer → mass gainer), typo tolerance (protien), Hinglish intent (sasta → sort by price), and a "did you mean" instead of a dead end.',
    exposure: 'a search is submitted', metric: 'product_viewed', metricLabel: 'Viewed a product after searching',
    guardrail: 'Search → add-to-cart (relevance, not just more results)', baselinePct: 70, mdeRel: 0.08, tryIt: '/store/search?q=weight%20gainer',
  },
  {
    key: 'fix_lab_report', title: 'Lab report you can actually open',
    problem: '"It says lab tested. Where is the report? I clicked and nothing happened."',
    evidence: '~1 in 5 product-page visitors click the dead lab-report badge', evidenceLink: '/insights#clickmap',
    shipped: 'The badge opens the batch lab report: protein per serving tested vs label, heavy metals, and the testing lab.',
    exposure: 'a product page is viewed', metric: 'add_to_cart', metricLabel: 'Added to cart',
    guardrail: 'Time to add-to-cart (no added friction)', baselinePct: 28, mdeRel: 0.08, tryIt: '/store/p/whey-protein-chocolate-1kg',
  },
  {
    key: 'fix_replenish_optin', title: 'Remind me before I run out',
    problem: '"I ran out of creatine and just bought whatever the gym shop had."',
    evidence: 'The replenishment reminder lifts 14-day reorders; 75% of customers never place a second order', evidenceLink: '/journeys',
    shipped: 'On the order confirmation page: an opt-in reminder timed to the product\'s run-out date (cycle − 3 days), by email or WhatsApp, with explicit consent.',
    exposure: 'the order confirmation page is shown', metric: 'replenish_optin', metricLabel: 'Opted in to a reminder',
    guardrail: 'Unsubscribe / opt-out rate once reminders send', baselinePct: 0, mdeRel: 0, tryIt: '/store',
  },
];

export const fixByKey = (k: string) => FIXES.find((f) => f.key === k)!;
