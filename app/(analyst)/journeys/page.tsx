import Link from 'next/link';
import results from '@/lib/results.json';
import { LIFECYCLE, REALTIME, EVENT_MAP, PROFILE_PROPS, toCleverTap, toMoEngage, type Journey } from '@/lib/crm';
import SessionJourneys from '@/components/SessionJourneys';
import { SqlBlock, pct, shortDate } from '@/components/Charts';

export const metadata = { title: 'CRM journeys · Funnel Intelligence' };

type Camp = (typeof results.crm.campaigns)[number];
const fmtP = (p: number) => (p < 0.0001 ? '< 0.0001' : p.toFixed(3));
const rupee = (n: number) => (n < 0 ? '−₹' : '₹') + Math.abs(Math.round(n)).toLocaleString('en-IN');

function verdict(c: Camp): { label: string; tone: string } {
  if (c.conv.p < 0.05 && c.incContribution > 0) return { label: 'Scale', tone: 'live' };
  if (c.anywayPct >= 85 && c.incContribution < 0) return { label: 'Stop', tone: 'leak' };
  return { label: 'Keep testing', tone: 'sim' };
}

function sampleSize(p1: number, rel: number) {
  const p2 = p1 * (1 + rel);
  return Math.ceil(((1.959964 + 0.841621) ** 2 * (p1 * (1 - p1) + p2 * (1 - p2))) / (p2 - p1) ** 2);
}

function Steps({ j }: { j: Journey }) {
  return (
    <div>
      {j.steps.map((s) => (
        <div key={s.template}>
          <div className="msg-head"><b>{s.wait}</b><span>{s.channel}</span><span className="tag model">{s.category} template</span>{s.condition && <span>if {s.condition}</span>}<code>{s.template}</code></div>
          <div className={`msg ${s.channel === 'WhatsApp' ? 'wa' : s.channel === 'Email' ? 'email' : 'push'}`}>{s.preview}</div>
        </div>
      ))}
    </div>
  );
}

