import { stat, copyFile, writeFile } from 'node:fs/promises';
import { mockLayer, mockLayerSize } from './mockLayers.js';
import { writeLayerPoster } from '../layerPoster.js';
import path from 'node:path';
import { SHOT_MOCK_VF } from './shots.js';
import type { Job } from '../jobs.js';
import type { ToolDef } from './types.js';
import { DATA_DIR, SAMPLES_DIR, WEB_PUBLIC_DIR } from '../config.js';
import { SAMPLE_CLIPS, SAMPLE_STILLS } from '../shared/featured.js';
import { demoMediaOf, demoKindOf, demoLabel, type DemoMedia } from '../shared/demoMedia.js';
import { LIMITS, probe, RESOLUTIONS, trim } from '../media.js';
import { runFfmpeg } from '../ffmpeg.js';
import { refundPartial, creditsBackNote } from '../ledger.js';
import { env } from '../env.js';
import { teamMode } from '../billingMode.js';
import { imageMentions, validateMentions } from '../shared/mentions.js';
import { priceOf, outputMegapixels, priceMode, promptBytesFor, DRAFT_FACTOR as DF } from '../shared/pricing.js';
import { upscaleOutMegapixels } from '../shared/imageUpscale.js';
import { routerRefImages } from '../routing/routerModels.js';
import { clipTooShortText, clipTooFewPixelsText } from '../shared/clipLimits.js';

/** RTX 5090 estimates from CLEANROOM-SPEC Builder Q&A #10 (community benchmarks), GPU seconds per source second. */
// Wan 2.2 Animate: 15 s ≈ 4–6 min @480p, 10–15 min @720p. 1080p = our extrapolation ("slow / upscale pass").
export const GPU_WAN_ANIMATE = { '480p': 20, '720p': 50, '1080p': 100 };
// LTX-2 FP8: 10 s @720p ≈ 210 s. 480p/1080p = our extrapolation.
export const GPU_LTX = { '480p': 10, '720p': 21, '1080p': 45 };
export const GPU_DEFAULT = GPU_WAN_ANIMATE;
/** `@image1` / `@img1` mentions in a prompt → 1-based reference indexes. */
export const mentionsOf = (prompt: string) => imageMentions(prompt);
/** Mock-only: `simulate=<type>` makes a run fail that way, so the UI states can be QA'd. */
export const SIMULATE = ['temporary', 'provider_outage', 'ip', 'nsfw'];
/**
 * Mock force-fail switch. Any of: form field `simulate=<type>`, a prompt token `[mockfail]` / `[mockfail:<type>]`,
 * or env OPENHIGGSFIELD_MOCK_FAIL=1|<type> (applies to every job). `1`/bare token → 'temporary'. Mock backend only.
 */
export function mockFailOf(fields: Record<string, string>): string {
  const norm = (v?: string) => (!v ? '' : v === '1' || v === 'true' ? 'temporary' : SIMULATE.includes(v) ? v : '');
  const tok = /\[mockfail(?::([a-z_]+))?\]/i.exec(fields.prompt || '');
  return norm(fields.simulate) || (tok ? norm(tok[1]?.toLowerCase() || '1') : '') || norm(env('MOCK_FAIL'));
}
/** Draft = 480p, fewer steps → ~30% of the GPU time. */
export const DRAFT_FACTOR = DF;

/** Seed rule [R14]: a missing/blank/invalid seed becomes a random int in 0..2,147,483,647 (returned to the client and shown). */
export const SEED_MAX = 2_147_483_647;
export function seedOf(v: string | undefined): number {
  const n = Number(v);
  return v != null && String(v).trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.min(SEED_MAX, Math.floor(n)) : Math.floor(Math.random() * (SEED_MAX + 1));
}
/** Per-image cap for character refs (Restyle) [R9]. */
export const MAX_CHAR_REF_BYTES = 64 * 1024 * 1024;
export interface Issue { code: string; field: string; message: string }

/** Shared validation for a source video + references + prompt + resolution (Video Swap-style tools).
 * Collects every independent issue [R39]: returns `{ error: issues[0].message, issues }` on failure. */
