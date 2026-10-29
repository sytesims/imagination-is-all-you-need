import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import SplitPreview from './SplitPreview';
import { tip } from './Tooltip';
import { CompareIcon } from '../ui/Icons';
/**
 * An image result on the viewer's stage, with zoom and pan, and (when the job has a source photo: upscales, edits, relights, swaps)
 * a Compare toggle that shows the source and the result in a sticky split (moved from the old Upscale page, 2026-10-22).
 * Wheel / pinch zooms about the pointer, drag pans while zoomed, double-click toggles fit ⇄ 100 % pixels. Esc and ←/→ stay the viewer's.
 * Unobtrusive: two small glass buttons at the stage's bottom left; nothing changes until they are used.
 */
export function ViewerImage({ src, before, alt, className, style, onLoad, beforeLabel = 'Before', afterLabel = 'After', compare, onCompare, compareWhy, compareName = 'the original' }: {
  /** what Compare compares with, in its label ("your photo" for Camera Angles and Character Sheet) */ compareName?: string;
  /** why Compare can't run (the source photo is gone): the button shows, disabled, with this reason */ compareWhy?: string;
  /** controlled Compare (the side panel's Input → Output arrow shares it); left out, the image keeps its own */ compare?: boolean; onCompare?: (on: boolean) => void;
  src: string; /** the job's source photo (null: no Compare) */ before: string | null; alt: string; className: string; style?: React.CSSProperties;
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void; beforeLabel?: string; afterLabel?: string;
}) {
  const box = useRef<HTMLDivElement>(null); const img = useRef<HTMLElement | null>(null);
  const [k, setK] = useState(1); const [t, setT] = useState({ x: 0, y: 0 }); const [cmpOwn, setCmpOwn] = useState(false);
  const cmp = compare ?? cmpOwn; const setCmp = (f: boolean | ((c: boolean) => boolean)) => { const v = typeof f === 'function' ? f(cmp) : f; if (onCompare) onCompare(v); else setCmpOwn(v); };
  const src0 = useRef(src); /* a new image drops zoom and Compare; the first mount keeps a Compare turned on from the panel */
  useEffect(() => { if (src0.current === src) return; src0.current = src; setK(1); setT({ x: 0, y: 0 }); setCmp(false); }, [src]); // eslint-disable-line react-hooks/exhaustive-deps
  const kRef = useRef(1); kRef.current = k; const zoomed = k > 1.001;
  const clampT = (x: number, y: number, kk: number) => { const el = img.current; if (!el) return { x: 0, y: 0 }; const w = el.offsetWidth, h = el.offsetHeight; const mx = Math.max(0, (w * kk - w) / 2), my = Math.max(0, (h * kk - h) / 2); return { x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) }; };
  /** zoom to nk about a point (cx, cy) measured from the image's centre */
  const zoomAt = (nk: number, cx: number, cy: number) => { const z = Math.max(1, Math.min(8, nk)); const k0 = kRef.current; kRef.current = z <= 1.001 ? 1 : z; if (z <= 1.001) { setK(1); setT({ x: 0, y: 0 }); return; } const r = z / k0; setT(p => clampT(cx - (cx - p.x) * r, cy - (cy - p.y) * r, z)); setK(z); };
  const centre = (e: { clientX: number; clientY: number }) => { const r = box.current!.getBoundingClientRect(); return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2] as const; };
  /* the wheel zooms (non-passive, so the page doesn't scroll) */
  useEffect(() => { const el = box.current; if (!el) return; const f = (e: WheelEvent) => { if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) { e.preventDefault(); const [cx, cy] = centre(e); zoomRef.current(e.deltaY, cx, cy); } }; el.addEventListener('wheel', f, { passive: false }); return () => el.removeEventListener('wheel', f); }, []);
  const zoomRef = useRef((_d: number, _x: number, _y: number) => undefined as void); zoomRef.current = (d, cx, cy) => zoomAt(kRef.current * Math.exp(-d * 0.0015), cx, cy);
  const ptrs = useRef(new Map<number, { x: number; y: number }>()); const pinch = useRef<{ d: number; k: number } | null>(null); const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const onDown = (e: RPointerEvent) => { if (cmp && e.pointerType !== 'touch') return; ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2) { const [a, b] = [...ptrs.current.values()]; pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), k }; drag.current = null; }
    else if (zoomed && !cmp) { drag.current = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } };
  const onMove = (e: RPointerEvent) => { if (!ptrs.current.has(e.pointerId)) return; ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && ptrs.current.size === 2) { const [a, b] = [...ptrs.current.values()]; const [cx, cy] = centre({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }); zoomAt(pinch.current.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.d, cx, cy); return; }
    if (drag.current) setT(clampT(drag.current.tx + e.clientX - drag.current.x, drag.current.ty + e.clientY - drag.current.y, k)); };
  const onUp = (e: RPointerEvent) => { ptrs.current.delete(e.pointerId); if (ptrs.current.size < 2) pinch.current = null; if (!ptrs.current.size) drag.current = null; };
  /** 100 % = one image pixel per screen pixel (at least 2× when the image already shows at full size) */
  const full = () => { const el = img.current as HTMLImageElement | null; const nw = (el as any)?.naturalWidth || 0; const w = el?.offsetWidth || 1; return Math.max(2, nw / w); };
  const onDbl = (e: React.MouseEvent) => { if (cmp) return; const [cx, cy] = centre(e); if (zoomed) zoomAt(1, 0, 0); else zoomAt(full(), cx, cy); };
  const shown = Math.round(k * 100);
  return <div ref={box} className={`rvx-zoom${zoomed ? ' is-zoomed' : ''}${cmp ? ' is-compare' : ''}`} data-testid="rvx-zoom" data-zoom={shown}
    onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={onDbl}>
    <div className="rvx-zoom-in" style={{ transform: zoomed ? `translate(${t.x}px, ${t.y}px) scale(${k})` : undefined }}>
      {cmp && before ? <div ref={el => { img.current = el; }} className={`${className} rvx-cmp`} style={style}>
          <SplitPreview before={before} after={src} beforeLabel={beforeLabel} afterLabel={afterLabel} sticky initial={50} className="rvx-split" testId="rvx-compare" /></div>
        : <img ref={el => { img.current = el; }} className={className} style={style} src={src} alt={alt} data-testid="rvx-img" draggable={false} onLoad={onLoad} />}
    </div>
    <div className="rvx-ztools" role="toolbar" aria-label="View">
      {!before && compareWhy && <button type="button" className="rvx-tool rvx-ztool is-off" aria-disabled="true" aria-label={`Compare unavailable: ${compareWhy}`} {...tip(`Compare unavailable: ${compareWhy}`)} data-testid="rvx-compare-toggle"><CompareIcon size={16} /><span>Compare</span></button>}
      {before && <button type="button" className={`rvx-tool rvx-ztool${cmp ? ' on' : ''}`} aria-pressed={cmp} aria-label={`Compare with ${compareName}`} {...tip(cmp ? 'Back to the result' : `Compare with ${compareName}: drag the divider`)} onClick={() => setCmp(c => !c)} data-testid="rvx-compare-toggle"><CompareIcon size={16} /><span>Compare</span></button>}
      <button type="button" className="rvx-tool rvx-ztool" aria-label={zoomed ? 'Fit to screen' : 'Zoom to 100%'} {...tip(zoomed ? 'Fit (double-click)' : 'Zoom in (scroll or double-click)')} onClick={() => (zoomed ? zoomAt(1, 0, 0) : zoomAt(full(), 0, 0))} data-testid="rvx-zoom-btn"><span>{zoomed ? `${shown}%` : 'Fit'}</span></button>
    </div>
  </div>;
}
