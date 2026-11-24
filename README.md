# Funnel Intelligence

A product and growth analytics case study built the way the job is done: an instrumented storefront, a tracking plan,
funnel and segment analysis, a release-impact read, a clickmap, A/B test readouts, retention and RFM, lifecycle CRM
journeys measured against holdouts, unit economics, and a plan to 2× revenue. Every chart shows the SQL that produced it.

**Business problem.** Traffic to Halden Nutrition (a fictional D2C supplements store) is up ~75% quarter on quarter,
but revenue is up only ~54%, and most customers buy once. Where do shoppers drop off, which customers are worth
money, and what should we change first?

## What I found

**Funnel (13 weeks of events)**

| # | Finding | Evidence | What I'd do | How we'd know |
|---|---|---|---|---|
| 1 | Traffic grew in the lowest-intent channel | Meta ads went from 12% to 28% of sessions and convert at under half the rate of every other paid or organic source. The mix shift explains more than the whole drop in blended conversion. | Ad-matched landing pages instead of the home page | Meta session → product view, Meta CVR |
| 2 | iOS app 4.2 broke UPI payments | iOS payment failures 2% → 18% after 10 Oct; Android flat. Diff-in-diff −6 pts on checkout → paid | Hotfix the UPI intent hand-off | iOS UPI failure rate < 5% |
| 3 | Mass gainer carts abandon at the delivery fee | Cart → checkout 36% vs 65% for other carts; no gap after checkout starts | Show the ₹149 fee on the product page, then test absorbing it | Gainer cart → checkout |
| 4 | Failed coupons cut payment completion by more than a third | 46% paid after a failed coupon vs 77% without | Show eligible coupons and their minimum in the cart | Checkout → paid for coupon users |
| 5 | One search in seven returns nothing | 14% zero-result rate; top misses are synonyms, typos and Hinglish | Synonyms, spell-correct, "did you mean" | Zero-result rate < 5% |

Experiments: the sticky add-to-cart bar wins on add-to-cart but pushes AOV past its guardrail, because it skips the
cross-sell. The one-page checkout test is **invalid**: both tests bucketed users with the same hash, so every user
exposed to both landed in matching arms. A cross-experiment overlap check proves the cause.

**Retention and CRM (12 months of orders)**

- 31% of customers place a second order within 90 days; the median gap is ~39 days, close to the product cycles.
- Replenishment windows per product set the send day for reminders: 3 days before the 25th-percentile reorder day.
- The **replenishment reminder** lifts 14-day conversion by ~42%, but only ~14% at 30 days: part of the effect is
  orders pulled forward. Contribution is reported on the 30-day window.
- The **VIP 15% discount** to Champions shows no significant lift: ~96% of those orders would have happened anyway,
  so it loses money. Stop it.
- Meta's LTV:CAC is ~2.3× against Google's ~6×. Fix landing pages before adding Meta budget.

**Shipped fixes (`/fixes`): from finding to measured customer value**

Each customer problem is fixed in the live store behind a feature flag with a control group, and `/fixes` reads
control vs treatment from live events. A lift is shown only once both arms reach their planned sample size.

| Customer problem | Fix live in the store | Flag | Metric |
|---|---|---|---|
| UPI payment failed, unsure if charged, gave up | "You were not charged", cart kept, one-tap retry by UPI ID or COD | `fix_payment_retry` | Paid after a failed attempt |
| ₹149 delivery fee appears first in the cart | Fee shown under the price for 3 kg+ packs | `fix_fee_on_pdp` | Reached checkout |
| Coupon from the ad rejected at the last step | Cart lists working codes and "add ₹X more" for the rest | `fix_coupon_hints` | Cart → paid |
| "weight gainer", "protien", "sasta" find nothing | Synonyms, typo tolerance, price intent, "did you mean" | `fix_search_synonyms` | Viewed a product after searching |
| "Lab tested" badge does nothing when clicked | Badge opens the batch lab report | `fix_lab_report` | Added to cart |
| Customers run out and buy elsewhere | Opt-in reminder timed to the product's run-out date, with consent | `fix_replenish_optin` | Reminder opt-in rate |

