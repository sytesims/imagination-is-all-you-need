/**
 * One "generate" description for every medium (2026-10-24, Canvas step 2): what a generate card or bar runs, as the same workflow-recipe
 * shape Create Image's bar already reads (WfRecipe: labelled slots, control groups, models per mode), so ONE set of shared bar pieces
 * (WorkflowControls with its popovers and the light sphere, ModelMenu, RunOnChip, PromptPeek, DockGenerate, the pre-flight list) can drive
 * an image, video, audio or 3D run. Nothing here invents a field: every option, default and limit comes from the live tool registry
 * (GET /api/tools), the model registry (GET /api/models: image caps), the image workflow recipes (GET /api/image-workflows) or the 3D
 * model table (server shared/threeD.ts). The runner is always the existing tool and its jobs API, so quote = charge holds.
 *
 * No React here (the Canvas card and bar import it; a page can too).
 */
import type { ProviderInfo, ToolInfo } from '../api';
import type { WfRecipe } from '../ui/next/WorkflowBar';
import { settingsOnSwitch } from './composerDraft';
import { maxRefsOf, routeCapsOf } from './refCaps';
import { recipeFor } from './threeDRecipe';
import { defaultsOf, pickDefault } from './defaults';
import { THREE_D_WORKFLOWS, threeDModel, normalizeSettings } from '../../../server/src/shared/threeD';
import { canvasDefaultModel } from '../../../server/src/shared/cloudDefaults';

export type GenMedium = 'image' | 'video' | 'audio' | '3d';
export type InputKind = 'image' | 'video' | 'audio';
export const MEDIA: { id: GenMedium; label: string }[] = [{ id: 'image', label: 'Image' }, { id: 'video', label: 'Video' }, { id: 'audio', label: 'Audio' }, { id: '3d', label: '3D' }];

/** A labelled input of a run: what it accepts, how many, and the form field it goes out as (extra files of a multi slot go as `restAs`). */
export interface GenSlot { name: string; label: string; accept: InputKind; required: boolean; max: number; sendsAs: string; restAs?: string; missing: string; hint: string }
export interface GenFlow { id: string; medium: GenMedium; name: string; tagline: string; needs: string; icon: string; toolId: string;
  /** an image workflow recipe (GET /api/image-workflows) */ recipeId?: string; /** the tool's mode (types) for a plain tool */ types?: string;
  /** the one model this flow runs (Lip Sync: H3 Talking Photo) */ provider?: string }

/** The flows a board offers, by medium. Image workflows other than Create come from their recipes (name, slots, models); a flow whose tool
 *  or recipe this server doesn't have is left out (availableFlows). Brush Edit, Erase and Camera Angles need a painted mask / angle sheet
 *  that the board doesn't draw yet, so they stay on their pages. */
export const GEN_FLOWS: GenFlow[] = [
  { id: 'create', medium: 'image', name: 'Create Image', tagline: 'Text to image, or edit with references', needs: 'Prompt · images optional', icon: 'create', toolId: 'create-image' },
  ...(['relight', 'upscale', 'remove-bg', 'image-layers', 'expand', 'product-shot', 'character-sheet', 'face-swap', 'person-swap', 'try-on', 'material-swap'] as const)
    .map(id => ({ id, medium: 'image' as const, name: id, tagline: '', needs: '', icon: 'create', toolId: '', recipeId: id })),
  { id: 'video', medium: 'video', name: 'Create Video', tagline: 'Video with sound, from text or frames', needs: 'Prompt · first / last frame optional', icon: 'video', toolId: 'h3-video' },
  { id: 'transition', medium: 'video', name: 'Transitions', tagline: 'Animate from a start to an end image', needs: '2 images', icon: 'video', toolId: 'app-transition' },
  { id: 'extend', medium: 'video', name: 'Extend', tagline: 'Keep the shot going', needs: '1 clip', icon: 'video', toolId: 'h3-extend' },
  { id: 'video-upscale', medium: 'video', name: 'Video Upscale', tagline: 'Sharper, larger clips, audio kept', needs: '1 clip', icon: 'upscale', toolId: 'upscale', types: 'precise' },
  { id: 'add-sound', medium: 'video', name: 'Add sound', tagline: 'Music and sound effects timed to the clip (MMAudio)', needs: '1 clip', icon: 'audio', toolId: 'soundtrack', types: 'v2s', provider: 'comfy-mmaudio' },
  { id: 'lip-sync', medium: 'video', name: 'Lip Sync', tagline: 'Make a portrait talk with a speech clip', needs: 'Portrait + speech', icon: 'user', toolId: 'voice', types: 'lipsync', provider: 'comfy-h3-lipsync' },
  { id: 'music', medium: 'audio', name: 'Music', tagline: 'Songs and beds from a prompt', needs: 'Prompt', icon: 'audio', toolId: 'audio', types: 'music' },
  { id: 'sfx', medium: 'audio', name: 'Sound Effects', tagline: 'A sound from a description', needs: 'Prompt', icon: 'audio', toolId: 'audio', types: 'sfx' },
  { id: 'voice', medium: 'audio', name: 'Text to Speech', tagline: 'Your script, read aloud', needs: 'Script', icon: 'audio', toolId: 'audio', types: 'voice' },
  { id: 'image-to-3d', medium: '3d', name: 'Image to 3D', tagline: 'One image into a textured 3D model', needs: '1 image', icon: 'cube', toolId: 'three-d' },
];
export const DEFAULT_FLOW: Record<GenMedium, string> = { image: 'create', video: 'video', audio: 'music', '3d': 'image-to-3d' };
export const flowById = (id: string | null | undefined) => GEN_FLOWS.find(f => f.id === id) ?? null;

