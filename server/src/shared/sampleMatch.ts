/**
 * Free samples (2026-11-06): pick the app's own shipped example results that best fit a prompt. ONE matcher for every place that hands out a
 * sample instead of a run: the server's free-samples state (routing/sampleRun.ts, a fresh install with nothing set up) today; the web
 * "Try it" sample site can use the same function. Isomorphic: no server-only imports.
 *
 * How it picks: the prompt's words (lower case, plural "s" dropped, short and common words left out) are counted against each example's
 * words (its title counts twice, then its prompt, flow and model). Best score first; ties keep the catalogue order turned by a number from
 * the prompt, so the same prompt gets the same picks and different prompts don't all get the first example. Count n gives n different files
 * when there are that many of the kind.
 */
import { FEATURED, type FeaturedItem } from './featured.js';

export type SampleKind = 'image' | 'video' | 'audio';
export interface SampleCandidate { url: string; kind: SampleKind; title: string; text: string }

const STOP = new Set(['the', 'and', 'with', 'for', 'from', 'into', 'onto', 'over', 'under', 'that', 'this', 'its', 'his', 'her', 'their', 'very', 'shot',
  'image', 'picture', 'photo', 'video', 'clip', 'scene', 'style', 'high', 'detailed', 'quality', 'cinematic', 'soft', 'light', 'make', 'show', 'showing', 'one', 'two', 'are', 'was', 'has', 'have']);
/** The words of a text, as the matcher compares them. */
export function sampleWords(text: string): string[] {
  return String(text ?? '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)
    .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)).filter((w) => w.length >= 3 && !STOP.has(w));
}
const kindOf = (f: FeaturedItem): SampleKind | null => {
  const u = f.out.url.toLowerCase();
  if (f.tab === 'audio' || /\.(mp3|m4a|wav|ogg)$/.test(u)) return 'audio';
  if (/\.(mp4|webm|mov)$/.test(u)) return 'video';
  if (/\.(webp|png|jpe?g)$/.test(u) && !f.layers) return 'image';
  return null;
};
/** Every shipped example result, as sample candidates (catalogue order). */
export const SAMPLE_CANDIDATES: SampleCandidate[] = FEATURED.flatMap((f) => { const kind = kindOf(f); return kind ? [{ url: f.out.url, kind, title: f.title, text: `${f.prompt} ${f.flow} ${f.model}` }] : []; })
  .filter((c, i, all) => all.findIndex((x) => x.url === c.url) === i);

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
/** The n best examples of this kind for the prompt (different files while there are enough). `extra` adds words (a tool or model name). */
export function matchSamples(prompt: string, kind: SampleKind, n = 1, opts: { extra?: string; candidates?: SampleCandidate[] } = {}): SampleCandidate[] {
  const pool = (opts.candidates ?? SAMPLE_CANDIDATES).filter((c) => c.kind === kind); if (!pool.length) return [];
  const want = new Set(sampleWords(`${prompt} ${opts.extra ?? ''}`)); const turn = hash(String(prompt ?? '')) % pool.length;
  const scored = pool.map((c, i) => { const title = sampleWords(c.title); const rest = new Set(sampleWords(c.text));
    let score = 0; for (const w of want) { if (title.includes(w)) score += 2; else if (rest.has(w)) score += 1; }
    return { c, score, order: (i - turn + pool.length) % pool.length }; })
    .sort((a, b) => b.score - a.score || a.order - b.order);
  return Array.from({ length: Math.max(1, n) }, (_, k) => scored[k % scored.length].c);
}
