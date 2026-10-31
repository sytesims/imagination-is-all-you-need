/**
 * Brand Kit (2026-10-27): one place to define your brand. A kit = name, colours (hex + name + role), two fonts (names, plus the font files
 * kept on this computer: uploaded or downloaded once from Google Fonts), a mood line, do / don't lines, a logo set (main, light, dark, icon;
 * 2026-10-31) and up to 3 example results. It (a) keeps what you make on-brand: with "Brand: <name>" on,
 * the server adds one short phrase to the prompt (brandPhrase, the ONE helper every tool uses) and (b) exports as an open W3C Design Tokens
 * file (tokensOf), CSS variables, a Tailwind theme and a plain hex list.
 * Isomorphic, no imports: the server (store, validation, prompt, exports) and the web (Assets › Brand, the chip, the exports) share it.
 */

export type BrandRole = 'primary' | 'secondary' | 'accent' | 'background' | 'text' | '';
export const BRAND_ROLES: Exclude<BrandRole, ''>[] = ['primary', 'secondary', 'accent', 'background', 'text'];
export interface BrandColor { hex: string; name: string; role: BrandRole }
export interface BrandFonts { heading: string; body: string }
export interface BrandMedia { url: string; mime: string }
/** The logo set: main (your usual logo), light (for dark backgrounds), dark (for light backgrounds), icon (a small square mark). */
export type LogoSlot = 'main' | 'light' | 'dark' | 'icon';
export const LOGO_SLOTS: LogoSlot[] = ['main', 'light', 'dark', 'icon'];
export type BrandLogos = Record<LogoSlot, BrandMedia | null>;
export type FontRole = 'heading' | 'body';
export type FontFormat = 'truetype' | 'opentype' | 'woff' | 'woff2';
/** A font file kept on this computer (DATA_DIR/brand-fonts/<kit>/). Uploaded files cover every weight (weight 0); Google Fonts downloads are 400 and 700. */
export interface BrandFontFile { family: string; role: FontRole; weight: number; url: string; file: string; format: FontFormat; source: 'upload' | 'google'; licence: string; sourceUrl?: string }
export interface BrandKit {
  id: string; name: string; colors: BrandColor[]; fonts: BrandFonts; mood: string; dos: string[]; donts: string[];
  /** = logos.main (kept for older readers) */ logo: BrandMedia | null; logos: BrandLogos; fontFiles: BrandFontFile[];
  /** up to 3 picked results (image URLs) for the brand sheet */ examples: string[];
  /** the app's own kit (read-only, always first) */ builtIn?: boolean; createdAt: string; updatedAt: string;
}
export type BrandMediaKind = 'image' | 'video' | 'audio';

export const BRAND_LIMITS = { kits: 50, name: 60, colors: 12, colorName: 40, mood: 300, line: 160, lines: 10, examples: 3, font: 60, fontMB: 10 } as const;

/** Open fonts the app already loads (Manrope, Inter, Space Grotesk, JetBrains Mono) first, then common Google Fonts. Names only: nothing is bundled. */
export const BRAND_FONTS: { name: string; kind: 'sans' | 'serif' | 'display' | 'mono'; inApp?: boolean }[] = [
  { name: 'Manrope', kind: 'sans', inApp: true }, { name: 'Space Grotesk', kind: 'display', inApp: true }, { name: 'Inter', kind: 'sans', inApp: true }, { name: 'JetBrains Mono', kind: 'mono', inApp: true },
  { name: 'Roboto', kind: 'sans' }, { name: 'Open Sans', kind: 'sans' }, { name: 'Lato', kind: 'sans' }, { name: 'Montserrat', kind: 'sans' }, { name: 'Poppins', kind: 'sans' },
  { name: 'Work Sans', kind: 'sans' }, { name: 'DM Sans', kind: 'sans' }, { name: 'Nunito', kind: 'sans' }, { name: 'IBM Plex Sans', kind: 'sans' },
  { name: 'Playfair Display', kind: 'serif' }, { name: 'Lora', kind: 'serif' }, { name: 'Merriweather', kind: 'serif' }, { name: 'Fraunces', kind: 'serif' }, { name: 'DM Serif Display', kind: 'serif' },
  { name: 'Oswald', kind: 'display' }, { name: 'Bebas Neue', kind: 'display' },
];
const FALLBACK: Record<string, string> = { sans: 'sans-serif', display: 'sans-serif', serif: 'serif', mono: 'monospace' };
/** "Space Grotesk" → ["Space Grotesk", "sans-serif"] (a font not in the list falls back to sans-serif). */
export const fontStack = (name: string): string[] => [name, FALLBACK[BRAND_FONTS.find((f) => f.name === name)?.kind ?? 'sans']];

