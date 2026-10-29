/**
 * B20: the client side of the server's enum allowlist (resolution / aspect / quality / scale; types / mode; width / height).
 * Source of truth = the server: tool.allowed on /api/tools when present; otherwise we mirror its rule from the tool registry (/api/tools: input options, app scales, an app's base tool),
 * then overwrite a field with the server's own `allowed` list whenever a 400 invalid_<field> carries one.
 * Use: a field whose list is empty isn't a setting for that tool, so it is never sent. Values are never swapped for another value:
 * an out-of-list pick still goes out and comes back as an inline field error (that's a bug to fix in the picker, not to hide).
 */
type T = { id: string; inputs?: any[]; app?: any; allowed?: Partial<Record<string, unknown>> };
export const ENUM_FIELDS = ['resolution', 'aspect', 'quality', 'scale'] as const;
type F = typeof ENUM_FIELDS[number];
const reg = new Map<string, T>(); const learned = new Map<string, Partial<Record<F, string[]>>>();
export const registerAllowTools = (tools: T[]) => tools.forEach(t => reg.set(t.id, t));
const opts = (t: T | undefined, n: string): string[] => [...new Set((t?.inputs ?? []).filter((i: any) => i?.name === n).flatMap((i: any) => (i.options ?? []).map((o: any) => String(o?.value ?? o))))];
const own = (t: T | undefined): Record<F, string[]> => { const res = opts(t, 'resolution'); const q = opts(t, 'quality');
  return { resolution: res, aspect: [...new Set([...opts(t, 'aspect'), ...opts(t, 'aspectRatio')])], quality: q.length || res.length ? [...new Set([...q, ...res])] : [], scale: [...new Set([...opts(t, 'scale'), ...((t?.app?.scales ?? []) as any[]).map(String)])] }; };
/** Allowed values for a field, or null when we don't know the tool yet (then nothing is dropped). */
export function allowedFor(toolId: string, f: F): string[] | null {
  const l = learned.get(toolId)?.[f]; if (l) return l;
  const t = reg.get(toolId); if (!t) return null;
  /* The server now publishes its allowlist on /api/tools (tool.allowed); use it first. Quality also accepts the resolution words it lists as aliases. */
  const sa = t.allowed?.[f]; if (Array.isArray(sa)) { const al = f === 'quality' && Array.isArray(t.allowed?.qualityAliases) ? (t.allowed!.qualityAliases as unknown[]) : []; return [...new Set([...sa, ...al].map(String))]; }
  const o = own(t); /* fallback: crawl the registry (older servers) */ const b = t.app?.gallery?.base; const B = b && b !== toolId ? reg.get(b) : undefined;
  if (o[f].length || !B) return o[f]; return own(B)[f];
};
export const learnAllowed = (toolId: string, body: any) => { const m = /^invalid_(resolution|aspect|quality|scale)$/.exec(String(body?.code ?? '')); if (!m || !Array.isArray(body?.allowed)) return;
  const f = m[1] as F; const cur = learned.get(toolId) ?? {}; /* quality's `allowed` lists only its own words; resolution aliases stay accepted */ cur[f] = f === 'quality' && body.allowed.length ? [...body.allowed, ...(allowedFor(toolId, 'resolution') ?? [])] : body.allowed.map(String); learned.set(toolId, cur); };
const SIZE_MIN = 16, SIZE_MAX = 16384;
const sizeOf = (v: string): string | null => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? String(Math.min(SIZE_MAX, Math.max(SIZE_MIN, n))) : null; };
const emptyList = (v: string) => { const s = v.trim(); return !s || s === '[]' || s === '""' || s === 'null'; };
/** Clean one set of params in place (URLSearchParams or FormData share get/set/delete). Returns the fields dropped. */
export function cleanEnumParams(toolId: string, p: { get(k: string): any; set(k: string, v: string): void; delete(k: string): void; has(k: string): boolean }): string[] {
  const dropped: string[] = [];
  for (const f of ENUM_FIELDS) for (const k of f === 'aspect' ? ['aspect', 'aspectRatio'] : [f]) { if (!p.has(k)) continue; const v = String(p.get(k) ?? '');
    const list = allowedFor(toolId, f); if (v === '' || (list && list.length === 0)) { p.delete(k); dropped.push(k); } }
  for (const k of ['types', 'mode']) if (p.has(k) && emptyList(String(p.get(k) ?? ''))) { p.delete(k); dropped.push(k); }
  for (const k of ['width', 'height']) if (p.has(k)) { const s = sizeOf(String(p.get(k) ?? '')); if (s == null) { p.delete(k); dropped.push(k); } else p.set(k, s); }
  return dropped;
}
