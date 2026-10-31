/**
 * Unified Create Image, step 1: the image workflows as declarative recipes.
 * A recipe says what Create Image's bar shows when a workflow is picked (labelled photo slots, control groups, the prompt's role,
 * the Generate label) and which existing tool runs it. Nothing here runs a job: the runner is still the `app-*` tool (tools/apps.ts
 * makeGalleryApp), so the API, MCP and saved jobs keep their ids. Tool ids are never renamed here.
 *
 * Isomorphic: no server imports. What a recipe derives from the live tool (field options, defaults, ranges, models per mode, locks)
 * is filled in by `imageWorkflowsPayload(getTool)` from the registered app (which is built from APP_GALLERY), so the bar can never
 * drift from what the server validates. `validateImageWorkflows(getTool)` checks the two agree (boot + test/image-workflows.test.ts).
 */
import { IMAGE_FEATURES, featureById, workflowFor, workflowLine, modelNameOf, type ImageFeatureId } from './imageFeatures.js';
import { IMAGE_CAPS } from './imageCaps.js';
import { UPSCALE_MODELS, UPSCALE_FACTORS } from './imageUpscale.js';
import { RIG_OPTIONS, RIG_DEFAULT } from './cameraLens.js';
import type { PromptFrame } from './typedPrompt.js';

export type WorkflowCategory = 'edit' | 'people' | 'product' | 'camera';
export type ControlKind = 'select' | 'tiles' | 'grid' | 'pad' | 'segmented' | 'slider' | 'toggle' | 'swatches' | 'text' | 'chips-multi' | 'sphere';
export interface WorkflowSource { kind: 'ours' | 'official' | 'community'; author: string; url: string | null; licence: string; file: string | null; /** one line, our words */ note: string }
export interface WorkflowSlot { name: string; label: string; required: boolean; /** the form field the file goes out as (the app maps it on: Face Swap `face` → refs[0]) */ sendsAs: string; order: number; /** empty-slot text */ hint: string; /** Generate's text while it's empty */ missing: string }
export interface WorkflowControl { field: string; label: string; kind: ControlKind; group: string; optional?: boolean;
  /** kind 'text': the field's length cap and example words (Material Swap), filled from the tool */ maxLength?: number; placeholder?: string;
  /** filled from the tool (Relight looks also carry a swatch, the controls they set and a credit): */ options?: { value: string; label: string; swatch?: string; sets?: Record<string, string>; credit?: string; /** Character Sheet layouts: the tile's small line and the shape it asks for */ description?: string; aspect?: string }[]; default?: string; min?: number; max?: number; step?: number; pattern?: string; help?: string }
export interface WorkflowGroup { id: string; label: string; icon: string; /** fields whose values make the chip's short summary, in order */ summary: string[] }
export interface WorkflowRecipe {
  id: ImageFeatureId; name: string; icon: string; category: WorkflowCategory; tagline: string; /** what it needs, shown in the picker ("1 photo", "2 photos", "Photo optional") */ needs: string;
  source: WorkflowSource;
  runner: { kind: 'create-image'; toolId: string };
  slots: WorkflowSlot[]; groups: WorkflowGroup[]; controls: WorkflowControl[];
  prompt: { mode: 'required' | 'optional' | 'hidden'; placeholder: string; /** how the user's text is used: 'recipe' = added to our recipe prompt server side */ composer: 'recipe' | 'plain';
    /** Optional only while this slot is filled (Character Sheet: no photo → describe the character); `missing` = Generate's text then. */ requiredWithout?: { slot: string; missing: string };
    /** The recipe text around your words (2026-10-25, from the tool: tools/apps.ts promptFrames). The bar uses it to keep a composed prompt out of the box. */ frames?: PromptFrame[] };
  /** Values the recipe fixes, said as plain text in the strip ("3 panels · 4:3"). */ fixedNote?: string;
  /** A link in the strip (Upscale: "Examples" opens the examples popup). */ extras?: ('upscale-examples')[];
  /** The base mode, and the mode a slot switches to when it is filled (Character Sheet: a photo → edit). */
  modes: { default: string; whenSlot: Record<string, string> | null };
  /** Models per mode (provider ids, quality order): filled from the tool. In GET /api/image-workflows only the models whose quote passes
   *  with this recipe's locked settings in that mode (same check as the price / submit); the rest are in `unavailable`. */ models: Record<string, string[]>;
  /** Per mode, the tool's models that can't run this recipe as locked (Character Sheet 4:3 on a model whose edits follow the photo), with the
   *  reason in plain words. The model menu lists them greyed at the bottom. Only in the payload (when the server passes its quote check). */ unavailable?: Record<string, { id: string; reason: string }[]>;
  /** Per mode, models that run this recipe once the bar fits / crops the photo to `fit` (input prep). Only in the payload. */ prep?: Record<string, Record<string, { fit: string; note: string }>>;
  output: { aspect: 'model' | 'follow-photo' | 'fixed'; fixedAspect?: string; resolution: 'model' | 'follow-photo'; count: number | 'model' | 'perOption' };
  /** Values the runner locks (filled from the tool's gallery.locked). */ locked: Record<string, string>;
  /** A special surface the bar needs (later steps): mask sheet, multi-output picker, camera rig. */ surface: 'mask' | 'multi-output' | 'rig' | null;
  generateLabel: string;
  aliases: { toolId: string; routes: string[] };
  /** 'ready' = pickable in Create Image's bar (all of them since 2026-10-23); 'soon' = listed, opens its own page. */ status: 'ready' | 'soon';
  /** The page it has today (used while status is 'soon'). */ route: string;
}
type Decl = Omit<WorkflowRecipe, 'name' | 'tagline' | 'needs' | 'models' | 'locked' | 'aliases' | 'route' | 'controls' | 'source'> & { controls: Omit<WorkflowControl, 'options' | 'default' | 'min' | 'max' | 'step' | 'pattern' | 'help' | 'maxLength' | 'placeholder'>[]; source?: Partial<WorkflowSource> };

