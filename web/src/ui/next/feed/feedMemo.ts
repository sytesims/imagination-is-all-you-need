/**
 * When a feed card may skip a render (2026-10-25, UI lag with ~10 runs going). The page builds every card's props again on each render
 * (a poll tick, a keystroke in the prompt): new JSX for the media and the running tile, new arrow functions. A card renders again only when
 * something it shows changed: the job object (useFeed keeps the same object for an unchanged job), a plain value, or an element whose
 * type, key or props differ (checked the same way, one level of nested elements and arrays deep at a time).
 * Functions count as equal: a card's callbacks act on its own job (open it, pick it, measure its image), so the one from the last render
 * still does the same thing. Pure, no React import, so tests import it.
 */
const isEl = (x: unknown): x is { $$typeof: symbol; type: unknown; key: unknown; ref?: unknown; props: Record<string, unknown> } =>
  typeof x === 'object' && x !== null && '$$typeof' in x && 'props' in x;

function sameValue(a: unknown, b: unknown, depth: number): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a === 'function' && typeof b === 'function') return true;
  if (depth > 6) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameValue(x, b[i], depth + 1));
  if (isEl(a) && isEl(b)) return a.type === b.type && a.key === b.key && (a.ref ?? null) === (b.ref ?? null) && sameProps(a.props, b.props, depth + 1);
  return false;
}
function sameProps(a: Record<string, unknown>, b: Record<string, unknown>, depth: number): boolean {
  const ka = Object.keys(a); if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) { if (!(k in b) || !sameValue(a[k], b[k], depth)) return false; }
  return true;
}
/** React.memo's areEqual for FeedCard (and anything else whose props are a job, plain values, elements and callbacks). */
export function feedPropsEqual<P extends object>(prev: P, next: P): boolean {
  return sameProps(prev as Record<string, unknown>, next as Record<string, unknown>, 0);
}
