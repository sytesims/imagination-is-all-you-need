/**
 * place-fal: run routes of kind 'fal' on fal's queue API (providers/fal.ts, unchanged). Key: OPENHIGGSFIELD_FAL_KEY or FAL_KEY.
 * Leave it out of the profile and fal routes are hidden; a quote for one says fal isn't set up in this app.
 */
import { definePlugin } from '../kernel/index.js';
import type { PlaceRunner } from '../services/places.js';
import { falRun, falResult, falCancel, type FalHandle } from '../providers/fal.js';
import { liveBackend } from '../routing/keys.js';
import { ANY_KEY, type KeyReader } from '../kernel/keys.js';
import type { RemoteHandle } from '../jobs.js';

/** A remembered fal request (job.remote) → the handle falRun polls. */
const handleOf = (h: RemoteHandle | null): FalHandle | null => (h?.statusUrl && h.responseUrl ? { requestId: h.id, statusUrl: h.statusUrl, responseUrl: h.responseUrl, cancelUrl: h.cancelUrl ?? '' } : null);
/** fal image endpoints answer { images: [{ url }] }. */
const firstImage = (o: any): string | undefined => o?.images?.map((x: any) => x.url)?.[0];

export const falPlaceOf = (keys: KeyReader): PlaceRunner => ({
  kind: 'fal', label: 'fal',
  ready: (r) => keys.configured(r),
  live: (r) => !!keys.value(r) && liveBackend(),
  async run({ route, body, key, resume, pick = firstImage }, h) {
    const res = await falRun(route.endpoint, body, key, { timeoutMs: h.timeoutMs, isCanceled: h.isCanceled, onBusy: h.onBusy, resume: handleOf(resume),
      onSubmit: (id, x) => h.onSubmit({ kind: 'fal', id, statusUrl: x.statusUrl, responseUrl: x.responseUrl, cancelUrl: x.cancelUrl }),
      onStatus: (s) => h.onStatus(s.status === 'IN_QUEUE' ? 'submitted' : 'rendering', s.queue_position) });
    return { url: pick(res.result), refresh: () => falResult(res.handle.responseUrl, key).then(pick) };
  },
  resume: (h) => !!(h.statusUrl && h.responseUrl),
  cancel: async (h, key, f) => (h.cancelUrl ? falCancel(h.cancelUrl, key, f) : null),
});
export const falPlace = falPlaceOf(ANY_KEY);

export default definePlugin({ name: 'place-fal', inject: ['places', 'keys'], keys: ['OPENHIGGSFIELD_FAL_KEY', 'FAL_KEY'], apply(ctx) { ctx.places.register(falPlaceOf(ctx.keys)); } });
