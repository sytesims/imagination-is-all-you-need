/**
 * Model identity, separate from where it runs (2026-10-21). Isomorphic: no imports, so the web can import it later.
 *
 *  - A MODEL is what you get ("MiniMax H3", "LTX-2 19B"). Its key is stable, human-readable and never reused.
 *  - An ENGINE is today's provider id (providers.ts: comfy-h3, cloud-h3-wf, api-minimax-h3, comfy-open, …): one way the job is built.
 *    Engine ids stay accepted everywhere (requests, deep links, pins, jobs); they are aliases of a model, per tool.
 *  - RUN ON is the account that runs and bills a route: local (this computer), comfy-cloud, fal, replicate, or a vendor's direct API.
 *
 * Routes and prices are NOT duplicated here: routes live in routing/routes.ts (route ids unchanged), prices in shared/hostedPrices.ts and
 * routing/routePrices.ts. routing/modelRegistry.ts joins this table with the live route registry.
 */

/** Where a route runs and who bills it (one per account, not per endpoint). */
export type RunOn = 'local' | 'comfy-cloud' | 'fal' | 'replicate' | 'bfl' | 'minimax' | 'ltx' | 'openai' | 'google' | 'byteplus' | 'dashscope' | 'luma' | 'direct';
export const RUN_ON_IDS: readonly RunOn[] = ['local', 'comfy-cloud', 'fal', 'replicate', 'bfl', 'minimax', 'ltx', 'openai', 'google', 'byteplus', 'dashscope', 'luma', 'direct'];
/** The one user-facing name of the local place (this computer's ComfyUI), used by server and web: the Run on chip, tabs, price lines.
 *  The id stays `local` (and the `gpu` group / #gpu anchor); only these words show. */
export const LOCAL_LABEL = 'Your computer';
/** The one line for a model whose files need an NVIDIA card (copy wave 1): used by the run-on menus, errors and model notes on server and web. */
export const NEEDS_NVIDIA = 'Needs an NVIDIA graphics card';
/** The price token of a local run ("Free · on your computer"; prices in dollars, 2026-10-26). */
export const LOCAL_FREE = 'Free · on your computer';
/** User-facing labels (MODEL-ROUTE-SPEC §2.1; Run on 2026-10-22: Comfy Cloud and Comfy Router are one place, "Comfy Cloud" in the UI; only the model info card names Router). */
export const RUN_ON_LABELS: Record<RunOn, string> = { local: LOCAL_LABEL, 'comfy-cloud': 'Comfy Cloud', fal: 'fal', replicate: 'Replicate', bfl: 'Black Forest Labs', minimax: 'MiniMax', ltx: 'LTX', openai: 'OpenAI', google: 'Google', byteplus: 'BytePlus', dashscope: 'Alibaba Cloud', luma: 'Luma AI', direct: 'Direct API' };
/** H3 runner Step 1: the Comfy detail line of a route on the user's own Comfy deployment (route id comfy-deploy:<engine>; Run on stays "Comfy"). */
export const COMFY_DEPLOY_DETAIL = 'Your Comfy deployment';
/** Who bills each run-on (billing.ts PROVIDER_BILLING ids). */
export const RUN_ON_BILLED_TO: Record<RunOn, string> = { local: 'local', 'comfy-cloud': 'comfy', fal: 'fal', replicate: 'replicate', bfl: 'bfl', minimax: 'minimax', ltx: 'ltx', openai: 'openai', google: 'google', byteplus: 'byteplus', dashscope: 'dashscope', luma: 'luma', direct: 'direct' };
/** Accepted spellings (spec ids, route kinds, billing ids) → RunOn. */
const RUN_ON_ALIASES: Record<string, RunOn | 'auto'> = {
  auto: 'auto', gpu: 'local', 'your-gpu': 'local', local: 'local', comfy: 'comfy-cloud', 'comfy-cloud': 'comfy-cloud', 'comfy-router': 'comfy-cloud', 'comfy-deploy': 'comfy-cloud', comfycloud: 'comfy-cloud',
  fal: 'fal', replicate: 'replicate', bfl: 'bfl', 'black-forest-labs': 'bfl', minimax: 'minimax', ltx: 'ltx', lightricks: 'ltx', openai: 'openai', google: 'google', gemini: 'google', 'gemini-api': 'google', byteplus: 'byteplus', ark: 'byteplus', modelark: 'byteplus', dashscope: 'dashscope', alibaba: 'dashscope', 'alibaba-cloud': 'dashscope', luma: 'luma', direct: 'direct',
};
/** 'auto' | a RunOn | null (unknown). Case- and underscore-insensitive. */
/** "an LTX key", "an OpenAI key"; "a … key" otherwise. */
export const aKey = (name: string) => `${/^(LTX|OpenAI)\b/.test(name) ? 'an' : 'a'} ${name} key`;
export const normRunOn = (v: unknown): RunOn | 'auto' | null => (typeof v === 'string' && v.trim() ? RUN_ON_ALIASES[v.trim().toLowerCase().replace(/_/g, '-')] ?? null : null);
/** Run-on of a route: its explicit `vendor` (direct routes), else from its kind and key env var (the vendor that owns the key; fallback only). */
export function runOnOfRoute(r: { kind: string; envKey?: string | null; vendor?: string | null }): RunOn {
  if (r.vendor && (RUN_ON_IDS as readonly string[]).includes(r.vendor)) return r.vendor as RunOn;
  if (r.kind === 'local') return 'local';
  if (r.kind === 'comfy-cloud' || r.kind === 'comfy-router') return 'comfy-cloud';
  if (r.kind === 'fal' || r.kind === 'replicate') return r.kind;
  const k = r.envKey ?? '';
  return /BFL/.test(k) ? 'bfl' : /MINIMAX/.test(k) ? 'minimax' : /LTX/.test(k) ? 'ltx' : /OPENAI/.test(k) ? 'openai' : /GEMINI/.test(k) ? 'google' : /_ARK_/.test(k) ? 'byteplus' : /DASHSCOPE/.test(k) ? 'dashscope' : /LUMA/.test(k) ? 'luma' : /FAL/.test(k) ? 'fal' : /REPLICATE/.test(k) ? 'replicate' : /COMFY/.test(k) ? 'comfy-cloud' : 'direct';
}
/** Run-on from a bare route id (old jobs / spend rows): `<kind>:<id>`. Direct ids need the route registry for the vendor; this is the fallback. */
export const runOnOfRouteId = (routeId?: string | null): RunOn | null => {
  if (!routeId) return null; const kind = routeId.split(':')[0];
  return kind === 'direct' ? (/bfl|flux/i.test(routeId) ? 'bfl' : /minimax/i.test(routeId) ? 'minimax' : /ltx/i.test(routeId) ? 'ltx' : /^direct:(openai\/|direct-openai)/i.test(routeId) ? 'openai' : /^direct:(google\/|direct-gemini)/i.test(routeId) ? 'google' : /^direct:(byteplus\/|direct-seed|direct-byteplus)/i.test(routeId) ? 'byteplus' : /qwen3-tts|dashscope/i.test(routeId) ? 'dashscope' : /luma/i.test(routeId) ? 'luma' : 'direct')
    : RUN_ON_IDS.includes(kind as RunOn) || kind === 'comfy-router' || kind === 'comfy-deploy' ? runOnOfRoute({ kind: kind === 'comfy-deploy' ? 'comfy-cloud' : kind }) : null;
};

/**
 * Where a run happens, in the same words everywhere (setups-routing 2026-10-29: the model picker, the price line, the hover card, the Models
 * page, result details, Spend and the Workflows sheets all read this one helper). Run on (RunOn) stays the one-key grouping for routing; the
 * place splits the Comfy key into what it really runs on, because they bill differently:
 *  Your computer (free) · Comfy Cloud (a workflow on Comfy's GPUs, billed by GPU time, so an estimate) · Comfy Router (a partner model through
 *  the Comfy key, at a set price) · Comfy deployment (your own deployment, GPU time) · fal / Replicate / a lab's own API (needs that key).
 */
export type PlaceId = 'local' | 'comfy-cloud' | 'comfy-router' | 'comfy-deploy' | Exclude<RunOn, 'local' | 'comfy-cloud'>;
export type PlaceBilling = 'free' | 'gpu-time' | 'set-price';
export interface Place { id: PlaceId; label: string; billing: PlaceBilling; /** short, for a chip or a price line */ short: string; /** one sentence, for a hover card or details */ note: string }
export const PLACE_LABELS = { local: LOCAL_LABEL, 'comfy-cloud': 'Comfy Cloud', 'comfy-router': 'Comfy Router', 'comfy-deploy': 'Comfy deployment' } as const;
const PLACE_SHORT: Record<PlaceBilling, string> = { free: 'free', 'gpu-time': 'GPU time, estimate', 'set-price': 'set price' };
/** The place of a route, a route id, or a job/quote that carries one (kind, routeId or route, vendor/envKey; comfyVariant 'partner' | 'workflow' | 'deployment' when known). */
export function placeOf(x: { kind?: string | null; routeId?: string | null; route?: string | null; runOn?: string | null; envKey?: string | null; vendor?: string | null; comfyVariant?: string | null } | null | undefined): Place | null {
  if (!x) return null; const rid = String(x.routeId ?? x.route ?? ''); const kind = x.kind ?? (rid.includes(':') ? rid.split(':')[0] : null);
  const mk = (id: PlaceId, label: string, billing: PlaceBilling, note: string): Place => ({ id, label, billing, short: PLACE_SHORT[billing], note });
  if (kind === 'comfy-deploy' || rid.startsWith('comfy-deploy:') || x.comfyVariant === 'deployment') return mk('comfy-deploy', PLACE_LABELS['comfy-deploy'], 'gpu-time', 'Your own Comfy deployment, billed by GPU time, so the price is an estimate.');
  if (kind === 'local' || (!kind && x.runOn === 'local')) return mk('local', LOCAL_LABEL, 'free', 'Runs on your computer. Free.');
  if (kind === 'comfy-router') return mk('comfy-router', PLACE_LABELS['comfy-router'], 'set-price', 'A partner model through your Comfy key, at a set price.');
  if (kind === 'comfy-cloud') return x.comfyVariant === 'partner' ? mk('comfy-cloud', PLACE_LABELS['comfy-cloud'], 'set-price', 'A partner node on Comfy Cloud through your Comfy key, at a set price.')
    : mk('comfy-cloud', PLACE_LABELS['comfy-cloud'], 'gpu-time', 'A workflow on Comfy’s GPUs, billed by GPU time, so the price is an estimate.');
  const ro = kind ? runOnOfRoute({ kind, envKey: x.envKey, vendor: x.vendor }) : x.runOn ? normRunOn(x.runOn) : null;
  if (!ro || ro === 'auto') return null;
  if (ro === 'local') return mk('local', LOCAL_LABEL, 'free', 'Runs on your computer. Free.');
  if (ro === 'comfy-cloud') return mk('comfy-cloud', PLACE_LABELS['comfy-cloud'], 'gpu-time', 'Through your Comfy key.');
  const label = RUN_ON_LABELS[ro]; return mk(ro as PlaceId, label, 'set-price', `Through ${aKey(label)}, billed by ${label}.`);
}
/** "Comfy Router · set price", "Your computer · free": the label with its billing word, one line. */
export const placeLine = (p: Place | null | undefined) => (p ? `${p.label} · ${p.short}` : '');

