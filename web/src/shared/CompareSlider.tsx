import type React from 'react';
import { useEffect, useRef, useState } from 'react';
type View = 'side' | 'slider' | 'after';
export default function CompareSlider({ before, after, watermark, aspect }: { before: string; after: string; watermark: boolean; aspect?: string }) {
  const sz = aspect ? { aspectRatio: aspect } : undefined;
  /* Box width from the aspect, so an overlay (shrink-to-fit) doesn't start at the video's 300 px default and jump when it loads. */
  const arn = aspect ? (([w, h]) => w > 0 && h > 0 ? w / h : 0)(aspect.split('/').map(Number)) : 0;
  const box0 = arn ? ({ ['--arn' as any]: arn.toFixed(4) } as React.CSSProperties) : undefined;
  const [pos, setPos] = useState(0);
  const [view, setView] = useState<View>('slider');
  const box = useRef<HTMLDivElement>(null);
  const a = useRef<HTMLVideoElement>(null), b = useRef<HTMLVideoElement>(null);
  const drag = useRef(false);
  // auto-sweep left→right once on open (spec §7)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setPos(50); return; }
    let p = 0; const t = setInterval(() => { p += 2; setPos(Math.min(p, 100)); if (p >= 100) { clearInterval(t); setTimeout(() => setPos(50), 300); } }, 16);
    return () => clearInterval(t);
  }, []);
  // keep "after" synced to "before" (master, carries the original audio)
  useEffect(() => {
    const m = a.current, s = b.current; if (!m || !s) return;
    const sync = () => { if (Math.abs(s.currentTime - m.currentTime) > 0.08) s.currentTime = m.currentTime; m.paused ? s.pause() : s.play().catch(() => {}); };
    ['play','pause','seeked','timeupdate'].forEach(e => m.addEventListener(e, sync));
    return () => ['play','pause','seeked','timeupdate'].forEach(e => m.removeEventListener(e, sync));
  }, [view]);
  const move = (x: number) => { const r = box.current!.getBoundingClientRect(); setPos(Math.max(0, Math.min(100, ((x - r.left) / r.width) * 100))); };
  const wm = watermark && <span className="wm">Made with Imagination Is All You Need</span>;
  return (
    <div className="cmp-wrap" style={box0}>
      <div className="seg" style={{ marginBottom: 12 }}>
        {(['side','slider','after'] as View[]).map(v => <button key={v} className={view===v?'on':''} onClick={() => setView(v)}>{v==='side'?'Side by side':v==='slider'?'Slider':'After only'}</button>)}
      </div>
      {view === 'side' && <div className="sbs"><video ref={a} src={before} controls loop playsInline /><video ref={b} src={after} muted loop playsInline /></div>}
      {view === 'after' && <div className="compare"><video ref={a} src={after} controls loop playsInline style={sz} />{wm}</div>}
      {view === 'slider' && (
        <div className="compare" ref={box} tabIndex={0} aria-label="Before/after slider"
          onKeyDown={e => { if (e.key==='ArrowLeft') setPos(p => Math.max(0,p-5)); if (e.key==='ArrowRight') setPos(p => Math.min(100,p+5)); }}
          onPointerDown={e => { drag.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); move(e.clientX); }}
          onPointerMove={e => drag.current && move(e.clientX)} onPointerUp={() => (drag.current = false)}>
          <video ref={a} src={before} loop playsInline autoPlay muted={false} style={sz} />
          <video ref={b} className="after" src={after} muted loop playsInline style={{ clipPath: `inset(0 0 0 ${pos}%)` }} />
          <span className="tag" style={{ left: 12 }}>Before</span><span className="tag" style={{ right: 12 }}>After</span>
          <div className="handle-track" style={{ transform: `translateX(${pos}%)` }}><div className="handle" style={{ left: 0 }} /></div>{wm}
        </div>)}
      <div className="row" style={{ marginTop: 8 }}>
        {view==='slider' && <button className="btn" onClick={() => { const v=a.current!; v.paused?v.play():v.pause(); }}>Play / Pause</button>}
      </div>
    </div>
  );
}
