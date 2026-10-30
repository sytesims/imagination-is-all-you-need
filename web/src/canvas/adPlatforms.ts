/**
 * Ad layout card, platforms (2026-10-30): where an ad will run, the sizes each place takes, and the parts of each size the place's own
 * buttons and captions cover ("safe zones"). One small table, no React, so server/test/ad-layout.test.ts checks it. The card's size tabs
 * are the sizes of every platform picked, one tab per shape; the layout (adLayout.ts) keeps the logo and text out of the covered parts.
 *
 * Safe zones are fractions of the frame (top / bottom of the height, left / right of the width), checked on 2026-10-30 against:
 *  - Meta Ads Guide, Instagram Stories and Reels: "leaving roughly 14% of the top, 35% of the bottom, and 6% on each side … free from text,
 *    logos" (facebook.com/business/ads-guide/update/image/instagram-story and …/video/instagram-reels). Feed sizes have no cover.
 *  - TikTok In-Feed ads: the official safe zone is a downloadable template only (ads.tiktok.com/help/article/tiktok-auction-in-feed-ads,
 *    "Safe Zone"); its numbers aren't on the page. We use the commonly published template edges: caption and buttons on the bottom
 *    ~30%, the like / comment / share column on the right ~13%, the top bar ~8%, a small left edge.
 *  - YouTube Shorts: Google Ads Help "Universal safe zones" vertical template (support.google.com/google-ads/answer/13547298), 1080×1920:
 *    288 px top, 672 px bottom, 48 px left, 192 px right. The 16:9 size is a thumbnail (same page: 1280×720): only the time badge covers
 *    the bottom corner, so we keep the bottom ~10% clear.
 *  - X: its own creative specs (help.x.com/en/business-and-advertising/creative-ad-specifications) give image ads 1:1 at 1080×1080 and
 *    16:9 at 1920×1080 (sizes updated 2026-10-31). X, Pinterest standard ads 2:3, 1000×1500
 *    (help.pinterest.com/en/business/article/pinterest-product-specs) and LinkedIn single image ads 1.91:1 1200×628 and 1:1 1200×1200
 *    (linkedin.com/help/lms/answer/a426534): the picture shows in the feed with nothing on top, so no safe zone.
 */

export type AdPlatform = 'meta' | 'tiktok' | 'x' | 'pinterest' | 'linkedin' | 'youtube';
export type AdShape = '1x1' | '4x5' | '9x16' | '16x9' | '2x3' | '191x1';
/** How much of each edge a platform's own interface covers (fractions of the frame). */
export interface Edges { top: number; right: number; bottom: number; left: number }
export const NO_EDGES: Edges = { top: 0, right: 0, bottom: 0, left: 0 };

/** One tab per shape: its label, the file tag and the size we draw when no platform asks for a bigger one. */
export const AD_SHAPES: Record<AdShape, { label: string; tag: string; w: number; h: number }> = {
  '1x1': { label: '1:1', tag: '1x1', w: 1080, h: 1080 },
  '4x5': { label: '4:5', tag: '4x5', w: 1080, h: 1350 },
  '9x16': { label: '9:16 Story', tag: '9x16', w: 1080, h: 1920 },
  '16x9': { label: '16:9', tag: '16x9', w: 1280, h: 720 },
  '2x3': { label: '2:3', tag: '2x3', w: 1000, h: 1500 },
  '191x1': { label: '1.91:1', tag: '1.91x1', w: 1200, h: 628 },
};
export const AD_SHAPE_LIST = Object.keys(AD_SHAPES) as AdShape[];

