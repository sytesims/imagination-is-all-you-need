/**
 * place-sunra: run routes of kind 'sunra' on Sunra's queue (providers/sunra.ts; fal-shaped: submit → poll → result, cancel, resume after a restart).
 * Key: OPENHIGGSFIELD_SUNRA_KEY (declared below: the only key this plugin can read). In the desktop profile, but its routes stay hidden until the
 * key is set (services/places.ts KEY_GATED_KINDS), so nothing is listed, quoted or picked by Auto before that.
 * Settings (ctx.settings, kernel/settings.ts): baseUrl (profile `config: place-sunra: baseUrl:`, env OPENHIGGSFIELD_PLACE_SUNRA_BASE_URL).
 * Inputs go up through Sunra's pre-signed upload (https://docs.sunra.ai/platform/file-upload). Failed predictions are free per Sunra's docs
 * (https://docs.sunra.ai/platform/errors), so a failure Sunra reported lets the job move on; a timeout or lost contact does not.
 */
import { z } from 'zod';
import { definePlugin } from '../kernel/index.js';
import type { PlaceRunner } from '../services/places.js';
import { liveBackend } from '../routing/keys.js';
import { ANY_KEY, type KeyReader } from '../kernel/keys.js';
import { pluginSettings } from '../kernel/settings.js';
import type { RemoteHandle } from '../jobs.js';
import { SUNRA_BASE, sunraRun, sunraResult, sunraCancel, sunraUpload, sunraOutputUrls, type SunraHandle } from '../providers/sunra.js';

export const SUNRA_KEY = 'OPENHIGGSFIELD_SUNRA_KEY';
export const SUNRA_KEYS = [SUNRA_KEY];
export const SunraSettings = z.object({ baseUrl: z.string().url().default(SUNRA_BASE) });
const handleOf = (h: RemoteHandle | null): SunraHandle | null => (h?.id ? { requestId: h.id, statusUrl: h.statusUrl ?? '', responseUrl: h.responseUrl ?? '', cancelUrl: h.cancelUrl ?? '' } : null);

export const sunraPlaceOf = (keys: KeyReader, o: { base?: () => string; f?: typeof fetch } = {}): PlaceRunner => {
  const base = o.base ?? (() => pluginSettings('place-sunra', SunraSettings).baseUrl); const f = o.f;
  return {
    kind: 'sunra', label: 'Sunra', remote: 'sunra', samples: 'stages', keyedOnMock: true, noOutput: 'Sunra returned no output',
    ready: (r) => keys.configured(r),
    key: (r) => keys.value(r),
    live: (r) => !!keys.value(r) && liveBackend(),
    async run({ route, body, key, resume }, h) { // route.endpoint = owner/model; the body names the model endpoint (providers/sunra.ts SUNRA_ENDPOINT)
      const res = await sunraRun(base(), route.endpoint, body, key, { timeoutMs: h.timeoutMs, isCanceled: h.isCanceled, onBusy: h.onBusy, resume: handleOf(resume), f,
        onSubmit: (x) => h.onSubmit({ kind: 'sunra', id: x.requestId, statusUrl: x.statusUrl, responseUrl: x.responseUrl, cancelUrl: x.cancelUrl }),
        onStatus: (s) => h.onStatus(s.status === 'IN_QUEUE' ? 'submitted' : 'rendering', s.queue_position) });
      return { url: res.urls[0], outputs: res.urls.map((url) => ({ kind: route.output ?? 'image', url })), cost: res.cost,
        refresh: () => sunraResult(base(), res.handle.requestId, key, f).then((x) => sunraOutputUrls(x)[0]) }; // outputs on assets.sunra.ai are public: no auth header
    },
    resume: (h) => !!h.id,
    async cancel(h, r, fx) { const key = keys.value(r); return key ? sunraCancel(base(), h.id, key, f ?? fx) : null; },
    /** "Failed predictions are not charged": any failure Sunra itself reported (a sorted class). Not a timeout or lost contact (unknown). */
    failedNotCharged: (_job, _r, cls) => cls !== 'unknown',
    inputs: { image: ['presigned'], video: ['presigned'], audio: ['presigned'] },
    async upload(file) { const key = keys.get(SUNRA_KEY); if (!key) throw new Error('Sunra isn’t connected: add your Sunra key in Settings → Connections'); return sunraUpload(base(), file, key, f); },
  };
};
export const sunraPlace = sunraPlaceOf(ANY_KEY);

export default definePlugin({ name: 'place-sunra', inject: ['places', 'keys'], keys: SUNRA_KEYS, apply(ctx) { ctx.places.register(sunraPlaceOf(ctx.keys)); } });
