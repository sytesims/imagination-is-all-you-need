/**
 * One Video page (2026-10-23): the workflows the Video page's bar can switch between, the way Create Image's bar does (shared/workflows.ts).
 * A workflow is a plain name for an existing video tool: picking it renders that tool's own inputs, controls, models, quote and submit
 * on the Video page (/video?workflow=<id>). Nothing here runs a job and no tool id or job contract changes.
 *
 * Isomorphic (no server imports): the web app reads it for the picker, the header Video menu and the redirects of the old pages.
 */

import { VIDEO_PAGE, OLD_VIDEO_PAGE, VIDEO_TOOL, THREE_D_PAGE, toolPage } from './pages.js';
/** The Video page (/video, shared/pages.ts). Create Video is this page with no workflow picked. Its tool id stays VIDEO_TOOL (jobs, /api/tools/h3-video, MCP).
 *  toolPage(id) gives any tool's page when the tool list isn't at hand. */
export { VIDEO_PAGE, OLD_VIDEO_PAGE, VIDEO_TOOL, toolPage };
export type VideoWorkflowCategory = 'create' | 'edit' | 'motion' | 'camera' | 'apps';
export interface VideoWorkflow {
  /** URL id (?workflow=<id>); 'create' is the page with no workflow. */ id: string;
  name: string;
  /** The tool that runs it (its own /api/tools/<id>/price and /jobs); '' for the Edit Video list. */ toolId: string;
  category: VideoWorkflowCategory;
  tagline: string;
  /** What it takes, in the picker's words ("1 clip", "Clip + character image"). */ needs: string;
  /** The inputs the workflow brings to the bar (required first), in our words. */ inputs: string[];
  /** How it works: three short steps, our own copy (shown from the ⓘ in the picker). */ how: [string, string][];
  /** Old pages that now open this workflow (redirect with the query kept). */ oldRoutes: string[];
  /** Listed in the header Video menu. */ inMenu: boolean;
  /** Query the tool reads on mount (Lip sync is the voice tool's lipsync mode: ?mode=lipsync). */ params?: Record<string, string>;
  /** Extra render hint: the Motion Control copy on the swap screen, the Edit Video list, Stitch's own timeline panel (no registry tool: it posts
   *  /api/compose, ffmpeg on this computer, so it is always available). */ surface?: 'motion' | 'edit-hub' | 'stitch';
}