export type Medium = 'image' | 'video' | 'audio';
export interface ModelDef {
  key: string;
  /** Clean display name: never a route, an account or "API". */
  name: string;
  family: string;
  medium: Medium;
  /** Open weights (licence badge): you can run it locally. */
  openWeights: boolean;
  /** Licence id (licenses.ts LICENSES); hosted models are 'proprietary'; null = the licence of the engine's own workflow (providerLicense). */
  license: string | null;
  /** Key into shared/modelCatalog.ts MODEL_CATALOG for the one-line blurb (`<toolId>:<engine>` or `<engine>`). */
  blurbKey: string;
  /** Key into shared/lifecycle.ts LIFECYCLE (retiring etc.), when the model has one. */
  lifecycleKey?: string;
  /** What the model really is when the name alone is ambiguous (e.g. a LoRA recipe on a base model). */
  note?: string;
  /** Official source for the identity (used by the honesty checks). */
  sourceUrl?: string;
  /** Maker key (MAKERS): who built the model (not where it runs). Filled from MODEL_MAKER. */
  maker?: string;
}
const m = (key: string, name: string, family: string, medium: Medium, openWeights: boolean, license: string | null, blurbKey: string, extra: Partial<ModelDef> = {}): ModelDef =>
  ({ key, name, family, medium, openWeights, license, blurbKey, ...extra });
const P = 'proprietary';


/** Who makes a model (accurate to the model cards / official org pages). Display only: names and logos are trademarks of their owners (ASSETS-CREDITS.md). */
export const MAKERS: Record<string, { name: string }> = {
  'alibaba-qwen': { name: 'Alibaba Qwen' }, 'alibaba-wan': { name: 'Alibaba Wan' }, tongyi: { name: 'Tongyi-MAI' }, bfl: { name: 'Black Forest Labs' }, google: { name: 'Google' },
  openai: { name: 'OpenAI' }, bytedance: { name: 'ByteDance' }, kling: { name: 'Kuaishou Kling' }, minimax: { name: 'MiniMax' }, lightricks: { name: 'Lightricks' },
  ideogram: { name: 'Ideogram' }, recraft: { name: 'Recraft' }, luma: { name: 'Luma AI' }, krea: { name: 'Krea' }, runway: { name: 'Runway' }, xai: { name: 'xAI' },
  'tencent-hunyuan': { name: 'Tencent Hunyuan' }, meta: { name: 'Meta' }, openmoss: { name: 'OpenMOSS' }, openhiggsfield: { name: 'Imagination Is All You Need' }, bria: { name: 'Bria' },
  'real-esrgan': { name: 'Tencent ARC' }, ultrasharp: { name: 'Kim2091' }, rife: { name: 'RIFE authors' }, 'depth-anything': { name: 'Depth Anything team' }, birefnet: { name: 'BiRefNet authors' },
  ffmpeg: { name: 'FFmpeg' }, clarity: { name: 'Clarity AI' }, topaz: { name: 'Topaz Labs' }, phhofm: { name: 'Philip Hofmann (Phhofm)' }, sonilo: { name: 'Sonilo' }, 'ace-step': { name: 'ACE Studio & StepFun' }, stability: { name: 'Stability AI' }, mmaudio: { name: 'MMAudio authors' },
  elevenlabs: { name: 'ElevenLabs' }, 'm-a-p': { name: 'M-A-P & HKUST' }, 'fish-audio': { name: 'Fish Audio' }, heygen: { name: 'HeyGen' }, resemble: { name: 'Resemble AI' }, swivid: { name: 'SWivid' }, meigen: { name: 'MeiGen-AI' },
  // 2026-10-24: makers of the photo-app and 3D models (every registry model has a maker; test: maker-tiles.test.ts)
  fal: { name: 'fal' }, fashn: { name: 'FASHN AI' }, tripo: { name: 'Tripo AI (VAST)' }, microsoft: { name: 'Microsoft' }, pixal3d: { name: 'Pixal3D authors' }, comfy: { name: 'Comfy Org' }, pruna: { name: 'Pruna AI' } /* P-Video-2, 2026-10-31 */, meshy: { name: 'Meshy' }, rodin: { name: 'Hyper3D Rodin (Deemos)' },
};
export const MODEL_MAKER: Record<string, string> = {
  'minimax-h3': 'minimax', 'minimax-h3-fast': 'minimax' /* MiniMax H3, distilled by the FastVideo team (credited on the model) */, 'minimax-h3-camera-motion': 'minimax', 'minimax-h3-talking-photo': 'minimax', 'ltx-2.5-talking-photo': 'lightricks', 'infinitetalk-wan-2.1': 'meigen', 'minimax-h3-extend': 'minimax', 'minimax-h3-max-extend': 'minimax',
  'minimax-h3-character-swap': 'minimax', 'minimax-h3-crossview': 'minimax', 'minimax-h3-style-transfer': 'minimax', 'minimax-h3-vfx-edit': 'minimax', 'minimax-music-3': 'minimax', 'minimax-speech-2.8-hd': 'minimax',
  'ltx-2-19b': 'lightricks', 'wan-2.2-fun-camera-14b': 'alibaba-wan', 'wan-2.2-animate-14b': 'alibaba-wan', 'wan-2.1-vace-14b': 'alibaba-wan', 'wan-2.2-i2v-14b': 'alibaba-wan', 'wan-2.2-ti2v-5b': 'alibaba-wan', 'ltx-2.5-22b': 'lightricks', 'wan-image-2.5': 'alibaba-wan',
  'seedance-2.0': 'bytedance', 'seedream-5.0-pro': 'bytedance', 'seed-audio': 'bytedance', seedvr2: 'bytedance', 'veo-3.1': 'google', 'nano-banana-2': 'google',
  'kling-v3-omni-edit': 'kling', 'seedance-2.5-edit': 'bytedance', // Video Swap cloud edits (2026-10-25)
  'runway-aleph-2': 'runway', 'luma-ray-3.2-edit': 'luma', // Render (Direct a Shot step 3) cloud edits (2026-10-26)
  'kling-v3': 'kling', 'wan-3.0': 'alibaba-wan', 'kling-image-o1': 'kling', 'flux-3-upscaler': 'bfl', 'flux-2-pro': 'bfl', 'flux-2-flex': 'bfl', 'flux-2-klein-4b': 'bfl', 'flux-3-klein': 'bfl', 'flux-2-dev': 'bfl',
  birefnet: 'birefnet', 'bria-video-background-removal': 'bria', 'luma-ray-2-reframe': 'luma', 'luma-image': 'luma', 'rife-4.9': 'rife', 'depth-anything-v2-small': 'depth-anything', 'ffmpeg-hdr10': 'ffmpeg',
  'gpt-image': 'openai', 'gpt-image-2.5-flare': 'openai', 'gpt-image-2.5-sunburst': 'openai', 'nano-banana-2.1': 'google', 'nano-banana-pro': 'google', 'flux-3-image': 'bfl', 'flux-2-max': 'bfl', 'flux-3-video': 'bfl', 'flux-2-klein-9b': 'bfl', 'ltx-2.5-pro': 'lightricks', 'ltx-2.5-fast': 'lightricks', 'ltx-2.3-fast': 'lightricks', 'minimax-image-01': 'minimax', 'minimax-speech-2.8-turbo': 'minimax',
  'nano-banana-2-lite': 'google', 'gpt-image-1.5': 'openai', 'seedream-4.5': 'bytedance', 'grok-imagine-image-pro': 'xai', 'fibo-2.0': 'bria', 'seedance-2.0-fast': 'bytedance', 'seedance-2.0-mini': 'bytedance', 'seedance-2.5': 'bytedance', 'veo-3.1-fast': 'google', 'veo-3.1-lite': 'google', 'wan-3.0-prime': 'alibaba-wan', 'p-video-2': 'pruna', 'grok-imagine-video-1.5-lite': 'xai', // 2026-10-31
  'seedream-5.0-flash': 'bytedance', 'ideogram-4.5': 'ideogram', 'qwen-image-3-pro': 'alibaba-qwen', 'recraft-v4.1': 'recraft', 'recraft-v4.1-pro': 'recraft', 'luma-uni-1-max': 'luma', 'ideogram-v4': 'ideogram', 'recraft-v4': 'recraft', krea: 'krea', 'runway-gen4-image': 'runway', 'grok-imagine-image': 'xai', 'hunyuan-image-3.5': 'tencent-hunyuan', 'meta-muse-image': 'meta',
  'qwen-image-3': 'alibaba-qwen', 'qwen-image-2.1': 'alibaba-qwen', 'qwen-image-2.1-turbo': 'alibaba-qwen', 'qwen-image': 'alibaba-qwen', 'qwen-image-edit-2509': 'alibaba-qwen', 'qwen-image-edit-2509-angles': 'alibaba-qwen', 'qwen3-tts': 'alibaba-qwen',
  'z-image-turbo': 'tongyi', 'z-image': 'tongyi', 'moss-image': 'openmoss', 'moss-image-base': 'openmoss', opensoul: 'openhiggsfield', 'real-esrgan': 'real-esrgan', '4x-ultrasharp': 'ultrasharp', 'real-esrgan-x2-video': 'real-esrgan', '4x-ultrasharp-video': 'ultrasharp', 'seedvr2-3b-video': 'bytedance', 'topaz-starlight-fast': 'topaz', 'topaz-starlight-precise-2.5': 'topaz', 'topaz-astra-2': 'topaz', 'topaz-starlight-creative': 'topaz', 'crystal-video-upscaler': 'clarity',
  'seedvr2-image': 'bytedance', 'seedvr2-3b-image': 'bytedance', 'crystal-upscaler': 'clarity', 'topaz-wonder-3.5': 'topaz', 'topaz-standard-v2': 'topaz', 'z-image-turbo-2k-upscaler': 'tongyi', '4x-nomos2': 'phhofm', 'topaz-bloom-2': 'topaz', 'bria-increase-resolution': 'bria', 'bria-genfill': 'bria',
  'sonilo-music': 'sonilo', 'sonilo-video-to-music': 'sonilo', 'ace-step-1.5': 'ace-step', yue2: 'm-a-p', 'stable-audio-open-1.0': 'stability', mmaudio: 'mmaudio', 'elevenlabs-sound-effects': 'elevenlabs', 'elevenlabs-v4': 'elevenlabs', 'elevenlabs-v3': 'elevenlabs', 'elevenlabs-v4-turbo': 'elevenlabs',
  'fish-audio-s2.1-pro': 'fish-audio', 'fish-audio-drama-3': 'fish-audio', 'heygen-voice': 'heygen', chatterbox: 'resemble', 'chatterbox-voice-changer': 'resemble', 'translate-chatterbox': 'resemble',
  'f5-tts': 'swivid', 'translate-f5-tts': 'swivid',
  'qwen-image-layered': 'alibaba-qwen', 'seedream-5.0-flash-layers': 'bytedance', 'seedream-5.0-pro-layers': 'bytedance',
  'bria-rmbg-2.0': 'bria', 'ideogram-remove-background': 'ideogram', 'bria-expand': 'bria', 'ideogram-3-reframe': 'ideogram', 'bria-eraser': 'bria', 'fal-object-removal': 'fal', 'fashn-tryon-1.6': 'fashn',
  // 3D (shared/threeD.ts THREE_D_MODELS carries the same maker keys) and our own in-browser Turntable recorder
  'cloud-tripo-31': 'tripo', 'fal-trellis2': 'microsoft', 'fal-hunyuan3d-31': 'tencent-hunyuan', 'comfy-pixal3d-trellis2': 'pixal3d', 'local-turntable': 'openhiggsfield', 'local-previz': 'openhiggsfield' /* Direct a Shot: drawn in the browser, our own renderer */, 'local-finish': 'openhiggsfield' /* Finish: our own ffmpeg looks */, 'comfy-ltx25-layout': 'lightricks' /* Render: LTX-2.5 + Layout to Render */, 'cloud-ltx25-layout': 'lightricks' /* its Comfy Cloud place */, 'cloud-ltx23-vfx': 'lightricks' /* Footage Effects · Comfy Cloud: LTX-2.3 templates */, 'comfy-ltx25-iclora': 'lightricks' /* Footage Effects: LTX-2.5 + Lightricks IC-LoRAs */,
};
/** Maker of a model key (null when unknown, e.g. a derived model). */
export const makerOf = (modelKey: string): { key: string; name: string } | null => { const k = MODEL_MAKER[modelKey]; return k && MAKERS[k] ? { key: k, name: MAKERS[k].name } : null; };

