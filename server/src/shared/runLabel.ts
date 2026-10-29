/**
 * Where a model runs and what it costs, in plain words (2026-10-27, Workflows rework): THE one place that turns a model's live route status
 * (GET /api/tools: models[].runsOn[] = { id, label, status, credits, action }) into the words a card or a sheet shows. Cards show ONE line
 * (the model's best place); the sheet lists every place with its own status and price. Isomorphic, no server imports.
 *
 * Statuses (routing/modelRegistry.ts RunOnStatus) and what they say:
 *  - ready, local          → "Free · on your computer"             (kind 'free')
 *  - ready, a cloud        → "On Comfy Cloud · from $0.14"          (kind 'cloud'; "Free on Comfy Cloud" at 0)
 *  - sample (mock server)  → "Sample · from $0.14"                  (kind 'sample': nothing is billed here; the price is a real run's)
 *  - not-installed, local  → "Needs a download · 20.4 GB"           (kind 'download')
 *  - needs-key             → "Needs a fal key"                      (kind 'key')
 *  - off / set-up needed   → "Needs setting up"                     (kind 'setup')
 * *  - unavailable           → "Can’t run on your computer"           (kind 'none'; hardware this computer lacks)
 *  - coming-soon           → "Not ready yet"                        (kind 'none')
 * A model is runnable somewhere when any place is not 'none': only those are shown as workflows; the rest are left out.
 * Test: server/test/run-label.test.ts.
 */
import { fmtUsd } from './runCost.js';
import { USD_PER_CREDIT } from './hostedPrices.js';

export type RunKind = 'free' | 'cloud' | 'sample' | 'download' | 'key' | 'setup' | 'none';
/** The icon a place uses (web/src/ui/Icons.tsx: YourGpuIcon / ComfyPlaceIcon / ApiPlugIcon / DownloadIcon / KeyIcon). */
export type RunIcon = 'local' | 'comfy' | 'api' | 'download' | 'key' | 'setup' | 'none';
export interface RunOnLike { id: string; label?: string; status?: string; credits?: number | null; action?: { kind?: string; text?: string; missingBytes?: number | null } | null }
export interface ModelLike { key?: string; fromPrice?: number | null; runsOn?: RunOnLike[] }
export interface RunPlace { id: string; /** "your computer", "Comfy Cloud", "fal" */ place: string; kind: RunKind; icon: RunIcon;
  /** one line: "Free · on your computer", "On Comfy Cloud · from $0.14", "Needs a fal key" */ text: string;
  /** the short status for a list row: "Free", "from $0.14", "Download 2.1 GB", "Add a fal key", "Can't run here" */ short: string;
  /** ledger credits per run (1 = $0.01) when the place is priced */ credits: number | null; rank: number }

/** The words for this computer (default "your computer"; never a brand of computer: users run it anywhere). */
export type Where = { device?: string };
const PLACE: Record<string, string> = { 'comfy-cloud': 'Comfy Cloud', fal: 'fal', replicate: 'Replicate', bfl: 'Black Forest Labs', minimax: 'MiniMax', ltx: 'LTX', openai: 'OpenAI', google: 'Google', byteplus: 'BytePlus', luma: 'Luma AI', dashscope: 'Alibaba Cloud' };
const KEY_NAME: Record<string, string> = { 'comfy-cloud': 'Comfy Cloud', bfl: 'Black Forest Labs' };
const RANK: Record<RunKind, number> = { free: 0, cloud: 1, sample: 2, download: 3, key: 4, setup: 5, none: 9 };
const usd = (credits: number) => fmtUsd(Math.round(credits * USD_PER_CREDIT * 1e4) / 1e4);
const gb = (b?: number | null) => (b && b > 0 ? `${Math.max(0.1, Math.round(b / 1e8) / 10)} GB` : '');
/** "a fal key", "an OpenAI key", "an LTX key" (an acronym read letter by letter) */
const an = (w: string) => (/^[A-Z]{2,5}\b/.test(w) ? /^[AEFHILMNORSX]/.test(w) : /^[aeiou]/i.test(w)) ? 'an' : 'a';

/** One place of one model, in words. */
export function runPlace(r: RunOnLike, o: Where = {}): RunPlace {
  const device = o.device ?? 'your computer'; const local = r.id === 'local'; const place = local ? device : PLACE[r.id] ?? r.label ?? r.id;
  const icon: RunIcon = local ? 'local' : r.id === 'comfy-cloud' ? 'comfy' : 'api'; const c = typeof r.credits === 'number' ? r.credits : null;
  const mk = (kind: RunKind, text: string, short: string, ic: RunIcon = icon): RunPlace => ({ id: r.id, place, kind, icon: ic, text, short, credits: c, rank: RANK[kind] * 1e6 + (c ?? 5e5) });
  switch (r.status) {
    case 'ready': return local || c === 0 ? mk('free', `Free · on ${place}`, 'Free') : mk('cloud', `On ${place}${c != null ? ` · from ${usd(c)}` : ''}`, c != null ? `from ${usd(c)}` : 'Priced before you run');
    case 'sample': return mk('sample', `Sample${c ? ` · from ${usd(c)}` : ' run'}`, c ? `Sample · from ${usd(c)}` : 'Sample');
    case 'not-installed': { const size = gb(r.action?.missingBytes); return r.action?.kind === 'download' ? mk('download', `Needs a download${size ? ` · ${size}` : ''}`, `Download${size ? ` ${size}` : ''}`, 'download') : mk('setup', 'Needs setting up', 'Set up', 'setup'); }
    case 'needs-key': { const k = KEY_NAME[r.id] ?? place; return mk('key', `Needs ${an(k)} ${k} key`, `Add ${an(k)} ${k} key`, 'key'); }
    case 'off': return mk('setup', 'Needs setting up', 'Turn on in Settings', 'setup');
    case 'coming-soon': return mk('none', 'Not ready yet', 'Not ready yet', 'none');
    default: return mk('none', local ? 'Can’t run on your computer' : 'Not available here', local ? 'Can’t run here' : 'Not available', 'none');
  }
}
/** Every place of a model, best first (free, then the cheapest cloud, sample, download, key, set up; never-runs last). */
export const runPlaces = (m: ModelLike, o: Where = {}): RunPlace[] => (m.runsOn ?? [])
  /* a cloud place with no price of its own reads the model's from-price (the cheapest place) */
  .map((r) => runPlace(r.id !== 'local' && r.credits == null && typeof m.fromPrice === 'number' ? { ...r, credits: m.fromPrice } : r, o)).sort((a, b) => a.rank - b.rank);
/** The model's one line: its best place. A model with no places at all (an in-app tool) reads "Free · on your computer". */
export function runLabel(m: ModelLike, o: Where = {}): RunPlace {
  const p = runPlaces(m, o)[0]; if (p) return p;
  return runPlace({ id: 'local', status: 'ready', credits: 0 }, o);
}
/** Can it run anywhere (now, or after a download, a key or set-up)? false = only "can't run here" / "not ready yet" places. */
export const canRun = (m: ModelLike): boolean => !(m.runsOn ?? []).length || (m.runsOn ?? []).some((r) => runPlace(r).kind !== 'none');
/** Runs right now (free, priced cloud, or a sample in sample mode). */
export const runsNow = (m: ModelLike): boolean => { const k = runLabel(m).kind; return k === 'free' || k === 'cloud' || k === 'sample'; };