export async function parseCommon(fields: Record<string, string>, files: Record<string, string[]>, opts: { refsRequired: boolean; maxRefs?: number; maxRefBytes?: number; /** sound-only tools (Add soundtrack): any frame size, clips from 1 s */ soundOnly?: boolean; /** shortest clip this tool takes (default LIMITS.minSec; H3 Extend: 1 s, its routes check their own minimum) */ minSec?: number }) {
  const issues: Issue[] = [];
  const bad = (code: string, field: string, message: string) => { issues.push({ code, field, message }); };
  const video = files.video?.[0];
  let p: Awaited<ReturnType<typeof probe>> = null;
  if (!video) bad('required', 'video', 'A source video is required.');
  else {
    p = await probe(path.join(DATA_DIR, video));
    if (!p) bad('unreadable', 'video', "Couldn't read this video: the file looks damaged or empty. Re-export it as MP4 (H.264) and upload again."); // type already passed the upload gate
    else {
      const minSec = opts.minSec ?? (opts.soundOnly ? 1 : LIMITS.minSec);
      if (p.duration < minSec) bad('too_short', 'video', clipTooShortText(minSec));
      if (!opts.soundOnly && p.width * p.height < LIMITS.minPixels) bad('too_small', 'video', clipTooFewPixelsText(p.width, p.height));
    }
  }
  const refs = files.refs ?? files.image ?? [];
  const maxRefs = opts.maxRefs ?? LIMITS.maxRefs;
  if (opts.refsRequired && !refs.length) bad('required', 'refs', 'Add at least one reference image.');
  if (refs.length > maxRefs) bad('too_many', 'refs', `Too many reference images — maximum ${maxRefs}.`);
  if (opts.maxRefBytes) for (const [i, r] of refs.entries()) {
    const sz = (await stat(path.join(DATA_DIR, r)).catch(() => null))?.size ?? 0;
    if (sz > opts.maxRefBytes) bad('file_too_large', `refs[${i}]`, `Reference ${i + 1} is too large — maximum ${Math.round(opts.maxRefBytes / 1048576)} MB per image.`);
  }
  const pinned = pinnedOf(fields.pinned, refs.length);
  if (pinned === null) bad('invalid', 'pinned', 'pinned must be a list of reference indexes (0-based).');
  else if (pinned.length >= LIMITS.refsPerCall && refs.length > pinned.length) bad('invalid', 'pinned', `Pin at most ${LIMITS.refsPerCall - 1} references so each group has room for others.`);
  const prompt = fields.prompt ?? '';
  const mv = validateMentions(prompt, { images: refs.length, videos: 1 });
  const mentionIssues = mv.ok ? undefined : mv.issues.map((i) => ({ code: i.code, mention: i.mention.raw, start: i.mention.start, end: i.mention.end, message: i.message }));
  if (!mv.ok) for (const i of mv.issues) bad(i.code, 'prompt', i.message);
  if (prompt.length > LIMITS.maxPrompt) bad('too_long', 'prompt', `Prompt is too long — maximum ${LIMITS.maxPrompt} characters.`);
  const draft = /^(1|true|on)$/i.test(fields.draft || '');
  /** Keep the source clip's audio on the result (default on; keepAudio=0 → silent result). */
  const keepAudio = !/^(0|false|off|no)$/i.test(fields.keepAudio ?? '');
  const resolution = draft ? '480p' : (fields.resolution || '720p');
  if (!(RESOLUTIONS as readonly string[]).includes(resolution)) bad('invalid', 'resolution', `Resolution must be one of ${RESOLUTIONS.join(', ')}.`);
  if (issues.length || !p || !video) return { error: issues[0]?.message ?? 'Invalid input.', issues, ...(mentionIssues ? { mentionIssues } : {}) };

  const warnings: string[] = [];
  let usedVideo = video; let duration = p.duration;
  if (p.duration > LIMITS.maxSec) {
    const t = video.replace(/(\.[^.]+)$/, '-trim$1');
    if (await trim(path.join(DATA_DIR, video), path.join(DATA_DIR, t), LIMITS.maxSec)) { usedVideo = t; duration = LIMITS.maxSec; warnings.push(`Clip trimmed to the first ${LIMITS.maxSec} s.`); }
  }
  const refPaths = refs.map((r) => path.join(DATA_DIR, r));
  /** [R4] >8 refs: balanced groups of ≤ refsPerCall, each run independently on the original clip; pinned refs go in every group. */
  const groups = refGroups(refs.length, pinned!, LIMITS.refsPerCall);
  const refBatches = groups.map((g) => g.indexes.map((i) => refPaths[i]));
  const refGroupLabels = groups.map((g) => g.label);
  if (groups.length > 1) warnings.push(`${refs.length} references are split into ${groups.length} groups (${groups.map((g) => g.indexes.length).join('/')}); each group gives its own result. Price × ${groups.length}.`);
  return {
    videoPath: path.join(DATA_DIR, usedVideo), videoUrl: `/files/${usedVideo}`, duration, width: p.width, height: p.height, hasAudio: p.hasAudio, ...(p.fps ? { fps: p.fps } : {}), videoFormat: path.extname(video).slice(1).toLowerCase() /* Fit to model (shared/videoFit.ts) */,
    refPaths, refUrls: refs.map((r) => `/files/${r}`),
    imagePath: refs[0] ? path.join(DATA_DIR, refs[0]) : '',
    refBatches, refGroupLabels, pinned: pinned!, prompt, preset: fields.preset || '', resolution, seed: seedOf(fields.seed), warnings,
    draft, keepAudio, mentions: mentionsOf(prompt), simulate: mockFailOf(fields), simulateGroup: Number(fields.simulateGroup) || 0,
  };
}

/** Batch mode: `count` 1–BATCH_MAX versions of the same setup. Each version × each ref group is one model call
 * (own seed = seed + v); price × count via groupCount; a failed version refunds its share (runRefBatches). */