const OURS = (note: string): WorkflowSource => ({ kind: 'ours', author: 'Imagination Is All You Need', url: null, licence: 'AGPL-3.0', file: null, note });
const slot = (name: string, label: string, required: boolean, hint: string, missing: string, sendsAs = name, order = 1): WorkflowSlot => ({ name, label, required, sendsAs, order, hint, missing });
const app = (id: string) => ({ kind: 'create-image' as const, toolId: id });
const TPL = 'https://github.com/Comfy-Org/workflow_templates/blob/main/templates/';

/** The declarations: only what the bar needs that the tool can't tell it (labels in our words, grouping, icons, the Generate label). */
const DECLS: Decl[] = [
  { id: 'relight', icon: 'light', category: 'edit', runner: app('app-relight'), status: 'ready',
    slots: [slot('image', 'Photo', true, 'Add the photo to relight', 'Add a photo')],
    groups: [{ id: 'light', label: 'Light', icon: 'light', summary: ['look', 'direction', 'lightQuality', 'brightness', 'color'] }],
    controls: [{ field: 'look', label: 'Look', kind: 'tiles', group: 'light' }, { field: 'direction', label: 'Light direction', kind: 'grid', group: 'light' }, { field: 'lightX', label: 'Light position X', kind: 'pad', group: 'light', optional: true },
      { field: 'lightY', label: 'Light position Y', kind: 'pad', group: 'light', optional: true }, { field: 'lightQuality', label: 'Light quality', kind: 'segmented', group: 'light' },
      { field: 'brightness', label: 'Brightness', kind: 'slider', group: 'light' }, { field: 'color', label: 'Colour', kind: 'swatches', group: 'light' },
      { field: 'light', label: 'Light sphere', kind: 'sphere', group: 'light', optional: true }],
    prompt: { mode: 'optional', placeholder: 'Extra details (optional)', composer: 'recipe' }, modes: { default: 'edit', whenSlot: null },
    output: { aspect: 'follow-photo', resolution: 'follow-photo', count: 1 }, surface: null, generateLabel: 'Relight', source: { note: 'light recipe' } },
  { id: 'face-swap', icon: 'face-swap', category: 'people', runner: app('app-face-swap'), status: 'ready',
    slots: [slot('image', 'Target', true, 'The photo to change', 'Add a target photo'), slot('face', 'Face', true, 'Add a clear, front-facing face', 'Add a face', 'face', 2)],
    groups: [], controls: [], prompt: { mode: 'optional', placeholder: 'Touch-ups (optional)', composer: 'recipe' }, modes: { default: 'edit', whenSlot: null },
    output: { aspect: 'follow-photo', resolution: 'follow-photo', count: 1 }, surface: null, generateLabel: 'Swap face', source: { note: 'two-image swap prompt' } },
  { id: 'brush-edit', icon: 'brush', category: 'edit', runner: app('app-inpaint'), status: 'ready',
    slots: [slot('image', 'Photo', true, 'Add the photo to edit', 'Add a photo')], groups: [], controls: [],
    prompt: { mode: 'required', placeholder: 'Describe the change in the painted area', composer: 'plain' }, modes: { default: 'inpaint', whenSlot: null },
    output: { aspect: 'follow-photo', resolution: 'follow-photo', count: 1 }, surface: 'mask', generateLabel: 'Edit area', source: { note: 'mask edit' } },
  { id: 'person-swap', icon: 'user', category: 'people', runner: app('app-person-swap'), status: 'ready',
    slots: [slot('image', 'Target', true, 'The photo to change', 'Add a target photo'), slot('person', 'Person', true, 'Add a photo of the person', 'Add a person', 'person', 2)],
    groups: [], controls: [], prompt: { mode: 'optional', placeholder: 'Touch-ups (optional)', composer: 'recipe' }, modes: { default: 'edit', whenSlot: null },
    output: { aspect: 'follow-photo', resolution: 'follow-photo', count: 1 }, surface: null, generateLabel: 'Swap person', source: { note: 'two-image swap prompt' } },
  { id: 'character-sheet', icon: 'character-sheet', category: 'people', runner: app('app-character-sheet'), status: 'ready',
    // Layout (2026-10-25): tiles with a small panel diagram, the Camera Angles picker's look (web WorkflowSurfaces LayoutPanel); each sets its own shape
    slots: [slot('image', 'Your photo', false, 'Optional: a photo of the person', '')], groups: [{ id: 'layout', label: 'Layout', icon: 'character-sheet', summary: ['layout'] }],
    controls: [{ field: 'layout', label: 'Layout', kind: 'tiles', group: 'layout' }],
    prompt: { mode: 'optional', placeholder: 'Describe the character', composer: 'recipe', requiredWithout: { slot: 'image', missing: 'Describe the character' } }, modes: { default: 'generate', whenSlot: { image: 'edit' } },
    output: { aspect: 'fixed', fixedAspect: '4:3', resolution: 'model', count: 'model' }, surface: null, generateLabel: 'Make sheet', source: { note: 'character-sheet prompt' } },
  { id: 'product-shot', icon: 'product', category: 'product', runner: app('app-product-shot'), status: 'ready',
    slots: [slot('image', 'Product photo', false, 'Optional: your product photo', '')],
    groups: [{ id: 'scene', label: 'Scene', icon: 'product', summary: ['scene'] }, { id: 'shape', label: 'Shape', icon: 'aspect', summary: ['aspect'] }],
    controls: [{ field: 'scene', label: 'Scene', kind: 'tiles', group: 'scene' }, { field: 'aspect', label: 'Aspect ratio', kind: 'segmented', group: 'shape' }],
    prompt: { mode: 'optional', placeholder: 'Describe the product', composer: 'recipe', requiredWithout: { slot: 'image', missing: 'Add a photo or text' } }, modes: { default: 'generate', whenSlot: { image: 'edit' } },
    output: { aspect: 'model', resolution: 'model', count: 'model' }, surface: null, generateLabel: 'Make shot', source: { note: 'product scene prompts' } },
  // Upscale (2026-10-22): the image-upscale tool in the bar. Factors and models come from shared/imageUpscale.ts (the same table the page, quote and run use).
  { id: 'upscale', icon: 'upscale', category: 'edit', runner: app('image-upscale'), status: 'ready',
    slots: [slot('image', 'Photo', true, 'Add the image to upscale', 'Add an image')], groups: [{ id: 'scale', label: 'Scale', icon: 'upscale', summary: ['scale'] }],
    controls: [{ field: 'scale', label: 'Scale factor', kind: 'segmented', group: 'scale' }],
    prompt: { mode: 'hidden', placeholder: '', composer: 'plain' }, modes: { default: 'upscale', whenSlot: null },
    output: { aspect: 'follow-photo', resolution: 'follow-photo', count: 1 }, surface: null, generateLabel: 'Upscale', extras: ['upscale-examples'], source: { note: 'upscale graphs' } },
  { id: 'camera-angles', icon: 'shots', category: 'camera', runner: app('app-shots'), status: 'ready',
    slots: [slot('image', 'Photo', true, 'Add the photo', 'Add a photo')], groups: [{ id: 'angles', label: 'Angles', icon: 'shots', summary: ['shots'] }],
    controls: [{ field: 'shots', label: 'Angles', kind: 'chips-multi', group: 'angles' }],
    prompt: { mode: 'optional', placeholder: 'Subject (optional)', composer: 'recipe' }, modes: { default: 'edit', whenSlot: null },
    output: { aspect: 'follow-photo', resolution: 'follow-photo', count: 'perOption' }, surface: 'multi-output', generateLabel: 'Make angles', source: { note: 'angle prompts' } },
  // Photo tools (2026-10-23): fal-only models (tools/imageFalApps.ts). The source is the model's own credit (official Bria templates, else our fal request).
  { id: 'remove-bg', icon: 'cutout', category: 'edit', runner: app('app-remove-bg'), status: 'ready',
    slots: [slot('image', 'Photo', true, 'Add the photo to cut out', 'Add a photo')], groups: [], controls: [],
    prompt: { mode: 'hidden', placeholder: '', composer: 'plain' }, modes: { default: 'edit', whenSlot: null }, fixedNote: 'Transparent PNG',
    output: { aspect: 'follow-photo', resolution: 'follow-photo', count: 1 }, surface: null, generateLabel: 'Cut out', source: { kind: 'official', author: 'Comfy Org', url: `${TPL}utility_bria_remove_image_background.json`, licence: 'MIT (Comfy-Org/workflow_templates)', note: 'Bria background removal' } },
  { id: 'expand', icon: 'expand', category: 'edit', runner: app('app-expand'), status: 'ready',
    slots: [slot('image', 'Photo', true, 'Add the photo to expand', 'Add a photo')], groups: [{ id: 'canvas', label: 'Shape', icon: 'aspect', summary: ['target'] }],
    controls: [{ field: 'target', label: 'New shape', kind: 'segmented', group: 'canvas' }],
    prompt: { mode: 'optional', placeholder: 'What fills the new area (optional)', composer: 'plain' }, modes: { default: 'edit', whenSlot: null },
    output: { aspect: 'model', resolution: 'follow-photo', count: 1 }, surface: null, generateLabel: 'Expand', source: { kind: 'official', author: 'Comfy Org', url: `${TPL}api_bria_expand_image.json`, licence: 'MIT (Comfy-Org/workflow_templates)', note: 'Bria expand' } },
  { id: 'erase', icon: 'eraser', category: 'edit', runner: app('app-erase'), status: 'ready',
    slots: [slot('image', 'Photo', true, 'Add the photo', 'Add a photo')], groups: [], controls: [],
    prompt: { mode: 'hidden', placeholder: '', composer: 'plain' }, modes: { default: 'inpaint', whenSlot: null },
    output: { aspect: 'follow-photo', resolution: 'follow-photo', count: 1 }, surface: 'mask', generateLabel: 'Erase', source: { kind: 'official', author: 'Comfy Org', url: `${TPL}api_bria_eraser.json`, licence: 'MIT (Comfy-Org/workflow_templates)', note: 'Bria eraser' } },
  { id: 'try-on', icon: 'garment', category: 'people', runner: app('app-try-on'), status: 'ready',
    slots: [slot('image', 'Person', true, 'A clear photo of the person', 'Add a person'), slot('garment', 'Garment', true, 'The top, bottom or one-piece, worn or laid flat', 'Add a garment', 'garment', 2)],
    groups: [{ id: 'garment', label: 'Garment', icon: 'garment', summary: ['category', 'garmentPhoto'] }],
    controls: [{ field: 'category', label: 'Garment type', kind: 'segmented', group: 'garment' }, { field: 'garmentPhoto', label: 'Garment photo', kind: 'segmented', group: 'garment' }],
    prompt: { mode: 'hidden', placeholder: '', composer: 'plain' }, modes: { default: 'edit', whenSlot: null },
    output: { aspect: 'follow-photo', resolution: 'model', count: 1 }, surface: null, generateLabel: 'Try on', source: { url: 'https://fal.ai/models/fal-ai/fashn/tryon/v1.6/api', note: 'garment try-on' } },
  // Material Swap (2026-10-31): the object + the material, two optional short words (what it is, what it is made of now) in a Details chip.
  { id: 'material-swap', icon: 'material', category: 'product', runner: app('app-material-swap'), status: 'ready',
    slots: [slot('image', 'Object', true, 'The object to change: a sofa, bag or shoe', 'Add an object photo'), slot('material', 'Material', true, 'A swatch or photo of the new material: leather, marble, denim', 'Add a material photo', 'material', 2)],
    groups: [{ id: 'details', label: 'Details', icon: 'material', summary: ['object', 'fromMaterial'] }],
    controls: [{ field: 'object', label: 'What the object is', kind: 'text', group: 'details', optional: true }, { field: 'fromMaterial', label: 'Made of now', kind: 'text', group: 'details', optional: true }],
    prompt: { mode: 'optional', placeholder: 'Touch-ups (optional)', composer: 'recipe' }, modes: { default: 'edit', whenSlot: null },
    output: { aspect: 'follow-photo', resolution: 'follow-photo', count: 1 }, surface: null, generateLabel: 'Swap material', source: { note: 'material prompt' } },
  // Image to layers (2026-10-24): Seedream 5.0 layer separation (official Comfy partner template) on Comfy Router; the result is several transparent PNG layers.
  { id: 'image-layers', icon: 'layers', category: 'edit', runner: app('app-image-layers'), status: 'ready',
    slots: [slot('image', 'Photo', true, 'Add the photo to split into layers', 'Add a photo')], groups: [{ id: 'size', label: 'Size', icon: 'aspect', summary: ['imageResolution'] }],
    controls: [{ field: 'imageResolution', label: 'Size', kind: 'segmented', group: 'size' }],
    prompt: { mode: 'optional', placeholder: 'Name the layers to pull out (optional)', composer: 'plain' }, modes: { default: 'edit', whenSlot: null }, fixedNote: 'Transparent PNG layers',
    output: { aspect: 'follow-photo', resolution: 'model', count: 'model' }, surface: null, generateLabel: 'Split into layers',
    source: { kind: 'official', author: 'Comfy Org', url: `${TPL}api_bytedance_seedream_5_0_layer_separation.json`, licence: 'MIT (Comfy-Org/workflow_templates)', note: 'Seedream 5.0 layer separation' } },
  // Camera & Lens (surface 'rig'): plain Create Image (prompt, refs, aspect…) plus the Camera group; the rig fields go to create-image as today.
  { id: 'camera-lens', icon: 'camera', category: 'camera', runner: app('create-image'), status: 'ready',
    slots: [], groups: [{ id: 'camera', label: 'Camera', icon: 'camera', summary: ['focal', 'aperture', 'film', 'lighting', 'era'] }],
    controls: ([['cameraBody', 'Camera body'], ['lens', 'Lens'], ['focal', 'Focal length'], ['aperture', 'Aperture'], ['film', 'Film stock'], ['lighting', 'Lighting'], ['era', 'Era']] as const)
      .map(([f, l]) => ({ field: f, label: l, kind: 'select' as const, group: 'camera', ...(['film', 'lighting', 'era'].includes(f) ? { optional: true } : {}) })),
    prompt: { mode: 'required', placeholder: 'Describe the scene you imagine', composer: 'recipe' }, modes: { default: 'generate', whenSlot: null },
    output: { aspect: 'model', resolution: 'model', count: 'model' }, surface: 'rig', generateLabel: 'Generate', source: { note: 'camera recipe' } },
];
export const WORKFLOW_IDS = DECLS.map((d) => d.id);
/** Each image workflow's picker category (the Image tab's filter chips, shared/imageFeed.ts). */
export const WORKFLOW_CATEGORY_OF: Record<string, WorkflowCategory> = Object.fromEntries(DECLS.map((d) => [d.id, d.category]));
export const WORKFLOW_CATEGORIES: { id: WorkflowCategory | 'all'; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'edit', label: 'Edit' }, { id: 'people', label: 'People' }, { id: 'product', label: 'Product' }, { id: 'camera', label: 'Camera' }];

