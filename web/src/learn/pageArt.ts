/**
 * The printed side of the pop-up book: the pages are drawn on 2D canvases (crisp type, our own layout) and used as textures by bookEngine.ts.
 * Fonts: Source Serif 4 (headings, lesson), Caveat (handwritten notes), Inter (prompts, UI); all SIL OFL 1.1, loaded from Google Fonts
 * only while the book is open (loadBookFonts). Colours: warm paper, dark ink, the app's orange accent (#FF7A1A).
 */
import type { Chapter } from './ecomChapters';
import { ART_CAPTION, ECOM_ART, type ArtSlot } from './ecomArt';

export const PAPER = '#F5EEE1'; export const PAPER_EDGE = '#E6DCC9'; export const INK = '#26221E'; export const INK_SOFT = '#5A524A';
export const ACCENT = '#FF7A1A'; export const ACCENT_DEEP = '#B4500B';
export const PAGE_W = 1400; export const PAGE_H = 1904; // page ratio 1 : 1.36 (bookEngine PAGE_D / PAGE_W)
const SERIF = '"Source Serif 4", Georgia, serif'; const HAND = 'Caveat, "Bradley Hand", cursive'; const SANS = 'Inter, system-ui, sans-serif';

const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&family=Caveat:wght@500;700&display=swap';
/** Add the book's fonts (once) and wait until they can draw on a canvas (gives up after 2.5 s and uses the fallbacks). */
export async function loadBookFonts(): Promise<void> {
  if (typeof document === 'undefined') return;
  if (!document.querySelector('link[data-learn-fonts]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = FONT_HREF; l.dataset.learnFonts = '1'; document.head.appendChild(l); }
  const want = [`600 76px ${SERIF}`, `400 33px ${SERIF}`, `italic 400 30px ${SERIF}`, `700 48px ${HAND}`, `500 38px ${HAND}`, `500 25px ${SANS}`, `600 22px ${SANS}`];
  await Promise.race([Promise.all(want.map((f) => document.fonts.load(f).catch(() => null))), new Promise((r) => setTimeout(r, 2500))]);
}

/** Pictures for the art slots, loaded once (same-origin URLs only, so the canvas stays readable). */
const IMG = new Map<string, Promise<HTMLImageElement | null>>();
export function artImage(slot: ArtSlot): Promise<HTMLImageElement | null> {
  const url = ECOM_ART[slot]; if (!url || !url.startsWith('/')) return Promise.resolve(null);
  let p = IMG.get(url); if (!p) { p = new Promise((res) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => res(null); i.src = url; }); IMG.set(url, p); }
  return p;
}

// ---------- helpers ----------
const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = []; let line = '';
  for (const w of text.split(/\s+/)) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line); return out;
}
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
/** A hand-inked line: a little wobble so rules don't look machine-drawn. */
function inkLine(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, r: () => number, w = 3) {
  g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x1, y1); const n = 6;
  for (let i = 1; i <= n; i++) { const t = i / n; g.lineTo(x1 + (x2 - x1) * t + (r() - 0.5) * 2, y1 + (y2 - y1) * t + (r() - 0.5) * 3); } g.stroke();
}
/** Paper: warm base, fibres, a soft gutter shadow on the spine side and a faint edge darkening. */
function paper(g: CanvasRenderingContext2D, spine: 'left' | 'right', seed: number) {
  g.fillStyle = PAPER; g.fillRect(0, 0, PAGE_W, PAGE_H); const r = rng(seed);
  g.globalAlpha = 0.05; for (let i = 0; i < 2600; i++) { g.fillStyle = r() > 0.5 ? '#8a7a62' : '#ffffff'; g.fillRect(r() * PAGE_W, r() * PAGE_H, 1 + r() * 2, 1); } g.globalAlpha = 1;
  const gx = spine === 'right' ? PAGE_W : 0; const gr = g.createLinearGradient(gx, 0, spine === 'right' ? PAGE_W - 170 : 170, 0);
  gr.addColorStop(0, 'rgba(70,52,30,.24)'); gr.addColorStop(0.35, 'rgba(70,52,30,.07)'); gr.addColorStop(1, 'rgba(70,52,30,0)'); g.fillStyle = gr; g.fillRect(0, 0, PAGE_W, PAGE_H);
  const v = g.createRadialGradient(PAGE_W / 2, PAGE_H / 2, PAGE_H * 0.35, PAGE_W / 2, PAGE_H / 2, PAGE_H * 0.78); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(90,70,40,.10)'); g.fillStyle = v; g.fillRect(0, 0, PAGE_W, PAGE_H);
}
/** Diagonal hatching inside the current path (placeholders, footprints). */
function hatch(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, gap = 14, color = INK, alpha = 0.35) {
  g.save(); g.clip(); g.strokeStyle = color; g.globalAlpha = alpha; g.lineWidth = 2; g.beginPath();
  for (let k = -h; k < w + h; k += gap) { g.moveTo(x + k, y + h); g.lineTo(x + k + h, y); } g.stroke(); g.restore();
}
/** A taped photo (or its placeholder) for an art slot. */
export function drawPhoto(g: CanvasRenderingContext2D, slot: ArtSlot, img: HTMLImageElement | null, cx: number, cy: number, size: number, tilt: number, r: () => number) {
  g.save(); g.translate(cx, cy); g.rotate(tilt); const s = size, pad = s * 0.06;
  g.shadowColor = 'rgba(60,40,20,.28)'; g.shadowBlur = 22; g.shadowOffsetY = 8; g.fillStyle = '#FFFDF8'; g.fillRect(-s / 2, -s / 2, s, s + pad * 2.6); g.shadowColor = 'transparent';
  const ix = -s / 2 + pad, iy = -s / 2 + pad, iw = s - pad * 2;
  if (img) { const k = Math.max(iw / img.width, iw / img.height); const sw = iw / k, sh = iw / k; g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, ix, iy, iw, iw); }
  else { g.fillStyle = '#EFE6D6'; g.fillRect(ix, iy, iw, iw); g.beginPath(); g.rect(ix, iy, iw, iw); hatch(g, ix, iy, iw, iw, 16, INK_SOFT, 0.18);
    g.strokeStyle = INK; g.globalAlpha = 0.55; g.lineWidth = 3; g.setLineDash([10, 9]); g.strokeRect(ix + 10, iy + 10, iw - 20, iw - 20); g.setLineDash([]); g.globalAlpha = 1;
    g.fillStyle = INK_SOFT; g.font = `500 ${Math.round(s * 0.085)}px ${HAND}`; g.textAlign = 'center'; g.fillText('example picture', 0, iy + iw * 0.47); g.font = `500 ${Math.round(s * 0.06)}px ${HAND}`; g.fillText('made in the app · coming soon', 0, iy + iw * 0.6); g.textAlign = 'left'; }
  g.fillStyle = INK; g.font = `500 ${Math.round(s * 0.075)}px ${HAND}`; g.textAlign = 'center'; g.fillText(ART_CAPTION[slot], 0, s / 2 + pad * 1.75); g.textAlign = 'left';
  g.fillStyle = 'rgba(255,190,120,.55)'; g.translate(0, -s / 2); g.rotate(-0.08 + (r() - 0.5) * 0.1); g.fillRect(-s * 0.16, -s * 0.045, s * 0.32, s * 0.09);
  g.restore();
}

