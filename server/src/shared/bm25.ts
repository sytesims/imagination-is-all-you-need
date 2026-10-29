/**
 * Library search (2026-10-27): one small ranked text index for the workflows and references databases (server/src/libraryDb.ts) and the
 * Workflows page search box (web/src/ui/pages/Workflows.tsx), so the app and agents rank the same way. BM25F over weighted fields, no
 * paid embeddings, no dependencies. Isomorphic (no server imports).
 *  - Fields: name (3), tags (2), text (1.5: description, job, prompt), body (1: steps, needs, models…). A word in the name beats the same word
 *    in a description.
 *  - Words: lower case, accents dropped, split on anything that isn't a letter or digit, a light stem (plural s, -ing, -ed), stop words dropped.
 *  - The last query word also matches as a prefix ("relig" finds Relight) at 0.6 of a full match, so search works while typing.
 *  - A doc must match every query word (all-words); when nothing does, docs matching most words come back marked partial.
 *  - Bonus: the whole query inside the name (+2), the name equal to the query (+4). `prior` per doc scales its score (ideas rank under built).
 * Test: server/test/library-db.test.ts.
 */
export type FieldName = 'name' | 'tags' | 'text' | 'body';
export const FIELD_WEIGHT: Record<FieldName, number> = { name: 3, tags: 2, text: 1.5, body: 1 };
export interface SearchDoc { id: string; name: string; tags?: string[]; text?: string; body?: string; /** score multiplier, default 1 */ prior?: number }
export interface SearchHit { id: string; score: number; partial: boolean }

const STOP = new Set(('a an the to of for and or in on at with my me i into from it its is are be this that by as your you our we how can do want please some '
  + 'make made get use using will would should just very more most about over under than then there their them they what which who when where while '
  + 'one two out up so no not all any each also but if').split(' '));
/** Extra words that carry no subject in a prompt (never auto tags). */
const PROMPT_FILLER = new Set(('shot scene image photo picture video clip frame camera style look looking slow slowly soft softly gentle gently warm '
  + 'light lighting cinematic detailed high quality realistic photorealistic beautiful background foreground left right center centre front back side '
  + 'keep same exactly like while behind across around through toward towards along onto inside outside small large big little full half near far '
  + 'seconds second first last next then into sound sounds audio music ambience shot shots medium wide close closeup close-up push pull '
  + 'has have had was were his her him she he them its who off down set sets new old top end way per via yet out own now dark bright tiny '
  + 'rich deep pale lit mid low lot lots lens film feel feels feeling dialogue text subtitle subtitles logo logos watermark angle sequence feature').split(' '));

const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
/** One word's stem: plural s, -ing, -ed (enough for "lights" = "light", "upscaling" = "upscal" = "upscale"). */
export function stem(w: string): string {
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('es') && /(ch|sh|x|ss)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) w = w.slice(0, -1);
  return w.length > 4 && w.endsWith('e') ? w.slice(0, -1) : w;
}
/** Raw words (lower case, no accents), stop words kept. */
export const words = (s: unknown): string[] => fold(String(s ?? '').toLowerCase()).split(/[^a-z0-9]+/).filter(Boolean);
/** Index terms: stemmed words without stop words. */
export const tokens = (s: unknown): string[] => words(s).filter((w) => !STOP.has(w)).map(stem);
/** Query terms (stop words dropped unless that leaves nothing). */
export function queryTerms(q: string): string[] { const all = words(q); const kept = all.filter((w) => !STOP.has(w)); return (kept.length ? kept : all).map(stem); }
const norm = (s: string) => words(s).join(' ');

/**
 * Auto tags for a prompt: its subject words, most used first (a word in the first 20 counts once more), then first seen (no stop words, no
 * camera or quality filler, at least 3 letters, no numbers). Plain words, not stems, so they read well as chips.
 */
export function keywords(text: string, max = 6): string[] {
  const n = new Map<string, { c: number; at: number }>(); let i = 0;
  /* a word in the opening (where a prompt names its subject) counts one more */
  for (const w of words(text)) { i++; if (w.length < 3 || /\d/.test(w) || STOP.has(w) || PROMPT_FILLER.has(w)) continue; const k = n.get(w); if (k) k.c++; else n.set(w, { c: i <= 20 ? 2 : 1, at: i }); }
  const out: string[] = []; const stems = new Set<string>();
  for (const [w] of [...n.entries()].sort((a, b) => b[1].c - a[1].c || a[1].at - b[1].at)) { const s = stem(w); if (stems.has(s)) continue; stems.add(s); out.push(w); if (out.length >= max) break; }
  return out;
}

