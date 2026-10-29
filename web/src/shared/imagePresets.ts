/**
 * Image presets for the web (GET /api/image-presets, server/src/shared/presets.ts): Create Image's ?preset= handling reads them here, once,
 * through a shared cache. Only presets you can pick now (`ready`: available and its workflow is in Create Image) are listed.
 * Looks you saved from a result (Workflows, 2026-10-23: server workflowLooks.ts) come in the same list (`mine`, with the model they were made on);
 * saving, renaming or deleting one calls resetImagePresets() so the next read is fresh.
 */
import type { ImagePreset } from '../../../server/src/shared/presets';

export type WebImagePreset = ImagePreset & { href: string; ready: boolean; runner: { toolId: string }; workflowStatus: 'ready' | 'soon'; mine?: boolean; provider?: string };
let cache: WebImagePreset[] | null = null; let inflight: Promise<WebImagePreset[]> | null = null; let gen = 0;
export function loadImagePresets(): Promise<WebImagePreset[]> {
  if (cache) return Promise.resolve(cache);
  return inflight ??= fetch(`/api/image-presets${gen ? `?v=${gen}` : ''}`).then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
    .then(j => (cache = ((j?.presets ?? []) as WebImagePreset[]).filter(p => p.ready && p.available)))
    .catch(() => { inflight = null; return []; });
}
/** A saved look changed: drop the cached list (the query skips the shared 60 s fetch cache). */
export function resetImagePresets() { cache = null; inflight = null; gen++; }
