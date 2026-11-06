/**
 * S-01 (QA-SHARED): the ONE spend guard for every entry point that starts a run (submit, retry, "Try on <place>", upscale, and the moves to
 * another place: POST /api/jobs/:id/fallback and runRouted's automatic next attempt): the run's cost (who bills it, estimated USD; sample /
 * local / free = $0), and the optional monthly cap (spendCap.ts, off by default): a paid run that would take this month's spend past it is
 * refused here, before anything is queued or charged. (The old per-provider limits were removed 2026-10-28 and stay removed.)
 * Each caller then checks the agent budget (agentBudget.ts admitAgentRun / admitBudget) and, after enqueue, writes the Spend row (the estimate
 * now; settleSpend puts the actual cost on it when the job ends; sample, never-sent and not-charged failed runs count $0 there).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Job } from './jobs.js';
import { costOf, recordSpend, checkSpendCap, runCountsUsd } from './billing.js';
import { admitBudget, budgetById, budgetOfRequest } from './agentBudget.js';
import { findRoute } from './routing/routes.js';

export interface GuardRun { kind: string; routeId: string | null; credits: number; demo: boolean; free: boolean }
const quoteRun = (o: GuardRun) => ({ runCost: costOf({ kind: o.kind, routeId: o.routeId, credits: o.credits, demo: o.demo }) });
/** The body every refused run gets (402 spend_cap): the plain sentence, the numbers, and that nothing was charged. */
export const capRefusal = (v: ReturnType<typeof checkSpendCap>) => ({ error: v.message!, userMessage: v.message!, errorType: 'spend_cap', code: 'spend_cap', calm: true,
  issues: [{ code: 'spend_cap', field: '', message: v.message! }], spendCap: { monthlyUsd: v.capUsd, spentUsd: v.spentUsd, runUsd: v.runUsd, leftUsd: v.leftUsd, resetsOn: v.resetsOn },
  charged: false, refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' } });
/** Returns the run's cost and the Spend-row writer, or sends 402 spend_cap when the run would go past the monthly cap. */
export async function spendGuard(reply: FastifyReply, o: GuardRun): Promise<{ sent: FastifyReply } | { runCost: ReturnType<typeof costOf>; spendRow: (job: Job) => void }> {
  const q = quoteRun(o);
  const cap = checkSpendCap(runCountsUsd(q.runCost, o.free));
  if (!cap.ok) return { sent: reply.code(402).send(capRefusal(cap)) };
  return { runCost: q.runCost, spendRow: (job: Job) => { recordSpend(job, o.free ? 0 : o.credits, { demo: o.demo }); } };
}

/** Before a job moves to `routeId` (attempt N>1, POST /api/jobs/:id/fallback or runRouted's automatic next route), the same guard as a
 *  submit: quote the new route → agent budget (the job's own budget, else the request's header). Blocked → {status,
 *  body, message} (the submit's 400 body); nothing is changed. Passed → commit() moves the job's Spend row to the new route with its estimate
 *  (settleSpend puts the actual cost on it when the job ends). */
export function guardNextRoute(job: Job, routeId: string, req?: FastifyRequest):
  { blocked: { status: number; message: string; body: Record<string, any>; code: string } } | { commit: () => void } {
  const R = job.routing; const credits = R?.prices[routeId] ?? 0; const free = !!job.input?.free; const demo = !!R?.demo;
  const kind = findRoute(routeId)?.kind ?? routeId.split(':')[0];
  const q = quoteRun({ kind, routeId, credits, demo, free });
  const cap = checkSpendCap(runCountsUsd(q.runCost, free), job.id); // this job's own row (the attempt that failed) is left out: it moves to the new route
  if (!cap.ok) { const body = capRefusal(cap); return { blocked: { status: 402, message: body.error, body, code: 'spend_cap' } }; }
  const budget = job.agent?.id ? budgetById(job.agent.id) : req ? budgetOfRequest(req) : undefined;
  const ag = admitBudget(budget, { jobId: job.id, toolId: job.toolId, model: job.modelKey ?? job.provider, estUsd: free ? 0 : q.runCost.estUsd, credits: free || q.runCost.demo ? 0 : credits, excludeJobId: job.id });
  if ('refused' in ag) return { blocked: { ...ag.refused, code: String(ag.refused.body.code) } };
  return { commit: () => { if (ag.agent && !job.agent) job.agent = ag.agent; recordSpend(job, free ? 0 : credits, { demo, route: routeId }); } };
}
