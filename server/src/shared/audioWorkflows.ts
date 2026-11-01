/**
 * Shared Audio page workflows: each job selects a workflow in the bar, as Create Image does
 * (shared/workflows.ts). No tabs. A recipe says which existing tool and mode runs it (audio / voice / soundtrack: ids never change, so the API,
 * MCP and saved jobs keep working), the files it takes (slots), its controls, the prompt's and the lyrics' role and the Generate label.
 * GET /api/audio-workflows serves the list in the same shape as GET /api/image-workflows, so the web can reuse WorkflowBar.
 *
 * Isomorphic: no server imports. What comes from the live tool (control options, defaults, ranges, the models per mode) is filled in by
 * `audioWorkflowsPayload(getTool)`; `validateAudioWorkflows(getTool)` checks the recipes and the tools agree (boot + test/audio-workflows.test.ts).
 * Lip sync is not an Audio workflow: it moved to Video (the Lip Sync workflow, shared/videoWorkflows.ts).
 */
import type { WorkflowSource as GridSource } from './workflowSources.js';
import type { WorkflowSlot, WorkflowControl, WorkflowGroup, WorkflowSource, ControlKind } from './workflows.js';
import { appWorkflowFor, YUE2_SONG, YUE2_COVER, MINIMAX_MUSIC3_LOCAL } from './appWorkflows.js';
import { engineModelKey, MODELS } from './modelIds.js';
import { videoWorkflowHref } from './videoWorkflows.js';
import { AUDIO_PAGE, OLD_AUDIO_PAGE } from './pages.js';

export type AudioWorkflowId = 'music' | 'sfx' | 'voiceover' | 'change-voice' | 'translate' | 'soundtrack-music' | 'soundtrack-sound' | 'cover';
export type AudioCategory = 'create' | 'voice' | 'video';
export interface AudioWorkflowRecipe {
  id: AudioWorkflowId; name: string; icon: string; category: AudioCategory; tagline: string; /** "Prompt", "1 video", "1 song" … */ needs: string;
  source: WorkflowSource;
  /** The tool and mode that run it (submit and quote: POST /api/tools/{tool}/jobs with types=["{mode}"], GET /api/tools/{tool}/price?mode={mode}). */
  tool: string; mode: string; runner: { kind: 'audio'; toolId: string };
  slots: WorkflowSlot[]; /** At least one of these slots must be filled (Change voice: a video or an audio file). */ oneOf?: string[];
  groups: WorkflowGroup[]; controls: WorkflowControl[];
  prompt: { mode: 'required' | 'optional' | 'hidden'; placeholder: string; composer: 'plain' };
  /** The song lyrics (job field `lyrics`). requiredFor = models that can't sing without them; models = the models that read the field (the
   *  others get no Lyrics tab and are sent none); instrumental = the models that can make a track with no vocals (the Instrumental switch). */
  lyrics: { mode: 'required' | 'optional' | 'hidden'; placeholder: string; requiredFor: string[]; models: string[]; instrumental: string[] };
  modes: { default: string; whenSlot: null };
  /** Models for the mode (provider ids, quality order), filled from the tool. */ models: Record<string, string[]>;
  locked: Record<string, string>; output: { kind: 'audio' | 'video' | 'audio-or-video'; count: number | 'model' };
  surface: null; generateLabel: string; aliases: { toolId: string; routes: string[] }; status: 'ready' | 'soon'; route: string;
}
type Decl = Omit<AudioWorkflowRecipe, 'name' | 'tagline' | 'needs' | 'models' | 'locked' | 'aliases' | 'route' | 'controls' | 'source' | 'runner' | 'modes' | 'status' | 'surface'> & {
  name: string; tagline: string; controls: Omit<WorkflowControl, 'options' | 'default' | 'min' | 'max' | 'step' | 'pattern' | 'help'>[]; oldRoutes: string[]; source?: Partial<WorkflowSource> };