/** What the catalog needs from the server, loaded once per page (canvas/catalog.ts). */
export interface GenCatalog { tools: ToolInfo[]; recipes: WfRecipe[]; /** GET /api/models rows by provider id (image caps live here) */ models: Record<string, any> }

/** A flow named in our words with the recipe's own name and line (Relight, "Relight a photo…"), and the tool that runs it. */
export function flowInfo(f: GenFlow, cat: GenCatalog | null): GenFlow {
  if (!f.recipeId) return f; const r = cat?.recipes.find(x => x.id === f.recipeId);
  return r ? { ...f, name: r.name, tagline: r.tagline, needs: r.needs, icon: r.icon, toolId: r.runner.toolId } : f;
}
export function availableFlows(cat: GenCatalog | null): GenFlow[] {
  if (!cat) return [];
  return GEN_FLOWS.map(f => flowInfo(f, cat)).filter(f => (f.recipeId ? cat.recipes.some(r => r.id === f.recipeId && r.status === 'ready') : true) && cat.tools.some(t => t.id === f.toolId));
}

/** Everything a bar or card needs to edit, price and submit one run of a flow with this model. */
export interface FlowSpec {
  flow: GenFlow; tool: ToolInfo; recipe: WfRecipe; slots: GenSlot[]; providers: ProviderInfo[]; provider: string;
  /** the mode the run takes (a recipe's mode, a video's t2v / i2v / flf, Music…) */ mode: string;
  /** values with the model's own defaults filled and shapes it doesn't take swapped for its default */ vals: Record<string, string>;
  promptMode: 'required' | 'optional' | 'hidden'; placeholder: string; generateLabel: string;
  /** GET /price params (the same the submit implies) */ quote: Record<string, string>;
  /** form fields the submit sends besides files and prompt */ fields: Record<string, string>;
  /** the most images this model takes in one run (create): too many → the plain note */ maxImages: number | null;
}
export type Filled = Record<string, { url: string; kind: InputKind }[]>;

const lbl = (v: string, f: string) => f === 'duration' || f === 'extendSeconds' ? `${v} s` : f === 'audio' ? (v === '1' ? 'Sound on' : 'Sound off') : f === 'n' ? `${v}×` : v === 'auto' ? 'Auto' : /^[a-z]/.test(v) ? v[0].toUpperCase() + v.slice(1).replace(/-/g, ' ') : v;
const ctl = (field: string, label: string, group: string, values: (string | number)[], def?: string) => values.length
  ? [{ field, label, kind: 'segmented', group, options: values.map(v => ({ value: String(v), label: lbl(String(v), field) })), default: def != null && values.map(String).includes(def) ? def : String(values[0]) }] : [];