const W = (w: VideoWorkflow) => w;
export const VIDEO_WORKFLOWS: VideoWorkflow[] = [
  W({ id: 'create', name: 'Create Video', toolId: 'h3-video', category: 'create', tagline: 'Video with sound, from text or an image', needs: 'Prompt · photo optional',
    inputs: ['Prompt', 'Start frame (optional)', 'End frame (some models)', 'References (some models)'], oldRoutes: [], inMenu: true,
    how: [['Add an image', 'Drop a photo to set the first frame, or leave it out and write the shot.'], ['Pick a mode or look', 'Text, image, start + end frame or references; add a preset look if you like.'], ['Generate', 'Check the price on the button. Picture and sound arrive together.']] }),
  W({ id: 'photos-to-reel', name: 'Photos → Reel', toolId: 'app-photos-to-reel', category: 'create',
    tagline: 'Photos into a vertical reel with movement, words and music', needs: '8–15 photos + a title',
    inputs: ['Photos in order', 'Title', 'End card (optional)', 'Kind', 'Length', 'Motion', 'Music'],
    oldRoutes: ['/tools/app-photos-to-reel'], inMenu: true,
    how: [['Add your photos', 'Pick 8–15 photos and put them in the order you want.'], ['Set the reel', 'Add a title, choose 15 or 30 seconds, and pick camera moves for every photo or just the heroes.'], ['Generate', 'Check the whole reel price before starting. Music is optional.']] }),
  W({ id: 'edit-video', name: 'Edit Video', toolId: '' /* a hub: the list of edits, each its own workflow */, category: 'edit', tagline: 'Every way to change a clip you already have', needs: 'Pick an edit',
    inputs: ['An edit from the list'], oldRoutes: ['/tools/edit-video'], inMenu: false, surface: 'edit-hub',
    how: [['Pick an edit', 'Every edit starts from a clip you already have. Each row shows its price.'], ['Drop in your clip', 'MP4, MOV or WEBM. Each edit shows its length and size limits before you upload.'], ['Tune and generate', 'Set the few options that matter, check the price on the button, then generate.']] }),
  W({ id: 'motion-control', name: 'Motion Control', toolId: 'motion-transfer', category: 'motion', tagline: 'Your character, moving like the clip', needs: 'Clip + character image',
    inputs: ['Motion clip', 'Character image', 'Prompt (optional)'], oldRoutes: ['/tools/motion-transfer'], inMenu: true, surface: 'motion',
    how: [['Add a motion clip', 'The moves, timing and camera come from this clip.'], ['Add your character', 'One clear image of who should do the moves.'], ['Generate', 'Your character performs the clip. The price is on the button.']] }),
  // Footage Effects (2026-10-26): the official Lightricks LTX-2.5 IC-LoRA effects on your own clip, free on your computer (shared/footageFx.ts).
  W({ id: 'footage-fx', name: 'Footage Effects', toolId: 'footage-fx', category: 'edit', tagline: 'Effects on your own footage: vanish, night, rain, flood, matte, restore, remove, extend', needs: '1 clip + effect',
    inputs: ['Clip (up to 5 s)', 'Effect', 'What is in the shot (optional; what to remove for Remove an object)', 'New shape and direction (Extend the frame)'], oldRoutes: ['/tools/footage-fx'], inMenu: true,
    how: [['Add your clip', 'Upload one, pick it from your media, or use a result. Up to 5 s at a time.'], ['Pick an effect', 'Remove people, turn day into night, add rain or a flood (on your computer or Comfy Cloud), or pull a matte (your computer). On Comfy Cloud also: restore old footage, remove an object or subtitles, or extend the frame.'], ['Generate', 'Free on your computer, or on Comfy Cloud with the price on the button. Your sound is kept.']] }),
  // Finish (2026-10-27): eight one-click finishing looks on your own clip, free on your computer with ffmpeg (shared/finishPresets.ts).
  W({ id: 'prompt-edit', name: 'Prompt Edit', toolId: 'prompt-edit', category: 'edit', tagline: 'Change a clip by saying what to change', needs: '1 clip + a sentence',
    inputs: ['Clip', 'What to change'], oldRoutes: ['/tools/prompt-edit'], inMenu: true,
    how: [['Add your clip', 'Up to 5 s. A longer clip uses its first 5 s.'], ['Say what to change', 'Make it night, remove the cup, turn her coat red.'], ['Generate', 'The same shot with your change. Motion, framing and sound stay.']] }),
  W({ id: 'finish', name: 'Finish', toolId: 'finish', category: 'edit', tagline: 'Give any clip a finished look in one click', needs: '1 clip + look',
    inputs: ['Clip (up to 20 s, up to 1080p)', 'Look', 'Strength', 'A second look (optional)'], oldRoutes: ['/tools/finish'], inMenu: true,
    how: [['Add your clip', 'Upload one, pick it from your media, or use a result. Up to 20 s and 1080p.'], ['Pick a look', 'Set the strength, or stack a second look.'], ['Finish', 'Free and quick on your computer. Your sound stays. Drag the slider on the result to compare.']] }),
  W({ id: 'reshoot', name: 'Re-shoot', toolId: 'reshoot', category: 'edit', tagline: 'New camera angles from one take', needs: '1 clip',
    inputs: ['Clip', 'Angle (yaw / tilt)', 'Reference image (optional)'], oldRoutes: ['/tools/reshoot'], inMenu: true,
    how: [['Upload your take', 'One clip with the subject in view.'], ['Pick the new angle', 'Turn and tilt the virtual camera, or pick several angles.'], ['Generate', 'The same moment, filmed from where you pointed.']] }),
  W({ id: 'extend', name: 'Extend', toolId: 'h3-extend', category: 'edit', tagline: 'Keep the shot going', needs: '1 clip + prompt',
    inputs: ['Clip', 'Prompt', 'Extra seconds'], oldRoutes: ['/tools/h3-extend'], inMenu: true,
    how: [['Upload your clip', 'MP4, MOV or WEBM. The new part picks up where your clip ends.'], ['Describe the next moment', 'One short line is enough, like a person turning to the camera.'], ['Render and check', 'Check the price on the button, then generate. The longer clip lands in History.']] }),
  W({ id: 'object-swap', name: 'Object / Person Swap', toolId: 'object-swap', category: 'edit', tagline: 'Replace a product, person or place in a clip', needs: 'Clip + images',
    inputs: ['Clip', 'Replacement images', 'Point on the object (optional)'], oldRoutes: ['/tools/object-swap', '/tools/face-swap'], inMenu: true,
    how: [['Upload your clip', 'The shot you want to change.'], ['Add what goes in', 'Up to a few images of the character, product or clothes.'], ['Generate', 'The thing you picked is swapped; motion and camera stay.']] }),
  W({ id: 'restyle', name: 'Restyle', toolId: 'restyle', category: 'edit', tagline: 'Redraw the whole clip in a new look', needs: '1 clip + style',
    inputs: ['Clip', 'Style', 'Style images (optional)'], oldRoutes: ['/tools/restyle'], inMenu: true,
    how: [['Upload your clip', 'Motion and framing come from it.'], ['Pick a style', 'A preset look, or describe your own.'], ['Generate', 'Every frame is redrawn in that style.']] }),
  W({ id: 'upscale', name: 'Video Upscale', toolId: 'upscale', category: 'edit', tagline: 'Sharper, larger clips, audio kept', needs: '1 clip',
    inputs: ['Clip', 'Scale'], oldRoutes: ['/tools/upscale'], inMenu: true,
    how: [['Upload your clip', 'The size and length limits show before you upload.'], ['Pick the scale', 'Up to 4K, depending on the model.'], ['Generate', 'A sharper copy with the original sound.']] }),
  W({ id: 'reframe', name: 'Reframe', toolId: 'reframe', category: 'edit', tagline: 'New aspect ratio, edges filled in', needs: '1 clip',
    inputs: ['Clip', 'New aspect ratio'], oldRoutes: ['/tools/reframe'], inMenu: true,
    how: [['Upload your clip', 'Any shape works.'], ['Pick the new shape', 'Vertical, square or wide.'], ['Generate', 'The new edges are painted in to match.']] }),
  W({ id: 'remove-bg', name: 'Remove Background', toolId: 'remove-bg', category: 'edit', tagline: 'Lift the subject off the background', needs: '1 clip',
    inputs: ['Clip'], oldRoutes: ['/tools/remove-bg'], inMenu: true,
    how: [['Upload your clip', 'A clear subject works best.'], ['Check the price', 'No settings needed.'], ['Generate', 'The subject on its own, ready to composite.']] }),
  W({ id: 'cutout', name: 'Cutout', toolId: 'cutout', category: 'edit', tagline: 'Subject on a clean plate, plus alpha matte', needs: '1 clip',
    inputs: ['Clip', 'Detail', 'Edge softness'], oldRoutes: ['/tools/cutout'], inMenu: true,
    how: [['Upload your clip', 'A clear subject works best.'], ['Tune the edges', 'More detail for hair, softer edges for motion.'], ['Generate', 'A clean plate and an alpha matte.']] }),
  W({ id: 'sdr-hdr', name: 'SDR to HDR', toolId: 'sdr-hdr', category: 'edit', tagline: 'More range in highlights and shadows', needs: '1 clip',
    inputs: ['Clip', 'Strength'], oldRoutes: ['/tools/sdr-hdr'], inMenu: true,
    how: [['Upload your clip', 'Standard dynamic range footage.'], ['Set the strength', 'How far to push highlights and shadows.'], ['Generate', 'An HDR10 version of the same clip.']] }),
  W({ id: 'fps-boost', name: 'FPS Boost', toolId: 'fps-boost', category: 'edit', tagline: 'Smoother motion at 48 or 60 fps', needs: '1 clip',
    inputs: ['Clip', 'Target frame rate'], oldRoutes: ['/tools/fps-boost'], inMenu: true,
    how: [['Upload your clip', 'Any frame rate.'], ['Pick 48 or 60 fps', 'New frames are made between the old ones.'], ['Generate', 'Same clip, smoother motion.']] }),
  W({ id: 'depth-map', name: 'Depth Map', toolId: 'depth-map', category: 'edit', tagline: 'A depth pass for compositing', needs: '1 clip',
    inputs: ['Clip', 'Format'], oldRoutes: ['/tools/depth-map'], inMenu: true,
    how: [['Upload your clip', 'Any shot.'], ['Pick the format', 'How the depth is written out.'], ['Generate', 'A depth video that lines up frame by frame.']] }),
  W({ id: 'draft-upscale', name: 'Draft Upscale', toolId: 'app-video-upscale', category: 'edit', tagline: 'Lift a 480p draft to 1080p', needs: '1 clip',
    inputs: ['Clip'], oldRoutes: ['/tools/app-video-upscale'], inMenu: true,
    how: [['Upload your draft', 'A low-resolution clip.'], ['Check the price', 'No settings needed.'], ['Generate', 'The same clip at 1080p.']] }),
  W({ id: 'anime-restyle', name: 'Anime Restyle', toolId: 'app-anime-restyle', category: 'edit', tagline: 'Turn a clip into cel-shaded anime', needs: '1 clip',
    inputs: ['Clip'], oldRoutes: ['/tools/app-anime-restyle'], inMenu: true,
    how: [['Upload your clip', 'Motion and framing come from it.'], ['Check the price', 'The look is fixed.'], ['Generate', 'Every frame redrawn as anime.']] }),
  /* Stitch (2026-10-27, timeline): clips you already made, in order, with music, a voice and per-clip trims, joined into one video by ffmpeg on
   * this computer (POST /api/compose, $0, the same endpoint as the MCP stitch_video). Its own panel (ui/video/StitchPanel.tsx), not a bar recipe. */
  W({ id: 'stitch', name: 'Stitch', toolId: 'compose', category: 'edit', tagline: 'Join your clips into one video, with music and a voice', needs: '1–20 clips',
    inputs: ['Clips (1–20, in order)', 'Music (optional)', 'Voice (optional)', 'Trim per clip (optional)'], oldRoutes: [], inMenu: true, surface: 'stitch',
    how: [['Add your clips', 'Pick up to 20 from your videos and uploads, then drag them into order.'], ['Trim and add sound', 'Keep just part of a clip, add music or a voice, pick the shape.'], ['Export', 'Free on your computer. One video lands in Assets.']] }),
  W({ id: 'camera-moves', name: 'Camera Moves', toolId: 'camera', category: 'camera', tagline: 'One still into a shot with a camera move', needs: 'Photo + move',
    inputs: ['Photo (optional on some models)', 'Camera move', 'Prompt (optional)'], oldRoutes: ['/tools/camera'], inMenu: true,
    how: [['Add a photo', 'It becomes the first frame.'], ['Pick a move', 'Dolly, orbit, crane and more.'], ['Generate', 'The camera moves through your still.']] }),
  W({ id: 'photo-fx', name: 'Photo FX', toolId: 'photo-fx', category: 'camera', tagline: 'Animate a photo with an effect', needs: 'Photo + effect',
    inputs: ['Photo', 'Effect', 'Prompt (optional)'], oldRoutes: ['/tools/photo-fx'], inMenu: true,
    how: [['Add a photo', 'It becomes the first frame.'], ['Pick an effect', 'Each effect is its own short scene.'], ['Generate', 'Your photo comes alive with the effect.']] }),
  W({ id: 'orbit-shot', name: 'Orbit Shot', toolId: 'app-orbit-shot', category: 'camera', tagline: 'Camera circles your subject from one photo', needs: 'Photo',
    inputs: ['Photo', 'Orbit type', 'Backdrop'], oldRoutes: ['/tools/app-orbit-shot'], inMenu: true,
    how: [['Add a photo', 'One subject, clearly in view.'], ['Pick the orbit', 'And the backdrop behind it.'], ['Generate', 'The camera circles your subject.']] }),
  // Lip sync (user, 2026-10-23): its result is a video, so it lives here; it runs on the voice tool's lipsync mode (provider comfy-h3-lipsync), unchanged.
  W({ id: 'lip-sync', name: 'Lip Sync', toolId: 'voice', params: { mode: 'lipsync' }, category: 'motion', tagline: 'Make a portrait talk with your speech clip', needs: 'Portrait + speech',
    inputs: ['Portrait (PNG/JPG; optional on LTX-2.5)', 'Speech audio (2–15 s on H3, up to 4.7 s on LTX-2.5)', 'Prompt (optional)'], oldRoutes: [], inMenu: true,
    how: [['Add a portrait', 'A clear, front-facing photo.'], ['Add speech audio', 'WAV, MP3 or M4A, 2–15 seconds.'], ['Generate', 'The face speaks your clip, lips in sync.']] }),
  W({ id: 'transitions', name: 'Transitions', toolId: 'app-transition', category: 'apps', tagline: 'Animate from a start to an end image', needs: '2 photos',
    inputs: ['Start image', 'End image', 'Transition'], oldRoutes: ['/tools/app-transition'], inMenu: true,
    how: [['Add the start image', 'Where the clip begins.'], ['Add the end image', 'Where it lands.'], ['Generate', 'A transition between the two.']] }),
  W({ id: 'ugc-ad', name: 'UGC Ad', toolId: 'app-ugc-ad', category: 'apps', tagline: 'Phone-style ad with a talking presenter', needs: 'Product photo',
    inputs: ['Product photo', 'Presenter', 'Hook'], oldRoutes: ['/tools/app-ugc-ad'], inMenu: true,
    how: [['Add your product', 'One clear photo.'], ['Pick a presenter and hook', 'Who talks and how it opens.'], ['Generate', 'A short phone-style ad.']] }),
];
/**
 * Flow shortcuts (2026-10-26, Explore rework): the newer things the Video tab does that are a setting of a workflow, not a workflow of their own
 * (Loop is Create Video with a start frame and Loop on; Morph is Transitions' morph on LTX-2.5; Exploded view is a Photo FX effect; New angle is
 * Re-shoot on H3 CrossView), plus Direct a Shot, which lives on the 3D page. The header Video menu and the Video workflow picker list them next
 * to the workflows; picking one opens `href` with its settings filled in. `toolId` must be on the server for the row to show.
 */
