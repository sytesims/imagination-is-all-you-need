/**
 * Share sheet destinations (2026-10-24): where a result can go, in which format, and what the caption says. Pure (no DOM), so the server
 * tests import it. The sheet (ShareSheet.tsx) draws from here; shareFrame.ts makes the files.
 *
 * Neither Instagram nor TikTok lets a desktop web page post media, so their flow is honest: we make the right file, copy the caption, save the
 * file and open the platform's own upload page. Nothing posts by itself. Where the browser can hand files to the system share sheet
 * (Safari on macOS, phones), "Share…" does that instead.
 *
 * Sizes and limits, checked 2026-10-24 (re-check before changing):
 *  - Instagram (Meta, Instagram Graph API, IG User Media): images JPEG, at most 8 MB, aspect 4:5 to 1.91:1, width 320–1440 px;
 *    Reels MP4/MOV, H.264 or HEVC, AAC, moov atom first, 23–60 fps, 3 s – 15 min, at most 300 MB, 9:16 recommended "to avoid cropping or
 *    blank space"; captions up to 2,200 characters. https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
 *    We export 1080 × 1350 (4:5) and 1080 × 1080 (1:1) JPEG for posts and 1080 × 1920 (9:16) H.264/AAC for Reels.
 *  - TikTok (TikTok for Developers, Content Posting API, media transfer guide): video MP4 (recommended), WebM or MOV, H.264 recommended,
 *    23–60 fps, each side 360–4096 px, at most 4 GB; photos JPEG or WebP, at most 1080p, at most 20 MB each.
 *    https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide · captions (title) up to 2,200 characters:
 *    https://developers.tiktok.com/doc/content-posting-api-reference-direct-post . We export 1080 × 1920 (9:16) H.264/AAC and 1080 × 1920 JPEG photos.
 *  - X: 280 characters, a link counts as 23 (t.co). https://docs.x.com/fundamentals/counting-characters
 */
import { isLayerJob } from '../../../server/src/shared/imageLayers';
import { APP_HASHTAG } from '../../../server/src/shared/projectLinks';
export { APP_HASHTAG };
export type Dest ='x' | 'instagram' | 'tiktok' | 'link' | 'download' | 'system';
export type Frame = 'original' | '4:5' | '1:1' | '9:16';
export type Fit = 'fit' | 'fill';
export type MediaKind = 'image' | 'video' | 'audio' | '3d';
/** Output pixels for each frame (even sides, so H.264 is happy). */
export const FRAME_PX: Record<Exclude<Frame, 'original'>, readonly [number, number]> = { '4:5': [1080, 1350], '1:1': [1080, 1080], '9:16': [1080, 1920] };
export const STILL_VIDEO_S = 6;
/** One format choice: the frame, whether the file is an image or a video, and its short label. `explode` = the layers' animated video. */
export interface FormatOpt { id: string; frame: Frame; as: 'image' | 'video'; label: string; hint: string; explode?: boolean }

export interface Platform { id: 'x' | 'instagram' | 'tiktok'; name: string; upload: string | null; captionMax: number; imageMaxBytes: number; videoMaxBytes: number; uploadStep: string }
export const PLATFORMS: Record<'x' | 'instagram' | 'tiktok', Platform> = {
  x: { id: 'x', name: 'X', upload: null, captionMax: 280, imageMaxBytes: 5e6, videoMaxBytes: 512e6, uploadStep: 'Attach the saved file in the post' },
  instagram: { id: 'instagram', name: 'Instagram', upload: 'https://www.instagram.com/', captionMax: 2200, imageMaxBytes: 8e6, videoMaxBytes: 300e6, uploadStep: 'On Instagram, press Create and drop the saved file in' },
  tiktok: { id: 'tiktok', name: 'TikTok', upload: 'https://www.tiktok.com/upload', captionMax: 2200, imageMaxBytes: 20e6, videoMaxBytes: 4e9, uploadStep: 'On TikTok, drop the saved file into the upload page' },
};
export const SIZE_SOURCES = [
  { label: 'Instagram: IG User Media (Meta for Developers)', url: 'https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media' },
  { label: 'TikTok: Content Posting API media transfer guide', url: 'https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide' },
];

const IMG = /\.(png|jpe?g|webp)($|\?)/i;
/** What the sheet shares for a job. Image to layers: the stacked composite (job.layersPosterUrl, made by the server; else the top layer),
 *  never output `out` (output 0 is only the background plate). Anything else: output `out`. */