/** The Audio page: /audio (shared/pages.ts; /tools/audio until 2026-10-31, which redirects with its query kept). */
export { AUDIO_PAGE, OLD_AUDIO_PAGE };
export const audioRoute = (id: AudioWorkflowId) => `${AUDIO_PAGE}?workflow=${id}`;
const OURS = (note: string): WorkflowSource => ({ kind: 'ours', author: 'Imagination Is All You Need', url: null, licence: 'AGPL-3.0', file: null, note });
const slot = (name: string, label: string, required: boolean, hint: string, missing: string, order = 1, sendsAs = name): WorkflowSlot => ({ name, label, required, sendsAs, order, hint, missing });
const ctl = (field: string, label: string, kind: ControlKind, group: string, optional = false) => ({ field, label, kind, group, ...(optional ? { optional: true } : {}) });
const LENGTH: WorkflowGroup = { id: 'length', label: 'Length', icon: 'clock', summary: ['duration'] };
const VOICE_G: WorkflowGroup = { id: 'voice', label: 'Voice', icon: 'voice', summary: ['voice'] };
const MIX_G: WorkflowGroup = { id: 'mix', label: 'Original audio', icon: 'audio', summary: ['mix'] };
const OUT_G = (...summary: string[]): WorkflowGroup => ({ id: 'output', label: 'Output', icon: 'settings', summary });
const VOICE_CTL = [ctl('voice', 'Voice', 'select', 'voice'), ctl('speed', 'Speed', 'slider', 'voice', true), ctl('pitch', 'Pitch', 'slider', 'voice', true), ctl('expression', 'Expression', 'slider', 'voice', true),
  ctl('volume', 'Volume', 'slider', 'voice', true)];
const NO_LYRICS = { mode: 'hidden' as const, placeholder: '', requiredFor: [], models: [], instrumental: [] };
/** Models that can't make a song without lyrics (kept in step with tools/media.ts LYRICS_REQUIRED). */
export const LYRICS_REQUIRED_FOR = ['comfy-yue2'];
/** Music models that read the `lyrics` field (comfy/plans.ts songPlan, Local and its Comfy Cloud twin cloud-minimax-music, + the ACE-Step graph).
 *  Sonilo Text to Music (prompt + duration only) and ByteDance Seed Audio (one text_prompt) take no lyrics input (Comfy docs: built-in-nodes/
 *  SoniloTextToMusic, built-in-nodes/ByteDanceSeedAudio), so they get no Lyrics tab. */
export const LYRICS_MODELS = ['cloud-minimax-music', 'comfy-yue2', 'comfy-minimax-music3', 'comfy-acestep'];
/** Models that can make an instrumental (no vocals) when no lyrics are sent (the graphs then write "[Instrumental]", comfy/plans.ts songPlan, Local and Comfy Cloud):
 *  - MiniMax Music 3 (open weights, Local and Comfy Cloud): `[Instrumental]` is one of its section tags (Comfy docs: tutorials/audio/minimax/minimax-music-3).
 *  - ACE-Step: "you can also input instrument names for purely instrumental music" in the lyrics (Comfy docs: tutorials/audio/ace-step/ace-step-v1).
 *  Not YuE2: it sings lyrics only (LYRICS_REQUIRED_FOR; Comfy docs tutorials/audio/yue2/yue2: a style prompt and lyrics into a song with vocals). */
export const INSTRUMENTAL_MODELS = ['cloud-minimax-music', 'comfy-minimax-music3', 'comfy-acestep'];
const LYRICS = (mode: 'required' | 'optional') => ({ mode, placeholder: 'Write your lyrics here. Use [Verse], [Chorus] and [Bridge] to shape the song.', requiredFor: LYRICS_REQUIRED_FOR,
  models: LYRICS_MODELS, instrumental: mode === 'required' ? [] : INSTRUMENTAL_MODELS });

