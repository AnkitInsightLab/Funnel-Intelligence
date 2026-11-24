// Slack Events API: @mentions in channels and direct messages to the bot.
// Acknowledges within Slack's 3-second limit, then answers in the thread via after().
import { after } from 'next/server';
import { verifySlack, slackApi, answerBlocks, sqlText } from '@/lib/slack';
import { ask } from '@/lib/agent/run';

export const maxDuration = 60;

async function answer(channel: string, threadTs: string, question: string) {
  const thinking = await slackApi('chat.postMessage', { channel, thread_ts: threadTs, text: '🧠 Routing your question to the right analyst and querying the data…' });
  const r = await ask(question);
  const blocks = answerBlocks(question, r);
  const text = r.ok ? r.answer.slice(0, 300) : r.error ?? 'error';
  if (thinking.ok && thinking.ts) await slackApi('chat.update', { channel, ts: thinking.ts, text, blocks });
  else await slackApi('chat.postMessage', { channel, thread_ts: threadTs, text, blocks });
  const sql = sqlText(r);
  if (sql) await slackApi('chat.postMessage', { channel, thread_ts: threadTs, text: sql, unfurl_links: false });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySlack(req, raw)) return new Response('invalid signature', { status: 401 });
  const body = JSON.parse(raw);
  if (body.type === 'url_verification') return Response.json({ challenge: body.challenge });
  // Slack retries if we were slow; the first delivery is already being answered.
  if (req.headers.get('x-slack-retry-num')) return new Response('ok');

  const ev = body.event || {};
  const isMention = ev.type === 'app_mention';
  const isDm = ev.type === 'message' && ev.channel_type === 'im' && !ev.bot_id && !ev.subtype;
  if (body.type === 'event_callback' && (isMention || isDm)) {
    const question = String(ev.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
    if (question) after(() => answer(ev.channel, ev.thread_ts || ev.ts, question).catch((e) => console.error('slack answer', e)));
  }
  return new Response('ok');
}