export const BATCH_MAX = 4;
export function applyBatch<T extends Record<string, any>>(c: T, fields: Record<string, string>): T | { error: string; issues: Issue[] } {
  const raw = fields.count ?? fields.versions;
  const count = raw == null || raw === '' ? 1 : Number(raw);
  if (!Number.isInteger(count) || count < 1 || count > BATCH_MAX) return { error: `count must be 1–${BATCH_MAX} versions.`, issues: [{ code: 'count', field: 'count', message: `count must be 1–${BATCH_MAX} versions.` }] };
  if (count === 1) return { ...c, count: 1 };
  const groups: string[][] = c.refBatches?.length ? c.refBatches : [c.refPaths ?? []];
  const glabels: string[] = c.refGroupLabels?.length ? c.refGroupLabels : groups.map(() => 'Result');
  const refBatches: string[][] = []; const refGroupLabels: string[] = []; const batchSeeds: number[] = [];
  for (let v = 0; v < count; v++) groups.forEach((g, k) => { refBatches.push(g); refGroupLabels.push(`Version ${v + 1}${groups.length > 1 ? ` · ${glabels[k]}` : ''}`); batchSeeds.push((Number(c.seed) + v) % SEED_MAX); });
  return { ...c, count, refBatches, refGroupLabels, batchSeeds, warnings: [...(c.warnings ?? []), teamMode() ? `${count} versions: price × ${count}; a failed version's credits go back to your balance.` : `${count} versions: price × ${count}.`] };
}

/** Parse `pinned` (JSON array or "0,2"), 0-based ref indexes. null = malformed. */
export function pinnedOf(v: string | undefined, n: number): number[] | null {
  if (!v || !v.trim()) return [];
  let xs: unknown;
  try { xs = v.trim().startsWith('[') ? JSON.parse(v) : v.split(',').map((x) => Number(x.trim())); } catch { return null; }
  if (!Array.isArray(xs) || !xs.every((x) => Number.isInteger(x) && x >= 0 && x < n)) return null;
  return [...new Set(xs as number[])].sort((a, b) => a - b);
}
/** Even split of n items into ceil(n/size) groups whose sizes differ by ≤1 (30 → 8/8/7/7). */
export function balancedSplit<T>(xs: T[], size: number): T[][] {
  if (!xs.length) return [];
  const g = Math.ceil(xs.length / size); const base = Math.floor(xs.length / g); const rem = xs.length % g;
  const out: T[][] = []; let i = 0;
  for (let k = 0; k < g; k++) { const len = base + (k < rem ? 1 : 0); out.push(xs.slice(i, i + len)); i += len; }
  return out;
}
/** Groups of ref indexes: pinned in every group (counting toward its cap), the rest split evenly. Label uses 1-based numbers. */
export function refGroups(n: number, pinned: number[], size: number): { indexes: number[]; label: string }[] {
  const pin = new Set(pinned); const rest = [...Array(n).keys()].filter((i) => !pin.has(i));
  if (n <= size) return [{ indexes: [...Array(n).keys()], label: n ? `Refs 1–${n}` : 'Result' }];
  return balancedSplit(rest, size - pin.size).map((g) => ({
    indexes: [...pinned, ...g],
    label: `Refs ${g[0] + 1}–${g[g.length - 1] + 1}${pin.size ? ` + pinned ${pinned.map((i) => i + 1).join(',')}` : ''}`,
  }));
}
/** Number of model calls (groups) for a parsed input: the price multiplier [R4]. */
export const groupCount = (input: Record<string, any>) => Math.max(1, Array.isArray(input.refBatches) ? input.refBatches.length : 1);
/** Price passes for an input: Re-shoot angles × full-clip, × ref groups. Used by createJob and demo-reset. */
export const passesFor = (input: Record<string, any>) =>
  (Array.isArray(input.angles) ? input.angles.length * (input.fullClip ? 2 : 1) : 1) * groupCount(input) * (input.outKind === 'image' ? 1 : Math.max(1, Number(input.n) || 1)); // n = batch outputs (TTS); images bill n via priceOf `count` (rounded per image × n), not passes

/**
 * Run a swap job as independent ≤8-ref calls [R4]: every group runs on the ORIGINAL source video with its own refs
 * (pinned refs included), producing one output per group labelled "Refs a–b". Each group runs on a shadow copy of the
 * job so the real job never flips to 'done' between groups; progress is mirrored as an overall %. A failed group
 * refunds its share and the job ends as a partial success with the error listed; all groups failing = failed (full refund).
 */
