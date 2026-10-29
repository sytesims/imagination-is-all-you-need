/**
 * Brand Kit on a canvas (2026-10-27), all in the browser: (1) main colours of a logo or picture (a downscaled canvas → shared/brandKit extractColors,
 * our own k-means; SVGs are drawn first, transparent pixels are skipped, near-white / near-black left out), (2) the one-page brand sheet PNG and
 * (3) a palette PNG (one swatch per colour with its hex, for a design tool's brand colours). Fonts are drawn with what the page has loaded; a font
 * the app doesn't load falls back to the system's.
 */
import { colourWords, extractColors, fontStack, luminance, moodWords, type BrandKit } from '../../../../server/src/shared/brandKit';

const loadImg = (src: string): Promise<HTMLImageElement> => new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => rej(new Error('That image couldn’t be read.')); i.src = src; });

/** A file or URL → its main colours (≤ 6). Huge images are drawn small (≤ 96 px); an SVG with no size gets 96 × 96. */
export async function colorsOfImage(src: File | string): Promise<{ hex: string; share: number }[]> {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  try {
    const img = await loadImg(url); const w0 = img.naturalWidth || 96, h0 = img.naturalHeight || 96; const k = Math.min(1, 96 / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); if (!g) return [];
    g.imageSmoothingEnabled = k > 0.5; /* big images: sample pixels instead of averaging them, so edges don't invent in-between colours */ g.drawImage(img, 0, 0, w, h);
    return extractColors(g.getImageData(0, 0, w, h).data, 6);
  } finally { if (typeof src !== 'string') URL.revokeObjectURL(url); }
}

const ink = (bg: string) => (luminance(bg) > 0.4 ? '#14151A' : '#F5F5F5');
const fontCss = (name: string, weight: number, px: number) => `${weight} ${px}px ${fontStack(name || 'Manrope').map((f) => (/^(sans-serif|serif|monospace)$/.test(f) ? f : `"${f}"`)).join(', ')}`;
/** Text cut to fit maxW with an ellipsis. */
function fit(g: CanvasRenderingContext2D, s: string, maxW: number): string { if (g.measureText(s).width <= maxW) return s; let t = s; while (t.length > 1 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1); return t + '…'; }
/** Words wrapped into ≤ maxLines lines of maxW. */
function wrap(g: CanvasRenderingContext2D, s: string, maxW: number, maxLines: number): string[] {
  const out: string[] = []; let line = '';
  for (const w of s.split(/\s+/).filter(Boolean)) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width <= maxW) { line = t; continue; } if (line) out.push(line); line = w; if (out.length >= maxLines) break; }
  if (line && out.length < maxLines) out.push(line);
  if (out.length === maxLines && s.length > out.join(' ').length) out[maxLines - 1] = fit(g, out[maxLines - 1] + ' …', maxW);
  return out;
}
const rrect = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
/** Draw an image to cover (crop) or contain (fit) a box. */
function drawImg(g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, mode: 'cover' | 'contain') {
  const iw = img.naturalWidth || w, ih = img.naturalHeight || h; const k = mode === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
  const dw = iw * k, dh = ih * k; g.save(); rrect(g, x, y, w, h, 14); g.clip(); g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); g.restore();
}

