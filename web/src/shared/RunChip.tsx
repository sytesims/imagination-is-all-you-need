import { chipText, type RunChipData } from '../../../server/src/shared/runChip';
import { tip } from './Tooltip';
import './runChip.css';
/**
 * RunChip (2026-11-01, shared): the one "model · where it ran · price" chip on every Explore result. Data from server/src/shared/runChip.ts
 * (real runs only; an unknown price is left out). "+N" names the other runs behind a result in a hover tip ("+1 music" when it says what they are, readable without hovering). `onMedia`: the glass look for a chip
 * sitting over a picture or clip (keep it to a corner, never over a face).
 */
export function RunChip({ c, onMedia = false, className = '', testId }: { c: RunChipData; onMedia?: boolean; className?: string; testId?: string }) {
  const more = c.also?.length ? `Also used: ${c.also.join('; ')}` : null;
  return <span className={`runchip${onMedia ? ' on-media' : ''}${className ? ` ${className}` : ''}`} data-testid={testId} aria-label={more ? `${chipText(c)}. ${more}` : chipText(c)} role="note" tabIndex={more ? 0 : undefined} {...tip(more)}>
    <span className="runchip-model" aria-hidden>{c.model}</span>
    {more && <span className="runchip-more" aria-hidden>+{c.also!.length}{c.alsoWhat && <small>{c.alsoWhat}</small>}</span>}
    <span className="runchip-dot" aria-hidden>·</span><span className="runchip-place" aria-hidden>{c.place}</span>
    {c.price && <><span className="runchip-dot" aria-hidden>·</span><span className={`runchip-price${c.price === 'Free' ? ' is-free' : ''}`} aria-hidden>{c.price}</span></>}
    {c.note && <span className="runchip-note" aria-hidden>{c.note}</span>}
  </span>;
}
