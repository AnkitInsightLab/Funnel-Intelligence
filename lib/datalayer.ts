'use client';
// The data layer. Every tracked interaction goes through track():
//   1. adds the common properties (ids, session, platform, utm, page),
//   2. validates against the tracking plan and flags problems,
//   3. pushes to window.dataLayer (GTM-compatible),
//   4. fans out to Mixpanel, PostHog and /api/track (Postgres) when configured.
// Destinations that are not configured are skipped and reported as such, never faked.

import { EVENTS, COMMON_PROPS } from './tracking-plan';

type Props = Record<string, string | number | boolean | null | undefined>;
export interface TrackedEvent {
  event: string;
  props: Props;
  issues: string[];
  destinations: Record<string, 'sent' | 'off' | 'error' | 'stored' | 'not stored'>;
  at: number;
}

declare global {
  interface Window { dataLayer: unknown[]; __mp?: { track: (e: string, p: Props) => void; identify: (id: string) => void }; __ph?: { capture: (e: string, p: Props) => void } }
}

const SESSION_GAP_MS = 30 * 60 * 1000;
const listeners = new Set<(e: TrackedEvent) => void>();
// Inspector history survives full page loads within the tab (sessionStorage).
export const history: TrackedEvent[] = (() => {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(sessionStorage.getItem('hn_dl_history') || '[]'); } catch { return []; }
})();
function saveHistory() { try { sessionStorage.setItem('hn_dl_history', JSON.stringify(history)); } catch { /* storage off */ } }

function store(key: string, value?: string): string | null {
  try {
    if (value !== undefined) localStorage.setItem(key, value);
    return localStorage.getItem(key);
  } catch { return value ?? null; }
}
const rid = () => Math.random().toString(36).slice(2, 10);

export function getAnonymousId(): string {
  return store('hn_anon') ?? store('hn_anon', 'a_' + rid())!;
}

function getSession(): { id: string; isReturning: boolean; utm: string } {
  const now = Date.now();
  const last = Number(store('hn_last') ?? 0);
  let id = store('hn_session');
  let utm = store('hn_utm') ?? 'direct';
  const count = Number(store('hn_session_count') ?? 0);
  if (!id || now - last > SESSION_GAP_MS) {
    const n = count + 1;
    id = `s_${rid()}_${n}`;
    store('hn_session', id);
    store('hn_session_count', String(n));
    const params = new URLSearchParams(location.search);
    utm = params.get('utm_source') ?? (document.referrer && !document.referrer.includes(location.host) ? 'referral' : 'direct');
    store('hn_utm', utm);
  }
  store('hn_last', String(now));
  return { id, isReturning: Number(store('hn_session_count')) > 1, utm };
}

function pageType(): string {
  const p = location.pathname;
  if (p.startsWith('/store/p/')) return 'product';
  if (p.startsWith('/store/c/')) return 'category';
  if (p.startsWith('/store/search')) return 'search';
  if (p.startsWith('/store/cart')) return 'cart';
  if (p.startsWith('/store/checkout')) return 'checkout';
  if (p.startsWith('/store/success')) return 'confirmation';
  return 'home';
}

function validate(event: string, props: Props): string[] {
  const spec = EVENTS.find((e) => e.name === event);
  if (!spec) return [`"${event}" is not in the tracking plan`];
  const issues: string[] = [];
  for (const p of [...COMMON_PROPS, ...spec.props]) {
    const v = props[p.name];
    if (v === undefined || v === null || v === '') { if (p.required) issues.push(`missing ${p.name}`); continue; }
    if (typeof v !== p.type) issues.push(`${p.name} should be ${p.type}, got ${typeof v}`);
  }
  return issues;
}

// Destinations load asynchronously; events wait (max 2 s) so the first page_viewed
// is not lost before Mixpanel / PostHog finish initialising.
let markReady: () => void = () => {};
const ready = new Promise<void>((r) => { markReady = r; });
if (typeof window !== 'undefined') setTimeout(() => markReady(), 2000);
export function destinationsReady() { markReady(); }
export function whenReady() { return ready; }

export function onTrack(fn: (e: TrackedEvent) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

export function track(event: string, props: Props = {}) {
  if (typeof window === 'undefined') return;
  const s = getSession();
  const full: Props = {
    anonymous_id: getAnonymousId(),
    session_id: s.id,
    platform: 'web',
    utm_source: s.utm,
    is_returning: s.isReturning,
    page_type: pageType(),
    event_time: new Date().toISOString(),
    ...props,
  };
  const rec: TrackedEvent = { event, props: full, issues: validate(event, full), destinations: {}, at: Date.now() };
  ready.then(() => dispatch(rec));
}

function dispatch(rec: TrackedEvent) {
  const { event, props: full } = rec;

  (window.dataLayer ||= []).push({ event, ...full });
  rec.destinations.dataLayer = 'sent';

  if (window.__mp) { try { window.__mp.track(event, full); rec.destinations.Mixpanel = 'sent'; } catch { rec.destinations.Mixpanel = 'error'; } }
  else rec.destinations.Mixpanel = 'off';
  if (window.__ph) { try { window.__ph.capture(event, full); rec.destinations.PostHog = 'sent'; } catch { rec.destinations.PostHog = 'error'; } }
  else rec.destinations.PostHog = 'off';

  history.unshift(rec);
  if (history.length > 80) history.pop();
  saveHistory();
  listeners.forEach((l) => l(rec));

  fetch('/api/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event, props: full }), keepalive: true })
    .then((r) => r.json())
    .then((j: { stored?: boolean; destinations?: Record<string, TrackedEvent['destinations'][string]> }) => {
      if (j.destinations) Object.assign(rec.destinations, j.destinations); else rec.destinations.Postgres = j.stored ? 'stored' : 'not stored';
      saveHistory(); listeners.forEach((l) => l(rec));
    })
    .catch(() => { rec.destinations.Postgres = 'error'; listeners.forEach((l) => l(rec)); });
}

// Deterministic, independent bucketing for live experiments (fallback when PostHog
// flags are not configured). The salt is hashed with a full avalanche mix, unlike the
// parity bug planted in the synthetic history.
export function bucket(experiment: string): 'control' | 'treatment' {
  const s = getAnonymousId() + ':' + experiment;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) % 2 ? 'treatment' : 'control';
}
