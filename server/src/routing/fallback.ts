/**
 * Model-fallback notice: when the model or route that was asked for can't run and the server (or the user, after a route failure)
 * moves the job somewhere else, every place a client looks carries the same object so it can show one honest notice.
 *   fallback: null | { requestedModel, usedModel, requestedRoute, usedRoute, fallbackReason: {code, message}, costDiffers, requestedCredits, usedCredits, creditDelta }
 * Codes:
 *   model_unavailable  the requested model isn't offered here (hidden in open-weights-only mode, not on this tool, unknown) and the client
 *                      sent another one instead (Recreate prefill does this; the client passes requestedModel=<original> on submit/quote).
 *   pin_invalid        the saved per-model route no longer serves this model, so Auto picked the route.
 *   route_failed       a route failed during the run and Auto / allowFallback moved the job to the next route (failed attempt refunded).
 *   route_chosen       a pinned route failed (needs_decision) and the user picked another route (POST /api/jobs/{id}/fallback).
 * requestedCredits/usedCredits are the job's own route prices (shown = charged); costDiffers is null when the requested side has no price.
 * The model itself is never swapped server-side (an unsupported provider is a 400); usedModel differs only for model_unavailable.
 */
import type { Job } from '../jobs.js';
import type { ToolDef } from '../tools/types.js';
import { getProvider, toolProviders, openWeightsOnly } from '../providers.js';
import { findRoute } from './routes.js';
import { teamMode } from '../billingMode.js';
import type { JobRouting } from './types.js';

export interface FallbackReason { code: 'model_unavailable' | 'pin_invalid' | 'route_failed' | 'route_chosen'; message: string }
export interface FallbackNotice {
  requestedModel: string; usedModel: string; requestedRoute: string | null; usedRoute: string | null;
  fallbackReason: FallbackReason; costDiffers: boolean | null; requestedCredits: number | null; usedCredits: number | null; creditDelta: number | null;
}
/** Stored on job.input.modelFallback at submit (model_unavailable). */
export interface ModelFallback { requestedModel: string; message: string; requestedCredits: number | null }

const nameOf = (id: string) => getProvider(id)?.name ?? id;
const labelOf = (routeId: string | null | undefined) => (routeId ? findRoute(routeId)?.label ?? routeId : 'another route');

/** Why `requested` can't run on `tool` here, or null when it can (then there is no fallback to report). */
export function modelUnavailableReason(tool: ToolDef, requested: string): string | null {
  if (toolProviders(tool).some((p) => p.id === requested)) return null;
  const p = getProvider(requested);
  if (!p) return `${requested} is not a known model`;
  if (!tool.providers.includes(requested)) return `${p.name} isn't offered by ${tool.name}`;
  return openWeightsOnly() ? `${p.name} is hidden in open-weights-only mode` : `${p.name} isn’t ready yet. Pick another model`;
}
/** Submit/quote: validate requestedModel. null = nothing to report (absent, same as used, or actually usable here). */
export function modelFallbackFor(tool: ToolDef, usedModel: string, requestedModel: unknown, requestedCredits: number | null = null): ModelFallback | null {
  const r = typeof requestedModel === 'string' ? requestedModel.trim() : '';
  if (!r || r === usedModel) return null;
  const why = modelUnavailableReason(tool, r); if (!why) return null;
  return { requestedModel: r, message: `${why}, so ${nameOf(usedModel)} was used instead.`, requestedCredits };
}
const notice = (o: Omit<FallbackNotice, 'costDiffers' | 'creditDelta'>): FallbackNotice => {
  const d = o.requestedCredits != null && o.usedCredits != null ? o.usedCredits - o.requestedCredits : null;
  return { ...o, costDiffers: d == null ? null : d !== 0, creditDelta: d };
};
/** Notice for a plan (quote / submit response): model_unavailable wins over pin_invalid (it is what the user asked for). */
export function planNotice(routing: JobRouting | undefined, usedModel: string, usedRoute: string | null, usedCredits: number | null, mf: ModelFallback | null): FallbackNotice | null {
  if (mf) return notice({ requestedModel: mf.requestedModel, usedModel, requestedRoute: null, usedRoute, fallbackReason: { code: 'model_unavailable', message: mf.message }, requestedCredits: mf.requestedCredits, usedCredits });
  const pf = routing?.planFallback;
  if (pf) return notice({ requestedModel: usedModel, usedModel, requestedRoute: pf.requestedRoute ?? null, usedRoute, fallbackReason: { code: 'pin_invalid', message: pf.message }, requestedCredits: null, usedCredits });
  return null;
}
/** Notice for a job (GET /api/jobs/{id}, lists): run-time route moves first, else what was decided at submit. */
export function jobFallback(j: Job): FallbackNotice | null {
  const R = j.routing; const mf = (j.input?.modelFallback ?? null) as ModelFallback | null;
  const atts = j.routeAttempts ?? [];
  const used = j.route ?? null; const first = atts[0]?.routeId ?? R?.order[0] ?? null;
  const price = (id: string | null) => (id && R ? R.prices[id] ?? null : null);
  if (R && atts.length > 1 && used && first && used !== first) {
    const failed = atts.find((a) => a.routeId === first); const chosen = R.mode === 'pinned' && !R.allowFallback;
    const why = `${labelOf(first)} failed${failed?.error ? ` (${String(failed.error).replace(/[.\s]+$/, '')})` : ''}`;
    return notice({ requestedModel: mf?.requestedModel ?? j.provider, usedModel: j.provider, requestedRoute: R.planFallback?.requestedRoute ?? first, usedRoute: used,
      fallbackReason: { code: chosen ? 'route_chosen' : 'route_failed', message: j.status === 'failed' ? `${why}; ${labelOf(used)} was tried next and failed too.${teamMode() ? " Each failed attempt's credits went back to your balance." : ''}` : chosen ? `${why}; you picked ${labelOf(used)}.${teamMode() ? " The failed attempt's credits went back to your balance." : ''}` : `${why}, so it ran on ${labelOf(used)}.${teamMode() ? " The failed attempt's credits went back to your balance." : ''}` },
      requestedCredits: price(first), usedCredits: price(used) });
  }
  return planNotice(R, j.provider, used ?? first, price(used ?? first), mf);
}
/** What the requested model would have cost for this input: its cheapest priced cloud route, else its local route (0), else null.
 *  Availability is ignored on purpose (it couldn't run, which is why there is a fallback). */
export async function requestedCreditsFor(tool: ToolDef, requested: string, input: Record<string, any>, passes = 1): Promise<number | null> {
  if (!getProvider(requested) || !tool.providers.includes(requested)) return null;
  const { routesFor } = await import('./routes.js'); const { routeCredits } = await import('./select.js');
  const rs = routesFor(requested).filter((r) => !r.comingSoon);
  const cloud = rs.filter((r) => r.kind !== 'local').map((r) => routeCredits(tool, r, input, passes)).filter((c): c is number => c != null).sort((a, b) => a - b)[0];
  return cloud ?? (rs.some((r) => r.kind === 'local') ? 0 : null);
}
