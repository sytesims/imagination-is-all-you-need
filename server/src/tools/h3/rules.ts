/**
 * MiniMax H3 runtime rules (2026-10-17). Mirrors scripts/h3_rules.py (static graph checks in validate-workflows.py).
 *   frames = 17n+5 at 24 fps · width/height multiples of 32 · area ≤ 1344×768 (open weights) · LoRA family must match the base (fl2va | ref2va),
 *   and full-build LoRAs don't go on pruned bases. Documented exception: the akatz Character Swap recipe (Ref2VA + FL2V turbo 8-step at 1.0).
 */
export const H3_FPS = 24;
export const H3_AREA_CAP = 1344 * 768;
export type H3Family = 'fl2va' | 'ref2va';
export const framesOk = (n: number) => Number.isInteger(n) && n >= 5 && (n - 5) % 17 === 0;
/** Seconds → frame count on the 17n+5 grid (same formula as the graphs' ComfyMathExpression: round up). */
export function h3Frames(sec: number): number { const f = Math.max(5, Math.round(sec * H3_FPS)); return f + ((5 - (f % 17)) % 17 + 17) % 17; }
const ASPECTS: Record<string, [number, number]> = { '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1], '4:3': [4, 3], '3:4': [3, 4], '21:9': [21, 9] };
/** Largest 32-multiple size for the aspect under the area budget (768p class = the 1344×768 cap, 480p ≈ 0.4 MP). */
export function h3Size(aspect = '16:9', resolution = '768p'): { width: number; height: number } {
  const [a, b] = ASPECTS[aspect] ?? ASPECTS['16:9']; const budget = resolution === '480p' ? 0.4e6 : H3_AREA_CAP;
  if (aspect === '16:9' && budget === H3_AREA_CAP) return { width: 1344, height: 768 };
  if (aspect === '9:16' && budget === H3_AREA_CAP) return { width: 768, height: 1344 };
  let best = { width: 32, height: 32 };
  for (let h = 32; h <= 2048; h += 32) { const w = Math.floor((h * a) / b / 32) * 32; if (w >= 32 && w * h <= budget && w * h > best.width * best.height) best = { width: w, height: h }; }
  return best;
}
export function sizeIssues(w: number, h: number): string[] {
  const out: string[] = [];
  if (w % 32 || h % 32) out.push(`${w}×${h}: width and height must be multiples of 32`);
  if (w * h > H3_AREA_CAP) out.push(`${w}×${h} is over the H3 open-weights area cap (1344×768)`);
  return out;
}
export const familyOf = (file: string): H3Family | null => (/ref2v/i.test(file) ? 'ref2va' : /fl2v/i.test(file) ? 'fl2va' : null);
const ALLOW_CROSS = new Set(['ref2va|minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors']);
/** LoRA/base compatibility. `family` overrides the filename guess (catalog entries know their base). */
export function loraIssues(base: string, loras: { file: string; family?: H3Family | null; fullBuild?: boolean }[]): string[] {
  const bf = familyOf(base); const out: string[] = [];
  for (const l of loras) {
    const lf = l.family ?? familyOf(l.file);
    if (bf && lf && lf !== bf && !ALLOW_CROSS.has(`${bf}|${l.file}`)) out.push(`LoRA ${l.file} is for ${lf}, base ${base} is ${bf}`);
    if (/pruned/i.test(base) && l.fullBuild) out.push(`LoRA ${l.file} was trained on the full (non-pruned) build; it loses its adaln part on ${base}`);
  }
  return out;
}
