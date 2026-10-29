/**
 * Video tab feeds (2026-10-26): which of your jobs each Video workflow's feed lists. One helper for every Video workflow, used by the server's
 * GET /api/jobs?videoFeed=<id> (filtered and counted on the server) and by the web feed for live jobs it already holds (ui/next/feed/feedFilter).
 *
 * - A workflow's feed = the video results of the tool that runs it (Motion Control: motion-transfer; Transitions: app-transition…), plus the
 *   tool's old alias ids. Flow shortcuts open their workflow's feed (Loop → Create Video, Morph → Transitions, Exploded view → Photo FX,
 *   New angle → Re-shoot). Lip Sync runs on the voice tool, so its feed keeps only the voice tool's lip-sync runs (never speech or songs).
 * - 'all' = every job whose OUTPUT is a video, whatever tab its tool lives in (user, 2026-10-26: "all video related generations"): Add sound
 *   (soundtrack / MMAudio on a clip), Stitch, a voiceover laid over a clip, a 3D Render or Turntable. Those jobs stay in their own tab too.
 * - Only video: a finished job whose output is a picture, a sound or a 3D model stays out (Photo FX stills, speech, a .glb).
 *
 * Isomorphic (no server imports): the web app imports it too.
 */
import { VIDEO_WORKFLOWS, VIDEO_FLOW_SHORTCUTS, VIDEO_WORKFLOW_CATEGORIES } from './videoWorkflows.js';
import { FEED_GROUP_PREFIX, SOUND_APPS, IMAGE_TOOL_IDS, outputKindOf, jobModes, uploadsGroup, type FeedJob, type FeedGroup } from './mediaFeed.js';
export { outputKindOf, jobModes, UPLOADS_GROUP } from './mediaFeed.js';

export const ALL_VIDEO_FEED = 'all';
/** Old tool ids that still name the same tool (server tools/registry.ts aliases): jobs saved under them belong to the same feed. */
const TOOL_ALIASES: Record<string, string[]> = { 'object-swap': ['face-swap'], 'sdr-hdr': ['hdr'], 'depth-map': ['depth'], cinema: ['director'], voice: ['voice-studio'] };
/** The 3D tab's tools: a finished render whose output is a video is in All too; while running, only the ones that make a video count. */
export const THREE_D_TOOL_IDS = new Set(['three-d', 'image-to-3d', 'three-d-turntable', 'turntable', 'plan-a-shot', 'previz', 'make-it-real']);
/** 3D tools whose run makes a video (Render, Turntable): listed while they run. */
const THREE_D_VIDEO = new Set(['three-d-turntable', 'turntable', 'make-it-real']);
/** Audio-tab tools: a run of theirs is a video when its output is one (Add sound on a clip, a voiceover over a clip, Lip Sync). */
const AUDIO_FIRST = new Set(['voice', 'voice-studio', 'audio', 'soundtrack']);

export interface VideoFeedDef {
  /** the workflow id (or 'all') */ id: string;
  /** the workflow name, for the empty words ("No Motion Control videos in this project yet.") */ name: string;
  /** tool ids whose video results it lists; null = every tool ('all') */ toolIds: string[] | null;
  /** a mode of a shared tool (Lip Sync = the voice tool's lipsync runs) */ mode?: string;
  /** a filter chip: which workflows (and extra tools, e.g. Add sound) it lists; replaces the tool test */ match?: (j: FeedJob) => boolean;
  /** the empty words' noun ("No app videos yet.") */ noun?: string;
}
const withAliases = (ids: string[]) => [...new Set(ids.flatMap((id) => [id, ...(TOOL_ALIASES[id] ?? [])]))];
const WORKFLOW_MODE: Record<string, string> = { 'lip-sync': 'lipsync' };

/**
 * The Video tab's filter chips (2026-10-26, "the Video tab shows all video related generations"): named sets over the Video workflow ids.
 * The workflow picker's categories (videoWorkflows VIDEO_WORKFLOW_CATEGORIES: Create, Edit, Motion, Camera, Apps) plus finer sets: Swap, Upscale,
 * and Sound (videos that got new sound: Add sound and Voice Studio over a clip, tools with no Video workflow). Feed id `group:<key>`.
 * A job can sit in two chips (an upscale is also an Edit).
 */
