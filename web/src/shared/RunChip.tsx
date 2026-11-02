import { useEffect, useRef, useState } from 'react';
import { chipPrice, chipText, moreSteps, stepText, type RunChipData, type RunStep } from '../../../server/src/shared/runChip';
import { LOCAL_LABEL } from '../../../server/src/shared/modelIds';
import { ChevronDownIcon, ComfyPlaceIcon, LaptopIcon } from '../ui/Icons';
import { Popover } from './Popover';
import './runChip.css';
/**
 * RunChip (2026-11-01, shared; the one Explore run line 2026-11-02): "model · where it ran · price" for every Explore result, drawn UNDER the
 * media (never on it; the media keeps at most one role tag). Data: server/src/shared/runChip.ts (real runs only; an unknown price is left out).
 * A chain reads "$0.43 total" and ends in a "+N steps" button: hover, focus or tap opens the whole pipeline (role · model · where · price, then
 * the total), a bottom sheet on a phone (the shared Popover). On a phone the line stays one line: the model shortens, the place becomes its icon,
 * the price always shows. `spec` is a quieter second part ("10 s · 768p · with sound"). `onMedia`: the glass look, only for a line set on a
 * full-bleed picture's copy block (the hero), never over a subject.
 */
const PlaceIcon = ({ place }: { place: string }) => place === LOCAL_LABEL || /browser/i.test(place) ? <LaptopIcon size={13} /> : <ComfyPlaceIcon size={13} />;

/** The pipeline as rows, then the total: shared by the popover and anything that lists a chain in place. */
export function RunSteps({ steps, total, testId }: { steps: RunStep[]; total?: string | null; testId?: string }) {
  return <div className="runsteps" data-testid={testId}>
    <ol className="runsteps-list">{steps.map((s, k) => <li key={k} className="runsteps-row" aria-label={stepText(s)}>
      <span className="runsteps-n" aria-hidden>{k + 1}</span>
      <span className="runsteps-what" aria-hidden><b>{s.role || s.model}</b>{s.role && <span>{s.model}</span>}</span>
      <span className="runsteps-where" aria-hidden><PlaceIcon place={s.place} />{s.place}</span>
      <span className={`runsteps-price${s.price === 'Free' ? ' is-free' : ''}`} aria-hidden>{s.price ?? ''}</span>
    </li>)}</ol>
    {total && <p className="runsteps-total"><span>Total</span><b className={total === 'Free' ? 'is-free' : ''}>{total}</b></p>}
  </div>;
}

export function RunChip({ c, onMedia = false, className = '', testId }: { c: RunChipData; onMedia?: boolean; className?: string; testId?: string }) {
  const n = moreSteps(c); const price = chipPrice(c);
  const btn = useRef<HTMLButtonElement>(null); const [open, setOpen] = useState(false); const pinned = useRef(false); const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  /* a mouse: hover opens it, leaving (the button and the list) closes it unless a click pinned it; touch and keyboard: a tap / Enter toggles */
  const hover = (on: boolean) => (e: React.PointerEvent) => { if (e.pointerType !== 'mouse') return; window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { if (!pinned.current) setOpen(on); }, on ? 120 : 180); };
  const close = () => { pinned.current = false; setOpen(false); };
  const click = () => { window.clearTimeout(timer.current); if (open && !pinned.current) { pinned.current = true; return; } pinned.current = !open; setOpen(!open); };
  return <span className={`runchip${onMedia ? ' on-media' : ''}${n ? ' has-steps' : ''}${className ? ` ${className}` : ''}`} data-testid={testId} role="note" aria-label={chipText(c)}>
    <span className="runchip-model" aria-hidden>{c.model}</span>
    <span className="runchip-dot" aria-hidden>·</span>
    <span className="runchip-place" aria-hidden><PlaceIcon place={c.place} /><span className="runchip-place-t">{c.place}</span></span>
    {price && <><span className="runchip-dot" aria-hidden>·</span><span className={`runchip-price${price === 'Free' ? ' is-free' : ''}`} aria-hidden>{c.price}{price !== c.price && <small> total</small>}</span></>}
    {c.note && <span className="runchip-note" aria-hidden>{c.note}</span>}
    {n > 0 && <button ref={btn} type="button" className="runchip-steps" aria-expanded={open} aria-haspopup="dialog" onClick={click} onPointerEnter={hover(true)} onPointerLeave={hover(false)}
      aria-label={`How it was made: ${n + 1} steps`} data-testid={testId ? `${testId}-steps` : undefined}>+{n} step{n > 1 ? 's' : ''}<ChevronDownIcon size={12} strokeWidth={2} /></button>}
    {c.spec && <span className="runchip-spec" aria-hidden>{c.spec}</span>}
    {n > 0 && <Popover open={open} anchor={btn} onClose={close} label="How it was made" placement="bottom" focusFirst={false} className="runchip-pop" testId={testId ? `${testId}-sheet` : undefined}>
      <div onPointerEnter={hover(true)} onPointerLeave={hover(false)}><RunSteps steps={c.steps!} total={c.price} /></div>
    </Popover>}
  </span>;
}
