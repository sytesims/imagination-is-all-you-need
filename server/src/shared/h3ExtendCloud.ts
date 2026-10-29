/**
 * H3 Extend · Comfy Cloud: the words and numbers the page and the server share (comfy/h3ExtendCloud.ts holds the plan). No Node imports: the web
 * bar reads this file too (ui/video/barExtras/ExtendExtra.tsx).
 */
export const H3X_ENGINE = 'comfy-h3-extend';
export const H3X_ROUTE_ID = 'comfy-cloud:cloud-h3-extend';
export const H3X_CONTEXT_FRAMES = 22; // = tools/h3/catalog.ts H3_EXTEND_OVERLAP_FRAMES (H3's shortest clip on its 17k + 5 grid)
/** Seconds one segment adds: 2 s up to what fits H3's trained range (362 frames) with the 22-frame context. */
export const H3X_SECONDS = { min: 2, max: Math.floor((362 - H3X_CONTEXT_FRAMES) / 24) } as const;
export const H3X_SECONDS_LIST = Array.from({ length: H3X_SECONDS.max - H3X_SECONDS.min + 1 }, (_, k) => H3X_SECONDS.min + k);
/** The lengths the page offers for H3 (the server takes every whole second 2–14; +5 / +8 / +10 also run on the other H3 places). */
export const H3X_PAGE_SECONDS = [3, 4, 5, 6, 7, 8, 10, 12, 14] as const;
export const H3X_DEFAULT_SECONDS = 5;
export const H3X_MAX_TOTAL = 60;
/** What the page pre-fills on the next segment, and the calm tips beside it. */
export const H3X_PROMPT_PREFIX = 'Continue the same action at the same pace, same camera: ';
export const H3X_TIPS = ['Continue the same action and camera', 'End on movement, not on a cut', '5–8 s per extend works best', 'No upscaling inside the chain: upscale the finished take'] as const;
