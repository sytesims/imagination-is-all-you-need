/** Shared audio waveform: `useWaveform` decodes a file into bar peaks (cached per src), `<Waveform>` draws the bars,
 *  colours the played part in the accent, and seeks on click, drag and ←/→. Used by the result viewer and AudioCard. */
import { useEffect, useRef, useState } from 'react';
import './waveform.css';

export type WaveState = 'loading' | 'ready' | 'fallback';
export type WaveError = 'missing' | 'decode' | 'unsupported' | 'too-big' | null;
type Decoded = { peaks: number[]; duration: number };

export const MIN_BARS = 8;
/** Long files (10 min and more) still draw at most this many bars. */
export const MAX_BARS = 256;
const clampBars = (n: number) => Math.max(MIN_BARS, Math.min(MAX_BARS, Math.round(n) || 96));
/** Bigger files (long audio, or a video with a sound track) decode at a low rate to keep memory small. */
const LOW_RATE_BYTES = 8 * 1024 * 1024;
/** Past this we don't fetch the file at all: the calm fallback shape is enough. */
const MAX_BYTES = 200 * 1024 * 1024;
const CACHE_MAX = 48;
const MAX_PARALLEL = 2;

/** The calm placeholder shape shown while loading, when decoding fails, or for a missing file. */
export const fallbackPeaks = (n = 96) => Array.from({ length: n }, (_, i) => 0.25 + 0.2 * Math.abs(Math.sin(i * 0.37)) + 0.12 * Math.abs(Math.sin(i * 1.7)));

class WaveFail extends Error { constructor(public kind: Exclude<WaveError, null>) { super(kind); } }

/* Small in-memory LRU of decoded peaks, keyed by bars + src; in-flight decodes are shared. */
const cache = new Map<string, Decoded>();
const inflight = new Map<string, Promise<Decoded>>();
const cacheGet = (k: string) => { const v = cache.get(k); if (v) { cache.delete(k); cache.set(k, v); } return v; };
const cachePut = (k: string, v: Decoded) => { cache.set(k, v); while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string); };
/** Tests only. */
export const _clearWaveCache = () => { cache.clear(); inflight.clear(); };

/* Many cards on one page: at most MAX_PARALLEL decodes at a time. */
let running = 0; const waiting: (() => void)[] = [];
const slot = () => new Promise<void>(res => { if (running < MAX_PARALLEL) { running++; res(); } else waiting.push(() => { running++; res(); }); });
const done = () => { running--; waiting.shift()?.(); };

/** Peaks from decoded channels: per bar the loudest sample (every 8th), across all channels (mono or stereo), scaled to the loudest bar. */
export function peaksOf(channels: Float32Array[], bars: number): number[] {
  const len = channels[0]?.length ?? 0; const step = Math.max(1, Math.floor(len / bars)); const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    let m = 0; const e = Math.min(len, (i + 1) * step);
    for (const ch of channels) for (let j = i * step; j < e; j += 8) { const v = Math.abs(ch[j]); if (v > m) m = v; }
    out.push(m);
  }
  const mx = Math.max(...out, 1e-3); return out.map(v => Math.max(0.04, v / mx));
}

async function decode(src: string, bars: number): Promise<Decoded> {
  const OAC: typeof OfflineAudioContext | undefined = (window as any).OfflineAudioContext ?? (window as any).webkitOfflineAudioContext;
  if (!OAC) throw new WaveFail('unsupported');
  await slot();
  try {
    const r = await fetch(src).catch(() => { throw new WaveFail('missing'); });
    if (!r.ok) throw new WaveFail('missing');
    const len = Number(r.headers.get('content-length') || 0);
    if (len > MAX_BYTES) { r.body?.cancel().catch(() => {}); throw new WaveFail('too-big'); }
    const buf = await r.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new WaveFail('too-big');
    const rate = buf.byteLength > LOW_RATE_BYTES ? 8000 : 44100;
    const ab = await new OAC(1, 1, rate).decodeAudioData(buf).catch(() => { throw new WaveFail('decode'); });
    const chans: Float32Array[] = []; for (let c = 0; c < Math.min(2, ab.numberOfChannels); c++) chans.push(ab.getChannelData(c));
    if (!chans.length || !chans[0].length) throw new WaveFail('decode');
    return { peaks: peaksOf(chans, bars), duration: ab.duration };
  } finally { done(); }
}

/** Decoded peaks for `src`, or `null` before the first decode. Shared by every caller with the same src + bars. */
export function loadWaveform(src: string, bars: number): Promise<Decoded> {
  const k = `${bars}|${src}`; const hit = cacheGet(k); if (hit) return Promise.resolve(hit);
  let p = inflight.get(k);
  if (!p) { p = decode(src, bars).then(d => { cachePut(k, d); return d; }).finally(() => inflight.delete(k)); inflight.set(k, p); }
  return p;
}

export type WaveformData = {
  /** What to draw: the real peaks once decoded, else the fallback shape. */
  bars: number[];
  /** Raw result: null while loading, [] when it fell back, else the peaks. */
  peaks: number[] | null;
  state: WaveState;
  error: WaveError;
  /** Seconds, from the decoded file (0 until known). */
  duration: number;
};

