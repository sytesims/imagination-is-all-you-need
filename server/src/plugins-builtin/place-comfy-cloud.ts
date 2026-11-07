/**
 * place-comfy-cloud: routes of kind 'comfy-cloud' run on Comfy Cloud (our ComfyUI graphs through the v2 jobs API, routing/cloudRun.ts) or on
 * your own Comfy deployment (comfy-deploy:<id>, comfy/deploy.ts); a few routes run their own partner-node graph (route.cloudRun: Tripo 3D,
 * Topaz video). Keys: COMFY_API_KEY, and for your deployment COMFY_DEPLOY_URL or COMFY_RUNNER_URL (+ COMFY_RUNNER_TOKEN).
 * Off in the profile → Comfy Cloud routes are hidden and quotes say Comfy Cloud isn't set up.
 * Its route add-on: charswap-anchor (H3 Character Swap's first frame, priced into the twin route on quote and charge; services/routeAddOns.ts).
 */
import { definePlugin } from '../kernel/index.js';
import type { PlaceRunner } from '../services/places.js';
import type { KeyReader } from '../kernel/keys.js';
import { cloudLive, runCloudWorkflow, cloudTargetFor } from '../routing/cloudRun.js';
import { charswapAnchorAddOn } from '../comfy/h3CharSwapAnchor.js';

export const CLOUD_KEYS = ['COMFY_API_KEY', 'COMFY_DEPLOY_URL', 'COMFY_RUNNER_URL', 'COMFY_RUNNER_TOKEN'];
export const cloudPlaceOf = (keys: KeyReader): PlaceRunner => ({
  kind: 'comfy-cloud', label: 'Comfy Cloud', remote: 'cloud',
  ready: (r) => keys.configured(r),
  key: (r) => keys.value(r),
  /** A real Comfy key (or your deployment) makes the run real on any backend: a keyed cloud route never renders a charged sample. */
  live: (r) => !!(r.cloudRun && keys.value(r)) || cloudLive(r, keys),
  async attempt(job, _tool, r, attempt, kit) {
    kit.requestId(); // the Cloud idempotency prefix `${job.id}-a${n}` (comfy/cloudV2.ts), noted on the attempt before anything is sent
    if (r.cloudRun && keys.value(r)) return r.cloudRun(job, r, attempt); // 3D (2026-10-23): a Comfy partner-node graph on Comfy Cloud (Tripo), real whenever the Comfy key is set
    return runCloudWorkflow(job, r, attempt, keys); // BH9 (f): real Comfy Cloud v2 run
  },
  resume: () => true, // one-pass graphs only: the runner refuses a pick-up of a multi-pass graph (cannotPickUp)
  async cancel(h, r, f) {
    const tg = cloudTargetFor(r, keys); if (!tg) return null; const { ComfyCloudV2 } = await import('../comfy/cloudV2.js');
    return new ComfyCloudV2(tg.base, tg.token, `${h.id}-cancel`, f).cancel(h.id);
  },
  inputs: { image: ['content-hash'], video: ['content-hash'], audio: ['content-hash'] }, // uploaded as Comfy assets inside the run (Idempotency-Key per file)
});

export default definePlugin({ name: 'place-comfy-cloud', inject: ['places', 'keys', 'pricing'], keys: CLOUD_KEYS, apply(ctx) { ctx.places.register(cloudPlaceOf(ctx.keys)); ctx.pricing.addOn(charswapAnchorAddOn); } });
