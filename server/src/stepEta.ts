/**
 * Per-step ETA learning for LOCAL ComfyUI runs (Oct 21 2026). Every computer differs, so a local time estimate comes only from this
 * computer's own finished runs of the exact workflow + model files, split into the parts that behave differently:
 *   load   = submit (or ComfyUI execution_start) → first sampler step, marked cold or warm (the model was / wasn't already loaded)
 *   sample = first sampler step → last sampler step (divided by the steps run = seconds per step)
 *   post   = last sampler step → the job's outputs stored (VAE decode, download, ffmpeg)
 *
 * Table eta_steps (id = job id), one row per finished local run on a live backend (never the mock backend, never a demo / simulated run;
 * tests may opt in with OPENHIGGSFIELD_ETA_LEARN_MOCK=1, same switch as etaLearn.ts):
 *   {key, baseKey, hwKey, modelsSig, label, toolId, steps, graphSteps, units, postUnits, loadSec, loadKind, sampleSec, postSec, totalSec, at, factors}
 *   baseKey  = hash(workflow files + model files loaded (after a GGUF variant swap) + LoRA count)
 *   key      = baseKey | pixels × frames × batch | cfg (1 or 2): the settings that change the cost of one step
 *   units    = megapixels × frames × batch × (2 when cfg > 1): the work of one step; postUnits = the same without the cfg factor
 *   Last KEEP (20) rows per (key, hwKey).
 *
 * Estimate (estimateFor) for a job on hardware hwKey, with rows R = same baseKey + hwKey, E = rows with the same key:
 *   rows used U = E if any, else R ('scaled'); outliers dropped on the per-step rate r = sampleSec / (steps × units) (robust: |x − median| >
 *   max(3 × 1.4826 × MAD, 0.5 × median), only from 3 rows on).
 *   seconds = median(load of the kind that applies now) + targetSteps × median(r) × units + median(post × postUnits / row.postUnits)
 *   load kind now = 'warm' when the last local run on this hardware used the same model files and ended (or reached its first step) less than
 *   WARM_MS (10 min) ago, else 'cold'; no row of that kind yet → all rows' loads, range widened.
 *   range: half-width = √(spread² + (seconds × rel)²): spread = √(Σ (1.4826 × MAD of each part)²), rel = 0.3 / √n (+ 0.12 + 0.15 × |ln(work ratio)|
 *   when scaled from other steps / sizes, + 0.15 when the load kind is borrowed). low = max(1, seconds − half), high = seconds + half.
 *   source: 'learned' (same settings and steps), 'scaled' (other steps or sizes of the same workflow), 'reported' (no row; a published figure for
 *   this GPU class from timing.ts, ×0.7–1.4), 'first_run' (nothing: no number; this run calibrates).
 */
import { createHash } from 'node:crypto';
import { all, put, del, tx } from './db.js';
import { config } from './config.js';
import { env } from './env.js';
import { isSamplerNode } from './comfy/native.js';
import { checkImageCaps } from './shared/imageCaps.js';
import type { NativeTiming } from './comfy/native.js';
import { hwKeyCanon } from './hardware.js';

export type EtaSource = 'learned' | 'scaled' | 'reported' | 'first_run';
export interface EtaRange { seconds: number | null; low: number | null; high: number | null; source: EtaSource; samples: number; includesLoad: 'cold' | 'warm' | null; calibrating: boolean;
  /** the learned parts (null unless learned / scaled) */ loadSec: number | null; secondsPerStep: number | null; steps: number | null; postSec: number | null; key: string | null }
export interface Features { workflows: string[]; models: string[]; loras: number; steps: number | null; pixels: number | null; frames: number; batch: number; cfg2: boolean }
export interface Keys { baseKey: string; key: string; modelsSig: string; units: number; postUnits: number }
export interface StepSample { id: string; key: string; baseKey: string; hwKey: string; modelsSig: string; label: string; toolId: string; steps: number; graphSteps: number | null; units: number; postUnits: number;
  loadSec: number; loadKind: 'cold' | 'warm'; sampleSec: number; postSec: number; totalSec: number; at: number; factors: { pixels: number | null; frames: number; batch: number; cfg2: boolean; loras: number } }