const grp = (id: string, label: string, icon: string, summary: string[]) => ({ id, label, icon, summary });
const opts = (t: ToolInfo, name: string) => t.inputs.find(i => i.name === name)?.options ?? [];
const defOf = (t: ToolInfo, name: string) => t.inputs.find(i => i.name === name)?.default;
/** A plain tool as a recipe (the shape WorkflowControls reads). */
function plainRecipe(f: GenFlow, t: ToolInfo, controls: any[], groups: any[], slots: GenSlot[], prompt: FlowSpec['promptMode'], placeholder: string, label: string): WfRecipe {
  return { id: f.id, name: f.name, icon: f.icon, tagline: f.tagline, needs: f.needs, category: 'edit', status: 'ready', slots: slots.map((s, i) => ({ name: s.name, label: s.label, required: s.required, sendsAs: s.sendsAs, order: i + 1, hint: s.hint, missing: s.missing })),
    controls, groups: groups.filter(g => controls.some(c => c.group === g.id)), modes: { default: f.types ?? 'default', whenSlot: null }, prompt: { mode: prompt, placeholder, composer: 'plain' },
    source: { kind: 'ours', author: '', url: null, licence: 'AGPL-3.0', file: null, note: '' }, models: {}, locked: {}, runner: { kind: 'create-image', toolId: t.id }, generateLabel: label,
    output: { aspect: 'model', resolution: 'model', count: 1 }, surface: null, aliases: { toolId: t.id, routes: [] }, route: '' } as unknown as WfRecipe;
}
const slot = (name: string, label: string, accept: InputKind, required: boolean, missing: string, hint: string, o: Partial<GenSlot> = {}): GenSlot => ({ name, label, accept, required, max: 1, sendsAs: name, missing, hint, ...o });
const fill = (filled: Filled, s: string) => (filled[s]?.length ?? 0) > 0;
const pickProvider = (want: string | undefined, list: ProviderInfo[], def?: string | null) => (want && list.some(p => p.id === want) ? want : def && list.some(p => p.id === def) ? def : list[0]?.id ?? '');
/** The tool takes this input with this model (tool.app.inputsOnlyFor: Extend's guideFrames / crossfade / extendMethod are LTX-2.5 only). */
const takesInput = (t: ToolInfo, provider: string, name: string) => { const only: string[] | undefined = (t as any).app?.inputsOnlyFor?.[name]; return !only || only.includes(provider); };
/** The values a model offers for a select input: the tool's per-model list (app `${name}sByProvider` style lists first, then the input's byProvider), else its options. */
const optsFor = (t: ToolInfo, provider: string, name: string, byApp?: Record<string, unknown[]> | null): string[] =>
  ((byApp?.[provider] as unknown[] | undefined) ?? (t.inputs.find(i => i.name === name) as any)?.byProvider?.[provider] ?? opts(t, name)).map(String);
/** Settings a card keeps without a chip of its own (2026-10-28, BUG: Extend dropped resolution / extendMethod set over MCP): every other select or
 *  number input of the tool, as the agent (canvas_add_card settings) or an earlier version of the card set it, so the quote and the submit
 *  carry it. Only values the tool takes with this model (its options, by model when it lists them); anything else is left out, never sent.
 *  `handled`: the inputs the flow decides itself (its chips, or ones it drops on purpose for this model). */
function keptVals(t: ToolInfo, provider: string, wv: Record<string, string>, handled: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of t.inputs as any[]) {
    if (handled.includes(i.name) || i.name === 'seed' /* each run draws its own (cardModel.runForm) */ || !takesInput(t, provider, i.name)) continue; const v = wv[i.name]; if (v == null || v === '') continue;
    if (i.kind === 'select') { if (optsFor(t, provider, i.name).includes(String(v))) out[i.name] = String(v); }
    else if (i.kind === 'number') { if (String(v).trim() !== '' && Number.isFinite(Number(v))) out[i.name] = String(Number(v)); }
  }
  return out;
}
/** Chips with our own words for some values (Extend's LTX sizes: Draft / Sharper / 720p). */
const relabel = (controls: any[], words: Record<string, string>) => controls.map(c => ({ ...c, options: c.options.map((o: any) => (words[o.value] ? { ...o, label: words[o.value] } : o)) }));
/** A control's value: the card's own when the control offers it, else the control's default. */
const valsOf = (controls: any[], wv: Record<string, string>): Record<string, string> => Object.fromEntries(controls.map(c => [c.field, c.options.some((o: any) => o.value === wv[c.field]) ? wv[c.field] : c.default]));

/** A card with no model of its own starts on the flow's cloud model (cloud first, user 2026-10-28: server shared/cloudDefaults.ts
 *  CANVAS_DEFAULTS, the same pick the server's demo boards use), unless the user made their own default or pinned a route; else on the
 *  tool's default (`toolDefault`). Never rewrites a stored model: `want.provider` wins wherever the card's list has it. */
