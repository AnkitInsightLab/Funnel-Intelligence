// Turns the generated history into INSERT statements for any Postgres: PGlite (local
// agent testing) or Neon (production, via scripts/load-neon.mjs). Same tables as the
// build, minus the high-volume UI events (scroll, clicks, page views), which the agents
// never need and which would eat the Neon free tier.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generate } from './generate.mjs';
import catalog from '../lib/catalog.json' with { type: 'json' };

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_EVENTS = new Set(['scroll_depth', 'element_clicked', 'page_viewed']);

const lit = (v) => v === null || v === undefined ? 'NULL'
  : typeof v === 'number' ? String(v)
  : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE')
  : `'${String(v).replace(/'/g, "''")}'`;
const ts = (v) => `to_timestamp(${v / 1000})`;

function* batches(table, cols, rows, conv = {}, size = 2000) {
  for (let i = 0; i < rows.length; i += size) {
    const vals = rows.slice(i, i + size).map((x) => `(${cols.map((c) => (conv[c] ? conv[c](x[c]) : lit(x[c]))).join(',')})`);
    yield `INSERT INTO ${table} (${cols.join(',')}) VALUES ${vals.join(',')}`;
  }
}

/** All statements needed to load the agent dataset, in order. */
export function* datasetStatements() {
  const { users, events, customers, orders, sends } = generate();
  yield* batches('users', ['user_id', 'first_seen', 'acquisition_source', 'platform', 'city_tier'], users);
  // first-session sessions table needs page views to exist for sessions with no other
  // event, so keep one page_viewed per session (the landing) and drop the rest
  const seen = new Set();
  const kept = events.filter((e) => {
    if (e.event_name === 'page_viewed') { if (seen.has(e.session_id)) return false; seen.add(e.session_id); return true; }
    return !SKIP_EVENTS.has(e.event_name);
  });
  const ecols = ['event_time', 'event_name', 'user_id', 'session_id', 'platform', 'app_version', 'utm_source', 'is_returning',
    'page_type', 'category', 'product_id', 'price', 'quantity', 'query', 'results_count', 'coupon_code', 'error_code',
    'experiment', 'variant', 'order_id', 'revenue'];
  yield* batches('events', ecols, kept, { event_time: ts });
  yield* batches('products', ['product_id', 'category', 'price', 'cycle_days'], catalog.products.map((p) => ({ product_id: p.id, category: p.category, price: p.price, cycle_days: p.cycleDays })));
  yield* batches('customers', ['user_id', 'acquisition_source', 'platform', 'city_tier', 'first_order_date'], customers);
  yield* batches('orders', ['order_id', 'user_id', 'order_time', 'revenue', 'discount', 'utm_source', 'platform', 'order_number'], orders, { order_time: ts });
  yield* batches('order_items', ['order_id', 'product_id', 'category', 'quantity', 'price'], orders.flatMap((o) => o.items.map((i) => ({ order_id: o.order_id, ...i }))));
  yield* batches('campaign_sends', ['campaign', 'user_id', 'send_time', 'variant', 'channel', 'delivered', 'read', 'clicked'], sends, { send_time: ts });
}

export const schemaSql = () => readFileSync(join(root, 'db/schema.sql'), 'utf8');
/** sessions as a materialised view over synthetic events (live events have their own page). */
export const sessionsSql = () => readFileSync(join(root, 'db/views.sql'), 'utf8')
  .replace('CREATE VIEW sessions AS', 'CREATE MATERIALIZED VIEW sessions AS')
  .replace('FROM events\nGROUP BY session_id;', "FROM events\nWHERE source = 'synthetic'\nGROUP BY session_id;");
