/**
 * HW-SHAPES Q4 (approved Oct 19 2026): one-click download of a local model's weight files (or one lighter variant) into the connected ComfyUI's
 * models folder (COMFY_MODELS_DIR / <folder> / <file>), from the manifest's existing URLs. Never automatic: only POST /api/local/downloads or a job
 * submitted with downloadWeights=1 (its downloading_model stage reuses this downloader).
 *  - Refuses (409 not_enough_disk) when the missing bytes exceed the free disk; 409 no_models_dir when no models folder is known.
 *  - Real transport: fetch → <file>.part, resume with Range, sha256 checked when the manifest has one, then rename. Civitai URLs send
 *    Authorization: Bearer $CIVITAI_TOKEN, huggingface.co URLs the Hugging Face read token (authFor), only when set; tokens are never logged,
 *    stored or returned. A 401/403 from Hugging Face → errorCode 'hf_gated' + helpUrl (the model page: accept the licence, then connect).
 *  - Mock transport (mock backend, tests): no network; ticks progress over OPENHIGGSFIELD_DOWNLOAD_MOCK_MS (default 2000) and writes a tiny
 *    placeholder file (≤ 1 KB), never a real-sized or sparse one. setDownloadTransport() injects another one (tests: httpTransport + a mock fetch).
 *  - Refuses unless an explicit models folder is configured (OPENHIGGSFIELD_COMFY_MODELS_DIR) and exists.
 *  - HW2 (DP, Oct 19): downloadId (requirements.downloadId / fit.downloadId) names exactly one route's files; a providerId alone is refused with
 *    400 ambiguous_download {choices[]} when the provider (comfy-open) serves several model families. downloadCheck() is the shared pre-flight
 *    (dry run: canDownload + code even without a models folder, missingBytes assumed = every file).
 *  - Progress shape = the job stage detail: { bytesTotal, bytesDone, etaSeconds, rateBytesPerSec, files[] }. State persists in kv 'local.downloads'.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, statSync, statfsSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { getKv, setKv } from '../db.js';
import { env } from '../env.js';
import { getProvider } from '../providers.js';
import { getTool, listTools } from '../tools/registry.js';
import { workflowDownloadRows } from '../workflowModels.js';
import { forgetComfyLoaderOptions } from '../comfyNodes.js';
import { cardName } from '../models.js';
import { weightsHere } from './variants.js';
import { findVariant, manifest, modelsDir, setMissingWeights, clearRequirementsCache, downloadIdFor, parseDownloadId, jobWorkflows, QUALITY_WORKFLOWS } from './requirements.js';
import { pushRate } from '../etaLearn.js';
import { hwKeyOf, diskInfo, displayDir } from '../hardware.js';

export interface DlFile { file: string; folder: string; url: string | null; bytesTotal: number | null; bytesDone: number; sha256: string | null; status: 'queued' | 'downloading' | 'done' | 'skipped' | 'failed' | 'canceled' }
export interface Download { id: string; providerId: string | null; variantId: string | null; downloadId?: string | null; jobId: string | null; label: string; status: 'queued' | 'downloading' | 'done' | 'failed' | 'canceled';
  bytesTotal: number; bytesDone: number; etaSeconds: number | null; rateBytesPerSec: number | null; files: DlFile[]; modelsDir: string; createdAt: number; startedAt: number | null; endedAt: number | null; error: string | null;
  /** Setup step 3: 'hf_gated' when Hugging Face refused a gated file (helpUrl = its model page, where the licence is accepted). */ errorCode?: string | null; helpUrl?: string | null }
export interface Transport { name: string; fetch(f: DlFile, dest: string, onBytes: (done: number) => void, signal: AbortSignal): Promise<void> }
export class DlError extends Error { constructor(public code: 'not_enough_disk' | 'no_models_dir' | 'not_found' | 'nothing_to_download' | 'no_url' | 'bad_request' | 'ambiguous_download', msg: string, public extra: Record<string, any> = {}) { super(msg); } }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Mock transport: no network, no real-sized files. Ticks progress over OPENHIGGSFIELD_DOWNLOAD_MOCK_MS (default 2000) against the manifest size, then writes a
 *  TINY placeholder (≤ 1 KB, text) so "is it on disk" checks see the file. Never a sparse or full-size file: box snapshots would materialise it. */
