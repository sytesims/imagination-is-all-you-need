/**
 * ctx.pricing (plan §3.3, §3.5): what a run costs.
 *  - quote(run): the run's cost estimate (who bills it, estimated USD; sample / local / free = $0): billing.ts costOf, unchanged.
 *  - routePrice(job, routeId): the credits the job's routing priced for that route.
 *  - addOn(a): a route add-on (services/routeAddOns.ts), the route step of quote/compute: extra credits in the route price, its own quote line;
 *  - the `quote/compute` waterfall: every quote answer (GET /api/tools/:id/price, /api/models/quote; POST /price re-enters as a GET) passes
 *    through its steps in order, each one adding its lines to the answer. The core step (billing.ts, order 0) adds `cost` and `billingMode`;
 *    spend-cap (order 10) adds the monthly limit and blocks a run past it; agent-budgets (order 20) adds the agent budget and blocks a run over it.
 *    The steps run where billing's quote hook always ran (after the routing hook), so every quote is the same as before.
 * Without a boot (scripts, tests) the built-in steps are on (services/spendBuiltin.ts), as in the desktop profile.
 */
import type { FastifyRequest } from 'fastify';
import { Service, type Context } from '../kernel/index.js';
import type { Job } from '../jobs.js';
import type { CostEstimate } from '../billing.js';
import { addOnOn, manageAddOns, type RouteAddOn } from './routeAddOns.js';

/** One quote answer on its way out. A step returns the new payload (or the same one). `cost` is set by the core step when it priced the run. */
export interface QuoteDraft { req: FastifyRequest; payload: any; cost?: CostEstimate }
export interface QuoteStep { id: string; order: number; run(q: QuoteDraft): any }
/** The quote answers the waterfall applies to (the same test both old hooks made). */
export const isQuoteRequest = (req: FastifyRequest, payload: unknown) => {
  const url = req.url.split('?')[0];
  return req.method === 'GET' && (url === '/api/models/quote' || /^\/api\/tools\/[^/]+\/price$/.test(url)) && !!payload && typeof payload === 'object' && !Array.isArray(payload);
};

export class Pricing {
  private steps: QuoteStep[] = [];
  private builtIn: QuoteStep[] = [];
  managed = false;
  setBuiltIn(list: QuoteStep[]) { this.builtIn = list; }
  /** The core step lives in billing.ts and is always on. */
  private core: QuoteStep | null = null;
  setCore(s: QuoteStep) { this.core = s; }
  add(s: QuoteStep): () => void { this.steps.push(s); return () => { const i = this.steps.indexOf(s); if (i >= 0) this.steps.splice(i, 1); }; }
  list(): QuoteStep[] {
    const extra = this.managed ? this.steps : [...this.steps, ...this.builtIn.filter((b) => !this.steps.some((x) => x.id === b.id))];
    return [...(this.core ? [this.core] : []), ...extra].map((s, i) => ({ s, i })).sort((a, b) => a.s.order - b.s.order || a.i - b.i).map((x) => x.s);
  }
  /** quote/compute (waterfall): the payload after every step. A step that throws leaves the payload as it was. */
  compute(req: FastifyRequest, payload: any): any {
    const q: QuoteDraft = { req, payload };
    for (const s of this.list()) { try { q.payload = s.run(q); } catch { /* a step never breaks a quote */ } }
    return q.payload;
  }
  /** The run's cost estimate (billing.ts costOf). */
  async quote(o: Parameters<typeof import('../billing.js').costOf>[0]) { return (await import('../billing.js')).costOf(o); }
  routePrice(job: Pick<Job, 'routing'>, routeId: string): number { return job.routing?.prices[routeId] ?? 0; }
}
export const pricing = new Pricing();

/** The kernel service: ctx.pricing. A step a plugin adds goes away when the plugin is disposed. */
export class PricingService extends Service {
  constructor(ctx: Context) { super(ctx, 'pricing'); pricing.managed = true; manageAddOns(); }
  step(s: QuoteStep) { return this.ctx.effect(() => pricing.add(s), `quote step ${s.id}`); }
  /** A route add-on (quote/compute, route step: services/routeAddOns.ts): its credits go into the route price (quote = charge), its line into the quote. */
  addOn(a: RouteAddOn) { return this.ctx.effect(() => addOnOn(a), `route add-on ${a.id}`); }
  steps() { return pricing.list().map((s) => s.id); }
  quote(o: Parameters<Pricing['quote']>[0]) { return pricing.quote(o); }
  routePrice(job: Pick<Job, 'routing'>, routeId: string) { return pricing.routePrice(job, routeId); }
}
