/**
 * Image to vector (SVG) (2026-11-03): any picture (PNG, JPG, WebP) in, one editable SVG out. Isomorphic (web imports it): model ids, the style choices,
 * the VTracer settings each style maps to, the size rules and how an SVG output is recognised.
 *
 *  Model                         Where                                         How                                                              Price
 *  VTracer (default)             Your computer, no ComfyUI                     visioncortex VTracer (MIT, Rust) through @neplex/vectorizer 0.1.0  free
 *                                                                              (MIT, napi-rs prebuilt binaries for macOS, Windows, Linux; WASI
 *                                                                              fallback). No graph: our own code calls the library (vectorTrace.ts)
 *  Ideogram Vector 1             Comfy Cloud, partner node                     official template api_ideogram_vector_1_image_to_svg:            30.17 Comfy credits
 *                                IdeogramVectorImageToSVGApi                   LoadImage → IdeogramVectorImageToSVGApi (model ideogram-vector-1,   per image (≈ $0.143)
 *                                                                              mode default) → SaveSVGNode (comfy/ideogramVectorCloud.ts)
 *
 * Sources (read 2026-11-03): docs.comfy.org/built-in-nodes/IdeogramVectorImageToSVGApi ("Images whose longest side is above 2048 pixels are downscaled before
 * upload"; transparent areas stay transparent); docs.comfy.org/tutorials/partner-nodes/pricing (Ideogram Vector Image to SVG 30.17 credits / SVG);
 * github.com/Comfy-Org/workflow_templates templates/api_ideogram_vector_1_image_to_svg.json (widgets "ideogram-vector-1", "default"; the image goes in
 * as model.image); github.com/visioncortex/vtracer (parameters and their defaults); npm @neplex/vectorizer (Config fields, AbortSignal cancel).
 *
 * Styles → VTracer (colour mode, stacked layers, spline curves in all three; VTracer's own defaults are precision 6, gradient step 16, speckle 4, corner 60°,
 * segment 4, splice 45°):
 *  Logo / flat    colorPrecision 4 · layerDifference 48 · filterSpeckle 10 · cornerThreshold 60 · lengthThreshold 4   few colours, small specks dropped, smooth
 *  Illustration   colorPrecision 6 · layerDifference 24 · filterSpeckle 4  · cornerThreshold 60 · lengthThreshold 4   more colours, VTracer's defaults otherwise
 *  Detailed       colorPrecision 8 · layerDifference 8  · filterSpeckle 2  · cornerThreshold 45 · lengthThreshold 3.5 every colour step kept, finer curves
 * Ideogram Vector picks its own detail: it always runs the template's mode "default" (the style applies to VTracer only).
 */
export const VECTOR_LOCAL = 'local-vtracer';
export const VECTOR_IDEOGRAM = 'cloud-ideogram-vector';
/** The workflow's models: VTracer first (free, on this computer), then Ideogram Vector on Comfy Cloud. */
export const VECTOR_MODELS = [VECTOR_LOCAL, VECTOR_IDEOGRAM];
export const VECTOR_TOOL = 'app-image-vector';
export const VECTOR_NODE = 'IdeogramVectorImageToSVGApi';
export const VECTOR_TEMPLATE = 'api_ideogram_vector_1_image_to_svg';
export const VECTOR_TEMPLATE_URL = `https://github.com/Comfy-Org/workflow_templates/blob/main/templates/${VECTOR_TEMPLATE}.json`;
export const VECTOR_NODE_DOC = `https://docs.comfy.org/built-in-nodes/${VECTOR_NODE}`;
export const VTRACER_URL = 'https://github.com/visioncortex/vtracer';
export const VECTORIZER_URL = 'https://github.com/neplextech/vectorizer';
/** Comfy partner-node price: 30.17 Comfy credits per SVG (211 credits = $1). */
export const IDEOGRAM_VECTOR_CREDITS = 30.17;

export type VectorStyle = 'logo' | 'illustration' | 'detailed';
export const VECTOR_STYLE_DEFAULT: VectorStyle = 'logo';
export const VECTOR_STYLES: { value: VectorStyle; label: string; line: string }[] = [
  { value: 'logo', label: 'Logo / flat', line: 'Few colours, smooth shapes' },
  { value: 'illustration', label: 'Illustration', line: 'More colours' },
  { value: 'detailed', label: 'Detailed', line: 'Keeps the most' },
];
/** VTracer settings per style (@neplex/vectorizer Config: colorMode 0 = colour, hierarchical 0 = stacked, mode 2 = spline). */
export const VTRACER_SETTINGS: Record<VectorStyle, { colorPrecision: number; layerDifference: number; filterSpeckle: number; cornerThreshold: number; lengthThreshold: number; spliceThreshold: number; maxIterations: number; pathPrecision: number }> = {
  logo: { colorPrecision: 4, layerDifference: 48, filterSpeckle: 10, cornerThreshold: 60, lengthThreshold: 4, spliceThreshold: 45, maxIterations: 10, pathPrecision: 2 },
  illustration: { colorPrecision: 6, layerDifference: 24, filterSpeckle: 4, cornerThreshold: 60, lengthThreshold: 4, spliceThreshold: 45, maxIterations: 10, pathPrecision: 2 },
  detailed: { colorPrecision: 8, layerDifference: 8, filterSpeckle: 2, cornerThreshold: 45, lengthThreshold: 3.5, spliceThreshold: 45, maxIterations: 10, pathPrecision: 2 },
};
export const vectorStyleOf = (v: unknown): VectorStyle => (VECTOR_STYLES.some((s) => s.value === v) ? v as VectorStyle : VECTOR_STYLE_DEFAULT);
export const vectorStyleLabel = (v: unknown) => VECTOR_STYLES.find((s) => s.value === vectorStyleOf(v))!.label;

