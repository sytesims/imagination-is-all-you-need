/**
 * ComfyUI core's ResolutionSelector (comfy_extras): its aspect_ratio options, word for word. One list for every route: Comfy Cloud's
 * GET /object_info (saved 2026-10-26) and a current local ComfyUI report the same eight labels, so local and cloud never differ.
 * "9:16 (Portrait)" is NOT one of them: Cloud refused it (2026-10-27); the portrait label is "9:16 (Portrait Widescreen)".
 */
export const RESOLUTION_SELECTOR_ASPECTS = ['1:1 (Square)', '2:3 (Portrait Photo)', '3:2 (Photo)', '3:4 (Portrait Standard)', '4:3 (Standard)',
  '9:16 (Portrait Widescreen)', '16:9 (Widescreen)', '21:9 (Ultrawide)'] as const;
/** Our aspect id ('16:9') → the node's label. Unknown / 'auto' → the fallback (16:9 for video). */
export function resolutionSelectorAspect(aspect: string | null | undefined, fallback = '16:9'): string {
  const pick = (a: string) => RESOLUTION_SELECTOR_ASPECTS.find((o) => o.startsWith(`${a} (`));
  return pick(String(aspect ?? '')) ?? pick(fallback)!;
}
