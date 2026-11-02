/**
 * Trim sheet (2026-11-03): pick the part of a clip a video tool uses. One shared trimmer for every tool with a clip (the Video page's bar opens it
 * from the clip thumbnail); each tool and model passes its own shortest and longest range (server clipTrim.ts → GET /api/tools providers[].clipSec),
 * never a number of its own.
 *
 * A large preview frame, a time ruler, a filmstrip, the clip's sound wave and a window with two handles. The window follows the one handle rule
 * TrimRange uses (moveTrim): at least min, at most max, inside the clip. Drag a handle or the window; arrow keys nudge (Shift: 5 s). Play loops the
 * chosen part. Done shows the live price (the same quote Generate shows). Esc or Done closes; the range applies as you drag.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { moveTrim, clock, type Trim } from './TrimRange';
import { PlayIcon, PauseIcon, CloseIcon } from '../ui/Icons';
import './trimSheet.css';

const FRAMES = new Map<string, Promise<string[]>>();
/** N frames across the clip, as small JPEGs (once per clip). */
function framesOf(url: string, D: number, n: number): Promise<string[]> {
  const k = `${url}|${n}`; const hit = FRAMES.get(k); if (hit) return hit;
  const p = new Promise<string[]>(res => {
    const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = url; const out: string[] = [];
    const cv = document.createElement('canvas'); const x = cv.getContext('2d'); let i = 0; let done = false;
    const finish = () => { if (done) return; done = true; v.removeAttribute('src'); v.load(); res(out); };
    const next = () => { if (i >= n) return finish(); v.currentTime = Math.min(Math.max(0, D - 0.05), ((i + 0.5) / n) * D); };
    v.onloadeddata = () => { const h = 72; cv.height = h; cv.width = Math.max(24, Math.round((h * (v.videoWidth || 16)) / (v.videoHeight || 9))); next(); };
    v.onseeked = () => { try { x?.drawImage(v, 0, 0, cv.width, cv.height); out.push(cv.toDataURL('image/jpeg', 0.6)); } catch { out.push(''); } i++; next(); };
    v.onerror = finish; window.setTimeout(finish, 15000);
  });
  FRAMES.set(k, p); return p;
}
const WAVES = new Map<string, Promise<number[] | 'none'>>();
/** The clip's sound as peaks (0–1), or 'none' when it has no sound we can read. */
function waveOf(url: string, bins: number): Promise<number[] | 'none'> {
  const k = `${url}|${bins}`; const hit = WAVES.get(k); if (hit) return hit;
  const p = (async (): Promise<number[] | 'none'> => {
    try {
      const buf = await (await fetch(url)).arrayBuffer(); const AC: typeof AudioContext = (window as any).AudioContext ?? (window as any).webkitAudioContext; if (!AC) return 'none';
      const ac = new AC(); try { const a = await ac.decodeAudioData(buf); const d = a.getChannelData(0); const per = Math.max(1, Math.floor(d.length / bins)); const out: number[] = [];
        for (let b = 0; b < bins; b++) { let m = 0; for (let j = b * per, e = Math.min(d.length, j + per); j < e; j += 8) m = Math.max(m, Math.abs(d[j])); out.push(m); }
        const top = Math.max(...out); return top < 0.003 ? 'none' : out.map(n => n / top); } finally { void ac.close(); }
    } catch { return 'none'; }
  })();
  WAVES.set(k, p); return p;
}

export interface TrimSheetProps {
  open: boolean; onClose: () => void;
  clip: { url: string; name: string; sec: number; /** frame size: a wide clip gets a wide preview */ w?: number; h?: number };
  /** null: the clip is shorter than the model's minimum */ value: Trim | null; onChange: (t: Trim) => void;
  min: number; max: number; /** short model name for the notes ("H3") */ model: string; /** "swaps", "takes" */ verb?: string;
  /** the live price (the same quote Generate shows) */ price?: ReactNode;
  /** one line from the tool when nothing else is said (Person swap: "Who to swap … start at 0:03") */ note?: string | null;
  /** smaller lines under it (how a cloud model runs the range) */ more?: string[];
  /** the dock the sheet sits above */ anchor: RefObject<HTMLElement>;
  onPreview?: () => void; onReplace?: () => void; testId?: string;
}

