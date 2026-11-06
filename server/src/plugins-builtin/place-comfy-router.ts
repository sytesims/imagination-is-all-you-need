/**
 * place-comfy-router: routes of kind 'comfy-router' run on Comfy Router, hosted models on the Comfy Developer Platform billed to your Comfy
 * account (routing/routerRun.ts, routing/routerModels.ts). Key: COMFY_API_KEY. Off in the profile → Router routes are hidden.
 * Router reports what a run used (X-Comfy-Credits-Used): routerRun.ts keeps it as job.actualCost for the Spend page, as before.
 */
import { definePlugin } from '../kernel/index.js';
import type { PlaceRunner } from '../services/places.js';
import { ANY_KEY, type KeyReader } from '../kernel/keys.js';
import { routerLive, runRouter } from '../routing/routerRun.js';
import { HANDOFF_POLICY, handOff } from '../mediaHandoff.js';

export const ROUTER_KEYS = ['COMFY_API_KEY'];
export const routerPlaceOf = (keys: KeyReader): PlaceRunner => ({
  kind: 'comfy-router', label: 'Comfy Router', remote: 'router',
  ready: (r) => keys.configured(r),
  key: (r) => keys.value(r),
  live: (r) => routerLive(r, keys), // a keyed Router route runs for real on any backend (never a charged sample)
  attempt: (job, _tool, r, attempt, kit) => { kit.requestId(0); return runRouter(job, r, attempt, kit.timeoutMs, keys); }, // output 0's Router idempotency key, noted before anything is sent
  resume: (h) => !!(h.statusUrl && h.responseUrl && h.cancelUrl),
  async cancel(h, r, f) {
    const key = keys.value(r); if (!key || !h.cancelUrl) return null; const { ComfyRouter } = await import('../comfyRouter.js');
    return new ComfyRouter(key, f).cancel({ requestId: h.id, statusUrl: h.statusUrl ?? '', responseUrl: h.responseUrl ?? '', cancelUrl: h.cancelUrl, estimate: null });
  },
  inputs: HANDOFF_POLICY['comfy-router'].accepts,
  upload: (file, kind) => handOff(file, kind, 'comfy-router'),
});
export const routerPlace = routerPlaceOf(ANY_KEY);

export default definePlugin({ name: 'place-comfy-router', inject: ['places', 'keys'], keys: ROUTER_KEYS, apply(ctx) { ctx.places.register(routerPlaceOf(ctx.keys)); } });
