/**
 * place-kie: run routes of kind 'kie' on kie.ai's task API (providers/kie.ts: createTask → recordInfo poll).
 * INSTALLABLE ONLY: shipped in the repo but NOT in profiles/desktop.yml, so it is off by default. To use it, add `  - place-kie` to your profile
 * (above `legacy`) and set OPENHIGGSFIELD_KIE_KEY (docs/PROVIDERS-AND-MODELS.md, "Installable place plugins").
 * kie.ai is a reseller: "kie.ai · reseller, may change without notice" goes with it everywhere (Run on, the Connections card, route labels).
 * Settings: baseUrl, uploadBaseUrl (profile `config: place-kie:` or OPENHIGGSFIELD_PLACE_KIE_BASE_URL / _UPLOAD_BASE_URL).
 * Errors arrive as HTTP 200 with a code in the body; providers/kie.ts sorts them into our classes. Results expire after 14 days, and run.ts
 * downloads each one at once. kie has no cancel call: Cancel stops our polling only (the task may still finish and bill there).
 */
import { z } from 'zod';
import { definePlugin } from '../kernel/index.js';
import type { PlaceRunner } from '../services/places.js';
import { liveBackend } from '../routing/keys.js';
import { ANY_KEY, type KeyReader } from '../kernel/keys.js';
import { pluginSettings } from '../kernel/settings.js';
import { KIE_BASE, KIE_UPLOAD_BASE, kieRun, kieRecord, kieResultUrls, kieUpload } from '../providers/kie.js';
import { KIE_LABEL } from '../shared/modelIds.js';

export const KIE_KEY = 'OPENHIGGSFIELD_KIE_KEY';
export const KIE_KEYS = [KIE_KEY];
export const KieSettings = z.object({ baseUrl: z.string().url().default(KIE_BASE), uploadBaseUrl: z.string().url().default(KIE_UPLOAD_BASE) });

export const kiePlaceOf = (keys: KeyReader, o: { settings?: () => z.infer<typeof KieSettings>; f?: typeof fetch } = {}): PlaceRunner => {
  const cfg = o.settings ?? (() => pluginSettings('place-kie', KieSettings)); const f = o.f;
  return {
    kind: 'kie', label: KIE_LABEL, remote: 'kie', samples: 'stages', keyedOnMock: true, noOutput: 'kie.ai returned no output',
    ready: (r) => keys.configured(r),
    key: (r) => keys.value(r),
    live: (r) => !!keys.value(r) && liveBackend(),
    async run({ route, body, key, resume }, h) { // route.endpoint = kie's model id ('nano-banana-2', 'bytedance/seedance-2-5'); body = its input
      const base = cfg().baseUrl;
      const res = await kieRun(base, route.endpoint, body, key, { timeoutMs: h.timeoutMs, isCanceled: h.isCanceled, onBusy: h.onBusy, resume: resume?.id ?? null, f,
        onSubmit: (id) => h.onSubmit({ kind: 'kie', id, pollUrl: `${base.replace(/\/+$/, '')}/api/v1/jobs/recordInfo` }),
        onStatus: (r) => h.onStatus(r.state === 'generating' ? 'rendering' : 'submitted') });
      return { url: res.urls[0], outputs: res.urls.map((url) => ({ kind: route.output ?? 'image', url })), cost: res.cost,
        refresh: () => kieRecord(base, res.taskId, key, f).then((r) => kieResultUrls(r)[0]) };
    },
    resume: (h) => !!h.id,
    // no cancel: kie.ai has no cancel call (Cancel stops our polling; the task may still finish there)
    /** kie.ai: a failed task consumes no credits (creditsConsumed 0). Only a failure kie reported, never a timeout or lost contact. */
    failedNotCharged: (_job, _r, cls) => cls !== 'unknown',
    inputs: { image: ['multipart'], video: ['multipart'], audio: ['multipart'] },
    async upload(file) { const key = keys.get(KIE_KEY); if (!key) throw new Error('kie.ai isn’t connected: add your kie.ai key in Settings → Connections'); return kieUpload(cfg().uploadBaseUrl, file, key, f); },
  };
};
export const kiePlace = kiePlaceOf(ANY_KEY);

export default definePlugin({ name: 'place-kie', inject: ['places', 'keys'], keys: KIE_KEYS, apply(ctx) { ctx.places.register(kiePlaceOf(ctx.keys)); } });