export async function runRefBatches(job: Job, runOne: (job: Job) => Promise<void>) {
  const batches: string[][] = job.input.refBatches?.length ? job.input.refBatches : [job.input.refPaths ?? []];
  if (batches.length <= 1) return runOne(job);
  const labels: string[] = job.input.refGroupLabels ?? batches.map((_, k) => `Group ${k + 1}`);
  const outputs: Job['outputs'] = []; const errors: { k: number; type: string; error: string }[] = [];
  job.status = 'running'; job.queuePos = 0;
  const perGroupEta = Math.ceil((job.eta || 0) / batches.length);
  let stoppedAt = -1;
  for (let k = 0; k < batches.length; k++) {
    if (job.cancelRemaining) { stoppedAt = k; break; } // cancel the groups that haven't started
    const sub: Job = { ...job, id: `${job.id}-g${k + 1}`, status: 'running', progress: 0, outputs: [], resultUrl: null, error: null, errorType: null,
      input: { ...job.input, ...(job.input.batchSeeds?.[k] != null ? { seed: job.input.batchSeeds[k], version: Math.floor(k / Math.max(1, batches.length / (job.input.count || 1))) + 1 } : {}), refPaths: batches[k], imagePath: batches[k][0] ?? '', batch: { index: k + 1, of: batches.length }, refBatches: [batches[k]],
        simulate: job.input.simulateGroup ? (job.input.simulateGroup === k + 1 ? (job.input.simulate || 'temporary') : '') : job.input.simulate } };
    const mirror = setInterval(() => {
      job.progress = Math.min(99, Math.round(((k + sub.progress / 100) / batches.length) * 100));
      job.stage = `${sub.stage} · group ${k + 1}/${batches.length}`; job.eta = sub.eta + (batches.length - k - 1) * perGroupEta;
    }, 250);
    try { await runOne(sub); } catch (e) { sub.status = 'failed'; sub.errorType ??= 'temporary'; sub.error = e instanceof Error ? e.message : String(e); }
    finally { clearInterval(mirror); }
    if (job.status !== 'running') return; // canceled externally
    if (sub.status === 'done') {
      const outs = sub.outputs.length ? sub.outputs : sub.resultUrl ? [{ label: 'Result', url: sub.resultUrl }] : [];
      outs.forEach((o) => outputs.push({ ...o, label: `${labels[k]}${outs.length > 1 ? ` · ${o.label}` : ''}${job.input.draft ? ' (draft 480p)' : ''}` }));
    } else errors.push({ k, type: sub.errorType ?? sub.status, error: sub.error ?? sub.status });
    if (sub.status === 'blocked') { job.status = 'blocked'; job.errorType = sub.errorType; job.error = sub.error; return; }
  }
  job.failedGroups = errors.map((e) => e.k + 1);
  if (stoppedAt >= 0) { // canceled mid-batch: refund the groups that never ran; keep finished outputs
    const skipped = batches.length - stoppedAt;
    if (!outputs.length) { job.status = 'canceled'; job.error = 'Canceled before any group finished.'; return; }
    const share = Math.round(((job.cost ?? 0) * (skipped + errors.length)) / batches.length);
    const r = refundPartial(job.id, share, creditsBackNote(`Run canceled, ${skipped} of ${batches.length} groups not started${errors.length ? `, ${errors.length} failed` : ''}`, true));
    job.refunded = (job.refunded ?? 0) + r; job.partial = true; job.canceledGroups = batches.length - stoppedAt;
    job.outputs = outputs; job.resultUrl = outputs[0].url; job.stage = 'done'; job.progress = 100; job.eta = 0;
    job.error = `Canceled: ${skipped} of ${batches.length} groups were not run.`; if (r > 0) job.creditsBack = { credits: r, attempts: 1 }; // amount in refund.amount + creditsBack (no sentence) job.errorType = 'canceled';
    job.refund = { refunded: r > 0, amount: r, freeGenReturned: false }; job.status = 'done'; return;
  }
  if (!outputs.length) { const e = errors[0]; job.status = 'failed'; job.errorType = e?.type ?? 'temporary'; job.error = e?.error ?? 'All groups failed.'; return; }
  job.outputs = outputs; job.resultUrl = outputs[0].url; job.stage = 'done'; job.progress = 100; job.eta = 0;
  if (errors.length) {
    const share = Math.round(((job.cost ?? 0) * errors.length) / batches.length);
    const r = refundPartial(job.id, share, creditsBackNote(`${errors.length} of ${batches.length} reference groups failed`, true));
    job.refunded = (job.refunded ?? 0) + r;
    job.partial = true;
    job.error = `${errors.length} of ${batches.length} groups failed: ${errors.map((e) => `${labels[e.k]} (${e.type}): ${e.error}`).join('; ')}`;
    job.errorType = errors[0].type;
    job.refund = { refunded: r > 0, amount: r, freeGenReturned: false }; if (r > 0) job.creditsBack = { credits: r, attempts: 1 }; else if (!((job as any).cost > 0)) job.error += ' Nothing was charged.'; // only when the job really cost nothing (Oct 18 #2) // amount in refund.amount + creditsBack (no sentence)
  }
  job.status = 'done';
}

/** Create Image `n` (1–4): every output image is billed, so passes × n. Shots (app-shots): one image per picked angle (up to 9), each billed. */
export const imageCount = (input: Record<string, any>) => Array.isArray(input.shots) && input.shots.length ? input.shots.length : Math.min(4, Math.max(1, Number(input.n) || 1));
/** Output labels for an image job: one per Shots angle, else 'Image k' for n > 1, else the app's own label (Face Swap) or the fallback. */
export const imageLabels = (input: Record<string, any>, fallback = 'Result'): string[] => input.layers && Array.isArray(input.mockLayers) && input.mockLayers.length ? input.mockLayers.map(String) /* Image to layers: the sample's layers (one run, one price) */ : Array.isArray(input.shots) && input.shots.length ? input.shots.map((x: any) => String(x.label))
  : imageCount(input) > 1 ? Array.from({ length: imageCount(input) }, (_, k) => `${fallback} ${k + 1}`) : [String(input.outputLabel ?? fallback)];
