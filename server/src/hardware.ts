/**
 * HW-SHAPES B1 + Q5 + DP 5/6 (Oct 19 2026): what this computer can run locally.
 *  - getHardware(): one probe (connected ComfyUI /system_stats, else the host when ComfyUI is on this machine, else nothing) → tier.
 *    Never probes Comfy Cloud (its GPU isn't the user's). Cached 5 min in memory + kv 'hardware.last'; refresh rate-limited to 1 per 5 s.
 *  - Tiers from effectiveVramGB: none (<4 or no GPU) · light (4–<8) · most (8–<24) · all (≥24) · unknown (the hardware couldn't be seen: nothing is enforced).
 *  - Overrides: test hook setHardwareOverride(), env OPENHIGGSFIELD_HW_MOCK=<profile|json> (source 'mock'), and the user's manual
 *    PUT /api/hardware {vramGB, ramGB?} (kv 'hardware.manual', source 'manual'), used only when the probe can't see the hardware.
 *  - Q5: localReachable() = a real, cached (30 s) ComfyUI reachability check (1.5 s timeout) replacing the always-true rule; the mock
 *    backend counts as reachable (it renders samples), tests can force it with setComfyReachableOverride().
 *  - DP 6: the ComfyUI address can be set at runtime (kv 'local.comfyUrl', overrides COMFY_BASE_URL until cleared).
 * No GPU work, nothing installed: the probe only reads /system_stats, /object_info/<node>, nvidia-smi or sysctl.
 */
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { statfsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { config, DATA_DIR, comfyNeedsKey } from './config.js';
import { env } from './env.js';
import { getKv, setKv } from './db.js';
import { classifyMachine, cleanGpuName, type MachineProfile } from './hardware/machineProfile.js';
import { comfyInstallOf, type ComfyKind } from './hardware/comfyInstall.js';

export type Tier = 'none' | 'light' | 'most' | 'all' | 'unknown';
export type HwSource = 'comfyui-system_stats' | 'host' | 'mock' | 'manual' | 'none';
export interface Gpu { name: string; type: 'cuda' | 'mps' | 'cpu' | 'xpu' | 'rocm' | string; count: number; vramTotalBytes: number | null; vramFreeBytes: number | null; vramTotalGB: number | null; unifiedMemory: boolean }
export interface Hardware {
  source: HwSource; checkedAt: string; cached: boolean; maxAgeSec: number;
  comfy: { reachable: boolean | null; version: string | null; cloud: boolean; ggufNode: boolean | null; /** PyTorch in ComfyUI's Python (/system_stats system.pytorch_version), when read */ pytorch?: string | null;
    /** Setup step 4 (from /system_stats; null when not read): desktop | portable | docker | manual | unknown, its label, and the models folder ComfyUI's
     *  settings point at (shown as a folder name only; source 'desktop-yaml' | 'extra-paths-yaml' | 'base-directory' | 'main-py'). */
    kind?: ComfyKind | null; label?: string | null; modelsDir?: string | null; modelsDirSource?: string | null };
  gpu: Gpu | null;
  ram: { totalBytes: number | null; freeBytes: number | null; totalGB: number | null };
  disk: { path: string; freeBytes: number | null; totalBytes: number | null };
  /** dp30 (f): null when the hardware couldn't be read (tier unknown); 0 only for a real reading of no usable graphics memory (CPU-only, manual 0). */
  effectiveVramGB: number | null; tier: Tier; tierLabel: string; tierThresholdsGB: { light: number; most: number; all: number };
  note: string | null;
  /** Setup step 2: the machine class (hardware/machineProfile.ts): Apple Silicon, NVIDIA (RTX tier), Blackwell, DGX Spark, AMD, CPU only, unknown. */ profile: MachineProfile;
  /** DP 5: the saved manual values (null when none) and whether they are in use. */ manual: { vramGB: number; ramGB: number | null; savedAt: string } | null; manualInUse: boolean;
}
export const TIER_THRESHOLDS_GB = { light: 4, most: 8, all: 24 } as const;
export const MAX_AGE_SEC = 300; const REFRESH_MIN_MS = 5000;
const GiB = 2 ** 30;
const gb = (b: number | null | undefined) => (b == null ? null : Math.round((b / GiB) * 100) / 100);
/** Cut-offs with a 0.05 GB tolerance: a 24 GB card reports 23.99 GB usable and still counts as 24 GB. */
export function tierOf(effectiveGB: number, seen = true): Tier {
  if (!seen) return 'unknown'; const e = effectiveGB + 0.05;
  return e >= TIER_THRESHOLDS_GB.all ? 'all' : e >= TIER_THRESHOLDS_GB.most ? 'most' : e >= TIER_THRESHOLDS_GB.light ? 'light' : 'none';
}
export const TIER_LABELS: Record<Tier, string> = {
  none: 'No local graphics card fit for these models: local runs are limited to the smallest tools',
  light: 'Runs the light local models (upscalers, cut-outs, voice and audio)',
  most: 'Runs most local models',
  all: 'Runs every local model (some slowly)',
  unknown: "Couldn't check the hardware, so nothing is blocked",
};
/** The tier sentence for this machine class (2026-10-31, hardware plan B3): memory alone said "Runs every local model" on Apple Silicon, where
 *  fp8-only models can't load at all. Apple Silicon: one honest sentence; NVIDIA (and DGX Spark): by graphics memory, as before. */
export function tierLabelOf(tier: Tier, profile: Pick<MachineProfile, 'id'> | null | undefined): string {
  if (profile?.id === 'apple-silicon' && (tier === 'most' || tier === 'all')) return 'Runs most local models; fp8-only ones need NVIDIA';
  if (profile?.id === 'apple-silicon' && tier === 'light') return 'Runs the light local models; fp8-only ones need NVIDIA';
  return TIER_LABELS[tier];
}
/** MPS: 0.75 × RAM (ESTIMATE: the macOS default GPU wired-memory limit). CUDA: VRAM total. cpu / none: 0.
 *  Unified-memory CUDA (NVIDIA GB10 / DGX Spark, setup step 2): nvidia-smi has no memory figure there, so system memory stands in for VRAM. */
export function effectiveVram(gpu: Gpu | null, ramTotalBytes: number | null): number {
  if (!gpu) return 0; if (gpu.type === 'mps') return Math.round(((ramTotalBytes ?? 0) / GiB) * 0.75 * 100) / 100;
  if (gpu.type === 'cpu') return 0; if (gpu.vramTotalGB == null && gpu.unifiedMemory && ramTotalBytes) return Math.round((ramTotalBytes / GiB) * 100) / 100; return gpu.vramTotalGB ?? 0;
}
const mb = (n: number) => n * 1024 * 1024;
const cuda = (name: string, totalMiB: number, freeMiB: number): Gpu => ({ name, type: 'cuda', count: 1, vramTotalBytes: mb(totalMiB), vramFreeBytes: mb(freeMiB), vramTotalGB: gb(mb(totalMiB)), unifiedMemory: false });
/** HW mock profiles (tests, demos): realistic totals as ComfyUI reports them. */
export const HW_PROFILES: Record<string, { gpu: Gpu | null; ramGB: number | null; seen: boolean; comfyVersion?: string }> = {
  unknown: { gpu: null, ramGB: null, seen: false },
  none: { gpu: null, ramGB: 16, seen: true },
  cpu: { gpu: { name: 'cpu', type: 'cpu', count: 1, vramTotalBytes: 0, vramFreeBytes: 0, vramTotalGB: 0, unifiedMemory: false }, ramGB: 32, seen: true, comfyVersion: '0.41.0' },
  light8: { gpu: cuda('NVIDIA GeForce RTX 4050 Laptop GPU', 6141, 5600), ramGB: 16, seen: true, comfyVersion: '0.41.0' }, // light tier (6–8 GB laptop class)
  mid16: { gpu: cuda('NVIDIA GeForce RTX 4080', 16376, 15200), ramGB: 32, seen: true, comfyVersion: '0.41.0' },
  rtx4090: { gpu: cuda('NVIDIA GeForce RTX 4090', 24564, 23000), ramGB: 64, seen: true, comfyVersion: '0.41.0' },
  mac36: { gpu: { name: 'Apple M3 Max', type: 'mps', count: 1, vramTotalBytes: null, vramFreeBytes: null, vramTotalGB: null, unifiedMemory: true }, ramGB: 36, seen: true, comfyVersion: '0.41.0' },
  mac64: { gpu: { name: 'Apple M1 Max', type: 'mps', count: 1, vramTotalBytes: null, vramFreeBytes: null, vramTotalGB: null, unifiedMemory: true }, ramGB: 64, seen: true, comfyVersion: '0.43.2' }, // the plan's test laptop
  /** DGX Spark (GB10, 128 GB unified, SIMULATED): nvidia-smi and torch give no memory of the card's own, so system memory stands in (2026-10-31). */
  spark: { gpu: { name: 'NVIDIA GB10', type: 'cuda', count: 1, vramTotalBytes: null, vramFreeBytes: null, vramTotalGB: null, unifiedMemory: true }, ramGB: 128, seen: true, comfyVersion: '0.43.2' },
};
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** HW2 (BH): a folder as shown in API answers, never the server's absolute path: repo-relative inside the repo ('server/data'), else the folder name. */
export function displayDir(dir: string | null | undefined): string | null {
  if (!dir) return null; const abs = path.resolve(dir); const rel = path.relative(REPO_ROOT, abs);
  if (rel === '') return '.'; if (!rel.startsWith('..') && !path.isAbsolute(rel)) return rel.split(path.sep).join('/'); return path.basename(abs) || null;
}
/** diskInfo() for API answers: the same numbers, path via displayDir (internal callers keep diskInfo()). */
export const publicDisk = () => { const d = diskInfo(); return { ...d, path: displayDir(d.path) ?? 'server data folder' }; };
/** Free disk where the weights go (models folder, else the data folder). Tests: OPENHIGGSFIELD_DISK_FREE_GB pins the free space (mock backend only). */
/** Setup step 4: the models folder the connected ComfyUI (on this machine) uses, read from its /system_stats argv (Comfy Desktop's YAML). Free disk is
 *  measured there when no OPENHIGGSFIELD_COMFY_MODELS_DIR is set. Downloads still need the explicit setting. */
let detectedModelsDir: string | null = null;
export const comfyModelsDirDetected = () => detectedModelsDir;
export function diskInfo() { const dir = env('COMFY_MODELS_DIR')?.trim() || detectedModelsDir || DATA_DIR; const mockGb = config.backend === 'mock' ? Number(env('DISK_FREE_GB')) : NaN;
  try { const s = statfsSync(dir); return { path: dir, freeBytes: Number.isFinite(mockGb) && env('DISK_FREE_GB') ? Math.round(mockGb * 1e9) : Number(s.bavail) * Number(s.bsize), totalBytes: Number(s.blocks) * Number(s.bsize) }; } catch { return { path: dir, freeBytes: null, totalBytes: null }; } }
const isCloudBase = () => !!config.comfyBaseUrl && comfyNeedsKey();
/** The machine class for a reading (the host's own OS/arch only when the reading is the host's, or ComfyUI is on this machine). */
export const profileOf = (gpu: Gpu | null, ramTotal: number | null, seen: boolean, host: boolean): MachineProfile => classifyMachine({ seen, ramBytes: ramTotal, platform: host ? process.platform : null, arch: host ? process.arch : null,
  cpuModel: host ? os.cpus()[0]?.model ?? null : null, gpu: gpu ? { name: gpu.name, type: gpu.type, vramTotalBytes: gpu.vramTotalBytes ?? (gpu.unifiedMemory && gpu.type !== 'mps' ? ramTotal : null), count: gpu.count } : null });
function build(source: HwSource, gpu: Gpu | null, ramTotal: number | null, ramFree: number | null, seen: boolean, comfy: Hardware['comfy'], note: string | null): Omit<Hardware, 'cached' | 'manual' | 'manualInUse'> {
  const eff = seen ? effectiveVram(gpu, ramTotal) : null; const tier = tierOf(eff ?? 0, seen); const profile = profileOf(gpu, ramTotal, seen, source === 'host' || (source === 'comfyui-system_stats' && comfySameHost()));
  return { profile, source, checkedAt: new Date().toISOString(), maxAgeSec: MAX_AGE_SEC, comfy, gpu, ram: { totalBytes: ramTotal == null ? null : Math.round(ramTotal), freeBytes: ramFree == null ? null : Math.round(ramFree), totalGB: gb(ramTotal) }, disk: publicDisk(),
    effectiveVramGB: eff, tier, tierLabel: tierLabelOf(tier, profile), tierThresholdsGB: { ...TIER_THRESHOLDS_GB }, note };
}
const fromProfile = (name: string) => { const p = HW_PROFILES[name]; if (!p) return null; const ram = p.ramGB == null ? null : p.ramGB * GiB;
  return build(p.seen ? 'mock' : 'none', p.gpu, ram, ram == null ? null : ram * 0.6, p.seen, { reachable: p.seen ? true : null, version: p.comfyVersion ?? null, cloud: false, ggufNode: null }, p.seen ? null : "This computer's hardware couldn't be read."); };
/** OPENHIGGSFIELD_HW_MOCK: a profile name, or JSON {gpu:{name,type,vramGB}, ramGB, comfyVersion?, ggufNode?}. */
function envMock(): Omit<Hardware, 'cached' | 'manual' | 'manualInUse'> | null {
  const v = env('HW_MOCK')?.trim(); if (!v) return null; if (HW_PROFILES[v]) return fromProfile(v);
  try { const j = JSON.parse(v); const ram = j.ramGB != null ? Number(j.ramGB) * GiB : null; const g = j.gpu ? { name: String(j.gpu.name ?? 'GPU'), type: String(j.gpu.type ?? 'cuda'), count: 1, vramTotalBytes: j.gpu.vramGB != null ? Number(j.gpu.vramGB) * GiB : null, vramFreeBytes: null, vramTotalGB: j.gpu.vramGB != null ? Number(j.gpu.vramGB) : null, unifiedMemory: j.gpu.type === 'mps' } : null;
    return build('mock', g, ram, null, true, { reachable: true, version: j.comfyVersion ?? null, cloud: false, ggufNode: j.ggufNode ?? null }, null); } catch { return null; }
}
let override: Omit<Hardware, 'cached' | 'manual' | 'manualInUse'> | null = null;
/** Test hook (same pattern as setLocalAvailable): a profile name, a Hardware-like object, or null to clear. */
export function setHardwareOverride(h: string | Partial<Hardware> | null) {
  if (h == null) override = null; else if (typeof h === 'string') override = fromProfile(h); else { const b = fromProfile('rtx4090')!; override = { ...b, ...h, source: (h.source ?? 'mock') as HwSource } as any;
    if (h.gpu !== undefined || h.ram) { const eff = effectiveVram(override!.gpu, override!.ram.totalBytes); override!.effectiveVramGB = h.effectiveVramGB ?? eff; override!.tier = h.tier ?? tierOf(override!.effectiveVramGB, override!.source !== 'none'); override!.profile = h.profile ?? profileOf(override!.gpu, override!.ram.totalBytes, override!.source !== 'none', false); override!.tierLabel = tierLabelOf(override!.tier, override!.profile); } }
  cache = null;
}
// ---- ComfyUI probe (shared by the hardware probe, Q5 reachability and DP 6 /api/local/comfy/test) ----
/** HW2 item 5: why a check failed. refused (nothing listening) · timeout · not_found (DNS) · bad_response (it answered, but not like ComfyUI: HTTP error) ·
 *  unreachable (another network error) · not_set (no address) · cloud (Comfy Cloud is never probed). null when reachable. */
export type ComfyErrorCode = 'refused' | 'timeout' | 'not_found' | 'bad_response' | 'unreachable' | 'not_set' | 'cloud';
export interface ComfyCheck { url: string | null; reachable: boolean; version: string | null; latencyMs: number | null; stats: any | null; ggufNode: boolean | null; cloud: boolean; error: string | null; errorCode: ComfyErrorCode | null }
const secs = (ms: number) => { const v = Math.round(ms / 100) / 10; return `${v} second${v === 1 ? '' : 's'}`; };
/** Plain sentence for a failed check (UI copy). The url is shown without user:password or query (safeUrl). */
export function comfyErrorText(code: ComfyErrorCode, url: string, o: { timeoutMs?: number; status?: number } = {}): string {
  const shown = safeUrl(url) ?? url; let host = shown; try { host = new URL(url).hostname; } catch { /* keep */ }
  switch (code) {
    case 'refused': return `Couldn't connect to ComfyUI at ${shown}. Is it running?`;
    case 'timeout': return `ComfyUI at ${shown} didn't answer within ${secs(o.timeoutMs ?? 2000)}.`;
    case 'not_found': return `Couldn't find ${host}.`;
    case 'bad_response': return `Something answered at ${shown}, but not like ComfyUI${o.status ? ` (HTTP ${o.status})` : ''}.`;
    case 'not_set': return 'No ComfyUI address is set.';
    case 'cloud': return "Comfy Cloud isn't tested here (its hardware isn't yours).";
    default: return `Couldn't reach ComfyUI at ${shown}.`;
  }
}
const netCode = (e: any): ComfyErrorCode => { if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'timeout'; const c = String(e?.cause?.code ?? e?.code ?? '');
  if (c === 'ECONNREFUSED') return 'refused'; if (c === 'ENOTFOUND' || c === 'EAI_AGAIN' || c === 'EAI_NONAME') return 'not_found'; if (c === 'ETIMEDOUT' || c === 'UND_ERR_CONNECT_TIMEOUT' || c === 'UND_ERR_HEADERS_TIMEOUT') return 'timeout'; return 'unreachable'; };
let fetchImpl: typeof fetch = (...a) => fetch(...a);
/** Test hook: replace fetch for ComfyUI checks (null = real fetch). */
export const setComfyFetch = (f: typeof fetch | null) => { fetchImpl = f ?? ((...a) => fetch(...a)); reach = null; cache = null; };
const cloudUrl = (u: string) => !u || /cloud\.comfy\.org/i.test(u) || /\.run\.comfy\.app/i.test(u);
export async function checkComfy(url = config.comfyBaseUrl, o: { timeoutMs?: number; gguf?: boolean } = {}): Promise<ComfyCheck> {
  const base = String(url ?? '').trim().replace(/\/+$/, ''); const cloud = cloudUrl(base);
  if (!base || cloud) { const code: ComfyErrorCode = base ? 'cloud' : 'not_set'; return { url: base || null, reachable: false, version: null, latencyMs: null, stats: null, ggufNode: null, cloud, error: comfyErrorText(code, base), errorCode: code }; }
  const t0 = Date.now(); const tms = o.timeoutMs ?? 2000;
  try { const r = await fetchImpl(`${base}/system_stats`, { signal: AbortSignal.timeout(tms) }); const latencyMs = Date.now() - t0;
    if (!r.ok) { await r.arrayBuffer().catch(() => undefined); return { url: base, reachable: false, version: null, latencyMs, stats: null, ggufNode: null, cloud, error: comfyErrorText('bad_response', base, { status: r.status }), errorCode: 'bad_response' }; }
    let stats: any = null; try { stats = await r.json(); } catch { /* not JSON: still answering */ }
    let ggufNode: boolean | null = null;
    if (o.gguf !== false) { try { const g = await fetchImpl(`${base}/object_info/UnetLoaderGGUF`, { signal: AbortSignal.timeout(o.timeoutMs ?? 2000) }); ggufNode = g.ok ? !!((await g.json().catch(() => ({}))) as any)?.UnetLoaderGGUF : false; } catch { ggufNode = null; } }
    return { url: base, reachable: true, version: stats?.system?.comfyui_version ? String(stats.system.comfyui_version) : null, latencyMs, stats, ggufNode, cloud, error: null, errorCode: null };
  } catch (e: any) { const code = netCode(e); return { url: base, reachable: false, version: null, latencyMs: Date.now() - t0, stats: null, ggufNode: null, cloud, error: comfyErrorText(code, base, { timeoutMs: tms }), errorCode: code }; }
}
/** /system_stats → gpu + ram (ComfyUI server.py: system.{ram_total, ram_free, comfyui_version}, devices[{name, type, vram_total, vram_free}], bytes). devices[0] = primary. */
export function parseSystemStats(s: any): { gpu: Gpu | null; ramTotal: number | null; ramFree: number | null; version: string | null; pytorch: string | null } {
  const sys = s?.system ?? {}; const devs: any[] = Array.isArray(s?.devices) ? s.devices : []; const d = devs[0];
  const ramTotal = Number.isFinite(Number(sys.ram_total)) ? Number(sys.ram_total) : null; const ramFree = Number.isFinite(Number(sys.ram_free)) ? Number(sys.ram_free) : null;
  let gpu: Gpu | null = null;
  if (d && d.type && d.type !== 'cpu') { const vt = Number(d.vram_total) || null; gpu = { name: String(d.name ?? d.type), type: String(d.type), count: devs.filter((x) => x?.type === d.type).length || 1, vramTotalBytes: d.type === 'mps' ? null : vt, vramFreeBytes: d.type === 'mps' ? null : Number(d.vram_free) || null, vramTotalGB: d.type === 'mps' ? null : gb(vt), unifiedMemory: d.type === 'mps' || /\bGB10\b/i.test(String(d.name ?? '')) }; }
  else if (d && d.type === 'cpu') gpu = { name: 'cpu', type: 'cpu', count: 1, vramTotalBytes: 0, vramFreeBytes: 0, vramTotalGB: 0, unifiedMemory: false };
  return { gpu, ramTotal, ramFree, version: sys.comfyui_version ? String(sys.comfyui_version) : null, pytorch: sys.pytorch_version ? String(sys.pytorch_version) : null };
}
/** Host probe (ComfyUI on this machine): nvidia-smi (3 s), or macOS arm64 sysctl hw.memsize → mps. gpu null when neither answers (e.g. this box). */
export function probeHost(exec: typeof execFileSync = execFileSync): { gpu: Gpu | null; ramTotal: number; ramFree: number } {
  let gpu: Gpu | null = null;
  try { const rows = exec('nvidia-smi', ['--query-gpu=name,memory.total,memory.free', '--format=csv,noheader,nounits'], { timeout: 3000 }).toString().trim().split('\n').filter(Boolean).map((l) => l.split(',').map((x) => x.trim()));
    if (rows.length) { const [name, tot, free] = rows[0]; gpu = cuda(name, Number(tot), Number(free)); gpu.count = rows.length;
      if (!Number.isFinite(Number(tot))) gpu = { ...gpu, vramTotalBytes: null, vramFreeBytes: null, vramTotalGB: null, unifiedMemory: /\bGB10\b/i.test(name) }; } } catch { gpu = null; } // GB10 (DGX Spark): memory "[N/A]", unified
  if (!gpu && process.platform === 'darwin' && process.arch === 'arm64') { try { const mem = Number(exec('sysctl', ['-n', 'hw.memsize'], { timeout: 3000 }).toString().trim()); if (mem > 0) gpu = { name: 'Apple Silicon', type: 'mps', count: 1, vramTotalBytes: null, vramFreeBytes: null, vramTotalGB: null, unifiedMemory: true }; } catch { /* */ } }
  return { gpu, ramTotal: os.totalmem(), ramFree: os.freemem() };
}
/** ComfyUI is on this machine: the base URL host is loopback. (No base URL = Comfy Cloud, config.ts comfyNeedsKey, so never the host.) */
export const comfySameHost = () => { const b = config.comfyBaseUrl.trim(); if (!b) return false; try { const h = new URL(b).hostname; return /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?)$/.test(h) || /^127\./.test(h); } catch { return false; } };
let hostProbe: typeof probeHost = probeHost;
/** Test hook: replace the host probe (null = real). */
export const setHostProbe = (f: typeof probeHost | null) => { hostProbe = f ?? probeHost; cache = null; };
async function probe(): Promise<Omit<Hardware, 'cached' | 'manual' | 'manualInUse'>> {
  if (isCloudBase()) return build('none', null, null, null, false, { reachable: null, version: null, cloud: true, ggufNode: null }, "Connected to Comfy Cloud, so your computer's hardware isn't used.");
  const c = config.comfyBaseUrl ? await checkComfy(config.comfyBaseUrl) : null;
  if (c) noteReach(c.reachable);
  if (c?.reachable && c.stats) { const s = parseSystemStats(c.stats); const same = comfySameHost(); const inst = comfyInstallOf(same ? c.stats : { system: { ...c.stats.system, argv: [] } }); // another computer's paths mean nothing here
    detectedModelsDir = same ? inst.modelsDir : null;
    return build('comfyui-system_stats', s.gpu, s.ramTotal, s.ramFree, true, { reachable: true, version: s.version, pytorch: s.pytorch, cloud: false, ggufNode: c.ggufNode, kind: inst.kind, label: inst.label, modelsDir: displayDir(inst.modelsDir), modelsDirSource: inst.modelsDirSource }, null); }
  if (comfySameHost()) { const h = hostProbe(); return build('host', h.gpu, h.ramTotal, h.ramFree, true, { reachable: c?.reachable ?? null, version: c?.version ?? null, cloud: false, ggufNode: c?.ggufNode ?? null }, h.gpu ? null : 'No graphics card was found on this computer.'); }
  return build('none', null, null, null, false, { reachable: c ? c.reachable : null, version: null, cloud: false, ggufNode: null }, c ? "ComfyUI isn't answering, so this computer's hardware couldn't be read." : "No local ComfyUI is connected, so this computer's hardware couldn't be read.");
}
// ---- DP 5 manual override ----
type Manual = { vramGB: number; ramGB: number | null; savedAt: string };
export const getManual = (): Manual | null => getKv<Manual | null>('hardware.manual', null);
export function setManual(m: { vramGB: number; ramGB?: number | null } | null) { if (!m) setKv('hardware.manual', null); else setKv('hardware.manual', { vramGB: m.vramGB, ramGB: m.ramGB ?? null, savedAt: new Date().toISOString() }); cache = cache ? { ...cache, at: 0 } : null; }
function withManual(h0: Omit<Hardware, 'cached' | 'manual' | 'manualInUse'>, cached: boolean): Hardware {
  const h = { ...h0, profile: h0.profile ?? profileOf(h0.gpu, h0.ram?.totalBytes ?? null, h0.tier !== 'unknown', false) /* a snapshot saved before profiles */, disk: publicDisk(), effectiveVramGB: h0.tier === 'unknown' || h0.source === 'none' ? null : h0.effectiveVramGB }; const m = getManual(); // dp30 (f): an older saved snapshot may still carry 0; // disk is read live (cheap statfs); path shown repo-relative / folder name only
  if (m && h.tier === 'unknown') { const ram = m.ramGB != null ? m.ramGB * GiB : h.ram.totalBytes; const g: Gpu = { name: 'Set by you', type: 'cuda', count: 1, vramTotalBytes: Math.round(m.vramGB * GiB), vramFreeBytes: null, vramTotalGB: m.vramGB, unifiedMemory: false };
    const b = build('manual', m.vramGB > 0 ? g : null, ram, null, true, h.comfy, 'Using the graphics memory you entered, because the hardware couldn’t be read.'); return { ...b, cached, manual: m, manualInUse: true }; }
  return { ...h, cached, manual: m, manualInUse: false };
}
// ---- cache ----
let cache: { at: number; hw: Omit<Hardware, 'cached' | 'manual' | 'manualInUse'> } | null = null; let lastProbeAt = 0; let inflight: Promise<any> | null = null;
{ const last = getKv<any>('hardware.last', null); if (last?.hw?.source && !env('HW_MOCK')) cache = { at: 0, hw: last.hw }; } // survives a restart (re-probed on first use)
const mockNow = () => override ?? envMock();
async function reprobe() { if (inflight) return inflight; lastProbeAt = Date.now();
  inflight = probe().then((hw) => { cache = { at: Date.now(), hw }; setKv('hardware.last', { hw }); return hw; }).finally(() => { inflight = null; }); return inflight; }
