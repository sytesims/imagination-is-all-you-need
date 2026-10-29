import { brandFromRecreate } from './brandStore';
import { runOnLabel, runOnOfRoute, setActiveModel } from './models';
import { pageToolId } from './workflowLinks';
import { tagHandoff } from './handoffFiles';
import { EXAMPLES } from '../ui/examples';
import { useEffect, useRef } from 'react';
import { urlSettings } from './prefillParams';
import { getJob, listExamples, Example } from '../api';
import { readVideo, VideoMeta } from './UploadVideo';
import type { Ref } from './References';
import { LIMITS } from './limits';
import { useToast } from './Toast';
import { planJobFiles, prefillGate } from './prefillDelivery';
import { useFrameHandoff } from './useFrameHandoff';
import { isBundledInputUrl } from './jobInputs';
import { decodeRecipe, type Recipe } from '../../../server/src/shared/recipe';

/** "Make this" (/r → "Open in <Tool>", 2026-10-25): a checked recipe as the same Example the Recreate path uses, so one prefill object carries
 *  the prompt, model, quality, duration, aspect, seed and the tool's own fields (toggles). No files: a recipe never has any. */
export function recipeExample(r: Recipe, toolId: string) {
  const st: Record<string, any> = { ...r.settings }; const seed = Number(st.seed); const hasSeed = st.seed != null && Number.isFinite(seed);
  let types: any = st.types; if (typeof types === 'string') { try { types = JSON.parse(types); } catch { types = [types]; } }
  types = Array.isArray(types) ? types.filter((t: unknown) => typeof t === 'string') : typeof st.preset === 'string' ? [st.preset] : [];
  const toggles: Record<string, string | number | boolean> = {}; Object.entries(st).forEach(([k, v]) => { if (!/^(seed|types|provider|mode)$/.test(k) && !Array.isArray(v)) toggles[k] = v; });
  const prompt = r.prompt ?? '';
  return { id: 'recipe', title: 'recipe', toolId, prompt, types, refs: [], preset: typeof st.preset === 'string' ? st.preset : undefined,
    prefill: { quality: String(st.resolution ?? st.quality ?? ''), provider: r.model?.id ?? null, toggles, video: null, image: null, refs: [], prompt, promptEnabled: true, preset: typeof st.preset === 'string' ? st.preset : null, types: null, durationSec: Number(st.duration) || 0 },
    ...(hasSeed ? { recreate: { jobId: 'recipe', seed } } : {}), fromRecipe: true } as any;
}

const toFile = async (url: string, name: string) => { const r = await getRetry(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); const b = await r.blob(); return new File([b], name, { type: b.type || mimeOf(name) }); };
const mimeOf = (n: string) => { const e = (n.split('.').pop() ?? '').toLowerCase(); return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', webm: 'video/webm', mov: 'video/quicktime' } as Record<string, string>)[e] ?? 'video/mp4'; };

/**
 * "Send to another tool": the Assets page links to `<tool route>?from=<jobId>&out=<outputIndex>`.
 * Prefills the target tool with that output as the source video (or the source image/refs for image apps),
 * plus the original references. Strips the query afterwards.
 */
const MIN_FRAME_PX = 409_600; // keyframe minimum (854×480)
/** Scale an image up (canvas) until it has at least `px` pixels; returns the original file when already large enough. */
async function atLeast(f: File, px: number): Promise<File> {
  const bmp = await createImageBitmap(f); const k = Math.sqrt(px / (bmp.width * bmp.height)); if (k <= 1) return f;
  const c = document.createElement('canvas'); c.width = Math.ceil(bmp.width * k); c.height = Math.ceil(bmp.height * k); c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const b: Blob = await new Promise((res, rej) => c.toBlob(x => x ? res(x) : rej(new Error('encode failed')), 'image/jpeg', 0.92));
  return new File([b], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: Date.now() });
}
export type Recreate = { jobId: string; form: Record<string, string>; files: Record<string, string[]>; seed: number; routeId: string | null; model: string | null; reason: string | null; providerAvailable: boolean; price: any;
  /** pb/server-1018 (optional on older servers): params the job derives from its source (Upscale width/height/seconds) to pass to /price and /api/routes; how the original was routed; whether Recreate re-pinned it. */
  quoteParams?: Record<string, string>; originalRouting?: string | null; repinned?: boolean;
  /** the model card the job ran when its engine serves several cards on the tool (H3 Extend vs H3 Max Extend on comfy-h3-extend); null = the engine says it */
  modelKey?: string | null };
