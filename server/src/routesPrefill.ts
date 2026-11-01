/**
 * B3: GET /api/jobs/:id/prefill — one normalised object a tool page applies to fill
 * itself from a past job (Recreate, Turn to video, Send to <tool>, Director palette), plus B7 owner/isOwner on job responses.
 * Field names come from the target tool's own input schema (ToolDef.inputs), so they can't drift from what its submit parses.
 * Registered from index.ts.
 */
import { withoutBrand } from './shared/brandKit.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { existsSync, constants } from 'node:fs';
import { copyFile, link, realpath, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { jobs, type Job } from './jobs.js';
import * as lib from './library.js';
import { getTool, isToolHidden, listTools } from './tools/registry.js';
import type { ToolDef, ToolInputSpec } from './tools/types.js';
import { getProvider, toolProviders } from './providers.js';
import { DATA_DIR, SAMPLES_DIR, WEB_PUBLIC_DIR } from './config.js';
import { probe } from './media.js';
import { routesFor } from './routing/routes.js';
import { parseFrameAt, frameKey, extractFrame } from './videoFrame.js';
import { continuePrompt, continueModel } from './shared/continueFrame.js';
import { callerOwner, ownerFields, ownerOf, SEED_OWNER } from './owner.js';
import { stripEcho, chipsFromModelTokens } from './shared/typedPrompt.js';
import { appTypedPrompt } from './tools/apps.js';
import { toolModels, routeModelKey, modelKeyOf } from './routing/modelRegistry.js';
import { stripExtendDirections } from './shared/extendPrompt.js';
import { validateUpload } from './uploadSecurity.js';

type Kind = 'video' | 'image' | 'audio';
const kindOf = (u?: string | null): Kind | null => !u ? null : /\.(mp4|mov|webm|m4v)$/i.test(u) ? 'video' : /\.(png|jpe?g|webp|gif)$/i.test(u) ? 'image' : /\.(m4a|mp3|wav|ogg|flac|aac|opus)$/i.test(u) ? 'audio' : null;
const fileOf = (u: string) => u.startsWith('/files/') ? path.join(DATA_DIR, u.slice(7)) : u.startsWith('/samples/') ? path.join(SAMPLES_DIR, u.slice(9)) : u.startsWith('/showcase/') || /^\/examples\/(showcase-(3d|seedance)|starter)\//.test(u) ? path.join(WEB_PUBLIC_DIR, u) /* Featured generations' inputs (shared/featured.ts) */ : null;
const assetOk = (u: unknown): u is string => typeof u === 'string' && /^\/(files|samples|showcase|examples\/(?:showcase-(?:3d|seedance)|starter))\/[\w\-./]+$/.test(u) && !u.includes('..') && existsSync(fileOf(u)!);
/** Resolve only a recorded app-media URL, inside its own real root (never a symlink to another root). */
export async function recordedFile(u: unknown): Promise<string | null> {
  if (typeof u !== 'string' || !kindOf(u) || u.includes('..')) return null;
  const m = /^\/(files|samples|showcase|examples\/(?:showcase-(?:3d|seedance)|starter))\/([\w./-]+)$/.exec(u);
  if (!m || m[2].split('/').some(s => !s || s === '.')) return null;
  const root = m[1] === 'files' ? DATA_DIR : m[1] === 'samples' ? SAMPLES_DIR : path.join(WEB_PUBLIC_DIR, m[1]);
  try { const base = await realpath(root), file = await realpath(path.join(root, m[2])); return file.startsWith(base + path.sep) && (await stat(file)).isFile() ? file : null; } catch { return null; }
}
const bad = (field: string, message: string, code = 'invalid') => ({ error: message, errorType: 'validation', code, issues: [{ code, field, message }] });
/** Which media a file input takes (same rules as the submit upload check in index.ts uploadTypeOk). */
const inputMedia = (i: ToolInputSpec): Kind | null => {
  if (i.kind !== 'file' && i.kind !== 'files') return null;
  if (i.accept) return /video/.test(i.accept) ? 'video' : /audio/.test(i.accept) ? 'audio' : /image/.test(i.accept) ? 'image' : null;
  if (i.name === 'video' || /^refVideos?$|^videoRefs$/.test(i.name)) return 'video';
  if (/audio/i.test(i.name)) return 'audio';
  if (/^(refs|image|images|ref|style|mask|frame|start|end|lastFrame|refImages|colourRef|character|location|products|presenterImage)/i.test(i.name)) return 'image';
  return null;
};
const lockedOf = (t: ToolDef): Record<string, string> => (t.app as any)?.gallery?.locked ?? {};
const firstType = (v: unknown) => { try { return JSON.parse(String(v ?? '[]'))[0]; } catch { return undefined; } };
const str = (v: unknown): string | null => v == null || v === '' ? null : typeof v === 'boolean' ? (v ? '1' : '0') : typeof v === 'object' ? JSON.stringify(v) : String(v);

/**
 * The input field a result goes into on `t`, exactly as POST /api/tools/:id/jobs fromJob does it (index.ts): video → `video`;
 * image → `refs` with as=ref, else `image`, else `refs`; audio → the tool's first audio file input (re-uploaded: fromJob carries video/image only).
 */
export function slotFor(t: ToolDef, kind: Kind, asRef = false): string | null {
  const has = (n: string) => t.inputs.some((i) => i.name === n);
  if (kind === 'video') return has('video') ? 'video' : null;
  if (kind === 'image') return asRef && has('refs') ? 'refs' : has('image') ? 'image' : has('refs') ? 'refs' : null;
  return t.inputs.find((i) => inputMedia(i) === 'audio')?.name ?? null;
}

/** The model card a job ran when its engine serves several cards on the tool (null = the engine means one card): the job's recorded modelKey,
 *  else the card whose places include the job's route, else by its input (camera move). */
export function recreateModelKey(t: ToolDef, j: Pick<Job, 'provider' | 'route' | 'input'> & { modelKey?: string | null }): string | null {
  const engine = j.provider; if (!engine) return null; const ms = toolModels(t).filter((m) => m.parts.some((p) => p.engine === engine));
  if (!ms.length) return null; if (ms.length === 1) return ms[0].key; /* one card: still name it, so the page switches to it (LTX-2.5 Pro Recreate stayed on the last-used model) */ if (j.modelKey && ms.some((m) => m.key === j.modelKey)) return j.modelKey;
  return j.route ? routeModelKey(t.id, engine, j.route, j.input ?? null) : modelKeyOf(t.id, engine, j.input ?? null);
}
/** Model to prefill: the job's (or requested) provider if this tool still offers it here, else the tool default + reason. */
function pickModel(t: ToolDef, want?: string | null) {
  const usable = toolProviders(t).map((p) => p.id); const def = usable[0] ?? null;
  if (!want) return { model: def, providerAvailable: !!def, reason: def ? null : `${t.name} has no model ready yet.` };
  if (usable.includes(want)) return { model: want, providerAvailable: true, reason: null };
  const wn = getProvider(want)?.name ?? want; const dn = def ? getProvider(def)?.name ?? def : null;
  return { model: def, providerAvailable: false, reason: `${wn} isn't available here${dn ? `; using ${dn}` : ''}.` };
}
const toolAvailability = (t: ToolDef | undefined, id: string) => !t ? { available: false, reason: isToolHidden(id) ? 'That workflow is turned off in this app.' : 'That workflow isn’t in this app.' }
  : !toolProviders(t).length ? { available: false, reason: `${t.name} has no model available in this mode (open-weights-only hides hosted models).` } : { available: true, reason: null };

/** Gallery apps store their composed prompt in input.prompt and the words in appPrompt; recover only the words (2026-10-25: also from an appPrompt
 *  that itself held recipe text, so Use again / Recreate on an older job never doubles it; shared/typedPrompt.ts + tools/apps.ts appTypedPrompt). */
function typedPrompt(t: ToolDef, j: Job) {
  const G = (t.app as any)?.gallery; const i = j.input ?? {};
  const words = typeof i.appPrompt === 'string' ? stripEcho(String(i.prompt ?? ''), i.appPrompt) : String(i.prompt ?? '');
  /* your words with @image1 chips, never a model's <<<image_1>>> / <Picture 1> form (a box shows chips; the model's form is made at send) */
  return chipsFromModelTokens(G ? appTypedPrompt(G.id, words) : words);
}

/** Raw recorded slots, before unavailable URLs are filtered for the prefill UI. Reuse must not silently lose them. */
function inputUrls(t: ToolDef, s: ToolInputSpec, i: Record<string, any>): unknown[] {
  if (s.name === 'video') return [i.videoUrl];
  if (s.name === 'image') return [i.imageUrl];
  if (s.name === 'refs') { const elements = new Set(((i.elements ?? []) as any[]).map(e => e?.url)); return ((i.refUrls ?? []) as string[]).filter(u => !(t.inputs.some(x => x.name === 'image') && u === i.imageUrl) && !elements.has(u)); }
  if (s.name === 'voiceAudio') return [i.voiceSampleUrl, ...(i.voiceSampleUrls ?? [])];
  if (s.name === 'colourRef') return [i.colour?.source === 'image' ? i.colour.url : null];
  return [i[`${s.name}Url`], ...(i[`${s.name}Urls`] ?? [])];
}
/** Stored job input → that tool's submit form (string fields) + file fields (asset URLs to re-attach). */
export function formFromInput(t: ToolDef, j: Job, opts: { sameSeed: boolean }) {
  const i = j.input ?? {}; const locked = lockedOf(t); const form: Record<string, string> = {}; const files: Record<string, string[]> = {}; const skipped: string[] = []; const missing: string[] = [];
  for (const s of t.inputs) {
    if (s.name in locked) continue;
    const media = inputMedia(s);
    if (media) {
      const urls = inputUrls(t, s, i);
      urls.forEach((u) => { if (typeof u === 'string' && u && !assetOk(u) && !missing.includes(u)) missing.push(u); }); // Recreate says which inputs are gone (never a silent drop)
      const ok = [...new Set(urls.filter(assetOk))]; if (ok.length) files[s.name] = s.kind === 'file' ? ok.slice(0, 1) : ok.slice(0, s.max ?? ok.length);
      continue;
    }
    let v: unknown;
    switch (s.name) {
      case 'prompt': v = typedPrompt(t, j); break; // apps that compose their prompt keep the typed text in appPrompt
      case 'seed': v = opts.sameSeed ? i.seed : null; break;
      case 'shots': v = i.appFields?.shots ?? (Array.isArray(i.shots) ? JSON.stringify(i.shots.map((x: any) => x.id)) : null); break; // Shots: the picked angle ids (JSON), not the per-angle prompt objects
      case 'enhance': v = i.enhance ?? (i.enhancedPrompt != null ? true : null); break;
      case 'style': v = i.style ?? null; break;
      case 'n': case 'count': v = i[s.name] ?? i.n ?? i.count; break;
      case 'duration': v = i.duration ?? i.durationSec; break;
      case 'aspect': v = i.aspect ?? i.aspectRatio; break;
      case 'preset': v = i.preset ?? (s.options?.includes('none') ? 'none' : null); break;
      case 'colourHex': v = i.colour?.source === 'hex' && Array.isArray(i.colour.hex) ? i.colour.hex.join(',') : null; break; // OpenSoul colour match
      case 'colourStrength': v = i.colour ? i.colour.strength : null; break;
      case 'colourMethod': v = i.colour ? i.colour.method : null; break;
      case 'mode': v = i.cinemaMode ?? (i.mode !== undefined ? i.mode : i.fields?.mode); break; // Director stores its mode as cinemaMode (input.mode is the internal 'direct')
      default: v = i[s.name] !== undefined ? i[s.name] : i.look && i.look[s.name] != null ? i.look[s.name] : i.fields?.[s.name] ?? i.voiceFields?.[s.name]; // Director look chips live in input.look; voice controls (speed, Qwen3 TTS speaker / speechLanguage / Style…) in input.voiceFields
    }
    const sv = str(v); if (sv == null) continue;
    if (s.kind === 'select' && s.options?.length && !s.options.map(String).includes(sv)) { skipped.push(`${s.name}=${sv}`); continue; }
    if (s.name === 'prompt' || sv !== '') form[s.name] = sv;
  }
  if (!('prompt' in form) && t.inputs.some((s) => s.name === 'prompt') && !('prompt' in locked)) form.prompt = '';
  if (i.brand?.id) { form.brandKit = String(i.brand.id); if (i.brand.applied && typeof form.prompt === 'string') form.prompt = withoutBrand(form.prompt, String(i.brand.phrase ?? '')); } // Brand Kit: Recreate turns Brand back on (the chip adds the words again), so the box shows only the typed words
  if ((i.fit === 'crop' || i.fit === 'pad') && i.videoUrl && !('fit' in form)) form.fit = i.fit; // Fit to model (shared/videoFit.ts): the clip's Keep everything / Crop choice comes back too
  if (i.cinemaMode && i.duration != null && !('duration' in form) && t.inputs.some((s) => s.name === 'duration') && !('duration' in locked)) form.duration = String(i.duration); // Director image mode stores duration 1 (not a select option; the tool keeps 1 for stills)
  if (i.imageResolution && t.id === 'create-image' || (i.imageResolution && (t.app as any)?.gallery?.base === 'create-image')) form.imageResolution = String(i.imageResolution); // read by Create Image's caps check
  return { form, files, skipped, missing };
}

/**
 * Submit-side input reuse (POST /api/tools/:toolId/jobs with fromJob=<id> + reuseInputs=<field,field|all>): re-attaches the source
 * job's own INPUT files to those file fields, so a Recreate never re-uploads. Safety: only URLs recorded on that job's input (the
 * same mapping Recreate prefill uses), inside its own /files, /samples or known bundled-media root; each file is copied
 * to a new name for the new job (`<newId>-<field>r<n>.<ext>`), so trashing the source never breaks the new job. A field the request
 * also uploads keeps the upload. → {fields: reused field names} | {status, body} (400 with issues).
 */
export async function reuseInputFiles(t: ToolDef, src: Job, spec: string, newId: string, files: Record<string, string[]>): Promise<{ fields: string[] } | { status: number; body: any }> {
  const fileInputs = t.inputs.filter(i => inputMedia(i) && !(i.name in lockedOf(t)));
  const have = Object.fromEntries(fileInputs.map(s => [s.name, [...new Set(inputUrls(t, s, src.input ?? {}).filter(u => u != null && u !== ''))].slice(0, s.kind === 'file' ? 1 : s.max ?? Infinity)]));
  const want = [...new Set(spec.trim().toLowerCase() === 'all' ? Object.keys(have).filter(f => have[f].length) : spec.split(',').map(x => x.trim()).filter(Boolean))];
  const fail = (field: string, message: string, code = 'input_unavailable') => ({ status: 400, body: { ...bad(field, message, code), refund: { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' } } });
  const staged: Record<string, string[]> = {}, made: string[] = []; let field = 'reuseInputs', committed = false;
  try {
    if (!/^[\w-]+$/.test(newId)) return fail(field, 'Invalid new job id.', 'invalid');
    for (const f of want) {
      field = f; const s = fileInputs.find(i => i.name === f);
      if (!s || !/^[A-Za-z]\w{0,40}$/.test(f)) return fail('reuseInputs', `${f} is not a file input of ${t.name}.`, 'invalid');
      if (files[f]?.length) continue; // an explicit upload wins, even when the old source is gone
      if (!have[f]?.length) return fail(f, `The source job ${src.id} has no ${f} file to reuse (upload one instead).`, 'nothing_to_reuse');
      staged[f] = [];
      for (const [k, u] of have[f].entries()) {
        const real = await recordedFile(u); if (!real) throw new Error('unavailable');
        const name = `${newId}-${f}r${k}${path.extname(String(u)).toLowerCase()}`, dest = path.join(DATA_DIR, name);
        const pending = path.join(DATA_DIR, `${newId}-${f}r${k}-pending`); // extensionless quarantine, like multipart validation
        await copyFile(real, pending, constants.COPYFILE_EXCL); made.push(pending);
        await validateUpload(pending, String(u), '', f, inputMedia(s)!);
        await link(pending, dest).catch(() => copyFile(pending, dest, constants.COPYFILE_EXCL)); made.push(dest); await unlink(pending); staged[f].push(name);
      }
    }
    Object.assign(files, staged); committed = true; return { fields: Object.keys(staged) };
  } catch { return fail(field, `The ${field} input of job ${src.id} is missing, unsafe or unsupported. Upload it again before generating.`); }
  finally { if (!committed) await Promise.all(made.map(f => unlink(f).catch(() => undefined))); }
}

/** `fields`: exactly the target tool's submit names — the string form fields plus file inputs as asset URLs (string for a `file` input, array for `files`). */
const schemaFields = (t: ToolDef, form: Record<string, string>, files: Record<string, string[]>) => ({ ...form, ...Object.fromEntries(Object.entries(files).map(([k, v]) => [k, t.inputs.find((x) => x.name === k)?.kind === 'file' ? v[0] : v])) });
/** Required inputs the hand-off doesn't fill: list/select defaults (the mode that takes this media), plus what the user must still add. */
function fillDefaults(t: ToolDef, form: Record<string, string>, files: Record<string, string[]>, kind: Kind | null) {
  const locked = lockedOf(t); const needs: string[] = []; const app = (t.app ?? {}) as any;
  for (const s of t.inputs) {
    if (s.name in locked || s.name in form || s.name in files) continue;
    if (s.name === 'types' && s.kind === 'list') {
      const modes: string[] = s.options ?? (t.presets ?? []).map((p) => p.id);
      const pick = kind === 'image' && app.imageModes?.length ? app.imageModes.find((m: string) => modes.includes(m)) : kind === 'video' && modes.includes('edit') && t.id !== 'create-image' ? 'edit' : kind === 'audio' ? ['r2v', 'voice'].find((m) => modes.includes(m)) : undefined; // the mode that uses this media
      if (s.required || pick) form.types = JSON.stringify([pick ?? s.default ?? modes[0]].filter(Boolean)); continue;
    }
    if (!s.required) continue;
    if (s.kind === 'select') { const o = s.default ?? s.options?.[0] ?? t.presets?.[0]?.id; if (o != null) form[s.name] = String(o); else needs.push(s.name); }
    else if (s.kind === 'list') { const o = s.default ?? s.options?.[0] ?? t.presets?.[0]?.id; if (o != null) form[s.name] = JSON.stringify([o]); else needs.push(s.name); }
    else needs.push(s.name);
  }
  for (const r of (app.gallery?.required ?? []) as (string | string[])[]) { // gallery apps: required uploads (any-of groups), e.g. Change Voice needs the video even when the audio fills voiceAudio
    const any = Array.isArray(r) ? r : [r]; if (any.some((n) => n in files || n in form || n in locked || needs.includes(n))) continue; needs.push(any[0]); }
  const mode = firstType(form.types ?? locked.types);
  const baseId = app.gallery?.base ?? t.id;
  const promptOptional = (app.promptOptionalModes ?? []).includes(mode) || (baseId === 'cinema' && form.mode === 'extend');
  if (t.inputs.some((s) => s.name === 'prompt') && !(form.prompt ?? '').trim() && !promptOptional && !locked.prompt && (app.modes || baseId === 'cinema' || t.inputs.find((s) => s.name === 'prompt')?.required) && !needs.includes('prompt')) needs.push('prompt');
  if (t.inputs.some((s) => s.name === 'angles') && !form.angles) needs.push('angles'); // Re-shoot: pick the angles (or describe them in the prompt)
  if ((app.imageModes ?? []).includes(mode) && !files.image?.length && !files.refs?.length) needs.push(t.inputs.some((s) => s.name === 'image') ? 'image' : 'refs'); // e.g. Reference to video needs an image too
  if ((app.maskModes ?? []).includes(mode) && !files.mask?.length) needs.push('mask'); // inpaint: the user paints the mask
  if (['object-swap', 'motion-transfer'].includes(t.id) && !files.refs?.length && kind === 'video') needs.push('refs'); // swap tools need the character / object image
  return needs;
}

/** Nearest aspect this tool offers for an image size (never 'auto'). */
function nearestAspect(t: ToolDef, w?: number, h?: number) {
  const opts = (t.inputs.find((i) => i.name === 'aspect')?.options ?? []).filter((o) => /^\d+:\d+$/.test(o)); if (!opts.length || !w || !h) return null;
  const r = Math.log(w / h); return opts.reduce((a, b) => { const v = (o: string) => { const [x, y] = o.split(':').map(Number); return Math.abs(Math.log(x / y) - r); }; return v(b) < v(a) ? b : a; });
}

/** Upscale quote params the job derives from the clip itself (not form fields): width, height (source px) and seconds, so /price prices
 * the real output MP-seconds (job 7916b9a2 was quoted 20 and charged 54 because the quote fell back to 1 MP). */
async function sizeQuote(t: ToolDef, input: Record<string, any> | null, url?: string | null): Promise<Record<string, string>> {
  const takesVideo = (t.app as any)?.input === 'video' || t.inputs?.some((i: any) => i.name === 'video' && i.kind === 'file');
  if (!(t.app as any)?.scales) { // L9: video tools priced per input second (Remove BG, Reframe…): quote the source clip's real length, as the job does
    if (!takesVideo) return {}; let sec = Number(input?.trimSec ?? input?.duration) || 0;
    if (!(sec > 0) && url) { const f = fileOf(url); const pr = f ? await probe(f) : null; if (pr) sec = Math.min(30, pr.duration); }
    return sec > 0 ? { seconds: String(Math.round(sec * 100) / 100) } : {}; }
  let w = input?.inputSize?.width ?? input?.width, h = input?.inputSize?.height ?? input?.height, sec = input?.duration;
  if ((!w || !h || !sec) && url) { const f = fileOf(url); const pr = f ? await probe(f) : null; if (pr) { w ??= pr.width; h ??= pr.height; sec ??= Math.min(30, pr.duration); } }
  return { ...(w && h ? { width: String(w), height: String(h) } : {}), ...(Number(sec) > 0 ? { seconds: String(Math.round(Number(sec) * 100) / 100) } : {}) };
}
async function priceFor(app: FastifyInstance, t: ToolDef, form: Record<string, string>, model: string | null, extra: Record<string, string> = {}) {
  try {
    const q = new URLSearchParams(Object.entries({ ...form, ...extra, ...(model ? { provider: model } : {}) }).filter(([k]) => !['prompt', 'seed'].includes(k)));
    const r = await app.inject({ method: 'GET', url: `/api/tools/${encodeURIComponent(t.id)}/price?${q}` }); if (r.statusCode !== 200) return null;
    const b = r.json() as any; return { credits: b.credits ?? null, basis: b.basis ?? null, route: b.route ?? null, routeKind: b.routeKind ?? null, runnable: b.runnable ?? null, needsKey: b.needsKey ?? null, fallback: b.fallback ?? null, routeId: b.routeId ?? b.route ?? null, demo: !!b.demo, demoMessage: b.demoMessage ?? null, listCredits: b.listCredits ?? null, state: b.noProvider?.state ?? (b.runnable ? 'ready' : null), options: b.noProvider?.options ?? null };
  } catch { return null; }
}

const ACTIONS = ['recreate', 'turn-to-video', 'send-to', 'director', 'upscale', 'relight', 'translate', 'change-voice', 'reshoot', 'camera', 'photo-fx', 'edit-image', 'finish'] as const;
/** Menu shortcuts → send-to <tool> (upscale picks video or image upscale by media). */
const SHORTCUT: Record<string, (k: Kind) => string> = { upscale: (k) => (k === 'image' ? 'image-upscale' : 'upscale'), relight: () => 'app-relight', translate: () => 'app-translate-video', 'change-voice': () => 'app-change-voice', reshoot: () => 'reshoot', camera: () => 'camera', 'photo-fx': () => 'photo-fx', 'edit-image': () => 'create-image', finish: () => 'finish' /* Finish (2026-10-27): a video result into the one-click looks */ };
/** Turn to video (action turn-to-video): Generate Video; its model is that tool's default provider (cloud-first routing picks the route at submit; licence settings never change it). */
const VIDEO_TOOL = 'h3-video';

type Q = { action?: string; tool?: string; to?: string; out?: string; i?: string; t?: string; sameSeed?: string; focus?: string; as?: string; cont?: string };
export async function buildPrefill(app: FastifyInstance, j: Job, q: Q): Promise<{ status: number; body: any }> {
  const action = String(q.action || 'recreate').toLowerCase();
  if (!(ACTIONS as readonly string[]).includes(action)) return { status: 400, body: bad('action', `action must be one of ${ACTIONS.join(', ')}.`, 'invalid_action') };
  const outRaw = q.out ?? q.i; const hasOut = outRaw != null && outRaw !== '';
  const outIdx = hasOut ? Number(outRaw) : 0;
  if (hasOut && (!Number.isInteger(outIdx) || outIdx < 0)) return { status: 400, body: bad('out', 'out must be an output index (0, 1, …).', 'out_of_range') };
  const terminalNoOutput = ['failed', 'blocked', 'canceled'].includes(j.status);
  const outputs = j.status === 'done' ? (j.outputs ?? []) : [];
  if (!outputs.length && !(action === 'recreate' && terminalNoOutput)) return { status: 409, body: { error: j.status === 'done' ? 'This job has no outputs.' : `This job is ${j.status}; it has no outputs yet.`, errorType: 'conflict', code: 'not_done', status: j.status } };
  if (outputs.length && outIdx >= outputs.length) return { status: 400, body: bad('out', `out must be 0–${outputs.length - 1} (this job has ${outputs.length} output${outputs.length === 1 ? '' : 's'}).`, 'out_of_range') };
  const o = outputs[outIdx] ?? null; let kind = kindOf(o?.url); let assetUrl = o?.url ?? null; let frame: { t: number; url: string } | null = null; let frameAt = '';
  // t=<sec> | last | first: a still of a video output (the shared exact frame grab, videoFrame.ts; cached next to the outputs and listed in the
  // picker's Uploads) → behaves as an image output. t=last is the true final frame ("Continue from last frame").
  if (q.t != null && q.t !== '' && action !== 'recreate') {
    if (kind !== 'video') return { status: 400, body: bad('t', 't only applies to a video output.', 'invalid') };
    const at = parseFrameAt(q.t); const src = fileOf(o!.url); const dur = src && at && !('error' in at) && at.kind === 'time' ? (await probe(src))?.duration : null;
    if ('error' in at || (dur && at.kind === 'time' && at.t > dur)) return { status: 400, body: bad('t', `t must be first, last or 0–${dur ? Math.floor(dur * 100) / 100 : '?'} s.`, 'out_of_range') };
    if (!src) return { status: 400, body: bad('t', 'That video isn’t on this computer.', 'frame_failed') };
    const name = `${j.id}-out${outIdx}-f${frameKey(at)}.png`; const dst = path.join(DATA_DIR, name);
    if (!existsSync(dst)) { const r = await extractFrame(src, dst, at); if (!r.ok) return { status: 400, body: bad('t', 'Could not read a frame at that time.', 'frame_failed') }; }
    const pid = lib.metaOf(j.id).projectId; const { recordUpload } = await import('./mediaLibrary.js');
    const rowId = `frm-${name.replace(/\.png$/, '')}`; const tSec = at.kind === 'time' ? at.t : at.kind === 'first' ? 0 : null;
    recordUpload({ id: rowId, url: `/files/${name}`, name: `${at.kind === 'last' ? 'Last frame' : at.kind === 'first' ? 'First frame' : `Frame at ${tSec} s`} · ${String(j.input?.prompt ?? '').trim().slice(0, 60) || (getTool(j.toolId)?.name ?? j.toolId)}`.slice(0, 120),
      type: 'image', createdAt: Date.now(), projectIds: pid ? [pid] : [], frameOf: { url: o!.url, jobId: j.id, out: outIdx, at: at.kind, t: tSec } });
    frame = { t: at.kind === 'time' ? at.t : at.kind === 'first' ? 0 : -1, url: `/files/${name}` }; frameAt = at.kind === 'time' ? String(at.t) : at.kind; kind = 'image'; assetUrl = frame.url;
  }
  const output = o ? { index: outIdx, url: o.url, label: o.label, kind: kindOf(o.url), ...(frame ? { t: frame.t < 0 ? 'last' : frame.t, frameUrl: frame.url } : {}) } : null;
  const originalSeed = j.input?.seed ?? null; const sameSeed = /^(1|true|on)$/i.test(q.sameSeed ?? '');
  const base = { jobId: j.id, action, output, ...ownerFields(ownerOf(j)) };

  if (action === 'recreate') {
    const t = getTool(j.toolId); const av = toolAvailability(t, j.toolId);
    if (!t) return { status: 200, body: { ...base, ...av, tool: j.toolId, toolName: j.toolId, path: null, url: null, fields: null, form: null, files: null, submit: null, seed: null, sameSeed, originalSeed, notes: [] } };
    const pm = pickModel(t, j.provider); const { form, files, skipped, missing: missingFiles } = formFromInput(t, j, { sameSeed });
    if (pm.model && !lockedOf(t).provider) form.provider = pm.model;
    // BUG-HUNT-1 #7: recreate re-pins the original route when the same model still offers it, so the quote prices the route that will run (e.g. local SeedVR2 at 0 cr, not the cloud default)
    // Soul re-pin fix: only when the original job was PINNED to that route; an Auto job recreates on Auto (re-pinning an Auto pick froze e.g. OpenSoul on a route the user never chose)
    if (j.route && (j.routing as any)?.mode === 'pinned' && pm.model && pm.model === j.provider && routesFor(pm.model, getTool(j.toolId)).some((r) => r.routeId === j.route)) form.route = j.route;
    if (!pm.providerAvailable && pm.model && j.provider && pm.model !== j.provider && !lockedOf(t).provider) form.requestedModel = j.provider; // model-fallback notice: submit (and the price below) carry what was originally used
    // One engine, several model cards (h3-extend comfy-h3-extend: H3 Extend + H3 Max Extend; upscale comfy-seedvr2; remove-bg comfy-birefnet-video…): name the card the job ran,
    // so the page opens on it (not the first card of that engine) and its quote narrows to that card's places.
    const modelKey = pm.model && pm.model === j.provider ? recreateModelKey(t, j) : null;
    if (t.id === 'h3-extend' && form.prompt) form.prompt = stripExtendDirections(form.prompt); // the person's words: the direction phrase is added again (once) at submit
    const notes = [sameSeed ? 'Same seed: an exact re-run of the original settings.' : 'New seed: same inputs, a new take (pass sameSeed=1 to reuse the original seed).'];
    if (pm.reason) notes.push(pm.reason); if (skipped.length) notes.push(`Not carried over (no longer offered by this tool): ${skipped.join(', ')}.`);
    const missing = Object.entries(j.input ?? {}).filter(([k, v]) => /Url$/.test(k) && typeof v === 'string' && v && !assetOk(v)).map(([k]) => k);
    if (missing.length) notes.push(`Some input files are no longer on disk: ${missing.join(', ')}.`);
    if (Object.keys(files).length) notes.push(`No re-upload needed: send the form fields plus submit {fromJob, reuseInputs:"${Object.keys(files).join(',')}"} and the server re-attaches the original ${Object.keys(files).join(', ')} (upload a file in a field to replace it).`);
    const fields = schemaFields(t, form, files);
    const quoteParams = await sizeQuote(t, j.input ?? null, j.input?.videoUrl ?? null);
    const pr = await priceFor(app, t, form, pm.model, { ...(quoteParams ?? {}), ...(modelKey ? { model: modelKey } : {}) });
    return { status: 200, body: { ...base, available: av.available, reason: av.reason ?? pm.reason, providerAvailable: pm.providerAvailable, tool: t.id, toolName: t.name, path: t.route, url: `${t.route}?recreate=${j.id}`, model: pm.model, modelKey,
      fields, form, files, missingFiles: missingFiles.map((u) => u.split('/').pop() ?? u), submit: Object.keys(files).length ? { fromJob: j.id, reuseInputs: Object.keys(files).join(',') } : null, quoteParams, routeId: pr?.route ?? null, originalRouteId: j.route ?? null, originalRouting: (j.routing as any)?.mode ?? null, repinned: !!form.route, seed: sameSeed ? originalSeed : null, sameSeed, originalSeed, price: pr, fallback: pr?.fallback ?? null, notes } };
  }

  let toolId: string; let asRef = q.as === 'ref'; let extraForm: Record<string, string> = {}; const notes: string[] = []; let focus: string | null = null;
  if (action === 'turn-to-video') {
    if (kind !== 'image') return { status: 400, body: bad('action', `Turn to video takes an image output; output ${outIdx} is ${kind ?? 'unknown'}${kind === 'video' ? ' (pass t=<sec> to use a frame)' : ''}.`, 'unsupported') };
    toolId = VIDEO_TOOL;
  } else if (action === 'director') { // kept for compatibility: the web no longer offers it (Director removed 2026-10-23); the link it returns redirects to Create Video
    toolId = 'cinema'; focus = String(q.focus || 'palette');
    if (kind !== 'video' && kind !== 'image') return { status: 400, body: bad('action', `Director takes a video or an image; output ${outIdx} is ${kind ?? 'unknown'}.`, 'unsupported') };
  } else if (action === 'send-to') {
    toolId = String(q.tool || q.to || ''); if (!toolId) return { status: 400, body: bad('tool', 'send-to needs tool=<toolId> (see GET /api/jobs/:id/handoff for targets).', 'required') };
  } else toolId = SHORTCUT[action](kind ?? 'video');
  const t = getTool(toolId); const realId = t?.id ?? toolId;
  if (!t && !isToolHidden(toolId) && !listTools().some((x) => x.id === toolId)) {
    if (action === 'send-to') return { status: 400, body: bad('tool', `Unknown tool ${toolId}.`, 'unknown_tool') };
  }
  const av = toolAvailability(t, realId);
  if (!t || !av.available) return { status: 200, body: { ...base, ...av, tool: realId, toolName: t?.name ?? realId, path: t?.route ?? null, url: null, slot: null, fields: null, form: null, files: null, submit: null, seed: null, sameSeed: false, originalSeed, ...(focus ? { focus } : {}), notes: [] } };
  if (action === 'director') {
    const modeIn = t.inputs.find((x) => x.name === 'mode'); const want = kind === 'video' ? 'edit' : 'image';
    if (modeIn?.options && !modeIn.options.includes(want)) return { status: 200, body: { ...base, available: false, reason: `Director here has no ${want} mode.`, tool: t.id, toolName: t.name, path: t.route, url: null, slot: null, fields: null, form: null, files: null, submit: null, seed: null, sameSeed: false, originalSeed, focus, notes: [] } };
    const fi = t.inputs.find((x) => x.name === focus); if (!fi) return { status: 400, body: bad('focus', `focus must be one of Director's settings (${t.inputs.filter((x) => x.kind === 'select').map((x) => x.name).join(', ')}).`, 'invalid') };
    extraForm = { mode: want }; if (fi.kind === 'select') extraForm[focus!] = fi.options?.includes('auto') ? 'auto' : String(fi.default ?? fi.options?.[0] ?? '');
    asRef = kind === 'image'; notes.push('Re-renders in Director with the result as the source; the focused control is preset to auto.');
  }
  const slot = slotFor(t, kind!, asRef);
  if (!slot) return { status: 400, body: bad('tool', `${t.name} can't take a${kind === 'image' ? 'n image' : ` ${kind}`} as input.`, 'unsupported') };
  const form: Record<string, string> = { ...extraForm }; const files: Record<string, string[]> = {};
  const viaFromJob = !frame && kind !== 'audio' && (slot === 'video' || slot === 'image' || slot === 'refs');
  const submit = viaFromJob ? { fromJob: j.id, output: String(outIdx), ...(slot === 'refs' ? { as: 'ref' } : {}) } : null;
  if (!viaFromJob) files[slot] = [assetUrl!];
  if (action === 'turn-to-video') {
    form.types = JSON.stringify(['i2v']); form.prompt = '';
    const src = fileOf(assetUrl!); const pr = src ? await probe(src) : null; const asp = nearestAspect(t, pr?.width, pr?.height);
    if (asp) form.aspect = asp; notes.push('The image is the start frame. Prompt left empty: describe the motion (imagePrompt has the image\'s prompt for the "Use image prompt" chip).');
  } else if ('prompt' in Object.fromEntries(t.inputs.map((x) => [x.name, 1])) && !lockedOf(t).prompt) form.prompt = form.prompt ?? '';
  const cont = !!frame && /^(1|true|on)$/i.test(q.cont ?? '') && t.id === VIDEO_TOOL;
  if (cont) { form.types = JSON.stringify(['i2v']); form.prompt = continuePrompt(j.input?.prompt, j.input?.duration); }
  const needs = fillDefaults(t, form, { ...files, [slot]: [assetUrl!] }, kind);
  const pmModes = (t.app as any)?.providerModes as Record<string, string[]> | undefined; const fm = firstType(form.types ?? lockedOf(t).types);
  const { voiceCapsOf } = await import('./tools/voice/voiceControls.js'); const takesSlot = (id: string) => slot !== 'voiceAudio' || !voiceCapsOf(id) || voiceCapsOf(id)!.maxVoiceSamples > 0; // B6: a voice sample goes to a model that takes samples (the quality pick may use its own voices)
  /* Continue from last frame (t=last&cont=1 into Generate Video): image to video, the source prompt as "Continue the shot: …", and the source's own
     model when it takes a start image, else LTX-2.5 22B (free, local) first (shared/continueFrame.ts) */
  const contModel = cont ? continueModel(j.provider, toolProviders(t).map((p) => p.id), pmModes) : null;
  // a model whose every place is "coming soon" can't run anywhere: never prefill it (Send to › Add soundtrack picked Sonilo Music → 409, 2026-10-27)
  const runs = (id: string) => { const rs = routesFor(id, t); return !rs.length || rs.some((r) => !r.comingSoon); };
  const forMode = (p: { id: string }) => !pmModes![p.id] || pmModes![p.id].includes(fm!);
  const modeModel = contModel ? contModel : pmModes && fm ? (toolProviders(t).find((p) => forMode(p) && takesSlot(p.id) && runs(p.id)) ?? toolProviders(t).find((p) => forMode(p) && runs(p.id))
    ?? toolProviders(t).find((p) => forMode(p) && takesSlot(p.id)) ?? toolProviders(t).find(forMode))?.id ?? null : null; // first model (quality order) that can do the chosen mode and runs somewhere
  const { defaultProviderFor, requestMode } = await import('./routing/defaults.js'); // B6: no per-mode list (Cinema image mode, …) → the tool's default for that mode
  const pm = pickModel(t, modeModel ?? (pmModes ? null : defaultProviderFor(t, requestMode(t, { ...lockedOf(t), ...form })) ?? null)); if (pm.model && !lockedOf(t).provider) form.provider = pm.model;
  /* Continue on the source's own model: its length, resolution and aspect too, and the place it was pinned to (Run on), so the next clip matches */
  let continueRoute: { modelKey: string | null; runOn: string | null; routeId: string } | null = null;
  if (cont && pm.model && pm.model === j.provider) {
    for (const k of ['duration', 'resolution', 'aspect'] as const) if (j.input?.[k] != null && j.input[k] !== '') form[k] = String(j.input[k]);
    if (j.route && (j.routing as any)?.mode === 'pinned' && routesFor(pm.model, t).some((r) => r.routeId === j.route)) { form.route = j.route; continueRoute = { modelKey: (j as any).modelKey ?? null, runOn: (j as any).runOn ?? null, routeId: j.route }; }
  }
  if (pm.reason) notes.push(pm.reason); if (needs.length) notes.push(`Still to fill before submitting: ${needs.join(', ')}.`);
  const asParam = slot === 'refs' ? 'ref' : slot;
  const url = `${t.route}?fromJob=${j.id}&as=${asParam}&out=${outIdx}${frame ? `&t=${frameAt}` : ''}${cont ? '&cont=1' : ''}${action === 'director' ? `&mode=${extraForm.mode}&focus=${focus}` : ''}`;
  const qp = kind === 'video' ? await sizeQuote(t, null, assetUrl) : {}; // Upscale hand-off: the result clip's own size + length
  const fields = schemaFields(t, form, { ...files, [slot]: [assetUrl!] }); // the result shows in its slot; submit sends it via fromJob (or files when re-uploaded)
  return { status: 200, body: { ...base, available: true, reason: pm.reason, providerAvailable: pm.providerAvailable, tool: t.id, toolName: t.name, path: t.route, url, slot, as: asParam, model: pm.model, ...(kind === 'image' && slot !== 'refs' ? { startFrame: assetUrl } : {}), fields, form, files, submit, needs,
    seed: null, sameSeed: false, originalSeed, ...(action === 'turn-to-video' ? { imagePrompt: j.input?.prompt || null } : {}), ...(focus ? { focus } : {}), ...(continueRoute ? { continueRoute } : {}), quoteParams: qp, price: await priceFor(app, t, form, pm.model, qp), notes } };
}

/** B7: add owner + isOwner to job-shaped objects ({id, toolId, …}) in read responses. */
function withOwner(x: any, req: FastifyRequest): any {
  if (!x || typeof x !== 'object' || typeof x.id !== 'string' || (typeof x.toolId !== 'string' && x.kind !== 'sample') || 'owner' in x) return x; // sample clips have toolId null
  const jid = x.id.startsWith('job:') ? x.id.slice(4) : x.id; const j = jobs.get(jid);
  const owner = j ? ownerOf(j) : x.id.startsWith('ex:') || x.kind === 'example' ? SEED_OWNER : null;
  return owner ? { ...x, ...ownerFields(owner, req) } : x;
}
const OWNER_ROUTES = new Set(['/api/jobs', '/api/jobs/:id', '/api/share/:token', '/api/community', '/api/community/shots', '/api/tools/:toolId/jobs']);

export function registerPrefill(app: FastifyInstance) {
  app.get<{ Params: { id: string }; Querystring: Q }>('/api/jobs/:id/prefill', async (req, reply) => {
    const j = jobs.get(req.params.id); if (!j || lib.metaOf(j.id).deletedAt) return reply.code(404).send({ error: 'not found', errorType: 'not_found' });
    const r = await buildPrefill(app, j, req.query ?? {}); return reply.code(r.status).send(r.body);
  });
  // B7 owner: recorded on any job a write request creates (job submit, retry, …), exposed with isOwner on the read routes above.
  app.addHook('onRequest', async (req) => { (req as any).__t0 = Date.now(); });
  app.addHook('onResponse', async (req) => {
    if (req.method === 'GET' || req.method === 'HEAD') return; const t0 = (req as any).__t0 ?? Date.now();
    for (const j of jobs.values()) if (j.createdAt >= t0 - 5 && !(j as any).owner) (j as any).owner = callerOwner(req);
  });
  app.addHook('preSerialization', async (req, _reply, payload: any) => {
    const url = (req as any).routeOptions?.url ?? (req as any).routerPath; if (req.method !== 'GET' || !OWNER_ROUTES.has(url)) return payload;
    if (Array.isArray(payload)) return payload.map((x) => withOwner(x, req));
    if (payload && Array.isArray(payload.items)) return { ...payload, items: payload.items.map((x: any) => withOwner(x, req)) };
    return withOwner(payload, req);
  });
}
