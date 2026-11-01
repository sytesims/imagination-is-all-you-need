/**
 * Prompt tips (prompt grammar step 2, 2026-10-26): the plain-words view of shared/promptGrammar.ts that the model hover cards, the reference
 * chips, the prompt enhancer and the MCP describe all show. Isomorphic, no imports beyond the data. Short lines, our own words.
 */
import { promptGrammarOf, refToken, type PromptGrammar } from './promptGrammar.js';

export interface PromptTip {
  key: string;
  /** How the model reads attached inputs, one line. */ refs: string;
  /** "Up to 2,500 characters", or null. */ limit: string | null;
  /** Negative prompt in one line, or null when there's nothing to say. */ negative: string | null;
  /** "Starts with: crossview." (LoRA trigger words), or null. */ triggers: string | null;
  /** Up to two model-specific syntax notes. */ extras: string[];
  /** Recommended order of the prompt's parts. */ structure: string;
  /** One short example (ours). */ example: string;
  /** No text prompt at all on this model. */ noPrompt: boolean;
}
const KIND_WORD = { image: 'photo', video: 'video', audio: 'audio clip' } as const;
const fmt = (n: number) => n.toLocaleString('en-US');

/** The one-line reference rule: what @image1 becomes, or how to name inputs when the model has no tokens. */
export function refsLine(e: PromptGrammar, place?: string): string {
  const r = { ...e.refs, ...(place ? e.places?.find((x) => x.route === place || x.route.startsWith(place))?.refs ?? {} : {}) };
  if (e.prompt === 'none') return 'No prompt: it works from your input only.';
  if (r.style === 'unknown') return 'How it reads references isn\'t documented yet.';
  if (r.style === 'none') return r.frames ? 'Your photo is the start frame; it can\'t be named. Describe the subject in words.' : 'Takes no reference inputs. Describe everything in words.';
  const toks = (['image', 'video', 'audio'] as const).map((k) => { const t = refToken(e.key, k, 1, place); return t ? `@${k}1 as ${t}` : null; }).filter(Boolean) as string[];
  if (r.style === 'order') return `Reads photos in the order you add them. Say what each is for ("the jacket from image 2").`;
  const zero = r.base === 0 ? ' (counts from 0)' : '';
  return `${toks.join(', ').replace(' as ', ' is sent as ')}${zero}.`; // "@image1 is sent as <<<image_1>>>, @video1 as …"
}
/** The tip for one model (null for an unknown key). `place` = a route kind ('router', 'fal', 'local', 'direct', 'replicate'). */
export function promptTipOf(key: string | null | undefined, place?: string): PromptTip | null {
  const e = promptGrammarOf(key); if (!e) return null;
  const max = e.limits?.maxChars; const limit = max ? `Up to ${fmt(max)} characters` : null;
  const negative = e.prompt === 'none' ? null : e.negative === 'field' ? 'Has a separate "avoid" box' : e.negative === 'in-prompt' ? 'No avoid box: write what to leave out in the prompt' : e.negative === 'none' ? 'No avoid box: describe what you want instead' : null;
  const triggers = e.triggers?.length ? `Starts with: ${e.triggers.join(' / ')}` : null;
  return { key: e.key, refs: refsLine(e, place), limit, negative, triggers, extras: (e.special ?? []).slice(0, 2), structure: e.structure, example: e.example, noPrompt: e.prompt === 'none' };
}
/** A reference chip's tooltip on this model: "Photo 2 · sent as <<<image_2>>>", or how the model uses it when it can't be named. */
export function refChipTip(key: string | null | undefined, kind: 'image' | 'video' | 'audio', n: number, place?: string): string {
  const base = `${KIND_WORD[kind][0].toUpperCase()}${KIND_WORD[kind].slice(1)} ${n} · @${kind}${n}`;
  const e = promptGrammarOf(key); if (!e) return base;
  const max = kind === 'image' ? e.refs.maxImages : kind === 'video' ? e.refs.maxVideos : e.refs.maxAudio;
  if (max != null && max > 0 && n > max) return `${base} · ${e.name} takes ${max}; this one isn't sent`;
  if (e.refs.style === 'order') return `${base} · ${e.name} reads it by order`;
  const t = refToken(e.key, kind, n, place);
  if (t) return `${base} · ${e.name} reads it as ${t}`;
  return `${base} · ${e.name} can't name it: describe it in words`;
}
/** The guidance the prompt enhancer writes into: structure, syntax and triggers, as one short paragraph (no examples, no URLs). */
export function enhancerGuide(key: string | null | undefined, place?: string): string | null {
  const t = promptTipOf(key, place); const e = promptGrammarOf(key); if (!t || !e || t.noPrompt) return null;
  return [`Target model: ${e.name}.`, `Structure: ${t.structure}`, `References: ${t.refs}`, t.triggers ? `${t.triggers} (keep it first).` : '', t.extras.length ? `Syntax: ${t.extras.join('; ')}.` : '',
    t.limit ? `${t.limit}.` : '', t.negative ? `${t.negative}.` : ''].filter(Boolean).join(' ');
}