// ---------- the pages ----------
/** Left page: the lesson. Shrinks the type a little when a chapter runs long, so everything fits. */
export function drawLesson(c: HTMLCanvasElement, ch: Chapter, imgs: (HTMLImageElement | null)[], total: number) {
  c.width = PAGE_W; c.height = PAGE_H; const g = c.getContext('2d')!;
  for (const k of [1, 0.93, 0.86, 0.8]) { if (layoutLesson(g, ch, imgs, total, k)) return; }
}
function layoutLesson(g: CanvasRenderingContext2D, ch: Chapter, imgs: (HTMLImageElement | null)[], total: number, k: number): boolean {
  const r = rng(ch.n * 977); paper(g, 'right', ch.n * 31); const L = 120, R = PAGE_W - 104, W = R - L; let y = 150;
  // kicker + title, with the example photo pinned at the top right
  const photoS = 330; drawPhoto(g, ch.art[0], imgs[0] ?? null, R - photoS / 2 + 6, 150 + photoS / 2 - 10, photoS, 0.045, r);
  g.fillStyle = ACCENT_DEEP; g.font = `700 ${Math.round(46 * k)}px ${HAND}`; g.fillText(`Chapter ${ch.n} · ${ch.kicker}`, L, y); y += 30 * k;
  g.fillStyle = INK; g.font = `600 ${Math.round(76 * k)}px ${SERIF}`; for (const ln of wrap(g, ch.title, W - photoS - 40)) { y += 82 * k; g.fillText(ln, L, y); }
  g.strokeStyle = ACCENT; inkLine(g, L, y + 26 * k, L + 230, y + 22 * k, r, 5); y = Math.max(y + 70 * k, 150 + photoS + 70);
  // lesson
  g.fillStyle = INK; g.font = `400 ${Math.round(42 * k)}px ${SERIF}`; const lh = 58 * k;
  for (const p of ch.lesson) { for (const ln of wrap(g, p, W)) { g.fillText(ln, L, y); y += lh; } y += 20 * k; }
  // prompts: one line each on the page (the full text is in the Try it bar under the book)
  y += 26 * k; g.fillStyle = INK_SOFT; g.font = `600 ${Math.round(25 * k)}px ${SANS}`; (g as any).letterSpacing = '3px'; g.fillText('TRY THESE PROMPTS', L, y); (g as any).letterSpacing = '0px'; y += 22 * k;
  const ph = 66 * k;
  ch.prompts.forEach((p, i) => {
    roundRect(g, L, y, W, ph, 16); g.fillStyle = i === 0 ? 'rgba(255,122,26,.08)' : 'rgba(255,255,255,.55)'; g.fill(); g.strokeStyle = i === 0 ? ACCENT : 'rgba(38,34,30,.45)'; g.lineWidth = 2.5; g.stroke();
    g.beginPath(); g.arc(L + 38, y + ph / 2, 19 * k, 0, Math.PI * 2); g.fillStyle = i === 0 ? ACCENT : INK; g.fill();
    g.fillStyle = '#fff'; g.font = `700 ${Math.round(23 * k)}px ${SANS}`; g.textAlign = 'center'; g.fillText(String(i + 1), L + 38, y + ph / 2 + 8 * k); g.textAlign = 'left';
    g.fillStyle = INK; g.font = `500 ${Math.round(31 * k)}px ${SANS}`; let t = p; const maxW = W - 100; if (g.measureText(t).width > maxW) { while (t.length > 4 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1); t = t.replace(/[\s,]+$/, '') + '…'; }
    g.fillText(t, L + 74, y + ph / 2 + 11 * k); y += ph + 14 * k;
  });
  // why it works
  y += 44 * k; g.fillStyle = ACCENT_DEEP; g.font = `700 ${Math.round(50 * k)}px ${HAND}`; g.fillText('Why it works', L, y); const ww = g.measureText('Why it works').width;
  g.strokeStyle = ACCENT; inkLine(g, L, y + 10, L + ww, y + 8, r, 3.5); y += 50 * k;
  g.fillStyle = INK; g.font = `500 ${Math.round(48 * k)}px ${HAND}`; for (const ln of wrap(g, ch.why, W)) { g.fillText(ln, L, y); y += 52 * k; }
  // cost and time, kept near the foot of the page
  y = Math.max(y + 34 * k, PAGE_H - 330); g.font = `600 ${Math.round(21 * k)}px ${SANS}`; let x = L; const chips: [string, string, boolean][] = [['LOCAL', ch.cost.local, true], ['CLOUD', ch.cost.cloud, false], ['TIME', ch.cost.time, false]];
  const rowH = 58 * k; let rowY = y;
  for (const [h, t, on] of chips) { g.font = `600 ${Math.round(23 * k)}px ${SANS}`; const tw = g.measureText(h).width + 14 + (g.font = `500 ${Math.round(26 * k)}px ${SANS}`, g.measureText(t).width) + 40;
    if (x + tw > R) { x = L; rowY += rowH + 12; }
    roundRect(g, x, rowY, tw, rowH, rowH / 2); g.fillStyle = on ? 'rgba(255,122,26,.13)' : 'rgba(38,34,30,.06)'; g.fill(); g.strokeStyle = on ? ACCENT : 'rgba(38,34,30,.3)'; g.lineWidth = 2; g.stroke();
    g.fillStyle = on ? ACCENT_DEEP : INK_SOFT; g.font = `600 ${Math.round(23 * k)}px ${SANS}`; g.fillText(h, x + 20, rowY + rowH / 2 + 8 * k); const hw = g.measureText(h).width;
    g.fillStyle = INK; g.font = `500 ${Math.round(26 * k)}px ${SANS}`; g.fillText(t, x + 20 + hw + 14, rowY + rowH / 2 + 9 * k); x += tw + 12; }
  y = rowY + rowH;
  g.fillStyle = INK_SOFT; g.font = `italic 400 ${Math.round(30 * k)}px ${SERIF}`; g.fillText(String(ch.n * 2), L, PAGE_H - 80);
  g.textAlign = 'right'; g.font = `500 ${Math.round(24 * k)}px ${SANS}`; g.fillText(`${ch.n} / ${total}`, R, PAGE_H - 82); g.textAlign = 'left';
  return y < PAGE_H - 140;
}