export interface VideoFlowShortcut extends VideoWorkflow { href: string; /** a short badge: New, Local */ badge?: string;
  /** the other tab it opens in (Direct a Shot: '3D'); every other shortcut opens inside the Video tab */ opensIn?: string }
const SC = (w: Omit<VideoFlowShortcut, 'oldRoutes' | 'inMenu'>): VideoFlowShortcut => ({ ...w, oldRoutes: [], inMenu: true });
export const VIDEO_FLOW_SHORTCUTS: VideoFlowShortcut[] = [
  SC({ id: 'direct-a-shot', name: 'Direct a Shot', toolId: 'plan-a-shot', category: 'create', tagline: 'Block it in 3D. Film it for real, with sound', needs: 'Opens in 3D',
    inputs: ['Preset scene', 'Camera move', 'Render prompt'], href: `${THREE_D_PAGE}?workflow=plan-a-shot`, badge: 'Free', opensIn: '3D' /* the only Video menu row that leaves the Video tab (user, 2026-10-26) */,
    how: [['Stage', 'Pick a scene and a camera move in your browser.'], ['Mockup', 'Record it: free, takes seconds.'], ['Render', 'Get real video with sound back. Free on your computer.']] }),
  SC({ id: 'loop', name: 'Loop', toolId: 'h3-video', category: 'create', tagline: 'A clip that ends where it began', needs: 'Start frame',
    inputs: ['Start frame', 'Prompt'], href: `${VIDEO_PAGE}?model=ltx-2.5-22b&loop=1`, badge: 'New',
    how: [['Add a start frame', 'The clip begins and ends on it.'], ['Switch Loop on', 'The motion comes back to the first frame.'], ['Generate', 'It plays on repeat with no jump. Free on your computer.']] }),
  SC({ id: 'morph', name: 'Morph', toolId: 'app-transition', category: 'apps', tagline: 'One scene turns into another', needs: '2 photos',
    inputs: ['Start image', 'End image', 'Prompt'], href: `${VIDEO_PAGE}?workflow=transitions&preset=morph&model=ltx-2.5-22b`, badge: 'New',
    how: [['Add a start and an end image', 'Same shape works best.'], ['Describe the change', 'What grows, unfolds or melts into what.'], ['Generate', 'The first scene turns into the second, with sound.']] }),
  SC({ id: 'exploded-view', name: 'Exploded view', toolId: 'photo-fx', category: 'camera', tagline: 'An object comes apart into a neat exploded view', needs: 'Photo',
    inputs: ['Photo', 'What the object is'], href: `${VIDEO_PAGE}?workflow=photo-fx&preset=exploded-view&model=ltx-2.5-22b`, badge: 'New',
    how: [['Add a photo', 'One object, clearly in view.'], ['Name the object', 'The prompt says what comes apart.'], ['Generate', 'Free on your computer.']] }),
  SC({ id: 'new-angle', name: 'New angle', toolId: 'reshoot', category: 'edit', tagline: 'Re-film your take from a camera you point on a dial', needs: '1 clip',
    inputs: ['Clip', 'Azimuth and elevation'], href: `${VIDEO_PAGE}?workflow=reshoot&model=minimax-h3-crossview`, badge: 'New',
    how: [['Upload your take', 'The subject in view.'], ['Point the camera', 'Turn and tilt it on the dial.'], ['Generate', 'The same moment, filmed again from your angle.']] }),
];
export const VIDEO_WORKFLOW_CATEGORIES: { id: VideoWorkflowCategory | 'all'; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'create', label: 'Create' }, { id: 'edit', label: 'Edit' }, { id: 'motion', label: 'Motion' }, { id: 'camera', label: 'Camera' }, { id: 'apps', label: 'Apps' }];