/** Our own brand (web/src/tokens.css): the orange accent, near-black surfaces, light text; Space Grotesk headings, Manrope body. */
export const BUILTIN_KIT_ID = 'imagination';
export const BUILTIN_KIT: BrandKit = {
  id: BUILTIN_KIT_ID, name: 'Imagination', builtIn: true,
  colors: [
    { hex: '#FF7A1A', name: 'Orange', role: 'primary' }, { hex: '#14151A', name: 'Ink', role: 'secondary' }, { hex: '#3DDC97', name: 'Mint', role: 'accent' },
    { hex: '#0A0A0A', name: 'Near black', role: 'background' }, { hex: '#EDEDED', name: 'Soft white', role: 'text' },
  ],
  fonts: { heading: 'Space Grotesk', body: 'Manrope' }, mood: 'bold, playful, premium, cinematic',
  dos: ['One orange accent, used for the thing to press', 'Image first: let the result fill the frame', 'Plain, short words'],
  donts: ['White text on orange', 'More than one bright colour per screen'],
  logo: { url: '/app-icon-512.png', mime: 'image/png' }, logos: { main: { url: '/app-icon-512.png', mime: 'image/png' }, light: null, dark: null, icon: null }, fontFiles: [],
  examples: [], createdAt: '2026-10-27T00:00:00.000Z', updatedAt: '2026-10-27T00:00:00.000Z',
};

