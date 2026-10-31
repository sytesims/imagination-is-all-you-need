/**
 * The chip row's fold rules (2026-10-31), shared by every composer bar (Image, Video, Audio, 3D; shared/dockFit useChipFit runs them on the DOM).
 * How pro toolbars do it: priority, shrink before hide, stable widths.
 *  - Each control declares how long it stays on a short bar, once, with fitPri(): 'keep' never folds (a workflow's main control, an active
 *    Brand), 'high' stays longest, 'low' goes first (the eye, a seed). No declaration = 'normal'. Ties: the lower data-rank, then the last in the row.
 *  - Shrink before hide: long labels (the model name, a group's summary, the Brand name) truncate before anything folds; the model is measured
 *    at one fixed width (--fit-model-min), so switching models changes its text, never what folds.
 *  - A control no wider than its fold button ("···" or Settings) folds only once that button already shows: swapping 32px for 32px saves nothing.
 *  - Every fit starts from nothing folded and gives back whatever fits again, so a bar that has room again shows everything again.
 * No React and no DOM here (server/test/composer-fit.test.ts runs them on numbers).
 */
export type FitPri = 'keep' | 'high' | 'normal' | 'low';
const ORDER: Record<Exclude<FitPri, 'keep'>, number> = { low: 1, normal: 2, high: 3 };

/** A control's priority on a short bar, spread onto its element: <button {...fitPri('keep')}>. */
export const fitPri = (p: FitPri) => ({ 'data-fit': p });
/** Read back (an unknown or missing value is 'normal'). */
export const priOf = (v: string | null | undefined): FitPri => (v === 'keep' || v === 'high' || v === 'low' ? v : 'normal');

/** The fold buttons' size: "···" and Settings are 32px squares. */
export const FOLD_BUTTON_W = 32;

export type FitItem = { pri: FitPri; /** higher stays longer within its priority */ rank: number; /** row (DOM) order */ index: number; width: number; /** which button it folds into */ dest: string };

/** The order controls fold in: lowest priority first, then lowest rank, then the last in the row. 'keep' never folds. */
export function foldOrder<T extends FitItem>(items: T[]): T[] {
  return items.filter(i => i.pri !== 'keep').sort((a, b) => ORDER[a.pri as Exclude<FitPri, 'keep'>] - ORDER[b.pri as Exclude<FitPri, 'keep'>] || a.rank - b.rank || b.index - a.index);
}

/** Folding it gains room: wider than its fold button, or that button already shows (then the whole control's width comes back). */
export const worthFolding = (width: number, destShown: boolean, buttonW = FOLD_BUTTON_W) => destShown || width > buttonW + 0.5;

export type FitOps<T> = { over(): boolean; fold(item: T, on: boolean): void; destShown(item: T): boolean };

/** Fold by priority until the row fits, then give back (highest priority first) what fits again. Returns the folded items.
 *  Giving back matters: folding a small control can only swap it for its button, so a wider one may be the one that has to go. */
export function runFit<T extends FitItem>(items: T[], ops: FitOps<T>): T[] {
  const order = foldOrder(items); const folded: T[] = [];
  /* each step folds the first control that gains room (one skipped for its size can go once its button shows) */
  while (ops.over()) { const it = order.find(i => !folded.includes(i) && worthFolding(i.width, ops.destShown(i))); if (!it) break; ops.fold(it, true); folded.push(it); }
  for (const it of [...folded].reverse()) { ops.fold(it, false); if (ops.over()) ops.fold(it, true); else folded.splice(folded.indexOf(it), 1); }
  return folded;
}
