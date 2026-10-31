/**
 * Which of our hosted models run on Comfy Router, under which Router model id, with which request body and how the result is read.
 * Ids and bodies come from the public catalog and per-model pages (docs.comfy.org/development/comfy-router/models and
 * …/models/<provider>/<model>/code, "Schema → Input / Output", read 2026-10-22). The Router spec itself (router-openapi.yaml) carries no
 * model ids: the catalog is GET /v2/models, which needs a key.
 *
 * Key = our provider id; its native route `comfy-router:<id>` is the Router route (label "Comfy Cloud · partner API" today).
 * Not on Router (catalog checked): Hunyuan Image, Meta Muse, Fish Audio, Sonilo (music, video-to-music) → COMING_SOON (routes.ts). HeyGen Voice runs on
 * heygen/starfish since 2026-10-31.
 * Media inputs go inline (data: URIs or raw base64, as each schema asks); every Router request body is capped at 100 MiB. Fields whose schema takes a
 * file only as a URL (Kling edit video_list, Seedance reference / edit video) get a Comfy storage link (comfy/storage.ts, the official partner nodes' flow).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { imageSize, GEMINI_ASPECTS_10, GEMINI_ASPECTS_14, type ImageRes } from '../shared/imageCaps.js';
import { gptQuality, ltxVideoRequest, bflVideoRequest } from '../hostedRequests.js';
import { gptImageSize, gptAspectMessage, gpt15ImageSize, GPT15_ASPECTS } from '../shared/gptImageSizes.js';
import { routerImageSize, routerPhotoSize, routerAspectMessage, ROUTER_SIZE_RULES } from '../shared/routerImageSizes.js';
import { withFlux3BoxRows } from '../shared/layoutBoxes.js';
import { IDEOGRAM_SIZES, IDEOGRAM_ASPECTS, RECRAFT_ASPECTS, recraftSize, LUMA_ASPECTS, KLING_IMAGE_ASPECTS, KREA_ASPECTS, RUNWAY_RATIOS, GROK_IMAGE_ASPECTS, FLUX3_ASPECTS, FLUX2_ASPECTS, flux2Size, FIBO_ASPECTS, FIBO_WIDE_ASPECTS } from '../shared/hostedAspects.js';
import { imageDimsOfFile } from '../imageDims.js';
import { gptMaskBytes } from '../gptMask.js';
import { appendUnnamed } from '../shared/promptRefs.js';
import { runFfmpeg } from '../ffmpeg.js';
import { LAYER_ROUTER_IDS, layerLabel } from '../shared/imageLayers.js';
import { statSync } from 'node:fs';
import { optionsOf, hexToRgb, fiboStructured } from '../shared/imageOptions.js';
import { VIDEO_LIMITS, type VideoLimits } from '../tools/h3/videoCaps.js';
import { publicBase } from '../tools/h3/cloud.js';
import { H3_CAMERA_MOVES, H3_INTENSITY, H3_BASE_CAMERA, type H3Intensity } from '../tools/h3/catalog.js';
import { fillPattern } from '../shared/promptPatterns.js';
import { h3RouterExtendIssue, h3RouterExtendSeconds, h3ExtendLastFrame, joinRouterExtension, H3_ROUTER_EXTEND_LABEL } from '../tools/h3/routerExtend.js';
import { CLOUD_SWAP_MODELS, planPasses, swapPrompt, swapImagesMax, type SwapMode } from '../shared/cloudSwap.js';
import { videoInputLimits } from '../shared/videoFit.js';
import { preparePass, joinPasses } from '../swapClips.js';
import { hasClipUpload, clipLink } from './renderUpload.js';
import { renderModelOf, renderNeeds, renderBillSeconds, renderQualityOf, RENDER_KLING, RENDER_ALEPH, RENDER_RAY, RENDER_SEEDANCE } from '../shared/renderModels.js';
import { DATA_DIR } from '../config.js';
import { env } from '../env.js';
import { keyValue } from './keys.js';
import { handOff, bytesDataUri, kindOfFile, canLink as canLinkFor } from '../mediaHandoff.js';

export type RouterOut = { url?: string; b64?: string; mime?: string };
export interface RouterModelSpec {
  /** Router model id `{provider}/{model}`. */ id: string;
  /** When one model has two Router ids (FIBO 2.0: bria/image makes new images, bria/fibo edits): the id this job calls. Unset = `id`. */
  idFor?: (i: In) => string;
  /** Docs page the body follows. */ doc: string;
  out: 'image' | 'video' | 'audio';
  /** false = synchronous route (the queue refuses this model: raw audio bytes). */ queue: boolean;
  /** Reference images this route sends (0 = prompt only on this route). */ maxRefs: number;
  /** Tools whose jobs this body maps (tool id or app base). Unset = every tool of the model. On other tools the route stays as it was (not wired). */ tools?: string[];
  /** Takes an inpaint mask. */ mask?: boolean;
  /** Why this job can't run on this route (null = fine). Checked at quote / listing / submit when a Comfy key is set, so nothing is charged. */
  block?: (i: In) => string | null;
  /** Request body for output k (Create Image: one Router call per image, so the bill matches our per-image price). */
  body: (i: In, k: number) => Promise<Record<string, unknown>>;
  /** One call returns several results, all kept (Image to layers: the base plate and every layer); each output may carry its own `label`. */
  allOutputs?: boolean;
  /** Result files in the model's native output. A refusal reported inside a 200 (Gemini blockReason, Grok block_reason…) returns { refused }. */
  outputs: (j: any) => RouterOut[] | { refused: string };
  /** Requests one job makes when it isn't one per output (cloud swaps: passes × versions). */
  calls?: (i: In) => number;
  /** Share of the job's quote request k may cost (default 1 / calls): unequal passes are checked against their own share. */
  callShare?: (i: In, k: number) => number;
  /** After every request: turn the per-request files into the job's results (cloud swaps: join the passes, put the source sound back). */
  finish?: (job: { id: string; input: In }, outs: { label: string; url: string }[]) => Promise<{ label: string; url: string }[]>;
}
type In = Record<string, any>;
const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const mimeOf = (p: string) => MIME[path.extname(p).toLowerCase()] ?? 'application/octet-stream';
/** Inline media for a Router field, through the shared media hand-off (mediaHandoff.ts: size rules, one place for every provider). */
const b64 = (p: string) => handOff(p, kindOfFile(p), 'comfy-router', { accepts: ['base64'] });
const dataUri = (p: string) => handOff(p, kindOfFile(p), 'comfy-router', { accepts: ['data-uri'], mime: mimeOf(p) });
const DOC = (p: string) => `https://docs.comfy.org/development/comfy-router/models/${p}/code`;

// ---- job input helpers ----
const modeOf = (i: In) => { const t = Array.isArray(i.types) ? i.types[0] : typeof i.types === 'string' ? (() => { try { const x = JSON.parse(i.types); return Array.isArray(x) ? x[0] : x; } catch { return i.types.split(',')[0]; } })() : null; return String(t ?? i.mode ?? 'generate').trim(); };
const promptOf = (i: In, k = 0) => String((Array.isArray(i.shots) && i.shots[k]?.prompt) || i.hostedPrompt || i.finalPrompt || i.prompt || i.text || '');
/** Reference images of an image job (edit / inpaint: the image + more refs; a prompt-only job sends none). */
export const imageRefs = (i: In): string[] => (modeOf(i) === 'generate' ? [] : (Array.isArray(i.refPaths) && i.refPaths.length ? i.refPaths : i.imagePath ? [i.imagePath] : [])).filter((x: unknown): x is string => typeof x === 'string');
const seedOf = (i: In, k: number, max = 2147483647) => (Number.isInteger(i.seed) ? (Math.abs(i.seed) + k) % (max + 1) : undefined);
const aspectOf = (i: In) => (typeof i.aspect === 'string' && i.aspect && i.aspect !== 'auto' ? i.aspect : null);
const resOf = (i: In): ImageRes => (['0.75K', '1K', '1.5K', '2K', '4K'].includes(i.imageResolution) ? i.imageResolution : '1K');
const tierOf = (i: In) => { const q = String(i.tier ?? i.quality ?? 'med'); return /^(high|hd)$/i.test(q) ? 'high' : /^low$/i.test(q) ? 'low' : 'med'; };
const ratio = (a: string) => { const [x, y] = a.split(/[:x*]/).map(Number); return x / y; };
const nearest = (want: string | null, allowed: string[]) => { if (!want) return null; const t = ratio(want); return allowed.reduce((b, a) => (Math.abs(Math.log(ratio(a) / t)) < Math.abs(Math.log(ratio(b) / t)) ? a : b), allowed[0]); };
const omit = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as T;
const urls = (xs: any[] | undefined, key = 'url') => (xs ?? []).map((x) => (typeof x === 'string' ? x : x?.[key])).filter((u): u is string => typeof u === 'string' && /^(https?:|data:)/.test(u)).map((url) => ({ url }));

// ---- Upscale helpers ----
const upscaleFactorOf = (i: In) => Number(i.scale) || Number(String(modeOf(i)).replace(/^x/i, '')) || 2;
/** WaveSpeed SeedVR2 output tier for the asked size: the smallest of 2K (2560) / 4K (4096) / 8K (8192) long side that holds source × factor. */
export const seedvr2Tier = (i: In): '2k' | '4k' | '8k' => { const s = i.sourceSize ?? i.inputSize; const k = upscaleFactorOf(i);
  const long = s?.width && s?.height ? Math.max(s.width, s.height) * k : 1024 * k; return long <= 2560 ? '2k' : long <= 4096 ? '4k' : '8k'; };

// ---- Camera Moves, Photo FX and Orbit Shot on the prompt + first-frame video bodies (Seedance 2.0, MiniMax H3 partner) ----
/** Tool ids (besides Generate Video) whose jobs the Seedance / MiniMax H3 Router bodies map: the move, effect or orbit becomes our prompt recipe and the
 *  photo the first frame. Orbit Shot is the gallery app on the Director; the Director itself stays off Router (its jobs don't map to these bodies). */
export const ROUTER_VIDEO_APPS = ['camera', 'photo-fx', 'app-orbit-shot'];
type VideoApp = 'camera' | 'photo-fx' | 'orbit';
/** Which app a job came from (job input shape: tools/apps.ts makeApp mode = tool id; Orbit Shot = a Director generate job). */
export const videoAppOf = (i: In): VideoApp | null => (i.mode === 'camera' ? 'camera' : i.mode === 'photo-fx' ? 'photo-fx' : i.cinemaMode === 'generate' ? 'orbit' : null);
/** The photo that becomes the first frame: the start image (Camera Moves, Photo FX) or the subject photo (Orbit Shot: refs[0]). */
const appFrameOf = (i: In): string | null => (typeof i.imagePath === 'string' && i.imagePath ? i.imagePath : videoAppOf(i) === 'orbit' && typeof i.refPaths?.[0] === 'string' ? i.refPaths[0] : null);
const clause = (s: unknown) => String(s ?? '').trim().replace(/[.\s]+$/, '');
const sentences = (...xs: unknown[]) => `${xs.map(clause).filter(Boolean).join('. ')}.`;
/** Our prompt recipe per app (our own words around the tool's preset text). */
export function videoAppPrompt(i: In): string {
  const app = videoAppOf(i); const frame = !!appFrameOf(i); const end = 'One continuous shot, no cuts';
  if (app === 'camera') return sentences(`Camera move: ${clause(i.typePrompt)}`, i.prompt, frame ? 'Start exactly on the first frame and keep its subject, setting and look; only the camera moves' : '',
    i.enhance ? fillPattern('camera-enhance', null) : '', end);
  if (app === 'photo-fx') return sentences(`Bring this photo to life with one effect: ${clause(i.typePrompt)}`, i.prompt, 'Start exactly on the first frame and keep the subject recognisable', end);
  // Orbit Shot: finalPrompt = subject (or the auto subject) + backdrop, "Camera: <orbit phrase>", emotion and look (cinema/tool.ts)
  return sentences('Orbit shot around the subject', i.finalPrompt ?? i.prompt, 'Start exactly on the first frame (the subject photo) and keep the subject the same from every side', end);
}
/** The first frame as a data URI. An asked aspect (not auto) is applied by centre-cropping the photo to it, so the clip ('adaptive' ratio = the frame's) has it. */
async function frameUri(p: string, aspect: string | null): Promise<string> {
  if (!aspect) return dataUri(p);
  const out = path.join(path.dirname(p), `${path.basename(p, path.extname(p))}-ar${aspect.replace(/[^0-9]+/g, 'x')}.png`); const r = ratio(aspect);
  if (await runFfmpeg(['-v', 'error', '-y', '-i', p, '-vf', `crop='min(iw,trunc(ih*${r}/2)*2)':'min(ih,trunc(iw/${r}/2)*2)'`, '-frames:v', '1', out]) !== 0) throw new Error(`the photo could not be cropped to ${aspect}`);
  return dataUri(out);
}
/** One photo in, no other images: these bodies send the photo as the first frame only (no reference images next to it). */
const appBlock = (name: string) => (i: In) => { const app = videoAppOf(i); if (!app) return null;
  if (app !== 'camera' && Array.isArray(i.refPaths) && !appFrameOf(i)) return `${name} on Comfy Router needs your photo here (it becomes the first frame)`;
  const n = Array.isArray(i.refPaths) ? i.refPaths.length : 0;
  return n > 1 ? `${name} on Comfy Router takes one photo here (it becomes the first frame); remove the ${n - 1} extra image${n > 2 ? 's' : ''} or pick another model` : null; };
/** Mode, prompt and first frame a video body sends: Generate Video jobs as they are; app jobs → i2v with our recipe (t2v for a Camera Moves job without a photo). */
const videoJob = (i: In) => { const app = videoAppOf(i); if (!app) return { m: String(i.mode ?? modeOf(i)), text: promptOf(i), frame: i.imagePath as string | undefined, aspect: null as string | null };
  const frame = appFrameOf(i); return { m: frame ? 'i2v' : 't2v', text: videoAppPrompt(i), frame: frame ?? undefined, aspect: frame ? aspectOf(i) : null }; };

const GEN_MODES = ['t2v', 'i2v', 'flf', 'r2v'];
/** Reference images a video body sends (r2v only, up to 9 unless the model says otherwise; first / last frames are not references). The quote counts the same list. */
const videoRefPaths = (i: In, max = 9): string[] => (videoJob(i).m === 'r2v' ? (i.refPaths ?? (i.imagePath ? [i.imagePath] : [])).slice(0, max) : []);
/** Reference images a Generate Video job asks for (before the route's cap): more than the route takes is refused, never silently dropped. */
const videoRefCount = (i: In): number => (videoJob(i).m === 'r2v' ? (Array.isArray(i.refPaths) ? i.refPaths.length : i.imagePath ? 1 : 0) : 0);
const pathsOf = (x: unknown): string[] => (Array.isArray(x) ? x.filter((p): p is string => typeof p === 'string' && !!p) : []);
/** Reference videos / audio clips a job carries (Generate Video's Reference to video: job refVideoPaths / refAudioPaths). */
const avRefs = (i: In) => ({ vids: pathsOf(i.refVideoPaths), auds: pathsOf(i.refAudioPaths) });
const extOk = (p: string, exts: string[] | undefined) => !exts || exts.includes(path.extname(p).slice(1).toLowerCase());
const fileBytes = (p: string) => { try { return statSync(p).size; } catch { return 0; } };
/** Router refuses a body over 100 MiB; base64 adds 4/3 (docs.comfy.org/development/comfy-router/limitations#request-bodies-are-capped). 1 MiB kept for the prompt and JSON. */
export const ROUTER_BODY_CAP = 104_857_600; const INLINE_ROOM = ROUTER_BODY_CAP - 1_048_576;
const mb = (n: number) => `${Math.round(n / 1e5) / 10} MB`;
/** Reference videos and audio on the Seedance 2.0 / MiniMax H3 Router bodies (2026-10-24, the model pages' content schema):
 *  - reference_video / reference_audio content items (type video_url / audio_url) in Reference to video only. H3: "Keyframe roles and reference_* roles
 *    are mutually exclusive within a request", so a job with a first / last frame AND reference media is refused (Seedance the same; our bodies never mix them).
 *  - limits = the model's videoCaps row (counts, clip lengths, total, frame rate, formats, no audio alone), re-checked here on the job's own probed lengths,
 *    so a job that slips past the form is still refused before any call.
 *  - Seedance takes a reference VIDEO only as a public URL or asset:// (its schema has no base64 for video): uploaded to Comfy storage and registered as a
 *    Seedance asset (mediaLink), as ComfyUI's own Seedance node does. H3 takes data URIs.
 *  - everything sent inline counts against Router's 100 MiB body cap. */
