import AskPanel from '@/components/AskPanel';
import evals from '@/lib/eval-results.json';
import { AGENT_META } from '@/lib/agent/agents';

export const metadata = { title: 'AI analysts · Funnel Intelligence' };

type Summary = { runAt: string; n: number; pass: number; routing: number; factual: number; proposals: number; unsupportedHandled: number; sqlSuccess: number; medianSeconds: number };

export default function Ask() {
  const s = evals.summary as Summary | null;
  return (
    <>
      <h1>AI analyst agents</h1>
      <p className="lede">
        Four specialist agents behind one router, available in Slack (<code>@analyst</code>, DM or <code>/analyst</code>) and here. They write SQL only against an approved schema,
        run it read-only, separate confirmed facts from hypotheses, and propose actions that a human must approve before anything is posted.
      </p>
      <div className="banner" style={{ marginTop: 12 }}>
        <span className="tag live">Live</span> Real model calls and real SQL against the Neon copy of the dataset when keys are configured. <span className="tag sim">Synthetic</span> The data they query is the same synthetic history as the rest of the site.
      </div>

      <section className="section">
        <AskPanel />
      </section>

      <section className="section grid g2">
        <div className="card small">
          <h2>How it works</h2>
          <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            <li><b>Router</b> classifies the question to one specialist, or declines it if it is not about the business data.</li>
            {Object.values(AGENT_META).map((a) => <li key={a.name}><b>{a.emoji} {a.name}</b>: {a.job}</li>)}
            <li><b>Answer contract:</b> answer → confirmed by the data → likely causes (labelled hypotheses) → recommended action with impact and measure → caveat. Every number must come from a query in that conversation.</li>
          </ol>
        </div>
        <div className="card small">
          <h2>Guardrails</h2>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            <li>SQL is validated before it runs: one SELECT/WITH statement, approved tables only, no system catalogs, no write or admin keywords.</li>
            <li>Every query runs inside a <code>READ ONLY</code> transaction with an 8-second timeout, as a SELECT-only database role, capped at 200 rows (50 shown to the model).</li>
            <li>At most 5 queries and 7 model turns per question; web questions are rate-limited per visitor.</li>
            <li>The Growth Planner can only <i>propose</i>. In Slack the proposal carries Approve / Reject buttons, optionally limited to named approvers; only an approval posts to the alerts channel.</li>
            <li>Slack requests are verified with the signing secret; the model key and database password never reach the browser.</li>
          </ul>
        </div>
      </section>

      <section className="section card">
        <h2>Evaluation set</h2>
        <p className="small muted">31 questions: 24 with expected answers taken from the build&apos;s own SQL results (within a stated tolerance), 3 that must produce an approval-gated proposal, and 4 the agents must refuse or flag as unsupported (regions, distributors, weather, a delete request). Scores: routing, SQL success, factual accuracy, unsupported-claim handling, latency. Source: <code>scripts/eval.mjs</code>.</p>
        {s ? (
          <div className="grid g4">
            {[['Overall pass', s.pass], ['Factual accuracy', s.factual], ['Routing', s.routing], ['Unsupported handled', s.unsupportedHandled], ['SQL success', s.sqlSuccess], ['Proposals', s.proposals]].map(([l, v]) => (
              <div className="card kpi" key={l as string}><div className="label">{l}</div><div className="value">{v}%</div></div>
            ))}
            <div className="card kpi"><div className="label">Median latency</div><div className="value">{s.medianSeconds} s</div></div>
            <div className="card kpi"><div className="label">Last run</div><div className="value" style={{ fontSize: '1rem' }}>{new Date(s.runAt).toLocaleString('en-IN')}</div></div>
          </div>
        ) : (
          <p className="small"><span className="tag sim">not run yet</span> The set runs against the deployed agents (it needs the real model and database), so its scores appear here after the first run. No numbers are shown until then.</p>
        )}
      </section>
    </>
  );
}
