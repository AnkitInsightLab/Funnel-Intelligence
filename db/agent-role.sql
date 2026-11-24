-- Read-only role for the AI agents. Run in the Neon SQL editor after scripts/load-neon.mjs.
-- Replace the password, then build AGENT_DATABASE_URL from the normal connection string
-- with this user and password. The app also wraps every agent query in a READ ONLY
-- transaction and validates it, so this role is the second line of defence, not the only one.

CREATE ROLE analyst_ro WITH LOGIN PASSWORD 'CHANGE_ME_long_random_password';
GRANT USAGE ON SCHEMA public TO analyst_ro;
GRANT SELECT ON users, events, sessions, products, customers, orders, order_items, campaign_sends TO analyst_ro;
ALTER ROLE analyst_ro SET default_transaction_read_only = on;
ALTER ROLE analyst_ro SET statement_timeout = '8s';
