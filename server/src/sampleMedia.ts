/**
 * Sample media from the Blender Foundation open movies (CC BY 3.0), already in web/public/examples (see ASSETS-CREDITS.md).
 * Any job output or poster that points at one of these clips carries a visible label + credit (`sample`), so a judge never
 * mistakes a sample for a generation. Credit text and licence: docs/ATTRIBUTION.md ("Sample media").
 */
export const SAMPLE_LABEL = 'Sample · CC-BY Blender Foundation';
export interface SampleCredit { label: string; film: 'Sintel' | 'Big Buck Bunny'; credit: string; license: 'CC BY 3.0'; licenseUrl: string; sourceUrl: string; modified: string }
const FILMS = {
  Sintel: { credit: '"Sintel" © copyright Blender Foundation | durian.blender.org', sourceUrl: 'https://download.blender.org/durian/trailer/' },
  'Big Buck Bunny': { credit: '"Big Buck Bunny" © copyright Blender Foundation | peach.blender.org', sourceUrl: 'https://download.blender.org/peach/trailer/' },
} as const;
const SINTEL = ['snow', 'elder', 'heroine', 'hand', 'alley', 'ember', 'city', 'glide', 'blade', 'gaze', 'wings', 'soar', 'dunes', 'dragon', 'portrait', 'flight', 'desert'];
const BBB = ['burrow', 'giant', 'trio', 'meadow', 'stare', 'twig', 'gang', 'grin', 'forest', 'flutter', 'grump', 'bunny', 'rodents', 'squirrel'];
/** `/examples/hq-soar.mp4`, `/examples/ex-bunny.jpg` (also inside a poster URL) → credit; anything else → null. */
export function sampleFor(url?: string | null): SampleCredit | null {
  const m = /\/examples\/(?:hq|ex)-([a-z]+)\.(?:mp4|jpg|webm|png)\b/.exec(decodeURIComponent(String(url ?? '')));
  if (!m) return null;
  const film = SINTEL.includes(m[1]) ? 'Sintel' : BBB.includes(m[1]) ? 'Big Buck Bunny' : null;
  if (!film) return null;
  return { label: SAMPLE_LABEL, film, credit: FILMS[film].credit, license: 'CC BY 3.0', licenseUrl: 'https://creativecommons.org/licenses/by/3.0/', sourceUrl: FILMS[film].sourceUrl, modified: 'cropped, scaled and trimmed' };
}
