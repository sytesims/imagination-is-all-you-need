/**
 * Brush Edit in Create Image's bar (2026-10-23): the mask canvas sheet. Desktop: a large modal over the feed; phones: a full-screen sheet.
 * Brush / erase, size, undo / redo, clear, invert, zoom and pan (wheel, + / −, Fit, Space-drag or the middle button; two fingers on touch).
 *
 * The mask is kept as vector operations on a working canvas (long side 1024–2048 px), so undo / redo never copies pixels and an 8K photo
 * paints as smoothly as a small one. "Done" exports what app-inpaint takes today: a PNG at the photo's own size, black = keep,
 * white = repaint (Ideogram's inverted polarity is handled by the router, tools/imageFalModels.ts). Nothing painted = no mask.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BrushIcon, EraserIcon, UndoIcon, RedoIcon, InvertIcon, FitIcon, PlusIcon, MinusIcon, CloseIcon, TrashIcon } from '../Icons';
import { tip } from '../../shared/Tooltip';


/** What the bar keeps for a painted mask. */
export interface WfMask { file: File; url: string; /** photo + orange overlay, small (strip thumbnail) */ preview: string; /** share of the photo painted, 0–1 */ cover: number; /** the photo it was painted on (name|size|lastModified) */ forPhoto: string }
export const photoSig = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

type Op = { k: 'stroke'; erase: boolean; w: number; pts: [number, number][] } | { k: 'clear' } | { k: 'invert' };
const PAINT = '#ff7a1a'; const MAX_OPS = 100; /* older steps are merged into the base: undo goes back 100 steps */
const WORK_MAX = 2048, WORK_MIN = 1024; const EXPORT_MAX_PX = 64e6; /* 8K × 8K; larger photos export a mask scaled to fit (same shape) */
const SIZE_MIN = 4, SIZE_MAX = 200; const Z_MIN = 1, Z_MAX = 8;

function workSize(w: number, h: number): [number, number] { const long = Math.max(w, h); const k = long > WORK_MAX ? WORK_MAX / long : long < WORK_MIN ? WORK_MIN / long : 1; return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))]; }
function apply(ctx: CanvasRenderingContext2D, op: Op) {
  const c = ctx.canvas;
  if (op.k === 'clear') { ctx.clearRect(0, 0, c.width, c.height); return; }
  if (op.k === 'invert') { const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; const x = t.getContext('2d')!; x.fillStyle = PAINT; x.fillRect(0, 0, t.width, t.height);
    x.globalCompositeOperation = 'destination-out'; x.drawImage(c, 0, 0); ctx.save(); ctx.globalCompositeOperation = 'copy'; ctx.drawImage(t, 0, 0); ctx.restore(); return; }
  ctx.save(); ctx.globalCompositeOperation = op.erase ? 'destination-out' : 'source-over'; ctx.strokeStyle = PAINT; ctx.fillStyle = PAINT; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = op.w;
  if (op.pts.length === 1) { ctx.beginPath(); ctx.arc(op.pts[0][0], op.pts[0][1], op.w / 2, 0, Math.PI * 2); ctx.fill(); }
  else { ctx.beginPath(); ctx.moveTo(op.pts[0][0], op.pts[0][1]); for (const p of op.pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.stroke(); }
  ctx.restore();
}
/** A black/white mask image (white = repaint) → an orange layer whose alpha is the white. */
function baseFromMask(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h); const px = d.data; for (let i = 0; i < px.length; i += 4) { const a = px[i]; px[i] = 0xff; px[i + 1] = 0x7a; px[i + 2] = 0x1a; px[i + 3] = a; }
  x.putImageData(d, 0, 0); return c;
}
function coverOf(c: HTMLCanvasElement): number {
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data; let on = 0, n = 0;
  for (let i = 3; i < d.length; i += 16) { n++; if (d[i] > 24) on++; } return n ? on / n : 0;
}
const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('image')); i.src = src; });
/** A saved or recreated black/white mask file → what the bar keeps (thumbnail over the photo, share painted). null when it's empty or unreadable. */
export async function maskFromFile(photo: File, mask: File): Promise<WfMask | null> {
  const pu = URL.createObjectURL(photo); const mu = URL.createObjectURL(mask);
  try { const [pi, mi] = await Promise.all([loadImg(pu), loadImg(mu)]); const [w, h] = workSize(pi.naturalWidth, pi.naturalHeight); const layer = baseFromMask(mi, Math.min(w, 512), Math.max(1, Math.round(Math.min(w, 512) * h / w)));
    const cover = coverOf(layer); if (cover === 0) { URL.revokeObjectURL(mu); return null; }
    const pk = 160 / Math.max(pi.naturalWidth, pi.naturalHeight); const pv = document.createElement('canvas'); pv.width = Math.max(1, Math.round(pi.naturalWidth * pk)); pv.height = Math.max(1, Math.round(pi.naturalHeight * pk));
    const x = pv.getContext('2d')!; x.drawImage(pi, 0, 0, pv.width, pv.height); x.globalAlpha = 0.58; x.drawImage(layer, 0, 0, pv.width, pv.height);
    return { file: mask, url: mu, preview: pv.toDataURL('image/jpeg', 0.8), cover, forPhoto: photoSig(photo) };
  } catch { URL.revokeObjectURL(mu); return null; } finally { URL.revokeObjectURL(pu); }
}
/** PNG bytes of a canvas. toDataURL, not toBlob: toBlob can be queued for a second or more in a busy tab, and Done should feel instant. */
const toBlob = async (c: HTMLCanvasElement): Promise<Blob> => { const u = c.toDataURL('image/png'); const bin = atob(u.slice(u.indexOf(',') + 1)); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: 'image/png' }); };

