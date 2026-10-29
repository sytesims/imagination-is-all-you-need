import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
/**
 * Before / after split preview (Workflows cards, 2026-10-22). The "after" image fills the box; the "before" image is clipped to the
 * left of a vertical divider. Mouse / pen: the divider follows the pointer while hovering. Touch: drag it (vertical scroll still
 * works: touch-action pan-y). Keyboard: it is a slider; arrow keys move it, Home / End jump to the ends. Leaving (pointer out, blur)
 * snaps it back to the middle; the snap animates unless the user asked for reduced motion (CSS).
 *
 * Optional (Upscale page, 2026-10-22; the defaults keep the card behaviour above):
 *  - sticky: the divider moves only while dragged (any pointer) or by keyboard, and STAYS where it was left (no hover-follow, no snap back).
 *  - auto: the divider sweeps slowly by itself until the pointer is over it (a demo); off under reduced motion.
 *  - initial: the starting position in % (default 50).
 *  - eager: load both images now (a hero above the fold); otherwise they load lazily.
 * A missing image hides itself (the box's own fill shows) instead of a broken-image icon.
 */
export interface SplitPreviewProps { before: string; after: string; beforeLabel?: string; afterLabel?: string; className?: string; testId?: string; sticky?: boolean; auto?: boolean; initial?: number; eager?: boolean }
const MID = 50; const STEP = 5;
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const hide = (e: { currentTarget: HTMLImageElement }) => { e.currentTarget.style.visibility = 'hidden'; };
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function SplitPreview({ before, after, beforeLabel = 'Before', afterLabel = 'After', className, testId, sticky = false, auto = false, initial = MID, eager = false }: SplitPreviewProps) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(clamp(initial)); const [live, setLive] = useState(false); // live = following a pointer (no snap transition)
  const [sweeping, setSweeping] = useState(false);
  const fromEvent = (e: PointerEvent) => { const r = box.current?.getBoundingClientRect(); if (!r || !r.width) return; setPos(clamp(((e.clientX - r.left) / r.width) * 100)); };
  const reset = () => { setLive(false); if (!sticky) setPos(MID); };
  const onMove = (e: PointerEvent) => { const held = !!box.current?.hasPointerCapture(e.pointerId); if ((sticky || e.pointerType === 'touch') && !held) { if (auto) setLive(true); return; } setLive(true); fromEvent(e); };
  const onDown = (e: PointerEvent) => { if (sticky || e.pointerType === 'touch') { box.current?.setPointerCapture(e.pointerId); setLive(true); fromEvent(e); } };
  const onUp = (e: PointerEvent) => { if (sticky || e.pointerType === 'touch') { if (box.current?.hasPointerCapture(e.pointerId)) box.current.releasePointerCapture(e.pointerId); if (sticky) setLive(false); else reset(); } };
  const onKey = (e: KeyboardEvent) => {
    const k = e.key; const by: ((p: number) => number) | null = k === 'ArrowLeft' || k === 'ArrowDown' ? (p) => p - STEP : k === 'ArrowRight' || k === 'ArrowUp' ? (p) => p + STEP
      : k === 'Home' ? () => 0 : k === 'End' ? () => 100 : k === 'PageDown' ? (p) => p - 25 : k === 'PageUp' ? (p) => p + 25 : null;
    if (!by) return; e.preventDefault(); setLive(false); setPos((p) => clamp(by(p)));
  };
  /* auto: a slow sweep (20% ↔ 80%) while nobody is pointing at it */
  useEffect(() => {
    if (!auto || live || reducedMotion()) { setSweeping(false); return; }
    let raf = 0; const t0 = performance.now(); setSweeping(true);
    const tick = (t: number) => { setPos(50 + 30 * Math.sin(((t - t0) / 4200) * Math.PI * 2)); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [auto, live]);
  const p = Math.round(pos);
  return <div ref={box} className={`splitp ${live ? 'is-live' : ''} ${sweeping ? 'is-auto' : ''} ${sticky ? 'is-sticky' : ''} ${className ?? ''}`} data-testid={testId} style={{ ['--split' as any]: `${pos}%` }}
    role="slider" tabIndex={0} aria-label={`Compare ${beforeLabel} and ${afterLabel}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p}
    aria-valuetext={`${p}% ${beforeLabel}, ${100 - p}% ${afterLabel}`} aria-orientation="horizontal"
    onPointerMove={onMove} onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={(e) => { if (e.pointerType !== 'touch' && !(sticky && box.current?.hasPointerCapture(e.pointerId))) reset(); }} onFocus={() => { if (auto) setLive(true); }} onBlur={() => { if (!sticky) reset(); else if (auto) setLive(false); }} onKeyDown={onKey}>
    <img className="splitp-img splitp-after" src={after} alt="" aria-hidden draggable={false} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={hide} />
    <img className="splitp-img splitp-before" src={before} alt="" aria-hidden draggable={false} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={hide} />
    <span className="splitp-line" aria-hidden><span className="splitp-knob" /></span>
    <span className="splitp-label splitp-l" aria-hidden>{beforeLabel}</span>
    <span className="splitp-label splitp-r" aria-hidden>{afterLabel}</span>
  </div>;
}
