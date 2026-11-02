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
 *  - Where files go: hardware/modelsTarget.ts (OPENHIGGSFIELD_COMFY_MODELS_DIR, else the running ComfyUI's own folder for each model folder).
 *    Refuses (409 no_models_dir) when neither is known or writable: the answer then says where the file goes inside ComfyUI's models folder.
 *  - Windows: the final rename is retried when antivirus or ComfyUI holds the new file for a moment (EPERM/EBUSY); a full disk or a too-long
 *    path gets a plain sentence (downloadErrorText). The .part file stays, so Resume continues where it stopped.
 *  - HW2 (DP, Oct 19): downloadId (requirements.downloadId / fit.downloadId) names exactly one route's files; a providerId alone is refused with
 *    400 ambiguous_download {choices[]} when the provider (comfy-open) serves several model families. downloadCheck() is the shared pre-flight
 *    (dry run: canDownload + code even without a models folder, missingBytes assumed = every file).
 *  - Progress shape = the job stage detail: { bytesTotal, bytesDone, etaSeconds, rateBytesPerSec, files[] }. State persists in kv 'local.downloads'.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, statSync, statfsSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { config } from '../config.js';
import { getKv, setKv } from '../db.js';
import { env } from '../env.js';
import { getProvider } from '../providers.js';
import { getTool, listTools } from '../tools/registry.js';
import { workflowDownloadRows } from '../workflowModels.js';
import { forgetComfyLoaderOptions } from '../comfyNodes.js';
import { cardName } from '../models.js';
import { weightsHere } from './variants.js';
import { findVariant, manifest, setMissingWeights, clearRequirementsCache, downloadIdFor, parseDownloadId, jobWorkflows, QUALITY_WORKFLOWS } from './requirements.js';
import { pushRate } from '../etaLearn.js';
import { hwKeyOf, diskInfo, displayDir } from '../hardware.js';
import { modelsTarget, safeJoin, whereToPut } from './modelsTarget.js';
import { comfyFileBytes } from './comfyModels.js';

export interface DlFile { file: string; folder: string; url: string | null; bytesTotal: number | null; bytesDone: number; sha256: string | null; status: 'queued' | 'downloading' | 'done' | 'skipped' | 'failed' | 'canceled' }
export interface Download { id: string; providerId: string | null; variantId: string | null; downloadId?: string | null; jobId: string | null; label: string; status: 'queued' | 'downloading' | 'done' | 'failed' | 'canceled';
  bytesTotal: number; bytesDone: number; etaSeconds: number | null; rateBytesPerSec: number | null; files: DlFile[]; modelsDir: string; createdAt: number; startedAt: number | null; endedAt: number | null; error: string | null;
  /** Setup step 3: 'hf_gated' when Hugging Face refused a gated file (helpUrl = its model page, where the licence is accepted). */ errorCode?: string | null; helpUrl?: string | null }
export interface Transport { name: string; fetch(f: DlFile, dest: string, onBytes: (done: number) => void, signal: AbortSignal): Promise<void> }
export class DlError extends Error { constructor(public code: 'not_enough_disk' | 'no_models_dir' | 'not_found' | 'nothing_to_download' | 'no_url' | 'bad_request' | 'ambiguous_download', msg: string, public extra: Record<string, any> = {}) { super(msg); } }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Windows: antivirus (Defender) or ComfyUI listing the folder can hold a just-written file for a moment, so the rename fails with EPERM / EBUSY / EACCES.
 *  Try again a few times before giving up (the .part stays either way). */
export async function renameWithRetry(from: string, to: string, rename: (a: string, b: string) => void = renameSync, tries = 5, waitMs = 500): Promise<void> {
  for (let i = 1; ; i++) { try { rename(from, to); return; } catch (e: any) { if (i >= tries || !/^(EPERM|EBUSY|EACCES)$/.test(String(e?.code))) throw e; await sleep(waitMs * i); } }
}
/** A download error in plain words (never a raw Node message for the usual disk, permission and path problems). dest = the file being written;
 *  platform and home are for tests. macOS blocks apps from Documents, Desktop and external drives until allowed (privacy settings). */
export function downloadErrorText(e: unknown, dest: string | null = null, platform: NodeJS.Platform = process.platform, home: string = os.homedir()): string {
  const code = String((e as any)?.code ?? ''); const msg = (e instanceof Error ? e.message : String(e)).replace(/Bearer\s+\S+/gi, 'Bearer ***');
  const has = (c: string) => code === c || new RegExp(`\\b${c}\\b`).test(msg); const where = dest ?? String((e as any)?.path ?? '');
  if (has('ENOSPC')) return 'The disk filled up. Free some space, then press Resume.';
  if (has('ENAMETOOLONG')) return 'The folder path is too long for this file. Use a shorter models folder (for example on another drive), then press Resume.';
  if (has('EROFS')) return 'This drive is read-only, so the file can’t be saved there. (A Windows-formatted drive is read-only on a Mac.)';
  if (has('EPERM') && platform === 'darwin' && (/^\/Volumes\//.test(where) || ['Documents', 'Desktop', 'Downloads'].some((d) => where.startsWith(`${home}/${d}/`))))
    return 'macOS blocked access to this folder. Allow it in System Settings → Privacy & Security → Files and Folders, then press Resume.';
  if (has('ENOENT') && /^(\/Volumes|\/media|\/mnt|\/run\/media)\//.test(where)) return 'The models folder isn’t there. Is the drive plugged in?';
  if (has('EACCES')) return 'Can’t write to this folder (no permission). Pick a folder you own, or fix its permissions, then press Resume.';
  if (has('EPERM') || has('EBUSY')) return 'The app couldn’t write the file. Another program may be using it (for example antivirus). Press Resume to try again.';
  return msg;
}
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
  await renameWithRetry(part, dest);
} };
let transportOverride: Transport | null = null;
export const setDownloadTransport = (t: Transport | null) => { transportOverride = t; };
const transport = () => transportOverride ?? (config.backend === 'mock' || /^(1|true)$/i.test(env('DOWNLOAD_MOCK') ?? '') ? mockTransport : httpTransport);

const KV = 'local.downloads'; const live = new Map<string, { d: Download; ctl: AbortController; done: Promise<Download> }>();
const saved = (): Record<string, Download> => { try { return getKv<Record<string, Download>>(KV, {}) ?? {}; } catch { return {}; } };
const persist = (d: Download) => { const all = saved(); all[d.id] = d; const ids = Object.keys(all).sort((a, b) => all[b].createdAt - all[a].createdAt).slice(0, 50); setKv(KV, Object.fromEntries(ids.map((i) => [i, all[i]]))); };
// A server restart interrupts a running download: mark it failed (the .part stays, so the next try resumes).
{ const all = saved(); let ch = false; for (const d of Object.values(all)) if (d.status === 'downloading' || d.status === 'queued') { d.status = 'failed'; d.error = 'interrupted by a restart; start it again to resume'; d.endedAt = Date.now(); ch = true; } if (ch) try { setKv(KV, all); } catch { /* ignore */ } }

/** Where one file goes: the target's folder for its model folder + the file name, never outside that folder. null = unknown target. */
type DestOf = (folder: string, file: string) => string | null;
const destOfTarget = (t: ReturnType<typeof modelsTarget>): DestOf | null => (t.root ? (folder, file) => { const d = t.dirFor(folder); if (!d) return null; const x = safeJoin(d, file); if (!x) throw new DlError('bad_request', 'bad file path in the manifest'); return x; } : null);
/** Free bytes on the drive that holds dir (the nearest folder that exists). */
const freeBytes = (dir: string) => { const d = diskInfo(); if (d.freeBytes != null && (d.path === dir || dir.startsWith(d.path + path.sep))) return d.freeBytes; /* same drive (and the mock pin, OPENHIGGSFIELD_DISK_FREE_GB) */ let at = dir; while (!existsSync(at) && path.dirname(at) !== at) at = path.dirname(at);
  try { const s = statfsSync(at); return Number(s.bavail) * Number(s.bsize); } catch { return null; } };
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
export function planFiles(spec: DlSpec, dest: DestOf | null): { label: string; providerId: string | null; downloadId: string | null; files: DlFile[] } {
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
  // on disk where it would go, or listed by ComfyUI in any of its folders at full size (Desktop's shared folders, extra_model_paths)
  const files: DlFile[] = rows.map((r) => { const listed = dest ? comfyFileBytes(r.folder, r.file) : null; const present = !!dest && ((() => { try { const d = dest(r.folder, r.file); return !!d && statSync(d).isFile(); } catch { return false; } })()
      || (listed != null && listed > 0 && (r.bytes == null || listed >= r.bytes)));
    return { file: r.file, folder: r.folder, url: r.url, bytesTotal: r.bytes, bytesDone: present ? r.bytes ?? 0 : 0, sha256: shaOf(r.file), status: present ? 'skipped' : 'queued' }; });
  return { label, providerId, downloadId, files };
}
export const missingOf = (files: DlFile[]) => files.filter((f) => f.status === 'queued').reduce((a, f) => a + (f.bytesTotal ?? 0), 0);

export const NO_MODELS_DIR_MSG = 'The app couldn’t find where ComfyUI keeps its model files, so it can’t download them for you.';
export const MODELS_DIR_MISSING_MSG = "The ComfyUI models folder that is set doesn't exist on this computer.";
const NOT_WRITABLE_MSG = 'The app can’t write to ComfyUI’s models folder.';
const REMOTE_MSG = 'Model files go on the computer running ComfyUI: download them there.';
const CONTAINER_MSG = 'ComfyUI runs in a container, so its model folders are inside it: download the files inside your container.';
/** Shared pre-flight (dry run + start): the plan, the bytes, and the first reason it can't start (code null = it can). Throws DlError only for a bad spec (not_found, bad_request, ambiguous_download). */
export function downloadCheck(spec: DlSpec) {
  const t = modelsTarget(); const dest = t.writable ? destOfTarget(t) : null; const dir = dest ? t.root : null;
  const plan = planFiles(spec, dest); const need = missingOf(plan.files);
  // free space per drive the queued files go to (Desktop's folders can sit on several drives); the tightest one answers
  let free: number | null = null; let needHere = need;
  if (dest) { const per = new Map<string, number>(); for (const f of plan.files) if (f.status === 'queued') { const d = path.dirname(dest(f.folder, f.file) ?? dir!); per.set(d, (per.get(d) ?? 0) + (f.bytesTotal ?? 0)); }
    free = freeBytes(dir!); for (const [d, n] of per) { const fb = freeBytes(d); if (fb != null && n > fb * 0.95) { free = fb; needHere = n; break; } } }
  let code: DlError['code'] | null = null; let message: string | null = null; let extra: Record<string, any> = {};
  if (!dest) { code = 'no_models_dir'; message = t.why === 'env_missing' ? MODELS_DIR_MISSING_MSG + (/^(\/Volumes|\/media|\/mnt|\/run\/media)\//.test(t.root ?? '') ? ' Is the drive plugged in?' : '') : t.why === 'not_writable' ? NOT_WRITABLE_MSG : t.why === 'remote' ? REMOTE_MSG : t.why === 'container' ? CONTAINER_MSG : NO_MODELS_DIR_MSG;
    extra = { why: t.why, files: plan.files.filter((f) => f.status === 'queued').map((f) => ({ file: f.file, folder: f.folder, url: f.url, putIn: whereToPut(f.folder) })) }; }
  else if (!plan.files.some((f) => f.status === 'queued')) { code = 'nothing_to_download'; message = 'All the files are already on this computer.'; extra = { files: plan.files }; }
  else if (plan.files.some((f) => f.status === 'queued' && !f.url)) { code = 'no_url'; message = 'One of the files has no download address; get it by hand.'; extra = { files: plan.files.filter((f) => !f.url).map((f) => f.file) }; }
  else if (free != null && needHere > free * 0.95) { const unk = plan.files.filter((f) => f.status === 'queued' && f.bytesTotal == null).length; code = 'not_enough_disk';
    message = unk ? `Needs ${(needHere / 1e9).toFixed(1)} GB + ${unk} file${unk > 1 ? 's' : ''} of unknown size; ${(free / 1e9).toFixed(1)} GB of disk space is free.` : `Needs ${(needHere / 1e9).toFixed(1)} GB of disk space; ${(free / 1e9).toFixed(1)} GB is free. Free some space, then try again.`; extra = { missingBytes: needHere, diskFreeBytes: free, unknownSizes: unk }; }
  return { dir, dest, plan, need, free, missingBytesSource: dir ? 'checked' as const : 'assumed_all' as const, code, message, extra };
}
/** Start a download (POST /api/local/downloads, or a job's downloading_model stage). Throws DlError for the 4xx cases. */
export function startDownload(spec: DlSpec): Download {
  // Only into OPENHIGGSFIELD_COMFY_MODELS_DIR or the folder the running ComfyUI itself reads (modelsTarget.ts): never a guessed path.
  const c = downloadCheck(spec);
  if (c.code === 'no_models_dir') throw new DlError(c.code, c.message!, c.extra);
  const dir = c.dir!; const dest = c.dest!; const { label, files } = c.plan; const providerId = c.plan.providerId; const downloadId = c.plan.downloadId;
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
        const to = dest(f.folder, f.file); if (!to) throw new Error(NO_MODELS_DIR_MSG);
        await tr.fetch(f, to, (n) => { f.bytesDone = n; d.bytesDone = before + n; const el = (Date.now() - d.startedAt!) / 1000; const moved = d.bytesDone - base0;
          d.rateBytesPerSec = el > 0.2 && moved > 0 ? Math.round(moved / el) : null; d.etaSeconds = d.rateBytesPerSec ? Math.max(0, Math.ceil((d.bytesTotal - d.bytesDone) / d.rateBytesPerSec)) : null;
          if (Date.now() - lastSave > 1000) { lastSave = Date.now(); persist(d); } }, ctl.signal);
        f.status = 'done'; f.bytesDone = f.bytesTotal ?? f.bytesDone; clearRequirementsCache(); forgetComfyLoaderOptions(); }
      d.status = 'done'; d.bytesDone = d.bytesTotal; d.etaSeconds = 0;
      const el = (Date.now() - d.startedAt) / 1000; if (tr.name !== 'mock' && el > 5 && d.bytesDone - base0 > 0) pushRate(hwKeyOf(), 'download', (d.bytesDone - base0) / el); // learned download speed (real only)
      if (d.providerId) setMissingWeights(`local:${d.providerId}`, null);
    } catch (e) {
      const canceled = ctl.signal.aborted; d.status = canceled ? 'canceled' : 'failed'; d.error = canceled ? null : downloadErrorText(e, (e as any)?.path ?? null);
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
