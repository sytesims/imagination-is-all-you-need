/**
 * 3D results on the web (2026-10-23), shared by the 3D page, the result viewer and Assets:
 *  - is3dUrl / jobIs3d: a GLB output ('3d' output kind on the server).
 *  - The ONE live WebGL viewer rule: useLiveViewer(id, want) grants a single slot; a higher-priority claim (the open viewer) takes it from a
 *    lower one (the poster renderer), which then shows its still. Grids never hold a WebGL context: they show posters.
 *  - Model3D: Google's <model-viewer> (Apache-2.0, npm @google/model-viewer, loaded on first use as its own chunk) with orbit / zoom,
 *    auto-rotate, a neutral environment light, a clay look (switched in place), keyboard focus, and a calm placeholder + download link when a file won't load.
 *  - snapshotPoster / recordTurntable: a still for the card, and an orbit video recorded from the viewer's canvas (MediaRecorder; no provider).
 */
import { START_ORBIT } from './front3d';
import { createElement, forwardRef, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';

export const is3dUrl = (u?: string | null) => !!u && /\.glb(\?|#|$)/i.test(u);
export const jobIs3d = (j: { resultUrl?: string | null; outputs?: { url: string }[]; input?: any } | null | undefined) => !!j && (is3dUrl(j.resultUrl) || is3dUrl(j.outputs?.[0]?.url) || j.input?.outKind === '3d');
export { posterOf3d, posterStale, startOrbitOf, START_ORBIT, POSTER_V } from './front3d';
export const fmtMB = (bytes: number) => `${bytes >= 1e7 ? Math.round(bytes / 1e6) : Math.round(bytes / 1e5) / 10} MB`;
export const fmtFaces = (n?: number | null) => (n == null ? '' : n >= 1e6 ? `${Math.round(n / 1e5) / 10}M faces` : n >= 1000 ? `${Math.round(n / 1000)}k faces` : `${n} faces`);

let loader: Promise<unknown> | null = null;
/** Load <model-viewer> once (its own chunk, with three.js). */
export const loadModelViewer = () => (loader ??= import('@google/model-viewer').catch((e) => { loader = null; throw e; }));

// ---------- one live viewer ----------
type Slot = { id: string; pri: number } | null;
let live: Slot = null; const subs = new Set<() => void>(); const emit = () => subs.forEach((f) => f());
/** Ask for the live slot: granted when free, already ours, or held by a lower priority (which then gives it up). */
export function claimViewer(id: string, pri = 1): boolean { if (!live || live.id === id || live.pri < pri) { if (live?.id !== id || live.pri !== pri) { live = { id, pri }; emit(); } return true; } return false; }
export function releaseViewer(id: string) { if (live?.id === id) { live = null; emit(); } }
export const liveViewerId = () => live?.id ?? null;
/** True while this viewer holds the one live WebGL slot. The open viewer uses pri 2; background poster renders use 1. */
export function useLiveViewer(id: string, want: boolean, pri = 1): boolean {
  const cur = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => live?.id ?? null);
  useEffect(() => { if (want) claimViewer(id, pri); else releaseViewer(id); return () => releaseViewer(id); }, [id, want, pri]);
  return want && cur === id;
}

// ---------- the viewer ----------
export type Look = 'lit' | 'clay';
export interface Model3DHandle { el: HTMLElement | null; snapshot: () => Promise<Blob | null>; record: (o?: RecordOpts) => Promise<Recording> }
export interface Model3DProps {
  src: string; alt: string; poster?: string | null; /** the one-live-viewer slot id */ slot: string; pri?: number;
  autoRotate?: boolean; look?: Look; controls?: boolean; className?: string; style?: CSSProperties; downloadName?: string;
  onLoad?: (el: HTMLElement) => void; onError?: (why: string) => void; testId?: string;
  /** where the camera starts (model-viewer camera-orbit). Default: a little off the front, so a model opens on its face, not its side or back */ cameraOrbit?: string;
  /** the file is known to be unreadable (GET /api/3d/meta valid:false): show the failure at once */ invalid?: boolean; /** give up after this long (ms) */ timeoutMs?: number;
  /** play this animation of the file on a loop (a rigged character's Walk); off under reduced motion */ animation?: string | null;
  /** ms before auto-rotate starts (default 2500: the first look is the start view; a turntable card starts at once) */ rotateDelay?: number;
}
const MV = 'model-viewer';
/* The start view (UX audit #12; shared/front3d.ts): 30° off the model's front, slightly above; auto-rotate waits 2.5 s so the first look is that view. */
/** <model-viewer> with our defaults. Shows the still (or a calm placeholder) while another viewer is live, while loading, and on failure. */
export const Model3D = forwardRef<Model3DHandle, Model3DProps>(function Model3D({ src, alt, poster, slot, pri = 1, autoRotate = true, look = 'lit', controls = true, className = '', style, downloadName, onLoad, onError, testId, invalid, timeoutMs = 60_000, cameraOrbit = START_ORBIT, animation = null, rotateDelay = 2500 }, ref) {
  const granted = useLiveViewer(slot, true, pri); const el = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false); const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading'); const [why, setWhy] = useState('');
  useEffect(() => { let on = true; loadModelViewer().then(() => { if (on) setReady(true); }, () => { if (on) { setState('error'); setWhy('The 3D viewer could not start in this browser.'); onError?.('viewer'); } }); return () => { on = false; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setState('loading'); }, [src]);
  useEffect(() => { if (invalid) { setState('error'); setWhy('This file isn’t a 3D model the viewer can read.'); } }, [invalid]);
  /* a file the loader can't parse throws inside three.js without an error event: stop waiting after timeoutMs */
  useEffect(() => { if (!granted || !ready || state !== 'loading') return; const t = setTimeout(() => { setState((s) => (s === 'loading' ? 'error' : s)); setWhy('This model took too long to load or could not be read.'); onError?.('timeout'); }, timeoutMs); return () => clearTimeout(t); }, [granted, ready, state, src, timeoutMs]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const m = el.current as any; if (!m || !granted || !ready) return;
    const ok = () => { setState('ok'); onLoad?.(m); };
    const bad = (e: any) => { setState('error'); const t = String(e?.detail?.type ?? 'load'); setWhy(t === 'webglcontextlost' ? 'The 3D view stopped (graphics memory). Reopen it.' : 'This model could not be shown here.'); onError?.(t); };
    m.addEventListener('load', ok); m.addEventListener('error', bad); if (m.loaded) ok();
    return () => { m.removeEventListener('load', ok); m.removeEventListener('error', bad); }; }, [granted, ready, src]); // eslint-disable-line react-hooks/exhaustive-deps
  /* the look changes the loaded materials in place: same element, no reload, the camera and auto-rotate stay put */
  useEffect(() => { const m = el.current as any; if (m && state === 'ok') applyLook(m, look); }, [look, state]);
  useImperativeHandle(ref, () => ({ get el() { return el.current; }, snapshot: () => snapshotPoster(el.current), record: (o) => recordTurntable(el.current, o) }), []);
  const still = poster ? <img className="m3d-still" src={poster} alt={alt} draggable={false} /> : <span className="m3d-ph" aria-hidden><Cube /></span>;
  if (state === 'error') return <div className={`m3d m3d-err ${className}`} style={style} data-testid={testId ? `${testId}-error` : undefined} role="status">{still}<p className="m3d-why"><b>{why || 'This model could not be shown.'}</b>
    <a href={src} download={downloadName ?? true} className="btn btn-sm">Download the GLB</a></p></div>;
  return <div className={`m3d ${className}`} style={style} data-state={granted && ready ? state : 'still'} data-testid={testId}>
    {granted && ready ? createElement(MV, { ref: (x: HTMLElement | null) => { el.current = x; }, src, alt, poster: poster ?? undefined, 'camera-controls': controls ? '' : undefined, 'auto-rotate': autoRotate ? '' : undefined, 'auto-rotate-delay': String(rotateDelay), 'rotation-per-second': '24deg', 'camera-orbit': cameraOrbit, 'min-camera-orbit': 'auto auto 40%',
        'shadow-intensity': '0.9', 'shadow-softness': '0.8', exposure: '1', 'environment-image': 'neutral', 'interaction-prompt': 'none', 'touch-action': 'pan-y', ...(animation && !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) ? { 'animation-name': animation, autoplay: '' } : {}), tabIndex: 0, 'aria-label': alt, style: { width: '100%', height: '100%', background: 'transparent' } })
      : still}
    {granted && ready && state === 'loading' && <span className="m3d-load" role="status">Loading the model…</span>}
  </div>;
});
const Cube = () => <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" /></svg>;
/** Each material's own colour, kept the first time a look is applied, so Textured can put it back. */
const orig = new WeakMap<object, { tex: unknown; base: number[]; metal: number; rough: number; glow: number[] }>();
/** Clay: textures and glow off, one plain grey matte colour (shape only). Textured: each material's own texture and colour back. In place, no reload. */
function applyLook(m: any, look: Look) { try { for (const mat of m.model?.materials ?? []) { const p = mat.pbrMetallicRoughness; if (!p) continue;
  let o = orig.get(mat); if (!o) { if (look !== 'clay') continue; o = { tex: p.baseColorTexture?.texture ?? null, base: [...p.baseColorFactor], metal: p.metallicFactor, rough: p.roughnessFactor, glow: [...(mat.emissiveFactor ?? [0, 0, 0])] }; orig.set(mat, o); }
  if (look === 'clay') { p.baseColorTexture?.setTexture?.(null); p.setBaseColorFactor([0.78, 0.76, 0.73, 1]); p.setMetallicFactor(0); p.setRoughnessFactor(0.85); mat.setEmissiveFactor?.([0, 0, 0]); }
  else { p.baseColorTexture?.setTexture?.(o.tex); p.setBaseColorFactor(o.base); p.setMetallicFactor(o.metal); p.setRoughnessFactor(o.rough); mat.setEmissiveFactor?.(o.glow); } } } catch { /* the look is cosmetic */ } }