/** A footprint on the right page: where a pop-up part stands (u, v in 0..1 of the page; w, h in page fractions). */
export interface Footprint { u: number; v: number; w: number; h: number; accent?: boolean }
/** Right page: the printed figure under the pop-up (title, fold lines, hatched footprints, a hint). */
export function drawFigure(c: HTMLCanvasElement, ch: Chapter, feet: Footprint[]) {
  c.width = PAGE_W; c.height = PAGE_H; const g = c.getContext('2d')!; const r = rng(ch.n * 131); paper(g, 'left', ch.n * 17);
  const L = 104, R = PAGE_W - 120;
  g.fillStyle = ACCENT_DEEP; g.font = `700 46px ${HAND}`; g.fillText(`Fig. ${ch.n}`, L, 150); g.fillStyle = INK; g.font = `italic 400 40px ${SERIF}`; g.fillText(ch.figure, L + 130, 150);
  g.strokeStyle = 'rgba(38,34,30,.5)'; inkLine(g, L, 182, R, 178, r, 2);
  // fold lines (where the pieces hinge)
  g.strokeStyle = 'rgba(38,34,30,.28)'; g.setLineDash([14, 12]); g.lineWidth = 2; for (const f of feet) { const x = f.u * PAGE_W, y = (f.v + f.h / 2) * PAGE_H; g.beginPath(); g.moveTo(x - f.w * PAGE_W * 0.7, y); g.lineTo(x + f.w * PAGE_W * 0.7, y); g.stroke(); } g.setLineDash([]);
  // hatched footprints (the "printed" shadow each piece leaves on the page)
  for (const f of feet) { const x = f.u * PAGE_W, y = f.v * PAGE_H, w = f.w * PAGE_W, h = f.h * PAGE_H; g.beginPath(); g.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
    hatch(g, x - w / 2, y - h / 2, w, h, 11, f.accent ? ACCENT_DEEP : INK, f.accent ? 0.35 : 0.28); g.beginPath(); g.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2); g.strokeStyle = 'rgba(38,34,30,.35)'; g.lineWidth = 2; g.stroke(); }
  // hint
  g.fillStyle = INK_SOFT; g.font = `500 40px ${HAND}`; g.fillText('tap the orange dots to learn each part', L, PAGE_H - 150);
  g.beginPath(); g.arc(L - 30, PAGE_H - 163, 12, 0, Math.PI * 2); g.fillStyle = ACCENT; g.fill();
  g.fillStyle = INK_SOFT; g.font = `italic 400 30px ${SERIF}`; g.textAlign = 'right'; g.fillText(String(ch.n * 2 + 1), R, PAGE_H - 80); g.textAlign = 'left';
}

