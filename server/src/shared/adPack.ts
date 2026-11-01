/**
 * Ad Pack (2026-10-31): a product photo (1–3), an offer line and a brand → one finished ad per picked style, in the picked platform's shape.
 * The image model paints the whole ad, words included (prompt wording per model family: shared/promptPatterns.ts tasks 'ad' and 'ad-text');
 * the brand's logo is never generated: our code puts the kit's own file in one corner afterwards, inside the platform's safe area
 * (adLogoBox here; the server composites it, adPackLogo.ts). The prompt keeps that corner empty.
 * Isomorphic, no node imports: the server (app, test) and the web (bar) share it.
 */
import { AD_PLATFORMS, AD_PLATFORM_LIST, AD_SHAPES, NO_EDGES, hasSafe, type AdPlatform, type AdShape, type Edges } from './adPlatforms.js';
import { fillPattern, familyOfProvider, type PatternFamily } from './promptPatterns.js';
import { BRAND_FONTS, colourLabel, moodBucket, moodWords, normHex, ruleWords, type BrandKit, type MoodBucket } from './brandKit.js';
import { STAMP_SIZES } from './logoStamp.js';

/** One ad style: the scene sentence (our words) and where its words go. `font` is the style's own type feel (a brand heading font replaces it). */
export interface AdStyle { value: string; label: string; description: string; scene: string; font: string; place: string; /** when both lines are there */ pair: string; /** the offer is the big line */ offerFirst?: boolean;
  /** the scene for a kit mood bucket (brandKit.ts moodBucket, 2026-11-01): concrete room, surface and light for that mood; missing = `scene` */ moods?: Partial<Record<MoodBucket, string>> }
