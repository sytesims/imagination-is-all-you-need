/**
 * POST /api/tools/:toolId/prompt-peek (2026-10-23): "See the exact prompt". What a run with this form would send, without running anything:
 * no job, no hold, no charge, no upload. It runs the tool's own parseInput (the same code the job submit runs: an app's compose for Product Shot,
 * Relight…, Create Image's mode / enhance / style / camera rig path), so the prompt shown is the job's input.finalPrompt, not a guess.
 * Body: { fields: {…the submit's form fields…}, files: { image: 1, refs: 2, mask: 1… } (which file fields are filled), photo?: { width, height } }.
 * Filled file fields get a neutral grey placeholder PNG (the photo's size when given) under DATA_DIR/.peek, so the parser's own file checks run as on a submit.
 * Video (2026-10-23, Create Video = h3-video): the same parseInput, so the prompt is input.finalPrompt with the mode's words, Enhance and a look; the settings add
 * duration, sound and bitrate, and `inputs` names each file the run takes ("Start frame (your start frame)"). Reference clips / audio can't be stood in by a
 * placeholder (the parser measures them), so they are named but not parsed: they never change the prompt.
 * Audio (2026-10-23, the one Audio page: audio / voice / soundtrack): the same parseInput, so `prompt` is the job's input.finalPrompt (a voiceover's script is
 * read word for word) and `lyrics` is input.lyrics; the settings add the length, the voice, the target language, the output format (none when the result
 * is a video) and the takes. Files stand in as a neutral clip (samples/sample-take.mp4, 6 s with sound) and a short silent WAV, so the parser's own checks run.
 */
import { modelKeyOf } from './routing/modelRegistry.js';
import { routesFor } from './routing/routes.js';
import { normRunOn, runOnOfRoute, RUN_ON_LABELS, PLACE_LABELS } from './shared/modelIds.js';
import { withRefGrammar, appendUnnamed, refCountsOf, APPENDS_UNNAMED } from './shared/promptRefs.js';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
import { DATA_DIR, SAMPLES_DIR } from './config.js';
import { getProvider, toolProviders } from './providers.js';
import { defaultFirst, requestMode } from './routing/defaults.js';
import { appQuoteParams } from './tools/apps.js';
import { featureById, featureOfJob, workflowFor, workflowLine } from './shared/imageFeatures.js';
import type { ToolDef } from './tools/types.js';
import { catalogFor } from './shared/modelCatalog.js';
import { ROUTER_MODELS, swapPromptOf } from './routing/routerModels.js';
import { isCloudSwap } from './shared/cloudSwap.js';
import { composeH3SwapPrompt } from './shared/h3SwapPrompt.js';
import { ROUTER_SIZE_RULES } from './shared/routerImageSizes.js';
import { applyBrandToFields } from './brandKits.js';
import { jobWorkflow } from './jobSource.js';
import { bfsSwapFor, bfsSwapPrompt } from './comfy/bfsSwap.js';
import type { WorkflowSource } from './shared/workflowSources.js';

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
/** A solid grey RGB PNG of w×h (the photo's shape, so shape checks match a real submit). */
export function greyPng(w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const row = Buffer.alloc(1 + w * 3, 0x80); row[0] = 0; const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
/** A silent 16-bit mono WAV of `sec` seconds (a voice sample or a song's stand-in: ffprobe reads its length). */
export function silentWav(sec = 3, rate = 16000): Buffer {
  const n = Math.round(sec * rate); const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + n * 2, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(n * 2, 40); return Buffer.concat([h, Buffer.alloc(n * 2)]);
}
/** Audio tools' stand-in files under DATA_DIR/.peek: a clip (the bundled sample-take.mp4) and a silent WAV. */
function mediaPlaceholder(kind: 'video' | 'audio'): string {
  const rel = path.join('.peek', kind === 'video' ? 'clip.mp4' : 'audio.wav'); const abs = path.join(DATA_DIR, rel);
  if (!fs.existsSync(abs)) { fs.mkdirSync(path.dirname(abs), { recursive: true }); if (kind === 'video') fs.copyFileSync(path.join(SAMPLES_DIR, 'sample-take.mp4'), abs); else fs.writeFileSync(abs, silentWav(3)); }
  return rel;
}
const AUDIO_TOOLS = ['audio', 'voice', 'soundtrack'];
const FILE_WORDS: Record<string, [string, string]> = { video: ['Clip', 'your clip'], audio: ['Audio', 'your audio file'], voiceAudio: ['Voice sample', 'your sample'] };
const clampPx = (v: unknown, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 16 ? Math.min(n, 8192) : d; };
/** The placeholder's name relative to DATA_DIR (written once per size). */
function placeholder(w: number, h: number): string {
  const rel = path.join('.peek', `photo-${w}x${h}.png`); const abs = path.join(DATA_DIR, rel);
  if (!fs.existsSync(abs)) { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, greyPng(w, h)); }
  return rel;
}