/** The declarations, in the picker's order (Music is the default). */
const DECLS: Decl[] = [
  { id: 'music', name: 'Music', icon: 'music', category: 'create', tagline: 'A song or a track from a prompt, with lyrics if you like', tool: 'audio', mode: 'music',
    slots: [], groups: [LENGTH], controls: [ctl('duration', 'Length', 'segmented', 'length')],
    prompt: { mode: 'required', placeholder: 'Describe the music: genre, mood, instruments, tempo', composer: 'plain' }, lyrics: LYRICS('optional'),
    output: { kind: 'audio', count: 1 }, generateLabel: 'Make music', oldRoutes: [], source: { note: 'music on any model' } },
  { id: 'sfx', name: 'Sound effects', icon: 'sfx', category: 'create', tagline: 'Any sound from a few words', tool: 'audio', mode: 'sfx',
    slots: [], groups: [LENGTH], controls: [ctl('duration', 'Length', 'segmented', 'length')],
    prompt: { mode: 'required', placeholder: 'Describe the sound: what, where, how close', composer: 'plain' }, lyrics: NO_LYRICS,
    output: { kind: 'audio', count: 1 }, generateLabel: 'Make sound', oldRoutes: [], source: { note: 'sound effects on any model' } },
  { id: 'voiceover', name: 'Voiceover', icon: 'voice', category: 'voice', tagline: 'A voice reads your script, over a clip or on its own', tool: 'voice', mode: 'voiceover',
    slots: [slot('video', 'Clip', false, 'Add a clip to voice over (optional)', 'Add a clip'), slot('voiceAudio', 'Voice sample', false, 'A 5–15 s sample to clone a voice (optional)', 'Add a voice sample', 2)],
    groups: [VOICE_G, MIX_G, OUT_G('n', 'outputFormat')], controls: [...VOICE_CTL, ctl('mix', 'Original audio', 'segmented', 'mix'), ctl('n', 'Takes', 'segmented', 'output'), ctl('outputFormat', 'Format', 'select', 'output', true)],
    prompt: { mode: 'required', placeholder: 'Write the script to read', composer: 'plain' }, lyrics: NO_LYRICS,
    output: { kind: 'audio-or-video', count: 'model' }, generateLabel: 'Make voiceover', oldRoutes: ['/tools/voice'], source: { note: 'text to speech' } },
  { id: 'change-voice', name: 'Change voice', icon: 'voice-change', category: 'voice', tagline: 'Same words and timing, a different voice', tool: 'voice', mode: 'change-voice',
    slots: [slot('video', 'Clip', false, 'A clip with speech', 'Add a clip or an audio file'), slot('audio', 'Audio', false, 'Or an audio file with speech', 'Add a clip or an audio file', 2), slot('voiceAudio', 'Voice sample', false, 'A 5–15 s sample of the new voice (optional)', 'Add a voice sample', 3)],
    oneOf: ['video', 'audio'], groups: [VOICE_G, MIX_G, OUT_G('outputFormat')], controls: [ctl('voice', 'Voice', 'select', 'voice'), ctl('mix', 'Original audio', 'segmented', 'mix'), ctl('outputFormat', 'Format', 'select', 'output', true)],
    prompt: { mode: 'hidden', placeholder: '', composer: 'plain' }, lyrics: NO_LYRICS,
    output: { kind: 'audio-or-video', count: 1 }, generateLabel: 'Change voice', oldRoutes: [], source: { note: 'voice conversion' } },
  { id: 'translate', name: 'Translate', icon: 'translate', category: 'voice', tagline: 'The speech in a clip, re-voiced in another language', tool: 'voice', mode: 'translate',
    slots: [slot('video', 'Clip', true, 'A clip with speech', 'Add a clip'), slot('voiceAudio', 'Voice sample', false, 'A 5–15 s sample of the voice to use (optional)', 'Add a voice sample', 2)],
    groups: [{ id: 'language', label: 'Language', icon: 'translate', summary: ['language'] }, VOICE_G, MIX_G], controls: [ctl('language', 'Target language', 'select', 'language'), ctl('voice', 'Voice', 'select', 'voice'), ctl('mix', 'Original audio', 'segmented', 'mix')],
    prompt: { mode: 'hidden', placeholder: '', composer: 'plain' }, lyrics: NO_LYRICS,
    output: { kind: 'video', count: 1 }, generateLabel: 'Translate', oldRoutes: [], source: { note: 'transcribe, translate, re-voice' } },
  { id: 'soundtrack-music', name: 'Music for a video', icon: 'music-video', category: 'video', tagline: 'A music track made for your clip and mixed onto it', tool: 'soundtrack', mode: 'music',
    slots: [slot('video', 'Clip', true, 'The clip to score', 'Add a clip')], groups: [MIX_G], controls: [ctl('mix', 'Original audio', 'segmented', 'mix')],
    prompt: { mode: 'required', placeholder: 'Describe the music: genre, mood, instruments', composer: 'plain' }, lyrics: LYRICS('optional'),
    output: { kind: 'video', count: 1 }, generateLabel: 'Add music', oldRoutes: ['/tools/soundtrack'], source: { note: 'music matched to the clip length' } },
  { id: 'soundtrack-sound', name: 'Sound for a video', icon: 'sfx-video', category: 'video', tagline: 'Sound that follows what happens on screen', tool: 'soundtrack', mode: 'v2s',
    slots: [slot('video', 'Clip', true, 'The clip to add sound to', 'Add a clip')], groups: [MIX_G], controls: [ctl('mix', 'Original audio', 'segmented', 'mix')],
    prompt: { mode: 'optional', placeholder: 'Describe the sound (optional)', composer: 'plain' }, lyrics: NO_LYRICS,
    output: { kind: 'video', count: 1 }, generateLabel: 'Add sound', oldRoutes: [], source: { note: 'video to sound' } },
  { id: 'cover', name: 'Cover a song', icon: 'cover', category: 'create', tagline: 'Your song with its melody kept, in a new style and words', tool: 'audio', mode: 'cover',
    slots: [slot('audio', 'Song', true, 'The song to cover (MP3, WAV, FLAC)', 'Add a song')], groups: [], controls: [],
    prompt: { mode: 'required', placeholder: 'The new style: genre, voice, instruments, tempo', composer: 'plain' }, lyrics: LYRICS('required'),
    output: { kind: 'audio', count: 1 }, generateLabel: 'Make cover', oldRoutes: [], source: { note: 'melody transcribed, then sung again', kind: 'official', author: 'Comfy Org', url: YUE2_COVER.url, licence: YUE2_COVER.licence, file: YUE2_COVER.file ?? null } },
];
export const AUDIO_WORKFLOW_IDS = DECLS.map((d) => d.id);
export const AUDIO_DEFAULT_WORKFLOW: AudioWorkflowId = 'music';
export const AUDIO_WORKFLOW_CATEGORIES: { id: AudioCategory | 'all'; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'create', label: 'Create' }, { id: 'voice', label: 'Voice' }, { id: 'video', label: 'For a video' }];
export const audioWorkflowById = (id: string) => DECLS.find((d) => d.id === id) ?? null;
/** tool:mode → the workflow that runs it (audio:voice is Voiceover's engine list on the Audio tool; soundtrack:sfx is Sound for a video's prompt variant). */
export const AUDIO_TOOL_MODE: Record<string, AudioWorkflowId> = {
  'audio:music': 'music', 'audio:sfx': 'sfx', 'audio:voice': 'voiceover', 'audio:cover': 'cover', 'voice:voiceover': 'voiceover', 'voice:change-voice': 'change-voice', 'voice:translate': 'translate',
  'soundtrack:music': 'soundtrack-music', 'soundtrack:v2s': 'soundtrack-sound', 'soundtrack:sfx': 'sfx', 'app-music-bed:music': 'soundtrack-music',
};
export const audioWorkflowForToolMode = (toolId: string, mode: string | null): AudioWorkflowId | null => (mode ? AUDIO_TOOL_MODE[`${toolId}:${mode}`] ?? null : null);

