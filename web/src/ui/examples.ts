/** Example media in /public/examples (CC-BY 3.0 Blender open movies; see ASSETS-CREDITS.md). Clean 1–3 s loops, mixed aspect ratios. */
export interface Example { id: string; src: string; poster: string; title: string; ratio?: string }
const ids: [string, string, string][] = [
  ['alley', 'Alley chase', '16/9'], ['heroine', 'Heroine portrait', '3/4'], ['burrow', 'Meadow burrow', '1/1'], ['wings', 'Dragon dive', '9/16'],
  ['city', 'Ruined city', '16/9'], ['elder', 'Elder close-up', '4/5'], ['giant', 'Gentle giant', '3/4'], ['gaze', 'Firelit gaze', '1/1'],
  ['snow', 'Snow trek', '16/9'], ['flutter', 'Butterfly', '4/5'], ['blade', 'Sky blade', '3/4'], ['stare', 'Stand-off', '1/1'],
  ['dunes', 'Dune pan', '16/9'], ['ember', 'Ember flight', '9/16'], ['grin', 'Rascal grin', '3/4'], ['hand', 'Snow hand', '1/1'],
  ['soar', 'Soaring', '16/9'], ['glide', 'Glide', '4/5'], ['twig', 'Twig', '9/16'], ['grump', 'Grump', '1/1'],
  ['gang', 'Forest gang', '16/9'], ['meadow', 'Meadow morning', '4/5'], ['forest', 'Forest floor', '16/9'], ['trio', 'Rodent trio', '16/9'],
];
export const EXAMPLES: Example[] = ids.map(([id, title, ratio]) => ({ id, title, ratio, src: `/examples/hq-${id}.mp4`, poster: `/examples/hq-${id}.jpg` }));
const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
/** Deterministic example for any key (tool id, preset id…). Uses previewUrl first when the registry provides one. */
const IMG = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i;
/** Registry media wins: an image URL becomes the poster, a video URL the loop; the other half falls back to a bundled example. */
const merge = (fb: Example, id: string, url?: string | null): Example => !url ? fb : IMG.test(url) ? { ...fb, id, poster: url } : { ...fb, id, src: url };
/** Deterministic example for any key (tool id, preset id…). Pass posterUrl ?? previewUrl. */
export const exampleFor = (key: string, previewUrl?: string | null): Example => merge(EXAMPLES[hash(key) % EXAMPLES.length], key, previewUrl);
/** Example by position in a list, so neighbours never repeat. */
export const exampleAt = (i: number, previewUrl?: string | null, offset = 0): Example => merge(EXAMPLES[(i + offset) % EXAMPLES.length], String(i), previewUrl);
