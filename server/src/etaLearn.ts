/**
 * HW-SHAPES B5 (Oct 19 2026): ETA learned from this user's own finished runs.
 *  - Table eta_samples (id = job id): {key, hwKey, renderSec, downloadSec, loadSec, bytesDownloaded, bytesLoaded, units, at}.
 *    key = toolId|routeId|resBucket|durBucket; hwKey = the GPU (hardware.ts hwKeyOf) for local routes, 'cloud' for every other route.
 *  - Recorded for done, non-demo jobs on a live backend (the mock backend only with OPENHIGGSFIELD_ETA_LEARN_MOCK=1, for tests).
 *  - Last 20 per (key, hwKey); at least 3 samples; samples above 3× the median are dropped.
 *  - Blend: learned = median(renderSec / units) × units; w = min(1, n / 8); eta = w·learned + (1 − w)·estimate. A null estimate uses the
 *    learned value once n ≥ 3. source 'learned' when n ≥ 3, else 'estimate'; null estimate and n < 3 → seconds null ("first run on this computer").
 *  - Download / load rates per hwKey in kv 'eta.rates' (median of the last 20); defaults 25 MB/s download, 0.5 GB/s load (ESTIMATE).
 *  - DELETE /api/eta/learned clears all of it (resetLearned), including the per-step local timings (stepEta.ts, table eta_steps).
 *  - Local routes now estimate from stepEta.ts (load + steps × seconds per step + post); these samples stay for cloud routes and as a fallback.
 */
import { all, put, del, tx, getKv, setKv } from './db.js';
import { config } from './config.js';
import { env } from './env.js';
import { resetSteps, stepRows, stepSummary } from './stepEta.js';
import { hwKeyCanon } from './hardware.js';

export interface EtaSample { id: string; key: string; hwKey: string; renderSec: number; downloadSec: number; loadSec: number; bytesDownloaded: number; bytesLoaded: number; units: number; at: number }
export interface Eta { seconds: number | null; source: 'learned' | 'estimate'; samples: number; estimateSeconds: number | null; learnedSeconds: number | null; hwKey: string; includesFirstUse: boolean }
export const MIN_SAMPLES = 3; export const KEEP = 20; export const DEFAULT_DOWNLOAD_BPS = 25e6; export const DEFAULT_LOAD_BPS = 0.5e9;

const resBucket = (i: Record<string, any>, image: boolean) => { if (image) { const r = String(i.imageResolution ?? i.resolution ?? '1K'); return /4K|4k|2K|2k/.test(r) ? 'img-4MP' : 'img-1MP'; } const q = String(i.resolution ?? i.quality ?? '720p'); return /1080|4k/i.test(q) ? '1080p' : /480/.test(q) ? '480p' : '720p'; };
const durBucket = (i: Record<string, any>, image: boolean) => { if (image) return 'image'; const d = Number(i.duration) || 5; return d <= 5 ? '≤5s' : d <= 10 ? '≤10s' : '>10s'; };
/** Output units: seconds of video, or images (× passes) for image/audio tools. */
export const unitsOf = (i: Record<string, any>, image: boolean, passes = 1) => (image ? Math.max(1, Number(i.n) || 1) * Math.max(1, passes) : Math.max(1, Number(i.duration) || 5) * Math.max(1, passes));
export const isImageJob = (i: Record<string, any>, tool?: { gpuSecPerSec?: Record<string, number> }) => i.outKind === 'image' || (!i.videoPath && !(Number(i.duration) > 0) && !tool?.gpuSecPerSec?.['480p']);
export const etaKey = (toolId: string, routeId: string, i: Record<string, any>, image: boolean) => `${toolId}|${routeId}|${resBucket(i, image)}|${durBucket(i, image)}`;

