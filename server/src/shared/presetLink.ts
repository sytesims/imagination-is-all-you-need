/**
 * Opening an image preset (shared/presets.ts) in Create Image: its link and what it puts in the bar. Dependency-free on purpose, so the
 * web bar can import it without pulling the preset list or the workflow recipes into its bundle.
 */
import { IMAGE_PAGE } from './pages.js';
type PresetValue = string | number | string[];
type PresetLike = { id: string; workflow: string; promptTemplate: string; subjectHint: string; settings: Record<string, PresetValue> };

/** Fill a template with the user's text. Empty text drops the placeholder and the separator next to it ("x, {prompt}" → "x"). */
export function fillPresetPrompt(template: string, text: string): string {
  const t = text.trim();
  if (t) return template.replace(/\{(subject|prompt)\}/g, t).trim();
  return template.replace(/^\s*\{(?:subject|prompt)\}\s*[,;:]?\s*/, '').replace(/\s*[,;:]?\s*\{(?:subject|prompt)\}\s*$/, '')
    .replace(/\s*\{(?:subject|prompt)\}/g, '').replace(/\s+([,;:])/g, '$1').replace(/\s+/g, ' ').trim();
}
/** The settings as form fields / query params (arrays as JSON, numbers as strings). */
export const presetFields = (p: Pick<PresetLike, 'settings'>): Record<string, string> =>
  Object.fromEntries(Object.entries(p.settings).map(([k, v]) => [k, Array.isArray(v) ? JSON.stringify(v) : String(v)]));

/** The link that opens a preset in Create Image: `?workflow=<id>&preset=<id>`, or just `?preset=<id>` for plain Create Image. */
export const presetHref = (p: Pick<PresetLike, 'id' | 'workflow'>): string =>
  `${IMAGE_PAGE}?${p.workflow !== 'create-image' ? `workflow=${encodeURIComponent(p.workflow)}&` : ''}preset=${encodeURIComponent(p.id)}`;
/** What opening a preset puts in the bar (shared by the web bar and the tests, so the link → settings mapping is checked server-side):
 *  - `prompt`: the template with the subject hint in the placeholder's place; `select` = that hint's [start, end) so typing replaces it.
 *    No hint ({prompt} touch-ups) → the template without the placeholder, caret at the end.
 *  - `vals`: the settings as the bar's form values, only for fields the bar has (`fields`: the workflow's control fields; plain Create
 *    takes aspect and style). `skipped` lists any setting the bar couldn't place (expected empty for every preset). */
export function presetPrefill(p: Pick<PresetLike, 'workflow' | 'promptTemplate' | 'subjectHint' | 'settings'>, fields: string[]): { workflow: string; prompt: string; select: [number, number] | null; vals: Record<string, string>; skipped: string[] } {
  const hole = /\{(?:subject|prompt)\}/.exec(p.promptTemplate); const hint = p.subjectHint.trim();
  let prompt: string; let select: [number, number] | null = null;
  if (hole && hint) { prompt = p.promptTemplate.replace(hole[0], hint).trim(); const at = p.promptTemplate.trimStart().indexOf(hole[0]); select = [at, at + hint.length]; }
  else prompt = fillPresetPrompt(p.promptTemplate, '');
  const all = presetFields(p); const vals: Record<string, string> = {}; const skipped: string[] = [];
  for (const [k, v] of Object.entries(all)) (fields.includes(k) ? (vals[k] = v) : skipped.push(k));
  return { workflow: p.workflow === 'create-image' ? '' : p.workflow, prompt, select, vals, skipped };
}
/** The fields plain Create Image's bar fills from a preset. */
export const CREATE_PRESET_FIELDS = ['aspect', 'style'];

