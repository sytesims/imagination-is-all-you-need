/**
 * RunPod Serverless client for place-runpod: our ComfyUI graphs on the user's own RunPod endpoint running the official worker-comfyui image
 * (https://github.com/runpod-workers/worker-comfyui, AGPL-3.0: referenced only, no code copied). Same shape as ComfyNative / ComfyCloudV2
 * (upload / run / download), so comfy/runNative.ts runs our plans on it unchanged. Built from the docs (read 2026-11-06, no live call yet):
 *   submit  POST {base}/{endpoint}/run        {input: {workflow, images: [{name, image (base64)}]}} → {id, status}
 *   status  GET  {base}/{endpoint}/status/{id} → {id, status IN_QUEUE|IN_PROGRESS|COMPLETED|FAILED|CANCELLED|TIMED_OUT, delayTime, executionTime (ms),
 *                                                 output: {images: [{filename, type 'base64'|'s3_url', data}], errors?}, error?}
 *   cancel  POST {base}/{endpoint}/cancel/{id}
 *   auth    Authorization: Bearer <RunPod API key> (only on {base}; an S3 output link is fetched without it)
 * Docs: https://docs.runpod.io/serverless/endpoints/send-requests · worker-comfyui README (input / output format; before 5.0.0 the output was
 * output.message, still read here). A /run body is capped at 10 MB (20 MB on /runsync, not used): the body is measured before it is sent, and a
 * bigger one is refused with nothing sent. Results stay 30 minutes after a /run job ends, so outputs are saved at once.
 * Inputs: every file the graph names goes inline as base64 through the shared media hand-off (mediaHandoff.ts handOff(file, kind, 'runpod')).
 * Cost: RunPod bills GPU seconds; executionTime (ms) comes back on the status and the place turns it into dollars (place-runpod.ts).
 */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import type { NativeOutput, NativeProgress } from '../comfy/native.js';
import { PollTolerance, MISS, httpError, withDownloadRetry } from '../hostedPoll.js';
import { PlaceError } from '../services/places.js';
import { handOff, kindOfFile, RUNPOD_TOO_BIG_LINE } from '../mediaHandoff.js';

type Fetch = typeof fetch;
/** /run body cap (docs: 10 MB). Measured on the exact JSON we would send; 10^7 bytes keeps us on the safe side of either reading of "MB". */
export const RUNPOD_RUN_MAX_BYTES = 10_000_000;
export const RUNPOD_TOO_BIG = RUNPOD_TOO_BIG_LINE;
export const RUNPOD_KEY_REFUSED = 'RunPod key not accepted';
export type RunpodStatus = { id?: string; status?: string; delayTime?: number; executionTime?: number; output?: any; error?: unknown };
const trim = (b: string) => b.replace(/\/+$/, '');
const H = (key: string) => ({ Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });
export const runpodUrls = (base: string, endpoint: string, id = '') => { const e = `${trim(base)}/${encodeURIComponent(endpoint)}`; const i = encodeURIComponent(id); return { run: `${e}/run`, status: `${e}/status/${i}`, cancel: `${e}/cancel/${i}` }; };
const errText = (e: unknown): string => { if (!e) return ''; if (typeof e === 'string') return e; try { return String((e as any).message ?? JSON.stringify(e)); } catch { return String(e); } };

/** A refused request → our class (401 / 403: the key; 429 busy; 400 / 413 the body; 5xx RunPod's side). */
async function failHttp(where: string, r: Response): Promise<never> {
  const text = (await r.text().catch(() => '')).slice(0, 300);
  if (r.status === 401 || r.status === 403) throw new PlaceError(RUNPOD_KEY_REFUSED, 'unknown', { status: r.status, temporary: false });
  if (r.status === 404) throw new PlaceError(`RunPod couldn’t find this endpoint (${where}). Check the Endpoint ID in Settings → Connections`, 'bad_input', { status: 404, temporary: false });
  if (r.status === 413) throw new PlaceError(RUNPOD_TOO_BIG, 'bad_input', { status: 413, temporary: false });
  if (r.status === 429) throw new PlaceError('RunPod is busy right now (too many requests). Try again in a minute', 'rate_limited', { status: 429 });
  if (r.status === 400 || r.status === 422) throw new PlaceError(`RunPod refused the request: ${text || r.status}`, 'bad_input', { status: r.status, temporary: false });
  throw new PlaceError(`RunPod ${where} ${r.status}${text ? `: ${text}` : ''}`, r.status >= 500 ? 'provider_down' : 'unknown', { status: r.status, temporary: r.status >= 500 });
}

