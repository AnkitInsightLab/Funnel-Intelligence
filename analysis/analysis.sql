-- Growth & Funnel Intelligence: every query behind the dashboard.
-- Runs on Postgres (PGlite at build time, or Neon). Each block starts with
-- "-- @query <name>"; the build runs them in order and stores the rows and the
-- SQL text together, so each chart in the app shows exactly the SQL that made it.
-- Base view: db/views.sql (one row per session with funnel flags).

-- @query weekly_kpis
-- Weekly sessions, orders, revenue and conversion. The founder's question in one
-- table: is traffic growing faster than orders?
SELECT
  to_char(date_trunc('week', day), 'YYYY-MM-DD')                         AS week,
  count(*)::int                                                           AS sessions,
  count(DISTINCT user_id)::int                                            AS users,
  count(*) FILTER (WHERE purchased)::int                                  AS orders,
  round(sum(revenue))::float8                                             AS revenue,
  round(100.0 * count(*) FILTER (WHERE purchased) / count(*), 2)::float8  AS cvr_pct,
  round(sum(revenue) / nullif(count(*) FILTER (WHERE purchased), 0))::float8 AS aov
FROM sessions
GROUP BY 1
ORDER BY 1;

-- @query funnel_overall
-- Strict session funnel: each step only counts sessions that reached every earlier step.
SELECT step, sessions::int FROM (
  SELECT 1 AS ord, 'Session started' AS step, count(*) AS sessions FROM sessions
  UNION ALL SELECT 2, 'Viewed a product', count(*) FILTER (WHERE viewed) FROM sessions
  UNION ALL SELECT 3, 'Added to cart',    count(*) FILTER (WHERE viewed AND carted) FROM sessions
  UNION ALL SELECT 4, 'Started checkout', count(*) FILTER (WHERE viewed AND carted AND checkout) FROM sessions
  UNION ALL SELECT 5, 'Paid',             count(*) FILTER (WHERE viewed AND carted AND checkout AND purchased) FROM sessions
) f
ORDER BY ord;

-- @query funnel_by_segment
-- The same strict funnel cut four ways; "dimension" names the cut.
WITH s AS (
  SELECT *,
    viewed AND carted                            AS f_cart,
    viewed AND carted AND checkout               AS f_checkout,
    viewed AND carted AND checkout AND purchased AS f_paid
  FROM sessions
), cuts AS (
  SELECT 'source' AS dimension, utm_source AS segment, s.* FROM s
  UNION ALL SELECT 'platform', platform, s.* FROM s
  UNION ALL SELECT 'customer', CASE WHEN is_returning THEN 'returning' ELSE 'new' END, s.* FROM s
  UNION ALL SELECT 'category', category, s.* FROM s WHERE category IS NOT NULL
)
SELECT dimension, segment,
  count(*)::int                           AS sessions,
  count(*) FILTER (WHERE viewed)::int     AS viewed,
  count(*) FILTER (WHERE f_cart)::int     AS carted,
  count(*) FILTER (WHERE f_checkout)::int AS checkout,
  count(*) FILTER (WHERE f_paid)::int     AS paid,
  round(sum(revenue))::float8             AS revenue
FROM cuts
GROUP BY 1, 2
ORDER BY 1, 3 DESC;

-- @query mix_shift
-- Sessions and orders by source, first four weeks vs last four weeks. Splits the
-- fall in blended conversion into "traffic mix changed" vs "conversion rates changed".
SELECT
  CASE WHEN day < DATE '2026-09-21' THEN 'first_4_weeks' ELSE 'last_4_weeks' END AS period,
  utm_source,
  count(*)::int                          AS sessions,
  count(*) FILTER (WHERE purchased)::int AS orders
FROM sessions
WHERE day < DATE '2026-09-21' OR day >= DATE '2026-10-26'
GROUP BY 1, 2
ORDER BY 1, 2;

