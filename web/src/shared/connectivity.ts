import { useEffect, useState } from 'react';
/**
 * Connectivity: offline = navigator.onLine false, or ≥ 3 failed polls in a row (network error / 5xx).
 * Polls signal through notePoll(ok). On `online` every subscriber's onReconnect runs at once (poll immediately).
 */
export const FAIL_THRESHOLD = 3;
type State = { offline: boolean; reason: 'browser' | 'polls' | null; failures: number };
let failures = 0; const subs = new Set<(s: State) => void>(); const reconnect = new Set<() => void>();
const navOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);
export function connectivity(): State {
  const browser = !navOnline(); const polls = failures >= FAIL_THRESHOLD;
  return { offline: browser || polls, reason: browser ? 'browser' : polls ? 'polls' : null, failures };
}
const emit = () => { const s = connectivity(); subs.forEach((f) => f(s)); };
export function notePoll(ok: boolean) { const before = connectivity().offline; failures = ok ? 0 : failures + 1; if (connectivity().offline !== before || !ok) emit(); if (ok && before) reconnect.forEach((f) => f()); }
export const isOffline = () => connectivity().offline;
export const onReconnect = (f: () => void) => { reconnect.add(f); return () => { reconnect.delete(f); }; };
export const OFFLINE_MESSAGE = "You're offline. Nothing was sent; reconnect to generate.";
if (typeof window !== 'undefined') {
  addEventListener('online', () => { failures = 0; emit(); reconnect.forEach((f) => f()); });
  addEventListener('offline', emit);
}
/** True for a fetch failure that means "can't reach the server" (not a 4xx answer). */
/** A 500 is the server answering (an error, shown inline), not a lost connection; only no answer or a gateway/restart status counts. */
export const isNetworkFail = (r: Response | null) => !r || r.status === 0 || r.status === 502 || r.status === 503 || r.status === 504;
/** { offline, reason: 'browser'|'polls'|null, failures } — re-renders on change. */
export function useConnectivity() {
  const [s, setS] = useState(connectivity);
  useEffect(() => { subs.add(setS); setS(connectivity()); return () => { subs.delete(setS); }; }, []);
  return s;
}