/** What a recipe needs, in the picker's words. */
export function needsLine(slots: WorkflowSlot[], surface: WorkflowRecipe['surface']): string {
  const req = slots.filter((s) => s.required).length; const opt = slots.length - req;
  const base = req ? `${req} photo${req > 1 ? 's' : ''}` : opt ? 'Photo optional' : 'Prompt';
  return surface === 'mask' ? `${base} + mask` : surface === 'multi-output' ? `${base} → up to 9` : base;
}
/** "Edits · up to 4 images" or "Text only": what a Create Image model does with a photo (EDIT_MODELS + imageCaps maxRefs). */
export { editTagOf } from './imageFeatures.js';

type ToolLike = { id: string; inputs: { name: string; kind: string; required?: boolean; options?: string[]; default?: string }[]; providers: (string | { id: string })[]; route?: string;
  app?: { gallery?: { locked?: Record<string, string>; fields?: any[]; required?: any[]; providersByMode?: Record<string, string[]> | null; perOutput?: any; modeWhenFile?: Record<string, string> | null; promptFrames?: PromptFrame[] } | null; providerModes?: Record<string, string[]> } | null };
const pid = (p: string | { id: string }) => (typeof p === 'string' ? p : p.id);
/** The Camera & Lens rig fields create-image reads (tools/media.ts; GET /api/image-features camera.fields). */
const CAMERA_FIELDS = ['cameraBody', 'lens', 'focal', 'aperture', 'film', 'lighting', 'era'];
const lockedModeOf = (g: any) => modeOfTypes(g?.locked?.types);
const modeOfTypes = (t?: string) => { try { const x = JSON.parse(String(t ?? '')); return Array.isArray(x) ? String(x[0]) : null; } catch { return null; } };

