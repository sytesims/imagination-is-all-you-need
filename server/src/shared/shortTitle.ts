/**
 * Short titles for results (2026-10-31): the one place that turns a job into a few plain words for a small tile (media picker, Assets).
 * Isomorphic (web imports it). Order: the job's own title (one the user gave it, an example's, a seed's), else the first words of its
 * prompt, else the feature's name. A layer of Image to layers reads "Layer N · <that title>" ("Background · …" for the plate).
 */
import { LAYERS_NO_PROMPT } from './imageLayers.js';

/** A place or manner phrase starts here: once a title has two real words it stops before one ("Moody study with soft light" → "Moody study"). */
const BREAK = new Set(['with', 'at', 'in', 'on', 'under', 'over', 'against', 'while', 'during', 'near', 'beside', 'behind', 'inside', 'through']);
/** Words that don't count toward the limit and never end a title ("Portrait of a" → "Portrait"). */
const SMALL = new Set(['a', 'an', 'the', 'of', 'with', 'and', 'or', 'at', 'in', 'on', 'for', 'to', 'from', 'by', 'into', 'over', 'under', 'as', 'is', 'are', 'its', 'their', 'his', 'her']);

/** The first few words of a text, as a title: "Cinematic close-up portrait of a fisherman at dawn, golden light" → "Cinematic close-up portrait". */
export function shortTitle(text: string | null | undefined, maxWords = 4, maxChars = 32): string {
  let s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  /* the first clause, when it says enough on its own */
  const clause = s.split(/(?<=[^\d])[.,;:!?]\s|\s[-–—]\s|\s\(/)[0].trim();
  if (clause.split(' ').filter(w => !SMALL.has(w.toLowerCase())).length >= 2) s = clause;
  const words = s.split(' ').filter(Boolean);
  while (words.length > 1 && SMALL.has(words[0].toLowerCase())) words.shift(); // "a moody study" → "moody study"
  const out: string[] = []; let count = 0;
  for (const w of words) {
    if (count >= 2 && BREAK.has(w.toLowerCase())) break;
    const next = [...out, w].join(' ');
    if (out.length && next.length > maxChars) break;
    out.push(w); if (!SMALL.has(w.toLowerCase())) count++;
    if (count >= maxWords) break;
  }
  while (out.length > 1 && SMALL.has(out[out.length - 1].toLowerCase())) out.pop();
  let t = out.join(' ').replace(/[\s,;:.\-–—'"“”(]+$/, '');
  if (t.length > maxChars) t = `${t.slice(0, maxChars - 1).trimEnd()}…`; // one very long word
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

export interface TitleSource {
  /** the job's own title: one the user gave it, an example's, a seed's */ title?: string | null;
  prompt?: string | null; /** the feature ("Create Image", "Image to layers") */ feature?: string | null;
  /** a layer job: this output's place in the stack (0 = background) */ layer?: number | null;
}
/** A result's short title for a tile. */
export function resultTitle(r: TitleSource): string {
  const prompt = r.prompt && r.prompt !== LAYERS_NO_PROMPT ? r.prompt : '';
  const base = shortTitle(r.title) || shortTitle(prompt) || String(r.feature ?? '').trim() || 'Result';
  if (r.layer == null) return base;
  return `${r.layer === 0 ? 'Background' : `Layer ${r.layer}`} · ${base}`;
}
