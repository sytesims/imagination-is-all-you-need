/**
 * Pictures for the e-commerce pop-up book: one slot per picture, mapped to its image URL. null = the page draws a hatched placeholder
 * with the slot's caption. To drop in a real picture made in the app: save it as web/public/learn/ecom/<slot>.webp (long side ≤ 1200,
 * same origin, so the page can draw it) and set its entry to '/learn/ecom/<slot>.webp'. What to make for each slot (prompt, model,
 * size, cost) is listed in docs/learn/ecom-book-art-list.md.
 */
export type ArtSlot = 'ch1-reference' | 'ch2-plinth' | 'ch2-white' | 'ch3-kitchen' | 'ch4-slab' | 'ch4-towel' | 'ch4-palm' | 'ch5-poster' | 'ch6-still' | 'ch7-cover' | 'ch8-a' | 'ch8-b';

export const ECOM_ART: Record<ArtSlot, string | null> = {
  'ch1-reference': null,
  'ch2-plinth': null,
  'ch2-white': null,
  'ch3-kitchen': null,
  'ch4-slab': null,
  'ch4-towel': null,
  'ch4-palm': null,
  'ch5-poster': null,
  'ch6-still': null,
  'ch7-cover': null,
  'ch8-a': null,
  'ch8-b': null,
};

/** What each picture shows (the placeholder caption, and the alt text once the picture is in). */
export const ART_CAPTION: Record<ArtSlot, string> = {
  'ch1-reference': 'Serum bottle on white paper',
  'ch2-plinth': 'On a peach plinth',
  'ch2-white': 'Listing shot on white',
  'ch3-kitchen': 'On a kitchen counter',
  'ch4-slab': 'Brand look: stone slab',
  'ch4-towel': 'Brand look: towel',
  'ch4-palm': 'Brand look: in a hand',
  'ch5-poster': 'Poster with headline',
  'ch6-still': 'First frame of the clip',
  'ch7-cover': 'Cover for the music bed',
  'ch8-a': 'Version A (peach)',
  'ch8-b': 'Version B (sage)',
};