/** A blank-ish page (the inside of the cover, the end page). */
export function drawEndPaper(c: HTMLCanvasElement, side: 'left' | 'right', note?: string) {
  c.width = PAGE_W; c.height = PAGE_H; const g = c.getContext('2d')!; paper(g, side === 'left' ? 'right' : 'left', side === 'left' ? 5 : 9);
  if (note) { g.fillStyle = INK_SOFT; g.font = `500 52px ${HAND}`; g.textAlign = 'center'; g.fillText(note, PAGE_W / 2, PAGE_H / 2); g.textAlign = 'left'; }
}

/** The cover: dark cloth, a paper label with the title, an inked bottle with orange flow lines. */
export function drawCover(c: HTMLCanvasElement, title: string, subtitle: string) {
  c.width = PAGE_W; c.height = PAGE_H; const g = c.getContext('2d')!; const r = rng(4242);
  g.fillStyle = '#1C1D20'; g.fillRect(0, 0, PAGE_W, PAGE_H);
  g.globalAlpha = 0.06; for (let i = 0; i < 4000; i++) { g.fillStyle = r() > 0.5 ? '#ffffff' : '#000000'; g.fillRect(r() * PAGE_W, r() * PAGE_H, 2, 1); } g.globalAlpha = 1;
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, 46, PAGE_H); g.fillStyle = ACCENT; g.fillRect(46, 0, 6, PAGE_H);
  // label
  const lx = 170, ly = 210, lw = PAGE_W - 300, lh = 560; g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 30; g.fillStyle = PAPER; g.fillRect(lx, ly, lw, lh); g.shadowColor = 'transparent';
  g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(lx + 18, ly + 18, lw - 36, lh - 36);
  g.fillStyle = ACCENT_DEEP; g.font = `700 50px ${HAND}`; g.fillText('An interactive pop-up book', lx + 60, ly + 100);
  g.fillStyle = INK; g.font = `700 108px ${SERIF}`; let y = ly + 135; for (const ln of wrap(g, title, lw - 120)) { y += 118; g.fillText(ln, lx + 60, y); }
  g.font = `400 44px ${SERIF}`; for (const ln of wrap(g, subtitle, lw - 120)) { y += 64; g.fillText(ln, lx + 60, y); }
  // inked bottle with orange flows
  const cx = PAGE_W / 2 + 40, by = 1560; g.strokeStyle = '#F2E8D8'; g.lineWidth = 5; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(cx - 110, by); g.lineTo(cx - 110, by - 330); g.quadraticCurveTo(cx - 110, by - 400, cx - 45, by - 420); g.lineTo(cx - 45, by - 470); g.lineTo(cx + 45, by - 470); g.lineTo(cx + 45, by - 420); g.quadraticCurveTo(cx + 110, by - 400, cx + 110, by - 330); g.lineTo(cx + 110, by); g.closePath(); g.stroke();
  g.fillStyle = '#F2E8D8'; g.fillRect(cx - 52, by - 560, 104, 92);
  g.globalAlpha = 0.5; g.lineWidth = 3; for (let k = -330; k < 0; k += 22) { g.beginPath(); g.moveTo(cx + 40, by + k); g.lineTo(cx + 108, by + k - 40); g.stroke(); } g.globalAlpha = 1;
  g.strokeStyle = '#F2E8D8'; g.lineWidth = 3; g.strokeRect(cx - 80, by - 260, 160, 120); g.font = `600 34px ${SERIF}`; g.fillStyle = '#F2E8D8'; g.textAlign = 'center'; g.fillText('SERUM', cx, by - 190); g.textAlign = 'left';
  g.strokeStyle = ACCENT; g.lineWidth = 7; g.lineCap = 'round'; g.setLineDash([26, 18]);
  g.beginPath(); g.moveTo(220, 1250); g.bezierCurveTo(330, 980, 520, 980, cx - 130, by - 300); g.stroke();
  g.beginPath(); g.moveTo(cx + 130, by - 180); g.bezierCurveTo(PAGE_W - 280, by - 220, PAGE_W - 200, 1180, PAGE_W - 220, 1000); g.stroke(); g.setLineDash([]);
  for (const [x, yy] of [[220, 1250], [PAGE_W - 220, 1000]]) { g.beginPath(); g.arc(x, yy, 18, 0, Math.PI * 2); g.fillStyle = ACCENT; g.fill(); }
  g.strokeStyle = '#F2E8D8'; g.lineWidth = 3; g.beginPath(); g.ellipse(cx, by + 6, 190, 26, 0, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(242,232,216,.75)'; g.font = `600 30px ${SANS}`; g.fillText('8 chapters · prompts you can try · free local models first', 170, PAGE_H - 150);
  g.fillStyle = 'rgba(242,232,216,.5)'; g.font = `500 26px ${SANS}`; g.fillText('Imagination Is All You Need', 170, PAGE_H - 100);
}

