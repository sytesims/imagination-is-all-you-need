/**
 * eta-learning: learned timings (etaLearn.ts, HW-SHAPES B5) from this computer's own finished runs, on job/settled. Each done, non-sample run
 * on a live backend adds one sample (the mock backend only with OPENHIGGSFIELD_ETA_LEARN_MOCK=1); ETAs blend them in (etaLearn.blend).
 * A run continued on another route after a decision (via 'fallback') is left out, as before: its start time is the first attempt's.
 * Leave it out of the profile and nothing new is learned; the timings already learned still count, and DELETE /api/eta/learned (plugin
 * hardware) still clears them.
 */
import { definePlugin } from '../kernel/index.js';
import type { JobEventMap } from '../services/jobEvents.js';

export const learnOnSettled: JobEventMap['job/settled'] = (job, info) => {
  if (info.via === 'fallback' || job.status !== 'done') return;
  void import('../etaLearn.js').then((L) => L.recordJob(job)).catch(() => {});
};

export default definePlugin({
  name: 'eta-learning', inject: ['jobs'],
  apply(ctx) { ctx.jobs.on('job/settled', learnOnSettled); },
});
