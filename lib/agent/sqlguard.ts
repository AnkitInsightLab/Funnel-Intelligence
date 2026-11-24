// Validates agent-written SQL before it reaches the database. Layered with a READ ONLY
// transaction, a statement timeout and (in production) a SELECT-only database role.
import { ALLOWED_TABLES } from './schema';

const FORBIDDEN = /\b(insert|update|delete|merge|drop|alter|create|grant|revoke|truncate|copy|call|do|vacuum|analyze|set|reset|lock|listen|notify|prepare|execute|deallocate|comment|refresh|cluster|reindex|discard|begin|commit|rollback|savepoint|pg_sleep|pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|lo_import|lo_export|dblink|current_setting|set_config|pg_terminate_backend|pg_cancel_backend)\b/i;
const ALLOWED_FUNCS_IN_FROM = new Set(['generate_series', 'unnest', 'lateral']);

export interface GuardResult { ok: boolean; sql?: string; error?: string }

export function guardSql(input: string): GuardResult {
  if (typeof input !== 'string' || !input.trim()) return { ok: false, error: 'Empty query.' };
  if (input.length > 6000) return { ok: false, error: 'Query too long.' };
  // remove comments, then string literals, before looking at keywords
  let sql = input.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').trim().replace(/;\s*$/, '');
  const bare = sql.replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""');
  if (bare.includes(';')) return { ok: false, error: 'Only one statement is allowed.' };
  if (!/^\s*(select|with)\b/i.test(bare)) return { ok: false, error: 'Only SELECT or WITH queries are allowed.' };
  const bad = bare.match(FORBIDDEN);
  if (bad) return { ok: false, error: `"${bad[0]}" is not allowed in agent queries.` };
  if (/\b(pg_catalog|information_schema|pg_[a-z_]+)\s*\./i.test(bare) || /\bpg_(class|namespace|roles|user|shadow|authid|stat_[a-z_]+|settings)\b/i.test(bare)) {
    return { ok: false, error: 'System catalogs are not allowed.' };
  }
  const ctes = new Set<string>();
  for (const m of bare.matchAll(/(?:\bwith\b|,)\s*(?:recursive\s+)?([a-z_][a-z0-9_]*)\s*(?:\([^)]*\))?\s+as\s*(?:materialized\s+|not\s+materialized\s+)?\(/gi)) ctes.add(m[1].toLowerCase());
  for (const m of bare.matchAll(/\b(from|join)\s+([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)\s*(\()?/gi)) {
    const name = m[2].toLowerCase();
    if (m[3] && ALLOWED_FUNCS_IN_FROM.has(name)) continue;
    if (name === 'lateral') continue;
    if (ctes.has(name)) continue;
    if (!(ALLOWED_TABLES as readonly string[]).includes(name)) return { ok: false, error: `Table "${name}" is not in the approved schema.` };
  }
  return { ok: true, sql };
}