/** The styles (2026-10-31, our own wording). Scenes follow each guide's product-photo shape: surface, light, angle, what stays sharp. */
export const AD_STYLES: AdStyle[] = [
  { value: 'studio', label: 'Studio hero', description: 'Clean backdrop, soft light',
    scene: 'The product stands centred on a seamless studio backdrop in a soft, even tone, lit by a large soft key light with a gentle floor shadow, sharp focus on the product, plenty of clean empty space around it',
    font: 'a bold, clean sans-serif', place: 'in the empty space above the product', pair: 'the second line smaller beneath the first',
    moods: { luxury: 'The product stands centred on a seamless backdrop in a single rich, quiet tone, lit by one soft key light from the side with a thin rim light tracing its edges and a soft reflection beneath it, sharp focus on the product, generous calm empty space around it',
      bold: 'The product stands centred on a seamless backdrop in one strong, saturated colour, lit by crisp, bright studio light with a clean, defined shadow, sharp focus on the product, plenty of open space around it',
      natural: 'The product stands centred on a soft, warm neutral backdrop such as linen or pale plaster, lit by gentle diffused daylight with a soft shadow, sharp focus on the product, calm empty space around it' } },
  { value: 'lifestyle', label: 'In use', description: 'A real place, natural light',
    scene: 'The product is shown in use in a real, everyday setting where it belongs, natural window light, shallow depth of field with a softly blurred background, warm and candid, the product sharp and clearly visible',
    font: 'a clean, modern sans-serif', place: 'on a calm, uncluttered part of the background', pair: 'the second line smaller beneath the first',
    moods: { luxury: 'The product rests in an elegant, upscale setting where it belongs, on fine materials such as polished stone, dark wood or brass, soft directional light, shallow depth of field with a quiet, uncluttered background, calm and refined, the product sharp and clearly visible',
      bold: 'The product is shown in use in a lively, colourful setting where it belongs, bright punchy light, a softly blurred background, energetic and fun, the product sharp and clearly visible',
      natural: 'The product is shown in use in a calm, natural setting where it belongs, on wood, linen or stone with a few green plants, soft window light, shallow depth of field, relaxed and warm, the product sharp and clearly visible' } },
  { value: 'poster', label: 'Offer poster', description: 'Bold colour, big offer',
    scene: 'A bold graphic poster: the product large and crisp against a flat, saturated background colour, strong contrast, simple confident composition with room for big type',
    font: 'a very large, heavy sans-serif', place: 'as the biggest element, close to the product', pair: 'the other line smaller above it', offerFirst: true,
    moods: { luxury: 'A refined graphic poster: the product large and crisp against a smooth single-colour background in a deep or neutral tone with a soft gradient of light, quiet contrast, simple balanced composition with room for the words',
      bold: 'A bold graphic poster: the product large and crisp against a flat, saturated background colour, strong contrast, simple confident composition with room for big type',
      natural: 'A calm graphic poster: the product large and crisp against a soft, muted earthy background colour, gentle contrast, simple balanced composition with room for the words' } },
  { value: 'flatlay', label: 'Flat lay', description: 'Top-down, neat props',
    scene: 'A top-down flat lay: the product on a textured surface with a few small complementary props neatly arranged around it, soft even daylight, crisp detail',
    font: 'a clean sans-serif', place: 'in the open space beside the product', pair: 'the second line smaller beneath the first',
    moods: { luxury: 'A top-down flat lay: the product on a smooth stone or silk surface with two or three small refined props, soft even light, crisp detail, plenty of empty space',
      bold: 'A top-down flat lay: the product on a bright, solid-colour surface with a few playful props in strong colours arranged around it, crisp even light, crisp detail',
      natural: 'A top-down flat lay: the product on linen, wood or stone with a few natural props such as leaves, dried flowers or raw paper, soft even daylight, crisp detail' } },
  { value: 'seasonal', label: 'Seasonal', description: 'Festive, gift-ready',
    scene: 'A warm festive scene: the product with seasonal props such as gift wrap and ribbon, soft fairy-light bokeh behind, cosy warm light, the product sharp in front',
    font: 'an elegant serif', place: 'in the open space above the product', pair: 'the second line smaller beneath the first',
    moods: { luxury: 'An elegant festive scene: the product with a few refined seasonal touches such as satin ribbon and soft candlelight, warm glowing bokeh behind, the product sharp in front',
      bold: 'A bright festive scene: the product with colourful seasonal props such as bold gift wrap, ribbon and confetti, cheerful light, the product sharp in front',
      natural: 'A cosy festive scene: the product with natural seasonal touches such as pine sprigs, kraft-paper wrap and twine, soft candlelight, the product sharp in front' } },
];
export const AD_STYLE_IDS = AD_STYLES.map((s) => s.value);
/** Picked when nothing is sent: three ads, one look each. */
export const AD_STYLE_DEFAULT = ['studio', 'lifestyle', 'poster'];
export const AD_TEXT_MAX = 40;
export const AD_DETAILS_MAX = 200;

/** Where the ad runs: one platform size (adPlatforms.ts), "meta-4x5". */
export interface AdPlacement { value: string; label: string; /** one word for the compact picker ("Feed", "Story", "Pin") */ short: string; platform: AdPlatform; shape: AdShape; w: number; h: number; safe: Edges }
export const AD_PLACEMENTS: AdPlacement[] = AD_PLATFORM_LIST.flatMap((p) => AD_PLATFORMS[p].sizes.map((s) => ({
  value: `${p}-${s.shape}`, label: `${AD_PLATFORMS[p].label} · ${s.name} ${AD_SHAPES[s.shape].label.replace(/ Story$/, '')}`, short: s.short ?? s.name, platform: p, shape: s.shape, w: s.w, h: s.h, safe: s.safe ?? NO_EDGES })));
export const AD_PLACEMENT_DEFAULT = 'meta-4x5';
export const placementOf = (v: string | undefined): AdPlacement => AD_PLACEMENTS.find((x) => x.value === v) ?? AD_PLACEMENTS.find((x) => x.value === AD_PLACEMENT_DEFAULT)!;
/** The shape asked of the model (1.91:1 is a 16:9 picture the Ad card crops later). */
export const AD_ASPECT: Record<AdShape, string> = { '1x1': '1:1', '4x5': '4:5', '9x16': '9:16', '16x9': '16:9', '2x3': '2:3', '191x1': '16:9' };
const SHAPE_WORDS: Record<AdShape, string> = { '1x1': 'square 1:1', '4x5': 'portrait 4:5', '9x16': 'vertical 9:16', '16x9': 'wide 16:9', '2x3': 'tall 2:3', '191x1': 'wide 16:9' };

