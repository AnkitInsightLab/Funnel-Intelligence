// CRM journey definitions, message templates and the CleverTap / MoEngage mapping.
// The lifecycle journeys are simulated on synthetic data; the payload shapes follow the
// vendors' public upload APIs (CleverTap /1/upload, MoEngage Data API) and are what
// app/api/track sends when the matching keys are configured.

export interface Step { wait: string; channel: 'WhatsApp' | 'Email' | 'Push'; category: 'utility' | 'marketing'; template: string; preview: string; condition?: string }
export interface Journey { key: string; stage: string; audience: string; trigger: string; exit: string; cap: string; steps: Step[]; simulated: boolean }

export const LIFECYCLE: Journey[] = [
  { key: 'welcome_series', stage: 'New customers', audience: 'Placed a first order', trigger: 'payment_completed where order_number = 1', exit: 'Second order placed', cap: '1 series per customer', simulated: true,
    steps: [
      { wait: '2 days', channel: 'Email', category: 'marketing', template: 'welcome_how_to_use', preview: 'Subject: Getting the most from your {{product_name}}\n\nHi {{first_name}}, one scoop in 250 ml cold water, within 30 minutes of training. Here is your batch lab report: {{lab_report_link}}.' },
      { wait: '10 days', channel: 'Email', category: 'marketing', template: 'welcome_routine', condition: 'no second order', preview: 'Subject: Pair it with creatine?\n\nCustomers on {{product_name}} most often add Creatine Monohydrate. Here is why, with the research.' },
    ] },
  { key: 'replenishment_reminder', stage: 'Repeat (1–2 orders)', audience: 'Last order contains a product with a known cycle', trigger: 'last order date + product cycle − 3 days', exit: 'Any order placed', cap: '1 per pack', simulated: true,
    steps: [
      { wait: 'cycle − 3 days', channel: 'WhatsApp', category: 'marketing', template: 'replenish_soon', preview: 'Hi {{first_name}} 👋 your {{product_name}} should last about 3 more days. Reorder in one tap and it arrives before you run out: {{reorder_link}}' },
      { wait: '+4 days', channel: 'Push', category: 'marketing', template: 'replenish_push', condition: 'no order', preview: 'Running low on {{product_name}}? Your usual is one tap away.' },
    ] },
  { key: 'winback_email', stage: 'Inactive', audience: '60 days with no order', trigger: 'last order date + 60 days', exit: 'Any order placed', cap: '1 per 90 days', simulated: true,
    steps: [
      { wait: 'day 60', channel: 'Email', category: 'marketing', template: 'winback_whats_new', preview: 'Subject: New flavours, same lab-tested label\n\nIt has been a while, {{first_name}}. Two new flavours of {{last_category}} and a free shaker on orders over ₹1,999.' },
    ] },
  { key: 'vip_discount', stage: 'High-value (3+ orders)', audience: 'Three or more orders', trigger: 'last order date + product cycle − 3 days', exit: 'Any order placed', cap: '1 per pack', simulated: true,
    steps: [
      { wait: 'cycle − 3 days', channel: 'WhatsApp', category: 'marketing', template: 'vip_code', preview: '{{first_name}}, as one of our regulars here is 15% off your next order: VIP15 (valid 14 days). {{reorder_link}}' },
    ] },
];

