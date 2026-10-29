/**
 * The bar's "···" for row extras (2026-10-29): Brand and the eye ("See the exact prompt") sit beside the chips, and on a short row they
 * fold into "···" before the model name ever shortens (shared/dockFit useChipFit, data-row-fold). One "···" per bar: Image and the video
 * workflows already have one (.ic-over) and list these rows too (rowOverflowRows); Create Video, Audio and 3D render <RowMore>.
 * A folded chip still opens its own panel, anchored to the "···" (rowAnchor).
 */
import { useRef, useState, type RefObject } from 'react';
import { BarPopover, PopList, PopRow, PopSection } from './BarPop';
import { MoreIcon } from '../ui/Icons';
import { tip } from './Tooltip';

export type RowOverflowRow = { label: string; target: HTMLElement | null };

/** The row extras the fit folded off this bar (Brand, the eye), as menu rows: their aria-label, and the button a click opens. */
export function rowOverflowRows(chips: HTMLElement | null): RowOverflowRow[] {
  const row = chips?.closest('.ic-chiprow'); if (!row) return [];
  return [...row.querySelectorAll<HTMLElement>(':scope > [data-row-fold].ic-folded')].map(el => ({ label: (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim(), target: el })).filter(r => r.label);
}

/** A row extra's popover anchor: its own button while it shows, else the bar's visible "···". */
export function rowAnchor(btn: RefObject<HTMLElement | null>): RefObject<HTMLElement | null> {
  return { get current() { const b = btn.current; if (!b || b.getClientRects().length) return b;
    const more = [...(b.closest('.ic-chiprow')?.querySelectorAll<HTMLElement>('.ic-over') ?? [])].find(e => e.getClientRects().length); return more ?? b; } };
}

/** "···" for a bar with no overflow menu of its own: shown only while a row extra is folded (CSS: .ic-chips[data-row-over] .ic-over). */
export function RowMore({ watch, testId = 'row-over' }: { watch?: RefObject<HTMLElement | null>; testId?: string }) {
  const btn = useRef<HTMLButtonElement>(null); const [open, setOpen] = useState(false); const [rows, setRows] = useState<RowOverflowRow[]>([]);
  return <>
    <button ref={btn} type="button" className={`ic-chip ic-sq ic-over${open ? ' on' : ''}`} aria-haspopup="menu" aria-expanded={open} aria-label="More" data-testid={testId} {...tip(open ? null : 'More')}
      onClick={() => { if (open) { setOpen(false); return; } setRows(rowOverflowRows(btn.current)); setOpen(true); }}><MoreIcon size={16} /></button>
    <BarPopover open={open} anchor={btn} watch={watch} gap={4} onClose={() => setOpen(false)} label="More" role="menu" testId={`${testId}-pop`} width={240}>
      <PopSection label="More"><PopList label="More" role="group">{rows.map((r, i) => <PopRow key={i} role="menuitem" testId={`${testId}-${i}`} label={r.label} onClick={() => { const t = r.target; setOpen(false); if (t) requestAnimationFrame(() => t.click()); }} />)}</PopList></PopSection>
    </BarPopover>
  </>;
}
