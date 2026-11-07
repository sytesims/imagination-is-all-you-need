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

/**
 * 409 route_changed for API callers (agent path audit 2026-11-07 #7): the app's message ("The price went up… press Generate again") is UI copy, and
 * an agent read it as "a route id is missing". These fields say what moved and what to send next. Fired only when the run is dearer than
 * quotedCredits (priceAskAgain), the place moved under a Canvas price lock, or the place changed with no quotedCredits sent; quotedRouteId is optional.
 */
export function routeChangedForApi(o: { quotedCredits?: number | null; credits: number; quotedRoute?: string | null; route?: string | null; lockReason?: 'dearer' | 'route' | null; resubmit?: string }) {
  const usd = (cr: number) => { const v = Math.round(cr) / 100; return `$${v < 0.1 && v > 0 ? v.toFixed(3) : v.toFixed(2)}`; };
  const qc = o.quotedCredits != null && Number.isFinite(o.quotedCredits) ? o.quotedCredits : null; const moved = !!o.quotedRoute && !!o.route && o.quotedRoute !== o.route;
  const price = qc == null ? `no quotedCredits was sent and the place changed (now ${usd(o.credits)})` : o.credits > qc ? `the price rose from ${usd(qc)} to ${usd(o.credits)}` : `the price is ${usd(o.credits)} (quoted ${usd(qc)})`;
  const cause = moved ? `it would now run on ${o.route} instead of ${o.quotedRoute}` : qc != null && o.credits > qc ? 'the request prices higher than the quote (prompt length, duration, resolution, inputs or the place)' : null;
  return { quotedUsd: qc == null ? null : Math.round(qc) / 100, usd: Math.round(o.credits) / 100,
    why: `Not started: ${price}${cause ? `; ${cause}` : ''}${o.lockReason === 'route' ? ' (Canvas price lock: another place asks again)' : ''}. Nothing was charged.`,
    next: `Re-quote (${o.resubmit ?? 'GET /api/tools/{toolId}/price'} with the same fields; quote.credits here is the new price), show it, then submit again with quotedCredits=${Math.round(o.credits)}${o.route ? ` (quotedRouteId=${o.route} is optional)` : ''}.` };
}
