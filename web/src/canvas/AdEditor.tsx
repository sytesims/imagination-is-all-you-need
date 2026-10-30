/**
 * "Edit ad" (2026-10-30): the Ad layout card's big editor, in the app's large sheet (MaskSheet's .wfm styles). The ad for the current size
 * at a readable size; drag the logo, headline, offer line and button, resize the logo, headline (its text follows) and the button (width)
 * from the corner; they snap to the clear area, the margins, the centre lines and each other (hold Alt for none) and can't leave the
 * clear area. Drag the picture itself (where no part is) to frame it, and zoom it with the slider or the wheel / trackpad. Arrow keys
 * nudge (Shift: 10), Delete takes the logo, offer or button off this size ("Show …" brings it back). Edits are saved as they happen,
 * per size (adEdit.ts); "Reset layout" puts this size back to automatic. Esc or Done closes.
 *
 * The side panel styles the picked part, the same on every size (adLayout.AdStyle, saved on the card): the logo's plate and colour, the
 * words' alignment, weight, colour and what sits behind them, the button's shape and colour. Colours are the brand's, white or black.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { tip } from '../shared/Tooltip';
import { BarPopover, PopNote, PopRow, PopSection, Segmented } from '../shared/BarPop';
import { ChevronDownIcon, CloseIcon, PlusIcon } from '../ui/Icons';
import { drawAd, drawSafeZones, type AdArt } from './adDraw';
import { buttonColorOf, logoToneFor, type AdLayout, type AdPreset, type AdStyle, type AdText, type Box } from './adLayout';
import { hasSafe, zonesFor, type AdPlatform, type AdSizeOption } from './adPlatforms';
import { HIDEABLE, PART_NAME, PIC_ZOOM, clampBox, guidesFor, inBox, isEdited, moveFrame, placeOf, snapBox, snapTo, type AdEdit, type AdFrame, type AdPart } from './adEdit';

type Drag = { mode: 'move' | 'size' | 'pic'; part: AdPart | null; x0: number; y0: number; box: Box; px: number; frame: AdFrame | undefined };
const halt = (ev: React.SyntheticEvent) => ev.stopPropagation();
const RESIZABLE: AdPart[] = ['logo', 'headline', 'button'];
/** Topmost first (the order they're drawn, reversed). */
const HIT_ORDER: AdPart[] = ['button', 'offer', 'logo', 'headline'];

