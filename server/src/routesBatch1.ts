import { VUP_TOOLS, vupSizing } from './shared/videoUpscale.js';
import { swapRangeSeconds } from './shared/cloudSwap.js';
import { upscaleTargetLong, imageCapsQuoteError, photoAspectOf } from './tools/apps.js';
import { UPSCALE_FACTORS, UPSCALE_FACTORS_BY_PROVIDER, UPSCALE_MAX_SIDE, imageUpscaleWorkflow, upscaleBlock, upscaleOutMegapixels, maxSideOf, upscaleOutSize, upscaleScaleOf } from './shared/imageUpscale.js';
import { outputMegapixels, priceMode, upscaleOutputSize } from './shared/pricing.js';
/** Batch-1 UX data APIs: media picker, live price, model picker, Recreate prefill (examples), mention check. */
import { checkImageCaps } from './shared/imageCaps.js';
import type { FastifyInstance } from 'fastify';
import { createWriteStream, existsSync, renameSync, statSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { checkAudio, checkImage } from './mediaCheck.js';
import { pipeline } from 'node:stream/promises';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { DATA_DIR, SAMPLES_DIR } from './config.js';
import { listMedia, recordUpload, setUploadProject, thumbFor, MediaQuery, type UploadRow } from './mediaLibrary.js';
import { getProject } from './library.js';
import { all } from './db.js';
import { rememberHash } from './mediaStore.js';
import { modelsFor } from './models.js';
import { getTool } from './tools/registry.js';
import { toolProviders } from './providers.js';
import { defaultProviderFor } from './routing/defaults.js';
import { priceOf, promptBytesFor } from './shared/pricing.js';
import { validateMentions } from './shared/mentions.js';
import { EXAMPLES, Example } from './examples.js';
import { LIMITS, probe, RESOLUTIONS } from './media.js';

const qualitiesOf = (t: NonNullable<ReturnType<typeof getTool>>): string[] => (t.app?.resolutions as string[] | undefined) ?? [...RESOLUTIONS];
const durCache = new Map<string, number | null>();
async function durationOf(url?: string) {
  if (!url || !url.startsWith('/samples/')) return null;
  if (!durCache.has(url)) durCache.set(url, (await probe(path.join(SAMPLES_DIR, url.slice(9))))?.duration ?? null);
  return durCache.get(url) ?? null;
}
/** Resolved Recreate prefill for an example (everything a tool screen needs), plus its live price. */
export async function examplePrefill(e: Example) {
  const t = getTool(e.toolId); if (!t) return null;
  const ids = new Set((t.presets ?? []).map((p) => p.id));
  const usable = toolProviders(t).map((p) => p.id);
  const qs = qualitiesOf(t);
  const quality = e.quality && qs.includes(e.quality) ? e.quality : qs.includes('720p') ? '720p' : qs[0];
  const provider = e.provider && usable.includes(e.provider) ? e.provider : usable[0] ?? null;
  const types = e.types?.filter((x) => ids.has(x));
  const preset = e.preset && ids.has(e.preset) ? e.preset : undefined;
  const toggles = { ...(e.toggles ?? {}) };
  const durationSec = e.video ? Math.min(30, (await durationOf(e.video)) ?? 8) : Number(toggles.duration) || 5;
  const passes = e.toolId === 'reshoot' ? (toggles.fullClip ? 2 : 1) : 1;
  const price = priceOf({ optionFactors: t.pricing?.optionFactors, providerFactor: provider ? t.pricing?.providerFactors?.[provider] : undefined, toolId: t.id, rates: t.gpuSecPerSec, quality, durationSec, provider: provider ?? undefined, passes, types: types ?? (preset ? [preset] : []) });
  return {
    video: e.video ?? null, image: e.image ?? null, refs: e.refs ?? [], prompt: e.prompt ?? '', promptEnabled: !!e.prompt,
    preset: preset ?? null, types: types ?? null, quality, provider, toggles, durationSec, price,
  };
}

/** A clip's width, height and length (ffprobe), so the picker and the Canvas card's pre-flight can flag a clip the run would refuse; nulls for other files. */
async function clipDims(type: string, file: string): Promise<{ width: number | null; height: number | null; duration: number | null }> {
  const p = type === 'video' ? await probe(file) : null;
  return { width: p?.width ?? null, height: p?.height ?? null, duration: p?.duration ? Math.round(p.duration * 100) / 100 : null };
}

export function registerBatch1(app: FastifyInstance) {
  // ---- Media picker ----
  app.get<{ Querystring: MediaQuery & { source?: string; kind?: string } }>('/api/media', async (req) => { const q = req.query; return listMedia({ ...q, tab: q.tab ?? (q.source === 'presets' ? 'presets' : q.source), type: q.type ?? q.kind, sort: ({ new: 'newest', old: 'oldest' } as Record<string, string>)[q.sort ?? ''] ?? q.sort }); }); // sort=new|old|name (aliases of newest|oldest) // page 16: ?source=presets&kind=video|image (picker Presets tab)
  /** "Upload media" tile: multipart `file` (image, video or audio) → listed under the Uploads tab.
   * Quality checks (mediaCheck.ts): images unreadable / low_res (<128px short side) / all-black → 400; audio unreadable / too_short (<3 s) / silent → 400. Videos come back with their width, height and duration (ffprobe) for the Canvas pre-flight.
   * Softer findings (low_res <512px, very dark/bright) come back as warnings[] on the item. Rejected files are deleted, nothing is listed. */
  app.post<{ Querystring: { projectId?: string } }>('/api/media', async (req, reply) => {
    const saved = [];
    // Projects: the picker sends the current project (?projectId= or a `projectId` field before the file); the upload is tagged to it. An unknown id is ignored.
    let pid: string | null = req.query?.projectId && getProject(req.query.projectId) ? req.query.projectId : null;
    const tagged = (ids: string[] | undefined) => pid && !(ids ?? []).includes(pid) ? [...(ids ?? []), pid] : ids ?? [];
    for await (const part of req.parts()) {
      if (part.type !== 'file') { if (part.fieldname === 'projectId') { const v = String((part as any).value ?? ''); pid = v && getProject(v) ? v : pid; } continue; }
      const ext = (path.extname(part.filename || '') || '').toLowerCase();
      const type = /^\.(png|jpe?g|webp)$/.test(ext) ? 'image' : /^\.(mp4|mov|webm|m4v)$/.test(ext) ? 'video' : /^\.(wav|mp3|m4a|aac|ogg|flac)$/.test(ext) ? 'audio' : null;
      if (!type) { part.file.resume(); return reply.code(400).send({ error: 'Unsupported format: use PNG, JPG, WEBP, MP4, MOV, WEBM, WAV, MP3 or M4A.', errorType: 'validation', code: 'unsupported', issues: [{ code: 'unsupported', field: part.fieldname, message: 'Unsupported format.' }] }); }
      // One copy per file (mediaStore.ts): written to a temp name while hashing, then named by content (upl-<hash16>.<ext>).
      const tmpName = `upl-tmp-${randomUUID().slice(0, 8)}${ext}`; const tmp = path.join(DATA_DIR, tmpName); const h = createHash('sha256');
      part.file.on('data', (c: Buffer) => h.update(c));
      await pipeline(part.file, createWriteStream(tmp));
      if ((part.file as any).truncated) { await unlink(tmp).catch(() => undefined); return reply.code(400).send({ error: 'File too large.', errorType: 'validation', code: 'file_too_large', issues: [{ code: 'file_too_large', field: part.fieldname, message: 'File too large.' }] }); }
      const hash = h.digest('hex'); const id = `upl-${hash.slice(0, 16)}`; const name = `${id}${ext === '.jpeg' ? '.jpg' : ext}`; const file = path.join(DATA_DIR, name);
      const prev = all<UploadRow>('uploads').find((u) => u.url === `/files/${name}`);
      if (prev && existsSync(file)) { await unlink(tmp).catch(() => undefined); const again = { ...prev, createdAt: Date.now(), projectIds: tagged(prev.projectIds) }; /* same file, another project: it belongs to both */ recordUpload(again); saved.push({ ...again, ...(await clipDims(type, file)), warnings: [], existing: true }); continue; }
      renameSync(tmp, file);
      const chk = type === 'image' ? await checkImage(file, part.fieldname) : type === 'audio' ? await checkAudio(file, part.fieldname) : null;
      if (chk && !chk.ok) {
        await unlink(file).catch(() => undefined);
        const first = chk.issues.find((i) => i.severity === 'block')!;
        return reply.code(400).send({ error: first.message, errorType: 'validation', code: first.code, issues: chk.issues.map(({ severity, ...i }) => ({ ...i, severity })), name: (part.filename || name).slice(0, 120), saved });
      }
      const row: UploadRow = { id, url: `/files/${name}`, name: (part.filename || name).slice(0, 120), type: type as 'image' | 'video' | 'audio', createdAt: Date.now(), projectIds: tagged([]) };
      recordUpload(row); rememberHash(name, hash, statSync(file).size);
      saved.push({ ...row, ...(type === 'video' ? await clipDims(type, file) : { width: chk?.width ?? null, height: chk?.height ?? null, duration: chk?.duration ?? null }), warnings: chk?.issues ?? [] });
    }
    if (!saved.length) return reply.code(400).send({ error: 'Attach a file.', errorType: 'validation' });
    return { items: saved };
  });
  /** Picker "Move to project" on an upload: {url, projectId: id | null} → {url, projectIds}. The file's project set becomes just that project (null = No project). */
  app.post<{ Body: { url?: unknown; projectId?: unknown } }>('/api/media/project', async (req, reply) => {
    const b = req.body ?? {}; const url = typeof b.url === 'string' ? b.url : '';
    const pid = b.projectId == null || b.projectId === '' ? null : String(b.projectId);
    if (pid && !getProject(pid)) return reply.code(400).send({ error: 'No project with that id.', errorType: 'validation', code: 'unknown_project' });
    const r = url ? await setUploadProject(url, pid) : null;
    if (!r) return reply.code(404).send({ error: 'That file isn’t in your uploads.', errorType: 'not_found' });
    return r;
  });
  app.get<{ Querystring: { url?: string; w?: string } }>('/api/media/thumb', async (req, reply) => {
    if (req.query.w != null) { // grid thumbnails (gridThumbs.ts): a scaled copy of an image or video poster; else the original
      const u = req.query.url ?? ''; const w = Number(req.query.w);
      const g = Number.isFinite(w) && w > 0 ? await (await import('./gridThumbs.js')).gridThumb(u, w) : null;
      if (g) return reply.header('cache-control', 'max-age=86400').sendFile(path.basename(g), path.dirname(g));
      if (/^\/(files|samples|examples|showcase)\/|^\/api\/media\/poster\?/.test(u) && !u.includes('..')) return reply.redirect(u);
      return reply.code(404).send({ error: 'no thumbnail' });
    }
    const f = await thumbFor(req.query.url ?? ''); if (!f) return reply.code(404).send({ error: 'no thumbnail' });
    return reply.header('cache-control', 'max-age=86400').sendFile(path.basename(f), path.dirname(f));
  });

  /** Upscale quote input: width, height (source px), seconds (or duration), scale, mode → the same outputSize/duration/types the job parse produces. */
  const upscaleQuery = (t: any, q: Record<string, any>): any => {
    if (!t.app?.scales) return null; const w = Number(q.width), h = Number(q.height); const scale = q.scale != null && q.scale !== '' ? Number(q.scale) : t.app.defaultScale ?? t.app.scales[0];
    const prov = q.model || q.provider || defaultProviderFor(t) || t.providers?.[0]; const allowed = t.app.scalesByProvider?.[prov] ?? t.app.scales;
    const out: any = { scale, duration: Number(q.seconds ?? q.duration) || undefined, types: [q.mode || 'precise'] };
    if (!allowed.includes(scale)) out.error = `This model upscales ${allowed.map((x: number) => `${x}×`).join(', ')} only.`;
    // same cap as the job: targetLongEdge / target WxH, else the maxOutput target, else the tool max (quote = charge)
    const can = t.app.maxLongSideByProvider?.[prov] ?? t.app.maxLongSide ?? 3840; const tl = upscaleTargetLong(q); const mo = t.app.outputTargets ? t.app.outputTargets[q.maxOutput || Object.keys(t.app.outputTargets)[0]] : null;
    if (tl != null && (!(tl >= 720) || tl > can)) out.error = `Target must be 720–${can} px on the long side for this engine.`;
    const cap = tl != null && tl >= 720 && tl <= can ? tl : mo ?? can; if (tl != null) out.targetLongEdge = tl;
    if (w > 0 && h > 0) { const o = upscaleOutputSize(w, h, scale, cap); out.inputSize = { width: w, height: h }; out.outputSize = { width: o.width, height: o.height }; }
    if (VUP_TOOLS.has(t.app?.gallery?.base ?? t.id) && prov) vupSizing(prov, out, { ...q, width: w, height: h }); // Video Upscale: the model's own size rule (= submit)
    return out;
  };
  /** GET /price for image-upscale: scale=2|4|8 or types=x<n> -> {scale, workflow, sourceSize?, outputSize?, maxSide}; a factor the model can't do,
   *  or one past 8192 px for the given width/height -> 400 (unsupported_scale / output_too_large), the same rule the job applies. */
  const imageUpscaleQuote = (q: Record<string, any>, prov: string): Record<string, any> => {
    const s = upscaleScaleOf(q); if (s == null) return {};
    const bad = (code: string, message: string) => ({ error: message, errorType: 'validation', code, field: 'scale', allowed: (UPSCALE_FACTORS_BY_PROVIDER[prov] ?? []).map(String), issues: [{ code, field: 'scale', message }] });
    if (!Number.isFinite(s) || !(UPSCALE_FACTORS as readonly number[]).includes(s)) return bad('invalid_scale', 'Scale must be 2, 4 or 8.');
    const w = Number(q.width), h = Number(q.height); const src = w > 0 && h > 0 ? { width: w, height: h } : null;
    const b = upscaleBlock(prov, s, src); if (b) return bad(b.code, b.message);
    if (q.scale != null && q.scale !== '') { (q as any).types = `x${s}`; delete (q as any).scale; } // the routing hook picks defaults by mode (types), same as submit
    return { scale: s, workflow: imageUpscaleWorkflow(prov, s), maxSide: maxSideOf(prov), ...(src ? { sourceSize: src, outputSize: upscaleOutSize(w, h, s) } : {}) };
  };
  // ---- Live price (same function the web runs locally) ----
  app.get<{ Params: { toolId: string }; Querystring: Record<string, string> }>('/api/tools/:toolId/price', async (req, reply) => {
    const t = getTool(req.params.toolId); if (!t) return reply.code(404).send({ error: 'unknown tool' });
    if (t.id === 'app-photos-to-reel') { const r = await (await import('./photosToReel.js')).quoteReel(app, req.query); return reply.code(r.status).send(r.body); }
    const q = req.query; const on = (v?: string) => /^(1|true|on)$/i.test(v ?? '');
    if (q.model && !q.provider) (q as any).provider = q.model; // model= is an alias of provider= (the routed-price hook reads the same query)
    // videoPath=/files/… or /samples/… (the MCP quote): a trim-aware video tool (Video Swap family) is billed per second of the clip, so price the
    // clip's real length (or the trimStart–trimEnd range, max LIMITS.maxSec) the way the submit does, instead of the default length.
    if (q.videoPath && !q.duration && t.inputs.some((i) => i.name === 'trimStart')) {
      const m = /^\/(files|samples)\/([^?#]+)$/.exec(String(q.videoPath)); const base = m ? (m[1] === 'files' ? DATA_DIR : SAMPLES_DIR) : null;
      const f = base && m ? path.join(base, path.normalize(decodeURIComponent(m[2])).replace(/^(\.\.[/\\])+/, '')) : null;
      const pr = f && f.startsWith(base!) && existsSync(f) ? await probe(f) : null;
      if (pr && pr.duration > 0) { const st = Number(q.trimStart) || 0; const en = q.trimEnd ? Number(q.trimEnd) : Math.min(pr.duration, st + LIMITS.maxSec);
        if (Number.isFinite(st) && Number.isFinite(en) && en > st) (q as any).duration = String(Math.min(swapRangeSeconds({ start: st, end: en }), LIMITS.maxSec)); }
    }
    if (t.id === 'reshoot' && !q.provider && on(q.sourceImage) && !on(q.video)) { const ok = (await import('./tools/reshoot.js')).reshootImageProviders(toolProviders(t).map((p) => p.id)); if (ok[0]) (q as any).provider = ok[0]; } // still source: same Auto pick as the submit
    const defProv = defaultProviderFor(t) ?? toolProviders(t)[0]?.id; // B6: same default as submit (not qualityOrder[0])
    const prov = q.provider || q.model || defProv; const up = upscaleQuery(t, q);
    let iu: Record<string, any> = {}; // Image Upscale: scale= (alias of types=x<scale>) names the factor; the quote names the workflow file that runs and, with width/height, the output size (8192 px cap, same rule as submit)
    { const ic = imageCapsQuoteError(t, q, prov); if (ic) return reply.code(400).send({ ...ic, valid: false, credits: null, priceAvailable: false }); } // Create Image + its apps: the same per-model caps check as the submit (Auto on a model without Auto → the same 400)
    if (t.id === 'image-upscale') { const r = imageUpscaleQuote(q, prov); if ('error' in r) return reply.code(400).send({ ...r, valid: false, credits: null, priceAvailable: false }); iu = r; }
    return { ...iu, ...priceOf({ ...(up ? { megapixels: outputMegapixels(up), mode: priceMode(up), durationSec: up.duration } : {}), ...(t.id === 'image-upscale' ? { outMegapixels: upscaleOutMegapixels({ outputSize: iu.outputSize, scale: iu.scale }) } : {}), optionFactors: t.pricing?.optionFactors, providerFactor: prov ? t.pricing?.providerFactors?.[prov] : undefined, toolId: t.id, rates: t.gpuSecPerSec, quality: up?.resolution || q.quality || q.resolution || '720p', durationSec: up?.duration ?? (Number(q.duration ?? q.seconds) || null), provider: q.provider || defProv,
      draft: on(q.draft), passes: Number(q.passes) || 1, count: Math.min(Number((t.app as any)?.gallery?.perOutput?.max) || 4, Math.max(1, Number((q as any).n ?? (q as any).count) || 1)) /* Create Image n / Director count; Shots: n angles up to 9 */, audio: on((q as any).audio), chars: Number((q as any).chars) || ((q as any).text ? String((q as any).text).length : (q as any).prompt ? String((q as any).prompt).length : undefined) /* TTS: billed per character, same as the job */, bytes: Number((q as any).bytes) || ((q as any).text ? Buffer.byteLength(String((q as any).text)) : (q as any).prompt ? Buffer.byteLength(String((q as any).prompt)) : undefined), types: (q.types || '').split(',').filter(Boolean), free: on(q.free) }) };
  });

  // ---- Create Image quote: same priceOf + caps check the job endpoint uses (shown = charged) ----
  app.get<{ Querystring: { model?: string; quality?: string; imageResolution?: string; n?: string; aspect?: string; refs?: string; mode?: string } }>('/api/models/quote', async (req, reply) => {
    { const RES = /^(240|360|480|540|576|720|768|1080|1440|2160)p$|^[124]K$/i; // resolution must be a known tier: 9000p → 400, nothing quoted
      for (const f of ['resolution', 'imageResolution', 'quality'] as const) { const v = String((req.query as any)[f] ?? ''); if (v && /^\d+p$|^\d+K$/i.test(v) && !RES.test(v)) return reply.code(400).send({ error: `${f}: ${v} is not a supported resolution.`, errorType: 'validation', issues: [{ code: 'unsupported', field: f, message: `${v} is not a supported resolution.` }], valid: false }); } }
    if ((req.query as any).toolId && (req.query as any).toolId !== 'create-image') { const qq: any = req.query; const t2 = getTool(qq.toolId); if (!t2) return reply.code(404).send({ error: 'unknown tool' });
      const u = upscaleQuery(t2, qq); const prov = qq.model || qq.provider || defaultProviderFor(t2) || toolProviders(t2)[0]?.id; if (u?.error) return reply.code(400).send({ error: u.error, errorType: 'validation', issues: [{ code: 'unsupported', field: 'scale', message: u.error }], valid: false });
      const p = priceOf({ toolId: t2.id, rates: t2.gpuSecPerSec, quality: u?.resolution || qq.quality || qq.resolution || '1080p', durationSec: u?.duration ?? (Number(qq.seconds ?? qq.duration) || null), provider: prov, ...(u ? { megapixels: outputMegapixels(u), mode: priceMode(u) } : {}) });
      return { valid: true, toolId: t2.id, model: prov, credits: p.credits, basis: p.basis, breakdown: p.breakdown, ...(u ? { outputSize: u.outputSize, scale: u.scale, mode: priceMode(u), seconds: u.duration } : {}) }; }
    const q = req.query; const t = getTool('create-image')!; const model = q.model || defaultProviderFor(t) || toolProviders(t)[0]?.id;
    if (!t.providers.includes(model)) { // any other /api/models entry (video, audio, upscale…): quote it on the first tool that offers it, via that tool's /price (same routed price = charge)
      const { listTools } = await import('./tools/registry.js'); const owner = [getTool('h3-video'), ...listTools()].find((x) => x?.providers.includes(model)); // the video models' own tool first (same as the quote preHandler's toolForModel), not an app that also lists them (Camera Moves: MiniMax H3)
      if (!owner) return reply.code(404).send({ error: `unknown model ${model}: not offered by any tool (see GET /api/models)`, errorType: 'not_found', code: 'unknown_model', valid: false });
      const qs = new URLSearchParams(Object.entries(req.query as Record<string, string>).filter(([k, v]) => k !== 'model' && v != null) as [string, string][]); qs.set('provider', model);
      const r = await app.inject({ method: 'GET', url: `/api/tools/${owner.id}/price?${qs}`, headers: { 'x-forwarded-for': String(req.ip ?? '') } });
      const body = r.json() as any; if (r.statusCode >= 400) return reply.code(r.statusCode).send({ ...body, model, toolId: owner.id, valid: false, error: body?.error ?? `could not quote ${model} on ${owner.id}` });
      // Run on (2026-10-22): nothing ready → nothing pre-selected, so the tool quote has credits:null but lists setupOptions with their prices.
      // That is "not set up yet", not "no verified price": pass the tool's quote through (same body as /api/tools/:id/price).
      if (typeof body?.credits !== 'number' && body?.basis !== 'unavailable' && Array.isArray(body?.setupOptions) && body.setupOptions.length) return { model, toolId: owner.id, ...body, valid: body.valid ?? false };
      if (typeof body?.credits !== 'number') { const why = (body?.basis === 'unavailable' ? body?.breakdown?.[0]?.label : null) || body?.reason || body?.breakdown?.[0]?.label || 'no verified price for this model'; // listed but unpriced: a clear 4xx, never a null quote
        return { model, toolId: owner.id, valid: false, priceAvailable: false, runnable: false, credits: null, reason: `No verified price for ${model}: ${String(why).replace(/\.+$/, '')}.`, code: 'price_unavailable' }; } // (C) unpriceable = 200 + priceAvailable:false, never a 400
      return { valid: true, model, toolId: owner.id, ...body };
    }
    const cap = checkImageCaps(model, { aspect: q.aspect, quality: q.quality, imageResolution: q.imageResolution, n: q.n ?? 1, refs: Number(q.refs) || 0, mode: q.mode, photoAspect: photoAspectOf(q as any) });
    if (!cap.ok) return reply.code(400).send({ error: cap.issues[0].message, errorType: 'validation', issues: cap.issues, valid: false });
    if (cap.notes?.length) { const qq = q as Record<string, any>; // D5: the snapped settings route and price, as /api/tools/:id/price does (tools/apps.ts imageCapsQuoteError)
      if (qq.aspect && qq.aspect !== cap.aspect) qq.aspect = cap.aspect; if (qq.imageResolution && qq.imageResolution !== cap.imageResolution) qq.imageResolution = cap.imageResolution; qq.__snapNotes = cap.notes; }
    const n = Number(q.n ?? 1);
    if (!Number.isInteger(n) || n < 1 || n > 4) return reply.code(400).send({ error: 'n must be 1–4.', errorType: 'validation', issues: [{ code: 'invalid', field: 'n', message: 'n must be 1–4.' }], valid: false });
    const p = priceOf({ toolId: t.id, rates: t.gpuSecPerSec, quality: '720p', provider: model, count: n, tier: cap.tier, imageRes: cap.imageResolution, aspect: cap.aspect, promptBytes: promptBytesFor(q as any) });
    if (p.basis === 'unavailable') { // BH #28: the native price is missing, but a fal/Replicate/direct route may have one → let the routed-price hook quote that route (shown = charged)
      const { routesFor } = await import('./routing/routes.js'); const { routeCredits, localAvailable } = await import('./routing/select.js');
      const rin = { n, tier: cap.tier, imageResolution: cap.imageResolution, outKind: 'image', aspect: cap.aspect, types: q.mode ? [q.mode] : undefined, prompt: (q as any).prompt, promptBytes: (q as any).promptBytes };
      const rs = routesFor(model).filter((r) => !r.comingSoon); const priced = rs.some((r) => routeCredits(t, r, rin) != null);
      if (priced) return { valid: true, model, aspect: cap.aspect, quality: cap.tier, imageResolution: cap.imageResolution, n, perImage: 0, credits: 0, basis: 'hosted', breakdown: [] }; // replaced by the hook
      const localRoute = rs.some((r) => r.kind === 'local') && localAvailable();
      return reply.code(200).send({ reason: `No verified price for ${model} at this quality/resolution yet, so it can't run (quote must equal charge).`, code: 'price_unavailable', // (C) 200, never a 400
        valid: false, model, priceAvailable: false, runnable: false, credits: null, local: localRoute, quality: cap.tier, imageResolution: cap.imageResolution });
    }
    return { valid: true, model, aspect: cap.aspect, quality: cap.tier, imageResolution: cap.imageResolution, n, perImage: n ? p.credits / n : 0, credits: p.credits, basis: p.basis, breakdown: p.breakdown };
  });

  // ---- Model picker ----
  app.get<{ Querystring: { toolId?: string; q?: string; model?: string } }>('/api/models', async (req, reply) => {
    const ids = req.query.toolId ? [req.query.toolId] : null;
    const tools = (ids ?? []).map((id) => getTool(id)).filter(Boolean);
    if (ids && !tools.length) return reply.code(404).send({ error: 'unknown tool' });
    const { listTools } = await import('./tools/registry.js');
    const needle = (req.query.q ?? '').toLowerCase();
    const groups = (ids ? tools : listTools()).map((t) => ({ toolId: t!.id, toolName: t!.name,
      models: modelsFor(t!).filter((m) => !needle || `${m.name} ${m.providerName} ${m.hint}`.toLowerCase().includes(needle)) }));
    { const { creditOf } = await import('./attribution.js'); const { buildLicenseReport } = await import('./licensesReport.js'); const rows = buildLicenseReport().rows; const memo = new Map<string, any>();
      for (const g of groups) for (const m of g.models as any[]) { const pid = String(m.providerId ?? m.id).replace(/^[^:]+:/, ''); if (!memo.has(pid)) memo.set(pid, creditOf(pid, rows)); Object.assign(m, memo.get(pid)); } }
    const selected = req.query.model ? groups.flatMap((g) => g.models).find((m) => m.id === req.query.model) ?? null : null;
    return { groups, selected };
  });

  // ---- Mention check (same rules the job endpoint enforces) ----
  app.post<{ Body: { prompt?: string; images?: number; videos?: number } }>('/api/mentions/validate', async (req) => {
    const r = validateMentions(req.body?.prompt ?? '', { images: Number(req.body?.images) || 0, videos: Number(req.body?.videos) || 0 });
    return { ok: r.ok, mentions: r.mentions, issues: r.issues.map((i) => ({ code: i.code, mention: i.mention.raw, start: i.mention.start, end: i.mention.end, message: i.message })) };
  });

  app.get<{ Params: { id: string } }>('/api/examples/:id/prefill', async (req, reply) => {
    const e = EXAMPLES.find((x) => x.id === req.params.id); const p = e && (await examplePrefill(e));
    return p ? p : reply.code(404).send({ error: 'example not found' });
  });
}
