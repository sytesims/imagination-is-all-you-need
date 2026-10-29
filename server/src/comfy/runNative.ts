/**
 * Run a job on a native ComfyUI (local install, a GPU box, or readiness/stub). Uploads inputs, submits each pass,
 * maps websocket progress to job.progress, downloads outputs, then concat / crossfade / splice + source-audio mux.
 * Failures fail the job (auto-refund via the queue); no silent mock fallback on this path.
 */
import path from 'node:path';
import { copyFile, writeFile, mkdir, readFile } from 'node:fs/promises';
import { translateText } from '../translate.js';
import { transcribe } from '../voiceRunner.js';
import type { Job } from '../jobs.js';
import { config, DATA_DIR } from '../config.js';
import { env } from '../env.js';
import { runFfmpeg, remuxAudio, flattenAlpha } from '../ffmpeg.js';
import { ComfyNative, ComfyTimeoutError } from './native.js';
import { buildPlan, type Plan, type Prep } from './plans.js';
import { blendArgs } from './restyle.js';
import { recordSubmittedPass } from '../workflowExport.js';
import { putPreview, previewMethod } from './preview.js';
import { notePlanPrompts } from '../jobSource.js';
import { nativeOutputItems } from './nativeImageOutputs.js';

/** native when OPENHIGGSFIELD_COMFY_API=native, or (unset) when COMFY_BASE_URL is a local / private host. */
export function nativeMode() {
  const v = env('COMFY_API'); if (v) return v === 'native';
  try { const h = new URL(config.comfyBaseUrl).hostname; return /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/.test(h) || h.endsWith('.local'); } catch { return false; }
}
/** Comfy Cloud v2 (transport): how long one job may take, the step-ETA estimate × 4, never under OPENHIGGSFIELD_COMFY_TIMEOUT_MS (default 30 min). */
export const execTimeoutMs = (est: { seconds?: number | null; high?: number | null } | null | undefined) =>
  Math.max(config.jobTimeoutMs, Math.round((Number(est?.high ?? est?.seconds) || 0) * 4 * 1000));
/** Local / native ComfyUI: the HARD CAP on one prompt's running time (the clock starts when it leaves ComfyUI's queue, native.ts). A slow but steady run
 *  is never stopped before it: max(60 min, 4 × this computer's calibrated estimate for this workflow, the high end when known). An uncalibrated guess
 *  (calibrating run, or a published 'reported' figure) is not used. OPENHIGGSFIELD_COMFY_TIMEOUT_MS overrides it exactly. Stalls are caught separately
 *  (config.comfyStallMs: no progress at all for 10 min). */
export const localCapMs = (est: { seconds?: number | null; high?: number | null; calibrating?: boolean; source?: string } | null | undefined) =>
  config.comfyHardCapOverrideMs ?? Math.max(config.comfyHardCapFloorMs, est && !est.calibrating && est.source !== 'reported' ? Math.round((Number(est.high ?? est.seconds) || 0) * 4 * 1000) : 0);
/** Optional capture dir for readiness/graph: every patched graph sent is written here (OPENHIGGSFIELD_CAPTURE_GRAPHS). */
const CAPTURE = env('CAPTURE_GRAPHS') || '';

