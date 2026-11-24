// Local stand-in for Neon when testing the agents without a database account:
// builds the same tables in an in-process PGlite (takes ~15 s on first use).
// Enabled only with AGENT_LOCAL_PGLITE=1; never used on Vercel.
import { PGlite } from '@electric-sql/pglite';
import { datasetStatements, schemaSql, sessionsSql } from './dataset.mjs';

export async function createLocalDb() {
  const db = new PGlite();
  await db.exec(schemaSql());
  for (const stmt of datasetStatements()) await db.exec(stmt);
  await db.exec(sessionsSql());
  return {
    async query(sql) { const r = await db.query(sql); return { rows: r.rows, fields: r.fields.map((f) => f.name) }; },
  };
}