/** Decode `src` into `bars` peaks (default 96, capped to 8–256). `enabled: false` waits (e.g. until a card scrolls into view). */
export function useWaveform(src: string | null | undefined, { bars = 96, enabled = true }: { bars?: number; enabled?: boolean } = {}): WaveformData {
  const n = clampBars(bars); const k = src ? `${n}|${src}` : '';
  const [res, setRes] = useState<{ k: string; peaks: number[] | null; error: WaveError; duration: number }>(() => {
    const hit = k ? cache.get(k) : undefined; return { k, peaks: hit ? hit.peaks : null, error: null, duration: hit?.duration ?? 0 };
  });
  useEffect(() => {
    if (!src) { setRes({ k, peaks: [], error: 'missing', duration: 0 }); return; }
    const hit = cacheGet(k); if (hit) { setRes({ k, peaks: hit.peaks, error: null, duration: hit.duration }); return; }
    setRes(r => r.k === k && r.peaks === null ? r : { k, peaks: null, error: null, duration: 0 });
    if (!enabled) return;
    let on = true;
    loadWaveform(src, n).then(d => { if (on) setRes({ k, peaks: d.peaks, error: null, duration: d.duration }); },
      e => { if (on) setRes({ k, peaks: [], error: e instanceof WaveFail ? e.kind : 'decode', duration: 0 }); });
    return () => { on = false; };
  }, [k, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = res.k === k ? res : { peaks: null, error: null, duration: 0 };
  const state: WaveState = cur.peaks === null ? 'loading' : cur.peaks.length ? 'ready' : 'fallback';
  return { bars: cur.peaks && cur.peaks.length ? cur.peaks : fallbackPeaks(n), peaks: cur.peaks, state, error: cur.error, duration: cur.duration };
}

/** A total length as m:ss: rounded, and never 0:00 for a real (sub-second) clip. */
export const durClock = (s: number) => clockText(s > 0 && s < 1 ? 1 : Math.round(s));
/** m:ss (h:mm:ss past an hour). */
export const clockText = (s: number) => { const n = Math.max(0, Math.floor(isFinite(s) ? s : 0)); const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), x = String(n % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };

export type WaveformProps = {
  bars: number[];
  /** Played time and total, in seconds. Seeking is off while the duration is unknown. */
  time: number;
  duration: number;
  onSeek?: (sec: number) => void;
  className?: string;
  /** What the bar seeks, for the aria-label ("Seek audio, 0:12 of 1:30"). */
  label?: string;
  /** Hidden from assistive tech and not focusable (a native player next to it already covers that). */
  decorative?: boolean;
  testId?: string;
  state?: WaveState;
  /** ←/→ step in seconds (Shift: 1 s). */
  step?: number;
};

/** The bars. Click or drag to seek; ←/→ step, Home/End jump. */
export function Waveform({ bars, time, duration, onSeek, className, label = 'Seek audio', decorative, testId, state, step = 5 }: WaveformProps) {
  const drag = useRef(false);
  const can = !!onSeek && duration > 0;
  const p = duration > 0 ? time / duration : 0;
  const at = (el: HTMLElement, x: number) => { const r = el.getBoundingClientRect(); return Math.max(0, Math.min(duration, ((x - r.left) / (r.width || 1)) * duration)); };
  const down = (e: React.PointerEvent<HTMLDivElement>) => { if (!can || e.button !== 0) return; drag.current = true; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* old browser */ } onSeek!(at(e.currentTarget, e.clientX)); };
  const move = (e: React.PointerEvent<HTMLDivElement>) => { if (drag.current && can) onSeek!(at(e.currentTarget, e.clientX)); };
  const up = (e: React.PointerEvent<HTMLDivElement>) => { drag.current = false; try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* not captured */ } };
  const key = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!can) return; const s = e.shiftKey ? 1 : step;
    const t = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? time - s : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? time + s : e.key === 'Home' ? 0 : e.key === 'End' ? duration : null;
    if (t === null) return; e.preventDefault(); onSeek!(Math.max(0, Math.min(duration, t)));
  };
  const timeText = `${clockText(time)} of ${duration > 0 ? durClock(duration) : '--:--'}`;
  const a11y = decorative ? { 'aria-hidden': true as const } : {
    role: 'slider', tabIndex: can ? 0 : -1, 'aria-label': `${label}, ${timeText}`, 'aria-valuemin': 0, 'aria-valuemax': Math.round(duration) || 0,
    'aria-valuenow': Math.round(time), 'aria-valuetext': timeText, 'aria-disabled': !can || undefined, onKeyDown: key,
  };
  return <div className={`wf${className ? ` ${className}` : ''}`} data-testid={testId} data-ready={state === undefined ? undefined : state === 'loading' ? 'no' : state === 'ready' ? 'yes' : 'fallback'}
    data-seek={can ? 'on' : 'off'} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} {...a11y}>
    {bars.map((v, i) => <i key={i} className={i / bars.length < p ? 'on' : ''} style={{ height: `${Math.round(v * 100)}%` }} />)}
  </div>;
}