/** A kit as stored by any version: an old single `logo` becomes logos.main, missing font files become []. `logo` always mirrors logos.main. */
export function normalizeKit(k: BrandKit): BrandKit {
  const raw = (k.logos ?? {}) as Partial<BrandLogos>; const main = raw.main !== undefined ? raw.main : k.logo ?? null;
  const logos: BrandLogos = { main, light: raw.light ?? null, dark: raw.dark ?? null, icon: raw.icon ?? null };
  return { ...k, logo: main, logos, fontFiles: Array.isArray(k.fontFiles) ? k.fontFiles : [] };
}
/** The logo for a slot: that slot's own, else main, else any logo the kit has (a light-only kit still gets its logo). */
export function logoFor(kit: Pick<BrandKit, 'logo'> & { logos?: Partial<BrandLogos> }, slot: LogoSlot): BrandMedia | null {
  const l = kit.logos ?? {}; return l[slot] ?? l.main ?? kit.logo ?? l.dark ?? l.light ?? l.icon ?? null;
}
/** The logo for a background of this brightness (0..1): the light logo on dark, the dark logo on light (each falls back to main). */
export const logoForBackground = (kit: Parameters<typeof logoFor>[0], lum: number) => logoFor(kit, lum < 0.5 ? 'light' : 'dark');
/** A family name a user (or a file name) gives: plain words, ≤ 60 characters. "BigCaslon-Bold.ttf" → "Big Caslon". */
export const fontNameOk = (n: string) => !!n && n.length <= BRAND_LIMITS.font && /^[\p{L}\p{N} '\-]+$/u.test(n);
export const familyOfFileName = (name: string) => String(name ?? '').replace(/\.[^.]+$/, '').replace(/[-_ ](regular|bold|medium|light|italic|book|roman|variable|vf|\d+)$/i, '').replace(/[-_]+/g, ' ')
  .replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[^\p{L}\p{N} '\-]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, BRAND_LIMITS.font).trim();

// ---------------------------------------------------------------- colour words
export const HEX_RE = /^#[0-9a-f]{6}$/i;
/** "#abc" / "ABCDEF" / " #AbCdEf " → "#AABBCC" (null when it isn't a colour). */
export function normHex(v: unknown): string | null {
  let s = String(v ?? '').trim(); if (!s.startsWith('#')) s = '#' + s;
  if (/^#[0-9a-f]{3}$/i.test(s)) s = '#' + s.slice(1).split('').map((c) => c + c).join('');
  return HEX_RE.test(s) ? s.toUpperCase() : null;
}
export const hexToRgb = (hex: string): [number, number, number] => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const rgbToHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('').toUpperCase();
/** HSL: h 0..360, s and l 0..1. */
export function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((x) => x / 255); const max = Math.max(r, g, b), min = Math.min(r, g, b); const l = (max + min) / 2; const d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1)); let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360;
  return [h, s, l];
}
export function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
/** Relative luminance (WCAG), 0..1. */
export function luminance(hex: string): number { const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; const [r, g, b] = hexToRgb(hex); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
/** Near-white or near-black (left out of auto-extraction, still fine as a background / text role). */
export const isNeutralExtreme = (hex: string) => { const [, s, l] = hexToHsl(hex); return l > 0.93 || l < 0.07 || (s < 0.08 && (l > 0.88 || l < 0.12)); };

const HUES: [number, string][] = [[12, 'red'], [22, 'vermilion'], [40, 'orange'], [50, 'amber'], [64, 'yellow'], [80, 'chartreuse'], [150, 'green'], [172, 'teal'], [195, 'cyan'], [215, 'sky blue'], [245, 'blue'], [265, 'indigo'], [290, 'violet'], [315, 'purple'], [335, 'magenta'], [350, 'pink'], [361, 'red']];
/** A colour in plain words, from its numbers alone: "#9CAF88" → "sage green", "#D8C3A5" → "warm sand", "#2B2B2B" → "deep charcoal". */
export function colourWords(hex: string): string {
  const [h, s, l] = hexToHsl(hex);
  if (l > 0.95) return 'white'; if (l < 0.05) return 'black';
  if (s < 0.12 || (s < 0.25 && (l < 0.15 || l > 0.9))) { // greys (and barely tinted near-blacks / near-whites): warm / cool by hue only when there is some tint
    const tint = s > 0.04 ? (h < 70 || h > 330 ? 'warm ' : h > 170 && h < 260 ? 'cool ' : '') : '';
    return l > 0.85 ? `${tint}off-white` : l > 0.6 ? `${tint}light grey` : l > 0.35 ? `${tint}grey` : l > 0.18 ? `${tint}charcoal` : 'deep charcoal';
  }
  // earthy names for low-saturation warm hues
  if (h >= 20 && h < 55 && s < 0.45) { if (l > 0.7) return 'warm sand'; if (l > 0.45) return 'tan'; if (l > 0.25) return 'brown'; return 'deep brown'; }
  if (h >= 70 && h < 160 && s < 0.35 && l > 0.35 && l < 0.75) return 'sage green';
  if (h >= 15 && h < 40 && l < 0.4 && s >= 0.45) return 'rust';
  const name = HUES.find(([lim]) => h < lim)![1];
  const light = l > 0.82 ? 'pale ' : l > 0.66 ? 'light ' : l < 0.22 ? 'deep ' : l < 0.36 ? 'dark ' : '';
  const sat = !light && s < 0.35 ? 'muted ' : !light && s > 0.85 && l > 0.42 && l < 0.62 ? 'bright ' : '';
  return `${light}${sat}${name}`.trim();
}
/** A user name that already reads as a colour ("Sage", "Warm sand") wins; role-like or code-like names ("Primary", "Brand 1", "C1") fall back to colourWords. */
export function colourLabel(c: BrandColor): string {
  const n = c.name.trim(); const generic = !n || /^(primary|secondary|accent|background|text|brand|colou?r|swatch|c)\s*\d*$/i.test(n) || /^#?[0-9a-f]{3,6}$/i.test(n);
  if (generic) return colourWords(c.hex);
  const w = n.toLowerCase(); return /\b(colou?r|grey|gray|white|black|red|orange|yellow|green|blue|purple|pink|brown|teal|cyan|violet|indigo|magenta|amber|sand|cream|ink|navy|gold|silver|beige|ivory|charcoal|olive|mint|coral|rose|lilac|lavender|peach|rust|sage|tan)\b/.test(w) ? w : `${w} (${colourWords(c.hex)})`;
}

// ---------------------------------------------------------------- the prompt phrase (one helper for every tool)
const listWords = (xs: string[]) => xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
/** Mood words, cleaned: one line, no trailing punctuation, at most ~8 comma parts and 120 characters (a very long mood is cut at a word). */
export function moodWords(mood: string): string {
  const parts = String(mood ?? '').replace(/[\r\n]+/g, ',').replace(/\t+/g, ' ').split(/[,;/|]+/).map((x) => x.replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '')).filter(Boolean).slice(0, 8);
  let s = parts.join(', '); if (s.length > 120) { s = s.slice(0, 120); s = s.slice(0, Math.max(s.lastIndexOf(' '), s.lastIndexOf(','))).replace(/[\s,]+$/, ''); }
  return s;
}
/** The words a kit adds to a prompt. Image / video: the palette in words (roles first, accents last) and the mood; audio: the mood only.
 *  "" when the kit has nothing to add (no colours, no mood): the prompt stays as typed. */
