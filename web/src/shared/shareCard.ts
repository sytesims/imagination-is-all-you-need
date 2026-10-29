/**
 * Share card (Most Viral): a 1200×630 PNG for link previews and "Download card". Drawn here on a <canvas> with the brand fonts (Space Grotesk,
 * Inter: already loaded by index.html), the Orbit mark with the two-tier name, the result, the model, where it ran and the repo.
 * The owner's browser uploads it (PUT /api/jobs/:id/share/card) so /s/<token>/card.png serves it to X and others; without an upload the
 * server serves its own simpler card (server/src/shareCard.ts). BRAND-GUIDE: near-black, one orange accent, Space Grotesk heads.
 */

export const CARD_W = 1200, CARD_H = 630;
import { REPO_URL } from './brand';
export { REPO_URL };
export interface CardInput { mediaUrl: string | null; kind: 'image' | 'video' | 'audio' | null; toolName: string; model: string | null; runOn: string | null; /** cost receipt without the model (shared/shareReceipt.ts receiptFacts): shown as RECEIPT in place of RUN ON when set */ receipt?: string | null; /** a pill on the picture, e.g. "13 layers" (Image to layers) */ badge?: string | null }

export const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => rej(new Error('image')); i.src = src; });
const posterOf = (url: string) => `/api/media/poster?url=${encodeURIComponent(url)}`;
export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
/** Wrap to at most `lines` lines; the last one gets an ellipsis when cut. */
export function wrap(c: CanvasRenderingContext2D, text: string, maxW: number, lines: number): string[] {
  const words = text.split(/\s+/); const out: string[] = []; let cur = '';
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (c.measureText(t).width <= maxW || !cur) cur = t; else { out.push(cur); cur = w; } }
  if (cur) out.push(cur); if (out.length <= lines) return out;
  const keep = out.slice(0, lines); let last = keep[lines - 1]; while (last && c.measureText(`${last}…`).width > maxW) last = last.slice(0, -1); keep[lines - 1] = `${last.trimEnd()}…`; return keep;
}
export function fit(c: CanvasRenderingContext2D, text: string, maxW: number) { if (c.measureText(text).width <= maxW) return text; let t = text; while (t && c.measureText(`${t}…`).width > maxW) t = t.slice(0, -1); return `${t.trimEnd()}…`; }
/** Wordmark lockup, `h` px tall at (x, y): the Orbit mark, then the two-tier name ("Imagination" in Space Grotesk, "is all you need"
 *  smaller in orange under it), the same lockup as the header (web/src/ui/Wordmark.tsx). */
export function drawWordmark(c: CanvasRenderingContext2D, x: number, y: number, h: number) {
  drawOrbit(c, x + h / 2, y + h / 2, h * 48 / 36.5);
  const tx = x + h * 1.25; c.save(); c.textBaseline = 'alphabetic';
  c.fillStyle = '#F7F7F8'; c.font = `700 ${Math.round(h * 0.62)}px "Space Grotesk", Inter, system-ui, sans-serif`; c.fillText('Imagination', tx, y + h * 0.56);
  c.fillStyle = '#FF7A1A'; c.font = `500 ${Math.round(h * 0.36)}px Inter, system-ui, sans-serif`; (c as any).letterSpacing = `${(h * 0.02).toFixed(1)}px`; c.fillText('is all you need', tx + 1, y + h * 0.98);
  (c as any).letterSpacing = '0px'; c.restore();
}
export function drawOrbit(c: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const s = size / 48; c.save(); c.translate(cx - 24 * s, cy - 24 * s); c.scale(s, s); c.lineCap = 'round'; c.lineWidth = 5.5; c.strokeStyle = '#FF7A1A';
  for (const m of [-15, 105, 225]) { c.beginPath(); c.arc(24, 24, 15.5, (m - 40) * Math.PI / 180, (m + 40) * Math.PI / 180); c.stroke(); }
  c.fillStyle = '#F7F7F8'; c.beginPath(); c.arc(24, 24, 6, 0, Math.PI * 2); c.fill(); c.restore();
}