In PostHog, create these six flags (multivariate, variants `control` and `test`, 50/50) to control the split from
PostHog. Without them, a stable hash of the visitor id splits traffic, and everything still works.

**AI analyst agents (Slack + `/ask`)**

A router sends each question to one of four specialists: Metrics Analyst, Root-Cause Investigator,
Retention & CRM Analyst and Growth Planner. They write SQL only against an approved schema, run it read-only on
Neon, separate confirmed facts from hypotheses, and recommend one action with its expected impact and measurement.
The Growth Planner can only *propose*: in Slack the proposal carries Approve / Reject buttons, and only an
approval posts it to the alerts channel. A 31-question eval set (`npm run eval`) scores routing, SQL success,
factual accuracy against the build's own numbers, unsupported-claim handling and latency.

All numbers come from the build and change if the generator changes. The app is the source of truth.

## What is live and what is simulated

| Part | Status |
|---|---|
| Storefront (`/store`), data layer, tracking-plan validation, on-page inspector | **Live** |
| Mixpanel, PostHog (events + `pdp_sticky_atc` flag), Microsoft Clarity | **Live** once keys are set; reported as "off" otherwise, never faked |
| Postgres event store (`/api/track` → Neon) and the `/live` funnel | **Live** once `DATABASE_URL` is set |
| CleverTap / MoEngage event forwarding (server-side) | **Live** once their keys are set |
| 13-week event history (~56k sessions) and 12-month order history (~13.6k customers) | **Synthetic**, generated with planted problems so the analysis can be checked against a known answer |
| Lifecycle journeys, sends, opens, clicks, holdouts | **Simulated** on the synthetic orders, on the CleverTap / MoEngage journey model |
| AI agents in Slack and on `/ask` | **Live** once a Gemini or Claude key, the Neon dataset and the Slack app are set up. Tested here end to end against a mock model and mock Slack API only |
| Eval scores | Shown only after `npm run eval` runs against the deployed agents; none are claimed before that |
| n8n workflow (`public/n8n/replenishment-reminder.json`) | **Not executed** here; an importable design |
| ₹ impact figures, unit economics, growth plan | **Model**: stated assumptions, not results |

Nothing here claims real customers, real revenue, or that I operated a production CleverTap or MoEngage account.

## How it is built

```
scripts/generate.mjs   seeded synthetic history: events, orders, campaign sends (planted problems at the top)
db/schema.sql          events, users, products, customers, orders, order_items, campaign_sends
db/views.sql           sessions view: one row per session with strict funnel flags
analysis/analysis.sql  funnel, release, search, coupon, clickmap, experiment queries
analysis/crm.sql       repeat rate, time to 2nd order, cohorts, replenishment, RFM, churn risk, CLV, campaign lift
scripts/seed.mjs       build step: generate → load into Postgres (PGlite) → run both SQL files →
                       z-tests, CIs, diff-in-diff, mix decomposition, campaign lift, unit economics → lib/results.json
                       --check fails the build if funnel, events and orders do not reconcile
lib/tracking-plan.ts   the tracking plan; rendered at /tracking-plan AND used to validate live events
lib/datalayer.ts       track(): common props → validate → window.dataLayer → Mixpanel / PostHog / /api/track
lib/crm.ts             journey definitions, templates, CleverTap / MoEngage event mapping and payload builders
app/api/track          server fan-out: Postgres, CleverTap /1/upload, MoEngage Data API (allow-listed, rate-limited)
app/api/live           live funnel from real store events (aggregates only)
app/(analyst)/         summary, insights, experiments, retention, journeys, growth, live, roadmap, tracking plan
app/store/             the instrumented storefront
```

Stack: Next.js 16 (App Router) + TypeScript on Vercel, Postgres (PGlite at build time, Neon for live events),
Mixpanel, PostHog, Microsoft Clarity, CleverTap / MoEngage APIs. Charts are plain SVG. Analysis is SQL plus
TypeScript for the statistics (no Python in this project).

## Run it locally

