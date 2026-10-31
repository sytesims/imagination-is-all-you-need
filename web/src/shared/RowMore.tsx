/**
 * The bar's "···" for row extras (2026-10-29): Brand and the eye ("See the exact prompt") sit beside the chips, and on a short row they
 * fold into "···" by their priority (shared/chipFit: the eye early, an active Brand never; shared/dockFit useChipFit, data-row-fold). One "···" per bar: Image and the video
 * workflows already have one (.ic-over) and list these rows too (rowOverflowRows); Create Video, Audio and 3D render <RowMore>.
 * A folded chip still opens its own panel, anchored to the "···" (rowAnchor).
 */
import { useRef, useState, type RefObject } from 'react';
import { BarPopover, PopList, PopRow, PopSection } from './BarPop';
import { MoreIcon } from '../ui/Icons';
import { tip } from './Tooltip';

export type RowOverflowRow = { label: string; hint?: string; state?: string; icon?: string; target: HTMLElement | null };

/** One folded control as a menu row, the same everywhere: its own icon (the Brand's colour dots, the light's bulb), its name ("Light") over its
 *  value ("Rim / backlight · from behind", in full), and its on/off state (data-fit-state: Brand). A click opens the control's own panel. */
export function foldedRow(el: HTMLElement, target: HTMLElement | null = el): RowOverflowRow | null {
  const full = (el.getAttribute('aria-label') ?? target?.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').replace(/\.\s*Change$/, '').trim(); if (!full) return null;
  const m = /^([^:]{1,32}):\s*(.+)$/.exec(full); const state = el.dataset.fitState;
  const hint = m?.[2] && m[2].toLowerCase() !== state?.toLowerCase() ? m[2] : undefined;
  return { label: m ? m[1] : full, hint, state, icon: el.querySelector(':scope > svg, :scope > .bk-dots, :scope > .wf-ico, :scope > i, :scope > span > svg')?.outerHTML, target };
}

/** The row extras the fit folded off this bar (Brand, the eye), as menu rows (foldedRow). */
export function rowOverflowRows(chips: HTMLElement | null): RowOverflowRow[] {
  const row = chips?.closest('.ic-chiprow'); if (!row) return [];
  return [...row.querySelectorAll<HTMLElement>(':scope > [data-row-fold].ic-folded')].map(el => foldedRow(el)).filter((r): r is RowOverflowRow => !!r);
}

/** The ⋯ menu's rows (RowMore, Image's and the video workflows' ⋯): one look on every bar. A row without a control is a plain line. */
export function FoldedRows({ rows, testId, onPick }: { rows: RowOverflowRow[]; testId: string; onPick: (t: HTMLElement) => void }) {
  return <>{rows.map((r, i) => r.target ? <PopRow key={i} role="menuitem" className="bp-fold-row" testId={`${testId}-${i}`} label={r.label} hint={r.hint} aside={r.state}
      icon={r.icon ? <span className="bp-fold-ic" dangerouslySetInnerHTML={{ __html: r.icon }} /> : undefined} onClick={() => onPick(r.target!)} />
    : <p key={i} className="bp-fact" role="none">{r.hint ? `${r.label}: ${r.hint}` : r.label}</p>)}</>;
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
      <PopSection label="More"><PopList label="More" role="group"><FoldedRows rows={rows} testId={testId} onPick={t => { setOpen(false); requestAnimationFrame(() => t.click()); }} /></PopList></PopSection>
    </BarPopover>
  </>;
}
