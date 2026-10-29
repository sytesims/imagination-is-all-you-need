/**
 * The tab feeds' common ground (2026-10-26): what a job's OUTPUT is, the filter chips' shared shape and the Uploads chip. The Video tab
 * (videoFeed.ts: "output is video") and the Image tab (imageFeed.ts: "output is image") both build on it, so one job is judged the same
 * way everywhere: a job is in a tab when what it made is that tab's medium, whatever tool, tab, Canvas board or MCP call started it.
 *
 * Uploads (2026-10-26): the Uploads chip lists your own files (the media picker's Uploads tab, GET /api/media?tab=uploads: files you
 * uploaded, inputs you gave runs, saved frames), never jobs. The chip lives in both tabs' chip lists; a feed with it picked reads the
 * media library instead of /api/jobs (web ui/next/feed/UploadsFeed).
 *
 * Isomorphic (no server imports): the web app imports it too.
 */
export type FeedJob = { provider?: string | null; toolId?: string | null; input?: any; outputs?: { url?: string; kind?: string }[] | null; resultUrl?: string | null };
export type MediaKind = 'video' | 'image' | 'audio' | '3d';

/** A filter chip's id is `group:<key>` (GET /api/jobs?videoFeed= / ?imageFeed=). */
export const FEED_GROUP_PREFIX = 'group:';
/** The Uploads chip, the same id in every tab. */
export const UPLOADS_GROUP = `${FEED_GROUP_PREFIX}uploads`;
export const isUploadsFeed = (id: string | null | undefined): boolean => id === UPLOADS_GROUP;
/** One filter chip: a named set over the tab's workflow ids (and extra tools with no workflow of their own). `uploads` = your files, not jobs. */
export interface FeedGroup { id: string; label: string; /** the empty words' noun ("No upscaled images yet.") */ noun: string; /** workflow ids */ workflows: string[];
  /** tools with no workflow of their own (Video Sound: soundtrack, voice; Image Frames: video-frame), minus a mode another chip owns (Lip Sync) */ toolIds?: string[]; notMode?: string;
  /** the Uploads chip: the media library's Uploads, not jobs */ uploads?: boolean }
export const uploadsGroup = (noun: string): FeedGroup => ({ id: UPLOADS_GROUP, label: 'Uploads', noun, workflows: [], uploads: true });

const kindOfUrl = (u: string): MediaKind | null => /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(u) ? 'video' : /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(u) ? 'image'
  : /\.(m4a|mp3|wav|ogg|flac|aac|opus)(\?|#|$)/i.test(u) ? 'audio' : /\.(glb|gltf|obj|ply)(\?|#|$)/i.test(u) ? '3d' : null;
/** What a job's first output is (the output's own kind, else its file type); null = no output yet or an unknown file type. */
export function outputKindOf(j: FeedJob): string | null {
  const o = j.outputs?.[0]; const k = o?.kind ? String(o.kind) : null; if (k && k !== 'file') return k === 'model' ? '3d' : k;
  const u = String(o?.url ?? j.resultUrl ?? ''); return u ? kindOfUrl(u) : null;
}
const LIPSYNC_PROVIDERS = new Set(['comfy-h3-lipsync', 'comfy-ltx25-lipsync', 'cloud-infinitetalk']);
/** The run's mode on a shared tool: job.input.types (array or JSON text) or input.mode. */
export function jobModes(j: FeedJob): string[] {
  const t = j.input?.types; let arr: unknown[] = [];
  if (Array.isArray(t)) arr = t; else if (typeof t === 'string' && t.trim()) { try { const p = JSON.parse(t); arr = Array.isArray(p) ? p : [p]; } catch { arr = t.split(','); } }
  /* the voice tool's lip-sync models only run lip sync (tools/media.ts LS), so an older run without types still counts */
  const lipProv = LIPSYNC_PROVIDERS.has(String(j.provider ?? j.input?.provider ?? '')) ? ['lipsync'] : [];
  return [...arr, j.input?.mode, ...lipProv].filter((x) => x != null && x !== '').map((x) => String(x).trim());
}

/** Apps that make pictures (server tools/apps.ts APP_GALLERY, imageFalApps, imageLayerApps): a run of theirs makes an image. */
export const IMAGE_APPS = new Set(['app-character-sheet', 'app-product-shot', 'app-inpaint', 'app-relight', 'app-face-swap', 'app-shots', 'app-person-swap', 'app-remove-bg', 'app-expand', 'app-erase', 'app-try-on', 'app-image-layers']);
/** Apps that make sound: never a picture, never a video until they have a video output. */
export const SOUND_APPS = new Set(['app-music-bed', 'app-change-voice']);
/** A frame saved from a video (Save frame, server pages.ts FRAME_TOOL): a finished job whose output is the PNG. */
export const FRAME_TOOL_ID = 'video-frame';
/** Tools whose run makes a picture: while it runs (no output yet), it already belongs to the Image tab. Create Image (Canvas and MCP image runs
 *  go through it too), the legacy Soul page, Upscale, the image apps and saved frames. */
export const IMAGE_TOOL_IDS = new Set(['create-image', 'soul', 'image-upscale', FRAME_TOOL_ID, ...IMAGE_APPS]);

/** Is this an image result (or an image run still going)? The rule (user, 2026-10-26): a job whose OUTPUT is an image is an image, whatever tab
 *  its tool lives in: a Photo FX still, a 3D poster, a saved video frame, a Canvas or MCP run. A job with no output yet counts by what its tool makes. */
export function isImageJob(j: FeedJob): boolean {
  const k = outputKindOf(j); if (k) return k === 'image';
  return IMAGE_TOOL_IDS.has(String(j.toolId ?? ''));
}
