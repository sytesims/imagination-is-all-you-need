/**
 * Capabilities (2026-10-26): one searchable list of everything the app does that isn't a tool id on its own, generated from the app's own
 * registries so it can't drift from the pages: the Video page's workflows (shared/videoWorkflows.ts VIDEO_WORKFLOWS) and flow shortcuts
 * (Loop, Morph, Exploded view, New angle, Direct a Shot: VIDEO_FLOW_SHORTCUTS), the Explore cards (shared/exploreFlows.ts) and the Look →
 * Viral templates (shared/viralTemplates.ts). Each item carries ready `run` arguments (tool id, model key, job fields) worked out from the
 * link the page itself opens, so an agent runs exactly what the page would.
 * KEYWORDS adds the words people search with ("vanish", "talking photo", "seamless loop"…) to a capability, a tool or a tool mode
 * (`<toolId>/<mode>`, a `types` option or a preset). It is the only hand-written part; test/capabilities.test.ts fails when a key no longer
 * names a real item, tool or mode.
 * Served by GET /api/capabilities; the MCP server's search_capabilities / describe read it (mcp/src/catalog.ts loadWorkflows).
 */
import { VIDEO_PAGE, VIDEO_WORKFLOWS, VIDEO_FLOW_SHORTCUTS, videoWorkflowHref, type VideoWorkflow } from './shared/videoWorkflows.js';
import { THREE_D_WORKFLOWS, threeDRoute } from './shared/threeD.js';
import { EXPLORE_ROWS } from './shared/exploreFlows.js';
import { VIRAL_TEMPLATES, fillTemplate } from './shared/viralTemplates.js';
import { getTool, listTools } from './tools/registry.js';
import type { ToolDef } from './tools/types.js';

export type CapabilityKind = 'video-workflow' | 'flow' | 'template' | 'explore';
export interface CapabilityRun { tool_id: string; model?: string; fields: Record<string, unknown> }
export interface Capability {
  id: string; kind: CapabilityKind; area: 'video' | 'audio' | 'image' | '3d' | 'agent'; name: string; tagline: string;
  toolId: string | null; modelKey: string | null; needs: string | null; inputs: string[]; how: string[]; keywords: string[];
  /** ready arguments for MCP run / quote (null: not a job, e.g. the canvas or the MCP page) */ run: CapabilityRun | null;
  /** where it opens in the web app */ page: string; status: 'ready'; note?: string;
}

