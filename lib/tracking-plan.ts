// Single source of truth for the tracking plan. The /tracking-plan page renders it,
// and lib/datalayer.ts validates every push against it at runtime, so the spec and
// the implementation cannot drift apart.

export type PropType = 'string' | 'number' | 'boolean';
export interface PropSpec { name: string; type: PropType; required: boolean; example: string | number | boolean; note?: string }
export interface EventSpec {
  name: string;
  trigger: string;
  why: string;
  props: PropSpec[];
  destinations: string[];
}

// Sent with every event by the data layer itself (engineering never sets these by hand).
export const COMMON_PROPS: PropSpec[] = [
  { name: 'anonymous_id', type: 'string', required: true, example: 'a_7f3k2m9q', note: 'First-party cookie/localStorage id, set on first visit' },
  { name: 'user_id', type: 'string', required: false, example: 'c_10293', note: 'Customer id after login; Mixpanel identify() merges it with anonymous_id' },
  { name: 'session_id', type: 'string', required: true, example: 's_lq3x8a_2', note: 'New after 30 min of inactivity' },
  { name: 'platform', type: 'string', required: true, example: 'web', note: 'web | android_app | ios_app' },
  { name: 'app_version', type: 'string', required: false, example: '4.2.0', note: 'Apps only; needed for release-impact analysis' },
  { name: 'utm_source', type: 'string', required: true, example: 'meta_ads', note: 'Session-level, first touch of the session; direct if none' },
  { name: 'is_returning', type: 'boolean', required: true, example: false, note: 'Had a previous session' },
  { name: 'page_type', type: 'string', required: true, example: 'product', note: 'home | category | search | product | cart | checkout | confirmation' },
  { name: 'event_time', type: 'string', required: true, example: '2026-11-24T14:05:11.320Z', note: 'Client ISO time; server adds received_at' },
];

const product = (extra: PropSpec[] = []): PropSpec[] => [
  { name: 'product_id', type: 'string', required: true, example: 'MG-3KG-CHOC' },
  { name: 'category', type: 'string', required: true, example: 'mass_gainer' },
  { name: 'price', type: 'number', required: true, example: 2799, note: 'Selling price in ₹ at the time of the event' },
  ...extra,
];