export const MODELS: Record<string, ModelDef> = Object.fromEntries([
  // ---- Video ----
  m('minimax-h3', 'MiniMax H3', 'MiniMax', 'video', true, 'minimax-community', 'comfy-h3', { note: 'One model on every run-on. The Comfy partner nodes MinimaxHailuo03*Node are MiniMax H3 (display "MiniMax H3 Text to Video", model id MiniMax-H3); "Hailuo03" is only their class name.',
    sourceUrl: 'https://github.com/comfyanonymous/ComfyUI/blob/master/comfy_api_nodes/nodes_minimax.py' }),
  m('minimax-h3-fast', 'MiniMax H3 Fast', 'MiniMax', 'video', true, 'minimax-community', 'cloud-h3-fast', { note: 'FastVideo FastH3 8-Step V2: MiniMax H3 distilled (DMD2) to 8 steps by the FastVideo team, repacked by Comfy-Org (FastVideo/FastVideo-FastH3-Comfy). Comfy Cloud, official Comfy templates.',
    sourceUrl: 'https://huggingface.co/FastVideo/FastVideo-FastH3-8-Step-V2' }),
  m('minimax-h3-camera-motion', 'H3 Camera Motion', 'MiniMax', 'video', true, 'minimax-community', 'comfy-h3-camera', { note: 'MiniMax H3 + camera_motion_h3 LoRA locally; on fal, MiniMax H3 image-to-video with the move in the prompt (no LoRA).' }),
  m('minimax-h3-talking-photo', 'H3 Talking Photo', 'MiniMax', 'video', true, 'minimax-community', 'comfy-h3-lipsync', { note: 'MiniMax H3 lip-sync recipe (reference-to-video with a speech clip).' }),
  m('minimax-h3-extend', 'H3 Extend', 'MiniMax', 'video', true, 'minimax-community', 'comfy-h3-extend', { note: 'MiniMax H3 continuation graph (local).' }),
  m('minimax-h3-max-extend', 'H3 Max Extend', 'MiniMax', 'video', false, P, 'comfy-h3-extend', { note: 'MiniMax H3 Max extend-video on fal: a different (hosted) MiniMax model from the open H3 the local graph runs.', sourceUrl: 'https://fal.ai/models/minimax/h3-max/extend-video' }),
  m('minimax-h3-character-swap', 'H3 Character Swap', 'MiniMax', 'video', true, 'minimax-community-akatz-charswap', 'comfy-h3-charswap', { note: 'MiniMax H3 Ref2VA + H3 Character Swap LoRA v1.5.' }),
  m('minimax-h3-crossview', 'New angle · H3 CrossView · cloud', 'MiniMax', 'video', true, 'minimax-community', 'cloud-h3-crossview', { note: 'MiniMax H3 Ref2VA + CrossView-Warp v1 LoRA (Cseti) guided by a MoGe-2 depth warp: Comfy’s Reshoot recipe, on your own Comfy deployment.', sourceUrl: 'https://github.com/Comfy-Org/comfy-reshoot' }),
  m('minimax-h3-style-transfer', 'H3 Style Transfer', 'MiniMax', 'video', true, 'minimax-community', 'comfy-h3-restyle', { note: 'MiniMax H3 + style_transfer LoRA.' }),
  m('minimax-h3-vfx-edit', 'H3 VFX Edit', 'MiniMax', 'video', true, 'minimax-community', 'comfy-h3-vfx', { note: 'MiniMax H3 + vfx_edit LoRA.' }),
  m('ltx-2-19b', 'LTX-2 19B', 'LTX', 'video', true, 'ltx-2-community', 'cinema:comfy-open', { sourceUrl: 'https://huggingface.co/Lightricks/LTX-2' }),
  m('wan-2.2-fun-camera-14b', 'Wan 2.2 Fun Camera 14B', 'Wan', 'video', true, 'apache-2.0', 'comfy-funcamera'),
  m('wan-2.2-animate-14b', 'Wan 2.2 Animate 14B', 'Wan', 'video', true, 'apache-2.0', 'object-swap:comfy-open'),
  m('wan-2.1-vace-14b', 'Wan 2.1 VACE 14B', 'Wan', 'video', true, 'apache-2.0', 'restyle:comfy-open'),
  m('wan-2.2-i2v-14b', 'Wan 2.2 I2V 14B', 'Wan', 'video', true, 'apache-2.0', 'photo-fx:comfy-open'),
  m('infinitetalk-wan-2.1', 'InfiniteTalk (Wan 2.1)', 'Wan', 'video', true, 'apache-2.0', 'cloud-infinitetalk', { note: 'InfiniteTalk (MeiGen-AI) on Wan 2.1 I2V 14B 480p with the lightx2v step-distill LoRA: a photo plus up to 60 s of speech into a talking video, the official Comfy template video_wan2_1_infinitetalk run on Comfy Cloud.', sourceUrl: 'https://github.com/MeiGen-AI/InfiniteTalk' }),
  m('ltx-2.5-talking-photo', 'LTX-2.5 Talking Photo', 'LTX', 'video', true, 'ltx-2x-community', 'comfy-ltx25-lipsync', { note: 'LTX-2.5 22B distilled (Lightricks), local only: a photo (or text) plus a speech clip into a talking clip; the audio-to-video path of Lightricks\' LTX-2.5 A2V example with the QuokkaiLab lip driver (sducly) made by our server.', sourceUrl: 'https://github.com/Lightricks/ComfyUI-LTXVideo/tree/master/example_workflows/2.5' }),
  m('ltx-2.5-22b', 'LTX-2.5 22B', 'LTX', 'video', true, 'ltx-2x-community', 'comfy-ltx25-video', { note: 'LTX-2.5 22B distilled (Lightricks), local only: text, image and first + last frame to video with its own sound (official Comfy templates video_ltx2_5_i2v / video_ltx2_5_flf2v; GGUF Q4_K_M by Unsloth).', sourceUrl: 'https://huggingface.co/Lightricks/LTX-2.5' }),
  m('wan-2.2-ti2v-5b', 'Wan 2.2 5B', 'Wan', 'video', true, 'apache-2.0', 'comfy-wan22-5b', { note: 'Wan2.2-TI2V-5B: one 5B model for text to video and image to video, local only (official Comfy template video_wan2_2_5B_ti2v).', sourceUrl: 'https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B' }),
  m('seedance-2.0', 'Seedance', 'Seedance', 'video', false, P, 'router-seedance', { note: 'ByteDance Seedance 2.0 (Comfy partner node).' }),
  m('veo-3.1', 'Veo', 'Veo', 'video', false, P, 'router-veo', { lifecycleKey: 'router-veo', note: 'Google Veo 3.1 (Comfy partner node).' }),
  m('veo-3.1-fast', 'Veo 3.1 Fast', 'Veo', 'video', false, P, 'router-veo-fast', { note: 'Google veo-3.1-fast-generate-001 on Comfy Router.', sourceUrl: 'https://docs.comfy.org/development/comfy-router/models/veo/veo-3-1-fast-generate-001/code' }),
  m('kling-v3', 'Kling', 'Kling', 'video', false, P, 'router-kling', { note: 'Kling 3.0 Omni (kling/kling-v3-omni on Comfy Router, 2026-10-25): text, first / end frame or reference images.', sourceUrl: 'https://docs.comfy.org/development/comfy-router/models/kling/kling-v3-omni/code' }),
  m('kling-v3-omni-edit', 'Kling 3.0 Omni Edit', 'Kling', 'video', false, P, 'router-kling-edit', { note: 'Kling 3.0 Omni video edit (kling/kling-v3-omni, video_list refer_type base, on Comfy Router, 2026-10-25): person swap from one character image.', sourceUrl: 'https://docs.comfy.org/development/comfy-router/models/kling/kling-v3-omni/code' }),
  m('seedance-2.5-edit', 'Seedance 2.5 Edit', 'Seedance', 'video', false, P, 'router-seedance-25-edit', { note: 'Seedance 2.5 video edit (byteplus/dreamina-seedance-2-5-260628, reference video + image, duration -1, on Comfy Router, 2026-10-25).', sourceUrl: 'https://docs.comfy.org/development/comfy-router/models/byteplus/dreamina-seedance-2-5-260628/code' }),
  m('runway-aleph-2', 'Runway Aleph 2', 'Runway', 'video', false, P, 'router-aleph2', { note: 'Runway Aleph 2 video to video (runway/aleph2 on Comfy Router, 2026-10-26): Render turns a Direct a Shot mockup into real video; an optional first frame goes in promptImage position first.', sourceUrl: 'https://docs.comfy.org/development/comfy-router/models/runway/aleph2/code' }),
  m('luma-ray-3.2-edit', 'Luma Ray 3.2 Edit', 'Luma', 'video', false, P, 'router-ray32-edit', { note: 'Luma Ray 3.2 video edit (luma_2/ray-3.2, type video_edit, strength adhere_1, on Comfy Router, 2026-10-26): Render keeps the mockup’s structure and motion.', sourceUrl: 'https://docs.comfy.org/development/comfy-router/models/luma_2/ray-3-2/code' }),
  m('wan-3.0', 'Wan 3.0', 'Wan', 'video', false, P, 'router-wan3', { note: 'Alibaba wan3.0-video on Comfy Router (2026-10-25).', sourceUrl: 'https://docs.comfy.org/development/comfy-router/models/wan/wan3-0-video/code' }),
  // Comfy Router video models (2026-10-31)
  m('veo-3.1-lite', 'Veo 3.1 Lite', 'Veo', 'video', false, P, 'router-veo-lite', { note: 'Google veo-3.1-lite-generate-001 on Comfy Router: the most affordable Veo, 720p / 1080p.', sourceUrl: 'https://docs.comfy.org/development/comfy-router/models/veo/veo-3-1-lite-generate-001/code' }),
  m('wan-3.0-prime', 'Wan 3.0 Prime', 'Wan', 'video', false, P, 'router-wan3-prime', { note: 'Alibaba wan3.0-video-prime on Comfy Router: the faster Wan 3.0 tier, same inputs.', sourceUrl: 'https://docs.comfy.org/development/comfy-router/models/wan/wan3-0-video-prime/code' }),
  m('p-video-2', 'P-Video-2', 'P-Video', 'video', false, P, 'router-pvideo2', { note: 'Pruna p-video-2 on Comfy Router: text, first frame or first + last frame to video with sound, 720p / 1080p.', sourceUrl: 'https://docs.comfy.org/development/comfy-router/models/pruna/p-video-2/code' }),
  m('grok-imagine-video-1.5-lite', 'Grok Imagine Video 1.5 Lite', 'Grok', 'video', false, P, 'router-grok-video-lite', { note: 'xAI grok-imagine-video-1.5-lite on Comfy Router: text or a first frame to video with sound (always on), 480p to 1080p.', sourceUrl: 'https://docs.comfy.org/development/comfy-router/models/xai/grok-imagine-video-1-5-lite/code' }),
  // Official lab APIs, batch 1 (2026-10-23)
  m('ltx-2.5-pro', 'LTX-2.5 Pro', 'LTX', 'video', false, P, 'direct-ltx-25-pro', { note: 'Lightricks ltx-2-5-pro on the LTX API (api.ltx.io).', sourceUrl: 'https://docs.ltx.io/models/ltx-2-5' }),
  m('ltx-2.5-fast', 'LTX-2.5 Fast', 'LTX', 'video', false, P, 'direct-ltx-25-fast', { note: 'Lightricks ltx-2-5-fast on the LTX API (api.ltx.io).', sourceUrl: 'https://docs.ltx.io/models/ltx-2-5' }),
  m('ltx-2.3-fast', 'LTX-2.3 Fast', 'LTX', 'video', false, P, 'direct-ltx-23-fast', { note: 'Lightricks ltx-2-3-fast on the LTX API (api.ltx.io).', sourceUrl: 'https://docs.ltx.io/models/ltx-2-3' }),
  m('flux-3-video', 'FLUX 3 Video', 'FLUX', 'video', false, P, 'direct-flux3-video', { sourceUrl: 'https://docs.bfl.ml/flux_3/flux3_video' }),
  // Official lab APIs, batch 2 (2026-10-23): new Seedance models on BytePlus ModelArk
  m('seedance-2.5', 'Seedance 2.5', 'Seedance', 'video', false, P, 'direct-seedance-25', { note: 'ByteDance dreamina-seedance-2-5-260628 on BytePlus ModelArk; byteplus/dreamina-seedance-2-5-260628 on Comfy Router (2026-10-25).', sourceUrl: 'https://docs.byteplus.com/en/docs/ModelArk/1520757' }),
  m('seedance-2.0-fast', 'Seedance 2.0 Fast', 'Seedance', 'video', false, P, 'direct-seedance-20-fast', { note: 'ByteDance dreamina-seedance-2-0-fast-260128 on BytePlus ModelArk; byteplus/dreamina-seedance-2-0-fast-260128 on Comfy Router (2026-10-25).', sourceUrl: 'https://docs.byteplus.com/en/docs/ModelArk/1520757' }),
  m('seedance-2.0-mini', 'Seedance 2.0 Mini', 'Seedance', 'video', false, P, 'direct-seedance-20-mini', { note: 'ByteDance dreamina-seedance-2-0-mini-260615 on BytePlus ModelArk; byteplus/dreamina-seedance-2-0-mini on Comfy Router (2026-10-25).', sourceUrl: 'https://docs.byteplus.com/en/docs/ModelArk/1520757' }),
  m('seedvr2', 'SeedVR2', 'SeedVR2', 'video', true, 'apache-2.0', 'comfy-seedvr2', { note: 'SeedVR2 video upscale on fal (fal-ai/seedvr/upscale/video, target 720p–2160p).' }),
  m('seedvr2-3b-video', 'SeedVR2 3B', 'SeedVR2', 'video', true, 'apache-2.0', 'comfy-seedvr2', { note: 'Free on computers with an NVIDIA graphics card.' }),
  m('flux-3-upscaler', 'FLUX Video Upscale', 'FLUX', 'video', false, P, 'direct-flux3-upscale', { note: 'Black Forest Labs video-upscale-v1: the BFL API, or bfl/video-upscale-v1 on Comfy Router.' }),
  m('real-esrgan-x2-video', 'Real-ESRGAN x2', 'Real-ESRGAN', 'video', true, 'bsd-3-clause', 'comfy-video-esrgan', { note: 'RealESRGAN_x2plus on every frame, then resized to the picked size (workflows/upscale-esrgan-api.json).' }),
  m('4x-ultrasharp-video', '4x-UltraSharp', 'UltraSharp', 'video', true, 'ultrasharp-nc', 'comfy-video-ultrasharp', { note: '4x-UltraSharp on every frame, then resized to the picked size (workflows/upscale-ultrasharp-api.json).' }),
  m('topaz-starlight-fast', 'Topaz Starlight Fast', 'Topaz', 'video', false, P, 'cloud-topaz-starlight-fast', { note: 'Comfy partner node TopazVideoEnhanceV2, upscaler_model "Starlight (Astra) Fast".' }),
  m('topaz-starlight-precise-2.5', 'Topaz Starlight Precise 2.5', 'Topaz', 'video', false, P, 'cloud-topaz-precise', { note: 'Comfy partner node TopazVideoEnhanceV2, upscaler_model "Starlight Precise 2.5".' }),
  m('topaz-astra-2', 'Topaz Astra 2', 'Topaz', 'video', false, P, 'cloud-topaz-astra2', { note: 'Comfy partner node TopazVideoEnhanceV2, upscaler_model "Astra 2".' }),
  m('topaz-starlight-creative', 'Topaz Starlight Creative', 'Topaz', 'video', false, P, 'cloud-topaz-creative', { note: 'Comfy partner node TopazVideoEnhanceV2, upscaler_model "Starlight (Astra) Creative".' }),
  m('crystal-video-upscaler', 'Crystal Video Upscaler', 'Crystal', 'video', false, P, 'router-crystal-video', { note: 'Clarity AI on Comfy Router (fal/crystal-video-upscaler); price not published yet.' }),
  m('birefnet', 'BiRefNet', 'BiRefNet', 'video', true, 'mit', 'comfy-birefnet-video'),
  m('bria-video-background-removal', 'Bria Video Background Removal', 'Bria', 'video', false, P, 'comfy-birefnet-video', { note: 'The fal route of Remove Background runs Bria, not BiRefNet.', sourceUrl: 'https://fal.ai/models/bria/video/background-removal' }),
  m('luma-ray-2-reframe', 'Luma Reframe', 'Luma', 'video', false, P, 'direct-luma-reframe', { lifecycleKey: 'direct-luma-reframe', note: 'Luma Ray 3.2 Reframe: 720p (High) / 540p (Fast). The id keeps its old Ray 2 name so saved settings still work.' }),
  m('rife-4.9', 'RIFE 4.9', 'RIFE', 'video', true, 'mit', 'comfy-rife'),
  m('depth-anything-v2-small', 'Depth Anything V2 Small', 'Depth Anything', 'video', true, 'apache-2.0', 'comfy-depth-anything-v2'),
  m('ffmpeg-hdr10', 'ffmpeg HDR10 conversion', 'ffmpeg', 'video', true, null, 'local-ffmpeg-hdr', { note: 'Not an AI model: ffmpeg zscale/tonemap on this computer.' }),
  // ---- Image ----
  m('nano-banana-2', 'Nano Banana 2', 'Nano Banana', 'image', false, P, 'api-nano-banana'),
  m('gpt-image', 'GPT Image 2', 'GPT Image', 'image', false, P, 'api-gpt-image'),
  m('seedream-5.0-pro', 'Seedream 5.0 Pro', 'Seedream', 'image', false, P, 'api-seedream'),
  m('flux-2-pro', 'FLUX.2 [pro]', 'FLUX', 'image', false, P, 'api-flux2'),
  m('flux-2-flex', 'FLUX.2 [flex]', 'FLUX', 'image', false, P, 'direct-flux2-flex'),
  m('ideogram-v4', 'Ideogram V4', 'Ideogram', 'image', false, P, 'api-ideogram'),
  m('recraft-v4', 'Recraft V4', 'Recraft', 'image', false, P, 'api-recraft'),
  m('luma-image', 'Luma UNI-1', 'Luma', 'image', false, P, 'api-luma-image'),
  m('kling-image-o1', 'Kling Image O1', 'Kling', 'image', false, P, 'api-kling-image'),
  m('krea', 'Krea 3', 'Krea', 'image', false, P, 'api-krea'),
  m('runway-gen4-image', 'Runway Gen-4 Image', 'Runway', 'image', false, P, 'api-runway-image'),
  m('grok-imagine-image', 'Grok Imagine Image 2.0', 'Grok', 'image', false, P, 'api-grok-image'),
  m('qwen-image-3', 'Qwen Image 3.0', 'Qwen', 'image', false, P, 'api-qwen-image'),
  m('wan-image-2.5', 'Wan 2.5 Image', 'Wan', 'image', false, P, 'api-wan-image'),
  // Image models added 2026-10-22 (model-catalog pass): Comfy Router ids from docs.comfy.org/llms.txt (router-schemas), prices on the Router / partner pricing pages.
  m('gpt-image-2.5-flare', 'GPT Image 2.5 Flare', 'GPT Image', 'image', false, P, 'api-gpt-image-25-flare', { note: 'OpenAI gpt-image-2.5-flare: "fast, high-quality everyday image generation".', sourceUrl: 'https://developers.openai.com/api/docs/guides/image-generation' }),
  m('gpt-image-2.5-sunburst', 'GPT Image 2.5 Sunburst', 'GPT Image', 'image', false, P, 'api-gpt-image-25-sunburst', { note: 'OpenAI gpt-image-2.5-sunburst: "for workflows where editing precision matters most".', sourceUrl: 'https://developers.openai.com/api/docs/guides/image-generation' }),
  m('nano-banana-2.1', 'Nano Banana 2.1', 'Nano Banana', 'image', false, P, 'api-nano-banana-21', { note: 'Google gemini-nano-banana-2.1, an update to Nano Banana 2 (Gemini 3.1 Flash Image).', sourceUrl: 'https://ai.google.dev/gemini-api/docs/pricing' }),
  m('nano-banana-pro', 'Nano Banana Pro', 'Nano Banana', 'image', false, P, 'api-nano-banana-pro', { note: 'Google Gemini 3 Pro Image (gemini-3-pro-image).', sourceUrl: 'https://ai.google.dev/gemini-api/docs/pricing' }),
  m('flux-3-image', 'FLUX 3 Image', 'FLUX', 'image', false, P, 'api-flux3-image', { sourceUrl: 'https://docs.bfl.ml/flux_3/flux3_image_generate' }),
  m('flux-2-max', 'FLUX.2 [max]', 'FLUX', 'image', false, P, 'api-flux2-max', { sourceUrl: 'https://bfl.ai/pricing' }),
  m('minimax-image-01', 'MiniMax image-01', 'MiniMax', 'image', false, P, 'direct-minimax-image', { sourceUrl: 'https://platform.minimax.io/docs/api-reference/image-generation-t2i' }),
  m('flux-2-klein-9b', 'FLUX.2 [klein] 9B', 'FLUX', 'image', false, P, 'direct-flux2-klein-9b', { note: 'FLUX.2 [klein] 9B on the BFL API. Its open weights carry the FLUX Non-Commercial licence; no local workflow here yet.', sourceUrl: 'https://docs.bfl.ml/api-reference/models/generate-or-edit-an-image-with-flux2-[klein]-9b' }),
  m('nano-banana-2-lite', 'Nano Banana 2 Lite', 'Nano Banana', 'image', false, P, 'direct-gemini-nb2-lite', { note: 'Google gemini-3.1-flash-lite-image on the Gemini API or Comfy Router (vertexai/gemini-3.1-flash-lite-image): 1K images, up to 14 reference images.', sourceUrl: 'https://ai.google.dev/gemini-api/docs/image-generation' }),
  // Comfy Router image batch (2026-10-25): ids and schemas from the Router model pages (docs.comfy.org/development/comfy-router/models/<provider>/<model>/code)
  m('gpt-image-1.5', 'GPT Image 1.5', 'GPT Image', 'image', false, P, 'api-gpt-image-15', { note: 'OpenAI gpt-image-1.5 on Comfy Router: 1024x1024, 1024x1536 or 1536x1024.', sourceUrl: 'https://docs.comfy.org/development/comfy-router/models/openai/gpt-image-1-5/code' }),
  m('seedream-4.5', 'Seedream 4.5', 'Seedream', 'image', false, P, 'api-seedream-45', { note: 'ByteDance seedream-4-5-251128 on Comfy Router: 2K and 4K.', sourceUrl: 'https://docs.comfy.org/development/comfy-router/models/byteplus/seedream-4-5-251128/code' }),
  m('fibo-2.0', 'FIBO 2.0', 'Bria FIBO', 'image', true, 'bria-fibo', 'api-bria-fibo2', { note: 'Bria FIBO 2.0 on Comfy Router: bria/image makes new images (1MP / 4MP, 21 shapes), bria/fibo edits one photo (optional mask). Open weights: briaai/Fibo-2.0-dev and Fibo-2.0-edit-turbo (diffusers).', sourceUrl: 'https://docs.comfy.org/tutorials/partner-nodes/bria/fibo' }),
  m('grok-imagine-image-pro', 'Grok Imagine Image Pro', 'Grok', 'image', false, P, 'api-grok-image-pro', { note: 'xAI grok-imagine-image-pro on Comfy Router: text to image only (its schema takes no image).', sourceUrl: 'https://docs.comfy.org/development/comfy-router/models/xai/grok-imagine-image-pro/code' }),
  m('seedream-5.0-flash', 'Seedream 5.0 Flash', 'Seedream', 'image', false, P, 'api-seedream-flash', { note: 'ByteDance seedream-5-0-flash-260915.' }),
  m('ideogram-4.5', 'Ideogram 4.5', 'Ideogram', 'image', false, P, 'api-ideogram-45'),
  m('qwen-image-3-pro', 'Qwen Image 3.0 Pro', 'Qwen', 'image', false, P, 'api-qwen-image-pro'),
  m('recraft-v4.1', 'Recraft V4.1', 'Recraft', 'image', false, P, 'api-recraft-41', { sourceUrl: 'https://www.recraft.ai/docs/api-reference/pricing' }),
  m('recraft-v4.1-pro', 'Recraft V4.1 Pro', 'Recraft', 'image', false, P, 'api-recraft-41-pro', { sourceUrl: 'https://www.recraft.ai/docs/api-reference/pricing' }),
  m('luma-uni-1-max', 'Luma UNI-1 Max', 'Luma', 'image', false, P, 'api-luma-uni1-max'),
  m('hunyuan-image-3.5', 'HY Image 3.5 Preview', 'Hunyuan', 'image', false, P, 'api-hunyuan-image'),
  m('meta-muse-image', 'Muse Image 1.0', 'Meta', 'image', false, P, 'api-meta-muse'),
  m('qwen-image-2.1', 'Qwen Image 2.1', 'Qwen', 'image', true, 'qwen-research', 'comfy-qwen21'),
  m('qwen-image-2.1-turbo', 'Qwen Image 2.1 Turbo', 'Qwen', 'image', true, 'qwen-research', 'comfy-qwen21-turbo', { note: 'The official 8-step Turbo templates; the edit template takes one image.' }),
  m('qwen-image', 'Qwen-Image', 'Qwen', 'image', true, 'apache-2.0', 'comfy-qwen-image', { note: 'Qwen-Image 20B for text-to-image; edits run Qwen-Image-Edit-2509.' }),
  m('qwen-image-edit-2509', 'Qwen-Image-Edit-2509', 'Qwen', 'image', true, 'apache-2.0', 'comfy-qwen-image', { note: 'Edit-only tools: the local graph is Qwen-Image-Edit-2509 (the fal / Replicate Qwen-Image routes are text-to-image only and never run here).' }),
  m('qwen-image-edit-2509-angles', 'Qwen-Image-Edit-2509 + Multiple-angles LoRA', 'Qwen', 'image', true, 'apache-2.0', 'comfy-qwen-angles'),
  m('z-image-turbo', 'Z-Image-Turbo', 'Z-Image', 'image', true, 'apache-2.0', 'comfy-zimage-turbo'),
  m('z-image', 'Z-Image', 'Z-Image', 'image', true, 'apache-2.0', 'comfy-zimage'),
  m('flux-2-klein-4b', 'FLUX.2 [klein] 4B', 'FLUX', 'image', true, 'apache-2.0', 'comfy-klein4b'),
  m('flux-3-klein', 'FLUX 3 Klein', 'FLUX', 'image', true, 'flux-kommunity', 'comfy-flux3-klein'),
  m('flux-2-dev', 'FLUX.2 [dev]', 'FLUX', 'image', true, 'flux-dev-nc', 'comfy-flux2dev'),
  m('moss-image', 'MOSS-Image', 'MOSS-Image', 'image', true, 'apache-2.0', 'comfy-moss-image'),
  m('moss-image-base', 'MOSS-Image Base', 'MOSS-Image', 'image', true, 'apache-2.0', 'comfy-moss-image-base'),
  m('opensoul', 'Z-Image-Turbo + look LoRAs', 'Z-Image', 'image', true, null, 'comfy-soul', { note: 'A recipe, not one checkpoint: Z-Image-Turbo + look LoRAs by default; reference routes use Qwen-Image-Edit-2511 or FLUX.1 [dev] + PuLID.' }),
  m('real-esrgan', 'Real-ESRGAN', 'Real-ESRGAN', 'image', true, 'bsd-3-clause', 'comfy-realesrgan'),
  m('4x-ultrasharp', '4x-UltraSharp', 'UltraSharp', 'image', true, 'ultrasharp-nc', 'comfy-ultrasharp'),
  // Upscale (2026-10-22): hosted SeedVR2 (WaveSpeed on Comfy Router, fal) is one model with two places; the local graph is SeedVR2 3B fp16 (a named size).
  m('seedvr2-image', 'SeedVR2', 'SeedVR2', 'image', true, 'apache-2.0', 'router-seedvr2-upscale', { note: 'SeedVR2 image upscale hosted by WaveSpeed (Comfy Router) or fal; neither says which size (3B / 7B) it runs.', sourceUrl: 'https://github.com/ByteDance-Seed/SeedVR' }),
  m('crystal-upscaler', 'Crystal Upscaler', 'Clarity', 'image', false, P, 'api-crystal-upscale', { sourceUrl: 'https://fal.ai/models/clarityai/crystal-upscaler' }),
  m('topaz-wonder-3.5', 'Topaz Wonder 3.5', 'Topaz', 'image', false, P, 'fal-topaz-wonder', { sourceUrl: 'https://fal.ai/models/topaz/upscale/image/generative' }),
  m('topaz-standard-v2', 'Topaz Standard V2', 'Topaz', 'image', false, P, 'fal-topaz-precision', { note: 'fal topaz/upscale/image/precision with model "Standard V2".', sourceUrl: 'https://fal.ai/models/topaz/upscale/image/precision' }),
  m('seedvr2-3b-image', 'SeedVR2 3B', 'SeedVR2', 'image', true, 'apache-2.0', 'comfy-seedvr2-image', { note: 'seedvr2_3b_fp16 on the native ComfyUI SeedVR2 nodes (official template adapted from int8 to fp16).', sourceUrl: 'https://huggingface.co/Comfy-Org/SeedVR2' }),
  m('z-image-turbo-2k-upscaler', 'Z-Image-Turbo 2K upscaler', 'Z-Image', 'image', true, 'apache-2.0', 'comfy-zimage-upscale', { note: 'Recipe: Real-ESRGAN x4plus, then Z-Image-Turbo 5 steps at denoise 0.33 (official template).' }),
  m('4x-nomos2', '4x Nomos2 DAT2', 'Nomos2', 'image', true, 'cc-by-4.0', 'comfy-nomos2', { sourceUrl: 'https://github.com/Phhofm/models/releases/tag/4xNomos2_hq_dat2' }),
  // fal image pass (2026-10-22): fal-only tool models
  m('topaz-bloom-2', 'Topaz Bloom 2', 'Topaz', 'image', false, P, 'fal-topaz-bloom', { note: 'fal topaz/upscale/image/creative with model "Bloom 2".', sourceUrl: 'https://fal.ai/models/topaz/upscale/image/creative' }),
  m('bria-increase-resolution', 'Bria Increase Resolution', 'Bria', 'image', false, P, 'fal-bria-upscale', { sourceUrl: 'https://fal.ai/models/bria/increase-resolution' }),
  m('bria-genfill', 'Bria GenFill', 'Bria', 'image', false, P, 'fal-bria-genfill', { note: 'Fills a painted mask from a prompt (Brush Edit).', sourceUrl: 'https://fal.ai/models/fal-ai/bria/genfill' }),
  // photo tools (2026-10-23, tools/imageFalApps.ts): fal-only models, one workflow each
  m('bria-rmbg-2.0', 'Bria RMBG 2.0', 'Bria', 'image', false, P, 'fal-bria-rmbg', { note: 'Background removal (Remove Background).', sourceUrl: 'https://fal.ai/models/fal-ai/bria/background/remove' }),
  m('ideogram-remove-background', 'Ideogram Remove Background', 'Ideogram', 'image', false, P, 'fal-ideogram-rmbg', { note: 'Background removal (Remove Background).', sourceUrl: 'https://fal.ai/models/fal-ai/ideogram/remove-background' }),
  m('bria-expand', 'Bria Expand', 'Bria', 'image', false, P, 'fal-bria-expand', { note: 'Outpainting to a new shape (Expand).', sourceUrl: 'https://fal.ai/models/fal-ai/bria/expand' }),
  m('ideogram-3-reframe', 'Ideogram 3.0 Reframe', 'Ideogram', 'image', false, P, 'fal-ideogram-reframe', { note: 'Reframes a photo to a new shape (Expand).', sourceUrl: 'https://fal.ai/models/fal-ai/ideogram/v3/reframe' }),
  m('bria-eraser', 'Bria Eraser', 'Bria', 'image', false, P, 'fal-bria-eraser', { note: 'Removes a painted object (Erase Object).', sourceUrl: 'https://fal.ai/models/fal-ai/bria/eraser' }),
  m('fal-object-removal', 'fal Object Removal', 'fal', 'image', false, P, 'fal-object-removal', { note: "fal's own mask object removal; fal names no underlying model (Erase Object).", sourceUrl: 'https://fal.ai/models/fal-ai/object-removal/mask' }),
  m('fashn-tryon-1.6', 'FASHN Virtual Try-On v1.6', 'FASHN', 'image', false, P, 'fal-fashn-tryon', { note: 'Garment onto a person (Virtual Try-On).', sourceUrl: 'https://fal.ai/models/fal-ai/fashn/tryon/v1.6' }),
  // Image to layers (2026-10-24, shared/imageLayers.ts): the local Qwen-Image-Layered (official template, listed with its download size). The hosted layer engines are Seedream 5.0 Flash / Pro themselves (ENGINE_MODEL).
  m('seedream-5.0-flash-layers', 'Seedream 5.0 Flash', 'Seedream', 'image', false, P, 'api-seedream-layers-flash', { note: 'ByteDance seedream-5-0-flash-260915 in layer-separation mode (Image to layers).', sourceUrl: 'https://docs.comfy.org/development/comfy-router/models/byteplus/seedream-5-0-flash-260915/code' }),
  m('seedream-5.0-pro-layers', 'Seedream 5.0 Pro', 'Seedream', 'image', false, P, 'api-seedream-layers-pro', { note: 'ByteDance seedream-5-0-pro-260628 in layer-separation mode (Image to layers).', sourceUrl: 'https://docs.comfy.org/development/comfy-router/models/byteplus/seedream-5-0-pro-260628/code' }),
  m('qwen-image-layered', 'Qwen-Image-Layered', 'Qwen', 'image', true, 'apache-2.0', 'comfy-qwen-image-layered', { note: 'Splits one photo into RGBA layers (Image to layers); official template image_qwen_image_layered.', sourceUrl: 'https://huggingface.co/Qwen/Qwen-Image-Layered' }),
  // ---- Audio ----
  // MiniMax Music 3 (2026-10-27): ONE model, open weights (MiniMax-Music3 Community License), on two places: Local (the official template
  // audio_minimax_music_3) and Comfy Cloud (the same graph on Comfy's GPUs, cloud-minimax-music, routing/routes.ts TWINS). It used to be two cards.
  m('minimax-music-3', 'MiniMax Music 3', 'MiniMax', 'audio', true, 'minimax-music3-community', 'comfy-minimax-music3', { sourceUrl: 'https://huggingface.co/MiniMaxAI/MiniMax-Music3' }),
  m('sonilo-music', 'Sonilo Music', 'Sonilo', 'audio', false, P, 'api-sonilo-music'),
  m('sonilo-video-to-music', 'Sonilo Video-to-Music', 'Sonilo', 'audio', false, P, 'api-sonilo-v2m'),
  m('seed-audio', 'ByteDance Seed Audio', 'ByteDance', 'audio', false, P, 'api-seed-audio'),
  m('ace-step-1.5', 'ACE-Step 1.5', 'ACE-Step', 'audio', true, 'mit', 'comfy-acestep'),
  m('yue2', 'YuE2', 'M-A-P', 'audio', true, 'yue2-weights', 'comfy-yue2', { note: 'Songs from lyrics + style; Cover a song (SheetSage2 melody → YuE2).', sourceUrl: 'https://huggingface.co/m-a-p/YuE2-3B' }),
  m('stable-audio-open-1.0', 'Stable Audio Open 1.0', 'Stability', 'audio', true, 'stability-community', 'comfy-stable-audio'),
  m('mmaudio', 'MMAudio', 'MMAudio', 'audio', true, 'mmaudio-weights', 'comfy-mmaudio'),
  m('elevenlabs-sound-effects', 'ElevenLabs Sound Effects', 'ElevenLabs', 'audio', false, P, 'api-eleven-sfx'),
  m('elevenlabs-v4', 'ElevenLabs v4', 'ElevenLabs', 'audio', false, P, 'api-eleven-tts'),
  m('elevenlabs-v3', 'ElevenLabs v3', 'ElevenLabs', 'audio', false, P, 'api-eleven-v3', { sourceUrl: 'https://docs.comfy.org/development/comfy-router/models/elevenlabs/eleven-v3/code' }),
  m('elevenlabs-v4-turbo', 'ElevenLabs v4 Turbo', 'ElevenLabs', 'audio', false, P, 'api-eleven-v4-turbo', { sourceUrl: 'https://docs.comfy.org/development/comfy-router/models/elevenlabs/eleven-v4-turbo/code' }),
  m('minimax-speech-2.8-hd', 'MiniMax Speech 2.8 HD', 'MiniMax', 'audio', false, P, 'direct-minimax-speech'),
  m('minimax-speech-2.8-turbo', 'MiniMax Speech 2.8 Turbo', 'MiniMax', 'audio', false, P, 'direct-minimax-speech-turbo', { sourceUrl: 'https://platform.minimax.io/docs/api-reference/speech-t2a-http' }),
  m('fish-audio-s2.1-pro', 'Fish Audio S2.1 Pro', 'Fish Audio', 'audio', false, P, 'api-fish-tts'),
  m('heygen-voice', 'HeyGen Voice', 'HeyGen', 'audio', false, P, 'api-heygen-tts', { note: 'HeyGen Starfish text to speech: heygen/starfish on Comfy Router (2026-10-31).', sourceUrl: 'https://docs.comfy.org/development/comfy-router/models/heygen/starfish/code' }),
  m('qwen3-tts', 'Qwen3 TTS 1.7B', 'Qwen', 'audio', true, 'apache-2.0', 'comfy-qwen3tts', { note: 'Open weights (Qwen3-TTS-12Hz-1.7B-CustomVoice) via flybirdxx/ComfyUI-Qwen-TTS; 9 preset voices, 10 languages, a Style instruction. The paid Alibaba API entry was retired 2026-10-27.', sourceUrl: 'https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice' }),
  m('chatterbox', 'Chatterbox', 'Resemble AI', 'audio', true, 'chatterbox', 'comfy-chatterbox'),
  m('chatterbox-voice-changer', 'Chatterbox Voice Changer', 'Resemble AI', 'audio', true, 'chatterbox', 'comfy-chatterbox-vc'),
  m('fish-audio-drama-3', 'Fish Audio Drama 3', 'Fish Audio', 'audio', true, 'fish-community', 'comfy-drama3'),
  m('f5-tts', 'F5-TTS', 'F5-TTS', 'audio', true, 'f5-tts-weights', 'comfy-f5tts'),
  m('translate-chatterbox', 'Translate with Chatterbox', 'Resemble AI', 'audio', true, 'chatterbox', 'local-whisper-nllb-chatterbox', { note: 'Pipeline: Whisper → NLLB → Chatterbox.' }),
  m('translate-f5-tts', 'Translate with F5-TTS', 'F5-TTS', 'audio', true, 'f5-tts-weights', 'local-whisper-nllb-f5', { note: 'Pipeline: Whisper → NLLB → F5-TTS.' }),
].map((d) => [d.key, { ...d, ...(MODEL_MAKER[d.key] ? { maker: MODEL_MAKER[d.key] } : {}) }]));