/** Extra search words. Keys: a capability id (video/…, template/…, explore/…), a tool id, or `<toolId>/<mode>`. */
export const KEYWORDS: Record<string, string[]> = {
  // Video Swap family (the old "Video Swap" screen: Object Swap, Motion Control, Restyle)
  'video/object-swap': ['video swap', 'person swap', 'character swap', 'replace person', 'replace product', 'swap outfit', 'change actor', 'recast', 'face swap video'],
  'video/motion-control': ['video swap', 'motion transfer', 'character swap', 'copy motion', 'copy dance', 'dance', 'puppet', 'act out'],
  'video/restyle': ['video swap', 'style transfer', 'cartoonify', 'anime', 'restyle video', 'change setting', 'new location'],
  'object-swap': ['video swap', 'person swap', 'replace'], 'motion-transfer': ['video swap', 'motion control', 'dance'], restyle: ['video swap', 'style transfer'],
  'explore/swap-local': ['video swap', 'local swap', 'wan animate'],
  // Loop / Morph / Transitions / Extend
  'video/loop': ['seamless loop', 'loop', 'looping', 'endless', 'infinite', 'cinemagraph', 'boomerang', 'spotify canvas', 'wallpaper', 'last frame equals first frame'],
  'video/morph': ['morph', 'transform', 'turn into', 'metamorphosis', 'transition', 'start and end frame'],
  'video/transitions': ['morph', 'transition', 'start and end frame', 'first and last frame', 'flf', 'between two images'],
  'app-transition/morph': ['morph', 'transform', 'metamorphosis'],
  'h3-video/flf': ['first and last frame', 'start and end frame', 'last frame', 'keyframes'],
  'video/extend': ['continue video', 'extend video', 'make longer', 'lengthen', 'last frame', 'keep going', 'sequel', 'ltx local', 'free extend'],
  'h3-extend': ['continue video', 'extend', 'last frame', 'longer'],
  // Lip sync / talking photo / voice
  'video/lip-sync': ['lip sync', 'lipsync', 'make it talk', 'talking photo', 'talking head', 'talking avatar', 'talking portrait', 'speaking photo', 'avatar', 'dub'],
  'voice/lipsync': ['lip sync', 'make it talk', 'talking photo', 'talking head', 'talking avatar'],
  'voice/voiceover': ['text to speech', 'tts', 'script to voiceover', 'read my script', 'narration', 'narrator', 'voice over', 'speech from text', 'explainer narration', 'faceless'],
  'audio/voice': ['text to speech', 'tts', 'speech', 'say', 'narration', 'read text aloud'],
  'explore/voiceover': ['text to speech', 'tts', 'script to voiceover', 'narration', 'read my script'],
  voice: ['text to speech', 'tts', 'voiceover', 'lip sync', 'dub', 'translate speech'],
  // Footage Effects (Lightricks IC-LoRA)
  'video/footage-fx': ['footage effects', 'vanish', 'remove people', 'clean plate', 'day to night', 'rain', 'flood', 'alpha matte', 'ic-lora', 'lightricks'],
  'footage-fx/vanish': ['vanish', 'remove people', 'remove crowd', 'remove cars', 'clean plate', 'empty scene', 'erase people from video'],
  'footage-fx/day-to-night': ['day to night', 'night', 'evening', 'relight video'],
  'footage-fx/rain': ['rain', 'weather', 'storm'],
  'footage-fx/flood': ['flood', 'water', 'disaster'],
  'footage-fx/alpha-matte': ['alpha matte', 'matte', 'rotoscope', 'mask', 'key out'],
  'footage-fx/restore': ['restore old footage', 'old film', 'archival', 'remaster', 'colorize video', 'fix old video'],
  'footage-fx/remove-object': ['remove object', 'erase object', 'remove from video', 'video inpaint'],
  'footage-fx/remove-text': ['remove subtitles', 'remove captions', 'remove text from video', 'remove watermark'],
  'footage-fx/extend-frame': ['extend frame', 'outpaint video', 'make vertical', 'widen video', 'zoom out video'],
  // Photo FX, camera, angles, Direct a Shot
  'video/exploded-view': ['exploded view', 'disassemble', 'teardown', 'parts', 'product breakdown', 'xpldv'],
  'photo-fx/exploded-view': ['exploded view', 'disassemble', 'teardown'],
  'video/photo-fx': ['photo effects', 'animate a photo', 'photo to video effect'],
  'video/new-angle': ['new angle', 'crossview', 'different angle', 'change camera angle', 're-film', 'novel view'],
  'video/reshoot': ['new angle', 'camera angle', 'multicam', 'coverage', 'reshoot'],
  'video/camera-moves': ['camera move', 'dolly', 'orbit', 'crane', 'push in', 'image to video camera'],
  'video/direct-a-shot': ['direct a shot', 'blockout', 'previz', 'previsualization', '3d blocking', 'layout to render', 'white model to film', 'stage', 'mockup', 'render'],
  'make-it-real': ['render', 'mockup to video', 'direct a shot', 'previz'],
  'plan-a-shot': ['direct a shot', 'stage', 'mockup', 'previz', 'blockout'],
  // Create / templates / upscale / image / 3D / canvas
  'video/create': ['text to video', 'image to video', 't2v', 'i2v', 'generate video', 'make a video'],
  'video/upscale': ['upscale video', '4k', 'enhance', 'sharpen', 'super resolution'],
  'image-upscale': ['upscale image', 'enlarge', 'super resolution', 'sharpen'],
  'app-relight': ['relight', 'lighting', 'light direction', 'change light', 'relight product', 'product lighting', 'hero shot lighting'],
  // Skill pack v2 words (product photo pack, UGC ad, drama series, release kit, faceless explainer, viral formats)
  'app-product-shot': ['packshot', 'product photo', 'listing photo', 'marketplace', 'amazon listing', 'change background', 'product scene', 'lifestyle shot', 'white background'],
  'app-shots': ['product angles', 'angle pack', 'multiple angles', 'more angles'],
  'app-expand': ['marketplace crops', 'crop for platform', 'outpaint', 'extend image', 'resize for platform', 'image aspect ratio'],
  'app-character-sheet': ['consistent character', 'same character', 'character reference', 'cast', 'turnaround', 'model sheet', 'series cast'],
  'app-ugc-ad': ['ugc', 'creator ad', 'testimonial', 'talking product ad', 'product review video'],
  'create-image': ['cover art', 'album cover', 'thumbnail', 'poster', 'keyframe', 'still image'],
  'app-transition': ['infinite zoom', 'zoom through', 'zoom transition', 'outfit change', 'transformation'],
  'photo-fx/freeze': ['time freeze', 'frozen moment', 'bullet time'],
  'explore/ltx-t2v': ['dialogue scene', 'talking scene', 'speech in sync', 'characters talk'],
  'three-d': ['3d model', 'glb', 'mesh', 'image to 3d'],
  'explore/canvas': ['canvas', 'board', 'moodboard', 'infinite canvas', 'whiteboard'],
  'explore/turntable': ['turntable', 'spin 3d', '360'],
};
/** Words every viral template also answers to (the Look → Viral tab). */
const TEMPLATE_WORDS = ['viral template', 'look viral', 'template', 'trend', 'viral'];