/** A free step on this computer before anything is sent (transcribe / translate / ffmpeg) failed: the job fails with its own words, not as a ComfyUI failure. */
export class PrepError extends Error {}
async function ff(args: string[], what: string) { const c = await runFfmpeg(args); if (c !== 0) throw new Error(`ffmpeg ${what} failed (exit ${c})`); }
async function doPrep(p: Prep, outs: string[][], graph: Record<string, any> = {}, job?: Job) {
  if (p.kind === 'speech') { const tr = await transcribe(p.src); if (!tr.text.trim()) throw new Error('No speech was found in the clip to translate'); const t = await translateText(tr.text, p.translateTo, tr.language || 'en'); graph[p.node].inputs[p.field] = t;
    if (job) job.input.translatedText = { text: t, language: p.translateTo }; /* captions.ts: the result's subtitles use these exact words */ return; }
  if (p.kind === 'textFromPass') { const f = outs[p.pass]?.[0]; if (!f) throw new Error(`pass ${p.pass} produced no text`); let t = (await readFile(f, 'utf8')).trim(); if (p.translateTo) t = await translateText(t, p.translateTo); graph[p.node].inputs[p.field] = t; return; }
  if (p.kind === 'fps' && p.frames) await ff(['-y', ...(p.start ? ['-ss', String(p.start)] : []), ...(p.seconds ? ['-t', String(p.seconds)] : []), '-i', p.src, '-vf', `fps=${p.fps},scale=${p.width}:${p.height}:flags=lanczos,setsar=1,tpad=stop_mode=clone:stop=-1`, '-frames:v', String(p.frames), ...(p.audio ? ['-c:a', 'aac', '-b:a', '192k'] : ['-an']), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', p.out], 'fps/resize/pad');
  else if (p.kind === 'fps') await ff(['-y', ...(p.start ? ['-ss', String(p.start)] : []), '-i', p.src, ...(p.seconds ? ['-t', String(p.seconds)] : []), '-vf', `fps=${p.fps},scale=${p.width}:${p.height}:flags=lanczos,setsar=1`, ...(p.audio ? ['-c:a', 'aac', '-b:a', '192k'] : ['-an']), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', p.out], 'fps/resize');
  else if (p.kind === 'frame') await ff(['-y', ...(p.at === 'last' ? ['-sseof', '-0.1'] : ['-ss', String(p.at)]), '-i', p.src, '-frames:v', '1', ...(p.width ? ['-vf', `scale=${p.width}:${p.height}`] : []), '-update', '1', p.out], 'frame grab');
  else { const src = outs[p.pass]?.[0]; if (!src) throw new Error(`pass ${p.pass} produced no output`); await ff(['-y', '-sseof', '-0.1', '-i', src, '-frames:v', '1', '-update', '1', p.out], 'last frame'); }
}
/** What runNative needs from a ComfyUI: the local/native client (ComfyNative) or Comfy Cloud v2 (cloudV2.ts). */
export interface ComfyTransport { upload(file: string): Promise<any>; run: ComfyNative['run']; download(o: any, dest: string): Promise<string> }
async function substitute(g: any, c: ComfyTransport, cache: Map<string, any>): Promise<any> {
  if (Array.isArray(g)) return Promise.all(g.map((x) => substitute(x, c, cache)));
  if (g && typeof g === 'object') {
    if (typeof g.__file === 'string') { if (!cache.has(g.__file)) cache.set(g.__file, await c.upload(g.__file)); return cache.get(g.__file); }
    const o: any = {}; for (const [k, v] of Object.entries(g)) o[k] = await substitute(v, c, cache); return o;
  }
  return g;
}
const probeFps = async (file: string) => { try { const { execFileSync } = await import('node:child_process'); const r = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', file]).toString().trim(); const [a, b] = r.split('/').map(Number); return b ? a / b : a; } catch { return 30; } };

/** build: B2, the Comfy Cloud runner passes buildCloudPlan (cloudWorkflows.ts) so each pass runs its workflows/cloud graph. */
export async function runNative(job: Job, transport?: ComfyTransport, build: (j: any, o: { srcFps?: number }) => Plan = buildPlan) {
  const c: ComfyTransport = transport ?? new ComfyNative(config.comfyBaseUrl, config.comfyApiKey ? { Authorization: `Bearer ${config.comfyApiKey}` } : {});
  job.status = 'running'; job.queuePos = 0; job.stage = 'uploading'; job.progress = 0; job.progressKind = 'indeterminate'; job.steps = null; job.liveStage = null;
  const plan: Plan = build(job as any, { srcFps: job.input.videoPath ? await probeFps(job.input.videoPath) : undefined });
  job.input.comfyPlan = { passes: plan.passes.map((p) => ({ label: p.label, workflow: p.workflow })), post: plan.post.kind, notes: plan.notes }; notePlanPrompts(job, plan);
  const local = !transport && String(job.route ?? '').startsWith('local:'); const S = local ? await import('../hardware/stages.js') : null;
  if (S) await S.prePhase(job, false); // HW-SHAPES Q4: downloadWeights=1 → downloading_model through the shared downloader (never automatic)
  const variant = local && typeof job.input.variantId === 'string' ? (await import('../hardware/requirements.js')).findVariant(job.input.variantId) : null;
  const cache = new Map<string, any>(); const outs: string[][] = []; const outLabels: string[][] = []; const n = plan.passes.length; let stepT0: number | undefined;
  // Step-ETA learning (stepEta.ts): local runs only. est = this computer's learned load + steps × seconds per step + post for this exact workflow.
  const SE = local ? await import('../stepEta.js') : null; const hk = SE ? (await import('../hardware.js')).hwKeyOf() : '';
  const timed: import('../stepEta.js').PassTiming[] = []; let est: import('../stepEta.js').EtaRange | null = null; const runT0 = Date.now(); let sig: string | null = null;
  for (const [k, pass] of plan.passes.entries()) {
    if ((job.status as string) === 'canceled') return;
    for (const p of pass.prep ?? []) await doPrep(p, outs, pass.graph, job).catch((e) => { throw new PrepError(e instanceof Error ? e.message : String(e)); });
    const graph = await substitute(pass.graph, c, cache);
    (await import('../stepEta.js')).applyGgufVariant(graph, variant); // Q7 GGUF drop-in
    if (SE && k === 0) { // the estimate for this run, now (warm / cold as things stand); the job notes when this run is the calibration run
      const reported = job.etaRange?.source === 'reported' ? job.etaRange.seconds : null;
      const feats = SE.featuresOfPlan(plan.passes.map((p, j) => ({ workflow: p.workflow, graph: j === 0 ? graph : SE.applyGgufVariant(structuredClone(p.graph), variant) }))); sig = feats ? SE.keysOf(feats).modelsSig : null;
      est = SE.estimateFor(feats, hk, { reportedSeconds: reported });
      job.etaRange = est; job.calibrating = est.calibrating; if (est.seconds && est.source !== 'reported') job.eta = est.seconds; }
    recordSubmittedPass(job, k, pass, graph, transport ? 'comfy-cloud' : 'local'); // Get workflow (workflowExport.ts): the exact graph sent
    if (CAPTURE) { await mkdir(CAPTURE, { recursive: true }); await writeFile(path.join(CAPTURE, `${job.id}-p${k}.json`), JSON.stringify({ jobId: job.id, toolId: job.toolId, provider: job.provider, pass: k, label: pass.label, workflow: pass.workflow, output: pass.output, expect: pass.expect, input: Object.fromEntries(Object.entries(job.input).filter(([x]) => !/Path$|Paths$|comfyPlan/.test(x))), graph }, null, 1)); }
    job.stage = n > 1 ? `generating ${k + 1}/${n}` as any : 'generating' as any;
    const capMs = transport ? execTimeoutMs(est) : localCapMs(est);
    const res = await c.run(graph, {
      timeoutMs: capMs, stallMs: config.comfyStallMs, isCanceled: () => (job.status as string) === 'canceled',
      // model loading with known bytes counts as progress while the bytes move (hardware/stages.ts stageDetail)
      activity: () => job.stageDetail ? [job.stageDetail.stage, job.stageDetail.bytesDone, job.stageDetail.downloadedBytes ?? null] : null,
      // Live sampler previews on a native ComfyUI (local / own GPU box): latest frame per job, in memory (comfy/preview.ts); Comfy Cloud sends none.
      ...(!transport ? { previewMethod: previewMethod(), onPreview: (f: import('./native.js').NativePreview) => { if ((job.status as string) === 'running' && putPreview(job.id, f)) job.updatedAt = Date.now(); } } : {}),
      onSubmitted: (id) => { (job.requestIds ??= []).push(id);
        // Item 10: remember the prompt on a local / remote ComfyUI so a server restart can reconnect (comfy/resume.ts). Comfy Cloud has cloudJobId instead.
        if (!transport) { const outNodes = [pass.output, ...(pass.extraOutputs ?? []).map((e) => e.node)];
          const labels = outNodes.map((_, j) => j === 0 ? (plan.labels?.[k] ?? pass.label) : pass.extraOutputs![j - 1].label);
          const resumable = n === 1 && plan.post.kind === 'each' && !plan.postFps && !plan.muxOnto && !plan.muxSourceAudio && plan.outKind !== 'video';
          job.comfyPrompt = { id, base: config.comfyBaseUrl, pass: k, passes: n, outputs: outNodes, labels, resumable, submittedAt: Date.now(), capMs }; } },
      onProgress: (p) => { if ((job.status as string) !== 'running') return;
        if (p.phase) { // shared progress (progress.ts): ComfyUI's own queue → load → steps → finishing
          const q = p.phase === 'queued' ? p.queuePos ?? (job.liveStage === 'queued' ? job.queuePos : 0) : 0;
          if (job.liveStage !== p.phase || job.queuePos !== q) job.updatedAt = Date.now(); job.liveStage = p.phase; job.queuePos = q;
          if (p.phase !== 'queued') job.renderStartedAt ??= Date.now(); } // render time starts here, never in a queue (shared/jobTiming.ts)
        // before the first step: the learned load time counts down (an estimate during loading instead of nothing)
        if (p.known === false && k === 0 && est?.seconds && est.source !== 'reported') job.eta = Math.max(1, Math.round(est.seconds - (Date.now() - runT0) / 1000));
        if (S) { const ld = !!p.node && /Loader/.test(String(graph[p.node]?.class_type ?? '')); S.loaderStage(job, ld); job.stage = ld ? 'loading_model' as any : n > 1 ? `generating ${k + 1}/${n}` as any : 'generating' as any; } // B4
        // Item 5: only real sampler steps move the percent (no node-count guess); before the first step the job stays indeterminate.
        if (p.known === false) return;
        job.progressKind = 'steps'; if (p.steps) job.steps = p.steps;
        const now = Date.now(); if (stepT0 == null && SE && sig) SE.noteLoaded(hk, sig, now); stepT0 ??= now; const pct = Math.min(99, Math.floor(((k + p.percent / 100) / n) * 100));
        job.progress = Math.max(job.progress, pct);
        // Honest ETA from the observed step rate (seconds left = elapsed since the first step × remaining / done); none until 5% is done.
        const frac = job.progress / 100; if (frac >= 0.05 && now > stepT0) job.eta = Math.max(1, Math.round(((now - stepT0) / 1000) * (1 - frac) / frac + (est?.postSec ?? 0)));
        else if (est?.secondsPerStep && est.steps && est.source !== 'reported') job.eta = Math.max(1, Math.round(est.secondsPerStep * est.steps * (1 - frac) + (est.postSec ?? 0))); },
    });
    if (plan.outKind === 'image' && (job.status as string) === 'canceled') return;
    if (SE) timed.push({ workflow: pass.workflow, graph, timing: res.timing ?? null });
    const files: string[] = []; const labels: string[] = [];
    for (const [nodeIndex, node] of [pass.output, ...(pass.extraOutputs ?? []).map((e) => e.node)].entries()) {
      const o = res.outputs[node]?.[0]; if (!o) throw new Error(`ComfyUI returned no output on node ${node} (${pass.workflow})`);
      const label = nodeIndex === 0 ? (plan.labels?.[k] ?? pass.label) : pass.extraOutputs![nodeIndex - 1].label;
      if ((o as any).text != null) { const tf = path.join(DATA_DIR, `${job.id}-p${k}-${node}.txt`); await writeFile(tf, (res.outputs[node] as any[]).map((x) => x.text).join('\n')); files.push(tf); labels.push(label); continue; }
      for (const item of nativeOutputItems(res.outputs[node], plan.outKind === 'image', label)) {
        if (plan.outKind === 'image' && (job.status as string) === 'canceled') return;
        files.push(await c.download(item.output, path.join(DATA_DIR, `${job.id}-p${k}-${node}${item.suffix}${path.extname(item.output.filename) || '.bin'}`)));
        labels.push(item.label);
      }
    }
    if (plan.outKind === 'image' && (job.status as string) === 'canceled') return;
    outs.push(files); outLabels.push(labels);
    for (const diagnostic of pass.diagnostics ?? []) {
      const o = res.outputs[diagnostic.node]?.[0];
      try {
        if (!o) throw new Error('no preview returned');
        const dest = path.join(DATA_DIR, `${job.id}-diagnostic-p${k}-${diagnostic.node}${path.extname(o.filename) || '.mp4'}`);
        await c.download(o, dest);
        job.diagnostics = [...(job.diagnostics ?? []).filter(d => d.pass !== k || d.node !== diagnostic.node),
          { ...diagnostic, jobId: job.id, requestId: res.promptId, route: job.route ?? null, pass: k, url: `/files/${path.basename(dest)}` }];
      } catch { (job.warnings ??= []).push(`${diagnostic.label}: diagnostic preview unavailable; generated result is unaffected.`); }
    }
  }
  job.stage = 'muxing' as any; job.progress = Math.max(job.progress, 95); job.liveStage = 'finishing';
  const finals: { label: string; file: string }[] = [];
  const out = (i: number, ext: string) => path.join(DATA_DIR, `${job.id}-out${i}${ext}`);
  const ext0 = path.extname(outs[0][0]) || '.mp4';
  if (plan.post.kind === 'each') { const only = plan.post.only; outs.forEach((fs, k) => (only && !only.includes(k) ? undefined : fs.forEach((f, j) => finals.push({ label: outLabels[k][j], file: f })))); }
  else if (plan.post.kind === 'concat') { const list = path.join(DATA_DIR, `${job.id}-concat.txt`); await writeFile(list, outs.map((f) => `file '${f[0]}'`).join('\n')); const o = out(0, '.concat.mp4'); await ff(['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', ...(plan.post.audio ? ['-c:a', 'aac'] : ['-an']), o], 'concat'); finals.push({ label: plan.labels?.[0] ?? 'Result', file: o }); }
  else if (plan.post.kind === 'concatGroups') {
    const audio = plan.post.audio;
    for (const [gi, grp] of plan.post.groups.entries()) {
      const o = out(gi, '.shot.mp4'); const files = grp.passes.map((k) => outs[k][0]);
      if (files.length === 1 && audio) { await ff(['-y', '-i', files[0], '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', o], 'shot'); }
      else {
        const list = path.join(DATA_DIR, `${job.id}-g${gi}.txt`); await writeFile(list, files.map((f) => `file '${f}'`).join('\n'));
        await ff(['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', ...(audio ? ['-c:a', 'aac'] : ['-an']), o], 'shot concat');
      }
      finals.push({ label: grp.label, file: o });
    }
  }
  else if (plan.post.kind === 'extend') { // LTX-2.5 Extend: the generated clip joined onto the conformed source (guide copies dropped, crossfade, sound continued)
    const o = out(0, '.extend.mp4'); const { joinExtension } = await import('./ltx25Extend.js'); const { BITRATES } = await import('../tools/h3/videoCaps.js');
    await joinExtension(plan.post.source ?? job.input.videoPath, outs[0][0], o, plan.post.plan, { audio: job.input.audio !== false, crf: job.input.bitrate === 'high' ? BITRATES[1].crf : 18, maxGenFrames: plan.post.maxGenFrames }); finals.push({ label: plan.post.label, file: o }); }
  else if (plan.post.kind === 'audioConcat') { const o = out(0, '.joined.wav'); const ins = outs.flatMap((f) => ['-i', f[0]]);
    await ff(['-y', ...ins, '-filter_complex', `${outs.map((_, k) => `[${k}:a]`).join('')}concat=n=${outs.length}:v=0:a=1[a]`, '-map', '[a]', o], 'audio join'); finals.push({ label: plan.labels?.[0] ?? 'Result', file: o }); }
  else if (plan.post.kind === 'xfade') { const o = out(0, '.xfade.mp4'); await ff(blendArgs(outs.map((f) => f[0]), plan.post.chunks, o), 'crossfade'); finals.push({ label: 'Result', file: o }); }
  else if (plan.post.kind === 'talkJoin') { const o = out(0, '.talk.mp4'); const { talkJoinArgs } = await import('./infiniteTalkCloud.js'); // Talking Video: parts + crossfades + the full speech
    await ff(talkJoinArgs(outs.map((f) => f[0]), plan.post.parts, plan.post.audio, o, plan.post.fade, plan.post.fps), 'talking video join'); finals.push({ label: plan.labels?.[0] ?? 'Talking video', file: o }); }
  else if (plan.post.kind === 'splice') {
    const { ranges, fps, width, height } = plan.post; const src = job.input.videoPath as string; const parts: string[] = []; let t = 0; const norm = `fps=${fps},scale=${width}:${height}:flags=lanczos,setsar=1,format=yuv420p`;
    const sorted = ranges.map((r, k) => ({ ...r, k })).sort((a, b) => a.start - b.start);
    for (const r of sorted) {
      if (r.start > t + 0.01) { const p = out(parts.length, '.gap.mp4'); await ff(['-y', '-ss', String(t), '-i', src, '-t', String(r.start - t), '-vf', norm, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', p], 'splice gap'); parts.push(p); }
      const p = out(parts.length, '.seg.mp4'); await ff(['-y', '-i', outs[r.k][0], '-t', String(r.end - r.start), '-vf', norm, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', p], 'splice seg'); parts.push(p); t = r.end;
    }
    const dur = Number(job.input.duration) || t; if (dur > t + 0.01) { const p = out(parts.length, '.gap.mp4'); await ff(['-y', '-ss', String(t), '-i', src, '-t', String(dur - t), '-vf', norm, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', p], 'splice tail'); parts.push(p); }
    const list = path.join(DATA_DIR, `${job.id}-splice.txt`); await writeFile(list, parts.map((f) => `file '${f}'`).join('\n')); const o = out(0, '.splice.mp4');
    await ff(['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', o], 'splice concat'); finals.push({ label: plan.labels?.[0] ?? 'Multi-angle cut', file: o });
    for (let e = 0; e < plan.post.extraEach; e++) finals.push({ label: plan.labels?.[1 + e] ?? `Angle ${e + 1}`, file: outs[ranges.length + e][0] });
  }
  job.outputs = [];
  if (plan.postFps) for (const f of finals) { // RIFE gives an integer multiple (e.g. 25×3=75); resample to the exact target rate
    const o = f.file.replace(/(\.[a-z0-9]+)?$/i, `.${plan.postFps}fps.mp4`); await ff(['-y', '-i', f.file, '-vf', `fps=${plan.postFps}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'copy', o], 'fps resample'); f.file = o;
  }
  if (plan.muxOnto) for (const f of finals) { // new voice / sound onto the source video
    if (!/\.(wav|flac|mp3|m4a|ogg|opus|aac)$/i.test(f.file)) continue; const o = f.file.replace(/\.[a-z0-9]+$/i, '.muxed.mp4'); const v = plan.muxOnto.video;
    await ff(plan.muxOnto.mix === 'blend'
      ? ['-y', '-i', v, '-i', f.file, '-filter_complex', '[0:a]volume=0.25[a0];[a0][1:a]amix=inputs=2:duration=first:dropout_transition=0[a]', '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', o]
      : ['-y', '-i', v, '-i', f.file, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', o], 'audio mux'); f.file = o;
  }
  for (const [i, f] of finals.entries()) {
    if (plan.outKind === 'image' && (job.status as string) === 'canceled') return;
    const isVid = /\.(mp4|webm|mov|mkv)$/i.test(f.file); const ext = isVid ? '.mp4' : path.extname(f.file) || ext0; const dest = out(i, ext);
    if (isVid && plan.muxSourceAudio && job.input.videoPath && job.input.hasAudio !== false) await remuxAudio(f.file, job.input.videoPath, dest);
    else if (isVid && plan.outKind === 'video' && job.input.keepAudio === false) await remuxAudio(f.file, f.file, dest, false);
    else if (isOpaqueImage(job, f.file)) await flattenAlpha(f.file, dest); // Item 11: photo outputs are stored fully opaque (alpha 255)
    else if (f.file !== dest) await copyFile(f.file, dest);
    job.outputs.push({ label: job.input.draft ? `${f.label} (draft 480p)` : f.label, url: `/files/${path.basename(dest)}` });
  }
  if (plan.outKind === 'image' && (job.status as string) === 'canceled') return;
  job.resultUrl = job.outputs[0]?.url ?? null; job.stage = 'done'; job.status = 'done'; job.progress = 100; job.eta = 0; job.comfyPrompt = null;
  if (SE) { try { const row = SE.recordRun(job, hk, timed, Date.now()); if (row) job.etaTimed = { loadSec: row.loadSec, loadKind: row.loadKind, sampleSec: row.sampleSec, postSec: row.postSec, steps: row.steps }; } catch (e) { console.warn('[openhiggsfield] step ETA not recorded:', e instanceof Error ? e.message : e); } }
}
/** Image outputs that should be fully opaque: PNG / WebP from any tool except ones meant to output transparency (Remove BG transparent = input.alpha). */
export const isOpaqueImage = (job: Job, file: string) => /\.(png|webp)$/i.test(file) && !job.input?.alpha && !job.input?.keepAlpha;

/** How long a failed-by-timeout (or restart) local job is watched for a late result (OPENHIGGSFIELD_LATE_WATCH_MS, default 2 h). */
export const LATE_WATCH_MS = () => Number(env('LATE_WATCH_MS')) || 2 * 3600_000;
/** runNative with failures mapped onto the job (the queue then auto-refunds). */
export async function runNativeSafe(job: Job) {
  try { await runNative(job); }
  catch (e) {
    if ((job.status as string) === 'canceled') return;
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof ComfyTimeoutError) { // stall / hard cap: plain card text (settle adds "Nothing was charged."); reasonCode drives the card (failureReasons.ts)
      job.status = 'failed'; job.errorType = 'timeout'; job.reasonCode = e.kind === 'stall' ? 'local_stalled' : 'local_too_long';
      job.error = e.kind === 'stall' ? `Stopped: no progress for ${e.minutes} min.` : `Took longer than ${e.minutes} min.`;
      // Our prompt was not stopped (ComfyUI no longer listed it, or couldn't be reached): it may still finish, so the late-result sweeper watches it
      // (comfy/lateRescue.ts). Interrupted / removed prompts never finish, so nothing is watched.
      const cp = job.comfyPrompt;
      if (cp?.id === e.promptId && cp.resumable && (e.cancel === 'not_in_queue' || e.cancel === 'unreachable')) job.lateWatch = { since: Date.now(), until: Date.now() + LATE_WATCH_MS(), why: e.kind };
      else job.comfyPrompt = cp ? { ...cp, resumable: false } : cp;
      console.error(`[openhiggsfield] native comfy gave up on ${job.id}: ${msg}`); return;
    }
    if (e instanceof PrepError) { job.status = 'failed'; job.errorType = 'temporary'; job.error = msg; console.error(`[openhiggsfield] prep failed for ${job.id}: ${msg}`); return; }
    const outage = /ECONNREFUSED|fetch failed|ENOTFOUND|→ 5\d\d/.test(msg);
    job.status = 'failed'; job.errorType = outage ? 'provider_outage' : 'temporary';
    job.error = outage ? `Local ComfyUI is unreachable (${config.comfyBaseUrl}).` : `ComfyUI run failed: ${msg}`;
    console.error(`[openhiggsfield] native comfy failed for ${job.id}: ${msg}`);
  }
}
