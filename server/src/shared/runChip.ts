/**
 * The Explore run chip (2026-11-01): one line per result, "model · where it ran · price", e.g. "LTX-2.5 Pro · Comfy Cloud · $1.72" or
 * "FLUX.2 [klein] 4B · Your computer · Free". Every Explore section builds its chip here and draws it with the one shared web/src/shared/RunChip.tsx.
 * Values come from the real runs (shared/featured.ts entries and FeaturedRun records): the model as shown, the place in the app's own words
 * (modelIds.ts placeOf / LOCAL_LABEL: Router and Comfy Cloud runs both read "Comfy Cloud"), the billed price ("≈" when only the estimate was
 * recorded, "Free" for a local run). An unknown price is left out, never guessed. A result made of several runs names its main model plus "+N"
 * (the others in `also`, for a hover tip). Prices use Explore's two decimals ($0.08), the same figures the cards showed before. Isomorphic.
 */
import { LOCAL_LABEL, PLACE_LABELS, placeOf } from './modelIds.js';
import { isOurComputer, type FeaturedItem, type FeaturedRun } from './featured.js';

export interface RunChipData {
  /** the main model, as shown */ model: string;
  /** the other runs behind this result, one short line each ("GPT Image 2.5 Flare · first frame · Comfy Cloud · $0.02"): the chip shows "+N" */ also?: string[];
  /** where it ran: "Comfy Cloud", "Your computer", "In your browser" */ place: string;
  /** "$1.72", "≈ $0.30", "Free"; null when unknown (left out) */ price: string | null;
  /** a few extra words after the price ("each", "first 10 s") */ note?: string;
}

/** Explore's price token: two decimals, "≈ " for an estimate, Free for 0. */
export const chipUsd = (usd: number, est?: boolean): string => (usd === 0 ? 'Free' : `${est ? '≈ ' : ''}$${usd.toFixed(2)}`);
/** A FeaturedRun's place in the app's words: our own computer → "Your computer", Comfy Router → "Comfy Cloud", the browser → "In your browser". */
export function chipPlace(place: string): string {
  if (isOurComputer(place)) return LOCAL_LABEL;
  if (/^comfy (router|cloud)$/i.test(place)) return PLACE_LABELS['comfy-router'];
  if (/browser/i.test(place)) return 'In your browser';
  return place;
}
/** Where a featured result ran: its route through placeOf ("Comfy Cloud"), or "Your computer" for a local run. */
export const featuredPlace = (f: Pick<FeaturedItem, 'runOn' | 'route'>): string => (f.runOn === 'local' ? LOCAL_LABEL : placeOf({ route: f.route ?? null })?.label ?? PLACE_LABELS['comfy-cloud']);
/** One featured result's own run: its model, place and billed price (unknown → no price). */
export function chipOfFeatured(f: FeaturedItem, o: { model?: string; note?: string; also?: FeaturedRun[] } = {}): RunChipData {
  const price = f.runOn === 'local' ? 'Free' : f.costUsd != null ? chipUsd(f.costUsd, f.costEstimated) : null;
  return { model: o.model ?? f.model, place: featuredPlace(f), price, ...(o.note ? { note: o.note } : {}), ...(o.also?.length ? { also: o.also.map(runLine) } : {}) };
}
/** One FeaturedRun as a chip. */
export const chipOfRun = (r: FeaturedRun, note?: string): RunChipData => ({ model: r.model, place: chipPlace(r.place), price: chipUsd(r.costUsd, r.est), ...(note ? { note } : {}) });
/** A run as one short line (the "+N" tip). */
export const runLine = (r: FeaturedRun): string => [r.model, chipPlace(r.place), chipUsd(r.costUsd, r.est)].join(' · ');
/** A result made of several runs: the main run's model and place, the whole chain's price (≈ if any part is an estimate), the rest as "+N". */
export function chipOfChain(main: FeaturedRun, others: FeaturedRun[], o: { model?: string; note?: string } = {}): RunChipData {
  const all = [main, ...others]; const usd = all.reduce((n, r) => n + r.costUsd, 0);
  return { model: o.model ?? main.model, place: chipPlace(main.place), price: chipUsd(usd, all.some((r) => r.est)), ...(others.length ? { also: others.map(runLine) } : {}), ...(o.note ? { note: o.note } : {}) };
}
/** The chip as plain words (tests, aria labels, tooltips): "MiniMax H3 +2 · Comfy Cloud · ≈ $4.00". */
export const chipText = (c: RunChipData): string => [`${c.model}${c.also?.length ? ` +${c.also.length}` : ''}`, c.place, c.price, c.note].filter(Boolean).join(' · ');