/** GET /api/hardware. refresh → re-probe (at most one per 5 s). */
export async function getHardware(o: { refresh?: boolean } = {}): Promise<Hardware> {
  const m = mockNow(); if (m) return withManual(m, false);
  const fresh = cache && cache.at && Date.now() - cache.at < MAX_AGE_SEC * 1000;
  if (o.refresh && Date.now() - lastProbeAt >= REFRESH_MIN_MS) return withManual(await reprobe(), false);
  if (fresh) return withManual(cache!.hw, true);
  if (o.refresh && cache) return withManual(cache.hw, true); // rate-limited
  return withManual(await reprobe(), false);
}
/** Sync snapshot for routing (fit verdicts): mock / override, else the last probe; a stale or missing snapshot starts a background probe. */
export function currentHardware(): Hardware {
  const m = mockNow(); if (m) return withManual(m, false);
  if (!cache || !cache.at || Date.now() - cache.at > MAX_AGE_SEC * 1000) void reprobe().catch(() => undefined);
  return withManual(cache?.hw ?? build('none', null, null, null, false, { reachable: null, version: null, cloud: isCloudBase(), ggufNode: null }, "This computer's hardware hasn't been read yet."), !!cache);
}
/** Short machine name for a result's Run on line: 'Apple M3 Max' → 'M3 Max', 'NVIDIA GeForce RTX 4090' → 'RTX 4090'. null when no GPU is known (or CPU only). */
export function machineName(h: Hardware = currentHardware()): string | null {
  const n = String(h.gpu?.name ?? '').trim(); if (!n || h.gpu?.type === 'cpu' || /^cpu$/i.test(n)) return null;
  return n.replace(/^(Apple|NVIDIA|AMD|Intel)\s+/i, '').replace(/^(GeForce|Radeon|Arc)\s+/i, '').replace(/\s+Laptop GPU$/i, ' Laptop').replace(/\s+GPU$/i, '').trim().slice(0, 40) || null;
}
export const lastRefreshAt = () => lastProbeAt;
// ---- "This computer" card (2026-10-31): memory and disk right now ----
export interface LiveReading { at: string; ram: { totalBytes: number; freeBytes: number; source: 'comfyui' | 'vm_stat' | 'os' }; vram: { totalBytes: number; freeBytes: number } | null;
  disk: ReturnType<typeof publicDisk>; comfy: { reachable: boolean | null; version: string | null; pytorch: string | null } }
