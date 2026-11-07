/**
 * Price lock at Go (Canvas release 1, user decision 2026-11-06; security review VERIFIED #4). Pure, so the server tests check it.
 *
 * A proposal row (and a person's own Go on a card) carries the price it was approved at: its credits and the route it runs on. At submit the
 * card is quoted again; a rise under 10% still runs (prices are estimates), a rise of 10% or more, or another model or place, stops that
 * card with "Price changed · $0.46 (was $0.42)" and asks again. The run is sent with priceLock=1 + quotedCredits + quotedRouteId, so the
 * jobs route checks the same rule (server/src/shared/priceChange.ts priceLockStop) even if this page didn't.
 */
import { priceLockStop } from '../../../server/src/shared/priceChange';
import { fmtUsd } from '../../../server/src/shared/runCost';

/** What was approved: total credits for the card (a Material Swap card: every swatch), the route, the dollars shown, and how many runs. */
export interface PriceLock { credits: number | null; routeId: string | null; usd: number | null; runs?: number }

/** The dollars a quote shows (the cost estimate, else credits / 100). */
export function usdOfQuote(q: any): number | null {
  if (!q || typeof q !== 'object') return null; const c = q.cost && typeof q.cost === 'object' ? q.cost : null;
  return typeof c?.estUsd === 'number' ? c.estUsd : typeof q.credits === 'number' ? q.credits / 100 : null;
}
/** The lock for a quote as shown (null when it carries no price: nothing to hold it to). */
export function lockOfQuote(q: any): PriceLock | null {
  if (!q || typeof q !== 'object' || typeof q.credits !== 'number') return null;
  return { credits: q.credits, routeId: typeof q.routeId === 'string' && q.routeId ? q.routeId : typeof q.route === 'string' && q.route ? q.route : null, usd: usdOfQuote(q), runs: Number(q.runs) > 1 ? Number(q.runs) : 1 };
}

/** The price moved too much since it was approved: the words for the card, the proposal row and the toast. */
export class PriceChangedError extends Error {
  readonly code = 'price_changed';
  constructor(readonly reason: 'dearer' | 'route', readonly wasUsd: number | null, readonly nowUsd: number | null, readonly fresh: any = null) { super(priceChangedText(reason, wasUsd, nowUsd)); }
}
const money = (n: number | null) => (n == null ? '?' : fmtUsd(n)); /* the app's one $ format: $0.039 under 10 cents, $0.46 above */
export function priceChangedText(reason: 'dearer' | 'route', wasUsd: number | null, nowUsd: number | null): string {
  return reason === 'route' ? `Model or place changed · ${money(nowUsd)} (was ${money(wasUsd)})` : `Price changed · ${money(nowUsd)} (was ${money(wasUsd)})`;
}

/** Check a fresh quote against the lock. null = run it. A quote that can't be read is left to the server's own check. */
export function lockVerdict(lock: PriceLock | null | undefined, fresh: any): PriceChangedError | null {
  if (!lock || !fresh || typeof fresh.credits !== 'number') return null;
  const route = typeof fresh.routeId === 'string' && fresh.routeId ? fresh.routeId : typeof fresh.route === 'string' && fresh.route ? fresh.route : null;
  const why = priceLockStop({ quotedRoute: lock.routeId, quotedCredits: lock.credits, route, credits: fresh.credits });
  return why ? new PriceChangedError(why, lock.usd, usdOfQuote(fresh), fresh) : null;
}

/** The form fields that make the jobs route hold the run to the lock. Per run: a Material Swap card sends one run per swatch. */
export function lockFields(lock: PriceLock, runs = lock.runs ?? 1): Record<string, string> {
  const per = lock.credits == null ? null : lock.credits / Math.max(1, runs);
  return { priceLock: '1', ...(per != null ? { quotedCredits: String(Math.round(per * 1e6) / 1e6) } : {}), ...(lock.routeId ? { quotedRouteId: lock.routeId } : {}) };
}
/** Is this error a price stop (the page's own check, or the server's 409 route_changed on a locked run)? */
export const isPriceStop = (e: any) => e?.code === 'price_changed' || (e?.code === 'route_changed' && e?.lock === true);
