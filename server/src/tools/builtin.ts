/**
 * The built-in tools, grouped by studio (plan §3.4, Phase 3). Data only: nothing registers here. A booted server registers each group from its
 * own plugin (plugins-builtin/studios.ts → ctx.tools); code that runs without booting (scripts, tests) gets all of them, the desktop profile's
 * set, from tools/registry.ts on its first read.
 *
 * Nav order is the explicit `order` number of each tool (GET /api/tools lists by it), never the order modules load in. The numbers keep the
 * order the app has always had, which interleaves the studios (Swap & Motion first, the Apps gallery last). A workflow folder (plugins/,
 * <data>/plugins) comes after every built-in (tools/registry.ts FOLDER_ORDER).
 *
 * The groups follow the app's tabs and the code that builds them:
 *  - studio-video: the Video tab (create, extend, Camera Moves, Swap & Motion, Re-shoot, the cinema flow, Photos → Reel);
 *  - studio-image: the Image tab (Create Image, Image Upscale, the unlisted OpenSoul runner);
 *  - studio-audio: the Audio tab (music, soundtrack, voice);
 *  - studio-3d:    the 3D page (Image to 3D, turntable, Direct a Shot and its Make it Real step);
 *  - studio-edit:  Edit Video (tools/editVideo, Footage Effects, Prompt Edit, Swap Two People, Finish);
 *  - apps-gallery: the Apps (tools/apps.ts: Photo FX, Upscale and every app-<id> recipe of APP_GALLERY). A recipe wraps a base tool of another
 *    studio; with that studio off, the recipe is left out too.
 */
import type { ToolDef } from './types.js';
import { photosReelTool } from './photosReel.js';
import { objectSwapTool, motionTransferTool, restyleTool } from './videoSwap.js';
import { reshootTool } from './reshoot.js';
import { cameraApp, photoFxApp, upscaleApp, APP_GALLERY, makeGalleryApp } from './apps.js';
import { createImageTool, h3VideoTool, audioTool, soundtrackTool, voiceStudioTool, imageUpscaleTool } from './media.js';
import { cinemaTool } from '../cinema/tool.js';
import { soulTool } from './soul/index.js';
import { h3ExtendTool } from './h3/index.js';
import { NEW_EDIT_TOOLS } from './editVideo/index.js';
import { threeDTool, turntableTool } from './threeD.js';
import { previzTool } from './previz.js';
import { makeItRealTool } from './makeItReal.js';
import { footageFxTool } from './footageFx.js';
import { finishTool } from './finish.js';
import { promptEditTool } from './promptEdit.js';
import { twoPersonSwapTool } from './twoPersonSwap.js';
import { layersTool } from '../layers/tool.js';
import '../layers/register.js'; // Video to layers: its places, price row and licences (studio-edit turns the tool, plan and routes on and off)
import { wireComfyFeatured } from './comfyFeatured.js'; // official Comfy templates (2026-10-27): models on tools above (Gemini Omni 1.1 Flash, Topaz Bloom 2, Wan Animate 2…)
import { booting } from '../kernel/booting.js';
if (!booting()) wireComfyFeatured(); // scripts and tests; a booted server wires them in plugin comfy-featured (first in the profile)

export interface ToolEntry { tool: ToolDef; order: number; aliases?: string[] }
export type StudioId = 'studio-video' | 'studio-image' | 'studio-audio' | 'studio-3d' | 'studio-edit' | 'apps-gallery';

/** Edit Video tools (tools/editVideo) with their old ids kept as aliases. */
const EDIT_ALIASES: Record<string, string[]> = { 'sdr-hdr': ['hdr'], 'depth-map': ['depth'] };

