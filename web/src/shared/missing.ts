/** B31 (pb/hw2): when only one input is missing, the server's own sentence for it ('Add an image.', 'Add a video.', 'Add a product photo.');
 *  more than one keeps the 'Missing: a, b' line.
 *  B33 (BH H): never put 'Missing:' in front of a sentence that already says what to do. */
const ONE: [RegExp, string][] = [
  [/^an? (valid |source |input )?(image|photo|picture)$/i, 'Add an image.'],
  [/^an? (valid |source |input )?(video|clip)$/i, 'Add a video.'],
  [/^an? product photo$/i, 'Add a product photo.'],
];
const isSentence = (x: string) => /^(Add|Pick|Record|Upload|Drop|Choose|Select|Describe|Enter|Type|Set|Hold|Shorten) /i.test(x);
export const singleMissing = (b: string[]): string | null => {
  if (b.length !== 1) return null;
  const x = String(b[0]).trim();
  if (isSentence(x)) return /[.!?]$/.test(x) ? x : `${x}.`;
  for (const [re, to] of ONE) if (re.test(x)) return to;
  return null;
};
export const missingText = (b: string[]): string => {
  const one = singleMissing(b);
  if (one) return one;
  if (b.every(isSentence)) return b.join(' ');
  if (b.some(isSentence)) {
    const nouns = b.filter(x => !isSentence(x));
    const acts = b.filter(isSentence);
    return nouns.length ? `Missing: ${nouns.join(', ')} · ${acts.join(' ')}` : acts.join(' ');
  }
  return `Missing: ${b.join(', ')}`;
};
/** Generate's few words for a long sentence: its first clause, at most ~5 words (the full sentence is the title and a row in "Before you generate"). Video and Audio bars. */
export function firstWords(t: string): string { const c = String(t).split(/[.;:(]|, (?:or|and|so|but) /)[0].trim(); const w = c.split(/\s+/); return w.length > 6 ? `${w.slice(0, 5).join(' ')}…` : c; }