export const EVENTS: EventSpec[] = [
  { name: 'page_viewed', trigger: 'Every route change (SPA) or page load', why: 'Denominator for sessions and landing-page analysis', destinations: ['Mixpanel', 'PostHog', 'Postgres'], props: [] },
  { name: 'search_performed', trigger: 'Search submitted (Enter or the search button), after results are known', why: 'Zero-result rate and search → product conversion', destinations: ['Mixpanel', 'PostHog', 'Postgres'],
    props: [
      { name: 'query', type: 'string', required: true, example: 'protein powder sasta', note: 'Lower-cased, trimmed' },
      { name: 'results_count', type: 'number', required: true, example: 0 },
    ] },
  { name: 'product_viewed', trigger: 'Product page rendered with price visible', why: 'Funnel step 1; category cuts', destinations: ['Mixpanel', 'PostHog', 'Postgres'], props: product() },
  { name: 'element_clicked', trigger: 'Click on a tracked PDP element (data-track attribute)', why: 'Clickmap; dead-click detection on non-interactive elements', destinations: ['Mixpanel', 'Postgres'],
    props: [
      { name: 'element', type: 'string', required: true, example: 'lab_report_badge' },
      { name: 'is_dead_click', type: 'boolean', required: true, example: true, note: 'true when the element does nothing on click' },
      { name: 'product_id', type: 'string', required: false, example: 'HW-1KG-CHOC' },
    ] },
  { name: 'scroll_depth', trigger: 'First time the page passes 25 / 50 / 75 / 100% of its height', why: 'Scrollmap: do shoppers reach reviews and the label?', destinations: ['Mixpanel', 'Postgres'],
    props: [
      { name: 'scroll_pct', type: 'number', required: true, example: 50 },
      { name: 'product_id', type: 'string', required: false, example: 'HW-1KG-CHOC' },
    ] },
  { name: 'experiment_viewed', trigger: 'The user actually sees the variant surface (not on assignment)', why: 'Exposure for A/B readouts; avoids diluting tests with unexposed users', destinations: ['Mixpanel', 'PostHog', 'Postgres'],
    props: [
      { name: 'experiment', type: 'string', required: true, example: 'pdp_sticky_atc' },
      { name: 'variant', type: 'string', required: true, example: 'treatment' },
    ] },
  { name: 'add_to_cart', trigger: 'Server confirms the item was added (not on button tap)', why: 'Funnel step 2', destinations: ['Mixpanel', 'PostHog', 'Postgres'],
    props: product([{ name: 'quantity', type: 'number', required: true, example: 1 }]) },
  { name: 'checkout_started', trigger: 'Checkout page rendered', why: 'Funnel step 3; cart value at checkout', destinations: ['Mixpanel', 'PostHog', 'Postgres'],
    props: [{ name: 'revenue', type: 'number', required: true, example: 3248, note: 'Cart value incl. delivery fee' }] },
  { name: 'coupon_applied', trigger: 'Coupon accepted by the server', why: 'Coupon usage and discount cost', destinations: ['Mixpanel', 'Postgres'],
    props: [{ name: 'coupon_code', type: 'string', required: true, example: 'FIT15' }] },
  { name: 'coupon_failed', trigger: 'Coupon rejected by the server', why: 'Checkout friction by error reason', destinations: ['Mixpanel', 'Postgres'],
    props: [
      { name: 'coupon_code', type: 'string', required: true, example: 'DIWALI20' },
      { name: 'error_code', type: 'string', required: true, example: 'MIN_CART_VALUE', note: 'MIN_CART_VALUE | COUPON_EXPIRED | NOT_APPLICABLE' },
    ] },
  { name: 'payment_attempted', trigger: 'Pay button tapped and the gateway call starts', why: 'Payment success rate denominator', destinations: ['Mixpanel', 'Postgres'],
    props: [
      { name: 'revenue', type: 'number', required: true, example: 3248 },
      { name: 'payment_method', type: 'string', required: false, example: 'upi', note: 'upi | card | cod' },
    ] },
  { name: 'payment_failed', trigger: 'Gateway returns failure or the UPI intent times out', why: 'Release and gateway regressions by error code', destinations: ['Mixpanel', 'Postgres'],
    props: [{ name: 'error_code', type: 'string', required: true, example: 'UPI_INTENT_TIMEOUT' }] },
  { name: 'payment_completed', trigger: 'Order confirmed by the server (fire once per order_id)', why: 'Funnel step 4; revenue. Deduplicate on order_id.', destinations: ['Mixpanel', 'PostHog', 'Postgres'],
    props: [
      { name: 'order_id', type: 'string', required: true, example: 'HN104221' },
      { name: 'revenue', type: 'number', required: true, example: 3248 },
    ] },
  // ---- events added with the shipped fixes (see /fixes) ----
  { name: 'payment_retry_used', trigger: 'Shopper taps a retry option after a failed payment (fix_payment_retry)', why: 'Which recovery path works: UPI ID vs COD', destinations: ['Mixpanel', 'PostHog', 'Postgres'],
    props: [{ name: 'payment_method', type: 'string', required: true, example: 'upi_id', note: 'upi_id | cod' }] },
  { name: 'coupon_hint_clicked', trigger: 'Shopper taps a suggested coupon in the cart (fix_coupon_hints)', why: 'Whether hints replace guessed codes', destinations: ['Mixpanel', 'Postgres'],
    props: [{ name: 'coupon_code', type: 'string', required: true, example: 'FIT15' }] },
  { name: 'search_suggestion_clicked', trigger: 'Shopper taps a "did you mean" suggestion (fix_search_synonyms)', why: 'Recovered dead-end searches', destinations: ['Mixpanel', 'Postgres'],
    props: [{ name: 'query', type: 'string', required: true, example: 'protien' }] },
  { name: 'lab_report_opened', trigger: 'Lab report modal opens (fix_lab_report)', why: 'Trust content engagement; replaces the dead click', destinations: ['Mixpanel', 'Postgres'],
    props: [{ name: 'product_id', type: 'string', required: true, example: 'HW-1KG-CHOC' }] },
  { name: 'replenish_optin', trigger: 'Shopper confirms a run-out reminder with consent ticked (fix_replenish_optin)', why: 'Reminder opt-in rate; audience for the replenishment journey', destinations: ['Mixpanel', 'PostHog', 'Postgres', 'CleverTap', 'MoEngage'],
    props: [
      { name: 'product_id', type: 'string', required: true, example: 'CR-250G' },
      { name: 'channel', type: 'string', required: true, example: 'whatsapp', note: 'whatsapp | email' },
      { name: 'remind_on', type: 'string', required: true, example: '2027-01-10', note: 'order date + cycle_days − 3' },
    ] },
];

export const QA_CHECKLIST = [
  'Every event in this plan fires once, and only once, per trigger: check in the data layer inspector and Mixpanel Live View.',
  'Required properties are never null; types match (price is a number, not "₹2,199").',
  'payment_completed fires on the confirmation screen only, once per order_id, even after a refresh.',
  'add_to_cart fires after the server confirms, so failed adds are not counted.',
  'utm_source survives the redirect into checkout and the payment gateway round trip.',
  'anonymous_id is merged with user_id at login (one person, one profile).',
  'app_version is present on every app event, so a release can be isolated.',
  'experiment_viewed fires only when the variant is actually on screen.',
  'Daily reconciliation: Mixpanel orders vs the orders table, within ±2%.',
];