export function AdEditor({ sizes, size, onSize, pic, art, text, preset, style, onStyle, edit, onEdit, showSafe, onSafe, platforms, editedSizes, onClose }: {
  sizes: AdSizeOption[]; size: AdSizeOption; onSize: (s: AdSizeOption) => void; pic: HTMLImageElement; art: AdArt; text: AdText; preset: AdPreset;
  /** the card's style, on every size */ style: AdStyle; onStyle: (s: AdStyle) => void;
  /** this size's edits */ edit: AdEdit | undefined; onEdit: (e: AdEdit | null) => void; showSafe: boolean; onSafe: (on: boolean) => void; platforms: AdPlatform[]; /** sizes with their own layout (a dot on the tab) */ editedSizes: string[]; onClose: () => void;
}) {
  const { w: W, h: H } = size; const e = edit ?? {}; const hidden = HIDEABLE.filter((p) => e.hide?.includes(p));
  const stage = useRef<HTMLDivElement>(null); const sheet = useRef<HTMLDivElement>(null); const [room, setRoom] = useState<[number, number]>([0, 0]);
  useLayoutEffect(() => { const s = stage.current; if (!s) return; const ro = new ResizeObserver(() => setRoom([s.clientWidth, s.clientHeight])); ro.observe(s); return () => ro.disconnect(); }, []);
  const k = room[0] > 0 ? Math.min((room[0] - 48) / W, (room[1] - 48) / H) : 0; /* frame px → screen px */
  const [c, setCanvas] = useState<HTMLCanvasElement | null>(null); const [l, setL] = useState<AdLayout | null>(null);
  const [sel, setSel] = useState<AdPart | null>(null); const [hover, setHover] = useState<AdPart | null>(null); const [guide, setGuide] = useState<{ x: number | null; y: number | null } | null>(null);
  /* "Zones for": one platform's zones at a time (the parts still keep clear of all of them) */
  const zones = zonesFor(platforms, size.shape); const [zone, setZone] = useState<AdPlatform | 'all'>('all'); const [zonesOpen, setZonesOpen] = useState(false); const zonesBtn = useRef<HTMLButtonElement>(null);
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
  const drag = useRef<Drag | null>(null);
  const at = (ev: React.PointerEvent): [number, number] => { const r = ev.currentTarget.getBoundingClientRect(); return [(ev.clientX - r.left) / k, (ev.clientY - r.top) / k]; };
  const hitOf = (x: number, y: number) => (l ? HIT_ORDER.find((p) => l.boxes[p] && inBox(l.boxes[p]!, x, y)) ?? null : null);
  const others = (part: AdPart) => (l ? (Object.entries(l.boxes) as [AdPart, Box][]).filter(([p]) => p !== part).map(([, b]) => b) : []);
  const down = (ev: React.PointerEvent) => {
    if (ev.button !== 0 || !l) return; const [x, y] = at(ev); sheet.current?.focus({ preventScroll: true });
    const handle = (ev.target as HTMLElement).dataset.handle as AdPart | undefined;
    const part = handle ?? hitOf(x, y); setSel(part);
    drag.current = part ? { mode: handle ? 'size' : 'move', part, x0: x, y0: y, box: l.boxes[part]!, px: pxOf(part), frame: e.pic } : { mode: 'pic', part: null, x0: x, y0: y, box: l.pic, px: 0, frame: e.pic };
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* a pointer the browser no longer tracks */ } ev.preventDefault();
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
  const up = () => { drag.current = null; setGuide(null); };

  /* the wheel / trackpad zooms the picture (a passive listener can't stop the page from scrolling) */
  const wheelRef = useRef<(ev: WheelEvent) => void>(() => undefined);
  wheelRef.current = (ev) => { ev.preventDefault(); zoomTo((e.pic?.zoom ?? 1) * Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.002))); };
  useEffect(() => { const s = stage.current; if (!s) return; const f = (ev: WheelEvent) => wheelRef.current(ev); s.addEventListener('wheel', f, { passive: false }); return () => s.removeEventListener('wheel', f); }, []);

  /* ---- keys: caught before the board sees them (Delete would remove the card), Esc closes */
  const keyRef = useRef<(ev: KeyboardEvent) => void>(() => undefined);
  keyRef.current = (ev) => {
    const tg = ev.target as HTMLElement | null; const mine = !!tg && (tg === document.body || !!sheet.current?.contains(tg)); if (!mine || zonesOpen) return;
    /* in the style panel, keys only press its buttons (Enter / Space) and Esc closes: arrows never nudge a part */
    ev.stopPropagation(); const side = !!tg?.closest('.ade-side');
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
  return createPortal(<div className="wfm-back" data-testid="ad-editor" {...own} onPointerDown={(ev) => { ev.stopPropagation(); if (ev.target === ev.currentTarget) onClose(); }}>
    <div ref={sheet} className="wfm ade" role="dialog" aria-modal="true" aria-labelledby="ade-title" tabIndex={-1}>
      <header className="wfm-h ade-h">
        <div><h2 id="ade-title">Edit ad</h2><p>Drag to move, drag a corner to resize. Hold Alt to move without snapping. Drag the picture to frame it.</p></div>
        <button type="button" className="wfm-x" aria-label="Close" {...tip('Close (Esc)')} onClick={onClose}><CloseIcon size={16} /></button>
      </header>
      <div className="ade-bar">
        <div className="ad-seg" role="tablist" aria-label="Size">{sizes.map((s) => <button key={s.shape} type="button" role="tab" aria-selected={s.shape === size.shape} className={`${s.shape === size.shape ? 'on' : ''}${editedSizes.includes(s.shape) ? ' ed' : ''}`} data-testid={`ade-size-${s.shape}`} {...tip(`${s.w} × ${s.h} · ${s.where}`)} onClick={() => onSize(s)}>{s.label}</button>)}</div>
        <label className={`ad-safe${hasSafe(size.safe) ? '' : ' none'}`}><input type="checkbox" checked={showSafe} data-testid="ade-safe" onChange={(ev) => onSafe(ev.target.checked)} /><i aria-hidden />Show safe zones</label>
        {showSafe && zones.length > 1 && <>
          <button ref={zonesBtn} type="button" className="ad-brand ade-zones" data-testid="ade-zones" aria-haspopup="menu" aria-expanded={zonesOpen} onClick={() => setZonesOpen((o) => !o)}>
            <span className="ad-brand-l">Zones for</span><span className="ad-brand-n">{zone === 'all' ? 'All' : zones.find((z) => z.p === zone)?.label}</span><ChevronDownIcon size={14} /></button>
          <BarPopover open={zonesOpen} anchor={zonesBtn} onClose={() => setZonesOpen(false)} label="Zones for" placement="bottom" width={248} className="ade-pop" testId="ade-zones-pop">
            <PopSection label="Show the zones of"><div role="radiogroup" aria-label="Zones for">
              <PopRow role="radio" selected={zone === 'all'} label="All" hint="What the parts keep clear of" onClick={() => { setZone('all'); setZonesOpen(false); }} />
              {zones.map((z) => <PopRow key={z.p} role="radio" selected={zone === z.p} label={z.label} onClick={() => { setZone(z.p); setZonesOpen(false); }} testId={`ade-zones-${z.p}`} />)}
            </div></PopSection>
          </BarPopover></>}
      </div>
      <div className="ade-main">
      <div ref={stage} className="wfm-stage ade-stage">
        <div className="ade-frame" style={{ width: W * k, height: H * k, cursor }} data-testid="ade-frame" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={() => !drag.current && setHover(null)}>
          <canvas ref={setCanvas} className="ade-cv" style={{ width: W * k, height: H * k }} aria-label={`Your ad, ${size.label}`} />
          {l && (Object.entries(l.boxes) as [AdPart, Box][]).map(([p, b]) => <div key={p} className={`ade-part${p === sel ? ' on' : p === hover ? ' hov' : ''}`} style={S(b)} data-testid={`ade-part-${p}`}>
            {p === sel && <span className="ade-tag">{PART_NAME[p]}</span>}
            {p === sel && RESIZABLE.includes(p) && <i className="ade-handle" data-handle={p} aria-hidden {...tip(p === 'button' ? 'Drag to change the width' : 'Drag to resize')} />}</div>)}
          {guide?.x != null && <i className="ade-guide v" style={{ left: guide.x * k }} aria-hidden />}
          {guide?.y != null && <i className="ade-guide h" style={{ top: guide.y * k }} aria-hidden />}
        </div>
      </div>
      <StylePanel part={sel} parts={l ? (Object.keys(l.boxes) as AdPart[]) : []} onPick={setSel} style={style} onStyle={onStyle} art={art} />
      </div>
      <footer className="wfm-tools ade-tools">
        <label className="wfm-size"><span>Picture zoom</span><input type="range" min={PIC_ZOOM.min} max={PIC_ZOOM.max} step={0.01} value={zoom} onChange={(ev) => zoomTo(+ev.target.value)} aria-label="Picture zoom" data-testid="ade-zoom" /><b>{Math.round(zoom * 100)}%</b></label>
        {hidden.length > 0 && <div className="ade-hidden">{hidden.map((p) => <button key={p} type="button" className="ad-add" data-testid={`ade-show-${p}`} onClick={() => unhide(p)}><PlusIcon size={12} />Show {PART_NAME[p].toLowerCase()}</button>)}</div>}
        <span className="ade-note">{sel ? `${PART_NAME[sel]}: arrow keys nudge (Shift: 10)${HIDEABLE.includes(sel) ? ', Delete takes it off' : ''}` : edited ? 'This size has its own layout.' : 'This size uses the automatic layout.'}</span>
        <div className="wfm-end">
          <button type="button" className="btn" data-testid="ade-reset" disabled={!edited} {...tip('Back to the automatic layout for this size')} onClick={() => { setSel(null); onEdit(null); }}>Reset layout</button>
          <button type="button" className="btn btn-primary" data-testid="ade-done" onClick={onClose}>Done</button></div>
      </footer>
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
const PART_STYLE: { part: AdPart; label: string }[] = [{ part: 'logo', label: 'Logo' }, { part: 'headline', label: 'Words' }, { part: 'button', label: 'Button' }];
/** The style of the picked part, in the bar popovers' controls (BarPop: sections, segmented, here on the sheet as a `.bp-host`). */
function StylePanel({ part, parts, onPick, style, onStyle, art }: { part: AdPart | null; parts: AdPart[]; onPick: (p: AdPart) => void; style: AdStyle; onStyle: (s: AdStyle) => void; art: AdArt }) {
  const set = (p: Partial<AdStyle>) => onStyle({ ...style, ...p }); const colors = swatchesOf(art);
  const words = part === 'headline' || part === 'offer';
  return <aside className="ade-side bp-host" aria-label="Style" data-testid="ade-style">
    {!part && <PopSection label="Style">
      <PopNote>Click the logo, the words or the button to change how they look. The style is the same on every size.</PopNote>
      <div className="ade-side-picks">{PART_STYLE.filter((x) => parts.includes(x.part)).map((x) => <button key={x.part} type="button" className="ad-add" data-testid={`ade-style-${x.part}`} onClick={() => onPick(x.part)}>{x.label}</button>)}</div>
    </PopSection>}
    {part === 'logo' && <>
      <PopSection label="Plate behind the logo"><Segmented label="Plate behind the logo" value={style.logoPlate ?? 'auto'} onChange={(v) => set({ logoPlate: v })} testId="ade-logo-plate"
        options={[{ value: 'auto', label: 'Auto', title: 'Only when the logo would get lost on the picture' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} /></PopSection>
      <PopSection label="Logo colour"><Segmented label="Logo colour" value={logoToneFor(style.logoTone, art.logoSeeThrough)} onChange={(v) => set({ logoTone: v })} testId="ade-logo-tone"
        options={[{ value: 'original', label: 'As is' }, ...(['light', 'dark'] as const).map((v) => ({ value: v, label: v === 'light' ? 'Light' : 'Dark', disabled: !art.logoSeeThrough, title: art.logoSeeThrough ? undefined : 'Needs a see-through logo' }))]} />
        {!art.logoSeeThrough && <PopNote>This logo has its own background, so it stays as it is. Add a see-through PNG or SVG to the brand to make it white or dark.</PopNote>}</PopSection>
    </>}
    {words && <>
      <PopSection label="Align"><Segmented label="Align" value={style.textAlign ?? 'auto'} onChange={(v) => set({ textAlign: v === 'auto' ? undefined : v })} testId="ade-text-align"
        options={[{ value: 'auto', label: 'Auto', title: 'As the layout lines them up' }, { value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }]} /></PopSection>
      <PopSection label="Headline weight"><Segmented label="Headline weight" value={style.textWeight ?? 'bold'} onChange={(v) => set({ textWeight: v })} testId="ade-text-weight"
        options={[{ value: 'regular', label: 'Regular' }, { value: 'bold', label: 'Bold' }]} /></PopSection>
      <PopSection label="Colour"><Swatches label="Text colour" value={style.textColor} colors={colors} auto="White, or what reads on the panel" autoHex="#FFFFFF" onChange={(h) => set({ textColor: h })} testId="ade-text-color" /></PopSection>
      <PopSection label="Behind the words"><Segmented label="Behind the words" cols={2} value={style.backdrop ?? 'gradient'} onChange={(v) => set({ backdrop: v })} testId="ade-backdrop"
        options={[{ value: 'none', label: 'None' }, { value: 'shadow', label: 'Soft shadow' }, { value: 'gradient', label: 'Gradient' }, { value: 'panel', label: 'Solid panel' }]} />
        {(style.backdrop === 'none' || style.backdrop === 'shadow') && <PopNote>With nothing solid behind them, pick a colour that stands out on your picture.</PopNote>}</PopSection>
    </>}
    {part === 'button' && <>
      <PopSection label="Shape"><Segmented label="Button shape" cols={2} value={style.buttonShape ?? 'pill'} onChange={(v) => set({ buttonShape: v })} testId="ade-button-shape"
        options={[{ value: 'pill', label: 'Pill' }, { value: 'rounded', label: 'Rounded' }, { value: 'square', label: 'Square' }, { value: 'outline', label: 'Outline' }]} /></PopSection>
      <PopSection label="Colour"><Swatches label="Button colour" value={style.buttonColor} colors={colors} auto="The brand's main colour" autoHex={buttonColorOf(art.kit)} onChange={(h) => set({ buttonColor: h })} testId="ade-button-color" />
        <PopNote>Its words turn white or black, whichever reads best.</PopNote></PopSection>
    </>}
  </aside>;
}