export interface PromptPeek { ok: true; prompt: string | null; /** Camera Angles: one prompt per picked angle */ shots: { label: string; prompt: string }[] | null; noPrompt: string | null;
  promptNote?: string;
  provider: string; model: string | null; workflowFile: string | null; workflowLine: string | null; /** video: the full credit ("Official Comfy template · …"), the line's tooltip */ workflowCredit?: string | null; settings: { aspect: string | null; resolution: string | null; quality: string | null; n: number | null; seed: number | null; mode: string | null;
    /** video only: seconds, sound on/off, bitrate */ duration?: number | null; audio?: boolean | null; bitrate?: string | null;
    /** audio only: the voice, the target language, the output format (null when the result is a video) */ voice?: string | null; language?: string | null; format?: string | null };
  /** audio only: the song lyrics sent (input.lyrics), null when none */ lyrics?: string | null;
  /** video only: the files the run takes, in order, each named as yours ("Start frame (your start frame)") */ inputs?: string[] | null;
  /** Brand Kit: the kit's words added after the typed prompt (applied false = nothing added: no typed prompt, an empty kit or not a brand tool) */
  brand?: { id: string; name: string; phrase: string; applied: boolean };
  /** Nano Banana (2026-10-24): the image fields the model request carries, built by the Router body itself (routing/routerModels.ts), so you can check
   *  them before paying. aspectRatio null = left out (an edit on Match photo keeps the photo's shape). The Gemini API route sends the same values. */
  request?: { model: string; aspectRatio: string | null; imageSize: string | null; images: number;
    /** GPT Image (2026-10-24): the exact size, quality and count each request sends (one request per image). */ size?: string; quality?: string; n?: number;
    /** Image to layers: layer_decomposition is on (one request returns every layer) */ layers?: boolean;
    /** Qwen Image 3.0 / Wan 2.5 (2026-10-24): the model's own prompt rewrite (prompt_extend) and the negative prompt sent */ promptRewrite?: boolean; negativePrompt?: string | null;
    /** FIBO 2.0 (2026-10-26): our structured caption is sent instead of the prompt */ structured?: boolean } | null }