export const KEEP = 20;
export const WARM_MS = () => Number(env('ETA_WARM_MS')) || 10 * 60_000;
export const learnEnabled = () => config.backend !== 'mock' || /^(1|true)$/i.test(env('ETA_LEARN_MOCK') ?? '');

// ---- graph features ----
const MODEL_EXT = /\.(safetensors|sft|gguf|ckpt|pt|pth|bin|onnx)$/i;
const isLoaderClass = (c: string) => /loader/i.test(c) && !/^Load(Image|Video|Audio)/i.test(c);
const strings = (v: any, out: string[] = []): string[] => { if (typeof v === 'string') { if (MODEL_EXT.test(v)) out.push(v); } else if (v && typeof v === 'object' && !Array.isArray(v)) { if (v.on === false) return out; for (const x of Object.values(v)) strings(x, out); } return out; };
/** A number input, following links to primitive nodes ({value}). */
function num(g: Record<string, any>, v: any, depth = 0): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (Array.isArray(v) && depth < 4) { const n = g[String(v[0])]; return n ? num(g, n.inputs?.value ?? n.inputs?.int ?? n.inputs?.number, depth + 1) : null; }
  return null;
}
const field = (inp: Record<string, any>, name: string) => Object.entries(inp).find(([k]) => k === name || k.endsWith(`.${name}`))?.[1];
/** What sets the cost of a graph: model files, LoRAs, sampler steps, latent pixels × frames × batch, cfg > 1. */
export function graphFeatures(graph: Record<string, any>, workflow: string | string[] = []): Features {
  const models = new Set<string>(); let loras = 0; let pixels: number | null = null; let frames = 1; let batch = 1; let cfg2 = false; let steps: number | null = 0;
  for (const n of Object.values<any>(graph)) {
    const c = String(n?.class_type ?? ''); const inp = n?.inputs ?? {};
    if (/lora/i.test(c)) loras += strings(inp).length; else if (isLoaderClass(c)) for (const f of strings(inp)) models.add(f);
    const w = num(graph, field(inp, 'width')); const h = num(graph, field(inp, 'height'));
    if (w && h && w > 0 && h > 0 && (pixels == null || w * h > pixels)) pixels = w * h;
    if (/latent|video|wan|ltx|hunyuan|frames/i.test(c)) { const f = num(graph, inp.length ?? inp.frames ?? inp.num_frames ?? inp.video_length); if (f && f > frames) frames = f; }
    if (/latent/i.test(c)) { const b = num(graph, inp.batch_size); if (b && b > batch) batch = b; }
    if (/sampler|guider/i.test(c)) { const cf = num(graph, inp.cfg); if (cf != null && cf > 1) cfg2 = true; }
    if (isSamplerNode(n)) {
      let s = num(graph, inp.steps);
      if (s != null) { const a = num(graph, inp.start_at_step) ?? 0; const e = num(graph, inp.end_at_step) ?? s; s = Math.max(0, Math.min(e, s) - a); }
      else if (Array.isArray(inp.sigmas)) { const sc = graph[String(inp.sigmas[0])]; s = sc ? num(graph, sc.inputs?.steps) : null; }
      steps = steps == null || s == null ? null : steps + s;
    }
  }
  return { workflows: (Array.isArray(workflow) ? workflow : [workflow]).filter(Boolean).sort(), models: [...models].sort(), loras, steps: steps || null, pixels, frames, batch, cfg2 };
}
const h = (x: unknown, n = 16) => createHash('sha1').update(JSON.stringify(x)).digest('hex').slice(0, n);
export function keysOf(f: Features): Keys {
  const baseKey = h([f.workflows, f.models, f.loras]); const mp = f.pixels ? f.pixels / 1e6 : 1;
  return { baseKey, key: `${baseKey}|${f.pixels ?? 0}x${f.frames}x${f.batch}|cfg${f.cfg2 ? 2 : 1}`, modelsSig: h(f.models, 12), units: mp * f.frames * f.batch * (f.cfg2 ? 2 : 1), postUnits: mp * f.frames * f.batch };
}

