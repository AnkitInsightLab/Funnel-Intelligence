// Read-only query execution for the agents.
// Production: Neon via AGENT_DATABASE_URL (a SELECT-only role), falling back to DATABASE_URL.
// Local testing: AGENT_LOCAL_PGLITE=1 builds the dataset in-process (never on Vercel).
import { Pool, neonConfig } from '@neondatabase/serverless';
import { guardSql } from './sqlguard';

const URL = process.env.AGENT_DATABASE_URL || process.env.DATABASE_URL;
const MAX_ROWS = 200;
const SHOW_ROWS = 50;

export interface QueryResult { columns: string[]; rows: Record<string, unknown>[]; row_count: number; truncated: boolean }

type Local = { query: (sql: string) => Promise<{ rows: Record<string, unknown>[]; fields: string[] }> };
const g = globalThis as unknown as { __agentPool?: Pool; __agentLocal?: Promise<Local> };

export const dbConfigured = () => Boolean(URL) || process.env.AGENT_LOCAL_PGLITE === '1';

async function local(): Promise<Local> {
  if (!g.__agentLocal) {
    const path = process.cwd().replace(/\\/g, '/') + '/scripts/local-db.mjs';
    g.__agentLocal = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ 'file:///' + path.replace(/^\/+/, '')).then((m) => m.createLocalDb());
  }
  return g.__agentLocal;
}

function pool(): Pool {
  if (!g.__agentPool) {
    if (typeof WebSocket !== 'undefined') neonConfig.webSocketConstructor = WebSocket;
    g.__agentPool = new Pool({ connectionString: URL, max: 3 });
  }
  return g.__agentPool;
}

export async function runReadOnly(rawSql: string): Promise<QueryResult> {
  const guard = guardSql(rawSql);
  if (!guard.ok) throw new Error(guard.error);
  const wrapped = `SELECT * FROM (${guard.sql}) AS agent_q LIMIT ${MAX_ROWS + 1}`;
  let rows: Record<string, unknown>[];
  let columns: string[];
  if (URL) {
    const client = await pool().connect();
    try {
      await client.query('BEGIN READ ONLY');
      await client.query("SET LOCAL statement_timeout = '8s'");
      const r = await client.query(wrapped);
      rows = r.rows; columns = r.fields.map((f) => f.name);
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  } else if (process.env.AGENT_LOCAL_PGLITE === '1') {
    const r = await (await local()).query(wrapped);
    rows = r.rows; columns = r.fields;
  } else {
    throw new Error('No database configured for the agents.');
  }
  const truncated = rows.length > SHOW_ROWS;
  return { columns, rows: rows.slice(0, SHOW_ROWS).map(clean), row_count: Math.min(rows.length, MAX_ROWS), truncated };
}

// Dates and bigints to JSON-safe values, numbers rounded for the model.
function clean(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) out[k] = v.toISOString().slice(0, 19).replace('T', ' ');
    else if (typeof v === 'bigint') out[k] = Number(v);
    else if (typeof v === 'number' && !Number.isInteger(v)) out[k] = Math.round(v * 100) / 100;
    else out[k] = v;
  }
  return out;
}
