/**
 * Listening for the bean's style (main thread side). The first time an audio result is played or opened, useStyleChoice() asks listen():
 *  1. decode the file (the browser's own decoder), take a few windows across it (heardStyle.listenWindows: start, middle, later; a short
 *     clip whole) and resample them to 16 kHz mono with an OfflineAudioContext;
 *  2. hand them to the YAMNet worker (yamnet.worker.ts: TF.js + the model in web/public/models/yamnet, loaded on that first request);
 *  3. map the averaged class scores to a pack (heardStyle.heardFromScores) and keep it: localStorage, plus the job meta on the server
 *     (POST /api/jobs/:id/dance-style) so every card and the viewer know it next time. A track is never heard twice.
 * Anything going wrong (no Worker / WebAudio, cross-origin file, offline, model missing) resolves to null: the prompt-word guess stays.
 * A pick from the chip's menu is stored the same way and wins over both.
 */
import { useEffect, useMemo, useState } from 'react';
import { saveDanceStyle } from '../api';
import { detectStyle, toPackId, type PackId } from './beanStyle';
import { chooseStyle, heardFromScores, listenWindows, migrateHeard, type Heard, type StyleChoice } from './heardStyle';

const SR = 16000; const WIN = 4.8; /* seconds per listening window (listenWindows' default) */
const KEY = (k: string) => `ohf:heard:v1:${k}`; const PICK = (k: string) => `ohf:style-pick:v1:${k}`;
const EVT = 'ohf:dance-style';
export type ListenTiming = { loadMs: number; classifyMs: number; decodeMs: number; backend: string; frames: number };
/** The last run's timings (also on window.__ohfListen in dev, for the evidence log). */
export let lastTiming: ListenTiming | null = null;

const read = <T,>(k: string): T | null => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : null; } catch { return null; } };
const write = (k: string, v: unknown) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window: memory only */ } };
const validHeard = (h: any): h is Heard => migrateHeard(h) !== null;
/** A stored heard result, migrated ('sad' → 'peaceful', old chip names): null when there is none. */
const readHeard = (k: string): Heard | null => migrateHeard(read(k));

/* ---------------- the worker ---------------- */
let worker: Worker | null = null; let seq = 0; const waiting = new Map<number, (r: any) => void>();
function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('./yamnet.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const f = waiting.get(e.data?.id); if (f) { waiting.delete(e.data.id); f(e.data); } };
    worker.onerror = () => { for (const f of waiting.values()) f({ ok: false, error: 'worker failed' }); waiting.clear(); worker?.terminate(); worker = null; };
    return worker;
  } catch { return null; }
}
const modelUrl = () => new URL(`${(import.meta as any).env?.BASE_URL ?? '/'}models/yamnet/model.json`, location.href).href;

/* ---------------- decode → windows ---------------- */
async function windowsOf(src: string): Promise<{ windows: Float32Array[]; rms: number; duration: number } | null> {
  const OAC: typeof OfflineAudioContext | undefined = (globalThis as any).OfflineAudioContext ?? (globalThis as any).webkitOfflineAudioContext;
  if (!OAC) return null;
  const r = await fetch(src, { credentials: 'same-origin' }); if (!r.ok) return null;
  const buf = await new OAC(1, 1, 44100).decodeAudioData(await r.arrayBuffer());
  const out: Float32Array[] = []; let sq = 0, n = 0;
  for (const w of listenWindows(buf.duration)) {
    const frames = Math.max(1, Math.round(w.len * SR)); const ctx = new OAC(1, frames, SR); /* one channel: the browser downmixes */
    const s = ctx.createBufferSource(); s.buffer = buf; s.connect(ctx.destination); s.start(0, w.start, w.len);
    const pcm = (await ctx.startRendering()).getChannelData(0).slice();
    for (let i = 0; i < pcm.length; i += 4) { sq += pcm[i] * pcm[i]; n++; }
    /* a clip shorter than one window is looped to fill it: every request has the same shape (no WebGL recompile) and no padded silence */
    const full = Math.round(WIN * SR); if (pcm.length >= full) { out.push(pcm.subarray(0, full).slice()); continue; }
    const loop = new Float32Array(full); for (let i = 0; i < full; i += pcm.length) loop.set(pcm.subarray(0, Math.min(pcm.length, full - i)), i); out.push(loop);
  }
  return { windows: out, rms: Math.sqrt(sq / Math.max(1, n)), duration: buf.duration };
}

/* ---------------- listen (once per track) ---------------- */
const running = new Map<string, Promise<Heard | null>>();
let chain: Promise<unknown> = Promise.resolve(); /* one track at a time: the newest played waits for the one before */

