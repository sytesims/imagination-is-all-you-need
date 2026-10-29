/**
 * Add logo and text (2026-10-28, user picks: B as the main interaction, A's card behind "More"). In the result viewer, over an image or video
 * result while a brand is on: "Add logo" puts the brand's logo (and a line of text in its heading font) on the picture. Drag it: it snaps to
 * the nearest of nine spots. A small toolbar rides along (size, opacity, More, remove); More opens the full card (corner, size, backing,
 * opacity, text line, video end card). The preview is drawn by the same code as the file (logoStampDraw.ts), so Save and Share get exactly this,
 * as a separate copy made on this computer: no model, no price, the original result untouched.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { activeKit, loadBrandKits, useBrand } from './brandStore';
import { setStamp, setStampOn, useStamp } from './stampStore';
import { drawEndCard, drawStamp, loadStampArt, type StampArt } from './logoStampDraw';
import { SPOT_NAME, STAMP_CORNERS, STAMP_SIZES, STAMP_SPOTS, STAMP_TEXT_MAX, spotAt, type StampSize } from '../../../server/src/shared/logoStamp';
import type { BrandKit } from '../../../server/src/shared/brandKit';
import { tip } from './Tooltip';
import './logoStamp.css';

type Rect = { x: number; y: number; w: number; h: number };
type Box = { x: number; y: number; w: number; h: number };
/** The result's picture or video on the stage (the biggest one showing). */
function mediaEl(stage: HTMLElement): HTMLImageElement | HTMLVideoElement | null {
  let best: { e: HTMLImageElement | HTMLVideoElement; a: number } | null = null;
  for (const e of stage.querySelectorAll<HTMLImageElement | HTMLVideoElement>('img, video')) {
    if (e.closest('.lst, .rvx-tools, .mr-dock, .rvx-step') || !e.getClientRects().length) continue; const r = e.getBoundingClientRect(); const a = r.width * r.height; if (!best || a > best.a) best = { e, a };
  }
  return best && best.a >= 400 ? best.e : null;
}
/** Its drawn rectangle in stage pixels (object-fit: contain handled). */
function mediaRect(stage: HTMLElement, e: HTMLImageElement | HTMLVideoElement): Rect {
  const r = e.getBoundingClientRect(); const s = stage.getBoundingClientRect(); const nw = e instanceof HTMLVideoElement ? e.videoWidth : e.naturalWidth, nh = e instanceof HTMLVideoElement ? e.videoHeight : e.naturalHeight;
  let x = r.left, y = r.top, w = r.width, h = r.height; const fit = getComputedStyle(e).objectFit;
  if (nw && nh && fit !== 'fill' && fit !== 'cover') { const k = Math.min(w / nw, h / nh); const cw = nw * k, ch = nh * k; x += (w - cw) / 2; y += (h - ch) / 2; w = cw; h = ch; }
  return { x: x - s.left, y: y - s.top, w, h };
}
/** Show "Add logo" on this result? A brand is on in this media's bar, or the result was made with a brand. */
export function stampAvailable(brandOn: boolean, jobInput: any): boolean { return brandOn || !!jobInput?.brand?.applied || !!jobInput?.brandKit; }

