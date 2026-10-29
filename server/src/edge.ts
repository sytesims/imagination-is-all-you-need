/**
 * Edge-case server items: queue cap (#3). The #4 moderation cooldown was removed 2026-10-17 (no policing layer).
 * Single-user server: "per user" = this instance. Numbers marked (ours) are our own choices.
 */
import type { Job } from './jobs.js';
import { jobs } from './jobs.js';
import { env } from './env.js';

/** #3 Max queued (status=queued) jobs, default 20 (ours). 0 = legacy behaviour (only the MAX_PARALLEL in-flight cap). */
export const MAX_QUEUED = Number(env('MAX_QUEUED') ?? 20);
export const queuedCount = () => [...jobs.values()].filter((j) => j.status === 'queued').length;
export function queueFull() {
  const queued = queuedCount();
  return MAX_QUEUED > 0 && queued >= MAX_QUEUED
    ? { error: `Your queue is full (${queued}/${MAX_QUEUED} waiting). Wait for one to start or cancel a queued job.`, errorType: 'concurrency', code: 'queue_full', limit: MAX_QUEUED, queued, refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' } }
    : null;
}

/** #9 slow-job hint: elapsed > 2× ETA (ours). */
export const isSlow = (j: Job) => { const eta = j.input?.etaOverride ?? j.etaInitial ?? 0; const from = j.stageTimes?.loading_model?.end ?? j.stageTimes?.downloading_model?.end ?? j.startedAt ?? j.createdAt; /* HW-SHAPES B4: first-use download / load don't count */ return j.status === 'running' && eta > 0 && (Date.now() - from) / 1000 > 2 * eta; };
