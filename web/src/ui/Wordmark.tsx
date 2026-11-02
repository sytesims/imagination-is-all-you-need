import { APP_NAME } from '../shared/brand';

/** Imagination Is All You Need wordmark: the Orbit mark (three arcs around a core) plus the full name on two balanced lines, "Imagination Is"
 *  over "All You Need" (the second in the accent), both in the display font (Space Grotesk, SIL OFL 1.1), so the long name fits the 52px
 *  header and always reads as the whole name, never "Imagination" alone (2026-11-02).
 *  Mark source: brand/logo-mark-small.svg (16-unit grid, used here at every UI size). Keep the classes: wm, wm-mark, wm-name.
 *  compact = the mark alone (phone top bar). layout 'inline' puts the second tier beside the first instead of under it. */
export default function Wordmark({ compact = false, layout = 'stack' }: { compact?: boolean; layout?: 'stack' | 'inline' }) {
  return (
    <span className={`wm wm-${layout}`} role="img" aria-label={APP_NAME}>
      <svg className="wm-mark" viewBox="0 0 16 16" width="24" height="24" aria-hidden="true">
        <g fill="none" stroke="#FF7A1A" strokeWidth="2.3" strokeLinecap="round"><path d="M11.4 3.8A5.4 5.4 0 0 1 13.04 9.94" /><path d="M9.94 13.04A5.4 5.4 0 0 1 3.8 11.4" /><path d="M2.67 7.16A5.4 5.4 0 0 1 7.16 2.67" /></g>
        <circle cx="8" cy="8" r="2.3" fill="#F7F7F8" />
      </svg>
      {!compact && <span className="wm-name" aria-hidden="true"><b className="wm-t1">Imagination Is</b><span className="wm-t2">All You Need</span></span>}
    </span>
  );
}
