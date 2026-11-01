import { photosReelTool } from './photosReel.js';
import type { ToolDef } from './types.js';
import { invalidateTools } from '../toolsCache.js';
import { objectSwapTool, motionTransferTool, restyleTool } from './videoSwap.js';
import { reshootTool } from './reshoot.js';
import { cameraApp, photoFxApp, upscaleApp } from './apps.js';
import { createImageTool, h3VideoTool, audioTool, soundtrackTool, voiceStudioTool, imageUpscaleTool } from './media.js';
import { cinemaTool } from '../cinema/tool.js';
import { APP_GALLERY, makeGalleryApp } from './apps.js';
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
import './comfyFeatured.js'; // official Comfy templates (2026-10-27): Gemini Omni 1.1 Flash, Topaz Bloom 2, Wan Animate 2 on Comfy Cloud

const tools = new Map<string, ToolDef>();
const aliases = new Map<string, string>();
export function registerTool(t: ToolDef, ...alias: string[]) {
  if (tools.has(t.id)) throw new Error(`duplicate tool id ${t.id}`);
  tools.set(t.id, t);
  alias.forEach((a) => aliases.set(a, t.id));
  invalidateTools(); // a plugin tool added after start shows in GET /api/tools at once
}
/** Takes a tool out again (a workflow you added and then removed, workflowImport.ts). Built-in tools never call this. */
export function unregisterTool(id: string) {
  if (!tools.delete(id)) return false;
  for (const [a, t] of [...aliases]) if (t === id) aliases.delete(a);
  hidden.delete(id); invalidateTools(); return true;
}
/** Disabled plugin tools (POST /api/plugins/:id {enabled:false}): hidden from lookups and lists without a restart. */
const hidden = new Set<string>();
export const setToolHidden = (id: string, on: boolean) => { if (on) hidden.add(id); else hidden.delete(id); };
export const isToolHidden = (id: string) => hidden.has(id);
export const getTool = (id: string) => { const t = tools.get(id) ?? tools.get(aliases.get(id) ?? ''); return t && !hidden.has(t.id) ? t : undefined; };
/** True when a tool (or an alias) already has this id, hidden ones included: a new workflow may never take it. */
export const toolIdTaken = (id: string) => tools.has(id) || aliases.has(id);
export const listTools = () => [...tools.values()].filter((t) => !hidden.has(t.id));
export const DEFAULT_TOOL_ID = 'object-swap';

/** Roadmap ("Soon") entries live here too, so the nav can't drift from the registry. Not runnable. */
export interface SoonEntry { id: string; name: string; group: string; category: string; status: 'soon' }
const soon: SoonEntry[] = [];
export const registerSoon = (id: string, name: string, group = 'Soon') => { if (!tools.has(id)) soon.push({ id, name, group, category: group, status: 'soon' }); };
export const listSoon = () => soon.filter((s) => !tools.has(s.id));

// ---- Registered tools (order = nav order) ----
registerTool(objectSwapTool, 'face-swap');
registerTool(motionTransferTool);
registerTool(restyleTool);
registerTool(reshootTool);
registerTool(cameraApp);
registerTool(photoFxApp);
registerTool(upscaleApp);
registerTool(createImageTool);
registerTool(h3VideoTool);
registerTool(h3ExtendTool);
registerTool(audioTool);
registerTool(soundtrackTool);
registerTool(cinemaTool, 'director');
registerTool(voiceStudioTool, 'voice-studio');
registerTool(imageUpscaleTool);
registerTool(soulTool, 'opensoul');
registerTool(threeDTool, 'image-to-3d'); // 3D page (2026-10-23): /3d
registerTool(turntableTool, 'turntable');
registerTool(previzTool, 'previz'); // Direct a Shot (2026-10-24): /3d?workflow=plan-a-shot
registerTool(makeItRealTool); // Direct a Shot step 3 (2026-10-24): LTX-2.5 + Layout to Render, local and free
registerTool(footageFxTool); // Footage Effects (2026-10-26): Lightricks LTX-2.5 IC-LoRA effects on your own clip, local and free
registerTool(twoPersonSwapTool); // Swap Two People (2026-10-27): H3 Character Swap twice in one Comfy Cloud job (tools/twoPersonSwap.ts)
registerTool(promptEditTool); // Prompt Edit (2026-10-27): Bernini-R on Comfy Cloud, one sentence edits a clip (tools/promptEdit.ts)
registerTool(finishTool); // Finish (2026-10-27): eight one-click finishing looks (ffmpeg, our own graphs), free on this computer
for (const t of NEW_EDIT_TOOLS) registerTool(t, ...(({ 'sdr-hdr': ['hdr'], 'depth-map': ['depth'] } as Record<string, string[]>)[t.id] ?? [])); // Edit Video tools (tools/editVideo)
// Apps gallery (data in tools/apps.ts APP_GALLERY): each app is a runnable tool `app-<id>` wrapping its base tool.
registerTool(photosReelTool);
for (const a of APP_GALLERY) { const b = tools.get(a.base); if (b) registerTool(makeGalleryApp(a, b)); else console.warn(`[apps] ${a.id}: unknown base tool ${a.base}`); }

// ---- Roadmap (CLEANROOM-SPEC P1/P2; our own names). Registering a real tool with the same id removes it from Soon. ----
[['edit-recreate', 'Edit Recreate'], ['scene-studio', 'Scene Studio'], ['reframe', 'Reframe'], ['cutout', 'Cutout'],
 ['character-builder', 'Character Builder'], ['lipsync', 'Lipsync'], ['storyboard', 'Storyboard']].forEach(([id, name]) => registerSoon(id, name));