export function LogoStampLayer({ kind }: { kind: 'image' | 'video' }) {
  const b = useBrand(); useEffect(() => { void loadBrandKits(); }, []); const kit = activeKit(b);
  const { on, settings: s } = useStamp();
  const root = useRef<HTMLDivElement>(null); const cv = useRef<HTMLCanvasElement>(null); const endCv = useRef<HTMLCanvasElement>(null);
  const [rect, setRect] = useState<Rect | null>(null); const [art, setArt] = useState<StampArt | null>(null); const [tick, setTick] = useState(0);
  const [box, setBox] = useState<Box | null>(null); const [card, setCard] = useState(false); const [drag, setDrag] = useState<{ x: number; y: number } | null>(null); const [showEnd, setShowEnd] = useState(false);
  useEffect(() => { let live = true; setArt(null); if (kit) loadStampArt(kit).then((a) => live && setArt(a)).catch(() => 0); return () => { live = false; }; }, [kit?.id, kit?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  /* follow the media's rectangle (resize, the panel, a video's size arriving late) */
  useLayoutEffect(() => {
    const stage = root.current?.closest<HTMLElement>('.rvx-stage'); if (!stage) return; let raf = 0, last = '';
    const tick = () => { const e = mediaEl(stage); const r = e ? mediaRect(stage, e) : null; const k = r ? [r.x, r.y, r.w, r.h].map(Math.round).join(',') : ''; if (k !== last) { last = k; setRect(r); } raf = requestAnimationFrame(tick); };
    tick(); return () => cancelAnimationFrame(raf);
  }, []);
  /* a video: redraw every second (the plate and the ink follow the frame behind the stamp); an image: once it has loaded */
  useEffect(() => { if (!on) return; const t = setInterval(() => setTick((n) => n + 1), kind === 'video' ? 1000 : 1500); return () => clearInterval(t); }, [kind, on]);
  /* draw the preview with the file's own code */
  useEffect(() => { const c = cv.current; if (!c || !rect || !art || !on) { setBox(null); return; }
    const dpr = Math.min(2, window.devicePixelRatio || 1); c.width = Math.round(rect.w * dpr); c.height = Math.round(rect.h * dpr); const g = c.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, rect.w, rect.h);
    const stage = root.current?.closest<HTMLElement>('.rvx-stage'); const e = stage ? mediaEl(stage) : null;
    const ready = e && (!(e instanceof HTMLVideoElement) || e.readyState >= 2) && (!(e instanceof HTMLImageElement) || e.complete) ? e : null;
    const l = drawStamp(g, rect.w, rect.h, art, s, ready); setBox((p) => (p && ['x', 'y', 'w', 'h'].every((k) => Math.abs((p as any)[k] - (l.box as any)[k]) < 0.5) ? p : l.box)); }, [rect, art, s, tick, on]);
  /* the end card preview, and at the end of each loop when it's on */
  useEffect(() => { const c = endCv.current; if (!c || !rect || !art || !showEnd) return; const dpr = Math.min(2, window.devicePixelRatio || 1); c.width = Math.round(rect.w * dpr); c.height = Math.round(rect.h * dpr);
    const g = c.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0); drawEndCard(g, rect.w, rect.h, art, s); }, [showEnd, rect, art, s]);
  useEffect(() => { if (kind !== 'video' || !on || !s.endCard) return; const stage = root.current?.closest<HTMLElement>('.rvx-stage'); const e = stage ? mediaEl(stage) : null; const v = e instanceof HTMLVideoElement ? e : null; if (!v) return;
    let last = 0, hide = 0; const end = () => { setShowEnd(true); clearTimeout(hide); hide = window.setTimeout(() => setShowEnd(false), 1500); };
    const t = () => { const d = v.duration; if (isFinite(d) && last > d - 0.6 && v.currentTime < last - 1) end(); last = v.currentTime; };
    v.addEventListener('ended', end); v.addEventListener('timeupdate', t); return () => { clearTimeout(hide); v.removeEventListener('ended', end); v.removeEventListener('timeupdate', t); }; }, [kind, on, s.endCard, rect?.w]);
  useEffect(() => { if (!on) { setCard(false); setShowEnd(false); } }, [on]);

  if (!kit) return <div ref={root} className="lst" />;
  const logo = !!kit.logo?.url;
  const startDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.lst-tb') || !rect) return; e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); const x0 = e.clientX, y0 = e.clientY; setDrag({ x: 0, y: 0 });
    const move = (ev: PointerEvent) => setDrag({ x: ev.clientX - x0, y: ev.clientY - y0 });
    const up = (ev: PointerEvent) => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); setDrag(null);
      if (!box) return; const cx = box.x + box.w / 2 + (ev.clientX - x0), cy = box.y + box.h / 2 + (ev.clientY - y0); setStamp({ spot: spotAt(cx / rect.w, cy / rect.h) }); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  };
  const nudge = (e: React.KeyboardEvent) => { const i = STAMP_SPOTS.indexOf(s.spot); const r = Math.floor(i / 3), c = i % 3;
    const n = e.key === 'ArrowLeft' ? [r, c - 1] : e.key === 'ArrowRight' ? [r, c + 1] : e.key === 'ArrowUp' ? [r - 1, c] : e.key === 'ArrowDown' ? [r + 1, c] : null;
    if (!n || n[0] < 0 || n[0] > 2 || n[1] < 0 || n[1] > 2) return; e.preventDefault(); setStamp({ spot: STAMP_SPOTS[n[0] * 3 + n[1]] }); };
  const sizes = Object.keys(STAMP_SIZES) as StampSize[]; const si = sizes.indexOf(s.size);
  const low = s.spot === 'tl'; const at = (dy: number): React.CSSProperties => (rect ? { left: rect.x + 12, top: low ? rect.y + rect.h - 44 - dy : rect.y + 12 + dy } : { display: 'none' });
  const cardPos: React.CSSProperties = rect ? { ...(low ? { left: rect.x + 12, bottom: `calc(100% - ${rect.y + rect.h - 52}px)` } : { left: rect.x + 12, top: rect.y + 52 }), maxHeight: Math.max(150, rect.h - 64) } : { display: 'none' };
  const tbBelow = s.spot[0] === 't'; const tbRight = s.spot[1] === 'r';
  const noLogo = <p className="lst-nolog" data-testid="lst-no-logo"><b>{kit.name} has no logo yet.</b> Add one in <a href={`/assets/brands?brand=${encodeURIComponent(kit.id)}`}>Assets › Brands</a>{s.textOn ? '. Until then, only the text line goes on.' : ', then it can sit on every result.'}</p>;

  return <div ref={root} className="lst" data-testid="logo-stamp">
    {on && rect && <canvas ref={cv} className="lst-cv" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, ...(drag ? { transform: `translate(${drag.x}px, ${drag.y}px)` } : {}) }} aria-hidden data-testid="lst-canvas" />}
    {on && rect && box && !showEnd && <div className={`lst-hit${drag ? ' dragging' : ''}`} role="button" tabIndex={0} aria-label={`Logo, ${SPOT_NAME[s.spot]}. Drag, or use the arrow keys, to move it`} data-testid="lst-hit" data-spot={s.spot}
      style={{ left: rect.x + box.x - 4, top: rect.y + box.y - 4, width: box.w + 8, height: box.h + 8, ...(drag ? { transform: `translate(${drag.x}px, ${drag.y}px)` } : {}) }} onPointerDown={startDrag} onKeyDown={nudge}>
      {!drag && <span className={`lst-tb${tbBelow ? ' below' : ''}${tbRight ? ' right' : ''}`} role="toolbar" aria-label="Logo options" onPointerDown={(e) => e.stopPropagation()} data-testid="lst-toolbar">
        <button type="button" aria-label="Smaller" disabled={si <= 0} onClick={() => setStamp({ size: sizes[si - 1] })}>−</button>
        <button type="button" aria-label="Bigger" disabled={si >= sizes.length - 1} onClick={() => setStamp({ size: sizes[si + 1] })}>+</button>
        <button type="button" aria-label={`Opacity ${Math.round(s.opacity * 100)}%. Click to change`} {...tip('Opacity')} onClick={() => setStamp({ opacity: s.opacity > 0.95 ? 0.6 : s.opacity > 0.85 ? 1 : s.opacity > 0.7 ? 0.9 : 0.75 })}>{Math.round(s.opacity * 100)}%</button>
        <button type="button" className={card ? 'on' : ''} aria-expanded={card} onClick={() => setCard((c) => !c)} data-testid="lst-more">More</button>
        <button type="button" aria-label="Remove logo" {...tip('Remove logo')} onClick={() => setStampOn(false)}>✕</button>
      </span>}
    </div>}
    {drag && rect && <div className="lst-ghosts" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} aria-hidden>{STAMP_SPOTS.map((k) => <i key={k} className={`lst-g lst-g-${k}`} />)}</div>}
    {showEnd && rect && <div className="lst-end" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} data-testid="lst-end"><canvas ref={endCv} style={{ width: rect.w, height: rect.h }} aria-label="End card preview" />
      <button type="button" className="lst-end-x" onClick={() => setShowEnd(false)}>Back to the clip</button></div>}
    <button type="button" className={`lst-pill${on ? ' on' : ''}`} style={at(0)} onClick={() => { const n = !on; setStampOn(n); if (n && !logo) setCard(true); }} aria-pressed={on} data-testid="lst-pill"
      {...tip(on ? 'Your logo goes on Save and Share, as a copy. Click to take it off' : `Put ${kit.name}’s logo on this ${kind}. The original stays as it is`)}>
      <BrandDot kit={kit} />{on ? <>Logo on<small>· drag to place</small></> : 'Add logo'}</button>
    {on && card && rect && <StampCard kit={kit} kind={kind} cardPos={cardPos} noLogo={logo ? null : noLogo} onPreviewEnd={() => setShowEnd(true)} onClose={() => setCard(false)} />}
  </div>;
}

