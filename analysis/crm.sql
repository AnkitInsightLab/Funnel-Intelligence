-- Retention & lifecycle intelligence: every query behind /retention and /journeys.
-- Tables: customers, orders, order_items, products, campaign_sends (db/schema.sql).
-- Snapshot = end of 22 Nov 2026 IST. Same "-- @query <name>" convention as analysis.sql.

-- @query crm_overview
-- Headline retention numbers. 90-day repeat rate only counts customers who have had
-- 90 days to come back, so recent customers do not drag it down.
WITH snap AS (SELECT TIMESTAMPTZ '2026-11-23 00:00+05:30' AS t),
c AS (
  SELECT o.user_id, min(o.order_time) AS first_at, count(*) AS orders, sum(o.revenue) AS revenue,
         min(o.order_time) FILTER (WHERE o.order_number = 2) AS second_at
  FROM orders o GROUP BY o.user_id
)
SELECT
  count(*)::int                                                                      AS customers,
  sum(orders)::int                                                                   AS orders,
  round(sum(revenue))::float8                                                        AS revenue,
  round(100.0 * count(*) FILTER (WHERE orders >= 2) / count(*), 1)::float8           AS repeat_rate_pct,
  count(*) FILTER (WHERE first_at <= (SELECT t FROM snap) - interval '90 days')::int AS customers_90d_tenure,
  round(100.0 * count(*) FILTER (WHERE first_at <= (SELECT t FROM snap) - interval '90 days' AND second_at <= first_at + interval '90 days')
        / nullif(count(*) FILTER (WHERE first_at <= (SELECT t FROM snap) - interval '90 days'), 0), 1)::float8 AS repeat_90d_pct,
  round(sum(orders)::numeric / count(*), 2)::float8                                  AS orders_per_customer,
  (SELECT round(100.0 * sum(revenue) FILTER (WHERE order_number > 1) / sum(revenue), 1) FROM orders)::float8 AS repeat_revenue_pct,
  (SELECT round(avg(revenue) FILTER (WHERE order_number = 1)) FROM orders)::float8   AS aov_first,
  (SELECT round(avg(revenue) FILTER (WHERE order_number > 1)) FROM orders)::float8   AS aov_repeat
FROM c;

-- @query repeat_trend
-- Monthly orders split into first and repeat, to see whether growth is new-customer only.
SELECT to_char(date_trunc('month', order_time AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM') AS month,
  count(*) FILTER (WHERE order_number = 1)::int AS first_orders,
  count(*) FILTER (WHERE order_number > 1)::int AS repeat_orders,
  round(sum(revenue) FILTER (WHERE order_number = 1))::float8 AS first_revenue,
  round(sum(revenue) FILTER (WHERE order_number > 1))::float8 AS repeat_revenue
FROM orders
WHERE order_time >= TIMESTAMPTZ '2025-12-01 00:00+05:30'
GROUP BY 1 ORDER BY 1;

-- @query time_to_second
-- Days from first to second order, bucketed, for customers who placed a second order.
WITH g AS (
  SELECT o2.order_time::date - o1.order_time::date AS days
  FROM orders o1 JOIN orders o2 ON o2.user_id = o1.user_id AND o2.order_number = 2
  WHERE o1.order_number = 1
)
SELECT CASE WHEN days <= 15 THEN '0-15' WHEN days <= 30 THEN '16-30' WHEN days <= 45 THEN '31-45'
            WHEN days <= 60 THEN '46-60' WHEN days <= 90 THEN '61-90' ELSE '90+' END AS bucket,
       min(days)::int AS sort_key, count(*)::int AS customers
FROM g GROUP BY 1 ORDER BY 2;

-- @query time_to_second_stats
SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY o2.order_time::date - o1.order_time::date)::float8 AS median_days,
       percentile_cont(0.25) WITHIN GROUP (ORDER BY o2.order_time::date - o1.order_time::date)::float8 AS p25_days,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY o2.order_time::date - o1.order_time::date)::float8 AS p75_days,
       count(*)::int AS customers
FROM orders o1 JOIN orders o2 ON o2.user_id = o1.user_id AND o2.order_number = 2
WHERE o1.order_number = 1;

-- @query purchase_cohorts
-- Monthly first-order cohorts: share of customers ordering again in month N after the first.
WITH c AS (
  SELECT user_id, date_trunc('month', min(order_time) AT TIME ZONE 'Asia/Kolkata') AS cohort FROM orders GROUP BY user_id
), a AS (
  SELECT DISTINCT o.user_id, c.cohort,
    (extract(year FROM age(date_trunc('month', o.order_time AT TIME ZONE 'Asia/Kolkata'), c.cohort)) * 12
     + extract(month FROM age(date_trunc('month', o.order_time AT TIME ZONE 'Asia/Kolkata'), c.cohort)))::int AS month_n
  FROM orders o JOIN c USING (user_id)
)
SELECT to_char(cohort, 'YYYY-MM') AS cohort, month_n, count(*)::int AS customers
FROM a WHERE cohort >= TIMESTAMP '2025-12-01'
GROUP BY 1, 2 ORDER BY 1, 2;

