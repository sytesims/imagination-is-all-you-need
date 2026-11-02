/**
 * "This computer" (2026-10-31, hardware plan B1–B3): the words for this machine and the count of local models that run on it, shared by Settings →
 * Your computer, Connections, the run menu and their tests. Pure (no I/O): it reads what GET /api/tools and GET /api/hardware already return.
 *  - Counts are UNIQUE local models (a model listed under several tools counts once), from each model's Local row in /api/tools.
 *  - "Run here" = every local model the hardware doesn't refuse: ready, to download, or a node pack to add. "Need NVIDIA" = weights or nodes this
 *    computer can't load (reasonCode unsupported_weights / unsupported_hardware). "Too big" = a too_heavy fit (not enough graphics or system memory).
 */
export interface LocalRowLike { id: string; status: string; reasonCode?: string | null; action?: { kind?: string } | null; /** item 5: runs only with a platform variant nobody has tested here */ here?: { untested?: boolean } | null }
export type ToolsLike = { models?: { key: string; runsOn?: LocalRowLike[] }[] }[];
export interface LocalCounts { total: number; runs: number; ready: number; download: number; setUp: number; needsNvidia: number; tooBig: number; /** should run with files made for this computer, not tested yet (never counted as "run here") */ untested: number }

const NVIDIA_ONLY = new Set(['unsupported_weights', 'unsupported_hardware']);
const TOO_BIG = new Set(['too_heavy', 'not_enough_vram', 'not_enough_ram', 'no_gpu']);

export function countLocalModels(tools: ToolsLike): LocalCounts {
  const seen = new Map<string, LocalRowLike>();
  for (const t of tools) for (const m of t.models ?? []) {
    const r = m.runsOn?.find((x) => x.id === 'local'); if (!r || r.status === 'coming-soon' || seen.has(m.key)) continue; seen.set(m.key, r); }
  const c: LocalCounts = { total: seen.size, runs: 0, ready: 0, download: 0, setUp: 0, needsNvidia: 0, tooBig: 0, untested: 0 };
  for (const r of seen.values()) {
    if (NVIDIA_ONLY.has(String(r.reasonCode))) c.needsNvidia++;
    else if (TOO_BIG.has(String(r.reasonCode))) c.tooBig++;
    else if (r.here?.untested) c.untested++;
    else { c.runs++; if (r.status === 'ready') c.ready++; else if (r.reasonCode === 'weights_missing' || r.action?.kind === 'download') c.download++; else if (r.reasonCode === 'nodes_missing' || r.action?.kind === 'install_node') c.setUp++; } } // the rest (Local switched off, ComfyUI not answering) still runs here
  return c;
}

/** "36 of 57 local models run here · 21 need NVIDIA" (· "2 too big" when any). '' when there are no local models. */
export function localCountsText(c: LocalCounts): string {
  if (!c.total) return '';
  return [`${c.runs} of ${c.total} local models run here`, c.untested ? `${c.untested} should run (not tested yet)` : '', c.needsNvidia ? `${c.needsNvidia} need NVIDIA` : '', c.tooBig ? `${c.tooBig} too big` : ''].filter(Boolean).join(' · ');
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

// ---- Fit check against free memory before a heavy local run (2026-10-31, hardware plan §3.5 item 1) ----
/** A model this big (GB) or bigger gets the free-memory check: smaller ones fit beside other apps. */
export const HEAVY_GB = 8;
export interface LiveLike { ram: { totalBytes: number; freeBytes: number }; vram: { totalBytes: number; freeBytes: number } | null }
export interface MemoryCheck { needGB: number; freeGB: number; short: boolean; /** shared memory (Apple Silicon, DGX Spark) and short: running it now can freeze the computer, so it waits for a yes */ block: boolean; text: string }
/** The plain words for a local model that doesn't fit memory (Mac/Linux audit M1, 2026-11-02): the one source the reason line, the run menu and the fit note read. */
export const TOO_BIG_TEXT = 'Too big for this computer’s memory';
export const unifiedOf = (p: ProfileLike | null | undefined): boolean => !!p && (!!p.unifiedMemory || p.id === 'apple-silicon' || p.id === 'dgx-spark');
/** Free memory the model can use right now: shared memory on Apple Silicon and DGX Spark (the system's free RAM; on Spark that is MemAvailable, never
 *  cudaMemGetInfo, which under-reports there: NVIDIA DGX Spark known issues), else the card's free graphics memory. null when there's no reading. */
export function freeForModelsGB(p: ProfileLike | null | undefined, live: LiveLike | null | undefined): number | null {
  if (!p || !live) return null; const bytes = unifiedOf(p) ? live.ram?.freeBytes : live.vram?.freeBytes;
  return bytes == null || !Number.isFinite(bytes) ? null : bytes / 2 ** 30;
}
/** Compare what the model needs with what's free now. short = say so and offer the cloud route. On shared memory (Apple Silicon, DGX Spark) there is
 *  no separate system memory to move the model to: the computer swaps and can freeze (a Mac froze twice, 2026-11-02), so short there = block
 *  (Generate waits for Use Comfy Cloud, or Run anyway after a warning). A graphics card moves part of the model to system memory: it can still be
 *  very slow or stop. null for small models, unknown needs or no reading. */
export function memoryCheck(needGB: number | null | undefined, p: ProfileLike | null | undefined, live: LiveLike | null | undefined): MemoryCheck | null {
  if (needGB == null || !(needGB >= HEAVY_GB)) return null; const free = freeForModelsGB(p, live); if (free == null) return null;
  const short = free < needGB; const n = `${Math.round(needGB)} GB`; const f = gbs(free); const block = short && unifiedOf(p);
  return { needGB, freeGB: free, short, block, text: !short ? `${f} free now, about ${n} needed`
    : block ? `${TOO_BIG_TEXT} now: this model needs about ${n} and ${f} is free. Running it can freeze your computer.`
    : `Close other apps first: this model needs about ${n} and ${f} is free now. It can run very slowly or stop.` };
}
/** The run menu's line under Local: "This computer · 13 GB free now · about 4 min (your last 5 runs)". '' when there's nothing to say. */
export function hereLine(o: { name?: string | null; freeGB?: number | null; etaSeconds?: number | null; etaSource?: string | null; samples?: number | null; untested?: boolean }): string {
  const s = Number(o.etaSeconds); const t = s > 0 ? (s < 90 ? `about ${Math.round(s)} s` : s < 5400 ? `about ${Math.round(s / 60)} min` : `about ${Math.round((s / 3600) * 10) / 10} h`) : '';
  const src = t && o.etaSource === 'learned' && Number(o.samples) > 0 ? ` (your last ${o.samples} run${o.samples === 1 ? '' : 's'})` : '';
  return [o.name || 'This computer', o.freeGB != null ? `${gbs(o.freeGB)} free now` : '', t ? `${t}${src}` : o.etaSource === 'first_run' ? 'first run: time unknown' : '', o.untested ? 'should run here (not tested yet)' : ''].filter(Boolean).join(' · ');
}
