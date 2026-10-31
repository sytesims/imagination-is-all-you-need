/**
 * "Edit & style" (2026-10-30, sections 2026-10-31): the Ad layout card's big editor. It fills the window (2026-10-31): a slim top bar
 * (title, size tabs, Safe zones, Reset layout, Done), the side panel, and the stage, where the ad is the hero: it fits the stage with a
 * small margin on every size ("Fit"), or shows at a set scale (100%, − / +; the stage scrolls), from the zoom control at the bottom right
 * (Cmd/Ctrl + 0, + and − too). drag the logo, headline, offer line and button, resize the logo, headline (its text follows) and the button (width)
 * from the corner; they snap to the clear area, the margins, the centre lines and each other (hold Alt for none) and can't leave the
 * clear area. Drag the picture itself (where no part is) to frame it, and zoom it with the slider or the wheel / trackpad. Arrow keys
 * nudge (Shift: 10), Delete takes the logo, offer or button off this size ("Show …" brings it back). Edits are saved as they happen,
 * per size (adEdit.ts); "Reset layout" puts this size back to automatic. The selected part gets a small toolbar beside it (above, or below
 * when there's no room; hidden while dragging) with a compact set of its style controls (colour in a small popover; the rest stays in the side
 * panel). A "Safe zones" switch sits beside the size tabs (the same setting as the Platforms section's). Esc deselects, then closes; Done closes.
 *
 * The side panel on the left is the card's (AdPanel.tsx: an icon rail and one section's controls); clicking a part of the ad opens its section. PartStyle here
 * styles one part, the same on every size (adLayout.AdStyle, saved on the card): the logo's plate and colour, the words' alignment,
 * weight, colour and what sits behind them, the button's shape and colour. Colours are the brand's, white or black.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { tip } from '../shared/Tooltip';
import { BarPopover, PopNote, PopSection, Segmented } from '../shared/BarPop';
import { AlignCenterIcon, AlignLeftIcon, AlignRightIcon, MinusIcon, PlusIcon } from '../ui/Icons';
import { drawAd, drawSafeZones, type AdArt } from './adDraw';
import { buttonColorOf, logoToneFor, type AdLayout, type AdPreset, type AdStyle, type AdText, type Box } from './adLayout';
import { hasSafe, zonesFor, type AdPlatform, type AdSizeOption } from './adPlatforms';
import { HIDEABLE, PART_NAME, clampBox, guidesFor, inBox, isEdited, moveFrame, placeOf, snapBox, snapTo, type AdEdit, type AdFrame, type AdPart } from './adEdit';

/** The side panel's sections (its icon rail), in the order people think. */
export type AdSection = 'picture' | 'text' | 'style' | 'layout' | 'platforms' | 'export';
/** What the side panel gets from the editor: the last part clicked (n counts clicks), the picture's zoom, and whose safe zones show. */
export type AdPanelCtx = { hit: { part: AdPart | 'picture'; n: number }; zoom: number; zoomTo: (z: number) => void;
  zones: { p: AdPlatform; label: string }[]; zone: AdPlatform | 'all'; setZone: (z: AdPlatform | 'all') => void };
type Drag = { mode: 'move' | 'size' | 'pic'; part: AdPart | null; x0: number; y0: number; box: Box; px: number; frame: AdFrame | undefined };
const halt = (ev: React.SyntheticEvent) => ev.stopPropagation();
const RESIZABLE: AdPart[] = ['logo', 'headline', 'button'];
/** Topmost first (the order they're drawn, reversed). */
const HIT_ORDER: AdPart[] = ['button', 'offer', 'logo', 'headline'];
/** The stage's zoom steps (screen px per ad px), and the margin around the ad at "Fit". */
const STEPS = [0.1, 0.15, 0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2]; const FIT_PAD = 24;

