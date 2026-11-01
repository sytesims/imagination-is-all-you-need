/** BH10 P1-4: the name of the engine that actually ran a job (or will run it), never a product name ("OpenSoul"), a router ("Auto")
 *  or the generic "Open weights". Order: hosted route (fal / Replicate) → tool-specific rule (Camera LTX moves, OpenSoul base + LoRAs)
 *  → the base tool's card name (apps) → the tool's own model line → provider name. Shown as job.modelName / job.model. */
import type { Job } from './jobs.js';
import { cardName, modelNameForRun } from './models.js';
import { findRoute } from './routing/routes.js';
import { HOSTED_BY_ID } from './shared/hostedPrices.js';
import { getTool } from './tools/registry.js';
import { getProvider } from './providers.js';
import { SOUL_LORAS } from './tools/soul/presets.js';
import { RETIRED_MODELS, RETIRED_ROUTES } from './shared/lifecycle.js';
import { catalogueNameOf } from './routing/modelRegistry.js';

const GENERIC = /^(open weights|auto|openSoul)\b/i;
const clean = (s: string | null | undefined) => (s ? s.replace(/\s*·\s*(free|demo).*$/i, '').replace(/\s*\((fal|replicate|local)\)$/i, '').trim() || null : null);
/** fal / Replicate route → the hosted model ('Bria Video Background Removal', 'Luma Ray 3.2 Reframe', 'Z-Image-Turbo + LoRA'). */
export function hostedRouteModel(routeId?: string | null): string | null {
  if (!routeId || !/^(fal|replicate):/.test(routeId)) return null; const r = findRoute(routeId);
  if (!r && RETIRED_ROUTES[routeId]) return RETIRED_ROUTES[routeId]; // an old job on a route that is gone
  return clean((r?.priceRef ? HOSTED_BY_ID[r.priceRef]?.model : null) ?? r?.label ?? null);
}
const SOUL_FAMILY: Record<string, string> = { zit: 'Z-Image-Turbo', qwen: 'Qwen-Image-Edit-2511', flux1dev: 'FLUX.1 [dev]' };
const SOUL_ENGINE: Record<string, string> = { pulid: 'FLUX.1 [dev] + PuLID', infiniteyou: 'FLUX.1 [dev] + InfiniteYou', 'qwen-edit': 'Qwen-Image-Edit-2511' };
const loraName = (id?: string) => (id && SOUL_LORAS[id] ? SOUL_LORAS[id].name.replace(/\s*LoRA$/i, '') + ' LoRA' : null);
/** BH P2: a LoRA named after its base drops the base inside the engine name: 'Z-Image-Turbo + Realism LoRA', not '+ Z-Image-Turbo Realism LoRA'. */
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const underBase = (base: string, n: string) => { const b = base.replace(/\s*\+.*$/, '').trim(); const r = n.replace(new RegExp(`^${esc(b)}\\s+`, 'i'), ''); return /^lora$/i.test(r) ? n : r; };
function soulName(j: Pick<Job, 'route' | 'input'>): string | null {
  const i: any = j.input ?? {};
  if (j.route && /^(fal|replicate):/.test(j.route)) {
    const base = (hostedRouteModel(j.route) ?? 'Z-Image-Turbo').replace(/\s*\+\s*LoRA$/i, '');
    const ls = (i.hostedLoras ?? []).map((l: any) => Object.values(SOUL_LORAS).find((x) => x.download === l.path)?.name).filter(Boolean) as string[];
    return /lora/i.test(j.route) && ls.length ? `${base} + ${ls.map((n) => underBase(base, /lora$/i.test(n) ? n : `${n} LoRA`)).join(' + ')}` : base;
  }
  const st = i.stack; if (!st) return null;
  const base = (i.engine && SOUL_ENGINE[i.engine]) || SOUL_FAMILY[st.family] || null; if (!base) return null;
  const ls = [st.realism?.lora, ...(st.loras ?? []).map((l: any) => l.id)].map(loraName).filter(Boolean);
  return ls.length ? `${base} + ${(ls as string[]).map((n) => underBase(base, n)).join(' + ')}` : base;
}
/** The engine name in the catalogue's words (MODEL-PICKER-REVIEW task 3): "Seedance" → "Seedance 2.0" when it names the job's model. */
export function engineNameOf(j: Pick<Job, 'toolId' | 'provider' | 'route' | 'input'>): string {
  const n = rawEngineName(j); try { return catalogueNameOf(j.toolId, j.provider, n, j.input ?? null); } catch { return n; }
}
function rawEngineName(j: Pick<Job, 'toolId' | 'provider' | 'route' | 'input'>): string {
  if (j.provider === 'local-rig') return 'Mesh2Motion'; // Rig as a character: Mesh2Motion's human skeleton, weights and moves, run in the browser
  if (j.provider === 'local-ffmpeg') return 'FFmpeg (local)'; // no model: a saved video frame or a Stitch, cut by ffmpeg on this computer
  const t = getTool(j.toolId) as any; const base: string = t?.app?.gallery?.base ?? j.toolId;
  const special = (base === 'soul' ? soulName(j) : null) ?? hostedRouteModel(j.route) ?? modelNameForRun(base, j.provider, j.input ?? {}, j.route);
  if (special) return special;
  const card = clean(cardName(j.toolId, j.provider) ?? (base !== j.toolId ? cardName(base, j.provider) : null));
  if (card && !GENERIC.test(card)) return card;
  const P = getProvider(j.provider); if (P && P.kind !== 'open-weights') return clean(P.name) ?? j.provider;
  if (!P && RETIRED_MODELS[j.provider]) return RETIRED_MODELS[j.provider].name; // a removed model (Reve) keeps its own name on old jobs, never the tool's model line // hosted without a card: its own name, never the tool's local model line
  const bt = base !== j.toolId ? getTool(base) as any : t; const line = clean(String(bt?.model ?? t?.model ?? '').split(/[;,(]/)[0]);
  if (line && !GENERIC.test(line)) return line;
  return clean(getProvider(j.provider)?.name) ?? j.provider;
}
