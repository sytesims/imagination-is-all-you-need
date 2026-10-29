import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { BarPopover } from './BarPop';
import { PresetTile, type PresetTileProps } from './PresetTile';
import './lookPicker.css';
/**
 * Look: one compact picker for a composer bar's looks (Video: camera moves, styles, viral templates, modes; Camera Moves / Photo FX galleries).
 * The shared BarPopover (Orbit look) anchored above its chip, with a title, tabs, a search field and a grid of compact PresetTiles.
 * A pick applies in place on the page (the caller decides what it sets); nothing here navigates.
 *
 * Layout (2026-10-27 design pass; the user picked the "Rail" of three options): title, what's picked and the tabs in a left rail; the search,
 * a 5-column grid and a status line with the hovered (else picked) look's name, full description and how its preview was made on the right.
 * Phones (≤ 640 px): the rail becomes a row above a 3-column grid. The "none" tile (No move, No style) is drawn as a neutral tile, never with example art.
 * Height: never taller than 560 px, and never under the header or the orange strip above it (measured when it opens and on resize), so its
 * tabs and search stay clickable. Keys: Esc and outside click close (Popover); in the grid the arrows move by tile and by row (the grid's
 * own column count), Home / End jump; ArrowDown in the search field goes into the grid. Focus goes back to the chip on close (Popover).
 */
export interface LookItem extends Pick<PresetTileProps, 'video' | 'image' | 'motion' | 'badge' | 'title'> {
  id: string; label: string; sub?: string | null; selected?: boolean; onPick: () => void; testId?: string;
  /** extra words the search matches (category, kind) */ keywords?: string;
  /** a 'none' tile (No move, No style): first, left out of the count and of search results */ pinned?: boolean;
  /** the full one-line description (the status line, the tooltip); falls back to `sub` */ detail?: string | null;
  /** how the preview was made ("Preview still made with FLUX.2 [klein] 4B") */ note?: string | null;
}
export interface LookTab { id: string; label: string; /** the search field's words: "Search moves" */ searchLabel?: string; items: LookItem[]; /** one line above the grid (e.g. a model that can't follow the move) */ note?: ReactNode; /** a quiet link under the grid */ footer?: ReactNode }
const WIDTH = 740;

const MAX_H = 560; const GAP = 8;
/** How far down the page's fixed top (header, and the strip above it while it shows) reaches. */
function topInset(): number {
  let y = 0; for (const el of document.querySelectorAll<HTMLElement>('header.topnav, .promo-strip')) { const r = el.getBoundingClientRect(); if (r.height > 0 && r.bottom > y) y = r.bottom; }
  return Math.max(0, Math.round(y));
}
/** The neutral art of a "none" tile: a quiet ring with a slash on the surface, no example picture. */
const NoneArt = () => <span className="lk-none" aria-hidden><svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="14" cy="14" r="10" /><path d="M7 21 21 7" strokeLinecap="round" /></svg></span>;
/** The full one-line description: `detail`, else the tile's tooltip (minus a leading "Name: "), else its small line. */
const detailOf = (x: LookItem) => { if (x.detail) return x.detail; const t = x.title && x.title !== x.label ? (x.title.startsWith(`${x.label}: `) ? x.title.slice(x.label.length + 2) : x.title) : null; return t || x.sub || null; };
/** The status line's quiet end: how the preview was made, else the tile's small line (category, the model a preset runs on) when it adds something. */
const asideOf = (x: LookItem) => x.note ?? (!x.pinned && x.sub && x.sub !== detailOf(x) ? x.sub : null);

