/**
 * Hosted runs across a restart, a cancel and a failed download (audit 2026-11-01 #5, #9, #10). Every hosted runner stores its request on the job
 * the moment the provider answers the submit (job.remote, jobs.ts RemoteHandle):
 *   - restart: a running job whose one request can be picked up again is NOT failed; queue.ts runs it again through runRouted, which reuses its
 *     attempt and only POLLS that request (fal status_url, Replicate prediction id, a lab's poll URL, Router status_url, Comfy Cloud job id), so
 *     the paid result is collected. Nothing is submitted or charged again. Only a job that can't be picked up (several requests, no handle) gets
 *     the old treatment: failed, and the remote request cancelled where the provider has a cancel call (routing/orphans.ts).
 *   - cancel: a running hosted job with a request at fal, Replicate, Comfy Router or Comfy Cloud can be cancelled: the runner's poll loop sees the
 *     job canceled and calls the provider's cancel. Some providers still bill the time it ran; the job says so (billing.ts failure rule).
 *   - Retry download (POST /api/jobs/:id/collect): a job whose result was made but couldn't be saved, or whose provider we lost contact with,
 *     keeps its handle (collectable) and can be picked up the same way later.
 */
import type { Job, RemoteHandle } from '../jobs.js';
import { env } from '../env.js';

/** Thrown instead of ever submitting again when a pick-up turns out impossible (a multi-pass graph, the key gone): runRouted then cancels the
 *  request at its provider, as for any orphan. */
export const cannotPickUp = (why: string) => Object.assign(new Error(`The server restarted while this was in progress, and this run can’t be picked up again (${why}); try again`), { cannotPickUp: true });
/** OPENHIGGSFIELD_RESUME_HOSTED=0 restores the old "fail it on restart" behaviour. */
export const RESUME_HOSTED = !/^(0|false|off|no)$/i.test(env('RESUME_HOSTED') ?? '1');

/** Can this request be polled again with nothing new sent? One request per attempt (an earlier request's files are not kept), and the
 *  provider's own handle for it. */
export function canPickUp(h: RemoteHandle | null | undefined): h is RemoteHandle {
  if (!h || !h.id || h.outputs !== 1 || h.output !== 0) return false;
  switch (h.kind) {
    case 'fal': return !!(h.statusUrl && h.responseUrl);
    case 'router': return !!(h.statusUrl && h.responseUrl && h.cancelUrl);
    case 'direct': return !!h.pollUrl;
    case 'replicate': case 'cloud': return true;
    default: return false;
  }
}
/** The job's request at its provider: job.remote, or (jobs from before job.remote existed) its Comfy Cloud job id. */
export function remoteOf(j: Job): RemoteHandle | null {
  if (j.remote) return j.remote;
  const a = j.routeAttempts?.[j.routeAttempts.length - 1];
  if (j.cloudJobId && a && /^comfy-(cloud|deploy):/.test(a.routeId)) return { kind: 'cloud', id: j.cloudJobId, routeId: a.routeId, attempt: a.n, output: 0, outputs: 1, at: a.startedAt }; // the Cloud runner refuses a pick-up of a multi-pass graph
  return null;
}
/** A running job the boot can pick up again (instead of failing it). */
export function pickUpOnBoot(j: Job): boolean {
  if (!RESUME_HOSTED || j.status !== 'running' || !j.routing) return false;
  const h = remoteOf(j); if (!canPickUp(h)) return false;
  return !!j.routeAttempts?.some((a) => a.n === h.attempt && a.routeId === h.routeId);
}
/** Mark it for a pick-up: runRouted then reuses the attempt and only polls. */
export function startPickUp(j: Job) { const h = remoteOf(j)!; j.remote = { ...h, resuming: true, collectable: undefined }; }
/** A failed job whose paid result can still be collected (Retry download). */
export const collectable = (j: Job) => j.status === 'failed' && !!j.remote?.collectable && canPickUp(j.remote) && !!j.routing;
/** Can Cancel stop this running hosted job at its provider? (fal, Replicate, Router, Cloud have a cancel call; the labs don't.) */
export const remoteCancellable = (j: Job) => j.status === 'running' && !!j.remote && j.remote.kind !== 'direct';

/** Tests: replace the network for the provider cancel calls. */
let testFetch: typeof fetch | null = null;
export const setReattachFetch = (f: typeof fetch | null) => { testFetch = f; };
/**
 * Ask the provider to cancel this request (best effort, never throws). true = accepted, false = not confirmed, null = this place has no cancel call
 * (the lab APIs) or no key. Used for orphans that can't be picked up.
 */
export async function cancelRemote(h: RemoteHandle): Promise<boolean | null> {
  const { findRoute } = await import('./routes.js'); const { keyValue } = await import('./keys.js');
  const r = findRoute(h.routeId); const f = testFetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  try {
    if (h.kind === 'fal') { const key = r ? keyValue(r) : null; if (!key || !h.cancelUrl) return null; return await (await import('../providers/fal.js')).falCancel(h.cancelUrl, key, f); }
    if (h.kind === 'replicate') { const key = r ? keyValue(r) : null; if (!key) return null; return await (await import('../providers/replicate.js')).replicateCancel(h.id, key, f); }
    if (h.kind === 'router') { const key = r ? keyValue(r) : null; if (!key || !h.cancelUrl) return null; const { ComfyRouter } = await import('../comfyRouter.js');
      return await new ComfyRouter(key, f).cancel({ requestId: h.id, statusUrl: h.statusUrl ?? '', responseUrl: h.responseUrl ?? '', cancelUrl: h.cancelUrl, estimate: null }); }
    if (h.kind === 'cloud') { const { cloudTargetFor } = await import('./cloudRun.js'); const tg = r ? cloudTargetFor(r) : null; if (!tg) return null; const { ComfyCloudV2 } = await import('../comfy/cloudV2.js');
      return await new ComfyCloudV2(tg.base, tg.token, `${h.id}-cancel`, f).cancel(h.id); }
    return null;
  } catch { return false; }
}
