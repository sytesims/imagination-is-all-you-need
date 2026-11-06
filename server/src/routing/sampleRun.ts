/**
 * Free samples (2026-11-06): how a sample job runs on the real backend when nothing is set up (routing/select.ts freeSamples). Nothing is sent
 * to ComfyUI or any provider: each output is one of the app's own shipped example results that fits the prompt (shared/sampleMatch.ts), or,
 * on a Canvas demo card, the real run that card stands for (shared/demoMedia.ts). 3D and transparent clips get the usual drawn sample.
 * The job is marked simulated (tools/shared.ts mockRun), so it is $0 in Spend and every view labels it Sample.
 */
import type { Job } from '../jobs.js';
import type { ToolDef } from '../tools/types.js';
import { mockRun, imageLabels, outMediaKind } from '../tools/shared.js';
import { matchSamples } from '../shared/sampleMatch.js';

const STAGES: [string, string][] = [['submitted', 'Picking a sample'], ['rendering', 'Getting the sample ready'], ['downloading', 'Saving the sample']];

export async function runSample(job: Job, tool: ToolDef): Promise<void> {
  const kind = outMediaKind(job); const i = job.input ?? {};
  const n = Array.isArray(i.shots) && i.shots.length ? i.shots.length : Math.min(4, Math.max(1, Number(i.n) || 1));
  const labels = kind === 'image' ? imageLabels(i, 'Sample') : n > 1 ? Array.from({ length: n }, (_, k) => `Sample ${k + 1}`) : ['Sample'];
  if (kind && !i.layers) i.sampleFiles = matchSamples(String(i.prompt || i.text || i.appPrompt || i.finalPrompt || '') /* the words the user typed: an enhanced prompt adds style words that match everything */, kind, labels.length, { extra: tool.name }).map((c) => c.url);
  return mockRun(job, STAGES, labels, kind === 'image' ? 2500 : 4000);
}