// ---------------- redirects ----------------
/** Old Audio URLs → the one Audio page with the workflow picked. Keys are a path, or a path + its mode link (`?mode=`). The voice lip-sync link goes
 *  to Video's Lip Sync workflow (shared/videoWorkflows.ts videoWorkflowHref('lip-sync'), the same URL its videoRedirect gives). Other query parameters (?from=<job>) are kept. */
export const AUDIO_REDIRECTS: Record<string, string> = {
  '/tools/voice': audioRoute('voiceover'), '/tools/voice?mode=voiceover': audioRoute('voiceover'), '/tools/voice?mode=change-voice': audioRoute('change-voice'),
  '/tools/voice?mode=translate': audioRoute('translate'), '/tools/voice?mode=lipsync': videoWorkflowHref('lip-sync'),
  '/tools/soundtrack': audioRoute('soundtrack-music'), '/tools/soundtrack?mode=music': audioRoute('soundtrack-music'), '/tools/soundtrack?mode=v2s': audioRoute('soundtrack-sound'),
  '/tools/soundtrack?mode=sfx': audioRoute('soundtrack-sound'),
  [`${AUDIO_PAGE}?mode=music`]: audioRoute('music'), [`${AUDIO_PAGE}?mode=sfx`]: audioRoute('sfx'), [`${AUDIO_PAGE}?mode=voice`]: audioRoute('voiceover'), [`${AUDIO_PAGE}?mode=cover`]: audioRoute('cover'),
};
/** Path redirects only (for a REDIRECTS map keyed by path, like IMAGE_REDIRECTS). */
export const AUDIO_PATH_REDIRECTS: Record<string, string> = Object.fromEntries(Object.entries(AUDIO_REDIRECTS).filter(([k]) => !k.includes('?')));
/** Where an old Audio URL goes (a mode link first, then the path); null = no redirect. `mode` is consumed, the rest of the query and the hash are kept. */
export function audioRedirectTarget(pathname: string, search = '', hash = ''): string | null {
  const p = (pathname.replace(/\/+$/, '') || '/').toLowerCase(); const q = new URLSearchParams(search.replace(/^\?/, ''));
  /* the old address (/tools/audio, until 2026-10-31) → /audio, its old ?mode= links too; every other param and the hash kept */
  if (p === OLD_AUDIO_PAGE) { const s = search.replace(/^\?/, ''); return audioRedirectTarget(AUDIO_PAGE, s, hash) ?? `${AUDIO_PAGE}${s ? `?${s}` : ''}${hash}`; }
  if (q.has('workflow')) return null; // already on a workflow link
  const mode = q.get('mode'); const to = (mode && AUDIO_REDIRECTS[`${p}?mode=${mode}`]) || AUDIO_REDIRECTS[p]; if (!to) return null;
  q.delete('mode'); const rest = q.toString(); return `${to}${rest ? `${to.includes('?') ? '&' : '?'}${rest}` : ''}${hash}`;
}

