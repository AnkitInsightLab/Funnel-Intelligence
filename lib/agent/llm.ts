// One chat turn with tools, for Gemini (GEMINI_API_KEY) or Claude (ANTHROPIC_API_KEY).
// Internally everything uses Claude-style content blocks; Gemini is translated in and out.
// Gemini's function-call ids and thought signatures ride along on the blocks and are sent
// back unchanged, which its thinking models require.

export interface TextBlock { type: 'text'; text: string; _sig?: string }
export interface ToolUseBlock { type: 'tool_use'; id: string; name: string; input: Record<string, unknown>; _gid?: string | null; _sig?: string }
export interface ToolResultBlock { type: 'tool_result'; tool_use_id: string; content: string; name?: string; _gid?: string | null }
export type Block = TextBlock | ToolUseBlock | ToolResultBlock;
export interface Message { role: 'user' | 'assistant'; content: string | Block[] }
export interface Tool { name: string; description: string; input_schema: Record<string, unknown> }
export interface Turn { content: Block[]; stop_reason: 'tool_use' | 'end_turn' }

const GEMINI = Boolean(process.env.GEMINI_API_KEY);
const KEY = process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY || '';
export const MODEL = process.env.AGENT_MODEL || (GEMINI ? 'gemini-3.5-flash-lite' : 'claude-haiku-5-5');
export const PROVIDER = GEMINI ? 'gemini' : process.env.ANTHROPIC_API_KEY ? 'claude' : 'none';
const ABASE = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
const GBASE = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';

export const llmConfigured = () => Boolean(KEY);

class LlmError extends Error { constructor(public status: number, msg: string) { super(msg); } }
export { LlmError };

function toGemini(messages: Message[]) {
  const gid: Record<string, string> = {};
  for (const m of messages) if (Array.isArray(m.content)) for (const b of m.content) if (b.type === 'tool_use' && b._gid) gid[b.id] = b._gid;
  return messages.map((m) => {
    const role = m.role === 'assistant' ? 'model' : 'user';
    if (typeof m.content === 'string') return { role, parts: [{ text: m.content }] };
    const parts = m.content.map((b) => {
      if (b.type === 'text') return b._sig ? { text: b.text, thoughtSignature: b._sig } : { text: b.text };
      if (b.type === 'tool_use') {
        const fc: Record<string, unknown> = { name: b.name, args: b.input || {} };
        if (b._gid) fc.id = b._gid;
        return b._sig ? { functionCall: fc, thoughtSignature: b._sig } : { functionCall: fc };
      }
      let response: Record<string, unknown>;
      try { response = { result: JSON.parse(b.content) }; } catch { response = { error: String(b.content) }; }
      const fr: Record<string, unknown> = { name: b.name || 'run_sql', response };
      const id = gid[b.tool_use_id];
      if (id) fr.id = id;
      return { functionResponse: fr };
    });
    return { role, parts };
  });
}

async function gemini(system: string, messages: Message[], tools: Tool[], maxTokens: number): Promise<Turn> {
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: system }] },
    contents: toGemini(messages),
    generationConfig: { maxOutputTokens: maxTokens },
  };
  if (tools.length) body.tools = [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.input_schema })) }];
  const r = await fetch(`${GBASE}/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
    method: 'POST', headers: { 'x-goog-api-key': KEY, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new LlmError(r.status, j?.error?.status || j?.error?.message || 'gemini_error');
  const parts = j?.candidates?.[0]?.content?.parts || [];
  const content: Block[] = [];
  parts.forEach((p: Record<string, any>, i: number) => {
    if (p.functionCall) content.push({ type: 'tool_use', id: p.functionCall.id || `gc_${Date.now()}_${i}`, _gid: p.functionCall.id || null, _sig: p.thoughtSignature, name: p.functionCall.name, input: p.functionCall.args || {} });
    else if (typeof p.text === 'string' && !p.thought) content.push({ type: 'text', text: p.text, _sig: p.thoughtSignature });
  });
  if (!content.length) throw new LlmError(502, j?.promptFeedback?.blockReason || j?.candidates?.[0]?.finishReason || 'empty');
  return { content, stop_reason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn' };
}

async function claude(system: string, messages: Message[], tools: Tool[], maxTokens: number): Promise<Turn> {
  const strip = messages.map((m) => typeof m.content === 'string' ? m : {
    role: m.role,
    content: m.content.map((b) => b.type === 'text' ? { type: 'text', text: b.text }
      : b.type === 'tool_use' ? { type: 'tool_use', id: b.id, name: b.name, input: b.input }
      : { type: 'tool_result', tool_use_id: b.tool_use_id, content: b.content }),
  });
  const r = await fetch(`${ABASE}/v1/messages`, {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: strip, ...(tools.length ? { tools } : {}) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new LlmError(r.status, j?.error?.type || 'anthropic_error');
  return { content: j.content, stop_reason: j.stop_reason === 'tool_use' ? 'tool_use' : 'end_turn' };
}

// Thinking models count their reasoning against the output limit, so a hard question can
// end with an empty reply (finishReason MAX_TOKENS). Retry once with double the budget,
// and once after a short pause on temporary server errors (5xx, overloaded).
const transient = (e: unknown) => e instanceof LlmError && (e.status >= 500 || e.status === 0);
const outOfTokens = (e: unknown) => e instanceof LlmError && /MAX_TOKENS|empty/i.test(e.message);

export async function chat(system: string, messages: Message[], tools: Tool[] = [], maxTokens = 8192): Promise<Turn> {
  if (!KEY) throw new LlmError(503, 'no_llm_key');
  const call = (n: number) => (GEMINI ? gemini(system, messages, tools, n) : claude(system, messages, tools, n));
  try {
    return await call(maxTokens);
  } catch (e) {
    if (outOfTokens(e)) return call(Math.min(maxTokens * 2, 32768));
    if (transient(e)) { await new Promise((r) => setTimeout(r, 1500)); return call(maxTokens); }
    throw e;
  }
}