/**
 * Engine (provider id) → model key. A string = the same model on every tool; an object = per tool (`*` = any other tool). Apps (app-*) look up
 * their own id first, then their base tool. Unknown engines (plugins) fall back in routing/modelRegistry.ts (never throws).
 */
export const ENGINE_MODEL: Record<string, string | Record<string, string>> = {
  // `comfy-open` means a different model on nearly every tool (the generic open-weights workflow engine).
  'comfy-open': { 'object-swap': 'wan-2.2-animate-14b', 'motion-transfer': 'wan-2.2-animate-14b', restyle: 'wan-2.1-vace-14b', 'app-anime-restyle': 'wan-2.1-vace-14b',
    reshoot: 'ltx-2-19b', cinema: 'ltx-2-19b', 'app-orbit-shot': 'ltx-2-19b', camera: 'wan-2.2-fun-camera-14b' /* + ltx-2-19b: TOOL_SPLITS */, 'photo-fx': 'wan-2.2-i2v-14b',
    upscale: 'seedvr2', 'app-video-upscale': 'seedvr2', cutout: 'birefnet' },
  'comfy-funcamera': 'wan-2.2-fun-camera-14b',
  'cloud-ltx-camera': 'ltx-2-19b', 'cloud-reshoot': 'ltx-2-19b',
  'comfy-wan22-5b': 'wan-2.2-ti2v-5b', 'comfy-ltx25-video': 'ltx-2.5-22b', 'comfy-ltx25-extend': 'ltx-2.5-22b' /* Extend: the same LTX-2.5 22B, from the last frames */, 'cloud-ltx25-video': 'ltx-2.5-22b', 'cloud-ltx25-extend': 'ltx-2.5-22b' /* Comfy Cloud twins (Oct 27) */, 'comfy-ltx25-lipsync': 'ltx-2.5-talking-photo', 'cloud-infinitetalk': 'infinitetalk-wan-2.1' /* Lip Sync on Comfy Cloud (Oct 27) */,
  'comfy-h3': 'minimax-h3', 'cloud-h3-wf': 'minimax-h3', 'cloud-h3-fast': 'minimax-h3-fast', 'cloud-h3-keyframes': 'minimax-h3' /* the H3 card's Keyframes mode (2026-10-27) */, 'cloud-h3': 'minimax-h3', 'api-minimax-h3': 'minimax-h3',
  'comfy-h3-camera': 'minimax-h3-camera-motion', 'comfy-h3-lipsync': 'minimax-h3-talking-photo', 'comfy-h3-extend': 'minimax-h3-extend', 'comfy-h3-charswap': 'minimax-h3-character-swap', 'cloud-h3-charswap': 'minimax-h3-character-swap', 'cloud-h3-extend': 'minimax-h3-extend', 'cloud-h3-crossview': 'minimax-h3-crossview',
  'comfy-h3-restyle': 'minimax-h3-style-transfer', 'comfy-h3-vfx': 'minimax-h3-vfx-edit',
  'router-seedance': 'seedance-2.0', 'router-veo': 'veo-3.1', 'router-kling': 'kling-v3', 'router-wan3': 'wan-3.0',
  'comfy-seedvr2': 'seedvr2', 'direct-flux3-upscale': 'flux-3-upscaler', 'comfy-video-esrgan': 'real-esrgan-x2-video', 'comfy-video-ultrasharp': '4x-ultrasharp-video', 'cloud-topaz-starlight-fast': 'topaz-starlight-fast', 'cloud-topaz-precise': 'topaz-starlight-precise-2.5', 'cloud-topaz-astra2': 'topaz-astra-2', 'cloud-topaz-creative': 'topaz-starlight-creative', 'router-crystal-video': 'crystal-video-upscaler', 'comfy-birefnet-video': 'birefnet', 'auto-reframe': 'luma-ray-2-reframe', 'direct-luma-reframe': 'luma-ray-2-reframe',
  'comfy-rife': 'rife-4.9', 'comfy-depth-anything-v2': 'depth-anything-v2-small', 'local-ffmpeg-hdr': 'ffmpeg-hdr10',
  'api-nano-banana': 'nano-banana-2', 'api-gpt-image': 'gpt-image', 'api-seedream': 'seedream-5.0-pro', 'api-flux2': 'flux-2-pro', 'direct-flux2-flex': 'flux-2-flex',
  'api-ideogram': 'ideogram-v4', 'api-recraft': 'recraft-v4', 'api-luma-image': 'luma-image', 'api-kling-image': 'kling-image-o1', 'api-krea': 'krea', 'api-runway-image': 'runway-gen4-image',
  'api-gpt-image-25-flare': 'gpt-image-2.5-flare', 'api-gpt-image-25-sunburst': 'gpt-image-2.5-sunburst', 'api-nano-banana-21': 'nano-banana-2.1', 'api-nano-banana-pro': 'nano-banana-pro', 'api-flux3-image': 'flux-3-image',
  'api-flux2-max': 'flux-2-max', 'api-seedream-flash': 'seedream-5.0-flash', 'api-ideogram-45': 'ideogram-4.5', 'api-qwen-image-pro': 'qwen-image-3-pro', 'api-recraft-41': 'recraft-v4.1', 'api-recraft-41-pro': 'recraft-v4.1-pro', 'api-luma-uni1-max': 'luma-uni-1-max',
  'api-grok-image': 'grok-imagine-image', 'api-qwen-image': 'qwen-image-3', 'api-wan-image': 'wan-image-2.5', 'api-hunyuan-image': 'hunyuan-image-3.5', 'api-meta-muse': 'meta-muse-image',
  'comfy-qwen21': 'qwen-image-2.1', 'comfy-qwen21-turbo': 'qwen-image-2.1-turbo',
  'comfy-qwen-image': { 'app-inpaint': 'qwen-image-edit-2509', 'app-relight': 'qwen-image-edit-2509', 'app-face-swap': 'qwen-image-edit-2509', 'app-person-swap': 'qwen-image-edit-2509', 'app-shots': 'qwen-image-edit-2509', '*': 'qwen-image' },
  'comfy-qwen-angles': 'qwen-image-edit-2509-angles', 'comfy-zimage-turbo': 'z-image-turbo', 'comfy-zimage': 'z-image', 'comfy-klein4b': 'flux-2-klein-4b', 'comfy-flux3-klein': 'flux-3-klein',
  'comfy-flux2dev': 'flux-2-dev', 'comfy-moss-image': 'moss-image', 'comfy-moss-image-base': 'moss-image-base', 'comfy-soul': 'opensoul', 'comfy-realesrgan': 'real-esrgan', 'comfy-ultrasharp': '4x-ultrasharp',
  'router-seedvr2-upscale': 'seedvr2-image', 'fal-seedvr2-upscale': 'seedvr2-image', 'api-crystal-upscale': 'crystal-upscaler', 'fal-topaz-wonder': 'topaz-wonder-3.5', 'fal-topaz-precision': 'topaz-standard-v2',
  'comfy-seedvr2-image': 'seedvr2-3b-image', 'comfy-zimage-upscale': 'z-image-turbo-2k-upscaler', 'comfy-nomos2': '4x-nomos2',
  'fal-topaz-bloom': 'topaz-bloom-2', 'fal-bria-upscale': 'bria-increase-resolution', 'fal-bria-genfill': 'bria-genfill',
  'api-seedream-layers-flash': 'seedream-5.0-flash-layers', 'api-seedream-layers-pro': 'seedream-5.0-pro-layers', 'comfy-qwen-image-layered': 'qwen-image-layered', // Image to layers (2026-10-24)
  'fal-bria-rmbg': 'bria-rmbg-2.0', 'fal-ideogram-rmbg': 'ideogram-remove-background', 'fal-bria-expand': 'bria-expand', 'fal-ideogram-reframe': 'ideogram-3-reframe', 'fal-bria-eraser': 'bria-eraser', 'fal-object-removal': 'fal-object-removal', 'fal-fashn-tryon': 'fashn-tryon-1.6',
  'cloud-minimax-music': 'minimax-music-3', 'api-sonilo-music': 'sonilo-music', 'api-sonilo-v2m': 'sonilo-video-to-music', 'api-seed-audio': 'seed-audio', 'comfy-acestep': 'ace-step-1.5', 'comfy-yue2': 'yue2', 'comfy-minimax-music3': 'minimax-music-3' /* one card: Local + Comfy Cloud (2026-10-27) */,
  'comfy-stable-audio': 'stable-audio-open-1.0', 'comfy-mmaudio': 'mmaudio', 'api-eleven-sfx': 'elevenlabs-sound-effects', 'api-eleven-tts': 'elevenlabs-v4', 'api-eleven-v3': 'elevenlabs-v3', 'api-eleven-v4-turbo': 'elevenlabs-v4-turbo', 'direct-minimax-speech': 'minimax-speech-2.8-hd', 'direct-minimax-speech-turbo': 'minimax-speech-2.8-turbo', 'direct-minimax-image': 'minimax-image-01',
  'direct-ltx-25-pro': 'ltx-2.5-pro', 'router-ltx-25-pro': 'ltx-2.5-pro', 'direct-ltx-25-fast': 'ltx-2.5-fast', 'cloud-ltx25-pro-api': 'ltx-2.5-pro', 'cloud-ltx25-fast-api': 'ltx-2.5-fast' /* Comfy Cloud partner-node place (2026-10-27) */, 'direct-ltx-23-fast': 'ltx-2.3-fast', 'direct-flux3-video': 'flux-3-video', 'router-flux3-video': 'flux-3-video' /* Comfy Router places, 2026-10-25 */, 'direct-flux2-klein-9b': 'flux-2-klein-9b',
  'direct-gemini-nb2-lite': 'nano-banana-2-lite', 'api-gpt-image-15': 'gpt-image-1.5', 'api-seedream-45': 'seedream-4.5', 'api-grok-image-pro': 'grok-imagine-image-pro', 'api-bria-fibo2': 'fibo-2.0', 'direct-seedance-20-fast': 'seedance-2.0-fast', 'direct-seedance-20-mini': 'seedance-2.0-mini', 'direct-seedance-25': 'seedance-2.5',
  // Comfy Router places of the same models (2026-10-25): one model card, places BytePlus and Comfy Router
  'router-kling-edit': 'kling-v3-omni-edit', 'router-seedance-25-edit': 'seedance-2.5-edit', // Video Swap (2026-10-25)
  'router-aleph2': 'runway-aleph-2', 'router-ray32-edit': 'luma-ray-3.2-edit', // Render (2026-10-26)
  'router-seedance-25': 'seedance-2.5', 'router-seedance-20-fast': 'seedance-2.0-fast', 'router-seedance-20-mini': 'seedance-2.0-mini', 'router-veo-fast': 'veo-3.1-fast',
  'router-veo-lite': 'veo-3.1-lite', 'router-wan3-prime': 'wan-3.0-prime', 'router-pvideo2': 'p-video-2', 'router-grok-video-lite': 'grok-imagine-video-1.5-lite', // 2026-10-31
  'api-fish-tts': 'fish-audio-s2.1-pro', 'api-heygen-tts': 'heygen-voice', 'comfy-qwen3tts': 'qwen3-tts', 'comfy-chatterbox': 'chatterbox', 'comfy-chatterbox-vc': 'chatterbox-voice-changer',
  'comfy-drama3': 'fish-audio-drama-3', 'comfy-f5tts': 'f5-tts', 'local-whisper-nllb-chatterbox': 'translate-chatterbox', 'local-whisper-nllb-f5': 'translate-f5-tts',
};