/** Q7: a runnable GGUF variant swaps the UNETLoader file for UnetLoaderGGUF (runNative and the quote use the same swap, so the key matches). */
export function applyGgufVariant(graph: Record<string, any>, variant: { loader?: string; dropIn?: boolean; replaces?: string; file: string } | null) {
  if (variant?.loader === 'gguf' && variant.dropIn) for (const nd of Object.values<any>(graph)) if (nd?.class_type === 'UNETLoader' && nd.inputs?.unet_name === variant.replaces) { nd.class_type = 'UnetLoaderGGUF'; nd.inputs = { unet_name: variant.file }; }
  return graph;
}

// ---- features of a job before it runs (quotes, submit): the same plan builder runNative uses, inputs that are files stood in by names ----
let buildPlan: ((j: any, o?: any) => any) | null = null; let findVariant: ((id: string) => any) | null = null;
const loading = Promise.all([import('./comfy/plans.js').then((m) => { buildPlan = m.buildPlan; }), import('./hardware/requirements.js').then((m) => { findVariant = m.findVariant; })]).catch(() => undefined);
/** Resolves once the plan builder is loaded (tests; the server has it within ms of boot). */
export const ready = () => loading;
const fcache = new Map<string, Features | null>();
const NOISE = /^(prompt|finalPrompt|negativePrompt|seed|enhance|style|title|webhookUrl|quoted.*|rights)$/;
export function jobFeatures(toolId: string, providerId: string, input: Record<string, any> = {}): Features | null {
  if (!buildPlan) return null;
  const ck = `${toolId}|${providerId}|${JSON.stringify(Object.entries(input).filter(([k, v]) => !NOISE.test(k) && !/Paths?$/.test(k) && (typeof v !== 'string' || v.length < 200)).sort())}`;
  if (fcache.has(ck)) return fcache.get(ck)!;
  let f: Features | null = null;
  try {
    const i: Record<string, any> = { ...input };
    // the image size the submit would pick (media.ts runs checkImageCaps): without it the plan falls back to `resolution` and the key misses the run's
    if (i.imageResolution == null) { const c = checkImageCaps(providerId, { aspect: i.aspect, quality: i.quality, n: i.n }); if (c.ok) i.imageResolution = c.imageResolution; }
    i.duration = Number(i.duration) > 0 ? Math.min(Number(i.duration), 60) : 5; /* plan builders loop over the clip length: never hand them a missing one */ const refs = Math.max(0, Number(input.refs) || 0); const ph = (k: number) => `/ohf-eta-placeholder/ref${k}.png`;
    if (!i.imagePath && (input.mode === 'edit' || input.mode === 'inpaint' || refs > 0)) i.imagePath = ph(0);
    if (!i.refPaths && refs > 1) i.refPaths = Array.from({ length: refs }, (_, k) => ph(k));
    if (input.mode === 'inpaint' && !i.maskPath) i.maskPath = '/ohf-eta-placeholder/mask.png';
    const plan = buildPlan({ id: 'eta', toolId, provider: providerId, input: i, status: 'queued', route: `local:${providerId}` }, {});
    const v = typeof input.variantId === 'string' && findVariant ? findVariant(input.variantId) : null;
    f = featuresOfPlan(plan.passes.map((p: any) => ({ workflow: p.workflow, graph: applyGgufVariant(structuredClone(p.graph), v) })));
  } catch { f = null; }
  if (fcache.size > 300) fcache.clear(); fcache.set(ck, f); return f;
}
/** One feature set for a multi-pass plan: the files of every pass, the steps summed, the size / cfg of the heaviest pass. */
export function featuresOfPlan(passes: { workflow: string; graph: Record<string, any> }[]): Features | null {
  if (!passes.length) return null; const fs = passes.map((p) => graphFeatures(p.graph, p.workflow));
  const big = fs.reduce((a, b) => ((b.pixels ?? 0) * b.frames * b.batch > (a.pixels ?? 0) * a.frames * a.batch ? b : a));
  return { ...big, workflows: [...new Set(fs.flatMap((x) => x.workflows))].sort(), models: [...new Set(fs.flatMap((x) => x.models))].sort(), loras: Math.max(...fs.map((x) => x.loras)),
    steps: fs.some((x) => x.steps == null) ? null : fs.reduce((a, x) => a + (x.steps ?? 0), 0), cfg2: fs.some((x) => x.cfg2) };
}