-- @query replenishment
-- Replenishment window per product: days between consecutive orders of the same product
-- by the same customer. The median is when a reminder should land.
WITH po AS (
  SELECT o.user_id, i.product_id, o.order_time::date AS d,
         lag(o.order_time::date) OVER (PARTITION BY o.user_id, i.product_id ORDER BY o.order_time) AS prev_d
  FROM orders o JOIN order_items i USING (order_id)
)
SELECT po.product_id, p.category, p.cycle_days,
  count(*)::int AS repurchases,
  percentile_cont(0.25) WITHIN GROUP (ORDER BY d - prev_d)::float8 AS p25,
  percentile_cont(0.5)  WITHIN GROUP (ORDER BY d - prev_d)::float8 AS p50,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY d - prev_d)::float8 AS p75
FROM po JOIN products p USING (product_id)
WHERE prev_d IS NOT NULL
GROUP BY 1, 2, 3
HAVING count(*) >= 20
ORDER BY repurchases DESC;

-- @query rfm
-- RFM: recency, frequency, monetary scored 1-5 by quintile, then mapped to named segments.
WITH base AS (
  SELECT user_id,
    (DATE '2026-11-22' - max((order_time AT TIME ZONE 'Asia/Kolkata')::date))::int AS recency_days,
    count(*)::int AS frequency,
    sum(revenue)::float8 AS monetary
  FROM orders GROUP BY user_id
), scored AS (
  SELECT *,
    6 - ntile(5) OVER (ORDER BY recency_days) AS r,
    CASE WHEN frequency >= 4 THEN 5 WHEN frequency = 3 THEN 4 WHEN frequency = 2 THEN 3 ELSE 1 END AS f,
    ntile(5) OVER (ORDER BY monetary) AS m
  FROM base
), seg AS (
  SELECT *,
    CASE
      WHEN r >= 4 AND f >= 4 THEN 'Champions'
      WHEN r >= 3 AND f >= 3 THEN 'Loyal'
      WHEN r <= 2 AND f >= 3 THEN 'At risk (repeat buyers)'
      WHEN r >= 4 AND f = 1 THEN 'New'
      WHEN r = 3 AND f = 1 THEN 'Needs a second order'
      WHEN r <= 2 AND f = 1 AND recency_days <= 180 THEN 'Hibernating'
      ELSE 'Lost'
    END AS segment
  FROM scored
)
SELECT segment, count(*)::int AS customers,
  round(avg(recency_days))::int AS avg_recency_days,
  round(avg(frequency), 2)::float8 AS avg_orders,
  round(avg(monetary))::float8 AS avg_revenue,
  round(sum(monetary))::float8 AS revenue
FROM seg GROUP BY 1 ORDER BY revenue DESC;

-- @query churn_risk
-- Churn risk: days since the last order against that product's replenishment cycle.
-- Overdue by 1.5x the cycle = at risk; 3x = lapsed.
WITH last AS (
  SELECT DISTINCT ON (o.user_id) o.user_id, o.order_time, i.product_id
  FROM orders o JOIN order_items i USING (order_id)
  ORDER BY o.user_id, o.order_time DESC, i.price DESC
), cust AS (
  SELECT l.user_id, (DATE '2026-11-22' - (l.order_time AT TIME ZONE 'Asia/Kolkata')::date)::float8 / p.cycle_days AS cycles_since,
         t.orders, t.revenue
  FROM last l JOIN products p USING (product_id)
  JOIN (SELECT user_id, count(*) AS orders, sum(revenue) AS revenue FROM orders GROUP BY 1) t USING (user_id)
)
SELECT CASE WHEN cycles_since < 1 THEN '1 · on track' WHEN cycles_since < 1.5 THEN '2 · due now'
            WHEN cycles_since < 3 THEN '3 · at risk' ELSE '4 · lapsed' END AS status,
  count(*)::int AS customers,
  count(*) FILTER (WHERE orders >= 2)::int AS repeat_customers,
  round(sum(revenue))::float8 AS lifetime_revenue
FROM cust GROUP BY 1 ORDER BY 1;

-- @query clv_by_source
-- 180-day customer value by acquisition source, for customers with 180+ days of tenure.
WITH c AS (
  SELECT cu.user_id, cu.acquisition_source, cu.first_order_date FROM customers cu
  WHERE cu.first_order_date <= DATE '2026-11-22' - 180
)
SELECT c.acquisition_source,
  count(DISTINCT c.user_id)::int AS customers,
  round(sum(o.revenue)::numeric / count(DISTINCT c.user_id))::float8 AS revenue_180d,
  round(count(o.order_id)::numeric / count(DISTINCT c.user_id), 2)::float8 AS orders_180d
