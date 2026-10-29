/**
 * Captions + SRT on results (server/src/captions.ts): Whisper on this computer turns a video's or a sound's speech into subtitles, free.
 * One store per result (useCaptions), one tile in the viewer's action row (CaptionsTile: Show captions, Download SRT / VTT, Burn in),
 * and the cues for the player (ViewerVideo's <track kind="captions">, ViewerAudio's caption line). Talking or voiced results (speech, lip sync,
 * Translate Video, Change Voice) get them on by default; anything else makes them on request. Never downloads anything by itself: when the
 * voice runner isn't set up here, the tile shows the one-time setup steps instead.
 * Burn in: this ffmpeg has no drawtext, so (like the Share sheet) the browser draws one transparent PNG strip per cue, in our caption style
 * (the active Brand Kit's body font and main colour when Brand is on for video), and the server overlays them into a new video in Assets.
 * Two looks (2026-10-27): Box (the lines in a dark rounded box) and Film (white, clean sans, soft shadow, at most 2 lines, centred low, the
 * streaming-service look). The viewer's menu picks one (kept in this browser); Stitch uses the same drawCue for its voice captions.
 */
import { useEffect, useRef, useState } from 'react';
import { useToast } from './Toast';
import { tip } from './Tooltip';
import { canvasBlob } from './shareBrand';
import { activeKit, brandState, loadBrandKits } from './brandStore';

export type Cue = { start: number; end: number; lines: string[] };
export type CaptionLook = 'film' | 'box';
const LOOK_KEY = 'ohf:captions:look';
/** The caption look picked in the viewer (Film by default). */
export const captionLook = (): CaptionLook => { try { return localStorage.getItem(LOOK_KEY) === 'box' ? 'box' : 'film'; } catch { return 'film'; } };
const saveLook = (l: CaptionLook) => { try { localStorage.setItem(LOOK_KEY, l); } catch { /* storage off: this visit only */ } };
export type CaptionsState = 'loading' | 'none' | 'making' | 'ready' | 'nospeech' | 'setup' | 'nomedia' | 'error';
export type Captions = { state: CaptionsState; on: boolean; setOn: (on: boolean) => void; cues: Cue[]; vtt: string | null; srt: string | null; language: string | null;
  defaultOn: boolean; error: string | null; make: (force?: boolean) => void; steps: string[] };

