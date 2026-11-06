/**
 * The poster card's rules (2026-11-06, Canvas release 1, Option C): which cards are posters, the shape they draw at, and their ports.
 *  - A poster is a generate card, a result, or an upload with a file. Its picture fills the card, so the card takes the picture's shape
 *    (width / ratio) once it is known; until then (a draft, a first run) it keeps its saved size. The saved size is never changed for this,
 *    so the board document (and tldraw, which reads the same board) stays as it was.
 *  - Ports (posterPorts.ts): one dot per input slot of the workflow ("Object", "Material", "Prompt optional"), filled when something is wired in, plus the
 *    output. Links land on the slot they fill. Labels show on hover, when selected or while a link is dragged (PosterCard + poster.css).
 */
import { atom } from '../boardApi';
import { GEN_TYPE, RESULT_TYPE, UPLOAD_TYPE } from '../nodeTypes';

/** picture / clip poster URL → its width / height, learnt when it loads (not saved: results and uploads keep no ratio of their own) */
export const ratioAtom = atom<Record<string, number>>('rf poster ratios', {});
export function noteRatio(url: string, w: number, h: number) {
  if (!url || !(w > 0) || !(h > 0)) return; const r = Math.round((w / h) * 1000) / 1000; if (ratioAtom.get()[url] === r) return;
  ratioAtom.update((m) => ({ ...m, [url]: r }));
}
/** a sound card's poster shape (a wide waveform) */
export const AUDIO_RATIO = 1.3;

type N = { type: string; props: Record<string, any> };
export const isPoster = (n: N | null | undefined) => !!n && (n.type === GEN_TYPE || n.type === RESULT_TYPE || (n.type === UPLOAD_TYPE && !!n.props?.url));
/** What a poster shows: its active take (a generate card), its file (a result or upload). */
export function posterMedia(n: N, peek = -1): { kind: string; url: string; poster: string; jobId: string } | null {
  const p = n.props;
  if (n.type === GEN_TYPE) { const ts = p.takes ?? []; if (!ts.length) return null; const t = ts[peek >= 0 && peek < ts.length ? peek : Math.max(0, Math.min(p.take ?? 0, ts.length - 1))];
    return t ? { kind: t.kind, url: t.url, poster: t.poster || (t.kind === 'image' ? t.url : ''), jobId: t.jobId ?? '' } : null; }
  if (n.type === RESULT_TYPE) return p.url ? { kind: p.kind, url: p.url, poster: p.poster || (p.kind === 'image' ? p.url : ''), jobId: p.jobId ?? '' } : null;
  if (n.type === UPLOAD_TYPE) return p.url ? { kind: p.mediaKind || 'image', url: p.url, poster: p.poster || (p.mediaKind === 'image' || !p.mediaKind ? p.url : ''), jobId: '' } : null;
  return null;
}
/** The poster's width / height, or null (keep the saved size). */
export function posterRatio(n: N, ratios: Record<string, number>): number | null {
  if (!isPoster(n)) return null; const m = posterMedia(n); if (!m) return null;
  if (m.kind === 'audio') return AUDIO_RATIO;
  if (n.type === GEN_TYPE && Number(n.props.ratio) > 0) return Number(n.props.ratio);
  return ratios[m.poster || m.url] ?? null;
}
/** The size a node draws at on this engine: a poster follows its picture's shape (between 0.42 and 2.6 of its width tall). */
export function drawSize(n: N, saved: { w: number; h: number }, ratios: Record<string, number>): { w: number; h: number } {
  const r = posterRatio(n, ratios); if (!r) return saved;
  return { w: saved.w, h: Math.round(Math.max(saved.w * 0.42, Math.min(saved.w * 2.6, saved.w / r))) };
}


/** How light a picture is where the title (top) and the price (bottom) sit, learnt once per picture when it loads (a 24 px sample).
 *  'light' bands (a white studio shot) carry dark text and no scrim, so the picture stays white; 'dark' keep white text on a light scrim. */
export type Tone = { top: 'light' | 'dark'; bottom: 'light' | 'dark' };
const tones = new Map<string, Tone>();
export function toneOf(img: HTMLImageElement): Tone | null {
  const key = img.currentSrc || img.src; const had = tones.get(key); if (had) return had;
  try {
    const S = 24; const c = document.createElement('canvas'); c.width = S; c.height = S; const g = c.getContext('2d', { willReadFrequently: true }); if (!g) return null;
    g.drawImage(img, 0, 0, S, S); const d = g.getImageData(0, 0, S, S).data;
    const band = (y0: number, y1: number) => { let sum = 0, sq = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = 0; x < S; x++) { const i = (y * S + x) * 4; const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; sum += l; sq += l * l; n++; }
      const m = sum / n; const sd = Math.sqrt(Math.max(0, sq / n - m * m)); return m > 0.74 && sd < 0.2 ? 'light' as const : 'dark' as const; };
    const t: Tone = { top: band(0, 6), bottom: band(S - 5, S) }; tones.set(key, t); return t;
  } catch { return null; } /* a picture from another site without CORS: keep the scrims */
}