export async function renderShareCard(o: CardInput): Promise<HTMLCanvasElement> {
  try { await Promise.all(['600 52px "Space Grotesk"', '600 26px Inter', '500 20px Inter', '700 13px Inter'].map(f => document.fonts.load(f))); } catch { /* system fallback */ }
  const cv = document.createElement('canvas'); cv.width = CARD_W; cv.height = CARD_H; const c = cv.getContext('2d')!;
  c.fillStyle = '#0F1113'; c.fillRect(0, 0, CARD_W, CARD_H);
  let img: HTMLImageElement | null = null;
  if (o.mediaUrl && o.kind !== 'audio') { try { img = await loadImg(o.kind === 'video' ? posterOf(o.mediaUrl) : o.mediaUrl); } catch { img = null; } }
  // backdrop: the result, blurred by down-and-up scaling (ctx.filter isn't in Safari), kept dark
  if (img) { const t = document.createElement('canvas'); t.width = 48; t.height = 26; const tc = t.getContext('2d')!; const k = Math.max(48 / img.width, 26 / img.height);
    tc.drawImage(img, (48 - img.width * k) / 2, (26 - img.height * k) / 2, img.width * k, img.height * k); c.globalAlpha = 0.38; c.imageSmoothingQuality = 'high'; c.drawImage(t, -40, -40, CARD_W + 80, CARD_H + 80); c.globalAlpha = 1; }
  const g = c.createLinearGradient(0, 0, CARD_W * 0.55, 0); g.addColorStop(0, 'rgba(15,17,19,.96)'); g.addColorStop(1, 'rgba(15,17,19,.55)'); c.fillStyle = g; c.fillRect(0, 0, CARD_W, CARD_H);
  // media panel
  const bx = 600, by = 48, bw = 552, bh = 534;
  if (img) { const k = Math.min(bw / img.width, bh / img.height); const w = img.width * k, h = img.height * k; const x = bx + (bw - w) / 2, y = by + (bh - h) / 2;
    c.save(); c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 40; c.shadowOffsetY = 16; roundRect(c, x, y, w, h, 20); c.fillStyle = '#131517'; c.fill(); c.restore();
    c.save(); roundRect(c, x, y, w, h, 20); c.clip(); c.drawImage(img, x, y, w, h); c.restore();
    c.save(); roundRect(c, x + .5, y + .5, w - 1, h - 1, 20); c.strokeStyle = 'rgba(255,255,255,.1)'; c.lineWidth = 1; c.stroke(); c.restore();
    if (o.badge) { c.save(); c.font = '600 18px Inter, system-ui, sans-serif'; const tw = c.measureText(o.badge).width; const pw = tw + 58, ph = 38, px = x + 16, py = y + h - ph - 16;
      roundRect(c, px, py, pw, ph, ph / 2); c.fillStyle = 'rgba(15,17,19,.78)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 1; c.stroke();
      // three stacked sheets (the layers glyph), then the count
      c.strokeStyle = '#FF7A1A'; c.lineWidth = 2; c.lineJoin = 'round'; for (let i = 0; i < 3; i++) { const cy = py + 12 + i * 5; c.beginPath(); c.moveTo(px + 14, cy + 2); c.lineTo(px + 24, cy - 3); c.lineTo(px + 34, cy + 2); c.lineTo(px + 24, cy + 7); c.closePath(); if (i === 0) { c.fillStyle = 'rgba(255,122,26,.25)'; c.fill(); } c.stroke(); }
      c.fillStyle = '#F7F7F8'; c.textBaseline = 'middle'; c.fillText(o.badge, px + 44, py + ph / 2 + 1); c.restore(); }
    if (o.kind === 'video') { const px = x + w / 2, py = y + h / 2; c.fillStyle = 'rgba(15,17,19,.62)'; c.beginPath(); c.arc(px, py, 36, 0, Math.PI * 2); c.fill(); c.fillStyle = '#F7F7F8'; c.beginPath(); c.moveTo(px - 10, py - 15); c.lineTo(px + 16, py); c.lineTo(px - 10, py + 15); c.closePath(); c.fill(); }
  } else { roundRect(c, bx, by, bw, bh, 20); c.fillStyle = '#131517'; c.fill(); drawOrbit(c, bx + bw / 2, by + bh / 2 - 30, 200);
    if (o.kind === 'audio') { c.fillStyle = 'rgba(255,255,255,.28)'; for (let i = 0; i < 36; i++) { const hh = 10 + Math.abs(Math.sin(i * 1.7) * 46) + (i % 3) * 6; c.fillRect(bx + 96 + i * 10, by + bh - 110 - hh / 2, 5, hh); } } }
  // left column
  const lx = 56, lw = 500; drawWordmark(c, lx, 56, 34);
  c.textBaseline = 'alphabetic'; c.fillStyle = '#F7F7F8'; c.font = '600 52px "Space Grotesk", Inter, system-ui, sans-serif';
  const title = wrap(c, o.toolName, lw, 2); title.forEach((t, i) => c.fillText(t, lx, 196 + i * 58));
  let y = 196 + title.length * 58 + 34;
  const fact = (label: string, value: string | null) => { if (!value) return; c.font = '700 13px Inter, system-ui, sans-serif'; c.fillStyle = 'rgba(255,255,255,.5)'; (c as any).letterSpacing = '1.5px'; c.fillText(label, lx, y); (c as any).letterSpacing = '0px';
    c.font = '600 26px Inter, system-ui, sans-serif'; c.fillStyle = '#F7F7F8'; c.fillText(fit(c, value, lw), lx, y + 34); y += 76; };
  fact('MODEL', o.model); if (o.receipt) fact('RECEIPT', o.receipt); else fact('RUN ON', o.runOn);
  c.font = '500 20px Inter, system-ui, sans-serif'; c.fillStyle = '#898A8B'; c.fillText(fit(c, 'Made with Imagination Is All You Need · open source', lw), lx, 534);
  c.font = '600 20px Inter, system-ui, sans-serif'; c.fillStyle = '#F7F7F8'; c.fillText(REPO_URL.replace(/^https?:\/\//, ''), lx, 566);
  return cv;
}
export const cardBlob = (cv: HTMLCanvasElement) => new Promise<Blob>((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('Could not draw the card')), 'image/png'));
/** Upload the drawn card so the link preview uses it (only accepted while the result is shared). */
export async function uploadCard(jobId: string, b: Blob) { const r = await fetch(`/api/jobs/${jobId}/share/card`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: b }); if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `HTTP ${r.status}`); }
/** Link previews need an address X can reach. */
export const isPrivateHost = (u: string) => { try { const h = new URL(u).hostname; return /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/.test(h) || h.endsWith('.local'); } catch { return true; } };
