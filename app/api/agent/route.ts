// Web endpoint for the same agents (the /ask page and the eval runner).
// Rate-limited per IP; proposals are returned but never executed from the web.
import { ask, agentStatus } from '@/lib/agent/run';
import type { AgentKey } from '@/lib/agent/agents';

export const maxDuration = 60;
const PER_HOUR = Number(process.env.AGENT_QUESTIONS_PER_HOUR || 15);
const hits = new Map<string, number[]>();

export async function GET() {
  return Response.json(agentStatus());
}

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const evalKey = process.env.AGENT_EVAL_KEY;
  const isEval = Boolean(evalKey) && req.headers.get('x-eval-key') === evalKey;
  if (!isEval) {
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter((t) => now - t < 3_600_000);
    if (recent.length >= PER_HOUR) return Response.json({ ok: false, error: 'Question limit reached for this hour. Try again later.' }, { status: 429 });
    recent.push(now); hits.set(ip, recent);
  }
  let body: { question?: string; agent?: AgentKey };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: 'Bad request.' }, { status: 400 }); }
  const question = String(body.question || '').trim();
  if (question.length < 3 || question.length > 600) return Response.json({ ok: false, error: 'Ask a question between 3 and 600 characters.' }, { status: 400 });
  const r = await ask(question, isEval && body.agent ? { forceAgent: body.agent } : {});
  return Response.json(r, { status: r.ok ? 200 : 503 });
}