export const VIDEO_GROUP_PREFIX = FEED_GROUP_PREFIX;
export type VideoFeedGroup = FeedGroup;
const catGroup = (cat: string, noun: string): VideoFeedGroup => ({ id: `${VIDEO_GROUP_PREFIX}${cat}`, label: VIDEO_WORKFLOW_CATEGORIES.find((c) => c.id === cat)?.label ?? cat, noun,
   workflows: [...VIDEO_WORKFLOWS.filter((w) => w.category === cat && w.toolId).map((w) => w.id), ...(cat === 'edit' ? ['two-person-swap'] : [])] });
export const VIDEO_FEED_GROUPS: VideoFeedGroup[] = [{ id: ALL_VIDEO_FEED, label: 'All', noun: 'videos', workflows: [] },
  catGroup('create', 'created videos'), catGroup('motion', 'motion videos'),
  { id: `${VIDEO_GROUP_PREFIX}swap`, label: 'Swap', noun: 'swap videos', workflows: ['object-swap', 'two-person-swap'] },
  catGroup('edit', 'edited videos'),
  { id: `${VIDEO_GROUP_PREFIX}upscale`, label: 'Upscale', noun: 'upscaled videos', workflows: ['upscale', 'draft-upscale'] },
  catGroup('camera', 'camera videos'), catGroup('apps', 'app videos'),
  { id: `${VIDEO_GROUP_PREFIX}sound`, label: 'Sound', noun: 'videos with new sound', workflows: [], toolIds: ['soundtrack', 'voice'], notMode: 'lipsync' },
  /* your own uploaded clips (mediaFeed UPLOADS_GROUP): the media library, not jobs */
  uploadsGroup('uploaded videos'),
].filter((g) => g.id === ALL_VIDEO_FEED || g.uploads || g.workflows.length || g.toolIds?.length);
/** Is this job in that chip? (its Video workflow is one of the chip's, or its tool is one of the chip's extra tools) */
function inGroup(j: FeedJob, g: VideoFeedGroup): boolean {
  if (g.uploads) return false; /* uploads are files, not jobs */
  const wf = videoWorkflowIdOf(j); if (wf && g.workflows.includes(wf)) return true;
  return !!g.toolIds && withAliases(g.toolIds).includes(String(j.toolId ?? '')) && !(g.notMode && jobModes(j).includes(g.notMode));
}
/** The Video tab's landing feed (Create Video, no workflow picked): every video from every workflow, running ones first. */
export const VIDEO_LANDING_FEED = ALL_VIDEO_FEED;

/** The feed a Video workflow (or flow shortcut, or a filter group) shows; null for an unknown id. */
export function videoFeedOf(id: string | null | undefined): VideoFeedDef | null {
  const key = id || 'create';
  if (key === 'two-person-swap') return { id: key, name: 'Swap Two People', toolIds: [key] }; // history-only feed, not a new workflow choice
  if (key === ALL_VIDEO_FEED) return { id: ALL_VIDEO_FEED, name: 'All workflows', toolIds: null };
  if (key.startsWith(VIDEO_GROUP_PREFIX)) { const g = VIDEO_FEED_GROUPS.find((x) => x.id === key); return g ? { id: g.id, name: g.label, noun: g.noun, toolIds: null, match: (j) => inGroup(j, g) } : null; }
  const sc = VIDEO_FLOW_SHORTCUTS.find((s) => s.id === key);
  if (sc) { const parent = VIDEO_WORKFLOWS.find((w) => w.toolId === sc.toolId && w.surface !== 'edit-hub'); return parent ? videoFeedOf(parent.id) : null; }
  const w = VIDEO_WORKFLOWS.find((x) => x.id === key); if (!w) return null;
  /* Edit Video (a hub, no tool of its own): every edit's results */
  if (w.surface === 'edit-hub') return { id: w.id, name: w.name, toolIds: withAliases([...VIDEO_WORKFLOWS.filter((x) => x.category === 'edit' && x.toolId).map((x) => x.toolId), 'two-person-swap']) };
  return { id: w.id, name: w.name, toolIds: withAliases([w.toolId]), ...(WORKFLOW_MODE[w.id] ? { mode: WORKFLOW_MODE[w.id] } : {}) };
}
/** Every id GET /api/jobs?videoFeed= takes. */
export const VIDEO_FEED_IDS = [ALL_VIDEO_FEED, 'two-person-swap', ...VIDEO_FEED_GROUPS.filter((g) => g.id !== ALL_VIDEO_FEED).map((g) => g.id), ...VIDEO_WORKFLOWS.map((w) => w.id), ...VIDEO_FLOW_SHORTCUTS.map((s) => s.id)];

