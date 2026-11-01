/**
 * B7 (Oct 19): orphan cancel. A job is an orphan when the process running it died (server restart / crash: queue.ts boot recovery)
 * or its remote Comfy Cloud job is gone (a 404 on the status poll, cloudV2.ts → cloud_job_gone, handled in the run itself).
 * Boot: every interrupted running job ends failed (temporary) and settle() puts back whatever was charged; the ledger row
 * "Run failed (temporary problem): credits back to your balance" exists only when credits were charged (ledger.refund writes no
 * row for 0). Here, the remote side: a job that had a Comfy Cloud job id gets that job cancelled on Cloud (best effort, no retry loop,
 * never a new submit), so a dead server never leaves a Cloud job running and billing. No key → nothing to cancel remotely.
 * Since 2026-11-01 (audit #5) a job whose one request can be polled again is NOT an orphan: queue.ts picks it up (routing/reattach.ts) and collects
 * the paid result. Only the rest come here: a request at fal or Replicate is cancelled there too; the lab APIs have no cancel call.
 */
import type { Job } from '../jobs.js';
import { persistJob } from '../jobs.js';
import { ComfyCloudV2 } from '../comfy/cloudV2.js';
import { ComfyRouter } from '../comfyRouter.js';
import { keyValue } from './keys.js';
import { COMFY_ENV } from './routes.js';
import { CLOUD_RUNNER_ROUTES } from './runnable.js';
import { env } from '../env.js';

export type RemoteCancel = (cloudJobId: string) => Promise<boolean>;
let testCancel: RemoteCancel | null = null;
/** Tests: replace the Comfy Cloud transport (no network). */
export const setOrphanCancel = (f: RemoteCancel | null) => { testCancel = f; };
const cloudBase = () => env('COMFY_CLOUD_URL')?.trim() || 'https://cloud.comfy.org';
/** The Comfy Cloud route this job's last attempt ran on, if any. */
export function cloudRouteOf(j: Job): string | null {
  const last = j.routeAttempts?.[j.routeAttempts.length - 1]?.routeId ?? `comfy-cloud:${j.provider}`;
  return CLOUD_RUNNER_ROUTES.has(last) ? last : null;
}
/** Mark the interrupted attempt ended (it can never finish) and cancel the remote job. Returns true when Cloud confirmed the cancel. */
export async function cancelOrphan(j: Job, why = 'The server restarted while this was running'): Promise<boolean> {
  const a = j.routeAttempts?.[j.routeAttempts.length - 1];
  if (a && a.status === 'running') { a.status = 'failed'; a.endedAt = Date.now(); a.error = why; }
  const h = j.remote; j.remote = null;
  if (h && (h.kind === 'fal' || h.kind === 'replicate' || h.kind === 'direct')) { // fal / Replicate: their own cancel call (best effort); a lab API has none
    let ok: boolean | null = null; try { ok = testCancel ? await testCancel(h.id) : await (await import('./reattach.js')).cancelRemote(h); } catch { ok = false; }
    if (a) (a as any).remoteCanceled = ok === true; (j as any).orphanCanceled = { requestId: h.id, kind: h.kind, ok: ok === true, at: Date.now() }; try { persistJob(j); } catch { /* best effort */ }
    console.log(`[openhiggsfield] orphan ${j.id}: ${h.kind} request ${ok === true ? 'cancelled' : ok === null ? 'has no cancel call' : 'cancel not confirmed'}`); return ok === true; }
  const rr = (j as any).routerRequest as { id: string; cancelUrl?: string } | undefined;
  if (rr?.cancelUrl && a?.routeId?.startsWith('comfy-router:')) { // Comfy Router queued request: ask Router to cancel it (best effort; a completed run may still be billed)
    const key = keyValue({ envKey: COMFY_ENV, envAliases: [] }); if (!key && !testCancel) return false;
    let ok = false; try { ok = testCancel ? await testCancel(rr.id) : await new ComfyRouter(key!).cancel({ requestId: rr.id, cancelUrl: rr.cancelUrl, statusUrl: '', responseUrl: '', estimate: null }); } catch { ok = false; }
    if (a) (a as any).remoteCanceled = ok; (j as any).orphanCanceled = { routerRequestId: rr.id, ok, at: Date.now() }; try { persistJob(j); } catch { /* best effort */ } return ok;
  }
  const id = j.cloudJobId ?? a?.requestId; const route = cloudRouteOf(j); if (!id || !route) return false;
  // H3 runner Step 1: a job on the user's own Comfy deployment is cancelled THERE (its own base URL + token), never on shared Comfy Cloud
  const dep = route.startsWith('comfy-deploy:') ? (await import('../comfy/deploy.js')).deployTarget() : null; const key = keyValue({ envKey: COMFY_ENV, envAliases: [] });
  const target = route.startsWith('comfy-deploy:') ? (dep ? { base: dep.base, token: dep.token } : null) : key ? { base: cloudBase(), token: key } : null;
  const cancel: RemoteCancel | null = testCancel ?? (target ? (cid) => new ComfyCloudV2(target.base, target.token, `${j.id}-orphan`).cancel(cid) : null);
  if (!cancel) return false;
  let ok = false; try { ok = await cancel(id); } catch { ok = false; }
  if (a) (a as any).remoteCanceled = ok;
  (j as any).orphanCanceled = { cloudJobId: id, ok, at: Date.now() };
  try { persistJob(j); } catch { /* best effort */ }
  console.log(`[openhiggsfield] orphan ${j.id}: Comfy Cloud job ${ok ? 'cancelled' : 'cancel not confirmed'}`);
  return ok;
}
