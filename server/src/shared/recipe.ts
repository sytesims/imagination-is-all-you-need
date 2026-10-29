/**
 * Recipes (2026-10-25): what made a result (tool, model, workflow, settings, and the prompt only when the sharer chose to include it),
 * small enough to travel in a link. Pure (no DOM, no Node APIs beyond btoa/atob/TextEncoder), shared by the server (routesShare.ts
 * shareRecipe, GET /api/jobs/:id/recipe) and the web app (share sheet "Copy recipe" / "Copy recipe link", the /r "Make this" page and the
 * tool pages' ?recipe= prefill).
 *
 * Link format: `<this app>/r?recipe=<base64url(JSON)>`. Opening it shows the recipe first; nothing runs until Generate.
 * Never in a recipe: files, reference images, URLs, paths, keys, tokens, owner ids (SETTING_SKIP and the value check below).
 * Everything read back from a link or a paste goes through sanitizeRecipe(): unknown keys dropped, sizes capped, ids checked.
 */

export const RECIPE_VERSION = 1;
/** Longest encoded recipe we read (a link or a paste). Anything larger is refused before decoding. */
export const MAX_RECIPE_CHARS = 16_000;
export const MAX_RECIPE_PROMPT = 4_000;
const MAX_SETTINGS = 40;

export type SettingValue = string | number | boolean | (string | number | boolean)[];
export interface Recipe {
  v: number;
  tool: { id: string; name: string | null };
  model: { id: string; name: string | null } | null;
  /** id: the in-app workflow (Image's ?workflow=, a Video / Audio workflow); name: its plain name. */
  workflow: { id: string | null; name: string | null } | null;
  ranOn: string | null;
  settings: Record<string, SettingValue>;
  prompt?: string;
  /** Cost receipt (2026-10-26, shared/shareReceipt.ts): "≈ $0.32 · Kling 3.0 · Comfy Router · 41 s"; only when the sharer left "Include cost receipt" on. Text only. */
  receipt?: string;
}

/** Settings a visitor may copy: plain values only, never a file, URL, path, key or the prompt. */
export const SETTING_SKIP = /(url|path|file|prompt|token|key|secret|password|webhook|client|owner|idem|^warnings$|^outKind$|^baseTool$|^appId$|^elements$|^simulate$|^blocked$|^draft$|^target$)/i;
const plainValue = (x: unknown) => (typeof x === 'number' && Number.isFinite(x)) || typeof x === 'boolean' || (typeof x === 'string' && x.length <= 200 && !/^(\/|https?:|data:|blob:|file:|[A-Za-z]:\\)/i.test(x) && !/[<>]/.test(x));
export function recipeSettings(input: Record<string, any> | undefined | null): Record<string, SettingValue> {
  const out: Record<string, SettingValue> = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [k, v] of Object.entries(input)) {
    if (Object.keys(out).length >= MAX_SETTINGS) break;
    if (!/^[A-Za-z][\w-]{0,39}$/.test(k) || SETTING_SKIP.test(k) || v == null || v === '') continue;
    if (plainValue(v)) out[k] = v; else if (Array.isArray(v) && v.length && v.length <= 32 && v.every(plainValue)) out[k] = v;
  }
  return out;
}

const ID = /^[A-Za-z0-9][\w.:@/+-]{0,99}$/;
/** A plain line of text: no control characters, trimmed, capped. */
const line = (x: unknown, n = 120): string | null => (typeof x === 'string' ? x.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) || null : null);
const idOf = (x: unknown): string | null => { const s = typeof x === 'string' ? x.trim() : ''; return ID.test(s) ? s : null; };

