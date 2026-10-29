/**
 * search_capabilities' index and ranking, built only from what the app serves (no hand lists here):
 *  - tools (GET /api/tools): name, id, category, description, preset labels/descriptions, select options, model names, + the app's extra words;
 *  - tool modes: every option of a tool's `types` field, or every preset of a tool with a `preset` field (Footage Effects → vanish, Photo FX →
 *    exploded-view, Voice Studio → lipsync / voiceover…), each with ready run arguments;
 *  - workflows: image / audio / 3D workflows, video presets and GET /api/capabilities (Video workflows, Loop, Morph, viral templates, Explore);
 *  - models: one card per model key.
 * Ranking: every query word must match (name/id 3, keywords 2, other text 1, +5 when the whole phrase is in the name or keywords); when
 * nothing matches every word of a 3+ word query, items matching most words (at least half) come back marked partial. Test: test/search.ts.
 */
import type { ServerTool, Workflow } from './catalog.js';

export type EntryKind = 'tool' | 'mode' | 'workflow' | 'model';
export interface Entry { kind: EntryKind; id: string; name: string; media: string | null; name_: string; words: string; text: string; ref: any }
export interface Hit { entry: Entry; score: number; partial: boolean }

const STOP = new Set(['a', 'an', 'the', 'to', 'of', 'for', 'and', 'or', 'in', 'on', 'with', 'my', 'me', 'i', 'into', 'from', 'it', 'is', 'make', 'how', 'can', 'do', 'want', 'please', 'some', 'this', 'that', 'by']);
export const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[_/·•:,.;!?()"'’]+/g, ' ').replace(/\s+/g, ' ').trim();
/** Query words (stop words dropped unless that leaves nothing). */
export function queryWords(q?: string): string[] {
  const all = norm(q).split(' ').filter(Boolean); const kept = all.filter((w) => !STOP.has(w)); return kept.length ? kept : all;
}
const variants = (w: string) => { const v = [w]; if (w.length > 4 && w.endsWith('ing')) v.push(w.slice(0, -3)); if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) v.push(w.slice(0, -1)); if (w.length > 3 && w.endsWith('ed')) v.push(w.slice(0, -2)); return v; };
const has = (hay: string, w: string) => { const h = hay; const c = hay.replace(/[\s-]+/g, ''); return variants(w).some((x) => h.includes(x) || c.includes(x.replace(/-/g, ''))); };

const mk = (kind: EntryKind, id: string, name: string, media: string | null, words: unknown[], text: unknown[], ref: any): Entry =>
  ({ kind, id, name, media, name_: norm(`${name} ${id} ${id.replace(/-/g, ' ')}`), words: norm(words.flat().join(' | ')), text: norm(text.flat().join(' | ')), ref });

/** A tool's modes: its `types` options (labelled by its presets), else its presets when it has a `preset` field. */
export function toolModes(t: ServerTool): { id: string; label: string; description: string | null; group: string | null; fields: Record<string, unknown> }[] {
  const types = (t.inputs ?? []).find((i) => i.name === 'types'); const presets = t.presets ?? [];
  const label = (v: string) => presets.find((p: any) => p.id === v);
  if (types?.options?.length) return types.options.map(String).map((v) => ({ id: v, label: label(v)?.label ?? v, description: label(v)?.description ?? null, group: label(v)?.group ?? null, fields: { types: [v] } }));
  if ((t.inputs ?? []).some((i) => i.name === 'preset') && presets.length) return presets.map((p: any) => ({ id: p.id, label: p.label ?? p.id, description: p.description ?? null, group: p.group ?? null, fields: { preset: p.id } }));
  return [];
}

export function buildIndex(tools: ServerTool[], workflows: Workflow[], extraWords: Record<string, string[]> = {}, models: any[] = []): Entry[] {
  const out: Entry[] = [];
  for (const t of tools) {
    const opts = (t.inputs ?? []).filter((i) => (i.kind === 'select' || i.kind === 'list') && i.name !== 'types').flatMap((i) => (i.options ?? []).map(String).filter((o) => /[a-z]/i.test(o) && o.length > 2));
    const modes = toolModes(t); const capWords = workflows.filter((w) => w.toolId === t.id && w.kind).map((w) => w.name);
    out.push(mk('tool', t.id, t.name, t.media, [extraWords[t.id] ?? [], capWords], [t.category ?? '', t.description ?? '', modes.map((m) => `${m.id} ${m.label} ${m.description ?? ''}`), (t.presets ?? []).map((p: any) => `${p.label ?? ''} ${p.description ?? ''}`), opts, (t.models ?? []).map((m: any) => m.name)], t));
    for (const m of modes) out.push(mk('mode', `${t.id}/${m.id}`, `${t.name} · ${m.label}`, t.media, [extraWords[`${t.id}/${m.id}`] ?? [], m.id.replace(/-/g, ' ')], [m.description ?? '', m.group ?? '', t.name], { tool: t, mode: m }));
  }
  for (const w of workflows) out.push(mk('workflow', w.id, w.name, w.area, [w.keywords ?? []], [w.tagline ?? '', w.toolId ?? '', w.needs ?? '', w.inputs ?? [], w.how ?? [], w.kind ?? ''], w));
  for (const m of models) out.push(mk('model', m.model, m.name ?? m.model, null, [], [m.maker ?? '', m.bestFor ?? '', (m.tools ?? []).join(' ')], m));
  return out;
}

function score(e: Entry, ws: string[], phrase: string): number {
  let s = 0;
  for (const w of ws) { const v = has(e.name_, w) ? 3 : has(e.words, w) ? 2 : has(e.text, w) ? 1 : 0; if (!v) return -1; s += v; }
  if (phrase.includes(' ') && (e.name_.includes(phrase) || e.words.includes(phrase))) s += 5;
  if (e.name_ === phrase || norm(e.name) === phrase || e.id === phrase) s += 5;
  return s;
}
const matched = (e: Entry, ws: string[]) => ws.filter((w) => has(e.name_, w) || has(e.words, w) || has(e.text, w)).length;

/** Ranked hits. Every word must match; if nothing does, the entries matching the most words (at least half) come back with partial:true. */
export function search(index: Entry[], query: string, filter: (e: Entry) => boolean = () => true): Hit[] {
  const ws = queryWords(query); const phrase = norm(query); const pool = index.filter(filter);
  if (!ws.length) return pool.map((entry) => ({ entry, score: 0, partial: false }));
  const full = pool.map((entry) => ({ entry, score: score(entry, ws, phrase), partial: false })).filter((h) => h.score >= 0);
  if (full.length) return full.sort((a, b) => b.score - a.score);
  const need = ws.length <= 2 ? ws.length + 1 /* never: a short query is all or nothing */ : Math.ceil(ws.length / 2); const part = pool.map((entry) => ({ entry, n: matched(entry, ws) })).filter((x) => x.n >= need);
  const best = Math.max(0, ...part.map((x) => x.n));
  return part.filter((x) => x.n === best).map((x) => ({ entry: x.entry, score: x.n, partial: true }));
}