// ---- storage ----
let mem: StepSample[] | null = null; let canonSeen: ((k: string) => string) | null = null;
/** Old hardware keys of this computer read as its current key (hardware.ts hwKeyCanon: merge on read; the table is not rewritten). */
const rows = () => { mem ??= all<StepSample>('eta_steps'); const c = hwKeyCanon(); if (c !== canonSeen) { canonSeen = c; for (const r of mem) r.hwKey = c(r.hwKey); } return mem; };
/** The model files that were last loaded on this hardware (set at a run's first step and at its end), for the warm / cold call. */
let lastLoaded: { hwKey: string; modelsSig: string; at: number } | null = null;
export function noteLoaded(hwKey: string, modelsSig: string, at = Date.now()) { lastLoaded = { hwKey, modelsSig, at }; }
export function addSample(s: Omit<StepSample, 'id' | 'at'> & { id?: string; at?: number }): StepSample {
  const row = { ...s, id: s.id ?? `st${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: s.at ?? Date.now() } as StepSample;
  const rs = rows(); const old = rs.findIndex((r) => r.id === row.id); if (old >= 0) rs.splice(old, 1); rs.push(row); put('eta_steps', row.id, row);
  const same = rs.filter((r) => r.key === row.key && r.hwKey === row.hwKey).sort((a, b) => b.at - a.at);
  for (const o of same.slice(KEEP)) { del('eta_steps', o.id); rs.splice(rs.indexOf(o), 1); }
  return row;
}
export function resetSteps() { const n = rows().length; tx(() => { for (const r of rows()) del('eta_steps', r.id); }); mem = []; lastLoaded = null; fcache.clear(); return n; }
export const stepRows = () => [...rows()];

// ---- statistics ----
const median = (xs: number[]) => { if (!xs.length) return 0; const a = [...xs].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const mad = (xs: number[]) => { const m = median(xs); return median(xs.map((x) => Math.abs(x - m))); };
const rsd = (xs: number[]) => (xs.length < 2 ? 0 : 1.4826 * mad(xs));
/** Indexes of the values that are not outliers (from 3 values on). */
export function inliers(xs: number[]): number[] {
  const idx = xs.map((_, i) => i); if (xs.length < 3) return idx; const m = median(xs); const tol = Math.max(3 * 1.4826 * mad(xs), 0.5 * m);
  return idx.filter((i) => Math.abs(xs[i] - m) <= tol);
}
const keepVals = (xs: number[]) => inliers(xs).map((i) => xs[i]);

export function warmNow(hwKey: string, modelsSig: string, now = Date.now()): boolean {
  const latest = rows().filter((r) => r.hwKey === hwKey && r.at <= now).reduce<StepSample | null>((a, r) => (!a || r.at > a.at ? r : a), null);
  const c = [lastLoaded && lastLoaded.hwKey === hwKey ? lastLoaded : null, latest && { modelsSig: latest.modelsSig, at: latest.at }] /* a tie: the in-memory note wins */.filter(Boolean) as { modelsSig: string; at: number }[];
  const last = c.filter((x) => x.at <= now).sort((a, b) => b.at - a.at)[0]; return !!last && last.modelsSig === modelsSig && now - last.at < WARM_MS(); // only what ran before `now` (a run being recorded saw its own first step later)
}

const NONE = (source: EtaSource, key: string | null, reported: number | null): EtaRange => ({ seconds: reported, low: reported != null ? Math.round(reported * 0.7) : null, high: reported != null ? Math.round(reported * 1.4) : null,
  source, samples: 0, includesLoad: null, calibrating: true, loadSec: null, secondsPerStep: null, steps: null, postSec: null, key });
/** The estimate for a job with these features on this hardware. reportedSeconds: a published figure for this GPU class (timing.ts, cited only). */
export function estimateFor(f: Features | null, hwKey: string, o: { reportedSeconds?: number | null; now?: number } = {}): EtaRange {
  const rep = o.reportedSeconds != null && o.reportedSeconds > 0 ? Math.round(o.reportedSeconds) : null;
  if (!f) return NONE(rep != null ? 'reported' : 'first_run', null, rep);
  const k = keysOf(f); const R = rows().filter((r) => r.baseKey === k.baseKey && r.hwKey === hwKey && r.steps > 0 && r.units > 0);
  if (!R.length) return NONE(rep != null ? 'reported' : 'first_run', k.key, rep);
  const E = R.filter((r) => r.key === k.key); const U0 = E.length ? E : R;
  const rate0 = U0.map((r) => r.sampleSec / r.steps / r.units); const U = inliers(rate0).map((i) => U0[i]);
  const rates = U.map((r) => r.sampleSec / r.steps / r.units);
  const targetSteps = f.steps ?? Math.round(median(U.map((r) => r.steps)));
  const sampleVals = rates.map((r) => r * k.units * targetSteps);
  const kind: 'cold' | 'warm' = warmNow(hwKey, k.modelsSig, o.now) ? 'warm' : 'cold';
  const ofKind = R.filter((r) => r.loadKind === kind).map((r) => r.loadSec); const borrowed = !ofKind.length;
  const loadVals = keepVals(borrowed ? R.map((r) => r.loadSec) : ofKind);
  const postVals = keepVals(R.map((r) => r.postSec * (k.postUnits / (r.postUnits || 1))));
  const load = borrowed && kind === 'cold' ? Math.max(...loadVals) : borrowed ? Math.min(...loadVals) : median(loadVals);
  const sample = median(sampleVals); const post = median(postVals); const center = load + sample + post;
  const sameSteps = E.length > 0 && (f.steps == null || U.every((r) => r.steps === targetSteps));
  const scaled = !E.length || !sameSteps;
  const work = k.units * targetSteps; const refWork = median(U.map((r) => r.units * r.steps)) || work;
  const n = U.length; const rel = 0.3 / Math.sqrt(n) + (scaled ? 0.12 + 0.15 * Math.abs(Math.log(work / refWork)) : 0) + (borrowed ? 0.15 : 0);
  const spread = Math.sqrt(rsd(loadVals) ** 2 + rsd(sampleVals) ** 2 + rsd(postVals) ** 2);
  const half = Math.sqrt(spread ** 2 + (center * rel) ** 2);
  return { seconds: Math.max(1, Math.round(center)), low: Math.max(1, Math.floor(center - half)), high: Math.max(2, Math.ceil(center + half)), source: scaled ? 'scaled' : 'learned', samples: n,
    includesLoad: kind, calibrating: false, loadSec: Math.round(load * 10) / 10, secondsPerStep: Math.round(median(rates) * k.units * 1000) / 1000, steps: targetSteps, postSec: Math.round(post * 10) / 10, key: k.key };
}

// ---- recording ----
export interface PassTiming { workflow: string; graph: Record<string, any>; timing?: NativeTiming | null }
/** One row from a finished local job's passes. null when it can't be timed (no sampler steps seen, no timing from the transport). */
export function sampleFromRun(job: { id: string; toolId: string; finishedAt?: number }, hwKey: string, passes: PassTiming[], endAt = job.finishedAt ?? Date.now()): Omit<StepSample, 'at'> & { at: number } | null {
  const ts = passes.map((p) => p.timing); if (!ts.length || ts.some((t) => !t || t.firstStepAt == null || t.lastStepAt == null || !(t.steps > 0))) return null;
  const f = featuresOfPlan(passes.map((p) => ({ workflow: p.workflow, graph: p.graph }))); if (!f) return null; const k = keysOf(f);
  const t0 = ts[0]!; const start = t0.startedAt ?? t0.submittedAt;
  const loadSec = Math.max(0, (t0.firstStepAt! - start) / 1000); const sampleSec = ts.reduce((a, t) => a + Math.max(0, (t!.lastStepAt! - t!.firstStepAt!) / 1000), 0);
  const totalSec = Math.max(0, (endAt - start) / 1000); const postSec = Math.max(0, totalSec - loadSec - sampleSec); if (!(sampleSec > 0) || !(totalSec > 0)) return null;
  // warm when ComfyUI reused every loader node (execution_cached), else when the same model files ran within WARM_MS before this one
  const loaders = Object.entries<any>(passes[0].graph).filter(([, n]) => isLoaderClass(String(n?.class_type ?? '')) && !/lora/i.test(String(n?.class_type ?? ''))).map(([id]) => id);
  const cached = new Set(t0.cachedNodes ?? []); const cachedLoaders = loaders.length > 0 && loaders.every((id) => cached.has(id));
  const loadKind: 'cold' | 'warm' = cachedLoaders || warmNow(hwKey, k.modelsSig, start) ? 'warm' : 'cold';
  return { id: job.id, key: k.key, baseKey: k.baseKey, hwKey, modelsSig: k.modelsSig, label: `${job.toolId} · ${f.workflows.join(' + ')}`, toolId: job.toolId, steps: ts.reduce((a, t) => a + t!.steps, 0), graphSteps: f.steps,
    units: k.units, postUnits: k.postUnits, loadSec: r1(loadSec), loadKind, sampleSec: r1(sampleSec), postSec: r1(postSec), totalSec: r1(totalSec), at: endAt,
    factors: { pixels: f.pixels, frames: f.frames, batch: f.batch, cfg2: f.cfg2, loras: f.loras } };
}
const r1 = (x: number) => Math.round(x * 100) / 100;
/** runNative: record a finished local run (live backend only; demo / simulated jobs never). */
export function recordRun(job: { id: string; toolId: string; status: string; route?: string | null; routing?: any; simulated?: boolean; finishedAt?: number }, hwKey: string, passes: PassTiming[], endAt?: number): StepSample | null {
  if (!learnEnabled() || job.status !== 'done' || job.routing?.demo || job.simulated || !String(job.route ?? '').startsWith('local:')) return null;
  const s = sampleFromRun(job, hwKey, passes, endAt); if (!s) return null; const row = addSample(s); noteLoaded(hwKey, row.modelsSig, row.at); return row;
}
export function stepSummary() {
  const groups = new Map<string, StepSample[]>(); for (const r of rows()) { const g = `${r.key}#${r.hwKey}`; groups.set(g, [...(groups.get(g) ?? []), r]); }
  return { samples: rows().length, keep: KEEP, groups: [...groups.values()].map((rs) => ({ key: rs[0].key, hwKey: rs[0].hwKey, label: rs[0].label, samples: rs.length,
    secondsPerStep: Math.round(median(rs.map((r) => r.sampleSec / r.steps)) * 1000) / 1000, loadColdSec: rs.some((r) => r.loadKind === 'cold') ? median(rs.filter((r) => r.loadKind === 'cold').map((r) => r.loadSec)) : null,
    loadWarmSec: rs.some((r) => r.loadKind === 'warm') ? median(rs.filter((r) => r.loadKind === 'warm').map((r) => r.loadSec)) : null })) };
}
