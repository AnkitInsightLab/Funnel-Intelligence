-- Event store. One row per tracked event, same shape as the data layer push.
-- Used for the synthetic history (loaded at build time) and for live events
-- from the storefront (POST /api/track -> Neon) when DATABASE_URL is set.

CREATE TABLE IF NOT EXISTS users (
  user_id             text PRIMARY KEY,
  first_seen          date NOT NULL,
  acquisition_source  text NOT NULL,   -- organic | google_ads | meta_ads | influencer | email | direct
  platform            text NOT NULL,   -- android_app | ios_app | web
  city_tier           text NOT NULL    -- tier_1 | tier_2 | tier_3
);

CREATE TABLE IF NOT EXISTS events (
  event_id       bigserial PRIMARY KEY,
  event_time     timestamptz NOT NULL,
  event_name     text NOT NULL,
  user_id        text NOT NULL,        -- anonymous_id until login, then the customer id
  session_id     text NOT NULL,
  platform       text NOT NULL,
  app_version    text,                 -- null on web
  utm_source     text NOT NULL,
  is_returning   boolean NOT NULL,
  page_type      text,                 -- home | category | search | product | cart | checkout | confirmation
  category       text,
  product_id     text,
  price          numeric(10,2),
  quantity       int,
  query          text,
  results_count  int,
  coupon_code    text,
  error_code     text,
  element        text,                 -- element_clicked target
  is_dead_click  boolean,
  scroll_pct     int,
  experiment     text,
  variant        text,
  order_id       text,
  revenue        numeric(10,2),
  source         text NOT NULL DEFAULT 'synthetic'   -- synthetic | live
);

CREATE INDEX IF NOT EXISTS events_session_idx ON events (session_id);
CREATE INDEX IF NOT EXISTS events_name_time_idx ON events (event_name, event_time);

-- ---------- CRM / retention layer ----------
-- 12 months of orders (Nov 2025 - Nov 2026). Orders inside the 13-week event window are
-- the same orders as the payment_completed events, so both layers reconcile.

CREATE TABLE IF NOT EXISTS products (
  product_id  text PRIMARY KEY,
  category    text NOT NULL,
  price       numeric(10,2) NOT NULL,
  cycle_days  int NOT NULL              -- expected days for one pack to run out
);

CREATE TABLE IF NOT EXISTS customers (
  user_id             text PRIMARY KEY,
  acquisition_source  text NOT NULL,
  platform            text NOT NULL,
  city_tier           text NOT NULL,
  first_order_date    date NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  order_id      text PRIMARY KEY,
  user_id       text NOT NULL,
  order_time    timestamptz NOT NULL,
  revenue       numeric(10,2) NOT NULL,   -- after discount
  discount      numeric(10,2) NOT NULL DEFAULT 0,
  utm_source    text NOT NULL,
  platform      text NOT NULL,
  order_number  int NOT NULL              -- 1 = first order
);

CREATE TABLE IF NOT EXISTS order_items (
  order_id    text NOT NULL,
  product_id  text NOT NULL,
  category    text NOT NULL,
  quantity    int NOT NULL,
  price       numeric(10,2) NOT NULL
);

-- One row per customer entering a lifecycle campaign. Holdout rows were eligible but
-- deliberately not messaged; they are the counterfactual for incremental lift.
CREATE TABLE IF NOT EXISTS campaign_sends (
  send_id     bigserial PRIMARY KEY,
  campaign    text NOT NULL,              -- welcome_series | replenishment_reminder | winback_email | vip_discount
  user_id     text NOT NULL,
  send_time   timestamptz NOT NULL,
  variant     text NOT NULL,              -- treatment | holdout
  channel     text NOT NULL,              -- whatsapp | email
  delivered   boolean NOT NULL,
  read        boolean NOT NULL,
  clicked     boolean NOT NULL
);

CREATE INDEX IF NOT EXISTS orders_user_idx ON orders (user_id, order_time);
CREATE INDEX IF NOT EXISTS sends_user_idx ON campaign_sends (user_id);