// ---- Official Comfy templates from comfy.org/workflows "Most popular" (2026-10-27, server tools/comfyFeatured.ts) ----
// Gemini Omni 1.1 Flash (Create Video) and Wan Animate 2 (Motion Control) are new models; Topaz Bloom 2 gets a Comfy Cloud place on its card.
Object.assign(MODEL_MAKER, { 'gemini-omni-1.1-flash': 'google', 'wan-animate-2': 'alibaba-wan' });
for (const d of [
  m('gemini-omni-1.1-flash', 'Gemini Omni 1.1 Flash', 'Gemini', 'video', false, P, 'cloud-gemini-omni', { note: 'Google Gemini Omni 1.1 Flash through its Comfy partner node GeminiVideoOmniV2 on Comfy Cloud (official Comfy template "Gemini Omni 1.1 Flash: Image to Video"): text, a start frame or start + end frames to video with sound.',
    sourceUrl: 'https://docs.comfy.org/built-in-nodes/GeminiVideoOmniV2' }),
  m('wan-animate-2', 'Wan Animate 2', 'Wan', 'video', true, 'apache-2.0', 'cloud-wan-animate2', { note: 'Wan Animate 2 (Wan team; Comfy-Org/Wan-Animate-2 repackage, Apache-2.0): a reference character performs the motion of a driving clip, no pose extraction. The official Comfy template video_wan_animate2 on Comfy Cloud.',
    sourceUrl: 'https://huggingface.co/Comfy-Org/Wan-Animate-2' }),
]) MODELS[d.key] = { ...d, maker: MODEL_MAKER[d.key] };
// One key runs everything (2026-10-27): Bria Virtual Try-On on Comfy Router (Virtual Try-On's Comfy card; FASHN stays on fal).
MODEL_MAKER['bria-virtual-tryon'] = 'bria';
MODELS['bria-virtual-tryon'] = { ...m('bria-virtual-tryon', 'Bria Virtual Try-On', 'Bria', 'image', false, P, 'router-bria-tryon', { note: 'Bria Product Virtual Try-On on Comfy Router (bria/image-edit-product-virtual-tryon): a garment photo onto a person photo.',
  sourceUrl: 'https://docs.comfy.org/development/comfy-router/models/bria/image-edit-product-virtual-tryon/code' }), maker: 'bria' };