type AvRoute = { name: string; L: VideoLimits; videoInline: boolean; /** Seedance audio form data:audio/<wav|mp3> */ seedanceAudio?: boolean };
const AV: Record<'router-seedance' | 'router-seedance-20-fast' | 'router-seedance-20-mini' | 'router-seedance-25' | 'api-minimax-h3', AvRoute> = {
  'router-seedance': { name: 'Seedance 2.0', L: VIDEO_LIMITS['router-seedance'], videoInline: false, seedanceAudio: true },
  // 2026-10-25: the other Seedance Router places, same schema (their videoCaps rows say which kinds each takes; 2.5 takes no reference videos here)
  'router-seedance-20-fast': { name: 'Seedance 2.0 Fast', L: VIDEO_LIMITS['router-seedance-20-fast'], videoInline: false, seedanceAudio: true },
  'router-seedance-20-mini': { name: 'Seedance 2.0 Mini', L: VIDEO_LIMITS['router-seedance-20-mini'], videoInline: false, seedanceAudio: true },
  'router-seedance-25': { name: 'Seedance 2.5', L: VIDEO_LIMITS['router-seedance-25'], videoInline: false, seedanceAudio: true },
  'api-minimax-h3': { name: 'MiniMax H3', L: VIDEO_LIMITS['api-minimax-h3'], videoInline: true },
};
type AvId = keyof typeof AV;
const nums = (x: unknown): number[] => (Array.isArray(x) ? x.map(Number) : []);
/** Why this job's reference videos / audio can't go to this route (null = fine, or none). Same check in `block` (quote / submit) and in the body. */
export function avRefIssue(id: AvId, i: In): string | null {
  const { name, L, videoInline } = AV[id]; const { vids, auds } = avRefs(i); const m = videoJob(i).m;
  if (!vids.length && !auds.length) return null;
  if (m !== 'r2v') return m === 'i2v' || m === 'flf' ? `${name} on Comfy Router can't mix a first or last frame with reference videos or audio; use Reference to video, or remove the clips` : `${name} on Comfy Router takes reference videos and audio in Reference to video only`;
  const k = L.refKinds; const fmt = L.refFormats; const up = (xs: string[]) => xs.map((x) => x.toUpperCase()).join(' or ');
  if (vids.length > (k.video ?? 0)) return `${name} takes up to ${k.video ?? 0} reference videos; you added ${vids.length}`;
  if (auds.length > (k.audio ?? 0)) return `${name} takes up to ${k.audio ?? 0} reference audio clips; you added ${auds.length}`;
  if (vids.some((v) => !extOk(v, fmt?.video))) return `${name} takes reference videos as ${up(fmt!.video!)}`;
  if (auds.some((a) => !extOk(a, fmt?.audio))) return `${name} takes reference audio as ${up(fmt!.audio!)}`;
  if (L.audioNeedsVisualRef && auds.length && !vids.length && !videoRefPaths(i, k.image ?? 9).length) return `${name} takes reference audio only next to a reference image or video`;
  const RV = L.refVideoSeconds; const vs = nums(i.refVideoSecondsEach);
  if (RV && vids.length) {
    if (vs.length !== vids.length || vs.some((x) => !(x > 0))) return `${name}: the reference videos' lengths couldn't be read; add them again`;
    const tot = vs.reduce((a, b) => a + b, 0);
    if (vs.some((x) => x < RV.minEach)) return `${name}: each reference video must be at least ${RV.minEach} s`;
    if (RV.maxEach && vs.some((x) => x > RV.maxEach!)) return `${name}: each reference video can be at most ${RV.maxEach} s`;
    if (tot > RV.maxTotal + 1e-9) return `${name}: reference videos can add up to ${RV.maxTotal} s; yours are ${Math.round(tot * 100) / 100} s`;
    const fps = nums(i.refVideoFps); if (RV.fps && fps.some((x) => x > 0 && (x < RV.fps![0] - 0.01 || x > RV.fps![1] + 0.01))) return `${name}: reference videos must run at ${RV.fps[0]}–${RV.fps[1]} frames per second`;
  }
  const RA = L.refAudioSeconds; const as = nums(i.refAudioSecondsEach);
  if (RA && auds.length) {
    if (as.length !== auds.length || as.some((x) => !(x > 0))) return `${name}: the reference audio lengths couldn't be read; add them again`;
    const tot = as.reduce((a, b) => a + b, 0);
    if (as.some((x) => x < RA.minEach)) return `${name}: each reference audio clip must be at least ${RA.minEach} s`;
    if (RA.maxEach && as.some((x) => x > RA.maxEach!)) return `${name}: each reference audio clip can be at most ${RA.maxEach} s`;
    if (tot > RA.maxTotal + 1e-9) return `${name}: reference audio can add up to ${RA.maxTotal} s; yours is ${Math.round(tot * 100) / 100} s`;
  }
  if (vids.length && !videoInline && !canLink()) return `${name} on Comfy Router takes reference videos as a link, uploaded with your Comfy key: add the key in Settings, or use MiniMax H3, which takes the clip directly`;
  const inline = [...videoRefPaths(i, k.image ?? 9), ...auds, ...(videoInline ? vids : [])].reduce((a, p) => a + fileBytes(p), 0) * 4 / 3;
  if (inline > INLINE_ROOM) return `${name}: your references are ${mb(inline * 3 / 4)}; Comfy Router takes about ${mb(INLINE_ROOM * 3 / 4)} of media per request. Use shorter or smaller clips`;
  return null;
}
/** Seedance audio data URI: data:audio/<format>;base64 (the schema's own form, lower-case format: wav or mp3). */
const seedanceAudioUri = (p: string) => handOff(p, 'audio', 'comfy-router', { accepts: ['data-uri'], mime: `audio/${path.extname(p).slice(1).toLowerCase() === 'wav' ? 'wav' : 'mp3'}` });
/** Comfy key set (the upload uses it), or the server's own public address (OPENHIGGSFIELD_PUBLIC_BASE_URL, keyless fallback). */
const hasComfyKey = () => !!keyValue({ envKey: 'COMFY_API_KEY', envAliases: [] });
const canLink = () => canLinkFor('comfy-router');
/** Seedance: register uploads as Seedance assets (asset://, the official node's flow). OPENHIGGSFIELD_SEEDANCE_ASSETS=0 sends the plain storage link instead. */
const seedanceAssets = () => !/^(0|false|off|no)$/i.test(env('SEEDANCE_ASSETS') ?? '');
/** A local file as a link the model fetches: Comfy storage with the key (comfy/storage.ts; Seedance: a registered asset), else the server's public
 *  address (+ /files/<name>, the route the API serves every upload on). Throws (no call made) when neither is there. */
export async function mediaLink(p: string, name: string, seedance = false): Promise<string> {
  return handOff(p, kindOfFile(p), 'comfy-router', { accepts: ['url'], who: `${name} on Comfy Router`, seedanceAsset: seedance && seedanceAssets() });
}
/** Adds the reference_video / reference_audio content items of a video body. Throws (so no call is made) on a job the route refuses. */
async function avContent(id: AvId, i: In, content: any[]): Promise<void> {
  const bad = avRefIssue(id, i); if (bad) throw new Error(bad); const { vids, auds } = avRefs(i); if (!vids.length && !auds.length) return;
  if (content.some((c) => c.role === 'first_frame' || c.role === 'last_frame')) throw new Error(`${AV[id].name}: keyframes and reference media can't be sent together`);
  for (const v of vids) content.push({ type: 'video_url', video_url: { url: AV[id].videoInline ? await dataUri(v) : await mediaLink(v, AV[id].name, true) }, role: 'reference_video' });
  for (const a of auds) content.push({ type: 'audio_url', audio_url: { url: AV[id].seedanceAudio ? await seedanceAudioUri(a) : await dataUri(a) }, role: 'reference_audio' });
}
/** Router video bodies cover Generate Video jobs (text, first / last frame, reference images; on Seedance / MiniMax H3 also reference videos and audio) and,
 *  on Seedance / MiniMax H3, the app jobs above. Swaps, re-shoots, talking photos and other jobs with a source video or speech track can't be expressed in
 *  these bodies, so the route refuses them (always, also keyless: a sample of a job the real run can't do would mislead). `av` = the route's
 *  reference-media rules (Seedance / H3); without it a job with reference videos or audio is refused. */
const noVideoRefs = (name: string, apps = false, av?: AvId) => (i: In) => (!(apps && videoAppOf(i)) && !GEN_MODES.includes(String(i.mode ?? modeOf(i))) ? `${name} on Comfy Router runs Generate Video jobs here (text, first or last frame, reference images${av ? ', videos or audio' : ''})`
  : i.videoPath || i.speechPath ? `${name} on Comfy Router doesn't take a source video or speech track here; that job runs on another route`
  : !av && (pathsOf(i.refVideoPaths).length || pathsOf(i.refAudioPaths).length) ? `${name} on Comfy Router takes a prompt and images here; jobs with reference videos or audio run on another route`
  : (av ? avRefIssue(av, i) : null) ?? (apps ? appBlock(name)(i) : null));
/** H3 Camera Motion on Router (prompt-directed): the move id → its phrase, the intensity → an adverb (tools/h3/catalog.ts, the LoRA's move set). */
const h3MoveOf = (i: In) => { const id = Array.isArray(i.types) ? String(i.types[0] ?? '') : modeOf(i); return H3_CAMERA_MOVES.find((m) => m[0] === id) ?? null; };
const h3IntensityOf = (i: In): H3Intensity => ((i.fields?.intensity ?? i.intensity) === 'aggressive' ? 'aggressive' : 'slow');
/** The move in base H3's camera grammar (no LoRA trigger; shared/promptPatterns.ts camera-move): "The camera pushes in with small amplitude at slow
 *  speed toward the subject", then the user's words and our first-frame rule. Slow = small amplitude, slow speed; Aggressive = large, fast. */
export function h3CameraRouterPrompt(i: In): string { const mv = h3MoveOf(i) ?? H3_CAMERA_MOVES[0]; const it = H3_INTENSITY[h3IntensityOf(i)]; const b = H3_BASE_CAMERA[mv[0]];
  const line = fillPattern('camera-move', 'minimax-h3', { move: b?.move ?? mv[2], amplitude: it.amplitude, speed: it.speed, target: b?.target });
  return sentences(line, i.prompt, 'Start exactly on the first frame and keep its subject, setting and look; only the camera moves', 'One continuous shot, no cuts'); }
/** MiniMax H3 lengths on Comfy Router: 4–15 s (comfy-docs pages/development/comfy-router/models/minimax/minimax-h3/code.md, duration). */
export const H3_ROUTER_SECONDS = { min: 4, max: 15 } as const;
/** A camera move shorter than 4 s (Camera Moves offers 3 s) is made, and billed, as 4 s; never refused (2026-10-28). Quote and body share it. */
export const h3CameraRouterSeconds = (i: In) => Math.min(H3_ROUTER_SECONDS.max, Math.max(H3_ROUTER_SECONDS.min, Math.round(Number(i.duration) || 5)));
export function h3CameraRouterIssue(i: In): string | null {
  if (!h3MoveOf(i)) return 'H3 Camera Motion on Comfy Router runs the H3 camera moves only';
  return null;
}
/** The note shown when the camera move's length was rounded to what MiniMax H3 makes (null = kept as asked). */
export function h3CameraRouterNote(i: In): string | null {
  const asked = Number(i.duration); if (!(asked > 0)) return null; const made = h3CameraRouterSeconds(i);
  return made === asked ? null : `MiniMax H3 on Comfy Router makes clips of ${H3_ROUTER_SECONDS.min}–${H3_ROUTER_SECONDS.max} s, so this ${asked} s camera move is made (and charged) as ${made} s.`;
}
/** H3 Talking Photo on Router (F2): the portrait, the speech limits (H3 reference audio: 2–15 s, MP3 / WAV; other formats are converted to WAV in the body). */
const h3Portrait = (i: In): string | undefined => (typeof i.imagePath === 'string' && i.imagePath ? i.imagePath : pathsOf(i.refPaths)[0]);
export const H3_SPEECH_SECONDS = { min: 2, max: 15 } as const;
export function h3LipsyncIssue(i: In): string | null {
  if (String(i.mode ?? modeOf(i)) !== 'lipsync') return 'H3 Talking Photo on Comfy Router makes talking photos only';
  if (i.videoPath || pathsOf(i.refVideoPaths).length) return "H3 Talking Photo on Comfy Router takes a portrait and a speech clip, not a video";
  const s = Number(i.speechSeconds);
  // longer than 15 s: not refused; every format is cut to the first 15 s (routerSpeech) and the job says so (h3LipsyncNote, 2026-10-28)
  if (s > 0 && s < H3_SPEECH_SECONDS.min) return `MiniMax H3 on Comfy Router needs at least ${H3_SPEECH_SECONDS.min} s of speech; yours is ${Math.round(s * 10) / 10} s`;
  // the job parser requires the portrait and the speech; a real job (files attached) without a portrait can't send its speech (audio needs an image next to it)
  if (typeof i.speechPath === 'string' && i.speechPath && !h3Portrait(i)) return 'H3 Talking Photo needs a portrait: the speech goes in as reference audio, which MiniMax H3 takes only next to an image';
  return null;
}
/** Output length: the speech length, rounded up, 5–15 s (MiniMax's minimum is 5 s; a shorter speech plays, then the clip runs on). Quote and body share it. */
export const h3LipsyncSeconds = (i: In) => Math.min(H3_SPEECH_SECONDS.max, Math.max(5, Math.ceil(Number(i.speechSeconds ?? i.duration) || 5)));
/** Speech over 15 s: the note shown on the quote and the job (null = it fits). */
export function h3LipsyncNote(i: In): string | null {
  const s = Number(i.speechSeconds); if (!(s > H3_SPEECH_SECONDS.max + 0.05)) return null;
  return `Speech longer than ${H3_SPEECH_SECONDS.max} s: only the first ${H3_SPEECH_SECONDS.max} s are used.`; // same words as the job parser's warning (tools/h3/index.ts), so the job shows it once
}
/** Speech as Router takes it: MP3 / WAV up to 15 s as is; anything else (M4A, OGG…) and any longer clip becomes a WAV of the first 15 s next to it.
 *  One rule for every format (2026-10-28): before, a long MP3 / WAV was refused while a long M4A was cut. */
async function routerSpeech(p: string, seconds?: number): Promise<string> {
  if (/\.(mp3|wav)$/i.test(p) && !(Number(seconds) > H3_SPEECH_SECONDS.max + 0.05)) return p;
  const out = path.join(path.dirname(p), `${path.basename(p, path.extname(p))}-router.wav`);
  if (await runFfmpeg(['-v', 'error', '-y', '-i', p, '-t', String(H3_SPEECH_SECONDS.max), '-ac', '2', '-ar', '44100', out]) !== 0) throw new Error('the speech audio could not be converted to WAV for MiniMax H3');
  return out;
}
/** Kling 3.0 Omni (router-kling): reference images per request (KlingOmniProImageToVideoNode: "up to seven"), the prompt cap (schema maxLength 2500). */
export const KLING_OMNI_REFS = 7; const KLING_PROMPT_MAX = 2500;
const klingOmniIssue = (i: In): string | null => { const { m, text } = videoJob(i); if (text.length > KLING_PROMPT_MAX) return `Kling 3.0 Omni takes prompts up to ${KLING_PROMPT_MAX.toLocaleString('en-US')} characters; yours is ${text.length.toLocaleString('en-US')}. Shorten it`;
  const n = m === 'r2v' ? (i.refPaths ?? (i.imagePath ? [i.imagePath] : [])).length : 0; return n > KLING_OMNI_REFS ? `Kling 3.0 Omni takes up to ${KLING_OMNI_REFS} reference images; you added ${n}` : null; };
/** Kling names reference images <<<image_N>>> in the prompt. The runner has already turned the user's @image1 chips into tags (routing/jobRefs.ts);
 *  images the prompt still doesn't name are listed at the end, in order, so every one is used (shared/promptRefs.ts appendUnnamed: never double-tagged). */
const klingRefPrompt = (text: string, n: number) => appendUnnamed(text, 'kling-v3', { image: n });
/** Wan 3.0 (router-wan3): reference images per request (Router media description: reference_image max 10). */
export const WAN3_REFS = 10;
/** LTX-2.5 Pro on Comfy Router: lengths (one table: VIDEO_LIMITS router-ltx-25-pro) and what the Router schema can't express. */
const LTX_ROUTER_SECONDS = VIDEO_LIMITS['router-ltx-25-pro'].durations;
const ltxRouterIssue = (i: In): string | null => ((i.mode ?? modeOf(i)) !== 't2v' || i.imagePath ? 'LTX-2.5 Pro on Comfy Router does text to video only (its Router schema has no image input); image to video and first + last frame run on Comfy Cloud (LTX-2.5 partner node)'
  : i.aspect && i.aspect !== 'auto' && !['16:9', '9:16'].includes(i.aspect) ? `LTX-2.5 Pro on Comfy Router makes 16:9 or 9:16; ${i.aspect} runs on the LTX API`
  : i.resolution && !['720p', '1080p'].includes(String(i.resolution)) ? `LTX-2.5 Pro on Comfy Router makes 720p or 1080p; ${i.resolution} runs on the LTX API` : null);
/** FLUX 3 Video on Comfy Router: no reference images, no draft; 720p / 1080p / 1440p / 4K (hd / fhd / qhd / uhd, VIDEO_LIMITS router-flux3-video). */
const flux3RouterIssue = (i: In): string | null => ((i.mode ?? modeOf(i)) === 'r2v' ? 'FLUX 3 Video on Comfy Router takes text, a first frame or first + last frame; it has no reference images'
  : i.draft ? 'FLUX 3 Video on Comfy Router has no draft mode; drafts run on the BFL API'
  : i.resolution && !VIDEO_LIMITS['router-flux3-video'].resolutions.some((r) => r.toLowerCase() === String(i.resolution).toLowerCase()) ? `FLUX 3 Video on Comfy Router makes ${VIDEO_LIMITS['router-flux3-video'].resolutions.join(', ')}; ${i.resolution} runs on the BFL API` : null);
const imageBlock = (name: string, max: number, mask = false) => (i: In) => {
  if (modeOf(i) === 'inpaint' && !mask) return `${name} on Comfy Router doesn't take a mask; inpaint runs on another route`;
  const n = imageRefs(i).length; if (n > max) return max ? `${name} on Comfy Router takes up to ${max} reference image${max > 1 ? 's' : ''}; you added ${n}` : `${name} on Comfy Router makes new images from a prompt only; it takes no reference image`;
  return null;
};
const img = (o: Omit<RouterModelSpec, 'out' | 'queue' | 'block'> & { name: string; block?: RouterModelSpec['block'] }): RouterModelSpec =>
  ({ out: 'image', queue: true, ...o, block: (i) => imageBlock(o.name, o.maxRefs, o.mask)(i) ?? o.block?.(i) ?? null });

// ---- Create Image body families (one per Router schema; several Router ids share each schema) ----
/** OpenAI gpt-image schema (gpt-image-2 / 2.5-flare / 2.5-sunburst): `image` present = edit, mask = PNG with alpha (transparent = replaced).
 *  size = the exact WIDTHxHEIGHT for the picked shape and 1K / 2K / 4K (shared/gptImageSizes.ts: the list the bar offers and checkImageCaps enforces).
 *  Never snapped and never "auto": a shape off the list is refused by `block` (quote / submit) and by the body itself, so no call is made.
 *  No shape at all (an old client) = 1:1. quality = low / medium / high as picked; n = 1 (one request per image, so the bill matches the per-image quote). */
export const gptSizeOf = (i: In): string | null => gptImageSize(aspectOf(i) ?? '1:1', resOf(i));
const gptSizeIssue = (i: In): string | null => (gptSizeOf(i) ? null : gptAspectMessage(aspectOf(i) ?? '1:1'));
const gptBody = async (i: In, k: number) => { const bad = gptSizeIssue(i); if (bad) throw new Error(bad); const refs = imageRefs(i);
  const mask = modeOf(i) === 'inpaint' ? bytesDataUri(await gptMaskBytes(i.maskPath, refs[0], 'comfy-router'), 'image/png') : undefined;
  return omit({ prompt: promptOf(i, k), quality: gptQuality(tierOf(i)), size: gptSizeOf(i)!, n: 1, output_format: 'png',
    image: refs.length ? await Promise.all(refs.map(dataUri)) : undefined, mask }); };
/** GPT Image 1.5 (2026-10-25, models/openai/gpt-image-1-5): the same gpt-image schema, but only 1024x1024 / 1024x1536 / 1536x1024 (shared/gptImageSizes.ts
 *  GPT15_*: 1:1, 2:3, 3:2 at 1K). Any other shape or 2K / 4K is refused by `block` and by the body (never snapped, never "auto"). */
