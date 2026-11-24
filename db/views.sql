-- One row per session with the funnel flags every analysis builds on.
-- Funnel definition: a session counts at a step only if it also reached every
-- earlier step (product_viewed -> add_to_cart -> checkout_started -> payment_completed).
CREATE VIEW sessions AS
SELECT
  session_id,
  min(user_id)                                                    AS user_id,
  min(event_time)                                                 AS started_at,
  (min(event_time) AT TIME ZONE 'Asia/Kolkata')::date             AS day,
  min(platform)                                                   AS platform,
  min(app_version)                                                AS app_version,
  min(utm_source)                                                 AS utm_source,
  bool_or(is_returning)                                           AS is_returning,
  (array_agg(category ORDER BY event_time)
     FILTER (WHERE event_name = 'product_viewed'))[1]             AS category,
  bool_or(event_name = 'product_viewed')                          AS viewed,
  bool_or(event_name = 'add_to_cart')                             AS carted,
  bool_or(event_name = 'checkout_started')                        AS checkout,
  bool_or(event_name = 'payment_completed')                       AS purchased,
  coalesce(sum(revenue) FILTER (WHERE event_name = 'payment_completed'), 0) AS revenue,
  bool_or(event_name = 'search_performed')                        AS searched,
  bool_or(event_name = 'search_performed' AND results_count = 0)  AS zero_result_search
FROM events
GROUP BY session_id;