export default function Journeys() {
  const { crm } = results;
  const camps = crm.campaigns;
  const get = (k: string) => camps.find((c) => c.key === k)!;
  const replen = get('replenishment_reminder'), vip = get('vip_discount'), welcome = get('welcome_series'), winback = get('winback_email');
  const wbNeeded = sampleSize(winback.conv.pc / 100, 0.25);
  const sample = { anonymous_id: 'a_7f3k2m9q', user_id: 'c_10293', event_time: '2026-11-24T14:05:11.320Z', platform: 'web', utm_source: 'whatsapp', order_id: 'HN104221', revenue: 2948 };

  return (
    <>
      <h1>CRM journeys and campaign measurement</h1>
      <p className="lede">
        Four lifecycle journeys (new, repeat, inactive, high-value), each with a permanent holdout, judged on incremental contribution rather than attributed revenue.
        Plus the real-time recovery journeys that match the funnel leaks, and the CleverTap / MoEngage wiring.
      </p>
      <div className="banner" style={{ marginTop: 12 }}>
        <span className="tag sim">Simulated</span> The journeys, sends, opens and clicks are simulated on the synthetic order history, on the CleverTap / MoEngage journey model.
        I have not operated these journeys on a production CleverTap or MoEngage account. <span className="tag live">Live</span> The store&apos;s events are
        forwarded server-side to CleverTap and MoEngage when their keys are set; <Link href="/live">see the integration status</Link>.
      </div>

      <section className="section card">
        <h2>Campaign readout</h2>
        <p className="small muted">Running since {shortDate(crm.campaignStartDay)} 2026 with a {crm.holdoutPct}% holdout per journey, randomised per send. Conversion = any order within 14 days of the send.
          Contribution is measured over 30 days, so orders that were only pulled forward net out. It counts gross margin on list price, discounts, payment fees, fulfilment and message cost (WhatsApp ₹0.80 per delivered marketing message, email ₹0.03; assumptions).</p>
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr><th>Journey</th><th className="r">Recipients</th><th className="r">Read / clicked</th><th className="r">Conv. holdout</th><th className="r">Conv. treated</th><th className="r">Lift (95% CI)</th><th className="r">p</th>
                <th className="r">Lift at 30 d</th><th className="r">Would buy anyway</th><th className="r">Rev / recipient Δ</th><th className="r">Incremental contribution, 30 d</th><th>Call</th></tr>
            </thead>
            <tbody>
              {camps.map((c) => {
                const v = verdict(c);
                return (
                  <tr key={c.key}>
                    <td><b>{c.name}</b><div className="small muted">{c.stage} · {c.channel}</div></td>
                    <td className="r">{c.treatment.recipients.toLocaleString('en-IN')}<div className="small muted">+{c.holdout.recipients.toLocaleString('en-IN')} held out</div></td>
                    <td className="r">{pct(c.funnel.readPct)} / {pct(c.funnel.clickedPct)}</td>
                    <td className="r">{pct(c.conv.pc)}</td><td className="r">{pct(c.conv.pt)}</td>
                    <td className="r">{c.conv.relLiftPct > 0 ? '+' : ''}{pct(c.conv.relLiftPct)}<div className="small muted">{pct(c.conv.ciLowRel)} to {pct(c.conv.ciHighRel)}</div></td>
                    <td className="r">{fmtP(c.conv.p)}</td>
                    <td className="r">{c.conv30.relLiftPct > 0 ? '+' : ''}{pct(c.conv30.relLiftPct)}</td>
                    <td className="r">{c.anywayPct}%</td>
                    <td className="r">{rupee(c.rpr.diff)}<div className="small muted">{rupee(c.rpr.ciLow)} to {rupee(c.rpr.ciHigh)}</div></td>
                    <td className="r" style={{ color: c.incContribution < 0 ? 'var(--leak)' : undefined }}>{rupee(c.incContribution)}{c.conv30.p >= 0.05 && <div className="small muted">not significant</div>}</td>
                    <td><span className={`tag ${v.tone}`}>{v.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <SqlBlock name={['campaign_results', 'replenishment_by_orders']} />
      </section>

      <section className="section grid g2">
        <div className="card small">
          <h3>Scale the replenishment reminder, and report its 30-day lift</h3>
          <p>14-day conversion {pct(replen.conv.pc)} → {pct(replen.conv.pt)} (+{pct(replen.conv.relLiftPct)}), worth {rupee(replen.incContribution)} of contribution over 30 days on
            ₹{replen.msgCost.toLocaleString('en-IN')} of WhatsApp. But at 30 days the lift shrinks to +{pct(replen.conv30.relLiftPct)}: part of the 14-day effect is customers reordering a few days
            <i> earlier</i>, not extra orders. Report the 30-day number to finance, and size the programme on it.</p>
        </div>
        <div className="card small">
          <h3>Stop the VIP discount</h3>
          <p>Holdout Champions converted at {pct(vip.conv.pc)} without any message; treated at {pct(vip.conv.pt)} (p = {fmtP(vip.conv.p)}). {vip.anywayPct}% of the orders would have happened anyway,
            and the 15% code gave away ₹{vip.discountGiven.toLocaleString('en-IN')}. Net over 30 days: <b style={{ color: 'var(--leak)' }}>{rupee(vip.incContribution)}</b>. Attributed revenue would have made this look like the best campaign.
            Replace it with early access or referral credit, which costs nothing unless it changes behaviour.</p>
        </div>
        <div className="card small">
          <h3>Welcome series: measure it on the second order, not 14 days</h3>
          <p>No 14-day effect ({pct(welcome.conv.pc)} vs {pct(welcome.conv.pt)}), which is expected: a new customer&apos;s next order is a product cycle away. At 30 days, {welcome.conv30.relLiftPct > 0 ? '+' : ''}{pct(welcome.conv30.relLiftPct)}.
            The right metric is the 60-day second-order rate. It is cheap (email), so keep it while that readout matures.</p>
        </div>
        <div className="card small">
          <h3>Win-back: promising, underpowered</h3>
          <p>{pct(winback.conv.pc)} → {pct(winback.conv.pt)} (+{pct(winback.conv.relLiftPct)}, p = {fmtP(winback.conv.p)}). To detect a 25% lift at this base rate needs about {wbNeeded.toLocaleString('en-IN')} per arm;
            the holdout has {winback.holdout.recipients.toLocaleString('en-IN')}. Keep running before adding a WhatsApp step.</p>
        </div>
      </section>

      <section className="section">
        <h2>Lifecycle journeys</h2>
        <div className="grid g2">
          {LIFECYCLE.map((j) => {
            const c = get(j.key);
            return (
              <div className="card" key={j.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0 }}>{c.name}</h3><span className="tag sim">simulated</span>
                </div>
                <p className="small muted" style={{ margin: '4px 0 0' }}><b>{j.stage}</b> · trigger: {j.trigger} · exit: {j.exit} · cap: {j.cap} · {crm.holdoutPct}% holdout</p>
                <Steps j={j} />
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        <h2>Real-time recovery journeys (designed from the funnel findings)</h2>
        <p className="small muted">Specified, not simulated. They fire on the store&apos;s live events, so they are the first thing to build once CleverTap or MoEngage receives them.</p>
        <div className="grid g2">
          {REALTIME.map((j) => (
            <div className="card" key={j.key}>
              <h3 style={{ margin: 0 }}>{j.key === 'payment_failed' ? 'Payment failure recovery' : 'Abandoned cart'}</h3>
              <p className="small muted" style={{ margin: '4px 0 0' }}>audience: {j.audience} · exit: {j.exit} · cap: {j.cap}
                {' · '}<Link href={j.key === 'payment_failed' ? '/insights#ios_payments' : '/insights#mass_gainer'}>finding →</Link></p>
              <Steps j={j} />
            </div>
          ))}
        </div>
      </section>

      <section className="section card">
        <h2>CleverTap and MoEngage wiring</h2>
        <p className="small">One data layer, mapped to each vendor&apos;s event names. Funnel and CRM events go server-side from <code>/api/track</code>, which keeps the passcode off the browser. Scroll and click noise stays out of the CRM.</p>
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Data layer event</th><th>CleverTap</th><th>MoEngage</th><th>Properties</th></tr></thead>
            <tbody>{EVENT_MAP.map((e) => <tr key={e.ours}><td><code>{e.ours}</code></td><td>{e.clevertap}</td><td>{e.moengage}</td><td className="small muted">{e.props}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="grid g2" style={{ marginTop: 14 }}>
          <div>
            <h3>User profile properties</h3>
            <table className="tbl"><tbody>{PROFILE_PROPS.map(([k, v]) => <tr key={k}><td><code>{k}</code></td><td className="small muted">{v}</td></tr>)}</tbody></table>
          </div>
          <div>
            <h3>Payloads for one order</h3>
            <div className="small muted">CleverTap <code>POST /1/upload</code></div>
            <pre className="code">{JSON.stringify({ d: [toCleverTap('payment_completed', sample)] }, null, 2)}</pre>
            <div className="small muted" style={{ marginTop: 8 }}>MoEngage <code>POST /v1/event/&#123;app_id&#125;</code></div>
            <pre className="code">{JSON.stringify(toMoEngage('payment_completed', sample), null, 2)}</pre>
          </div>
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>Payload shapes follow each vendor&apos;s public API reference. Confirm field names in your account&apos;s event debugger before relying on them.</p>
      </section>

      <section className="section grid g2">
        <div className="card small">
          <h2>Workflow automation (n8n)</h2>
          <p>The replenishment journey as an n8n workflow: a daily schedule queries Postgres for customers at cycle − 3 days, splits a {crm.holdoutPct}% holdout, sends the WhatsApp template,
            logs every row to <code>campaign_sends</code>, and the readout above is the same SQL run on that table.</p>
          <p><a href="/n8n/replenishment-reminder.json" download>Download the workflow JSON</a> <span className="tag sim">not run here</span></p>
          <p className="muted">Built for n8n 1.x. The WhatsApp step is an HTTP request to the WhatsApp Cloud API with placeholder credentials. Import it, add your own, and test on yourself first.</p>
        </div>
        <SessionJourneys />
      </section>

      <section className="section card small">
        <h2>Rules I would hold the CRM to</h2>
        <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
          <li>Every journey keeps a permanent holdout. A journey without one cannot claim revenue.</li>
          <li>Judge on incremental contribution per recipient, including discounts and message cost, never on attributed revenue.</li>
          <li>Report the 30-day lift next to the 14-day one, to catch pull-forward.</li>
          <li>Consent first: WhatsApp only with opt-in; utility templates for transactional recovery, marketing templates for the rest.</li>
          <li>Frequency caps across journeys, not per journey: one customer should not get welcome, replenishment and win-back in the same week.</li>
        </ol>
      </section>
    </>
  );
}