let mem: EtaSample[] | null = null; let canonSeen: ((k: string) => string) | null = null;
/** Rows with old hardware keys of this computer read as its current key (hardware.ts hwKeyCanon: merge on read; the table is not rewritten). */
const load = () => { mem ??= all<EtaSample>('eta_samples'); const c = hwKeyCanon(); if (c !== canonSeen) { canonSeen = c; for (const r of mem) r.hwKey = c(r.hwKey); } return mem; };
export function addSample(s: Omit<EtaSample, 'id' | 'at'> & { id?: string; at?: number }) {
  const row: EtaSample = { id: s.id ?? `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: s.at ?? Date.now(), ...s } as EtaSample;
  const rows = load(); rows.push(row); put('eta_samples', row.id, row);
  const same = rows.filter((r) => r.key === row.key && r.hwKey === row.hwKey).sort((a, b) => b.at - a.at);
  for (const old of same.slice(KEEP)) { del('eta_samples', old.id); rows.splice(rows.indexOf(old), 1); }
  if (s.bytesDownloaded > 0 && s.downloadSec > 0) pushRate(row.hwKey, 'download', s.bytesDownloaded / s.downloadSec);
  if (s.bytesLoaded > 0 && s.loadSec > 0) pushRate(row.hwKey, 'load', s.bytesLoaded / s.loadSec);
  return row;
}
const median = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
/** Seconds per unit from the samples (outliers > 3× median dropped), and how many samples count. */
export function learned(key: string, hwKey: string): { n: number; perUnit: number | null } {
  const xs = load().filter((r) => r.key === key && r.hwKey === hwKey && r.units > 0 && r.renderSec > 0).map((r) => r.renderSec / r.units);
  if (!xs.length) return { n: 0, perUnit: null }; const m0 = median(xs); const kept = xs.filter((x) => x <= 3 * m0);
  return { n: kept.length, perUnit: median(kept) };
}
export function blend(estimateSeconds: number | null, key: string, hwKey: string, units: number, firstUse = false): Eta {
  const L = learned(key, hwKey); const ls = L.perUnit == null ? null : Math.round(L.perUnit * units);
  const enough = L.n >= MIN_SAMPLES && ls != null;
  let seconds: number | null;
  if (enough && estimateSeconds == null) seconds = ls; else if (enough) { const w = Math.min(1, L.n / 8); seconds = Math.round(w * ls! + (1 - w) * estimateSeconds!); } else seconds = estimateSeconds;
  return { seconds, source: enough ? 'learned' : 'estimate', samples: L.n, estimateSeconds, learnedSeconds: enough ? ls : null, hwKey, includesFirstUse: firstUse };
}
type Rates = Record<string, { download: number[]; load: number[] }>;
export function pushRate(hwKey: string, kind: 'download' | 'load', bps: number) { const r = getKv<Rates>('eta.rates', {}); const e = (r[hwKey] ??= { download: [], load: [] }); e[kind] = [...e[kind], bps].slice(-KEEP); setKv('eta.rates', r); }
export function rateOf(hwKey: string, kind: 'download' | 'load'): { bps: number; source: 'learned' | 'estimate' } {
  const c = hwKeyCanon(); const xs = Object.entries(getKv<Rates>('eta.rates', {})).filter(([k]) => c(k) === hwKey).flatMap(([, v]) => v?.[kind] ?? []).slice(-KEEP); return xs.length ? { bps: median(xs), source: 'learned' } : { bps: kind === 'download' ? DEFAULT_DOWNLOAD_BPS : DEFAULT_LOAD_BPS, source: 'estimate' };
}
export const learnEnabled = () => config.backend !== 'mock' || /^(1|true)$/i.test(env('ETA_LEARN_MOCK') ?? '');
/** queue.ts settle(): one sample per done, non-demo job. stageTimes (jobs.ts) split download / load from render. */
export async function recordJob(job: any) {
  if (!learnEnabled() || job.status !== 'done' || job.routing?.demo || !job.startedAt || !job.finishedAt || !job.route) return null;
  const st = job.stageTimes ?? {}; const d = st.downloading_model; const l = st.loading_model;
  const downloadSec = d?.end && d?.start ? (d.end - d.start) / 1000 : 0; const loadSec = l?.end && l?.start ? (l.end - l.start) / 1000 : 0;
  const renderFrom = l?.end ?? d?.end ?? job.startedAt; const renderSec = (job.finishedAt - renderFrom) / 1000; if (!(renderSec > 0)) return null;
  const { getTool } = await import('./tools/registry.js'); const tool = getTool(job.toolId); const image = isImageJob(job.input ?? {}, tool as any);
  const local = String(job.route).startsWith('local:'); const { hwKeyOf } = await import('./hardware.js');
  return addSample({ id: job.id, key: etaKey(job.toolId, job.route, job.input ?? {}, image), hwKey: local ? hwKeyOf() : 'cloud', renderSec, downloadSec, loadSec,
    bytesDownloaded: Number(job.stageDetail?.downloadedBytes ?? d?.bytes ?? 0) || 0, bytesLoaded: Number(l?.bytes ?? 0) || 0, units: unitsOf(job.input ?? {}, image) });
}
export function resetLearned() { const n = load().length; tx(() => { for (const r of load()) del('eta_samples', r.id); }); mem = []; const rates = Object.keys(getKv<Rates>('eta.rates', {})).length; setKv('eta.rates', {}); const steps = resetSteps(); return { cleared: n + steps, samplesCleared: n, stepsCleared: steps, ratesCleared: rates }; }
/** samples = timed runs (a local run counts once even though both tables keep a row for it). */
export function learnedSummary() { const rows = load(); const runs = new Set([...rows.map((r) => r.id), ...stepRows().map((r) => r.id)]).size; const groups = new Map<string, number>(); for (const r of rows) groups.set(`${r.key}#${r.hwKey}`, (groups.get(`${r.key}#${r.hwKey}`) ?? 0) + 1);
  return { samples: runs, groups: [...groups].map(([k, n]) => { const [key, hwKey] = k.split('#'); const L = learned(key, hwKey); return { key, hwKey, samples: n, used: L.n, secondsPerUnit: L.perUnit == null ? null : Math.round(L.perUnit * 100) / 100 }; }), minSamples: MIN_SAMPLES, keep: KEEP, runs, steps: stepSummary() }; }
