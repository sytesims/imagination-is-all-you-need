/**
 * HW-SHAPES B4: the first-use stages of a LOCAL job, before the render:
 *  - downloading_model: only when the job asked for it (downloadWeights=1, Q4: never automatic) and the files are missing → the shared downloader
 *    (downloads.ts) moves them; job.stageDetail mirrors its progress {bytesTotal, bytesDone, etaSeconds, files[]}.
 *    Mock backend without a models folder: a 2 s simulated download (bytesDone rising, etaSeconds falling) when a test marked files missing
 *    (setMissingWeights), OPENHIGGSFIELD_MOCK_FIRST_RUN=1 or downloadWeights=1.
 *  - loading_model: mock 1 s; real runs set it from the ComfyUI loader node (comfy/runNative.ts).
 * Nothing here runs for cloud routes or a normal mock run (the default 8 s mock timing is unchanged).
 */
import { env } from '../env.js';
import type { Job } from '../jobs.js';
import { getTool } from '../tools/registry.js';
import { modelsDir, requirementsFor, setMissingWeights, missingOverrideFor } from './requirements.js';
import { startDownload, waitDownload, getDownload, DlError, type Download } from './downloads.js';
import { hwKeyOf } from '../hardware.js';
import { rateOf } from '../etaLearn.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const yes = (v: unknown) => /^(1|true|on|yes)$/i.test(String(v ?? ''));
const mark = (job: Job, stage: string, edge: 'start' | 'end', bytes?: number) => { const st = (job.stageTimes ??= {}); const e = (st[stage] ??= { start: Date.now() }); if (edge === 'end') e.end = Date.now(); if (bytes != null) e.bytes = bytes; };

/** Missing weight files of this local job (pack auto-downloads excluded); null = cloud route or unknown. */
export function jobMissing(job: Job) {
  if (!String(job.route ?? '').startsWith('local:')) return null; const tool = getTool(job.toolId); if (!tool) return null;
  const req = requirementsFor(tool, String(job.route).slice(6), job.input ?? {}); if (!req) return null;
  return { req, files: (req.missingFiles ?? []).filter((f) => !f.autoDownloaded) };
}
export function needsPrePhase(job: Job, mock: boolean): boolean {
  if (!String(job.route ?? '').startsWith('local:') || job.stageTimes?.downloading_model) return false; // once per job (multi-pass tools call the runner again)
  if (mock && (yes(env('MOCK_FIRST_RUN')) || missingOverrideFor(String(job.route)))) return true;
  if (!yes(job.input?.downloadWeights)) return false; const m = jobMissing(job); return !!m && m.files.length > 0;
}
const detail = (job: Job, stage: 'downloading_model' | 'loading_model', d: Partial<NonNullable<Job['stageDetail']>>) => {
  const prev = job.stageDetail?.stage === stage ? job.stageDetail : null; // a new stage starts from a clean detail
  job.stageDetail = { bytesTotal: null, bytesDone: null, etaSeconds: null, rateBytesPerSec: null, rateSource: 'estimate', files: [], firstUse: true, message: '', ...prev, ...d, stage } as any; job.stage = stage; job.updatedAt = Date.now(); };

