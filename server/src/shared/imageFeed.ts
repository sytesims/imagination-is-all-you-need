/**
 * Image tab feeds (2026-10-26): which of your jobs each Image feed lists. The Image counterpart of videoFeed.ts, on the same base (mediaFeed.ts),
 * used by the server's GET /api/jobs?imageFeed=<id> (filtered and counted on the server) and by the web feed for live jobs it already holds
 * (ui/next/feed/feedFilter).
 *
 * - 'all' (the Image tab's landing) = every job whose OUTPUT is an image, whatever started it: Create Image (Canvas and MCP runs too), Edit,
 *   Brush Edit, Expand, Upscale, Character Sheet, Image to layers, the legacy Soul page, a saved video frame, a Photo FX still, a 3D poster.
 * - A workflow's feed (inside a picked workflow, "This workflow") = the jobs that ran as that image feature (imageFeatures featureIdOfJob).
 * - Filter chips: the workflow picker's categories (workflows.ts: Edit, People, Product, Camera) plus Create, Upscale, Effects (Photo FX stills),
 *   3D (stills from the 3D tab), Frames (saved video frames) and Uploads (your own files, from the media library: mediaFeed UPLOADS_GROUP).
 *
 * Isomorphic (no server imports): the web app imports it too.
 */
import { IMAGE_FEATURES, featureById, featureIdOfJob } from './imageFeatures.js';
import { WORKFLOW_CATEGORIES, WORKFLOW_CATEGORY_OF } from './workflows.js';
import { FEED_GROUP_PREFIX, FRAME_TOOL_ID, isImageJob, uploadsGroup, type FeedJob, type FeedGroup } from './mediaFeed.js';
export { isImageJob } from './mediaFeed.js';

export const ALL_IMAGE_FEED = 'all';
/** The Image tab's landing feed (plain Create, no workflow picked): every image, running ones first. */
export const IMAGE_LANDING_FEED = ALL_IMAGE_FEED;
/** 3D-tab tools whose result can be a still (a poster, a mockup frame). */
const THREE_D_STILL_TOOLS = ['three-d', 'image-to-3d', 'plan-a-shot', 'previz', 'make-it-real', 'three-d-turntable', 'turntable'];

export interface ImageFeedDef { id: string; /** "All workflows", a workflow's or a chip's name */ name: string; /** the empty words' noun ("No upscaled images yet.") */ noun?: string;
  /** is this (image) job in the feed */ match: (j: FeedJob) => boolean; /** the Uploads chip: the media library, not jobs */ uploads?: boolean }

/** The image feature (= image workflow) a job ran as; null for a tool with no image workflow (a saved frame, Photo FX, the 3D tab). */
export const imageWorkflowIdOf = (j: FeedJob): string | null => featureIdOfJob({ toolId: String(j.toolId ?? ''), input: j.input ?? null });
const catGroup = (cat: string, noun: string): FeedGroup => ({ id: `${FEED_GROUP_PREFIX}${cat}`, label: WORKFLOW_CATEGORIES.find((c) => c.id === cat)?.label ?? cat, noun,
  workflows: IMAGE_FEATURES.filter((f) => WORKFLOW_CATEGORY_OF[f.id] === cat).map((f) => f.id) });
/** The Image tab's filter chips (2026-10-26): named sets over the image workflow ids, plus tools with no image workflow. A job can sit in two
 *  chips (an upscale is also an Edit). Feed id `group:<key>`. */
export const IMAGE_FEED_GROUPS: FeedGroup[] = [{ id: ALL_IMAGE_FEED, label: 'All', noun: 'images', workflows: [] },
  { id: `${FEED_GROUP_PREFIX}create`, label: 'Create', noun: 'created images', workflows: ['create-image'] },
  (() => { const g = catGroup('edit', 'edited images'); return { ...g, workflows: ['edit-image', ...g.workflows] }; })(),
  { id: `${FEED_GROUP_PREFIX}upscale`, label: 'Upscale', noun: 'upscaled images', workflows: ['upscale'] },
  catGroup('people', 'people images'), catGroup('product', 'product shots'), catGroup('camera', 'camera images'),
  { id: `${FEED_GROUP_PREFIX}effects`, label: 'Effects', noun: 'effect stills', workflows: [], toolIds: ['photo-fx'] },
  { id: `${FEED_GROUP_PREFIX}3d`, label: '3D', noun: '3D stills', workflows: [], toolIds: THREE_D_STILL_TOOLS },
  { id: `${FEED_GROUP_PREFIX}frames`, label: 'Frames', noun: 'saved frames', workflows: [], toolIds: [FRAME_TOOL_ID] },
  uploadsGroup('uploaded images'),
].filter((g) => g.id === ALL_IMAGE_FEED || g.uploads || g.workflows.length || g.toolIds?.length);
function inGroup(j: FeedJob, g: FeedGroup): boolean {
  if (g.uploads) return false; /* uploads are files, not jobs */
  const wf = imageWorkflowIdOf(j); if (wf && g.workflows.includes(wf)) return true;
  return !!g.toolIds?.includes(String(j.toolId ?? ''));
}

/** The feed an Image workflow (or chip) shows; null for an unknown id. */
export function imageFeedOf(id: string | null | undefined): ImageFeedDef | null {
  const key = id || ALL_IMAGE_FEED;
  if (key === ALL_IMAGE_FEED) return { id: ALL_IMAGE_FEED, name: 'All workflows', match: () => true };
  if (key.startsWith(FEED_GROUP_PREFIX)) { const g = IMAGE_FEED_GROUPS.find((x) => x.id === key); return g ? { id: g.id, name: g.label, noun: g.noun, match: (j) => inGroup(j, g), ...(g.uploads ? { uploads: true } : {}) } : null; }
  const f = featureById(key); if (!f) return null;
  return { id: f.id, name: f.name, match: (j) => imageWorkflowIdOf(j) === f.id };
}
/** Every id GET /api/jobs?imageFeed= takes. */
export const IMAGE_FEED_IDS = [ALL_IMAGE_FEED, ...IMAGE_FEED_GROUPS.filter((g) => g.id !== ALL_IMAGE_FEED).map((g) => g.id), ...IMAGE_FEATURES.map((f) => f.id)];

/** Does this job belong in that Image feed? (`feed` = 'all', a chip id or an image workflow id; or a resolved ImageFeedDef.) */
export function inImageFeed(j: FeedJob, feed: string | ImageFeedDef | null): boolean {
  const d = typeof feed === 'string' ? imageFeedOf(feed) : feed; if (!d || d.uploads) return false;
  return isImageJob(j) && d.match(j);
}
/** Names for images from tools with no image workflow (other tabs, saved frames). */
const OTHER_IMAGE_NAMES: Record<string, string> = { [FRAME_TOOL_ID]: 'Video frame', 'photo-fx': 'Photo FX', 'three-d': '3D', 'image-to-3d': '3D', 'plan-a-shot': 'Direct a Shot', previz: 'Direct a Shot', 'make-it-real': 'Render', 'three-d-turntable': 'Turntable', turntable: 'Turntable' };
/** The workflow an image job came from, for its card in the All view ("Create Image", "Relight", "Video frame"); null when unknown. */
export function imageWorkflowNameOf(j: FeedJob): string | null {
  const wf = imageWorkflowIdOf(j); if (wf) return featureById(wf)?.name ?? null;
  return OTHER_IMAGE_NAMES[String(j.toolId ?? '')] ?? null;
}
