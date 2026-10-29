/**
 * Stitch title and end cards drawn in the browser (this ffmpeg has no drawtext): one transparent PNG at the film's exact size per card,
 * sent with the export (POST /api/compose, multipart parts titleCard / endCard). The look is the shared CARD_LOOKS table
 * (server/src/shared/stitchTimeline.ts), the same one the server's fallback (cardText.ts) and the panel's preview use.
 */
import { CARD_LOOKS, BRAND_ORANGE, type CardStyle } from '../../../../server/src/shared/stitchTimeline';
import { canvasBlob } from '../../shared/shareBrand';

/** The CSS font of a card style (Bold uses the display face; the rest the UI face). */
export function cardFont(style: CardStyle, px: number): string {
  const css = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const ui = css?.getPropertyValue('--font-ui').trim() || 'Manrope, system-ui, sans-serif'; const display = css?.getPropertyValue('--font-display').trim() || ui;
  const look = CARD_LOOKS[style]; return `${look.weight} ${Math.round(px)}px ${style === 'bold' ? display : ui}`;
}
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, track: number): string[] {
  const w = (t: string) => ctx.measureText(t).width + track * Math.max(0, t.length - 1); const out: string[] = []; let cur = '';
  for (const word of text.split(/\s+/).filter(Boolean)) { const t = cur ? `${cur} ${word}` : word; if (!cur || w(t) <= max) cur = t; else { out.push(cur); cur = word; } }
  if (cur) out.push(cur); return out;
}
/** One card: the text in its style, centred (or a lower third), with a soft shadow and the orange accent. */
export function drawCard(text: string, style: CardStyle, W: number, H: number): HTMLCanvasElement {
  const look = CARD_LOOKS[style] ?? CARD_LOOKS.clean; const t = (look.upper ? text.toUpperCase() : text).replace(/\s+/g, ' ').trim();
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d')!; if (!t) return cv;
  const short = Math.min(W, H); const maxW = W * look.maxW; let px = short * look.size; let lines: string[] = [];
  const setFont = () => { c.font = cardFont(style, px); (c as any).letterSpacing = `${look.tracking * px}px`; };
  for (let k = 0; k < 14; k++) { setFont(); lines = wrap(c, t, maxW, 0); if (lines.length <= 3 && lines.every(l => c.measureText(l).width <= maxW)) break; px *= 0.9; }
  /* even lines: the narrowest width that keeps the same number of lines (no one-word last line) */
  if (lines.length > 1) for (let w = maxW * 0.96; w > maxW * 0.3; w *= 0.96) { const l = wrap(c, t, w, 0); if (l.length > lines.length) break; lines = l; }
  const lh = px * 1.22; const blockH = lh * lines.length; const top = H * look.y - blockH / 2;
  const left = W * 0.08 + short * 0.03;
  c.textBaseline = 'middle'; c.textAlign = look.align === 'left' ? 'left' : 'center'; c.fillStyle = '#fff';
  c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = short * 0.02; c.shadowOffsetY = Math.max(1, short * 0.003);
  lines.forEach((l, i) => c.fillText(l, look.align === 'left' ? left : W / 2, top + lh * i + lh / 2));
  c.shadowColor = 'transparent'; c.fillStyle = BRAND_ORANGE;
  if (look.accent === 'under') { const bw = short * 0.06; c.fillRect((W - bw) / 2, top + blockH + px * 0.25, bw, Math.max(2, short * 0.006)); }
  if (look.accent === 'bar') c.fillRect(W * 0.08, top + lh * 0.12, Math.max(3, short * 0.008), blockH - lh * 0.2);
  return cv;
}
/** The card as a PNG blob, after its font has loaded (a missing web font falls back to the system face). */
export async function cardPng(text: string, style: CardStyle, W: number, H: number): Promise<Blob> {
  try { await document.fonts?.load(cardFont(style, 48)); } catch { /* the fallback font draws */ }
  return canvasBlob(drawCard(text, style, W, H));
}
