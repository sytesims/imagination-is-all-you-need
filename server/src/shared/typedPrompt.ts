/**
 * The user's own words vs the prompt a workflow composes from them (2026-10-25). Character Sheet, Product Shot, Relight, Face / Person Swap…
 * wrap what you type in their own recipe text. A job stores both: `input.appPrompt` (your words) and `input.prompt` (what the model got).
 * The bug this guards: a composed prompt that lands back in the subject box (an example's full prompt, an old draft, a caller that sends the
 * whole prompt) is composed again ("Character reference sheet of …, Character reference sheet of …"). A frame is the recipe text around your
 * words (`head` + words + `tail`, built server side by composing a marker: tools/apps.ts promptFrames); `empty` = the prompt with no words.
 * Isomorphic, no imports: the server (submit, Recreate / Use again) and the web (the subject box, result cards) share it.
 */
export interface PromptFrame { head: string; tail: string; empty: string }

/** Whitespace as the compose step leaves it ("a , b" → "a, b"), so a stored prompt and a frame compare equal. */
export const normPrompt = (s: string) => String(s ?? '').replace(/\s+/g, ' ').replace(/\s+([:,.;])/g, '$1').trim();
const tidy = (s: string) => s.replace(/^[\s,;:]+/, '').replace(/[\s,;:]+$/, '').trim();

/** Your words out of a composed prompt (several times over for a prompt composed twice). Text that isn't one of the frames comes back as typed. */
export function typedFromFrames(text: string, frames: readonly PromptFrame[]): string {
  const raw = String(text ?? '').trim(); let t = normPrompt(raw); const t0 = t;
  for (let k = 0; k < 6 && t; k++) {
    if (frames.some((f) => f.empty && t === f.empty)) return '';
    const fits = (x: PromptFrame) => (x.tail && t.endsWith(x.tail) ? 1 : 0); // the same head with another setting: the frame whose tail is there wins
    const f = frames.filter((x) => x.head.length >= 8 && t.startsWith(x.head) && t.length > x.head.length).sort((a, b) => fits(b) - fits(a) || b.head.length - a.head.length)[0];
    if (!f) break;
    let m = t.slice(f.head.length);
    if (f.tail && m.endsWith(f.tail)) m = m.slice(0, -f.tail.length);
    else if (f.tail) { const key = f.tail.slice(0, 24); const i = key.length >= 8 ? m.lastIndexOf(key) : -1; if (i >= 0) m = m.slice(0, i); } // the same recipe with another setting
    const next = tidy(m); if (next === t) break; t = next;
  }
  return t === t0 ? raw : t; // not a composed prompt: exactly as typed (line breaks kept)
}

/**
 * A stored job's words when its `appPrompt` itself holds a composed prompt (jobs made before this fix, when the box held the recipe text):
 * the run's prompt is recipe + appPrompt + recipe, and appPrompt starts with that same recipe text, so peel it off. Otherwise appPrompt as is.
 */
export function stripEcho(prompt: string, typed: string): string {
  const p = normPrompt(prompt); const t = normPrompt(typed); const raw = String(typed ?? '').trim(); if (t.length < 24) return raw;
  const i = p.indexOf(t); if (i <= 0) return raw;
  const head = p.slice(0, i); const tail = p.slice(i + t.length);
  return head.length >= 8 && t.startsWith(head) ? typedFromFrames(t, [{ head, tail, empty: '' }]) : raw;
}

/** What a result card, the feed and Use again show as the prompt: the words you typed for a workflow job (none = ''), else the job's prompt. */
export function typedPromptOf(input: { prompt?: unknown; appPrompt?: unknown; appId?: unknown } | null | undefined): string {
  const i = input ?? {}; const p = typeof i.prompt === 'string' ? i.prompt : '';
  if (typeof i.appPrompt === 'string') return stripEcho(p, i.appPrompt);
  return p;
}
/** True when the job's model got more than the words shown (a workflow composed them): the result view offers the full prompt too. */
export const composedDiffers = (input: { prompt?: unknown; appPrompt?: unknown } | null | undefined) =>
  typeof input?.appPrompt === 'string' && typeof input?.prompt === 'string' && normPrompt(input.prompt) !== typedPromptOf(input);

/**
 * Model tokens back to the composer's chips (2026-10-26). A prompt box only ever holds the user's words with @image1 / @video1 / @audio1 chips;
 * each model's form (<<<image_1>>> Kling, <Picture 1> / <Video 1> / <Audio 1> local H3, <image1> Qwen, <ref_image_0> FLUX Klein, zero-based)
 * is made at send time (shared/promptRefs.ts). A stored prompt in a model's form (an old job, a pasted model example) comes back as chips, so
 * Recreate shows your words. Plain words ("Image 1") are left alone: people type those too.
 */
const MODEL_TOKEN = /<<<(image|video|audio)_(\d+)>>>|<(Picture|Video|Audio) (\d+)>|<image(\d+)>|<ref_image_(\d+)>/g;
export function chipsFromModelTokens(text: string): string {
  return String(text ?? '').replace(MODEL_TOKEN, (_m, k1?: string, n1?: string, k2?: string, n2?: string, n3?: string, n4?: string) =>
    k1 ? `@${k1.toLowerCase()}${n1}` : k2 ? `@${k2 === 'Picture' ? 'image' : k2.toLowerCase()}${n2}` : n3 ? `@image${n3}` : `@image${Number(n4) + 1}`);
}
/** True when the text holds a model's own reference tokens: it was rewritten for a model, never typed in the box (a saved draft like that is dropped). */
export const hasModelTokens = (text: unknown): boolean => typeof text === 'string' && new RegExp(MODEL_TOKEN.source).test(text);