/** Price/GPU estimate for a parsed input: delegates to the shared priceOf (server/src/shared/pricing.ts). */
export const priceFor = (tool: ToolDef, input: Record<string, any>, extra = 1, provider?: string) =>
  priceOf({ toolId: tool.id, rates: tool.gpuSecPerSec, refVideoSec: Number(input.refVideoSeconds) || 0, quality: input.resolution, durationSec: input.duration, provider, draft: !!input.draft, passes: input.outKind === 'image' ? extra : Math.max(1, extra / imageCount(input)), count: imageCount(input) /* every output priced rounded-per-output × n; passesFor's n factor is taken back out */, audio: input.audio === true, tier: input.tier ?? null, imageRes: input.imageResolution, aspect: typeof input.aspect === 'string' ? input.aspect : null, promptBytes: promptBytesFor(input),
    optionFactors: tool.pricing?.optionFactors, providerFactor: provider ? tool.pricing?.providerFactors?.[provider] : undefined,
    types: Array.isArray(input.types) ? input.types : input.preset ? [input.preset] : [], free: !!input.free,
    chars: String(input.text ?? input.script ?? input.prompt ?? '').length || undefined, megapixels: outputMegapixels(input), outMegapixels: tool.id === 'image-upscale' ? upscaleOutMegapixels(input) : undefined, mode: priceMode(input), refImages: routerRefImages(provider, input) });
export const estimateSeconds = (tool: ToolDef, input: Record<string, any>, extra = 1, provider?: string) => priceFor(tool, input, extra, provider).gpuSec;

/** Sample results (2026-10-26): the app's own real LTX-2.5 renders and showcase stills (shared/featured.ts, web/public/showcase), never test
 *  patterns. A clip rotates through SAMPLE_CLIPS by output index and seed; a plugin can still register its own clips (registerMockResult). */
const MOCK_RESULTS: Record<string, string[]> = {};
const pick = <T,>(xs: T[], n: number) => xs[((n % xs.length) + xs.length) % xs.length];
export const mockResultFor = (toolId: string, i = 0, seed = 0) => { const own = MOCK_RESULTS[toolId];
  return own?.length ? path.resolve(SAMPLES_DIR, pick(own, i)) : path.resolve(WEB_PUBLIC_DIR, pick(SAMPLE_CLIPS, i + seed)); };
/** A real still for an image result on the sample server (cropped to the asked shape by the caller). */
export const mockStillFor = (i = 0, seed = 0) => path.resolve(WEB_PUBLIC_DIR, pick(SAMPLE_STILLS, i + seed));
/** Image size on the sample server: the asked aspect at the asked size (1K long side 1024, 2K 1536, 4K 2048), so a 1:1 run gives a square. */
export function mockImageFrame(input: Record<string, any>): [number, number] {
  const long = /4k/i.test(String(input.imageResolution ?? '')) ? 2048 : /2k/i.test(String(input.imageResolution ?? '')) ? 1536 : input.resolution === '1080p' ? 1920 : 1024;
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(String(input.aspect ?? input.aspectRatio ?? '')); const r = m && Number(m[1]) && Number(m[2]) ? Number(m[1]) / Number(m[2]) : input.resolution ? 16 / 9 : 1;
  const even = (x: number) => Math.max(2, Math.round(x / 2) * 2);
  return r >= 1 ? [even(long), even(long / r)] : [even(long * r), even(long)];
}
/** Plugins: register mock result clips (absolute paths or names in server/samples). */
export const registerMockResult = (toolId: string, files: string[]) => { if (files.length) MOCK_RESULTS[toolId] = files; };
/** Render a mock output: the tool's sample clip, looped/cut to the input duration and resolution, carrying the input's audio (or an uploaded track). */
/** Mock audio bed: music = two-tone chord with tremolo, sfx = filtered noise swell, voice = formant-ish buzz bursts. */
export function mockAudioArgs(kind: string, dur: number, seed = 0): string[] {
  const f = 180 + (seed % 7) * 20;
  if (kind === 'sfx') return ['-f', 'lavfi', '-i', `anoisesrc=d=${dur}:c=pink:a=0.5,bandpass=f=${600 + (seed % 5) * 200}:w=400,afade=t=in:d=0.3`];
  if (kind === 'voice') return ['-f', 'lavfi', '-i', `sine=f=${f}:d=${dur},vibrato=f=6:d=0.4,tremolo=f=4:d=0.9,lowpass=f=1800,aformat=sample_fmts=s16` /* s16: vibrato can emit NaN on the last frame, which AAC rejects in the mux path */];
  return ['-f', 'lavfi', '-i', `sine=f=${f}:d=${dur},tremolo=f=2:d=0.5`, '-f', 'lavfi', '-i', `sine=f=${Math.round(f * 1.5)}:d=${dur},volume=0.6`];
}
/** Mock frame size: the resolution tier's short side, shaped by the job's aspect (9:16 → 720×1280 at 720p; UGC Ad's locked 9:16 renders vertical). */
export function mockFrame(input: Record<string, any>): [number, number] {
  const [W, H] = input.resolution === '480p' ? [854, 480] : input.resolution === '1080p' ? [1920, 1080] : [1280, 720];
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(String(input.aspect ?? input.aspectRatio ?? '')); if (!m || !Number(m[1]) || !Number(m[2])) return [W, H];
  const r = Number(m[1]) / Number(m[2]); const even = (x: number) => Math.round(x / 2) * 2;
  return r >= 1 ? [even(H * r), H] : [H, even(H / r)];
}
/** Alpha video (Remove BG 'Transparent'): WebM, VP9 yuva420p + Opus. H.264 MP4 has no alpha channel. */
export const ALPHA_VIDEO = { ext: 'webm', mime: 'video/webm', codec: 'vp9', pixFmt: 'yuva420p' } as const;
const outExt = (job: Job) => job.input.alpha ? ALPHA_VIDEO.ext : job.input.outKind === '3d' ? 'glb' : job.input.outKind === 'image' ? 'png' : job.input.outKind === 'audio' ? 'm4a' : 'mp4';
/** Sample results for the photo tools (mock backend only, never a render): Remove Background = the photo with an oval kept and the rest
 *  transparent (PNG alpha); Expand = the photo centred on the target canvas over a blurred copy of itself; Erase = the photo, slightly softened. */