Object.assign(ENGINE_MODEL, { 'router-bria-tryon': 'bria-virtual-tryon' });
// FLUX 3 Max (2026-10-27): Black Forest Labs' keyframe video model on Comfy (Comfy Cloud partner nodes + Comfy Router fal/flux-3-max), one card.
MODEL_MAKER['flux-3-max'] = 'bfl';
MODELS['flux-3-max'] = { ...m('flux-3-max', 'FLUX 3 Max', 'FLUX', 'video', false, P, 'cloud-flux3-max', { note: 'Black Forest Labs FLUX 3 Max through its Comfy partner nodes Flux3MaxTextToVideoNode / Flux3MaxImageToVideoNode on Comfy Cloud (official templates api_flux3_max_t2v / i2v) and Comfy Router fal/flux-3-max (text at 720p): text or 1–10 keyframes to one 5–20 s shot with sound.',
  sourceUrl: 'https://docs.comfy.org/tutorials/partner-nodes/black-forest-labs/flux-3-max' }), maker: 'bfl' };
Object.assign(ENGINE_MODEL, { 'cloud-flux3-max': 'flux-3-max' });
// Kling 4.0 (2026-10-31): Kuaishou's Kling 4.0 through its Comfy partner nodes on Comfy Cloud (tools/comfyFeatured.ts, comfy/kling4Cloud.ts).
MODEL_MAKER['kling-4'] = 'kling';
MODELS['kling-4'] = { ...m('kling-4', 'Kling 4.0', 'Kling', 'video', false, P, 'cloud-kling4', { note: 'Kling 4.0 through its Comfy partner nodes Kling4TextToVideoNode / Kling4ImageToVideoNode / Kling4ReferenceToVideoNode on Comfy Cloud (official templates api_kling4_t2v / i2v / r2v): text, start (+ end) frame or 1–10 reference images to a 3–30 s clip with stereo sound.',
  sourceUrl: 'https://github.com/Comfy-Org/ComfyUI/pull/17364' }), maker: 'kling' };
