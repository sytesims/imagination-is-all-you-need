/**
 * S-01 (QA-SHARED): the ONE spend guard for every entry point that starts a run (submit, retry, "Try on <place>", upscale, and the moves to
 * another place: POST /api/jobs/:id/fallback and runRouted's automatic next attempt): the run's cost (who bills it, estimated USD; sample /
 * local / free = $0). There are no spending limits (removed 2026-10-28, user decision: spend is controlled by how much the user tops up).
 * Each caller then checks the agent budget (agentBudget.ts admitAgentRun / admitBudget) and, after enqueue, writes the Spend row (the estimate
 * now; settleSpend puts the actual cost on it when the job ends; sample, never-sent and not-charged failed runs count $0 there).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Job } from './jobs.js';
import { costOf, recordSpend } from './billing.js';
import { admitBudget, budgetById, budgetOfRequest } from './agentBudget.js';
import { findRoute } from './routing/routes.js';

export interface GuardRun { kind: string; routeId: string | null; credits: number; demo: boolean; free: boolean }
const quoteRun = (o: GuardRun) => ({ runCost: costOf({ kind: o.kind, routeId: o.routeId, credits: o.credits, demo: o.demo }) });
/** Never refuses (no spending limits): returns the run's cost and the Spend-row writer. Async and shaped as before so callers keep `'sent' in sg`. */
export async function spendGuard(_reply: FastifyReply, o: GuardRun): Promise<{ sent: never } | { runCost: ReturnType<typeof costOf>; spendRow: (job: Job) => void }> {
  const q = quoteRun(o);
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
  const budget = job.agent?.id ? budgetById(job.agent.id) : req ? budgetOfRequest(req) : undefined;
  const ag = admitBudget(budget, { jobId: job.id, toolId: job.toolId, model: job.modelKey ?? job.provider, estUsd: free ? 0 : q.runCost.estUsd, credits: free || q.runCost.demo ? 0 : credits, excludeJobId: job.id });
  if ('refused' in ag) return { blocked: { ...ag.refused, code: String(ag.refused.body.code) } };
  return { commit: () => { if (ag.agent && !job.agent) job.agent = ag.agent; recordSpend(job, free ? 0 : credits, { demo, route: routeId }); } };
}