export function shareMedia(job: { input?: any; outputs?: { url: string }[] | null; resultUrl?: string | null; layersPosterUrl?: string | null } | null | undefined, out = 0):
  { url: string; kind: MediaKind; layers: number } | null {
  const outs = job?.outputs?.length ? job.outputs : job?.resultUrl ? [{ url: job.resultUrl }] : [];
  const imgs = outs.filter((o) => IMG.test(String(o.url)));
  if (isLayerJob(job) && imgs.length > 1) return { url: job?.layersPosterUrl || imgs[imgs.length - 1].url, kind: 'image', layers: imgs.length };
  const cur = outs[Math.min(Math.max(0, out), Math.max(0, outs.length - 1))]; return cur ? { url: cur.url, kind: mediaKindOf(cur.url), layers: 0 } : null;
}
export const mediaKindOf = (u: string): MediaKind => /\.glb($|[?#])/i.test(u) ? '3d' : /\.(mp4|mov|webm|m4v|mkv)($|\?)/i.test(u) ? 'video' : /\.(m4a|mp3|wav|ogg|oga|flac|aac|opus)($|\?)/i.test(u) ? 'audio' : 'image';

const ORIGINAL: FormatOpt = { id: 'original', frame: 'original', as: 'image', label: 'Original', hint: 'As made' };
/** The formats a destination offers for a kind of result. The first is the default. */
export function formatsFor(dest: Dest, kind: MediaKind | null, o: { layers?: boolean } = {}): FormatOpt[] {
  const vid = kind === 'video';
  const orig = { ...ORIGINAL, as: vid ? 'video' as const : 'image' as const };
  if (kind !== 'image' && kind !== 'video') return [orig];
  const explode: FormatOpt[] = o.layers ? [{ id: 'explode', frame: '9:16', as: 'video', label: 'Layers video', hint: `9:16 · layers fly apart`, explode: true }] : [];
  if (dest === 'instagram') return vid
    ? [{ id: 'ig-reel', frame: '9:16', as: 'video', label: 'Reel', hint: '9:16 · 1080 × 1920' }, { id: 'ig-feed', frame: '4:5', as: 'video', label: 'Feed', hint: '4:5 · 1080 × 1350' }]
    : [{ id: 'ig-4x5', frame: '4:5', as: 'image', label: 'Portrait', hint: '4:5 · 1080 × 1350' }, { id: 'ig-1x1', frame: '1:1', as: 'image', label: 'Square', hint: '1:1 · 1080 × 1080' },
      { id: 'ig-reel', frame: '9:16', as: 'video', label: 'Reel', hint: `9:16 · ${STILL_VIDEO_S} s video` }, ...explode];
  if (dest === 'tiktok') return vid
    ? [{ id: 'tt-video', frame: '9:16', as: 'video', label: 'Video', hint: '9:16 · 1080 × 1920' }]
    : [{ id: 'tt-video', frame: '9:16', as: 'video', label: 'Video', hint: `9:16 · ${STILL_VIDEO_S} s` }, { id: 'tt-photo', frame: '9:16', as: 'image', label: 'Photo', hint: '9:16 · 1080 × 1920' }, ...explode];
  if (dest === 'system') return vid ? [orig, { id: 'sys-9x16', frame: '9:16', as: 'video', label: 'Vertical', hint: '9:16' }]
    : [orig, { id: 'sys-4x5', frame: '4:5', as: 'image', label: 'Portrait', hint: '4:5' }, { id: 'sys-9x16', frame: '9:16', as: 'image', label: 'Vertical', hint: '9:16' }, ...explode];
  return [orig];
}
/** Which destinations work for a kind (audio and 3D have no picture to post on Instagram or TikTok). */
export function destOk(dest: Dest, kind: MediaKind | null): boolean { return dest === 'instagram' || dest === 'tiktok' ? kind === 'image' || kind === 'video' : !!kind; }

/** Where the source goes inside a W × H frame: `fit` keeps all of it (letterboxed), `fill` covers the frame (cropped). */
export function fitRect(sw: number, sh: number, W: number, H: number, fit: Fit) {
  const k = fit === 'fill' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh); const w = sw * k, h = sh * k;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h, k };
}
/** True when the source's shape is already the frame's (within 1%): no letterbox or crop needed. */
export const sameShape = (sw: number, sh: number, frame: Frame) => frame === 'original' || Math.abs(sw / sh - FRAME_PX[frame][0] / FRAME_PX[frame][1]) < 0.01;
/** The exported file's pixel size. */
export const outSize = (sw: number, sh: number, frame: Frame): [number, number] => frame === 'original' ? [sw, sh] : [FRAME_PX[frame][0], FRAME_PX[frame][1]];