export const MOCK_PAYLOAD_MAX = 1024;
const mockTransport: Transport = { name: 'mock', async fetch(f, dest, onBytes, signal) {
  const total = f.bytesTotal ?? 1_000_000; const ms = Math.max(50, Number(env('DOWNLOAD_MOCK_MS')) || 2000); const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (signal.aborted) throw new Error('canceled'); onBytes(Math.floor((total * (Date.now() - t0)) / ms)); await sleep(100); }
  mkdirSync(path.dirname(dest), { recursive: true }); writeFileSync(`${dest}.part`, `openhiggsfield mock weights placeholder: ${f.file} (${total} bytes in the manifest)\n`.slice(0, MOCK_PAYLOAD_MAX));
  renameSync(`${dest}.part`, dest); onBytes(total);
} };
/** Auth header for a download: CIVITAI_TOKEN to civitai.com, the Hugging Face read token (Settings → Connections, OPENHIGGSFIELD_HF_TOKEN or HF_TOKEN)
 *  to huggingface.co only (exact host; fetch drops Authorization on the redirect to HF's file CDN). Never logged, stored or returned. */
export const hfToken = () => process.env.OPENHIGGSFIELD_HF_TOKEN?.trim() || process.env.HF_TOKEN?.trim() || null;
export const authFor = (url: string): Record<string, string> => { try { const h = new URL(url).hostname.toLowerCase(); const civ = process.env.CIVITAI_TOKEN?.trim(); const hf = hfToken();
  if (/(^|\.)civitai\.com$/.test(h) && civ) return { Authorization: `Bearer ${civ}` }; if (h === 'huggingface.co' && hf) return { Authorization: `Bearer ${hf}` }; return {}; } catch { return {}; } };
/** A gated / private Hugging Face file answered 401 or 403: the model page (https://huggingface.co/<org>/<repo>) where its licence is accepted. */
export const hfModelPage = (url: string): string | null => { try { const u = new URL(url); if (u.hostname.toLowerCase() !== 'huggingface.co') return null; const [org, repo] = u.pathname.split('/').filter(Boolean); return org && repo ? `https://huggingface.co/${org}/${repo}` : null; } catch { return null; } };
export class GatedDownloadError extends Error { code = 'hf_gated' as const; constructor(public pageUrl: string, public tokenSet: boolean) {
  super(`This model is gated. Accept the licence on the model page (${pageUrl}), then connect Hugging Face in Settings → Connections${tokenSet ? ' (your token is set: check that it can read gated repos, and that the licence is accepted with the same account)' : ''}.`); } }
export const httpTransport: Transport = { name: 'http', async fetch(f, dest, onBytes, signal) {
  if (!f.url) throw new Error('no download address for this file');
  mkdirSync(path.dirname(dest), { recursive: true }); const part = `${dest}.part`; let have = existsSync(part) ? statSync(part).size : 0;
  const res = await fetch(f.url, { signal, redirect: 'follow', headers: { ...authFor(f.url), ...(have ? { Range: `bytes=${have}-` } : {}) } });
  if (res.status === 416 && f.bytesTotal != null && have >= f.bytesTotal) { /* already complete */ } else {
    if ((res.status === 401 || res.status === 403) && hfModelPage(f.url)) { await res.arrayBuffer().catch(() => undefined); throw new GatedDownloadError(hfModelPage(f.url)!, !!hfToken()); }
    if (!res.ok || !res.body) throw new Error(`download failed (HTTP ${res.status})`); // never echo headers (token)
    if (have && res.status !== 206) have = 0; // server ignored Range → start over
    const out = createWriteStream(part, { flags: have ? 'a' : 'w' }); let done = have;
    try { for await (const chunk of res.body as any) { if (signal.aborted) throw new Error('canceled'); done += chunk.length; if (!out.write(chunk)) await new Promise<void>((r) => out.once('drain', () => r())); onBytes(done); } }
    finally { await new Promise<void>((r) => out.end(() => r())); }
  }
  if (f.sha256) { const h = createHash('sha256'); await new Promise<void>((ok, bad) => createReadStream(part).on('data', (c) => h.update(c)).on('end', () => ok()).on('error', bad));
    if (h.digest('hex').toLowerCase() !== f.sha256.toLowerCase()) { try { unlinkSync(part); } catch { /* ignore */ } throw new Error('the downloaded file did not match its checksum; it was removed'); } }
  renameSync(part, dest);
} };
let transportOverride: Transport | null = null;
export const setDownloadTransport = (t: Transport | null) => { transportOverride = t; };
const transport = () => transportOverride ?? (config.backend === 'mock' || /^(1|true)$/i.test(env('DOWNLOAD_MOCK') ?? '') ? mockTransport : httpTransport);

