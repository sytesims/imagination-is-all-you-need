/**
 * Generate Video quote extras (h3-video and its apps, 2026-10-23):
 *  - perSecond: the per-second rate of the route that would run, ONLY for routes whose hosted price row bills per second (unit 'second').
 *    Same row and same quality key as the charge (select.ts routeCredits → priceOf), so perSecond × seconds = the run's usd (within rounding).
 *    Flat per-run routes, local (free) routes and token-billed routes with reference video (the rate depends on the clip) get null.
 *  - eta: the time range for this run from the same step-ETA source the local image quote uses (stepEta.ts estimateFor, via the quote's
 *    etaRange / fit.etaRange): 'learned' or 'scaled' → basis 'measured'; 'reported' (a published figure for the GPU class) → basis 'estimate'.
 *    first_run, hosted routes and anything without a range → null. No number is ever invented.
 */
import { HOSTED_BY_ID, USD_PER_CREDIT } from '../shared/hostedPrices.js';
import './routePrices.js'; // registers the fal / Replicate / direct / partner rows into HOSTED_BY_ID

export const PER_SECOND_NOTE = 'billed per second of video';
export interface PerSecond { usd: number; credits: number; /** the unrounded rate, only when usd was rounded */ exactUsd?: number }
export interface VideoEta { lowSec: number; highSec: number; basis: 'measured' | 'estimate' }

/** Per-second rate of a route billed per second (hosted row unit 'second'); null for any other route.
 *  audio on uses the row's `audio` variant when it has one (Kling, Veo), the same as priceOf({audio}) that the charge runs. */
export function perSecondOf(priceRef: string | null | undefined, quality: string | undefined, refVideoSec = 0, audio = false): PerSecond | null {
  const h0 = priceRef ? HOSTED_BY_ID[priceRef] : undefined;
  if (!h0 || h0.unit !== 'second') return null;
  const h = (audio && h0.audio ? { ...h0, ...h0.audio } : h0) as typeof h0;
  if ((h.videoInput || h.refVideoAtRate) && refVideoSec > 0) return null; // reference video billed too (Seedance tokens, H3 seconds): rate × output seconds isn't the run's price
  const usd = h.usdByQuality?.[quality ?? ''] ?? h.usd;
  if (typeof usd !== 'number' || !Number.isFinite(usd) || usd <= 0) return null;
  const r = Math.round(usd * 1e4) / 1e4;
  return { usd: r, credits: Math.round((usd / USD_PER_CREDIT) * 100) / 100, ...(r !== usd ? { exactUsd: usd } : {}) }; // exactUsd: the unrounded rate when it has more than 4 decimals (the bar's option prices round from it: shared/runCost.ts perSecondRun)
}

/** Time range from a quote's step-ETA range (etaRange or fit.etaRange); null when there is no measured or published range. */
export function videoEta(r: Record<string, any> | null | undefined): VideoEta | null {
  const er = r?.etaRange ?? r?.fit?.etaRange ?? null;
  if (!er || typeof er !== 'object' || er.low == null || er.high == null) return null;
  const lo = Number(er.low), hi = Number(er.high);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo <= 0 || hi < lo) return null;
  const basis = er.source === 'learned' || er.source === 'scaled' ? 'measured' : er.source === 'reported' ? 'estimate' : null;
  if (!basis) return null;
  return { lowSec: Math.max(1, Math.round(lo)), highSec: Math.max(1, Math.round(hi)), basis };
}

/** The three quote fields for an h3-video quote. r0 = the quote so far (priceRef, etaRange / fit.etaRange); input = the priced job input. */
export function videoQuoteFields(r0: Record<string, any>, input: Record<string, any>): { perSecond: PerSecond | null; perSecondNote: string | null; eta: VideoEta | null } {
  const perSecond = perSecondOf(r0.priceRef ?? null, input.resolution, Number(input.refVideoSeconds) || 0, !!input.audio);
  return { perSecond, perSecondNote: perSecond ? PER_SECOND_NOTE : null, eta: videoEta(r0) };
}
