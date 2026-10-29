/**
 * Pre-flight (2026-10-23): every reason a run can't start yet, each with one fix, in one order (inputs → model → setup → money).
 * Isomorphic: the Create bar's Generate popover (web ImageCanvas) and GET /api/tools/:toolId/preflight (agents, MCP) build the same list
 * from the same state. The money side comes from the tool's own quote (GET /api/tools/:toolId/price), so quote = charge is untouched:
 * pre-flight only reads it.
 */
import { sameShape, ratioOf } from './imageCaps.js';
import { LOCAL_LABEL } from './modelIds.js';

export type PreflightStage = 'inputs' | 'model' | 'setup' | 'money';
export type PreflightFixKind = 'choose-photo' | 'fit-photo' | 'crop-photo' | 'use-first' | 'pick-model' | 'paint-mask' | 'focus-prompt' | 'open-group'
  | 'add-key' | 'download' | 'turn-on' | 'install-node' | 'set-up';
export interface PreflightFix { kind: PreflightFixKind; label: string; args?: Record<string, string | number> }
export interface PreflightProblem { code: string; stage: PreflightStage; message: string; fix: PreflightFix; /** a second way out ("Crop", "Pick model…") */ alt?: PreflightFix }
export const PREFLIGHT_CODES = ['photo_missing', 'photo_too_small', 'photo_shape', 'too_many_images', 'mask_missing', 'prompt_missing', 'pick_missing', 'input_problem',
  'model_cant_run', 'price_unavailable', 'needs_key', 'needs_download', 'needs_gpu', 'needs_node', 'needs_setup'] as const;
export const PREFLIGHT_STAGES: PreflightStage[] = ['inputs', 'model', 'setup', 'money'];

export interface PreflightSlot { name: string; label: string; required: boolean; filled: boolean; /** Generate's words while empty ("Add a face") */ missing?: string;
  width?: number | null; height?: number | null; /** the aspect this slot's photo must have for the picked model (input prep), else null */ fitTo?: string | null }
export interface PreflightState {
  slots?: PreflightSlot[];
  /** shortest side the run accepts (edits: 128 px) */ minSide?: number | null;
  /** photos sent vs what the model takes */ images?: { count: number; max: number } | null;
  mask?: { needed: boolean; painted: boolean } | null;
  /** a prompt the run needs and doesn't have ("Describe the character") */ prompt?: { missing: string } | null;
  /** a pick the recipe needs (Camera Angles: at least one angle) */ pick?: { group: string; missing: string } | null;
  /** the quote body (200 or the 400 error body), or null while it loads */ quote?: any;
  /** the model's name, for messages */ modelName?: string | null;
  /** cloud first (2026-10-27): the tool also has a model that runs free on this computer, so a missing key names that way out too */ freeLocal?: boolean;
}
const gb = (b: number) => `${b >= 1e10 ? Math.round(b / 1e9) : Math.round(b / 1e8) / 10} GB`;
/** "9:16" for a 1080×1920 photo: the nearest common shape (within 2%), else the reduced ratio rounded. */
/** A quote 400 that refuses the settings in its own words (Video Upscale: a clip already at the size, Topaz 720p): its code is the reason, not a missing price. */
const plainRefusal = (q: any) => q?.valid === false && q?.errorType === 'validation' && typeof q?.code === 'string' && !!q.code && q.code !== 'price_unavailable' && typeof q?.error === 'string';
export function shapeName(w: number, h: number): string {
  const COMMON = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9', '9:21', '5:4', '4:5'];
  const r = w / h; const near = COMMON.find((a) => Math.abs(ratioOf(a)! / r - 1) <= 0.02); if (near) return near;
  return r >= 1 ? `${Math.round(r * 10) / 10}:1` : `1:${Math.round((1 / r) * 10) / 10}`;
}