/** Is this a video result (or a video run still going)? */
export function isVideoJob(j: FeedJob): boolean {
  const tid = String(j.toolId ?? '');
  /* The rule (user, 2026-10-26): a job whose OUTPUT is a video is a video, whatever tab its tool lives in. It used to be "the tool's tab": a voiceover
   * laid over a clip, Add sound and the 3D tab's renders stayed out of Video, so "all video related generations" missed them. They now show here and
   * keep showing in their own tab. */
  const k = outputKindOf(j); if (k) return k === 'video';
  /* no output yet (queued, running, failed): what the run will make */
  if (THREE_D_TOOL_IDS.has(tid)) return THREE_D_VIDEO.has(tid);
  if (AUDIO_FIRST.has(tid)) { if (jobModes(j).includes('lipsync')) return true; if (tid === 'audio') return false;
    const inp = j.input ?? {}; return !inp.audioOnly && inp.outKind !== 'audio' && (tid === 'soundtrack' || !!(inp.videoUrl || inp.videoPath)); /* sound over a clip = a video */ }
  return !IMAGE_TOOL_IDS.has(tid) && !SOUND_APPS.has(tid); /* picture tools (mediaFeed IMAGE_TOOL_IDS) and sound apps never make a video until they have a video output; Stitch (compose) only ever makes one */
}

/** Does this job belong in that Video feed? (`feed` = a workflow id, a flow shortcut id or 'all'; or a resolved VideoFeedDef.) */
export function inVideoFeed(j: FeedJob, feed: string | VideoFeedDef | null): boolean {
  const d = typeof feed === 'string' ? videoFeedOf(feed) : feed; if (!d) return false;
  if (!isVideoJob(j)) return false;
  if (d.match) return d.match(j);
  if (d.toolIds && !d.toolIds.includes(String(j.toolId ?? ''))) return false;
  if (d.mode && !jobModes(j).includes(d.mode)) return false;
  return true;
}

/** The Video workflow a job belongs to (a voice run is Lip Sync only in lipsync mode); null for a tool with no Video workflow. */
export function videoWorkflowIdOf(j: FeedJob): string | null {
  if (j.toolId === 'two-person-swap') return 'two-person-swap';
  const tid = String(j.toolId ?? ''); if (AUDIO_FIRST.has(tid)) return jobModes(j).includes('lipsync') ? 'lip-sync' : null;
  return VIDEO_WORKFLOWS.find((x) => x.toolId && !x.params && withAliases([x.toolId]).includes(tid))?.id ?? null;
}
/** Names for videos from tools with no Video workflow (other tabs, the MCP server). */
const OTHER_VIDEO_NAMES: Record<string, string> = { soundtrack: 'Add sound', compose: 'Stitch', 'make-it-real': 'Render', 'three-d-turntable': 'Turntable', turntable: 'Turntable', cinema: 'Story', director: 'Story' };
const VOICE_MODE_NAMES: Record<string, string> = { voiceover: 'Voiceover', 'change-voice': 'Change voice', translate: 'Translate' };
/** The workflow a video job came from, for its card in the All view ("Motion Control", "Lip Sync", "Add sound"); null when unknown: the card then
 *  keeps its own tag. */
export function videoWorkflowNameOf(j: FeedJob): string | null {
  if (j.toolId === 'two-person-swap') return 'Swap Two People';
  const wf = videoWorkflowIdOf(j); if (wf) return VIDEO_WORKFLOWS.find((w) => w.id === wf)?.name ?? null;
  const tid = String(j.toolId ?? ''); if (AUDIO_FIRST.has(tid) && tid !== 'soundtrack') { const m = jobModes(j).find((x) => VOICE_MODE_NAMES[x]); return m ? VOICE_MODE_NAMES[m] : 'Voice Studio'; }
  return OTHER_VIDEO_NAMES[tid] ?? null;
}
