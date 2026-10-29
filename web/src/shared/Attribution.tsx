/** One short credit line from job.attribution (e.g. "Powered by MiniMax H3"). No licence detail in the UI; it links to /licenses#<id>. */
export type Attribution = { text?: string; lines?: string[]; required?: boolean; display?: string; licenseId?: string; licenseName?: string; clause?: string; sourceUrl?: string } | null | undefined;
export function AttributionLine({ a, className = '' }: { a: Attribution; className?: string }) {
  const t = a?.text?.trim(); if (!t) return null;
  return <a className={`attr-line ${className}`} data-testid="attribution" href={a?.licenseId ? `/licenses#${encodeURIComponent(a.licenseId)}` : '/licenses'}>{t}</a>;
}
