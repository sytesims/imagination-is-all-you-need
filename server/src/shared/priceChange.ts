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

/** Quotes whose price follows the prompt's length (GPT Image bills prompt text) but were made without the prompt (no prompt / promptBytes):
 *  the price is a "from" price, and the real prompt adds a little. Returns the flag + plain words, or {} when the quote is exact. */
export const PROMPT_NOTE = 'From this price: a longer prompt adds a little.';
export function promptPriceFields(o: { promptPriced: boolean; hasPrompt: boolean }): { promptDependent?: true; promptNote?: string } {
  return o.promptPriced && !o.hasPrompt ? { promptDependent: true, promptNote: PROMPT_NOTE } : {};
}
/** Whether a quote's query carried the prompt (or its byte count). */
export const quoteHasPrompt = (q: Record<string, unknown> | null | undefined): boolean =>
  !!q && ((typeof q.prompt === 'string' && q.prompt !== '') || (q.promptBytes != null && q.promptBytes !== '' && Number.isFinite(Number(q.promptBytes))));