export const videoWorkflowById = (id: string | null | undefined): VideoWorkflow | undefined => VIDEO_WORKFLOWS.find((w) => w.id === (id || 'create'));
/** The workflow a tool runs as (the first one; Edit Video's list is a hub, never a tool's own workflow). */
export const videoWorkflowOfTool = (toolId: string): VideoWorkflow | undefined => VIDEO_WORKFLOWS.find((w) => w.toolId === toolId && w.surface !== 'edit-hub' && !w.params);
/** Where a workflow opens. */
export const videoWorkflowHref = (id: string): string => { if (id === 'two-person-swap') id = 'object-swap'; if (!id || id === 'create') return VIDEO_PAGE; const w = VIDEO_WORKFLOWS.find((x) => x.id === id);
  const extra = Object.entries(w?.params ?? {}).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join(''); return `${VIDEO_PAGE}?workflow=${encodeURIComponent(id)}${extra}`; };
/** Removed video pages (Director, 2026-10-23): they open the Video page with nothing picked. */
export const RETIRED_VIDEO_PAGES = ['/tools/cinema', '/tools/director'];
/** Old video pages → the Video page with their workflow (query kept by redirectTarget). */
export const VIDEO_REDIRECTS: Record<string, string> = { ...Object.fromEntries(VIDEO_WORKFLOWS.flatMap((w) => w.oldRoutes.map((r) => [r, videoWorkflowHref(w.id)]))),
  /* Director removed from the app (2026-10-23): its page (and the /tools/director alias) opens Create Video; its API and old jobs still work. */
  ...Object.fromEntries(RETIRED_VIDEO_PAGES.map((r) => [r, VIDEO_PAGE])) };

