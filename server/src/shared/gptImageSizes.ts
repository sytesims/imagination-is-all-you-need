/**
 * GPT Image sizes (gpt-image-2, gpt-image-2.5-flare, gpt-image-2.5-sunburst), one table for every route (Comfy Router and OpenAI direct).
 * Isomorphic, no imports: shared/imageCaps.ts (the bar's shapes and sizes), shared/hostedPrices.ts (the quote), routing/routerModels.ts and
 * providers/openai.ts (the request body) all read it, so what the bar offers, what we price and what we send are the same size.
 *
 * Sources (read 2026-10-24):
 * - Comfy Router model pages (docs.comfy.org/development/comfy-router/models/openai/gpt-image-2/code, …/gpt-image-2-5-flare/code, …/gpt-image-2-5-sunburst/code):
 *   `size` is a free string ("e.g. 1024x1024, 1536x1024, auto"), quality auto / low / medium / high / xhigh / max, n 1–10, up to 16 images.
 * - OpenAI image guide (developers.openai.com/api/docs/guides/image-generation): custom WIDTHxHEIGHT for gpt-image-2 and 2.5: both edges multiples
 *   of 16, long:short ≤ 3:1, longest edge ≤ 3840, 655,360–8,294,400 pixels; recommended 1024x1024, 1536x1024, 1024x1536; above 2560x1440 is
 *   "experimental". Quality: gpt-image-2 low / medium / high; 2.5 adds xhigh / max.
 * - Comfy partner node OpenAIGPTImageNodeV2 (docs.comfy.org/built-in-nodes/OpenAIGPTImageNodeV2): size presets for gpt-image-2 and 2.5:
 *   1024x1024, 1024x1536, 1536x1024, 2048x2048, 2048x1152, 1152x2048, 3840x2160, 2160x3840, or Custom under the same rules.
 *
 * Our sizes: every shape at its exact ratio (both edges multiples of 16). 1K = the largest that fits 1536×1024 (either way round), 2K = the largest
 * with no edge over 2048, 4K = the largest within the 3840 edge and 8,294,400 pixel limits. That lands on all eight Comfy node presets.
 * A shape or size not in this table is refused (never snapped to a neighbour).
 */
export type GptRes = '1K' | '2K' | '4K';
export const GPT_IMAGE_ASPECTS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'] as const;
export const GPT_IMAGE_RESOLUTIONS: GptRes[] = ['1K', '2K', '4K'];
export const GPT_SIZE_RULES = { step: 16, maxEdge: 3840, minPixels: 655_360, maxPixels: 8_294_400, maxRatio: 3, experimentalAbovePixels: 2560 * 1440 } as const;
export const GPT_IMAGE_SIZES: Record<GptRes, Record<string, string>> = {
  '1K': { '1:1': '1024x1024', '2:3': '1024x1536', '3:2': '1536x1024', '3:4': '1008x1344', '4:3': '1344x1008', '4:5': '1024x1280', '5:4': '1280x1024', '9:16': '864x1536', '16:9': '1536x864', '21:9': '1456x624' },
  '2K': { '1:1': '2048x2048', '2:3': '1344x2016', '3:2': '2016x1344', '3:4': '1536x2048', '4:3': '2048x1536', '4:5': '1600x2000', '5:4': '2000x1600', '9:16': '1152x2048', '16:9': '2048x1152', '21:9': '2016x864' },
  '4K': { '1:1': '2880x2880', '2:3': '2336x3504', '3:2': '3504x2336', '3:4': '2448x3264', '4:3': '3264x2448', '4:5': '2560x3200', '5:4': '3200x2560', '9:16': '2160x3840', '16:9': '3840x2160', '21:9': '3808x1632' },
};
export const GPT_SIZES_SOURCE = 'https://developers.openai.com/api/docs/guides/image-generation (custom sizes: ×16, ≤3:1, ≤3840, 655,360–8,294,400 px) + https://docs.comfy.org/built-in-nodes/OpenAIGPTImageNodeV2 (size presets, quality enums) + https://docs.comfy.org/development/comfy-router/models/openai/gpt-image-2-5-flare/code (size string, quality enum), read 2026-10-24';
/** The exact "WxH" for a shape and size, or null when we don't offer it. */
export const gptImageSize = (aspect: string | null | undefined, res: string | null | undefined): string | null => GPT_IMAGE_SIZES[(res ?? '1K') as GptRes]?.[aspect ?? ''] ?? null;
export const gptWH = (size: string) => { const [w, h] = size.split('x').map(Number); return { width: w, height: h }; };
/** GPT Image 1.5 (openai/gpt-image-1.5, checked 2026-10-25): the fixed sizes only. Comfy's OpenAIGPTImage1 node page (docs.comfy.org/built-in-nodes/OpenAIGPTImage1):
 *  "The gpt-image-1 and gpt-image-1.5 models only support the sizes auto, 1024x1024, 1024x1536, and 1536x1024". So three shapes at 1K, each the same
 *  size as the 1K row above (1:1 1024x1024, 2:3 1024x1536, 3:2 1536x1024); "auto" is not offered (the size, so the price, would be unknown). */
export const GPT15_ASPECTS = ['1:1', '2:3', '3:2'] as const;
export const GPT15_RESOLUTIONS: GptRes[] = ['1K'];
export const GPT15_SIZES_SOURCE = 'https://docs.comfy.org/built-in-nodes/OpenAIGPTImage1 (gpt-image-1.5 sizes) + https://docs.comfy.org/development/comfy-router/models/openai/gpt-image-1-5/code (size, quality, image, mask), read 2026-10-25';
/** The exact "WxH" GPT Image 1.5 takes for a shape and size, or null (any other shape, or 2K / 4K). */
export const gpt15ImageSize = (aspect: string | null | undefined, res: string | null | undefined): string | null =>
  (GPT15_ASPECTS as readonly string[]).includes(aspect ?? '') && (res ?? '1K') === '1K' ? gptImageSize(aspect, '1K') : null;
/** The plain refusal for a shape the model can't do (the same words as shared/imageCaps.ts checkImageCaps). */
export const gptAspectMessage = (aspect: string, list: readonly string[] = GPT_IMAGE_ASPECTS) => `Aspect ${aspect} isn't supported by this model (${list.join(', ')}).`;