FROM c JOIN orders o ON o.user_id = c.user_id
  AND (o.order_time AT TIME ZONE 'Asia/Kolkata')::date < c.first_order_date + 180
GROUP BY 1 ORDER BY 3 DESC;

-- @query new_customers_by_source
-- New customers acquired inside the 13-week event window, by acquisition source (for CAC).
SELECT acquisition_source, count(*)::int AS new_customers
FROM customers WHERE first_order_date >= DATE '2026-08-24'
GROUP BY 1 ORDER BY 2 DESC;

-- @query campaign_results
-- Lifecycle campaign readout. Conversion = any order within 14 days of the send (and 30
-- days, to check for pull-forward). Holdout rows were never messaged.
SELECT s.campaign, s.variant, s.channel,
  count(*)::int                                             AS recipients,
  count(*) FILTER (WHERE s.delivered)::int                  AS delivered,
  count(*) FILTER (WHERE s.read)::int                       AS read,
  count(*) FILTER (WHERE s.clicked)::int                    AS clicked,
  count(*) FILTER (WHERE o14.n > 0)::int                    AS converted_14d,
  count(*) FILTER (WHERE o30.n > 0)::int                    AS converted_30d,
  round(coalesce(sum(o14.revenue), 0))::float8              AS revenue_14d,
  round(coalesce(sum(o14.discount), 0))::float8             AS discount_14d,
  round(coalesce(sum(o30.revenue), 0))::float8              AS revenue_30d,
  round(coalesce(sum(o30.discount), 0))::float8             AS discount_30d,
  coalesce(sum(o30.n), 0)::int                              AS orders_30d,
  round(stddev_samp(coalesce(o14.revenue, 0)))::float8      AS revenue_sd
FROM campaign_sends s
LEFT JOIN LATERAL (
  SELECT count(*) AS n, sum(revenue) AS revenue, sum(discount) AS discount FROM orders o
  WHERE o.user_id = s.user_id AND o.order_time > s.send_time AND o.order_time <= s.send_time + interval '14 days'
) o14 ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS n, sum(revenue) AS revenue, sum(discount) AS discount FROM orders o
  WHERE o.user_id = s.user_id AND o.order_time > s.send_time AND o.order_time <= s.send_time + interval '30 days'
) o30 ON true
GROUP BY 1, 2, 3 ORDER BY 1, 2 DESC;

-- @query replenishment_by_orders
-- Who the replenishment reminder actually moves: lift by how many orders the customer had.
SELECT CASE WHEN prior.n = 1 THEN '1 prior order' ELSE '2 prior orders' END AS customer_type, s.variant,
  count(*)::int AS recipients,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM orders o WHERE o.user_id = s.user_id AND o.order_time > s.send_time
                                 AND o.order_time <= s.send_time + interval '14 days'))::int AS converted_14d
FROM campaign_sends s
JOIN LATERAL (SELECT count(*) AS n FROM orders o WHERE o.user_id = s.user_id AND o.order_time < s.send_time) prior ON true
WHERE s.campaign = 'replenishment_reminder'
GROUP BY 1, 2 ORDER BY 1, 2 DESC;

-- @query crm_reconciliation
-- Orders in the event window must equal payment_completed events, order for order.
SELECT
  (SELECT count(*) FROM orders WHERE order_time >= TIMESTAMPTZ '2026-08-24 00:00+05:30')::int AS window_orders,
  (SELECT count(*) FROM events WHERE event_name = 'payment_completed')::int                   AS payment_events,
  (SELECT count(*) FROM orders o JOIN events e ON e.order_id = o.order_id AND e.event_name = 'payment_completed'
     AND e.revenue = o.revenue)::int                                                          AS matched,
  (SELECT count(*) FROM customers)::int                                                       AS customers,
  (SELECT count(DISTINCT user_id) FROM orders)::int                                           AS order_customers;

-- @query run_rate
-- Last 28 days (26 Oct - 22 Nov): the baseline for the growth model.
SELECT
  (SELECT count(*) FROM sessions WHERE day >= DATE '2026-10-26')::int                      AS sessions,
  count(*) FILTER (WHERE order_number = 1)::int                                             AS first_orders,
  count(*) FILTER (WHERE order_number > 1)::int                                             AS repeat_orders,
  round(sum(revenue) FILTER (WHERE order_number = 1))::float8                               AS first_revenue,
  round(sum(revenue) FILTER (WHERE order_number > 1))::float8                               AS repeat_revenue,
  round(sum(discount))::float8                                                              AS discounts
FROM orders WHERE order_time >= TIMESTAMPTZ '2026-10-26 00:00+05:30';