export default function TrimSheet({ open, onClose, clip, value, onChange, min, max, model, verb = 'takes', price, note, more, anchor, onPreview, onReplace, testId = 'trim-sheet' }: TrimSheetProps) {
  const D = Math.max(1, Math.floor(clip.sec + 0.05)); const pct = (s: number) => `${(s / D) * 100}%`;
  const [pos, setPos] = useState<{ left: number; width: number; bottom: number } | null>(null);
  const [frames, setFrames] = useState<string[]>([]); const [wave, setWave] = useState<number[] | 'none' | null>(null);
  const [playing, setPlaying] = useState(false); const [head, setHead] = useState<number | null>(null);
  const [drag, setDrag] = useState<'start' | 'end' | 'move' | null>(null); const [hit, setHit] = useState<'min' | 'max' | null>(null); const [moved, setMoved] = useState<'start' | 'end' | null>(null);
  const track = useRef<HTMLDivElement>(null); const pv = useRef<HTMLVideoElement>(null); const box = useRef<HTMLDivElement>(null); const startRef = useRef<HTMLButtonElement>(null);
  const grab = useRef<{ off: number; len: number } | null>(null);
  const r = value; const len = r ? r.end - r.start : 0;

  /* place above the dock, its width; full width on a phone */
  useLayoutEffect(() => { if (!open) return; const place = () => { const a = anchor.current?.getBoundingClientRect(); const W = window.innerWidth;
      if (!a) { setPos({ left: 8, width: W - 16, bottom: 8 }); return; } const phone = W < 640;
      setPos({ left: phone ? 8 : Math.max(8, a.left), width: phone ? W - 16 : Math.min(W - 16, a.width), bottom: Math.max(8, window.innerHeight - a.top + 8) }); };
    place(); const ro = new ResizeObserver(place); if (anchor.current) ro.observe(anchor.current); window.addEventListener('resize', place);
    return () => { ro.disconnect(); window.removeEventListener('resize', place); }; }, [open, anchor]);
  /* filmstrip and wave, once per clip */
  useEffect(() => { if (!open) return; let live = true; setFrames([]); setWave(null);
    void framesOf(clip.url, clip.sec, 12).then(f => { if (live) setFrames(f); }); void waveOf(clip.url, 96).then(w => { if (live) setWave(w); });
    return () => { live = false; }; }, [open, clip.url]); // eslint-disable-line react-hooks/exhaustive-deps
  /* Esc closes; focus the window's start handle on open */
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', k, true); const t = window.setTimeout(() => startRef.current?.focus({ preventScroll: true }), 30);
    return () => { document.removeEventListener('keydown', k, true); window.clearTimeout(t); }; }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  /* closing stops the loop */
  useEffect(() => { if (!open) { setPlaying(false); setHead(null); setHit(null); pv.current?.pause(); } }, [open]);
  /* the preview frame: the handle being moved, else the start (never a black first paint: seek once the clip has loaded) */
  const at = !r ? 0 : moved === 'end' && drag ? Math.max(r.start, r.end - 0.05) : r.start;
  useEffect(() => { const v = pv.current; if (!v || playing || !r) return; if (v.readyState >= 1) v.currentTime = Math.min(at, Math.max(0, clip.sec - 0.05)); }, [at, playing, open]); // eslint-disable-line react-hooks/exhaustive-deps
  /* play loops the chosen part */
  useEffect(() => { const v = pv.current; if (!v || !playing || !r) return; let raf = 0;
    if (v.currentTime < r.start || v.currentTime >= r.end) v.currentTime = r.start; v.muted = false; void v.play().catch(() => { v.muted = true; void v.play().catch(() => setPlaying(false)); });
    const tick = () => { if (v.currentTime >= r.end - 0.03 || v.currentTime < r.start - 0.1) v.currentTime = r.start; setHead(v.currentTime); raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); v.pause(); }; }, [playing, r?.start, r?.end]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (which: 'start' | 'end', to: number) => { if (!r) return; const m = moveTrim(r, which, to, { D, min, max, stop: true }); setHit(m.hit); setMoved(which); if (m.start !== r.start || m.end !== r.end) onChange({ start: m.start, end: m.end }); };
  const slide = (to: number) => { if (!r) return; const s = Math.max(0, Math.min(D - len, Math.round(to))); setHit(null); setMoved('start'); if (s !== r.start) onChange({ start: s, end: s + len }); };
  const tOf = (clientX: number) => { const b = track.current!.getBoundingClientRect(); return Math.max(0, Math.min(1, (clientX - b.left) / b.width)) * D; };
  const down = (which: 'start' | 'end' | 'move') => (e: React.PointerEvent) => { if (!r) return; e.preventDefault(); e.stopPropagation(); try { track.current?.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ }
    setDrag(which); setPlaying(false); if (which === 'move') grab.current = { off: tOf(e.clientX) - r.start, len }; };
  const moveP = (e: React.PointerEvent) => { if (!drag || !r) return; const t = tOf(e.clientX); if (drag === 'move') slide(t - (grab.current?.off ?? 0)); else apply(drag, t); };
  const up = () => { setDrag(null); grab.current = null; };
  const keys = (which: 'start' | 'end' | 'move') => (e: React.KeyboardEvent) => { if (!r) return; const by = e.shiftKey ? 5 : 1;
    const d = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -by : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? by : 0;
    if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); const to = e.key === 'Home' ? 0 : D; if (which === 'move') slide(to); else apply(which, to); return; }
    if (!d) return; e.preventDefault(); setPlaying(false); if (which === 'move') slide(r.start + d); else apply(which, (which === 'start' ? r.start : r.end) + d); };

  if (!open || !pos) return null;
  const over = Math.floor(clip.sec + 0.05) > max; const short = !r;
  const line: { text: ReactNode; warn?: boolean } | null = short ? { text: <>This clip is {Math.round(clip.sec * 10) / 10} s. {model} needs at least <b>{min} s</b>: pick a longer clip.</>, warn: true }
    : hit === 'min' ? { text: <>{model} needs at least <b>{min} s</b>. The handle stops here.</>, warn: true }
    : hit === 'max' ? { text: <>{model} {verb} up to <b>{max} s</b>. The handle stops here.</>, warn: true }
    : playing && head != null ? { text: <>Playing {clock(head)} of the chosen part · loops</> }
    : note ? { text: note }
    : over ? { text: <><span className="tsh-dot" aria-hidden />{model} {verb} up to <b>{max} s</b>, so the window slides. Drag it to pick the part.</> } : null;
  const ticks = [...new Set([0, 0.25, 0.5, 0.75, 1].map(f => Math.round(f * D)))];
  const warnWin = !!r && (hit === 'min' || len <= min);
  return createPortal(<div ref={box} className={`tsh${(clip.w ?? 0) > (clip.h ?? 0) ? ' wide' : ''}`} role="dialog" aria-label="Trim clip" data-testid={testId} style={{ left: pos.left, width: pos.width, bottom: pos.bottom }}>
    <div className="tsh-pv" aria-hidden>
      <video ref={pv} src={clip.url} muted playsInline preload="auto" onLoadedData={e => { if (r && !playing) e.currentTarget.currentTime = Math.min(at, Math.max(0, clip.sec - 0.05)); }} onEnded={() => setPlaying(false)} />
      <span className="tsh-pv-t" data-testid={`${testId}-frame-time`}>{clock(playing && head != null ? head : at)}</span>
    </div>
    <div className="tsh-r">
      <div className="tsh-h"><span className="tsh-t">Trim clip</span><span className="tsh-sub" title={clip.name}>{clip.name} · {clip.sec < 10 ? Math.round(clip.sec * 10) / 10 : Math.round(clip.sec)} s</span><span className="tsh-sp" />
        <span className="tsh-lim" data-testid={`${testId}-limits`}>{model} · {min}–{max} s</span>
        <button type="button" className="tsh-x" aria-label="Close (Esc)" title="Close (Esc)" onClick={onClose}><CloseIcon size={12} strokeWidth={2} /></button></div>
      <div className="tsh-ruler" aria-hidden>{ticks.map((t, i) => <span key={i} style={{ left: pct(t) }}>{clock(t)}</span>)}</div>
      <div className="tsh-film" ref={track} onPointerMove={moveP} onPointerUp={up} onPointerCancel={up}
        onPointerDown={e => { if (!r || e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains('tsh-fr')) return; const t = tOf(e.clientX); apply(Math.abs(t - r.start) < Math.abs(t - r.end) ? 'start' : 'end', Math.round(t)); }}>
        <div className="tsh-frames" aria-hidden>{(frames.length ? frames : Array.from({ length: 12 }, () => '')).map((f, i) => <i key={i} className="tsh-fr" style={f ? { backgroundImage: `url(${f})` } : undefined} />)}</div>
        {r && <>
          <div className="tsh-dim" style={{ left: 0, width: pct(r.start) }} aria-hidden /><div className="tsh-dim" style={{ left: pct(r.end), right: 0 }} aria-hidden />
          <div className={`tsh-win${warnWin ? ' warn' : ''}${drag ? ' drag' : ''}`} style={{ left: pct(r.start), width: `calc(${pct(r.end)} - ${pct(r.start)})` }}>
            <button type="button" className="tsh-body" role="slider" aria-label="Chosen part (move it)" aria-valuemin={0} aria-valuemax={D - len} aria-valuenow={r.start} aria-valuetext={`${clock(r.start)} to ${clock(r.end)}, ${len} s`}
              data-testid={`${testId}-window`} onPointerDown={down('move')} onKeyDown={keys('move')} />
            <button ref={startRef} type="button" className={`tsh-hd l${drag === 'start' ? ' grab' : ''}`} role="slider" aria-label="Start" aria-valuemin={0} aria-valuemax={D - min} aria-valuenow={r.start} aria-valuetext={`starts at ${clock(r.start)}`}
              data-testid={`${testId}-start`} onPointerDown={down('start')} onKeyDown={keys('start')} />
            <button type="button" className={`tsh-hd r${drag === 'end' ? ' grab' : ''}`} role="slider" aria-label="End" aria-valuemin={min} aria-valuemax={D} aria-valuenow={r.end} aria-valuetext={`ends at ${clock(r.end)}`}
              data-testid={`${testId}-end`} onPointerDown={down('end')} onKeyDown={keys('end')} />
          </div>
          {drag && drag !== 'move' && <span className="tsh-tip" style={{ left: pct(drag === 'start' ? r.start : r.end) }} aria-hidden>{hit === 'min' ? `min ${min} s` : hit === 'max' ? `max ${max} s` : clock(drag === 'start' ? r.start : r.end)}</span>}
          {playing && head != null && <span className="tsh-head" style={{ left: pct(head) }} aria-hidden />}
        </>}
      </div>
      <div className={`tsh-wave${wave === 'none' ? ' none' : ''}`} data-testid={`${testId}-wave`} aria-hidden={wave !== 'none'}>
        {wave === 'none' ? <span className="tsh-nosound">No sound in this clip</span>
          : (Array.isArray(wave) ? wave : Array.from({ length: 96 }, () => 0.08)).map((h, i) => { const t = ((i + 0.5) / 96) * clip.sec; return <i key={i} className={r && t >= r.start && t < r.end ? 'in' : ''} style={{ height: `${Math.max(8, h * 100)}%` }} />; })}
      </div>
      <div className="tsh-f">
        <button type="button" className={`tsh-play${playing ? ' on' : ''}`} disabled={!r} aria-label={playing ? 'Pause' : 'Play the chosen part'} aria-pressed={playing} data-testid={`${testId}-play`} onClick={() => setPlaying(p => !p)}>
          {playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}</button>
        {r && <span className={`tsh-read${warnWin ? ' warn' : ''}`} data-testid={`${testId}-readout`} aria-live="polite">{clock(r.start)} → {clock(r.end)} · <b>{len} s</b></span>}
        <span className={`tsh-note${line?.warn ? ' warn' : ''}`} data-testid={`${testId}-note`}>{line?.text}</span>
        {(onPreview || onReplace) && <span className="tsh-links">{onPreview && <button type="button" className="link-btn" data-testid={`${testId}-preview`} onClick={onPreview}>Preview</button>}
          {onReplace && <button type="button" className="link-btn" data-testid={`${testId}-replace`} onClick={onReplace}>Replace</button>}</span>}
        <button type="button" className="tsh-done" data-testid={`${testId}-done`} onClick={onClose}>Done{price ? <span className="tsh-price"> · {price}</span> : null}</button>
      </div>
      {!!more?.length && <div className="tsh-more" data-testid={`${testId}-more`}>{more.map((m, i) => <p key={i}>{m}</p>)}</div>}
    </div>
  </div>, document.body);
}