/** The model's clean name: never where it ran ("MiniMax Music 3 (Comfy Cloud)" → "MiniMax Music 3"; BRAND-GUIDE glossary, Model). */
export const modelName = (m: string | null | undefined) => (m ? m.replace(/\s*\((?:Comfy Cloud|Comfy|Local|fal|Replicate|BytePlus|MiniMax API|Black Forest Labs|Alibaba Cloud|Luma)\)\s*$/i, '').trim() || null : null);
const VERBS: Record<string, string> = { relight: 'Relit this', 'image-upscale': 'Upscaled this', upscale: 'Upscaled this', 'face-swap': 'Swapped a face', 'person-swap': 'Swapped a person', 'material-swap': 'Swapped a material', 'phone-photo': 'Made this', 'ad-pack': 'Made this ad', 'edit-image': 'Edited this', 'brush-edit': 'Edited this', 'camera-lens': 'Shot this', 'remove-bg': 'Cut this out' };
export const APP_LINE = 'Imagination Is All You Need';
/** The caption's first line, in our own voice: "Relit this with FLUX.2 klein in Imagination Is All You Need (open source)".
 *  Commit 6282812 (2026-10-24) took #OpenSourceHiggsfield out on purpose. The one tag now is #ImaginationIsAllYouNeed (user decision,
 *  2026-10-25): only on X, added by captionFor's `tag` (the share sheet's switch, on by default), never baked into this line. */
export function captionOf(o: { featureId: string | null; workflow?: string; model: string | null; kind: MediaKind | 'image' | 'video' | 'audio' | null; layers?: number | null }) {
  const verb = o.layers && o.layers > 1 ? `Split this into ${o.layers} layers` : (o.featureId && VERBS[o.featureId]) || (o.kind === 'video' ? 'Made this video' : o.kind === 'audio' ? 'Made this track' : o.kind === '3d' ? 'Made this 3D model' : 'Made this');
  return `${verb}${o.model ? ` with ${o.model}` : ''} in ${APP_LINE} (open source)`;
}
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, Math.max(0, n - 1)).trimEnd()}…`);
/** The whole text for a destination. X gets the link through its own field (counted as 23), so its text leaves room for it.
 *  Instagram and TikTok don't make caption links clickable, so they end with the repo's short address.
 *  `receipt` (2026-10-26, shared/shareReceipt.ts; "Include cost receipt", on by default): the real model and cost on its own line after the
 *  first line ("≈ $0.32 · Kling 3.0 · Comfy Router · 41 s"). The prompt gives way to it on X; the hashtag stays as it was. */
export function captionFor(dest: Dest, o: { base: string; prompt?: string | null; link?: string | null; repo: string; /** X: end with #ImaginationIsAllYouNeed */ tag?: boolean; receipt?: string | null }): string {
  const repoShort = o.repo.replace(/^https?:\/\//, ''); const rc = o.receipt?.trim() || '';
  if (dest === 'x') { const tail = o.tag ? ` ${APP_HASHTAG}` : ''; const rcl = rc ? `\n${rc}` : ''; const room = PLATFORMS.x.captionMax - 24 - o.base.length - rcl.length - tail.length - 3;
    // Later: a public recipe link (https://<project site>/r/#…) could ride here too; today the post links the result or the app (xIntent's url).
    return `${o.prompt && room > 12 ? `${o.base} “${clip(o.prompt, room)}”` : o.base}${rcl}${tail}`; }
  if (dest === 'instagram' || dest === 'tiktok') { const tail = `\n\n${repoShort}`; const rcl = rc ? `\n${rc}` : ''; const room = PLATFORMS[dest].captionMax - o.base.length - rcl.length - tail.length - 4;
    return `${o.base}${rcl}${o.prompt && room > 12 ? `\n\n“${clip(o.prompt, room)}”` : ''}${tail}`; }
  return `${o.base}${rc ? ` (${rc})` : ''}${o.prompt ? ` “${clip(o.prompt, 400)}”` : ''} ${o.link ?? o.repo}`;
}
/** X's composer with the caption and a link (the share link when others can open it, else the project). */
export const xIntent = (text: string, url: string) => `https://twitter.com/intent/tweet?${new URLSearchParams({ text, url })}`;
/** Characters as X counts them for our text + one link. */
export const xLength = (text: string) => [...text].length + 1 + 23;
