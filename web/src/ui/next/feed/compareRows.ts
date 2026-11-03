/** Compare models' list (CompareModels.tsx), pure so server/test/compare-rows.test.ts can read it (2026-11-03): by default only the models
 *  that can run this compare now (the preview quote includes them with a price, or it hasn't answered yet); the ones left out ("Needs setup
 *  first", "Can't run here right now") or without a verified price go behind "Show N more that need setup". A model already picked always
 *  stays in view, so it can be unticked. */
export interface CompareListRow { excluded?: { code: string; reason: string } | null; unpriced?: boolean }
export const canCompareNow = (r: CompareListRow | null | undefined): boolean => !r || (!r.excluded && !r.unpriced);
export function splitCompareRows<T extends string>(ids: readonly T[], list: Record<string, CompareListRow> | null | undefined, picked: readonly string[] = []): { now: T[]; more: T[] } {
  const now: T[] = []; const more: T[] = [];
  for (const id of ids) (canCompareNow(list?.[id]) || picked.includes(id) ? now : more).push(id);
  return { now, more };
}
export const moreLabel = (n: number, open: boolean): string => (open ? 'Hide the ones that need setup' : `Show ${n} more that need setup`);