```powershell
npm install
npm run build      # generates data, runs the SQL, checks reconciliation, builds the app
npm start          # http://localhost:4700
```

Put keys in `.env.local` (copy `.env.example`). `npm run seed -- --csv` also writes `data/events.csv` and `data/users.csv`.

## Deploy (all free tiers)

1. **Vercel.** Either `npx vercel login` then `npx vercel --prod` from this folder, or push to GitHub and import the repo at vercel.com → Add New → Project.
2. **Neon (live event store).** neon.tech → new project → SQL editor → paste `db/schema.sql` and run it.
   Copy the pooled connection string into Vercel → Settings → Environment Variables as `DATABASE_URL`.
3. **Mixpanel.** Project settings → copy the project token → `NEXT_PUBLIC_MIXPANEL_TOKEN`.
   EU data centre: also set `NEXT_PUBLIC_MIXPANEL_API_HOST=https://api-eu.mixpanel.com`.
4. **PostHog.** Project API key → `NEXT_PUBLIC_POSTHOG_KEY` (and `NEXT_PUBLIC_POSTHOG_HOST` on EU cloud).
   Create a feature flag or experiment with key `pdp_sticky_atc` and variants `control` and `test`.
5. **Microsoft Clarity.** New project for your Vercel URL → project id → `NEXT_PUBLIC_CLARITY_ID`.
6. **CleverTap** (optional). Settings → Project → Account ID and Passcode → `CLEVERTAP_ACCOUNT_ID`, `CLEVERTAP_PASSCODE`, and `CLEVERTAP_REGION` (e.g. `in1`).
7. **MoEngage** (optional). Settings → APIs → Workspace ID and Data API key → `MOENGAGE_APP_ID`, `MOENGAGE_DATA_API_KEY`, `MOENGAGE_DC`.
8. Set `NEXT_PUBLIC_AUTHOR_NAME` and `NEXT_PUBLIC_REPO_URL`, then redeploy (env changes need a redeploy).
9. Check: open `/store`, click around, open the **Data layer** panel; each event lists every destination's status.
   Then open `/live`, and each vendor's own live event view.

## Set up the AI agents

1. **Load the dataset into Neon** (after step 2 above), from this folder in PowerShell:
   `$env:DATABASE_URL = "<Neon owner connection string>"` then `npm run load:neon` (a few minutes).
2. **Read-only role.** Open `db/agent-role.sql`, change the password, run it in the Neon SQL editor, and set
   `AGENT_DATABASE_URL` in Vercel to the same connection string with user `analyst_ro` and that password.
3. **Model key.** Free: aistudio.google.com → Get API key → `GEMINI_API_KEY`. Or `ANTHROPIC_API_KEY` for Claude.
   Optional `AGENT_MODEL` to pick a model.
4. **Redeploy**, then open `/ask` and try a sample question.
5. **Slack.** api.slack.com/apps → Create New App → From a manifest → paste `slack/manifest.yml` with your Vercel URL.
   Install to the workspace, then set in Vercel: `SLACK_BOT_TOKEN` (OAuth & Permissions → Bot token, `xoxb-…`),
   `SLACK_SIGNING_SECRET` (Basic Information), `SLACK_ALERT_CHANNEL` (channel ID where approved actions are posted;
   invite the bot there), and optionally `SLACK_APPROVER_IDS` (comma-separated user IDs allowed to approve). Redeploy.
6. In Slack: `/analyst why did conversion fall in the last 4 weeks?`, `@analyst what should we do this week?`, or DM the bot.
7. **Evals.** Set `AGENT_EVAL_KEY` in Vercel (any long random string), then locally:
   `$env:EVAL_BASE_URL = "https://<your-app>.vercel.app"`, `$env:AGENT_EVAL_KEY = "<same>"`, `npm run eval`.
   Commit the updated `lib/eval-results.json` and redeploy to publish the scores on `/ask`.

## Checks before sharing

- `npm run build` passes (reconciliation is part of it).
- Every page fits a 375 px phone screen without sideways scroll.
- Open the deployed URL in a private window and walk store → cart → checkout → payment with the inspector open.
