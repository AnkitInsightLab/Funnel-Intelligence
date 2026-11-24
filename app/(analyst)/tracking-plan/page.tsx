import { EVENTS, COMMON_PROPS, QA_CHECKLIST, type PropSpec } from '@/lib/tracking-plan';

export const metadata = { title: 'Tracking plan · Funnel Intelligence' };

function Props({ props }: { props: PropSpec[] }) {
  return (
    <div className="scroll-x">
      <table className="tbl">
        <thead><tr><th>Property</th><th>Type</th><th>Required</th><th>Example</th><th>Notes</th></tr></thead>
        <tbody>
          {props.map((p) => (
            <tr key={p.name}>
              <td><code>{p.name}</code></td><td>{p.type}</td><td>{p.required ? 'yes' : 'no'}</td>
              <td><code>{JSON.stringify(p.example)}</code></td><td className="small muted">{p.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TrackingPlan() {
  const example = { event: 'add_to_cart', anonymous_id: 'a_7f3k2m9q', session_id: 's_lq3x8a_2', platform: 'web', utm_source: 'meta_ads', is_returning: false,
    page_type: 'product', event_time: '2026-11-24T14:05:11.320Z', product_id: 'MG-3KG-CHOC', category: 'mass_gainer', price: 2799, quantity: 1 };
  return (
    <>
      <h1>Tracking plan</h1>
      <p className="lede">
        The event taxonomy and implementation spec for web and app. It lives in code (<code>lib/tracking-plan.ts</code>): this page renders it, and the live store&apos;s
        data layer validates every push against it, so the spec and the implementation can&apos;t drift apart.
      </p>

      <section className="section grid g2">
        <div className="card small">
          <h3>Conventions</h3>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
            <li>Event names are <code>object_action</code>, snake_case, past tense: <code>product_viewed</code>, not <code>ViewProduct</code>.</li>
            <li>Properties are snake_case. Money is a number in ₹, never a formatted string.</li>
            <li>Business events (cart, checkout, payment) fire on server confirmation, not on button tap.</li>
            <li>One data layer: <code>window.dataLayer.push</code>, then fan out to Mixpanel, PostHog and the warehouse. No direct vendor calls in feature code.</li>
            <li>New events or properties go through this plan first: name, trigger, owner, and the question they answer.</li>
          </ul>
        </div>
        <div className="card small">
          <h3>Example push</h3>
          <pre style={{ background: 'var(--code-bg)', color: 'var(--code-ink)', padding: 12, borderRadius: 8, overflowX: 'auto', margin: 0 }}>
{`window.dataLayer.push(${JSON.stringify(example, null, 2)});`}
          </pre>
        </div>
      </section>

      <section className="section card">
        <h2>Common properties (added by the data layer to every event)</h2>
        <Props props={COMMON_PROPS} />
      </section>

      <section className="section">
        <h2>Events</h2>
        <div className="grid" style={{ gap: 14 }}>
          {EVENTS.map((e) => (
            <div className="card" key={e.name} id={e.name}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <h3 style={{ margin: 0 }}><code style={{ fontSize: 15 }}>{e.name}</code></h3>
                <span className="small muted">→ {e.destinations.join(' · ')}</span>
              </div>
              <p className="small" style={{ margin: '6px 0' }}><b>Fires when:</b> {e.trigger}. <b>Answers:</b> {e.why}.</p>
              {e.props.length > 0 ? <Props props={e.props} /> : <p className="small muted" style={{ margin: 0 }}>Common properties only.</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="section card">
        <h2>QA checklist before a release goes out</h2>
        <ol className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
          {QA_CHECKLIST.map((c) => <li key={c}>{c}</li>)}
        </ol>
        <p className="small muted" style={{ marginTop: 10 }}>
          Try it: open the <a href="/store">store</a>, click &ldquo;Data layer&rdquo; at the bottom right, and add something to the cart. Each event shows its payload,
          any missing required property, and which destinations accepted it.
        </p>
      </section>
    </>
  );
}
