// Approve / Reject buttons on an agent's proposed action. The agent never acts on its
// own: only an approval here posts the message to the alerts channel.
import { verifySlack, slackApi } from '@/lib/slack';
import type { Proposal } from '@/lib/agent/run';

const ALERT_CHANNEL = process.env.SLACK_ALERT_CHANNEL || '';
const APPROVERS = (process.env.SLACK_APPROVER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySlack(req, raw)) return new Response('invalid signature', { status: 401 });
  const payload = JSON.parse(new URLSearchParams(raw).get('payload') || '{}');
  if (payload.type !== 'block_actions') return new Response('ok');
  const action = payload.actions?.[0];
  const user = payload.user?.id as string;
  const channel = payload.channel?.id as string;
  const ts = payload.message?.ts as string;
  const blocks = (payload.message?.blocks || []).filter((b: { block_id?: string }) => b.block_id !== 'proposal');
  const note = (text: string) => slackApi('chat.update', { channel, ts, text, blocks: [...blocks, { type: 'context', elements: [{ type: 'mrkdwn', text }] }] });

  if (APPROVERS.length && !APPROVERS.includes(user)) {
    await slackApi('chat.postEphemeral', { channel, user, text: 'Only the configured approvers can approve or reject agent actions.' });
    return new Response('ok');
  }
  if (action?.action_id === 'reject_action') {
    await note(`❌ Rejected by <@${user}>. Nothing was posted.`);
    return new Response('ok');
  }
  if (action?.action_id === 'approve_action') {
    let p: Proposal;
    try { p = JSON.parse(action.value); } catch { return new Response('ok'); }
    if (!ALERT_CHANNEL) {
      await note(`⚠️ Approved by <@${user}>, but SLACK_ALERT_CHANNEL is not set, so nothing was posted.`);
      return new Response('ok');
    }
    const posted = await slackApi('chat.postMessage', {
      channel: ALERT_CHANNEL,
      text: `${p.title}: ${p.message}`,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `*${p.title}* (owner: ${p.owner})\n${p.message}` } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `Expected impact: ${p.expected_impact} · Measure: ${p.measure} · proposed by the Growth Planner agent, approved by <@${user}>` }] },
      ],
    });
    await note(posted.ok ? `✅ Approved by <@${user}> and posted to <#${ALERT_CHANNEL}>.` : `⚠️ Approved by <@${user}>, but posting failed (${posted.error}).`);
  }
  return new Response('ok');
}