/** The recipe with everything the tool knows filled in. `getTool` = the server registry (or a test double). */
export function recipeOf(d: Decl, getTool: (id: string) => ToolLike | undefined): WorkflowRecipe {
  const f = featureById(d.id)!; const t = getTool(d.runner.toolId); const g = t?.app?.gallery ?? null;
  const gf = (n: string) => (g?.fields ?? []).find((x: any) => x.name === n);
  const controls: WorkflowControl[] = d.controls.map((c) => {
    if (c.field === 'scale' && d.id === 'upscale') return { ...c, options: UPSCALE_FACTORS.map((k) => ({ value: String(k), label: `×${k}` })), default: '4' };
    if (c.field === 'shots' && g?.perOutput) return { ...c, options: g.perOutput.options.map((o: any) => ({ value: String(o.value), label: String(o.label ?? o.value) })), default: '' };
    if (d.surface === 'rig' && c.field in RIG_OPTIONS) { const os = (RIG_OPTIONS as Record<string, readonly (string | number | { id: string; label: string })[]>)[c.field];
      const dv = c.field === 'cameraBody' ? RIG_DEFAULT.body : (RIG_DEFAULT as Record<string, string | number>)[c.field];
      return { ...c, options: os.map((o) => typeof o === 'object' ? { value: o.id, label: o.label } : { value: String(o), label: c.field === 'focal' ? `${o} mm` : c.field === 'aperture' ? `f/${o}` : String(o) }), ...(dv !== '' && dv != null ? { default: String(dv) } : {}) }; }
    const x = gf(c.field); const inp = t?.inputs.find((i) => i.name === c.field);
    if (!x) return { ...c, ...(inp?.options ? { options: inp.options.map((o) => ({ value: o, label: o })) } : {}), ...(inp?.default != null ? { default: String(inp.default) } : {}) };
    return { ...c, label: c.label || x.label, ...(x.options ? { options: x.options.map((o: any) => ({ value: String(o.value), label: String(o.label ?? o.value), ...(o.swatch ? { swatch: String(o.swatch) } : {}), ...(o.sets ? { sets: { ...o.sets } } : {}), ...(o.credit ? { credit: String(o.credit) } : {}), ...(o.description ? { description: String(o.description) } : {}), ...(o.aspect ? { aspect: String(o.aspect) } : {}) })) } : {}),
      ...(x.default != null ? { default: String(x.default) } : {}), ...(x.min != null ? { min: x.min } : {}), ...(x.max != null ? { max: x.max } : {}), ...(x.step != null ? { step: x.step } : {}),
      ...(x.pattern ? { pattern: x.pattern } : {}), ...(x.help ? { help: x.help } : {}), ...(x.optional ? { optional: true } : {}), ...(x.maxLength ? { maxLength: x.maxLength } : {}), ...(x.placeholder ? { placeholder: x.placeholder } : {}) };
  });
  const locked: Record<string, string> = { ...(g?.locked ?? {}) };
  const provs = (t?.providers ?? []).map(pid).filter((p) => d.runner.toolId !== 'create-image' || f.providers.includes(p));
  const lockedMode = modeOfTypes(locked.types) ?? d.modes.default;
  const models: Record<string, string[]> = g?.providersByMode ? { ...g.providersByMode } : { [lockedMode]: provs };
  // a whenSlot mode the tool didn't split out (single-mode tools) still lists the tool's models
  for (const m of Object.values(d.modes.whenSlot ?? {})) models[m] ??= provs;
  const { source: src, ...rest } = d;
  return { ...rest, prompt: { ...rest.prompt, frames: (g?.promptFrames ?? []) as PromptFrame[] }, controls, name: f.name, tagline: f.tagline, needs: needsLine(d.slots, d.surface), source: { ...OURS(src?.note ?? ''), ...src } as WorkflowSource,
    models, locked, aliases: { toolId: d.runner.toolId, routes: [...new Set([f.route, ...(t?.route ? [t.route] : []), ...f.oldRoutes])] }, route: f.route };
}
/** What the server's quote says about one (workflow, model, settings): the same check GET /api/tools/<runner>/price runs (null = it quotes). */
export interface WorkflowQuoteIssue { code?: string; field?: string; message: string }
export type WorkflowModelCheck = (toolId: string, provider: string, query: Record<string, string>) => WorkflowQuoteIssue | null;