const KV = 'local.downloads'; const live = new Map<string, { d: Download; ctl: AbortController; done: Promise<Download> }>();
const saved = (): Record<string, Download> => { try { return getKv<Record<string, Download>>(KV, {}) ?? {}; } catch { return {}; } };
const persist = (d: Download) => { const all = saved(); all[d.id] = d; const ids = Object.keys(all).sort((a, b) => all[b].createdAt - all[a].createdAt).slice(0, 50); setKv(KV, Object.fromEntries(ids.map((i) => [i, all[i]]))); };
// A server restart interrupts a running download: mark it failed (the .part stays, so the next try resumes).
{ const all = saved(); let ch = false; for (const d of Object.values(all)) if (d.status === 'downloading' || d.status === 'queued') { d.status = 'failed'; d.error = 'interrupted by a restart; start it again to resume'; d.endedAt = Date.now(); ch = true; } if (ch) try { setKv(KV, all); } catch { /* ignore */ } }

const safeDest = (dir: string, folder: string, file: string) => { const d = path.resolve(dir, folder, file); if (!d.startsWith(path.resolve(dir) + path.sep)) throw new DlError('bad_request', 'bad file path in the manifest'); return d; };
const freeBytes = (dir: string) => { const d = diskInfo(); if (d.path === dir && d.freeBytes != null) return d.freeBytes; try { const s = statfsSync(existsSync(dir) ? dir : path.dirname(dir)); return Number(s.bavail) * Number(s.bsize); } catch { return null; } };
const shaOf = (file: string) => manifest().models.find((m) => m.file === file)?.sha256 ?? null;

