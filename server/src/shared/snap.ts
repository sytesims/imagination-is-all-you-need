/**
 * A setting the model doesn't offer is snapped to the nearest value it does, with a short note (user decision 2026-10-28, D5), instead of
 * refusing the run. One helper for every such setting (clip length, shape, resolution tier, image size, quality tier), on the quote AND the
 * submit (quote = charge). The note travels as the job's / quote's adjust notes (routing/select.ts adjustNotesFor → Generate's "· adjusted"
 * and the job's warnings). Isomorphic: no server imports.
 */
export interface Snapped<T> { from: T; to: T; note: string }
/** The allowed number nearest to x; a tie goes to the larger one. */
export function nearestNumber(list: readonly number[], x: number): number {
  return list.reduce((a, b) => { const da = Math.abs(a - x), db = Math.abs(b - x); return db < da || (db === da && b > a) ? b : a; });
}
/** "16:9" → 1.777…; "auto" / junk → null. */
export const aspectRatio = (a: string): number | null => { const m = /^(\d+(?:\.\d+)?)\s*[:x×]\s*(\d+(?:\.\d+)?)$/i.exec(String(a ?? '').trim()); return m && +m[2] > 0 ? +m[1] / +m[2] : null; };
/** The listed shape closest to `aspect` (compared on a log scale, so 2:1 and 1:2 are equally far from 1:1). null when nothing numeric is listed. */
export function nearestAspect(list: readonly string[], aspect: string): string | null {
  const r = aspectRatio(aspect); const opts = list.map((a) => [a, aspectRatio(a)] as const).filter((x): x is readonly [string, number] => x[1] != null);
  if (r == null || !opts.length) return null;
  return opts.reduce((a, b) => (Math.abs(Math.log(b[1] / r)) < Math.abs(Math.log(a[1] / r)) ? b : a))[0];
}
/** A size tier as a number to compare: 720p → 720, 1080P → 1080, 2K → 1440, 4K → 2160, 1K → 1024, 0.75K → 768, 1.5K → 1536; else null. */
export function tierSize(t: string): number | null {
  const s = String(t ?? '').trim().toLowerCase(); let m = /^(\d{3,4})p$/.exec(s); if (m) return +m[1];
  m = /^(\d+(?:\.\d+)?)k$/.exec(s); if (!m) return null; const k = +m[1];
  return k === 2 ? 1440 : k === 4 ? 2160 : Math.round(k * 1024);
}
/** The listed tier nearest in size to `tier` (a tie goes to the larger); null when either side isn't a size. */
export function nearestTier(list: readonly string[], tier: string): string | null {
  const x = tierSize(tier); const opts = list.map((t) => [t, tierSize(t)] as const).filter((o): o is readonly [string, number] => o[1] != null);
  if (x == null || !opts.length) return null;
  return opts.reduce((a, b) => { const da = Math.abs(a[1] - x), db = Math.abs(b[1] - x); return db < da || (db === da && b[1] > a[1]) ? b : a; })[0];
}
/** The one note: "Made at 8 s, the closest length this model offers (you picked 5 s)." */
export function snapNote(what: 'length' | 'shape' | 'size' | 'quality', from: string, to: string, at?: string): string {
  return `Made at ${to}, the closest ${what} this model offers${at ? ` ${at}` : ''} (you picked ${from}).`;
}
/** Add a note to an input's adjust notes (read by routing/select.ts adjustNotesFor) and its warnings, once each. */
export function addAdjustNote(input: Record<string, any>, note: string): void {
  const a: string[] = Array.isArray(input.adjustNotes) ? input.adjustNotes : (input.adjustNotes = []); if (!a.includes(note)) a.push(note);
  const w: string[] = Array.isArray(input.warnings) ? input.warnings : (input.warnings = []); if (!w.includes(note)) w.push(note);
}