export function AdEditor({ sizes, size, onSize, pic, art, text, preset, style, onStyle, edit, onEdit, showSafe, onShowSafe, platforms, editedSizes, onClose, panel }: {
  sizes: readonly AdSizeOption[]; size: AdSizeOption; onSize: (s: AdSizeOption) => void; pic: HTMLImageElement; art: AdArt; text: AdText; preset: AdPreset;
  /** the card's style, on every size */ style: AdStyle; onStyle: (s: AdStyle) => void;
  /** this size's edits */ edit: AdEdit | undefined; onEdit: (e: AdEdit | null) => void; showSafe: boolean; onShowSafe: (on: boolean) => void; platforms: AdPlatform[]; /** sizes with their own layout (a dot on the tab) */ editedSizes: string[]; onClose: () => void;
  /** the side panel (AdPanel.tsx) */ panel: (x: AdPanelCtx) => ReactNode;
}) {
  const { w: W, h: H } = size; const e = edit ?? {}; const hidden = HIDEABLE.filter((p) => e.hide?.includes(p));
  const stage = useRef<HTMLDivElement>(null); const scroller = useRef<HTMLDivElement>(null); const sheet = useRef<HTMLDivElement>(null); const [room, setRoom] = useState<[number, number]>([0, 0]);
  useLayoutEffect(() => { const s = scroller.current; if (!s) return; const ro = new ResizeObserver(() => setRoom([s.clientWidth, s.clientHeight])); ro.observe(s); return () => ro.disconnect(); }, []);
  /* the stage's zoom: "fit" (the ad as big as the stage allows, recomputed as the window changes) or a set scale; frame px → screen px */
  const [view, setView] = useState<'fit' | number>('fit'); useEffect(() => setView('fit'), [size.shape]);
  const fitK = room[0] > 0 ? Math.max(0.02, Math.min((room[0] - 2 * FIT_PAD) / W, (room[1] - 2 * FIT_PAD) / H)) : 0;
  const k = view === 'fit' ? fitK : view;
  /* zooming keeps the middle of what you see in the middle */
  const keep = useRef<[number, number] | null>(null);
  const zoomView = (v: 'fit' | number) => { const s = scroller.current; if (s) keep.current = [(s.scrollLeft + s.clientWidth / 2) / s.scrollWidth, (s.scrollTop + s.clientHeight / 2) / s.scrollHeight]; setView(v); };
  useLayoutEffect(() => { const s = scroller.current, c0 = keep.current; if (!s || !c0) return; keep.current = null; s.scrollLeft = c0[0] * s.scrollWidth - s.clientWidth / 2; s.scrollTop = c0[1] * s.scrollHeight - s.clientHeight / 2; }, [k]);
  const zoomIn = () => zoomView(STEPS.find((z) => z > k + 1e-3) ?? STEPS[STEPS.length - 1]);
  const zoomOut = () => zoomView([...STEPS].reverse().find((z) => z < k - 1e-3) ?? STEPS[0]);
  const [scrolled, setScrolled] = useState(0);
  const [c, setCanvas] = useState<HTMLCanvasElement | null>(null); const [l, setL] = useState<AdLayout | null>(null);
  const [sel, setSel] = useState<AdPart | null>(null); const [hit, setHit] = useState<AdPanelCtx['hit']>({ part: 'picture', n: 0 }); const [hover, setHover] = useState<AdPart | null>(null); const [guide, setGuide] = useState<{ x: number | null; y: number | null } | null>(null);
  /* "Zones for": one platform's zones at a time (the parts still keep clear of all of them) */
  const zones = zonesFor(platforms, size.shape); const [zone, setZone] = useState<AdPlatform | 'all'>('all');
  const zoneSafe = zone === 'all' ? size.safe : zones.find((z) => z.p === zone)?.safe ?? size.safe;
  useEffect(() => { if (zone !== 'all' && !zones.some((z) => z.p === zone)) setZone('all'); }, [size.shape]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSel(null); }, [size.shape]);

  useEffect(() => {
    if (!c || k <= 0) return; const dpr = Math.min(2, window.devicePixelRatio || 1); c.width = Math.round(W * k * dpr); c.height = Math.round(H * k * dpr);
    const g = c.getContext('2d'); if (!g) return; g.setTransform(k * dpr, 0, 0, k * dpr, 0, 0);
    setL(drawAd(g, W, H, pic, art, text, { safe: size.safe, preset, edit, style }));
    if (showSafe) drawSafeZones(g, W, H, zoneSafe);
  }, [c, k, W, H, pic, art, text.headline, text.offer, text.button, size.safe, preset, edit, showSafe, zoneSafe, style]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- saving: every change goes straight to the card */
  const setPlace = (part: AdPart, b: Box, px?: number) => onEdit({ ...e, at: { ...e.at, [part]: placeOf(b, W, H, part === 'headline' || part === 'offer' ? px : undefined) } });
  const pxOf = (part: AdPart) => (part === 'headline' ? l?.headline?.px : part === 'offer' ? l?.offer?.px : undefined) ?? 0;
  const hide = (part: AdPart) => { if (!HIDEABLE.includes(part)) return; const at = { ...e.at }; delete at[part]; onEdit({ ...e, at, hide: [...(e.hide ?? []), part] }); setSel(null); };
  const unhide = (part: AdPart) => onEdit({ ...e, hide: (e.hide ?? []).filter((p) => p !== part) });
  const setFrame = (f: AdFrame) => onEdit({ ...e, pic: f });
  const zoomTo = (z: number) => l && setFrame(moveFrame(e.pic, pic.naturalWidth, pic.naturalHeight, l.pic.w, l.pic.h, 0, 0, z));

  /* ---- pointer: a part (move), its corner (resize) or the picture (frame it) */
  const drag = useRef<Drag | null>(null); const [dragging, setDragging] = useState(false);
  const at = (ev: React.PointerEvent): [number, number] => { const r = ev.currentTarget.getBoundingClientRect(); return [(ev.clientX - r.left) / k, (ev.clientY - r.top) / k]; };
  const hitOf = (x: number, y: number) => (l ? HIT_ORDER.find((p) => l.boxes[p] && inBox(l.boxes[p]!, x, y)) ?? null : null);
  const others = (part: AdPart) => (l ? (Object.entries(l.boxes) as [AdPart, Box][]).filter(([p]) => p !== part).map(([, b]) => b) : []);
  const down = (ev: React.PointerEvent) => {
    if (ev.button !== 0 || !l) return; const [x, y] = at(ev); sheet.current?.focus({ preventScroll: true });
    const handle = (ev.target as HTMLElement).dataset.handle as AdPart | undefined;
    const part = handle ?? hitOf(x, y); setSel(part); setHit((h) => ({ part: part ?? 'picture', n: h.n + 1 }));
    drag.current = part ? { mode: handle ? 'size' : 'move', part, x0: x, y0: y, box: l.boxes[part]!, px: pxOf(part), frame: e.pic } : { mode: 'pic', part: null, x0: x, y0: y, box: l.pic, px: 0, frame: e.pic };
    setDragging(true); try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* a pointer the browser no longer tracks */ } ev.preventDefault();
  };
  const move = (ev: React.PointerEvent) => {
    if (!l) return; const [x, y] = at(ev); const d = drag.current;
    if (!d) { setHover(hitOf(x, y)); return; }
    const dx = x - d.x0, dy = y - d.y0; const th = 8 / k; const free = ev.altKey;
    if (d.mode === 'pic') { setFrame(moveFrame(d.frame, pic.naturalWidth, pic.naturalHeight, l.pic.w, l.pic.h, dx, dy)); return; }
    const part = d.part!; const g = guidesFor(W, H, l.clear, l.area, others(part));
    if (d.mode === 'move') {
      const s = free ? { box: { ...d.box, x: d.box.x + dx, y: d.box.y + dy }, gx: null, gy: null } : snapBox({ ...d.box, x: d.box.x + dx, y: d.box.y + dy }, g, th);
      const b = clampBox(s.box, l.clear); setGuide({ x: s.gx != null && b.x === s.box.x ? s.gx : null, y: s.gy != null && b.y === s.box.y ? s.gy : null }); setPlace(part, b, d.px);
    } else {
      /* the corner: width follows the pointer (snapping the right edge); the logo and the headline grow as a whole, so text size follows */
      let w = Math.max(8, d.box.w + dx); const sx = free ? { d: 0, at: null } : snapTo([d.box.x + w], g.xs, th); w += sx.d;
      w = Math.min(w, l.clear.x + l.clear.w - d.box.x); const f = w / d.box.w; setGuide({ x: sx.at, y: null });
      setPlace(part, { ...d.box, w, h: part === 'button' ? d.box.h : d.box.h * f }, d.px * f);
    }
  };
  const up = () => { drag.current = null; setGuide(null); setDragging(false); };

  /* ---- the toolbar by the selected part: above it, or below when there's no room; inside the preview, never over the part */
  const frame = useRef<HTMLDivElement>(null); const bar = useRef<HTMLDivElement>(null); const [barAt, setBarAt] = useState<{ left: number; top: number } | null>(null);
  const selBox = sel && !dragging ? l?.boxes[sel] : undefined;
  useLayoutEffect(() => {
    const b = bar.current, s = stage.current, f = frame.current; if (!b || !s || !f || !selBox) { setBarAt(null); return; }
    const sr = s.getBoundingClientRect(), fr = f.getBoundingClientRect(); const pad = 8, tag = 24, gap = sel === 'logo' ? 18 : 10; /* below: a logo's plate reaches past its box */
    const x = fr.left - sr.left + selBox.x * k, y = fr.top - sr.top + selBox.y * k, w = selBox.w * k, h = selBox.h * k; const bw = b.offsetWidth, bh = b.offsetHeight;
    const left = Math.max(pad, Math.min(x + w / 2 - bw / 2, sr.width - pad - bw)); const fx = fr.left - sr.left, fy = fr.top - sr.top;
    /* above or below, whichever fits and covers least of the other parts (above on a tie); when neither fits, the side with more room */
    const covered = (top: number) => (Object.entries(l?.boxes ?? {}) as [AdPart, Box][]).reduce((a, [p, o]) => p === sel ? a
      : a + Math.max(0, Math.min(left + bw, fx + (o.x + o.w) * k) - Math.max(left, fx + o.x * k)) * Math.max(0, Math.min(top + bh, fy + (o.y + o.h) * k) - Math.max(top, fy + o.y * k)), 0);
    const fits = [y - tag - bh, y + h + gap].filter((t) => t >= pad && t + bh <= sr.height - pad).sort((a, b) => covered(a) - covered(b));
    const top = fits[0] ?? (y > sr.height - y - h ? pad : sr.height - pad - bh);
    setBarAt({ left, top });
  }, [selBox, k, room, style, sel, scrolled]); // eslint-disable-line react-hooks/exhaustive-deps

  /* the wheel / trackpad zooms the picture (a passive listener can't stop the page from scrolling) */
  const wheelRef = useRef<(ev: WheelEvent) => void>(() => undefined);
  wheelRef.current = (ev) => {
    /* zoomed in past the stage: the wheel scrolls it (a pinch, or Ctrl + wheel, still zooms the picture) */
    const s = scroller.current; if (!ev.ctrlKey && s && (s.scrollWidth > s.clientWidth + 1 || s.scrollHeight > s.clientHeight + 1)) return;
    ev.preventDefault(); zoomTo((e.pic?.zoom ?? 1) * Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.002))); };
  useEffect(() => { const s = stage.current; if (!s) return; const f = (ev: WheelEvent) => wheelRef.current(ev); s.addEventListener('wheel', f, { passive: false }); return () => s.removeEventListener('wheel', f); }, []);

  /* ---- keys: caught before the board sees them (Delete would remove the card), Esc closes */
  const keyRef = useRef<(ev: KeyboardEvent) => void>(() => undefined);
  keyRef.current = (ev) => {
    const tg = ev.target as HTMLElement | null; const mine = !!tg && (tg === document.body || !!sheet.current?.contains(tg)); if (!mine) return;
    /* in the style panel, keys only press its buttons (Enter / Space) and Esc closes: arrows never nudge a part */
    ev.stopPropagation(); const side = !!tg?.closest('.ade-side, .adt');
    /* the stage's zoom: Cmd/Ctrl + 0 fits, + and − step (instead of zooming the page) */
    if ((ev.metaKey || ev.ctrlKey) && !ev.altKey && /^[0=+-]$/.test(ev.key) && !/^(INPUT|TEXTAREA)$/.test(tg?.tagName ?? '')) { ev.preventDefault(); if (ev.key === '0') zoomView('fit'); else if (ev.key === '-') zoomOut(); else zoomIn(); return; }
    /* the side panel's icon rail: arrow keys go to the next / previous section */
    if (side && tg?.getAttribute('role') === 'tab' && /^Arrow(Up|Down|Left|Right)$/.test(ev.key)) { const tabs = [...(tg.parentElement?.querySelectorAll<HTMLElement>('[role=tab]') ?? [])];
      const i = tabs.indexOf(tg) + (/Up|Left/.test(ev.key) ? -1 : 1); const to = tabs[(i + tabs.length) % tabs.length]; ev.preventDefault(); to?.focus(); to?.click(); return; }
    if (tg && (/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || side)) { if (ev.key === 'Escape') { ev.preventDefault(); if (side && sel) { setSel(null); sheet.current?.focus({ preventScroll: true }); } else onClose(); } return; }
    if (ev.key === 'Escape') { ev.preventDefault(); if (sel) setSel(null); else onClose(); return; }
    if (!sel || !l?.boxes[sel]) return;
    const step = (ev.shiftKey ? 10 : 1) / k; const n: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (n[ev.key]) { ev.preventDefault(); const b = l.boxes[sel]!; setPlace(sel, clampBox({ ...b, x: b.x + n[ev.key][0], y: b.y + n[ev.key][1] }, l.clear), pxOf(sel)); }
    else if ((ev.key === 'Delete' || ev.key === 'Backspace') && HIDEABLE.includes(sel)) { ev.preventDefault(); hide(sel); }
  };
  useEffect(() => { const f = (ev: KeyboardEvent) => keyRef.current(ev); addEventListener('keydown', f, true); return () => removeEventListener('keydown', f, true); }, []);
  /* focus moves into the sheet and comes back to what opened it */
  useEffect(() => { const back = document.activeElement as HTMLElement | null; sheet.current?.focus({ preventScroll: true }); return () => back?.focus?.({ preventScroll: true }); }, []);

  const S = (b: Box) => ({ left: b.x * k, top: b.y * k, width: b.w * k, height: b.h * k });
  const zoom = e.pic?.zoom ?? 1; const edited = isEdited(edit);
  const cursor = drag.current ? (drag.current.mode === 'pic' ? 'grabbing' : drag.current.mode === 'size' ? 'nwse-resize' : 'move') : hover ? 'move' : 'grab';
  /* the sheet sits in the card's React tree: its events stop here, so they never reach the card or the board */
  const own = { onPointerUp: halt, onPointerMove: halt, onClick: halt, onDoubleClick: halt, onKeyDown: halt, onKeyUp: halt, onContextMenu: halt, onWheel: halt };
  const pct = `${Math.round(k * 100)}%`;
  return createPortal(<div className="wfm-back ade-back" data-testid="ad-editor" {...own} onPointerDown={(ev) => { ev.stopPropagation(); if (ev.target === ev.currentTarget) onClose(); }}>
    <div ref={sheet} className="wfm ade" role="dialog" aria-modal="true" aria-labelledby="ade-title" tabIndex={-1}>
      <header className="ade-top">
        <h2 id="ade-title">Edit & style</h2>
        <div className="ad-seg" role="tablist" aria-label="Size">{sizes.map((s) => <button key={s.shape} type="button" role="tab" aria-selected={s.shape === size.shape} className={`${s.shape === size.shape ? 'on' : ''}${editedSizes.includes(s.shape) ? ' ed' : ''}`} data-testid={`ade-size-${s.shape}`} {...tip(`${s.w} × ${s.h} · ${s.where}`)} onClick={() => onSize(s)}>{s.label}</button>)}</div>
        <SafeSwitch on={showSafe} onChange={onShowSafe} safe={size.safe} label="Safe zones" testId="ade-safe" />
        <div className="wfm-end">
          <button type="button" className="btn" data-testid="ade-reset" disabled={!edited} {...tip('Back to the automatic layout for this size')} onClick={() => { setSel(null); onEdit(null); }}>Reset layout</button>
          <button type="button" className="btn btn-primary" data-testid="ade-done" {...tip('Close (Esc)')} onClick={onClose}>Done</button></div>
      </header>
      <div className="ade-main ade-main-p">
      <aside className="ade-side ade-panel bp-host" aria-label="Edit and style" data-testid="ade-panel">{panel({ hit, zoom, zoomTo, zones, zone, setZone })}</aside>
      <div className="ade-col">
      <div ref={stage} className="wfm-stage ade-stage">
        <div ref={scroller} className="ade-scroll" data-testid="ade-scroll" onScroll={() => setScrolled((n) => n + 1)}><div className="ade-world">
        <div ref={frame} className="ade-frame" style={{ width: W * k, height: H * k, cursor }} data-testid="ade-frame" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={() => !drag.current && setHover(null)}>
          <canvas ref={setCanvas} className="ade-cv" style={{ width: W * k, height: H * k }} aria-label={`Your ad, ${size.label}`} />
          {l && (Object.entries(l.boxes) as [AdPart, Box][]).map(([p, b]) => <div key={p} className={`ade-part${p === sel ? ' on' : p === hover ? ' hov' : ''}`} style={S(b)} data-testid={`ade-part-${p}`}>
            {p === sel && <span className="ade-tag">{PART_NAME[p]}</span>}
            {p === sel && RESIZABLE.includes(p) && <i className="ade-handle" data-handle={p} aria-hidden {...tip(p === 'button' ? 'Drag to change the width' : 'Drag to resize')} />}</div>)}
          {guide?.x != null && <i className="ade-guide v" style={{ left: guide.x * k }} aria-hidden />}
          {guide?.y != null && <i className="ade-guide h" style={{ top: guide.y * k }} aria-hidden />}
        </div>
        </div></div>
        {sel && selBox && <div ref={bar} className="adt bp-host" role="toolbar" aria-label={`${PART_NAME[sel]} style`} data-testid="adt"
          style={barAt ?? { left: 0, top: 0, visibility: 'hidden' }} onPointerDown={halt}><PartStyle part={sel} style={style} onStyle={onStyle} art={art} bar /></div>}
      </div>
      <div className="ade-status">
        <div className="ade-foot">
          {hidden.length > 0 && <div className="ade-hidden">{hidden.map((p) => <button key={p} type="button" className="ad-add" data-testid={`ade-show-${p}`} onClick={() => unhide(p)}><PlusIcon size={12} />Show {PART_NAME[p].toLowerCase()}</button>)}</div>}
          <span className="ade-note">{sel ? `${PART_NAME[sel]}: arrow keys nudge (Shift: 10)${HIDEABLE.includes(sel) ? ', Delete takes it off' : ''}`
            : `${edited ? 'Own layout for this size' : 'Automatic layout'} · Click a part to style it, drag to move, drag a corner to resize (Alt: no snapping)`}</span>
        </div>
        <div className="ade-zoom" role="group" aria-label="Zoom the view" data-testid="ade-view">
          <button type="button" aria-label="Zoom out" {...tip('Zoom out (Cmd/Ctrl −)')} disabled={k <= STEPS[0] + 1e-3} onClick={zoomOut} data-testid="ade-view-out"><MinusIcon size={14} /></button>
          <span data-testid="ade-view-pct">{pct}</span>
          <button type="button" aria-label="Zoom in" {...tip('Zoom in (Cmd/Ctrl +)')} disabled={k >= STEPS[STEPS.length - 1] - 1e-3} onClick={zoomIn} data-testid="ade-view-in"><PlusIcon size={14} /></button>
          <i aria-hidden />
          <button type="button" className={view === 'fit' ? 'on' : ''} aria-pressed={view === 'fit'} {...tip('Fit the ad to the screen (Cmd/Ctrl 0)')} onClick={() => zoomView('fit')} data-testid="ade-view-fit">Fit</button>
          <button type="button" className={view === 1 ? 'on' : ''} aria-pressed={view === 1} {...tip('Actual pixels')} onClick={() => zoomView(1)} data-testid="ade-view-100">100%</button>
        </div>
      </div>
      </div>
      </div>
    </div>
  </div>, document.body);
}

