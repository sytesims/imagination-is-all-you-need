import { Fragment } from 'react';
/**
 * A chip label that truncates at word boundaries (2026-11-01). CSS text-overflow cuts mid-word, so "GPT Image 2.5 Flare" could end as
 * "GPT Image 2.…" (a period, then the ellipsis: four dots). Each word is an inline-block, and the browser drops a whole word that does not fit
 * before the ellipsis: "GPT Image…". The parent keeps its own overflow:hidden; text-overflow:ellipsis; white-space:nowrap.
 */
export function Words({ text }: { text: string | null | undefined }) {
  // the space between words is a zero-width span (still in the text, so copy and screen readers get it); the gap is the next word's margin,
  // so the ellipsis sits right after the last whole word ("GPT Image 2.5…", not "GPT Image 2.5 …")
  return <>{String(text ?? '').trim().split(/\s+/).filter(Boolean).map((w, i) => <Fragment key={i}>{i > 0 && <span className="wd-s"> </span>}<span className="wd">{w}</span></Fragment>)}</>;
}