/** The Router body's image fields for this job: imageConfig (the Vertex Gemini family), size / quality / n (GPT Image) or the layer request (Image to layers). null for every other model. */
async function requestFields(provider: string, input: any): Promise<PromptPeek['request']> {
  const spec = ROUTER_MODELS[provider]; if (!spec || spec.out !== 'image' || !input || typeof input !== 'object') return null;
  try { const b: any = await spec.body(input, 0);
    if (provider === 'api-bria-fibo2') return { model: spec.idFor?.(input) ?? spec.id, aspectRatio: typeof b.aspect_ratio === 'string' ? b.aspect_ratio : null, imageSize: typeof b.resolution === 'string' ? b.resolution : null,
      images: Array.isArray(b.images) ? b.images.length : 0, structured: typeof (b.structured_prompt ?? b.structured_instruction) === 'string' }; // FIBO 2.0: bria/image or bria/fibo
    if (b?.layer_decomposition === true) return { model: spec.id, aspectRatio: null, imageSize: typeof b.size === 'string' ? b.size : null, images: b.image ? 1 : 0, layers: true }; // Image to layers
    if (typeof b?.size === 'string' && typeof b?.quality === 'string') return { model: spec.id, aspectRatio: null, imageSize: null, images: Array.isArray(b.image) ? b.image.length : b.image ? 1 : 0, size: b.size, quality: b.quality, n: Number(b.n) || 1 }; // GPT Image
    if (ROUTER_SIZE_RULES[provider] && typeof b?.size === 'string') return { model: spec.id, aspectRatio: null, imageSize: null, images: Array.isArray(b.image) ? b.image.length : b.image ? 1 : 0, size: b.size }; // Seedream 5.0
    if (ROUTER_SIZE_RULES[provider] && typeof b?.parameters?.size === 'string') { const content: any[] = b.input?.messages?.[0]?.content ?? []; // Qwen Image 3.0 / Wan 2.5: size, the model's prompt rewrite, the negative prompt
      return { model: spec.id, aspectRatio: null, imageSize: null, images: content.filter((c) => c?.image).length, size: b.parameters.size, n: Number(b.parameters.n) || 1,
        promptRewrite: b.parameters.prompt_extend === true, negativePrompt: b.parameters.negative_prompt ?? b.input?.negative_prompt ?? null }; }
    const ic = b?.generationConfig?.imageConfig; if (!ic) return null;
    const parts: any[] = b.contents?.[0]?.parts ?? [];
    return { model: spec.id, aspectRatio: typeof ic.aspectRatio === 'string' ? ic.aspectRatio : null, imageSize: typeof ic.imageSize === 'string' ? ic.imageSize : null, images: parts.filter((p) => p?.inlineData).length };
  } catch { return null; }
}
/** Video's "Workflow" line (2026-10-29): the model and mode, where it runs and the workflow's source, from the recorded credit (shared/appWorkflows.ts),
 *  e.g. "MiniMax H3 image to video · Comfy Cloud · official Comfy template". No credit recorded = no source named (never invented). */
export function videoWorkflowLine(a: { model: string | null; mode: string | null; place: string | null; workflow: Pick<WorkflowSource, 'source' | 'author'> | null }): string {
  const w = a.workflow; const src = !w ? '' : w.source === 'official' ? 'official Comfy template' : w.source === 'community' ? `community workflow by ${w.author.replace(/^@/, '')}` : 'ours';
  return [[a.model, a.mode?.toLowerCase()].filter(Boolean).join(' '), a.place, src].filter(Boolean).join(' · ');
}
/** A preview has no executed route yet. Name a place only when the requested routes agree. */
function videoRoutes(tool: ToolDef, provider: string, fields: Record<string, string>) {
  const ro = normRunOn(fields.runOn);
  return routesFor(provider, tool).filter(r => !r.comingSoon && (!fields.route || fields.route === 'auto' || r.routeId === fields.route) && (!ro || ro === 'auto' || runOnOfRoute(r) === ro));
}
function videoPlace(tool: ToolDef, provider: string, fields: Record<string, string>): string | null {
  const rs = videoRoutes(tool, provider, fields);
  const names = [...new Set(rs.map(r => r.routeId.startsWith('comfy-deploy:') ? PLACE_LABELS['comfy-deploy'] : r.kind === 'comfy-router' ? 'Comfy Router' : RUN_ON_LABELS[runOnOfRoute(r)]))];
  return names.length === 1 ? names[0] : null;
}
const isVideoTool = (tool: ToolDef) => /video/.test(String((tool.app as any)?.kind ?? ''));
/** The files a video run takes, in the bar's words. */
function videoInputs(mode: string | undefined, filled: Record<string, number>): string[] {
  const n = (k: string) => Math.max(0, Math.min(16, Math.floor(Number(filled[k]) || 0))); const out: string[] = [];
  if (n('image')) out.push(mode === 'r2v' ? 'Reference 1 (your photo)' : 'Start frame (your start frame)');
  if (n('lastFrame') && mode === 'flf') out.push('End frame (your end frame)');
  const base = mode === 'r2v' && n('image') ? 1 : 0;
  for (let i = 0; i < n('refs'); i++) out.push(`Reference ${base + i + 1} (your image)`);
  for (let i = 0; i < n('refVideos'); i++) out.push(`Reference clip ${i + 1} (your clip)`);
  for (let i = 0; i < n('refAudios'); i++) out.push(`Reference audio ${i + 1} (your audio)`);
  return out;
}