Object.assign(ENGINE_MODEL, { 'cloud-kling4': 'kling-4' });
// Prompt Edit (2026-10-27, tools/promptEdit.ts): Bernini-R (ByteDance, Comfy-Org/Bernini-R, Apache-2.0) on Comfy Cloud.
MODEL_MAKER['bernini-r'] = 'bytedance';
MODELS['bernini-r'] = { ...m('bernini-r', 'Bernini-R', 'Wan', 'video', true, 'apache-2.0', 'cloud-bernini-r', { note: 'Bernini-R (ByteDance; renderer-only Wan 2.2, Comfy-Org/Bernini-R, Apache-2.0): edits a clip from one instruction, motion and framing kept. The official Comfy template video_bernini_r_video_editing on Comfy Cloud.',
  sourceUrl: 'https://huggingface.co/Comfy-Org/Bernini-R' }), maker: 'bytedance' };
Object.assign(ENGINE_MODEL, { 'cloud-bernini-r': 'bernini-r' });
// Swap Two People (2026-10-27, tools/twoPersonSwap.ts): the same H3 Character Swap card, run once per person on Comfy Cloud.
Object.assign(ENGINE_MODEL, { 'cloud-h3-two-swap': 'minimax-h3-character-swap' });
Object.assign(ENGINE_MODEL, { 'cloud-gemini-omni': 'gemini-omni-1.1-flash', 'cloud-wan-animate2': 'wan-animate-2', 'cloud-topaz-bloom2': 'topaz-bloom-2' /* one card: Comfy Cloud + fal */ });

