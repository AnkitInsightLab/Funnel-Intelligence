// The approved schema: the only tables and columns the agents may query, with the
// business facts they need to interpret them. Shared by every agent's system prompt.

export const ALLOWED_TABLES = ['users', 'events', 'sessions', 'products', 'customers', 'orders', 'order_items', 'campaign_sends'] as const;

export const SCHEMA = `DATA (synthetic, Halden Nutrition, a fictional Indian D2C supplements store; money in INR; PostgreSQL)

sessions — one row per web/app session, 24 Aug – 22 Nov 2026 (13 full weeks, Mon–Sun)
  session_id, user_id, started_at timestamptz, day date (IST), platform 'android_app'|'ios_app'|'web',
  app_version text, utm_source 'organic'|'google_ads'|'meta_ads'|'influencer'|'email'|'direct'|'whatsapp',
  is_returning bool, category (first product viewed), viewed bool, carted bool, checkout bool, purchased bool,
  revenue numeric (0 unless purchased), searched bool, zero_result_search bool
  Strict funnel: viewed → viewed AND carted → … AND checkout → … AND purchased.

events — funnel events in the same window (no scroll/click events)
  event_time, event_name, user_id, session_id, platform, app_version, utm_source, is_returning, page_type,
  category, product_id, price, quantity, query, results_count, coupon_code, error_code, experiment, variant,
  order_id, revenue, source ('synthetic' | 'live')
  event_name: page_viewed (landing only), search_performed, product_viewed, experiment_viewed, add_to_cart,
  checkout_started, coupon_applied, coupon_failed, payment_attempted, payment_failed, payment_completed

orders — every order, 1 Nov 2025 – 22 Nov 2026: order_id, user_id, order_time, revenue (after discount), discount,
  utm_source, platform, order_number (1 = first order)
order_items — order_id, product_id, category, quantity, price
products — product_id, category, price, cycle_days (days one pack lasts)
customers — user_id, acquisition_source, platform, city_tier 'tier_1'|'tier_2'|'tier_3', first_order_date
users — visitors first seen in the session window: user_id, first_seen, acquisition_source, platform, city_tier
campaign_sends — lifecycle CRM sends since 26 Apr 2026: campaign 'welcome_series'|'replenishment_reminder'|
  'winback_email'|'vip_discount', user_id, send_time, variant 'treatment'|'holdout' (20% holdout, never messaged),
  channel 'whatsapp'|'email', delivered, read, clicked

FACTS
- iOS app 4.2.0 shipped 10 Oct 2026. Android app 6.8.1 shipped 4 Oct.
- A/B tests 2–22 Nov: pdp_sticky_atc (mobile PDP) and one_page_checkout (web + Android checkout); exposure = experiment_viewed.
- Campaign conversion convention: any order within 14 days after send_time (also report 30 days for pull-forward).
- There is NO region/state, distributor, cost-of-goods, marketing-spend or margin column. Margins and CAC on the site are
  assumptions (gross margin 52%, fulfilment ₹95/order), not data. City tier is the only geography.
- Weeks: date_trunc('week', day) (Monday). "Last 4 weeks" = 26 Oct – 22 Nov 2026; "first 4 weeks" = 24 Aug – 20 Sep.`;

export const SQL_RULES = `SQL RULES
- PostgreSQL. One SELECT or WITH statement per call. Only the tables above. No writes, no system catalogs.
- Aggregate in SQL; results are capped at 50 rows shown to you. Cast counts with ::int and ratios with ::float8, round(…, 2).
- Use the sessions table for funnel and conversion questions, orders for revenue/retention over 12 months.`;
