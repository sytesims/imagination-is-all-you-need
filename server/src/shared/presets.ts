/**
 * Image presets (2026-10-22): a preset is a saved recipe for ONE image workflow: a name, a one-line description, a prompt template, fixed
 * settings, an optional LoRA and a thumbnail. One workflow has many presets. Picking one opens Create Image with its workflow and the
 * preset's settings filled in; the user still sees and can change every value, and the real model is always shown (the preset never picks one).
 *
 * Isomorphic data + checks; no server imports. `settings` keys are the runner tool's real form fields (the recipe's controls in
 * shared/workflows.ts, the tool's own inputs, or the Camera & Lens rig fields) and every value must be one the server accepts:
 * `validateImagePresets(getTool)` checks that at boot (bad presets are logged and left out) and in test/image-presets.test.ts.
 *
 * Wording is our own. No real people's names, brands or trademarks in names, descriptions or templates; neutral subjects only.
 * (Camera & Lens settings use the rig's own option ids from shared/cameraLens.ts, which name real camera gear as plain facts.)
 */
import { imageWorkflowsPayload, WORKFLOW_IDS } from './workflows.js';
import { RIG_OPTIONS } from './cameraLens.js';

/** `create-image` = plain Create Image (no workflow); the rest are workflow ids from shared/workflows.ts. */
export type PresetWorkflow = 'create-image' | (typeof WORKFLOW_IDS)[number];
export type PresetCategory = 'Scene' | 'Style' | 'Look' | 'Light' | 'People' | 'Product' | 'Camera';
export const PRESET_CATEGORIES: PresetCategory[] = ['Scene', 'Style', 'Look', 'Light', 'People', 'Product', 'Camera'];
export type PresetValue = string | number | string[];
export interface PresetLora { name: string; strength: number; url: string; licence: string }
export interface ImagePreset {
  id: string; name: string; workflow: PresetWorkflow; category: PresetCategory;
  /** one line, our words */ description: string;
  /** What goes in the prompt box. `{subject}` / `{prompt}` = the user's own text (dropped cleanly when empty; see fillPresetPrompt). */
  promptTemplate: string;
  /** Placeholder for the user's part of the prompt ("a ceramic mug"). */ subjectHint: string;
  /** Form field → value, exactly as the runner tool takes it (arrays go out as JSON). */ settings: Record<string, PresetValue>;
  lora: PresetLora | null;
  /** web path (web/public): an example of the look, made in this app on a local GPU (our own renders), or null */ thumbnail: string | null;
  /** what really made the thumbnail ("Z-Image Turbo · Local"); null when there is none */ thumbnailModel: string | null;
  hero: boolean;
  /** false = the workflow isn't wired into Create Image yet (Brush Edit, Camera Angles, Camera & Lens): listed, not pickable. */ available: boolean;
  /** plain notes on what suggested the look (genres, our own data), never someone else's prompt text */ inspiredBy: string[];
}

const P = (p: Omit<ImagePreset, 'lora' | 'thumbnail' | 'thumbnailModel' | 'hero' | 'available'> & Partial<Pick<ImagePreset, 'lora' | 'hero' | 'available' | 'thumbnailModel'>>): ImagePreset =>
  ({ lora: null, hero: false, available: true, thumbnailModel: null, ...p, thumbnail: p.hero ? `/examples/presets/${p.id}.jpg` : null });
const ZIMAGE = `Z-Image Turbo · ${LOCAL_LABEL}`; const QWEN21 = `Qwen Image 2.1 · ${LOCAL_LABEL}`; const KLEIN4B = `FLUX.2 [klein] 4B · ${LOCAL_LABEL}`;

