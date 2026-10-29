import { useRef, useState } from 'react';
/** B21 (T25): before/after for images. Drag (mouse or touch) or arrow keys move the divider; the box keeps the output's aspect. */
export default function ImageCompare({ before, after, aspect, labels = ['Before', 'After'], kind = 'image' }: { before: string; after: string; aspect?: string; labels?: [string, string]; /** 'video' draws two muted looping players under the same slider */ kind?: 'image' | 'video' }) {
  const [pos, setPos] = useState(50); const box = useRef<HTMLDivElement>(null); const drag = useRef(false);
  const move = (x: number) => { const r = box.current?.getBoundingClientRect(); if (r && r.width) setPos(Math.max(0, Math.min(100, ((x - r.left) / r.width) * 100))); };
  return <div ref={box} className="imc" data-testid="image-compare" style={{ aspectRatio: aspect ?? '4 / 3' }}
    onPointerDown={e => { drag.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); move(e.clientX); }} onPointerMove={e => { if (drag.current) move(e.clientX); }} onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}>
    {kind === 'video' ? <>
      <video className="imc-img" src={after} muted loop playsInline preload="metadata" aria-label={labels[1]} />
      <video className="imc-img imc-before" src={before} muted loop playsInline preload="metadata" aria-label={labels[0]} style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
    </> : <>
      <img className="imc-img" src={after} alt={labels[1]} draggable={false} />
      <img className="imc-img imc-before" src={before} alt={labels[0]} draggable={false} style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
    </>}
    <span className="imc-tag imc-tag-l">{labels[0]}</span><span className="imc-tag imc-tag-r">{labels[1]}</span>
    <span className="imc-bar" style={{ left: `${pos}%` }} role="slider" tabIndex={0} aria-label="Before and after divider" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pos)} data-testid="image-compare-handle"
      onKeyDown={e => { if (e.key === 'ArrowLeft') { e.preventDefault(); setPos(p => Math.max(0, p - 5)); } if (e.key === 'ArrowRight') { e.preventDefault(); setPos(p => Math.min(100, p + 5)); } }}><i aria-hidden /></span>
  </div>;
}
