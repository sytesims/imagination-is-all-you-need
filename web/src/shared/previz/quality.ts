/**
 * Graphics quality for Direct a Shot's Simple view (2026-10-27): Low / Medium / High / Ultra, one setting for every preset and the open city,
 * remembered per browser. Picked once from the measured frame time the first time the city opens (pickQuality), then yours to change in the
 * view menu (and on the city map). Clay and Depth always draw as Low: they are the guides for Layout to Render and never change.
 *  - Low: the look before this (matte Lambert kit, the gradient sky, 2048 shadows, no post). Browsers with small texture limits stay here; WebGL1-class ones stop at Medium.
 *  - Medium: in the open city, PBR (standard) materials, a seeded tint per building, glassy windows that mirror the sky, road wear and
 *    paving lines, the Sky shader by day with a matching environment map, closer haze. No post, so it stays cheap (Explore's live tile
 *    uses it). The small presets keep their own designed light (an environment map washed them out), so for them Medium looks like Low.
 *  - High: Medium + ambient occlusion (GTAO, half size) and bloom on lamps, signals and lit windows, 4096 shadows, MSAA in the HDR
 *    buffer (every preset).
 *  - Ultra: High with full-size AO, a longer view, shadows further out and more people. May dip below 60 fps on smaller graphics chips.
 * Pure (no three.js): tests read QUALITY and pickQuality directly.
 */
export type Quality = 'low' | 'medium' | 'high' | 'ultra';
export const QUALITIES: Quality[] = ['low', 'medium', 'high', 'ultra'];
export interface QualityPreset {
  /** standard materials, building tints, glass, road detail */ pbr: boolean;
  /** the Sky shader (day and golden hour) and a matching environment map */ sky: boolean;
  /** sun shadow map size */ shadowMap: number;
  /** post: none, or AO (0 = off, 0.5 = half size, 1 = full) + bloom through an HDR buffer */ ao: number; bloom: boolean; msaa: number;
  /** the open city's distances (metres): cells, details, trees, shadow casters, the shadow box's half size */ dist: { far: number; detail: number; trees: number; shadow: number; box: number };
  /** the most people drawn at Busy (Some shows ~60 % of it) */ crowd: number;
}
export const QUALITY: Record<Quality, QualityPreset> = {
  low: { pbr: false, sky: false, shadowMap: 2048, ao: 0, bloom: false, msaa: 0, dist: { far: 760, detail: 260, trees: 470, shadow: 150, box: 95 }, crowd: 24 },
  medium: { pbr: true, sky: true, shadowMap: 2048, ao: 0, bloom: false, msaa: 0, dist: { far: 760, detail: 260, trees: 470, shadow: 150, box: 95 }, crowd: 24 },
  high: { pbr: true, sky: true, shadowMap: 4096, ao: 0.5, bloom: true, msaa: 4, dist: { far: 760, detail: 260, trees: 470, shadow: 150, box: 95 }, crowd: 24 },
  ultra: { pbr: true, sky: true, shadowMap: 4096, ao: 1, bloom: true, msaa: 4, dist: { far: 960, detail: 340, trees: 620, shadow: 220, box: 120 }, crowd: 32 },
};
export const QUALITY_LABEL: Record<Quality, string> = { low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra' };
export const QUALITY_HINT: Record<Quality, string> = {
  low: 'Flat colours and soft shadows. The lightest on your graphics card.',
  medium: 'Real materials and a real sky in the open city.',
  high: 'Adds soft contact shadows and glowing lamps.',
  ultra: 'Sees further, with more people. Can drop below 60 fps.',
};
/** what a browser can do: WebGL1-class contexts (no float buffers, no MSAA targets) stop at Medium; small textures stop at Low */
export function capQuality(q: Quality, caps: { webgl2: boolean; maxTexture: number }): Quality {
  const i = QUALITIES.indexOf(q); const max = caps.maxTexture < 4096 ? 0 : !caps.webgl2 ? 1 : 3; return QUALITIES[Math.min(i, max)];
}
/** the first-load pick from the measured time of one High frame (ms, at the size the view draws): measured with a full GPU sync each frame, so a little slower than the live view: High at about 60 fps passes */
export function pickQuality(highMs: number): Quality { return highMs <= 9 ? 'ultra' : highMs <= 18 ? 'high' : highMs <= 30 ? 'medium' : 'low'; }

// ---- the setting (a per-browser convenience; private windows fall back to the measured pick for the page) ----
const KEY = 'ohf:previz-quality'; const OLD = 'ohf:city-quality';
const read = (): Quality | null => { try { const v = localStorage.getItem(KEY); if (QUALITIES.includes(v as Quality)) return v as Quality; return localStorage.getItem(OLD) === 'fast' ? 'low' : null; } catch { return null; } };
let current: Quality | null = read();
const subs = new Set<(q: Quality) => void>();
/** the chosen quality, or null before the first pick */
export const storedQuality = () => current;
export const previzQuality = (): Quality => current ?? 'medium';
export function setPrevizQuality(q: Quality) { current = q; try { localStorage.setItem(KEY, q); } catch { /* private window */ } subs.forEach((f) => f(q)); }
export function onPrevizQuality(f: (q: Quality) => void) { subs.add(f); return () => { subs.delete(f); }; }