/** The ordered problem list; [] = Generate runs. */
/** The other way out of a missing key when the tool has a free model on this computer. */
export const FREE_LOCAL_TAIL = ', or pick a free model that runs on your computer';
/** Generate's words for a model that runs only on this computer (no cloud place, so no key can help): set up ComfyUI, free. */
export const LOCAL_SETUP_TEXT = 'Set up ComfyUI to run free';
/** The quote's needsKey says "nothing can run it here", not "a key would fix it": a model with no cloud place at all (YuE2: local only, ComfyUI not
 *  reachable) quotes needsKey:true with no key providers (routing/select.ts noProvider). Display only: the gate is the same, the words are honest. */
export const localOnlyGate = (q: any): boolean => !!q && q.needsKey === true && q.runnable === false && q.local === true
  && !(q.noProvider?.providers?.length) && !q.keyOwner && !q.noProvider?.keyOwner && q.setup?.action !== 'add_key';
export function preflightProblems(s: PreflightState): PreflightProblem[] {
  const out: PreflightProblem[] = []; const add = (p: PreflightProblem) => out.push(p);
  const q = s.quote ?? null; const model = s.modelName || 'This model';
  // ---- inputs ----
  for (const sl of s.slots ?? []) {
    if (sl.required && !sl.filled) { add({ code: 'photo_missing', stage: 'inputs', message: sl.missing || `Add ${sl.label.toLowerCase()}`, fix: { kind: 'choose-photo', label: 'Choose…', args: { slot: sl.name } } }); continue; }
    if (!sl.filled || !(Number(sl.width) > 0 && Number(sl.height) > 0)) continue;
    const w = Number(sl.width), h = Number(sl.height);
    if (s.minSide && Math.min(w, h) < s.minSide) { add({ code: 'photo_too_small', stage: 'inputs', message: `${sl.label} is ${w}×${h}; it needs ${s.minSide} px on the short side`, fix: { kind: 'choose-photo', label: 'Choose another…', args: { slot: sl.name } } }); continue; }
    if (sl.fitTo && !sameShape(`${w}:${h}`, sl.fitTo)) add({ code: 'photo_shape', stage: 'inputs', message: `${sl.label} is ${shapeName(w, h)}; ${model} needs ${sl.fitTo}`,
      fix: { kind: 'fit-photo', label: `Fit to ${sl.fitTo}`, args: { slot: sl.name, aspect: sl.fitTo } }, alt: { kind: 'crop-photo', label: 'Crop', args: { slot: sl.name, aspect: sl.fitTo } } });
  }
  if (s.images && s.images.count > s.images.max) add({ code: 'too_many_images', stage: 'inputs', message: s.images.max ? `${s.images.count} images; ${model} takes ${s.images.max}` : `${model} takes no images`,
    fix: s.images.max ? { kind: 'use-first', label: `Use first ${s.images.max}`, args: { n: s.images.max } } : { kind: 'pick-model', label: 'Pick model…' }, ...(s.images.max ? { alt: { kind: 'pick-model' as const, label: 'Pick model…' } } : {}) });
  if (s.mask?.needed && !s.mask.painted) add({ code: 'mask_missing', stage: 'inputs', message: 'No mask painted yet', fix: { kind: 'paint-mask', label: 'Paint mask' } });
  if (s.prompt) add({ code: 'prompt_missing', stage: 'inputs', message: s.prompt.missing, fix: { kind: 'focus-prompt', label: 'Write it' } });
  if (s.pick) add({ code: 'pick_missing', stage: 'inputs', message: s.pick.missing, fix: { kind: 'open-group', label: 'Pick', args: { group: s.pick.group } } });
  // ---- model: the quote refused these settings on this model (a 400), or has no verified price ----
  const shapeSaid = out.some((p) => p.code === 'photo_shape') || out.some((p) => p.code === 'too_many_images');
  if (q && q.valid === false && q.error && !q.setupOptions && !(shapeSaid && /^(aspect|refs)$/.test(String(q.issues?.[0]?.field ?? q.field ?? '')))
    && q.code !== 'price_unavailable' && (q.priceAvailable !== false || plainRefusal(q)))
    add({ code: 'model_cant_run', stage: 'model', message: String(q.error).replace(/\.$/, ''), fix: { kind: 'pick-model', label: 'Pick model…' } });
  // the route can't take this job's inputs (input_blocked: wrong mode, a clip a public link can't reach…): the price stays in the quote but isn't
  // shown as chargeable, so say why here (else the button showed neither a price nor a reason). A blockedField (Camera's start image) is the inputs' own step.
  if (q && q.runnable === false && q.blockedCode === 'input_blocked' && q.blockedReason && !q.blockedField && !out.some((p) => p.stage === 'inputs'))
    add({ code: 'model_cant_run', stage: 'model', message: String(q.blockedReason).replace(/^.*?can['’]t run this job\.\s*/, '').replace(/\.$/, ''), fix: { kind: 'pick-model', label: 'Pick model…' } });
  const unpriced = !!q && q.credits == null && (q.priceAvailable === false || q.code === 'price_unavailable') && !q.setupOptions?.length && !q.setup && !plainRefusal(q); // a refusal in plain words is not a missing price
  if (unpriced && q.runnable === false) add({ code: 'price_unavailable', stage: 'model', message: `No verified price for ${model} at this setting`, fix: { kind: 'pick-model', label: 'Pick model…' } });
  // ---- setup: the quote names the step (setupOptions: every place, the first is the lead; setup: one) ----
  if (q && q.runnable === false) {
    const o = Array.isArray(q.setupOptions) && q.setupOptions.length ? (q.setupOptions.find((x: any) => x.runOn === q.runOn) ?? q.setupOptions[0]) : q.setup?.action ? q.setup : null;
    const runOn = String(o?.runOn ?? ''); const where = String(o?.runOnLabel ?? runOn ?? '');
    if (o?.action === 'download') add({ code: 'needs_download', stage: 'setup', message: `${model} isn’t downloaded yet`, fix: { kind: 'download', label: o.missingBytes ? `Download ${gb(Number(o.missingBytes))}` : 'Download', args: { runOn, ...(o.missingBytes ? { bytes: Number(o.missingBytes) } : {}) } } });
    else if (o?.action === 'add_key') add({ code: 'needs_key', stage: 'setup', message: `Needs a ${where || 'provider'} key${s.freeLocal ? FREE_LOCAL_TAIL : ''}`, fix: { kind: 'add-key', label: 'Add key', args: { runOn } } });
    else if (o?.action === 'turn_on') add({ code: 'needs_gpu', stage: 'setup', message: `${LOCAL_LABEL} is off`, fix: { kind: 'turn-on', label: 'Turn on', args: { runOn } } });
    else if (o?.action === 'install_node') add({ code: 'needs_node', stage: 'setup', message: `${model} needs a custom node`, fix: { kind: 'install-node', label: 'Install node', args: { runOn } } });
    else if (o) add({ code: 'needs_setup', stage: 'setup', message: `${model} isn’t set up yet`, fix: { kind: 'set-up', label: String(o.actionText || 'Set up'), args: { runOn } } });
    // a model that runs only on your computer while no ComfyUI answers: the routing reason as is (routing/select.ts localOnlyUnreachable), never "add a key"
    else if (q.reasonCode === 'local_only_unreachable') add({ code: 'needs_comfyui', stage: 'setup', message: String(q.unavailableReason ?? q.priceLine ?? `Set up ComfyUI to run ${model} free`).split(':')[0].replace(/\.$/, ''), fix: { kind: 'set-up', label: 'Set up ComfyUI', args: { runOn: 'local' } } });
    else if (localOnlyGate(q)) add({ code: 'needs_setup', stage: 'setup', message: `${model} runs free on your computer once ComfyUI is set up`, fix: { kind: 'set-up', label: LOCAL_SETUP_TEXT, args: { runOn: 'local' } } });
    else if (q.needsKey === true) add({ code: 'needs_key', stage: 'setup', message: `Needs a provider key${s.freeLocal ? FREE_LOCAL_TAIL : ''}`, fix: { kind: 'add-key', label: 'Add key', args: { runOn: String(q.runOn ?? '') } } });
  }
  return out.sort((a, b) => PREFLIGHT_STAGES.indexOf(a.stage) - PREFLIGHT_STAGES.indexOf(b.stage));
}
