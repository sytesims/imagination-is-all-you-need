/**
 * ctx.spend (plan §3.3, §3.5, R5): the ONE money guard. Every entry point that starts a run (submit, retry, Try on, upscale, a story or reel
 * total, and the moves to another route: POST /api/jobs/:id/fallback and runRouted's automatic next attempt) asks admit(stage, run) before
 * anything is queued or charged. admit runs the `spend/admit` bail chain: the checks plugins registered for that stage, in order; the first
 * refusal wins and nothing after it runs.
 *
 * Stages (each caller asks them in today's order, so every refusal and its body stay the same):
 *  - 'limit'   the monthly cap (plugin spend-cap)
 *  - 'balance' team mode: the credit balance covers the run (plugin billing-team-mode)
 *  - 'budget'  the agent budget named by X-OHF-Agent-Budget or carried by the job (plugin agent-budgets; a passed check may hold its amount)
 *
 * The service is part of the kernel: boot.ts always mounts it and no profile can leave it out (the cap is a plugin, the guard is not). A stage
 * with no check admits. The ledger (charge, refund) and the Spend log stay ledger.ts and billing.ts. Without a boot (scripts, tests) the
 * built-in checks are on (services/spendBuiltin.ts), as in the desktop profile.
 */
import type { FastifyRequest } from 'fastify';
import { Service, type Context } from '../kernel/index.js';
import type { Job } from '../jobs.js';
import type { CostEstimate } from '../billing.js';
import type { AgentBudget } from '../agentBudget.js';
import { manageMoneyFeatures, featureOn, moneyFeature, type MoneyFeature } from './spendFeatures.js';

export type AdmitStage = 'limit' | 'balance' | 'budget';
export const ADMIT_STAGES: readonly AdmitStage[] = ['limit', 'balance', 'budget'];
/** What a check sees about the run about to start. */
export interface AdmitRun {
  /** The run's priced cost (billing.costOf). The 'limit' and 'budget' checks read it. */
  runCost?: CostEstimate;
  /** The run's credits (its route's price). */
  credits: number;
  /** A free-gen run (counts $0). */
  free: boolean;
  jobId?: string; toolId?: string; model?: string | null;
  /** A job moving to its next route: its own Spend row is left out of the month and the budget (the row moves to the new route). */
  excludeJobId?: string;
  /** Who asks (the agent budget header), and the job that moves (it keeps its own agent budget). */
  req?: FastifyRequest; job?: Job;
  /** An explicit agent budget (a story's or reel's total). Left out: the job's own budget, else the request header's. */
  budget?: AgentBudget | { error: string; status: number };
  /** The agent budget amounts when they aren't the run's own (a story's or reel's total). */
  budgetUsd?: number; budgetCredits?: number;
  /** false = check only, hold nothing (a story's or reel's total: each shot is admitted and held on its own submit). */
  hold?: boolean;
}
/** A refused run: the HTTP status, the code, the plain sentence and the body the caller sends (nothing was charged). */
export interface Refusal { status: number; code: string; message: string; body: Record<string, any>; needed?: number; balance?: number }
export type Agent = { id: string; name: string };
export type AdmitResult = { refused: Refusal } | { agent: Agent | null };
export interface Admitter {
  /** The plugin's id (dump, tests). */
  id: string;
  stage: AdmitStage;
  /** Lower runs first inside a stage (default 0). */
  order?: number;
  /** A refusal; or (budget) the agent the run is charged to; or nothing (admitted). */
  admit(run: AdmitRun): Refusal | { agent: Agent | null } | void | undefined;
}

/** The registry behind ctx.spend. One per process, so code that has no ctx (legacy.ts, routing/run.ts) reads the same one. */
export class Spend {
  private list: Admitter[] = [];
  private builtIn: Admitter[] = [];
  /** true once boot.ts mounted the spend service: from then on only plugins add checks. Before that the built-in checks are on. */
  managed = false;
  setBuiltIn(list: Admitter[]) { this.builtIn = list; }
  use(a: Admitter): () => void {
    if (!ADMIT_STAGES.includes(a.stage)) throw new Error(`spend: "${a.stage}" isn't an admit stage (${ADMIT_STAGES.join(', ')})`);
    this.list.push(a); return () => { const i = this.list.indexOf(a); if (i >= 0) this.list.splice(i, 1); };
  }
  /** The checks of a stage, in order. */
  checks(stage: AdmitStage): Admitter[] {
    const src = this.managed ? this.list : [...this.list, ...this.builtIn.filter((b) => !this.list.some((x) => x.id === b.id))];
    return src.map((a, i) => ({ a, i })).filter((x) => x.a.stage === stage).sort((x, y) => (x.a.order ?? 0) - (y.a.order ?? 0) || x.i - y.i).map((x) => x.a);
  }
  /** spend/admit (bail): the first refusal wins; otherwise the agent the run is charged to (null: none). */
  admit(stage: AdmitStage, run: AdmitRun): AdmitResult {
    let agent: Agent | null = null;
    for (const a of this.checks(stage)) {
      const r = a.admit(run); if (!r) continue;
      if ('agent' in r) { agent = r.agent ?? agent; continue; }
      return { refused: r };
    }
    return { agent };
  }
  /** The ids of the checks per stage (dump, tests). */
  view(): Record<AdmitStage, string[]> { return Object.fromEntries(ADMIT_STAGES.map((s) => [s, this.checks(s).map((a) => a.id)])) as Record<AdmitStage, string[]>; }
}
export const spend = new Spend();

/** The kernel service: ctx.spend. Plugins add checks (spend/admit) and turn their feature on; both go away when the plugin is disposed. */
export class SpendService extends Service {
  constructor(ctx: Context) { super(ctx, 'spend'); spend.managed = true; manageMoneyFeatures(); }
  /** Add a check to a stage of spend/admit. */
  use(a: Admitter) { return this.ctx.effect(() => spend.use(a), `spend check ${a.id} (${a.stage})`); }
  /** Mark a money feature on while the calling plugin is loaded (its card on the Spend page, its quote lines). */
  feature(f: MoneyFeature) { return this.ctx.effect(() => featureOn(f), `money feature ${f}`); }
  has(f: MoneyFeature) { return moneyFeature(f); }
  admit(stage: AdmitStage, run: AdmitRun) { return spend.admit(stage, run); }
  view() { return spend.view(); }
  /** The ledger (team mode charges and refunds) and the Spend log, unchanged; lazy, so mounting the service never opens them early. */
  ledger() { return import('../ledger.js'); }
  log() { return import('../billing.js'); }
}
