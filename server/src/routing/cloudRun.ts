/**
 * B2 (Oct 19): the Comfy Cloud workflow runner. Every route in comfy/cloudWorkflows.ts (cloud-h3-wf, cloud-ltx-camera, cloud-reshoot: our own
 * core-node graphs in workflows/cloud/) runs for real through one path: the twin's plan on the cloud graphs, submit → poll → download → cancel
 * (comfy/cloudV2.ts). Every other comfy-cloud route (API / partner nodes) stays not_wired.
 * Live whenever a real COMFY_API_KEY is set (any backend). No key → key_missing (the sample run on the mock backend), as before.
 * Failures throw a plain message; run.ts refunds the attempt (quote = charge, failure = full refund) and job.reasonCode says why
 * (key_invalid for 401/403, cloud_credits, workflow_invalid, queue_full, submit_uncertain, cloud_job_failed, cloud_timeout, cloud_unreachable, content_blocked, cloud_job_gone).
 */
import type { Job } from '../jobs.js';
import type { RouteAttempt, RouteDef } from './types.js';
import { env } from '../env.js';
import { keyValue } from './keys.js';
import { ComfyCloudV2, CloudError, cloudFailure } from '../comfy/cloudV2.js';
import { runNative } from '../comfy/runNative.js';
import { buildCloudPlan, CLOUD_WORKFLOWS, isStandalone } from '../comfy/cloudWorkflows.js';
import { deployTarget, DEPLOY_MISSING_REASON } from '../comfy/deploy.js';

import { CLOUD_RUNNER_ROUTES, UNMEASURED_PRICE_REASON, allowUnmeasuredCloud } from './runnable.js';
import { HOSTED_BY_ID } from '../shared/hostedPrices.js';
import { notePlanPrompts } from '../jobSource.js';
export { CLOUD_RUNNER_ROUTES }; // the set lives in runnable.ts (select.ts gate)
export const cloudBase = () => env('COMFY_CLOUD_URL')?.trim() || 'https://cloud.comfy.org';
/** B2: a real Comfy key makes the run real on any backend (a keyed cloud workflow route never renders mock output, so it is never charged for one). */
export const cloudLive = (r: Pick<RouteDef, 'routeId' | 'envKey' | 'envAliases'>) => CLOUD_RUNNER_ROUTES.has(r.routeId) && (isDeployRoute(r.routeId) ? !!deployTarget() : !!keyValue(r));
/** H3 runner Step 1: routes that run on the user's own Comfy deployment (comfy/deploy.ts), not on shared Comfy Cloud. */
export const isDeployRoute = (routeId: string) => { const w = CLOUD_WORKFLOWS[routeId]; return isStandalone(w) && w.target === 'deploy'; };
/** Per-route base URL + token (names only in docs: COMFY_CLOUD_URL / COMFY_API_KEY, or COMFY_DEPLOY_URL / COMFY_RUNNER_URL + COMFY_RUNNER_TOKEN). Never logged. */
export function cloudTargetFor(r: Pick<RouteDef, 'routeId' | 'envKey' | 'envAliases'>): { base: string; token: string } | null {
  if (isDeployRoute(r.routeId)) { const t = deployTarget(); return t ? { base: t.base, token: t.token } : null; }
  const k = keyValue(r); return k ? { base: cloudBase(), token: k } : null;
}
/** Tests: inject a fetch (no network). */
let testFetch: typeof fetch | null = null; let testPollMs: number | null = null;
export const setCloudFetch = (f: typeof fetch | null, pollMs: number | null = null) => { testFetch = f; testPollMs = pollMs; };
/** The injected test fetch, if any (the deployment probe uses it too). */
export const cloudTestFetch = () => testFetch;

export async function runCloudWorkflow(job: Job, r: RouteDef, attempt: RouteAttempt) {
  // Price-first: a row whose price is not measured never runs for real (nothing is sent, so nothing is billed; run.ts gives the credits back).
  if (r.priceRef && HOSTED_BY_ID[r.priceRef]?.priceUnmeasured && !allowUnmeasuredCloud()) { job.reasonCode = 'price_unmeasured' as any; job.errorType = 'validation' as any; throw new Error(UNMEASURED_PRICE_REASON); }
  const tg = cloudTargetFor(r); if (!tg) { job.reasonCode = (isDeployRoute(r.routeId) ? 'deploy_missing' : 'key_missing') as any; job.errorType = 'validation' as any; throw new Error(isDeployRoute(r.routeId) ? DEPLOY_MISSING_REASON : 'No Comfy API key is set'); }
  const c = new ComfyCloudV2(tg.base, tg.token, `${job.id}-a${attempt.n}`, testFetch ?? undefined, testPollMs ?? (Number(env('COMFY_CLOUD_POLL_MS')) || 3000));
  const run = c.run.bind(c);
  const partnerAuth = isStandalone(CLOUD_WORKFLOWS[r.routeId]) && !!(CLOUD_WORKFLOWS[r.routeId] as any).partnerAuth; // partner-node graphs: the key once in extra_data
  c.run = (g, o = {}) => run(g, { ...o, ...(partnerAuth ? { partnerAuth: true } : {}), onSubmitted: (id) => { attempt.requestId = id; job.cloudJobId = id; o.onSubmitted?.(id); } }); // stored at once; only ever polled
  // B6: a twin route of an open model (job.provider comfy-h3 / comfy-open) runs the Comfy Cloud workflow named by its route, not by the job's provider
  const wf = CLOUD_WORKFLOWS[r.routeId]; let pre: Record<string, any> = {};
  const build: typeof buildCloudPlan = (j, o) => { const p = buildCloudPlan(wf ? { ...j, provider: wf.provider, input: { ...j.input, ...pre } } : j, o); notePlanPrompts(job, p); return p; }; // the prompts the workflow wrote ride on the job (result details)
  try {
    // A standalone workflow's free check (GET only) before anything is uploaded or submitted: H3 Character Swap · Comfy Cloud refuses until its LoRA is imported
    if (isStandalone(wf) && wf.preflight) { const f = testFetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
      pre = (await wf.preflight((p) => f(tg.base + p, { method: 'GET', headers: tg.token ? { Authorization: `Bearer ${tg.token}` } : {}, signal: AbortSignal.timeout(20_000) }), job.input)) ?? {}; } // the job's input: a check that applies to some jobs only (LTX-2.5 DFR's IC-LoRA)
    if (isStandalone(wf) && wf.prepare) await wf.prepare(job as any); // free local prep (ffmpeg), nothing sent yet
    await runNative(job, c, build);
  }
  catch (e) {
    if ((job.status as string) === 'canceled') return;
    if (!(e instanceof CloudError)) { const rc = (e as any)?.reasonCode; if (rc && !job.reasonCode) { job.reasonCode = rc; job.errorType = (e as any).errorType ?? 'validation'; } throw e; } // a plan builder's refusal (H3 CrossView: deployment incomplete)
    throw cloudFailure(job, e, r.routeId); // reason, Cloud's own words (job.providerError, sanitised) and the log line: shared with the partner-node runners
  }
}
