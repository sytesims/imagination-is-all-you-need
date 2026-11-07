/**
 * Job events (plan §3.5): job/created, job/progress, job/attempt-failed, job/settled. queue.ts and routing/run.ts emit them; plugins listen
 * through ctx.jobs.on (services/jobs.ts). No imports beyond types, so the queue and the router can emit without import cycles.
 *
 * Listeners only watch: each gets its own copy of the job (structuredClone), runs after the job's own bookkeeping for that moment, and a
 * listener that throws is logged and ignored. Nothing a listener does can change a job, a charge, a refund or a Spend row.
 *
 * `cost` on job/settled and job/attempt-failed is what the place reported (PlaceOutput.cost, kept on each attempt as reportedCost, plus the
 * provider's own figure when the runner stored one as job.actualCost): information only, NEVER what is charged (that stays the quote).
 */
import type { Job } from '../jobs.js';
import type { RouteAttempt } from '../routing/types.js';

export interface ReportedCost { usd: number; source: string; attempts: { n: number; routeId: string; usd: number; source: string }[] }
export interface JobEventMap {
  'job/created': (job: Job) => void;
  'job/progress': (job: Job, p: { stage: string; attempt?: number; routeId?: string; queuePos?: number | null }) => void;
  'job/attempt-failed': (job: Job, attempt: RouteAttempt, info: { cost: ReportedCost | null; notCharged: boolean }) => void;
  /** via: 'queue' (the queue settled it), 'late' (a late result rescued a failed local run), 'fallback' (a run continued on another route after
   *  needs_decision: its startedAt is the first attempt's, so its timing is not one run's). */
  'job/settled': (job: Job, info: { status: Job['status']; cost: ReportedCost | null; via: 'queue' | 'late' | 'fallback' }) => void;
}
export type JobEvent = keyof JobEventMap;
export const JOB_EVENTS: readonly JobEvent[] = ['job/created', 'job/progress', 'job/attempt-failed', 'job/settled'];

const listeners = new Map<JobEvent, Set<(...a: any[]) => void>>(JOB_EVENTS.map((e) => [e, new Set()]));
/** The built-in listeners (ETA learning, webhooks) for code that runs without booting (scripts, tests that import the queue directly), as in the
 *  desktop profile. A booted server never uses them: its listeners come from the profile's plugins (ctx.jobs.on). */
const builtIn = new Map<JobEvent, Set<(...a: any[]) => void>>(JOB_EVENTS.map((e) => [e, new Set()]));
let managed = false;
/** boot.ts mounted ctx.jobs: only the plugins' listeners count from now on. */
export const manageJobListeners = () => { managed = true; };
const add = (m: typeof listeners, e: JobEvent, fn: (...a: any[]) => void) => {
  const set = m.get(e); if (!set) throw new Error(`jobs: unknown event "${e}" (${JOB_EVENTS.join(', ')})`);
  set.add(fn); return () => { set.delete(fn); };
};
export function onJob<E extends JobEvent>(e: E, fn: JobEventMap[E]): () => void { return add(listeners, e, fn); }
export function onJobBuiltIn<E extends JobEvent>(e: E, fn: JobEventMap[E]): () => void { return add(builtIn, e, fn); }
const copy = <T>(v: T): T => { try { return structuredClone(v); } catch { return JSON.parse(JSON.stringify(v)); } };
/** Emit to every listener with a copy of the job (nothing at all when no one listens). Never throws. */
export function emitJob<E extends JobEvent>(e: E, ...args: Parameters<JobEventMap[E]>): void {
  const fns = [...(listeners.get(e) ?? []), ...(managed ? [] : builtIn.get(e) ?? [])]; if (!fns.length) return;
  for (const fn of fns) { try { (fn as (...a: any[]) => void)(...args.map(copy)); } catch (err) { console.error(`[jobs] a ${e} listener failed:`, err); } }
}
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
/** What the places reported a job cost (attempts' reportedCost, else the provider figure on job.actualCost). null: nothing reported. */
export function reportedCostOf(job: Pick<Job, 'routeAttempts'> & { actualCost?: { usd?: number; source?: string } | null }): ReportedCost | null {
  const attempts = (job.routeAttempts ?? []).filter((a) => a.reportedCost && Number.isFinite(a.reportedCost.usd))
    .map((a) => ({ n: a.n, routeId: a.routeId, usd: a.reportedCost!.usd, source: a.reportedCost!.source }));
  if (attempts.length) return { usd: r4(attempts.reduce((s, a) => s + a.usd, 0)), source: attempts.every((a) => a.source === 'provider') ? 'provider' : 'estimate', attempts };
  const ac = job.actualCost; return ac && Number.isFinite(ac.usd) ? { usd: r4(ac.usd!), source: ac.source ?? 'provider', attempts: [] } : null;
}
/** One attempt's reported cost (job/attempt-failed). */
export const attemptCostOf = (a: RouteAttempt): ReportedCost | null => a.reportedCost && Number.isFinite(a.reportedCost.usd) ? { usd: a.reportedCost.usd, source: a.reportedCost.source, attempts: [{ n: a.n, routeId: a.routeId, usd: a.reportedCost.usd, source: a.reportedCost.source }] } : null;
