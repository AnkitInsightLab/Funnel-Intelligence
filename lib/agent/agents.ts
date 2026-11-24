// Four specialist agents behind one router. Each has its own brief and tools; all share
// the approved schema, the SQL rules and the answer contract.
import { SCHEMA, SQL_RULES } from './schema';
import type { Tool } from './llm';

export type AgentKey = 'analyst' | 'investigator' | 'crm' | 'action';

export const AGENT_META: Record<AgentKey, { name: string; emoji: string; job: string }> = {
  analyst: { name: 'Metrics Analyst', emoji: '📊', job: 'Looks up KPIs and answers "what / how much / which" questions.' },
  investigator: { name: 'Root-Cause Investigator', emoji: '🔎', job: 'Explains "why did X change": decomposes, segments, separates facts from hypotheses.' },
  crm: { name: 'Retention & CRM Analyst', emoji: '💬', job: 'Segments, repeat behaviour, lifecycle campaigns and holdout results.' },
  action: { name: 'Growth Planner', emoji: '🧭', job: 'Prioritises actions and drafts alerts; nothing is sent without human approval.' },
};

export const RUN_SQL: Tool = {
  name: 'run_sql',
  description: 'Run one read-only PostgreSQL query (SELECT or WITH) against the approved schema. Returns {columns, rows, row_count, truncated}; at most 50 rows are shown, so aggregate in SQL.',
  input_schema: {
    type: 'object',
    properties: {
      sql: { type: 'string', description: 'One SELECT/WITH statement over the approved tables' },
      purpose: { type: 'string', description: 'What this query checks, in plain English (shown to the user)' },
    },
    required: ['sql', 'purpose'],
  },
};

export const PROPOSE_ACTION: Tool = {
  name: 'propose_action',
  description: 'Propose ONE alert or action for a human to approve. It is not executed: in Slack it appears with Approve / Reject buttons, and only an approval posts it to the team alerts channel.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short action title, e.g. "Hotfix iOS UPI payments"' },
      message: { type: 'string', description: 'The exact message that would be posted to the team channel if approved (under 600 characters)' },
      owner: { type: 'string', description: 'Team that should act: Product, Engineering, Growth, CRM or Finance' },
      expected_impact: { type: 'string', description: 'Expected impact with the number it is based on' },
      measure: { type: 'string', description: 'The metric and threshold that will show whether it worked' },
    },
    required: ['title', 'message', 'owner', 'expected_impact', 'measure'],
  },
};

const CONTRACT = `ANSWER CONTRACT (Slack mrkdwn: *bold*, bullets with •, no tables, no headings with #)
*Answer:* one or two sentences with the key number(s).
*Confirmed by the data:* 2–4 bullets, each with a number you saw in a query result.
*Likely causes (not proven):* only if you are explaining a change; label each as a hypothesis and say what query or test would confirm it.
*Recommended action:* one action, its expected impact (with the number behind it) and how to measure it.
*Caveat:* one honest limit (synthetic data, sample size, definition chosen, correlation vs causation).
Keep it under 220 words. Every number must come from a query result in this conversation; never invent one.
Write rupees in Indian style: ₹14.6 L or ₹1.46 Cr for large amounts, ₹2,264 for small ones. Copy digits exactly from the result; never re-type or re-group them by hand.
If the data cannot answer (e.g. regions, distributors, margins, ad spend are not in the schema), say so plainly and say what data would be needed. Do not guess.
Decline anything unrelated to this business data.`;

const BRIEF: Record<AgentKey, string> = {
  analyst: 'You are the Metrics Analyst for a D2C e-commerce product team. Answer KPI and lookup questions precisely. Prefer one or two well-aggregated queries. State the exact definition you used (e.g. strict funnel, 14-day conversion).',
  investigator: 'You are the Root-Cause Investigator. For "why did X change" questions: (1) confirm the change and its size, (2) decompose it (sessions × conversion × AOV; mix vs rate), (3) cut by platform, app version, source, category, new vs returning to find where it concentrates, (4) check timing against known releases and experiments. Separate what the data confirms from what is only likely. Use up to 5 queries.',
  crm: 'You are the Retention & CRM Analyst. Answer questions about repeat purchase, time to second order, cohorts, RFM-style segments, churn risk against product cycles, and lifecycle campaigns. For campaigns always compare treatment with holdout (incremental lift), never attributed revenue alone, and mention how many treated orders would have happened anyway.',
  action: 'You are the Growth Planner. When asked what to do, gather the evidence with run_sql, rank candidate actions by expected impact and confidence, then call propose_action exactly once for the single most important action. Your text answer lists the top three actions; the proposal is what a human may approve. Never claim an action was taken.',
};

export function systemFor(agent: AgentKey) {
  return `${BRIEF[agent]}\n\n${SCHEMA}\n\n${SQL_RULES}\n\n${CONTRACT}`;
}
export const toolsFor = (agent: AgentKey): Tool[] => (agent === 'action' ? [RUN_SQL, PROPOSE_ACTION] : [RUN_SQL]);

export const ROUTER_SYSTEM = `Route a business question to one specialist. Reply with JSON only: {"agent": "...", "reason": "..."}.
Agents:
- "analyst": what/how much/which questions about KPIs, funnel steps, conversion, AOV, searches, experiments results lookups.
- "investigator": why did something change, drop or spike; root cause; what explains a difference.
- "crm": repeat purchase, retention, cohorts, segments, RFM, churn, lifecycle campaigns, holdouts, CleverTap/MoEngage journeys.
- "action": what should we do / priorities this week / draft an alert / recommend and act.
- "out_of_scope": not about this store's business data (weather, coding help, personal questions, anything else).
"reason" is under 15 words.`;

/** Keyword fallback when the router call fails. */
export function routeByKeywords(q: string): AgentKey | 'out_of_scope' {
  const s = q.toLowerCase();
  if (/\b(why|cause|explain|drop|fell|fall|decline|spike|jump|went down|went up)\b/.test(s)) return 'investigator';
  if (/\b(repeat|retention|cohort|segment|rfm|churn|lapsed|campaign|holdout|whatsapp|email|journey|clevertap|moengage|crm|lifetime|ltv)\b/.test(s)) return 'crm';
  if (/\b(should we|priorit|action|recommend|plan|alert|this week)\b/.test(s)) return 'action';
  if (/\b(order|revenue|session|conversion|cvr|aov|funnel|search|cart|checkout|payment|ios|android|meta|google|experiment|test|kpi)\b/.test(s)) return 'analyst';
  return 'out_of_scope';
}
