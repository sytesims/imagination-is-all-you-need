import { IMAGE_PAGE, VIDEO_PAGE, VIDEO_TOOL, AUDIO_PAGE, toolPage, pageTool } from '../../../server/src/shared/pages';
import { videoWorkflowOfTool, videoWorkflowHref, videoWorkflowById } from '../../../server/src/shared/videoWorkflows';
import { audioWorkflowForToolMode, audioRoute, audioWorkflowById, AUDIO_DEFAULT_WORKFLOW, type AudioWorkflowId } from '../../../server/src/shared/audioWorkflows';
import { threeDRoute, threeDMode } from '../../../server/src/shared/threeD';
import { ADDED_IMAGE_WORKFLOWS } from '../../../server/src/shared/mediaFeed';
/** Unified Create Image: the workflows Create Image's bar runs today, by the tool that runs them. Recreate on their results reopens
 *  Create Image with the workflow picked (a Create Image job with a camera rig reopens Camera & Lens) (/image?workflow=relight&recreate=<job>); every other job keeps its own page. */
export const READY_WORKFLOW_TOOLS: Record<string, string> = { 'app-relight': 'relight', 'app-face-swap': 'face-swap', 'app-person-swap': 'person-swap', 'app-character-sheet': 'character-sheet', 'app-product-shot': 'product-shot', 'image-upscale': 'upscale',
  'app-inpaint': 'brush-edit', 'app-shots': 'camera-angles' /* 2026-10-23: Brush Edit and Camera Angles moved into the bar too */,
  'app-remove-bg': 'remove-bg', 'app-expand': 'expand', 'app-erase': 'erase', 'app-try-on': 'try-on' /* 2026-10-23: the photo tools on fal */, 'app-material-swap': 'material-swap' /* 2026-10-31 */, 'app-phone-photo': 'phone-photo' /* 2026-11-01 */, 'app-ad-pack': 'ad-pack' /* 2026-10-31 */, 'app-image-layers': 'image-layers' /* 2026-10-24: Image to layers */ };
/** Camera & Lens runs on create-image itself: a Create Image job with a camera rig (input.camera) is a Camera & Lens job. */
export const RIG_WORKFLOW = 'camera-lens';
/** The workflow a job belongs to in Create Image's bar (null = plain Create, or a tool with its own page). */
export const workflowOfJob = (job: { toolId: string; input?: any }): string | null => READY_WORKFLOW_TOOLS[job.toolId] ?? (job.toolId === 'create-image' && job.input?.camera ? RIG_WORKFLOW : null) ?? (ADDED_IMAGE_WORKFLOWS.has(job.toolId) ? job.toolId : null) /* a workflow you added: Recreate reopens it in the bar */;
/** Where a workflow opens: Create Image with it picked (the Workflows page cards, the Image menu, old routes). */
export const workflowOpenHref = (toolId: string): string | null => { const w = READY_WORKFLOW_TOOLS[toolId] ?? (ADDED_IMAGE_WORKFLOWS.has(toolId) ? toolId : null); return w ? `${IMAGE_PAGE}?workflow=${encodeURIComponent(w)}` : null; };
/** One Video page: the video workflow a job belongs to (a lip-sync job of the voice tool is Lip Sync; Create Video's own jobs are null). */
export const videoWorkflowOfJob = (job: { toolId: string; input?: any }): string | null => {
  if (job.toolId === 'two-person-swap') return 'two-person-swap';
  if (job.toolId === 'voice') { const t = job.input?.types; return (typeof t === 'string' ? t : JSON.stringify(t ?? '')).includes('lipsync') ? 'lip-sync' : null; }
  const w = videoWorkflowOfTool(job.toolId); return w && w.id !== 'create' ? w.id : null; };
/** The mode a job ran (its first type, else input.mode): picks the Audio workflow (Music vs Sound effects, Voiceover vs Change voice). */
const modeOfJob = (job: { input?: any }): string | null => { let t = job.input?.types; if (typeof t === 'string') { try { t = JSON.parse(t); } catch { t = [t]; } }
  const m = Array.isArray(t) ? t[0] : null; return typeof m === 'string' && m ? m : typeof job.input?.mode === 'string' && job.input.mode ? job.input.mode : null; };
/** One Audio page: the workflow a job of the audio / voice / soundtrack tools belongs to (null = not an audio job). Lip Sync (voice:lipsync) is Video's. */
const AUDIO_TOOL_DEFAULT: Record<string, AudioWorkflowId> = { audio: 'music', voice: 'voiceover', soundtrack: 'soundtrack-music', 'app-music-bed': 'soundtrack-music' };
export const audioWorkflowOfJob = (job: { toolId: string; input?: any }): AudioWorkflowId | null => {
  if (!(job.toolId in AUDIO_TOOL_DEFAULT)) return null; return audioWorkflowForToolMode(job.toolId, modeOfJob(job)) ?? AUDIO_TOOL_DEFAULT[job.toolId]; };