export const gpt15SizeOf = (i: In): string | null => gpt15ImageSize(aspectOf(i) ?? '1:1', resOf(i));
const gpt15SizeIssue = (i: In): string | null => (gpt15SizeOf(i) ? null : resOf(i) !== '1K' ? `Resolution ${resOf(i)} isn't offered by this model (1K).` : gptAspectMessage(aspectOf(i) ?? '1:1', GPT15_ASPECTS));
const gpt15Body = async (i: In, k: number) => { const bad = gpt15SizeIssue(i); if (bad) throw new Error(bad); const refs = imageRefs(i);
  const mask = modeOf(i) === 'inpaint' ? bytesDataUri(await gptMaskBytes(i.maskPath, refs[0], 'comfy-router'), 'image/png') : undefined;
  return omit({ prompt: promptOf(i, k), quality: gptQuality(tierOf(i)), size: gpt15SizeOf(i)!, n: 1, output_format: 'png',
    image: refs.length ? await Promise.all(refs.map(dataUri)) : undefined, mask }); };
const gptOutputs = (j: any) => (j?.data ?? []).map((d: any) => (d?.b64_json ? { b64: d.b64_json, mime: 'image/png' } : { url: d?.url })).filter((x: RouterOut) => x.b64 || x.url);
/** Exact size for the free WIDTH×HEIGHT models (shared/routerImageSizes.ts: Seedream 5.0 Pro / Flash, Qwen Image 3.0 / Pro, Wan 2.5): the picked shape at
 *  1K / 2K from the table the bar offers, or, on an edit on Match photo (input.aspectAuto with a photo), the photo's own shape at that size. Never snapped:
 *  a shape off the list (or a photo whose shape is outside the model's range) is refused by `block` and by the body, so no call is made. No shape = 1:1. */
export const routerSizeOf = (provider: string, i: In): string | null => { const refs = imageRefs(i);
  if (i.aspectAuto === true && refs.length) return routerPhotoSize(provider, resOf(i), imageDimsOfFile(refs[0]));
  return routerImageSize(provider, aspectOf(i) ?? '1:1', resOf(i)); };
export const routerSizeIssue = (provider: string) => (i: In): string | null => { if (routerSizeOf(provider, i)) return null; const r = ROUTER_SIZE_RULES[provider];
  if (i.aspectAuto === true && imageRefs(i).length) return `Match photo: this photo's shape is outside what the model takes (up to ${r?.maxRatio ?? '?'}:1 either way), or its size couldn't be read; pick a shape instead.`;
  if (!r?.res[resOf(i) as '1K' | '2K']) return `Resolution ${resOf(i)} isn't offered by this model (${Object.keys(r?.res ?? {}).join(', ')}).`;
  return routerAspectMessage(aspectOf(i) ?? '1:1'); };
const sizeOrThrow = (provider: string, i: In) => { const bad = routerSizeIssue(provider)(i); if (bad) throw new Error(bad); return routerSizeOf(provider, i)!; };
/** Negative prompt (Qwen, Wan): only what the bar or API sent (shared/imageCaps.ts extras). */
const negOf = (i: In) => (typeof i.negativePrompt === 'string' && i.negativePrompt.trim() ? i.negativePrompt.trim() : undefined);
/** BytePlus Seedream schema (5.0 Pro / Flash), checked 2026-10-24 against the Router pages: prompt, size method 2 (the exact WxH above), seed −1…2³¹−1,
 *  image = 1–10 data URIs, response_format url, output_format png, watermark false. Not sent: sequential_image_generation / stream (5.0 lite / 4.5 / 4.0
 *  only: 5.0 Pro and Flash refuse them), guidance_scale (not on 5.0), optimize_prompt_options (Pro takes only its default, standard; Flash none). */
const seedreamBody = (provider: string) => async (i: In, k: number) => { const size = sizeOrThrow(provider, i); const refs = imageRefs(i);
  return omit({ prompt: promptOf(i, k), size, seed: seedOf(i, k), response_format: 'url', output_format: 'png', watermark: false,
    image: refs.length ? await Promise.all(refs.map(dataUri)) : undefined }); };
/** No resolution on the job (an old client or a bare API quote) = 2K, Seedream 4.5's smallest (imageCaps.ts default), never 1K (not offered). */
const at2K = (i: In): In => (i.imageResolution ? i : { ...i, imageResolution: '2K' });
/** Seedream 4.5 (2026-10-25, models/byteplus/seedream-4-5-251128, the same BytePlus schema): size method 2 (the exact WxH at 2K / 4K, shared/routerImageSizes.ts),
 *  1–14 images as data URIs (schema maxItems 14; BytePlus: inputs + outputs ≤ 15), sequential_image_generation "disabled" (4.5 takes it; one image per
 *  request, so the bill matches the per-image quote), seed, response_format url, watermark false. Not sent: output_format (5.0 only), guidance_scale (not on 4.5). */
const seedream45Body = async (j: In, k: number) => { const i = at2K(j); const size = sizeOrThrow('api-seedream-45', i); const refs = imageRefs(i);
  return omit({ prompt: promptOf(i, k), size, seed: seedOf(i, k), sequential_image_generation: 'disabled', response_format: 'url', watermark: false,
    image: refs.length ? await Promise.all(refs.map(dataUri)) : undefined }); };
/** xAI resolution enum is 1k / 2k: a 4K (or any other) pick is refused, never sent as 1k. */
const grokResIssue = (i: In): string | null => (['1K', '2K'].includes(resOf(i)) ? null : `Resolution ${resOf(i)} isn't offered by this model (1K, 2K).`);
/** xAI Grok Imagine result: data[].url (or b64_json); block_reason inside a 200 = refused. */
const grokOutputs = (j: any) => (j?.block_reason ? { refused: String(j.block_reason) } : (j?.data ?? []).map((d: any) => (d?.url ? { url: d.url } : d?.b64_json ? { b64: d.b64_json, mime: d.mime_type ?? 'image/png' } : {})).filter((x: RouterOut) => x.url || x.b64));
const seedreamOutputs = (j: any) => (j?.error?.code ? { refused: String(j.error.message ?? j.error.code) } : urls(j?.data));
/** Bria FIBO 2.0 on Comfy Router (2026-10-26). One model, two Router ids:
 *  - bria/image (models/bria/image/code): a new image from prompt or structured_prompt; aspect_ratio (21 shapes), resolution 1MP / 4MP, seed, output_type.
 *    The partner node "Bria FIBO 2.0 Image Generate" (BriaImageGenerate) calls the same Bria route (/v2/image/generate).
 *  - bria/fibo (models/bria/fibo/code): an edit of ONE photo (images, exactly one item) from instruction or structured_instruction, optional mask
 *    (white = edited), seed. The partner node "Bria FIBO 2.0 Image Edit" calls the same route (/v2/image/edit). The result keeps the photo's shape.
 *  model_version is filled in by Router from the path (never sent); sync is refused (never sent). Images go as plain base64, like the page's example.
 *  Structured (shared/imageOptions.ts FIBO_OPTIONS) sends our caption instead of the prompt (exactly one of the two). */
const fiboEditing = (i: In) => imageRefs(i).length > 0;
const fiboRes = (i: In): '1MP' | '4MP' | null => (resOf(i) === '1K' ? '1MP' : resOf(i) === '4K' ? '4MP' : null);
const fiboIssue = (i: In): string | null => { if (fiboEditing(i)) return null;
  const shape = shapeIssue(FIBO_ASPECTS, 'FIBO 2.0')(i); if (shape) return shape;
  const r = fiboRes(i); if (!r) return `Resolution ${resOf(i)} isn't offered by this model (1K, 4K).`;
  const a = aspectOf(i); return r === '4MP' && a && FIBO_WIDE_ASPECTS.includes(a) ? `Aspect ${a} runs at 1K only on FIBO 2.0 (4K takes 1:1 to 16:9).` : null; };
const fiboBody = async (i: In, k: number) => { const bad = fiboIssue(i); if (bad) throw new Error(bad); const prompt = promptOf(i, k); const refs = imageRefs(i);
  const structured = fiboStructured(prompt, optionsOf(i), refs.length > 0);
  if (refs.length) return omit({ images: [await b64(refs[0])], instruction: structured ? undefined : prompt, structured_instruction: structured ?? undefined,
    mask: modeOf(i) === 'inpaint' && i.maskPath ? await b64(i.maskPath) : undefined, seed: seedOf(i, k) });
  return omit({ prompt: structured ? undefined : prompt, structured_prompt: structured ?? undefined, aspect_ratio: aspectOf(i) ?? '1:1', resolution: fiboRes(i) ?? '1MP', seed: seedOf(i, k), output_type: 'png' }); };
/** Bria status body: result.image_url when COMPLETED; status ERROR (or an error object) = refused. */
const fiboOutputs = (j: any) => (j?.status === 'ERROR' || j?.error ? { refused: String(j?.error?.message ?? j?.error?.details ?? 'Bria refused the request') } : urls([j?.result?.image_url]));
/** Picture shapes (2026-10-24, shared/hostedAspects.ts): each model's own list, the same one the bar offers and checkImageCaps enforces. Every shape maps
 *  to exactly one schema value (never snapped to a neighbour); a shape off the list is refused by `block` (quote / submit) and by the body, so no call is made.
 *  Auto (aspect 'auto', models with nativeAuto) = the API's own auto value, or the field left out where the schema says omitting it lets the model pick. */
export const shapeIssue = (list: readonly string[], name: string) => (i: In): string | null => { const a = aspectOf(i);
  return a && !list.includes(a) ? `Aspect ${a} isn't one of ${name}'s shapes (${list.join(', ')}).` : null; };
const shapeOrThrow = (list: readonly string[], name: string, i: In): string | null => { const bad = shapeIssue(list, name)(i); if (bad) throw new Error(bad); return aspectOf(i); };
/** Ideogram 2K preset for the picked shape (V4 resolution enum; 4.5 takes the same WIDTHxHEIGHT values). */
export const ideogramSizeOf = (i: In, name: string): string | undefined => { const a = shapeOrThrow(IDEOGRAM_ASPECTS, name, i); return a ? IDEOGRAM_SIZES[a] : undefined; };
/** Recraft: the exact size for the shape on a 1K model (V4, V4.1) or the 2K model (V4.1 Pro); no shape (an old client) = square. */
export const recraftSizeOf = (tier: '1K' | '2K') => (i: In): string => recraftSize(shapeOrThrow(RECRAFT_ASPECTS, 'Recraft', i) ?? '1:1', tier)!;
/** Recraft controls (models/recraft/recraftv4 · recraftv4-1 · recraftv4-1-pro, Input: controls): the Style options the job carries (shared/imageOptions.ts RECRAFT_OPTIONS). */
export const recraftControlsOf = (i: In): Record<string, unknown> | undefined => { const o = optionsOf(i);
  const c = omit({ artistic_level: typeof o.artisticLevel === 'number' ? o.artisticLevel : undefined, no_text: o.noText === true ? true : undefined,
    background_color: typeof o.background === 'string' ? { rgb: hexToRgb(o.background) } : undefined, colors: Array.isArray(o.colors) && o.colors.length ? o.colors.map((h) => ({ rgb: hexToRgb(h) })) : undefined });
  return Object.keys(c).length ? c : undefined; };
const recraftBody = (tier: '1K' | '2K') => async (i: In, k: number) => omit({ prompt: promptOf(i, k), n: 1, response_format: 'url', size: recraftSizeOf(tier)(i), controls: recraftControlsOf(i) });
/** Luma Agents schema (uni-1 / uni-1-max), checked 2026-10-25 against the Router pages (models/luma_2/uni-1 · uni-1-max, Input: type, source, image_ref):
 *  generate = type image with ≤9 image_ref; edit (a photo attached) = type image_edit, the first photo in `source` (the image edited) and the rest in
 *  image_ref ("up to 8 for type 'image_edit'"), so 9 photos in all either way (maxRefs 9; more is refused by `block`). No mask field: inpaint runs elsewhere.
 *  aspect_ratio = the picked shape (12-value enum); an edit on Match photo leaves it out. */
export const lumaAspectOf = (i: In): string | undefined => (i.aspectAuto === true && imageRefs(i).length ? undefined : shapeOrThrow(LUMA_ASPECTS, 'Luma UNI-1', i) ?? undefined);
const lumaImg = async (p: string) => ({ data: await b64(p), media_type: mimeOf(p) });
const lumaBody = async (i: In, k: number) => { const refs = imageRefs(i); const edit = modeOf(i) === 'edit' && refs.length > 0; const more = edit ? refs.slice(1) : refs;
  return omit({ prompt: promptOf(i, k), type: edit ? 'image_edit' : 'image', style: optionsOf(i).style === 'manga' ? 'manga' : 'auto' /* Style option: auto | manga */, output_format: 'png', aspect_ratio: lumaAspectOf(i),
    source: edit ? await lumaImg(refs[0]) : undefined, image_ref: more.length ? await Promise.all(more.map(lumaImg)) : undefined }); };
const lumaOutputs = (j: any) => (j?.state === 'failed' || j?.failure_code ? { refused: String(j.failure_reason ?? j.failure_code ?? 'failed') } : urls(j?.output));
/** Qwen (DashScope multimodal) schema, qwen-image-3.0 / 3.0-pro: content = 0–3 images + one text; parameters n 1 (one call per image), size W*H (the exact
 *  size above), seed 0…2³¹−1, prompt_extend (off unless the user turns it on: the prompt goes as written), negative_prompt when given, watermark false.
 *  prompt_extend_mode stays at its default (direct). Images as data URIs ("URL or Base64 encoded data"). */
const qwenBody = (provider: string) => async (i: In, k: number) => { const size = sizeOrThrow(provider, i); const refs = imageRefs(i);
  return { input: { messages: [{ role: 'user', content: [...(await Promise.all(refs.map(async (p) => ({ image: await dataUri(p) })))), { text: promptOf(i, k) }] }] },
    parameters: omit({ n: 1, size, seed: seedOf(i, k), prompt_extend: i.promptRewrite === true, watermark: false, negative_prompt: negOf(i) }) }; };
/** A text element in place of an image produced no asset (Router page: key completion off `image`), so it reads as a refusal. */
const qwenOutputs = (j: any) => { if (j?.code && !j?.output) return { refused: String(j.message ?? j.code) };
  const content = (j?.output?.choices ?? []).flatMap((c: any) => c?.message?.content ?? []); const out = urls(content, 'image'); const said = content.map((x: any) => x?.text).find((t: unknown) => typeof t === 'string' && t);
  return !out.length && said ? { refused: String(said) } : out; };
/** Vertex Gemini image schema (Nano Banana 2 / 2.1 / Pro): text + inlineData parts, imageConfig {imageSize 1K/2K/4K, aspectRatio}.
 *  aspectRatio is sent exactly as picked, from the model's own list (shared/imageCaps.ts GEMINI_ASPECTS_14 / _10: the list the bar offers and
 *  checkImageCaps enforces). Never snapped: an aspect off the list is refused by `block` (quote / submit) and by the body itself, so no call is made.
 *  Auto = aspectRatio left out: an edit on Match photo (input.aspectAuto, set by tools/media.ts) keeps the photo's shape (Google's documented default). */
export const geminiAspectRatio = (i: In): string | undefined => (i.aspectAuto === true && imageRefs(i).length ? undefined : aspectOf(i) ?? undefined);
const geminiAspectIssue = (aspects: readonly string[]) => (i: In): string | null => { const a = geminiAspectRatio(i);
  return a && !aspects.includes(a) ? `Aspect ${a} isn't supported by this model (${aspects.join(', ')}).` : null; };
const geminiBody = (aspects: readonly string[]) => async (i: In, k: number) => { const bad = geminiAspectIssue(aspects)(i); if (bad) throw new Error(bad); const refs = imageRefs(i);
  return { contents: [{ role: 'user', parts: [{ text: promptOf(i, k) }, ...(await Promise.all(refs.map(async (p) => ({ inlineData: { mimeType: mimeOf(p), data: await b64(p) } }))))] }],
    generationConfig: omit({ responseModalities: ['IMAGE'], seed: seedOf(i, k), imageConfig: omit({ imageSize: resOf(i), aspectRatio: geminiAspectRatio(i) }) }) }; };
const geminiOutputs = (j: any) => { if (j?.promptFeedback?.blockReason) return { refused: String(j.promptFeedback.blockReasonMessage ?? j.promptFeedback.blockReason) };
  const parts = (j?.candidates ?? []).flatMap((c: any) => c?.content?.parts ?? []); const out = parts.filter((p: any) => p?.inlineData?.data).map((p: any) => ({ b64: p.inlineData.data, mime: p.inlineData.mimeType ?? 'image/png' }));
  const fr = (j?.candidates ?? []).map((c: any) => String(c?.finishReason ?? '')).find((r: string) => /SAFETY|PROHIBITED|BLOCK|RECITATION/.test(r));
  return !out.length && fr ? { refused: fr } : out; };
/** BFL FLUX.2 schema (flux-2-pro / flux-2-max): width/height 256–2048, input_image…input_image_9 as raw base64. The size = shared/hostedAspects.ts flux2Size
 *  (the same pixel count for every shape at 1K / 2K, the size the price is counted on: shared/pricing.ts mpImage). */
export const flux2SizeOf = (i: In) => flux2Size(shapeOrThrow(FLUX2_ASPECTS, 'FLUX.2', i) ?? '1:1', resOf(i));
const flux2Body = async (i: In, k: number) => { const refs = imageRefs(i); const { width, height } = flux2SizeOf(i); const imgs = await Promise.all(refs.map(b64));
  return omit({ prompt: promptOf(i, k), width, height, seed: seedOf(i, k), output_format: 'png', safety_tolerance: 2,
    prompt_upsampling: i.promptRewrite !== false /* the docs default (true) unless the user turned it off; tools/media.ts sets it on every job */,
    ...Object.fromEntries(imgs.map((d, n) => [n ? `input_image_${n + 1}` : 'input_image', d])) }); };
