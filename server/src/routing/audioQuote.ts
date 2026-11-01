/**
 * Audio quote extras for audio, voice, soundtrack and their derived tools:
 *  - perUnit: the rate of the route that would run, from the SAME hosted price row and the same quantity rule as the charge (select.ts routeCredits →
 *    pricing.ts priceOf / hostedQty), for every audio billing unit: second, minute, 1k_chars, 1k_bytes and run (a flat price per run).
 *    perUnit.usd × perUnit.quantity = the run's usd before rounding to whole credits (the charge rounds once, and is at least 1 credit).
 *    Local routes (free), rows with no verified price and any other unit get null. Never NaN: anything not a finite number gives null.
 *  - eta: the time range for this run from the same step-ETA source as the video quote (videoQuote.ts videoEta): measured or published, else null.
 * Generate Video's quote (videoQuote.ts) is unchanged.
 */
import { HOSTED_BY_ID, USD_PER_CREDIT, unitInfo, unitQty } from '../shared/hostedPrices.js';
import { hostedQty, DEFAULT_DURATION, priceMode, scriptOf, speechAtCap } from '../shared/pricing.js';
import { videoEta, type VideoEta } from './videoQuote.js';
import './routePrices.js'; // registers the fal / Replicate / direct / partner rows into HOSTED_BY_ID

export const AUDIO_UNITS = ['second', 'minute', '1k_chars', '1k_bytes', 'run'] as const;
export type AudioUnit = (typeof AUDIO_UNITS)[number];
export const AUDIO_TOOLS = ['audio', 'voice', 'soundtrack'];
export interface PerUnit {
  unit: AudioUnit; /** "per second", "per 1,000 characters", "per run" */ unitLabel: string;
  /** Rate per unit. */ usd: number; credits: number;
  /** Units in this run (seconds, minutes, thousands of characters / bytes, or 1 run) and in words ("2.5 thousand characters"). */ quantity: number; quantityLabel: string;
  /** usd × quantity, before the charge rounds to whole credits. */ totalUsd: number;
}
export const PER_UNIT_NOTE: Record<AudioUnit, string> = { second: 'billed per second of audio', minute: 'billed per minute of audio', '1k_chars': 'billed per 1,000 characters of script',
  '1k_bytes': 'billed per 1,000 bytes of script text', run: 'one flat price per run' };
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const r6 = (x: number) => Math.round(x * 1e6) / 1e6; // small per-second rates (HeyGen ~$0.00095 / s) keep their digits
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