/** The one-page brand sheet: logo and name, the mood, every swatch with its hex, name and role, both fonts with a sample, do / don't and up to 3 examples. 1600 × 1000 (taller with examples). */
export async function drawBrandSheet(kit: BrandKit): Promise<Blob> {
  await document.fonts?.ready.catch(() => undefined);
  const bg = kit.colors.find((c) => c.role === 'background')?.hex ?? '#F6F5F2'; const fg = kit.colors.find((c) => c.role === 'text')?.hex ?? ink(bg);
  const sub = luminance(bg) > 0.4 ? 'rgba(20,21,26,.62)' : 'rgba(245,245,245,.62)'; const line = luminance(bg) > 0.4 ? 'rgba(20,21,26,.12)' : 'rgba(255,255,255,.12)';
  const ex = (await Promise.all(kit.examples.slice(0, 3).map((u) => loadImg(u).catch(() => null)))).filter(Boolean) as HTMLImageElement[];
  const W = 1600, P = 80, H = ex.length ? 1440 : 1000;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!; g.fillStyle = bg; g.fillRect(0, 0, W, H); g.textBaseline = 'alphabetic';
  // header: logo + name + mood
  let x = P; const logo = kit.logo ? await loadImg(kit.logo.url).catch(() => null) : null;
  if (logo) { drawImg(g, logo, P, P - 8, 112, 112, 'contain'); x = P + 140; }
  g.fillStyle = fg; g.font = fontCss(kit.fonts.heading, 700, 64); g.fillText(fit(g, kit.name, W - x - P), x, P + 52);
  const mood = moodWords(kit.mood); g.fillStyle = sub; g.font = fontCss(kit.fonts.body, 500, 26); if (mood) g.fillText(fit(g, mood, W - x - P), x, P + 96);
  g.fillStyle = line; g.fillRect(P, P + 140, W - 2 * P, 2);
  // swatches
  const sy = P + 190; const n = Math.max(1, kit.colors.length); const gap = 20; const sw = Math.min(260, (W - 2 * P - gap * (n - 1)) / n);
  g.fillStyle = sub; g.font = fontCss(kit.fonts.body, 600, 20); g.fillText('COLOURS', P, sy - 16);
  if (!kit.colors.length) { g.fillStyle = sub; g.font = fontCss(kit.fonts.body, 500, 24); g.fillText('No colours yet', P, sy + 60); }
  kit.colors.forEach((col, i) => { const sx = P + i * (sw + gap);
    g.fillStyle = col.hex; rrect(g, sx, sy, sw, 200, 16); g.fill(); g.strokeStyle = line; g.lineWidth = 2; g.stroke();
    g.fillStyle = ink(col.hex); g.font = fontCss('JetBrains Mono', 600, 22); g.fillText(col.hex, sx + 16, sy + 184);
    if (col.role) { g.font = fontCss(kit.fonts.body, 600, 18); g.fillText(col.role.toUpperCase(), sx + 16, sy + 32); }
    g.fillStyle = fg; g.font = fontCss(kit.fonts.body, 600, 22); g.fillText(fit(g, col.name || colourWords(col.hex), sw), sx, sy + 236); });
  // fonts
  const fy = sy + 320; g.fillStyle = sub; g.font = fontCss(kit.fonts.body, 600, 20); g.fillText('TYPE', P, fy);
  const half = (W - 2 * P - 40) / 2;
  ([['Heading', kit.fonts.heading, 700, 72], ['Body', kit.fonts.body, 500, 30]] as const).forEach(([lbl, f, wt, px], i) => { const tx = P + i * (half + 40);
    g.fillStyle = fg; g.font = fontCss(f, wt, px); g.fillText(fit(g, i ? 'Imagination is all you need.' : 'Aa Bb Cc', half), tx, fy + 90);
    g.fillStyle = sub; g.font = fontCss(kit.fonts.body, 500, 22); g.fillText(`${lbl} · ${f || 'not set'}`, tx, fy + 134); });
  // do / don't
  const dy = fy + 200; const col2 = (lbl: string, lines: string[], tx: number) => { g.fillStyle = sub; g.font = fontCss(kit.fonts.body, 600, 20); g.fillText(lbl, tx, dy);
    g.fillStyle = fg; g.font = fontCss(kit.fonts.body, 500, 24); let yy = dy + 40; for (const l of lines.slice(0, 4)) { g.fillStyle = sub; g.fillText(lbl === 'DO' ? '+' : '–', tx, yy); g.fillStyle = fg; for (const w of wrap(g, l, half - 30, 2)) { g.fillText(w, tx + 26, yy); yy += 32; } yy += 6; }
    if (!lines.length) g.fillText('—', tx + 26, dy + 40); };
  col2('DO', kit.dos, P); col2('DON’T', kit.donts, P + half + 40);
  // examples
  if (ex.length) { const ey = dy + 210; g.fillStyle = sub; g.font = fontCss(kit.fonts.body, 600, 20); g.fillText('MADE WITH THIS KIT', P, ey);
    const ew = (W - 2 * P - 40) / 3; ex.forEach((im, i) => drawImg(g, im, P + i * (ew + 20), ey + 24, ew, 300, 'cover')); }
  g.fillStyle = sub; g.font = fontCss(kit.fonts.body, 500, 18); g.fillText('Made with Imagination Is All You Need · open source', P, H - 40);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Couldn’t draw the sheet.'))), 'image/png'));
}

/** A palette strip: one tall swatch per colour with its hex (a design tool's brand colours take hex, this is the picture of them). */
export async function drawPalette(kit: BrandKit): Promise<Blob> {
  await document.fonts?.ready.catch(() => undefined);
  const n = Math.max(1, kit.colors.length); const SW = 240, H = 360; const c = document.createElement('canvas'); c.width = SW * n; c.height = H; const g = c.getContext('2d')!;
  if (!kit.colors.length) { g.fillStyle = '#F6F5F2'; g.fillRect(0, 0, SW, H); }
  kit.colors.forEach((col, i) => { g.fillStyle = col.hex; g.fillRect(i * SW, 0, SW, H); g.fillStyle = ink(col.hex); g.font = fontCss('JetBrains Mono', 600, 26); g.fillText(col.hex, i * SW + 20, H - 28);
    g.font = fontCss('Manrope', 600, 20); g.fillText(fit(g, col.name || colourWords(col.hex), SW - 40), i * SW + 20, H - 64); });
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Couldn’t draw the palette.'))), 'image/png'));
}

/** Save a blob or text as a file (an <a download>; nothing leaves the computer). */
export function saveFile(data: Blob | string, name: string, type = 'application/json') {
  const b = typeof data === 'string' ? new Blob([data], { type }) : data; const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
}
