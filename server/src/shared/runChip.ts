/**
 * The Explore run line (2026-11-01; one rule for every section 2026-11-02): one line per result, under the media, never on it:
 * "model · where it ran · price", e.g. "LTX-2.5 Pro · Comfy Cloud · $1.72" or "FLUX.2 [klein] 4B · Your computer · Free".
 * Every Explore section builds its line here and draws it with the one shared web/src/shared/RunChip.tsx.
 * Values come from the real runs (shared/featured.ts entries and FeaturedRun records): the model as shown, the place in the app's own words
 * (modelIds.ts placeOf / LOCAL_LABEL: Router and Comfy Cloud runs both read "Comfy Cloud"), the billed price ("≈" only when the estimate was
 * all that was recorded, "Free" when every step ran locally). An unknown price is left out, never guessed.
 * A result made of several runs names its main model, the whole chain's price with "total", and "+N steps": a button that lists the whole
 * pipeline, one row per run ("role · model · where · price"). No durations in the line: a clip's length lives in its player; specs
 * ("10 s · 768p · with sound") may sit in `spec`, a quieter second part. Prices use Explore's two decimals ($0.08). Isomorphic.
 */
import { LOCAL_LABEL, PLACE_LABELS, placeOf } from './modelIds.js';
import { isOurComputer, type FeaturedItem, type FeaturedRun } from './featured.js';

/** One run in a result's pipeline, as the "+N steps" list shows it. */
export interface RunStep { /** what this run made, a word or two ("Portrait", "Voice") */ role: string; model: string; place: string; /** "$0.05", "≈ $0.30", "Free"; null when unknown */ price: string | null }
export interface RunChipData {
  /** the main model, as shown */ model: string;
  /** where it ran: "Comfy Cloud", "Your computer", "In your browser" */ place: string;
  /** "$1.72", "≈ $0.30", "Free"; the whole chain's when `steps` has more than one run; null when unknown (left out) */ price: string | null;
  /** the whole pipeline in order, this result's own run included: two or more → "+N steps" and the price reads "total" */ steps?: RunStep[];
  /** a word or two that says what the price is for ("each", "for 3"); never a length */ note?: string;
  /** a quieter second part: specs where they help ("10 s · 768p · with sound") */ spec?: string;
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
/** One run as a pipeline row. */
export const runStep = (r: FeaturedRun, role?: string): RunStep => ({ role: role ?? r.role ?? '', model: r.model, place: chipPlace(r.place), price: chipUsd(r.costUsd, r.est) });
/** How many runs besides the main one ("+3 steps"). */
export const moreSteps = (c: Pick<RunChipData, 'steps'>): number => Math.max(0, (c.steps?.length ?? 0) - 1);
/** The price as the line says it: "$0.43 total" for a chain (not for Free), else as is. */
export const chipPrice = (c: Pick<RunChipData, 'price' | 'steps'>): string | null => (c.price && c.price !== 'Free' && moreSteps(c) ? `${c.price} total` : c.price);

/** A result made of several runs: the main run's model and place, the whole chain's price (≈ if any part is an estimate), every run as a step
 *  (the others first, in order, then the main run: the result comes last). One run alone: no steps. */
export function chipOfChain(main: FeaturedRun, others: FeaturedRun[], o: { model?: string; role?: string; note?: string; spec?: string } = {}): RunChipData {
  const all = [main, ...others]; const usd = all.reduce((n, r) => n + r.costUsd, 0);
  return { model: o.model ?? main.model, place: chipPlace(main.place), price: chipUsd(usd, all.some((r) => r.est)),
    ...(others.length ? { steps: [...others.map((r) => runStep(r)), runStep(main, o.role)] } : {}), ...(o.note ? { note: o.note } : {}), ...(o.spec ? { spec: o.spec } : {}) };
}
/** One featured result: its own run (model, place, billed price; unknown → no price), plus the runs before it (`also`) as steps. */
export function chipOfFeatured(f: FeaturedItem, o: { model?: string; role?: string; note?: string; spec?: string; also?: FeaturedRun[] } = {}): RunChipData {
  const price = f.runOn === 'local' ? 'Free' : f.costUsd != null ? chipUsd(f.costUsd, f.costEstimated) : null;
  const own: RunChipData = { model: o.model ?? f.model, place: featuredPlace(f), price, ...(o.note ? { note: o.note } : {}), ...(o.spec ? { spec: o.spec } : {}) };
  if (!o.also?.length) return own;
  const main: FeaturedRun = { jobId: f.jobId ?? '', model: own.model, place: own.place, costUsd: f.runOn === 'local' ? 0 : f.costUsd ?? 0, est: f.costEstimated };
  const c = chipOfChain(main, o.also, o);
  return price == null ? { ...c, price: null, steps: c.steps?.map((s, k, a) => (k === a.length - 1 ? { ...s, price: null } : s)) } : c;
}
/** One FeaturedRun as a line. */
export const chipOfRun = (r: FeaturedRun, note?: string): RunChipData => ({ model: r.model, place: chipPlace(r.place), price: chipUsd(r.costUsd, r.est), ...(note ? { note } : {}) });
/** A pipeline row as plain words: "Voice · Qwen3 TTS 1.7B · Your computer · Free". */
export const stepText = (s: RunStep): string => [s.role, s.model, s.place, s.price].filter(Boolean).join(' · ');
/** The line as plain words (tests, aria labels): "InfiniteTalk (Wan 2.1) +3 steps · Comfy Cloud · $0.43 total". */
export const chipText = (c: RunChipData): string => { const n = moreSteps(c);
  return [`${c.model}${n ? ` +${n} step${n > 1 ? 's' : ''}` : ''}`, c.place, chipPrice(c), c.note].filter(Boolean).join(' · '); };