/** macOS: os.freemem() counts only free pages, so a busy 64 GB machine looks full. Available = free + speculative + inactive pages
 *  (about what psutil, and so ComfyUI, call available). null when vm_stat can't be read. */
export function parseVmStat(out: string): number | null {
  const page = Number(/page size of (\d+) bytes/.exec(out)?.[1]); if (!(page > 0)) return null;
  const n = (label: string) => Number(new RegExp(`Pages ${label}:\\s+(\\d+)`).exec(out)?.[1] ?? 0);
  const pages = n('free') + n('inactive') + n('speculative'); return pages > 0 ? pages * page : null;
}
let liveMemo: { at: number; v: LiveReading } | null = null; const LIVE_MIN_MS = 2000;
/** GET /api/hardware/live: free memory (ComfyUI's own reading when it answers on this computer, else the host's), free graphics memory on a card, free disk
 *  where models live, and whether ComfyUI answers. Cheap: one /system_stats GET (1 s timeout) or one vm_stat; at most one reading per 2 s. Never Comfy Cloud. */
export async function liveReading(): Promise<LiveReading> {
  if (liveMemo && Date.now() - liveMemo.at < LIVE_MIN_MS) return liveMemo.v;
  const local = !!config.comfyBaseUrl && !cloudUrl(config.comfyBaseUrl);
  const c = local ? await checkComfy(config.comfyBaseUrl, { timeoutMs: 1000, gguf: false }) : null; if (c) noteReach(c.reachable);
  const s = c?.reachable && c.stats ? parseSystemStats(c.stats) : null; // models run where ComfyUI runs, so its reading wins
  let ram: LiveReading['ram'];
  if (s && s.ramTotal && s.ramFree != null) ram = { totalBytes: s.ramTotal, freeBytes: s.ramFree, source: 'comfyui' };
  else { let avail: number | null = null; if (process.platform === 'darwin') { try { avail = parseVmStat(execFileSync('vm_stat', [], { timeout: 2000 }).toString()); } catch { avail = null; } }
    ram = { totalBytes: os.totalmem(), freeBytes: avail != null ? Math.min(avail, os.totalmem()) : os.freemem(), source: avail != null ? 'vm_stat' : 'os' }; }
  const g = s?.gpu; const vram = g && !g.unifiedMemory && g.vramTotalBytes && g.vramFreeBytes != null ? { totalBytes: g.vramTotalBytes, freeBytes: g.vramFreeBytes } : null;
  const v: LiveReading = { at: new Date().toISOString(), ram, vram, disk: publicDisk(), comfy: { reachable: c ? c.reachable : null, version: c?.version ?? null, pytorch: s?.pytorch ?? null } };
  liveMemo = { at: Date.now(), v }; return v;
}
export const REFRESH_MIN_SEC = REFRESH_MIN_MS / 1000;
/** hwKey for learned timings (2026-10-31, hardware plan B8): the machine class, the chip or card name and its memory, so the same computer gets one
 *  key whichever probe answered (before, Apple Silicon was 'mps|mps|48' through ComfyUI and 'mps|Apple Silicon|48' through the host probe).
 *  Apple Silicon and DGX Spark: system memory (unified); a graphics card: its VRAM. 'none|<tier>' without a GPU. */