export type SanitizeResult = { ok: true; recipe: Recipe; dropped: string[]; newer: boolean } | { ok: false; error: string };
/** Checks a recipe from anywhere (our share page's JSON, a link, a paste) and keeps only what we know. */
export function sanitizeRecipe(x: unknown): SanitizeResult {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return { ok: false, error: 'That isn’t a recipe.' };
  const o = x as Record<string, any>;
  const v = typeof o.v === 'number' && Number.isFinite(o.v) ? Math.floor(o.v) : 1; // share pages before 2026-10-25 had no version: same shape
  const toolId = idOf(typeof o.tool === 'string' ? o.tool : o.tool?.id);
  if (!toolId) return { ok: false, error: 'This recipe doesn’t say which tool made it.' };
  const modelId = idOf(typeof o.model === 'string' ? o.model : o.model?.id);
  const wfId = idOf(typeof o.workflow === 'string' ? o.workflow : o.workflow?.id); const wfName = line(typeof o.workflow === 'object' ? o.workflow?.name : null);
  const rawSettings = o.settings && typeof o.settings === 'object' && !Array.isArray(o.settings) ? o.settings : {};
  const settings = recipeSettings(rawSettings);
  const dropped = Object.keys(rawSettings).filter((k) => !(k in settings)).slice(0, 20);
  const prompt = typeof o.prompt === 'string' ? o.prompt.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, MAX_RECIPE_PROMPT) : '';
  const recipe: Recipe = {
    v, tool: { id: toolId, name: line(typeof o.tool === 'object' ? o.tool?.name : null) },
    model: modelId ? { id: modelId, name: line(typeof o.model === 'object' ? o.model?.name : null) } : null,
    workflow: wfId || wfName ? { id: wfId, name: wfName } : null,
    ranOn: line(o.ranOn, 40), settings, ...(prompt ? { prompt } : {}), ...(line(o.receipt, 140) && !/[<>]/.test(String(o.receipt)) ? { receipt: line(o.receipt, 140)! } : {}),
  };
  return { ok: true, recipe, dropped, newer: v > RECIPE_VERSION };
}

/* ---------- base64url (UTF-8 safe, browser and Node) ---------- */
const toB64u = (s: string) => { const bytes = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const fromB64u = (s: string) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); const bytes = Uint8Array.from(b, (c) => c.charCodeAt(0)); return new TextDecoder('utf-8', { fatal: true }).decode(bytes); };

/** The compact form that travels in a link (nulls and empty parts left out). */
export function compactRecipe(r: Recipe) {
  return { v: RECIPE_VERSION, tool: r.tool.name ? r.tool : { id: r.tool.id }, ...(r.model ? { model: r.model.name ? r.model : { id: r.model.id } } : {}),
    ...(r.workflow ? { workflow: Object.fromEntries(Object.entries(r.workflow).filter(([, x]) => x)) } : {}), ...(r.ranOn ? { ranOn: r.ranOn } : {}),
    ...(Object.keys(r.settings).length ? { settings: r.settings } : {}), ...(r.prompt ? { prompt: r.prompt } : {}), ...(r.receipt ? { receipt: r.receipt } : {}) };
}
export const encodeRecipe = (r: Recipe) => toB64u(JSON.stringify(compactRecipe(r)));
export function decodeRecipe(s: string): SanitizeResult {
  const t = String(s ?? '').trim();
  if (!t) return { ok: false, error: 'The recipe is empty.' };
  if (t.length > MAX_RECIPE_CHARS) return { ok: false, error: 'This recipe is too large to be one of ours.' };
  if (!/^[A-Za-z0-9_-]+$/.test(t)) return { ok: false, error: 'This recipe link is damaged (it has characters a recipe never has).' };
  let json: unknown; try { json = JSON.parse(fromB64u(t)); } catch { return { ok: false, error: 'This recipe link is damaged or cut short. Ask for it again, or paste the whole link.' }; }
  return sanitizeRecipe(json);
}
/** A pasted link, a bare code, our share page's JSON, or the plain-text copy (which ends with the link). */
export function parseRecipeInput(text: string): SanitizeResult {
  const t = String(text ?? '').trim();
  if (!t) return { ok: false, error: 'Paste a recipe link or a recipe first.' };
  if (t.length > MAX_RECIPE_CHARS * 4) return { ok: false, error: 'That’s too long to be a recipe.' };
  if (t.startsWith('{')) { try { return sanitizeRecipe(JSON.parse(t)); } catch { return { ok: false, error: 'That looks like JSON, but it isn’t complete. Copy the whole recipe again.' }; } }
  const m = /[?&]recipe=([A-Za-z0-9_-]+)/.exec(t) ?? /\/r\/?#([A-Za-z0-9_-]+)/.exec(t);
  if (m) return decodeRecipe(m[1]);
  if (/^[A-Za-z0-9_-]+$/.test(t)) return decodeRecipe(t);
  return { ok: false, error: 'That isn’t a recipe. Paste the recipe link (it has “/r?recipe=” in it) or the recipe text.' };
}
/** The app's own link: opens the "Make this" page in whoever's app opens it. `origin` = that app's address (http://localhost:5174 …). */
export const recipePath = (r: Recipe) => `/r?recipe=${encodeRecipe(r)}`;
export const recipeLink = (origin: string, r: Recipe) => `${origin.replace(/\/$/, '')}${recipePath(r)}`;
// Later: a public form (https://<project site>/r/#<base64url>, the hash so the site never receives it) plugs in here, next to recipeLink.

