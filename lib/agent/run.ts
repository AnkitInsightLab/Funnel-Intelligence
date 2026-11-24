// Runs one question end to end: route → specialist agent loop (guarded SQL, optional
// action proposal) → structured result for Slack or the web page.
import { chat, llmConfigured, MODEL, PROVIDER, LlmError, type Message, type Block, type ToolUseBlock } from './llm';
import { AGENT_META, ROUTER_SYSTEM, routeByKeywords, systemFor, toolsFor, type AgentKey } from './agents';
import { runReadOnly, dbConfigured } from './db';

export interface QueryLog { purpose: string; sql: string; row_count?: number; truncated?: boolean; error?: string; preview?: Record<string, unknown>[] }
export interface Proposal { title: string; message: string; owner: string; expected_impact: string; measure: string }
export interface AgentResult {
  ok: boolean; agent: AgentKey | 'out_of_scope'; agentName: string; reason: string; answer: string;
  queries: QueryLog[]; proposal?: Proposal; provider: string; model: string; ms: number; error?: string;
}

const MAX_ROUNDS = 7;
const MAX_QUERIES = 5;

export const agentStatus = () => ({ llm: llmConfigured(), db: dbConfigured(), provider: PROVIDER, model: MODEL });

async function route(question: string): Promise<{ agent: AgentKey | 'out_of_scope'; reason: string }> {
  try {
    const t = await chat(ROUTER_SYSTEM, [{ role: 'user', content: question }], [], 1024);
    const text = t.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('');
    const m = text.match(/\{[\s\S]*\}/);
    const j = m ? JSON.parse(m[0]) : null;
    if (j && ['analyst', 'investigator', 'crm', 'action', 'out_of_scope'].includes(j.agent)) return { agent: j.agent, reason: String(j.reason || '').slice(0, 120) };
  } catch { /* fall through to keywords */ }
  const agent = routeByKeywords(question);
  return { agent, reason: 'keyword routing (router unavailable)' };
}

export async function ask(question: string, opts: { forceAgent?: AgentKey } = {}): Promise<AgentResult> {
  const t0 = Date.now();
  const base = { provider: PROVIDER, model: MODEL, queries: [] as QueryLog[] };
  const q = question.trim().slice(0, 600);
  if (!llmConfigured() || !dbConfigured()) {
    return { ok: false, agent: 'out_of_scope', agentName: 'Setup', reason: '', answer: '', ...base, ms: 0,
      error: !llmConfigured() ? 'The AI model is not configured (set GEMINI_API_KEY or ANTHROPIC_API_KEY).' : 'The database is not configured (set AGENT_DATABASE_URL).' };
  }
  const { agent, reason } = opts.forceAgent ? { agent: opts.forceAgent, reason: 'forced' } : await route(q);
  if (agent === 'out_of_scope') {
    return { ok: true, agent, agentName: 'Router', reason, ...base, ms: Date.now() - t0,
      answer: 'I only answer questions about Halden Nutrition\'s store data: funnel, conversion, experiments, retention, CRM campaigns and growth. Try "Why did conversion fall in the last 4 weeks?"' };
  }

  const messages: Message[] = [{ role: 'user', content: q }];
  const queries: QueryLog[] = [];
  let proposal: Proposal | undefined;
  let answer = '';
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const turn = await chat(systemFor(agent), messages, toolsFor(agent));
      messages.push({ role: 'assistant', content: turn.content });
      const calls = turn.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');
      if (!calls.length) { answer = turn.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n').trim(); break; }
      const results: Block[] = [];
      for (const c of calls) {
        let content: string;
        if (c.name === 'run_sql') {
          const sql = String(c.input.sql ?? ''), purpose = String(c.input.purpose ?? '');
          if (queries.length >= MAX_QUERIES) content = JSON.stringify({ error: `Query limit (${MAX_QUERIES}) reached. Answer with what you have.` });
          else {
            try {
              const r = await runReadOnly(sql);
              queries.push({ purpose, sql, row_count: r.row_count, truncated: r.truncated, preview: r.rows.slice(0, 5) });
              content = JSON.stringify(r);
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              queries.push({ purpose, sql, error: msg });
              content = JSON.stringify({ error: msg });
            }
          }
        } else if (c.name === 'propose_action' && agent === 'action' && !proposal) {
          proposal = {
            title: String(c.input.title ?? '').slice(0, 120), message: String(c.input.message ?? '').slice(0, 700),
            owner: String(c.input.owner ?? '').slice(0, 40), expected_impact: String(c.input.expected_impact ?? '').slice(0, 300), measure: String(c.input.measure ?? '').slice(0, 300),
          };
          content = JSON.stringify({ status: 'pending_human_approval', note: 'Not executed. A human must approve it in Slack.' });
        } else {
          content = JSON.stringify({ error: 'Tool not available.' });
        }
        results.push({ type: 'tool_result', tool_use_id: c.id, name: c.name, content });
      }
      messages.push({ role: 'user', content: results });
      if (round === MAX_ROUNDS - 1) answer = 'I ran out of steps before finishing. Try a narrower question.';
    }
  } catch (e) {
    const status = e instanceof LlmError ? e.status : 0;
    return { ok: false, agent, agentName: AGENT_META[agent].name, reason, answer: '', queries, proposal, provider: PROVIDER, model: MODEL, ms: Date.now() - t0,
      error: status === 429 ? 'The AI service is rate-limited. Try again in a minute.'
        : `The AI service returned an error (${status || 'network'}: ${e instanceof Error ? e.message.slice(0, 80) : 'unknown'}). Try again; if it repeats, check the model key and AGENT_MODEL.` };
  }
  return { ok: true, agent, agentName: AGENT_META[agent].name, reason, answer, queries, proposal, provider: PROVIDER, model: MODEL, ms: Date.now() - t0 };
}