/** The brand's colours (no repeats), then white and black. */
function swatchesOf(art: AdArt): string[] {
  const out: string[] = []; for (const h of [...(art.kit?.colors ?? []).map((c) => c.hex), '#FFFFFF', '#000000']) { const x = h.toUpperCase(); if (!out.includes(x)) out.push(x); } return out;
}
/** A row of colour dots (a radio group); the first, "Auto", clears the pick. */
function Swatches({ label, value, colors, auto, autoHex, onChange, testId }: { label: string; value: string | undefined; colors: string[]; auto: string; autoHex?: string; onChange: (hex: string | undefined) => void; testId: string }) {
  return <div className="ade-sw" role="radiogroup" aria-label={label} data-testid={testId}>
    <button type="button" role="radio" aria-checked={!value} className={`ade-sw-auto${!value ? ' on' : ''}`} {...tip(auto)} onClick={() => onChange(undefined)}>
      <i style={autoHex ? { background: autoHex } : undefined} aria-hidden />Auto</button>
    {colors.map((h) => <button key={h} type="button" role="radio" aria-checked={value === h} aria-label={h} className={value === h ? 'on' : ''} {...tip(h)} onClick={() => onChange(h)}><i style={{ background: h }} aria-hidden /></button>)}
  </div>;
}
/** The safe-zones switch: in the editor's top bar and in the Platforms section, both on the card's one setting. Off (greyed) on a size
 *  nothing covers. */
