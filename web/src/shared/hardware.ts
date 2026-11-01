import { useEffect, useState } from 'react';
import { gbText } from './fit';
/** Batch 28: this computer's hardware, the local ComfyUI address, model downloads and learned timings (server HW endpoints). */
export type Hardware = { source: 'none' | 'comfyui-system_stats' | 'host' | 'manual' | string; tier: 'none' | 'light' | 'most' | 'all' | 'unknown' | string; tierLabel?: string; note?: string;
  effectiveVramGB?: number | null; gpu?: { name?: string; type?: string; vramTotalGB?: number | null; count?: number } | null; ram?: { totalGB?: number | null; totalBytes?: number | null; freeBytes?: number | null } | null;
  disk?: { path?: string | null; freeBytes?: number | null; totalBytes?: number | null } | null; comfy?: { reachable?: boolean | null; version?: string | null; pytorch?: string | null; cloud?: boolean; ggufNode?: boolean | null; kind?: string | null; label?: string | null; modelsDir?: string | null } | null;
  /** machine class (server hardware/machineProfile.ts) */ profile?: { id: string; label: string; usableGB?: number | null; vramGB?: number | null; ramGB?: number | null; unifiedMemory?: boolean; notes?: string[] } | null;
  manual?: { vramGB?: number | null; ramGB?: number | null } | null; manualInUse?: boolean; refreshAfterSec?: number; checkedAt?: string; tierThresholdsGB?: Record<string, number> };
export type DlFile = { file: string; folder?: string; bytes?: number | null; bytesTotal?: number | null; bytesDone?: number | null; status?: string };
export type Download = { id: string; downloadId?: string | null; providerId?: string | null; variantId?: string | null; label?: string; status: string; files: DlFile[]; bytesDone?: number | null; totalBytes?: number | null; bytesTotal?: number | null; etaSeconds?: number | null; error?: string | null; /** 'hf_gated': Hugging Face refused a gated file; helpUrl = its model page */ errorCode?: string | null; helpUrl?: string | null };
/** B31: 400 ambiguous_download lists the downloads a shared card covers; the user picks one. */
export type DlChoice = { downloadId: string; providerId?: string; label?: string; toolIds?: string[]; toolNames?: string[]; workflows?: string[]; bytesTotal?: number | null };
export type ApiErr = { ok: false; status: number; code?: string; error: string; missingBytes?: number | null; diskFreeBytes?: number | null; choices?: DlChoice[] };