/** The aspect the bar really sends for this model (web fitWfVals): the picked one when offered, else the model's own default shape. */
function fitAspect(provider: string, mode: string, want: string): string {
  const cap = IMAGE_CAPS[provider]; if (!cap) return want;
  const ok = mode === 'edit' && cap.edit ? [...(cap.edit.allowAuto ? ['auto'] : []), ...cap.edit.aspects] : [...(cap.allowAuto ? ['auto'] : []), ...cap.aspects];
  if (!ok.length || ok.includes(want)) return want; return ok.includes(cap.defaultAspect) ? cap.defaultAspect : ok.find((x) => x !== 'auto') ?? ok[0];
}
/** Input prep (2026-10-23): the aspect this model needs the photo fitted / cropped to before it can run this recipe in this mode, else null.
 *  A model whose edits follow the photo (imageCaps edit.aspects = []) can't render a locked aspect (Character Sheet 4:3) from a photo of another
 *  shape, but it can when the photo already has that shape: the bar fits or crops it first (the server checks the photo's real shape). */
export function photoFitOf(r: Pick<WorkflowRecipe, 'locked' | 'output' | 'slots' | 'modes'>, mode: string, provider: string): string | null {
  const want = r.locked.aspect ?? (r.output.aspect === 'fixed' ? r.output.fixedAspect : undefined); if (!want || want === 'auto' || mode !== 'edit') return null;
  const ed = IMAGE_CAPS[provider]?.edit; if (!ed || ed.aspects.length || ed.aspects.includes(want)) return null;
  return r.slots.some((s) => s.sendsAs === 'image' && (s.required || r.modes.whenSlot?.[s.name] === mode)) ? want : null;
}
/** The menu row's words for a model that runs after the bar fits the photo. */
export const photoFitNote = (aspect: string) => `Fits your photo to ${aspect} first`;
/** The quote queries the bar sends for this recipe in this mode with its defaults (web ImageCanvas wfQ): the photos the mode needs, control
 *  defaults (an aspect fitted to the model), the mask. Upscale: one query per factor (the model can run it when any factor runs). */
