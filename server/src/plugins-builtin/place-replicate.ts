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

export const replicatePlaceOf = (keys: KeyReader): PlaceRunner => ({
  kind: 'replicate', label: 'Replicate',
  ready: (r) => keys.configured(r),
  live: (r) => !!keys.value(r) && liveBackend(),
  async run({ route, body, key, resume }, h) { // the output is the prediction's first URL (pick is not needed)
    const res = await replicateRun(route.endpoint, body, key, { timeoutMs: h.timeoutMs, isCanceled: h.isCanceled, onBusy: h.onBusy, resume: resume?.id ?? null,
      onSubmit: (id) => h.onSubmit({ kind: 'replicate', id }),
      onStatus: (p) => h.onStatus(p.status === 'starting' ? 'submitted' : 'rendering') });
    return { url: res.urls[0], refresh: () => replicateGet(res.requestId, key).then((p) => outputUrls(p)[0]), auth: (u) => replicateAuthFor(u, key) };
  },
  resume: () => true,
  cancel: (h, key, f) => replicateCancel(h.id, key, f),
});
export const replicatePlace = replicatePlaceOf(ANY_KEY);

export default definePlugin({ name: 'place-replicate', inject: ['places', 'keys'], keys: ['OPENHIGGSFIELD_REPLICATE_API_TOKEN', 'REPLICATE_API_TOKEN'], apply(ctx) { ctx.places.register(replicatePlaceOf(ctx.keys)); } });