function photoToolMock(i: Record<string, any>): string[] | null {
  const fit = 'scale=w=min(iw\\,1024):h=min(ih\\,1024):force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2';
  if (i.mockLook === 'cutout') return ['-vf', `${fit},format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255*lte(pow((X-W/2)/(W*0.34),2)+pow((Y-H*0.55)/(H*0.44),2),1)'`];
  if (i.mockLook === 'expand' && Array.isArray(i.expand?.canvas)) { const [cw, ch] = i.expand.canvas as number[]; const k = Math.min(1, 1024 / Math.max(cw, ch));
    const W = Math.max(2, Math.round(cw * k / 2) * 2), H = Math.max(2, Math.round(ch * k / 2) * 2); const [ow, oh] = (i.expand.original as number[]).map((x) => Math.max(2, Math.round(x * k / 2) * 2));
    return ['-filter_complex', `[0:v]scale=${W}:${H},boxblur=24:2,eq=brightness=-0.06[bg];[0:v]scale=${ow}:${oh}[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`]; }
  if (i.mockLook === 'erase') return ['-vf', `${fit},gblur=sigma=1.2`];
  return null;
}
/** Image to layers on the mock backend: our own drawn sample layers (tools/mockLayers.ts), never a render. Layer k of the job's planned count, the photo's shape. */
async function writeMockLayer(job: Job, i: number, out: string): Promise<{ box?: number[]; description?: string }> {
  const n = Array.isArray(job.input.mockLayers) ? job.input.mockLayers.length : 4; const [w, h] = mockLayerSize(job.input.sourceSize);
  const l = mockLayer(i, n, w, h); await writeFile(out, l.png); return { ...(i > 0 && l.box ? { box: l.box } : {}), description: l.description };
}
/** Media tools (outKind image | audio | soundtrack | av-video): kind-specific mock render. */
async function renderMediaMock(job: Job, i: number, out: string) {
  if (job.input.outKind === '3d') { await copyFile(path.resolve(SAMPLES_DIR, 'result-3d.glb'), out); return; } // 3D (2026-10-23): our own sample GLB (scripts/make-sample-glb.mjs), never a render
  const k = job.input.outKind as string; const dur = Math.max(1, Number(job.input.duration) || 8); const seed = Number(job.input.seed) || 0;
  const [w, h] = k === 'av-video' ? mockFrame(job.input) : k === 'image' ? mockImageFrame(job.input) : job.input.resolution === '1080p' ? [1920, 1080] : job.input.resolution === '480p' ? [854, 480] : [1280, 720];
  let args: string[];
  if (k === 'image') {
    const src = job.input.imagePath ? ['-i', job.input.imagePath] : ['-i', mockStillFor(i, seed)];
    const shotVf = Array.isArray(job.input.shots) ? SHOT_MOCK_VF[String(job.input.shots[i]?.id ?? '')] ?? '' : ''; // Shots: a crop / flip that hints at each view (sample output, not a render)
    const vf = `${shotVf ? `${shotVf},` : ''}scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}${job.input.imagePath ? ',hue=h=40:s=1.2' : ''}`;
    const inset = job.input.insetPath && job.input.imagePath ? String(job.input.insetPath) : ''; // Face Swap: the face photo as a small inset, so the sample shows both inputs
    const look = job.input.imagePath ? photoToolMock(job.input) : null; // photo tools (2026-10-23): a sample that looks like the tool's result (cutout PNG, wider canvas)
    args = look ? ['-y', '-i', job.input.imagePath, ...look, '-frames:v', '1', out] : inset ? ['-y', ...src, '-i', inset, '-filter_complex', `[0:v]${vf}[b];[1:v]scale=-2:${Math.round(h / 4)},pad=iw+8:ih+8:4:4:color=0xff7a18[f];[b][f]overlay=W-w-24:24`, '-frames:v', '1', out]
      : ['-y', ...src, '-frames:v', '1', '-vf', vf, out];
  } else if (k === 'audio') {
    const a = mockAudioArgs(job.input.audioKind, dur, seed + i);
    args = ['-y', ...a, ...(a.length > 4 ? ['-filter_complex', 'amix=inputs=2:normalize=0'] : []), '-t', String(dur), '-c:a', 'aac', '-b:a', '160k', out];
  } else {
    // soundtrack: generated audio muxed onto the source video (blend keeps the original track under it); av-video: sample clip + generated audio.
    const vid = k === 'soundtrack' ? job.input.videoPath : mockResultFor(job.toolId, i, seed);
    const a = mockAudioArgs(job.input.audioKind ?? 'music', dur, seed + i); const two = a.filter((x) => x === '-i').length === 2;
    const blend = k === 'soundtrack' && job.input.mix === 'blend' && job.input.hasAudio;
    const gen = two ? '[1:a][2:a]amix=inputs=2:normalize=0[g]' : '[1:a]anull[g]';
    const fit = k === 'soundtrack' ? 'pad=ceil(iw/2)*2:ceil(ih/2)*2:0:0,setsar=1' : `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`; // soundtrack keeps the source frame; pad odd edges by at most 1 px for H.264 yuv420p
    const fc = `${gen};${blend ? `[0:a]volume=0.5[o];[o][g]amix=inputs=2:duration=first[aout]` : '[g]anull[aout]'};[0:v]${fit},format=yuv420p[v]`;
    args = ['-y', ...(k === 'soundtrack' ? [] : ['-stream_loop', '-1']), '-i', vid, ...a, '-filter_complex', fc, '-map', '[v]', '-map', '[aout]', '-t', String(dur), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', out];
  }
  const code = await runFfmpeg(args);
  if (code !== 0) throw new Error(`Something went wrong rendering the mock result (ffmpeg ${code}). Credits went back to your balance.`);
}
/** Mock alpha clip: the sample result with an ellipse "subject" kept and everything else transparent (VP9 alpha), source audio as Opus. */
async function renderAlphaMock(job: Job, i: number, out: string) {
  const [w, h] = job.input.resolution === '480p' ? [854, 480] : job.input.resolution === '1080p' ? [1920, 1080] : [1280, 720];
  const audio = job.input.keepAudio === false ? null : job.input.videoPath;
  const m = `color=c=black:s=${w}x${h}:d=1,format=gray,geq=lum='255*lte(pow((X-${w / 2})/${Math.round(w * 0.24)}\\,2)+pow((Y-${Math.round(h * 0.55)})/${Math.round(h * 0.46)}\\,2)\\,1)'`;
  const args = ['-y', '-v', 'error', '-stream_loop', '-1', '-i', mockResultFor(job.toolId, i), ...(audio ? ['-i', audio] : []), '-f', 'lavfi', '-i', m,
    '-filter_complex', `[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,format=yuva420p[v];[${audio ? 2 : 1}:v]format=gray,loop=-1:1:0[m];[v][m]alphamerge,format=yuva420p[o]`,
    '-map', '[o]', ...(audio ? ['-map', '1:a:0?'] : []), '-t', String(Math.max(1, Number(job.input.duration) || 6)),
    '-c:v', 'libvpx-vp9', '-pix_fmt', ALPHA_VIDEO.pixFmt, '-b:v', '0', '-crf', '34', '-deadline', 'realtime', '-cpu-used', '8', ...(audio ? ['-c:a', 'libopus', '-b:a', '96k'] : []), out];
  const code = await runFfmpeg(args);
  if (code !== 0) throw new Error(`Something went wrong rendering the mock result (ffmpeg ${code}). Credits went back to your balance.`);
}
/** OPENHIGGSFIELD_MOCK_RENDER=copy (tests that check routes and prices, not the media: model-runon runs ~1300 jobs): a video sample is copied
 *  as is instead of encoded (size, length and audio of the request are not applied). Images, audio, 3D and alpha clips render as usual. */
const mockCopyVideo = () => env('MOCK_RENDER') === 'copy';
export async function renderMockOutput(job: Job, i: number, out: string) {
  if (job.input.alpha) return renderAlphaMock(job, i, out);
  if (mockCopyVideo() && (!job.input.outKind || job.input.outKind === 'av-video' || job.input.outKind === 'video')) { await copyFile(mockResultFor(job.toolId, i), out); return; }
  if (job.input.outKind) return renderMediaMock(job, i, out);
  const [w, h] = mockFrame(job.input);
  const audio = job.input.keepAudio === false ? job.input.audioPath : (job.input.audioPath || job.input.videoPath);
  const args = ['-y', '-stream_loop', '-1', '-i', mockResultFor(job.toolId, i, Number(job.input.seed) || 0)];
  if (audio) args.push('-i', audio);
  args.push('-t', String(Math.max(1, Number(job.input.duration) || 6)), '-map', '0:v:0', ...(audio ? ['-map', '1:a:0?'] : []),
    '-vf', `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-c:a', 'aac', '-movflags', '+faststart', out);
  const code = await runFfmpeg(args);
  if (code !== 0) throw new Error(`Something went wrong rendering the mock result (ffmpeg ${code}). Credits went back to your balance.`);
}

/** The Canvas demo's card (job.input.demoRef, shared/demoMedia.ts): its real run as is, never cropped, looped or toned. A picture as PNG,
 *  a clip copied (H.264 + AAC already), a sound as AAC. False when the media is not what this job makes: the usual sample then. */
async function renderDemoOutput(job: Job, m: DemoMedia, out: string): Promise<boolean> {
  const want = outExt(job) === 'png' ? 'image' : outExt(job) === 'm4a' ? 'audio' : outExt(job) === 'mp4' ? 'video' : null; const kind = demoKindOf(m);
  if (want !== kind) return false;
  const src = path.resolve(WEB_PUBLIC_DIR, m.url.replace(/^\//, ''));
  if (kind === 'video') { await copyFile(src, out); return true; }
  const code = await runFfmpeg(kind === 'image' ? ['-y', '-i', src, '-frames:v', '1', out] : ['-y', '-i', src, '-vn', '-map', '0:a:0', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out]);
  if (code !== 0) throw new Error(`Something went wrong rendering the sample (ffmpeg ${code}). Credits went back to your balance.`);
  return true;
}

/**
 * Generic mock run: walks the tool's stages over `ms`, then copies the source video
 * into one output per label (mock "results" reuse local media).
 */
/** Mock job duration override (re-queue tests keep jobs running): POST /api/dev/mock-delay {ms} (mock only) wins over env OPENHIGGSFIELD_MOCK_DELAY_MS; null = each tool's own duration. */
let mockDelayOverride: number | null = null;
export const MOCK_DELAY_MAX_MS = 30 * 60_000;
export function mockDelayMs(): number | null { if (mockDelayOverride != null) return mockDelayOverride; const v = Number(env('MOCK_DELAY_MS')); return env('MOCK_DELAY_MS') != null && env('MOCK_DELAY_MS') !== '' && Number.isFinite(v) && v >= 0 ? Math.min(MOCK_DELAY_MAX_MS, v) : null; }
export const setMockDelayMs = (ms: number | null) => { mockDelayOverride = ms == null ? null : Math.min(MOCK_DELAY_MAX_MS, Math.max(0, Math.round(ms))); return mockDelayMs(); };
export async function mockRun(job: Job, stages: [string, string][], labels: string[] = ['Result'], ms = 8000): Promise<void> {
  { const d = mockDelayMs(); if (d != null) ms = Math.max(1, d); }
  job.simulated = true; // sample output: nothing reaches a provider, so the spend log counts it as $0 (billing.ts countedUsd)
  // HW-SHAPES B4: first-use downloading_model / loading_model on a local route (only when asked or simulated; a normal run skips this)
  if (String(job.route ?? '').startsWith('local:')) { job.status = 'running'; job.queuePos = 0; const S = await import('../hardware/stages.js'); if (S.needsPrePhase(job, true)) {
    try { await S.prePhase(job, true, Math.ceil(ms / 1000)); } catch (e) { if (job.status === 'running') { job.status = 'failed'; job.errorType = 'temporary'; job.error = e instanceof Error ? e.message : String(e); } return; }
    if (job.status !== 'running') return; } }
  return new Promise((resolve) => {
    const start = Date.now();
    job.status = 'running'; job.queuePos = 0;
    const t = setInterval(async () => {
      if (job.status !== 'running') { clearInterval(t); return resolve(); }
      const p = Math.min(1, (Date.now() - start) / ms);
      job.progress = Math.min(99, Math.round(p * 100));
      job.stage = stages[Math.min(stages.length - 1, Math.floor(p * stages.length))][0];
      job.eta = Math.max(0, Math.ceil((ms - (Date.now() - start)) / 1000));
      const sim = job.input.simulate as string;
      if (sim && p >= 0.3) {
        clearInterval(t);
        const msg: Record<string, string> = {
          temporary: 'Something went wrong (temporary). Credits went back to your balance; try again.',
          provider_outage: 'The provider is unavailable right now. Credits went back to your balance.',
          ip: 'The provider rejected this job due to copyright restrictions (IP detected). Credits went back to your balance.',
          nsfw: "The provider's content filter flagged the output. Credits went back to your balance.",
        };
        // mock of a PROVIDER-side refusal (ip / nsfw): ends 'blocked', refunded once; a plain retry resubmits it
        job.status = sim === 'nsfw' || sim === 'ip' ? 'blocked' : 'failed'; job.errorType = sim; job.error = msg[sim]; return resolve();
      }
      if (p >= 1) {
        clearInterval(t);
        try {
          job.outputs = [];
          for (let i = 0; i < labels.length; i++) {
            const name = `${job.id}-out${i}.${outExt(job)}`;
            const out = path.join(DATA_DIR, name);
            const demo = i === 0 ? demoMediaOf(job.input.demoRef) : null; // the Canvas demo's card: its real run, labelled with the model that made it
            const meta = job.input.layers && job.input.outKind === 'image' ? await writeMockLayer(job, i, out) /* Image to layers: drawn sample layers with name, description, box */
              : demo && await renderDemoOutput(job, demo, out) ? { madeWith: demoLabel(demo) } : (await renderMockOutput(job, i, out), {}); // mock: sample result clip + the input's audio
            job.outputs.push({ label: job.input.draft ? `${labels[i]} (draft 480p)` : labels[i], url: `/files/${name}`, ...meta });
          }
          if (job.input.layers) await writeLayerPoster(job); // Image to layers: the composite, once, as the card's poster
          job.resultUrl = job.outputs[0]?.url ?? null;
          job.stage = 'done'; job.status = 'done'; job.progress = 100; job.eta = 0;
        } catch (e) {
          job.status = 'failed'; job.errorType = 'temporary'; job.error = e instanceof Error ? e.message : String(e);
        }
        resolve();
      }
    }, 250);
  });
}
