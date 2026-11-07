/**
 * agent-budgets: a spending budget per agent (MCP set_budget, header X-OHF-Agent-Budget; agentBudget.ts keeps the store and the math).
 * It hooks the money guard (ctx.spend, stage 'budget'): a run that would go over the budget named by the request (or carried by a job that
 * moves to its next route) is refused with 400 agent_budget before anything reaches a provider; an unknown or closed budget fails closed
 * (agent_budget_unknown). A passed run holds its amount until its Spend row exists, so two parallel submits can't both fit.
 * It also adds the budget to every quote (quote/compute, order 20) and owns /api/agent/budgets (create, list, one, receipt, close).
 * Leave it out of the profile and the header is ignored, the routes answer 404 and nothing is checked; the guard itself stays.
 */
import { definePlugin } from '../kernel/index.js';
import type { Admitter } from '../services/spend.js';
import type { QuoteStep } from '../services/pricing.js';
import { admitBudget, budgetById, budgetOfRequest, budgetQuote, budgetRoutes } from '../agentBudget.js';

/** spend/admit, stage 'budget'. The budget: an explicit one (a story's or reel's total), else the moving job's own, else the request header's. */
export const budgetCheck: Admitter = { id: 'agent-budgets', stage: 'budget', admit(run) {
  const b = 'budget' in run ? run.budget : run.job?.agent?.id ? budgetById(run.job.agent.id) : run.req ? budgetOfRequest(run.req) : undefined;
  const estUsd = run.budgetUsd ?? (run.free ? 0 : run.runCost?.estUsd ?? 0);
  const credits = run.budgetCredits ?? (run.free || run.runCost?.demo ? 0 : run.credits);
  const a = admitBudget(b, { jobId: run.jobId ?? run.job?.id ?? '', toolId: run.toolId ?? run.job?.toolId ?? '', model: run.model ?? null, estUsd, credits,
    ...(run.excludeJobId ? { excludeJobId: run.excludeJobId } : {}), ...(run.hold === false ? { hold: false } : {}) });
  return 'refused' in a ? { ...a.refused, code: String(a.refused.body.code) } : a;
} };

/** quote/compute (order 20): the agent budget on the quote, runnable:false when this run doesn't fit. */
export const budgetStep: QuoteStep = { id: 'agent-budgets', order: 20, run: (q) => budgetQuote(q.req, q.payload) };

export default definePlugin({
  name: 'agent-budgets', inject: ['spend', 'pricing', 'http'],
  apply(ctx) {
    ctx.spend.feature('agent-budgets'); ctx.spend.use(budgetCheck); ctx.pricing.step(budgetStep);
    for (const r of budgetRoutes()) ctx.http.route(r);
  },
});