type HwLike = Pick<Hardware, 'gpu' | 'tier' | 'effectiveVramGB' | 'profile'> & { ram?: { totalGB: number | null } | null };
export function hwKeyOf(h: HwLike = currentHardware()): string {
  const g = h.gpu; if (!g) return `none|${h.tier}`; const p = h.profile;
  if (!p || p.id === 'unknown') return legacyHwKey(h);
  const mem = p.unifiedMemory ? p.ramGB ?? h.ram?.totalGB ?? p.usableGB : p.vramGB ?? g.vramTotalGB ?? h.effectiveVramGB;
  return `${p.id}|${p.gpuName ?? cleanGpuName(g.name)}|${Math.round(mem ?? 0)}`;
}
/** The key the same reading had before 2026-10-31 (GPU type, raw name, VRAM or the 0.75 × RAM estimate). */
export const legacyHwKey = (h: Pick<Hardware, 'gpu' | 'tier' | 'effectiveVramGB'>) => { const g = h.gpu; return g ? `${g.type}|${g.name}|${g.vramTotalGB ?? Math.round(h.effectiveVramGB ?? 0)}` : `none|${h.tier}`; };
/** Is k an old-style key this computer wrote? Same GPU type and memory figure, and the same card name (any name on Apple Silicon: 'mps', 'Apple Silicon', the chip). */
export function isLegacyKeyOf(k: string, h: Pick<Hardware, 'gpu' | 'tier' | 'effectiveVramGB'>): boolean {
  const g = h.gpu; if (!g) return false; const parts = k.split('|'); if (parts.length !== 3) return false; const [t, name, n] = parts;
  const mine = g.vramTotalGB ?? Math.round(h.effectiveVramGB ?? 0);
  return t === g.type && Number.isFinite(Number(n)) && Math.abs(Number(n) - mine) < 0.5 && (t === 'mps' || cleanGpuName(name) === cleanGpuName(g.name));
}
let canonMemo: { hw: unknown; f: (k: string) => string } | null = null;
/** Merge on read (etaLearn.ts, stepEta.ts): old keys this computer wrote map to its current key, so learned timings aren't lost or split. The stored
 *  rows keep their old key; nothing is rewritten. Uses the last reading (no probe, no disk read), memoised per reading. */