/** FLUX 3 Image resolution classes (models/black-forest-labs/flux-3-image: 768sq, 1k, 1.5k, 2k, 4k; the partner node calls 768sq "0.75K"). */
export const FLUX3_RES: Record<ImageRes, string> = { '0.75K': '768sq', '1K': '1k', '1.5K': '1.5k', '2K': '2k', '4K': '4k' };
/** Krea 3 thinking_mode from our tier: low = fast (the default), med = high, high = ultra (shared/imageCaps.ts tierNames). */
export const kreaThinking = (i: In): 'fast' | 'high' | 'ultra' => { const t = String(i.tier ?? 'low') /* old jobs (no tier) ran fast */; return t === 'high' ? 'ultra' : t === 'med' ? 'high' : 'fast'; };
/** BFL async result (FLUX.2, FLUX 3 Image): result.sample = the image URL; Request / Content Moderated = refused. */
const bflOutputs = (j: any) => (/moderat|error|failed/i.test(String(j?.status ?? '')) && !j?.result?.sample ? { refused: String(j.status) } : j?.result?.sample ? [{ url: j.result.sample }] : []);
/** FLUX 3 Image aspect enum (Router schema + BFL docs). No seed field: the endpoint refuses unknown fields. */
/** Wan 2.5 text to image: the prompt is "length not exceeding 800 characters" (Router page, input.prompt). */
export const WAN_PROMPT_MAX = 800;
const wanPromptIssue = (p: string) => (p.length > WAN_PROMPT_MAX ? `Wan 2.5 takes prompts up to ${WAN_PROMPT_MAX} characters; yours is ${p.length}. Shorten it or pick another model.` : null);
/** A voice model's script cap, checked before sending (block + body) so an over-long script is refused with this message and nothing is charged. */
const scriptTooLong = (name: string, max: number) => (p: string) => (p.length > max ? `${name} reads scripts up to ${max.toLocaleString('en-US')} characters; yours is ${p.length.toLocaleString('en-US')}. Shorten it or pick another voice model` : null);
/** Seed Audio 1.0 Multilingual (checked 2026-10-25): text_prompt is up to 3,000 characters (Router page, input.text_prompt); an empty script is the voice tool's own 400. */
export const SEED_AUDIO_TEXT_MAX = 3000;
const seedAudioScriptIssue = scriptTooLong('Seed Audio', SEED_AUDIO_TEXT_MAX);
/** Music / Sound effects describe the sound; every other job (Voice, Voiceover, or no mode) reads a script. The same text_prompt and 1–3,000 character cap. */
export const SEED_AUDIO_SOUND_MODES = ['music', 'sfx'];
const seedAudioIsSpeech = (i: In) => !SEED_AUDIO_SOUND_MODES.includes(modeOf(i));
const seedAudioTextIssue = (p: string, i: In = {}) => (seedAudioIsSpeech(i) ? seedAudioScriptIssue(p)
  : p.length > SEED_AUDIO_TEXT_MAX ? `Seed Audio takes prompts up to ${SEED_AUDIO_TEXT_MAX.toLocaleString('en-US')} characters; yours is ${p.length.toLocaleString('en-US')}. Shorten it or pick another model` : null);
/** Output sample rate (audio_config.sample_rate): 24 kHz for speech, 44.1 kHz for music and sound effects (Comfy docs, Seed Audio 1.0 parameter tuning). */
export const seedAudioRate = (i: In) => (seedAudioIsSpeech(i) ? 24000 : 44100);
/** ElevenLabs v3 (checked 2026-10-25): 5,000 characters per request. The Router schema sets no maxLength on inputs[].text; the figure is ElevenLabs' own
 *  v3 limit (elevenlabs.io/docs/models, mirrored by fal's eleven-v3 schema, text maxLength 5000). v4 / v4 Turbo publish no cap, so none is applied. */
export const ELEVEN_V3_TEXT_MAX = 5000;
export { FLUX3_ASPECTS };

/** Image to layers (2026-10-24): the Seedream layer-mode body and its outputs (base plate first, then layers by z_index, each named by the model). */
const layersBody = async (i: In, k: number) => { const photo = imageRefs(i)[0]; const words = String(i.appPrompt ?? '').trim();
  return omit({ prompt: words || undefined, image: photo ? await dataUri(photo) : undefined, layer_decomposition: true, size: resOf(i) === '2K' ? '2K' : '1K', seed: seedOf(i, k),
    response_format: 'url', output_format: 'png', watermark: false }); };
const layersOutputs = (j: any): RouterOut[] | { refused: string } => { if (j?.error?.code) return { refused: String(j.error.message ?? j.error.code) };
  const d = (Array.isArray(j?.data) ? j.data : []).map((x: any, n: number) => ({ x, z: Number.isFinite(Number(x?.z_index)) ? Number(x.z_index) : n })).sort((a: any, b: any) => a.z - b.z);
  return d.map(({ x }: any, n: number) => ({ ...(typeof x?.url === 'string' ? { url: x.url } : x?.b64_json ? { b64: x.b64_json, mime: 'image/png' } : {}), label: layerLabel(n, x?.name), ...(typeof x?.description === 'string' && x.description.trim() ? { description: x.description.replace(/\s+/g, ' ').trim().slice(0, 300) } : {}), ...(n > 0 && Array.isArray(x?.bounding_box?.absolute) && x.bounding_box.absolute.length === 4 ? { box: x.bounding_box.absolute.map(Number) } : {}) } as RouterOut & { label: string; box?: number[] })).filter((o: RouterOut) => o.url || o.b64); };
/** Veo frame: PNG / JPEG as they are; anything else (webp, …) converted to PNG with ffmpeg, since Veo's image mimeType takes only image/jpeg or image/png. */
export async function veoImage(p: string): Promise<{ bytesBase64Encoded: string; mimeType: 'image/png' | 'image/jpeg' }> {
  const mt = mimeOf(p); if (mt === 'image/png' || mt === 'image/jpeg') return { bytesBase64Encoded: await b64(p), mimeType: mt };
  const out = path.join(path.dirname(p), `${path.basename(p, path.extname(p))}-veo.png`);
  if (await runFfmpeg(['-v', 'error', '-y', '-i', p, '-frames:v', '1', out]) !== 0) throw new Error('the frame could not be converted to PNG for Veo');
  return { bytesBase64Encoded: await b64(out), mimeType: 'image/png' };
}
/** Our voice library (tools/mediaPresets.ts VOICE_LIBRARY) → ElevenLabs premade voices (the ElevenLabsVoiceSelector list: Rachel, Antoni, Elli, Adam, Josh,
 *  Bella; ids from ElevenLabs' public premade voice list). An ElevenLabs voice id (20 letters and digits) passes as is; anything else = Rachel (the old fixed id). */