/** A PNG still of what the viewer shows now (the card poster). null when the viewer isn't ready. */
export async function snapshotPoster(el: HTMLElement | null): Promise<Blob | null> {
  const m = el as any; if (!m?.toBlob) return null;
  /* On a slow GPU model-viewer renders below full size (its render scale), and toBlob then cuts the still (half the model, too small).
   * Full scale for the few frames of the still, then back to the viewer's own setting. */
  const Mv: any = customElements.get(MV); const was = Mv?.minimumRenderScale;
  try { if (Mv) Mv.minimumRenderScale = 1; for (let k = 0; k < 3; k++) await new Promise((r) => requestAnimationFrame(r));
    return await m.toBlob({ mimeType: 'image/png', idealAspect: true }); } catch { return null; } finally { if (Mv && was != null) Mv.minimumRenderScale = was; }
}
export interface RecordOpts { seconds?: number; fps?: number; onProgress?: (p: number) => void; signal?: AbortSignal }
export interface Recording { blob: Blob; mime: string; ext: 'mp4' | 'webm'; seconds: number; fpsMeasured: number; frames: number }
/** The video type this browser records: WebM (VP9/VP8) first (Chrome's H.264 recorder dropped frames in tests), else MP4. The server keeps an MP4 either way. */
export function recordMime(): { mime: string; ext: 'mp4' | 'webm' } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const [mime, ext] of [['video/webm;codecs=vp9', 'webm'], ['video/webm;codecs=vp8', 'webm'], ['video/webm', 'webm'], ['video/mp4;codecs=avc1', 'mp4'], ['video/mp4', 'mp4']] as const) if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  return null;
}
/** One full orbit of the model, recorded in the browser. The viewer's WebGL canvas can't be captured directly (its drawing buffer is cleared
 *  after each frame), so every frame is rendered on purpose (model-viewer toBlob at the next angle), drawn onto a 2D canvas (at most 1280 px
 *  wide) and recorded from there. Frames are evenly spaced in angle and paced to the frame rate, so the motion stays smooth; a slow computer
 *  takes longer and fpsMeasured says so. Restores the camera afterwards. */
