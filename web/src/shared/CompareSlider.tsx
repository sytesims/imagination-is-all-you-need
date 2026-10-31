import type React from 'react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { prefersReducedMotion } from './HoverClip';
import './compareFrame.css';

/**
 * CompareFrame (shared): the before / after drag slider. `before` fills the box, `after` sits on top, cut at the line (after on the right).
 * Drag or click anywhere to move the line, ← → (Home / End) on the focused knob. Corner labels at the top. Touch: pan-y, so the page still
 * scrolls past it. `intro`: 'sweep' runs the line left to right once on mount, then parks it at 50% (ResultView); 'nudge' moves it 15 points left of `start` and
 * back once, the first time the box is mostly in view (Explore); neither under reduced motion. Used by CompareSlider (ResultView) and
 * Explore's swap section.
 */
export function CompareFrame({ before, after, labels = ['Before', 'After'], className = '', style, intro, start = 50, testId, children }: {
  before: ReactNode; after: ReactNode; labels?: [string, string]; className?: string; style?: React.CSSProperties;
  intro?: 'sweep' | 'nudge'; /** where the line rests, in % from the left */ start?: number; testId?: string; /** extra overlays (a watermark) */ children?: ReactNode;
}) {
  const [pos, setPos] = useState(intro === 'sweep' && !prefersReducedMotion() ? 0 : start);
  const [easing, setEasing] = useState(false);
  const box = useRef<HTMLDivElement>(null); const drag = useRef(false); const timers = useRef<number[]>([]);
  const stopIntro = () => { timers.current.forEach((t) => { clearTimeout(t); clearInterval(t); }); timers.current = []; setEasing(false); };
  useEffect(() => {
    if (!intro || prefersReducedMotion()) return;
    if (intro === 'sweep') {
      let p = 0; const t = window.setInterval(() => { p += 2; setPos(Math.min(p, 100)); if (p >= 100) { clearInterval(t); timers.current.push(window.setTimeout(() => setPos(50), 300)); } }, 16);
      timers.current.push(t); return stopIntro;
    }
    const el = box.current; if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return; io.disconnect(); setEasing(true);
      timers.current.push(window.setTimeout(() => setPos(start - 15), 400), window.setTimeout(() => setPos(start), 1200), window.setTimeout(() => setEasing(false), 2000));
    }, { threshold: 0.6 });
    io.observe(el); return () => { io.disconnect(); stopIntro(); };
  }, [intro]); // eslint-disable-line react-hooks/exhaustive-deps
  const move = (x: number) => { const r = box.current?.getBoundingClientRect(); if (r && r.width) setPos(Math.max(0, Math.min(100, ((x - r.left) / r.width) * 100))); };
  const key = (e: React.KeyboardEvent) => {
    const to = e.key === 'ArrowLeft' ? (p: number) => p - 5 : e.key === 'ArrowRight' ? (p: number) => p + 5 : e.key === 'Home' ? () => 0 : e.key === 'End' ? () => 100 : null;
    if (!to) return; e.preventDefault(); stopIntro(); setPos((p) => Math.max(0, Math.min(100, to(p))));
  };
  return <div ref={box} className={`cmpf${easing ? ' is-easing' : ''}${className ? ` ${className}` : ''}`} style={style} data-testid={testId}
    onPointerDown={(e) => { if (e.button > 0) return; stopIntro(); drag.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); move(e.clientX); }}
    onPointerMove={(e) => { if (drag.current) move(e.clientX); }} onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}>
    {before}
    <div className="cmpf-after" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>{after}</div>
    <span className="cmpf-tag cmpf-tag-l">{labels[0]}</span><span className="cmpf-tag cmpf-tag-r">{labels[1]}</span>
    <div className="cmpf-track" style={{ transform: `translateX(${pos}%)` }}>
      <span className="cmpf-bar" role="slider" tabIndex={0} aria-label={`${labels[0]} and ${labels[1]} divider`} aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.round(pos)} onKeyDown={key} data-testid={testId ? `${testId}-handle` : undefined}><i aria-hidden>‹ ›</i></span>
    </div>
    {children}
  </div>;
}

type View = 'side' | 'slider' | 'after';
export default function CompareSlider({ before, after, watermark, aspect }: { before: string; after: string; watermark: boolean; aspect?: string }) {
  const sz = aspect ? { aspectRatio: aspect } : undefined;
  /* Box width from the aspect, so an overlay (shrink-to-fit) doesn't start at the video's 300 px default and jump when it loads. */
  const arn = aspect ? (([w, h]) => w > 0 && h > 0 ? w / h : 0)(aspect.split('/').map(Number)) : 0;
  const box0 = arn ? ({ ['--arn' as any]: arn.toFixed(4) } as React.CSSProperties) : undefined;
  const [view, setView] = useState<View>('slider');
  const a = useRef<HTMLVideoElement>(null), b = useRef<HTMLVideoElement>(null);
  // keep "after" synced to "before" (master, carries the original audio)
  useEffect(() => {
    const m = a.current, s = b.current; if (!m || !s) return;
    const sync = () => { if (Math.abs(s.currentTime - m.currentTime) > 0.08) s.currentTime = m.currentTime; m.paused ? s.pause() : s.play().catch(() => {}); };
    ['play','pause','seeked','timeupdate'].forEach(e => m.addEventListener(e, sync));
    return () => ['play','pause','seeked','timeupdate'].forEach(e => m.removeEventListener(e, sync));
  }, [view]);
  const wm = watermark && <span className="wm">Made with Imagination Is All You Need</span>;
  return (
    <div className="cmp-wrap" style={box0}>
      <div className="seg" style={{ marginBottom: 12 }}>
        {(['side','slider','after'] as View[]).map(v => <button key={v} className={view===v?'on':''} onClick={() => setView(v)}>{v==='side'?'Side by side':v==='slider'?'Slider':'After only'}</button>)}
      </div>
      {view === 'side' && <div className="sbs"><video ref={a} src={before} controls loop playsInline /><video ref={b} src={after} muted loop playsInline /></div>}
      {view === 'after' && <div className="compare"><video ref={a} src={after} controls loop playsInline style={sz} />{wm}</div>}
      {view === 'slider' && <CompareFrame className="compare" intro="sweep"
        before={<video ref={a} src={before} loop playsInline autoPlay muted={false} style={sz} />}
        after={<video ref={b} className="after" src={after} muted loop playsInline />}>{wm}</CompareFrame>}
      <div className="row" style={{ marginTop: 8 }}>
        {view==='slider' && <button className="btn" onClick={() => { const v=a.current!; v.paused?v.play():v.pause(); }}>Play / Pause</button>}
      </div>
    </div>
  );
}