/** Quote params from the last prefill (Recreate or send-to), per tool page. Price/route fetches merge them so the quote equals the charge; cleared when the source is replaced. */
let QP: { path: string; params: Record<string, string> } | null = null;
export const quoteParams = (): Record<string, string> => (QP && QP.path === location.pathname ? QP.params : {});
export const clearQuoteParams = () => { QP = null; };
const keepQP = (qp: any) => { QP = qp && typeof qp === 'object' && Object.keys(qp).length ? { path: location.pathname, params: Object.fromEntries(Object.entries(qp).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)])) } : null; };
export type Handoff = { jobId: string; slot: string; url: string; prompt: string; toolId: string; mode: string; focus: string; form: Record<string, string>;
  /** a video frame (t=last | first | seconds) and "Continue from last frame" (cont=1): form.prompt is the continue prompt, form.provider the model to use */ frame?: string; cont?: boolean;
  /** Continue: the place the source clip was pinned to (Run on), kept for the next clip */ continueRoute?: { modelKey: string | null; runOn: string | null; routeId: string } | null };
/** GET with one retry after ~1s on a 5xx or a network error (then the caller shows the toast). */
/** GET with retries on 5xx / network errors (1 s, 2 s, 4 s): the API may be mid-restart when a hand-off link is opened. */
async function getRetry(url: string): Promise<Response> {
  for (const wait of [1000, 2000, 4000]) { try { const r = await fetch(url); if (r.status < 500) return r; } catch { /* network */ } await new Promise(res => setTimeout(res, wait)); }
  return fetch(url);
}
/** Load each URL as a File, in order; a file that can't be fetched goes to `gone` (its name) instead of failing the whole set or being dropped silently. */
async function loadAll(urls: string[], gone: string[]): Promise<Ref[]> {
  const got = await Promise.all(urls.map(u => toFile(u, u.split('/').pop()!).then(file => ({ file, url: URL.createObjectURL(file) }) as Ref, () => { gone.push(u.split('/').pop() || u); return null; })));
  return got.filter((r): r is Ref => !!r);
}
/** Recreate: the job's files into the page, each slot ONCE and in the job's order (the page emptied its slots in onReset just before).
 *  Main clip → onVideo, start image → onImage, references → onRefs (the full ordered set), every other slot → onFiles(slot). The refs are never
 *  sent twice (onRefs and onFiles('refs') used to both add them: Motion Control showed each character twice). */