/** Small card textures for the pop-up props (recipe card, shop screen, poster layout, A/B labels…). */
export function drawCard(c: HTMLCanvasElement, kind: string, img: HTMLImageElement | null, slot?: ArtSlot) {
  const W = 512, H = kind === 'phone' ? 1024 : kind === 'poster' ? 704 : 512; c.width = W; c.height = H; const g = c.getContext('2d')!; const r = rng(kind.length * 99);
  g.fillStyle = kind === 'phone' ? '#FFFDF8' : PAPER; g.fillRect(0, 0, W, H);
  if (img) { const k = Math.max(W / img.width, H / img.height); const sw = W / k, sh = H / k; g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, W, H); if (kind !== 'phone') return; }
  g.strokeStyle = INK; g.fillStyle = INK;
  if (kind === 'recipe') { g.font = `700 54px ${HAND}`; g.fillStyle = ACCENT_DEEP; g.fillText('brand recipe', 40, 80); g.fillStyle = INK; g.font = `500 44px ${HAND}`;
    ['soft morning light', 'sage + cream', '85 mm lens', 'calm, clean'].forEach((t, i) => { g.fillText('· ' + t, 46, 160 + i * 78); }); g.strokeStyle = ACCENT; inkLine(g, 40, 96, 330, 92, r, 4); return; }
  if (kind === 'poster') { g.fillStyle = '#F6C9A8'; g.fillRect(0, 0, W, H); g.fillStyle = INK; g.font = `700 74px ${SERIF}`; g.fillText('GLOW,', 36, 110); g.fillText('BOTTLED', 36, 190);
    g.fillStyle = 'rgba(38,34,30,.5)'; g.fillRect(36, 220, 220, 10); g.beginPath(); g.arc(110, H - 110, 70, 0, Math.PI * 2); g.fillStyle = ACCENT; g.fill(); g.fillStyle = '#fff'; g.font = `700 40px ${SANS}`; g.textAlign = 'center'; g.fillText('-20%', 110, H - 96); g.textAlign = 'left';
    g.strokeStyle = 'rgba(38,34,30,.35)'; g.setLineDash([10, 10]); g.lineWidth = 3; g.strokeRect(290, 260, 180, 400); g.setLineDash([]); g.fillStyle = INK_SOFT; g.font = `500 34px ${HAND}`; g.fillText('product', 320, 470); return; }
  if (kind === 'phone') { g.fillStyle = '#F5EEE1'; g.fillRect(0, 0, W, H); g.fillStyle = INK; g.font = `700 40px ${SANS}`; g.fillText('your shop', 40, 90);
    g.fillStyle = '#F6C9A8'; g.fillRect(40, 130, W - 80, 440); if (img) { const k = Math.max((W - 80) / img.width, 440 / img.height); const sw = (W - 80) / k, sh = 440 / k; g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 40, 130, W - 80, 440); }
    else { g.strokeStyle = INK; g.lineWidth = 5; g.strokeRect(W / 2 - 50, 230, 100, 260); g.fillStyle = INK; g.fillRect(W / 2 - 30, 180, 60, 50); }
    g.fillStyle = INK; g.font = `600 40px ${SERIF}`; g.fillText('Glow Serum', 40, 640); g.fillStyle = ACCENT_DEEP; g.font = `700 44px ${SANS}`; g.fillText('$24', 40, 710);
    roundRect(g, 40, 780, W - 80, 110, 55); g.fillStyle = ACCENT; g.fill(); g.fillStyle = '#fff'; g.font = `700 40px ${SANS}`; g.textAlign = 'center'; g.fillText('Add to cart', W / 2, 848); g.textAlign = 'left'; return; }
  if (kind === 'A' || kind === 'B') { g.fillStyle = kind === 'A' ? '#F6C9A8' : '#C9D3B8'; g.fillRect(0, 0, W, H); g.strokeStyle = INK; g.lineWidth = 6; g.strokeRect(W / 2 - 60, 170, 120, 250); g.fillStyle = INK; g.fillRect(W / 2 - 34, 120, 68, 50);
    g.beginPath(); g.arc(80, 80, 50, 0, Math.PI * 2); g.fillStyle = ACCENT; g.fill(); g.fillStyle = '#fff'; g.font = `700 64px ${SANS}`; g.textAlign = 'center'; g.fillText(kind, 80, 102); g.textAlign = 'left'; return; }
  if (kind === 'film') { g.fillStyle = '#26221E'; g.fillRect(0, 0, W, H); g.fillStyle = PAPER; for (let i = 0; i < 8; i++) { g.fillRect(16 + i * 62, 20, 34, 40); g.fillRect(16 + i * 62, H - 60, 34, 40); }
    for (let i = 0; i < 3; i++) { g.fillStyle = '#F6C9A8'; g.fillRect(20 + i * 164, 90, 148, H - 180); g.strokeStyle = INK; g.lineWidth = 5; g.strokeRect(70 + i * 164 + i * 6, 160, 48, 170); } return; }
  // a framed picture placeholder (art slot without its image yet)
  g.fillStyle = '#EFE6D6'; g.fillRect(0, 0, W, H); g.beginPath(); g.rect(0, 0, W, H); hatch(g, 0, 0, W, H, 20, INK_SOFT, 0.16);
  g.strokeStyle = INK; g.lineWidth = 6; g.strokeRect(W / 2 - 55, 150, 110, 250); g.fillStyle = INK; g.fillRect(W / 2 - 32, 104, 64, 48);
  g.fillStyle = INK_SOFT; g.font = `500 44px ${HAND}`; g.textAlign = 'center'; g.fillText(slot ? ART_CAPTION[slot] : 'example', W / 2, 470); g.textAlign = 'left';
}