// Real-time journeys tied to the funnel leaks. Designed and specified, not simulated.
export const REALTIME: Journey[] = [
  { key: 'payment_failed', stage: 'In-session recovery', audience: 'payment_failed with no payment_completed in 15 min', trigger: 'payment_failed', exit: 'payment_completed', cap: '1 per 24 h', simulated: false,
    steps: [{ wait: '15 min', channel: 'WhatsApp', category: 'utility', template: 'payment_retry', preview: 'Your payment for {{product_name}} didn\'t go through, and you weren\'t charged. Your cart is saved: {{retry_link}}. On iPhone, choose "UPI ID" instead of the app button.' }] },
  { key: 'cart_abandon', stage: 'In-session recovery', audience: 'add_to_cart, no checkout_started in 1 h, cart ≥ ₹499', trigger: 'add_to_cart', exit: 'checkout_started', cap: '2 marketing messages per 7 days', simulated: false,
    steps: [{ wait: '1 h', channel: 'WhatsApp', category: 'marketing', template: 'cart_reminder', preview: '{{product_name}} is still in your cart. {{#if heavy_item}}Delivery on 3 kg+ packs is free this week.{{/if}} {{cart_link}}' }] },
];

export const EVENT_MAP = [
  { ours: 'product_viewed', clevertap: 'Product Viewed', moengage: 'Product Viewed', props: 'product_id, category, price' },
  { ours: 'search_performed', clevertap: 'Searched', moengage: 'Searched', props: 'query, results_count' },
  { ours: 'add_to_cart', clevertap: 'Added To Cart', moengage: 'Added To Cart', props: 'product_id, category, price, quantity' },
  { ours: 'checkout_started', clevertap: 'Checkout Started', moengage: 'Checkout Started', props: 'revenue' },
  { ours: 'coupon_failed', clevertap: 'Coupon Failed', moengage: 'Coupon Failed', props: 'coupon_code, error_code' },
  { ours: 'payment_failed', clevertap: 'Payment Failed', moengage: 'Payment Failed', props: 'error_code' },
  { ours: 'payment_completed', clevertap: 'Charged (reserved)', moengage: 'Order Placed', props: 'order_id, Amount / revenue' },
];

export const PROFILE_PROPS = [
  ['identity / customer_id', 'anonymous_id until login, then the customer id'],
  ['orders_count', 'drives stage: new / repeat / high-value'],
  ['last_order_date, last_product_id', 'replenishment trigger = last_order_date + cycle − 3'],
  ['rfm_segment', 'nightly from the RFM query (Champions, At risk, …)'],
  ['whatsapp_opt_in, email_opt_in', 'consent; no message without it'],
  ['predicted_churn_bucket', 'on track / due / at risk / lapsed'],
];

const CT_NAME: Record<string, string> = Object.fromEntries(EVENT_MAP.map((e) => [e.ours, e.clevertap.replace(' (reserved)', '')]));
const MOE_NAME: Record<string, string> = Object.fromEntries(EVENT_MAP.map((e) => [e.ours, e.moengage]));

type P = Record<string, unknown>;
const pick = (p: P, keys: string[]) => Object.fromEntries(keys.filter((k) => p[k] !== undefined && p[k] !== null).map((k) => [k, p[k]]));
const DATA_KEYS = ['product_id', 'category', 'price', 'quantity', 'query', 'results_count', 'coupon_code', 'error_code', 'order_id', 'revenue', 'platform', 'utm_source', 'experiment', 'variant'];

/** CleverTap upload API event record ({"d": [record]}) */
export function toCleverTap(event: string, p: P) {
  const name = CT_NAME[event] ?? event;
  const evtData: P = pick(p, DATA_KEYS);
  if (event === 'payment_completed') { evtData['Amount'] = p.revenue; evtData['Charged ID'] = p.order_id; }
  return { identity: String(p.user_id ?? p.anonymous_id ?? 'unknown'), ts: Math.floor(Date.parse(String(p.event_time ?? new Date().toISOString())) / 1000), type: 'event', evtName: name, evtData };
}

/** MoEngage Data API event body */
export function toMoEngage(event: string, p: P) {
  return {
    type: 'event',
    customer_id: String(p.user_id ?? p.anonymous_id ?? 'unknown'),
    actions: [{ action: MOE_NAME[event] ?? event, attributes: pick(p, DATA_KEYS), platform: 'web', current_time: String(p.event_time ?? new Date().toISOString()) }],
  };
}
