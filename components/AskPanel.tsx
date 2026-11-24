'use client';
import { useEffect, useState } from 'react';

interface QueryLog { purpose: string; sql: string; row_count?: number; error?: string; preview?: Record<string, unknown>[] }
interface Proposal { title: string; message: string; owner: string; expected_impact: string; measure: string }
interface Result { ok: boolean; agent: string; agentName: string; reason: string; answer: string; queries: QueryLog[]; proposal?: Proposal; model: string; ms: number; error?: string }
interface Status { llm: boolean; db: boolean; provider: string; model: string }

const SAMPLES: [string, string[]][] = [
  ['📊 Metrics Analyst', ['What was session conversion in the last 4 weeks, by platform?', 'Which traffic source has the lowest product-view rate?']],
  ['🔎 Root-Cause Investigator', ['Why did blended conversion fall between the first and last 4 weeks?', 'Why did iOS checkout completion drop in October?']],
  ['💬 Retention & CRM', ['Did the replenishment reminder work, and how much of it is pull-forward?', 'Should we keep the VIP discount campaign?']],
  ['🧭 Growth Planner', ['What are the three highest-priority actions this week?']],
  ['🚫 Should be declined', ['Why did revenue fall in the North region?']],
];

// Minimal Slack-mrkdwn renderer: *bold*, _italic_, • bullets. No HTML injection.
function Mrkdwn({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((p, i) =>
    p.startsWith('*') && p.endsWith('*') && p.length > 2 ? <b key={i}>{p.slice(1, -1)}</b>
      : p.startsWith('_') && p.endsWith('_') && p.length > 2 ? <i key={i}>{p.slice(1, -1)}</i> : <span key={i}>{p}</span>);
  return (
    <div className="small" style={{ lineHeight: 1.6 }}>
      {text.split('\n').map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} style={{ height: 6 }} />;
        if (/^[•\-*]\s/.test(t)) return <div key={i} style={{ paddingLeft: 16, textIndent: -10 }}>• {inline(t.replace(/^[•\-*]\s/, ''))}</div>;
        return <div key={i}>{inline(t)}</div>;
      })}
    </div>
  );
}

export default function AskPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => { fetch('/api/agent').then((r) => r.json()).then(setStatus).catch(() => setStatus(null)); }, []);
  const ready = status?.llm && status?.db;

  const submit = async (question: string) => {
    setQ(question); setBusy(true); setErr(''); setRes(null);
    try {
      const r = await fetch('/api/agent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question }) });
      const j = await r.json();
      if (!j.ok && j.error) setErr(j.error);
      if (j.agent) setRes(j);
    } catch { setErr('Could not reach the agents.'); }
    setBusy(false);
  };

  return (
    <div className="grid g2" style={{ alignItems: 'start' }}>
      <div className="card">
        <div className="small" style={{ marginBottom: 8 }}>
          Status: {status === null ? 'checking…' : <>
            <span className={`tag ${status.llm ? 'live' : 'sim'}`}>model {status.llm ? `${status.provider} · ${status.model}` : 'not configured'}</span>{' '}
            <span className={`tag ${status.db ? 'live' : 'sim'}`}>database {status.db ? 'connected' : 'not configured'}</span></>}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) submit(q.trim()); }}>
          <textarea value={q} onChange={(e) => setQ(e.target.value)} rows={3} maxLength={600} placeholder="Ask about funnel, conversion, experiments, retention, campaigns or priorities…"
            aria-label="Question" style={{ width: '100%', font: 'inherit', padding: 10, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)' }} />
          <button className="btn" type="submit" disabled={busy || !ready || !q.trim()} style={{ marginTop: 8 }}>{busy ? 'Agents working…' : 'Ask'}</button>
        </form>
        {!ready && status && <p className="small muted" style={{ marginTop: 8 }}>The agents need an AI key and the Neon database on this deployment. The design, prompts, guardrails and eval set are on this page either way.</p>}
        <div style={{ marginTop: 14 }}>
          {SAMPLES.map(([agent, qs]) => (
            <div key={agent} style={{ marginBottom: 8 }}>
              <div className="small muted">{agent}</div>
              {qs.map((s) => <button key={s} className="btn ghost" disabled={busy || !ready} onClick={() => submit(s)} style={{ margin: '4px 6px 0 0', whiteSpace: 'normal', textAlign: 'left', fontSize: 13 }}>{s}</button>)}
            </div>
          ))}
        </div>
      </div>
      <div className="card" aria-live="polite">
        {!res && !err && !busy && <p className="small muted">The answer appears here, with the agent that took it, every SQL query it ran, and any action it proposes.</p>}
        {busy && <p className="small">Routing to a specialist, writing SQL against the approved schema, checking results…</p>}
        {err && <p className="small down">{err}</p>}
        {res && res.ok && (
          <>
            <div className="small muted" style={{ marginBottom: 8 }}><b style={{ color: 'var(--ink)' }}>{res.agentName}</b> · routed: {res.reason} · {(res.ms / 1000).toFixed(1)} s · {res.model}</div>
            <Mrkdwn text={res.answer} />
            {res.proposal && (
              <div className="card" style={{ marginTop: 12, background: 'var(--soft)' }}>
                <div className="small"><span className="tag model">needs human approval</span> <b>{res.proposal.title}</b> · owner {res.proposal.owner}</div>
                <p className="small" style={{ margin: '6px 0' }}>{res.proposal.message}</p>
                <div className="small muted">Impact: {res.proposal.expected_impact} · Measure: {res.proposal.measure}</div>
                <button className="btn" disabled style={{ marginTop: 8 }}>Approve (in Slack only)</button>
              </div>
            )}
            {res.queries.length > 0 && <h3 style={{ marginTop: 14 }}>Queries ({res.queries.length}, read-only)</h3>}
            {res.queries.map((x, i) => (
              <details className="sql" key={i} open={i === 0}>
                <summary>{i + 1}. {x.purpose} {x.error ? <span className="down">· blocked/failed: {x.error}</span> : <span>· {x.row_count} rows</span>}</summary>
                <pre>{x.sql}</pre>
              </details>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
