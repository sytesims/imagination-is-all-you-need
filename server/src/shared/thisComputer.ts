/**
 * "This computer" (2026-10-31, hardware plan B1–B3): the words for this machine and the count of local models that run on it, shared by Settings →
 * Your computer, Connections, the run menu and their tests. Pure (no I/O): it reads what GET /api/tools and GET /api/hardware already return.
 *  - Counts are UNIQUE local models (a model listed under several tools counts once), from each model's Local row in /api/tools.
 *  - "Run here" = every local model the hardware doesn't refuse: ready, to download, or a node pack to add. "Need NVIDIA" = weights or nodes this
 *    computer can't load (reasonCode unsupported_weights / unsupported_hardware). "Too big" = a too_heavy fit (not enough graphics or system memory).
 */
export interface LocalRowLike { id: string; status: string; reasonCode?: string | null; action?: { kind?: string } | null }
export type ToolsLike = { models?: { key: string; runsOn?: LocalRowLike[] }[] }[];
export interface LocalCounts { total: number; runs: number; ready: number; download: number; setUp: number; needsNvidia: number; tooBig: number }

const NVIDIA_ONLY = new Set(['unsupported_weights', 'unsupported_hardware']);
const TOO_BIG = new Set(['too_heavy', 'not_enough_vram', 'not_enough_ram', 'no_gpu']);

export function countLocalModels(tools: ToolsLike): LocalCounts {
  const seen = new Map<string, LocalRowLike>();
  for (const t of tools) for (const m of t.models ?? []) {
    const r = m.runsOn?.find((x) => x.id === 'local'); if (!r || r.status === 'coming-soon' || seen.has(m.key)) continue; seen.set(m.key, r); }
  const c: LocalCounts = { total: seen.size, runs: 0, ready: 0, download: 0, setUp: 0, needsNvidia: 0, tooBig: 0 };
  for (const r of seen.values()) {
    if (NVIDIA_ONLY.has(String(r.reasonCode))) c.needsNvidia++;
    else if (TOO_BIG.has(String(r.reasonCode))) c.tooBig++;
    else { c.runs++; if (r.status === 'ready') c.ready++; else if (r.reasonCode === 'weights_missing' || r.action?.kind === 'download') c.download++; else if (r.reasonCode === 'nodes_missing' || r.action?.kind === 'install_node') c.setUp++; } } // the rest (Local switched off, ComfyUI not answering) still runs here
  return c;
}

/** "36 of 57 local models run here · 21 need NVIDIA" (· "2 too big" when any). '' when there are no local models. */
export function localCountsText(c: LocalCounts): string {
  if (!c.total) return '';
  return [`${c.runs} of ${c.total} local models run here`, c.needsNvidia ? `${c.needsNvidia} need NVIDIA` : '', c.tooBig ? `${c.tooBig} too big` : ''].filter(Boolean).join(' · ');
}
/** "25 ready, 11 to download" for the models that run here (+ "2 need a node pack"); '' when nothing to say. */
export function localReadyText(c: LocalCounts): string {
  return [c.ready ? `${c.ready} ready` : '', c.download ? `${c.download} to download` : '', c.setUp ? `${c.setUp} need a node pack` : ''].filter(Boolean).join(', ');
}

export interface ProfileLike { id: string; label: string; usableGB?: number | null; vramGB?: number | null; ramGB?: number | null; unifiedMemory?: boolean }
const gbs = (n: number) => `${n >= 10 ? Math.round(n) : Math.round(n * 10) / 10} GB`;
/** What models can use, labelled as what it is (never "VRAM" for shared memory):
 *  Apple chip: "about 48 GB usable for models" (the system's graphics limit, about three quarters of memory, an estimate);
 *  DGX Spark: "about 128 GB usable for models (shared memory)"; a graphics card: "24 GB graphics memory". '' when unknown. */
export function usableText(p: ProfileLike | null | undefined): string {
  if (!p || p.usableGB == null || !(p.usableGB > 0)) return '';
  if (p.id === 'apple-silicon') return `about ${gbs(p.usableGB)} usable for models`;
  if (p.unifiedMemory) return `about ${gbs(p.usableGB)} usable for models (shared memory)`;
  return `${gbs(p.usableGB)} graphics memory`;
}
/** The machine's own name: the profile label ("Apple M1 Max · 64 GB", "NVIDIA GeForce RTX 4090 · 24 GB"), never ComfyUI's device id ("mps", "cuda:0 …"). */
export const machineLabel = (p: ProfileLike | null | undefined): string => (p && p.id !== 'unknown' ? p.label : '');
/** Bytes → "13 GB" (one decimal under 10 GB). */
export const gbOf = (bytes: number | null | undefined): string => (bytes == null || !Number.isFinite(bytes) ? '' : gbs(bytes / 2 ** 30));
