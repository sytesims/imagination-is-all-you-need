/**
 * HW-SHAPES B2/B3 + DP 1/2 (Oct 19 2026): the full fit block for a local route (quotes, /api/routes, /api/models):
 * fit (verdict, reason, tier, etaSeconds + eta{source, samples}) + alternative + requirements.
 * HW2 (DP, Oct 19): fit.alternative = the tool's best cloud/hosted route that really runs, picked like quotes and defaults pick: the tool's models
 * in B6 quality order (defaults.ts), each model's cloud routes by B6 tier then price. Runnable = available (key set, wired, takes this job) and not a
 * demo. Only when no such route exists anywhere and quotes would run a sample run (mock backend, demo Auto on) is the demo route offered
 * (demo:true, credits 0, listCredits = its list price). Set when the local verdict is slow, too_heavy or unknown, or the route's files are known
 * to be missing (missingBytesSource 'checked' and missingBytes > 0); alternativeReason says which. null otherwise or when nothing runs.
 * Shape: {providerId, routeId, name, routeLabel, credits, priceLine, tier, tierLabel, demo, listCredits}.
 */
import type { ToolDef } from '../tools/types.js';
import { routesFor } from './routes.js';
import { option, byTier, localFit, autoOrder, demoAuto, DEMO_MESSAGE } from './select.js';
import { qualityOrder, requestMode } from './defaults.js';
import { requirementsFor, tooHeavyWarning, type Requirements } from '../hardware/requirements.js';
import { cardName } from '../models.js';
import { getProvider } from '../providers.js';
import { cleanName } from '../shared/modelCatalog.js';
import type { RouteOption } from './types.js';
import { ledgerUsd } from '../shared/priceText.js';

const usd = (cr: number) => ledgerUsd(cr); // shared/priceText.ts
export interface FitAlternative { providerId: string; routeId: string; name: string; routeLabel: string; credits: number; priceLine: string; tier: number | null; tierLabel: string | null; demo: boolean; listCredits: number | null }
const altView = (tool: ToolDef, id: string, o: RouteOption, demo: boolean): FitAlternative => {
  const list = demo ? (o.listCredits ?? null) : o.credits ?? null; const credits = demo ? 0 : o.credits!;
  return { providerId: id, routeId: o.routeId, name: cardName(tool.id, id) ?? cleanName(getProvider(id)?.name ?? id), routeLabel: String(o.label ?? o.routeId), credits,
    priceLine: demo ? `${DEMO_MESSAGE}${list != null ? ` List price ≈ ${usd(list)}.` : ''}` : `≈ ${usd(credits)}`, tier: o.tier ?? null, tierLabel: o.tierLabel ?? null, demo, listCredits: list };
};
export function fitAlternative(tool: ToolDef, input: Record<string, any> = {}): FitAlternative | null {
  let mode: string | null = null; try { mode = requestMode(tool, input); } catch { mode = null; }
  const order = qualityOrder(tool, mode);
  for (const id of order) { // real runs first, in quality order
    const opts = routesFor(id, tool).filter((r) => r.kind !== 'local' && !r.comingSoon).map((r) => option(tool, r, input)).filter((o) => o.available && !o.demo && o.credits != null).sort(byTier(false));
    if (opts[0]) return altView(tool, id, opts[0], false);
  }
  if (!demoAuto()) return null; // a demo counts only where quotes would run one
  for (const wiredOnly of [true, false]) for (const id of order) {
    const o = autoOrder(tool, id, input)[0]; if (o && o.kind !== 'local' && o.demo && (!wiredOnly || o.wired !== false)) return altView(tool, id, o, true);
  }
  return null;
}
export type AlternativeReason = 'slow' | 'too_heavy' | 'unknown' | 'weights_missing';
export function alternativeReason(fit: { verdict?: string } | null | undefined, req: Pick<Requirements, 'missingBytes' | 'missingBytesSource'> | null | undefined): AlternativeReason | null {
  const v = fit?.verdict; if (v === 'too_heavy') return v; // a download wouldn't help: too heavy says why first
  // files known to be missing win over slow / unknown (2026-10-25): the UI shows the same "needs download" state for every local model (LTX-2.5 22B is slow on a Mac AND not downloaded)
  if (req?.missingBytesSource === 'checked' && (req.missingBytes ?? 0) > 0) return 'weights_missing';
  return v === 'slow' || v === 'unknown' ? v : null;
}
/** A local route's fit with alternative + alternativeReason filled (kept as is when it already has them). */
export function withAlternative<F extends Record<string, any>>(tool: ToolDef, modelId: string, input: Record<string, any>, fit: F, req: Requirements | null = requirementsFor(tool, modelId, input)): F & { alternative: FitAlternative | null; alternativeReason: AlternativeReason | null } {
  if (fit && 'alternative' in fit && 'alternativeReason' in fit) return fit as any;
  const why = alternativeReason(fit, req); let alternative: FitAlternative | null = null;
  if (why) { try { alternative = fitAlternative(tool, input); } catch { alternative = null; } }
  return { ...fit, alternative, alternativeReason: why };
}
/** Full fit + requirements for a model's local route on this job ({} for a model without a local route). */
export function hwBlock(tool: ToolDef, modelId: string, input: Record<string, any> = {}, opt?: { fit?: any; label?: string }) {
  const r = routesFor(modelId, tool).find((x) => x.kind === 'local'); if (!r) return {};
  const fit0: any = opt?.fit ?? localFit(tool, r, input); if (!fit0) return {};
  const requirements = requirementsFor(tool, modelId, input);
  const fit = withAlternative(tool, modelId, input, fit0, requirements);
  return { fit: { ...fit, ...(fit.verdict === 'too_heavy' && fit.enforced && !fit.warning ? { pinWarning: tooHeavyWarning(fit as any, opt?.label ?? getProvider(modelId)?.name ?? 'This model') } : {}) }, requirements };
}
