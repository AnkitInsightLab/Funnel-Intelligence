// Loads the synthetic history into your Neon Postgres so the AI agents can query it.
// Live storefront events (source = 'live') are left untouched.
//
//   $env:DATABASE_URL = "postgres://...neon.tech/neondb?sslmode=require"   (owner role)
//   node scripts/load-neon.mjs
//
// Then run db/agent-role.sql in the Neon SQL editor to create the read-only role the
// agents connect with (AGENT_DATABASE_URL).
import { Pool, neonConfig } from '@neondatabase/serverless';
import { datasetStatements, schemaSql, sessionsSql } from './dataset.mjs';

const url = process.env.DATABASE_URL;
if (!url) { console.error('Set DATABASE_URL to your Neon connection string (owner role) first.'); process.exit(1); }
neonConfig.webSocketConstructor = globalThis.WebSocket;

const pool = new Pool({ connectionString: url });
const t0 = Date.now();
const run = (sql) => pool.query(sql);

console.log('schema…');
await run(schemaSql());
console.log('clearing previous synthetic data…');
await run(`DROP MATERIALIZED VIEW IF EXISTS sessions;
  DELETE FROM events WHERE source = 'synthetic';
  TRUNCATE users, products, customers, orders, order_items, campaign_sends;`);

let n = 0;
for (const stmt of datasetStatements()) {
  await run(stmt);
  if (++n % 20 === 0) process.stdout.write(`  ${n} batches (${Math.round((Date.now() - t0) / 1000)} s)\r`);
}
console.log(`\ninserted ${n} batches`);
await run(sessionsSql());
await run(`CREATE INDEX IF NOT EXISTS sessions_day_idx ON sessions (day);
  CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
  ANALYZE;`);
const r = await run(`SELECT (SELECT count(*) FROM events WHERE source = 'synthetic')::int AS events,
  (SELECT count(*) FROM sessions)::int AS sessions, (SELECT count(*) FROM orders)::int AS orders,
  (SELECT count(*) FROM campaign_sends)::int AS sends`);
console.log('loaded', r.rows[0], `in ${Math.round((Date.now() - t0) / 1000)} s`);
console.log('Next: run db/agent-role.sql in the Neon SQL editor, then set AGENT_DATABASE_URL in Vercel.');
await pool.end();