-- @query release_impact
-- Daily payment attempts and failures on iOS and Android around the iOS 4.2 release
-- (10 Oct 2026). Android is the control for a difference-in-differences read.
SELECT
  to_char((event_time AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS day,
  platform,
  count(*) FILTER (WHERE event_name = 'payment_attempted')::int AS attempts,
  count(*) FILTER (WHERE event_name = 'payment_failed')::int    AS failures
FROM events
WHERE event_name IN ('payment_attempted', 'payment_failed')
  AND platform IN ('ios_app', 'android_app')
GROUP BY 1, 2
ORDER BY 1, 2;

-- @query payment_errors
-- Which error drives payment failures, by platform and app version.
SELECT platform, coalesce(app_version, 'web') AS app_version, error_code, count(*)::int AS failures
FROM events
WHERE event_name = 'payment_failed'
GROUP BY 1, 2, 3
ORDER BY failures DESC;

-- @query search_outcomes
-- Sessions by search outcome, and how far each group gets.
SELECT
  CASE WHEN NOT searched THEN 'no search'
       WHEN zero_result_search THEN 'zero results'
       ELSE 'found results' END          AS search_outcome,
  count(*)::int                          AS sessions,
  count(*) FILTER (WHERE viewed)::int    AS viewed,
  count(*) FILTER (WHERE purchased)::int AS orders
FROM sessions
GROUP BY 1
ORDER BY 2 DESC;

-- @query zero_result_queries
-- The searches that return nothing, ranked by volume.
SELECT query, count(*)::int AS searches
FROM events
WHERE event_name = 'search_performed' AND results_count = 0
GROUP BY query
ORDER BY searches DESC
LIMIT 10;

-- @query search_totals
SELECT count(*)::int AS searches,
       count(*) FILTER (WHERE results_count = 0)::int AS zero_result_searches
FROM events WHERE event_name = 'search_performed';

-- @query cart_by_category
-- Cart -> checkout -> order for carts with and without a mass gainer. The heavy-item
-- delivery fee is first shown in the cart, so mass gainer is the suspect.
WITH cart AS (
  SELECT session_id, bool_or(category = 'mass_gainer') AS has_mass_gainer
  FROM events WHERE event_name = 'add_to_cart'
  GROUP BY session_id
)
SELECT
  CASE WHEN c.has_mass_gainer THEN 'mass gainer in cart' ELSE 'other carts' END AS cart_type,
  count(*)::int                            AS carts,
  count(*) FILTER (WHERE s.checkout)::int  AS checkouts,
  count(*) FILTER (WHERE s.purchased)::int AS orders,
  round(sum(s.revenue) / nullif(count(*) FILTER (WHERE s.purchased), 0))::float8 AS aov
FROM cart c JOIN sessions s USING (session_id)
GROUP BY 1
ORDER BY 1;

-- @query coupon_friction
-- Payment completion after checkout, by coupon outcome.
WITH c AS (
  SELECT session_id,
    bool_or(event_name = 'coupon_failed')  AS failed,
    bool_or(event_name = 'coupon_applied') AS applied,
    max(error_code) FILTER (WHERE event_name = 'coupon_failed') AS error_code
  FROM events GROUP BY session_id
)
SELECT
  CASE WHEN c.failed THEN 'coupon failed' WHEN c.applied THEN 'coupon applied' ELSE 'no coupon' END AS coupon_outcome,
  count(*)::int                                                  AS checkouts,
  count(*) FILTER (WHERE s.purchased)::int                       AS orders,
  count(*) FILTER (WHERE c.error_code = 'MIN_CART_VALUE')::int   AS min_cart_value_errors,
  count(*) FILTER (WHERE c.error_code = 'COUPON_EXPIRED')::int   AS expired_errors
FROM sessions s JOIN c USING (session_id)
WHERE s.checkout
GROUP BY 1
ORDER BY 2 DESC;

-- @query cohort_retention
-- Weekly acquisition cohorts: users with any session N weeks after their first week.
-- Only users first seen inside the window (users.first_seen), so earlier visitors
-- are not mistaken for new ones.
WITH first AS (
  SELECT user_id, date_trunc('week', first_seen)::date AS cohort FROM users
), activity AS (
  SELECT DISTINCT s.user_id, f.cohort,
    (date_trunc('week', s.day)::date - f.cohort) / 7 AS week_n
  FROM sessions s JOIN first f USING (user_id)
)
SELECT to_char(cohort, 'YYYY-MM-DD') AS cohort, week_n::int AS week_n, count(*)::int AS users
FROM activity
GROUP BY 1, 2
ORDER BY 1, 2;

-- @query experiments
-- Per experiment and variant: exposed sessions and outcomes in the same session.
-- Exposure = the experiment_viewed event.
WITH exposed AS (
  SELECT DISTINCT session_id, experiment, variant
  FROM events WHERE event_name = 'experiment_viewed'
)
SELECT e.experiment, e.variant,
  count(*)::int                             AS sessions,
  count(*) FILTER (WHERE s.carted)::int     AS carted,
  count(*) FILTER (WHERE s.checkout)::int   AS checkouts,
  count(*) FILTER (WHERE s.purchased)::int  AS orders,
  round(sum(s.revenue))::float8             AS revenue,
  round(stddev_samp(s.revenue) FILTER (WHERE s.purchased))::float8 AS order_value_sd
FROM exposed e JOIN sessions s USING (session_id)
GROUP BY 1, 2
ORDER BY 1, 2;

-- @query pdp_clickmap
-- PDP clickmap and scrollmap: share of product-page sessions that clicked each element
-- or reached each scroll depth, plus the add-to-cart rate of those sessions.
WITH pdp AS (SELECT session_id, carted FROM sessions WHERE viewed)
SELECT 'click' AS kind, e.element AS item, bool_or(e.is_dead_click) AS dead,
  count(DISTINCT e.session_id)::int                          AS sessions,
  count(DISTINCT e.session_id) FILTER (WHERE p.carted)::int  AS carted
FROM events e JOIN pdp p USING (session_id)
WHERE e.event_name = 'element_clicked'
GROUP BY 2
UNION ALL
SELECT 'scroll', e.scroll_pct::text, false,
  count(DISTINCT e.session_id)::int,
  count(DISTINCT e.session_id) FILTER (WHERE p.carted)::int
FROM events e JOIN pdp p USING (session_id)
WHERE e.event_name = 'scroll_depth'
GROUP BY 2
ORDER BY 1, 4 DESC;

-- @query pdp_sessions
SELECT count(*)::int AS pdp_sessions,
       count(*) FILTER (WHERE carted)::int AS carted
FROM sessions WHERE viewed;

-- @query reconciliation
-- The funnel must agree with the raw event table, or nothing above can be trusted.
SELECT
  (SELECT count(DISTINCT session_id) FROM events)::int                                          AS raw_sessions,
  (SELECT count(*) FROM sessions)::int                                                          AS funnel_sessions,
  (SELECT count(*) FROM events WHERE event_name = 'payment_completed')::int                      AS raw_orders,
  (SELECT count(*) FILTER (WHERE purchased) FROM sessions)::int                                 AS funnel_orders,
  (SELECT round(sum(revenue)) FROM events WHERE event_name = 'payment_completed')::float8        AS raw_revenue,
  (SELECT round(sum(revenue)) FROM sessions)::float8                                            AS funnel_revenue,
  (SELECT count(*) FROM sessions WHERE purchased AND NOT (viewed AND carted AND checkout))::int AS orders_skipping_steps,
  (SELECT count(DISTINCT user_id) FROM events)::int                                             AS users,
  (SELECT count(*) FROM events)::int                                                            AS events;

-- @query release_sessions
-- Checkout -> paid conversion per platform, before the iOS 4.2 release and after
-- full adoption (16 Oct onward). Feeds the difference-in-differences estimate.
SELECT platform,
  CASE WHEN day < DATE '2026-10-10' THEN 'pre' ELSE 'post' END AS period,
  count(*) FILTER (WHERE checkout)::int                AS checkouts,
  count(*) FILTER (WHERE checkout AND purchased)::int  AS orders,
  round(sum(revenue))::float8                          AS revenue
FROM sessions
WHERE platform IN ('ios_app', 'android_app')
  AND (day < DATE '2026-10-10' OR day >= DATE '2026-10-16')
GROUP BY 1, 2
ORDER BY 1, 2;

-- @query experiment_overlap
-- Users exposed to both experiments: are the two assignments independent?
-- If bucketing were independent, each cell would hold about a quarter of users.
WITH a AS (
  SELECT user_id,
    max(variant) FILTER (WHERE experiment = 'pdp_sticky_atc')    AS sticky,
    max(variant) FILTER (WHERE experiment = 'one_page_checkout') AS one_page
  FROM events WHERE event_name = 'experiment_viewed'
  GROUP BY user_id
)
SELECT sticky, one_page, count(*)::int AS users
FROM a WHERE sticky IS NOT NULL AND one_page IS NOT NULL
GROUP BY 1, 2
ORDER BY 1, 2;

-- @query experiment_basket
-- Mechanism check for the AOV guardrail: items per paid cart and share of paid
-- carts with more than one product, by variant.
WITH exposed AS (
  SELECT DISTINCT session_id, experiment, variant FROM events WHERE event_name = 'experiment_viewed'
), items AS (
  SELECT session_id, count(DISTINCT product_id) AS products FROM events WHERE event_name = 'add_to_cart' GROUP BY session_id
)
SELECT e.experiment, e.variant,
  round(avg(i.products), 2)::float8                                      AS products_per_order,
  round(100.0 * count(*) FILTER (WHERE i.products > 1) / count(*), 1)::float8 AS multi_product_pct
FROM exposed e JOIN sessions s USING (session_id) JOIN items i USING (session_id)
WHERE s.purchased
GROUP BY 1, 2
ORDER BY 1, 2;
