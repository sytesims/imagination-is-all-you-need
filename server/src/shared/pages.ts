/**
 * The make pages' addresses (2026-10-31): Image, Video, Audio and 3D each live at a clean address (/image, /video, /audio, /3d).
 * This is the one place that says so; nav, Explore, recipes, Recreate and hand-off links all build on these constants.
 * The tool ids behind the pages stay as they were (API, jobs, stored data, MCP). The old /tools/<x> addresses redirect here
 * with every query param and the hash kept (the web router replaces the URL, so Back doesn't bounce).
 *
 * Isomorphic (no server imports): the web app and the server read it alike.
 */

export const IMAGE_PAGE = '/image';
export const VIDEO_PAGE = '/video';
export const AUDIO_PAGE = '/audio';
export const THREE_D_PAGE = '/3d';

/** The tools the pages run when no workflow is picked (ids unchanged). */
export const IMAGE_TOOL = 'create-image';
export const VIDEO_TOOL = 'h3-video';
export const AUDIO_TOOL = 'audio';
export const THREE_D_TOOL = 'three-d';

/** Tool id → its page. */
export const TOOL_PAGES: Record<string, string> = { [IMAGE_TOOL]: IMAGE_PAGE, [VIDEO_TOOL]: VIDEO_PAGE, [AUDIO_TOOL]: AUDIO_PAGE, [THREE_D_TOOL]: THREE_D_PAGE };
/** The pages' old addresses (until 2026-10-31). Each page's shared module redirects its own (imageFeatures IMAGE_REDIRECTS, videoRedirect,
 *  audioRedirectTarget, THREE_D_REDIRECTS), so the old page-specific links (?tab=motion, ?mode=music) keep landing on the right workflow. */
export const OLD_IMAGE_PAGE = '/tools/create-image';
export const OLD_VIDEO_PAGE = '/tools/h3-video';
export const OLD_AUDIO_PAGE = '/tools/audio';
export const OLD_THREE_D_PAGE = '/tools/3d';

/** A tool's own page when the tool list isn't at hand: the page above, else /tools/<id>. */
export const toolPage = (toolId: string): string => TOOL_PAGES[toolId] ?? `/tools/${toolId}`;
/** The tool a page runs (/image → create-image, trailing slash tolerated), or undefined. */
export const pageTool = (path: string): string | undefined => { const p = path.replace(/\/+$/, '') || '/'; return Object.keys(TOOL_PAGES).find((id) => TOOL_PAGES[id] === p); };
