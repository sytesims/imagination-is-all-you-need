/**
 * Prompt references, step 2 of the prompt grammar (2026-10-26): ONE rewrite every prompt builder uses, so each model reads its inputs in its own
 * syntax (shared/promptGrammar.ts). Isomorphic (no node imports): the server runs it before a body is built, the web shows the same result.
 *
 *  - Composer chips (@image1, @img2, @video1, @Video 1, @audio1) become the model's token for that input: <<<image_1>>> (Kling), Image 1
 *    (Seedance, hosted MiniMax H3, Wan 3.0), <Picture 1> (local H3), <ref_image_0> (local FLUX 3 Klein, zero-based), <image1> (Qwen 2.1)…
 *  - Plain numbered words our own templates write ("image 2", "Picture 1", "video 1", "audio 1") get the same token when the model's token is
 *    different and that input exists. Words already in the model's form, and tokens already there, are left alone (never double-tagged).
 *  - Models that can't name inputs (Veo, LTX-2, Wan Fun Camera…) get plain words instead of a dangling "@image1".
 *  - appendUnnamed: inputs the prompt never names are listed at the end, the model's way (tag models only; Kling did this already).
 *  - promptLimitIssue: the model's (or route's) character cap, so an over-long prompt is refused with a message instead of cut.
 */
import { promptGrammarOf, refToken } from './promptGrammar.js';

export type RefKind = 'image' | 'video' | 'audio';
export interface RefCounts { image?: number; video?: number; audio?: number }
const KINDS: RefKind[] = ['image', 'video', 'audio'];
const kindOf = (w: string): RefKind => (/^(image|img|picture)$/i.test(w) ? 'image' : /^video$/i.test(w) ? 'video' : 'audio');

/** Composer chips: @image1 / @img1 / @Image 1 / @video / @video2 / @audio1. A bare "@image" is not a reference (shared/mentions.ts); bare @video / @audio = 1. */
const MENTION = /@(image|img|video|audio)(?: ?(\d+))?(?![\w?])/gi;
/** Plain numbered words, never inside a token (<image1>, <<<image_1>>>, <Picture 1>, @Image1, <ref_image_0>). */
const WORDS = /(?<![<@_\w])(image|picture|video|audio) ?(\d+)(?![>_\w])/gi;

/** Words for a model that can't name its inputs (refs.style none). */
const plainWords = (kind: RefKind, n: number, total: number) => (kind === 'image' ? (total > 1 ? `subject ${n}` : 'the subject') : kind === 'video' ? (total > 1 ? `video ${n}` : 'the source video') : (total > 1 ? `audio ${n}` : 'the audio'));

/** Rewrites one prompt for a model (and a place: 'router', 'fal', 'replicate', 'direct', 'local'). Unknown model → unchanged. */
export function applyRefGrammar(prompt: string, model: string | null | undefined, counts: RefCounts = {}, place?: string): string {
  const text = String(prompt ?? ''); const e = promptGrammarOf(model); if (!e || !text) return text;
  const none = e.refs.style === 'none' || e.refs.style === 'unknown';
  const out = text.replace(MENTION, (raw, w: string, num?: string) => {
    const kind = kindOf(w); const n = num ? Number(num) : 1; if (!(n >= 1)) return raw;
    if (w.toLowerCase() === 'image' || w.toLowerCase() === 'img') { if (!num) return raw; }
    const tok = refToken(e.key, kind, n, place);
    if (tok) return tok;
    return none ? plainWords(kind, n, counts[kind] ?? 1) : `${kind} ${n}`;
  });
  if (none) return out;
  return out.replace(WORDS, (raw, w: string, num: string) => {
    const kind = kindOf(w); const n = Number(num); const have = counts[kind] ?? 0;
    if (!(n >= 1) || n > have) return raw; // only inputs that exist: "image 3" with two images stays words
    const tok = refToken(e.key, kind, n, place); if (!tok || tok.toLowerCase() === raw.toLowerCase()) return raw;
    return tok;
  });
}

/** Which inputs a (rewritten) prompt names, per kind (1-based as the user counts). */
export function namedRefs(prompt: string, model: string, place?: string): Record<RefKind, Set<number>> {
  const named: Record<RefKind, Set<number>> = { image: new Set(), video: new Set(), audio: new Set() };
  for (const kind of KINDS) for (let n = 1; n <= 64; n++) { const tok = refToken(model, kind, n, place); if (!tok) break; if (prompt.includes(tok)) named[kind].add(n); }
  return named;
}
const LABEL: Record<RefKind, string> = { image: 'Reference images', video: 'Reference videos', audio: 'Reference audio' };
const clause = (s: string) => s.trim().replace(/[.\s]+$/, '');
/** Tag models (Kling, local H3, Qwen 2.1, FLUX 3 Klein…): lists the inputs the prompt never names, at the end, so every one is used. Others: unchanged. */
export function appendUnnamed(prompt: string, model: string, counts: RefCounts, place?: string): string {
  const e = promptGrammarOf(model); if (!e) return prompt;
  const p = place ? e.places?.find((x) => x.route === place || x.route.startsWith(place))?.refs : undefined; if ((p?.style ?? e.refs.style) !== 'tag') return prompt;
  const named = namedRefs(prompt, model, place); const parts: string[] = [];
  for (const kind of KINDS) { const miss: string[] = []; for (let n = 1; n <= (counts[kind] ?? 0); n++) if (!named[kind].has(n)) { const t = refToken(model, kind, n, place); if (t) miss.push(t); }
    if (miss.length) parts.push(`${LABEL[kind]}: ${miss.join(', ')}`); }
  return parts.length ? `${clause(prompt)}. ${parts.join('. ')}.` : prompt;
}

