/**
 * spend-cap: the optional monthly limit (spendCap.ts, off until the user sets one on the Spend page). It hooks the money guard (ctx.spend,
 * stage 'limit'): a paid run that would take this month's spend past the limit is refused with 402 spend_cap before anything is queued or
 * charged; free runs (local, sample, free gens) always go. It also adds the limit to every quote (quote/compute, order 10) so Generate says
 * why before a click, owns PUT /api/settings/spend-cap, and turns on the Spend page's limit card (GET /api/spend/tally `cap`).
 * Leave it out of the profile and the card, the quote lines, the route and the check are gone; the guard itself stays (it is the kernel's).
 */
import { definePlugin } from '../kernel/index.js';
import type { Admitter, Refusal } from '../services/spend.js';
import type { QuoteStep } from '../services/pricing.js';
import { checkSpendCap, runCountsUsd, putSpendCap } from '../billing.js';

/** The body every refused run gets (402 spend_cap): the plain sentence, the numbers, and that nothing was charged. */
export const capRefusal = (v: ReturnType<typeof checkSpendCap>) => ({ error: v.message!, userMessage: v.message!, errorType: 'spend_cap', code: 'spend_cap', calm: true,
  issues: [{ code: 'spend_cap', field: '', message: v.message! }], spendCap: { monthlyUsd: v.capUsd, spentUsd: v.spentUsd, runUsd: v.runUsd, leftUsd: v.leftUsd, resetsOn: v.resetsOn },
  charged: false, refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' } });

/** spend/admit, stage 'limit': month to date + this run must stay at or under the limit (a moving job's own row is left out). */
export const capCheck: Admitter = { id: 'spend-cap', stage: 'limit', admit(run): Refusal | void {
  if (!run.runCost) return;
  const cap = checkSpendCap(runCountsUsd(run.runCost, run.free), run.excludeJobId);
  if (cap.ok) return;
  const body = capRefusal(cap); return { status: 402, code: 'spend_cap', message: body.error, body };
} };

/** quote/compute (order 10): the limit on the quote, and runnable:false (spend_cap) when this run would go past it. */
export const capStep: QuoteStep = { id: 'spend-cap', order: 10, run(q) {
  if (!q.cost) return q.payload; // the core step didn't price this answer
  const cv = checkSpendCap(runCountsUsd(q.cost, q.payload.free === true));
  const capView = cv.capUsd == null ? {} : { spendCap: { monthlyUsd: cv.capUsd, spentUsd: cv.spentUsd, leftUsd: cv.leftUsd, resetsOn: cv.resetsOn, ok: cv.ok } };
  if (!cv.ok && q.payload.runnable !== false) return { ...q.payload, ...capView, runnable: false, blockedReason: cv.reason, blockedCode: 'spend_cap' };
  return { ...q.payload, ...capView };
} };

export default definePlugin({
  name: 'spend-cap', inject: ['spend', 'pricing', 'http'],
  apply(ctx) {
    ctx.spend.feature('spend-cap'); ctx.spend.use(capCheck); ctx.pricing.step(capStep);
    ctx.http.route({ method: 'PUT', url: '/api/settings/spend-cap', handler: putSpendCap });
  },
});