export default function MaskSheet({ photo, photoFile, initial, onDone, onCancel, title = 'Paint the area to change', sub = 'Only the painted area changes. Everything else stays as it is.' }: { photo: string; photoFile: File; /** the current mask (edit mask) */ initial: string | null;
  onDone: (m: WfMask | null) => void; onCancel: () => void; /** the header (Erase Object says what the paint removes) */ title?: string; sub?: string }) {
  const [nat, setNat] = useState<[number, number] | null>(null); const imgEl = useRef<HTMLImageElement | null>(null);
  const cv = useRef<HTMLCanvasElement>(null); const base = useRef<HTMLCanvasElement | null>(null);
  const [ops, setOps] = useState<Op[]>([]); const [redo, setRedo] = useState<Op[]>([]); const opsRef = useRef<Op[]>([]); opsRef.current = ops;
  const [tool, setTool] = useState<'brush' | 'erase'>('brush'); const [size, setSize] = useState(48); const [busy, setBusy] = useState(false);
  const [z, setZ] = useState(1); const [t, setT] = useState<[number, number]>([0, 0]); const [space, setSpace] = useState(false);
  const [cursor, setCursor] = useState<[number, number] | null>(null); const [empty, setEmpty] = useState(true);
  const stage = useRef<HTMLDivElement>(null); const box = useRef<HTMLDivElement>(null); const [fit, setFit] = useState<[number, number]>([0, 0]);
  const live = useRef<Op | null>(null); const pointers = useRef(new Map<number, [number, number]>()); const pinch = useRef<{ d: number; c: [number, number]; z: number; t: [number, number] } | null>(null);
  const pan = useRef<{ x: number; y: number; t: [number, number] } | null>(null); const back = useRef<HTMLElement | null>(null);

  /* load the photo (its natural size sets the export size) and the mask to edit */
  useEffect(() => { let on = true; const i = new Image(); i.onload = () => { if (!on) return; imgEl.current = i; const [w, h] = workSize(i.naturalWidth, i.naturalHeight);
    if (!initial) { base.current = null; setNat([i.naturalWidth, i.naturalHeight]); return; }
    const m = new Image(); m.onload = () => { if (!on) return; base.current = baseFromMask(m, w, h); setNat([i.naturalWidth, i.naturalHeight]); }; m.onerror = () => { if (on) setNat([i.naturalWidth, i.naturalHeight]); }; m.src = initial; };
    i.src = photo; return () => { on = false; }; }, [photo, initial]);
  const work = nat ? workSize(nat[0], nat[1]) : null;
  /* repaint from the base + the operations (undo, redo, invert, clear) */
  const render = useCallback((list: Op[]) => { const c = cv.current; if (!c) return; const x = c.getContext('2d', { willReadFrequently: true })!; x.clearRect(0, 0, c.width, c.height);
    if (base.current) x.drawImage(base.current, 0, 0); for (const op of list) apply(x, op); setEmpty(coverOf(c) === 0); }, []);
  useLayoutEffect(() => { if (work) render(ops); }, [work?.[0], work?.[1], ops, render, fit[0] > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const push = (op: Op) => { let next = [...opsRef.current, op];
    if (next.length > MAX_OPS && work) { const b = document.createElement('canvas'); b.width = work[0]; b.height = work[1]; const x = b.getContext('2d')!; if (base.current) x.drawImage(base.current, 0, 0); apply(x, next[0]); base.current = b; next = next.slice(1); }
    setOps(next); setRedo([]); };
  const undo = () => { const o = opsRef.current; if (!o.length) return; setRedo(r => [o[o.length - 1], ...r]); setOps(o.slice(0, -1)); };
  const redoOne = () => { if (!redo.length) return; setOps(o => [...o, redo[0]]); setRedo(r => r.slice(1)); };

  /* the photo fitted into the stage at zoom 1 */
  useLayoutEffect(() => { const s = stage.current; if (!s || !nat) return; const f = () => { const r = s.getBoundingClientRect(); const pad = 16; const k = Math.min((r.width - pad * 2) / nat[0], (r.height - pad * 2) / nat[1]); setFit([Math.max(1, nat[0] * k), Math.max(1, nat[1] * k)]); };
    f(); const ro = new ResizeObserver(f); ro.observe(s); return () => ro.disconnect(); }, [nat]);
  const zoomAt = (nz: number, at?: [number, number]) => { const s = stage.current; if (!s) return; nz = Math.min(Z_MAX, Math.max(Z_MIN, nz)); const r = s.getBoundingClientRect();
    const sc: [number, number] = [r.left + r.width / 2, r.top + r.height / 2]; const p = at ?? sc; const c: [number, number] = [sc[0] + t[0], sc[1] + t[1]];
    const nc: [number, number] = [p[0] - (p[0] - c[0]) * nz / z, p[1] - (p[1] - c[1]) * nz / z]; setZ(nz); setT(nz === 1 ? [0, 0] : [nc[0] - sc[0], nc[1] - sc[1]]); };
  const fitView = () => { setZ(1); setT([0, 0]); };

  /* painting: canvas coordinates from the on-screen box (the transform is in the rect) */
  const toCanvas = (cx: number, cy: number): [number, number] => { const c = cv.current!; const r = c.getBoundingClientRect(); return [(cx - r.left) * c.width / r.width, (cy - r.top) * c.height / r.height]; };
  const lineW = () => { const c = cv.current!; return size * c.width / c.getBoundingClientRect().width; };
  const drawSeg = (op: Extract<Op, { k: 'stroke' }>, from: number) => { const x = cv.current!.getContext('2d')!; apply(x, { ...op, pts: op.pts.slice(Math.max(0, from - 1)) }); };
  const down = (e: React.PointerEvent) => { if (!work || !cv.current || (e.target as Element).closest('.wfm-zoom')) return; try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* not an active pointer */ } pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.current.size === 2) { /* a second finger: zoom / pan, the stroke just started is dropped */ if (live.current) { live.current = null; render(opsRef.current); }
      const [a, b] = [...pointers.current.values()]; pinch.current = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], z, t }; return; }
    if (e.button === 1 || space || e.button === 2) { pan.current = { x: e.clientX, y: e.clientY, t }; return; }
    if (e.button !== 0) return;
    const op: Extract<Op, { k: 'stroke' }> = { k: 'stroke', erase: tool === 'erase' || e.altKey, w: lineW(), pts: [toCanvas(e.clientX, e.clientY)] }; live.current = op; drawSeg(op, 0); };
  const move = (e: React.PointerEvent) => { if (e.pointerType !== 'touch') setCursor([e.clientX, e.clientY]); if (!pointers.current.has(e.pointerId)) return; pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch.current && pointers.current.size >= 2) { const [a, b] = [...pointers.current.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); const c: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const pz = pinch.current; const nz = Math.min(Z_MAX, Math.max(Z_MIN, pz.z * d / Math.max(1, pz.d))); setZ(nz); setT(nz === 1 ? [0, 0] : [pz.t[0] + (c[0] - pz.c[0]), pz.t[1] + (c[1] - pz.c[1])]); return; }
    if (pan.current) { const p = pan.current; setT([p.t[0] + e.clientX - p.x, p.t[1] + e.clientY - p.y]); return; }
    const op = live.current; if (op?.k !== 'stroke') return; const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [e.nativeEvent]; const n0 = op.pts.length;
    for (const ev of evs.length ? evs : [e.nativeEvent]) op.pts.push(toCanvas(ev.clientX, ev.clientY)); drawSeg(op, n0); };
  const up = (e: React.PointerEvent) => { pointers.current.delete(e.pointerId); if (pointers.current.size < 2) pinch.current = null; if (pan.current) { pan.current = null; return; }
    const op = live.current; live.current = null; if (op) push(op); };
  const wheel = (e: React.WheelEvent) => { zoomAt(z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025)), [e.clientX, e.clientY]); };
  useEffect(() => { const s = stage.current; if (!s) return; const f = (e: WheelEvent) => e.preventDefault(); s.addEventListener('wheel', f, { passive: false }); return () => s.removeEventListener('wheel', f); }, []);

  const done = async () => { const c = cv.current; const img = imgEl.current; if (!c || !nat || !img || busy) return; const cover = coverOf(c); if (cover === 0) { onDone(null); return; }
    setBusy(true); try {
      const k = Math.min(1, Math.sqrt(EXPORT_MAX_PX / (nat[0] * nat[1]))); const W = Math.max(1, Math.round(nat[0] * k)), H = Math.max(1, Math.round(nat[1] * k));
      const white = document.createElement('canvas'); white.width = c.width; white.height = c.height; const wx = white.getContext('2d')!; wx.drawImage(c, 0, 0); wx.globalCompositeOperation = 'source-in'; wx.fillStyle = '#fff'; wx.fillRect(0, 0, white.width, white.height);
      const o = document.createElement('canvas'); o.width = W; o.height = H; const ox = o.getContext('2d')!; ox.fillStyle = '#000'; ox.fillRect(0, 0, W, H); ox.imageSmoothingQuality = 'high'; ox.drawImage(white, 0, 0, W, H);
      const blob = await toBlob(o); const file = new File([blob], 'mask.png', { type: 'image/png' });
      const pk = 160 / Math.max(nat[0], nat[1]); const pv = document.createElement('canvas'); pv.width = Math.max(1, Math.round(nat[0] * pk)); pv.height = Math.max(1, Math.round(nat[1] * pk)); const px = pv.getContext('2d')!;
      px.drawImage(img, 0, 0, pv.width, pv.height); px.globalAlpha = 0.58; px.drawImage(c, 0, 0, pv.width, pv.height);
      onDone({ file, url: URL.createObjectURL(file), preview: pv.toDataURL('image/jpeg', 0.8), cover, forPhoto: photoSig(photoFile) });
    } catch { setBusy(false); } };

  /* keys: B brush, E erase, [ ] size, ⌘Z / ⇧⌘Z undo / redo, I invert, 0 fit, + / − zoom, Space-drag pan, Esc cancel, Enter done */
  useEffect(() => { const kd = (e: KeyboardEvent) => { const tg = e.target as HTMLElement | null; if (tg && /^(INPUT|TEXTAREA)$/.test(tg.tagName) && (tg as HTMLInputElement).type !== 'range') return;
      const mod = e.metaKey || e.ctrlKey; const k = e.key.toLowerCase();
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redoOne(); else undo(); return; } if (mod && k === 'y') { e.preventDefault(); redoOne(); return; } if (mod) return;
      if (k === 'escape') { e.preventDefault(); e.stopPropagation(); onCancel(); } else if (k === 'enter' && !(tg && tg.tagName === 'BUTTON')) { e.preventDefault(); void done(); }
      else if (k === 'b') setTool('brush'); else if (k === 'e') setTool('erase'); else if (k === '[') setSize(s => Math.max(SIZE_MIN, Math.round(s / 1.25))); else if (k === ']') setSize(s => Math.min(SIZE_MAX, Math.round(s * 1.25)));
      else if (k === 'i') push({ k: 'invert' }); else if (k === '0') fitView(); else if (k === '+' || k === '=') zoomAt(z * 1.25); else if (k === '-') zoomAt(z / 1.25);
      else if (k === ' ' && !(tg && tg.tagName === 'BUTTON')) { e.preventDefault(); setSpace(true); } };
    const ku = (e: KeyboardEvent) => { if (e.key === ' ') setSpace(false); };
    addEventListener('keydown', kd, true); addEventListener('keyup', ku); return () => { removeEventListener('keydown', kd, true); removeEventListener('keyup', ku); }; });
  /* focus moves into the sheet and comes back to what opened it */
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => { back.current = document.activeElement as HTMLElement | null; sheet.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(); const b = back.current; return () => { requestAnimationFrame(() => { const t = b?.isConnected && b !== document.body ? b : document.querySelector<HTMLElement>('[data-testid=wf-mask-edit],[data-testid=wf-mask-paint]'); t?.focus?.(); }); }; }, []); /* the Paint mask button becomes Edit mask after Done: focus lands there */
  const trap = (e: React.KeyboardEvent) => { if (e.key !== 'Tab') return; const f = [...(sheet.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,[tabindex="0"]') ?? [])]; if (!f.length) return;
    const i = f.indexOf(document.activeElement as HTMLElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } };

  const changed = ops.length > 0; const cur = cursor && stage.current && !pan.current && !space ? cursor : null;
  return createPortal(<div className="wfm-back" data-testid="wf-mask-sheet" onPointerDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
    <div ref={sheet} className="wfm" role="dialog" aria-modal="true" aria-labelledby="wfm-title" onKeyDown={trap}>
      <header className="wfm-h"><div><h2 id="wfm-title">{title}</h2><p>{sub}</p></div>
        <button type="button" className="wfm-x" aria-label="Close without saving" {...tip('Close (Esc)')} onClick={onCancel}><CloseIcon size={16} /></button></header>
      <div ref={stage} className={`wfm-stage${space || pan.current ? ' panning' : ''}`} onWheel={wheel} onContextMenu={e => e.preventDefault()} data-testid="wf-mask-stage"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={() => setCursor(null)}>
        {nat && fit[0] > 0 ? <div ref={box} className="wfm-world" style={{ width: fit[0], height: fit[1], transform: `translate(${t[0]}px, ${t[1]}px) scale(${z})` }}>
          <img src={photo} alt="Your photo" draggable={false} />
          <canvas ref={cv} width={work![0]} height={work![1]} className="wfm-cv" data-testid="wf-mask-canvas" />
        </div> : <p className="wfm-load">Loading the photo…</p>}
        {cur && <i className="wfm-cursor" aria-hidden style={{ left: cur[0], top: cur[1], width: size, height: size, borderStyle: tool === 'erase' ? 'dashed' : 'solid' }} />}
        <div className="wfm-zoom" role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" {...tip('Zoom out (−)')} onClick={() => zoomAt(z / 1.25)} disabled={z <= Z_MIN}><MinusIcon size={14} /></button>
          <span data-testid="wf-mask-zoom">{Math.round(z * 100)}%</span>
          <button type="button" aria-label="Zoom in" {...tip('Zoom in (+). Scroll to zoom, Space-drag to move')} onClick={() => zoomAt(z * 1.25)} disabled={z >= Z_MAX}><PlusIcon size={14} /></button>
          <button type="button" aria-label="Fit the photo" {...tip('Fit (0)')} onClick={fitView} disabled={z === 1}><FitIcon size={14} /></button></div>
      </div>
      <footer className="wfm-tools" role="toolbar" aria-label="Mask tools">
        <div className="wfm-seg" role="radiogroup" aria-label="Tool">
          <button type="button" role="radio" aria-checked={tool === 'brush'} className={tool === 'brush' ? 'on' : ''} data-autofocus data-testid="wf-mask-brush" {...tip('Brush (B)')} onClick={() => setTool('brush')}><BrushIcon size={15} /><span>Brush</span></button>
          <button type="button" role="radio" aria-checked={tool === 'erase'} className={tool === 'erase' ? 'on' : ''} data-testid="wf-mask-erase" {...tip('Erase (E, or hold Alt)')} onClick={() => setTool('erase')}><EraserIcon size={15} /><span>Erase</span></button></div>
        <label className="wfm-size"><span>Size</span><input type="range" min={SIZE_MIN} max={SIZE_MAX} value={size} onChange={e => setSize(+e.target.value)} aria-label="Brush size" data-testid="wf-mask-size" /><b>{size}</b></label>
        <div className="wfm-acts">
          <button type="button" aria-label="Undo" {...tip(ops.length ? `Undo (⌘Z) · ${ops.length} step${ops.length > 1 ? 's' : ''}` : 'Nothing to undo')} onClick={undo} disabled={!ops.length} data-testid="wf-mask-undo"><UndoIcon size={15} /></button>
          <button type="button" aria-label="Redo" {...tip(redo.length ? 'Redo (⇧⌘Z)' : 'Nothing to redo')} onClick={redoOne} disabled={!redo.length} data-testid="wf-mask-redo"><RedoIcon size={15} /></button>
          <button type="button" aria-label="Invert the mask" {...tip('Invert: paint everything except this (I)')} onClick={() => push({ k: 'invert' })} data-testid="wf-mask-invert"><InvertIcon size={15} /><span>Invert</span></button>
          <button type="button" aria-label="Clear the mask" {...tip('Clear')} onClick={() => push({ k: 'clear' })} disabled={empty} data-testid="wf-mask-clear"><TrashIcon size={15} /><span>Clear</span></button></div>
        <div className="wfm-end">
          <button type="button" className="btn wfm-cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary wfm-done" onClick={() => void done()} disabled={busy || !nat} data-testid="wf-mask-done">{busy ? 'Saving…' : empty && (changed || initial) ? 'Done · no mask' : 'Done'}</button></div>
      </footer>
    </div>
  </div>, document.body);
}