const enc = encodeURIComponent;
/** The result's captions: loaded when the viewer opens, made right away for voiced results, and on for them by default. */
export function useCaptions(jobId: string | null | undefined, out: number, enabled: boolean): Captions {
  const [s, setS] = useState<{ state: CaptionsState; cues: Cue[]; vtt: string | null; srt: string | null; language: string | null; defaultOn: boolean; error: string | null; steps: string[] }>(
    { state: 'loading', cues: [], vtt: null, srt: null, language: null, defaultOn: false, error: null, steps: [] });
  const [on, setOn] = useState(false); const key = useRef('');
  const apply = (b: any, k: string) => { if (key.current !== k) return; setS({ state: b.state, cues: b.cues ?? [], vtt: b.vtt ?? null, srt: b.srt ?? null, language: b.language ?? null, defaultOn: !!b.defaultOn, error: null, steps: b.steps ?? [] }); };
  const make = (force = false, k = key.current, auto = false) => { if (!jobId) return; setS(x => ({ ...x, state: 'making', error: null }));
    fetch(`/api/jobs/${enc(jobId)}/captions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ out, force }) })
      .then(r => r.json().then(b => ({ ok: r.ok, b }))).then(({ ok, b }) => {
        if (key.current !== k) return;
        if (b?.state === 'setup') return fetch('/api/captions/status').then(r => r.json()).then(st => apply({ ...b, steps: st.steps ?? b.steps }, k));
        if (!ok) return setS(x => ({ ...x, state: 'error', error: String(b?.error ?? 'Couldn’t make captions') }));
        apply(b, k); if (!auto && b.state === 'ready') setOn(true);
      }).catch(() => { if (key.current === k) setS(x => ({ ...x, state: 'error', error: 'Couldn’t reach the app server' })); }); };
  useEffect(() => { const k = `${jobId}:${out}:${enabled}`; key.current = k; setOn(false);
    setS({ state: 'loading', cues: [], vtt: null, srt: null, language: null, defaultOn: false, error: null, steps: [] });
    if (!jobId || !enabled) return;
    fetch(`/api/jobs/${enc(jobId)}/captions?out=${out}`).then(r => r.ok ? r.json() : Promise.reject()).then(b => {
      if (key.current !== k) return;
      if (b.state === 'none' && b.defaultOn) { setOn(true); make(false, k, true); return; } /* voiced results: made right away, free and local */
      if (b.state === 'setup') return fetch('/api/captions/status').then(r => r.json()).then(st => apply({ ...b, steps: st.steps }, k));
      apply(b, k); if (b.defaultOn && b.state === 'ready') setOn(true);
    }).catch(() => { if (key.current === k) setS(x => ({ ...x, state: 'nomedia' })); });
  }, [jobId, out, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...s, on: on && s.state === 'ready', setOn, make: (f?: boolean) => make(!!f) };
}

/** The cue showing at time t (audio's caption line). */
export const cueAt = (cues: Cue[], t: number) => cues.find(c => t >= c.start && t < c.end) ?? null;

const CcGlyph = ({ s = 18 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
  <rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10.5 10.2a2.4 2.4 0 1 0 0 3.6M17 10.2a2.4 2.4 0 1 0 0 3.6" /></svg>;
const LANG: Record<string, string> = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', ja: 'Japanese', zh: 'Chinese', ko: 'Korean', ru: 'Russian', nl: 'Dutch', pl: 'Polish', tr: 'Turkish', ar: 'Arabic', hi: 'Hindi', id: 'Indonesian' };

/** The Captions tile: a CC menu in the viewer's action row (video and audio results on this computer). */
export function CaptionsTile({ cc, jobId, out, kind, src }: { cc: Captions; jobId: string; out: number; kind: 'video' | 'audio'; src: string }) {
  const toast = useToast(); const [burning, setBurning] = useState(false); const ref = useRef<HTMLDetailsElement>(null); const [look, setLook] = useState<CaptionLook>(captionLook);
  const close = () => { if (ref.current) ref.current.open = false; };
  const burn = async () => { if (burning) return; setBurning(true); try { const id = await burnIn(jobId, out, src, cc.cues, look);
      window.dispatchEvent(new Event('ohf:jobs-changed')); toast('Captioned copy saved to Assets', 'success', { action: { label: 'Open', to: `/jobs/${id}` } }); close(); }
    catch (e) { toast((e as Error).message || 'Couldn’t burn in the captions', 'error'); } finally { setBurning(false); } };
  const st = cc.state; const lang = cc.language ? LANG[cc.language] ?? cc.language.toUpperCase() : '';
  const sub = st === 'ready' ? `${cc.cues.length} caption${cc.cues.length === 1 ? '' : 's'}${lang ? ` · ${lang}` : ''}` : st === 'making' ? 'Listening to the speech…' : st === 'loading' ? '…' : '';
  return <details ref={ref} className="rv-more rv-cc" data-testid="rv-captions">
    <summary className={`rvx-tile${cc.on ? ' rv-cc-on' : ''}`} aria-label={cc.on ? 'Captions (on)' : 'Captions'} {...tip('Captions')}><CcGlyph /><span>Captions</span></summary>
    <div className="rv-more-menu rv-cc-menu" role="menu" data-testid="rv-captions-menu">
      <div className="rv-cc-h"><b>Captions</b>{sub && <small data-testid="rv-captions-status">{sub}</small>}</div>
      {st === 'setup' ? <div className="rv-cc-setup" data-testid="rv-captions-setup"><b>Captions need a one-time setup</b>
          <p>Captions are made on this computer with Whisper, free. Set it up once:</p><ol>{cc.steps.map(x => <li key={x}>{x}</li>)}</ol></div>
        : st === 'nospeech' ? <p className="rv-cc-note" data-testid="rv-captions-none">No speech found in this {kind === 'video' ? 'clip' : 'sound'}. Music or silence has nothing to caption.</p>
        : st === 'error' ? <><p className="rv-cc-note" role="alert">{cc.error}</p><button type="button" className="am-item" role="menuitem" onClick={() => cc.make(true)}>Try again</button></>
        : st === 'none' ? <button type="button" className="am-item" role="menuitem" data-testid="rv-captions-make" onClick={() => cc.make()}>Make captions<small>Free</small></button>
        : st === 'making' || st === 'loading' ? <p className="rv-cc-note rv-cc-busy" aria-live="polite"><span className="rv-cc-dot" aria-hidden />Listening to the speech…</p>
        : st === 'ready' ? <>
          <button type="button" className="am-item rv-cc-switch" role="menuitemcheckbox" aria-checked={cc.on} data-testid="rv-captions-toggle" onClick={() => cc.setOn(!cc.on)}>
            <span>Show captions</span><i className={`rv-cc-sw${cc.on ? ' on' : ''}`} aria-hidden /></button>
          <a className="am-item" role="menuitem" href={`${cc.srt}${cc.srt!.includes('?') ? '&' : '?'}download=1`} download data-testid="rv-captions-srt" onClick={close}>Download SRT<small>Any editor</small></a>
          <a className="am-item" role="menuitem" href={`${cc.vtt}${cc.vtt!.includes('?') ? '&' : '?'}download=1`} download data-testid="rv-captions-vtt" onClick={close}>Download VTT<small>For the web</small></a>
          {kind === 'video' && <div className="rv-cc-look" role="radiogroup" aria-label="Caption look" data-testid="rv-captions-look">{(['film', 'box'] as const).map(l =>
            <button key={l} type="button" role="radio" aria-checked={look === l} className={look === l ? 'on' : ''} data-testid={`rv-captions-look-${l}`} onClick={() => { setLook(l); saveLook(l); }}
              {...tip(l === 'film' ? 'White text with a soft shadow, low and centred' : 'Text in a dark box')}>{l === 'film' ? 'Film' : 'Box'}</button>)}</div>}
          {kind === 'video' && <button type="button" className="am-item" role="menuitem" data-testid="rv-captions-burn" disabled={burning} onClick={burn} {...tip('A new copy in Assets with the captions in the picture')}>{burning ? 'Burning in…' : 'Burn in'}<small>New copy · free</small></button>}
          <button type="button" className="am-item rv-cc-redo" role="menuitem" data-testid="rv-captions-redo" onClick={() => cc.make(true)}>Make again</button></>
        : null}
    </div></details>;
}

/* ---- Burn in: one PNG strip per cue, the video's width ---- */
export type Style = { font: string; fill: string; box: string; accent: string | null };
function styleOf(): Style {
  const css = getComputedStyle(document.documentElement); const ui = css.getPropertyValue('--font-ui').trim() || 'Manrope, system-ui, sans-serif';
  const s = brandState(); const k = s.on.video ? activeKit(s) : undefined;
  if (k && !k.builtIn) { const main = k.colors.find(c => c.role === 'primary') ?? k.colors[0];
    return { font: k.fonts?.body ? `'${k.fonts.body.replace(/'/g, '')}', ${ui}` : ui, fill: '#ffffff', box: 'rgba(15,17,19,0.78)', accent: main?.hex ?? null }; }
  return { font: ui, fill: '#ffffff', box: 'rgba(15,17,19,0.78)', accent: null };
}
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = []; let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width <= max || !cur) cur = t; else { out.push(cur); cur = w; } }
  if (cur) out.push(cur); return out;
}
/** One caption strip: the lines centred in a rounded dark box (brand colour bar under it when a brand is on), or the Film look.
 *  Exported for Stitch and the burn test page. */