/** Each studio's own tools. The gallery recipes come from galleryEntries (they need their base tool). */
export const STUDIO_TOOLS: Record<StudioId, ToolEntry[]> = {
  'studio-video': [
    { tool: objectSwapTool, order: 10, aliases: ['face-swap'] },
    { tool: motionTransferTool, order: 20 },
    { tool: restyleTool, order: 30 },
    { tool: reshootTool, order: 40 },
    { tool: cameraApp, order: 50 },
    { tool: h3VideoTool, order: 90 },
    { tool: h3ExtendTool, order: 100 },
    { tool: cinemaTool, order: 130, aliases: ['director'] },
    { tool: photosReelTool, order: 300 },
  ],
  'apps-gallery': [
    { tool: photoFxApp, order: 60 },
    { tool: upscaleApp, order: 70 },
  ],
  'studio-image': [
    { tool: createImageTool, order: 80 },
    { tool: imageUpscaleTool, order: 150 },
    { tool: soulTool, order: 160, aliases: ['opensoul'] },
  ],
  'studio-audio': [
    { tool: audioTool, order: 110 },
    { tool: soundtrackTool, order: 120 },
    { tool: voiceStudioTool, order: 140, aliases: ['voice-studio'] },
  ],
  'studio-3d': [
    { tool: threeDTool, order: 170, aliases: ['image-to-3d'] }, // 3D page (2026-10-23): /3d
    { tool: turntableTool, order: 180, aliases: ['turntable'] },
    { tool: previzTool, order: 190, aliases: ['previz'] }, // Direct a Shot (2026-10-24): /3d?workflow=plan-a-shot
    { tool: makeItRealTool, order: 200 }, // Direct a Shot step 3 (2026-10-24): LTX-2.5 + Layout to Render, local and free
  ],
  'studio-edit': [
    { tool: layersTool, order: 245 }, // Video to layers (2026-11-07, server/src/layers): its plan and /api/layers routes come with this studio (plugins-builtin/studios.ts)
    { tool: footageFxTool, order: 210 }, // Footage Effects (2026-10-26): Lightricks LTX-2.5 IC-LoRA effects on your own clip, local and free
    { tool: twoPersonSwapTool, order: 220 }, // Swap Two People (2026-10-27): H3 Character Swap twice in one Comfy Cloud job
    { tool: promptEditTool, order: 230 }, // Prompt Edit (2026-10-27): Bernini-R on Comfy Cloud, one sentence edits a clip
    { tool: finishTool, order: 240 }, // Finish (2026-10-27): eight one-click finishing looks (ffmpeg, our own graphs), free on this computer
    ...NEW_EDIT_TOOLS.map((tool, i) => ({ tool, order: 250 + i * 10, aliases: EDIT_ALIASES[tool.id] })), // reframe, remove-bg, sdr-hdr, fps-boost, depth-map
  ],
};
/** The order every studio starts in (boot.ts, the registry's fallback): the gallery last, since its recipes wrap the other studios' tools. */
export const STUDIO_IDS: readonly StudioId[] = ['studio-video', 'studio-image', 'studio-audio', 'studio-3d', 'studio-edit', 'apps-gallery'];
/** The gallery recipes come after every other built-in tool. */
export const GALLERY_ORDER = 1000;

/** The Apps gallery recipes (tools/apps.ts APP_GALLERY): app-<id> wrapping its base tool, which `base` looks up (registered tools only). */
export function galleryEntries(base: (id: string) => ToolDef | undefined): ToolEntry[] {
  const out: ToolEntry[] = [];
  APP_GALLERY.forEach((a, i) => { const b = base(a.base); if (b) out.push({ tool: makeGalleryApp(a, b), order: GALLERY_ORDER + i * 10 }); else console.warn(`[apps] ${a.id}: base tool ${a.base} isn't in this app`); });
  return out;
}

/** Every built-in tool id and alias, and the studio it belongs to (a tool of a studio that is off answers "turned off in this app"). */
export const BUILTIN_TOOL_STUDIO: ReadonlyMap<string, StudioId> = new Map([
  ...Object.entries(STUDIO_TOOLS).flatMap(([s, list]) => list.flatMap((e) => [e.tool.id, ...(e.aliases ?? [])].map((id) => [id, s as StudioId] as const))),
  ...APP_GALLERY.map((a) => [`app-${a.id}`, 'apps-gallery' as StudioId] as const),
]);

/** Roadmap ("Soon") entries (CLEANROOM-SPEC P1/P2; our own names). A real tool with the same id takes the entry's place. */
export const SOON: readonly [string, string][] = [['edit-recreate', 'Edit Recreate'], ['scene-studio', 'Scene Studio'], ['reframe', 'Reframe'], ['cutout', 'Cutout'],
  ['character-builder', 'Character Builder'], ['lipsync', 'Lipsync'], ['storyboard', 'Storyboard']];
