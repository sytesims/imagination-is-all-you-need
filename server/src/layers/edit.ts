/**
 * Video to layers: changing the layers of a split (move, scale, hide, recolour; text behind or in front). Isomorphic and pure: the viewer
 * previews the same numbers the render uses (editRender.ts).
 *  - Move and scale: about the frame's centre, then moved by (x, y) in pixels of the split's frame. Static in v1 (no keyframes).
 *  - Recolour: hue (degrees), saturation and brightness (×), on the original footage inside the layer's matte, before the move.
 *  - Text: a full-frame transparent picture the browser draws (the app's own fonts), placed "in front" or "behind <layer>" (just under it).
 */

export interface LayerEdit { id: number; hidden?: boolean; x?: number; y?: number; scale?: number; hue?: number; saturation?: number; brightness?: number }
export interface TextItem { text: string; font: string; colour: string; size: number; x: number; y: number; /** 'front', or the layer id it sits behind */ slot: 'front' | number }
export interface LayersEditSpec { layers: LayerEdit[]; texts: TextItem[] }

/** The app's own fonts (styles.css / tokens.css): id → CSS family and weight. */
export const TEXT_FONTS = [
  { id: 'display', label: 'Space Grotesk', css: "'Space Grotesk'", weight: 700 },
  { id: 'sans', label: 'Inter', css: 'Inter', weight: 600 },
  { id: 'round', label: 'Manrope', css: 'Manrope', weight: 700 },
  { id: 'mono', label: 'JetBrains Mono', css: "'JetBrains Mono'", weight: 500 },
] as const;
export const MAX_TEXTS = 4;
export const LIMITS = { scale: [0.2, 3], hue: [-180, 180], saturation: [0, 3], brightness: [0.2, 2], size: [12, 240] } as const;

const num = (v: unknown, d: number, [lo, hi]: readonly [number, number]) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };

/** A spec from a form value, checked and clamped against the split's own layers (unknown ids dropped). Throws a plain message. */
export function normEdit(raw: unknown, layerIds: number[], frame: { width: number; height: number }): LayersEditSpec {
  let v: any = raw; if (typeof v === 'string') { try { v = JSON.parse(v); } catch { throw new Error('The changes could not be read.'); } }
  if (!v || typeof v !== 'object') throw new Error('The changes could not be read.');
  const W = frame.width, H = frame.height;
  const layers: LayerEdit[] = (Array.isArray(v.layers) ? v.layers : []).filter((l: any) => layerIds.includes(Number(l?.id))).map((l: any) => ({
    id: Number(l.id), hidden: !!l.hidden, x: Math.round(num(l.x, 0, [-W, W])), y: Math.round(num(l.y, 0, [-H, H])), scale: num(l.scale, 1, LIMITS.scale),
    hue: Math.round(num(l.hue, 0, LIMITS.hue)), saturation: num(l.saturation, 1, LIMITS.saturation), brightness: num(l.brightness, 1, LIMITS.brightness) }));
  const texts: TextItem[] = (Array.isArray(v.texts) ? v.texts : []).slice(0, MAX_TEXTS).map((t: any) => ({
    text: String(t?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 80), font: TEXT_FONTS.some((f) => f.id === t?.font) ? String(t.font) : TEXT_FONTS[0].id,
    colour: /^#[0-9a-f]{6}$/i.test(String(t?.colour)) ? String(t.colour) : '#ffffff', size: Math.round(num(t?.size, 64, LIMITS.size)),
    x: Math.round(num(t?.x, W / 2, [0, W])), y: Math.round(num(t?.y, H / 2, [0, H])), slot: t?.slot === 'front' || !layerIds.includes(Number(t?.slot)) ? 'front' as const : Number(t.slot) }))
    .filter((t: TextItem) => t.text);
  return { layers, texts };
}
export const isChanged = (e: LayerEdit) => !!e.hidden || !!e.x || !!e.y || (e.scale ?? 1) !== 1 || !!e.hue || (e.saturation ?? 1) !== 1 || (e.brightness ?? 1) !== 1;

/** The stacking order after the edit, bottom first: the split's layers (bottom first), each preceded by the texts placed behind it; texts
 *  "in front" last. Hidden layers stay in the list (the render skips them; a text behind a hidden layer keeps its place). */
export type StackItem = { kind: 'layer'; id: number } | { kind: 'text'; index: number };
export function stackOrder(bottomUp: number[], texts: Pick<TextItem, 'slot'>[]): StackItem[] {
  const out: StackItem[] = [];
  for (const id of bottomUp) { texts.forEach((t, k) => { if (t.slot === id) out.push({ kind: 'text', index: k }); }); out.push({ kind: 'layer', id }); }
  texts.forEach((t, k) => { if (t.slot === 'front') out.push({ kind: 'text', index: k }); });
  return out;
}

/** ffmpeg filter for one layer's colour (hue in degrees, saturation ×, brightness ×, the CSS filter's meaning). '' = unchanged. */
export function colourFilter(e: Pick<LayerEdit, 'hue' | 'saturation' | 'brightness'>): string {
  const f: string[] = []; const h = e.hue ?? 0, s = e.saturation ?? 1, b = e.brightness ?? 1;
  if (h || s !== 1) f.push(`hue=h=${h}:s=${+s.toFixed(3)}`);
  if (b !== 1) f.push(`lutrgb=r='clip(val*${+b.toFixed(3)},0,255)':g='clip(val*${+b.toFixed(3)},0,255)':b='clip(val*${+b.toFixed(3)},0,255)'`);
  return f.join(',');
}
/** ffmpeg filter that scales a full frame about its centre and moves it by (x, y), onto a W×H canvas of `bg` (black = nothing). Output label [out]. */
export function placeFilter(input: string, e: Pick<LayerEdit, 'x' | 'y' | 'scale'>, W: number, H: number, out: string, fps: number, fmt: 'gray' | 'rgb24'): string {
  const s = e.scale ?? 1; const sw = Math.max(2, Math.round((W * s) / 2) * 2), sh = Math.max(2, Math.round((H * s) / 2) * 2);
  const ox = Math.round((W - sw) / 2 + (e.x ?? 0)), oy = Math.round((H - sh) / 2 + (e.y ?? 0));
  if (s === 1 && !e.x && !e.y) return `${input}format=${fmt}${out}`;
  return `color=black:s=${W}x${H}:r=${fps},format=${fmt}[c_${out.slice(1, -1)}];${input}scale=${sw}:${sh},format=${fmt}[s_${out.slice(1, -1)}];[c_${out.slice(1, -1)}][s_${out.slice(1, -1)}]overlay=${ox}:${oy}:shortest=1,format=${fmt}${out}`;
}
/** The plain summary a rendered result carries ("woman moved and recoloured, neon sign hidden, 1 text"). */
export function editSummary(spec: LayersEditSpec, names: Record<number, string>): string {
  const parts = spec.layers.filter(isChanged).map((e) => { const w: string[] = [];
    if (e.hidden) w.push('hidden'); else { if (e.x || e.y) w.push('moved'); if ((e.scale ?? 1) !== 1) w.push('scaled'); if (e.hue || (e.saturation ?? 1) !== 1 || (e.brightness ?? 1) !== 1) w.push('recoloured'); }
    return `${names[e.id] ?? `layer ${e.id + 1}`} ${w.join(' and ')}`; });
  if (spec.texts.length) parts.push(spec.texts.length === 1 ? `text “${spec.texts[0].text}”` : `${spec.texts.length} texts`);
  return parts.join(', ') || 'no changes';
}