// ---------------- payload ----------------
type ToolLike = { id: string; route?: string; providers: (string | { id: string })[]; presets?: { id: string; group?: string }[];
  inputs: { name: string; kind: string; required?: boolean; options?: string[]; default?: string | number; min?: number; max?: number; step?: number; label?: string }[];
  app?: { fields?: { name: string; label?: string; options?: { value: string; label?: string }[]; default?: string }[]; providerModes?: Record<string, string[]>; voiceControls?: Record<string, any> } | null };
const pid = (p: string | { id: string }) => (typeof p === 'string' ? p : p.id);
/** The tool's models for a mode, in its quality order. */
export const audioModelsFor = (t: ToolLike | undefined, mode: string): string[] => (t?.providers ?? []).map(pid).filter((p) => t?.app?.providerModes?.[p]?.includes(mode));
const FORMAT_LABEL: Record<string, string> = { mp3: 'MP3', wav: 'WAV', opus: 'Opus' };
const MIX_LABEL: Record<string, string> = { replace: 'Replace', blend: 'Keep under' };

function needsOf(d: Decl): string {
  if (d.oneOf?.length) return '1 clip or audio file';
  const req = d.slots.filter((s) => s.required); if (req.length) return req.map((s) => `1 ${s.label.toLowerCase()}`).join(' + ');
  return d.slots.some((s) => s.name === 'video') ? 'Clip optional' : 'Prompt';
}
/** A recipe with what the tool knows filled in. */
export function audioRecipeOf(d: Decl, getTool: (id: string) => ToolLike | undefined): AudioWorkflowRecipe {
  const t = getTool(d.tool); const vc = t?.app?.voiceControls ?? {};
  const controls: WorkflowControl[] = d.controls.map((c) => {
    const f = t?.app?.fields?.find((x) => x.name === c.field); const inp = t?.inputs.find((i) => i.name === c.field); const lim = vc[c.field];
    if (f?.options) return { ...c, options: f.options.map((o) => ({ value: String(o.value), label: c.field === 'mix' ? MIX_LABEL[o.value] ?? String(o.label ?? o.value) : String(o.label ?? o.value) })), ...(f.default != null ? { default: String(f.default) } : {}) };
    if (c.field === 'duration' && inp?.options) return { ...c, options: inp.options.map((v) => ({ value: String(v), label: `${v} s` })), ...(inp.default != null ? { default: String(inp.default) } : {}) };
    if (inp?.options) return { ...c, options: inp.options.map((v) => ({ value: String(v), label: FORMAT_LABEL[v] ?? String(v) })), ...(inp.default != null ? { default: String(inp.default) } : {}) };
    const min = lim?.min ?? inp?.min; const max = lim?.max ?? inp?.max; const dv = lim?.default ?? inp?.default;
    return { ...c, ...(min != null ? { min: Number(min) } : {}), ...(max != null ? { max: Number(max) } : {}), ...(lim?.step != null ? { step: Number(lim.step) } : {}), ...(dv != null ? { default: String(dv) } : {}) };
  });
  const { oldRoutes, source: src, ...rest } = d;
  return { ...rest, controls, needs: needsOf(d), source: { ...OURS(src?.note ?? ''), ...src } as WorkflowSource, runner: { kind: 'audio', toolId: d.tool },
    modes: { default: d.mode, whenSlot: null }, models: { [d.mode]: audioModelsFor(t, d.mode) }, locked: { types: JSON.stringify([d.mode]) }, surface: null, status: 'ready',
    route: audioRoute(d.id), aliases: { toolId: d.tool, routes: [...new Set([audioRoute(d.id), ...oldRoutes, ...Object.entries(AUDIO_REDIRECTS).filter(([, v]) => v === audioRoute(d.id)).map(([k]) => k)])] } };
}

