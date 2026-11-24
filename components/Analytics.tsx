'use client';
// Loads the real analytics destinations when their keys are set, and fires
// page_viewed on every storefront route change.
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { track, destinationsReady, getAnonymousId } from '@/lib/datalayer';

const MP = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
const MP_HOST = process.env.NEXT_PUBLIC_MIXPANEL_API_HOST;
const PH = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const PH_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
const CLARITY = process.env.NEXT_PUBLIC_CLARITY_ID;

let started = false;

export const integrations = { mixpanel: !!MP, posthog: !!PH, clarity: !!CLARITY };

export default function Analytics() {
  const path = usePathname();

  useEffect(() => {
    if (started) return;
    started = true;
    const loads: Promise<unknown>[] = [];
    if (MP) loads.push(import('mixpanel-browser').then(({ default: mp }) => {
      mp.init(MP, { track_pageview: false, persistence: 'localStorage', ...(MP_HOST ? { api_host: MP_HOST } : {}) });
      mp.register({ anonymous_id: getAnonymousId() });
      window.__mp = { track: (e, p) => mp.track(e, p), identify: (id) => mp.identify(id) };
    }));
    if (PH) loads.push(import('posthog-js').then(({ default: ph }) => {
      ph.init(PH, { api_host: PH_HOST, capture_pageview: false, autocapture: false, persistence: 'localStorage' });
      window.__ph = { capture: (e, p) => ph.capture(e, p) };
      (window as unknown as { __phRaw: typeof ph }).__phRaw = ph;
    }));
    if (CLARITY) {
      // Microsoft Clarity standard tag: heatmaps, scroll maps, session recordings
      type Clarity = ((...a: unknown[]) => void) & { q?: unknown[] };
      const w = window as unknown as { clarity?: Clarity };
      if (!w.clarity) {
        const c: Clarity = (...a: unknown[]) => { (c.q ||= []).push(a); };
        w.clarity = c;
      }
      const s = document.createElement('script');
      s.async = true; s.src = 'https://www.clarity.ms/tag/' + CLARITY;
      document.head.appendChild(s);
    }
    Promise.allSettled(loads).then(() => destinationsReady());
  }, []);

  useEffect(() => { track('page_viewed'); }, [path]);
  return null;
}