export type AdCorner = 'tl' | 'tr' | 'bl' | 'br';
export const AD_CORNERS: { value: AdCorner; label: string }[] = [{ value: 'tl', label: 'Top left' }, { value: 'tr', label: 'Top right' }, { value: 'bl', label: 'Bottom left' }, { value: 'br', label: 'Bottom right' }];
const CORNER_WORDS: Record<AdCorner, string> = { tl: 'top-left', tr: 'top-right', bl: 'bottom-left', br: 'bottom-right' };
export const asCorner = (v: unknown): AdCorner => (['tl', 'tr', 'bl', 'br'].includes(String(v)) ? v as AdCorner : 'tl');

/** The model family whose wording an engine gets (promptPatterns 'ad'): by the provider id (shared with Camera Angles and Phone Photo). */
export const adFamilyOf = (provider?: string | null): PatternFamily => familyOfProvider(provider);
/** One line of typed words, safe inside double quotes: control characters and spaces collapsed, double quotes turned single. */
export const adWords = (x: unknown, max = AD_TEXT_MAX) => String(x ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/[“”"]/g, "'").replace(/\s+/g, ' ').trim().slice(0, max);
const sentence = (x: string) => x.replace(/[.\s]+$/, '');
const pct = (f: number) => `${Math.round(f * 100)}%`;
/** "top 14%, bottom 35% and sides 6%" ('' = the size has no covered parts). */
export function safeWords(e: Edges): string {
  if (!hasSafe(e)) return '';
  const side = e.left > 0 && e.left === e.right ? [`sides ${pct(e.left)}`] : [e.left > 0 ? `left ${pct(e.left)}` : '', e.right > 0 ? `right ${pct(e.right)}` : ''];
  const xs = [e.top > 0 ? `top ${pct(e.top)}` : '', e.bottom > 0 ? `bottom ${pct(e.bottom)}` : '', ...side].filter(Boolean);
  return xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0];
}
/** The brand's colours for the prompt (up to 3 each): `words` for most models ("gold, onyx black and ivory"), and `byRole` for FLUX, whose
 *  guide asks for hex codes tied to named things: the kit's own colour names, each with its role ("ivory background (colour #F7F1E3),
 *  gold accents (colour #C9A227) and onyx black details (colour #14110F)"), so the background colour goes on the background, not over the whole picture. */
const ROLE_WORDS: Record<string, string> = { background: 'background', text: 'lettering', primary: 'accents', secondary: 'details', accent: 'highlights', '': 'accents' };
export function adColours(kit: Pick<BrandKit, 'colors'> | null | undefined): { words: string; byRole: string } {
  const sorted = (order: string[]) => (kit?.colors ?? []).filter((c) => normHex(c.hex)).sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role)).slice(0, 3);
  const list = (xs: string[]) => xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
  const byRole = list(sorted(['background', 'primary', 'secondary', 'accent', 'text', '']).map((c) => `${colourLabel(c)} ${ROLE_WORDS[c.role] ?? ROLE_WORDS['']} (colour ${c.hex.toUpperCase()})`));
  return { words: list([...new Set(sorted(['primary', 'secondary', 'accent', '', 'background', 'text']).map(colourLabel))]), byRole };
}
/** A brand heading font as a type feel the models know (they don't know font names). */
export function brandFontFeel(kit: Pick<BrandKit, 'fonts'> | null | undefined): string | null {
  const n = kit?.fonts?.heading; if (!n) return null; const k = BRAND_FONTS.find((f) => f.name === n)?.kind;
  return k === 'serif' ? 'an elegant serif' : k === 'display' ? 'a bold display sans-serif' : k === 'mono' ? 'a clean monospaced face' : k === 'sans' ? 'a clean, bold sans-serif' : null;
}