/** The graph a model runs for a workflow: our local graphs and the official templates they come from. Hosted models without a recorded
 *  ComfyUI workflow get none (no invented source). */
const official = (g: GridSource) => g;
const CREDITS: Partial<Record<AudioWorkflowId, Record<string, GridSource>>> = {
  music: { 'comfy-yue2': official(YUE2_SONG), 'comfy-minimax-music3': official(MINIMAX_MUSIC3_LOCAL), 'cloud-minimax-music': official(MINIMAX_MUSIC3_LOCAL) /* the same template on Comfy Cloud */ },
  cover: { 'comfy-yue2': official(YUE2_COVER) },
};
const ours = (file: string): GridSource => ({ source: 'ours', name: file, url: null, author: 'Imagination Is All You Need', licence: 'AGPL-3.0 (this repo)', file });
const OUR_GRAPHS: Partial<Record<AudioWorkflowId, Record<string, string>>> = {
  sfx: { 'comfy-stable-audio': 'audio-sfx-api.json' }, voiceover: { 'comfy-chatterbox': 'voice-chatterbox-tts-api.json', 'comfy-drama3': 'voice-drama3-tts-api.json', 'comfy-f5tts': 'voice-f5tts-api.json', 'comfy-qwen3tts': 'voice-qwen3tts-api.json' /* Qwen3 TTS 1.7B (2026-10-27), our graph on flybirdxx/ComfyUI-Qwen-TTS */ },
  'soundtrack-sound': { 'comfy-mmaudio': 'soundtrack-mmaudio-api.json' },
};
/** The credit for one (workflow, model): our recorded list, then the app the workflow replaces (Change Voice, Translate Video, Music Bed). */
export function audioWorkflowCredit(id: AudioWorkflowId, providerId: string): GridSource | null {
  const d = audioWorkflowById(id); if (!d) return null;
  const app = id === 'change-voice' ? 'app-change-voice' : id === 'translate' ? 'app-translate-video' : id === 'soundtrack-music' ? 'soundtrack' : id === 'music' ? 'audio' : null;
  const g = OUR_GRAPHS[id]?.[providerId];
  return CREDITS[id]?.[providerId] ?? (app ? appWorkflowFor(app, providerId) : null) ?? (id === 'soundtrack-music' || id === 'music' ? appWorkflowFor('app-music-bed', providerId) : null) ?? (g ? ours(g) : null);
}
const lineOf = (w: GridSource) => `${w.source === 'official' ? 'Official Comfy template' : w.source === 'community' ? `Community workflow by ${w.author}` : 'Built-in workflow'}: ${w.name}`;

