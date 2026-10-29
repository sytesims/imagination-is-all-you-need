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
import { falImageInput } from '../providers/fal.js';
import { replicateImageInput } from '../providers/replicate.js';
import { handOff } from '../mediaHandoff.js';

type J = { id: string; toolId: string; provider: string; input: Record<string, any> };
export type RouteExtras = { imageUrls?: string[]; imageSize?: { width: number; height: number }; aspect?: string };
/** FLUX 3 Klein edit / Nano Banana 2 edit on fal: the reference images through the shared media hand-off. */
const kleinRefUris = async (i: Record<string, any>) => { const ps: string[] = (i.refPaths ?? (i.imagePath ? [i.imagePath] : [])).slice(0, 10);
  return Promise.all(ps.map((p) => handOff(p, 'image', 'fal', { mime: /\.png$/i.test(p) ? 'image/png' : /\.webp$/i.test(p) ? 'image/webp' : 'image/jpeg' }))); };

/**
 * Request k of a hosted job on route r, built from the job's input in the model's own reference syntax. `input` is what the body was built from
 * (the per-output copy: Shots angle prompt, seed + k), for the runner's hooks. extras: the tool's routedExtras (OpenSoul refs, size, aspect), fal / Replicate image routes only.
 */
export async function routeRequest(job: J, r: RouteDef, k = 0, extras: RouteExtras = {}): Promise<{ body: any; input: Record<string, any> }> {
  const gi = refInputFor(job, r); // prompt grammar: every prompt field in this model's own reference syntax; the job keeps what was typed
  const shots: { label: string; prompt: string }[] | null = Array.isArray(gi.shots) && gi.shots.length ? gi.shots : null; // Shots: one request per angle, each with its own prompt
  const promptAt = (n: number) => shots?.[n]?.prompt ?? String(gi.hostedPrompt ?? gi.prompt ?? '');
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
  if (r.kind === 'fal') return { body: falImageInput(r.endpoint, { prompt: promptAt(k), seed, loras: job.input.hostedLoras, imageUrls: extras.imageUrls ?? (r.endpoint.includes('flux-3/klein/edit-image') || r.endpoint === 'fal-ai/nano-banana-2/edit' ? await kleinRefUris(job.input) : undefined), imageSize: extras.imageSize, aspectRatio: extras.aspect ?? job.input.aspect, imageRes: job.input.imageResolution }), input: gi };
  if (r.kind === 'replicate') return { body: replicateImageInput(r.endpoint, { prompt: promptAt(k), seed, imageUrls: extras.imageUrls, imageSize: extras.imageSize, aspectRatio: extras.aspect ?? (r.endpoint === 'google/nano-banana-pro' || r.endpoint === 'black-forest-labs/flux-2-pro' ? job.input.aspect : undefined), imageRes: job.input.imageResolution }), input: gi };
  throw new Error(`${r.routeId} has no hosted request builder (local graphs: comfy/plans.ts buildPlan; Comfy Cloud: comfy/cloudWorkflows.ts buildCloudPlan)`);
}