/** Tracing reads at most this many pixels on the long side (bigger pictures are scaled down first, and the result says so). Same cap as Ideogram's upload. */
export const VECTOR_MAX_SIDE = 2048;
/** Smaller than this on either side is refused: there is nothing to trace. */
export const VECTOR_MIN_SIDE = 16;
/** Under this on the long side the shapes come out blocky: a note, not an error. */
export const VECTOR_SMALL_SIDE = 256;
export type VectorBlock = { code: string; message: string } | null;
/** Picture checks shared by the submit and the bar (null = fine). */
export function vectorPhotoBlock(src: { width: number; height: number } | null | undefined): VectorBlock {
  if (!src || !(src.width > 0 && src.height > 0)) return null;
  if (Math.min(src.width, src.height) < VECTOR_MIN_SIDE) return { code: 'photo_too_small', message: `This picture is ${src.width}×${src.height}; tracing needs at least ${VECTOR_MIN_SIDE} px on each side.` };
  return null;
}
/** The size tracing reads: the picture, scaled down to VECTOR_MAX_SIDE on the long side when bigger. */
export function vectorTraceSize(w: number, h: number): { width: number; height: number; scaled: boolean } {
  const long = Math.max(w, h); if (long <= VECTOR_MAX_SIDE) return { width: w, height: h, scaled: false };
  const k = VECTOR_MAX_SIDE / long; return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)), scaled: true };
}
/** Calm notes for the result (never errors). */
export const VECTOR_NOTES = {
  scaled: (w: number, h: number, t: { width: number; height: number }) => `Your picture is ${w}×${h}; it was traced at ${t.width}×${t.height}. The SVG scales to any size.`,
  small: (w: number, h: number) => `Your picture is small (${w}×${h}); the shapes may look blocky. A bigger picture traces cleaner.`,
  photo: 'This looks like a photo. Tracing works best on flat art like logos, icons and illustrations; a photo becomes many small shapes.',
  ideogramStyle: 'Ideogram Vector picks its own level of detail; the style applies to VTracer.',
} as const;

/** An SVG result URL (/files/<job>-out0.svg …). SVGs show as pictures (<img>, same-origin, served image/svg+xml in a sandbox) but are never
 *  offered to a model as an input: no model here takes SVG. */
export const isVectorUrl = (u: unknown): boolean => /\.svg(\?|#|$)/i.test(String(u ?? '').trim());
/** Output files the app writes for vector results: <job id>-out<n>.svg at the top of the data folder (security/localOnly.ts, uploadSecurity.ts). */
export const VECTOR_FILE_RE = /^[0-9a-z]{6,40}-out\d{1,3}\.svg$/i;
export const isVectorJob = (job: { toolId?: string; input?: any } | null | undefined) => !!job && (job.toolId === VECTOR_TOOL || !!job.input?.vector);

/**
 * Untrusted SVG (a Comfy Cloud result) made safe to keep: no scripts, no event handlers, no foreignObject / iframe / embed, no external or javascript:
 * links, no <!DOCTYPE> / entities, no processing instructions except the XML declaration. Shapes, paths, groups, gradients and styles stay.
 * Belt and braces: the app only ever shows an SVG through <img> (scripts never run there) and serves it with a sandbox CSP.
 */
export function sanitizeSvg(svg: string): string {
  let s = String(svg ?? '');
  s = s.replace(/<!DOCTYPE[\s\S]*?(\[[\s\S]*?\])?\s*>/gi, '').replace(/<!ENTITY[\s\S]*?>/gi, '');
  s = s.replace(/<\?(?!xml\s)[\s\S]*?\?>/gi, '');
  for (const tag of ['script', 'foreignObject', 'iframe', 'embed', 'object', 'audio', 'video', 'handler', 'listener', 'animate', 'set', 'animateTransform', 'animateMotion']) {
    s = s.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '').replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '');
  }
  s = s.replace(/\s(on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // links: only in-document (#id) or embedded raster data; anything else (http:, javascript:, file:, data:text/html…) is dropped
  s = s.replace(/\s((?:xlink:)?href)\s*=\s*("([^"]*)"|'([^']*)')/gi, (m, _a, _q, d1, d2) => { const v = String(d1 ?? d2 ?? '').trim();
    return /^#[\w.-]+$/.test(v) || /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(v) ? m : ''; });
  s = s.replace(/url\(\s*(['"]?)\s*(?!#)[^)]*\)/gi, 'none');
  s = s.replace(/@import[^;]*;?/gi, '').replace(/expression\s*\(/gi, '(');
  return s;
}