export function workflowQuoteQueries(r: WorkflowRecipe, mode: string, provider: string): Record<string, string>[] {
  if (r.id === 'upscale') return UPSCALE_FACTORS.map((k) => ({ scale: String(k) }));
  const sent = r.slots.filter((s) => s.required || r.modes.whenSlot?.[s.name] === mode);
  const ctl: Record<string, string> = {};
  for (const c of r.controls) { if (c.optional || c.default == null || c.default === '') continue; ctl[c.field] = c.field === 'aspect' ? fitAspect(provider, mode, String(c.default)) : String(c.default); }
  const fit = photoFitOf(r, mode, provider); /* the photo the bar sends is already that shape (it fitted it) */
  return [{ types: JSON.stringify([mode]), ...ctl, ...(fit ? { photoAspect: fit } : {}), ...Object.fromEntries(sent.map((s) => [s.sendsAs, '1'])), ...(sent.some((s) => s.sendsAs === 'image') ? { image: '1' } : {}),
    ...(sent.length > 1 ? { refs: String(sent.length) } : {}), ...(r.surface === 'mask' ? { mask: '1' } : {}) }];
}
/** Why a model can't run this recipe, in the menu's words ("Edits keep your photo's shape; Character Sheet needs 4:3"). */
export function workflowOffReason(r: WorkflowRecipe, mode: string, provider: string, issue: WorkflowQuoteIssue): string {
  const cap = IMAGE_CAPS[provider]; const q = workflowQuoteQueries(r, mode, provider)[0] ?? {}; const imgs = (k: number) => `${k} image${k === 1 ? '' : 's'}`;
  const aspect = r.locked.aspect ?? r.output.fixedAspect ?? q.aspect;
  if (issue.field === 'aspect' && aspect) return mode === 'edit' && cap?.edit && !cap.edit.aspects.length ? `Edits keep your photo's shape; ${r.name} needs ${aspect}` : `No ${aspect} shape${mode === 'edit' ? ' when editing' : ''}; ${r.name} needs ${aspect}`;
  if (issue.field === 'refs' && cap) return cap.supports.maxRefs ? `Takes ${imgs(cap.supports.maxRefs)}; ${r.name} sends ${q.refs ?? 1}` : `Takes no photo; ${r.name} sends ${imgs(Number(q.refs ?? 1))}`;
  if (issue.field === 'mode' && mode === 'inpaint') return `Can't edit a painted area; ${r.name} needs a mask`;
  if (issue.field === 'n' && cap) return `Makes ${imgs(cap.maxBatch)} per run; ${r.name} needs more`;
  return issue.message.replace(/\.$/, '');
}
/** Split each mode's models into those that run this recipe as locked (the quote passes) and those that can't (with the reason). */
export function splitWorkflowModels(r: WorkflowRecipe, check: WorkflowModelCheck): { models: Record<string, string[]>; unavailable: Record<string, { id: string; reason: string }[]> } {
  const models: Record<string, string[]> = {}; const unavailable: Record<string, { id: string; reason: string }[]> = {};
  for (const [m, ps] of Object.entries(r.models)) { models[m] = []; unavailable[m] = [];
    for (const p of ps) { const issues = workflowQuoteQueries(r, m, p).map((q) => check(r.runner.toolId, p, q)); const bad = issues.every(Boolean) ? issues[0] : null;
      if (bad) unavailable[m].push({ id: p, reason: workflowOffReason(r, m, p, bad) }); else models[m].push(p); } }
  return { models, unavailable };
}
/** GET /api/image-workflows: every recipe, plus per model its real name, what it is and the workflow it runs (the strip's credit).
 *  With `check` (the server's quote check), each mode lists only models that can run the recipe as locked; the others go to `unavailable`. */