/** The 3D page: Image to 3D, Turntable and Direct a Shot jobs open their own workflow (/3d?workflow=<id>). */
const THREE_D_JOB: Record<string, string> = { 'three-d': 'image-to-3d', 'three-d-turntable': 'turntable', 'plan-a-shot': 'plan-a-shot', 'make-it-real': 'plan-a-shot' };
/** Where a job's workflow lives, by tab: Image (Create Image with the workflow picked), Video (?workflow= on the Video page), Audio, 3D.
 *  null = the tool's own page (Create Image, Create Video and other tools: the caller adds the tool route). */
export const jobWorkflowHref = (job: { toolId: string; input?: any }): string | null => {
  if (job.toolId === 'two-person-swap') return `${VIDEO_PAGE}?workflow=two-person-swap`; // historical Recreate opens a warning, never a one-person prefill
  const w = workflowOfJob(job); if (w) return `${IMAGE_PAGE}?workflow=${w}`;
  const v = videoWorkflowOfJob(job); if (v) return videoWorkflowHref(v);
  const a = audioWorkflowOfJob(job); if (a) return audioRoute(a);
  const d = job.toolId === 'three-d' ? threeDMode(job.input ?? {}) : THREE_D_JOB[job.toolId]; if (d) return threeDRoute(d);
  return null; };
/** Recreate on a job of a workflow (Image / Video / Audio / 3D): that tab with the workflow picked and ?recreate=<job>. null = the tool's own page. */
export const workflowRecreateHref = (job: { id: string; toolId: string; input?: any }): string | null => { const h = job.id ? jobWorkflowHref(job) : null; return h ? withSearch(h, `recreate=${encodeURIComponent(job.id)}`) : null; };
/** THE Recreate link for any job, from any surface (Assets, the viewer, feeds, Profile, Canvas, job pages): its workflow's tab, else its tool's page
 *  (from the tool list when given, else /tools/<id>), with ?recreate=<job>. null without an id. */
export const recreateHref = (job: { id: string; toolId: string; input?: any }, tools?: { id: string; route?: string | null }[] | null): string | null => {
  if (!job.id) return null; const t = tools?.find(x => x.id === job.toolId);
  return workflowRecreateHref(job) ?? withSearch(t?.route ?? toolPage(job.toolId), `recreate=${encodeURIComponent(job.id)}`); };
/** "Open in tool" without a finished job (Canvas cards): the workflow's tab, else the tool's page. */
export const workflowOpenOf = (job: { toolId: string; input?: any }): string => jobWorkflowHref(job) ?? toolPage(job.toolId);
/** "Make it talk / sing" (2026-10-26): an audio result into Video's Lip Sync, the sound in the Speech slot (a ?fromJob hand-off). */
export const lipSyncHandoffHref = (jobId: string, out = 0): string => `${videoWorkflowHref('lip-sync')}&fromJob=${encodeURIComponent(jobId)}&out=${out}`;
/** "Continue from last frame" / "Use this frame" (2026-10-26): a frame of a video result (at = last | first | seconds) into Video → Generate's
 *  start-image slot (?fromJob hand-off with t=; the server grabs the exact frame). cont=1 also prefills "Continue the shot: <prompt>". */
export const frameHandoffHref = (jobId: string, out = 0, at: 'last' | 'first' | number = 'last', cont = at === 'last'): string =>
  `${VIDEO_PAGE}?fromJob=${encodeURIComponent(jobId)}&as=image&out=${out}&t=${typeof at === 'number' ? Math.max(0, Math.round(at * 1000) / 1000) : at}${cont ? '&cont=1' : ''}`;
/** Where a tool opens: Create Image with its workflow picked when the bar runs it, else the tool's own page. */
/** One Video page (2026-10-23): a video tool opens the Video page with its workflow picked (shared/videoWorkflows.ts). */
const videoOpenHref = (toolId: string): string | null => { const w = videoWorkflowOfTool(toolId); return w ? videoWorkflowHref(w.id) : null; };
/** One Audio page: Translate, Change voice and Music Bed run in the Audio composer (shared/audioWorkflows.ts); a hand-off opens it there with the
 *  workflow picked, like every other button (their old /tools/app-… pages stay for direct links and old Recreates). */