/** "aspect 1:1 · seed 270723 · duration 5": the settings as one plain line. */
export const settingsLine = (s: Record<string, SettingValue>) => Object.entries(s).map(([k, v]) => `${k} ${Array.isArray(v) ? v.join(', ') : String(v)}`).join(' · ');
/** "Copy recipe": plain text a person can read, ending with the link (the Paste box reads the link back out of it). */
export function recipeText(r: Recipe, link: string, app = 'Imagination Is All You Need') {
  return [`Recipe · ${app}`, `Tool: ${r.tool.name ?? r.tool.id}`, r.workflow?.name && r.workflow.name !== (r.tool.name ?? r.tool.id) ? `Workflow: ${r.workflow.name}` : null,
    r.model ? `Model: ${r.model.name ?? r.model.id}` : null, r.ranOn ? `Ran on: ${r.ranOn}` : null, (() => { const shown = Object.fromEntries(Object.entries(r.settings).filter(([k]) => !/^(types|mode)$/.test(k))); return Object.keys(shown).length ? `Settings: ${settingsLine(shown)}` : null; })(),
    r.receipt ? `Receipt: ${r.receipt}` : null, r.prompt ? `Prompt: ${r.prompt}` : null, '', `Open it in your own app (nothing runs until you press Generate): ${link}`].filter((x) => x != null).join('\n');
}

/* ---------- closest match (an unknown tool or model → the nearest one we have) ---------- */
const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9.]+/g, ' ').trim();
function lev(a: string, b: string) { if (a === b) return 0; const m = a.length, n = b.length; if (!m || !n) return m || n; let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return prev[n]; }
/** 0..1, higher = closer: shared words first, then edit distance. */
export function similarity(a: string, b: string) {
  const x = norm(a), y = norm(b); if (!x || !y) return 0; if (x === y) return 1;
  const wx = new Set(x.split(' ')), wy = new Set(y.split(' ')); const shared = [...wx].filter((w) => wy.has(w)).length; const words = shared / Math.max(wx.size, wy.size);
  const chars = 1 - lev(x, y) / Math.max(x.length, y.length); return Math.max(words * 0.9 + chars * 0.1, chars * 0.8);
}
/** The best candidate over `min` similarity (by any of its labels), or null. */
export function closest<T>(wanted: string[], items: T[], labels: (t: T) => string[], min = 0.35): T | null {
  let best: T | null = null, score = min;
  for (const it of items) for (const l of labels(it)) for (const w of wanted) { if (!w || !l) continue; const s = similarity(w, l); if (s > score) { score = s; best = it; } }
  return best;
}