export const ELEVEN_VOICES: Record<string, { id: string; name: string }> = {
  'narrator-warm': { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel' }, 'narrator-crisp': { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni' },
  'young-bright': { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli' }, 'deep-calm': { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
  'energetic-host': { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh' }, 'whisper-soft': { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella' },
};
export const elevenVoiceId = (v: unknown): string => { const s = String(v ?? ''); return ELEVEN_VOICES[s]?.id ?? (/^[A-Za-z0-9]{20}$/.test(s) ? s : ELEVEN_VOICES['narrator-warm'].id); };
/** Expression → settings.stability: voiceNative.stability (voiceControls), else from the raw control, else 0.5; clamped to 0–1. */
const elevenStability = (i: In): number => { const n = Number(i.voiceNative?.stability ?? (i.voiceControls?.expression != null ? 1 - Number(i.voiceControls.expression) / 10 : 0.5));
  return Number.isFinite(n) ? Math.min(1, Math.max(0, Math.round(n * 100) / 100)) : 0.5; };
/** ElevenLabs text to speech on Comfy Router (2026-10-25): eleven_v3, eleven_v4 and eleven_v4_turbo share one schema (the text-to-dialogue body:
 *  inputs[{ text, voice_id }], seed 0–4294967295, settings.stability; router-schemas elevenlabs__eleven_v3 / _v4 / _v4_turbo are identical). Synchronous
 *  only (queue: false): the queue refuses their raw audio bytes (limitations page). Our voices only: a cloned voice is refused before sending.
 *  `stability` reshapes the Expression value for a model (v3); `maxChars` adds a script cap. */
const elevenTts = (name: string, model: string, slug: string, o: { maxChars?: number; stability?: (s: number) => number } = {}): RouterModelSpec => {
  const long = o.maxChars ? scriptTooLong(name, o.maxChars) : () => null;
  return { id: `elevenlabs/${model}`, doc: DOC(`elevenlabs/${slug}`), out: 'audio', queue: false, maxRefs: 0,
    block: (i) => (i.voice === 'clone' || pathsOf(i.voiceSamplePaths).length ? `${name} on Comfy Router reads with its own voices; voice cloning runs on another model` : null) ?? long(promptOf(i)),
    body: async (i) => { const text = promptOf(i); const bad = long(text); if (bad) throw new Error(bad); const s = elevenStability(i);
      return omit({ inputs: [{ text, voice_id: elevenVoiceId(i.voice) }], seed: seedOf(i, 0, 4294967295), settings: { stability: o.stability ? o.stability(s) : s } }); },
    outputs: () => [] };
};
/** ElevenLabs v3 stability takes three presets, Creative 0.0 / Natural 0.5 / Robust 1.0 (ElevenLabs v3 docs); other values are snapped to the nearest. */
export const elevenV3Stability = (s: number) => (s < 0.25 ? 0 : s > 0.75 ? 1 : 0.5);
// ---- Seedance on Comfy Router (2.0, 2.5, 2.0 Fast, 2.0 Mini): ONE BytePlus schema on all four Router pages (router-schemas audit 2026-10-25: identical
//      request bodies); what differs is in the field text and each videoCaps row (durations 4–15 / 2.5: 4–30, 2.0 Fast / Mini no 1080p, refs 9 / 30).
//      Ratio: adaptive with a first / last frame (2.5 refuses a concrete ratio there: only adaptive or no field is accepted). Refusal: a failed task
//      (status failed / error.code, e.g. InputImageSensitiveContentDetected.PrivacyInformation for a real face) → { refused } (runner: content_blocked).
type SeedanceKey = 'router-seedance' | 'router-seedance-25' | 'router-seedance-20-fast' | 'router-seedance-20-mini';
const seedanceOutputs = (j: any): RouterOut[] | { refused: string } => (j?.status === 'failed' || j?.error?.code ? { refused: String(j?.error?.message ?? j?.error?.code ?? 'failed') } : j?.content?.video_url ? [{ url: j.content.video_url }] : []);
function seedanceRouter(key: SeedanceKey, o: { name: string; model: string; apps?: boolean }): RouterModelSpec {
  const L = VIDEO_LIMITS[key]; const maxRefs = L.refKinds.image ?? 9; const ratios = L.aspects.filter((a) => a !== 'auto');
  return { tools: o.apps ? ['h3-video', ...ROUTER_VIDEO_APPS] : ['h3-video'], id: `byteplus/${o.model}`, doc: DOC(`byteplus/${o.model}`), out: 'video', queue: true, maxRefs,
    block: (i) => noVideoRefs(o.name, !!o.apps, key)(i) ?? (videoRefCount(i) > maxRefs ? `${o.name} on Comfy Router takes up to ${maxRefs} reference images; you added ${videoRefCount(i)}` : null)
      ?? (['i2v', 'flf'].includes(videoJob(i).m) && !videoJob(i).frame ? `${o.name} needs the first frame for this job` : null), // never a silent text-to-video run
    body: async (i) => { const { m, text, frame, aspect } = videoJob(i); const content: any[] = [{ type: 'text', text }];
      if ((m === 'i2v' || m === 'flf') && frame) content.push({ type: 'image_url', image_url: { url: await frameUri(frame, aspect) }, role: 'first_frame' });
      if (m === 'flf' && i.lastFramePath) content.push({ type: 'image_url', image_url: { url: await dataUri(i.lastFramePath) }, role: 'last_frame' });
      for (const p of videoRefPaths(i, maxRefs)) content.push({ type: 'image_url', image_url: { url: await dataUri(p) }, role: 'reference_image' });
      await avContent(key, i, content); // reference videos (public URL) and audio (data URI), Reference to video only
      const img2v = content.some((c) => c.role === 'first_frame' || c.role === 'last_frame');
      return omit({ content, duration: Math.min(L.maxSeconds, Math.max(L.minSeconds, Math.round(Number(i.duration) || 5))) /* videoCaps: 2.0 series 4–15 s, 2.5 4–30 s */,
        resolution: L.resolutions.includes(i.resolution) ? i.resolution : '720p',
        ratio: img2v ? 'adaptive' : (ratios.includes(i.aspect) ? i.aspect : m === 'r2v' ? 'adaptive' : '16:9'), generate_audio: i.audio !== false, seed: seedOf(i, 0, 4294967295), watermark: false }); },
    outputs: seedanceOutputs };
}
// ---- Veo 3.1 / 3.1 Fast on Comfy Router: one Vertex schema (identical request bodies). image / lastFrame mimeType is image/jpeg or image/png only (schema),
//      so any other frame (webp…) is converted to PNG first (veoImage); parameters.negativePrompt = the user's negative prompt when given.
function veoRouter(name: string, id: string, docPath: string, o: { k4?: boolean } = { k4: true }): RouterModelSpec {
  return { tools: ['h3-video'], id, doc: DOC(docPath), out: 'video', queue: true, maxRefs: 0, block: noVideoRefs(name),
    body: async (i) => { const m = i.mode ?? modeOf(i); const d = Number(i.duration) || 8; const inst: Record<string, unknown> = { prompt: promptOf(i) };
      if ((m === 'i2v' || m === 'flf') && i.imagePath) inst.image = await veoImage(i.imagePath);
      if (m === 'flf' && i.lastFramePath) inst.lastFrame = await veoImage(i.lastFramePath);
      const neg = typeof i.negativePrompt === 'string' && i.negativePrompt.trim() ? i.negativePrompt.trim() : undefined;
      const is4k = !!o.k4 && String(i.resolution ?? '').toLowerCase() === '4k' /* Veo 3.1 Lite: no 4K rate on the Router pricing page, so never sent */; const hiRes = is4k || i.resolution === '1080p'; // 4K: Router resolution enum 720p / 1080p / 4k (veo-3-1-generate-001/code.md)
      return { instances: [inst], parameters: omit({ durationSeconds: hiRes ? 8 /* Google: 1080p and 4K are 8 s only (videoCaps durationsByResolution) */ : d <= 4 ? 4 : d <= 6 ? 6 : 8, aspectRatio: i.aspect === '9:16' ? '9:16' : '16:9', resolution: is4k ? '4k' : i.resolution === '1080p' ? '1080p' : '720p', generateAudio: i.audio === true, sampleCount: 1, seed: seedOf(i, 0), negativePrompt: neg, enhancePrompt: i.promptRewrite !== false && i.promptRewrite !== '0' /* Veo's default (true), as before: only an explicit off (a rewrite switch, or an API / MCP caller) sends false */ }) }; },
    outputs: (j) => { if (j?.error?.message) return { refused: String(j.error.message) }; const v = (j?.response?.videos ?? []) as any[];
      if (!v.length && j?.response?.raiMediaFilteredCount) return { refused: String(j.response.raiMediaFilteredReasons?.[0] ?? 'filtered') };
      return v.map((x) => (x?.bytesBase64Encoded ? { b64: x.bytesBase64Encoded, mime: x.mimeType ?? 'video/mp4' } : /^https:/.test(String(x?.gcsUri)) ? { url: x.gcsUri } : {})).filter((x) => x.b64 || x.url); } };
}

// ---- Video Swap on Comfy Router (2026-10-25): cloud person swap and motion transfer (shared/cloudSwap.ts: limits, passes, prompt template) ----
// The job's clip is already the user's swap range (tools/videoSwap.ts cuts it). One request per pass per version; passes longer than a model takes
// are split (planPasses) and joined after (finish), and the clip's own sound goes back on (keepAudio) — the models' own audio is never used.
type SwapKey = 'router-kling-edit' | 'router-seedance-25-edit';
const SWAP_TOOLS = ['object-swap', 'motion-transfer'];
/** The job's mode; a quote's raw ?mode= may say it with a hyphen (motion-transfer), the tool id's spelling. */
const modeId = (i: In) => (i.mode ? String(i.mode).replace(/-/g, '_') : i.mode);
const swapModeOf = (i: In): SwapMode => (modeId(i) === 'motion_transfer' ? 'motion_transfer' : 'object_swap');
const swapVersions = (i: In) => Math.max(1, Math.min(4, Math.floor(Number(i.count) || 1)));
const swapTotal = (i: In) => Math.round(Number(i.duration) || 0);
/** Passes of this job on this model (whole seconds, balanced). */
export const swapPassesOf = (key: SwapKey, i: In) => { const m = CLOUD_SWAP_MODELS[key]; return planPasses(swapTotal(i), m.maxPassSec, m.minPassSec); };
/** Kling reference image rules (KlingOmniProEditVideoNode): ≥ 300 px a side, aspect 1:2.5–2.5:1. */
const klingImageIssue = (p: string): string | null => { const d = imageDimsOfFile(p); if (!d) return null;
  if (Math.min(d.width, d.height) < 300) return `Kling 3.0 Omni Edit needs a character image at least 300 px a side; yours is ${d.width}×${d.height}`;
  const r = d.width / d.height; return r > 2.5 || r < 0.4 ? `Kling 3.0 Omni Edit takes character images from 1:2.5 to 2.5:1; yours is ${d.width}×${d.height}. Crop it (a character sheet can be split)` : null; };
/** Seedance reference videos: a pixel budget per frame (ByteDance2ReferenceNode: "pixel-count limits", auto up / downscale; figures 409,600–2,086,876 px
 *  matching the BytePlus 2.x size table) and an aspect of 0.4–2.5: shared/videoFit.ts VIDEO_INPUT_LIMITS. */
const seedanceImageIssue = (p: string): string | null => { const d = imageDimsOfFile(p); if (!d) return null;
  if (Math.min(d.width, d.height) < 300) return `Seedance 2.5 Edit needs a character image at least 300 px a side; yours is ${d.width}×${d.height}`;
  const r = d.width / d.height; return r > 2.5 || r < 0.4 ? `Seedance 2.5 Edit takes character images from 0.4 to 2.5 wide per tall; yours is ${d.width}×${d.height}. Crop it` : null; };
/** The prompt a swap job sends: our template around the user's "Who to replace" text and prompt. */
export const swapPromptOf = (key: SwapKey, i: In) => { const n = Math.max(1, pathsOf(i.refPaths).length); const img = (k: number) => (key === 'router-kling-edit' ? `<<<image_${k}>>>` : `Image ${k}`);
  return swapPrompt({ mode: swapModeOf(i), who: i.target, extra: i.prompt, images: Array.from({ length: n }, (_, k) => img(k + 1)),
    ...(key === 'router-kling-edit' ? { video: '<<<video_1>>>', image: '<<<image_1>>>' } : { video: 'Video 1', image: 'Image 1' } /* Seedance's own positional labels (shared/promptGrammar.ts) */) }); };
/** Why this job can't run on a cloud swap route (null = fine). Checked at quote / submit with a key (nothing charged) and again in the body. */
export function swapIssue(key: SwapKey, i: In, strict = false): string | null {
  const m = CLOUD_SWAP_MODELS[key];
  if ((i.mode || strict) && !['object_swap', 'motion_transfer'].includes(String(modeId(i)))) return `${m.name} on Comfy Router runs Video Swap jobs (person swap or motion transfer)`;
  if (i.swapType === 'object') return `${m.name} swaps people and characters here; for objects pick another model`;
  // a quote carries no files yet (the form says what's missing): the clip and image are checked when they are there, and always in the body (strict)
  if (!i.videoPath && strict) return `${m.name} needs your video`;
  const refs = pathsOf(i.refPaths); if (!refs.length && (strict || Array.isArray(i.refPaths) && i.videoPath)) return `${m.name} needs one character image`;
  const max = swapImagesMax(m, swapModeOf(i));
  if (refs.length > max) return max === 1 ? `${m.name} takes one character image (a clear full view or a character sheet); remove the ${refs.length - 1} extra` : `${m.name} takes up to ${max} character images; remove ${refs.length - max}`;
  const T = swapTotal(i); if ((T > 0 || strict) && (T < m.minTotalSec || T > m.maxTotalSec)) return `${m.name} swaps ${m.minTotalSec}–${m.maxTotalSec} s of a clip; trim the swap range (yours is ${T} s)`;
  if (T > 0 && !swapPassesOf(key, i).length) return `${m.name} can't split ${T} s into passes`;
  if (key === 'router-kling-edit') { for (const r of refs) { const bad = klingImageIssue(r); if (bad) return refs.length > 1 ? `Image ${refs.indexOf(r) + 1}: ${bad}` : bad; } const n = swapPromptOf(key, i).length; if (n > KLING_PROMPT_MAX) return `Kling 3.0 Omni Edit takes prompts up to ${KLING_PROMPT_MAX} characters; yours comes to ${n}. Shorten your prompt`; }
  if (key === 'router-seedance-25-edit') for (const r of refs) { const bad = seedanceImageIssue(r); if (bad) return refs.length > 1 ? `Image ${refs.indexOf(r) + 1}: ${bad}` : bad; }
  // the clip's shape / size / fps: shared/videoFit.ts (Fit to model pads or crops it before the run; routing/select.ts refuses what it can't mend)
  if ((i.videoPath || strict) && !canLink()) return `${m.name} on Comfy Router takes your clip as a link, uploaded with your Comfy key: add the key in Settings`;
  return null;
}
/** Pass c of the job's clip, shaped for the model (Kling: ≥ 720 px a side, 24–60 fps), saved next to the clip under DATA_DIR (served at /files/). */
const swapPassFile = async (key: SwapKey, i: In, c: number) => { const ps = swapPassesOf(key, i); const p = ps[c]; const base = path.basename(String(i.videoPath), path.extname(String(i.videoPath)));
  const dst = path.join(DATA_DIR, `${base}-${key === 'router-kling-edit' ? 'kling' : 'sd25'}-p${c + 1}of${ps.length}.mp4`);
  return preparePass(String(i.videoPath), dst, p.start, p.dur, passShape(key)); };
/** A pass's shape rules: the model's row in shared/videoFit.ts (one source; the job's clip is already fitted before the run, so this is a safety net). */
const passShape = (key: SwapKey) => { const l = videoInputLimits('object-swap', key)!; return { minSide: l.minSide ?? 1, maxSide: l.maxSide ?? 4096, ...(l.fps ? { fps: l.fps } : {}), ...(l.minPixels && l.maxPixels ? { pixels: [l.minPixels, l.maxPixels] as [number, number] } : {}) }; };
/** A clip for the model, always as a link (both schemas take the video only as a URL / asset; inline failed on Kling: invalid_input, 2026-10-26). */
const swapVideoUrl = (key: SwapKey, p: string) => mediaLink(p, CLOUD_SWAP_MODELS[key].name, key === 'router-seedance-25-edit');
/** Kling image: raw base64 (Kling's documented form, as Kling Image O1 here); PNG / JPEG only, anything else converted first. */
const klingImageB64 = async (p: string) => (await veoImage(p)).bytesBase64Encoded;
const nearestKlingAspect = (i: In) => nearest(i.width && i.height ? `${i.width}:${i.height}` : '16:9', ['16:9', '9:16', '1:1']) ?? '16:9';
function swapSpec(key: SwapKey): RouterModelSpec & { name: string } {
  const m = CLOUD_SWAP_MODELS[key]; const kling = key === 'router-kling-edit';
  const nPasses = (i: In) => Math.max(1, swapPassesOf(key, i).length);
  return { name: m.name, tools: SWAP_TOOLS, id: m.routerModel, doc: m.doc, out: 'video', queue: true, maxRefs: Math.max(m.maxImages, m.maxCharacterImages),
    block: (i) => swapIssue(key, i),
    calls: (i) => nPasses(i) * swapVersions(i),
    callShare: (i, k) => { const ps = swapPassesOf(key, i); const T = ps.reduce((a, p) => a + p.dur, 0) || 1; return (ps[k % Math.max(1, ps.length)]?.dur ?? T) / T / swapVersions(i); },
    body: async (i, k) => {
      const bad = swapIssue(key, i, true); if (bad) throw new Error(bad);
      const c = k % nPasses(i); const v = Math.floor(k / nPasses(i)); const pass = swapPassesOf(key, i)[c]; const clip = await swapPassFile(key, i, c);
      const motion = swapModeOf(i) === 'motion_transfer'; const refs = pathsOf(i.refPaths); const text = swapPromptOf(key, i); /* every character image, in order (Image 1, Image 2…) */
      if (kling) return omit({ prompt: text, video_list: [{ video_url: await swapVideoUrl(key, clip), refer_type: motion ? 'feature' : 'base', keep_original_sound: 'yes' }], image_list: await Promise.all(refs.map(async (r) => ({ image_url: await klingImageB64(r) }))),
        mode: i.resolution === '1080p' ? 'pro' : 'std', duration: motion ? String(Math.min(10, Math.max(3, pass.dur))) : undefined /* an edit's length = its clip (the schema: duration is ignored) */,
        aspect_ratio: motion ? nearestKlingAspect(i) : undefined, watermark_info: { enabled: false } });
      const seed = Number.isInteger(i.batchSeeds?.[v]) ? i.batchSeeds[v] : i.seed;
      return omit({ content: [{ type: 'text', text }, { type: 'video_url', video_url: { url: await swapVideoUrl(key, clip) }, role: 'reference_video' }, ...(await Promise.all(refs.map(async (r) => ({ type: 'image_url', image_url: { url: await dataUri(r) }, role: 'reference_image' }))))],
        duration: motion ? Math.min(30, Math.max(4, pass.dur)) : -1 /* Seedance 2.5: video edits take only -1 (the clip's length) */, resolution: m.qualities.includes(i.resolution) ? i.resolution : m.defaultQuality,
        // Router's published input schema does not expose omni_reference_task_type (checked 2026-10-29).
        // Prompt + assets still select the task automatically; roles alone do not force reference/edit.
        ratio: 'adaptive', generate_audio: false /* existing policy: original soundtrack remuxed after, or silent; never native generation */, seed: Number.isInteger(seed) ? Math.abs(seed) % 4294967296 : undefined, watermark: false });
    },
    outputs: kling ? (j) => (j?.data?.task_status === 'failed' ? { refused: String(j.data.task_status_msg ?? 'failed') } : urls(j?.data?.task_result?.videos)) : seedanceOutputs,
    finish: async (job, outs) => { const n = nPasses(job.input); const V = Math.ceil(outs.length / n); const res: { label: string; url: string }[] = [];
      for (let v = 0; v < V; v++) { const parts = outs.slice(v * n, v * n + n).map((o) => path.join(DATA_DIR, path.basename(o.url))); const name = `${job.id}-swap${V > 1 ? `-v${v + 1}` : ''}.mp4`;
        await joinPasses(parts, path.join(DATA_DIR, name), String(job.input.videoPath), job.input.keepAudio !== false); res.push({ label: V > 1 ? `Version ${v + 1}` : 'Result', url: `/files/${name}` }); }
      return res; } };
}

// ---- Render (Direct a Shot step 3) on Comfy Router (2026-10-26): render adapters, one pure body builder per model (shared/renderModels.ts) ----
// The job (tools/makeItReal.ts parseInput) carries clipPath = the mockup in the model's preferred Preview style, cut to the picked whole seconds at 24 fps
// and sized for the model; firstFramePath = the optional art-directed still fitted to the same size; finalPrompt = the model's prompt template;
// resolution = the model's quality; duration = the seconds the provider bills (Ray: 5 or 10). One request per job. Kling and Seedance get the clip as a
// link (renderUpload.ts: Comfy storage upload or OPENHIGGSFIELD_PUBLIC_BASE_URL; refused before any call without one); Aleph 2 and Ray 3.2 take it inline.
type RenderKey = typeof RENDER_KLING | typeof RENDER_ALEPH | typeof RENDER_RAY | typeof RENDER_SEEDANCE;
export const isRenderJob = (i: In) => i?.mode === 'make-it-real' || modeOf(i) === 'make-it-real';
/** Why this Render job can't run on this model (null = fine). A quote carries no files: only the length / quality are checked then; the body is strict. */
export function renderIssue(key: RenderKey, i: In, strict = false): string | null {
  const m = renderModelOf(key)!;
  if (!isRenderJob(i)) return `${m.name} runs Render jobs here`;
  { const need = renderNeeds(key, { publicBase: !!publicBase(), upload: hasClipUpload() }); if (need) return need; }
  if (!i.clipPath && strict) return `${m.name} needs your mockup`;
  const sec = Number(i.clipSeconds ?? i.duration) || 0; if ((sec > 0 || strict) && (sec < m.clip.minSec - 0.01 || sec > m.clip.maxSec + 0.01)) return `${m.name} renders ${m.clip.minSec}–${m.clip.maxSec} s; this Render is ${sec} s`;
  if (i.resolution && m.qualities.length && !m.qualities.some((q) => q.id === i.resolution)) return `${m.name} renders ${m.qualities.map((q) => q.label).join(' or ')}`;
  const n = String(i.finalPrompt ?? '').length; if (n > m.promptMax) return `${m.name} takes prompts up to ${m.promptMax} characters; yours comes to ${n}. Shorten your prompt`;
  if (key === RENDER_KLING && i.firstFramePath) { const bad = klingImageIssue(String(i.firstFramePath)); if (bad) return bad; }
  return null;
}
/** The request body for a Render job (exported for the schema tests; no network). */
export async function renderBody(key: RenderKey, i: In): Promise<Record<string, unknown>> {
  const bad = renderIssue(key, i, true); if (bad) throw new Error(bad);
  const clip = String(i.clipPath); const ff = typeof i.firstFramePath === 'string' && i.firstFramePath ? i.firstFramePath : null; const text = String(i.finalPrompt);
  const seed = Number.isInteger(i.seed) ? Math.abs(i.seed) % 4294967296 : undefined; const m0 = renderModelOf(key)!;
  if (key === RENDER_KLING) return omit({ prompt: text, video_list: [{ video_url: await clipLink(clip, 'video/mp4', m0.name), refer_type: 'base', keep_original_sound: 'no' }], image_list: ff ? [{ image_url: await klingImageB64(ff) }] : undefined,
    mode: i.resolution === '1080p' ? 'pro' : 'std', watermark_info: { enabled: false } }); // an edit's length = its clip (no duration); no aspect (the clip sets it)
  if (key === RENDER_ALEPH) return omit({ promptText: text, videoUri: await dataUri(clip), promptImage: ff ? [{ uri: await dataUri(ff), position: 'first' }] : undefined, seed });
  if (key === RENDER_RAY) return { prompt: text, type: 'video_edit', source: { data: await b64(clip), media_type: 'video/mp4' },
    video: { resolution: renderQualityOf(key, i.resolution), duration: renderBillSeconds(key, Number(i.clipSeconds) || 5) <= 5 ? '5s' : '10s', edit: { strength: 'adhere_1' } } }; // edit controls are forwarded to Luma (LumaRay32VideoEditNode)
  return omit({ content: [{ type: 'text', text }, { type: 'video_url', video_url: { url: await clipLink(clip, 'video/mp4', m0.name) }, role: 'reference_video' }, ...(ff ? [{ type: 'image_url', image_url: { url: await dataUri(ff) }, role: 'reference_image' }] : [])],
    duration: -1 /* video edit: the clip's length */, resolution: renderQualityOf(key, i.resolution), ratio: 'adaptive', generate_audio: false, seed, watermark: false });
}
const runwayOutputs = (j: any): RouterOut[] | { refused: string } => (j?.status === 'FAILED' || j?.status === 'CANCELLED' ? { refused: String(j?.failure ?? j?.failureCode ?? j?.status) } : urls(j?.output));
function renderSpec(key: RenderKey): RouterModelSpec & { name: string } {
  const m = renderModelOf(key)!;
  return { name: m.name, tools: ['make-it-real'], id: m.routerModel!, doc: m.doc, out: 'video', queue: true, maxRefs: m.firstFrame === 'none' ? 0 : 1, block: (i) => renderIssue(key, i), calls: () => 1,
    body: (i) => renderBody(key, i), outputs: key === RENDER_ALEPH ? runwayOutputs : key === RENDER_RAY ? lumaOutputs : key === RENDER_KLING ? (j) => (j?.data?.task_status === 'failed' ? { refused: String(j.data.task_status_msg ?? 'failed') } : urls(j?.data?.task_result?.videos)) : seedanceOutputs };
}
/** One engine, two jobs: Video Swap and Render share the Kling / Seedance edit engines (same Router model, price row and catalogue card); each job takes its own body. */
function withRender(swap: RouterModelSpec & { name: string }, render: RouterModelSpec & { name: string }): RouterModelSpec & { name: string } {
  const pick = (i: In) => (isRenderJob(i) ? render : swap);
  return { ...swap, tools: [...(swap.tools ?? []), ...(render.tools ?? [])], block: (i) => pick(i).block?.(i) ?? null, calls: (i) => routerCalls(pick(i), i), callShare: (i, k) => (isRenderJob(i) ? 1 : swap.callShare?.(i, k) ?? 1),
    body: (i, k) => pick(i).body(i, k), finish: async (job, outs) => (isRenderJob(job.input) ? outs : swap.finish ? swap.finish(job, outs) : outs) };
}

// ---- Pruna P-Video-2 on Comfy Router (2026-10-31, docs.comfy.org/development/comfy-router/models/pruna/p-video-2/code) ----
// Body { input: { prompt, image?, last_frame_image?, duration 1–20, resolution 720p | 1080p, aspect_ratio (16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 1:1; ignored with an
// image), fps 24 | 48, draft, save_audio, prompt_upsampling, seed } }. image / last_frame_image are "URI" strings, and Pruna's own docs pass a file URL
// (docs.pruna.ai p-video-2: "Upload a reference image, then pass its file URL"), so the frames go as a link (mediaLink: Comfy storage with the key).
// Standard quality only (draft false): the Draft rate needs its own price tier, not wired yet. input.audio (the clip sets the length) is not wired either:
// our quote can't follow an audio clip's length yet. Billed per second of the returned clip (whole seconds). Refusal: status failed / canceled + error.
export const PVIDEO2_ASPECTS = ['16:9', '9:16', '4:3', '3:4', '1:1']; // the schema's 7 minus 3:2 / 2:3, which Generate Video's aspect list doesn't have
const pvideoIssue = (i: In): string | null => { const { m, frame } = videoJob(i);
  if (m === 'r2v') return 'P-Video-2 on Comfy Router takes text, a first frame, or first + last frame; it has no reference images';
  if ((m === 'i2v' || m === 'flf') && frame && !canLink()) return 'P-Video-2 on Comfy Router takes your frames as a link, uploaded with your Comfy key: add the key in Settings';
  return null; };
// ---- Grok Imagine Video 1.5 Lite on Comfy Router (2026-10-31, docs.comfy.org/development/comfy-router/models/xai/grok-imagine-video-1-5-lite/code) ----
// Body { model, prompt (≤ 4,096 characters), duration 1–15, aspect_ratio (1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3), resolution, image { type image_url, url (data URI ok) } }.
// model is sent (the field defaults to grok-imagine-video). Resolution 480p / 720p / 1080p: the Router pricing rows (the schema doesn't list values).
// Text and image to video only: reference_images has no documented count for Lite, so Reference to video is not offered. Sound: the page says Output: Video,
// but a real run (2026-10-31) returned an audio stream and the schema has no audio field, so the clip always has sound (videoCaps: no toggle). Refusal: block_reason; the result is video.url. The response carries usage.cost_in_usd_ticks (xAI's own cost).
export const GROK_VIDEO_PROMPT_MAX = 4096; export const GROK_VIDEO_ASPECTS = ['16:9', '9:16', '4:3', '3:4', '1:1'];
const grokVideoIssue = (i: In): string | null => { const { m, text } = videoJob(i);
  if (m === 'r2v' || m === 'flf') return 'Grok Imagine Video 1.5 Lite on Comfy Router takes text or a first frame';
  return text.length > GROK_VIDEO_PROMPT_MAX ? `Grok Imagine Video 1.5 Lite takes prompts up to ${GROK_VIDEO_PROMPT_MAX.toLocaleString('en-US')} characters; yours is ${text.length.toLocaleString('en-US')}. Shorten it` : null; };
// ---- HeyGen Voice on Comfy Router (2026-10-31, docs.comfy.org/development/comfy-router/models/heygen/starfish/code): heygen/starfish, HeyGen's Starfish TTS ----
// Body { text (1–5,000 characters), voice_id (a voice that supports Starfish), speed 0.5–2, input_type text, locale / language left out (read from the text) }.
// Output { data: { audio_url, duration } }. Billed per second of audio returned (Router pricing: 0.2013 credits / s).
// Our voice library → HeyGen Starfish voices (ids from HeyGen's own Starfish-compatible stock voices; narrator-crisp = the docs' own example voice).
// A 32-character HeyGen voice id passes as is (a voice of yours that supports Starfish).
export const HEYGEN_TEXT_MAX = 5000;
export const HEYGEN_VOICES: Record<string, { id: string; name: string }> = {
  'narrator-warm': { id: '007e1378fc454a9f976db570ba6164a7', name: 'Aria' }, 'narrator-crisp': { id: 'd2f4f24783d04e22ab49ee8fdc3715e0', name: 'Chill Brian' },
  'young-bright': { id: '084760b4922a44599575c770070ec2d7', name: 'Peppy Stella' }, 'deep-calm': { id: '03fcf8ecb0a94b6b94e9007edb7c35f8', name: 'Reassuring Rupert' },
  'energetic-host': { id: '0516c2d857eb425c94e90b068241914e', name: 'Dynamic Derek' }, 'whisper-soft': { id: '0258bbc2cd8648cfa357adfb833f6d7b', name: 'Saffron' },
};
export const heygenVoiceId = (v: unknown): string => { const s = String(v ?? ''); return HEYGEN_VOICES[s]?.id ?? (/^[0-9a-f]{32}$/i.test(s) ? s : HEYGEN_VOICES['narrator-warm'].id); };
const heygenSpeed = (i: In) => { const n = Number(i.voiceNative?.speed ?? i.voiceControls?.speed ?? 1); return Number.isFinite(n) ? Math.min(2, Math.max(0.5, Math.round(n * 100) / 100)) : 1; };
const heygenLong = scriptTooLong('HeyGen Voice', HEYGEN_TEXT_MAX);

// Wan 3.0 / Wan 3.0 Prime on Comfy Router (2026-10-25, Prime 2026-10-31; docs.comfy.org/development/comfy-router/models/wan/wan3-0-video/code and
// …/wan3-0-video-prime/code: one schema): input.media first_frame (+ last_frame) or reference_image (≤10; the two kinds never in one request), images inline
// as data URIs (videos / audio would need a public URL: not wired). parameters: resolution 480P / 720P / 1080P, duration 2–30 s, ratio (adaptive with a frame or
// in Reference to video when Auto; 16:9 for Auto text to video, like Seedance), audio on / off, prompt_extend off unless asked, watermark false.
// Refusal: root code / message, or output.task_status FAILED with output.message.
function wan3Router(name: string, id: string, docPath: string): RouterModelSpec {
  return { tools: ['h3-video'], id, doc: DOC(docPath), out: 'video', queue: true, maxRefs: WAN3_REFS, block: noVideoRefs(name),
    body: async (i) => { const { m, text, frame } = videoJob(i); const media: { type: string; url: string }[] = [];
      if ((m === 'i2v' || m === 'flf') && frame) media.push({ type: 'first_frame', url: await dataUri(frame) });
      if (m === 'flf' && frame && i.lastFramePath) media.push({ type: 'last_frame', url: await dataUri(i.lastFramePath) });
      for (const p of videoRefPaths(i, WAN3_REFS)) media.push({ type: 'reference_image', url: await dataUri(p) });
      const keyed = media.some((x) => x.type !== 'reference_image');
      return { input: omit({ prompt: text, negative_prompt: negOf(i), media: media.length ? media : undefined }),
        parameters: omit({ resolution: ({ '480p': '480P', '720p': '720P', '1080p': '1080P' } as Record<string, string>)[String(i.resolution)] ?? '720P', duration: Math.min(30, Math.max(2, Math.round(Number(i.duration) || 5))),
          ratio: keyed ? 'adaptive' : ['16:9', '9:16', '1:1', '4:3', '3:4'].includes(i.aspect) ? i.aspect : m === 'r2v' ? 'adaptive' : '16:9', audio: i.audio !== false, prompt_extend: i.promptRewrite === true, watermark: false, seed: seedOf(i, 0) }) }; },
    outputs: (j) => { if (j?.code && !j?.output?.video_url) return { refused: String(j.message ?? j.code) }; const st = String(j?.output?.task_status ?? '');
      if (/^(FAILED|CANCELED)$/.test(st)) return { refused: String(j.output.message ?? j.output.code ?? st) }; return j?.output?.video_url ? [{ url: j.output.video_url }] : []; } };
}
export const ROUTER_MODELS: Record<string, RouterModelSpec & { name?: string }> = {
  // ---------------- Create Image ----------------
  'api-gpt-image': img({ name: 'GPT Image 2', id: 'openai/gpt-image-2', doc: DOC('openai/gpt-image-2'), maxRefs: 16, mask: true, block: gptSizeIssue, body: gptBody, outputs: gptOutputs }),
  // GPT Image 2.5 (OpenAI, 2026-09): same gpt-image schema as GPT Image 2; adds xhigh / max tiers (not offered: our tiers are low / medium / high).
  'api-gpt-image-25-flare': img({ name: 'GPT Image 2.5 Flare', id: 'openai/gpt-image-2.5-flare', doc: DOC('openai/gpt-image-2-5-flare'), maxRefs: 16, mask: true, block: gptSizeIssue, body: gptBody, outputs: gptOutputs }),
  'api-gpt-image-25-sunburst': img({ name: 'GPT Image 2.5 Sunburst', id: 'openai/gpt-image-2.5-sunburst', doc: DOC('openai/gpt-image-2-5-sunburst'), maxRefs: 16, mask: true, block: gptSizeIssue, body: gptBody, outputs: gptOutputs }),
  // GPT Image 1.5 (2026-10-25): generate, edit with up to 16 images, mask; three 1K sizes (gpt15Body). Token-billed (hostedPrices.ts GPT15_TOKENS).
  'api-gpt-image-15': img({ name: 'GPT Image 1.5', id: 'openai/gpt-image-1.5', doc: DOC('openai/gpt-image-1-5'), maxRefs: 16, mask: true, block: gpt15SizeIssue, body: gpt15Body, outputs: gptOutputs }),
  // Seedream 5.0 Pro / Flash (checked 2026-10-24): up to 10 images (the Router page: "the reference-image ceiling, which is 10 on this model"); sizes in shared/routerImageSizes.ts
  'api-seedream': img({ name: 'Seedream 5.0 Pro', id: 'byteplus/seedream-5-0-pro-260628', doc: DOC('byteplus/seedream-5-0-pro-260628'), maxRefs: 10, block: routerSizeIssue('api-seedream'), body: seedreamBody('api-seedream'), outputs: seedreamOutputs }),
  'api-seedream-flash': img({ name: 'Seedream 5.0 Flash', id: 'byteplus/seedream-5-0-flash-260915', doc: DOC('byteplus/seedream-5-0-flash-260915'), maxRefs: 10, block: routerSizeIssue('api-seedream-flash'), body: seedreamBody('api-seedream-flash'), outputs: seedreamOutputs }),
  // Seedream 4.5 (2026-10-25): 2K / 4K exact sizes, generate or edit with up to 14 images.
  'api-seedream-45': img({ name: 'Seedream 4.5', id: 'byteplus/seedream-4-5-251128', doc: DOC('byteplus/seedream-4-5-251128'), maxRefs: 14, block: (i) => routerSizeIssue('api-seedream-45')(at2K(i)), body: seedream45Body, outputs: seedreamOutputs }),
  // Ideogram V4: resolution = one of its 21 2K values for the picked shape; Auto = resolution left out ("Omit to let the model pick an aspect ratio").
  'api-ideogram': img({ name: 'Ideogram V4', id: 'ideogram/ideogram-v4', doc: DOC('ideogram/ideogram-v4'), maxRefs: 0, block: shapeIssue(IDEOGRAM_ASPECTS, 'Ideogram V4'),
    body: async (i, k) => omit({ text_prompt: promptOf(i, k), rendering_speed: ({ low: 'TURBO', med: 'DEFAULT', high: 'QUALITY' } as const)[tierOf(i)], resolution: ideogramSizeOf(i, 'Ideogram V4') }),
    outputs: (j) => urls(j?.data) }),
  // Ideogram 4.5: generate, or edit with `images` (≤5; the first is the one edited). quality low / medium / high (very_low needs images: not offered).
  // size: the picked shape as one of the 21 Ideogram 2K presets (WIDTHxHEIGHT); Auto = left out (the schema's default auto); an edit on Match photo = "source"
  // (the photo's size; the schema: "source (requires images)"). No mask here (its mask is black = edit; masks go to the fal route).
  'api-ideogram-45': img({ name: 'Ideogram 4.5', id: 'ideogram/ideogram-4-5', doc: DOC('ideogram/ideogram-4-5'), maxRefs: 5, block: shapeIssue(IDEOGRAM_ASPECTS, 'Ideogram 4.5'),
    body: async (i, k) => { const refs = imageRefs(i);
      return omit({ prompt: promptOf(i, k), quality: ({ low: 'low', med: 'medium', high: 'high' } as const)[tierOf(i)], num_images: 1, seed: seedOf(i, k),
        size: refs.length && i.aspectAuto === true ? 'source' : ideogramSizeOf(i, 'Ideogram 4.5'), images: refs.length ? await Promise.all(refs.map(dataUri)) : undefined }); },
    outputs: (j) => ((j?.data ?? []).length && (j.data as any[]).every((d) => d?.is_image_safe === false) ? { refused: 'is_image_safe false' } : urls((j?.data ?? []).filter((d: any) => d?.is_image_safe !== false))) }),
  'api-recraft': img({ name: 'Recraft V4', id: 'recraft/recraftv4', doc: DOC('recraft/recraftv4'), maxRefs: 0, block: shapeIssue(RECRAFT_ASPECTS, 'Recraft'), body: recraftBody('1K'), outputs: (j) => urls(j?.data) }),
  'api-recraft-41': img({ name: 'Recraft V4.1', id: 'recraft/recraftv4_1', doc: DOC('recraft/recraftv4-1'), maxRefs: 0, block: shapeIssue(RECRAFT_ASPECTS, 'Recraft'), body: recraftBody('1K'), outputs: (j) => urls(j?.data) }),
  'api-recraft-41-pro': img({ name: 'Recraft V4.1 Pro', id: 'recraft/recraftv4_1_pro', doc: DOC('recraft/recraftv4-1-pro'), maxRefs: 0, block: shapeIssue(RECRAFT_ASPECTS, 'Recraft'), body: recraftBody('2K'), outputs: (j) => urls(j?.data) }),
  'api-luma-image': img({ name: 'Luma UNI-1', id: 'luma_2/uni-1', doc: DOC('luma_2/uni-1'), maxRefs: 9, block: shapeIssue(LUMA_ASPECTS, 'Luma UNI-1'), body: lumaBody, outputs: lumaOutputs }),
  'api-luma-uni1-max': img({ name: 'Luma UNI-1 Max', id: 'luma_2/uni-1-max', doc: DOC('luma_2/uni-1-max'), maxRefs: 9, block: shapeIssue(LUMA_ASPECTS, 'Luma UNI-1'), body: lumaBody, outputs: lumaOutputs }),
  'api-kling-image': img({ name: 'Kling Image O1', id: 'kling/kling-image-o1', doc: DOC('kling/kling-image-o1'), maxRefs: 4, block: shapeIssue(KLING_IMAGE_ASPECTS, 'Kling Image O1'),
    body: async (i, k) => { const refs = imageRefs(i);
      return omit({ prompt: promptOf(i, k), n: 1, resolution: resOf(i).toLowerCase(), aspect_ratio: shapeOrThrow(KLING_IMAGE_ASPECTS, 'Kling Image O1', i) ?? 'auto',
        image_list: refs.length ? await Promise.all(refs.map(async (p) => ({ image: await b64(p) }))) : undefined }); },
    outputs: (j) => (j?.data?.task_status === 'failed' ? { refused: String(j.data.task_status_msg ?? 'failed') } : urls(j?.data?.task_result?.images)) }),
  // Krea 3: aspect_ratio = the picked shape; Auto = left out ("omit for automatic framing"). References must first be uploaded to /proxy/krea/assets (not wired).
  'api-krea': img({ name: 'Krea 3', id: 'krea/krea-3', doc: DOC('krea/krea-3'), maxRefs: 0,
    block: (i) => shapeIssue(KREA_ASPECTS, 'Krea 3')(i) ?? (kreaThinking(i) === 'ultra' && resOf(i) !== '2K' ? 'Krea 3 Think most needs 2K' : null),
    body: async (i, k) => { const res = resOf(i) === '2K' ? '2k' : '1k'; const thinking = kreaThinking(i); if (thinking === 'ultra' && res !== '2k') throw new Error('Krea 3 Think most needs 2K');
      return omit({ prompt: promptOf(i, k), resolution: res, aspect_ratio: shapeOrThrow(KREA_ASPECTS, 'Krea 3', i) ?? undefined, seed: seedOf(i, k), thinking_mode: thinking }); },
    outputs: (j) => urls(j?.result?.urls) }),
  // Runway Gen-4 Image: ratio (required) = the picked one of Runway's 10 pixel ratios, sent as it is; no shape (an old client) = 1024:1024.
  // referenceImages[].uri: "A HTTPS URL or data URI containing an encoded image", so photos go inline as data URIs (up to 3, imageCaps.ts).
  'api-runway-image': img({ name: 'Runway Gen-4 Image', id: 'runway/gen4_image', doc: DOC('runway/gen4-image'), maxRefs: 3,
    block: (i) => shapeIssue(RUNWAY_RATIOS, 'Runway Gen-4 Image')(i) ?? (imageRefs(i).length > 3 ? `Runway Gen-4 Image takes up to 3 photos; you added ${imageRefs(i).length}` : null),
    body: async (i, k) => { const refs = imageRefs(i);
      return omit({ promptText: promptOf(i, k), ratio: shapeOrThrow(RUNWAY_RATIOS, 'Runway Gen-4 Image', i) ?? '1024:1024', referenceImages: refs.length ? await Promise.all(refs.slice(0, 3).map(async (p) => ({ uri: await dataUri(p) }))) : undefined }); },
    outputs: (j) => (j?.status === 'FAILED' ? { refused: String(j.failure ?? 'failed') } : urls(j?.output)) }),
  'api-grok-image': img({ name: 'Grok Imagine Image 2.0', id: 'xai/grok-imagine-image-2.0', doc: DOC('xai/grok-imagine-image-2-0'), maxRefs: 0, block: shapeIssue(GROK_IMAGE_ASPECTS, 'Grok Imagine Image 2.0'),
    body: async (i, k) => omit({ prompt: promptOf(i, k), n: 1, response_format: 'url', resolution: resOf(i) === '2K' ? '2k' : '1k', quality: tierOf(i) === 'low' ? 'low' : 'medium',
      aspect_ratio: shapeOrThrow(GROK_IMAGE_ASPECTS, 'Grok Imagine Image 2.0', i) ?? 'auto' }),
    outputs: grokOutputs }),
  // Bria FIBO 2.0 (2026-10-26): new images on bria/image, edits (one photo, optional mask) on bria/fibo (fiboBody above)
  'api-bria-fibo2': img({ name: 'FIBO 2.0', id: 'bria/image', idFor: (i) => (fiboEditing(i) ? 'bria/fibo' : 'bria/image'), doc: DOC('bria/image'), maxRefs: 1, mask: true, block: fiboIssue, body: fiboBody, outputs: fiboOutputs }),
  // Grok Imagine Image Pro (2026-10-25, models/xai/grok-imagine-image-pro): the same xAI schema, prompt only (no image field), resolution 1k / 2k, aspect_ratio
  // (13 + auto). quality is not sent: "other models currently ignore it" (it picks the price tier on 2.0 only).
  'api-grok-image-pro': img({ name: 'Grok Imagine Image Pro', id: 'xai/grok-imagine-image-pro', doc: DOC('xai/grok-imagine-image-pro'), maxRefs: 0, block: (i) => shapeIssue(GROK_IMAGE_ASPECTS, 'Grok Imagine Image Pro')(i) ?? grokResIssue(i),
    body: async (i, k) => { const bad = grokResIssue(i); if (bad) throw new Error(bad); return omit({ prompt: promptOf(i, k), n: 1, response_format: 'url', resolution: resOf(i) === '2K' ? '2k' : '1k', aspect_ratio: shapeOrThrow(GROK_IMAGE_ASPECTS, 'Grok Imagine Image Pro', i) ?? 'auto' }); },
    outputs: grokOutputs }),
  // Qwen Image 3.0 / 3.0 Pro: text-to-image, or an edit with 1–3 images (content = images + one text; 0.9052 credits per input image)
  'api-qwen-image': img({ name: 'Qwen Image 3.0', id: 'qwen/qwen-image-3.0', doc: DOC('qwen/qwen-image-3-0'), maxRefs: 3, block: routerSizeIssue('api-qwen-image'), body: qwenBody('api-qwen-image'), outputs: qwenOutputs }),
  'api-qwen-image-pro': img({ name: 'Qwen Image 3.0 Pro', id: 'qwen/qwen-image-3.0-pro', doc: DOC('qwen/qwen-image-3-0-pro'), maxRefs: 3, block: routerSizeIssue('api-qwen-image-pro'), body: qwenBody('api-qwen-image-pro'), outputs: qwenOutputs }),
  // Wan 2.5 text to image (checked 2026-10-24): prompt ≤800 characters, negative_prompt, n 1, size W*H (one size per shape, area 1280²…1440²), seed,
  // prompt_extend (off unless asked), watermark false. Text to image only on this Router id (Wan 2.5 edit is a separate id, wan2.5-i2i-preview: not wired).
  'api-wan-image': img({ name: 'Wan 2.5 Image', id: 'wan/wan2.5-t2i-preview', doc: DOC('wan/wan2-5-t2i-preview'), maxRefs: 0,
    block: (i) => routerSizeIssue('api-wan-image')(i) ?? wanPromptIssue(promptOf(i)),
    body: async (i, k) => { const size = sizeOrThrow('api-wan-image', i); const bad = wanPromptIssue(promptOf(i, k)); if (bad) throw new Error(bad);
      return { input: omit({ prompt: promptOf(i, k), negative_prompt: negOf(i) }), parameters: omit({ n: 1, size, seed: seedOf(i, k), prompt_extend: i.promptRewrite === true, watermark: false }) }; },
    outputs: (j) => { if (j?.code && !j?.output?.results?.length) return { refused: String(j.message ?? j.code) }; if (j?.output?.task_status === 'FAILED') return { refused: String(j.output.message ?? 'failed') };
      const r = (j?.output?.results ?? []) as any[]; const out = urls(r); const why = r.find((x) => x?.code)?.message; return !out.length && why ? { refused: String(why) } : out; } }),
  'api-nano-banana': img({ name: 'Nano Banana 2', id: 'vertexai/gemini-3.1-flash-image', doc: DOC('google/nano-banana-2'), maxRefs: 4, block: geminiAspectIssue(GEMINI_ASPECTS_14), body: geminiBody(GEMINI_ASPECTS_14), outputs: geminiOutputs }),
  // Nano Banana 2 Lite (2026-10-25): its native route is the Gemini API (providers/gemini.ts); this is its Comfy Router place (routes.ts adds the route
  // comfy-router:direct-gemini-nb2-lite). Same Vertex Gemini schema, 1K only ("1K | MINIMAL, HIGH", partner-node page), the 10 shapes and 14 images of the Gemini route.
  'direct-gemini-nb2-lite': img({ name: 'Nano Banana 2 Lite', id: 'vertexai/gemini-3.1-flash-lite-image', doc: DOC('google/nano-banana-2-lite'), maxRefs: 14,
    block: (i) => (resOf(i) !== '1K' ? 'Nano Banana 2 Lite makes 1K images' : geminiAspectIssue(GEMINI_ASPECTS_10)(i)), body: async (i, k) => { if (resOf(i) !== '1K') throw new Error('Nano Banana 2 Lite makes 1K images'); return geminiBody(GEMINI_ASPECTS_10)(i, k); }, outputs: geminiOutputs }),
  // Nano Banana 2.1 / Pro: same Vertex Gemini schema as Nano Banana 2; Google: "up to 14 reference images" (ai.google.dev/gemini-api/docs/image-generation).
  // Aspects per model (imageCaps.ts, checked 2026-10-24): 2.1 and 2 take 14 (with 1:4, 4:1, 1:8, 8:1), Pro 10.
  'api-nano-banana-21': img({ name: 'Nano Banana 2.1', id: 'vertexai/gemini-nano-banana-2.1', doc: DOC('google/gemini-nano-banana-2-1'), maxRefs: 14, block: geminiAspectIssue(GEMINI_ASPECTS_14), body: geminiBody(GEMINI_ASPECTS_14), outputs: geminiOutputs }),
  'api-nano-banana-pro': img({ name: 'Nano Banana Pro', id: 'vertexai/gemini-3-pro-image', doc: DOC('google/nano-banana-pro'), maxRefs: 14, block: geminiAspectIssue(GEMINI_ASPECTS_10), body: geminiBody(GEMINI_ASPECTS_10), outputs: geminiOutputs }),
  'api-flux2': img({ name: 'FLUX.2 [pro]', id: 'bfl/flux-2-pro', doc: DOC('black-forest-labs/flux-2-pro'), maxRefs: 9, block: shapeIssue(FLUX2_ASPECTS, 'FLUX.2'), body: flux2Body, outputs: bflOutputs }),
  'api-flux2-max': img({ name: 'FLUX.2 [max]', id: 'bfl/flux-2-max', doc: DOC('black-forest-labs/flux-2-max'), maxRefs: 9, block: shapeIssue(FLUX2_ASPECTS, 'FLUX.2'), body: flux2Body, outputs: bflOutputs }),
  // FLUX 3 Image: prompt, aspect_ratio (enum, auto = the first image's), resolution 768sq / 1k / 1.5k / 2k / 4k, images 1–10 (http(s) URL or base64). No seed.
  'api-flux3-image': img({ name: 'FLUX 3 Image', id: 'bfl/flux-3-image', doc: DOC('black-forest-labs/flux-3-image'), maxRefs: 10, block: shapeIssue(FLUX3_ASPECTS, 'FLUX 3 Image'),
    body: async (i, k) => { const refs = imageRefs(i);
      return omit({ prompt: withFlux3BoxRows(promptOf(i, k), i.layoutBoxes) /* layout boxes (shared/layoutBoxes.ts): the FLUX 3 Image partner node's rows */, aspect_ratio: shapeOrThrow(FLUX3_ASPECTS, 'FLUX 3 Image', i) ?? 'auto', resolution: FLUX3_RES[resOf(i)], safety_tolerance: 2, images: refs.length ? await Promise.all(refs.map(b64)) : undefined }); },
    outputs: bflOutputs }),

  // ---------------- Upscale (image-upscale, 2026-10-22): the photo inline as a data URI (the schemas say "URL of the image"; inline media is how every
  // Router body here sends images, not confirmed for these two: first real run to check). Factor → WaveSpeed's 2K / 4K / 8K tier; Crystal takes the factor.
  'router-seedvr2-upscale': img({ name: 'SeedVR2', id: 'wavespeed/seedvr2', doc: DOC('wavespeed/seedvr2'), maxRefs: 1, tools: ['image-upscale'],
    block: (i) => (!i.imagePath ? 'SeedVR2 on Comfy Router needs your image' : null),
    body: async (i) => ({ image: await dataUri(i.imagePath), target_resolution: seedvr2Tier(i), output_format: 'png', enable_base64_output: false }),
    outputs: (j) => (j?.data?.status === 'failed' || (j?.data?.error && !j?.data?.outputs?.length) ? { refused: String(j.data.error ?? 'failed') } : (j?.data?.outputs ?? []).map((u: string) => (/^(https?:|data:)/.test(u) ? { url: u } : { b64: u, mime: 'image/png' }))) }),
  'api-crystal-upscale': img({ name: 'Crystal Upscaler', id: 'fal/crystal-upscaler', doc: DOC('fal/crystal-upscaler'), maxRefs: 1, tools: ['image-upscale'],
    block: (i) => (!i.imagePath ? 'Crystal on Comfy Router needs your image' : null),
    body: async (i) => ({ image_url: await dataUri(i.imagePath), scale_factor: upscaleFactorOf(i), output_format: 'png' }),
    outputs: (j) => urls(j?.images) }),

  // ---------------- Video (Generate Video and the apps on it): prompt, first / last frame, reference images ----------------
  'router-seedance': seedanceRouter('router-seedance', { name: 'Seedance 2.0', model: 'dreamina-seedance-2-0-260128', apps: true }),
  // Same models as the BytePlus places (direct-seedance-*), on Comfy Router (2026-10-25): one more Run on place on the same model card.
  'router-seedance-25': seedanceRouter('router-seedance-25', { name: 'Seedance 2.5', model: 'dreamina-seedance-2-5-260628' }),
  'router-seedance-20-fast': seedanceRouter('router-seedance-20-fast', { name: 'Seedance 2.0 Fast', model: 'dreamina-seedance-2-0-fast-260128' }),
  'router-seedance-20-mini': seedanceRouter('router-seedance-20-mini', { name: 'Seedance 2.0 Mini', model: 'dreamina-seedance-2-0-mini' }),
  // Kling 3.0 Omni (2026-10-25, docs.comfy.org/development/comfy-router/models/kling/kling-v3-omni/code): the one Kling 3.0 on Generate Video, every mode.
  // kling-v3 (the old id here) takes text only; Omni takes text, a first frame (+ end_frame), or up to 7 reference images (KlingOmniProImageToVideoNode),
  // at the same price with sound off and less with sound on (partner-node pricing: kling-v3-omni 17.72 / 23.63 cr/s, 23.63 / 29.54 with audio).
  // image_list items: { image_url, type: first_frame | end_frame } or, without a type, a reference image (named <<<image_N>>> in the prompt).
  // aspect_ratio only without a first frame (the frame sets it); mode std = 720p, pro = 1080p (4K isn't in the Router enum); no seed, no negative prompt.
  'router-kling': { tools: ['h3-video'], id: 'kling/kling-v3-omni', doc: DOC('kling/kling-v3-omni'), out: 'video', queue: true, maxRefs: KLING_OMNI_REFS,
    block: (i) => noVideoRefs('Kling 3.0 Omni')(i) ?? klingOmniIssue(i),
    body: async (i) => { const bad = klingOmniIssue(i); if (bad) throw new Error(bad); const { m, text, frame } = videoJob(i); const list: { image_url: string; type?: string }[] = [];
      if ((m === 'i2v' || m === 'flf') && frame) list.push({ image_url: await dataUri(frame), type: 'first_frame' });
      if (m === 'flf' && frame && i.lastFramePath) list.push({ image_url: await dataUri(i.lastFramePath), type: 'end_frame' });
      const refs = videoRefPaths(i, KLING_OMNI_REFS); for (const p of refs) list.push({ image_url: await dataUri(p) });
      const keyed = list.some((x) => x.type);
      return omit({ prompt: klingRefPrompt(text, refs.length), duration: String(Math.min(15, Math.max(3, Math.round(Number(i.duration) || 5)))),
        aspect_ratio: keyed ? undefined : ['16:9', '9:16', '1:1'].includes(i.aspect) ? i.aspect : '16:9', mode: i.resolution === '1080p' ? 'pro' : 'std', sound: i.audio === true ? 'on' : 'off',
        image_list: list.length ? list : undefined, watermark_info: { enabled: false } }); },
    outputs: (j) => (j?.data?.task_status === 'failed' ? { refused: String(j.data.task_status_msg ?? 'failed') } : urls(j?.data?.task_result?.videos)) },
  // Video Swap (2026-10-25): Kling 3.0 Omni video edit (refer_type base; ≤ 10 s a pass, joined) and Seedance 2.5 video edit (duration -1, up to 30 s in one pass).
  // Both send ONE character image; the clip's own sound is put back after. Bodies: swapSpec above; schemas: router-schemas kling__kling-v3-omni, byteplus__dreamina-seedance-2-5-260628.
  'router-kling-edit': withRender(swapSpec('router-kling-edit'), renderSpec(RENDER_KLING)),
  'router-seedance-25-edit': withRender(swapSpec('router-seedance-25-edit'), renderSpec(RENDER_SEEDANCE)),
  // Render (Direct a Shot step 3, 2026-10-26): Runway Aleph 2 (videoUri inline + promptImage first) and Luma Ray 3.2 video_edit (source.data inline, adhere_1).
  // Bodies: renderBody above; schemas: Router pages runway/aleph2 and luma_2/ray-3-2 (the Luma Agents request object, same as uni-1's cached schema).
  [RENDER_ALEPH]: renderSpec(RENDER_ALEPH),
  [RENDER_RAY]: renderSpec(RENDER_RAY),
  // Wan 3.0 (2026-10-25): wan3Router above (body, refusal).
  'router-wan3': wan3Router('Wan 3.0', 'wan/wan3.0-video', 'wan/wan3-0-video'),
  // Wan 3.0 Prime (2026-10-31, docs.comfy.org/development/comfy-router/models/wan/wan3-0-video-prime/code): the same input schema as Wan 3.0 (field
  // lists identical), its own Router id and price; Alibaba's faster tier of Wan 3.0.
  'router-wan3-prime': wan3Router('Wan 3.0 Prime', 'wan/wan3.0-video-prime', 'wan/wan3-0-video-prime'),
  'router-veo': veoRouter('Veo 3.1', 'veo/veo-3.1-generate-001', 'veo/veo-3-1-generate-001'),
  'router-veo-fast': veoRouter('Veo 3.1 Fast', 'veo/veo-3.1-fast-generate-001', 'veo/veo-3-1-fast-generate-001'), // 2026-10-25: same schema and rules as Veo 3.1
  // Veo 3.1 Lite (2026-10-31, docs.comfy.org/development/comfy-router/models/veo/veo-3-1-lite-generate-001/code): the same Vertex schema as Veo 3.1 (field lists
  // identical). 720p / 1080p only: the Router pricing page has no 4K rate for Lite, and Google's launch post lists 720p and 1080p, 4 / 6 / 8 s, 16:9 / 9:16.
  'router-veo-lite': veoRouter('Veo 3.1 Lite', 'veo/veo-3.1-lite-generate-001', 'veo/veo-3-1-lite-generate-001', { k4: false }),
  // Pruna P-Video-2 (2026-10-31): pvideoIssue above. Text, first frame or first + last frame; 720p / 1080p; 2–20 s (1 s isn't on Generate Video's length list).
  'router-pvideo2': { name: 'P-Video-2', tools: ['h3-video'], id: 'pruna/p-video-2', doc: DOC('pruna/p-video-2'), out: 'video', queue: true, maxRefs: 0,
    block: (i) => noVideoRefs('P-Video-2')(i) ?? pvideoIssue(i),
    body: async (i) => { const bad = pvideoIssue(i); if (bad) throw new Error(bad); const { m, text, frame } = videoJob(i);
      const image = (m === 'i2v' || m === 'flf') && frame ? await mediaLink(frame, 'P-Video-2') : undefined;
      const last = m === 'flf' && frame && i.lastFramePath ? await mediaLink(String(i.lastFramePath), 'P-Video-2') : undefined;
      return { input: omit({ prompt: text, image, last_frame_image: last, duration: Math.min(20, Math.max(1, Math.round(Number(i.duration) || 5))), resolution: i.resolution === '1080p' ? '1080p' : '720p',
        aspect_ratio: image ? undefined : PVIDEO2_ASPECTS.includes(i.aspect) ? i.aspect : '16:9', fps: 24, draft: false, save_audio: i.audio !== false,
        prompt_upsampling: i.promptRewrite === false || i.promptRewrite === '0' ? false : undefined /* Pruna's default (true) unless switched off */, seed: seedOf(i, 0) }) }; },
    outputs: (j) => (/^(failed|canceled)$/i.test(String(j?.status ?? '')) ? { refused: String(j?.error ?? j?.message ?? j.status) } : typeof j?.generation_url === 'string' && j.generation_url ? [{ url: j.generation_url }] : []) },
  // Grok Imagine Video 1.5 Lite (2026-10-31): grokVideoIssue above. 2–15 s (1 s isn't on Generate Video's length list), 480p / 720p / 1080p.
  'router-grok-video-lite': { name: 'Grok Imagine Video 1.5 Lite', tools: ['h3-video'], id: 'xai/grok-imagine-video-1.5-lite', doc: DOC('xai/grok-imagine-video-1-5-lite'), out: 'video', queue: true, maxRefs: 0,
    block: (i) => noVideoRefs('Grok Imagine Video 1.5 Lite')(i) ?? grokVideoIssue(i),
    body: async (i) => { const bad = grokVideoIssue(i); if (bad) throw new Error(bad); const { m, text, frame } = videoJob(i);
      const image = m === 'i2v' && frame ? { type: 'image_url', url: await dataUri(frame) } : undefined;
      return omit({ model: 'grok-imagine-video-1.5-lite', prompt: text, duration: Math.min(15, Math.max(1, Math.round(Number(i.duration) || 5))),
        aspect_ratio: image ? undefined : GROK_VIDEO_ASPECTS.includes(i.aspect) ? i.aspect : '16:9', resolution: ['480p', '720p', '1080p'].includes(i.resolution) ? i.resolution : '720p', image }); },
    outputs: (j) => (j?.block_reason ? { refused: String(j.block_reason) } : typeof j?.video?.url === 'string' && j.video.url ? [{ url: j.video.url }] : []) },
  'api-minimax-h3': { tools: ['h3-video', ...ROUTER_VIDEO_APPS], id: 'minimax/minimax-h3', doc: DOC('minimax/minimax-h3'), out: 'video', queue: true, maxRefs: 9, block: noVideoRefs('MiniMax H3', true, 'api-minimax-h3'),
    body: async (i) => { const { m, text, frame, aspect } = videoJob(i); const content: any[] = [{ type: 'text', text }];
      if ((m === 'i2v' || m === 'flf') && frame) content.push({ type: 'image_url', image_url: { url: await frameUri(frame, aspect) }, role: 'first_frame' });
      if (m === 'flf' && i.lastFramePath) content.push({ type: 'image_url', image_url: { url: await dataUri(i.lastFramePath) }, role: 'last_frame' });
      for (const p of videoRefPaths(i)) content.push({ type: 'image_url', image_url: { url: await dataUri(p) }, role: 'reference_image' });
      await avContent('api-minimax-h3', i, content); // reference videos and audio as data URIs, Reference to video only
      // ratio: required (not adaptive) for text to video, ignored with a first / last frame, as picked in Reference to video (adaptive when Auto).
      // base_video (re-render a 768P H3 clip at 2K) is not wired: no tool makes that job.
      return omit({ content, duration: Math.min(15, Math.max(4, Math.round(Number(i.duration) || 5))) /* 4–15 s: what Comfy Router accepts (its minimax-h3 page) and the bar offers (videoCaps api-minimax-h3) */, resolution: /^(2k|1080p)$/i.test(String(i.resolution)) ? '2K' : '768P', // 1080p (app tools) runs and is priced as 2K (hostedPrices); 480p / 720p as 768P
        ratio: ['t2v', 'r2v'].includes(m) && ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'].includes(i.aspect) ? i.aspect : m === 't2v' ? '16:9' : 'adaptive', seed: seedOf(i, 0) }); },
    outputs: (j) => (/fail/i.test(String(j?.task?.status ?? '')) ? { refused: String(j.task.error?.message ?? j.task.status) } : j?.task?.content?.url ? [{ url: j.task.content.url }] : []) },
  // H3 Talking Photo on Comfy Router (2026-10-26, H3 map F2): reference to video with the portrait as reference_image and the speech as
  // reference_audio, no LoRA (the same recipe as the fal / Replicate routes and the local graph). Router H3 (docs.comfy.org/development/comfy-router/
  // models/minimax/minimax-h3/code + the partner-node page): reference audio 2–15 s per clip, only next to an image or video, MP3 or WAV; the
  // prompt names them "Image 1" / "Audio 1" (shared/promptGrammar.ts, rewritten by routing/jobRefs.ts before this body). Output 5–15 s.
  'comfy-h3-lipsync': { name: 'H3 Talking Photo', tools: ['voice'], id: 'minimax/minimax-h3', doc: DOC('minimax/minimax-h3'), out: 'video', queue: true, maxRefs: 1, block: h3LipsyncIssue,
    body: async (i) => { const bad = h3LipsyncIssue(i); if (bad) throw new Error(bad); const portrait = h3Portrait(i)!;
      const content: any[] = [{ type: 'text', text: promptOf(i) }, { type: 'image_url', image_url: { url: await dataUri(portrait) }, role: 'reference_image' },
        { type: 'audio_url', audio_url: { url: await dataUri(await routerSpeech(i.speechPath, Number(i.speechSeconds))) }, role: 'reference_audio' }];
      return omit({ content, duration: h3LipsyncSeconds(i), resolution: '768P', ratio: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'].includes(i.aspect) ? i.aspect : 'adaptive', seed: seedOf(i, 0) }); },
    outputs: (j) => (/fail/i.test(String(j?.task?.status ?? '')) ? { refused: String(j.task.error?.message ?? j.task.status) } : j?.task?.content?.url ? [{ url: j.task.content.url }] : []) },
  // H3 Camera Motion on Comfy Router (2026-10-26): plain MiniMax H3 image to video with the move written into the prompt ("prompt-directed": the 7 moves ×
  // Slow / Aggressive as words, no camera LoRA; the LoRA version stays on the local graph and a deployment). Same body as MiniMax H3's Camera Moves recipe.
  'comfy-h3-camera': { name: 'H3 Camera Motion', tools: ['camera'], id: 'minimax/minimax-h3', doc: DOC('minimax/minimax-h3'), out: 'video', queue: true, maxRefs: 0, block: h3CameraRouterIssue,
    body: async (i) => { const bad = h3CameraRouterIssue(i); if (bad) throw new Error(bad);
      const content: any[] = [{ type: 'text', text: h3CameraRouterPrompt(i) }, { type: 'image_url', image_url: { url: await dataUri(String(i.imagePath)) }, role: 'first_frame' }];
      return omit({ content, duration: h3CameraRouterSeconds(i), resolution: '768P', ratio: 'adaptive', seed: seedOf(i, 0) }); },
    outputs: (j) => (/fail/i.test(String(j?.task?.status ?? '')) ? { refused: String(j.task.error?.message ?? j.task.status) } : j?.task?.content?.url ? [{ url: j.task.content.url }] : []) },
  // H3 Extend · via last frame on Comfy Router (2026-10-26, H3 map F3): the source's exact last frame → Router H3 image to video with the prompt
  // (+5 / +8 / +10 s) → joined onto the source (tools/h3/routerExtend.ts: the shared frame grab and extend join; source sound kept, H3's sound after).
  'comfy-h3-extend': { name: H3_ROUTER_EXTEND_LABEL, tools: ['h3-extend'], id: 'minimax/minimax-h3', doc: DOC('minimax/minimax-h3'), out: 'video', queue: true, maxRefs: 0, block: h3RouterExtendIssue,
    body: async (i) => { const bad = h3RouterExtendIssue(i); if (bad) throw new Error(bad);
      const content: any[] = [{ type: 'text', text: promptOf(i) }, { type: 'image_url', image_url: { url: await dataUri(await h3ExtendLastFrame(i)) }, role: 'first_frame' }];
      return omit({ content, duration: h3RouterExtendSeconds(i), resolution: '768P', ratio: 'adaptive', seed: seedOf(i, 0) }); },
    outputs: (j) => (/fail/i.test(String(j?.task?.status ?? '')) ? { refused: String(j.task.error?.message ?? j.task.status) } : j?.task?.content?.url ? [{ url: j.task.content.url }] : []),
    finish: async (job, outs) => { const gen = path.join(DATA_DIR, path.basename(outs[0].url)); const name = `${job.id}-extended.mp4`;
      const r = await joinRouterExtension(String(job.input.videoPath), gen, path.join(DATA_DIR, name), { audio: job.input.audio !== false });
      (job.input.notes ??= []).push(`via last frame: +${h3RouterExtendSeconds(job.input)} s from the exact last frame, joined (${r.seconds} s total)`);
      return [{ label: `+${h3RouterExtendSeconds(job.input)} s`, url: `/files/${name}` }]; } },

  // LTX-2.5 Pro on Comfy Router (2026-10-25, docs.comfy.org/development/comfy-router/models/ltx/ltx-2-5-pro/code): another place for the LTX-2.5 Pro model
  // (engine router-ltx-25-pro, same model as direct-ltx-25-pro). The LTX v2 text-to-video body (hostedRequests ltxVideoRequest, one builder with the LTX API
  // route) without model (the path names it) and camera_motion (not in the Router schema). Text to video only: the schema has no image input.
  // ltx-2-5-pro resolutions: 1280x720 / 720x1280 / 1920x1080 / 1080x1920 only (x-comfy-model-resolutions), so 720p / 1080p at 16:9 or 9:16; 6 / 8 / 10 s, 24 fps.
  'router-ltx-25-pro': { tools: ['h3-video'], id: 'ltx/ltx-2-5-pro', doc: DOC('ltx/ltx-2-5-pro'), out: 'video', queue: true, maxRefs: 0,
    block: (i) => noVideoRefs('LTX-2.5 Pro')(i) ?? ltxRouterIssue(i),
    body: async (i) => { const bad = ltxRouterIssue(i); if (bad) throw new Error(bad); const d = Math.round(Number(i.duration) || 6);
      const { model: _m, camera_motion: _c, ...body } = ltxVideoRequest({ model: 'ltx-2-5-pro', prompt: promptOf(i), resolution: i.resolution === '1080p' ? '1080p' : '720p', aspect: i.aspect === '9:16' ? '9:16' : '16:9',
        duration: LTX_ROUTER_SECONDS.includes(d) ? d : LTX_ROUTER_SECONDS.reduce((a, b) => (Math.abs(b - d) < Math.abs(a - d) ? b : a)), audio: i.audio !== false }).body ?? {};
      return body; },
    outputs: (j) => (/fail/i.test(String(j?.status ?? '')) || j?.error?.message ? { refused: String(j?.error?.message ?? j?.status) } : j?.result?.video_url ? [{ url: j.result.video_url }] : []) },
  // FLUX 3 Video on Comfy Router (2026-10-25, docs.comfy.org/development/comfy-router/models/black-forest-labs/flux-3-video/code): another place for FLUX 3
  // Video (engine router-flux3-video, same model as direct-flux3-video). The BFL body (hostedRequests bflVideoRequest, one builder with the BFL route): mode
  // t2v / i2v, keyframes = the first frame, or first + last (base64), duration 5–20, aspect_ratio, generate_audio, safety_tolerance 2. 720p / 1080p / 1440p / 4K
  // (hd / fhd / qhd / uhd; 1440p / 4K added 2026-10-28); no draft. Refusal: status Request / Content Moderated or Error (bflOutputs).
  'router-flux3-video': { tools: ['h3-video'], id: 'bfl/flux-3-video', doc: DOC('black-forest-labs/flux-3-video'), out: 'video', queue: true, maxRefs: 0,
    block: (i) => noVideoRefs('FLUX 3 Video')(i) ?? flux3RouterIssue(i),
    body: async (i) => { const bad = flux3RouterIssue(i); if (bad) throw new Error(bad); const { m, text, frame } = videoJob(i);
      const kf = [(m === 'i2v' || m === 'flf') ? frame : null, m === 'flf' && frame ? i.lastFramePath : null].filter((x): x is string => typeof x === 'string' && !!x);
      return bflVideoRequest({ prompt: text, resolution: String(i.resolution ?? '720p') /* 720p / 1080p / 1440p / 4K → hd / fhd / qhd / uhd (BFL_VIDEO_RES) */, duration: i.duration, aspect: i.aspect, audio: i.audio !== false, keyframes: await Promise.all(kf.map(b64)) }).body ?? {}; },
    outputs: bflOutputs },

  // ---------------- Audio ----------------
  // ElevenLabs answers raw audio bytes, which the queue cannot store: synchronous route (limitations page). inputs[].voice_id = the picked voice
  // (elevenVoiceId: our library voice → an ElevenLabs premade voice, or an ElevenLabs voice id as is); settings.stability = Expression (voiceControls:
  // 0–10 → 1.0–0.0, 5 → 0.5; ElevenLabs' range 0–1). language_code is not sent: voiceover has no language picker (the voice tool's `language`
  // field is Translate's target and defaults to en, so sending it would force English normalisation on every script).
  'api-eleven-tts': elevenTts('ElevenLabs v4', 'eleven_v4', 'eleven-v4'),
  // ElevenLabs v3 / v4 Turbo (2026-10-25): the same body and voices as v4 (elevenTts). v3 = the expressive model that reads inline audio tags in the script
  // ([whispers], [laughs] …; sent as typed), up to 5,000 characters, stability snapped to its three presets. v4 Turbo = the fast, half-price v4.
  'api-eleven-v3': elevenTts('ElevenLabs v3', 'eleven_v3', 'eleven-v3', { maxChars: ELEVEN_V3_TEXT_MAX, stability: elevenV3Stability }),
  'api-eleven-v4-turbo': elevenTts('ElevenLabs v4 Turbo', 'eleven_v4_turbo', 'eleven-v4-turbo'),
  'api-eleven-sfx': { id: 'elevenlabs/eleven_sfx_v2', doc: DOC('elevenlabs/eleven-sfx-v2'), out: 'audio', queue: false, maxRefs: 0,
    body: async (i) => ({ text: promptOf(i), duration_seconds: Math.min(30, Math.max(0.5, Number(i.duration) || 5)), loop: false, prompt_influence: 0.3 }), outputs: () => [] },
  // Seed Audio (2026-10-25): byteplus/seed-audio-1.0 is not a second entry. Its Router schema, price (0.7543 / s) and page are the same as the Multilingual
  // model's (router-schemas byteplus__seed-audio-1.0 / -multilingual: one shared input schema, "Supported models: seed-audio-1.0 and seed-audio-1.0-multilingual"),
  // the body takes no language field, and the Multilingual model covers the same speech, so a second menu row would be a near-duplicate.
  // 2026-10-27: also Music and Sound effects (Audio, Music for a video, Music Bed, Sound for a video's prompt variant). The same body: the prompt describes
  // the music or the sound (the docs: "speech, music, sound effects ... from a single text prompt"); 44.1 kHz there (the docs: "44.1kHz or 48kHz for
  // music"), 24 kHz for speech. No lyrics and no length field: the model decides the length, up to 2 min, so the quote is the 120 s cap (hostedPrices.ts).
  'api-seed-audio': { id: 'byteplus/seed-audio-1.0-multilingual', doc: DOC('byteplus/seed-audio-1-0-multilingual'), out: 'audio', queue: true, maxRefs: 0,
    block: (i) => seedAudioTextIssue(promptOf(i), i),
    body: async (i) => { const text = promptOf(i); const bad = text.trim() ? seedAudioTextIssue(text, i) : 'Seed Audio needs a prompt (1 to 3,000 characters)'; if (bad) throw new Error(bad); return { text_prompt: text, audio_config: { format: 'mp3', sample_rate: seedAudioRate(i) } }; },
    outputs: (j) => (j?.code && j.code !== 0 && !j?.audio && !j?.url ? { refused: String(j.message ?? j.code) } : j?.audio ? [{ b64: j.audio, mime: 'audio/mpeg' }] : j?.url ? [{ url: j.url }] : []) },
  // HeyGen Voice (2026-10-31): heygen/starfish (HEYGEN_VOICES above). Our voices only (no cloning); speed = the Speed control (native, 0.5–2).
  'api-heygen-tts': { name: 'HeyGen Voice', id: 'heygen/starfish', doc: DOC('heygen/starfish'), out: 'audio', queue: true, maxRefs: 0,
    block: (i) => (i.voice === 'clone' || pathsOf(i.voiceSamplePaths).length ? 'HeyGen Voice on Comfy Router reads with its own voices; voice cloning runs on another model' : null) ?? heygenLong(promptOf(i)),
    body: async (i) => { const text = promptOf(i); const bad = text.trim() ? heygenLong(text) : 'HeyGen Voice needs a script (1 to 5,000 characters)'; if (bad) throw new Error(bad);
      return { text, voice_id: heygenVoiceId(i.voice), speed: heygenSpeed(i), input_type: 'text' }; },
    outputs: (j) => (typeof j?.data?.audio_url === 'string' && j.data.audio_url ? [{ url: j.data.audio_url }] : j?.error ? { refused: String(j.error?.message ?? j.error) } : []) },
  // ---------------- Image to layers (2026-10-24, shared/imageLayers.ts) ----------------
  // Seedream 5.0 layer separation: the Seedream schema with layer_decomposition true, ONE photo, size 1K / 2K (layer mode: 1K, 1.5K, 2K, auto), no
  // sequential_image_generation / stream (refused in layer mode). One call returns data[] = the base plate (z_index 0) then each layer by z_index, every
  // layer a PNG (output_format sets the base only); all of them are the result (allOutputs). Layers come back cropped near the asked size with their box on the
  // base (bounding_box.absolute); the runner places each on a base-sized transparent canvas (routerRun.ts layerToCanvas). The prompt is only the user's words.
  'api-seedream-layers-flash': img({ name: 'Seedream 5.0 Flash layers', id: LAYER_ROUTER_IDS['api-seedream-layers-flash'], doc: DOC(LAYER_ROUTER_IDS['api-seedream-layers-flash']), maxRefs: 1, tools: ['app-image-layers'], allOutputs: true,
    block: (i) => (imageRefs(i).length > 1 ? 'Layers on Comfy Router take one photo' : null) /* no photo yet is the app's own 'required: image' (Generate says Add a photo), not a route block, so the menu can still pick it */, body: layersBody, outputs: layersOutputs }),
  'api-seedream-layers-pro': img({ name: 'Seedream 5.0 Pro layers', id: LAYER_ROUTER_IDS['api-seedream-layers-pro'], doc: DOC(LAYER_ROUTER_IDS['api-seedream-layers-pro']), maxRefs: 1, tools: ['app-image-layers'], allOutputs: true,
    block: (i) => (imageRefs(i).length > 1 ? 'Layers on Comfy Router take one photo' : null) /* no photo yet is the app's own 'required: image' (Generate says Add a photo), not a route block, so the menu can still pick it */, body: layersBody, outputs: layersOutputs }),
};
/** Ours on Comfy Router: the route ids the Router runner serves (routing/runnable.ts gate). */
// ---------------- One key runs everything (2026-10-27): the photo / clip tools that ran on fal only, as Comfy Router places ----------------
// Bria's own models on Router (docs.comfy.org/development/comfy-router/models/bria/*): the same Bria models as the fal cards (RMBG, Expand, Eraser), plus
// Bria Product Virtual Try-On (a new card; FASHN is fal only), Bria Video Background Removal and Luma Ray 3.2 Reframe (the Luma Reframe card's
// newer model: fal retires its Ray 2 reframe endpoints on 2026-11-05). sync is never sent (Router refuses it). Images go as plain base64; a clip
// only as a link (bria video: "Publicly accessible URL"), through the shared clip link (Comfy storage upload with the key). Outputs: Bria's status body.
const photoOf = (i: In) => String(i.imagePath ?? i.refPaths?.[0] ?? '');
const briaText = (i: In) => String(i.appPrompt ?? '').replace(/[^\p{L}\p{N}\s,.'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
const briaVideoOutputs = (j: any) => (j?.status === 'ERROR' || j?.error ? { refused: String(j?.error?.message ?? j?.error?.details ?? 'Bria refused the request') } : urls([j?.result?.video_url]));
export const BRIA_VIDEO_BG: Record<string, string> = { transparent: 'Transparent', white: 'White', black: 'Black', green: 'Green' };
/** Ray 3.2 reframe: the tool's quality → the Router resolution it bills (High = 720p, Fast = 540p; the fal Ray 3.2 route sends the same). */
export const RAY32_REFRAME_RES = (i: In) => ((i.fields?.quality ?? (i.resolution === 'fast' || i.resolution === 'high' ? i.resolution : null)) === 'fast' ? '540p' : '720p');
export const RAY32_REFRAME_MAX_SEC = 10;
/** "The ray-3.2 video models support the subset 9:16, 3:4, 1:1, 4:3, 16:9, 21:9" (aspect_ratio field). */
export const RAY32_ASPECTS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'];
export const BRIA_VIDEO_MAX_SEC = 60;
Object.assign(ROUTER_MODELS, {
  'fal-bria-rmbg': img({ name: 'Bria RMBG 2.0', id: 'bria/image-edit-remove-background', doc: DOC('bria/image-edit-remove-background'), maxRefs: 1, tools: ['app-remove-bg'],
    body: async (i) => ({ image: await b64(photoOf(i)) }), outputs: fiboOutputs }),
  'fal-bria-expand': img({ name: 'Bria Expand', id: 'bria/image-edit-expand', doc: DOC('bria/image-edit-expand'), maxRefs: 1, tools: ['app-expand'],
    body: async (i, k) => { const x = i.expand ?? {}; const t = briaText(i);
      return omit({ image: await b64(photoOf(i)), canvas_size: x.canvas, original_image_size: x.original, original_image_location: x.location, prompt: t || undefined, seed: seedOf(i, k) }); }, outputs: fiboOutputs }),
  'fal-bria-eraser': img({ name: 'Bria Eraser', id: 'bria/image-edit-erase', doc: DOC('bria/image-edit-erase'), maxRefs: 1, mask: true, tools: ['app-erase'],
    block: (i) => (!i.maskPath ? 'Paint over what to erase first' : null),
    body: async (i) => ({ image: await b64(photoOf(i)), mask: await b64(String(i.maskPath)), mask_type: 'manual' }), outputs: fiboOutputs }),
  'router-bria-tryon': img({ name: 'Bria Virtual Try-On', id: 'bria/image-edit-product-virtual-tryon', doc: DOC('bria/image-edit-product-virtual-tryon'), maxRefs: 2, tools: ['app-try-on'],
    block: (i) => (!(i.refPaths?.[1]) ? 'Add the clothing photo too' : null),
    body: async (i, k) => { const t = briaText(i); return omit({ person_image: await b64(photoOf(i)), garment_images: [await b64(String(i.refPaths[1]))], instruction: t || undefined, output_type: 'png', seed: seedOf(i, k) }); },
    outputs: fiboOutputs }),
  'comfy-birefnet-video': { name: 'Bria Video Background Removal', tools: ['remove-bg'], id: 'bria/video-edit-remove-background', doc: DOC('bria/video-edit-remove-background'), out: 'video', queue: true, maxRefs: 0,
    block: (i: In) => (Number(i.duration) > BRIA_VIDEO_MAX_SEC ? `Bria on Comfy Router takes clips up to ${BRIA_VIDEO_MAX_SEC} s` : null), // the clip link (Comfy storage upload with the key) is made in the body; it throws before any Router call when it can't
    body: async (i: In) => { const bg = String(i.types?.[0] ?? 'green'); return { video: await clipLink(String(i.videoPath), 'video/mp4', 'Bria Video Background Removal'), background_color: BRIA_VIDEO_BG[bg] ?? 'Green', preserve_audio: true, output_container_and_codec: bg === 'transparent' ? 'webm_vp9' : 'mp4_h264' }; },
    outputs: briaVideoOutputs },
});
const ray32Reframe = (): RouterModelSpec => ({ name: 'Luma Ray 3.2 Reframe', tools: ['reframe'], id: 'luma_2/ray-3.2', doc: DOC('luma_2/ray-3-2'), out: 'video', queue: true, maxRefs: 0,
  block: (i: In) => (Number(i.duration) > RAY32_REFRAME_MAX_SEC ? `Luma Ray 3.2 reframes clips up to ${RAY32_REFRAME_MAX_SEC} s on Comfy Router`
    : i.types?.[0] && !RAY32_ASPECTS.includes(String(i.types[0])) ? `Luma Ray 3.2 makes ${RAY32_ASPECTS.join(', ')}` : null),
  body: async (i: In) => ({ type: 'video_reframe', prompt: String(i.prompt || 'Keep the subject in frame; extend the scene naturally.'), aspect_ratio: String(i.types?.[0] ?? '16:9'),
    source: { data: await b64(String(i.videoPath)), media_type: 'video/mp4' }, video: { resolution: RAY32_REFRAME_RES(i) } }),
  outputs: lumaOutputs } as RouterModelSpec);
Object.assign(ROUTER_MODELS, { 'direct-luma-reframe': ray32Reframe(), 'auto-reframe': ray32Reframe() });
export const ROUTER_RUNNER_ROUTES = new Set(Object.keys(ROUTER_MODELS).map((id) => `comfy-router:${id}`));
export const routerModelOfRoute = (routeId: string) => { const id = routeId.startsWith('comfy-router:') ? routeId.slice('comfy-router:'.length) : ''; return ROUTER_MODELS[id] ? { provider: id, ...ROUTER_MODELS[id] } : null; };
/** Hosted models whose Comfy partner node is NOT in the Router catalog (docs.comfy.org/development/comfy-router/models, 2026-10-22; re-checked 2026-10-31). */
export const NOT_ON_ROUTER: Record<string, string> = {
  'api-hunyuan-image': 'Not on Comfy Router yet', 'api-meta-muse': 'Not on Comfy Router yet', 'api-fish-tts': 'Not on Comfy Router yet',
  'api-sonilo-music': 'Not on Comfy Router yet', 'api-sonilo-v2m': 'Not on Comfy Router yet', // HeyGen Voice: on Router as heygen/starfish since 2026-10-31
};
/** Reference images this job's Router body sends per request (what per-reference prices count: shared/hostedPrices.ts refImages).
 *  0 when the route sends none (maxRefs 0, e.g. Krea 3 today) or the job sends none (generate / t2v / i2v / flf). */
export const refsSent = (spec: Pick<RouterModelSpec, 'out' | 'maxRefs'>, i: In): number => (!spec.maxRefs ? 0 : spec.out === 'image' ? imageRefs(i).length : spec.out === 'video' ? videoRefPaths(i, spec.maxRefs).length : 0);
/** Same, by our provider id (the Router route's priceRef); 0 for models not on Router. */
export const routerRefImages = (providerId: string | null | undefined, i: In): number => { const s = providerId ? ROUTER_MODELS[providerId] : undefined; return s ? refsSent(s, i) : 0; };
/** Outputs this job makes on a Router route (Create Image n / Shots angles; one for video and audio). */
export const routerCalls = (spec: RouterModelSpec, i: In) => (spec.calls ? Math.max(1, spec.calls(i)) : spec.out === 'image' ? (Array.isArray(i.shots) && i.shots.length ? i.shots.length : Math.min(4, Math.max(1, Number(i.n) || 1))) : 1);
