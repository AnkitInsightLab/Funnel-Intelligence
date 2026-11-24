'use client';
// Feature flags for the shipped fixes. PostHog decides when it is configured and the
// flag exists (variants "control" / "test"); otherwise a deterministic local bucket.
// Exposure (experiment_viewed) is logged once per session per flag, and only when the
// variant is actually on screen, so the /fixes readout compares like with like.
import { useEffect, useState } from 'react';
import { bucket, track, whenReady } from './datalayer';

export type Variant = 'control' | 'treatment';
type PH = { onFeatureFlags: (cb: () => void) => void; getFeatureFlag: (k: string) => string | boolean | undefined };

export function useFlag(key: string): Variant | null {
  const [v, setV] = useState<Variant | null>(null);
  useEffect(() => {
    let live = true;
    whenReady().then(() => {
      const ph = (window as unknown as { __phRaw?: PH }).__phRaw;
      const set = (x: Variant) => { if (live) setV(x); };
      if (!ph) return set(bucket(key));
      ph.onFeatureFlags(() => {
        const f = ph.getFeatureFlag(key);
        // flag not created in PostHog yet → fall back to the local bucket so the fix still runs
        if (f === undefined) set(bucket(key));
        else set(f === 'test' || f === 'treatment' || f === true ? 'treatment' : 'control');
      });
    });
    return () => { live = false; };
  }, [key]);
  return v;
}

export function expose(key: string, variant: Variant | null, extra: Record<string, string | number | boolean> = {}) {
  if (!variant || typeof window === 'undefined') return;
  const mark = `hn_exp_${key}`;
  try {
    const sid = sessionStorage.getItem('hn_exp_session');
    const cur = localStorage.getItem('hn_session');
    if (sid !== cur) { Object.keys(sessionStorage).filter((k) => k.startsWith('hn_exp_') && k !== 'hn_exp_session').forEach((k) => sessionStorage.removeItem(k)); sessionStorage.setItem('hn_exp_session', cur ?? ''); }
    if (sessionStorage.getItem(mark)) return;
    sessionStorage.setItem(mark, variant);
  } catch { /* storage off: log anyway */ }
  track('experiment_viewed', { experiment: key, variant, ...extra });
}