export function imageWorkflowsPayload(getTool: (id: string) => ToolLike | undefined, check?: WorkflowModelCheck) {
  return {
    categories: WORKFLOW_CATEGORIES,
    workflows: DECLS.map((d) => { const r0 = recipeOf(d, getTool); const r = check ? { ...r0, ...splitWorkflowModels(r0, check) } : r0; const ids = [...new Set(Object.values(r0.models).flat())];
      const prep: Record<string, Record<string, { fit: string; note: string }>> = {}; // models that run once the photo is fitted (the menu row says so)
      for (const [m, ps] of Object.entries(r.models)) for (const p of ps) { const a = photoFitOf(r, m, p); if (a) (prep[m] ??= {})[p] = { fit: a, note: photoFitNote(a) }; }
      return { ...r, prep, modelInfo: Object.fromEntries(ids.map((p) => { const mode = Object.keys(r.models).find((m) => r.models[m].includes(p)) ?? r.modes.default; const w = workflowFor(r.id, p);
        const cap = r.controls.some((c) => c.field === 'aspect') ? IMAGE_CAPS[p] : undefined; // the aspect chip lists only what this model takes (generate / edit)
        const wl = (x: ReturnType<typeof workflowFor>) => (x ? { line: workflowLine(x), url: x.url ?? null, source: x.source } : null);
        /* a photo switches Character Sheet / Product Shot to edit: that run uses the model's edit graph, so its credit is Edit Image's */
        const byMode = Object.fromEntries(Object.values(r.modes.whenSlot ?? {}).filter((m) => m !== mode && r.models[m]?.includes(p)).map((m) => [m, wl(workflowFor(m === 'edit' ? 'edit-image' : r.id, p))]));
        return [p, { name: modelNameOf(p, mode), workflow: wl(w), ...(Object.keys(byMode).length ? { workflowByMode: byMode } : {}),
          ...(cap ? { aspects: { generate: [...(cap.allowAuto ? ['auto'] : []), ...cap.aspects], edit: cap.edit ? [...(cap.edit.allowAuto ? ['auto'] : []), ...cap.edit.aspects] : [...(cap.allowAuto ? ['auto'] : []), ...cap.aspects] }, defaultAspect: cap.defaultAspect } : {}) }]; })) }; }), // defaultAspect: the shape the bar sends when the picked one isn't offered (QA #1: no Auto on API models)
  };
}