/** GET /api/audio-workflows: every recipe, plus per model its real name and the workflow it runs (the strip's credit). */
export function audioWorkflowsPayload(getTool: (id: string) => ToolLike | undefined) {
  return {
    categories: AUDIO_WORKFLOW_CATEGORIES, default: AUDIO_DEFAULT_WORKFLOW, redirects: AUDIO_REDIRECTS,
    workflows: DECLS.map((d) => { const r = audioRecipeOf(d, getTool); const ids = r.models[r.mode] ?? [];
      return { ...r, modelInfo: Object.fromEntries(ids.map((p) => { const k = engineModelKey(d.tool, p); const w = audioWorkflowCredit(d.id, p);
        return [p, { name: (k && MODELS[k]?.name) || null, workflow: w ? { line: lineOf(w), url: w.url ?? null, source: w.source } : null }]; })) }; }),
  };
}

/** Boot check: each recipe and the tool that runs it agree (mode, slots, controls, models). */
export function validateAudioWorkflows(getTool: (id: string) => ToolLike | undefined): string[] {
  const errs: string[] = [];
  for (const d of DECLS) {
    const at = (m: string) => errs.push(`${d.id}: ${m}`); const t = getTool(d.tool); if (!t) { at(`tool ${d.tool} is not registered`); continue; }
    if (t.presets && !t.presets.some((p) => p.id === d.mode)) at(`mode ${d.mode} is not a mode of ${d.tool}`);
    if (!audioModelsFor(t, d.mode).length) at(`no models for ${d.tool}:${d.mode}`);
    const inputs = new Map(t.inputs.map((i) => [i.name, i]));
    for (const s of d.slots) { const i = inputs.get(s.sendsAs); if (!i) at(`slot ${s.name} sends ${s.sendsAs}, which ${d.tool} doesn't take`); else if (!/^files?$/.test(i.kind)) at(`slot ${s.name} → ${s.sendsAs} is a ${i.kind}, not a file`); }
    for (const c of d.controls) { if (!inputs.has(c.field)) at(`control ${c.field} has no field on ${d.tool}`); if (!d.groups.some((g) => g.id === c.group)) at(`control ${c.field} is in unknown group ${c.group}`); }
    for (const g of d.groups) for (const s of g.summary) if (!d.controls.some((c) => c.field === s)) at(`group ${g.id} summarises unknown field ${s}`);
    if (d.lyrics.mode !== 'hidden' && !inputs.has('lyrics')) at(`${d.tool} takes no lyrics`);
    if (AUDIO_TOOL_MODE[`${d.tool}:${d.mode}`] !== d.id) at(`AUDIO_TOOL_MODE doesn't map ${d.tool}:${d.mode} to ${d.id}`);
  }
  const dup = AUDIO_WORKFLOW_IDS.filter((x, i) => AUDIO_WORKFLOW_IDS.indexOf(x) !== i); if (dup.length) errs.push(`duplicate recipe ids: ${dup.join(', ')}`);
  return errs;
}
