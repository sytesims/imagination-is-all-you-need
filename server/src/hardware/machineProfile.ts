/**
 * Setup step 2 (2026-10-26): ONE classification of the machine, shared by the server (hardware.ts → Hardware.profile, and through it the fit
 * verdicts in hardware/requirements.ts) and `npm run doctor`. Pure: no I/O, no database.
 * Classes: apple-silicon (PyTorch MPS) · nvidia (consumer RTX tiers by VRAM: <8 / 8 / 12 / 16 / 24 / 32+) · nvidia-blackwell (RTX 50-series, RTX PRO
 * Blackwell, B-series: nvfp4 runs natively) · dgx-spark (NVIDIA GB10, ARM64 Linux, about 128 GB unified memory: its usable "VRAM" is system memory;
 * some aarch64 Python wheels are missing) · amd-rocm · intel-xpu · cpu-only · unknown (nothing read: nothing is blocked).
 * Inputs are what ComfyUI's /system_stats and `nvidia-smi --query-gpu=name,memory.total,memory.free,compute_cap` report. The profiles in
 * server/test/fixtures/machines/ are SIMULATED (recorded / reconstructed answers), not runs on that hardware.
 */
export type MachineClass = 'apple-silicon' | 'nvidia' | 'nvidia-blackwell' | 'dgx-spark' | 'amd-rocm' | 'intel-xpu' | 'cpu-only' | 'unknown';
export type VramClass = '<8' | '8' | '12' | '16' | '24' | '32+';
export interface MachineGpuIn { name: string; type: string; vramTotalBytes: number | null; count?: number }
export interface MachineInput { seen: boolean; platform?: string | null; arch?: string | null; ramBytes?: number | null; gpu?: MachineGpuIn | null; computeCap?: string | null; cpuModel?: string | null }
export interface MachineProfile {
  id: MachineClass; label: string; backend: 'mps' | 'cuda' | 'rocm' | 'xpu' | 'cpu' | 'unknown';
  gpuName: string | null; vramGB: number | null; ramGB: number | null;
  /** Memory the models can use: VRAM; Apple Silicon 0.75 × RAM (the macOS GPU wired-memory default, an estimate); DGX Spark: system memory (unified). */
  usableGB: number | null; unifiedMemory: boolean; vramClass: VramClass | null;
  weights: { fp8: 'native' | 'upcast' | 'no'; nvfp4: 'native' | 'emulated' | 'no'; gguf: boolean };
  notes: string[];
}
const GiB = 2 ** 30; const r1 = (n: number) => Math.round(n * 10) / 10;
/** ComfyUI's device name → the card name ('cuda:0 NVIDIA GeForce RTX 4090 : cudaMallocAsync' → 'NVIDIA GeForce RTX 4090'). */
export const cleanGpuName = (n: string) => n.replace(/^(cuda|xpu|hip):\d+\s+/i, '').replace(/\s*:\s*(cudaMallocAsync|native|[a-z]+)\s*$/i, '').trim();
export function vramClassOf(gb: number): VramClass { const g = gb + 0.5; return g < 8 ? '<8' : g < 12 ? '8' : g < 16 ? '12' : g < 24 ? '16' : g < 32 ? '24' : '32+'; }
const capMajor = (c: string | null | undefined) => (c && /^\d+(\.\d+)?$/.test(c) ? Number(c) : null);
const isGb10 = (n: string) => /\bGB10\b|DGX\s*Spark/i.test(n);
const isBlackwell = (n: string, cap: number | null) => (cap != null && cap >= 10) || /RTX\s*50[5-9]0|RTX\s*PRO\s*\d+\s*Blackwell|\bB[12]00\b|\bGB[23]00\b|Blackwell/i.test(n);
const isAda = (n: string, cap: number | null) => (cap != null && cap >= 8.9) || /RTX\s*40[5-9]0|RTX\s*\d*\s*Ada|\bL40S?\b|\bL4\b|\bH1[02]0\b|\bH200\b/i.test(n);
const isAmd = (n: string) => /\bAMD\b|Radeon|Instinct|\bMI\d{3}/i.test(n);