const dedupe = (xs: string[]) => [...new Set(xs.map((x) => x.trim().toLowerCase()).filter(Boolean))];
/** The job field a page's ?preset= / mode value lands in for this tool: a `types` option, the `preset` field, or a select that offers it. */
export function fieldForValue(t: ToolDef | undefined, v: string): Record<string, unknown> {
  if (!t) return {};
  const types = t.inputs.find((i) => i.name === 'types'); if (types && (!(types as any).options || (types as any).options.map(String).includes(v))) return { types: [v] };
  if (t.inputs.some((i) => i.name === 'preset')) return { preset: v };
  const sel = t.inputs.find((i) => Array.isArray((i as any).options) && (i as any).options.map(String).includes(v)); if (sel) return { [sel.name]: sel.kind === 'list' ? [v] : v };
  return {}; // a page-only setting (e.g. a Direct a Shot scene preset): not a job field
}
/** run arguments from the link a page opens (?model=, ?preset=, ?loop=, ?template=, ?prompt=, ?mode=). */
export function runFromHref(toolId: string, href: string, base: Record<string, unknown> = {}): CapabilityRun | null {
  if (!toolId) return null; const t = getTool(toolId); const q = new URLSearchParams(href.split('?')[1] ?? '');
  const fields: Record<string, unknown> = { ...base }; let model: string | undefined;
  const tpl = q.get('template') ? VIRAL_TEMPLATES.find((x) => x.id === q.get('template')) : undefined;
  if (tpl) Object.assign(fields, templateFields(tpl));
  for (const [k, v] of q) {
    if (k === 'model') model = v; else if (k === 'loop') fields.loop = Number(v) || v; else if ((k === 'prompt' || k === 'realPrompt') && !tpl && t?.inputs.some((i) => i.name === 'prompt')) fields.prompt = v;
    else if (k === 'preset' || k === 'mode') Object.assign(fields, fieldForValue(t, v));
  }
  return { tool_id: toolId, ...(model ? { model } : {}), fields };
}
const templateFields = (tpl: (typeof VIRAL_TEMPLATES)[number]) => ({ types: ['t2v'], prompt: fillTemplate(tpl), aspect: tpl.settings.aspect, duration: String(tpl.settings.seconds), audio: tpl.settings.sound ? '1' : '0' });

const fromVideo = (w: VideoWorkflow, kind: CapabilityKind, href: string): Capability => {
  const id = `video/${w.id}`; const base = Object.fromEntries(Object.entries(w.params ?? {}).flatMap(([k, v]) => k === 'mode' ? Object.entries(fieldForValue(getTool(w.toolId), v)) : [[k, v]]));
  return { id, kind, area: w.toolId && getTool(w.toolId) && /^(plan-a-shot|make-it-real|three-d)/.test(w.toolId) ? '3d' : 'video', name: w.name, tagline: w.tagline, toolId: w.toolId || null, modelKey: new URLSearchParams(href.split('?')[1] ?? '').get('model'),
    needs: w.needs, inputs: w.inputs, how: w.how.map(([a, b]) => `${a}: ${b}`), keywords: dedupe([w.id.replace(/-/g, ' '), w.category, ...(KEYWORDS[id] ?? [])]),
    run: w.toolId && w.surface !== 'stitch' ? runFromHref(w.toolId, href, base) : null, page: href, status: 'ready',
    ...noteFor(w.toolId), ...(w.surface === 'stitch' ? { note: 'Joins clips into one video: use the stitch_video tool (POST /api/compose).' } : {}), ...(w.surface === 'edit-hub' ? { note: 'A list of edits: search a specific one (footage effects, reframe, upscale…).' } : {}) };
};

/** Render (make-it-real) needs a mockup job first. */
const RENDER_NOTE = 'Render needs a mockup first: stage and record it on the Direct a Shot page (plan-a-shot, free, in the browser), then direct_a_shot_prep (library toolset) returns its planJob for run.';
const noteFor = (toolId: string | null | undefined) => (toolId === 'make-it-real' || toolId === 'plan-a-shot' ? { note: RENDER_NOTE } : {});