/** Hear `src` once and remember it under `key` (the job id, else the file). null = couldn't listen; the words stay. */
export function listen(key: string, src: string, jobId?: string | null): Promise<Heard | null> {
  const cached = readHeard(KEY(key)); if (cached) return Promise.resolve(cached);
  const cur = running.get(key); if (cur) return cur;
  const p: Promise<Heard | null> = chain.catch(() => 0).then(async (): Promise<Heard | null> => {
    const w = getWorker(); if (!w) return null;
    const t0 = performance.now(); const win = await windowsOf(src).catch(() => null); if (!win || !win.windows.length) return null;
    const decodeMs = Math.round(performance.now() - t0);
    const id = ++seq;
    const res = await new Promise<any>((resolve) => { const to = setTimeout(() => { waiting.delete(id); resolve({ ok: false, error: 'timeout' }); }, 90_000);
      waiting.set(id, (r) => { clearTimeout(to); resolve(r); }); w.postMessage({ id, modelUrl: modelUrl(), windows: win.windows }, win.windows.map(x => x.buffer)); });
    if (!res?.ok) return null;
    lastTiming = { loadMs: res.loadMs, classifyMs: res.classifyMs, decodeMs, backend: res.backend, frames: res.frames };
    const h = heardFromScores(res.scores, res.names, win.rms);
    if ((import.meta as any).env?.DEV) ((window as any).__ohfListen ??= []).push({ key, src, ...lastTiming, pack: h.pack, label: h.label, conf: h.conf, top: h.top, groups: h.groups });
    write(KEY(key), h);
    if (jobId) saveDanceStyle(jobId, { heard: h }).catch(() => 0);
    window.dispatchEvent(new CustomEvent(EVT, { detail: { key } }));
    return h;
  }); chain = p;
  running.set(key, p); p.catch(() => null);
  return p;
}

/** The user's pick for a track (null = back to automatic). Saved locally and on the job. */
export function pickStyle(key: string, pack: PackId | null, jobId?: string | null) {
  write(PICK(key), { p: pack }); /* { p: null } = cleared here, so an older pick in the server meta doesn't come back */
  if (jobId) saveDanceStyle(jobId, { picked: pack }).catch(() => 0);
  window.dispatchEvent(new CustomEvent(EVT, { detail: { key } }));
}

export type SavedStyle = { heard?: Heard | null; picked?: string | null } | null | undefined;

/**
 * The style a result dances in, everywhere it shows (feed card, canvas, viewer): the user's pick, else what the sound was heard as (when
 * confident), else the prompt / lyrics words. `listenNow` turns true the first time the result is played or opened; listening starts then.
 * `saved`: the job meta from the server (heard on another device / an earlier session).
 */
export function useStyleChoice(o: { kind: 'music' | 'voice' | 'sfx'; prompt?: string | null; lyrics?: string | null; jobId?: string | null; src?: string | null; saved?: SavedStyle; listenNow?: boolean }) {
  const { kind, prompt, lyrics, jobId, src, saved, listenNow } = o;
  const key = jobId || src || '';
  const words = useMemo(() => detectStyle({ kind, prompt, lyrics }), [kind, prompt, lyrics]);
  const [tick, setTick] = useState(0);
  useEffect(() => { if (!key) return; const f = (e: Event) => { if ((e as CustomEvent).detail?.key === key) setTick(t => t + 1); }; window.addEventListener(EVT, f); return () => window.removeEventListener(EVT, f); }, [key]);
  /* server meta seeds the local cache, so the next play never listens again */
  useEffect(() => { if (key && validHeard(saved?.heard) && !validHeard(read(KEY(key)))) write(KEY(key), migrateHeard(saved!.heard)); }, [key, saved?.heard]);
  const [latched, setLatched] = useState(false);
  useEffect(() => { if (listenNow) setLatched(true); }, [listenNow]);
  useEffect(() => { setLatched(!!listenNow); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!latched || !key || !src || validHeard(read(KEY(key))) || validHeard(saved?.heard)) return;
    let live = true; setBusy(true);
    listen(key, src, jobId).finally(() => { if (live) { setBusy(false); setTick(t => t + 1); } });
    return () => { live = false; };
  }, [latched, key, src]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => {
    const heard = key ? (readHeard(KEY(key)) ?? migrateHeard(saved?.heard)) : null;
    const localPick = key ? read<{ p: string | null }>(PICK(key)) : null;
    const pickRaw = localPick ? localPick.p : saved?.picked ?? null;
    const picked = toPackId(pickRaw); /* a pick saved as 'sad' comes back as 'peaceful' */
    const choice: StyleChoice = chooseStyle(words, heard, picked, kind);
    return { choice, heard, words, picked, listening: busy, pick: (p: PackId | null) => key && pickStyle(key, p, jobId) };
  }, [words, key, saved, tick, busy, kind, jobId]); // eslint-disable-line react-hooks/exhaustive-deps
}