/** Models whose body lists the refs the prompt never names (routing/routerModels.ts klingRefPrompt); the prompt peek shows the same. */
export const APPENDS_UNNAMED = new Set(['kling-v3']);
/** Inputs a job carries, per kind (the same lists the bodies send). */
export function refCountsOf(i: Record<string, any>): RefCounts {
  const len = (x: unknown) => (Array.isArray(x) ? x.filter((p) => typeof p === 'string' && p).length : 0);
  const image = len(i.refPaths) || (typeof i.imagePath === 'string' && i.imagePath ? 1 : 0);
  const video = len(i.refVideoPaths) + (typeof i.videoPath === 'string' && i.videoPath ? 1 : 0);
  const audio = len(i.refAudioPaths) + (typeof i.speechPath === 'string' && i.speechPath ? 1 : 0);
  return { image, video, audio };
}
/** The prompt fields a body may read (routerModels promptOf, providers' promptOf, local plans). */
const TEXT_FIELDS = ['prompt', 'finalPrompt', 'hostedPrompt', 'enhancedPrompt', 'text', 'comfyPrompt', 'appPrompt' /* an app's own words sent alone: Image to layers, Expand */] as const;
/** A copy of a job's input with every prompt field rewritten for the model (shots too). The job itself is never changed (it keeps what the user typed). */
export function withRefGrammar<T extends Record<string, any>>(i: T, model: string | null | undefined, place?: string): T {
  if (!i || !promptGrammarOf(model)) return i; const counts = refCountsOf(i); const out: Record<string, any> = { ...i };
  for (const f of TEXT_FIELDS) if (typeof i[f] === 'string' && i[f]) out[f] = applyRefGrammar(i[f], model, counts, place);
  if (Array.isArray(i.shots)) out.shots = i.shots.map((s: any) => (s && typeof s.prompt === 'string' ? { ...s, prompt: applyRefGrammar(s.prompt, model, counts, place) } : s));
  // Re-shoot: an angle described in words is the user's prompt (tools/reshoot.ts promptOnly), sent as the camera text
  if (Array.isArray(i.angles)) out.angles = i.angles.map((a: any) => (a && typeof a.angle === 'string' && !a.preset ? { ...a, angle: applyRefGrammar(a.angle, model, counts, place) } : a));
  return out as T;
}

/** Character caps a route sets below the model's own (the lab API's limit on that route). */
export const ROUTE_PROMPT_CAPS: Record<string, number> = { 'direct:minimax/h3': 7000, 'direct:direct-minimax-image': 1500 };
/** The cap for a model on a route (the lower of the two), or null. */
export const promptCap = (model: string | null | undefined, routeId?: string | null): number | null => {
  const m = promptGrammarOf(model)?.limits?.maxChars ?? null; const r = routeId ? ROUTE_PROMPT_CAPS[routeId] ?? null : null;
  return m != null && r != null ? Math.min(m, r) : m ?? r;
};
/** The model's own cap is one the provider cuts at instead of refusing (Wan 3.0), and no lower route cap applies. */
const providerCutsAt = (model: string | null | undefined, routeId?: string | null): number | null => {
  const L = promptGrammarOf(model)?.limits; if (!L?.providerCuts || L.maxChars == null) return null;
  const r = routeId ? ROUTE_PROMPT_CAPS[routeId] ?? null : null; return r != null && r < L.maxChars ? null : L.maxChars;
};
/** Why this prompt is too long for the model on this route (null = fine). A provider that cuts instead of refusing never blocks (promptCutNote warns). */
export function promptLimitIssue(model: string | null | undefined, text: string, routeId?: string | null): string | null {
  const cap = promptCap(model, routeId); const n = String(text ?? '').length; if (cap == null || n <= cap) return null;
  if (providerCutsAt(model, routeId) != null) return null;
  const name = promptGrammarOf(model)?.name ?? 'This model';
  return `${name} takes prompts up to ${cap.toLocaleString('en-US')} characters; yours is ${n.toLocaleString('en-US')}. Shorten it or pick another model`;
}
/** Over the cap of a provider that cuts (Wan 3.0): the short warning shown on the quote and the job; null = fits, or the cap refuses instead. */
export function promptCutNote(model: string | null | undefined, text: string, routeId?: string | null): string | null {
  const cap = providerCutsAt(model, routeId); const n = String(text ?? '').length; if (cap == null || n <= cap) return null;
  const name = promptGrammarOf(model)?.name ?? 'This model';
  return `${name} reads the first ${cap.toLocaleString('en-US')} characters of a prompt; yours is ${n.toLocaleString('en-US')}, so the end will be cut.`;
}