export const IMAGE_PRESETS: ImagePreset[] = [
  // ---- Create Image ----
  P({ id: 'rainy-neon-street', name: 'Rainy Neon Street', workflow: 'create-image', category: 'Scene', hero: true, thumbnailModel: QWEN21,
    description: 'A wet street at midnight, coloured signs mirrored in every puddle.', subjectHint: 'a vintage bicycle',
    promptTemplate: '{subject}, on a rain-soaked city street at midnight, coloured shop signs reflected in the puddles, cool blue shadows with warm pink and amber highlights, light mist around the street lamps, wide cinematic framing',
    settings: { aspect: '16:9', style: 'neon-night' }, inspiredBy: ['night street photography after rain', 'Create Image style: Neon night'] }),
  P({ id: 'paper-diorama', name: 'Paper Diorama', workflow: 'create-image', category: 'Style',
    description: 'Your subject rebuilt as layers of cut paper in a shallow shadow box.', subjectHint: 'a lighthouse on a cliff',
    promptTemplate: '{subject} made as a layered cut-paper diorama, crisp paper edges, soft shadows between the layers, flat matte colours, gentle top light, handmade shadow-box feel',
    settings: { aspect: '3:4' }, inspiredBy: ['papercraft shadow boxes', 'layered paper illustration'] }),
  P({ id: 'clay-stop-motion', name: 'Clay Stop-Motion', workflow: 'create-image', category: 'Style',
    description: 'A handmade clay figure on a tiny tabletop set, fingerprints and all.', subjectHint: 'a fox in a scarf',
    promptTemplate: '{subject} as a stop-motion clay figure on a tiny handmade set, plasticine texture with faint fingerprints, warm tabletop lights, shallow depth of field',
    settings: { aspect: '3:4', style: 'clay-3d' }, inspiredBy: ['stop-motion animation sets', 'Create Image style: Clay 3D'] }),
  P({ id: 'botanical-plate', name: 'Botanical Plate', workflow: 'create-image', category: 'Style',
    description: 'An old natural-history plate: one specimen, fine ink lines, aged paper.', subjectHint: 'a fern frond',
    promptTemplate: 'a vintage natural-history plate of {subject}: one specimen centred, fine ink lines with soft watercolour washes, aged cream paper, wide empty margins, no lettering',
    settings: { aspect: '3:4' }, inspiredBy: ['19th-century scientific illustration'] }),
  P({ id: 'golden-haze', name: 'Golden Haze', workflow: 'create-image', category: 'Look', hero: true, thumbnailModel: ZIMAGE,
    description: 'Low warm sun, drifting haze and a soft flare across the frame.', subjectHint: 'a glass bottle on a windowsill',
    promptTemplate: '{subject}, low warm sun raking across the frame, drifting haze catching the light, soft glow and a gentle lens flare, lifted shadows, dreamy shallow focus',
    settings: { aspect: '3:4', style: 'golden-hour' }, inspiredBy: ['late-afternoon backlit photography', 'Create Image style: Golden hour'] }),
  P({ id: 'double-exposure', name: 'Double Exposure', workflow: 'create-image', category: 'Style', hero: true, thumbnailModel: KLEIN4B,
    description: 'A soft film double exposure: a silhouette filled with a second scene.', subjectHint: 'a woman listening to music, a rainy city street',
    promptTemplate: '{subject}, as a soft double-exposure film photograph: a dark silhouette filled with the second scene, a bright clean background, gentle analog grain',
    settings: { aspect: '1:1', style: 'film-35' }, inspiredBy: ['in-camera double exposures on film'] }),
  P({ id: 'ink-noir-panel', name: 'Ink Noir Panel', workflow: 'create-image', category: 'Style',
    description: 'A high-contrast inked comic panel with hard shadows and halftone dots.', subjectHint: 'a lone street lamp',
    promptTemplate: '{subject} drawn as an inked noir comic panel, heavy black shadows, one hard light source, cross-hatching, fine halftone dots, two-colour palette, no speech bubbles or lettering',
    settings: { aspect: '3:4' }, inspiredBy: ['crime comics inking', 'film noir lighting'] }),

  // ---- Relight ----
  P({ id: 'painters-side-light', name: "Painter's Side Light", workflow: 'relight', category: 'Light', hero: true, thumbnailModel: QWEN21,
    description: 'One warm key high to one side and deep, soft shadows, like an old portrait.', subjectHint: '',
    promptTemplate: 'a small triangle of light on the shadow-side cheek, deep soft shadows, the background falling into darkness, {prompt}',
    settings: { direction: 'left', lightX: -0.6, lightY: 0.6, lightQuality: 'soft', brightness: 55, color: '#FFC98A' }, inspiredBy: ['classic oil-portrait lighting', 'Camera & Lens lighting option'] }),
  P({ id: 'neon-rim', name: 'Neon Rim', workflow: 'relight', category: 'Light',
    description: 'A coloured edge light from behind, the rest of the frame dropping to near black.', subjectHint: '',
    promptTemplate: 'a magenta neon edge light from behind, a faint teal accent on the opposite edge, the surroundings dropping to near black, glossy highlights picking up the colour, {prompt}',
    settings: { direction: 'back', lightQuality: 'hard', brightness: 70, color: '#E05AD8' }, inspiredBy: ['night portraits lit by signs', 'Relight colour swatch: Magenta'] }),
  P({ id: 'golden-hour-shift', name: 'Golden Hour Shift', workflow: 'relight', category: 'Light', hero: true, thumbnailModel: KLEIN4B,
    description: 'Push any shot toward low warm sun and long soft shadows.', subjectHint: '',
    promptTemplate: 'low golden sun from the side, long soft shadows, a warm glow along every edge, light haze in the air, {prompt}',
    settings: { direction: 'left', lightQuality: 'soft', brightness: 50, color: '#FFB347' }, inspiredBy: ['golden-hour outdoor photography'] }),
  P({ id: 'soft-window-light', name: 'Soft Window Light', workflow: 'relight', category: 'Light',
    description: 'Gentle daylight from one big window, no hard edges.', subjectHint: '',
    promptTemplate: 'soft daylight from one large window, a smooth gradient across the subject, natural contrast, no hard edges, {prompt}',
    settings: { direction: 'left', lightQuality: 'soft', brightness: 60, color: '#FFFFFF' }, inspiredBy: ['north-window studio light'] }),

  // ---- Face Swap (the template is a touch-up added after the app's own swap recipe) ----
  P({ id: 'film-match-swap', name: 'Film Match Swap', workflow: 'face-swap', category: 'People', hero: true, thumbnailModel: QWEN21,
    description: 'Swap the face and match the grain, colour and softness of the original photo.', subjectHint: '',
    promptTemplate: 'match the film grain, colour cast and softness of image 1 so the new face looks shot on the same camera, {prompt}',
    settings: {}, inspiredBy: ['film photo retouching'] }),
  P({ id: 'clean-studio-swap', name: 'Clean Studio Swap', workflow: 'face-swap', category: 'People',
    description: 'A swap tuned for smooth, evenly lit studio portraits.', subjectHint: '',
    promptTemplate: 'smooth even studio light on the new face, soft catchlights in the eyes, an invisible blend at the jaw and hairline, {prompt}',
    settings: {}, inspiredBy: ['studio portrait retouching'] }),

  // ---- Person Swap ----
  P({ id: 'scene-transplant', name: 'Scene Transplant', workflow: 'person-swap', category: 'People',
    description: 'Put a whole person into another photo so they truly belong in its light.', subjectHint: '',
    promptTemplate: 'make the new person belong in the scene: the same light direction, colour temperature, contact shadow under the feet and depth of field as image 1, {prompt}',
    settings: {}, inspiredBy: ['photo compositing'] }),
  P({ id: 'candid-snapshot-swap', name: 'Candid Snapshot Swap', workflow: 'person-swap', category: 'People',
    description: 'Keep the swap looking like an unposed everyday snapshot.', subjectHint: '',
    promptTemplate: 'keep it looking like an unposed snapshot: the same slight motion blur, natural grain and everyday colour as image 1, {prompt}',
    settings: {}, inspiredBy: ['street snapshots'] }),

  // ---- Character Sheet (the app adds the three-panel layout; the template describes the character) ----
  P({ id: 'studio-turnaround', name: 'Studio Turnaround', workflow: 'character-sheet', category: 'People', hero: true, thumbnailModel: ZIMAGE,
    description: 'Front, back and close-up of one character on a calm grey backdrop.', subjectHint: 'a fictional young woman with short silver hair',
    promptTemplate: '{subject}, relaxed neutral expression, simple well-fitting everyday clothes',
    settings: {}, inspiredBy: ['animation model sheets', 'Character Sheet layout'] }),
  P({ id: 'adventurer-costume', name: 'Adventurer Costume', workflow: 'character-sheet', category: 'People',
    description: 'A fantasy traveller sheet where every strap and buckle reads clearly.', subjectHint: 'a fictional tall man with a red beard',
    promptTemplate: '{subject}, dressed as a fantasy traveller in layered leather armour, a hooded travel cloak, a belt with pouches and tall boots, every buckle and strap clearly visible',
    settings: {}, inspiredBy: ['costume design turnarounds'] }),

  // ---- Phone Photo (2026-11-01): the chips set who holds the phone and the light; the template is who is in it, in your words ----
  P({ id: 'phone-photo-ugc', name: 'Phone photo (UGC)', workflow: 'phone-photo', category: 'People',
    description: 'A casual selfie in window light: real skin, an everyday room, nothing posed.', subjectHint: 'a fictional woman in her late twenties with curly hair, laughing mid-sentence with an iced coffee in hand',
    promptTemplate: '{subject}', settings: { holder: 'selfie', light: 'window' }, inspiredBy: ['everyday social posts shot on a phone', 'Phone Photo chips: Selfie, Window'] }),

  // ---- Product Shot (the scene tile adds its own setting; the template adds the look) ----
  P({ id: 'cafe-counter', name: 'Café Counter', workflow: 'product-shot', category: 'Product', hero: true, thumbnailModel: QWEN21,
    description: 'A stone café counter in soft morning window light.', subjectHint: 'a glass of iced coffee',
    promptTemplate: '{subject}, morning light through a café window, soft reflections on the stone, fresh and inviting',
    settings: { scene: 'marble', aspect: '1:1' }, inspiredBy: ['café and food photography', 'Product Shot scene: Stone counter'] }),
  P({ id: 'dark-pedestal', name: 'Dark Pedestal', workflow: 'product-shot', category: 'Product',
    description: 'A polished pedestal, a near-black backdrop and one strong edge light.', subjectHint: 'a plain glass perfume bottle',
    promptTemplate: '{subject}, on a polished dark stone pedestal against a near-black backdrop, a strong edge light tracing the outline, soft front fill, controlled reflections, lots of empty space above',
    settings: { scene: 'podium', aspect: '3:4' }, inspiredBy: ['luxury product photography', 'Product Shot scene: Display podium'] }),
  P({ id: 'clean-catalogue', name: 'Clean Catalogue', workflow: 'product-shot', category: 'Product',
    description: 'The bright catalogue default: white sweep, even light, soft shadow.', subjectHint: 'a ceramic mug',
    promptTemplate: '{subject}, centred with a generous empty margin, true neutral colour, crisp detail',
    settings: { scene: 'studio-white', aspect: '1:1' }, inspiredBy: ['e-commerce catalogue photos', 'Product Shot scene: Clean studio'] }),
  P({ id: 'ingredient-flat-lay', name: 'Ingredient Flat Lay', workflow: 'product-shot', category: 'Product',
    description: 'Top-down, with its raw ingredients or parts laid out around it.', subjectHint: 'a jar of granola',
    promptTemplate: '{subject}, centred and surrounded by its raw ingredients or parts laid out in a neat ring, soft even overhead light, muted natural palette',
    settings: { scene: 'flat-lay', aspect: '1:1' }, inspiredBy: ['food and cosmetics flat lays', 'Product Shot scene: Top-down flat lay'] }),
  P({ id: 'night-bar-glow', name: 'Night Bar Glow', workflow: 'product-shot', category: 'Product',
    description: 'A bar top at night, neon colour wrapping the product edges.', subjectHint: 'a dark glass bottle',
    promptTemplate: '{subject}, pink and cyan neon strips wrapping its edges in colour, glossy reflections on the bar top, deep shadows behind',
    settings: { scene: 'bar-night', aspect: '3:4' }, inspiredBy: ['drinks advertising at night', 'Product Shot scene: Evening bar'] }),
  P({ id: 'hard-shadow-editorial', name: 'Hard Shadow Editorial', workflow: 'product-shot', category: 'Product',
    description: 'One hard light and a bold graphic shadow on a flat colour wall.', subjectHint: 'a sneaker',
    promptTemplate: '{subject}, one hard directional light throwing a crisp graphic shadow across a flat coral wall, minimal composition, no props',
    settings: { scene: 'studio-colour', aspect: '3:4' }, inspiredBy: ['magazine still-life photography', 'Product Shot scene: Colour backdrop'] }),

  // ---- Brush Edit, Camera Angles, Camera & Lens (in Create Image's bar since 2026-10-23) ----
  P({ id: 'sky-swap', name: 'Sky Swap', workflow: 'brush-edit', category: 'Scene',
    description: 'Paint over the sky and replace it; the ground stays untouched.', subjectHint: 'a stormy sunset sky',
    promptTemplate: 'replace the painted sky with {subject}, matching the horizon line, the light direction of the scene and the colour spill on nearby edges',
    settings: {}, inspiredBy: ['landscape sky replacement'] }),
  P({ id: 'full-turnaround', name: 'Full Turnaround', workflow: 'camera-angles', category: 'Camera',
    description: 'One photo becomes all nine angles, from front to back to close-up.', subjectHint: 'the subject',
    promptTemplate: '{subject}', settings: { shots: ['front', 'three-quarter-left', 'three-quarter-right', 'side', 'back', 'low', 'high', 'close-up', 'wide'] },
    inspiredBy: ['product and character turnarounds'] }),
  P({ id: 'slide-film-street', name: 'Slide Film Street', workflow: 'camera-lens', category: 'Camera',
    description: 'A 35 mm street look with the deep blues and warm reds of old slide film.', subjectHint: 'a cyclist passing a bakery',
    promptTemplate: '{subject}, candid street framing, a natural mid-moment gesture, rich slide-film colour with deep blues and warm reds',
    settings: { cameraBody: 'nikon-f3', lens: 'vintage-prime', focal: 35, aperture: '5.6', film: 'kodachrome-64', lighting: 'daylight', era: '1970s' }, inspiredBy: ['street photography on slide film', 'Camera & Lens rig'] }),
  P({ id: 'telephoto-portrait', name: 'Telephoto Portrait', workflow: 'camera-lens', category: 'Camera',
    description: 'Flattering long-lens compression and a background that melts away.', subjectHint: 'a fictional man in a wool coat',
    promptTemplate: '{subject}, relaxed natural expression, soft window light across the face, the background melting into smooth blur',
    settings: { cameraBody: 'full-frame-mirrorless', lens: 'canon-85-12', focal: 85, aperture: '1.4', film: 'portra-400', lighting: 'window', era: 'today' }, inspiredBy: ['85 mm portrait photography', 'Camera & Lens rig'] }),
];

