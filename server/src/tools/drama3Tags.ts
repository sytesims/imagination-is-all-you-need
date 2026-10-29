/**
 * Fish Audio Drama 3 inline control syntax, as data for the Voice tag chips (app.metaTags).
 * Source: "Fish Audio Drama 3 Technical Report", Appendix C, Table 10 "Drama 3 control syntax"
 * (https://github.com/fishaudio/fish-speech/blob/main/docs/assets/Fish_Audio_Drama_3_Technical_Report.pdf), and the
 * model card https://huggingface.co/fishaudio/drama-3 (point-tag example "[sighs] … [laughs] …").
 * The report says direction controls are free natural language: any wording works, the tags below are its examples.
 * There is no fixed SFX list. `tag` = text inserted into the script; `…` marks where the user's words go.
 */
export interface MetaTag { tag: string; label: string; category: 'point' | 'scoped' | 'style' | 'direction' | 'speaker' | 'hint' | 'pause' }
export const DRAMA3_META_TAGS: MetaTag[] = [
  // Point tags: act at their position in the text (emotion / non-verbal sounds)
  { tag: '[sighs]', label: 'Sighs', category: 'point' },
  { tag: '[laughs]', label: 'Laughs', category: 'point' },
  { tag: '[pause]', label: 'Pause', category: 'point' },
  { tag: '[gasps]', label: 'Gasps', category: 'point' },
  { tag: '[clears throat]', label: 'Clears throat', category: 'point' },
  { tag: '[hesitates]', label: 'Hesitates', category: 'point' },
  // Scoped tags: shape the enclosed words
  { tag: '<whisper>…</whisper>', label: 'Whisper', category: 'scoped' },
  { tag: '<slow>…</slow>', label: 'Slow', category: 'scoped' },
  { tag: '<emphasis>…</emphasis>', label: 'Emphasis', category: 'scoped' },
  // Style prefix: whole line
  { tag: '[with bright eager excitement] ', label: 'Excited (style)', category: 'style' },
  { tag: '[icy calm, as if you already accepted it] ', label: 'Icy calm (style)', category: 'style' },
  // Director's note: whole line
  { tag: 'Direction: …\nLine: ', label: "Director's note", category: 'direction' },
  // Structure + hints (never spoken)
  { tag: '<|speaker:0|> ', label: 'Speaker 0', category: 'speaker' },
  { tag: '<|speaker:1|> ', label: 'Speaker 1', category: 'speaker' },
  { tag: ' [language: en]', label: 'Language hint', category: 'hint' },
];