interface Posting { doc: number; tf: Record<FieldName, number> }
export class Bm25Index {
  private docs: SearchDoc[] = []; private names: string[] = []; private lens: Record<FieldName, number>[] = [];
  private post = new Map<string, Posting[]>(); private avg: Record<FieldName, number> = { name: 1, tags: 1, text: 1, body: 1 };
  private k1 = 1.2; private b = 0.75;
  constructor(docs: SearchDoc[] = []) { for (const d of docs) this.add(d); this.finish(); }
  get size() { return this.docs.length; }
  private add(d: SearchDoc) {
    const i = this.docs.length; this.docs.push(d); this.names.push(norm(d.name));
    const f: Record<FieldName, string[]> = { name: tokens(d.name), tags: tokens((d.tags ?? []).join(' ')), text: tokens(d.text), body: tokens(d.body) };
    this.lens.push({ name: f.name.length, tags: f.tags.length, text: f.text.length, body: f.body.length });
    const per = new Map<string, Record<FieldName, number>>();
    for (const k of Object.keys(f) as FieldName[]) for (const t of f[k]) { const r = per.get(t) ?? { name: 0, tags: 0, text: 0, body: 0 }; r[k]++; per.set(t, r); }
    for (const [t, tf] of per) (this.post.get(t) ?? this.post.set(t, []).get(t)!).push({ doc: i, tf });
  }
  private finish() { const n = Math.max(1, this.docs.length); for (const k of Object.keys(this.avg) as FieldName[]) this.avg[k] = Math.max(1, this.lens.reduce((a, l) => a + l[k], 0) / n); }
  /** term → postings, with the prefix ones (last query word) at 0.6 */
  private match(t: string, prefix: boolean): { p: Posting; w: number }[] {
    const out: { p: Posting; w: number }[] = (this.post.get(t) ?? []).map((p) => ({ p, w: 1 }));
    if (prefix && t.length >= 2) for (const [k, ps] of this.post) if (k !== t && k.startsWith(t)) for (const p of ps) out.push({ p, w: 0.6 });
    return out;
  }
  /** Ranked hits for `q` among docs passing `keep`. Empty query: every kept doc in its own order (score 0). */
  search(q: string, keep: (d: SearchDoc) => boolean = () => true): SearchHit[] {
    const terms = [...new Set(queryTerms(q))]; const ok = this.docs.map(keep);
    if (!terms.length) return this.docs.filter((_, i) => ok[i]).map((d) => ({ id: d.id, score: 0, partial: false }));
    const N = this.docs.length; const score = new Map<number, number>(); const hits = new Map<number, number>();
    terms.forEach((t, ti) => {
      const ms = this.match(t, ti === terms.length - 1); const df = new Set(ms.map((m) => m.p.doc)).size; if (!df) return;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5)); const best = new Map<number, number>();
      for (const { p, w } of ms) { if (!ok[p.doc]) continue; const l = this.lens[p.doc]; let tf = 0;
        for (const k of Object.keys(FIELD_WEIGHT) as FieldName[]) if (p.tf[k]) tf += FIELD_WEIGHT[k] * p.tf[k] / (1 - this.b + this.b * l[k] / this.avg[k]);
        const s = w * idf * tf / (this.k1 + tf); if (s > (best.get(p.doc) ?? 0)) best.set(p.doc, s); }
      for (const [d, s] of best) { score.set(d, (score.get(d) ?? 0) + s); hits.set(d, (hits.get(d) ?? 0) + 1); }
    });
    const phrase = norm(q); const out = (need: number, partial: boolean) => [...score.entries()].filter(([d]) => (hits.get(d) ?? 0) >= need).map(([d, s]) => {
      const nm = this.names[d]; const bonus = phrase && nm === phrase ? 4 : phrase.includes(' ') && nm.includes(phrase) ? 2 : 0;
      return { id: this.docs[d].id, score: Math.round((s + bonus) * (this.docs[d].prior ?? 1) * 1000) / 1000, partial, _d: d };
    }).sort((a, b) => b.score - a.score || a._d - b._d).map(({ _d, ...h }) => h);
    const full = out(terms.length, false); if (full.length || terms.length < 3) return full;
    const most = Math.max(0, ...hits.values()); return most >= Math.ceil(terms.length / 2) ? out(most, true) : [];
  }
}