export function brandPhrase(kit: Pick<BrandKit, 'colors' | 'mood'>, media: BrandMediaKind): string {
  const mood = moodWords(kit.mood);
  if (media === 'audio') return mood ? `mood: ${mood}` : '';
  const cs = (kit.colors ?? []).filter((c) => normHex(c.hex)).slice(0, BRAND_LIMITS.colors);
  const order: BrandRole[] = ['primary', 'secondary', 'background', 'text', ''];
  const main = order.flatMap((r) => cs.filter((c) => c.role === r)).map(colourLabel); const acc = cs.filter((c) => c.role === 'accent').map(colourLabel);
  const uniq = (xs: string[]) => [...new Set(xs)];
  const m = uniq(main).slice(0, 4), a = uniq(acc).filter((x) => !m.includes(x)).slice(0, 2);
  const bits: string[] = [];
  if (m.length) bits.push(`colour palette of ${listWords(m)}${a.length ? `, accents of ${listWords(a)}` : ''}`); else if (a.length) bits.push(`accents of ${listWords(a)}`);
  if (mood) bits.push(`mood: ${mood}`);
  return bits.join('; ');
}
/** Joiner between the typed prompt and the brand words. */
const JOIN = '. ';
/** The typed prompt with the brand words after it ("a fox in snow. colour palette of …; mood: …"). An empty prompt or phrase changes nothing. */
export function withBrand(prompt: string, phrase: string): string {
  const p = String(prompt ?? '').trim(); if (!p || !phrase) return p;
  return `${p.replace(/[\s.,;:]+$/, '')}${JOIN}${phrase}`;
}
/** Undo withBrand (Recreate shows the typed words, the chip brings the phrase back). Text without the phrase comes back unchanged. */
export function withoutBrand(prompt: string, phrase: string): string {
  const p = String(prompt ?? ''); if (!phrase) return p; const tail = `${JOIN}${phrase}`;
  return p.endsWith(tail) ? p.slice(0, -tail.length) : p.endsWith(phrase) ? p.slice(0, -phrase.length).replace(/[\s.,;:]+$/, '') : p;
}

/** Which tools take the brand words, and as which media. Audio only for music (a voiceover's script is read word for word). null = not a brand tool. */
export function brandMediaFor(toolId: string, mode?: string | null): BrandMediaKind | null {
  if (toolId === 'create-image') return 'image';
  if (toolId === 'h3-video') return 'video';
  if (toolId === 'audio' || toolId === 'soundtrack') return !mode || mode === 'music' ? 'audio' : null;
  return null;
}

