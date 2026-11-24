// Slack helpers: request signing, Web API calls and Block Kit rendering for agent answers.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AgentResult, Proposal } from './agent/run';
import { AGENT_META } from './agent/agents';

const API = process.env.SLACK_API_BASE || 'https://slack.com/api';
const TOKEN = process.env.SLACK_BOT_TOKEN || '';
const SECRET = process.env.SLACK_SIGNING_SECRET || '';

export const slackConfigured = () => Boolean(TOKEN && SECRET);

/** Verifies X-Slack-Signature (v0 HMAC-SHA256 of "v0:timestamp:body"), rejecting requests older than 5 minutes. */
export function verifySlack(req: Request, rawBody: string): boolean {
  if (!SECRET) return false;
  const ts = req.headers.get('x-slack-request-timestamp') || '';
  const sig = req.headers.get('x-slack-signature') || '';
  if (!ts || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = 'v0=' + createHmac('sha256', SECRET).update(`v0:${ts}:${rawBody}`).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function slackApi(method: string, body: Record<string, unknown>) {
  const r = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({ ok: false, error: 'bad_json' }));
  if (!j.ok) console.error('slack', method, j.error);
  return j as { ok: boolean; ts?: string; channel?: string; error?: string };
}

export async function respondUrl(url: string, body: Record<string, unknown>) {
  await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch((e) => console.error('response_url', e));
}

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function answerBlocks(question: string, r: AgentResult) {
  const meta = r.agent !== 'out_of_scope' ? AGENT_META[r.agent] : { emoji: '🧭', name: 'Router' };
  const blocks: Record<string, unknown>[] = [
    { type: 'context', elements: [{ type: 'mrkdwn', text: `${meta.emoji} *${meta.name}* · _${cut(question, 140)}_` }] },
    { type: 'section', text: { type: 'mrkdwn', text: cut(r.ok ? r.answer || '(no answer)' : `⚠️ ${r.error}`, 2900) } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `${r.queries.length} read-only ${r.queries.length === 1 ? 'query' : 'queries'} · ${(r.ms / 1000).toFixed(1)} s · ${r.model} · routed: ${cut(r.reason || '-', 80)} · synthetic portfolio data` }] },
  ];
  if (r.proposal) blocks.push(...proposalBlocks(r.proposal));
  return blocks;
}

export function proposalBlocks(p: Proposal) {
  const value = JSON.stringify(p).slice(0, 1990);
  return [
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: cut(`*Proposed action (needs approval):* ${p.title}\n*Owner:* ${p.owner}\n*Expected impact:* ${p.expected_impact}\n*Measure:* ${p.measure}\n*Message to post:*\n>${p.message.replace(/\n/g, '\n>')}`, 2900) } },
    {
      type: 'actions', block_id: 'proposal',
      elements: [
        { type: 'button', style: 'primary', text: { type: 'plain_text', text: 'Approve and post' }, action_id: 'approve_action', value },
        { type: 'button', style: 'danger', text: { type: 'plain_text', text: 'Reject' }, action_id: 'reject_action', value: 'reject' },
      ],
    },
  ];
}

export function sqlText(r: AgentResult) {
  if (!r.queries.length) return null;
  return cut(r.queries.map((q, i) => `*${i + 1}. ${q.purpose}* ${q.error ? `(blocked/failed: ${q.error})` : `(${q.row_count} rows)`}\n\`\`\`${cut(q.sql, 900)}\`\`\``).join('\n'), 3900);
}
