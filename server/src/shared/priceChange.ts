/**
 * Price changed between the quote and Generate (user decision 2026-10-28, D3): ask again ONLY when the run now costs more than the price the
 * user saw. The same price or a lower one just runs, even on another place. Isomorphic: the server's submit, Story / Film renders and tests
 * use this one rule.
 *  - quotedCredits known: ask when credits > quotedCredits.
 *  - quotedCredits unknown but the place changed: ask (we can't tell whether it is dearer).
 */
export function priceAskAgain(o: { quotedRoute?: string | null; quotedCredits?: number | null; route?: string | null; credits: number }): boolean {
  const qc = o.quotedCredits != null && Number.isFinite(o.quotedCredits) ? o.quotedCredits : null;
  if (qc != null) return o.credits > qc;
  return !!o.quotedRoute && o.quotedRoute !== (o.route ?? null);
}

/**
 * Price lock at Go (Canvas release 1, user decision 2026-11-06; security review VERIFIED #4): a canvas proposal row, and a person's own Go on
 * a card, carry the price that was approved (quotedCredits) and where it runs (quotedRouteId), with priceLock=1. Prices are estimates, so a
 * rise under 10% still runs; a rise of 10% or more, or a run that would now go to another model or place, stops and asks again. The
 * tolerance is fixed here (the client can't widen it); a free or sample price (0) has no room: any charge stops it.
 * Returns why it stops ('dearer' | 'route'), or null to run.
 */
export const PRICE_LOCK_TOLERANCE = 0.1;
export function priceLockStop(o: { quotedRoute?: string | null; quotedCredits?: number | null; route?: string | null; credits: number }): 'dearer' | 'route' | null {
  const qr = o.quotedRoute ? String(o.quotedRoute) : null;
  if (qr && o.route != null && o.route !== qr) return 'route';
  const qc = o.quotedCredits != null && Number.isFinite(o.quotedCredits) ? Math.max(0, o.quotedCredits) : null;
  if (qc == null) return 'dearer'; /* a lock without a price: never run blind */
  const now = Number.isFinite(o.credits) ? o.credits : Infinity;
  return now > qc + 1e-9 && now >= qc * (1 + PRICE_LOCK_TOLERANCE) - 1e-9 ? 'dearer' : null;
}