/** Run the pre-render stages; throws (plain message) when a download fails or is canceled. */
export async function prePhase(job: Job, mock: boolean, renderSec = 0): Promise<void> {
  if (!needsPrePhase(job, mock)) return;
  const m = jobMissing(job); const providerId = String(job.route).slice(6); const files = m?.files ?? [];
  const total = files.length ? files.reduce((a, f) => a + (f.bytes ?? 0), 0) : m?.req.downloadBytes ?? 0;
  const dl = rateOf(hwKeyOf(), 'download'); const ld = rateOf(hwKeyOf(), 'load');
  job.status = 'running'; job.queuePos = 0;
  const useDownloader = !!modelsDir() && files.length > 0 && files.every((f) => !!f.url) && yes(job.input?.downloadWeights);
  if (useDownloader) {
    const variantId = typeof job.input?.variantId === 'string' ? job.input.variantId : null; const runs: Download[] = [];
    const vfile = variantId ? m!.req.variants.find((v) => v.id === variantId)?.file : null;
    try {
      if (vfile && files.some((f) => f.file === vfile)) runs.push(startDownload({ variantId, jobId: job.id }));
      const rest = files.filter((f) => f.file !== vfile).map((f) => f.file); if (rest.length) runs.push(startDownload({ providerId, files: rest, jobId: job.id }));
    } catch (e) { throw new Error(e instanceof DlError ? `${e.message} Credits went back to your balance.` : String(e)); }
    mark(job, 'downloading_model', 'start'); (job as any).downloadIds = runs.map((r) => r.id);
    const tick = setInterval(() => { const ds = runs.map((r) => getDownload(r.id) ?? r); const bt = ds.reduce((a, d) => a + d.bytesTotal, 0); const bd = ds.reduce((a, d) => a + d.bytesDone, 0);
      const rate = ds.find((d) => d.rateBytesPerSec)?.rateBytesPerSec ?? null; const eta = rate ? Math.ceil((bt - bd) / rate) : Math.ceil((bt - bd) / dl.bps);
      detail(job, 'downloading_model', { bytesTotal: bt, bytesDone: bd, etaSeconds: eta, rateBytesPerSec: rate ?? Math.round(dl.bps), rateSource: rate ? 'learned' : dl.source, files: ds.flatMap((d) => d.files.map((f) => ({ file: f.file, bytesTotal: f.bytesTotal, bytesDone: f.bytesDone }))),
        message: 'Downloading the model files (first use only)', downloadId: ds[0]?.id ?? null });
      job.eta = eta + renderSec; job.progress = 0; }, 250);
    try { for (const r of runs) { const end = await waitDownload(r.id); if (job.status !== 'running') { for (const x of runs) (await import('./downloads.js')).cancelDownload(x.id); throw new Error('canceled'); }
      if (!end || end.status !== 'done') throw new Error(`The model download ${end?.status === 'canceled' ? 'was canceled' : `failed${end?.error ? ` (${end.error})` : ''}`}. Credits went back to your balance.`); } }
    finally { clearInterval(tick); }
    mark(job, 'downloading_model', 'end', total); if (job.stageDetail) job.stageDetail.downloadedBytes = total;
    if (!mock) { job.stageDetail = null; return; } // real runs: loading_model comes from the ComfyUI loader node
  } else if (mock) {
    const ms = 2000; const t0 = Date.now(); mark(job, 'downloading_model', 'start');
    while (Date.now() - t0 < ms) { if (job.status !== 'running') return; const f = (Date.now() - t0) / ms; const bd = Math.floor(total * f);
      detail(job, 'downloading_model', { bytesTotal: total, bytesDone: bd, etaSeconds: Math.max(0, Math.ceil((ms - (Date.now() - t0)) / 1000)), rateBytesPerSec: Math.round(total / (ms / 1000)), rateSource: 'estimate',
        files: files.map((x) => ({ file: x.file, bytesTotal: x.bytes, bytesDone: Math.floor((x.bytes ?? 0) * f) })), message: 'Downloading the model files (first use only, mock)' });
      job.eta = Math.ceil((ms - (Date.now() - t0)) / 1000) + 1 + renderSec; job.progress = 0; await sleep(100); }
    detail(job, 'downloading_model', { bytesDone: total, etaSeconds: 0, downloadedBytes: total }); mark(job, 'downloading_model', 'end', total); setMissingWeights(String(job.route), null);
  } else return;
  // mock loading_model (1 s)
  const t1 = Date.now(); mark(job, 'loading_model', 'start'); const loadBytes = m?.req.downloadBytes ?? total;
  while (Date.now() - t1 < 1000) { if (job.status !== 'running') return; detail(job, 'loading_model', { bytesTotal: loadBytes, bytesDone: Math.floor(loadBytes * ((Date.now() - t1) / 1000)), etaSeconds: 1, rateBytesPerSec: Math.round(ld.bps), rateSource: ld.source, message: 'Loading the model into memory' });
    job.eta = 1 + renderSec; await sleep(100); }
  mark(job, 'loading_model', 'end', loadBytes);
  job.etaBreakdown = { downloadSec: Math.round(((job.stageTimes?.downloading_model?.end ?? 0) - (job.stageTimes?.downloading_model?.start ?? 0)) / 1000), loadSec: 1, renderSec };
  job.stageDetail = null;
}
/** Real runs: the ComfyUI loader node is executing → loading_model (bytes = the job's weights, rate learned per hardware). */
export function loaderStage(job: Job, on: boolean) {
  if (on) { if (job.stageTimes?.loading_model?.start && !job.stageTimes.loading_model.end) return; mark(job, 'loading_model', 'start'); const m = jobMissing(job); const ld = rateOf(hwKeyOf(), 'load'); const b = m?.req.downloadBytes ?? null;
    detail(job, 'loading_model', { bytesTotal: b, bytesDone: null, etaSeconds: b ? Math.ceil(b / ld.bps) : null, rateBytesPerSec: Math.round(ld.bps), rateSource: ld.source, firstUse: false, message: 'Loading the model into memory' }); }
  else if (job.stageTimes?.loading_model && !job.stageTimes.loading_model.end) { mark(job, 'loading_model', 'end', jobMissing(job)?.req.downloadBytes ?? undefined); job.stageDetail = null; }
}