export function drawCue(text: string, W: number, H: number, st: Style = styleOf(), look: CaptionLook = 'box'): { canvas: HTMLCanvasElement; y: number } {
  if (look === 'film') return drawFilmCue(text, W, H, st);
  const short = Math.min(W, H); let size = Math.max(16, Math.round(short * 0.05)); const cv = document.createElement('canvas'); const ctx = cv.getContext('2d')!;
  const maxW = W * 0.86; let lines: string[] = [];
  for (; size >= 14; size -= 2) { ctx.font = `600 ${size}px ${st.font}`; lines = wrap(ctx, text, maxW); if (lines.length <= 2) break; }
  /* even lines: the narrowest width that keeps the same number of lines (no one-word last line) */
  if (lines.length > 1) { for (let w = maxW * 0.96; w > maxW * 0.4; w *= 0.96) { const l = wrap(ctx, text, w); if (l.length > lines.length) break; lines = l; } }
  const lh = Math.round(size * 1.3), padX = Math.round(size * 0.6), padY = Math.round(size * 0.35);
  const tw = Math.min(maxW, Math.max(...lines.map(l => ctx.measureText(l).width))); const bw = Math.ceil(tw + padX * 2), bh = lines.length * lh + padY * 2 + (st.accent ? 4 : 0);
  cv.width = W; cv.height = bh + 4; const c = cv.getContext('2d')!; const x = Math.round((W - bw) / 2);
  c.fillStyle = st.box; c.beginPath(); (c as any).roundRect ? (c as any).roundRect(x, 0, bw, bh, Math.round(size * 0.35)) : c.rect(x, 0, bw, bh); c.fill();
  if (st.accent) { c.fillStyle = st.accent; c.fillRect(x + padX, bh - 4 - Math.round(padY / 2), bw - padX * 2, 3); }
  c.font = `600 ${size}px ${st.font}`; c.fillStyle = st.fill; c.textAlign = 'center'; c.textBaseline = 'middle';
  lines.forEach((l, i) => c.fillText(l, W / 2, padY + lh * i + lh / 2, maxW));
  /* above the bottom edge; a tall (9:16) frame sits higher, clear of the apps' buttons */
  const y = Math.round(H - cv.height - H * (H > W * 1.3 ? 0.16 : 0.07)); return { canvas: cv, y };
}
/** Film look: white, clean sans, soft shadow, no box, at most 2 even lines, centred low (higher on a tall frame, clear of the apps' buttons). */
function drawFilmCue(text: string, W: number, H: number, st: Style): { canvas: HTMLCanvasElement; y: number } {
  const short = Math.min(W, H); let size = Math.max(16, Math.round(short * 0.055)); const cv = document.createElement('canvas'); const ctx = cv.getContext('2d')!;
  const maxW = W * 0.8; let lines: string[] = [];
  for (; size >= 14; size -= 2) { ctx.font = `600 ${size}px ${st.font}`; lines = wrap(ctx, text, maxW); if (lines.length <= 2) break; }
  if (lines.length > 1) { for (let w = maxW * 0.96; w > maxW * 0.4; w *= 0.96) { const l = wrap(ctx, text, w); if (l.length > lines.length) break; lines = l; } }
  const lh = Math.round(size * 1.25), pad = Math.ceil(size * 0.5); cv.width = W; cv.height = lines.length * lh + pad * 2; const c = cv.getContext('2d')!;
  c.font = `600 ${size}px ${st.font}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#ffffff';
  c.shadowColor = 'rgba(0,0,0,0.75)'; c.shadowBlur = Math.max(3, size * 0.22); c.shadowOffsetY = Math.max(1, size * 0.05);
  lines.forEach((l, i) => c.fillText(l, W / 2, pad + lh * i + lh / 2, maxW));
  c.shadowBlur = Math.max(1, size * 0.06); c.shadowOffsetY = 0; lines.forEach((l, i) => c.fillText(l, W / 2, pad + lh * i + lh / 2, maxW)); /* a tight second shadow keeps thin strokes readable on bright frames */
  const y = Math.round(H - cv.height - H * (H > W * 1.3 ? 0.15 : 0.06)); return { canvas: cv, y };
}
/** The burn-in style now (Brand Kit font when Brand is on for video). Exported for Stitch's voice captions. */
export async function captionStyle(): Promise<Style> { if (brandState().on.video && !brandState().loaded) await loadBrandKits(); const st = styleOf(); try { await document.fonts?.load(`600 32px ${st.font}`); } catch { /* fallback font */ } return st; }
const videoSize = (src: string) => new Promise<{ w: number; h: number }>((res, rej) => { const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true;
  v.onloadedmetadata = () => v.videoWidth ? res({ w: v.videoWidth, h: v.videoHeight }) : rej(new Error('Couldn’t read the video size')); v.onerror = () => rej(new Error('This video can’t be read')); v.src = src; });
export async function burnIn(jobId: string, out: number, src: string, cues: Cue[], look: CaptionLook = captionLook()): Promise<string> {
  if (!cues.length) throw new Error('No captions to burn in');
  const { w, h } = await videoSize(src); const W = w - (w % 2), H = h - (h % 2);
  const st = await captionStyle();
  const f = new FormData(); const meta: { start: number; end: number; y: number }[] = [];
  for (const [i, c] of cues.entries()) { const { canvas, y } = drawCue(c.lines.join(' '), W, H, st, look); f.append(`cue${i}`, await canvasBlob(canvas), `cue${i}.png`); meta.push({ start: c.start, end: c.end, y }); }
  f.set('cues', JSON.stringify(meta)); f.set('out', String(out));
  const r = await fetch(`/api/jobs/${enc(jobId)}/captions/burn`, { method: 'POST', body: f }); const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error ?? 'Couldn’t burn in the captions'); return b.id;
}
