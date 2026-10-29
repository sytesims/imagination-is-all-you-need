/**
 * Voice tag chips beyond Drama 3 (prompt grammar step 2, 2026-10-26): each voice model's own inline syntax, as data for the tag chips
 * (app.metaTagsByProvider). Sources: shared/promptGrammar.ts entries (ElevenLabs v3 prompting guide; MiniMax T2A HTTP reference).
 *  - ElevenLabs v3: audio tags in square brackets; no SSML breaks (pauses by tags, ellipses and punctuation). Free [direction] tags work.
 *  - MiniMax Speech 2.8 HD / Turbo: interjections in parentheses (a fixed list) and pauses written <#seconds#> (never two in a row).
 */
import type { MetaTag } from './drama3Tags.js';
import { DRAMA3_META_TAGS } from './drama3Tags.js';

export const ELEVEN_V3_TAGS: MetaTag[] = [
  { tag: '[laughs] ', label: 'Laughs', category: 'point' }, { tag: '[sighs] ', label: 'Sighs', category: 'point' }, { tag: '[gasps] ', label: 'Gasps', category: 'point' },
  { tag: '[clears throat] ', label: 'Clears throat', category: 'point' },
  { tag: '[whispers] ', label: 'Whispers', category: 'style' }, { tag: '[excited] ', label: 'Excited', category: 'style' }, { tag: '[sarcastic] ', label: 'Sarcastic', category: 'style' },
  { tag: '[curious] ', label: 'Curious', category: 'style' }, { tag: '[short pause] ', label: 'Short pause', category: 'pause' },
];
/** MiniMax's documented interjections (speech-2.8-hd / turbo only). */
const MM_SOUNDS: [string, string][] = [['laughs', 'Laughs'], ['chuckle', 'Chuckle'], ['sighs', 'Sighs'], ['gasps', 'Gasps'], ['coughs', 'Coughs'], ['clear-throat', 'Clears throat'],
  ['breath', 'Breath'], ['inhale', 'Inhale'], ['exhale', 'Exhale'], ['humming', 'Humming'], ['emm', 'Emm']];
export const MINIMAX_SPEECH_TAGS: MetaTag[] = [
  ...MM_SOUNDS.map(([t, label]) => ({ tag: `(${t}) `, label, category: 'point' as const })),
  { tag: '<#0.3#> ', label: 'Pause 0.3 s', category: 'pause' as const }, { tag: '<#0.8#> ', label: 'Pause 0.8 s', category: 'pause' }, { tag: '<#1.5#> ', label: 'Pause 1.5 s', category: 'pause' },
];
/** How the chips' "Your own" row works per model: square = free [direction] tags; null = only the listed tags (MiniMax's list is fixed). */
export interface MetaTagStyle { custom: 'square' | null; help: string }
export const META_TAG_STYLES: Record<string, MetaTagStyle> = {
  'comfy-drama3': { custom: 'square', help: 'Type any direction in [brackets] anywhere in the script.' },
  'api-eleven-v3': { custom: 'square', help: 'ElevenLabs v3 reads [tags] in square brackets. Pauses: a tag, "…" or punctuation (no SSML breaks).' },
  'direct-minimax-speech': { custom: null, help: 'MiniMax reads its own sounds in (parentheses) and pauses as <#seconds#>; never two pauses in a row.' },
  'direct-minimax-speech-turbo': { custom: null, help: 'MiniMax reads its own sounds in (parentheses) and pauses as <#seconds#>; never two pauses in a row.' },
};
export const META_TAGS_BY_PROVIDER: Record<string, MetaTag[]> = {
  'comfy-drama3': DRAMA3_META_TAGS, 'api-eleven-v3': ELEVEN_V3_TAGS, 'direct-minimax-speech': MINIMAX_SPEECH_TAGS, 'direct-minimax-speech-turbo': MINIMAX_SPEECH_TAGS,
};