export function hwKeyCanon(): (k: string) => string {
  const raw = mockNow() ?? cache?.hw ?? null; if (canonMemo && canonMemo.hw === raw) return canonMemo.f;
  const f = !raw?.gpu ? (k: string) => k : ((cur: string) => (k: string) => (k !== cur && isLegacyKeyOf(k, raw) ? cur : k))(hwKeyOf(raw));
  canonMemo = { hw: raw, f }; return f;
}

// ---- Q5: real local reachability (cached 30 s) ----
let reach: { at: number; ok: boolean } | null = null; let reachOverride: boolean | null = null; let reachInflight: Promise<boolean> | null = null;
export const REACH_TTL_MS = 30_000;
const noteReach = (ok: boolean) => { reach = { at: Date.now(), ok }; };
/** Test hook: force reachability (null = real check). */
export const setComfyReachableOverride = (v: boolean | null) => { reachOverride = v; };
export async function refreshReachability(): Promise<boolean> {
  if (reachInflight) return reachInflight;
  reachInflight = checkComfy(config.comfyBaseUrl, { timeoutMs: 1500, gguf: false }).then((c) => { noteReach(c.reachable); return c.reachable; }).finally(() => { reachInflight = null; }); return reachInflight;
}
/** Sync: is a local ComfyUI reachable? Mock backend → yes (development and tests: it renders samples; OPENHIGGSFIELD_LOCAL_AVAILABLE=0 simulates none).
 *  Comfy backend with no ComfyUI address, or a Comfy Cloud address → NO (setups-routing 2026-10-29: a Comfy key alone is not "your computer";
 *  before, a cloud-only install offered every local-only model as free and sent it to Comfy Cloud unpriced, or returned a sample).
 *  Comfy backend on a local/remote ComfyUI address → the cached check (optimistic until the first answer; refreshed in the background every 30 s). */