export function SafeSwitch({ on, onChange, safe, label, testId }: { on: boolean; onChange: (on: boolean) => void; safe: AdSizeOption['safe']; label: string; testId: string }) {
  const any = hasSafe(safe);
  return <label className={`ad-safe${any ? '' : ' none'}`} {...tip(any ? 'Shades what each app covers with its own buttons and captions. Only in the preview, never in the pictures you save.' : 'Nothing covers this size')}>
    <input type="checkbox" checked={on && any} disabled={!any} data-testid={testId} onChange={(ev) => onChange(ev.target.checked)} /><i aria-hidden />{label}</label>;
}
/** The toolbar's colour: one dot showing the colour; it opens the same swatches in a small popover. */
function SwatchPick({ label, testId, ...sw }: Parameters<typeof Swatches>[0]) {
  const btn = useRef<HTMLButtonElement>(null); const [open, setOpen] = useState(false);
  return <>
    <button ref={btn} type="button" className={`adt-swb${sw.value ? '' : ' auto'}`} aria-haspopup="dialog" aria-expanded={open} aria-label={`${label}: ${sw.value ?? 'Auto'}`} data-testid={testId} {...tip(label)} onClick={() => setOpen((o) => !o)}>
      <i style={{ background: sw.value ?? sw.autoHex ?? '#FFFFFF' }} aria-hidden /></button>
    <BarPopover open={open} anchor={btn} onClose={() => setOpen(false)} label={label} placement="top" width={212} className="ade-pop adt-pop" testId={`${testId}-pop`}>
      <PopSection label={label}><Swatches {...sw} label={label} testId={`${testId}-sw`} onChange={(h) => { sw.onChange(h); setOpen(false); }} /></PopSection>
    </BarPopover>
  </>;
}
/** Small drawings for the toolbar's icon options. */
const Glyph = ({ k }: { k: string }) => <span className={`adt-gl adt-gl-${k}`} aria-hidden><b /></span>;

