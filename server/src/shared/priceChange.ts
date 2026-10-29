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