export { fillPresetPrompt, presetFields, presetHref, presetPrefill, CREATE_PRESET_FIELDS } from './presetLink.js';
import { presetHref } from './presetLink.js';
import { LOCAL_LABEL } from './modelIds.js';

type ToolLike = Parameters<typeof imageWorkflowsPayload>[0] extends (id: string) => infer T ? T : never;
/** Fields a preset may never set: the user's own text and files, the model (always the user's visible choice), and run plumbing. */
const NEVER = new Set(['prompt', 'provider', 'model', 'rights', 'seed', 'types', 'mode', 'enhance', 'n', 'refs', 'image', 'mask', 'face', 'person', 'idempotencyKey']);
interface FieldRule { options?: string[]; min?: number; max?: number; step?: number; pattern?: string; list?: boolean; number?: boolean }
const optVal = (o: any) => String(typeof o === 'object' && o ? o.value ?? o.id : o);

/** What each field of a workflow accepts, from the live recipe + tool (so presets can't drift from what the server validates). */
export function presetFieldRules(workflow: PresetWorkflow, getTool: (id: string) => ToolLike | undefined): { toolId: string; status: 'ready' | 'soon'; rules: Record<string, FieldRule> } | null {
  const rules: Record<string, FieldRule> = {};
  const fromInputs = (t: any, locked: Record<string, string>) => { for (const i of t?.inputs ?? []) { if (NEVER.has(i.name) || /^files?$/.test(i.kind) || i.name in locked) continue;
    rules[i.name] = { ...(i.options?.length ? { options: i.options.map(optVal) } : {}), ...(i.kind === 'list' ? { list: true } : {}), ...(i.kind === 'number' ? { number: true } : {}) }; } };
  if (workflow === 'create-image') { const t = getTool('create-image'); if (!t) return null; fromInputs(t, {}); return { toolId: 'create-image', status: 'ready', rules }; }
  const w = imageWorkflowsPayload(getTool).workflows.find((x) => x.id === workflow); if (!w) return null;
  const t = getTool(w.runner.toolId); if (!t) return null;
  if (w.runner.toolId !== 'create-image') fromInputs(t, w.locked);
  for (const c of w.controls) { const prev = rules[c.field] ?? {}; rules[c.field] = { ...prev, ...(c.options?.length ? { options: c.options.map((o) => o.value) } : {}), ...(c.min != null ? { min: c.min, number: true } : {}),
    ...(c.max != null ? { max: c.max } : {}), ...(c.step != null ? { step: c.step } : {}), ...(c.pattern ? { pattern: c.pattern } : {}), ...(c.kind === 'chips-multi' ? { list: true } : {}) }; }
  if (w.surface === 'rig') for (const [f, opts] of Object.entries(RIG_OPTIONS)) rules[f] = { options: (opts as readonly any[]).map(optVal), ...(f === 'focal' ? { number: true } : {}) };
  return { toolId: w.runner.toolId, status: w.status, rules };
}