const Check = () => <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden><path d="M2.5 6.2 5 8.6l4.6-5.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export function LookPicker({ open, anchor, avoid, watch, onClose, tabs, tab, onTab, label = 'Look', testId = 'look-picker', width = WIDTH }: {
  open: boolean; anchor: RefObject<HTMLElement | null>; avoid?: RefObject<HTMLElement | null>; watch?: RefObject<HTMLElement | null>; onClose: () => void;
  /** tabs with no items are left out */ tabs: LookTab[]; tab: string; onTab: (id: string) => void; label?: string; testId?: string; width?: number;
}) {
  const shown = tabs.filter(t => t.items.length > 0); const cur = shown.find(t => t.id === tab) ?? shown[0];
  const [q, setQ] = useState(''); const grid = useRef<HTMLDivElement>(null); const search = useRef<HTMLInputElement>(null); const scroller = useRef<HTMLDivElement>(null);
  const [fitTick, setFitTick] = useState(0); const [hot, setHot] = useState<number>(-1); const [edge, setEdge] = useState({ top: false, bottom: false });
  useEffect(() => { if (!open) setQ(''); setHot(-1); }, [open, cur?.id]);
  /* the picked tile is in view when it opens or the tab changes (a move far down the list) */
  useEffect(() => { if (!open) return; const id = requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>('.pt.on')?.scrollIntoView({ block: 'nearest' })); return () => cancelAnimationFrame(id); }, [open, cur?.id]);
  /* the room above the bar, under the header and the strip (both measured). Measured while rendering, so the popover's first measure
   * (its own layout effect runs before ours) already sees the final height and never opens taller than the room, over the header. */
  const maxH = useMemo(() => { if (!open) return MAX_H; const a = (avoid?.current ?? anchor.current)?.getBoundingClientRect(); if (!a) return MAX_H;
    return Math.max(220, Math.min(MAX_H, Math.round(a.top - topInset() - GAP * 2 - 14 /* the surface's padding + border */))); }, [open, fitTick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!open) return; const fit = () => setFitTick(t => t + 1);
    addEventListener('resize', fit); addEventListener('scroll', fit, true); return () => { removeEventListener('resize', fit); removeEventListener('scroll', fit, true); }; }, [open]);
  const needle = q.trim().toLowerCase();
  const items = useMemo(() => !cur ? [] : !needle ? cur.items : cur.items.filter(x => !x.pinned && `${x.label} ${x.sub ?? ''} ${x.detail ?? ''} ${x.keywords ?? ''}`.toLowerCase().includes(needle)), [cur, needle]);
  /* the scroll area fades at an edge only while there is more to see past it */
  const edges = () => { const s = scroller.current; if (!s) return; const top = s.scrollTop > 2, bottom = s.scrollTop + s.clientHeight < s.scrollHeight - 2; setEdge(e => e.top === top && e.bottom === bottom ? e : { top, bottom }); };
  useLayoutEffect(() => { if (open) requestAnimationFrame(edges); }, [open, items, maxH]);
  /* other tabs with matches, offered when this one has none */
  const elsewhere = needle && !items.length ? shown.filter(t => t !== cur && t.items.some(x => !x.pinned && `${x.label} ${x.sub ?? ''} ${x.keywords ?? ''}`.toLowerCase().includes(needle))) : [];
  const tiles = () => [...(grid.current?.querySelectorAll<HTMLElement>('.pt') ?? [])];
  const cols = () => { const g = grid.current; return g ? getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length || 1 : 1; };
  const focusTile = (i: number) => { const ts = tiles(); if (!ts.length) return; const t = ts[Math.max(0, Math.min(ts.length - 1, i))]; t.focus(); t.scrollIntoView({ block: 'nearest' }); };
  const gridKeys = (e: React.KeyboardEvent) => {
    const ts = tiles(); const i = ts.indexOf(document.activeElement as HTMLElement); if (i < 0) return; const c = cols();
    const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'ArrowDown' ? i + c : e.key === 'ArrowUp' ? i - c : e.key === 'Home' ? 0 : e.key === 'End' ? ts.length - 1 : null;
    if (n == null) return; e.preventDefault(); e.stopPropagation();
    if (n < 0 && e.key === 'ArrowUp') { search.current?.focus(); return; } focusTile(n);
  };
  const searchKeys = (e: React.KeyboardEvent) => { if (e.key !== 'ArrowDown') return; e.preventDefault(); e.stopPropagation(); const ts = tiles(); const on = ts.findIndex(t => t.classList.contains('on')); focusTile(on >= 0 ? on : 0); };
  const tabRow = useRef<HTMLDivElement>(null);
  const tabKeys = (e: React.KeyboardEvent) => { const fwd = e.key === 'ArrowDown' || e.key === 'ArrowRight', back = e.key === 'ArrowUp' || e.key === 'ArrowLeft'; /* the rail is vertical; a row on phones */ if (!fwd && !back) return; const i = shown.indexOf(cur!); const n = shown[(i + (fwd ? 1 : -1) + shown.length) % shown.length];
    e.preventDefault(); e.stopPropagation(); onTab(n.id); requestAnimationFrame(() => tabRow.current?.querySelector<HTMLElement>(`[data-tab="${n.id}"]`)?.focus()); };
  /* hovered / focused tile (by its place in the grid) → the status line */
  const track = (e: React.SyntheticEvent) => { const t = (e.target as HTMLElement).closest<HTMLElement>('.pt'); const i = t ? tiles().indexOf(t) : -1; if (i >= 0) setHot(i); };
  const picked = items.find(x => x.selected) ?? null; const peek = (hot >= 0 ? items[hot] : null) ?? picked ?? items.find(x => !x.pinned) ?? null;
  /* the header's summary: what is picked on each tab (not the "none" tiles) */
  const summary = shown.map(t => t.items.find(x => x.selected && !x.pinned)).filter(Boolean).map(x => x!.label);
  const count = cur ? cur.items.filter(x => !x.pinned).length : 0;
  const nounOf = (t?: LookTab) => (t?.searchLabel ?? '').replace(/^Search\s+/i, '') || t?.label.toLowerCase() || '';
  const tabBtns = shown.map(t => <button key={t.id} type="button" role="tab" data-tab={t.id} aria-selected={t === cur} tabIndex={t === cur ? 0 : -1} className={t === cur ? 'on' : ''} data-testid={`${testId}-tab-${t.id}`} onClick={() => onTab(t.id)}>
    <span>{t.label}</span><em>{t.items.filter(x => !x.pinned).length}</em></button>);
  const tabsEl = shown.length > 1 ? <div ref={tabRow} className="lk-tabs" role="tablist" aria-label={`${label} kinds`} aria-orientation="vertical" onKeyDown={tabKeys}>{tabBtns}</div> : null;
  const searchEl = <label className="lk-search"><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
    <input ref={search} type="search" value={q} onChange={e => setQ(e.target.value)} onKeyDown={searchKeys} placeholder={`Search ${count} ${nounOf(cur)}`} aria-label={cur?.searchLabel ?? `Search ${cur?.label ?? label}`} data-testid={`${testId}-search`} /></label>;
  const gridEl = <div ref={scroller} className="lk-scroll" data-fade-top={edge.top ? '' : undefined} data-fade-bottom={edge.bottom ? '' : undefined} onScroll={edges} style={{ minHeight: Math.max(0, Math.min(236, maxH - 64)) /* a steady height while searching */ }}>
    {needle && items.length > 0 && <p className="lk-count" role="status" data-testid={`${testId}-count`}>{items.length} {items.length === 1 ? 'match' : 'matches'}</p>}
    {items.length ? <div ref={grid} className="lk-grid" role="group" aria-label={cur?.label} onKeyDown={gridKeys} onMouseOver={track} onFocus={track} onMouseLeave={() => setHot(-1)} data-testid={`${testId}-grid`}>
      {items.map(x => <PresetTile key={x.id} size="compact" testId={x.testId} className={`lk-tile${x.pinned ? ' lk-tile-none' : ''}`} label={x.label} sub={x.sub} selected={!!x.selected}
        title={x.title ?? ([detailOf(x), x.note].filter(Boolean).join(' · ') || undefined)} video={x.pinned ? null : x.video} image={x.pinned ? null : x.image} motion={x.pinned ? null : x.motion} media={x.pinned ? <NoneArt /> : undefined} badge={x.badge} onClick={x.onPick} />)}</div>
      : <div className="lk-empty" role="status" data-testid={`${testId}-empty`}><b>Nothing matches “{q.trim()}”</b>
        {elsewhere.length ? <span>Found in {elsewhere.map((t, i) => <span key={t.id}>{i ? ' · ' : ''}<button type="button" className="lk-link" onClick={() => onTab(t.id)}>{t.label}</button></span>)}</span>
          : <button type="button" className="lk-link" onClick={() => { setQ(''); search.current?.focus(); }}>Clear search</button>}</div>}
    {cur?.footer && !needle && <div className="lk-foot">{cur.footer}</div>}
  </div>;
  const noteEl = cur?.note && <div className="lk-note" data-testid={`${testId}-note`}>{cur.note}</div>;
  const head = <div className="lk-head"><span className="lk-title">{label}</span>{summary.length > 0 && <span className="lk-sum" data-testid={`${testId}-summary`}><Check />{summary.join(' · ')}</span>}</div>;
  return <BarPopover open={open && !!cur} anchor={anchor} avoid={avoid} watch={watch} onClose={onClose} placement="top" gap={GAP} label={label} testId={testId} width={width} className="lk-pop">
    <div className="lk" style={{ maxHeight: maxH }} data-testid={`${testId}-body`}>
      {tabsEl && <div className="lk-rail">{head}{tabsEl}</div>}
      <div className="lk-main"><div className="lk-top">{!tabsEl && head /* one kind only (a workflow gallery): no rail, the title sits beside the search */}{searchEl}</div>{noteEl}{gridEl}
        <div className="lk-status" aria-live="polite" data-testid={`${testId}-status`}>{peek ? <><b>{peek.label}</b>{detailOf(peek) && <span>{detailOf(peek)}</span>}{asideOf(peek) && <small>{asideOf(peek)}</small>}</> : null}</div></div>
    </div>
  </BarPopover>;
}