export interface AdPromptInput {
  style: string; provider?: string | null; headline?: string; offer?: string; details?: string; placement?: string; corner?: string;
  /** extra product photos beyond the first (0–2) */ extraPhotos?: number; /** the brand in use (null = Brand off) */ kit?: Pick<BrandKit, 'colors' | 'fonts' | 'mood'> & Partial<Pick<BrandKit, 'dos' | 'donts'>> | null;
  /** a logo will be added: keep its corner empty */ logo?: boolean;
}
/** The prompt one ad sends: the family's 'ad' frame with the style's scene, the words line ('ad-text') and the brand. */
export function adPrompt(x: AdPromptInput): string {
  const st = AD_STYLES.find((s) => s.value === x.style) ?? AD_STYLES[0]; const fam = adFamilyOf(x.provider); const pl = placementOf(x.placement);
  const headline = adWords(x.headline), offer = adWords(x.offer);
  const quoted = headline && offer ? (st.offerFirst ? `the offer "${offer}" and the headline "${headline}"` : `the headline "${headline}" and the offer "${offer}"`)
    : headline ? `the headline "${headline}"` : offer ? `the offer "${offer}"` : '';
  const type = [brandFontFeel(x.kit) ?? st.font, st.place, headline && offer ? st.pair : ''].filter(Boolean).join(', ');
  const text = quoted ? fillPattern('ad-text', fam, { quoted, type }) : '';
  const col = adColours(x.kit); const mood = x.kit ? moodWords(x.kit.mood ?? '') : ''; const bucket = x.kit ? moodBucket(x.kit.mood) : null;
  const n = Math.max(0, Math.min(2, Number(x.extraPhotos) || 0));
  const more = n === 1 ? 'Image 2 shows the same product from another side.' : n === 2 ? 'Images 2 and 3 show the same product from other sides.' : '';
  const details = sentence(adWords(x.details, AD_DETAILS_MAX));
  // a mood bucket picks that mood's concrete scene (the mood is in the scene, so no "with a … feel" tail); no bucket: today's scene + the mood words
  const moodScene = bucket ? st.moods?.[bucket] : undefined;
  const scene = moodScene ? sentence(moodScene) : `${sentence(st.scene)}${mood ? `, with a ${mood} feel` : ''}`;
  // up to two of the kit's do's and don'ts (FLUX's template only takes the do's: its guide says no negatives)
  return fillPattern('ad', fam, { shape: SHAPE_WORDS[pl.shape], scene, details, text, colours: col.words, coloursByRole: col.byRole, more,
    dos: ruleWords(x.kit?.dos, 2, 'comma'), donts: ruleWords(x.kit?.donts),
    corner: x.logo ? CORNER_WORDS[asCorner(x.corner)] : '', safe: safeWords(pl.safe) });
}

/** Where the logo goes on a W × H ad: a corner, the logo 12% of the short side tall (at most a third of the width), kept inside the stamp
 *  margin (shared/logoStamp.ts, 4.5% of the short side) and inside the platform's safe area, whichever is further in. Whole pixels. */
export function adLogoBox(W: number, H: number, corner: AdCorner, logo: { w: number; h: number }, safe: Edges = NO_EDGES): { x: number; y: number; w: number; h: number } {
  const S = Math.min(W, H); const m = Math.max(4, Math.round(S * 0.045));
  let h = S * STAMP_SIZES.M, w = logo.h > 0 ? h * (logo.w / logo.h) : h; if (w > W / 3) { h *= (W / 3) / w; w = W / 3; }
  w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
  const l = Math.max(m, Math.ceil(safe.left * W)), r = Math.max(m, Math.ceil(safe.right * W)), t = Math.max(m, Math.ceil(safe.top * H)), b = Math.max(m, Math.ceil(safe.bottom * H));
  return { x: corner[1] === 'l' ? l : W - r - w, y: corner[0] === 't' ? t : H - b - h, w, h };
}