function cardDefault(f: GenFlow, tool: ToolInfo, mode: string | null, providers: ProviderInfo[], toolDefault: string | null | undefined): string | null {
  const d: any = (mode && (tool as any).defaultsByMode?.[mode]) || tool;
  return canvasDefaultModel(f.id, mode, { source: d.defaultSource ?? (tool as any).defaultSource ?? null, toolDefault, state: id => providers.find(p => p.id === id) as any });
}

/** The spec of one run. `want` = the card's stored model and values (kept when the model takes them). */
/** A new Music / Sound Effects / Voice card's model: the server's default for that kind of sound (defaultsByMode, which already skips what can't
 *  run here; the Audio tab picks the same through AppTool), never just the first of the quality order (that is MiniMax Music 3 on Comfy, which
 *  this server may not run). A card has no lyrics box, so a lyrics-only model (app.lyricsRequired: YuE2) gives way to the next model in the
 *  quality order that runs here and can make an instrumental. */
export function audioCardDefault(tool: ToolInfo, mode: string, providers: ProviderInfo[]): string {
  const ids = providers.map(p => p.id); const d = defaultsOf(tool, mode); const def = pickDefault(d, ids);
  const needsLyrics: string[] = mode === 'music' ? ((tool as any).app?.lyricsRequired ?? []) : [];
  if (!needsLyrics.includes(def)) return def;
  const runs = (id: string) => (providers.find(p => p.id === id) as any)?.runnable !== false;
  const order = [...(d.qualityOrder ?? []), ...ids].filter(id => ids.includes(id));
  return order.find(id => runs(id) && !needsLyrics.includes(id)) ?? def;
}
export function flowSpec(f0: GenFlow, cat: GenCatalog, want: { provider?: string; vals?: Record<string, string>; filled: Filled }): FlowSpec | null {
  const f = flowInfo(f0, cat); const tool = cat.tools.find(t => t.id === f.toolId); if (!tool) return null; const filled = want.filled; const wv = want.vals ?? {};
  const files = (sl: GenSlot[]) => Object.fromEntries(sl.flatMap(s => { const n = filled[s.name]?.length ?? 0; if (!n) return []; return s.restAs && n > 1 ? [[s.sendsAs, '1'], [s.restAs, String(n - 1)]] : [[s.sendsAs, '1']]; }));
  const base = (recipe: WfRecipe, slots: GenSlot[], providers: ProviderInfo[], provider: string, mode: string, vals: Record<string, string>, extra: Partial<FlowSpec>): FlowSpec => ({
    flow: f, tool, recipe, slots, providers, provider, mode, vals, promptMode: recipe.prompt.mode as FlowSpec['promptMode'], placeholder: recipe.prompt.placeholder || 'Describe what you want', generateLabel: recipe.generateLabel || 'Generate',
    quote: { types: mode, ...vals, ...files(slots) }, fields: { types: JSON.stringify([mode]), ...vals }, maxImages: null, ...extra });

  if (f.recipeId) { /* an image workflow: its recipe as the server sends it (slots, groups, models per mode) */
    const r = cat.recipes.find(x => x.id === f.recipeId); if (!r) return null;
    const slots = [...r.slots].sort((a, b) => a.order - b.order).map(s => slot(s.name, s.label, 'image', s.required, s.missing, s.hint, { sendsAs: s.sendsAs }));
    const mode = Object.entries(r.modes.whenSlot ?? {}).find(([k]) => fill(filled, k))?.[1] ?? r.modes.default;
    const providers = (r.models[mode] ?? []).map(id => tool.providers.find(p => p.id === id)).filter(Boolean) as ProviderInfo[];
    const provider = pickProvider(want.provider, providers, cardDefault(f, tool, mode, providers, (tool as any).defaultsByMode?.[mode]?.defaultProvider ?? tool.defaultProvider));
    const dv = Object.fromEntries(r.controls.filter(c => c.default != null && !c.optional).map(c => [c.field, String(c.default)]));
    const vals0 = { ...dv, ...Object.fromEntries(Object.entries(wv).filter(([k]) => r.controls.some(c => c.field === k))) };
    /* a shape this model doesn't offer goes out as its own default (WorkflowBar fitWfVals rule, read from the recipe's modelInfo) */
    const c = r.controls.find(x => x.field === 'aspect'); const ok = r.modelInfo?.[provider]?.aspects?.[mode];
    const vals = c && ok?.length && !ok.includes(vals0.aspect ?? String(c.default ?? 'auto')) ? { ...vals0, aspect: r.modelInfo?.[provider]?.defaultAspect && ok.includes(r.modelInfo[provider].defaultAspect!) ? r.modelInfo[provider].defaultAspect! : ok.find(x => x !== 'auto') ?? ok[0] } : vals0;
    const ctlVals = Object.fromEntries(r.controls.map(x => [x.field, vals[x.field] ?? (x.optional ? '' : String(x.default ?? ''))]).filter(([, v]) => v !== ''));
    const sent = slots.filter(s => s.required || fill(filled, s.name));
    const q: Record<string, string> = r.id === 'upscale' ? { scale: String(vals.scale ?? '4') } : { types: mode, ...Object.fromEntries(Object.entries(ctlVals).filter(([k]) => r.controls.find(x => x.field === k)?.kind !== 'text')) /* typed words never change the price */ };
    return base(r, slots, providers, provider, mode, vals, {
      quote: { ...q, ...Object.fromEntries(sent.map(s => [s.sendsAs, '1'])), ...(sent.some(s => s.sendsAs === 'image') ? { image: '1' } : {}), ...(sent.length > 1 ? { refs: String(sent.length) } : {}) },
      /* the runner app decides the mode from its files (as Create Image's workflow submit): no types field */ fields: ctlVals });
  }
  if (f.id === 'image-to-3d') { /* the 3D model table (shared threeDRecipe): detail / faces / texture as group chips */
    const providers = tool.providers; const provider = pickProvider(want.provider, providers, cardDefault(f, tool, null, providers, tool.defaultProvider ?? 'cloud-tripo-31'));
    const r = recipeFor(threeDModel(provider), THREE_D_WORKFLOWS[0]); const s = normalizeSettings(provider, wv); const vals = { ...keptVals(tool, provider, wv, ['detail', 'texture', 'faces', 'format']), detail: s.detail, texture: s.texture, faces: s.faces };
    const slots = [slot('image', 'Image', 'image', true, 'Add an image', 'One object, on a plain background if you can')];
    return base(r, slots, providers, provider, 'image-to-3d', vals, { promptMode: 'hidden', generateLabel: r.generateLabel || 'Make 3D', fields: { types: JSON.stringify(['image-to-3d']), ...vals, format: 'glb' } });
  }
  const cfg: any = tool.app ?? {}; const modesOf = (p: string): string[] | null => cfg.providerModes?.[p] ?? null;
  if (f.id === 'create') { /* Create Image: references (the model's real cap), shape / quality / size / takes from its image caps */
    const providers = tool.providers; const provider = pickProvider(want.provider, providers, cardDefault(f, tool, (filled.refs?.length ?? 0) ? 'edit' : 'generate', providers, tool.defaultProvider));
    const reg = cat.models[provider] ?? {}; const caps = reg.capabilities ?? null; const pv: any = providers.find(p => p.id === provider);
    const maxImages = caps?.supports?.refs === false ? 0 : maxRefsOf(caps?.supports, routeCapsOf(pv)); const n = (filled.refs?.length ?? 0);
    const sw = settingsOnSwitch(caps, { editing: n > 0, n: Number(wv.n ?? 1), cur: { aspect: wv.aspect === 'auto' ? 'Auto' : wv.aspect, quality: wv.quality, imageResolution: wv.imageResolution } });
    const controls = [...ctl('aspect', 'Shape', 'shape', sw.aspects.map(a => a === 'Auto' ? 'auto' : a), sw.aspect === 'Auto' ? 'auto' : sw.aspect), ...ctl('quality', 'Quality', 'quality', sw.tiers, sw.quality),
      ...ctl('imageResolution', 'Size', 'size', sw.resList, sw.imageResolution), ...ctl('n', 'Takes', 'takes', Array.from({ length: sw.maxN }, (_, i) => i + 1), String(sw.n))];
    const vals = { ...keptVals(tool, provider, wv, ['aspect', 'quality', 'imageResolution', 'resolution', 'n']), ...valsOf(controls, wv) };
    const slots = [slot('refs', 'Images', 'image', false, 'Add an image', 'Images to edit or follow', { max: Math.max(1, maxImages), sendsAs: 'image', restAs: 'refs' })];
    const recipe = plainRecipe(f, tool, controls, [grp('shape', 'Shape', 'aspect', ['aspect']), grp('quality', 'Quality', 'detail', ['quality']), grp('size', 'Size', 'aspect', ['imageResolution']), grp('takes', 'Takes', 'views', ['n'])], slots, 'required', 'Describe an image, or how to change yours', 'Generate');
    const mode = n ? 'edit' : 'generate';
    return base(recipe, slots, providers, provider, mode, vals, { maxImages, quote: { types: mode, mode, ...vals, refs: String(n), ...(n ? { image: '1' } : {}) } });
  }
  if (tool.id === 'h3-video' || tool.id === 'app-transition') { /* frames by mode: first frame → i2v, both → flf (only models that take a last frame) */
    const trans = tool.id === 'app-transition'; const all = tool.providers;
    const provider0 = pickProvider(want.provider, all, cardDefault(f, tool, null, all, tool.defaultProvider)); const ms = modesOf(provider0); const flf = trans || !ms || ms.includes('flf'); const i2v = trans || !ms || ms.includes('i2v');
    const slots = [...(i2v ? [slot('image', trans ? 'Start' : 'First frame', 'image', trans, trans ? 'Add the start image' : 'Add a first frame', 'The clip starts on this image')] : []),
      ...(flf ? [slot('lastFrame', trans ? 'End' : 'Last frame', 'image', trans, trans ? 'Add the end image' : 'Add a last frame', 'The clip ends on this image')] : [])];
    const mode = trans ? 'default' : fill(filled, 'lastFrame') && fill(filled, 'image') ? 'flf' : fill(filled, 'image') ? 'i2v' : 't2v';
    const providers = trans ? all : all.filter(p => { const m = modesOf(p.id); return !m || m.includes(mode); }); const provider = pickProvider(provider0, providers, cardDefault(f, tool, mode, providers, (tool as any).defaultsByMode?.[mode]?.defaultProvider ?? tool.defaultProvider));
    const lim: any = cfg.videoLimits?.[provider] ?? null;
    const durs: string[] = (lim?.durations ?? cfg.durations ?? opts(tool, 'duration')).map(String); const res: string[] = lim?.resolutions ?? cfg.resolutionsByProvider?.[provider] ?? opts(tool, 'resolution');
    const asp: string[] = lim?.aspects ?? opts(tool, 'aspect'); const sound = !trans && lim?.audio?.supported !== false && opts(tool, 'audio').length > 0;
    const controls = [...ctl('duration', 'Duration', 'time', durs, wv.duration ?? defOf(tool, 'duration') ?? '5'), ...ctl('aspect', 'Shape', 'shape', asp, wv.aspect ?? 'auto'),
      ...(trans ? ctl('transition', 'Transition', 'look', opts(tool, 'transition'), wv.transition ?? defOf(tool, 'transition')) : ctl('resolution', 'Resolution', 'size', res, wv.resolution ?? cfg.defaultResolutionByProvider?.[provider] ?? res[0])),
      ...(sound ? ctl('audio', 'Sound', 'sound', ['1', '0'], wv.audio ?? '1') : [])];
    const vals = { ...keptVals(tool, provider, wv, ['duration', 'aspect', 'resolution', 'transition', 'audio']), ...valsOf(controls, wv) };
    const recipe = plainRecipe(f, tool, controls, [grp('time', 'Duration', 'camera', ['duration']), grp('shape', 'Shape', 'aspect', ['aspect']), grp('size', 'Resolution', 'aspect', ['resolution']), grp('look', 'Transition', 'shots', ['transition']), grp('sound', 'Sound', 'views', ['audio'])], slots, trans ? 'optional' : 'required', trans ? 'How it moves (optional)' : 'Describe the shot', trans ? 'Animate' : 'Generate');
    return base(recipe, slots, providers, provider, mode, vals, trans ? { quote: { ...vals, ...files(slots) }, fields: { ...vals } } : {});
  }
  if (tool.id === 'h3-extend') { /* every setting Extend takes, per model (2026-10-28): length, direction, resolution, and on LTX-2.5 the method and guide frames */
    const providers = tool.providers; const provider = pickProvider(want.provider, providers, cardDefault(f, tool, null, providers, tool.defaultProvider));
    const method = takesInput(tool, provider, 'extendMethod') ? (opts(tool, 'extendMethod').includes(wv.extendMethod) ? wv.extendMethod : 'auto') : null;
    const controls = [...ctl('extendSeconds', 'Add', 'time', optsFor(tool, provider, 'extendSeconds', cfg.extendSecondsByProvider), wv.extendSeconds ?? defOf(tool, 'extendSeconds')),
      ...ctl('direction', 'Direction', 'look', optsFor(tool, provider, 'direction', cfg.directionsByProvider), wv.direction ?? defOf(tool, 'direction')),
      ...relabel(ctl('resolution', 'Resolution', 'size', optsFor(tool, provider, 'resolution', cfg.resolutionsByProvider), wv.resolution ?? cfg.defaultResolutionByProvider?.[provider] ?? defOf(tool, 'resolution')), cfg.videoLimits?.[provider]?.resolutionLabels ?? {}),
      /* Auto = the place decides (picture-and-sound continuation on Comfy Cloud, the last-frames guide on this computer): sent as nothing */
      ...(method ? relabel(ctl('extendMethod', 'Method', 'method', ['auto', ...opts(tool, 'extendMethod')], method), { auto: 'Auto', continue: 'Picture + sound', guide: 'Last frames' }) : []),
      ...(method === 'guide' && takesInput(tool, provider, 'guideFrames') ? relabel(ctl('guideFrames', 'Guide frames', 'method', opts(tool, 'guideFrames'), wv.guideFrames ?? defOf(tool, 'guideFrames')), { 1: 'Last frame', 9: '9 frames', 17: '17 frames' }) : [])];
    const kept = keptVals(tool, provider, wv, [...controls.map(c => c.field), 'extendMethod']); const vals = { ...kept, ...valsOf(controls, wv) };
    const send: Record<string, string> = Object.fromEntries(Object.entries(vals).filter(([k, v]) => !(k === 'extendMethod' && v === 'auto')));
    const slots = [slot('video', 'Clip', 'video', true, 'Add a clip', 'The clip to continue')];
    const recipe = plainRecipe(f, tool, controls, [grp('time', 'Add', 'camera', ['extendSeconds']), grp('look', 'Direction', 'shots', ['direction']), grp('size', 'Resolution', 'aspect', ['resolution']), grp('method', 'Method', 'views', ['extendMethod', 'guideFrames'])], slots, 'optional', 'What happens next (optional)', 'Extend');
    return base(recipe, slots, providers, provider, 'extend', vals, { quote: { ...send, ...files(slots) }, fields: { ...send } });
  }
  if (tool.id === 'upscale') {
    const providers = tool.providers; const provider = pickProvider(want.provider, providers, cardDefault(f, tool, f.types ?? null, providers, tool.defaultProvider));
    const controls = ctl('scale', 'Scale', 'scale', opts(tool, 'scale'), wv.scale ?? defOf(tool, 'scale')); const vals = { ...keptVals(tool, provider, wv, ['scale']), ...valsOf(controls, wv) };
    const slots = [slot('video', 'Clip', 'video', true, 'Add a clip', 'The clip to upscale')];
    const recipe = plainRecipe(f, tool, controls, [grp('scale', 'Scale', 'upscale', ['scale'])], slots, 'hidden', '', 'Upscale');
    return base(recipe, slots, providers, provider, f.types!, vals, {});
  }
  if (tool.id === 'soundtrack') { /* Add sound (shared/addSoundLogic.ts): MMAudio scores the clip, free locally; Replace or Mix with the clip's own sound */
    const providers = tool.providers.filter(p => !f.provider || p.id === f.provider); if (!providers.length) return null; const provider = pickProvider(want.provider, providers, f.provider);
    const mixDef = wv.mix === 'blend' ? 'blend' : 'replace';
    const controls = [{ field: 'mix', label: 'Clip sound', kind: 'segmented', group: 'sound', options: [{ value: 'replace', label: 'Replace' }, { value: 'blend', label: 'Mix in' }], default: mixDef }];
    const vals = { ...keptVals(tool, provider, wv, ['mix']), mix: mixDef }; const slots = [slot('video', 'Clip', 'video', true, 'Add a clip', 'The clip to add sound to (up to 30 s are scored)')];
    const recipe = plainRecipe(f, tool, controls, [grp('sound', 'Clip sound', 'views', ['mix'])], slots, 'optional', 'Describe the sound (optional), e.g. rain and distant thunder', 'Add sound');
    const route: Record<string, string> = provider === 'comfy-mmaudio' ? { route: 'local:comfy-mmaudio' } : {}; /* its one route (shared/addSoundLogic ADD_SOUND_ROUTE): runs with Use local off */
    return base(recipe, slots, providers, provider, 'v2s', vals, { quote: { types: 'v2s', mode: 'v2s', ...route, ...files(slots) }, fields: { types: JSON.stringify(['v2s']), ...vals, ...route } });
  }
  if (tool.id === 'voice') { /* Lip Sync: a portrait and a speech clip, on the one model that makes a photo talk */
    const providers = tool.providers.filter(p => !f.provider || p.id === f.provider); const provider = pickProvider(want.provider, providers, f.provider);
    const slots = [slot('image', 'Portrait', 'image', true, 'Add a portrait', 'A clear, front-facing photo'), slot('speech', 'Speech', 'audio', true, 'Add speech', 'WAV, MP3 or M4A, 2–15 seconds')];
    const recipe = plainRecipe(f, tool, [], [], slots, 'hidden', '', 'Make it talk');
    return base(recipe, slots, providers, provider, 'lipsync', keptVals(tool, provider, wv, ['mix', 'n', 'split']), {});
  }
  if (tool.id === 'audio') { /* Music, Sound Effects, Text to Speech: the models that make that kind of sound */
    const mode = f.types!; const providers = tool.providers.filter(p => { const m = modesOf(p.id); return !m || m.includes(mode); }); const provider = pickProvider(want.provider, providers, cardDefault(f, tool, mode, providers, audioCardDefault(tool, mode, providers)));
    /* the chosen model's own lengths (providers[].durations: MiniMax Music 3 and YuE2 start at 30 s), never the tool-wide union, so a new
       Music card never asks for a length its model refuses (quote = submit: a 10 s MiniMax Music 3 card had no price and failed on Go) */
    const own: number[] | null = Array.isArray((providers.find(p => p.id === provider) as any)?.durations) ? (providers.find(p => p.id === provider) as any).durations : null;
    const durs = (own && own.length ? own : own ? [] : (cfg.durations ?? opts(tool, 'duration'))).map(String);
    const defDur = String(defOf(tool, 'duration') ?? ''); const wantDur = wv.duration != null ? String(wv.duration) : null;
    const controls = mode === 'voice' || !durs.length ? [] : ctl('duration', 'Length', 'time', durs, wantDur && durs.includes(wantDur) ? wantDur : durs.includes(defDur) ? defDur : durs[0]);
    const vals = { ...keptVals(tool, provider, wv, ['duration']), ...valsOf(controls, wv) };
    const recipe = plainRecipe(f, tool, controls, [grp('time', 'Length', 'camera', ['duration'])], [], 'required', mode === 'voice' ? 'Type the script to read' : mode === 'sfx' ? 'Describe the sound' : 'Describe the music', 'Generate');
    return base(recipe, [], providers, provider, mode, vals, {});
  }
  return null;
}

