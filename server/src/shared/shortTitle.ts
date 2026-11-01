/**
 * Short titles for results (2026-10-31): the one place that turns a job into a few plain words for a small tile (media picker, Assets).
 * Isomorphic (web imports it). Order: the job's own title (one the user gave it, an example's, a seed's), else the first words of its
 * prompt, else the feature's name. A layer of Image to layers reads "Layer N · <that title>" ("Background · …" for the plate).
 * 2026-11-01 (Audio cards): a leading language tag ("English, …", which song prompts start with) is skipped, CJK commas split clauses, a cut
 * never ends half way through a pair ("Lo-fi piano and vinyl" → "Lo-fi piano"), and shortModelName gives a model a short form for one chip row.
 */
import { LAYERS_NO_PROMPT } from './imageLayers.js';

/** A place or manner phrase starts here: once a title has two real words it stops before one ("Moody study with soft light" → "Moody study"). */
const BREAK = new Set(['with', 'at', 'in', 'on', 'under', 'over', 'against', 'while', 'during', 'near', 'beside', 'behind', 'inside', 'through',
  /* the same in a few other languages (prompts aren't always English) */ 'sobre', 'con', 'en', 'sur', 'avec', 'dans', 'mit', 'auf', 'unter', 'sotto', 'com']);
/** Words that don't count toward the limit and never end a title ("Portrait of a" → "Portrait"). */
const SMALL = new Set(['a', 'an', 'the', 'of', 'with', 'and', 'or', 'at', 'in', 'on', 'for', 'to', 'from', 'by', 'into', 'over', 'under', 'as', 'is', 'are', 'its', 'their', 'his', 'her',
  'de', 'del', 'la', 'las', 'el', 'los', 'un', 'una', 'le', 'les', 'des', 'du', 'der', 'die', 'das', 'den', 'ein', 'eine', 'il', 'gli', 'um', 'uma']);

/** A language tag that starts a song prompt ("English, magical music box…"): it says how the vocals sing, not what the sound is. */
const LANG = 'english|spanish|french|german|italian|portuguese|dutch|swedish|norwegian|danish|finnish|polish|russian|ukrainian|turkish|greek|arabic|hebrew|hindi|bengali|urdu|japanese|korean|chinese|mandarin|cantonese|thai|vietnamese|indonesian|malay|tagalog|catalan|basque|galician|irish|welsh|latin';
const LEAD_LANG = new RegExp(`^(?:${LANG})(?:\\s*(?:,|/|&|\\band\\b)\\s*(?:${LANG}))*\\s*[,;:]\\s+`, 'i');
/** Pair words: a cut right after "and X" drops the half pair. */
const PAIR = new Set(['and', 'or', '&']);

/** The first few words of a text, as a title: "Cinematic close-up portrait of a fisherman at dawn, golden light" → "Cinematic close-up portrait". */
export function shortTitle(text: string | null | undefined, maxWords = 4, maxChars = 32): string {
  let s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const noLang = s.replace(LEAD_LANG, ''); if (noLang.trim()) s = noLang.trim();
  /* the first clause, when it says enough on its own */
  const clause = s.split(/(?<=[^\d])[.,;:!?]\s|[、，。；：！？]|\s[-–—]\s|\s\(/)[0].trim();
  if (clause.split(' ').filter(w => !SMALL.has(w.toLowerCase())).length >= 2 || (clause !== s && /[\u3040-\u9fff\uac00-\ud7af]/.test(clause))) s = clause; // CJK: no spaces
  const words = s.split(' ').filter(Boolean);
  while (words.length > 1 && SMALL.has(words[0].toLowerCase())) words.shift(); // "a moody study" → "moody study"
  const out: string[] = []; let count = 0; let cut = false;
  for (const [i, w] of words.entries()) {
    if (count >= 2 && BREAK.has(w.toLowerCase())) { cut = true; break; }
    const next = [...out, w].join(' ');
    if (out.length && next.length > maxChars) { cut = true; break; }
    out.push(w); if (!SMALL.has(w.toLowerCase())) count++;
    if (count >= maxWords) { cut = i < words.length - 1; break; }
  }
  /* cut inside a pair ("Lo-fi piano and vinyl | crackle"): keep the first half */
  if (cut && out.length >= 3 && PAIR.has(out[out.length - 2].toLowerCase())) out.splice(-2);
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
/** A result's short title for a tile (maxChars: a narrower tile, e.g. the Audio card's one title line, asks for fewer). */
export function resultTitle(r: TitleSource, maxChars = 32): string {
  const prompt = r.prompt && r.prompt !== LAYERS_NO_PROMPT ? r.prompt : '';
  const base = shortTitle(r.title, 4, maxChars) || shortTitle(prompt, 4, maxChars) || String(r.feature ?? '').trim() || 'Result';
  if (r.layer == null) return base;
  return `${r.layer === 0 ? 'Background' : `Layer ${r.layer}`} · ${base}`;
}

/** Words a model name can drop on a small card (the full name stays in the tooltip). */
const MODEL_TAIL = /\s+(?:multilingual|instrumental|preview|experimental)$/i;
/** A model's short form for one chip row: "Seed Audio 1.0 Multilingual" → "Seed Audio 1.0", "ElevenLabs Sound Effects" → "ElevenLabs SFX",
 *  "InfiniteTalk (Wan 2.1) · Comfy Cloud" → "InfiniteTalk". Short names come back as they are. */
export function shortModelName(name: string | null | undefined): string {
  let s = String(name ?? '').replace(/\s+/g, ' ').trim();
  s = s.split(' · ')[0].replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  for (let k = 0; k < 2 && MODEL_TAIL.test(s); k++) s = s.replace(MODEL_TAIL, '');
  return s.replace(/\bSound Effects\b/i, 'SFX').replace(/\bText[- ]to[- ]Speech\b/i, 'TTS').trim();
}
