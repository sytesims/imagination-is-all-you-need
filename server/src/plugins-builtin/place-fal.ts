/**
 * place-fal: run routes of kind 'fal' on fal's queue API (providers/fal.ts, unchanged). Key: OPENHIGGSFIELD_FAL_KEY or FAL_KEY.
 * Leave it out of the profile and fal routes are hidden; a quote for one says fal isn't set up in this app.
 */
import { definePlugin } from '../kernel/index.js';
import type { PlaceRunner, PlaceFile } from '../services/places.js';
import { falRun, falResult, falCancel, falImageInput, type FalHandle } from '../providers/fal.js';
import { liveBackend } from '../routing/keys.js';
import type { KeyReader } from '../kernel/keys.js';
import { HANDOFF_POLICY, handOff } from '../mediaHandoff.js';
import type { RemoteHandle } from '../jobs.js';

export const FAL_KEYS = ['OPENHIGGSFIELD_FAL_KEY', 'FAL_KEY'];
/** A remembered fal request (job.remote) → the handle falRun polls. */
const handleOf = (h: RemoteHandle | null): FalHandle | null => (h?.statusUrl && h.responseUrl ? { requestId: h.id, statusUrl: h.statusUrl, responseUrl: h.responseUrl, cancelUrl: h.cancelUrl ?? '' } : null);
/** fal image endpoints answer { images: [{ url }] }. */
const firstImage = (o: any): string | undefined => o?.images?.map((x: any) => x.url)?.[0];

/** FLUX 3 Klein edit / Nano Banana 2 edit on fal: the reference images through the shared media hand-off. */
const kleinRefUris = async (i: Record<string, any>) => { const ps: string[] = (i.refPaths ?? (i.imagePath ? [i.imagePath] : [])).slice(0, 10);
  return Promise.all(ps.map((p) => handOff(p, 'image', 'fal', { mime: /\.png$/i.test(p) ? 'image/png' : /\.webp$/i.test(p) ? 'image/webp' : 'image/jpeg' }))); };

export const falPlaceOf = (keys: KeyReader): PlaceRunner => ({
  kind: 'fal', label: 'fal', remote: 'fal', samples: 'stages', keyedOnMock: true, noOutput: 'fal returned no images',
  ready: (r) => keys.configured(r),
  key: (r) => keys.value(r),
  live: (r) => !!keys.value(r) && liveBackend(),
  async run({ route, body, key, resume, pick = firstImage }, h) {
    const res = await falRun(route.endpoint, body, key, { timeoutMs: h.timeoutMs, isCanceled: h.isCanceled, onBusy: h.onBusy, resume: handleOf(resume),
      onSubmit: (id, x) => h.onSubmit({ kind: 'fal', id, statusUrl: x.statusUrl, responseUrl: x.responseUrl, cancelUrl: x.cancelUrl }),
      onStatus: (s) => h.onStatus(s.status === 'IN_QUEUE' ? 'submitted' : 'rendering', s.queue_position) });
    const url = pick(res.result); const outputs: PlaceFile[] = url ? [{ kind: route.output ?? 'image', url }] : [];
    return { url, outputs, refresh: () => falResult(res.handle.responseUrl, key).then(pick) };
  },
  async build(r, { job, prompt, seed, extras }) { // fal image models (providers/fal.ts falImageInput)
    return falImageInput(r.endpoint, { prompt, seed, loras: job.input.hostedLoras, imageUrls: extras.imageUrls ?? (r.endpoint.includes('flux-3/klein/edit-image') || r.endpoint === 'fal-ai/nano-banana-2/edit' ? await kleinRefUris(job.input) : undefined), imageSize: extras.imageSize, aspectRatio: extras.aspect ?? job.input.aspect, imageRes: job.input.imageResolution });
  },
  resume: (h) => !!(h.statusUrl && h.responseUrl),
  async cancel(h, r, f) { const key = keys.value(r); return key && h.cancelUrl ? falCancel(h.cancelUrl, key, f) : null; },
  inputs: HANDOFF_POLICY.fal.accepts,
  upload: (file, kind) => handOff(file, kind, 'fal'),
});

export default definePlugin({ name: 'place-fal', inject: ['places', 'keys'], keys: FAL_KEYS, apply(ctx) { ctx.places.register(falPlaceOf(ctx.keys)); } });