// ---- HW2 item 3: model families of a provider (one per distinct workflow set across the tools that list it) ----
export interface DlFamily { downloadId: string; providerId: string; label: string; toolIds: string[]; toolNames: string[]; workflows: string[]; bytesTotal: number }
const AUTO = () => new Set(manifest().models.filter((m) => m.auto_downloaded_by_pack).map((m) => m.file));
const bytesOf = (wfs: string[]) => { const auto = AUTO(); return weightsHere(wfs).filter((w) => !auto.has(w.file)).reduce((a, w) => a + (w.sizeBytes ?? 0), 0); };
export function familiesOf(providerId: string): DlFamily[] {
  const p = getProvider(providerId); if (!p || p.kind !== 'open-weights') return []; const out = new Map<string, DlFamily>();
  // dp30 (n): the same workflows (and so the same downloadId) as the model card's requirements: jobWorkflows(tool, provider, {}), as requirementsFor() uses.
  for (const t of listTools()) { if (!(t.providers ?? []).includes(providerId)) continue; const wfs = jobWorkflows(t as any, providerId, {}); if (!wfs.length) continue;
    const id = downloadIdFor(providerId, wfs); const f = out.get(id); if (f) { if (!f.toolIds.includes(t.id)) { f.toolIds.push(t.id); f.toolNames.push(t.name ?? t.id); } continue; }
    out.set(id, { downloadId: id, providerId, label: cardName(t.id, providerId) ?? p.name ?? providerId, toolIds: [t.id], toolNames: [t.name ?? t.id], workflows: wfs.map((w) => w.replace(/^workflows\//, '')), bytesTotal: bytesOf(wfs) }); }
  return [...out.values()];
}
/** A providerId-only download is ambiguous when the provider declares no workflows of its own and its tools use several distinct sets (comfy-open). */
export const ambiguousProvider = (providerId: string) => { const p = getProvider(providerId); return !!p && p.kind === 'open-weights' && !p.workflows && familiesOf(providerId).length > 1; };
const allowedWorkflows = (providerId: string) => { const p = getProvider(providerId); return new Set([...(p?.workflows ?? []), ...familiesOf(providerId).flatMap((f) => f.workflows), ...(QUALITY_WORKFLOWS[providerId] ?? []).map((q) => q.workflow) /* LTX-2.5 DFR */].map((w) => w.replace(/^workflows\//, ''))); };
export type DlSpec = { providerId?: string | null; variantId?: string | null; downloadId?: string | null; files?: string[] | null; jobId?: string | null };
/** Files for a download id, a provider (all its workflows; pack auto-downloads excluded) or one variant. Already-present files are 'skipped' (dir null: nothing can be checked, every file is 'queued'). */
export function planFiles(spec: DlSpec, dir: string | null): { label: string; providerId: string | null; downloadId: string | null; files: DlFile[] } {
  let label = ''; let rows: { file: string; folder: string; url: string | null; bytes: number | null }[] = []; let providerId: string | null = spec.providerId ?? null; let downloadId: string | null = null;
  const auto = AUTO(); const fromWfs = (wfs: string[]) => weightsHere(wfs).filter((w) => !auto.has(w.file)).map((w) => ({ file: w.file, folder: w.folder, url: w.url ?? null, bytes: w.sizeBytes ?? null })); // this computer's picked variant only (item 5)
  const parsed = spec.downloadId ? parseDownloadId(spec.downloadId) : null;
  const wfId = /^workflow:([a-z][a-z0-9-]{1,39})$/.exec(spec.downloadId ?? '')?.[1];
  if (wfId) { const t = getTool(wfId) as any; if (!t?.plugin?.user) throw new DlError('not_found', 'No workflow you added has that name.'); // Add a workflow: the files its own graph loads (workflowModels.ts)
    label = t.name ?? wfId; providerId = null; downloadId = spec.downloadId!; rows = workflowDownloadRows(t);
    if (spec.files?.length) { rows = rows.filter((r) => spec.files!.includes(r.file)); if (!rows.length) throw new DlError('not_found', 'This workflow doesn’t need that file, or it’s already there.');
      if (spec.files.length === 1) { label = `${rows[0].file} · ${label}`; downloadId = `${spec.downloadId}|${rows[0].folder}/${rows[0].file}`; } } } // one file: its own download, so several can run side by side
  else if (spec.variantId) { const v = findVariant(spec.variantId); if (!v) throw new DlError('not_found', 'No such lighter version.'); label = `${v.file} (${v.precision})`; rows = [{ file: v.file, folder: v.folder, url: v.url, bytes: v.bytes }]; downloadId = null; }
  else if (parsed) { const p = getProvider(parsed.providerId); if (!p || p.kind !== 'open-weights') throw new DlError('not_found', 'No such local model.');
    const ok = allowedWorkflows(p.id); const bad = parsed.workflows.filter((w) => !ok.has(w)); if (bad.length) throw new DlError('not_found', 'No such model download.', { downloadId: spec.downloadId });
    providerId = p.id; downloadId = downloadIdFor(p.id, parsed.workflows); const fams = familiesOf(p.id); const fam = fams.find((f) => f.downloadId === downloadId) ?? fams.find((f) => parsed.workflows.every((w) => f.workflows.includes(w))); label = fam?.label ?? p.name ?? p.id; rows = fromWfs(parsed.workflows); }
  else if (spec.providerId || spec.downloadId) { const pid = (spec.providerId ?? spec.downloadId)!; const p = getProvider(pid); if (!p || p.kind !== 'open-weights') throw new DlError('not_found', 'No such local model.'); providerId = p.id; label = p.name ?? p.id;
    if (!spec.files?.length && ambiguousProvider(p.id)) throw new DlError('ambiguous_download', `${label} covers several models, so say which one to download.`, { choices: familiesOf(p.id) });
    rows = fromWfs(p.workflows ?? []); downloadId = p.workflows ? p.id : null;
    if (spec.files?.length) { if (!p.workflows) rows = fromWfs([...allowedWorkflows(p.id)]); rows = rows.filter((r) => spec.files!.includes(r.file)); } }
  else throw new DlError('bad_request', 'Give downloadId, providerId or variantId.');
  const files: DlFile[] = rows.map((r) => { const present = !!dir && (() => { try { return statSync(safeDest(dir, r.folder, r.file)).isFile(); } catch { return false; } })();
    return { file: r.file, folder: r.folder, url: r.url, bytesTotal: r.bytes, bytesDone: present ? r.bytes ?? 0 : 0, sha256: shaOf(r.file), status: present ? 'skipped' : 'queued' }; });
  return { label, providerId, downloadId, files };
}
export const missingOf = (files: DlFile[]) => files.filter((f) => f.status === 'queued').reduce((a, f) => a + (f.bytesTotal ?? 0), 0);

export const NO_MODELS_DIR_MSG = 'No ComfyUI models folder is set, so there is nowhere to put the files.';
export const MODELS_DIR_MISSING_MSG = "The ComfyUI models folder that is set doesn't exist on this computer.";
/** Shared pre-flight (dry run + start): the plan, the bytes, and the first reason it can't start (code null = it can). Throws DlError only for a bad spec (not_found, bad_request, ambiguous_download). */
export function downloadCheck(spec: DlSpec) {
  const set = modelsDir(); const dirOk = !!set && existsSync(set) && statSync(set).isDirectory(); const dir = dirOk ? set : null;
  const plan = planFiles(spec, dir); const need = missingOf(plan.files); const free = dir ? freeBytes(dir) : null;
  let code: DlError['code'] | null = null; let message: string | null = null; let extra: Record<string, any> = {};
  if (!set) { code = 'no_models_dir'; message = NO_MODELS_DIR_MSG; }
  else if (!dirOk) { code = 'no_models_dir'; message = MODELS_DIR_MISSING_MSG; }
  else if (!plan.files.some((f) => f.status === 'queued')) { code = 'nothing_to_download'; message = 'All the files are already on this computer.'; extra = { files: plan.files }; }
  else if (plan.files.some((f) => f.status === 'queued' && !f.url)) { code = 'no_url'; message = 'One of the files has no download address; get it by hand.'; extra = { files: plan.files.filter((f) => !f.url).map((f) => f.file) }; }
  else if (free != null && need > free * 0.95) { const unk = plan.files.filter((f) => f.status === 'queued' && f.bytesTotal == null).length; code = 'not_enough_disk';
    message = unk ? `Needs ${(need / 1e9).toFixed(1)} GB + ${unk} file${unk > 1 ? 's' : ''} of unknown size; ${(free / 1e9).toFixed(1)} GB of disk space is free.` : `Needs ${(need / 1e9).toFixed(1)} GB of disk space; ${(free / 1e9).toFixed(1)} GB is free.`; extra = { missingBytes: need, diskFreeBytes: free, unknownSizes: unk }; }
  return { dir, plan, need, free, missingBytesSource: dir ? 'checked' as const : 'assumed_all' as const, code, message, extra };
}
/** Start a download (POST /api/local/downloads, or a job's downloading_model stage). Throws DlError for the 4xx cases. */
export function startDownload(spec: DlSpec): Download {
  // Only into an explicitly configured ComfyUI models folder (OPENHIGGSFIELD_COMFY_MODELS_DIR) that already exists: never a default or a guessed path.
  const c = downloadCheck(spec);
  if (c.code === 'no_models_dir') throw new DlError(c.code, c.message!, c.extra);
  const dir = c.dir!; const { label, files } = c.plan; const providerId = c.plan.providerId; const downloadId = c.plan.downloadId;
  // one download per model at a time: a second click returns the running one
  for (const x of live.values()) if (x.d.providerId === providerId && x.d.variantId === (spec.variantId ?? null) && (x.d.downloadId ?? null) === downloadId && (x.d.status === 'downloading' || x.d.status === 'queued')) return x.d;
  if (c.code) throw new DlError(c.code, c.message!, c.extra);
  const d: Download = { id: `dl_${randomUUID().slice(0, 12)}`, providerId: spec.variantId ? spec.providerId ?? null : providerId, variantId: spec.variantId ?? null, downloadId, jobId: spec.jobId ?? null, label, status: 'queued',
    bytesTotal: files.reduce((a, f) => a + (f.bytesTotal ?? 0), 0), bytesDone: files.reduce((a, f) => a + f.bytesDone, 0), etaSeconds: null, rateBytesPerSec: null, files, modelsDir: dir,
    createdAt: Date.now(), startedAt: null, endedAt: null, error: null };
  const ctl = new AbortController(); persist(d);
  const done = (async () => {
    d.status = 'downloading'; d.startedAt = Date.now(); const tr = transport(); let lastSave = 0;
    const base0 = d.bytesDone; // skipped files count as done; rate covers only bytes moved now
    try {
      for (const f of d.files) { if (f.status !== 'queued') continue; if (ctl.signal.aborted) throw new Error('canceled'); f.status = 'downloading';
        const before = d.files.reduce((a, x) => a + (x === f ? 0 : x.bytesDone), 0);
        await tr.fetch(f, safeDest(dir, f.folder, f.file), (n) => { f.bytesDone = n; d.bytesDone = before + n; const el = (Date.now() - d.startedAt!) / 1000; const moved = d.bytesDone - base0;
          d.rateBytesPerSec = el > 0.2 && moved > 0 ? Math.round(moved / el) : null; d.etaSeconds = d.rateBytesPerSec ? Math.max(0, Math.ceil((d.bytesTotal - d.bytesDone) / d.rateBytesPerSec)) : null;
          if (Date.now() - lastSave > 1000) { lastSave = Date.now(); persist(d); } }, ctl.signal);
        f.status = 'done'; f.bytesDone = f.bytesTotal ?? f.bytesDone; clearRequirementsCache(); forgetComfyLoaderOptions(); }
      d.status = 'done'; d.bytesDone = d.bytesTotal; d.etaSeconds = 0;
      const el = (Date.now() - d.startedAt) / 1000; if (tr.name !== 'mock' && el > 5 && d.bytesDone - base0 > 0) pushRate(hwKeyOf(), 'download', (d.bytesDone - base0) / el); // learned download speed (real only)
      if (d.providerId) setMissingWeights(`local:${d.providerId}`, null);
    } catch (e) {
      const canceled = ctl.signal.aborted; d.status = canceled ? 'canceled' : 'failed'; d.error = canceled ? null : (e instanceof Error ? e.message : String(e)).replace(/Bearer\s+\S+/gi, 'Bearer ***');
      if (!canceled && e instanceof GatedDownloadError) { d.errorCode = e.code; d.helpUrl = e.pageUrl; }
      for (const f of d.files) if (f.status === 'downloading' || f.status === 'queued') f.status = canceled ? 'canceled' : 'failed';
    }
    d.endedAt = Date.now(); persist(d); return d;
  })();
  live.set(d.id, { d, ctl, done });
  return d;
}
export const getDownload = (id: string): Download | null => live.get(id)?.d ?? saved()[id] ?? null;
export const listDownloads = (): Download[] => { const all = { ...saved() }; for (const [k, v] of live) all[k] = v.d; return Object.values(all).sort((a, b) => b.createdAt - a.createdAt); };
export const waitDownload = (id: string) => live.get(id)?.done ?? Promise.resolve(getDownload(id));
export function cancelDownload(id: string): Download | null { const x = live.get(id); if (x) { if (x.d.status === 'downloading' || x.d.status === 'queued') x.ctl.abort(); return x.d; } return saved()[id] ?? null; }
/** JSON view (never includes headers or tokens). */
export const downloadView = (d: Download) => ({ ...d, modelsDir: displayDir(d.modelsDir), files: d.files.map(({ sha256, ...f }) => ({ ...f, checksum: !!sha256 })), transport: transportOverride?.name ?? (config.backend === 'mock' ? 'mock' : 'http') });
