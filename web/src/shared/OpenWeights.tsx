import { useEffect, useState } from 'react';
import { Link } from '../platform/router';
import './openmodels.css';
/** Open-weights flags. Routes, models and providers carry `openWeights: true` (from /api/routes, /api/models and /api/tools providers[]);
 *  /api/config carries `openWeightsOnly`. Every field is optional, so a missing flag simply shows nothing. */
export const isOpenWeights = (...xs: any[]): boolean => xs.some(x => x?.openWeights === true);
/** The server's openWeights flag when any source carries it (e.g. a Comfy Cloud workflow is open weights, a hosted API route is not);
 *  only an older server without the flag falls back to the provider kind. */
export const openWeightsOf = (kind: string | undefined, ...xs: any[]): boolean => {
  const f = xs.find(x => typeof x?.openWeights === 'boolean'); return f ? f.openWeights === true : kind === 'open-weights';
};
export const OpenWeightsBadge = ({ on, className = '' }: { on: boolean; className?: string }) =>
  on ? <em className={`ow-badge ${className}`} title="Open-weights model: the weights are published and can run on your own hardware">Open weights</em> : null;

let cache: boolean | null = null; const subs = new Set<(b: boolean) => void>();
/** Settings → Connections → Open models only changed it: update every pill and listener now. */
export const setOpenWeightsOnlyNow = (b: boolean) => apply(b);
function apply(b: boolean) { cache = b; document.documentElement.classList.toggle('ow-only', b); subs.forEach(f => f(b)); }
/** True when the server runs in open-weights-only mode (closed/API routes are off). */
export function useOpenWeightsOnly() {
  const [v, setV] = useState<boolean>(cache ?? false);
  useEffect(() => {
    subs.add(setV);
    if (cache === null) fetch('/api/config').then(r => r.ok ? r.json() : null).then((j: any) => apply(j?.openWeightsOnly === true || j?.openWeights?.only === true)).catch(() => apply(false));
    return () => { subs.delete(setV); };
  }, []);
  return v;
}
/** Header / settings indicator: links to the switch (Settings → Connections → Open models only). */
export const OpenWeightsOnlyPill = ({ className = '' }: { className?: string }) => useOpenWeightsOnly()
  ? <Link to="/settings#open-models" className={`ow-only-pill ${className}`} data-testid="ow-only" title="Open models only: closed cloud models are hidden. Change it in Settings → Connections.">Open models only</Link> : null;

/** #8 Picker grouping: the server's `providerGroup` ('Local' | 'Comfy Cloud' | 'API') when present; until then derived from the route/provider id. */
export type ProviderGroup = 'Local' | 'Comfy Cloud' | 'API';
export function providerGroupOf(...xs: any[]): ProviderGroup {
  for (const x of xs) { const g = x?.providerGroup; if (g === 'Local' || g === 'Comfy Cloud' || g === 'API') return g; }
  for (const x of xs) { const k = String(x?.runsOnKind ?? ''); if (k === 'local') return 'Local'; if (/^comfy-cloud/.test(k)) return 'Comfy Cloud'; if (k === 'api') return 'API'; } // server's runsOnKind before any id guessing
  const p = xs.find(x => x && (x.id || x.routeId)) ?? {}; const id = String(p.routeId ?? p.id ?? ''); const via = String(p.via?.label ?? p.kind ?? '');
  if (/^local:/.test(id) || via === 'local' || p.kind === 'open-weights' || p.kind === 'local') return 'Local';
  if (/^comfy-cloud:/.test(id) || /^cloud-/.test(id) || via === 'comfy-cloud') return 'Comfy Cloud';
  return 'API';
}
/** The server's displayName (e.g. "MiniMax H3 · Comfy Cloud workflow") from the first object that has one. */
export const displayNameOf = (...xs: any[]): string | null => { for (const x of xs) if (typeof x?.displayName === 'string' && x.displayName.trim()) return x.displayName.trim(); return null; };
