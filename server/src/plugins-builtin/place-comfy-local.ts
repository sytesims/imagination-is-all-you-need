/**
 * place-comfy-local: routes of kind 'local' run on your own computer: your ComfyUI (tool.run / the native plan through providers.ts
 * runWithProvider), or the app's own built-in tools (VTracer, ffmpeg). No key: whether ComfyUI is reachable, on and has the files is a
 * selection question (routing/select.ts). Off in the profile → local routes are hidden and quotes say Your computer isn't set up.
 * The ComfyUI connection's own Comfy key (for partner nodes in your ComfyUI, config.comfyApiKey) is still read by the legacy server.
 */
import { definePlugin } from '../kernel/index.js';
import type { PlaceRunner } from '../services/places.js';
import type { KeyReader } from '../kernel/keys.js';
import { LOCAL_LABEL } from '../shared/modelIds.js';

export const localPlaceOf = (keys: KeyReader): PlaceRunner => ({
  kind: 'local', label: LOCAL_LABEL,
  ready: (r) => keys.configured(r), // local routes have no key: always ready
  key: (r) => keys.value(r),
  live: () => true, // a real run (on the mock backend the tools draw their own sample, as before); nothing to pick up after a restart
  attempt: async (job, tool) => (await import('../providers.js')).runOwn(job, tool), // tool.run / the native plan (providers.ts), then the H3 encode
});

export default definePlugin({ name: 'place-comfy-local', inject: ['places', 'keys'], keys: [], apply(ctx) { ctx.places.register(localPlaceOf(ctx.keys)); } });
