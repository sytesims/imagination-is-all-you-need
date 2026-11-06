/**
 * place-replicate: run routes of kind 'replicate' on Replicate's predictions API (providers/replicate.ts, unchanged).
 * Key: OPENHIGGSFIELD_REPLICATE_API_TOKEN or REPLICATE_API_TOKEN. Off in the profile → Replicate routes are hidden.
 */
import { definePlugin } from '../kernel/index.js';
import type { PlaceRunner } from '../services/places.js';
import { replicateRun, replicateGet, replicateCancel, outputUrls } from '../providers/replicate.js';
import { replicateAuthFor } from '../security/keyHosts.js';
import { liveBackend } from '../routing/keys.js';
import { ANY_KEY, type KeyReader } from '../kernel/keys.js';
import { HANDOFF_POLICY, handOff } from '../mediaHandoff.js';

export const REPLICATE_KEYS = ['OPENHIGGSFIELD_REPLICATE_API_TOKEN', 'REPLICATE_API_TOKEN'];
export const replicatePlaceOf = (keys: KeyReader): PlaceRunner => ({
  kind: 'replicate', label: 'Replicate', remote: 'replicate', samples: 'stages', keyedOnMock: true, noOutput: 'Replicate returned no output',
  ready: (r) => keys.configured(r),
  key: (r) => keys.value(r),
  live: (r) => !!keys.value(r) && liveBackend(),
  async run({ route, body, key, resume }, h) { // the output is the prediction's first URL (pick is not needed)
    const res = await replicateRun(route.endpoint, body, key, { timeoutMs: h.timeoutMs, isCanceled: h.isCanceled, onBusy: h.onBusy, resume: resume?.id ?? null,
      onSubmit: (id) => h.onSubmit({ kind: 'replicate', id }),
      onStatus: (p) => h.onStatus(p.status === 'starting' ? 'submitted' : 'rendering') });
    return { url: res.urls[0], outputs: res.urls.map((url) => ({ kind: route.output ?? 'image', url })), refresh: () => replicateGet(res.requestId, key).then((p) => outputUrls(p)[0]), auth: (u) => replicateAuthFor(u, key) };
  },
  resume: () => true,
  async cancel(h, r, f) { const key = keys.value(r); return key ? replicateCancel(h.id, key, f) : null; },
  inputs: HANDOFF_POLICY.replicate.accepts,
  upload: (file, kind) => handOff(file, kind, 'replicate'),
});
export const replicatePlace = replicatePlaceOf(ANY_KEY);

export default definePlugin({ name: 'place-replicate', inject: ['places', 'keys'], keys: REPLICATE_KEYS, apply(ctx) { ctx.places.register(replicatePlaceOf(ctx.keys)); } });
