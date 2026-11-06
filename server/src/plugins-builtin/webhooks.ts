/**
 * webhooks: job notifications. A job with a webhook (webhookUrl on submit, or POST /api/jobs/:id/webhook) is POSTed to it when it ends, on
 * job/settled (X-Webhook-Id <jobId>:<status>, once per status). The routes and the retry loop (back-off, a hook added after the job ended,
 * deliveries owed from before a restart) are still in routesGaps.ts, served by legacy; leave this plugin out and only that loop sends them.
 */
import { definePlugin } from '../kernel/index.js';
import type { JobEventMap } from '../services/jobEvents.js';

/** routesGaps.ts sets it when it loads (no hooks before that, so nothing to send). */
let sink: ((jobId: string) => Promise<void>) | null = null;
export const setWebhookSink = (fn: typeof sink) => { sink = fn; };
export const notifyOnSettled: JobEventMap['job/settled'] = (job) => { void sink?.(job.id).catch(() => {}); };

export default definePlugin({
  name: 'webhooks', inject: ['jobs'],
  apply(ctx) { ctx.jobs.on('job/settled', notifyOnSettled); },
});