/** Inputs placed in slots: each input goes to its pinned slot when that fits, else the first slot that takes its kind and has room.
 *  What doesn't fit is returned as `extra` (the bar and card say so in plain words). */
export function placeInputs<T extends { key: string; kind: InputKind }>(slots: GenSlot[], inputs: T[], pins: Record<string, string> = {}): { bySlot: Record<string, T[]>; extra: T[] } {
  const bySlot: Record<string, T[]> = Object.fromEntries(slots.map(s => [s.name, []])); const extra: T[] = [];
  const room = (s: GenSlot) => bySlot[s.name].length < s.max;
  const pinned = inputs.filter(i => pins[i.key] && slots.some(s => s.name === pins[i.key] && s.accept === i.kind));
  for (const i of pinned) { const s = slots.find(x => x.name === pins[i.key])!; if (room(s)) bySlot[s.name].push(i); else extra.push(i); }
  for (const i of inputs) { if (pinned.includes(i)) continue; const s = slots.find(x => x.accept === i.kind && room(x)); if (s) bySlot[s.name].push(i); else extra.push(i); }
  return { bySlot, extra };
}
/** "Uses 4 of 6 images: Nano Banana 2 takes up to 4." / "Create Video takes 2 images: 1 not used." */
export function tooManyNote(spec: FlowSpec, extra: number, modelName: string): string | null {
  if (!extra) return null; const imgSlots = spec.slots.filter(s => s.accept === 'image'); const cap = imgSlots.reduce((a, s) => a + s.max, 0);
  if (spec.maxImages != null) return `${modelName} takes up to ${spec.maxImages} image${spec.maxImages === 1 ? '' : 's'}: ${extra} not used.`;
  return `${spec.flow.name} takes ${cap ? `${cap} image${cap === 1 ? '' : 's'}` : 'no inputs of that kind'}: ${extra} not used.`;
}