interface Spot { shape: AdShape; w: number; h: number; name: string; safe?: Edges }
export const AD_PLATFORMS: Record<AdPlatform, { label: string; sizes: Spot[] }> = {
  meta: { label: 'Instagram & Facebook', sizes: [
    { shape: '4x5', w: 1080, h: 1350, name: 'Feed' },
    { shape: '1x1', w: 1080, h: 1080, name: 'Square' },
    { shape: '9x16', w: 1080, h: 1920, name: 'Stories and Reels', safe: { top: 0.14, bottom: 0.35, left: 0.06, right: 0.06 } }] },
  tiktok: { label: 'TikTok', sizes: [
    { shape: '9x16', w: 1080, h: 1920, name: 'For You feed', safe: { top: 0.08, bottom: 0.30, left: 0.04, right: 0.13 } }] },
  x: { label: 'X', sizes: [
    { shape: '1x1', w: 1080, h: 1080, name: 'Square' },
    { shape: '16x9', w: 1920, h: 1080, name: 'Wide' }] },
  pinterest: { label: 'Pinterest', sizes: [
    { shape: '2x3', w: 1000, h: 1500, name: 'Pin' }] },
  linkedin: { label: 'LinkedIn', sizes: [
    { shape: '191x1', w: 1200, h: 628, name: 'Wide' },
    { shape: '1x1', w: 1200, h: 1200, name: 'Square' }] },
  youtube: { label: 'YouTube', sizes: [
    { shape: '16x9', w: 1280, h: 720, name: 'Thumbnail', safe: { top: 0, bottom: 0.10, left: 0, right: 0 } },
    { shape: '9x16', w: 1080, h: 1920, name: 'Shorts', safe: { top: 0.15, bottom: 0.35, left: 0.045, right: 0.18 } }] },
};
export const AD_PLATFORM_LIST = Object.keys(AD_PLATFORMS) as AdPlatform[];
export const DEFAULT_PLATFORMS: AdPlatform[] = ['meta'];

/** Saved platforms, cleaned (old cards from before platforms: Instagram & Facebook, whose sizes they had). */
export const asPlatforms = (v: unknown): AdPlatform[] => Array.isArray(v) ? AD_PLATFORM_LIST.filter((p) => v.includes(p)) : DEFAULT_PLATFORMS;
/** A saved size as a shape (old cards said square / portrait / story). */
const OLD: Record<string, AdShape> = { square: '1x1', portrait: '4x5', story: '9x16' };
export const asShape = (v: unknown): AdShape => (AD_SHAPE_LIST.includes(v as AdShape) ? (v as AdShape) : OLD[v as string] ?? '4x5');

export interface AdSizeOption { shape: AdShape; label: string; tag: string; w: number; h: number; /** "Instagram & Facebook Feed, X Square" */ where: string; safe: Edges }
/** The sizes for these platforms: one per shape (in the order the shapes are listed), drawn at the biggest size any of them asks for,
 *  with the safe zone that keeps clear of every one of them. */
export function adSizesFor(platforms: AdPlatform[]): AdSizeOption[] {
  const out: AdSizeOption[] = [];
  for (const shape of AD_SHAPE_LIST) {
    const spots = platforms.flatMap((p) => AD_PLATFORMS[p].sizes.filter((s) => s.shape === shape).map((s) => ({ ...s, p })));
    if (!spots.length) continue; const big = spots.reduce((a, b) => (b.w > a.w ? b : a));
    const safe = spots.reduce<Edges>((e, s) => ({ top: Math.max(e.top, s.safe?.top ?? 0), right: Math.max(e.right, s.safe?.right ?? 0), bottom: Math.max(e.bottom, s.safe?.bottom ?? 0), left: Math.max(e.left, s.safe?.left ?? 0) }), NO_EDGES);
    out.push({ shape, label: AD_SHAPES[shape].label, tag: AD_SHAPES[shape].tag, w: big.w, h: big.h, where: spots.map((s) => `${AD_PLATFORMS[s.p].label} ${s.name}`).join(', '), safe });
  }
  return out;
}
export const hasSafe = (e: Edges) => e.top > 0 || e.right > 0 || e.bottom > 0 || e.left > 0;
/** Each picked platform's own safe zone on this shape (only the ones that cover something), for "Zones for" in Edit ad. */
export const zonesFor = (platforms: AdPlatform[], shape: AdShape): { p: AdPlatform; label: string; safe: Edges }[] =>
  platforms.flatMap((p) => AD_PLATFORMS[p].sizes.filter((s) => s.shape === shape && s.safe && hasSafe(s.safe)).map((s) => ({ p, label: AD_PLATFORMS[p].label, safe: s.safe! })));
