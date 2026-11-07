/**
 * The app's price answer (GET /api/tools/:id/price, /api/models/quote) in the connector's words (audit 2026-11-07 #2, #8). Pure, so test/quote-view.ts
 * checks the shapes without a server:
 *  - a request that can't run is never "Free": free:false, priceLabel "Not available" (with the list price when the app knows one, marked as not a
 *    quote), and blockedReason always says why (the app puts it in blockedReason, unavailableReason, priceLine or reason);
 *  - a sample (keyless preview: nothing sent, nothing billed) says sample:true, chargeUsd 0 and listPriceUsd (what a real run would cost);
 *  - estimated follows the app's cost.estimated.
 */
import { fmtUsd } from './quotes.js';

export interface QuoteView { priceUsd: number; priceLabel: string; credits: number; usd: number; free: boolean; local: boolean; runnable: boolean; blockedReason: string | null;
  estimated: boolean; sample: boolean; listPriceUsd: number | null; chargeUsd: number | null }

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
export function quoteView(q: any): QuoteView {
  const credits = Number(q?.credits ?? 0) || 0; const basis: string | null = q?.basis ?? null;
  const local = basis === 'open-weights' || q?.cost?.billedTo === 'local';
  const runnable = q?.runnable !== false; const sample = runnable && !local && q?.demo === true;
  const list = typeof q?.listCredits === 'number' && q.listCredits > 0 ? q.listCredits / 100 : null;
  const priceUsd = local || sample ? 0 : typeof q?.cost?.estUsd === 'number' && q.cost.estUsd > 0 ? q.cost.estUsd : Math.round(credits) / 100;
  const serverText = str(q?.cost?.usdText);
  const priceLabel = !runnable ? (credits > 0 && serverText && serverText !== 'Free' ? `${serverText} once it can run` : list ? `Not available · list price ${fmtUsd(list)} (not a quote)` : 'Not available')
    : sample ? `Free sample${list ? ` · a real run lists at ${fmtUsd(list)}` : ''}`
    : serverText ?? (local ? 'Free · this computer' : priceUsd > 0 ? `≈ ${fmtUsd(priceUsd)}` : 'Free');
  const blockedReason = runnable ? null : str(q?.blockedReason) ?? str(q?.unavailableReason) ?? str(q?.priceLine) ?? str(q?.reason) ?? 'The app can\'t run this request as asked.';
  const estimated = typeof q?.cost?.estimated === 'boolean' ? q.cost.estimated : typeof q?.estimated === 'boolean' ? q.estimated : !(basis === 'hosted' || basis === 'open-weights');
  return { priceUsd, priceLabel, credits, usd: Math.round(credits) / 100, free: runnable && (local || sample || !!q?.free || credits === 0), local, runnable, blockedReason, estimated,
    sample, listPriceUsd: sample || !runnable ? list : null, chargeUsd: runnable ? (local || sample ? 0 : priceUsd) : null };
}
