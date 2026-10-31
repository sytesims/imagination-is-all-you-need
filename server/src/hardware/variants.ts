/**
 * Variants keyed by platform (2026-10-31, hardware plan §3.2–3.3, item 5). ONE reader of readiness/manifest/models.json workflows[graph].variants
 * (written by build-manifest.py variants_for): which files a graph loads on this computer, picked automatically.
 *  - Platforms: mac-arm64 (Apple Silicon) · nvidia-x64 (an NVIDIA PC) · nvidia-arm64 (DGX Spark: keeps the NVIDIA files) · cpu. Other machines (AMD,
 *    Intel, unknown) get no pick: the graph runs as it is, as before.
 *  - A variant maps a role (dit, dit_high, te…) to a file; `replaces` names the graph's file for that role. The swap is by role, so a Mac variant changes
 *    the DiT AND the text encoder together (plan bug B6: a GGUF DiT beside an fp8 encoder still couldn't load). A .gguf DiT loads with UnetLoaderGGUF.
 *  - verified:false = nobody ran it on that platform yet: labels say "should run here (not tested yet)", never "runs here".
 *  - Downloads and "Files needed" use the picked variant's files only; the graph is patched at run time (runNative → applyFileSwap).
 * The fp8-on-MPS rule stays in macWeights.ts; this file only reads which files the generator chose.
 */
import { manifest } from './requirements.js';
import type { MachineProfile } from './machineProfile.js';
import { weightsForWorkflows, weightFileOf, type WeightFile } from '../modelWeights.js';
import { currentHardware } from '../hardware.js';

export type PlatformKey = 'mac-arm64' | 'nvidia-x64' | 'nvidia-arm64' | 'cpu';
export interface PlatformVariant { files?: Record<string, string>; replaces?: Record<string, string>; format?: string; downloadGB?: number; memGB?: number; needsNodes?: string[];
  verified?: boolean; default?: boolean; source?: string; inherit?: PlatformKey }
export interface VariantPick { platform: PlatformKey; variant: PlatformVariant | null; swapped: boolean; verified: boolean }

/** This computer's platform key, from the machine class (hardware/machineProfile.ts). null: no pick (AMD, Intel, hardware not read). */
export function platformOf(p: Pick<MachineProfile, 'id'> | null | undefined): PlatformKey | null {
  switch (p?.id) { case 'apple-silicon': return 'mac-arm64'; case 'dgx-spark': return 'nvidia-arm64'; case 'nvidia': case 'nvidia-blackwell': return 'nvidia-x64'; case 'cpu-only': return 'cpu'; default: return null; }
}
const key = (w: string) => (/^(workflows|plugins)\//.test(w) ? w : `workflows/${w}`);
/** The variants table of a graph ('photo-fx-api.json' or 'workflows/…'), or null when the manifest has none for it. */
export const variantsOf = (workflow: string): Partial<Record<PlatformKey, PlatformVariant | null>> | null => (manifest().workflows[key(workflow)] as any)?.variants ?? null;

/** The variant for this graph on this platform, `inherit` followed (at most 3 hops). null when the graph has no variants or the platform has no pick. */
export function pickVariant(workflow: string, platform: PlatformKey | null): VariantPick | null {
  const vs = variantsOf(workflow); if (!vs || !platform) return null;
  let v = vs[platform]; for (let i = 0; i < 3 && v?.inherit; i++) v = vs[v.inherit] ?? null;
  const swapped = !!v?.replaces && Object.keys(v.replaces).length > 0;
  return { platform, variant: v ?? null, swapped, verified: swapped ? v!.verified === true : true };
}
/** graph file → picked file, for every graph of a job whose pick swaps files on this platform ({} when nothing changes). */
export function swapsFor(workflows: string[], platform: PlatformKey | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const w of workflows) { const p = pickVariant(w, platform); if (!p?.swapped) continue; const v = p.variant!; for (const [role, from] of Object.entries(v.replaces!)) { const to = v.files?.[role]; if (to) out[from] = to; } }
  return out;
}
/** The picked variants of a job that swap files (for labels: verified or not, the nodes they need, the memory they take). */
export const swappedPicks = (workflows: string[], platform: PlatformKey | null): (VariantPick & { workflow: string })[] =>
  workflows.map((w) => ({ workflow: w, ...pickVariant(w, platform)! })).filter((p) => p.platform && p.swapped);

/** Patch a graph by role: every loader input naming a replaced file names the picked one; a .gguf DiT moves from UNETLoader to UnetLoaderGGUF
 *  (ComfyUI-GGUF: city96/ComfyUI-GGUF, input unet_name). Returns the same graph object. */
export function applyFileSwap(graph: Record<string, any>, swaps: Record<string, string>): Record<string, any> {
  if (!Object.keys(swaps).length) return graph;
  for (const nd of Object.values<any>(graph)) { if (!nd?.inputs) continue;
    for (const [k, v] of Object.entries<any>(nd.inputs)) { if (typeof v !== 'string' || !swaps[v]) continue; const to = swaps[v];
      if (nd.class_type === 'UNETLoader' && k === 'unet_name' && to.endsWith('.gguf')) { nd.class_type = 'UnetLoaderGGUF'; nd.inputs = { unet_name: to }; break; }
      nd.inputs[k] = to; } }
  return graph;
}
/** A job's weight files on this computer: the graphs' files with this platform's picked variant swapped in (unique). Downloads fetch only these. */
export function weightsHere(workflows: string[], profile: Pick<MachineProfile, 'id'> | null | undefined = currentHardware().profile): WeightFile[] {
  const sw = swapsFor(workflows, platformOf(profile)); const seen = new Set<string>(); const out: WeightFile[] = [];
  for (const w of weightsForWorkflows(workflows)) { const x = sw[w.file] ? weightFileOf(sw[w.file]) ?? w : w; if (!seen.has(x.file)) { seen.add(x.file); out.push(x); } }
  return out;
}