/**
 * Where ONE engine serves SEVERAL models on a tool, each split names the routes (route ids of that engine on that tool) that belong to the model,
 * and an input rule. Everything not split serves the engine's model (ENGINE_MODEL) with all its routes.
 *  - camera / comfy-open: classic presets run Wan 2.2 Fun Camera 14B (workflows/camera-moves-api.json), the LTX presets (ids ltx-*) run
 *    LTX-2 19B (workflows/camera-ltx-api.json); its Comfy Cloud twin (cloud-ltx-camera, workflows/cloud/camera-ltx-api.json) runs LTX-2 only.
 *  - h3-extend / comfy-h3-extend: the local graph is MiniMax H3; the fal route is MiniMax H3 Max extend-video (a different model).
 *  - remove-bg / comfy-birefnet-video: the local graph is BiRefNet; the fal route is Bria Video Background Removal.
 */
export type InputRule = 'camera-ltx' | 'camera-classic';
export interface EngineSplit { model: string; routes: string[]; input?: InputRule }
export const TOOL_SPLITS: Record<string, Record<string, EngineSplit[]>> = {
  camera: { 'comfy-open': [
    { model: 'wan-2.2-fun-camera-14b', routes: ['local:comfy-open'], input: 'camera-classic' },
    { model: 'ltx-2-19b', routes: ['local:comfy-open', 'comfy-cloud:cloud-ltx-camera'], input: 'camera-ltx' },
  ], 'cloud-ltx-camera': [{ model: 'ltx-2-19b', routes: ['comfy-cloud:cloud-ltx-camera'], input: 'camera-ltx' }] },
  'h3-extend': { 'comfy-h3-extend': [
    { model: 'minimax-h3-extend', routes: ['local:comfy-h3-extend', 'comfy-cloud:cloud-h3-extend' /* H3 Extend · Comfy Cloud (2026-10-27) */, 'comfy-router:comfy-h3-extend' /* H3 Extend · via last frame (Comfy Router, 2026-10-26) */] },
    { model: 'minimax-h3-max-extend', routes: ['fal:minimax/h3-max/extend-video'] },
  ] },
  upscale: { 'comfy-seedvr2': [
    { model: 'seedvr2', routes: ['fal:fal-ai/seedvr/upscale/video'] },
    { model: 'seedvr2-3b-video', routes: ['local:comfy-seedvr2'] },
  ] },
  'remove-bg': { 'comfy-birefnet-video': [
    { model: 'birefnet', routes: ['local:comfy-birefnet-video'] },
    { model: 'bria-video-background-removal', routes: ['comfy-router:comfy-birefnet-video' /* Comfy Router, 2026-10-27 */, 'fal:bria/video/background-removal'] },
  ] },
};
/** Camera presets: LTX moves have ids `ltx-*`. */
export const isLtxMove = (id: string) => /^ltx-/.test(String(id).trim());
/** Static engine → model for a tool (apps: own id, then base). null = not in the table. */
export function engineModelKey(toolId: string, engine: string, baseToolId?: string | null): string | null {
  const e = ENGINE_MODEL[engine]; if (!e) return null;
  if (typeof e === 'string') return e;
  return e[toolId] ?? (baseToolId ? e[baseToolId] : undefined) ?? e['*'] ?? null;
}
/** Splits for (tool, engine), apps falling back to their base tool. */
export const engineSplits = (toolId: string, engine: string, baseToolId?: string | null): EngineSplit[] | null =>
  TOOL_SPLITS[toolId]?.[engine] ?? (baseToolId ? TOOL_SPLITS[baseToolId]?.[engine] : undefined) ?? null;
