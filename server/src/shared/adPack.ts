/**
 * Ad Pack (2026-10-31): a product photo (1–3), an offer line and a brand → one finished ad per picked style, in the picked platform's shape.
 * The image model paints the whole ad, words included (prompt wording per model family: shared/promptPatterns.ts tasks 'ad' and 'ad-text');
 * the brand's logo is never generated: our code puts the kit's own file in one corner afterwards, inside the platform's safe area
 * (adLogoBox here; the server composites it, adPackLogo.ts). The prompt keeps that corner empty.
 * Isomorphic, no node imports: the server (app, test) and the web (bar) share it.
 */
import { AD_PLATFORMS, AD_PLATFORM_LIST, AD_SHAPES, NO_EDGES, hasSafe, type AdPlatform, type AdShape, type Edges } from './adPlatforms.js';
import { fillPattern, type PatternFamily } from './promptPatterns.js';
import { BRAND_FONTS, colourLabel, moodBucket, moodWords, normHex, ruleWords, type BrandKit, type MoodBucket } from './brandKit.js';
import { STAMP_SIZES, STAMP_DEFAULTS, type StampSettings } from './logoStamp.js';

/** One ad style: the kind of picture, its scene sentence (our words) and where its words go. `font` is the style's own type feel (a brand heading
 *  font replaces it). Style first, brand second (2026-11-01): the kind and scene lead every prompt; the kit's colours and rules come after as
 *  constraints, and a kit rule that would undo the style (`clash`, e.g. "lots of calm space" on an In use photo) is left out for that style. */
export interface AdStyle { value: string; label: string; description: string;
  /** the kind of picture, said first ("a candid lifestyle photo"), so a shared kit can't turn every style into the same product shot */ kind: string;
  scene: string; font: string; place: string; /** when both lines are there */ pair: string; /** the offer is the big line */ offerFirst?: boolean;
  /** what this style is not (said after the scene; not for FLUX, whose guide is positive-only) */ unlike?: string;
  /** how the brand colours are used in this style ("as the poster's flat colour blocks") */ colourUse: string;
  /** kit do / don't lines this style leaves out because they'd undo it */ clash?: RegExp;
  /** the scene for a kit mood bucket (brandKit.ts moodBucket, 2026-11-01): the mood tints the style (room, surface, light, palette), never replaces it; missing = `scene` */ moods?: Partial<Record<MoodBucket, string>> }
