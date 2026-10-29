/**
 * The rounding rules of a run's price, in one place so the server's quote (billing.ts costOf, select.ts routeCredits) and the bar's live
 * option prices (web/src/shared/optionPrice.ts) can't drift (2026-10-25). Pure: no server imports, safe in the browser.
 */
import { usdToCredits, COMFY_CREDITS_PER_USD } from './hostedPrices.js';

/** $ amounts (moved from web billing.ts, 2026-10-26, so the share receipt can use it too): '$0.00', '$0.045' (3 decimals under 10 cents), '$0.42', '$12.40'; '—' for no value. */
export const fmtUsd = (n: number | null | undefined): string => { if (n == null || !Number.isFinite(n)) return '—'; const a = Math.abs(n); if (a === 0) return '$0.00';
  if (a < 0.1) { const s = a.toFixed(3).replace(/0$/, ''); return `${n < 0 ? '-' : ''}$${s}`; } return `${n < 0 ? '-' : ''}$${a.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; };
/** USD to 4 decimals (cost.estUsd). */
export const r4 = (n: number) => Math.round(n * 10000) / 10000;
/** Comfy credits for a USD figure, rounded UP (2026-10-24, was Math.round of the cent-rounded price: Seedream Pro layers 2K showed 13 for 13.58).
 *  Rounded to 2 decimals first (Comfy shows credits to 2 decimals; the rows keep USD to 5 decimals, so 17 credits must not show as 18). */
export const comfyUnits = (usd: number) => Math.ceil(Math.round(usd * COMFY_CREDITS_PER_USD * 100) / 100);
/** The exact (unrounded) USD when it belongs to these cent-rounded dollars (it rounds up to them); else null and the cent figure is used. */
export const exactWithinCent = (exactUsd: number | null | undefined, realUsd: number | null): number | null =>
  typeof exactUsd === 'number' && exactUsd > 0 && realUsd != null && exactUsd <= realUsd + 1e-9 && realUsd - exactUsd < 0.01 - 1e-9 ? exactUsd : null;

/** Units in the provider's own currency where it has one (Comfy credits at 211 per USD; BFL credits at 100 per USD); {} for the rest. */
export const providerUnits = (billedTo: string, usd: number): { estUnits?: number; unitLabel?: string } =>
  billedTo === 'comfy' ? { estUnits: comfyUnits(usd), unitLabel: 'Comfy credits' } : billedTo === 'bfl' ? { estUnits: Math.round(usd * 100), unitLabel: 'BFL credits' } : {};

/** A per-second route's price for `seconds` of output: the same math the charge runs (pricing.ts priceOf: rate × seconds, usdToCredits
 *  rounded up per request, at least 1 credit) and the same cost fields costOf derives from it (estUsd = credits / 100, Comfy credits from
 *  the exact USD). `rate` is the unrounded USD per second (quote.perSecond.exactUsd, else .usd). */
export function perSecondRun(rate: number, seconds: number, billedTo = 'comfy'): { credits: number; estUsd: number; exactUsd: number; comfyUnits: number; estUnits: number | null } {
  const exactUsd = Math.round(rate * seconds * 1e8) / 1e8;
  const credits = Math.max(1, usdToCredits(rate * seconds)); const estUsd = r4(credits / 100); const unitUsd = exactWithinCent(exactUsd, estUsd) ?? estUsd;
  return { credits, estUsd, exactUsd, comfyUnits: comfyUnits(unitUsd), estUnits: providerUnits(billedTo, unitUsd).estUnits ?? null };
}
