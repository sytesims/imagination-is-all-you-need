/**
 * Jobs with several results (2026-10-25): Camera Angles (one image per angle), Create Image batches (2–4), Image to layers, Character Sheet
 * runs, video takes. ONE card treatment (FeedCard + ResultMosaic) and ONE viewer strip (ResultStrip / ResultGrid in shared/MultiResult.tsx; styles shared/multiResult.css)
 * read the rules here; what differs per workflow is data (PRESENTATIONS), never a look-alike copy of the components.
 * Pure (no React), so tests import it.
 */
import { isLayerJob } from '../../../server/src/shared/imageLayers';

export type MultiKind = 'angles' | 'batch' | 'layers' | 'sheet' | 'takes';
export interface Presentation {
  kind: MultiKind;
  /** the badge's noun: "9 angles", "4 images", "6 layers" */ noun: [string, string];
  /** thumbnails and grid cells: crop to fill (photos) or show whole (wide sheets, transparent layers) */ fit: 'cover' | 'contain';
  /** the feed card: a mosaic of up to 4 results, or the first (or composite) result alone with the count badge */ card: 'mosaic' | 'hero';
  /** names under the thumbnails and in the saved grid (angle names, layer names); off → "Image 1", "Image 2" in the strip only */ labels: boolean;
  /** the viewer offers "Compare with your photo" when the job has an input photo */ compare: boolean;
  /** the viewer's Grid offers "Save grid as one image" */ saveGrid: boolean;
  /** transparent results: a checkerboard behind them */ alpha: boolean;
  /** the viewer's filmstrip (layers use the panel's layer list instead) */ strip: boolean;
}
const base: Omit<Presentation, 'kind' | 'noun'> = { fit: 'cover', card: 'mosaic', labels: true, compare: false, saveGrid: true, alpha: false, strip: true };
/** Per workflow. Defaults: mosaic card, cropped thumbs, labels, Save grid. The exceptions say why. */
export const PRESENTATIONS: Record<MultiKind, Presentation> = {
  /* nine views of one subject: a 3×3 contact sheet in angle order is the natural "sheet"; compare each angle with the photo it came from */
  angles: { ...base, kind: 'angles', noun: ['angle', 'angles'], compare: true },
  /* variants of one prompt: no names worth showing; compare only for an edit of your photo (compareSourceOf decides) */
  batch: { ...base, kind: 'batch', noun: ['image', 'images'], labels: false },
  /* transparent PNGs the size of the picture: shown whole on a checkerboard; the card is the composite (a mosaic of cut-outs reads as noise);
   * the panel's layer list is the per-layer list (show / hide, outline, download, ZIP, PSD), so no strip and no Save grid */
  layers: { ...base, kind: 'layers', noun: ['layer', 'layers'], fit: 'contain', card: 'hero', alpha: true, saveGrid: false, strip: false },
  /* one wide sheet (16:9 full sheet, 21:9 turnaround + face): never chopped into a mosaic or cropped; compare with your photo */
  sheet: { ...base, kind: 'sheet', noun: ['sheet', 'sheets'], fit: 'contain', card: 'hero', labels: false, compare: true },
  /* clips: posters in the strip; a canvas sheet of clips isn't a thing */
  takes: { ...base, kind: 'takes', noun: ['clip', 'clips'], saveGrid: false },
};

type JobLike = { toolId?: string; status?: string; input?: any; outputs?: any[] | null; resultUrl?: string | null };
const VIDEO = /\.(mp4|webm|mov|m4v|mkv)($|\?)/i; const AUDIO = /\.(mp3|wav|m4a|aac|ogg|oga|flac|opus)($|\?)/i;
export const isActiveJob = (j: JobLike) => j.status === 'queued' || j.status === 'running';

export function kindOf(j: JobLike): MultiKind {
  if (isLayerJob(j as any) || j.toolId === 'app-image-layers') return 'layers';
  if (j.toolId === 'app-shots' || (Array.isArray(j.input?.shots) && j.input.shots.length)) return 'angles';
  if (j.toolId === 'app-character-sheet') return 'sheet';
  if ((j.outputs ?? []).some((o) => VIDEO.test(String(o?.url ?? '')))) return 'takes';
  return 'batch';
}
export const presentationOf = (j: JobLike): Presentation => PRESENTATIONS[kindOf(j)];

export type ResultItem = { url: string | null; label: string; state: 'done' | 'failed' | 'running'; kind: 'image' | 'video';
  /** its index in job.outputs (the viewer's output number); null for one that didn't render or is still being made */ out: number | null; poster?: string | null; w?: number; h?: number };

/** Every result of a job in order (Camera Angles: the angles as picked): what came back, an angle the server didn't return ("failed"),
 *  and the ones still being made ("running"). */
