// Slash command: /analyst <question>. Replies in the channel (visible to everyone) once
// the agents finish; the immediate reply is only visible to the person who asked.
import { after } from 'next/server';
import { verifySlack, respondUrl, answerBlocks, sqlText } from '@/lib/slack';
import { ask } from '@/lib/agent/run';
import { AGENT_META } from '@/lib/agent/agents';

export const maxDuration = 60;

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySlack(req, raw)) return new Response('invalid signature', { status: 401 });
  const p = new URLSearchParams(raw);
  const question = (p.get('text') || '').trim();
  const responseUrl = p.get('response_url') || '';

  if (!question || question === 'help') {
    return Response.json({
      response_type: 'ephemeral',
      text: '*Ask the analyst team a question about the store data.*\n' + Object.values(AGENT_META).map((a) => `${a.emoji} *${a.name}*: ${a.job}`).join('\n') +
        '\nExamples: `/analyst why did conversion fall in the last 4 weeks?` · `/analyst which customer segment should get the replenishment reminder?` · `/analyst what are the top 3 actions this week?`',
    });
  }
  after(async () => {
    const r = await ask(question);
    await respondUrl(responseUrl, { response_type: 'in_channel', replace_original: false, text: r.ok ? r.answer.slice(0, 300) : r.error, blocks: answerBlocks(question, r) });
    const sql = sqlText(r);
    if (sql) await respondUrl(responseUrl, { response_type: 'ephemeral', text: sql });
  });
  return Response.json({ response_type: 'ephemeral', text: `🧠 Working on: _${question.slice(0, 200)}_` });
}