export function localReachable(ttlMs: number = REACH_TTL_MS): boolean {
  if (reachOverride != null) return reachOverride;
  if (config.backend === 'mock') return true;
  if (!config.comfyBaseUrl || cloudUrl(config.comfyBaseUrl)) return false;
  if (!reach || Date.now() - reach.at > ttlMs) void refreshReachability().catch(() => undefined);
  return reach ? reach.ok : true;
}
// ---- DP 6: runtime ComfyUI address ----
const ENV_URL = process.env.COMFY_BASE_URL || '';
export function comfyUrlState() { const saved = getKv<string | null>('local.comfyUrl', null); return { url: config.comfyBaseUrl || null, source: saved ? 'settings' as const : ENV_URL ? 'server' as const : null, savedUrl: saved, serverDefault: ENV_URL ? safeUrl(ENV_URL) : null, cloud: !!config.comfyBaseUrl && cloudUrl(config.comfyBaseUrl) }; }
/** No user:password, no query string in anything we show (a key could ride there). */
export const safeUrl = (u: string) => { try { const x = new URL(u); x.username = ''; x.password = ''; x.search = ''; x.hash = ''; return x.toString().replace(/\/$/, ''); } catch { return null; } };
export function comfyUrlError(u: unknown): string | null {
  if (typeof u !== 'string' || !u.trim()) return 'url must be an http(s) address, e.g. http://127.0.0.1:8188';
  let x: URL; try { x = new URL(u.trim()); } catch { return 'url must be an http(s) address, e.g. http://127.0.0.1:8188'; }
  if (!/^https?:$/.test(x.protocol)) return 'url must start with http:// or https://';
  if (x.username || x.password) return "Don't put a user name or password in the address.";
  if (x.search || x.hash) return 'The address takes no query string.';
  return null;
}
export function setComfyUrl(u: string | null) {
  const next = u ? safeUrl(u.trim())! : null; setKv('local.comfyUrl', next);
  config.comfyBaseUrl = next ?? ENV_URL; if (next) process.env.COMFY_BASE_URL = next; else if (ENV_URL) process.env.COMFY_BASE_URL = ENV_URL; else delete process.env.COMFY_BASE_URL;
  reach = null; cache = null; return comfyUrlState();
}
{ const saved = getKv<string | null>('local.comfyUrl', null); if (saved) { config.comfyBaseUrl = saved; process.env.COMFY_BASE_URL = saved; } }
/** Boot: first reachability check + probe in the background (never blocks start-up). */
export function warmHardware() { if (config.backend === 'comfy' && config.comfyBaseUrl && !cloudUrl(config.comfyBaseUrl)) void refreshReachability().catch(() => undefined); if (!mockNow()) void reprobe().catch(() => undefined); }
