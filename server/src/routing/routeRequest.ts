/**
 * The one place a hosted route's request body is built (2026-10-26, prompt grammar coverage guard). Every hosted runner calls it right before
 * sending (routing/run.ts: official lab APIs, fal / Replicate video and image routes; routing/routerRun.ts: Comfy Router), and the coverage test
 * (test/prompt-refs-coverage.test.ts) calls the same function for every tool × model × place, so a body can never skip the reference rewrite
 * (routing/jobRefs.ts refInputFor → shared/promptRefs.ts): what the test checks is what is sent. Local graphs and Comfy Cloud / deployment runs
 * build theirs in comfy/plans.ts buildPlan and comfy/cloudWorkflows.ts buildCloudPlan, which apply the same rewrite.
 */
import type { RouteDef } from './types.js';
import { refInputFor } from './jobRefs.js';
import { routerModelOfRoute } from './routerModels.js';
import { places } from '../services/places.js';
import { hostedPromptOf } from './hostedPrompt.js';

type J = { id: string; toolId: string; provider: string; input: Record<string, any> };
export type RouteExtras = { imageUrls?: string[]; imageSize?: { width: number; height: number }; aspect?: string };

/**
 * Request k of a hosted job on route r, built from the job's input in the model's own reference syntax. `input` is what the body was built from
 * (the per-output copy: Shots angle prompt, seed + k), for the runner's hooks. extras: the tool's routedExtras (OpenSoul refs, size, aspect), fal / Replicate image routes only.
 */
export async function routeRequest(job: J, r: RouteDef, k = 0, extras: RouteExtras = {}): Promise<{ body: any; input: Record<string, any> }> {
  const gi = refInputFor(job, r); // prompt grammar: every prompt field in this model's own reference syntax; the job keeps what was typed
  const shots: { label: string; prompt: string }[] | null = Array.isArray(gi.shots) && gi.shots.length ? gi.shots : null; // Shots: one request per angle, each with its own prompt
  const promptAt = (n: number) => shots?.[n]?.prompt ?? hostedPromptOf(gi);
  const seed = Number.isInteger(job.input.seed) ? job.input.seed + k : undefined;
  if (r.direct) { // official lab APIs (providers/direct.ts): one request per output image, one per video / audio job
    const input = { ...gi, ...(shots ? { prompt: promptAt(k), hostedPrompt: promptAt(k) } : {}), seed };
    return { body: await r.direct.build({ ...job, input }), input };
  }
  if (r.request) { // fal / Replicate video, 3D and image-edit routes; eachImage: one request per output image
    const input = r.eachImage ? { ...gi, prompt: promptAt(k), hostedPrompt: promptAt(k), seed } : gi;
    return { body: await r.request({ ...job, input }), input };
  }
  const spec = routerModelOfRoute(r.routeId);
  if (spec) return { body: await spec.body(gi, k), input: gi }; // Comfy Router (routing/routerModels.ts)
  if (!places.managed) await import('../services/placesBuiltin.js'); // nothing booted (scripts, the coverage test): the built-in places
  const build = places.runnerOf(r)?.build; // fal / Replicate image models: the place builds its own body (place-fal.ts, place-replicate.ts)
  if (build) return { body: await build(r, { job, prompt: promptAt(k), seed, extras }), input: gi };
  throw new Error(`${r.routeId} has no hosted request builder (local graphs: comfy/plans.ts buildPlan; Comfy Cloud: comfy/cloudWorkflows.ts buildCloudPlan)`);
}
