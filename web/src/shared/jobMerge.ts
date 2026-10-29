/**
 * Merging polled jobs without needless re-renders (2026-10-25, UI lag with ~10 runs going). A poll answers every followed job again even
 * when nothing changed; spreading it into a new object each time made every card and the whole page render again on every tick.
 * These keep the same object (and the same list) when the fresh fields equal what the job already has. Pure, no React, so tests import it.
 */
const same = (a: unknown, b: unknown) => a === b || (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b));

/** `{ ...cur, ...fresh }`, or `cur` itself when every field of `fresh` already has that value on `cur`. */
export function mergeJob<T extends object>(cur: T, fresh: Partial<T>): T {
  for (const k in fresh) if (!same((cur as any)[k], (fresh as any)[k])) return { ...cur, ...fresh };
  return cur;
}

/** Merge each fresh job onto the list entry with its id (`skip(id, fresh)` leaves one alone); the same list when nothing changed. */
export function mergeById<T extends { id: string }>(list: T[], fresh: Iterable<T>, skip?: (id: string, fresh: T) => boolean): T[] {
  const byId = new Map<string, T>(); for (const f of fresh) if (f?.id) byId.set(f.id, f);
  if (!byId.size) return list;
  let changed = false;
  const next = list.map((j) => { const f = j.id ? byId.get(j.id) : undefined; if (!f || skip?.(j.id, f)) return j; const m = mergeJob(j, f); if (m !== j) changed = true; return m; });
  return changed ? next : list;
}