export function classifyMachine(i: MachineInput): MachineProfile {
  const ramGB = i.ramBytes ? r1(i.ramBytes / GiB) : null; const g = i.gpu ?? null; const name = g ? cleanGpuName(g.name) : null;
  const vram = g?.vramTotalBytes && Number.isFinite(g.vramTotalBytes) ? r1(g.vramTotalBytes / GiB) : null;
  const P = (p: Partial<MachineProfile> & Pick<MachineProfile, 'id' | 'label' | 'backend'>): MachineProfile => ({ gpuName: name, vramGB: vram, ramGB, usableGB: null, unifiedMemory: false, vramClass: null, weights: { fp8: 'no', nvfp4: 'no', gguf: true }, notes: [], ...p });
  if (!i.seen) return P({ id: 'unknown', label: "Hardware not read", backend: 'unknown', gpuName: null, vramGB: null, weights: { fp8: 'upcast', nvfp4: 'emulated', gguf: true }, notes: ["Couldn't read the hardware, so nothing is blocked."] });
  if (!g || g.type === 'cpu') return P({ id: 'cpu-only', label: 'No graphics card (processor only)', backend: 'cpu', gpuName: null, vramGB: 0, usableGB: 0, weights: { fp8: 'upcast', nvfp4: 'no', gguf: true }, notes: ['Only the small image tools run locally; the rest is best on Comfy Cloud.'] });
  if (g.type === 'mps') { const chip = i.cpuModel && /Apple/i.test(i.cpuModel) ? i.cpuModel.trim() : name && /^Apple\s+M\d/i.test(name) ? name : 'Apple Silicon'; // the chip: the host's CPU name, else a device name that already is one
    return P({ id: 'apple-silicon', label: `${chip}${ramGB ? ` · ${Math.round(ramGB)} GB` : ''}`, backend: 'mps', gpuName: chip, vramGB: null, usableGB: ramGB != null ? r1(ramGB * 0.75) : null, unifiedMemory: true, weights: { fp8: 'no', nvfp4: 'no', gguf: true },
      notes: ['fp8, nvfp4 and w4a8 weights don’t load on Apple graphics (no float8 type); those models run on Comfy Cloud.'] }); }
  if (g.type === 'xpu') return P({ id: 'intel-xpu', label: `${name} (Intel)`, backend: 'xpu', usableGB: vram, vramClass: vram != null ? vramClassOf(vram) : null, weights: { fp8: 'upcast', nvfp4: 'no', gguf: true }, notes: ['Intel graphics: untested here, so nothing is blocked beyond memory.'] });
  if (g.type === 'rocm' || isAmd(name ?? '')) return P({ id: 'amd-rocm', label: `${name} (ROCm)`, backend: 'rocm', usableGB: vram, vramClass: vram != null ? vramClassOf(vram) : null, weights: { fp8: 'upcast', nvfp4: 'no', gguf: true },
    notes: ['AMD (ROCm): ComfyUI runs, but some custom nodes are CUDA-only.'] });
  const cap = capMajor(i.computeCap); const n = name ?? '';
  // DGX Spark: the GB10 name, or compute capability 12.1 (sm_121, GB10 only), or an NVIDIA GPU on ARM64 Linux that reports no memory of its own (unified)
  if (isGb10(n) || cap === 12.1 || (i.arch === 'arm64' && i.platform === 'linux' && vram == null)) {
    // GB10: CPU and GPU share LPDDR5x; nvidia-smi shows no memory figure ([N/A]) and torch reports (about) all of system memory.
    const usable = vram ?? ramGB; return P({ id: 'dgx-spark', label: `NVIDIA DGX Spark (GB10${usable ? ` · ${Math.round(usable)} GB unified` : ''})`, backend: 'cuda', gpuName: n || 'NVIDIA GB10', vramGB: usable, usableGB: usable, unifiedMemory: true, vramClass: usable != null ? vramClassOf(usable) : null,
      weights: { fp8: 'native', nvfp4: 'native', gguf: true }, notes: ['Graphics memory is the system memory (unified), so big models fit, but generation is slower than on a desktop RTX card.', 'ARM64 Linux: some custom nodes have no aarch64 Python wheels (build them, or skip those nodes).'] }); }
  const bw = isBlackwell(n, cap); const ada = !bw && isAda(n, cap); const usable = vram;
  return P({ id: bw ? 'nvidia-blackwell' : 'nvidia', label: `${n || 'NVIDIA GPU'}${vram != null ? ` · ${Math.round(vram)} GB` : ''}`, backend: 'cuda', usableGB: usable, vramClass: usable != null ? vramClassOf(usable) : null,
    weights: { fp8: bw || ada ? 'native' : 'upcast', nvfp4: bw ? 'native' : 'emulated', gguf: true },
    notes: bw ? ['Blackwell: nvfp4 weights run natively (fastest).'] : [`nvfp4 weights load but run dequantized (slower than on an RTX 50-series card)${ada ? '' : '; fp8 weights are upcast'}.`] });
}
/** /system_stats (+ what the host knows) → MachineInput. */
export function inputFromSystemStats(stats: any, host: { platform?: string | null; arch?: string | null; cpuModel?: string | null; computeCap?: string | null } = {}): MachineInput {
  const sys = stats?.system ?? {}; const d = Array.isArray(stats?.devices) ? stats.devices[0] : null; const ram = Number(sys.ram_total) || null;
  const plat = host.platform ?? (sys.os === 'nt' ? 'win32' : sys.os === 'darwin' ? 'darwin' : sys.os === 'posix' ? 'linux' : null);
  if (!stats?.system) return { seen: false };
  return { seen: true, platform: plat, arch: host.arch ?? null, ramBytes: ram, cpuModel: host.cpuModel ?? null, computeCap: host.computeCap ?? null,
    gpu: !d || !d.type || d.type === 'cpu' ? null : { name: String(d.name ?? d.type), type: String(d.type), vramTotalBytes: d.type === 'mps' ? null : Number(d.vram_total) || null, count: (stats.devices as any[]).filter((x) => x?.type === d.type).length || 1 } };
}
/** `nvidia-smi --query-gpu=name,memory.total,memory.free[,compute_cap] --format=csv,noheader,nounits` → rows. [N/A] memory (GB10) → null. */
export function parseNvidiaSmi(csv: string): { name: string; totalMiB: number | null; freeMiB: number | null; computeCap: string | null }[] {
  const num = (s: string | undefined) => (s && /^\d+(\.\d+)?$/.test(s) ? Number(s) : null);
  return csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const [name, t, f, c] = l.split(',').map((x) => x.trim()); return { name, totalMiB: num(t), freeMiB: num(f), computeCap: c && /^\d+\.\d+$/.test(c) ? c : null }; });
}
export function inputFromNvidiaSmi(csv: string, host: { platform?: string | null; arch?: string | null; ramBytes?: number | null; cpuModel?: string | null }): MachineInput {
  const rows = parseNvidiaSmi(csv); const r = rows[0];
  if (!r) return { seen: true, platform: host.platform, arch: host.arch, ramBytes: host.ramBytes ?? null, gpu: null, cpuModel: host.cpuModel ?? null };
  return { seen: true, platform: host.platform, arch: host.arch, ramBytes: host.ramBytes ?? null, cpuModel: host.cpuModel ?? null, computeCap: r.computeCap,
    gpu: { name: r.name, type: 'cuda', vramTotalBytes: r.totalMiB != null ? r.totalMiB * 1024 * 1024 : null, count: rows.length } };
}