/** The billed amount of text, measured the way the charge measures it (select.ts routeCredits). */
export function textAmounts(toolId: string, input: Record<string, any>): { chars?: number; bytes?: number } {
  const voiceText = typeof input.prompt === 'string' && (toolId.includes('voice') || input.mode === 'voice') ? input.prompt : undefined;
  const chars = Number(input.chars) > 0 ? Number(input.chars) : typeof input.text === 'string' ? input.text.length : voiceText?.length;
  const bytes = Number(input.bytes) > 0 ? Number(input.bytes) : typeof input.text === 'string' ? Buffer.byteLength(input.text) : voiceText != null ? Buffer.byteLength(voiceText) : undefined;
  return { chars, bytes };
}
/** Per-unit rate and quantity of the route a quote names (priceRef), or null (local, unpriced, or not an audio unit). */
export function perUnitOf(toolId: string, priceRef: string | null | undefined, input: Record<string, any>): PerUnit | null {
  const h = priceRef ? HOSTED_BY_ID[priceRef] : undefined; if (!h || !(AUDIO_UNITS as readonly string[]).includes(h.unit)) return null;
  const mode = typeof input.mode === 'string' ? input.mode : undefined; const pm = priceMode(input); // the charge's mode (types[0] ?? mode)
  const usd = (mode && h.usdByMode?.[mode] != null ? h.usdByMode[mode] : h.usdByQuality?.[String(input.resolution ?? '')] ?? h.usd) as unknown;
  if (!fin(usd) || usd <= 0) return null;
  const dur = Number(input.duration) > 0 ? Number(input.duration) : DEFAULT_DURATION; const t = textAmounts(toolId, input); const { chars, bytes } = scriptOf(h, pm, t.chars, t.bytes);
  const quantity = hostedQty(h, dur, chars, undefined, bytes); if (!fin(quantity) || quantity <= 0) return null;
  const unit = h.unit as AudioUnit; const q = r4(quantity);
  return { unit, unitLabel: unitInfo(unit).unitLabel, usd: r6(usd), credits: Math.round((usd / USD_PER_CREDIT) * 100) / 100, quantity: q, quantityLabel: unitQty(unit, Math.round(quantity * 100) / 100), totalUsd: r6(usd * quantity) };
}
/** The quote fields for an audio quote. r0 = the quote so far (priceRef, etaRange / fit.etaRange); input = the priced job input. */
export function audioQuoteFields(toolId: string, r0: Record<string, any>, input: Record<string, any>): { perUnit: PerUnit | null; perUnitNote: string | null; eta: VideoEta | null; upTo?: true; upToNote?: string } {
  const perUnit = r0.local === true || r0.routeKind === 'local' ? null : perUnitOf(toolId, r0.priceRef ?? null, input);
  // Speech models billed on the real output with no length field (Seed Audio): the quote is an upper estimate → "≈ up to $X" in the UI.
  // Seed Audio music / sound effects: no script and no length field → quoted at the 120 s cap, also "up to".
  const sp = perUnit ? HOSTED_BY_ID[r0.priceRef]?.speech : undefined; const cap = sp && speechAtCap(HOSTED_BY_ID[r0.priceRef], priceMode(input));
  return { perUnit, perUnitNote: perUnit ? (cap ? 'billed per second of audio returned; quoted at the 2-minute cap' : sp ? 'billed per second of speech returned; estimated from your script' : PER_UNIT_NOTE[perUnit.unit]) : null, eta: videoEta(r0), ...(sp ? { upTo: true as const, upToNote: cap ? sp.capNote ?? sp.note : sp.note } : {}) };
}
/** P3-02: the no-clip estimate of a tool that takes a video ("Estimated for 8 s", routing/http.ts clipEstimate) belongs only to a price that follows
 *  the clip's length (a per-second / per-minute row). A row billed on something else keeps no "8 s" note: a script (1k_chars, a speech row read from
 *  the script) or one flat run says nothing, and a speech row with no script (Seed Audio music / sound effects: no length field, the model decides)
 *  is priced at its billing cap, so the note says that instead ("priced at up to 120 s"), the same number the charge uses (pricing.ts hostedQty). */
export function clipEstimateFor(est: Record<string, any> | null, priceRef: string | null | undefined, toolId: string, input: Record<string, any>, modelName?: string | null): Record<string, any> {
  if (!est || est.estimateReason !== 'clip_not_loaded' || est.sizeEstimated) return est ?? {};
  const h = priceRef ? HOSTED_BY_ID[priceRef] : undefined; if (!h?.unit) return est;
  if (!h.speech && (h.unit === 'second' || h.unit === 'minute' || h.unit === 'mp_second')) return est; // the price follows the clip: the 8 s estimate stands
  const { estimated: _e, assumedSeconds: _a, estimateReason: _r, estimateMessage: _m, ...rest } = est;
  if (!h.speech || h.unit !== 'second') return rest;
  const t = textAmounts(toolId, input); const { chars } = scriptOf(h, priceMode(input), t.chars, t.bytes);
  if (Number(chars) > 0) return rest; // speech read from the script: priced from the script, not the clip
  const cap = h.speech.maxSec; const who = modelName || 'This model'; const capWords = cap === 120 ? '2 minutes' : `${cap} s`;
  return { ...rest, estimated: true, estimateReason: 'billed_cap', capSeconds: cap,
    estimateMessage: speechAtCap(h, priceMode(input)) ? `Priced at up to ${cap} s: ${who} bills the audio it returns, up to ${capWords}, whatever your clip's length.`
      : `Priced at up to ${cap} s until you add the script: ${who} bills the speech it returns, up to ${capWords}.` };
}

