/**
 * place-sample: samples are a place (plan §3.4). Two kinds of sample run here, and nothing is ever sent to ComfyUI or a provider:
 *  - free samples on the real backend when nothing is set up (routing/select.ts freeSamples): one of the app's own shipped results that fits
 *    the prompt (routing/sampleRun.ts);
 *  - a sample in place of a hosted place that isn't live (the mock backend, or no key): fal and Replicate draw one with their own stage names,
 *    every other place uses the model's own sample (providers.ts runWithProvider).
 * Every sample is marked simulated ($0 in Spend, labelled Sample). No key. Off in the profile → no sample runs: Auto never offers one (demoAuto,
 * freeSamples), and a hosted run that isn't live fails before anything starts.
 */
import { definePlugin } from '../kernel/index.js';
import type { PlaceRunner } from '../services/places.js';
import type { KeyReader } from '../kernel/keys.js';

const stages = (label: string): [string, string][] => [['submitted', `Submitted to ${label}`], ['rendering', `${label} rendering`], ['downloading', 'Downloading result']];

export const samplePlaceOf = (_keys: KeyReader): PlaceRunner => ({
  kind: 'sample', label: 'Sample',
  ready: () => true,
  key: () => undefined, // a sample never needs a key (the plugin declares none)
  live: () => false,
  freeSample: async (job, tool) => (await import('../routing/sampleRun.js')).runSample(job, tool),
  async sample(job, tool, _r, place) {
    const { mockRun, imageLabels } = await import('../tools/shared.js');
    if (place.samples === 'stages' && tool.routedPost) { // mock cloud run, then the same post-process (colour match is real; upscale = labelled resize)
      const n = Math.min(4, Math.max(1, Number(job.input.n) || 1)); await mockRun(job, stages(place.label), n > 1 ? Array.from({ length: n }, (_, k) => `Image ${k + 1}`) : ['Result'], 3000);
      if ((job.status as string) === 'done') await tool.routedPost(job, { live: false }); return; }
    if (place.samples === 'stages') return mockRun(job, stages(place.label), Array.isArray(job.input.shots) && job.input.shots.length ? imageLabels(job.input) : [String(job.input.outputLabel ?? 'Result')], 3000); // Shots: one sample per angle
    return (await import('../providers.js')).runOwn(job, tool); // the model's own sample (providers.ts hostedMock, or the tool's mock render), then the H3 encode
  },
});

export default definePlugin({ name: 'place-sample', inject: ['places', 'keys'], keys: [], apply(ctx) { ctx.places.register(samplePlaceOf(ctx.keys)); } });
