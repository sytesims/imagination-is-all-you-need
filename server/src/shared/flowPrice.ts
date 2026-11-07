/**
 * A group run's total (Canvas release 2, step 1; user decision 9, 2026-11-07). Pure: the server's proposal, the Group's header and the
 * dock's proposal card read the same rules.
 *  - free steps on this computer count $0 and run;
 *  - a paid step with no price beforehand is left out of the total and listed on its own ("1 step has no price yet");
 *  - under a board budget such a step is left out of the run too (it can't be counted against the budget), never a silent overspend;
 *  - every step a sample: "Sample".
 */
import { fmtUsd } from './runCost.js';

/** One step as priced: its dollars (null = no price), its quote and, when it can't run, why. */
export interface PriceRow { usd: number | null; quote?: any; problem?: string | null }

export const isLocalQuote = (q: any) => q?.localRun === true || q?.cost?.billedTo === 'local';
export const isDemoQuote = (q: any) => q?.demo === true;
/** The dollars a raw quote shows (the cost estimate, else credits / 100); null when it has none or can't run here. */
export function quoteUsd(q: any): number | null {
  if (!q || typeof q !== 'object') return null;
  if (q.runnable === false && q.demo !== true) return null;
  const c = q.cost && typeof q.cost === 'object' ? q.cost : null;
  return typeof c?.estUsd === 'number' ? c.estUsd : typeof q.credits === 'number' ? q.credits / 100 : null;
}
/** A paid step with no price beforehand (not free on this computer, not a sample, nothing else wrong with it). */
export const unpricedPaid = (r: PriceRow) => !r.problem && r.usd == null && !isDemoQuote(r.quote) && !isLocalQuote(r.quote);

/** Why a step with no price is left out of a run under a board budget. */
export const NO_PRICE_UNDER_BUDGET = 'No price yet, so it can’t count against the board budget. Run it on its own first.';
/** The line for steps with no price: "1 step has no price yet". */
export const noPriceLine = (n: number) => `${n} step${n === 1 ? ' has' : 's have'} no price yet`;

export interface FlowTotal { usd: number; priced: number; unpriced: number; free: number; demo: boolean }
/** The total of the rows that run: priced ones added up, free ones $0, unpriced ones counted apart. */
export function flowTotal(rows: PriceRow[]): FlowTotal {
  const run = rows.filter((r) => !r.problem);
  let usd = 0; let priced = 0; let unpriced = 0; let free = 0;
  for (const r of run) {
    if (unpricedPaid(r)) { unpriced++; continue; }
    if (isLocalQuote(r.quote)) { free++; continue; }
    usd += r.usd ?? 0; priced++;
  }
  return { usd: Math.round(usd * 1e4) / 1e4, priced, unpriced, free, demo: run.length > 0 && run.every((r) => isDemoQuote(r.quote)) };
}
/** The total in words: "$0.57", "$0.54 + 1 without a price", "Free", "Sample", "No price yet". */
export function flowTotalWords(t: FlowTotal): string {
  if (t.demo) return 'Sample';
  const extra = t.unpriced ? ` + ${t.unpriced} without a price` : '';
  if (t.usd > 0) return `${fmtUsd(t.usd)}${extra}`;
  if (t.unpriced) return t.priced || t.free ? `Free${extra}` : 'No price yet';
  return 'Free';
}