/** Every capability, in page order: Video workflows, flow shortcuts, viral templates, then the Explore cards not already listed. */
export function capabilities(): Capability[] {
  const out: Capability[] = [];
  for (const w of VIDEO_WORKFLOWS) out.push(fromVideo(w, 'video-workflow', videoWorkflowHref(w.id)));
  for (const s of VIDEO_FLOW_SHORTCUTS) if (getTool(s.toolId)) out.push(fromVideo(s, 'flow', s.href));
  for (const t of VIRAL_TEMPLATES) {
    const id = `template/${t.id}`;
    out.push({ id, kind: 'template', area: 'video', name: t.name, tagline: t.line, toolId: 'h3-video', modelKey: t.settings.modelKey, needs: 'Prompt (filled in)', inputs: t.slots.map((s) => `${s.label} (e.g. ${[s.value, ...(s.ideas ?? [])].join(', ')})`),
      how: [`Tip: ${t.tip}`, 'Swap the slot values in the prompt for your own.'], keywords: dedupe([...t.keywords.split(/\s+/), ...TEMPLATE_WORDS, ...(KEYWORDS[id] ?? [])]),
      run: { tool_id: 'h3-video', model: t.settings.modelKey, fields: templateFields(t) }, page: `${VIDEO_PAGE}?template=${t.id}`, status: 'ready' });
  }
  for (const w of THREE_D_WORKFLOWS.filter(w => w.status === 'ready' && w.toolId === 'three-d')) {
    out.push({ id: `3d/${w.id}`, kind: 'flow', area: '3d', name: w.name, tagline: w.tagline, toolId: w.toolId, modelKey: null,
      needs: w.needs, inputs: w.mode === 'text-to-3d' ? ['Prompt'] : w.mode === 'multiview-to-3d' ? ['Front image', 'Left, back or right image (at least one)'] : ['Image'],
      how: w.how.map(([a,b]) => `${a}: ${b}`), keywords: [w.name.toLowerCase(), '3d model', 'glb', 'mesh'],
      run: { tool_id: w.toolId!, ...(w.mode !== 'image-to-3d' ? { model: 'cloud-tripo-31' } : {}), fields: { types: [w.mode] } }, page: threeDRoute(w.id), status: 'ready' });
  }
  const seen = new Set(out.filter(c => !c.id.startsWith('3d/')).map((c) => c.id.split('/')[1]));
  for (const row of EXPLORE_ROWS) for (const c of row.cards) {
    if (seen.has(c.id) || c.id.startsWith('vt-')) continue;
    const id = `explore/${c.id}`; const tool = c.toolId ? getTool(c.toolId) : undefined;
    const area = !c.toolId ? 'agent' : tool && (tool as any).media ? (tool as any).media : /^(three-d|plan-a-shot|make-it-real)/.test(c.toolId) ? '3d' : /audio|voice/.test(c.toolId) ? 'audio' : 'video';
    out.push({ id, kind: 'explore', area, name: c.title, tagline: c.line, toolId: c.toolId || null, modelKey: c.modelKey ?? null, needs: null, inputs: [], how: [],
      keywords: dedupe([row.title, ...(KEYWORDS[id] ?? [])]), run: c.toolId ? runFromHref(c.toolId, c.href) : null, page: c.href, status: 'ready',
      ...noteFor(c.toolId), ...(c.id === 'canvas' ? { note: 'The canvas is driven by the MCP canvas toolset (OPENHIGGSFIELD_MCP_TOOLSETS=core,canvas): canvas_open_board, canvas_add_card, canvas_propose_run…' } : {}),
      ...(!c.toolId && c.id !== 'canvas' ? { note: 'Not a job: this is how you are connected right now.' } : {}) });
  }
  return out;
}

/** The GET /api/capabilities body: the items plus the extra words for tools and tool modes (`<toolId>/<mode>`). */
export function capabilitiesPayload() {
  const items = capabilities(); const ids = new Set(items.map((c) => c.id));
  const keywords = Object.fromEntries(Object.entries(KEYWORDS).filter(([k]) => !ids.has(k)));
  return { items, keywords, total: items.length };
}

/** Keys of KEYWORDS that name nothing (for the test): not a capability, a tool, or a tool's `types` option / preset. */
export function staleKeywordKeys(): string[] {
  const ids = new Set(capabilities().map((c) => c.id)); const tools = listTools();
  return Object.keys(KEYWORDS).filter((k) => {
    if (ids.has(k)) return false; const [tid, mode] = k.split('/'); const t = tools.find((x) => x.id === tid); if (!t) return true; if (!mode) return false;
    const opts = t.inputs.flatMap((i) => (i.name === 'types' || i.kind === 'select' || i.kind === 'list') ? ((i as any).options ?? []).map(String) : []);
    return !opts.includes(mode) && !(t.presets ?? []).some((p) => p.id === mode);
  });
}