/** Ask RunPod to cancel a job (never throws): true accepted (or already gone), false not confirmed. */
export async function runpodCancel(base: string, endpoint: string, id: string, key: string, f: Fetch = fetch): Promise<boolean> {
  try { const r = await f(runpodUrls(base, endpoint, id).cancel, { method: 'POST', headers: H(key) }); return r.ok || r.status === 404; } catch { return false; }
}
export async function runpodStatus(base: string, endpoint: string, id: string, key: string, f: Fetch = fetch): Promise<RunpodStatus> {
  const r = await f(runpodUrls(base, endpoint, id).status, { headers: H(key) });
  if (r.status === 401 || r.status === 403) throw new PlaceError(RUNPOD_KEY_REFUSED, 'unknown', { status: r.status, temporary: false });
  if (!r.ok) throw httpError(`RunPod status ${r.status}`, r.status); return r.json() as Promise<RunpodStatus>;
}

/** One output file worker-comfyui sent back (inline base64 or an S3 link). */
export interface RunpodFile { filename: string; b64?: string; url?: string }
/** output.images (5.x) or output.message (before 5.0.0: one base64 string or link). */
export function runpodFiles(output: any): RunpodFile[] {
  const out: RunpodFile[] = [];
  for (const x of Array.isArray(output?.images) ? output.images : []) {
    const data = typeof x?.data === 'string' ? x.data : typeof x?.image === 'string' ? x.image : null; if (!data) continue;
    const name = String(x?.filename ?? `output_${out.length}.png`);
    if (x?.type === 's3_url' || /^https?:\/\//.test(data)) out.push({ filename: name, url: data }); else out.push({ filename: name, b64: data.replace(/^data:[^;]+;base64,/, '') });
  }
  if (!out.length && typeof output?.message === 'string' && output.message) { const m = output.message; out.push(/^https?:\/\//.test(m) ? { filename: path.basename(new URL(m).pathname) || 'output.png', url: m } : { filename: 'output.png', b64: m.replace(/^data:[^;]+;base64,/, '') }); }
  return out;
}
const STILL = /\.(png|jpe?g|webp|gif|bmp)$/i; const AUDIO = /\.(wav|mp3|flac|ogg|m4a)$/i;
const kindOf = (f: string) => (STILL.test(f) ? 'images' : AUDIO.test(f) ? 'audio' : 'videos');
const SAVE = /^(Save\w+|VHS_VideoCombine|PreviewImage)$/; // SaveImage, SaveImageAdvanced, SaveVideo, SaveAudio…
/** worker-comfyui returns files without their node: give each to the save node whose filename_prefix it starts with (ComfyUI names files
 *  `<prefix>_00001_.png`); a file no prefix claims goes to every save node (a one-output graph, the usual case). */
export function filesByNode(graph: Record<string, any>, files: RunpodFile[]): Record<string, (NativeOutput & RunpodFile)[]> {
  const saves = Object.entries(graph).filter(([, n]) => SAVE.test(String(n?.class_type ?? ''))).map(([id, n]) => ({ id, prefix: typeof n?.inputs?.filename_prefix === 'string' ? path.basename(n.inputs.filename_prefix) : '' }));
  const out: Record<string, (NativeOutput & RunpodFile)[]> = {};
  for (const f of files) {
    const rec = { ...f, subfolder: '', type: 'output', kind: kindOf(f.filename) };
    const owner = saves.filter((s) => s.prefix && f.filename.startsWith(`${s.prefix}_`)).sort((a, b) => b.prefix.length - a.prefix.length)[0];
    for (const s of owner ? [owner] : saves) (out[s.id] ??= []).push(rec);
  }
  return out;
}

export interface RunpodOpts { base: string; endpoint: string; key: string; f?: Fetch; pollMs?: number; sleep?: (ms: number) => Promise<void>;
  /** A job from before a restart: only polled, never sent again (one-pass graphs only; the caller checks). */ resumeId?: string | null;
  /** GPU time RunPod reports for each job that ends (executionTime, ms), finished or failed. */ onExecution?: (ms: number) => void;
  /** worker-comfyui's non-fatal notes (output.errors: an S3 upload that fell back to base64…). */ onWarning?: (w: string) => void }

/** ComfyTransport (comfy/runNative.ts) on a RunPod worker-comfyui endpoint. */
export class RunpodComfy {
  private files = new Map<string, string>(); private n = 0; private resumeId: string | null;
  constructor(private readonly o: RunpodOpts) { this.resumeId = o.resumeId ?? null; }
  private get f(): Fetch { return this.o.f ?? fetch; }
  /** Nothing is sent here: the file goes inline with the job that uses it (each job may land on a fresh worker). Returns the name the graph uses. */
  async upload(file: string): Promise<string> {
    const name = `iiayn_${this.n++}_${path.basename(file).replace(/[^\w.-]/g, '_')}`; this.files.set(name, file); return name;
  }
  /** The /run body for this graph, with every input file it names; throws RUNPOD_TOO_BIG (nothing sent) over the 10 MB cap. */
  async body(workflow: Record<string, any>): Promise<string> {
    const g = JSON.stringify(workflow); const images: { name: string; image: string }[] = [];
    for (const [name, file] of this.files) if (g.includes(JSON.stringify(name))) images.push({ name, image: await handOff(file, kindOfFile(file), 'runpod') });
    const body = JSON.stringify({ input: { workflow, ...(images.length ? { images } : {}) } });
    if (Buffer.byteLength(body) > RUNPOD_RUN_MAX_BYTES) throw new PlaceError(RUNPOD_TOO_BIG, 'bad_input', { status: 400, temporary: false });
    return body;
  }
  async run(workflow: Record<string, any>, o: { onProgress?: (p: NativeProgress) => void; onSubmitted?: (id: string) => void; isCanceled?: () => boolean; timeoutMs?: number | null } = {}) {
    const { base, endpoint, key } = this.o; const sleep = this.o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    let id = this.resumeId; this.resumeId = null;
    if (!id) {
      const body = await this.body(workflow); // measured before anything is sent
      let r: Response; try { r = await this.f(runpodUrls(base, endpoint).run, { method: 'POST', headers: H(key), body }); }
      catch (e) { throw new PlaceError(`RunPod could not be reached, so the job was not sent (${errText(e).slice(0, 120)})`, 'provider_down', { temporary: true }); }
      if (!r.ok) await failHttp('submit', r);
      id = String(((await r.json().catch(() => null)) as any)?.id ?? '');
      if (!id) throw new PlaceError('RunPod answered without a job id, so it was not sent again', 'unknown', { temporary: false });
      o.onSubmitted?.(id);
    }
    const total = Object.keys(workflow).length; const tol = new PollTolerance('RunPod'); const pollMs = this.o.pollMs ?? 2000;
    const net = o.timeoutMs ?? 2 * 60 * 60_000; const t0 = Date.now(); let weCanceled = false;
    const progress = (phase: 'queued' | 'generating') => o.onProgress?.({ node: null, value: 0, max: 1, done: 0, total, percent: 0, known: false, phase });
    for (;;) {
      if (o.isCanceled?.()) { weCanceled = true; await runpodCancel(base, endpoint, id, key, this.f); throw new Error('canceled'); }
      if (Date.now() - t0 > net) { await runpodCancel(base, endpoint, id, key, this.f); const e = new PlaceError(`RunPod kept running past ${Math.round(net / 60_000)} min, so it was cancelled`, 'unknown', { temporary: false }); (e as any).timeout = true; throw e; }
      const s = await tol.read(() => runpodStatus(base, endpoint, id!, key, this.f));
      if (s !== MISS) {
        const st = String(s.status ?? '');
        if (st === 'IN_QUEUE') progress('queued');
        else if (st === 'IN_PROGRESS') progress('generating');
        else {
          if (Number.isFinite(Number(s.executionTime)) && Number(s.executionTime) > 0) this.o.onExecution?.(Number(s.executionTime));
          if (st === 'COMPLETED') {
            for (const w of Array.isArray(s.output?.errors) ? s.output.errors : []) this.o.onWarning?.(String(w).slice(0, 300));
            if (s.output?.error || s.output?.status === 'error') throw new PlaceError(`RunPod: the workflow failed: ${errText(s.output.error ?? s.output.message).slice(0, 300)}`, 'unknown', { temporary: false });
            const files = runpodFiles(s.output); if (!files.length) throw new PlaceError('RunPod returned no output', 'unknown', { temporary: false });
            o.onProgress?.({ node: null, value: 1, max: 1, done: total, total, percent: 100, known: true, phase: 'finishing' });
            return { promptId: id, outputs: filesByNode(workflow, files) as Record<string, NativeOutput[]> };
          }
          if (st === 'FAILED') throw new PlaceError(`RunPod: the workflow failed${errText(s.error) ? `: ${errText(s.error).slice(0, 300)}` : ''}`, 'unknown', { temporary: false });
          if (st === 'TIMED_OUT') { const e = new PlaceError('RunPod stopped the job at the endpoint’s time limit', 'unknown', { temporary: false }); (e as any).timeout = true; throw e; }
          if (st === 'CANCELLED') throw new Error(weCanceled || o.isCanceled?.() ? 'canceled' : 'RunPod cancelled the job');
          // an unknown status: keep polling the same id
        }
      }
      await sleep(tol.wait(pollMs));
    }
  }
  /** Inline base64 → the file; an S3 link → fetched without the RunPod key, a few tries (hostedPoll.ts). */
  async download(o: NativeOutput & RunpodFile, dest: string): Promise<string> {
    if (o.b64) { await writeFile(dest, Buffer.from(o.b64, 'base64')); return dest; }
    if (!o.url) throw new PlaceError('RunPod returned a result without data', 'unknown', { temporary: false });
    return withDownloadRetry('RunPod', async () => {
      const r = await this.f(o.url!); if (!r.ok) throw httpError(`RunPod output ${r.status}`, r.status);
      await writeFile(dest, Buffer.from(await r.arrayBuffer())); return dest;
    });
  }
}