async function deliverJobFiles(opts: Parameters<typeof usePrefill>[0], ex: { video?: string; image?: string; refs?: string[] }, fl: Record<string, string[]>, gone: string[]) {
  for (const d of planJobFiles(opts, ex, fl)) { const rs = await loadAll(d.urls, gone); if (!rs.length) continue;
    if (d.to === 'video') { const m = await readVideo(rs[0].file); opts.onVideo?.({ ...m, trimmed: m.duration > LIMITS.maxSec }); }
    else if (d.to === 'image') opts.onImage?.(rs[0]);
    else if (d.to === 'refs') opts.onRefs?.(rs);
    else opts.onFiles?.(d.slot, rs); }
}
export function usePrefill(opts: { onVideo?: (v: VideoMeta) => void; /** `handoff`: one image from a result (adds to what is attached); otherwise a Recreate / example's full set */ onRefs?: (r: Ref[], o?: { handoff?: boolean }) => void; onImage?: (r: Ref) => void; onExample?: (ex: Example) => void; onHandoff?: (h: Handoff) => void; onRecreate?: (r: Recreate) => void; fromJob?: boolean;
  /** Recreate: every file slot the server returns (end frame, ref clips/audio, voice sample, portrait, speech, matte, mask, audio…), as files. Called per slot, including the ones also sent to onVideo/onImage/onRefs; the tool picks what it uses. */
  onFiles?: (slot: string, files: Ref[]) => void;
  /** a hand-off of an audio result (Make it talk → Lip Sync's Speech slot) */ onAudio?: (r: Ref) => void;
  /** A full prefill (Recreate, an example, a preset) is about to load: empty every file slot first, so the job's own inputs REPLACE what was
   *  there (a second Recreate on an open page used to add to the first one's photos). The handlers after it then set each slot, once. */
  onReset?: () => void;
  /** The ?workflow= this page part owns (the Video page's bar per workflow, Create Video = null). A link for another workflow on the same path is
   *  left to the part that mounts for it (it used to be eaten by the one already open). undefined = any. */
  scope?: string | null;
  /** The workflow a link with no ?workflow= opens (the Audio page's Music): a scoped part for it takes those links too. */
  scopeDefault?: string; /** A slow Continue must not overwrite words typed while its frame loads. */ onFrameStart?: () => void }) {
  const toast0 = useToast();
  /* Always the latest handlers: the effect runs once per mount, but a Recreate on an open page (popstate) must use this render's state, not the mount's. */
  const optsRef = useRef(opts); optsRef.current = opts;
  const frame = useFrameHandoff({ ...opts, keepQuote: keepQP, loaded: toast0 });
  const frameRef = useRef(frame); frameRef.current = frame;
  const gate = useRef(prefillGate()).current;
  useEffect(() => { const run = () => {
    const sc = optsRef.current.scope; if (sc !== undefined && (new URLSearchParams(location.search).get('workflow') ?? optsRef.current.scopeDefault ?? null) !== sc) return;
    /* one prefill at a time: a newer link (Recreate → Recreate) makes the older one's late file loads and toasts no-ops, so they never mix */
    const live = gate.begin();
    const opts: typeof optsRef.current = new Proxy({} as typeof optsRef.current, { get: (_, k) => live() ? (optsRef.current as any)[k] : undefined, has: (_, k) => live() && k in optsRef.current });
    const toast: typeof toast0 = ((m: any, k?: any) => { if (live()) return toast0(m, k); }) as any;
    const q = new URLSearchParams(location.search); const from = q.get('from');
    const fj = q.get('fromJob');
    if (fj && opts.fromJob !== false) { // C1: hand-off from a result (Turn to video, Upscale, Relight, Translate, Change voice, Re-shoot…).
      // GET /api/jobs/:id/prefill says which slot this tool takes and which file to use; /handoff is the fallback for older servers.
      const as = q.get('as') ?? ''; const out = q.get('out') ?? ''; const toolId = pageToolId();
      const mode = q.get('mode') ?? ''; const focus = q.get('focus') ?? ''; const tAt = q.get('t') ?? ''; const cont = q.get('cont') === '1';
      ['fromJob', 'as', 'out', 'mode', 'focus', 't', 'cont'].forEach(k => q.delete(k)); history.replaceState(history.state, '', location.pathname + (q.toString() ? `?${q}` : ''));
      if (tAt && cont && toolId === 'h3-video') { frameRef.current.start({ jobId: fj, out, as, at: tAt, cont, toolId, mode, focus }); return; }
      frameRef.current.cancel();
      (async () => {
        try {
          const pq = new URLSearchParams({ action: 'send-to', tool: toolId });
          if (out) pq.set('out', out); if (as) pq.set('as', as); if (tAt) pq.set('t', tAt); if (cont) pq.set('cont', '1');
          let h: any = null;
          const r = await getRetry(`/api/jobs/${encodeURIComponent(fj)}/prefill?${pq}`);
          if (r.status === 404 && !(await r.clone().json().catch(() => ({})))?.errorType) h = null; // route missing → fall back
          else { h = await r.json().catch(() => ({})); if (!r.ok) throw new Error(h.error ?? `HTTP ${r.status}`); if (h.available === false) throw new Error(h.reason ?? 'not available here'); }
          if (!h) { const u = new URLSearchParams({ to: toolId, ...(as ? { as } : {}) }); const r2 = await getRetry(`/api/jobs/${encodeURIComponent(fj)}/handoff?${u}`); h = await r2.json().catch(() => ({})); if (!r2.ok) throw new Error(h.error ?? `HTTP ${r2.status}`); }
          keepQP(h.quoteParams); const slot: string = h.slot ?? '';
          const f0 = h.fields?.[slot]; const url: string = (Array.isArray(f0) ? f0[0] : f0) ?? h.files?.[slot]?.[0] ?? h.output?.url ?? h.fileUrl ?? h.prefill?.[slot]?.[0];
          if (!url) throw new Error('nothing to bring in');
          const f = await toFile(url, url.split('/').pop() || 'handoff');
          const outIx = String(h.output?.index ?? h.submit?.output ?? (out || 0));
          if (h.submit ? !!h.submit.fromJob : !('submit' in h)) tagHandoff(f, { fromJob: fj, output: outIx });
          const isVid = (f.type || '').startsWith('video/') || /\.(mp4|webm|mov)$/i.test(url);
          const wantRefs = slot === 'refs' || as === 'ref';
          const isAud = (f.type || '').startsWith('audio/') || /\.(m4a|mp3|wav|ogg|flac|aac|opus)$/i.test(url);
          if (isAud) { if (!opts.onAudio) throw new Error('this tool doesn’t take a sound'); opts.onAudio({ file: f, url: URL.createObjectURL(f) }); toast('Sound loaded from your result'); return; }
          if (isVid && opts.onVideo) { const m = await readVideo(f); opts.onVideo({ ...m, trimmed: m.duration > LIMITS.maxSec }); }
          else if (!isVid && wantRefs && opts.onRefs) { opts.onRefs([{ file: f, url: URL.createObjectURL(f) }], { handoff: true }); }
          else if (!isVid && opts.onImage) { opts.onImage({ file: f, url: URL.createObjectURL(f) }); }
          else if (!isVid && opts.onRefs) { opts.onRefs([{ file: f, url: URL.createObjectURL(f) }], { handoff: true }); }
          else throw new Error(`this tool doesn't take ${isVid ? 'a video' : 'an image'}`);
          const src: any = h.imagePrompt !== undefined ? null : await getJob(fj).catch(() => null);
          opts.onHandoff?.({ jobId: fj, slot: slot || (isVid ? 'video' : 'image'), url, prompt: String(h.imagePrompt ?? src?.input?.prompt ?? ''), toolId, mode: mode || h.form?.mode || '', focus: focus || h.focus || '', form: h.form ?? {}, ...(tAt ? { frame: tAt, cont, continueRoute: h.continueRoute ?? null } : {}) });
          toast(isVid ? 'Video loaded from your result' : tAt && slot === 'image' && toolId === 'h3-video' ? (tAt === 'last' ? 'Last frame loaded as the start image' : 'Frame loaded as the start image') : slot === 'image' && toolId === 'h3-video' ? 'Image loaded as the start frame' : 'Image loaded from your result');
        } catch (e: any) { toast(`Couldn’t bring in that result (${e.message}). Upload it instead.`, 'error'); }
      })();
      return;
    }
    frameRef.current.cancel();
    const rc = q.get('recreate');
    if (rc) { // "Recreate" from a result: same tool, same inputs (source, refs, prompt, types/preset), new seed
      q.delete('recreate'); history.replaceState(history.state, '', location.pathname + (q.toString() ? `?${q}` : ''));
      (async () => {
        try {
          // C2: GET /api/jobs/:id/prefill?action=recreate → model, aspect, quality (tier), resolution, duration, files, originalSeed.
          const pr = await getRetry(`/api/jobs/${encodeURIComponent(rc)}/prefill?action=recreate`).then(r => r.ok ? r.json() : null).catch(() => null);
          if (pr && pr.available !== false && pr.form) { keepQP(pr.quoteParams);
            const form: Record<string, string> = pr.form; let ty: any = form.types; try { ty = JSON.parse(ty); } catch { ty = ty ? [ty] : []; }
            const fl: Record<string, string[]> = { ...(pr.files ?? {}) };
            // Prefill may list only the main image; the job input keeps every reference (refUrls). Fill refs from it so Recreate keeps all of them.
            if (!fl.refs?.length) { const ji: any = (await getJob(rc).catch(() => null))?.input ?? {}; const main = ji.imageUrl ?? fl.image?.[0]; const gone0: string[] = Array.isArray(pr.missingFiles) ? pr.missingFiles : []; const extra = Array.isArray(ji.refUrls) ? ji.refUrls.filter((u: string) => u && u !== main && !gone0.includes(u.split('/').pop()!)) : []; if (extra.length) fl.refs = extra; }
            const one = (k: string) => fl[k]?.[0] ?? (typeof pr.fields?.[k] === 'string' ? pr.fields[k] : undefined);
            const toggles: Record<string, string> = {}; Object.entries(form).forEach(([k, v]) => { if (!/^(prompt|types|provider|resolution|seed)$/.test(k) && v != null && v !== '') toggles[k] = String(v); });
            const ex: any = { id: 'job-' + rc, title: 'your result', toolId: pr.tool, prompt: form.prompt ?? '', types: Array.isArray(ty) ? ty : [], video: one('video'), image: one('image'), refs: fl.refs ?? [],
              prefill: { quality: form.resolution ?? '', provider: form.provider ?? pr.fields?.model ?? null, toggles, video: null, image: null, refs: [], prompt: form.prompt ?? '', promptEnabled: true, preset: form.preset ?? null, types: null, durationSec: Number(form.duration) || 0 },
              preset: form.preset ?? undefined,
              recreate: { jobId: rc, seed: Number(pr.originalSeed ?? 0) } };
            opts.onReset?.(); /* the job's inputs replace whatever the slots held */
            if (pr.modelKey && pr.tool && pr.providerAvailable !== false) setActiveModel(String(pr.tool), String(pr.modelKey)); /* the card the job ran (an engine shared by several cards opens on the first one otherwise) */
            opts.onExample?.(ex);
            brandFromRecreate(String(pr.tool ?? ''), form).then(n => { if (n) toast(n, 'warn'); }).catch(() => undefined); /* Brand Kit: the run's kit comes back on (or Brand goes off) */
            opts.onRecreate?.({ jobId: rc, form, files: fl, seed: Number(pr.originalSeed ?? 0), routeId: pr.routeId ?? null, model: pr.model ?? form.provider ?? null, reason: pr.reason ?? null, providerAvailable: pr.providerAvailable !== false, price: pr.price ?? null, quoteParams: pr.quoteParams ?? undefined, originalRouting: pr.originalRouting ?? null, repinned: !!pr.repinned, modelKey: pr.modelKey ?? null });
            const gone: string[] = Array.isArray(pr.missingFiles) ? pr.missingFiles.map(String) : [];
            await deliverJobFiles(opts, ex, fl, gone);
            const g = [...new Set(gone)]; gone.length = 0; gone.push(...g);
            if (gone.length) { toast(`${gone.length === 1 ? 'One input of that run is' : `${gone.length} inputs of that run are`} no longer on disk (${gone.slice(0, 3).join(', ')}${gone.length > 3 ? '…' : ''}). Add ${gone.length === 1 ? 'it' : 'them'} again before you generate.`, 'warn'); return; }
            // B12: when the original model can't run here, the toast says which one was swapped in (one toast at a time, so it carries both).
            if (pr.providerAvailable === false && pr.reason) toast(`${String(pr.reason)} Other settings loaded, with a new seed.`, 'warn');
            else toast(`Same settings loaded, with a new seed.${pr.repinned ? ` It runs on ${runOnLabel(runOnOfRoute(pr.routeId)) || 'the same place'} again, as before.` : ''} Turn on Same seed to reuse the original.`); return;
          }
          const j = await getJob(rc); const inp: any = j.input ?? {}; let types: any = inp.types; if (typeof types === 'string') { try { types = JSON.parse(types); } catch { types = [types]; } }
          // C2: keep model, aspect, quality and duration; the seed is new by default (recreate.seed is the original for the Same seed toggle).
          const toggles: Record<string, string | number | boolean> = {}; Object.entries(inp).forEach(([k, v]) => { if (v != null && v !== '' && ['string', 'number', 'boolean'].includes(typeof v) && !/^(prompt|finalPrompt|seed|mode|outKind|simulate|blocked|target|draft|types)$/.test(k) && !/(Url|Path)$/.test(k)) toggles[k] = v as any; });
          const ex: any = { id: 'job-' + rc, title: 'your result', toolId: j.toolId, prompt: inp.prompt || '', types: Array.isArray(types) ? types : inp.preset ? [inp.preset] : [], video: inp.videoUrl, image: inp.imageUrl ?? undefined, refs: inp.refUrls ?? [],
            prefill: { quality: String(inp.resolution ?? ''), provider: (j as any).provider ?? null, toggles, video: null, image: null, refs: [], prompt: inp.prompt || '', promptEnabled: true, preset: inp.preset ?? null, types: null, durationSec: Number(inp.duration) || 0 },
            recreate: { jobId: rc, seed: Number(inp.seed ?? 0) } };
          opts.onReset?.();
          opts.onExample?.(ex);
          { const gone: string[] = []; await deliverJobFiles(opts, ex, ex.refs?.length ? { refs: ex.refs } : {}, gone);
            if (gone.length) { toast(`Some inputs of that run are no longer on disk (${[...new Set(gone)].join(', ')}). Add them again before you generate.`, 'warn'); return; } }
          toast('Same settings loaded, with a new seed. Turn on Same seed to reuse the original.');
        } catch (e: any) { toast(`Couldn't load that result: ${e.message}`, 'error'); }
      })();
      return;
    }
    const rp = q.get('recreatePreset');
    if (rp) { // page 16 Recreate: full prefill from GET /api/presets/:id (preset.prefill), same pipeline as examples
      q.delete('recreatePreset'); history.replaceState(history.state, '', location.pathname + (q.toString() ? `?${q}` : ''));
      (async () => {
        try {
          const r = await fetch(`/api/presets/${encodeURIComponent(rp)}`); if (!r.ok) throw new Error(`HTTP ${r.status}`); const { preset } = await r.json(); const pf = preset?.prefill ?? {};
          opts.onReset?.();
          const ex: any = { id: 'preset-' + rp, title: preset?.label ?? rp, toolId: preset?.toolId, preset: pf.preset ?? rp, types: pf.types ?? [rp], prompt: pf.prompt ?? '', video: pf.video ?? undefined, image: pf.image ?? undefined, refs: pf.refs ?? [], prefill: pf };
          opts.onExample?.(ex);
          if (opts.onVideo && ex.video) { const m = await readVideo(await toFile(ex.video, ex.video.split('/').pop()!)); opts.onVideo({ ...m, trimmed: m.duration > LIMITS.maxSec }); }
          const img = ex.image ?? ex.refs?.[0];
          if (opts.onImage && img) { const f = await toFile(img, img.split('/').pop()!); opts.onImage({ file: f, url: URL.createObjectURL(f) }); }
          if (opts.onRefs && ex.refs?.length) { const fs = await Promise.all(ex.refs.map((u: string) => toFile(u, u.split('/').pop()!))); opts.onRefs(fs.map(file => ({ file, url: URL.createObjectURL(file) }))); }
          toast(`Recreating “${ex.title}”`);
        } catch (e: any) { toast(`Couldn't load that preset: ${e.message}`, 'error'); }
      })();
      return;
    }
    const ru = q.get('refUrl');
    if (ru && (/^\/(files|samples)\/[\w.-]+$/.test(ru) || (isBundledInputUrl(ru) && /\.(png|jpe?g|webp|gif|mp4|webm|mov|m4v)$/i.test(ru)))) { // the viewer's input photos/clips, including shipped examples; existing upload guards remain unchanged
      /* also an upload's "Use in…" (Image / Video tab Uploads chip, 2026-10-26): as=start = the start image; a clip goes to the video slot */
      const asStart = q.get('as') === 'start'; const isVid = /\.(mp4|webm|mov|m4v)$/i.test(ru);
      if (isVid && !opts.onVideo) return; /* a clip is for the page part that takes one (the Video bar's slot): leave the link to it */
      q.delete('refUrl'); if (q.get('as') === 'start') q.delete('as'); history.replaceState(history.state, '', location.pathname + (q.toString() ? `?${q}` : ''));
      (async () => { try { const f = await toFile(ru, ru.split('/').pop() || (isVid ? 'input.mp4' : 'input.png')); const r = { file: f, url: URL.createObjectURL(f) };
        if (isVid && opts.onVideo) { const m = await readVideo(f); opts.onVideo({ ...m, trimmed: m.duration > LIMITS.maxSec }); toast('Clip loaded from your uploads'); return; }
        if (asStart && opts.onImage) { opts.onImage(r); toast('Image loaded as the start frame'); return; }
        if (opts.onRefs) opts.onRefs([r], { handoff: true }); else if (opts.onImage) opts.onImage(r); } /* the page says where it went ("Added as Photo") */
        catch (e: any) { toast(`Couldn’t bring in that image (${e.message}). Upload it instead.`, 'error'); } })();
      return;
    }
    const smp = q.get('sample');
    if (smp) { // Library filler tile ("Ruined city"…): use our own sample as the source — clip for video tools, poster frame for image tools
      q.delete('sample'); history.replaceState(history.state, '', location.pathname + (q.toString() ? `?${q}` : ''));
      const ex = EXAMPLES.find(e => e.id === smp); if (!ex) { toast('That sample is no longer available.', 'warn'); return; }
      (async () => {
        try {
          if (opts.onVideo) { const m = await readVideo(await toFile(ex.src, ex.src.split('/').pop()!)); opts.onVideo({ ...m, trimmed: m.duration > LIMITS.maxSec }); }
          else if (opts.onImage) { const f = await atLeast(await toFile(ex.poster, ex.poster.split('/').pop()!), MIN_FRAME_PX); opts.onImage({ file: f, url: URL.createObjectURL(f) }); }
          toast(`Using “${ex.title}” as your ${opts.onVideo ? 'source clip' : 'start frame'}`);
        } catch (e: any) { toast(`Couldn't load that sample: ${e.message}`, 'error'); }
      })();
      return;
    }
    const exId = q.get('example');
    if (exId) { // "Recreate": prefill preset/types, prompt, source and references from a server example
      q.delete('example'); history.replaceState(history.state, '', location.pathname + (q.toString() ? `?${q}` : ''));
      (async () => {
        try {
          const ex = (await listExamples()).find(e => e.id === exId); if (!ex) { toast('That example is no longer available.', 'warn'); return; }
          opts.onReset?.();
          opts.onExample?.(ex);
          if (opts.onVideo && ex.video) { const m = await readVideo(await toFile(ex.video, ex.video.split('/').pop()!)); opts.onVideo({ ...m, trimmed: m.duration > LIMITS.maxSec }); }
          const img = ex.image ?? ex.refs?.[0];
          if (opts.onImage && img) { const f = await toFile(img, img.split('/').pop()!); opts.onImage({ file: f, url: URL.createObjectURL(f) }); }
          if (opts.onRefs && ex.refs?.length) { const fs = await Promise.all(ex.refs.map(u => toFile(u, u.split('/').pop()!))); opts.onRefs(fs.map(file => ({ file, url: URL.createObjectURL(file) }))); }
          toast(`Recreating “${ex.title}”`);
        } catch (e: any) { toast(`Couldn't load example: ${e.message}`, 'error'); }
      })();
      return;
    }
    const rcp = q.get('recipe');
    if (rcp && opts.onExample) { // "Make this" (/r): the recipe's prompt, model and settings in the bar; nothing runs until Generate
      q.delete('recipe'); history.replaceState(history.state, '', location.pathname + (q.toString() ? `?${q}` : ''));
      const d = decodeRecipe(rcp); if (!d.ok) { toast(d.error, 'error'); return; }
      opts.onReset?.(); /* a recipe never has files: start from an empty bar */
      opts.onExample(recipeExample(d.recipe, pageToolId()));
      toast(d.recipe.prompt ? 'Recipe loaded. Change anything you like, then press Generate.' : 'Recipe loaded (the sharer kept the prompt private). Write yours, then press Generate.');
      return;
    }
    const pText = q.get('prompt'); const st = urlSettings(q);
    if ((pText || st) && opts.onExample) { // a guide's "Try it" (/learn books, 2026-10-24) and Explore links: the prompt and ?aspect= / ?duration= go in the bar (the model comes from ?model=); nothing runs until Generate
      ['prompt', 'aspect', 'duration'].forEach(k => q.delete(k)); history.replaceState(history.state, '', location.pathname + (q.toString() ? `?${q}` : ''));
      const text = (pText ?? '').slice(0, 4000);
      opts.onExample({ id: 'guide-prompt', title: 'guide prompt', toolId: pageToolId(), prompt: text, types: [], refs: [],
        ...(st ? { prefill: { quality: '', provider: null, toggles: st, video: null, image: null, refs: [], prompt: text, promptEnabled: true, preset: null, types: null, durationSec: Number(st.duration) || 0 } } : {}) } as any);
      if (pText) toast('Example prompt added. Change it if you like, then press Generate.');
      return;
    }
    if (!from) return;
    const outIx = Number(q.get('out') || 0); const asStart = q.get('as') === 'start';
    q.delete('from'); q.delete('out'); q.delete('as'); history.replaceState(history.state, '', location.pathname + (q.toString() ? `?${q}` : ''));
    (async () => {
      try {
        const j = await getJob(from); const out = j.outputs[outIx] ?? j.outputs[0];
        const refUrls: string[] = j.input?.refUrls ?? [];
        if (opts.onVideo && out) {
          const m = await readVideo(await toFile(out.url, `${j.id}-${out.label}.${/\.(webm|mov)($|\?)/i.exec(out.url)?.[1]?.toLowerCase() ?? 'mp4'}`));
          opts.onVideo({ ...m, trimmed: m.duration > LIMITS.maxSec });
        }
        if (opts.onImage) {
          // "Turn to video" (as=start): the finished image itself becomes the start frame.
          const outImg = asStart && out && /\.(png|jpe?g|webp)(\?|$)/i.test(out.url) ? out.url : null;
          const img = outImg ?? j.input?.imageUrl ?? refUrls[0];
          if (img) { const f = await toFile(img, img.split('/').pop()!); opts.onImage({ file: f, url: URL.createObjectURL(f) }); }
          else toast('That asset has no image to send; pick a video tool instead.', 'warn');
        }
        if (opts.onRefs && refUrls.length) {
          const fs = await Promise.all(refUrls.slice(0, LIMITS.maxRefs).map(u => toFile(u, u.split('/').pop()!)));
          opts.onRefs(fs.map(file => ({ file, url: URL.createObjectURL(file) })));
        }
        toast(`Loaded from ${j.toolId} · ${j.id}`);
      } catch (e: any) { toast(`Couldn't load asset: ${e.message}`, 'error'); }
    })();
    };
    run();
    /* A hand-off to the page that is already open (the result viewer's Recreate / Reference / Edit with a prompt on Create Image)
       arrives by navigate(), not by a mount: run again when the same path gets a prefill query. */
    const path0 = location.pathname;
    const again = () => { if (location.pathname === path0 && /[?&](fromJob|recreate|recreatePreset|example|sample|from|refUrl|prompt|aspect|duration|recipe|attach)=/.test(location.search)) run(); };
    addEventListener('popstate', again); return () => removeEventListener('popstate', again);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { frameHandoff: frame.state, cancelFrameHandoff: frame.cancel, frameImageReady: frame.ready, retryFrameHandoff: frame.retry };
}