/** The form → what the job would receive. Provider defaults follow the submit (index.ts createJob): a locked provider wins, an app's file-driven mode
 *  picks its engine, else the tool's default (defaultFirst). */
export async function promptPeek(tool: ToolDef, fields0: Record<string, string>, filled: Record<string, number>, photo?: { width?: unknown; height?: unknown }) {
  const fields: Record<string, string> = Object.fromEntries(Object.entries(fields0 ?? {}).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
  const seedSent = fields.seed != null && fields.seed !== '';
  const name = placeholder(clampPx(photo?.width, 1024), clampPx(photo?.height, 1024)); const square = placeholder(1024, 1024);
  const files: Record<string, string[]> = {}; const video = isVideoTool(tool) || ['object-swap', 'motion-transfer'].includes(tool.id); const audio = AUDIO_TOOLS.includes(tool.id);
  for (const [k, n0] of Object.entries(filled ?? {})) { if (audio && FILE_WORDS[k]) { const n = Math.max(0, Math.min(8, Math.floor(Number(n0) || 0))); if (n) files[k] = Array.from({ length: n }, () => mediaPlaceholder(k === 'video' ? 'video' : 'audio')); continue; } if (video && (k === 'refVideos' || k === 'refAudios')) continue; /* measured by the parser: named in `inputs` instead */ const n = Math.max(0, Math.min(16, Math.floor(Number(n0) || 0))); if (n) files[k] = Array.from({ length: n }, (_, i) => (k === 'image' && i === 0 ? name : k === 'mask' ? name : square)); }
  const G = (tool.app as any)?.gallery;
  if (typeof G?.locked?.provider === 'string') fields.provider = G.locked.provider;
  if (!fields.provider && G?.providersByMode) { const qp = appQuoteParams(tool, { ...fields, ...Object.fromEntries(Object.keys(files).map((k) => [k, '1'])) }); if (qp.provider) fields.provider = qp.provider; }
  if (!fields.provider) { const ids = defaultFirst(tool, requestMode(tool, fields)); const first = ids[0] ?? toolProviders(tool)[0]?.id; if (first) fields.provider = first; }
  if (!fields.provider || !getProvider(fields.provider) || !tool.providers.includes(fields.provider)) return { error: `provider ${fields.provider ?? ''} is not supported by ${tool.id}`, code: 'invalid_provider' } as const;
  const swap = ['object-swap', 'motion-transfer'].includes(tool.id) && isCloudSwap(fields.provider);
  const h3Cloud = tool.id === 'object-swap' && fields.provider === 'comfy-h3-charswap' && (normRunOn(fields.runOn) === 'comfy-cloud' || fields.route === 'comfy-cloud:cloud-h3-charswap');
  const swapVideo = swap || h3Cloud;
  const base = G?.base ?? tool.id; const upscale = base === 'image-upscale' || tool.id === 'image-upscale'; /* upscale models take no prompt: a factor the model can't do is Generate's problem, not the peek's */
  const brand = applyBrandToFields(tool.id, fields); if (brand && 'error' in brand) return { error: brand.error, code: brand.issue.code, issues: [brand.issue] } as const; // Brand Kit: the same words the submit adds
  const parseFields = { ...fields }; if (swapVideo) { delete parseFields.trimStart; delete parseFields.trimEnd; }
  if (swap && Number(filled.refs) > 16) files.refs = Array.from({ length: Math.min(30, Math.floor(Number(filled.refs))) }, () => square);
  if (swapVideo) delete files.video; // replace the generic PNG placeholder with the measured bundled sample; never trim or upload it
  if (swapVideo && Number(filled.video) > 0) files.video = [mediaPlaceholder('video')];
  const parsed: any = await tool.parseInput(parseFields, files);
  if (parsed && typeof parsed.error === 'string' && !upscale) return { error: parsed.error, code: parsed.code ?? parsed.issues?.[0]?.code ?? 'invalid_input', issues: parsed.issues ?? null } as const;
  const provider = fields.provider; const parsedIn: any = parsed && typeof parsed.error === 'string' ? {} : parsed;
  /* prompt grammar (2026-10-26): show the words the model gets, with @image1 chips in its own syntax (the runners apply the same rewrite) */
  const place = /^(local|fal|replicate|direct)$/.test(String(fields.runOn ?? '')) ? String(fields.runOn) : /^comfy/.test(String(fields.runOn ?? '')) ? 'router' : undefined;
  const gKey = modelKeyOf(tool.id, provider, parsedIn); const input: any = withRefGrammar(parsedIn, gKey, h3Cloud ? 'local' : place);
  if (swapVideo) {
    const seconds = Number(fields.trimEnd) - Number(fields.trimStart || 0);
    if (Number.isFinite(seconds) && seconds > 0) input.duration = seconds;
    else delete input.duration; // the stand-in's measured length is not a fact about the user's clip
  }
  if (APPENDS_UNNAMED.has(gKey) && input.mode === 'r2v' && typeof input.finalPrompt === 'string') input.finalPrompt = appendUnnamed(input.finalPrompt, gKey, { image: refCountsOf(input).image }, place);
  const feat = featureOfJob({ toolId: tool.id, provider, input });
  /* a photo switched the app to an edit (Product Shot, Character Sheet): the edit graph runs, as the bar's model menu credits it (shared/workflows.ts) */
  const switched = feat && input.mode === 'edit' && featureById(feat.id)?.mode !== 'edit' ? workflowFor('edit-image', provider) : null;
  const wf = switched ?? feat?.workflow ?? null; const file = typeof input.workflow === 'string' && /-api\.json$/.test(input.workflow) ? input.workflow : wf?.file ?? null;
  const shots = Array.isArray(input.shots) && input.shots.length && input.shots.every((s: any) => typeof s?.prompt === 'string') ? input.shots.map((s: any) => ({ label: String(s.label ?? s.id ?? ''), prompt: String(s.prompt) })) : null;
  /* video: the recorded credit for this model (Generate Video and its apps) named in plain words; the full credit is the tooltip */
  const previewRoutes = video ? videoRoutes(tool, provider, fields) : [];
  const sourceJob = { toolId: tool.id, provider, input, route: previewRoutes.length === 1 ? previewRoutes[0].routeId : undefined };
  const vwf = video && !wf ? (jobWorkflow(sourceJob) ?? (base !== tool.id ? jobWorkflow({ ...sourceJob, toolId: base }) : null)) : null;
  const out: PromptPeek = { ok: true, prompt: upscale ? null : String(input.finalPrompt ?? input.prompt ?? ''), shots, noPrompt: upscale ? 'No prompt: the model upscales the photo' : typeof G?.noPrompt === 'string' ? G.noPrompt : null,
    provider, model: feat?.model ?? (video ? catalogFor(tool.id, provider)?.name : null) /* the bar's model name ("Seedance 2.0") */ ?? getProvider(provider)?.name ?? null, workflowFile: file ?? vwf?.file ?? null, workflowLine: wf ? workflowLine(wf) : null,
    settings: { aspect: input.aspectAuto === true && (!fields.aspect || fields.aspect === 'auto') ? 'auto' /* an edit on Match photo: the photo's shape, not the default the job also carries */ : input.aspect ?? fields.aspect ?? null, resolution: input.imageResolution ?? (video ? input.resolution ?? null : null), quality: input.tier ?? (video ? input.quality ?? null : null), n: video ? null : Number(input.n) || null, seed: seedSent && Number.isFinite(Number(input.seed)) ? Number(input.seed) : null, mode: input.mode ?? null,
      ...(video ? { duration: Number(input.duration) || null, audio: typeof input.audio === 'boolean' ? input.audio : null, bitrate: input.bitrate ?? null } : {}) },
    ...(video ? { inputs: videoInputs(input.mode, filled ?? {}) } : {}) };
  if (video && !wf) { out.workflowLine = videoWorkflowLine({ model: out.model, mode: (tool.presets ?? []).find((x) => x.id === input.mode)?.label ?? null, place: videoPlace(tool, provider, fields), workflow: vwf });
    out.workflowCredit = vwf ? workflowLine({ ...vwf, file: vwf.file ?? undefined, licence: vwf.licence ?? '' }) : null; }
  /* Face / Person Swap on Qwen Image 2.1: the BFS LoRA graph sends its trained prompt (+ touch-ups), not the composed one (comfy/plans.ts image) */
  const bfs = (input.refPaths?.length ?? 0) > 1 ? bfsSwapFor(tool.id, provider, input) : null;
  if (bfs) { out.prompt = bfsSwapPrompt(bfs, input.appPrompt); out.workflowFile = bfs.workflowFile; }
  if (swap) {
    // Pure wrapper used by the request builder itself, after the same reference grammar; never call the video body (it uploads).
    out.prompt = swapPromptOf(provider as 'router-kling-edit' | 'router-seedance-25-edit', input);
    out.settings.audio = input.keepAudio !== false;
    if (provider === 'router-seedance-25-edit') out.settings.aspect = 'adaptive';
    out.inputs = [tool.id === 'motion-transfer' ? 'Performance reference (your clip)' : 'Source scene (your clip)', ...((files.refs ?? []).map((_, n) => `Image ${n + 1} (your character image)`))];
  }
  if (h3Cloud) {
    out.prompt = composeH3SwapPrompt(input);
    out.promptNote = 'H3 keeps the replacement instructions and adds your direction. Your original words stay separate for Recreate. Masked runs also save two silent diagnostic previews; extra Cloud encoding/storage overhead is unmeasured and may add GPU-time cost.';
    out.settings.audio = input.keepAudio !== false;
    out.inputs = ['Source scene (your clip)', 'Picture 1 (your character image)'];
  }
  if (audio) { /* the Audio page: the exact text (script or prompt) plus the lyrics, and the model, voice, length and format */
    const outVideo = !!input.videoPath && !input.audioOnly; const sec = Number(input.outputDuration ?? input.duration) || null;
    const words = (k: string, i: number, n: number) => { const [a, b] = FILE_WORDS[k]; return `${k === 'audio' && input.mode === 'cover' ? 'Song' : a}${n > 1 ? ` ${i + 1}` : ''} (${k === 'audio' && input.mode === 'cover' ? 'your song' : b})`; };
    out.model = catalogFor(tool.id, provider)?.name ?? out.model; out.lyrics = typeof input.lyrics === 'string' ? input.lyrics : null;
    out.settings = { ...out.settings, aspect: null, resolution: null, quality: null, n: Number(input.n) > 1 ? Number(input.n) : null, duration: input.audioInput || input.videoPath ? null : sec,
      voice: tool.id === 'voice' || input.mode === 'voice' ? (input.voice ?? fields.voice ?? null) : null, language: input.mode === 'translate' ? (input.language ?? fields.language ?? null) : null,
      format: outVideo ? null : (input.voiceFields?.outputFormat ?? fields.outputFormat ?? null) };
    out.inputs = Object.entries(files).flatMap(([k, l]) => FILE_WORDS[k] ? l.map((_, i) => words(k, i, l.length)) : []);
  }
  out.request = await requestFields(provider, input);
  if (brand) out.brand = { id: brand.id, name: brand.name, phrase: brand.phrase, applied: brand.applied }; // "Brand: <name>" words, shown on their own line
  if (out.request?.layers) out.prompt = String(input.appPrompt ?? '').trim(); // Image to layers: only the user's words go out (none = auto-detect)
  return out;
}

export function registerPromptPeek(app: FastifyInstance, getTool: (id: string) => ToolDef | undefined) {
  app.post<{ Params: { toolId: string }; Body: { fields?: Record<string, string>; files?: Record<string, number>; photo?: { width?: number; height?: number } } }>('/api/tools/:toolId/prompt-peek', async (req, reply) => {
    const t = getTool(req.params.toolId); if (!t) return reply.code(404).send({ error: 'unknown tool' });
    const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
    const r = await promptPeek(t, b.fields ?? {}, b.files ?? {}, b.photo);
    if ('error' in r) return reply.code(400).send({ ok: false, error: r.error, code: r.code, ...('issues' in r && r.issues ? { issues: r.issues } : {}) });
    return r;
  });
}
