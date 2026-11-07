/**
 * Price changed between the quote and Generate (user decision 2026-10-28, D3; allowance added 2026-11-07): ask again ONLY when the run now costs
 * noticeably more than the price the user saw. Isomorphic: the server's submit, re-runs, Story / Film renders, Photos to reel and tests use this
 * one rule.
 *  - quotedCredits known: the run goes through when the rise is at most PRICE_ALLOWANCE (10 % of the quote or 5 credits = 5¢, whichever is
 *    bigger; 1 credit = $0.01). A bigger rise asks again. The same or a lower price always runs, even on another place.
 *  - quoted as free (0): any paid price asks (a free run never turns into a paid one without the user saying so).
 *  - quotedCredits unknown but the place changed: ask (we can't tell whether it is dearer).
 */
export const PRICE_ALLOWANCE = { share: 0.1, minCredits: 5 } as const;
/** The most a run may rise above its quote and still go through without asking (credits, 1 = $0.01). 0 for a free quote. */
export const priceAllowance = (quotedCredits: number): number => (quotedCredits > 0 ? Math.max(quotedCredits * PRICE_ALLOWANCE.share, PRICE_ALLOWANCE.minCredits) : 0);
export function priceAskAgain(o: { quotedRoute?: string | null; quotedCredits?: number | null; route?: string | null; credits: number }): boolean {
  const qc = o.quotedCredits != null && Number.isFinite(o.quotedCredits) ? o.quotedCredits : null;
  if (qc != null) return o.credits > qc + priceAllowance(qc) + 1e-6; // 1e-6: float tidy, so +10 % on 50 (55.000000001) still goes through
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

/** Quotes whose price follows the prompt's length (GPT Image bills prompt text) but were made without the prompt (no prompt / promptBytes):
 *  the price is a "from" price, and the real prompt adds a little. Returns the flag + plain words, or {} when the quote is exact. */
export const PROMPT_NOTE = 'From this price: a longer prompt adds a little.';
export function promptPriceFields(o: { promptPriced: boolean; hasPrompt: boolean }): { promptDependent?: true; promptNote?: string } {
  return o.promptPriced && !o.hasPrompt ? { promptDependent: true, promptNote: PROMPT_NOTE } : {};
}
/** Whether a quote's query carried the prompt (or its byte count). */
export const quoteHasPrompt = (q: Record<string, unknown> | null | undefined): boolean =>
  !!q && ((typeof q.prompt === 'string' && q.prompt !== '') || (q.promptBytes != null && q.promptBytes !== '' && Number.isFinite(Number(q.promptBytes))));