const AUDIO_OPEN: Record<string, AudioWorkflowId> = { 'app-translate-video': 'translate', 'app-change-voice': 'change-voice', 'app-music-bed': 'soundtrack-music' };
const audioOpenHref = (toolId: string): string | null => AUDIO_OPEN[toolId] ? audioRoute(AUDIO_OPEN[toolId]) : null;
export const toolOpenHref = (t: { id: string; route?: string | null }): string => workflowOpenHref(t.id) ?? videoOpenHref(t.id) ?? audioOpenHref(t.id) ?? t.route ?? toolPage(t.id);
/** A server hand-off link (GET /api/jobs/:id/prefill `url`, /tools/<id>?fromJob=…) → where that tool opens now, the query kept. */
export const handoffHome = (url: string): string => { const m = /^\/tools\/([\w-]+)(?:\?(.*))?$/.exec(url); return m ? toolHandoffHref({ id: m[1], route: `/tools/${m[1]}` }, m[2] ?? '') : url; };
/** A hand-off link (?fromJob=…&out=…) to a tool, straight to its new home (no redirect hop). */
export const toolHandoffHref = (t: { id: string; route?: string | null }, query: string): string => withSearch(toolOpenHref(t), query);

/** Join a redirect target that may carry its own query (?workflow=relight) with the current query (?fromJob=…). */
export const withSearch = (to: string, search: string): string => { const s = search.replace(/^\?/, ''); return !s ? to : to.includes('?') ? `${to}&${s}` : `${to}?${s}`; };
/** Old path → its new URL with the query and hash kept (/tools/app-relight?fromJob=j1 → /image?workflow=relight&fromJob=j1); null = no redirect. */
export const redirectTarget = (pathname: string, search: string, hash: string, map: Record<string, string>): string | null => {
  const r = map[(pathname.replace(/\/+$/, '') || '/').toLowerCase()]; return r ? withSearch(r, search) + hash : null;
};

/** Workflows page: tools outside the Apps category that still get a card (image Upscale runs in Create Image's bar). */
export const WORKFLOW_PAGE_EXTRA = ['image-upscale'];
/** The card name: two tools are both called "Upscale", so the video one says so. */
export const workflowCardName = (t: { id: string; name: string }): string => t.id === 'upscale' ? 'Video Upscale' : t.name;
/** The tools that get a Workflows card: Apps plus WORKFLOW_PAGE_EXTRA, listed, one card per (card) name. */
export function workflowCardTools<T extends { id: string; name: string }>(tools: T[]): T[] {
  const names = new Set<string>();
  return tools.filter(t => ((t as any).category === 'Apps' || WORKFLOW_PAGE_EXTRA.includes(t.id)) && (t as any).listed !== false)
    .filter(t => { const n = workflowCardName(t).toLowerCase(); if (names.has(n)) return false; names.add(n); return true; });
}

/** The tool a page runs: /tools/<id>, Image / Audio / 3D's own tool at /image, /audio, /3d (shared/pages.ts), or on the one Video page the picked workflow's own tool (/video?workflow=extend → h3-extend; /video alone → h3-video),
 *  so a hand-off (Extend, Upscale, Turn to video…) asks the server for that tool's slot, not Create Video's (shared/usePrefill.ts). */
export function pageToolId(path = location.pathname, search = location.search): string {
  const p = path.replace(/\/+$/, '') || '/';
  /* the Audio page runs the picked workflow's own tool (Translate → voice, Music for a video → soundtrack) */
  if (p === AUDIO_PAGE) return audioWorkflowById(new URLSearchParams(search).get('workflow') ?? AUDIO_DEFAULT_WORKFLOW)?.tool ?? pageTool(p) ?? '';
  if (p !== VIDEO_PAGE) return pageTool(path) ?? path.split('/')[2] ?? '';
  const w = videoWorkflowById(new URLSearchParams(search).get('workflow')); return w?.toolId || VIDEO_TOOL;
}
/** Use in Direct a Shot (2026-10-27): a finished 3D model (job id) placed in Direct a Shot's set, ready to move, size or make the actor. */
export const directShotHref = (jobId: string) => `${threeDRoute('plan-a-shot')}&useModel=${encodeURIComponent(jobId)}`;

/** Old links to a workflow you added (its own page, /tools/<id>) → the Image tab with it picked (2026-11-02: added workflows live in their tab). null = not one. */
export const addedImageRedirect = (pathname: string, search: string, hash = ''): string | null => {
  const id = pathname.match(/^\/tools\/([^/?#]+)\/?$/)?.[1]; if (!id || !ADDED_IMAGE_WORKFLOWS.has(decodeURIComponent(id))) return null;
  const q = new URLSearchParams(search); q.set('workflow', decodeURIComponent(id)); return `${IMAGE_PAGE}?${q.toString()}${hash}`; };
