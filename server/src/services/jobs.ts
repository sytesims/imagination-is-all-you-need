/**
 * ctx.jobs (plan §3.3): the job queue as a service, one door to what used to be reached module by module.
 *  - enqueue / cancel / cancelRun / collectAgain (Retry download): queue.ts, with its two lanes (local, cloud), the paid-before-free order and
 *    the restart recovery (requeue, ComfyUI reconnect, hosted pick-up: routing/reattach.ts);
 *  - get / list / state / lanes / laneOf / inFlight: what the queue holds now;
 *  - persist / flush: jobs.ts (the jobs table in the data folder, unchanged);
 *  - on(event, fn): job/created, job/progress, job/attempt-failed, job/settled (services/jobEvents.ts). A listener only watches; it is removed
 *    when its plugin is disposed.
 * queue.ts runs its restart recovery when it is first imported, which must happen after every place and tool is registered (legacy starts last),
 * so the queue functions are reached lazily here and mounting the service never starts the queue early.
 */
import { Service, type Context } from '../kernel/index.js';
import type { Job } from '../jobs.js';
import { onJob, manageJobListeners, type JobEvent, type JobEventMap } from './jobEvents.js';

const Q = () => import('../queue.js');
const J = () => import('../jobs.js');

export class JobsService extends Service {
  constructor(ctx: Context) { super(ctx, 'jobs'); manageJobListeners(); }
  /** Listen to a job event (undone when the calling plugin is disposed). */
  on<E extends JobEvent>(e: E, fn: JobEventMap[E]) { return this.ctx.effect(() => onJob(e, fn), `job event ${e}`); }
  async enqueue(...a: Parameters<typeof import('../queue.js').enqueue>) { return (await Q()).enqueue(...a); }
  async cancel(job: Job) { return (await Q()).cancelRun(job); }
  async collectAgain(job: Job) { return (await Q()).collectAgain(job); }
  async get(id: string) { return (await J()).jobs.get(id); }
  async list(toolId?: string) { return (await Q()).history(toolId); }
  async state(job: Job) { return (await Q()).stateOf(job); }
  async lanes() { return (await Q()).laneSizes(); }
  async laneOf(job: Pick<Job, 'route' | 'provider' | 'routing'>) { return (await Q()).laneOf(job); }
  async inFlight() { return (await Q()).inFlight(); }
  async persist(job: Job) { (await J()).persistJob(job); }
  async flush() { (await J()).flushJobs(); }
}