/** Boot check: a recipe and the tool that runs it must agree (unknown models, slots the tool doesn't take, controls with no field, locks). */
export function validateImageWorkflows(getTool: (id: string) => ToolLike | undefined): string[] {
  const errs: string[] = [];
  for (const d of DECLS) {
    const at = (m: string) => errs.push(`${d.id}: ${m}`);
    const f = featureById(d.id); if (!f) { at('no image feature with this id'); continue; }
    if (f.toolId !== d.runner.toolId && !(d.id === 'brush-edit' && d.runner.toolId === 'app-inpaint')) at(`runner ${d.runner.toolId} is not the feature's tool ${f.toolId}`);
    const t = getTool(d.runner.toolId); if (!t) { at(`runner tool ${d.runner.toolId} is not registered`); continue; }
    const r = recipeOf(d, getTool); const g = t.app?.gallery ?? null; const toolProv = new Set(t.providers.map(pid));
    for (const [m, ps] of Object.entries(r.models)) { if (!ps.length) at(`no models for mode ${m}`);
      for (const p of ps) { if (!toolProv.has(p)) at(`model ${p} (${m}) is not offered by ${t.id}`); if (!IMAGE_CAPS[p] && p !== 'comfy-qwen-angles' && !(d.id === 'upscale' && UPSCALE_MODELS[p])) at(`model ${p} is unknown to imageCaps`); } }
    const inputs = new Map(t.inputs.map((i) => [i.name, i]));
    for (const s of r.slots) { const i = inputs.get(s.sendsAs); if (!i) at(`slot ${s.name} sends ${s.sendsAs}, which ${t.id} doesn't take`); else if (!/^files?$/.test(i.kind)) at(`slot ${s.name} → ${s.sendsAs} is a ${i.kind}, not a file`); }
    const req = (g?.required ?? []).filter((x: any) => typeof x === 'string') as string[];
    for (const s of r.slots) { const toolReq = req.includes(s.sendsAs) || !!inputs.get(s.sendsAs)?.required || (s.sendsAs === 'image' && !g?.modeWhenFile?.image && lockedModeOf(g) !== 'generate'); // an edit / inpaint lock needs its photo
      if (s.required !== toolReq) at(`slot ${s.name}: required ${s.required} but the tool says ${toolReq}`); }
    for (const n of req) if (!r.slots.some((s) => s.sendsAs === n) && !(d.surface === 'mask' && n === 'mask')) at(`the tool needs ${n} but no slot sends it`);
    for (const [n] of Object.entries(g?.modeWhenFile ?? {})) if (!r.modes.whenSlot?.[n]) at(`the tool switches mode on ${n} but the recipe's whenSlot doesn't`);
    for (const [n, m] of Object.entries(r.modes.whenSlot ?? {})) if (modeOfTypes(g?.modeWhenFile?.[n]) !== m) at(`whenSlot ${n} → ${m} doesn't match the tool (${g?.modeWhenFile?.[n] ?? 'none'})`);
    for (const c of r.controls) { if (!r.groups.some((x) => x.id === c.group)) at(`control ${c.field} is in unknown group ${c.group}`);
      if (c.field === 'shots' ? !g?.perOutput : !inputs.has(c.field) && !(d.surface === 'rig' && CAMERA_FIELDS.includes(c.field))) at(`control ${c.field} has no field on ${t.id}`); }
    for (const x of g?.fields ?? []) if (!r.controls.some((c) => c.field === x.name)) at(`the tool's field ${x.name} has no control`);
    for (const gr of r.groups) for (const s of gr.summary) if (!r.controls.some((c) => c.field === s)) at(`group ${gr.id} summarises unknown field ${s}`);
    if (r.status === 'ready' && d.runner.toolId === 'create-image' && d.surface !== 'rig') at('a ready recipe must run on its own app tool (only the camera rig runs on create-image)');
    if (d.surface === 'rig') for (const c of r.controls) if (!c.options?.length) at(`rig control ${c.field} has no options`);
  }
  const dup = WORKFLOW_IDS.filter((x, i) => WORKFLOW_IDS.indexOf(x) !== i); if (dup.length) errs.push(`duplicate recipe ids: ${dup.join(', ')}`);
  return errs;
}
export const IMAGE_WORKFLOW_FEATURES = IMAGE_FEATURES.filter((f) => WORKFLOW_IDS.includes(f.id)).map((f) => f.id);
