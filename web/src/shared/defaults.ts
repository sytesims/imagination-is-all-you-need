/** B27 cloud-first defaults (GET /api/tools): the tool's (or the mode's / swap type's) default, quality order and fallback note,
 *  plus each model's run status. Everything is the server's; the client only orders, marks and greys. */
export type Fallback = { note?: string | null; from?: string; to?: string; fromName?: string; toName?: string; reasonCode?: string | null } | null;
export type Defaults = { preferredProvider: string | null; defaultProvider: string | null; defaultFallback: Fallback; qualityOrder: string[] | null };
export function defaultsOf(tool: any, mode?: string | null, swapType?: string | null): Defaults {
  const m = (swapType && tool?.swapTypes?.[swapType]) || (mode && tool?.defaultsByMode?.[mode]) || tool || {};
  return { preferredProvider: m.preferredProvider ?? tool?.preferredProvider ?? null, defaultProvider: m.defaultProvider ?? tool?.defaultProvider ?? null,
    defaultFallback: m.defaultFallback ?? null, qualityOrder: Array.isArray(m.qualityOrder) ? m.qualityOrder : null };
}
/** The default to preselect: the mode / type default when it is one of the offered models, else the tool default, else the first. */
export const pickDefault = (d: Defaults, ids: string[], fallback?: string | null): string => (d.defaultProvider && ids.includes(d.defaultProvider) ? d.defaultProvider : fallback && ids.includes(fallback) ? fallback : ids[0] ?? '');
/** P3-01: the model a fresh page opens on for `mode`: that mode's default among the models that run the mode (the model menu's "Default"),
 *  else the tool default. A fresh Sound effects page opened on the tool default (Seed Audio) while the menu marked ElevenLabs as Default. */
export function initialProviderFor(tool: any, mode?: string | null, workflowId?: string | null): string {
  const pm: Record<string, string[]> | undefined = tool?.app?.providerModes; const all: string[] = (tool?.providers ?? []).map((p: any) => p.id);
  const ids = mode && pm ? all.filter(id => pm[id]?.includes(mode)) : all;
  const wd = workflowId ? tool?.workflowDefaults?.[workflowId] : null; /* an Audio workflow's own block (the bar's start, as GET /api/audio-workflows active.defaultProvider) */
  const d = wd?.defaultProvider ? { ...defaultsOf(tool, mode), defaultProvider: wd.defaultProvider as string } : defaultsOf(tool, mode);
  return ids.length ? pickDefault(d, ids, tool?.defaultProvider) : tool?.defaultProvider ?? '';
}
/** Display order: qualityOrder, else qualityRank, else the list order. Twin aliases (twinOf) are routes of another model, not cards. */
export function orderModels<T extends { id: string }>(xs: T[], order?: string[] | null, keep?: string | null): T[] {
  const list = xs.filter((p: any) => !p?.twinOf || p.id === keep);
  const pos = (p: any) => { const i = order ? order.indexOf(p.id) : -1; return i >= 0 ? i : typeof p.qualityRank === 'number' ? 1000 + p.qualityRank : 5000; };
  return list.map((p, i) => [p, i] as const).sort((a, b) => pos(a[0]) - pos(b[0]) || a[1] - b[1]).map(x => x[0]);
}
/** The quality pick: preferredProvider, else the first by quality. */
export const qualityPickOf = (d: Partial<Defaults> | null | undefined, xs: { id: string }[]): string | null => d?.preferredProvider ?? (d?.qualityOrder?.[0] ?? (xs.find((p: any) => p.qualityRank === 1)?.id ?? null));
export type ModelStatus = { dim: boolean; off?: string; note: string | null; keyCue: string | null };
const sentence = (t: unknown): string | null => { const s = typeof t === 'string' ? t.trim() : ''; return s ? `${s[0].toUpperCase()}${s.slice(1)}${/[.!?]$/.test(s) ? '' : '.'}` : null; };
/** runnable:false = greyed with the server's reason; a demo preview can still be picked (it runs as a demo), anything else can't. needsKey = add-a-key cue. */
export function modelStatus(p: any): ModelStatus {
  if (!p || p.runnable !== false) return { dim: false, note: null, keyCue: null };
  const note = sentence(p.reason); const keyCue = p.needsKey === true && p.keyOwner ? `Add a ${p.keyOwner} key` : null;
  // a model that only needs a key, or is heavy for this computer (it still runs when picked, with a warning), stays pickable: the composer then offers Add key instead of hiding the model
  return { dim: true, off: p.demoPreview === true || p.needsKey === true || p.reasonCode === 'too_heavy' ? undefined : note ?? 'Not available here.', note, keyCue };
}
/** Route chips for a model with a twin (cloud workflow) route: each route's tier label, in tier order ('Comfy Cloud', 'API', 'Local'…). */
export const tierChipsOf = (p: any): string[] | null => { const rs: any[] = Array.isArray(p?.routes) ? p.routes : []; if (!rs.some(r => r?.twinOf)) return null;
  return [...new Set(rs.slice().sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9)).map(r => String(r.tierLabel ?? '').trim()).filter(Boolean))]; };
/** The fallback note to show for the picked model: the server's note verbatim (names only if the note is missing). */
export const fallbackNoteOf = (fb: Fallback, picked: string): string | null => !fb || !fb.to || fb.to !== picked ? null : typeof fb.note === 'string' && fb.note.trim() ? fb.note.trim() : fb.toName && fb.fromName ? `${fb.toName} is selected; ${fb.fromName} is the best-quality option.` : null;
/** B28a (5): a live quote (?provider= or /api/models/quote) carries preferredProvider, defaultProvider and defaultFallback.
 *  The quote's values win; the tool / mode defaults stay as the fallback when a quote is missing or older. qualityOrder is the tool's. */
export function withQuoteDefaults(d: Defaults | null | undefined, q: any): Defaults | null {
  const has = !!q && typeof q === 'object' && ('defaultFallback' in q || 'preferredProvider' in q || 'defaultProvider' in q);
  if (!has) return d ?? null;
  return { preferredProvider: q.preferredProvider ?? d?.preferredProvider ?? null, defaultProvider: q.defaultProvider ?? d?.defaultProvider ?? null,
    defaultFallback: 'defaultFallback' in q ? (q.defaultFallback ?? null) : (d?.defaultFallback ?? null), qualityOrder: d?.qualityOrder ?? null };
}
