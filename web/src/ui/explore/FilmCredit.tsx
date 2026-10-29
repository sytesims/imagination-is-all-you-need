/**
 * The Explore film credit block (user pick for the hero, 2026-10-28; shared with the lighthouse, 2026-10-29): small spaced-caps labels over
 * their values, in columns split by thin rules, values joined by a dot. Styles: .xph-cred in exploreShowcase.css.
 */
export type CreditCol = [label: string, values: (string | null | undefined)[]];

const dotted = (xs: (string | null | undefined)[]) => (xs.filter(Boolean) as string[]).map((x, i) => <span key={x}>{i > 0 && <i aria-hidden>·</i>}{x}</span>);

export function FilmCredit({ cols, className, testId }: { cols: CreditCol[]; className?: string; testId?: string }) {
  return <dl className={`xph-cred${className ? ` ${className}` : ''}`} data-testid={testId}>{cols.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{dotted(v)}</dd></div>)}</dl>;
}
