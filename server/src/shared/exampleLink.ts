/**
 * Opening a shipped example (the Workflows showcase, server/src/shared/showcase.ts) in Create Image (2026-10-23): its link and what it puts
 * in the bar. The page shows the example in the result viewer, labelled as an example (it is never a job in your library), and fills the bar
 * with its workflow, model, prompt and settings so Generate makes your own. Pure and dependency-light, so the web bar and the tests share it.
 */
import { IMAGE_PAGE } from './pages.js';
import { settingsOnSwitch, type SnapCaps } from './imageSnap.js';

type ExampleLike = { id: string; workflow: string; provider: string; prompt: string; /** the subject box's words for a composing workflow (showcase.ts) */ subject?: string; settings: Record<string, string | number> };
/** A workflow control as the bar sees it (GET /api/image-workflows recipe.controls): its field and, when it is a choice, the values offered. */
export type ControlLike = { field: string; options?: { value: string | number }[] | null };

/** `/image?workflow=<id>&showcase=<id>`, or just `?showcase=<id>` for plain Create Image (as presetHref). Not `example=`: usePrefill already reads that for the server's tool examples. */
export const exampleHref = (s: Pick<ExampleLike, 'id' | 'workflow'>): string =>
  `${IMAGE_PAGE}?${s.workflow !== 'create-image' ? `workflow=${encodeURIComponent(s.workflow)}&` : ''}showcase=${encodeURIComponent(s.id)}`;

/** Settings an example records for information only (the workflow file it ran), never a bar setting. */
const INFO = new Set(['workflow']);
/** Plain Create's settings (the chips), and the seed, which goes with the run (Same seed). */
const CREATE_KEYS = new Set(['aspect', 'quality', 'imageResolution', 'n']);
/** Upscale's "2x" is the scale control's "2". */
const norm = (k: string, v: string) => k === 'scale' ? v.replace(/^x|x$/i, '') : v;

export interface ExamplePrefill {
  /** '' = plain Create Image, else the workflow to pick */ workflow: string; provider: string; prompt: string; seed: number | null;
  /** plain Create: the chips, snapped to what the model offers (settingsOnSwitch) */ create: { aspect: string; quality: string; imageResolution: string; n: number } | null;
  /** a workflow: its control values (only fields it has, only values it offers) */ vals: Record<string, string>;
  /** settings the bar has no place for (a workflow that fixes its own shape, say): shown in the viewer, not filled */ skipped: string[];
}
/**
 * What opening an example puts in the bar.
 *  - plain Create: the model, the prompt and aspect / quality / resolution / count snapped to the model's caps (pass them; null = the
 *    fallback list), exactly as picking that model in the menu would (shared/imageSnap settingsOnSwitch). Values the model lacks change.
 *  - a workflow: the model, the prompt and each setting that is one of its controls with an offered value (`controls`).
 *  - the seed, when recorded, for the Same seed switch. The example's input photo is never filled: your own photo goes in the slot.
 */
export function examplePrefill(s: ExampleLike, o: { controls?: ControlLike[]; caps?: SnapCaps | null; routeResolutions?: string[] | null } = {}): ExamplePrefill {
  const seed = Number.isFinite(Number(s.settings.seed)) && s.settings.seed !== '' ? Number(s.settings.seed) : null;
  const entries = Object.entries(s.settings).filter(([k]) => !INFO.has(k) && k !== 'seed').map(([k, v]) => [k, norm(k, String(v))] as const);
  if (s.workflow === 'create-image') {
    const cur = Object.fromEntries(entries.filter(([k]) => CREATE_KEYS.has(k)));
    const sw = settingsOnSwitch(o.caps ?? null, { editing: false, routeResolutions: o.routeResolutions, n: Number(cur.n ?? 1) || 1, cur: { aspect: cur.aspect, quality: cur.quality, imageResolution: cur.imageResolution } });
    return { workflow: '', provider: s.provider, prompt: s.prompt, seed, create: { aspect: sw.aspect, quality: sw.quality, imageResolution: sw.imageResolution, n: sw.n },
      vals: {}, skipped: entries.filter(([k]) => !CREATE_KEYS.has(k)).map(([k]) => k) };
  }
  const vals: Record<string, string> = {}; const skipped: string[] = [];
  for (const [k, v] of entries) { const c = (o.controls ?? []).find((x) => x.field === k);
    if (c && (!c.options?.length || c.options.some((x) => String(x.value) === v))) vals[k] = v; else skipped.push(k); }
  // 2026-10-25: a workflow's box gets only the example's own words (`subject`), never its composed prompt (that was the Character Sheet doubling)
  return { workflow: s.workflow, provider: s.provider, prompt: s.subject ?? s.prompt, seed, create: null, vals, skipped };
}