/** Kit rules about empty space, and about plain or quiet backgrounds: right for a studio hero, wrong for a lived-in photo or a full poster. */
const SPACE_RULE = /\b(space|empty|emptiness|minimal\w*|airy|breathing room)\b/i;
const BUSY_RULE = /\b(busy|clutter\w*|plain|backgrounds?|backdrops?)\b/i;
/** The styles (2026-10-31, our own wording; reworked 2026-11-01 so each stays its own kind of picture under any kit). */
export const AD_STYLES: AdStyle[] = [
  { value: 'studio', label: 'Studio hero', description: 'Clean backdrop, soft light', kind: 'a clean studio product photo',
    scene: 'The product stands centred on a seamless studio backdrop in a soft, even tone, lit by a large soft key light with a gentle floor shadow, sharp focus on the product, plenty of clean empty space around it',
    font: 'a bold, clean sans-serif', place: 'in the empty space above the product', pair: 'the second line smaller beneath the first', colourUse: 'on the backdrop and in the light',
    moods: { luxury: 'The product stands centred on a seamless backdrop in a single rich, quiet tone, lit by one soft key light from the side with a thin rim light tracing its edges and a soft reflection beneath it, sharp focus on the product, generous calm empty space around it',
      bold: 'The product stands centred on a seamless backdrop in one strong, saturated colour, lit by crisp, bright studio light with a clean, defined shadow, sharp focus on the product, plenty of open space around it',
      natural: 'The product stands centred on a soft, warm neutral backdrop such as linen or pale plaster, lit by gentle diffused daylight with a soft shadow, sharp focus on the product, calm empty space around it' } },
  { value: 'lifestyle', label: 'In use', description: 'A real moment, natural light', kind: 'a candid lifestyle photo of the product in use',
    scene: 'A real moment of use: a person\'s hand holds, opens or uses the product in the everyday place where it belongs, warm natural window light, shallow depth of field with a softly blurred, lived-in background, the product sharp, clearly visible and filling a good part of the frame',
    font: 'a clean, modern sans-serif', place: 'on a calm part of the picture', pair: 'the second line smaller beneath the first', colourUse: 'as accents in the setting and the light',
    unlike: 'a product alone on an empty backdrop', clash: new RegExp(`${SPACE_RULE.source}|${BUSY_RULE.source}`, 'i'),
    moods: { luxury: 'A real moment of use: a well-groomed hand reaches for or uses the product on an upscale vanity or dressing table where it belongs, polished stone and a few refined personal objects around it, warm golden-hour light through a window, shallow depth of field, warm and intimate, the product sharp, clearly visible and filling a good part of the frame',
      bold: 'A real moment of use: a person uses the product in a lively, colourful place where it belongs, bright punchy light, energetic and fun, a softly blurred background, the product sharp, clearly visible and filling a good part of the frame',
      natural: 'A real moment of use: a hand holds or uses the product in a calm home setting where it belongs, wood, linen and a few green plants around it, soft window light, shallow depth of field, relaxed and warm, the product sharp, clearly visible and filling a good part of the frame' } },
  { value: 'poster', label: 'Offer poster', description: 'Graphic layout, big offer', kind: 'a flat graphic design poster',
    scene: 'A graphic poster layout: bold flat colour blocks and large simple shapes, the product cut out cleanly and placed as a design element, strong contrast, a confident layout built around big type',
    font: 'a very large, heavy sans-serif', place: 'as the biggest element of the design, set on a colour block', pair: 'the other line smaller above it', offerFirst: true,
    colourUse: 'as the poster\'s flat colour blocks and shapes', unlike: 'a photograph of a room or a tabletop', clash: SPACE_RULE,
    moods: { luxury: 'A refined graphic poster layout: flat fields of deep colour divided by one large, clean geometric shape such as an arch, a circle or a broad band, a few fine thin lines, the product cut out cleanly and placed as a design element, balanced and elegant',
      bold: 'A loud graphic poster layout: clashing flat colour blocks, oversized shapes and stripes, the product cut out cleanly and placed as a design element, maximum contrast, an energetic layout built around huge type',
      natural: 'A calm graphic poster layout: soft muted flat colour blocks and gentle organic shapes such as arches and pebbles, a subtle paper texture, the product cut out cleanly and placed as a design element, balanced and quiet' } },
  { value: 'flatlay', label: 'Flat lay', description: 'Top-down, neat props', kind: 'a top-down flat-lay photo',
    scene: 'A top-down flat lay: the product on a textured surface with a few small complementary props neatly arranged around it, soft even daylight, crisp detail',
    font: 'a clean sans-serif', place: 'in the open space beside the product', pair: 'the second line smaller beneath the first', colourUse: 'on the surface and the props',
    moods: { luxury: 'A top-down flat lay: the product on a smooth stone or silk surface with two or three small refined props, soft even light, crisp detail, plenty of empty space',
      bold: 'A top-down flat lay: the product on a bright, solid-colour surface with a few playful props in strong colours arranged around it, crisp even light, crisp detail',
      natural: 'A top-down flat lay: the product on linen, wood or stone with a few natural props such as leaves, dried flowers or raw paper, soft even daylight, crisp detail' } },
  { value: 'seasonal', label: 'Seasonal', description: 'Festive, gift-ready', kind: 'a festive product photo',
    scene: 'A warm festive scene: the product with seasonal props such as gift wrap and ribbon, soft fairy-light bokeh behind, cosy warm light, the product sharp in front',
    font: 'an elegant serif', place: 'in the open space above the product', pair: 'the second line smaller beneath the first', colourUse: 'in the wrapping and the decorations',
    clash: SPACE_RULE,
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

/** The model family whose wording an engine gets (promptPatterns 'ad'): by the provider id. */
export function adFamilyOf(provider?: string | null): PatternFamily {
  const p = String(provider ?? '');
  return /^(api-gpt-image|direct-openai)/.test(p) ? 'gpt-image' : /^(api-nano-banana|direct-gemini)/.test(p) ? 'nano-banana' : /flux|klein/.test(p) ? 'flux'
    : /^comfy-qwen|^api-qwen-image/.test(p) ? 'qwen-edit' : 'any';
}
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
/** The prompt one ad sends: the family's 'ad' frame with the style's kind and scene first, the words line ('ad-text'), then the brand as constraints. */
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
  // a mood bucket tints the style's scene (the mood is in the scene, so no "with a … feel" tail); no bucket: the plain scene + the mood words
  const moodScene = bucket ? st.moods?.[bucket] : undefined;
  const scene = moodScene ? sentence(moodScene) : `${sentence(st.scene)}${mood ? `, with a ${mood} feel` : ''}`;
  // the kit's rules, minus any that would undo this style; up to two of each (FLUX's template only takes the do's: its guide says no negatives)
  const fits = (xs?: string[]) => (xs ?? []).filter((r) => !st.clash?.test(r));
  return fillPattern('ad', fam, { shape: SHAPE_WORDS[pl.shape], kind: st.kind, Kind: st.kind[0].toUpperCase() + st.kind.slice(1), scene, unlike: st.unlike ?? '', details, text,
    colours: col.words ? `${col.words}, ${st.colourUse}` : '', coloursByRole: col.byRole, more,
    dos: ruleWords(fits(x.kit?.dos), 2, 'comma'), donts: ruleWords(fits(x.kit?.donts)),
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

/** Adjust logo (2026-11-01): the viewer's logo tool set to where Ad Pack put the logo (job.input.adLogo), so opening it shows no jump: the
 *  same corner, the medium size (adLogoBox is 12% of the short side = STAMP_SIZES.M), full opacity, no text line, no plate, and the
 *  platform's safe area kept clear. The light / dark logo is picked by the brightness behind it, by the same rule on both sides. */
export function adLogoStamp(adLogo: { corner?: unknown; placement?: string } | null | undefined): { settings: StampSettings; inset: Edges } {
  return { settings: { ...STAMP_DEFAULTS, spot: asCorner(adLogo?.corner), size: 'M', opacity: 1, textOn: false, text: '', backing: 'off' }, inset: placementOf(adLogo?.placement).safe };
}
