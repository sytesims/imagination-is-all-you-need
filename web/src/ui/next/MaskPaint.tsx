import { useEffect, useRef, useState } from 'react';
/** (e) Mask-paint editor for inpainting: brush, eraser, size, clear, overlay. onChange gets a black/white PNG data URL (white = repaint). */
export default function MaskPaint({ src, onChange }: { src: string; onChange?: (maskPng: string | null) => void }) {
  const cv = useRef<HTMLCanvasElement>(null); const [tool, setTool] = useState<'brush' | 'eraser'>('brush'); const [size, setSize] = useState(40); const [overlay, setOverlay] = useState(true);
  const [dims, setDims] = useState<[number, number] | null>(null); const drawing = useRef(false); const last = useRef<[number, number] | null>(null);
  useEffect(() => { const i = new Image(); i.onload = () => setDims([i.naturalWidth, i.naturalHeight]); i.src = src; }, [src]);
  const pt = (e: React.PointerEvent): [number, number] => { const c = cv.current!, r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
  const line = (a: [number, number], b: [number, number]) => { const c = cv.current!, x = c.getContext('2d')!; const k = c.width / c.getBoundingClientRect().width;
    x.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'; x.strokeStyle = 'rgba(255,60,90,1)'; x.lineCap = 'round'; x.lineJoin = 'round'; x.lineWidth = size * k; x.beginPath(); x.moveTo(...a); x.lineTo(...b); x.stroke(); };
  const emit = () => { const c = cv.current!; const o = document.createElement('canvas'); o.width = c.width; o.height = c.height; const x = o.getContext('2d')!; x.fillStyle = '#000'; x.fillRect(0, 0, o.width, o.height);
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data; let any = false; for (let i = 3; i < d.length; i += 4) if (d[i]) { any = true; break; }
    if (!any) return onChange?.(null); x.globalCompositeOperation = 'source-over'; x.filter = 'brightness(0) invert(1)'; x.drawImage(c, 0, 0); onChange?.(o.toDataURL('image/png')); };
  const clear = () => { const c = cv.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); onChange?.(null); };
  return <div className="maskpaint">
    <div className="mk-tools" role="toolbar" aria-label="Mask tools">
      <div className="seg">{(['brush', 'eraser'] as const).map(t => <button key={t} className={tool === t ? 'on' : ''} aria-pressed={tool === t} onClick={() => setTool(t)}>{t === 'brush' ? '🖌 Brush' : '⌫ Eraser'}</button>)}</div>
      <label className="mk-size">Size<input type="range" min={4} max={160} value={size} onChange={e => setSize(+e.target.value)} /><output>{size}</output></label>
      <label className="mk-ov"><input type="checkbox" checked={overlay} onChange={e => setOverlay(e.target.checked)} /> Show mask</label>
      <button className="btn btn-sm" onClick={clear}>Clear</button>
    </div>
    <div className="mk-stage" style={dims ? { aspectRatio: `${dims[0]}/${dims[1]}` } : undefined}>
      <img src={src} alt="" draggable={false} />
      {dims && <canvas ref={cv} width={dims[0]} height={dims[1]} className={`mk-canvas ${overlay ? '' : 'hide'} ${tool}`} style={{ ['--brush' as any]: `${size}px` }}
        onPointerDown={e => { (e.target as Element).setPointerCapture(e.pointerId); drawing.current = true; const p = pt(e); last.current = p; line(p, p); }}
        onPointerMove={e => { if (!drawing.current) return; const p = pt(e); line(last.current!, p); last.current = p; }}
        onPointerUp={() => { drawing.current = false; emit(); }} onPointerCancel={() => { drawing.current = false; }} />}
    </div>
    <p className="helper">Paint over what should change. Everything else stays as it is.</p>
  </div>;
}
