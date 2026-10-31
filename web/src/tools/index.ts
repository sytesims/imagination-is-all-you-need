import type { ComponentType } from 'react';
import type { ToolInfo } from '../api';
// Screens load as their own chunks (platform/routeChunks.ts); same components, loaded on first use.
import { AppTool, FaceSwapTool, ShotsTool, ThreeDStudio } from '../platform/routeChunks';

export interface ToolProps { tool: ToolInfo; tools: ToolInfo[] }
/** Web-side registry: server `ui` key → screen component. Metadata comes from GET /api/tools. */
export const toolScreens: Record<string, ComponentType<ToolProps>> = {
  /* Object Swap, Motion Control, Restyle, Anime Restyle (ui video-swap) and Re-shoot have no page of their own (2026-10-26): they run in the
   * Video page's bar like every video workflow; /tools/<id> redirects to /video?workflow=<id>. */
  app: AppTool,
  // Director (cinema) removed from the app 2026-10-23: no screen; /tools/cinema redirects to the Video page, its API and old jobs still work.
  /* Extend, Reframe, SDR to HDR, FPS Boost, Depth Map, Remove BG and Video Upscale have no page of their own (2026-10-25): they run in the
   * Video page's bar (ui/video/VideoWorkflowBar.tsx, recipes in server/src/shared/videoBar.ts); their old URLs redirect there. */
  'app-face-swap': FaceSwapTool, 'app-person-swap': FaceSwapTool, 'app-shots': ShotsTool,
  'three-d': ThreeDStudio, // the 3D page (/3d, 2026-10-23): Image to 3D and Turntable video (tools three-d, three-d-turntable) // image apps (phase 1 quick wins): two photo slots / angle chips + a results grid
  // Upscale (image-upscale) runs in Create Image's bar now: /tools/image-upscale redirects to /image?workflow=upscale (shared/imageFeatures oldRoutes)
};
