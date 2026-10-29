/**
 * Recipes for agents: read a recipe link (`…/r?recipe=<base64url>`), a bare code, a share page's recipe.json or pasted JSON, and turn it into
 * run_tool arguments. Same link format and the same checks as the app (server/src/shared/recipe.ts): unknown keys dropped, ids checked,
 * no files, URLs or paths in settings, prompt capped. Nothing here runs anything.
 */
export type Setting = string | number | boolean | (string | number | boolean)[];
export interface Recipe { v: number; tool: { id: string; name: string | null }; model: { id: string; name: string | null } | null; workflow: { id: string | null; name: string | null } | null; ranOn: string | null; settings: Record<string, Setting>; prompt?: string }

const MAX_CHARS = 16_000;
const ID = /^[A-Za-z0-9][\w.:@/+-]{0,99}$/;
const SKIP = /(url|path|file|prompt|token|key|secret|password|webhook|client|owner|idem|^warnings$|^outKind$|^baseTool$|^appId$|^elements$|^simulate$|^blocked$|^draft$|^target$)/i;
const plain = (x: unknown) => (typeof x === 'number' && Number.isFinite(x)) || typeof x === 'boolean' || (typeof x === 'string' && x.length <= 200 && !/^(\/|https?:|data:|blob:|file:|[A-Za-z]:\\)/i.test(x) && !/[<>]/.test(x));
const idOf = (x: unknown) => { const s = typeof x === 'string' ? x.trim() : ''; return ID.test(s) ? s : null; };
const line = (x: unknown, n = 120) => (typeof x === 'string' ? x.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) || null : null);

export function sanitize(x: unknown): { ok: true; recipe: Recipe } | { ok: false; error: string } {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return { ok: false, error: 'That isn\'t a recipe.' };
  const o = x as Record<string, any>;
  const toolId = idOf(typeof o.tool === 'string' ? o.tool : o.tool?.id); if (!toolId) return { ok: false, error: 'This recipe doesn\'t say which tool made it.' };
  const modelId = idOf(typeof o.model === 'string' ? o.model : o.model?.id);
  const settings: Record<string, Setting> = {};
  for (const [k, v] of Object.entries(o.settings && typeof o.settings === 'object' && !Array.isArray(o.settings) ? o.settings : {})) {
    if (Object.keys(settings).length >= 40) break;
    if (!/^[A-Za-z][\w-]{0,39}$/.test(k) || SKIP.test(k) || v == null || v === '') continue;
    if (plain(v)) settings[k] = v as Setting; else if (Array.isArray(v) && v.length && v.length <= 32 && v.every(plain)) settings[k] = v as Setting;
  }
  const prompt = typeof o.prompt === 'string' ? o.prompt.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, 4000) : '';
  const wfId = idOf(typeof o.workflow === 'string' ? o.workflow : o.workflow?.id); const wfName = line(typeof o.workflow === 'object' ? o.workflow?.name : null);
  return { ok: true, recipe: { v: typeof o.v === 'number' ? Math.floor(o.v) : 1, tool: { id: toolId, name: line(o.tool?.name) }, model: modelId ? { id: modelId, name: line(o.model?.name) } : null,
    workflow: wfId || wfName ? { id: wfId, name: wfName } : null, ranOn: line(o.ranOn, 40), settings, ...(prompt ? { prompt } : {}) } };
}
const fromB64u = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
/** A recipe link, a bare code, or recipe JSON → a checked recipe. */
export function parseRecipe(text: string) {
  const t = String(text ?? '').trim();
  if (!t) return { ok: false as const, error: 'Give a recipe link or recipe JSON.' };
  if (t.length > MAX_CHARS * 4) return { ok: false as const, error: 'That\'s too long to be a recipe.' };
  if (t.startsWith('{')) { try { return sanitize(JSON.parse(t)); } catch { return { ok: false as const, error: 'That looks like JSON, but it isn\'t complete.' }; } }
  const m = /[?&]recipe=([A-Za-z0-9_-]+)/.exec(t) ?? /\/r\/?#([A-Za-z0-9_-]+)/.exec(t); const code = m?.[1] ?? (/^[A-Za-z0-9_-]+$/.test(t) ? t : null);
  if (!code) return { ok: false as const, error: 'That isn\'t a recipe. Pass the recipe link (it has "/r?recipe=" in it) or the recipe JSON.' };
  if (code.length > MAX_CHARS) return { ok: false as const, error: 'This recipe is too large to be one of ours.' };
  try { return sanitize(JSON.parse(fromB64u(code))); } catch { return { ok: false as const, error: 'This recipe link is damaged or cut short.' }; }
}
/** run_tool arguments for a recipe: the tool, its model, its settings as fields, and the prompt when the recipe has one. A new seed unless keep_seed. */
export function recipeToRun(r: Recipe, o: { keepSeed?: boolean; prompt?: string } = {}) {
  const { seed, mode: _mode, ...rest } = r.settings as Record<string, Setting>; void _mode; // mode is derived from types on the server
  const fields: Record<string, Setting> = { ...rest, ...((o.prompt ?? r.prompt) ? { prompt: o.prompt ?? r.prompt! } : {}) };
  return { tool_id: r.tool.id, ...(r.model ? { model: r.model.id } : {}), fields, ...(o.keepSeed && typeof seed === 'number' ? { seed } : {}) };
}