// ---------------------------------------------------------------- validation
export interface BrandIssue { code: string; field: string; message: string }
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const oneLine = (v: unknown) => str(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
/** Body → kit fields. `partial` (PATCH) keeps fields that aren't sent. Text is trimmed to one line; too long or bad values are issues, not silent cuts. */
export function validateKitInput(b: Record<string, unknown>, partial: boolean): { ok: true; value: Partial<BrandKit> } | { ok: false; issues: BrandIssue[] } {
  const issues: BrandIssue[] = []; const v: Partial<BrandKit> = {}; const L = BRAND_LIMITS;
  const has = (k: string) => b[k] !== undefined;
  if (has('name') || !partial) { const n = oneLine(b.name); if (!n) issues.push({ code: 'required', field: 'name', message: 'Give the kit a name.' }); else if (n.length > L.name) issues.push({ code: 'too_long', field: 'name', message: `Kit names can be up to ${L.name} characters.` }); else v.name = n; }
  if (has('colors')) {
    if (!Array.isArray(b.colors)) issues.push({ code: 'invalid', field: 'colors', message: 'colors must be a list.' });
    else if (b.colors.length > L.colors) issues.push({ code: 'too_many', field: 'colors', message: `A kit can have up to ${L.colors} colours.` });
    else { const out: BrandColor[] = []; const roles = new Set<string>();
      b.colors.forEach((c: any, i) => { const hex = normHex(c?.hex); if (!hex) { issues.push({ code: 'invalid', field: `colors[${i}].hex`, message: `Colour ${i + 1} isn't a hex colour like #FF7A1A.` }); return; }
        const name = oneLine(c?.name); if (name.length > L.colorName) { issues.push({ code: 'too_long', field: `colors[${i}].name`, message: `Colour names can be up to ${L.colorName} characters.` }); return; }
        const role = str(c?.role) as BrandRole; if (role && !BRAND_ROLES.includes(role as any)) { issues.push({ code: 'invalid', field: `colors[${i}].role`, message: `Role must be one of ${BRAND_ROLES.join(', ')}.` }); return; }
        if (role && roles.has(role)) { issues.push({ code: 'duplicate', field: `colors[${i}].role`, message: `Only one colour can be ${role}.` }); return; } if (role) roles.add(role);
        out.push({ hex, name, role }); });
      v.colors = out; }
  }
  if (has('fonts')) { const f = (b.fonts ?? {}) as any; if (typeof f !== 'object' || Array.isArray(f)) issues.push({ code: 'invalid', field: 'fonts', message: 'fonts must be {heading, body}.' });
    else { const h = oneLine(f.heading), bd = oneLine(f.body);
      for (const [k, x] of [['heading', h], ['body', bd]] as const) if (x.length > L.font || (x && !/^[\p{L}\p{N} '\-]+$/u.test(x))) issues.push({ code: 'invalid', field: `fonts.${k}`, message: 'Font names are plain words, up to 60 characters.' });
      v.fonts = { heading: h, body: bd }; } }
  if (has('mood')) { const m = oneLine(b.mood); if (m.length > L.mood) issues.push({ code: 'too_long', field: 'mood', message: `The mood line can be up to ${L.mood} characters.` }); else v.mood = m; }
  for (const k of ['dos', 'donts'] as const) if (has(k)) {
    const xs = b[k]; if (!Array.isArray(xs)) { issues.push({ code: 'invalid', field: k, message: `${k} must be a list of lines.` }); continue; }
    const lines = xs.map(oneLine).filter(Boolean);
    if (lines.length > L.lines) issues.push({ code: 'too_many', field: k, message: `Up to ${L.lines} lines.` });
    else if (lines.some((x) => x.length > L.line)) issues.push({ code: 'too_long', field: k, message: `Each line can be up to ${L.line} characters.` });
    else v[k] = lines;
  }
  if (has('examples')) { const xs = b.examples; if (!Array.isArray(xs) || xs.length > L.examples || xs.some((u) => !isMediaUrl(u))) issues.push({ code: 'invalid', field: 'examples', message: `Up to ${L.examples} example images from your library.` }); else v.examples = xs as string[]; }
  if (has('logo') && b.logo !== null) issues.push({ code: 'invalid', field: 'logo', message: 'Upload a logo with POST /api/brand-kits/:id/logo (send logo: null to remove it).' });
  else if (has('logo')) v.logo = null;
  if (has('logos') || has('fontFiles')) issues.push({ code: 'invalid', field: has('logos') ? 'logos' : 'fontFiles', message: 'Logos and font files are added with their own upload routes (/logo?slot=…, /font?role=…).' });
  return issues.length ? { ok: false, issues } : { ok: true, value: v };
}
/** A library file the app serves itself (no outside URLs, no "..", no query tricks). */
export const isMediaUrl = (u: unknown) => typeof u === 'string' && /^\/(files|samples|showcase)\/[\w./-]{1,200}$/.test(u) && !u.includes('..');

// ---------------------------------------------------------------- exports
export const kitSlug = (name: string) => String(name ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'brand';
/** Each colour's token key: its role, else its name ("sage-green"), else colour-N; duplicates get -2, -3. */
export function colorKeys(colors: BrandColor[]): string[] {
  const used = new Set<string>(); return colors.map((c, i) => { let k = c.role || kitSlug(c.name) || `colour-${i + 1}`; if (k === 'brand') k = `colour-${i + 1}`; let n = 2; const b = k; while (used.has(k)) k = `${b}-${n++}`; used.add(k); return k; });
}
export const SPACING: Record<string, number> = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, '2xl': 48 };
export const RADIUS: Record<string, number> = { sm: 4, md: 8, lg: 14, pill: 999 };
/** The kit as a W3C Design Tokens Community Group file (every token has $value; groups carry $type): color, fontFamily, spacing and radius (dimension).
 *  Colours are "#RRGGBB" strings and dimensions "16px" strings, the form Tokens Studio, Style Dictionary and our Figma plugin read. */
export function tokensOf(kit: BrandKit): Record<string, any> {
  const keys = colorKeys(kit.colors);
  const color: Record<string, any> = { $type: 'color' };
  kit.colors.forEach((c, i) => { color[keys[i]] = { $value: c.hex, $description: [c.name || colourWords(c.hex), c.role].filter(Boolean).join(' · ') }; });
  const font: Record<string, any> = { $type: 'fontFamily' };
  if (kit.fonts.heading) font.heading = { $value: fontStack(kit.fonts.heading) }; if (kit.fonts.body) font.body = { $value: fontStack(kit.fonts.body) };
  const dim = (o: Record<string, number>) => ({ $type: 'dimension', ...Object.fromEntries(Object.entries(o).map(([k, n]) => [k, { $value: `${n}px` }])) });
  return {
    $description: `${kit.name} brand kit${kit.mood ? `. Mood: ${moodWords(kit.mood)}` : ''}. Made with Imagination Is All You Need.`,
    color, font, spacing: dim(SPACING), radius: dim(RADIUS),
    $extensions: { 'app.imagination.brand-kit': { name: kit.name, mood: kit.mood, dos: kit.dos, donts: kit.donts, version: 2,
      /* the files themselves: logos by slot and the font files (with where each font came from and its licence) */
      logos: Object.fromEntries(LOGO_SLOTS.filter((s) => kit.logos?.[s]).map((s) => [s, kit.logos[s]!.url])),
      fontFiles: (kit.fontFiles ?? []).map((f) => ({ family: f.family, role: f.role, weight: f.weight || 'all', file: f.url, format: f.format, source: f.source, licence: f.licence, ...(f.sourceUrl ? { sourceUrl: f.sourceUrl } : {}) })) } },
  };
}
/** Structure check for a tokens file (the test's and the importer's): every leaf token has $value, every group or token has a known $type, colours are hex. */
export function checkTokens(t: unknown): string[] {
  const errs: string[] = []; const TYPES = new Set(['color', 'fontFamily', 'dimension', 'number', 'fontWeight', 'duration', 'cubicBezier']);
  const walk = (o: any, p: string, type?: string) => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) { errs.push(`${p}: not an object`); return; }
    const ty = o.$type ?? type; if (o.$type && !TYPES.has(o.$type)) errs.push(`${p}: unknown $type ${o.$type}`);
    if ('$value' in o) { if (!ty) errs.push(`${p}: no $type`); if (ty === 'color' && !(typeof o.$value === 'string' && HEX_RE.test(o.$value))) errs.push(`${p}: colour is not #RRGGBB`);
      if (ty === 'dimension' && !(typeof o.$value === 'string' && /^-?\d+(\.\d+)?(px|rem)$/.test(o.$value))) errs.push(`${p}: dimension is not like 16px`);
      if (ty === 'fontFamily' && !(typeof o.$value === 'string' || (Array.isArray(o.$value) && o.$value.every((x: unknown) => typeof x === 'string')))) errs.push(`${p}: fontFamily is not a name or list`); return; }
    for (const [k, v] of Object.entries(o)) { if (k.startsWith('$')) continue; if (/[{}.]/.test(k)) errs.push(`${p}.${k}: names can't contain { } or .`); walk(v, p ? `${p}.${k}` : k, ty); }
  };
  walk(t, ''); return errs;
}
/** :root { --brand-primary: #FF7A1A; … --brand-font-heading: 'Space Grotesk', sans-serif; } */
export function cssVarsOf(kit: BrandKit): string {
  const keys = colorKeys(kit.colors); const q = (xs: string[]) => xs.map((x) => (/^(sans-serif|serif|monospace)$/.test(x) ? x : `'${x}'`)).join(', ');
  const lines = [...kit.colors.map((c, i) => `  --brand-${keys[i]}: ${c.hex};`), ...(kit.fonts.heading ? [`  --brand-font-heading: ${q(fontStack(kit.fonts.heading))};`] : []), ...(kit.fonts.body ? [`  --brand-font-body: ${q(fontStack(kit.fonts.body))};`] : []),
    ...Object.entries(RADIUS).map(([k, n]) => `  --brand-radius-${k}: ${n}px;`)];
  return `/* ${kit.name} brand kit */\n:root {\n${lines.join('\n')}\n}\n`;
}
/** A Tailwind theme.extend block (tailwind.config.js). */
export function tailwindOf(kit: BrandKit): string {
  const keys = colorKeys(kit.colors);
  const theme = { colors: { brand: Object.fromEntries(kit.colors.map((c, i) => [keys[i], c.hex])) }, fontFamily: { ...(kit.fonts.heading ? { heading: fontStack(kit.fonts.heading) } : {}), ...(kit.fonts.body ? { body: fontStack(kit.fonts.body) } : {}) },
    borderRadius: Object.fromEntries(Object.entries(RADIUS).map(([k, n]) => [`brand-${k}`, `${n}px`])) };
  return `// ${kit.name} brand kit: paste into tailwind.config.js\nmodule.exports = {\n  theme: {\n    extend: ${JSON.stringify(theme, null, 2).replace(/\n/g, '\n    ')},\n  },\n};\n`;
}
/** One hex per line with its name (paste into a design tool's brand colours). */
export const hexListOf = (kit: BrandKit) => kit.colors.map((c) => `${c.hex}  ${c.name || colourWords(c.hex)}${c.role ? ` (${c.role})` : ''}`).join('\n');

// ---------------------------------------------------------------- "make a kit from words" (free, rules based, no model)
const WORD_HUES: [RegExp, number, number][] = [ // word → hue, saturation
  [/\b(warm|sun|sunny|summer|energetic|energy|bold|playful|fun|joy|happy)/, 28, 0.85], [/\b(calm|serene|peace|ocean|sea|water|trust|tech|cool|clean)/, 205, 0.55],
  [/\b(nature|natural|organic|eco|green|fresh|earthy|botanical|plant|sage)/, 110, 0.3], [/\b(luxury|premium|elegant|gold|rich|classic)/, 42, 0.55],
  [/\b(romantic|soft|gentle|love|pink|sweet|cute)/, 340, 0.55], [/\b(mystic|magic|dream|night|cosmic|futur)/, 265, 0.55],
  [/\b(retro|vintage|nostalg|autumn|cosy|cozy|rustic|coffee)/, 22, 0.5], [/\b(passion|fire|bold red|intense|power|sport)/, 4, 0.75],
  [/\b(minimal|simple|mono|neutral|quiet|scandi)/, 30, 0.08], [/\b(fresh|mint|spring|light)/, 158, 0.45],
];
/** Mood words → a 5-colour kit palette (primary, secondary, accent, background, text). Dark words ("dark", "night", "moody") give a dark background. */
export function paletteFromWords(words: string): BrandColor[] {
  const w = String(words ?? '').toLowerCase(); const hits = WORD_HUES.filter(([re]) => re.test(w));
  const [h1, s1] = hits[0] ? [hits[0][1], hits[0][2]] : [28, 0.8]; const [h2, s2] = hits[1] ? [hits[1][1], hits[1][2]] : [(h1 + 180) % 360, Math.min(0.6, s1)];
  const dark = /\b(dark|night|moody|noir|cinematic|deep|mysterious)/.test(w); const premium = /\b(premium|luxury|elegant)/.test(w);
  const primary = hslToHex(h1, s1, s1 < 0.15 ? 0.3 : 0.52); const secondary = hslToHex(h2, Math.max(0.15, s2 * 0.7), dark ? 0.32 : 0.38);
  const accent = hslToHex((h1 + (premium ? 15 : 150)) % 360, premium ? 0.6 : 0.7, 0.6);
  const bg = dark ? hslToHex(h1, 0.12, 0.07) : hslToHex(h1, 0.3, 0.96); const text = dark ? hslToHex(h1, 0.1, 0.92) : hslToHex(h1, 0.15, 0.12);
  return [{ hex: primary, name: '', role: 'primary' }, { hex: secondary, name: '', role: 'secondary' }, { hex: accent, name: '', role: 'accent' }, { hex: bg, name: '', role: 'background' }, { hex: text, name: '', role: 'text' }]
    .map((c) => ({ ...c, name: colourWords(c.hex).replace(/\b\w/, (x) => x.toUpperCase()) })) as BrandColor[];
}

// ---------------------------------------------------------------- colour extraction (pixels → main colours; the web feeds a downscaled canvas)
/** Main colours of an image from RGBA pixels: drops see-through pixels and (unless that's all there is) near-white / near-black, then a seeded k-means.
 *  → up to `k` colours, most common first, each with its share of the counted pixels. Our own code, deterministic. */
export function extractColors(px: ArrayLike<number>, k = 6): { hex: string; share: number }[] {
  const all: [number, number, number][] = []; const kept: [number, number, number][] = [];
  for (let i = 0; i + 3 < px.length; i += 4) { if (px[i + 3] < 128) continue; const c: [number, number, number] = [px[i], px[i + 1], px[i + 2]]; all.push(c);
    if (!isNeutralExtreme(rgbToHex(c[0], c[1], c[2]))) kept.push(c); }
  const pts = kept.length >= Math.max(8, all.length * 0.02) ? kept : all; // a 1-colour white or black logo still gives its colour
  if (!pts.length) return [];
  const d2 = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  // seed: the mean, then each next seed is the point farthest from the seeds so far (deterministic k-means++)
  const mean = [0, 1, 2].map((j) => pts.reduce((s, p) => s + p[j], 0) / pts.length); let first = pts[0], best = Infinity; for (const p of pts) { const d = d2(p, mean); if (d < best) { best = d; first = p; } }
  const cents: number[][] = [[...first]]; const step = Math.max(1, Math.floor(pts.length / 4000));
  while (cents.length < k) { let far: number[] | null = null, fd = 0; for (let i = 0; i < pts.length; i += step) { const p = pts[i]; const d = Math.min(...cents.map((c) => d2(p, c))); if (d > fd) { fd = d; far = p; } } if (!far || fd < 400) break; cents.push([...far]); }
  const assign = new Array(pts.length).fill(0);
  for (let it = 0; it < 12; it++) {
    const sum = cents.map(() => [0, 0, 0, 0]);
    pts.forEach((p, i) => { let bi = 0, bd = Infinity; cents.forEach((c, j) => { const d = d2(p, c); if (d < bd) { bd = d; bi = j; } }); assign[i] = bi; const s = sum[bi]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++; });
    let moved = 0; sum.forEach((s, j) => { if (!s[3]) return; const n = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; moved += d2(n, cents[j]); cents[j] = n; }); if (moved < 1) break;
  }
  const counts = cents.map(() => 0); assign.forEach((a) => counts[a]++);
  let out = cents.map((c, j) => ({ c, n: counts[j] })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  const merged: typeof out = []; for (const x of out) { const m = merged.find((y) => d2(x.c, y.c) < 24 * 24); if (m) m.n += x.n; else merged.push({ ...x }); } out = merged; // near-duplicates (anti-aliased edges) fold into one
  const tot = out.reduce((s, x) => s + x.n, 0);
  /* edge blends: a small cluster that sits on the line between two bigger colours (or a colour and the white / black it was left out of) is an
     anti-aliased edge, not a brand colour ("#A2B8AF" between a green logo and its white JPG background) */
  const segD = (c: number[], a: number[], b: number[]) => { const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const L = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((c[0] - a[0]) * ab[0] + (c[1] - a[1]) * ab[1] + (c[2] - a[2]) * ab[2]) / L)); return Math.sqrt(d2(c, [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]])); };
  out = out.filter((x, i) => { if (x.n / tot >= 0.06) return true; const anchors = [...out.slice(0, i).filter((y) => y.n > x.n * 2).map((y) => y.c), [255, 255, 255], [0, 0, 0]];
    for (let a = 0; a < anchors.length; a++) for (let b = a + 1; b < anchors.length; b++) if (segD(x.c, anchors[a], anchors[b]) < 16) return false; return true; });
  return out.filter((x) => x.n / tot >= 0.01).slice(0, k).map((x) => ({ hex: rgbToHex(x.c[0], x.c[1], x.c[2]), share: x.n / tot }));
}
/** Extracted colours → kit colours, with roles by rank (primary, secondary, accent). */
export const colorsFromExtract = (xs: { hex: string }[]): BrandColor[] => xs.map((x, i) => ({ hex: x.hex, name: colourWords(x.hex).replace(/\b\w/, (c) => c.toUpperCase()), role: (['primary', 'secondary', 'accent'][i] ?? '') as BrandRole }));