export async function recordTurntable(el: HTMLElement | null, o: RecordOpts = {}): Promise<Recording> {
  const m = el as any; if (!m?.toBlob) throw new Error('The 3D view isn’t ready yet.');
  const kind = recordMime(); if (!kind) throw new Error('This browser can’t record video.');
  const seconds = Math.max(3, Math.min(10, o.seconds ?? 6)); const fps = o.fps ?? 30; const n = Math.round(seconds * fps);
  const first: Blob = await m.toBlob({ mimeType: 'image/jpeg', qualityArgument: 0.92 }); const bmp0 = await createImageBitmap(first);
  const W = Math.min(1280, bmp0.width - (bmp0.width % 2)); const H = Math.max(2, Math.round((W * bmp0.height) / bmp0.width / 2) * 2);
  const out = document.createElement('canvas'); out.width = W; out.height = H; const x = out.getContext('2d'); if (!x || typeof out.captureStream !== 'function') throw new Error('This browser can’t record the 3D view.');
  x.drawImage(bmp0, 0, 0, W, H); bmp0.close?.();
  const was = { orbit: m.cameraOrbit, auto: m.autoRotate, decay: m.interpolationDecay };
  const start0 = m.getCameraOrbit?.() ?? { theta: 0, phi: Math.PI * 0.42, radius: 'auto' };
  const stream = out.captureStream(fps); const rec = new MediaRecorder(stream, { mimeType: kind.mime, videoBitsPerSecond: 6_000_000 }); const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<void>((ok, bad) => { rec.onstop = () => ok(); rec.onerror = (e: any) => bad(e?.error ?? new Error('recording failed')); });
  m.autoRotate = false; m.interpolationDecay = 0; let frames = 0;
  rec.start(250); const t0 = performance.now();
  try {
    for (let k = 0; k < n && !o.signal?.aborted; k++) {
      const theta = (start0.theta * 180) / Math.PI + (360 * k) / n;
      m.cameraOrbit = `${theta}deg ${(start0.phi * 180) / Math.PI}deg ${typeof start0.radius === 'number' ? `${start0.radius}m` : 'auto'}`; m.jumpCameraToGoal?.();
      const bmp = await createImageBitmap(await m.toBlob({ mimeType: 'image/jpeg', qualityArgument: 0.92 })); x.drawImage(bmp, 0, 0, W, H); bmp.close?.(); frames++;
      o.onProgress?.((k + 1) / n);
      const wait = t0 + ((k + 1) * 1000) / fps - performance.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  } finally {
    const took0 = performance.now(); rec.stop(); await done; stream.getTracks().forEach((t) => t.stop()); void took0;
    m.cameraOrbit = was.orbit; m.autoRotate = was.auto; m.interpolationDecay = was.decay; m.jumpCameraToGoal?.();
  }
  const took = (performance.now() - t0) / 1000;
  if (o.signal?.aborted) throw new Error('Recording stopped.');
  if (!chunks.length) throw new Error('The browser recorded nothing. Try again, or use another browser.');
  return { blob: new Blob(chunks, { type: kind.mime.split(';')[0] }), mime: kind.mime, ext: kind.ext, seconds: Math.round(took * 10) / 10, fpsMeasured: Math.round(frames / Math.max(0.1, took)), frames };
}
/** How busy an image's edges are (0 calm … 1 busy): a picture with a busy background makes a messier model, so the bar suggests removing it.
 *  Reads the outer 6% band at 64 px; transparent pixels count as calm. null when the image can't be read. */
export async function edgeBusyness(url: string): Promise<number | null> {
  try { const img = new Image(); img.decoding = 'async'; img.src = url; await img.decode(); const n = 64; const c = document.createElement('canvas'); c.width = n; c.height = n;
    const x = c.getContext('2d', { willReadFrequently: true }); if (!x) return null; x.drawImage(img, 0, 0, n, n); const d = x.getImageData(0, 0, n, n).data; const band = Math.max(2, Math.round(n * 0.06));
    const lum: number[] = []; let clear = 0; for (let yy = 0; yy < n; yy++) for (let xx = 0; xx < n; xx++) { if (xx >= band && xx < n - band && yy >= band && yy < n - band) continue; const i = (yy * n + xx) * 4; if (d[i + 3] < 24) { clear++; continue; } lum.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]); }
    if (!lum.length || clear > lum.length) return 0; const mean = lum.reduce((a, b) => a + b, 0) / lum.length; const sd = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length);
    return Math.max(0, Math.min(1, sd / 64)); } catch { return null; }
}