/** Redirects the path table can't say: the old address /tools/h3-video (→ /video), /video?tab=motion (the old Motion Control tab) and /tools/edit-video/<x> (old sub-routes).
 *  Returns the new URL (query and hash kept, the old `tab` param dropped) or null. */
export function videoRedirect(pathname: string, search: string, hash = ''): string | null {
  const p = (pathname.replace(/\/+$/, '') || '/').toLowerCase(); const q = new URLSearchParams(search);
  if (p === OLD_VIDEO_PAGE) return videoRedirect(VIDEO_PAGE, search, hash) ?? `${VIDEO_PAGE}${search && search !== '?' ? (search.startsWith('?') ? search : `?${search}`) : ''}${hash}`;
  // Navigation consolidates on the existing single-subject tool. Recreate must NOT discard personB or reinterpret an old two-pass run.
  const oldSwap = p === '/tools/two-person-swap' || p === '/tools/edit-video/two-person-swap' || (p === VIDEO_PAGE && q.get('workflow') === 'two-person-swap');
  if (oldSwap) {
    if (q.has('recreate')) {
      if (p === VIDEO_PAGE) return null; // App renders the retired-run warning, with no generation bar.
      q.set('workflow', 'two-person-swap');
    } else { q.set('workflow', 'object-swap'); }
    return `${VIDEO_PAGE}?${reorder(q)}${hash}`;
  }
  if (p === VIDEO_PAGE && q.get('tab') === 'motion' && !q.get('workflow')) { q.delete('tab'); q.set('workflow', 'motion-control'); return `${VIDEO_PAGE}?${reorder(q)}${hash}`; }
  if (p === VIDEO_PAGE && q.has('tab') && !q.get('workflow')) { q.delete('tab'); const s = q.toString(); return `${VIDEO_PAGE}${s ? `?${s}` : ''}${hash}`; }
  if (p === '/tools/voice' && q.get('mode') === 'lipsync') { q.delete('mode'); const rest = q.toString(); return `${videoWorkflowHref('lip-sync')}${rest ? `&${rest}` : ''}${hash}`; }
  if (RETIRED_VIDEO_PAGES.some((r) => p.startsWith(`${r}/`))) { const rest = q.toString(); return `${VIDEO_PAGE}${rest ? `?${rest}` : ''}${hash}`; } // /tools/cinema/<x>
  /* the Camera Moves and Photo FX galleries (2026-10-25): the Video page with that workflow; the grid is its Move / Effect picker in the bar,
   * a move's own page (/camera-moves/<id>) opens the workflow with that move picked */
  const g = /^\/(camera-moves|photo-fx)(?:\/([^/]+))?$/.exec(p);
  if (g) { const wf = g[1] === 'camera-moves' ? 'camera-moves' : 'photo-fx'; const rest = q.toString(); const extra = g[2] ? `&preset=${encodeURIComponent(decodeURIComponent(g[2]))}` : `&pick=${GALLERY_GROUP[wf]}`;
    return `${videoWorkflowHref(wf)}${extra}${rest ? `&${rest}` : ''}${hash}`; }
  const m = /^\/tools\/edit-video\/([^/]+)/.exec(p);
  if (m) { const w = VIDEO_WORKFLOWS.find((x) => x.id === m[1] || x.toolId === m[1]); const to = videoWorkflowHref(w?.id ?? 'edit-video'); const s = q.toString(); return `${to}${s ? `${to.includes('?') ? '&' : '?'}${s}` : ''}${hash}`; }
  return null;
}
/** The bar option group a gallery link opens (the recipe's group id, shared/videoBar.ts). */
const GALLERY_GROUP: Record<string, string> = { 'camera-moves': 'move', 'photo-fx': 'effect' };
/** Edit Video (the list of edits) is the picker's Edit tab now (2026-10-25): its URL opens Create Video with the picker on that tab. */
export const isEditHub = (id: string | null | undefined): boolean => VIDEO_WORKFLOWS.find((w) => w.id === id)?.surface === 'edit-hub';
/** Workflows with their own panel instead of a bar recipe, that need no registry tool (Stitch: POST /api/compose). */
export const isPanelWorkflow = (w: Pick<VideoWorkflow, 'surface'> | null | undefined): boolean => w?.surface === 'stitch';
/** Stitch with this clip added to its timeline (Assets ⋯ Add to Stitch): ?add=<job id>; the panel appends the job's video. */
export const stitchAddHref = (jobId: string): string => `${videoWorkflowHref('stitch')}&add=${encodeURIComponent(jobId)}`;
/** workflow first, the rest in their old order. */
function reorder(q: URLSearchParams): string { const w = q.get('workflow'); q.delete('workflow'); const rest = q.toString(); return `workflow=${w}${rest ? `&${rest}` : ''}`; }
