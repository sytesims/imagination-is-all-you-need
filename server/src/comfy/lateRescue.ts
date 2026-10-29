/**
 * Late-result rescue. A local run marked failed because we gave up on it (stall, hard cap, or a server restart with ComfyUI unreachable) while its
 * prompt was NOT stopped on ComfyUI (job.lateWatch, set by runNative.ts / resume.ts) may still finish there. A light sweep (every ~30 s) looks at
 * /history for those prompts; when one finished, its outputs are stored like a normal result and the job turns done ("Finished late").
 *   - still running / pending → keep watching (until lateWatch.until, default 2 h after the failure);
 *   - error in /history, or gone from ComfyUI (no history, not queued) → stop watching (the failed card stays);
 *   - ComfyUI unreachable → try again next sweep.
 * Local runs are free: nothing is charged again; the spend row just follows the job to done (billing.settleSpend).
 */
import { jobs, type Job } from '../jobs.js';
import { env } from '../env.js';
import { comfyFor, finishedOk, inQueue, storeOutputs } from './resume.js';

export const SWEEP_MS = () => Number(env('LATE_SWEEP_MS')) || 30_000;
/** Gone from ComfyUI for this long (no history, not queued) → stop watching (a short gap right after we gave up is not "gone"). */
const GONE_MS = () => Number(env('LATE_GONE_MS')) || 60_000;
const goneSince = new Map<string, number>();
export const watched = (j: Job, now = Date.now()) => j.status === 'failed' && !!j.lateWatch && !!j.comfyPrompt?.id && !!j.comfyPrompt.base && j.comfyPrompt.resumable === true && j.lateWatch.until > now;

const stop = (j: Job) => { j.lateWatch = null; j.comfyPrompt = j.comfyPrompt ? { ...j.comfyPrompt, resumable: false } : j.comfyPrompt; goneSince.delete(j.id); j.updatedAt = Date.now(); };

/** When ComfyUI says the prompt finished (history status messages carry timestamps), else now. */
const doneAtOf = (h: any) => { const ms = (h?.status?.messages ?? []).filter((m: any) => Array.isArray(m) && /execution_success/.test(String(m[0]))).map((m: any) => Number(m[1]?.timestamp)).filter(Number.isFinite);
  return ms.length ? Math.min(Date.now(), ms[ms.length - 1]) : Date.now(); };

/** One job: returns what happened (for logs and tests). onDone runs once the job turned done (queue.ts settles spend / ETA learning). */
export async function checkLate(j: Job, onDone: (j: Job) => void): Promise<'done' | 'waiting' | 'stopped' | 'unreachable' | 'expired' | 'skip'> {
  const now = Date.now();
  if (j.status === 'failed' && j.lateWatch && j.lateWatch.until <= now) { stop(j); return 'expired'; }
  if (!watched(j, now)) return 'skip';
  const cp = j.comfyPrompt!; const c = comfyFor(cp.base);
  let h: any; try { h = await c.history(cp.id); } catch { return 'unreachable'; }
  if (j.status !== 'failed' || !j.lateWatch) return 'skip'; // retried / deleted / changed meanwhile
  if (h?.status?.status_str === 'error') { stop(j); return 'stopped'; }
  if (finishedOk(h)) {
    let err: string | null; try { err = await storeOutputs(j, c, h); } catch { return 'unreachable'; } // download failed: next sweep
    if (j.status !== 'failed') return 'skip';
    if (err) { console.warn(`[openhiggsfield] late result for ${j.id}: ${err}`); stop(j); return 'stopped'; }
    const at = doneAtOf(h);
    j.status = 'done'; j.stage = 'done'; j.progress = 100; j.eta = 0; j.error = null; j.errorType = null; j.reasonCode = null; j.refund = undefined; j.creditsBack = undefined;
    j.lateWatch = null; j.comfyPrompt = null; j.finishedLateAt = Date.now(); j.finishedAt = at; j.updatedAt = Date.now(); goneSince.delete(j.id);
    j.warnings = [...(j.warnings ?? []).filter((w) => !/^Finished late/.test(w)), 'Finished late: ComfyUI finished this run after it was marked as stopped, so the result was collected afterwards.'];
    console.info(`[openhiggsfield] late result collected for ${j.id} (ComfyUI prompt ${cp.id})`);
    onDone(j); return 'done';
  }
  let q: 'running' | 'pending' | null; try { q = await inQueue(c, cp.id); } catch { return 'unreachable'; }
  if (q || h) { goneSince.delete(j.id); return 'waiting'; }
  const g = goneSince.get(j.id) ?? now; goneSince.set(j.id, g);
  if (now - g >= GONE_MS()) { stop(j); return 'stopped'; }
  return 'waiting';
}

let sweeping = false;
/** One sweep over every watched job (sequential: a handful of jobs at most). */
export async function sweepLate(onDone: (j: Job) => void): Promise<number> {
  if (sweeping) return 0; sweeping = true; let n = 0;
  try { for (const j of [...jobs.values()]) if (j.lateWatch && j.status === 'failed') { if (await checkLate(j, onDone) === 'done') n++; } else if (j.lateWatch && j.status !== 'failed') j.lateWatch = null; }
  catch (e) { console.error('[openhiggsfield] late-result sweep:', e instanceof Error ? e.message : e); }
  finally { sweeping = false; }
  return n;
}