const body = async (r: Response) => r.json().catch(() => ({} as any));
const send = async <T,>(url: string, method: string, data?: unknown): Promise<{ ok: true; data: T } | ApiErr> => {
  try { const r = await fetch(url, { method, headers: data === undefined ? undefined : { 'content-type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) }); const b = await body(r);
    return r.ok ? { ok: true, data: b as T } : { ok: false, status: r.status, code: b?.code, error: String(b?.error ?? 'Something went wrong.'), missingBytes: b?.missingBytes ?? null, diskFreeBytes: b?.diskFreeBytes ?? null, choices: Array.isArray(b?.choices) ? b.choices : undefined };
  } catch { return { ok: false, status: 0, error: 'Couldn’t reach the server.' }; }
};
export const getHardware = () => send<Hardware>('/api/hardware', 'GET');
/** "This computer" card: memory, graphics memory (a card only) and disk right now, and whether ComfyUI answers (server hardware.ts liveReading). */
export type LiveHardware = { at: string; ram: { totalBytes: number; freeBytes: number; source: string }; vram: { totalBytes: number; freeBytes: number } | null;
  disk: { path?: string | null; freeBytes: number | null; totalBytes: number | null }; comfy: { reachable: boolean | null; version: string | null; pytorch: string | null } };
export const getLiveHardware = () => send<LiveHardware>('/api/hardware/live', 'GET');
export const refreshHardware = () => send<Hardware>('/api/hardware/refresh', 'POST');
export const setManualHardware = (vramGB: number, ramGB: number | null) => send<Hardware & { note?: string }>('/api/hardware', 'PUT', { vramGB, ramGB });
export const clearManualHardware = () => send<Hardware>('/api/hardware/override', 'DELETE');
export type ComfyAddr = { url: string | null; source: string | null; savedUrl?: string | null; serverDefault?: string | null; cloud?: boolean; canChange: boolean };
export type ComfyTest = { url?: string | null; reachable: boolean; /** B31: refused | timeout | not_found | bad_response | unreachable | not_set | cloud | null */ errorCode?: string | null; timeoutSec?: number; version?: string | null; gpu?: { name?: string; type?: string; vramTotalGB?: number | null } | null; ggufNode?: boolean | null; latencyMs?: number | null; error?: string | null };
export const getComfy = () => send<ComfyAddr>('/api/local/comfy', 'GET');
export const setComfy = (url: string | null) => send<ComfyAddr>('/api/local/comfy', 'PUT', { url });
export const clearComfy = () => send<ComfyAddr>('/api/local/comfy', 'DELETE');
export const testComfy = (url?: string) => send<ComfyTest>('/api/local/comfy/test', 'POST', url ? { url } : {});
/** B31 (pb/hw2): a dry run is always 200 and says whether the real download could start (canDownload / code / error). */
export type DryRun = { dryRun: true; label?: string; providerId?: string; variantId?: string | null; downloadId?: string; bytesTotal?: number | null; missingBytes: number; missingBytesSource?: 'checked' | 'assumed_all' | string;
  diskFreeBytes?: number | null; modelsDirSet?: boolean; canDownload?: boolean; code?: 'no_models_dir' | 'nothing_to_download' | 'no_url' | 'not_enough_disk' | string | null; error?: string | null; files: DlFile[] };
/** B31: POST {downloadId} (a variant still goes as variantId). */
const target = (downloadId: string, variantId?: string | null) => (variantId ? { variantId } : { downloadId });
const dryCache = new Map<string, Promise<{ ok: true; data: DryRun } | ApiErr>>();
export const dryRunDownload = (downloadId: string, variantId?: string | null, fresh = false) => { const k = `${downloadId}|${variantId ?? ''}`;
  if (fresh || !dryCache.has(k)) dryCache.set(k, send<DryRun>('/api/local/downloads', 'POST', { ...target(downloadId, variantId), dryRun: true }).then(r => { if (!r.ok) dryCache.delete(k); return r; })); return dryCache.get(k)!; };
export const startDownload = (downloadId: string, variantId?: string | null) => send<Download>('/api/local/downloads', 'POST', target(downloadId, variantId));
export const listDownloads = () => send<{ downloads: Download[]; modelsDir: string | null; modelsDirSet?: boolean }>('/api/local/downloads', 'GET');
export const getDownload = (id: string) => send<Download>(`/api/local/downloads/${encodeURIComponent(id)}`, 'GET');
export const cancelDownload = (id: string) => send<Download>(`/api/local/downloads/${encodeURIComponent(id)}`, 'DELETE');
export const getLearned = () => send<{ samples: number; groups: unknown[]; learning?: boolean }>('/api/eta/learned', 'GET');
export const resetLearned = () => send<{ ok: boolean; removed?: number }>('/api/eta/learned', 'DELETE');
export const dlTotal = (d: { totalBytes?: number | null; bytesTotal?: number | null; files?: DlFile[] } | null | undefined): number => Number(d?.totalBytes ?? d?.bytesTotal ?? (d?.files ?? []).reduce((a, f) => a + (Number(f.bytesTotal ?? f.bytes) || 0), 0)) || 0;
export const dlDone = (d: { bytesDone?: number | null; files?: DlFile[] } | null | undefined): number => Number(d?.bytesDone ?? (d?.files ?? []).reduce((a, f) => a + (Number(f.bytesDone) || 0), 0)) || 0;

let hwCache: Promise<Hardware | null> | null = null; const hwSubs = new Set<(h: Hardware | null) => void>();
export const publishHardware = (h: Hardware | null) => { hwCache = Promise.resolve(h); hwSubs.forEach(f => f(h)); };
/** The hardware once per page (shared); publishHardware updates every user after a refresh / manual change. */
export function useHardware(): Hardware | null | undefined {
  const [h, setH] = useState<Hardware | null | undefined>(undefined);
  useEffect(() => { let live = true; hwCache ??= getHardware().then(r => (r.ok ? r.data : null)); hwCache.then(x => { if (live) setH(x); }); const f = (x: Hardware | null) => setH(x); hwSubs.add(f); return () => { live = false; hwSubs.delete(f); }; }, []);
  return h;
}

/** Memory right now (GET /api/hardware/live), shared by every heavy-run fit check on screen: one request every 5 s while at least one is mounted
 *  with `on` and the tab is visible (the server keeps one reading per 2 s). `on` false (a small model, no local run) reads nothing. */
let liveNow: LiveHardware | null = null; const liveSubs = new Set<(x: LiveHardware) => void>(); let liveTimer: ReturnType<typeof setTimeout> | null = null; let liveBusy = false;
const liveTick = () => { liveTimer = null; if (!liveSubs.size || liveBusy) return; const next = () => { if (liveSubs.size && !liveTimer) liveTimer = setTimeout(liveTick, 5000); };
  if (document.visibilityState === 'hidden') { next(); return; } liveBusy = true; getLiveHardware().then(r => { if (r.ok) { liveNow = r.data; liveSubs.forEach(f => f(r.data)); } }).finally(() => { liveBusy = false; next(); }); };
export function useLiveHardware(on: boolean): LiveHardware | null {
  const [v, setV] = useState<LiveHardware | null>(liveNow);
  useEffect(() => { if (!on) return; liveSubs.add(setV); if (liveNow) setV(liveNow); if (!liveTimer) liveTick(); return () => { liveSubs.delete(setV); if (!liveSubs.size && liveTimer) { clearTimeout(liveTimer); liveTimer = null; } }; }, [on]);
  return on ? v : null;
}

/** First-use download: the user said yes for this model, so its next run is sent with downloadWeights=1 (and the lighter variant if picked). */
const intents = new Map<string, { variantId: string | null; bytes: number | null }>(); const intentSubs = new Set<() => void>();
export const setDownloadIntent = (providerId: string, v: { variantId: string | null; bytes: number | null } | null) => { if (v) intents.set(providerId, v); else intents.delete(providerId); intentSubs.forEach(f => f()); };
export const downloadIntentOf = (providerId: string | null | undefined) => (providerId ? intents.get(providerId) ?? null : null);
export function useDownloadIntent(providerId: string | null | undefined) { const [, tick] = useState(0); useEffect(() => { const f = () => tick(n => n + 1); intentSubs.add(f); return () => { intentSubs.delete(f); }; }, []); return downloadIntentOf(providerId); }

/** B31: models whose download prompt is on screen; a 409 weights gate for one of them is shown there (not twice). */
const prompts = new Map<string, number>();
export const promptMounted = (providerId: string) => { prompts.set(providerId, (prompts.get(providerId) ?? 0) + 1); return () => { const n = (prompts.get(providerId) ?? 1) - 1; if (n > 0) prompts.set(providerId, n); else prompts.delete(providerId); }; };
export const hasWeightsPrompt = (providerId: string) => (prompts.get(providerId) ?? 0) > 0;
/** B31/B34 (pb/dp30): prefer the server's toolNames; fall back to toolIds. Always show tools when present so Camera Moves vs Director are clear. */
const toolWords = (c: DlChoice) => (Array.isArray(c.toolNames) && c.toolNames.length ? c.toolNames.join(', ') : (c.toolIds ?? []).map(t => t.replace(/^app-/, '').replace(/-/g, ' ')).join(', '));
export const choiceText = (c: DlChoice, _all?: DlChoice[]): string => {
  const tools = toolWords(c);
  return [c.label ?? c.downloadId, tools || null].filter(Boolean).join(' · ');
};

/** Add a workflow: the model files a workflow you added loads, and whether your ComfyUI has them (server workflowModels.ts). */
export type NeedRow = { file: string; folder: string; nodes: string[]; state: 'have' | 'missing' | 'unknown'; url: string | null; bytes: number | null; pageUrl: string | null; linkFrom: 'list' | 'yours' | null; nodeMissing?: boolean; badPath?: boolean };
export type Needs = { id: string; comfy: 'ok' | 'off' | 'not_set'; modelsDirSet: boolean; files: NeedRow[]; missing: number; unknown: number; downloadId: string };
/* One shared copy per workflow: the Needs list and Generate read the same answer (a saved link or a finished download updates both). */
const needsOf = new Map<string, Needs | null>(); const needsSubs = new Set<() => void>(); const tellNeeds = () => needsSubs.forEach(f => f());
export const publishNeeds = (id: string, n: Needs | null) => { needsOf.set(id, n); tellNeeds(); };
export const getWorkflowNeeds = async (id: string) => { const r = await send<Needs>(`/api/workflows/${encodeURIComponent(id)}/models`, 'GET'); publishNeeds(id, r.ok ? r.data : null); return r; };
export const saveWorkflowLink = async (id: string, folder: string, file: string, url: string) => { const r = await send<Needs>(`/api/workflows/${encodeURIComponent(id)}/models`, 'PUT', { folder, file, url }); if (r.ok) publishNeeds(id, r.data); return r; };
/** The needs of a workflow you added (undefined = not loaded yet, null = none / couldn't load); loads it once. */
export function useWorkflowNeeds(id: string | null | undefined): Needs | null | undefined {
  const [, tick] = useState(0); useEffect(() => { const f = () => tick(n => n + 1); needsSubs.add(f); return () => { needsSubs.delete(f); }; }, []);
  useEffect(() => { if (id && !needsOf.has(id)) void getWorkflowNeeds(id); }, [id]);
  return id ? (needsOf.has(id) ? needsOf.get(id) : undefined) : null;
}
/** Files of a workflow's needs still to fetch (missing, a name the app can save). */
export const needsTodo = (n: Needs) => n.files.filter(r => r.state !== 'have' && !r.badPath);
/** "0.4 GB", or "0.4 GB + 2 files of unknown size" (a pasted link doesn't say its size). */
export const sizeWords = (rows: { bytes: number | null }[]) => { const b = rows.reduce((a, r) => a + (r.bytes ?? 0), 0); const u = rows.filter(r => r.bytes == null).length; const t = gbText(b);
  return u ? (b ? `${t} + ${u} file${u > 1 ? 's' : ''} of unknown size` : `${u} file${u > 1 ? 's' : ''} of unknown size`) : t; };
/** One file of a workflow you added (its own download, the same downloader): dry run first, like the rest. */
export const dryRunFileDownload = (downloadId: string, file: string) => send<DryRun>('/api/local/downloads', 'POST', { downloadId, files: [file], dryRun: true });
export const startFileDownload = (downloadId: string, file: string) => send<Download>('/api/local/downloads', 'POST', { downloadId, files: [file] });