/** The style controls of one part (logo, words or button): the full set in the side panel's Text and Style sections, and the same
 *  controls, smaller, in the toolbar that floats by the selected part (bar). One set of controls, one style, saved on the card. */
export function PartStyle({ part, style, onStyle, art, bar }: { part: AdPart; style: AdStyle; onStyle: (s: AdStyle) => void; art: AdArt; bar?: boolean }) {
  const set = (p: Partial<AdStyle>) => onStyle({ ...style, ...p }); const colors = swatchesOf(art);
  const words = part === 'headline' || part === 'offer';
  /* a group: a labelled section in the panel; in the toolbar, a compact group with no caption (each control says what it is in its tooltip) */
  const g = (label: string, control: ReactNode, note?: ReactNode) => bar
    ? <div key={label} className="adt-g" role="group" aria-label={label}>{control}</div>
    : <PopSection key={label} label={label}>{control}{note}</PopSection>;
  const opaque = !art.logoSeeThrough; const ownBg = 'This logo has its own background, so it stays as it is. Add a see-through PNG or SVG to the brand to make it white or dark.';
  const id = (t: string) => `${bar ? 'adt' : 'ade'}-${t}`;
  const textColor = { label: 'Text colour', value: style.textColor, colors, auto: 'White, or what reads on the panel', autoHex: '#FFFFFF', onChange: (h: string | undefined) => set({ textColor: h }), testId: id('text-color') };
  const buttonColor = { label: 'Button colour', value: style.buttonColor, colors, auto: "The brand's main colour", autoHex: buttonColorOf(art.kit), onChange: (h: string | undefined) => set({ buttonColor: h }), testId: id('button-color') };
  const bold = (style.textWeight ?? 'bold') === 'bold';
  return <>
    {part === 'logo' && <>
      {g('Plate behind the logo', <Segmented label="Plate behind the logo" value={style.logoPlate ?? 'auto'} onChange={(v) => set({ logoPlate: v })} testId={id('logo-plate')}
        options={[{ value: 'auto', label: bar ? <Glyph k="plate-auto" /> : 'Auto', title: bar ? 'Plate: only when the logo would get lost on the picture' : 'Only when the logo would get lost on the picture' },
          { value: 'on', label: bar ? <Glyph k="plate-on" /> : 'On', title: bar ? 'Plate: on' : undefined }, { value: 'off', label: bar ? <Glyph k="plate-off" /> : 'Off', title: bar ? 'Plate: off' : undefined }]} />)}
      {g('Logo colour', <Segmented label="Logo colour" value={logoToneFor(style.logoTone, art.logoSeeThrough)} onChange={(v) => set({ logoTone: v })} testId={id('logo-tone')}
        options={[{ value: 'original', label: bar ? <Glyph k="tone-original" /> : 'As is', title: bar ? (opaque ? ownBg : 'Logo: as it is') : undefined },
          ...(['light', 'dark'] as const).map((v) => ({ value: v, label: bar ? <Glyph k={`tone-${v}`} /> : v === 'light' ? 'Light' : 'Dark', disabled: opaque,
            title: opaque ? (bar ? ownBg : 'Needs a see-through logo') : bar ? `Logo: ${v === 'light' ? 'white' : 'dark'}` : undefined }))]} />,
        opaque && <PopNote>{ownBg}</PopNote>)}
    </>}
    {words && <>
      {g('Weight', bar
        ? <button type="button" className={`adt-tg${bold ? ' on' : ''}`} aria-pressed={bold} data-testid="adt-text-weight" {...tip(bold ? 'Bold (click for regular)' : 'Regular (click for bold)')}
            onClick={() => set({ textWeight: bold ? 'regular' : 'bold' })}><span className={`adt-aa${bold ? ' b' : ''}`}>Aa</span></button>
        : <Segmented label="Headline weight" value={style.textWeight ?? 'bold'} onChange={(v) => set({ textWeight: v })} testId="ade-text-weight"
            options={[{ value: 'regular', label: 'Regular', title: 'Regular' }, { value: 'bold', label: 'Bold', title: 'Bold' }]} />)}
      {g('Colour', bar ? <SwatchPick {...textColor} /> : <Swatches {...textColor} />)}
      {g('Align', bar
        ? <Segmented label="Align" value={style.textAlign ?? 'auto'} onChange={(v) => set({ textAlign: v === style.textAlign || v === 'auto' ? undefined : v })} testId="adt-text-align"
            options={[{ value: 'left', label: <AlignLeftIcon size={15} />, title: 'Left (click again: as the layout lines them up)' }, { value: 'center', label: <AlignCenterIcon size={15} />, title: 'Centre (click again: as the layout lines them up)' }, { value: 'right', label: <AlignRightIcon size={15} />, title: 'Right (click again: as the layout lines them up)' }]} />
        : <Segmented label="Align" value={style.textAlign ?? 'auto'} onChange={(v) => set({ textAlign: v === 'auto' ? undefined : v })} testId="ade-text-align"
            options={[{ value: 'auto', label: 'Auto', title: 'As the layout lines them up' }, { value: 'left', label: 'Left', title: 'Left' }, { value: 'center', label: 'Centre', title: 'Centre' }, { value: 'right', label: 'Right', title: 'Right' }]} />)}
      {!bar && g('Behind the words', <Segmented label="Behind the words" cols={2} value={style.backdrop ?? 'gradient'} onChange={(v) => set({ backdrop: v })} testId="ade-backdrop"
        options={[{ value: 'none', label: 'None' }, { value: 'shadow', label: 'Soft shadow' }, { value: 'gradient', label: 'Gradient' }, { value: 'panel', label: 'Solid panel' }]} />,
        (style.backdrop === 'none' || style.backdrop === 'shadow') && <PopNote>With nothing solid behind them, pick a colour that stands out on your picture.</PopNote>)}
    </>}
    {part === 'button' && <>
      {g('Shape', <Segmented label="Button shape" cols={bar ? undefined : 2} value={style.buttonShape ?? 'pill'} onChange={(v) => set({ buttonShape: v })} testId={id('button-shape')}
        options={(['pill', 'rounded', 'square', 'outline'] as const).map((v) => { const name = v[0].toUpperCase() + v.slice(1); return { value: v, label: bar ? <Glyph k={`btn-${v}`} /> : name, title: bar ? name : undefined }; })} />)}
      {g('Colour', bar ? <SwatchPick {...buttonColor} /> : <Swatches {...buttonColor} />,
        <PopNote>{style.buttonShape === 'outline' ? 'An outline that wouldn’t show on the picture turns white or black.' : 'Its words turn white or black, whichever reads best.'}</PopNote>)}
    </>}
  </>;
}
