/**
 * S-01 (QA-SHARED): the ONE spend guard for every entry point that starts a run (submit, retry, "Try on <place>", upscale, and the moves to
 * another place: POST /api/jobs/:id/fallback and runRouted's automatic next attempt). It prices the run (ctx.pricing: who bills it, estimated
 * USD; sample / local / free = $0) and asks ctx.spend (services/spend.ts) to admit it; the checks are plugins on spend/admit: the optional
 * monthly cap (spend-cap, stage 'limit'), the team-mode balance (billing-team-mode, 'balance') and the agent budget (agent-budgets, 'budget').
 * The first refusal wins and nothing is queued or charged. (The old per-provider limits were removed 2026-10-28 and stay removed.)
 * Each caller asks the stages in today's order (submit: limit → balance → … → budget right before enqueue) and, after enqueue, writes the
 * Spend row (the estimate now; settleSpend puts the actual cost on it when the job ends; sample, never-sent and not-charged failed runs count $0).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Job } from './jobs.js';
import { costOf, recordSpend } from './billing.js';
import { findRoute } from './routing/routes.js';
import { spend, type AdmitRun, type Refusal, type Agent } from './services/spend.js';
import './services/spendBuiltin.js'; // the built-in checks when nothing booted (scripts, tests)

export interface GuardRun { kind: string; routeId: string | null; credits: number; demo: boolean; free: boolean }
const quoteRun = (o: GuardRun) => ({ runCost: costOf({ kind: o.kind, routeId: o.routeId, credits: o.credits, demo: o.demo }) });
/** Returns the run's cost and the Spend-row writer, or sends the refusal (402 spend_cap) when a 'limit' check refuses the run. */
export async function spendGuard(reply: FastifyReply, o: GuardRun): Promise<{ sent: FastifyReply } | { runCost: ReturnType<typeof costOf>; spendRow: (job: Job) => void }> {
  const q = quoteRun(o);
  const lim = spend.admit('limit', { runCost: q.runCost, credits: o.credits, free: o.free });
  if ('refused' in lim) return { sent: reply.code(lim.refused.status).send(lim.refused.body) };
  return { runCost: q.runCost, spendRow: (job: Job) => { recordSpend(job, o.free ? 0 : o.credits, { demo: o.demo }); } };
}
/** A later stage of the same guard (balance: team-mode credits; budget: the agent budget). null = admitted (budget: with its agent). */
export function admitStage(stage: 'balance' | 'budget', run: AdmitRun): { refused: Refusal } | { agent: Agent | null } { return spend.admit(stage, run); }
/** The agent budget for a submit, right before enqueue (was agentBudget.ts admitAgentRun): refused → the reply was sent. */
export function admitAgentRun(req: FastifyRequest, reply: FastifyReply, run: AdmitRun): FastifyReply | { agent: Agent | null } {
  const a = spend.admit('budget', { ...run, req }); return 'refused' in a ? reply.code(a.refused.status).send(a.refused.body) : a;
}

/** Before a job moves to `routeId` (attempt N>1, POST /api/jobs/:id/fallback or runRouted's automatic next route), the same guard as a
 *  submit: quote the new route → limit → agent budget (the job's own budget, else the request's header). Blocked → {status,
 *  body, message} (the submit's body); nothing is changed. Passed → commit() moves the job's Spend row to the new route with its estimate
 *  (settleSpend puts the actual cost on it when the job ends). */
export function guardNextRoute(job: Job, routeId: string, req?: FastifyRequest):
  { blocked: { status: number; message: string; body: Record<string, any>; code: string } } | { commit: () => void } {
  const R = job.routing; const credits = R?.prices[routeId] ?? 0; const free = !!job.input?.free; const demo = !!R?.demo;
  const kind = findRoute(routeId)?.kind ?? routeId.split(':')[0];
  const q = quoteRun({ kind, routeId, credits, demo, free });
  const run: AdmitRun = { runCost: q.runCost, credits, free, excludeJobId: job.id, jobId: job.id, toolId: job.toolId, model: job.modelKey ?? job.provider, job, ...(req ? { req } : {}) };
  const lim = spend.admit('limit', run); // this job's own row (the attempt that failed) is left out: it moves to the new route
  if ('refused' in lim) return { blocked: { status: lim.refused.status, message: lim.refused.message, body: lim.refused.body, code: lim.refused.code } };
  const ag = spend.admit('budget', run);
  if ('refused' in ag) return { blocked: { status: ag.refused.status, message: ag.refused.message, body: ag.refused.body, code: ag.refused.code } };
  return { commit: () => { if (ag.agent && !job.agent) job.agent = ag.agent; recordSpend(job, free ? 0 : credits, { demo, route: routeId }); } };
}