export function resultItems(j: JobLike): ResultItem[] {
  const all = j.outputs ?? []; const shots: { id?: string; label?: string }[] | null = Array.isArray(j.input?.shots) && j.input.shots.length ? j.input.shots.slice(0, 9) : null;
  const active = isActiveJob(j); const done = j.status === 'done';
  const got: ResultItem[] = all.map((o, k) => ({ o, k })).filter(({ o }) => o && typeof o.url === 'string' && !AUDIO.test(o.url)).map(({ o, k }) => ({ url: o.url, label: String(o.label ?? '').trim(), state: 'done' as const,
    kind: VIDEO.test(o.url) ? 'video' as const : 'image' as const, out: k, poster: o.posterUrl ?? null, ...(Number(o.width) > 0 && Number(o.height) > 0 ? { w: Number(o.width), h: Number(o.height) } : {}) }));
  if (!got.length && done && j.resultUrl) got.push({ url: j.resultUrl, label: '', state: 'done', kind: VIDEO.test(j.resultUrl) ? 'video' : 'image', out: 0 });
  if (shots) {
    const left = [...got]; const items: ResultItem[] = [];
    for (const s of shots) { const i = left.findIndex((x) => x.label === s.label); if (i >= 0) { items.push(left.splice(i, 1)[0]); continue; }
      if (s.label && (active || (done && got.length))) items.push({ url: null, label: s.label, state: active ? 'running' : 'failed', kind: 'image', out: null }); }
    return [...items, ...left];
  }
  const items = got;
  if (active && kindOf(j) === 'batch') {
    const want = Math.max(1, Math.min(8, Number(j.input?.n ?? j.input?.count) || 1));
    for (let k = items.length; k < want; k++) items.push({ url: null, label: '', state: 'running', kind: 'image', out: null });
  }
  return items;
}
/** The name under a thumbnail: the result's own (an angle, a layer), else "Image 2" / "Clip 2". */
export const itemLabel = (it: ResultItem, k: number, p: Presentation) => (p.labels && it.label) || `${p.kind === 'takes' ? 'Clip' : p.kind === 'sheet' ? 'Sheet' : 'Image'} ${k + 1}`;
/** "9 angles", "1 image" */
export const countText = (n: number, p: Presentation) => `${n} ${n === 1 ? p.noun[0] : p.noun[1]}`;
/** The card's badge: "9 angles", or "7 of 9 angles" when some didn't render, or "3 of 9 angles" while it is still making them. */
export function badgeText(items: ResultItem[], p: Presentation): string {
  const ok = items.filter((x) => x.state === 'done').length; return ok === items.length ? countText(items.length, p) : `${ok} of ${countText(items.length, p)}`;
}

/** Card mode: the presentation's, except that wide results (≥ 2:1, 21:9 panoramas) are never chopped into half-width slivers: two or three of
 *  them show the first alone with the badge; four or more still tile 2×2 (each tile keeps the card's own shape, so nothing is cut). */
export const cardModeOf = (p: Presentation, ar: number, n = 4): 'mosaic' | 'hero' => p.card === 'hero' || (ar >= 2 && n < 4) ? 'hero' : 'mosaic';
/** The card mosaic: 2 side by side, 3 as one large + two stacked, 4+ as 2×2 with "+N" on the last tile. */
export function mosaicOf(n: number): { show: number; more: number; layout: 'm1' | 'm2' | 'm3' | 'm4' } {
  if (n <= 1) return { show: 1, more: 0, layout: 'm1' };
  if (n === 2) return { show: 2, more: 0, layout: 'm2' };
  if (n === 3) return { show: 3, more: 0, layout: 'm3' };
  return { show: 4, more: n - 4, layout: 'm4' };
}

/**
 * Columns for a contact sheet of `n` results of shape `ar` (width / height) in a box of shape `target`: the count whose sheet is closest to the
 * box, with empty cells costing extra, so 9 → 3×3, 4 → 2×2, 2 square → side by side, 2 wide sheets → stacked.
 */
export function gridCols(n: number, ar = 1, target = 1.4): number {
  if (n <= 1) return 1; const a = ar > 0 && isFinite(ar) ? ar : 1; let best = 1, score = Infinity;
  for (let c = 1; c <= Math.min(n, 8); c++) { const rows = Math.ceil(n / c); const empty = rows * c - n; if (empty >= c) continue;
    const s = Math.abs(Math.log(((c * a) / rows) / target)) + 0.35 * empty; if (s < score - 1e-9) { score = s; best = c; } }
  return best;
}

/** Where every cell goes on a saved grid image: cells of `cellW`×`cellH` (+ a label strip under each when `labelH` > 0), `gap` between, `pad` around. */
export function sheetLayout(n: number, cols: number, cellW: number, cellH: number, gap = 16, pad = 32, labelH = 0) {
  const c = Math.max(1, Math.min(cols, n)); const rows = Math.ceil(n / c);
  const w = Math.round(pad * 2 + c * cellW + (c - 1) * gap); const h = Math.round(pad * 2 + rows * (cellH + labelH) + (rows - 1) * gap);
  const cells = Array.from({ length: n }, (_, k) => ({ x: Math.round(pad + (k % c) * (cellW + gap)), y: Math.round(pad + Math.floor(k / c) * (cellH + labelH + gap)) }));
  return { w, h, cols: c, rows, cells };
}
/** A cell size for the saved grid: the results' own shape, the longer side `max` px, and never a canvas wider or taller than `limit`. */
export function sheetCell(ar: number, cols: number, rows: number, max = 768, limit = 8192): { w: number; h: number } {
  const a = ar > 0 && isFinite(ar) ? ar : 1; let w = a >= 1 ? max : Math.round(max * a); let h = a >= 1 ? Math.round(max / a) : max;
  const k = Math.min(1, (limit - 200) / (cols * w), (limit - 200) / (rows * h)); w = Math.max(1, Math.floor(w * k)); h = Math.max(1, Math.floor(h * k));
  return { w, h };
}
/** Number keys in the viewer: 1–9 pick that result; 0 picks the tenth. null for other keys or past the end. */
export function digitPick(key: string, n: number): number | null {
  if (!/^[0-9]$/.test(key)) return null; const k = key === '0' ? 9 : Number(key) - 1; return k < n ? k : null;
}

/** resultItems, the same array for the same job object (useFeed keeps an unchanged job's object), so a memoised feed card sees equal props. */
const itemsCache = new WeakMap<object, ResultItem[]>();
export function resultItemsOf(j: JobLike): ResultItem[] { let v = itemsCache.get(j); if (!v) { v = resultItems(j); itemsCache.set(j, v); } return v; }