/** One preset against the live registry → problems (empty = fine). */
export function presetProblems(p: ImagePreset, getTool: (id: string) => ToolLike | undefined): string[] {
  const errs: string[] = []; const at = (m: string) => errs.push(`${p.id}: ${m}`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id)) at('id must be kebab-case');
  if (!p.name.trim() || !p.description.trim()) at('name and description are required');
  if (!PRESET_CATEGORIES.includes(p.category)) at(`unknown category ${p.category}`);
  const R = presetFieldRules(p.workflow, getTool); if (!R) { at(`unknown workflow ${p.workflow}`); return errs; }
  const holes = p.promptTemplate.match(/\{[^}]*\}/g) ?? []; const bad = holes.filter((h) => h !== '{subject}' && h !== '{prompt}');
  if (bad.length) at(`unknown placeholder ${bad.join(', ')}`); if (holes.length > 1) at('use one {subject} or {prompt} placeholder at most');
  for (const [k, v] of Object.entries(p.settings)) {
    const r = R.rules[k]; if (!r) { at(`unknown field ${k} for ${p.workflow} (${R.toolId})`); continue; }
    const vals = Array.isArray(v) ? v.map(String) : [String(v)];
    if (Array.isArray(v) !== !!r.list) { at(`${k} must be ${r.list ? 'a list' : 'a single value'}`); continue; }
    if (r.list && !vals.length) at(`${k} is an empty list`);
    for (const x of vals) {
      if (r.number) { const n = Number(x); if (!Number.isFinite(n)) { at(`${k}=${x} is not a number`); continue; }
        if ((r.min != null && n < r.min) || (r.max != null && n > r.max)) at(`${k}=${x} is outside ${r.min}…${r.max}`);
        if (r.step && r.min != null && Math.abs((n - r.min) / r.step - Math.round((n - r.min) / r.step)) > 1e-6) at(`${k}=${x} is not on the ${r.step} step`); }
      if (r.pattern) { if (!new RegExp(r.pattern).test(x)) at(`${k}=${x} doesn't match ${r.pattern}`); }
      else if (r.options && !r.options.includes(x)) at(`${k}=${x} is not one of ${r.options.join(', ')}`);
    }
  }
  if (p.lora && (!p.lora.url || !p.lora.licence || !p.lora.name)) at('a LoRA needs a name, source url and licence');
  if (p.hero && !p.thumbnail) at('a hero needs a thumbnail');
  if (p.available && R.status !== 'ready' && ['brush-edit', 'camera-angles', 'camera-lens'].includes(p.workflow)) at(`${p.workflow} isn't wired into Create Image yet: mark it available: false`);
  return errs;
}

/** Boot check: every preset against the live tools. Returns the presets that pass and the problems of the ones that don't. */
export function validateImagePresets(getTool: (id: string) => ToolLike | undefined, presets: ImagePreset[] = IMAGE_PRESETS): { ok: ImagePreset[]; errors: string[] } {
  const errors: string[] = []; const ok: ImagePreset[] = []; const seen = new Set<string>();
  for (const p of presets) { const e = presetProblems(p, getTool); if (seen.has(p.id)) e.push(`${p.id}: duplicate id`); seen.add(p.id); if (e.length) errors.push(...e); else ok.push(p); }
  return { ok, errors };
}

/** GET /api/image-presets: the presets that passed, each with its runner tool, `href` (the Create Image link that opens it) and `ready` (available AND the workflow is pickable in Create Image now). */
export function imagePresetsPayload(getTool: (id: string) => ToolLike | undefined, valid: ImagePreset[]) {
  return {
    categories: PRESET_CATEGORIES,
    presets: valid.map((p) => { const R = presetFieldRules(p.workflow, getTool)!; return { ...p, runner: { toolId: R.toolId }, workflowStatus: R.status, ready: p.available && R.status === 'ready', href: presetHref(p) }; }),
  };
}