/** "More": the full settings (the approved option A card). */
function StampCard({ kit, kind, cardPos, noLogo, onPreviewEnd, onClose }: { kit: BrandKit; kind: 'image' | 'video'; cardPos: React.CSSProperties; noLogo: React.ReactNode; onPreviewEnd: () => void; onClose: () => void }) {
  const { settings: s } = useStamp();
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }; addEventListener('keydown', k, true); return () => removeEventListener('keydown', k, true); }, [onClose]);
  return <div className="lst-card" style={cardPos} role="dialog" aria-label="Logo and text" data-testid="lst-card">
    <div className="lst-head"><span><b>Logo and text</b><small>{kit.name} · placed exactly, never redrawn</small></span><button type="button" className="lst-x" aria-label="Close" onClick={onClose}>✕</button></div>
    {noLogo}
    <div className="lst-row"><span className="lst-l">Corner</span><span className="lst-corners" role="radiogroup" aria-label="Corner">{STAMP_CORNERS.map((c) => <button key={c} type="button" role="radio" aria-checked={s.spot === c} aria-label={SPOT_NAME[c]} className={`lst-c lst-c-${c}${s.spot === c ? ' on' : ''}`} onClick={() => setStamp({ spot: c })}><i /></button>)}</span>
      <small className="lst-hint">{STAMP_CORNERS.includes(s.spot) ? 'or drag it' : `${SPOT_NAME[s.spot]} (dragged)`}</small></div>
    <div className="lst-row"><span className="lst-l">Size</span><span className="lst-seg" role="radiogroup" aria-label="Size">{(Object.keys(STAMP_SIZES) as StampSize[]).map((k) => <button key={k} type="button" role="radio" aria-checked={s.size === k} className={s.size === k ? 'on' : ''} onClick={() => setStamp({ size: k })}>{k}</button>)}</span></div>
    <label className="lst-row"><span className="lst-l">Opacity</span><input type="range" min={0.3} max={1} step={0.05} value={s.opacity} onChange={(e) => setStamp({ opacity: +e.target.value })} /><small className="lst-v">{Math.round(s.opacity * 100)}%</small></label>
    <div className="lst-row"><span className="lst-l">Backing</span><span className="lst-seg" role="radiogroup" aria-label="Backing">{(['auto', 'off'] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={s.backing === k} className={s.backing === k ? 'on' : ''} onClick={() => setStamp({ backing: k })}>{k === 'auto' ? 'Auto' : 'Off'}</button>)}</span>
      <small className="lst-hint">{s.backing === 'auto' ? 'a plate when the logo would get lost' : ''}</small></div>
    <label className="lst-row lst-col"><span className="lst-l lst-wide"><input type="checkbox" checked={s.textOn} onChange={(e) => setStamp({ textOn: e.target.checked })} /> Text line <small>in {kit.fonts.heading || 'Manrope'}</small></span>
      <input className="lst-input" value={s.text} maxLength={STAMP_TEXT_MAX} disabled={!s.textOn} onChange={(e) => setStamp({ text: e.target.value })} placeholder={kit.name} data-testid="lst-text" /></label>
    {kind === 'video' && <label className="lst-row lst-switch"><span><b>End card</b><small>1.5 s of your logo on your brand colour</small></span><input type="checkbox" checked={s.endCard} onChange={(e) => setStamp({ endCard: e.target.checked })} data-testid="lst-endcard" /></label>}
    {kind === 'video' && s.endCard && <button type="button" className="lst-link" onClick={onPreviewEnd}>Preview end card</button>}
    <p className="lst-foot">Save and Share use a copy with your logo. The original stays as it is. Free.</p>
  </div>;
}
const BrandDot = ({ kit }: { kit: { colors: { hex: string }[] } }) => <span className="lst-dot" aria-hidden style={{ background: kit.colors[0]?.hex ?? 'var(--accent)' }} />;
