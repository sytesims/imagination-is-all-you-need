/**
 * Light rig (2026-10-24): the 3D light sphere's state as one plain, serialisable object, and the precise wording it becomes.
 * Isomorphic (no server imports): the web's shared LightSphere (web/src/shared/LightSphere.tsx) edits a rig and shows `rigReadout`;
 * the server's Relight (tools/apps.ts relightPrompt) turns the same rig into prompt words with `rigPhrases`, so the bar, the prompt
 * peek and the job agree. Relight runs on prompt-driven edit models, so the light becomes words: direction in words plus degrees,
 * height, colour temperature named ("warm 3200K tungsten"), softness, rim light and ambient level.
 *
 * Angles are seen from the camera: az 0 = from the camera (front), −90 = frame left, +90 = frame right, ±180 = from behind the subject;
 * el 0 = eye level, +90 = straight above, −90 = straight below.
 */

export interface RigLight { /** −180…180, frame left negative */ az: number; /** −90…90, up positive */ el: number; /** 2000…10000 */ kelvin: number;
  /** a creative colour (neon…) instead of the colour temperature, #RRGGBB */ color?: string; /** 0…100 */ intensity: number; /** 0 hard … 100 soft */ softness: number }
export interface LightRig { key: RigLight; /** optional second light (rim / back) */ rim?: RigLight; /** 0…100 */ ambient: number; /** the preset it started from (wording names the setup) */ preset?: string }

export const KELVIN_MIN = 2000, KELVIN_MAX = 10000;
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const r1 = (n: number) => Math.round(n);
/** Wrap any angle to −180…180. */
export const wrapAz = (a: number) => { const x = ((a + 180) % 360 + 360) % 360 - 180; return x === -180 ? 180 : x; };

// ---- colour ----
/** Kelvin → linear-ish sRGB 0…255 (Tanner Helland's fit; fine for a tint). */
export function kelvinRgb(k: number): [number, number, number] {
  const t = clamp(k, 1000, 40000) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [r, g, b].map((x) => Math.round(clamp(x, 0, 255))) as [number, number, number];
}
export const hexRgb = (hex: string): [number, number, number] => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const rgbHex = (c: [number, number, number]) => `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
/** The light's colour as RGB: its creative colour, else its colour temperature. */
export const lightRgb = (l: Pick<RigLight, 'kelvin' | 'color'>): [number, number, number] => (l.color ? hexRgb(l.color) : kelvinRgb(l.kelvin));
/** ~16 named light colours; a hex maps to the nearest one (RGB distance). Shared with Relight's colour swatches (tools/appRows.ts). */
const NAMED: [string, [number, number, number]][] = [
  ['neutral white', [255, 255, 255]], ['warm white', [255, 236, 210]], ['warm amber', [255, 201, 138]], ['golden', [255, 179, 71]], ['orange', [255, 140, 40]],
  ['red', [230, 40, 40]], ['pink', [255, 150, 190]], ['magenta', [224, 90, 216]], ['purple', [140, 80, 220]], ['deep blue', [40, 70, 220]],
  ['cool blue', [191, 217, 255]], ['cyan', [80, 220, 240]], ['teal', [95, 211, 198]], ['green', [60, 200, 90]], ['lime', [190, 240, 80]], ['yellow', [255, 240, 90]],
];
const dist = (a: number[], b: number[]) => a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0);
export function colourName(hex: string): string { const c = hexRgb(hex); return NAMED.reduce((a, b) => (dist(b[1], c) < dist(a[1], c) ? b : a))[0]; }
export const brightnessWord = (b: number) => (b <= 25 ? 'dim' : b <= 60 ? 'normal-strength' : b <= 85 ? 'bright' : 'very bright');

/** A colour temperature in words: "warm 3200K tungsten". */
export function kelvinName(k: number): string {
  const K = Math.round(clamp(k, KELVIN_MIN, KELVIN_MAX) / 100) * 100;
  return K < 2300 ? `very warm ${K}K candle-flame` : K < 3000 ? `warm ${K}K household tungsten` : K < 3600 ? `warm ${K}K tungsten`
    : K < 4500 ? `warm-white ${K}K` : K < 5200 ? `soft neutral ${K}K` : K < 6200 ? `neutral ${K}K daylight` : K < 7500 ? `cool ${K}K overcast daylight`
      : K < 9000 ? `cool ${K}K shade-blue` : `deep blue ${K}K sky`;
}
/** The light's colour in words: the named temperature, or "magenta (#E05AD8) coloured". */
export const tintName = (l: Pick<RigLight, 'kelvin' | 'color'>) => (l.color ? `${colourName(l.color)} (${l.color.toUpperCase()}) coloured` : kelvinName(l.kelvin));

// ---- direction: 26 fixed light positions ----
/**
 * Fixed light positions (2026-10-31). The light snaps to one of 26 positions around the subject: eight sides (every 45°) at three heights
 * (high, eye level, low), plus straight above and straight below. Each position has one plain label (the panel) and one fixed phrase (the
 * prompt), both from the same table, so the panel and the model always agree and no in-between angle can give clashing words
 * ("12° up" next to "at eye level"). Angles sent through the API are snapped the same way before they are worded.
 */
export const LIGHT_STEP = 45;
const sideOf = (az: number) => (az < 0 ? 'left' : 'right');
/** Any angles → the nearest fixed position (az a multiple of 45°, el one of −90, −45, 0, 45, 90; straight above / below has az 0). */
export function snapAngles(az: number, el: number): { az: number; el: number } {
  const E = clamp(Math.round(clamp(el, -90, 90) / LIGHT_STEP) * LIGHT_STEP, -90, 90);
  if (Math.abs(E) === 90) return { az: 0, el: E };
  return { az: wrapAz(Math.round(wrapAz(az) / LIGHT_STEP) * LIGHT_STEP) + 0, el: E + 0 };
}
export interface LightCell { /** "front-left-high", "above"… */ id: string; az: number; el: number; /** the panel's words: "From the front-left, high up" */ label: string;
  /** the prompt's fixed phrase: "from the front-left of the frame, high above eye level" */ phrase: string }
const SIDES: Record<number, { id: string; label: string; phrase: string }> = {
  0: { id: 'front', label: 'the front', phrase: 'the front' },
  45: { id: 'front-right', label: 'the front-right', phrase: 'the front-right of the frame' }, [-45]: { id: 'front-left', label: 'the front-left', phrase: 'the front-left of the frame' },
  90: { id: 'right', label: 'the right', phrase: 'the right side of the frame' }, [-90]: { id: 'left', label: 'the left', phrase: 'the left side of the frame' },
  135: { id: 'back-right', label: 'behind, on the right', phrase: 'behind the subject on the right' }, [-135]: { id: 'back-left', label: 'behind, on the left', phrase: 'behind the subject on the left' },
  180: { id: 'back', label: 'behind', phrase: 'directly behind the subject' },
};
const HEIGHTS: Record<number, { id: string; label: string; phrase: string }> = {
  45: { id: 'high', label: ', high up', phrase: 'high above eye level' }, 0: { id: 'level', label: '', phrase: 'at eye level' }, [-45]: { id: 'low', label: ', low down', phrase: 'low, below eye level' },
};
/** The fixed position for any angles (snapped first). */
export function lightCell(az: number, el: number): LightCell {
  const s = snapAngles(az, el);
  if (s.el === 90) return { id: 'above', ...s, label: 'From straight above', phrase: 'from directly overhead' };
  if (s.el === -90) return { id: 'below', ...s, label: 'From straight below', phrase: 'from directly below' };
  const S = SIDES[s.az]; const H = HEIGHTS[s.el];
  return { id: `${S.id}-${H.id}`, ...s, label: `From ${S.label}${H.label}`, phrase: `from ${S.phrase}, ${H.phrase}` };
}
/** All 26 positions (tests, docs). */
export const LIGHT_CELLS: LightCell[] = [lightCell(0, 90), ...[45, 0, -45].flatMap((el) => [0, 45, 90, 135, 180, -135, -90, -45].map((az) => lightCell(az, el))), lightCell(0, -90)];
/** A classic lighting name when the key sits in a well-known spot (models know these words). */
export function setupName(az: number, el: number): string {
  const a = Math.abs(wrapAz(az));
  if (el <= -40) return 'under-lighting'; if (a > 155) return 'a backlight'; if (el >= 70) return 'top light';
  if (a <= 15 && el >= 25) return 'butterfly lighting'; if (a >= 35 && a <= 65 && el >= 15 && el < 70) return 'Rembrandt-style three-quarter lighting';
  if (a >= 75 && a <= 105 && Math.abs(el) < 40) return 'split side lighting'; return '';
}
/** Softness and ambient in plain words only (no numbers: the model reads words, and "softness 70%" meant nothing to it). */
export const softnessWords = (s: number) => `${s <= 20 ? 'hard crisp light with sharp-edged shadows' : s <= 45 ? 'fairly hard light with defined shadow edges' : s <= 75 ? 'soft diffused light with gentle shadow edges' : 'very soft wrap-around light, shadows almost gone'}`;
export const ambientWords = (a: number) => `${a <= 10 ? 'almost no ambient fill: deep black shadows, low-key' : a <= 35 ? 'low ambient fill: rich, dark shadows' : a <= 65 ? 'moderate ambient fill: shadows keep their detail' : 'strong ambient fill: bright open shadows, high-key'}`;
const power = (i: number) => (i <= 15 ? 'very dim' : i <= 35 ? 'dim' : i <= 60 ? 'medium strength' : i <= 85 ? 'bright' : 'very bright');

export interface RigPhrases { /** "from the front-left of the frame, high above eye level, Rembrandt-style three-quarter lighting" */ keyDir: string;
  /** "warm 3200K tungsten, bright" */ keyTint: string; quality: string; /** "rim light from …" or '' */ rim: string; ambient: string }
/** The words for each part of the rig (the server joins them per model family). Each light is worded by its fixed position (lightCell). */
export function rigPhrases(rig: LightRig): RigPhrases {
  const k = lightCell(rig.key.az, rig.key.el); const name = setupName(k.az, k.el);
  const keyDir = `${k.phrase}${name ? `, ${name}` : ''}`;
  let rim = '';
  if (rig.rim) { const r = lightCell(rig.rim.az, rig.rim.el); const back = Math.abs(r.az) >= 100;
    rim = `${back ? 'rim light' : 'second accent light'} ${r.phrase}, ${tintName(rig.rim)}, ${power(rig.rim.intensity)}${back ? ': a bright edge outlining the hair, shoulders and silhouette' : ''}`; }
  return { keyDir, keyTint: `${tintName(rig.key)}, ${power(rig.key.intensity)}`, quality: softnessWords(rig.key.softness), rim, ambient: ambientWords(rig.ambient) };
}
/** The rig as one line of prompt words (the shared `toText`; Relight words it per model family on the server). */
export function rigToText(rig: LightRig): string {
  const p = rigPhrases(rig); return [`key light ${p.keyDir}, ${p.keyTint}`, p.quality, p.rim, p.ambient].filter(Boolean).join('; ');
}
/** The short mono readout: "Key · 45° left · 30° up · 3200K · soft 60%". */
export function lightReadout(l: RigLight, label = 'Key'): string {
  const A = r1(Math.abs(wrapAz(l.az))); const E = r1(l.el);
  return [label, A === 0 ? 'front' : A === 180 ? 'behind' : `${A}° ${sideOf(wrapAz(l.az))}`, E === 0 ? 'level' : `${Math.abs(E)}° ${E > 0 ? 'up' : 'down'}`,
    l.color ? l.color.toUpperCase() : `${Math.round(l.kelvin / 100) * 100}K`, l.softness >= 50 ? `soft ${r1(l.softness)}%` : `hard ${100 - r1(l.softness)}%`].join(' · ');
}
/** The bar chip's text: "45°L 30°↑ · 3200K" (+ " · rim"). */
export function rigChip(rig: LightRig): string {
  const k = rig.key; const A = r1(Math.abs(wrapAz(k.az))); const E = r1(k.el);
  return [`${A === 0 ? 'Front' : A === 180 ? 'Back' : `${A}°${k.az < 0 ? 'L' : 'R'}`} ${Math.abs(E)}°${E >= 0 ? '↑' : '↓'}`, `${k.color ? colourName(k.color).replace(/^\w/, (c) => c.toUpperCase()) : `${Math.round(k.kelvin / 100) * 100}K`}${rig.rim ? ' + rim' : ''}`].join(' · ');
}

// ---- parse / validate (the job's `light` field: JSON) ----
const num = (x: unknown, a: number, b: number, name: string): number => { const n = Number(x); if (x === '' || x == null || !Number.isFinite(n)) throw new Error(`${name} must be a number.`); if (n < a || n > b) throw new Error(`${name} must be ${a}–${b}.`); return n; };
function parseLight(x: any, name: string, softDefault: number): RigLight {
  if (!x || typeof x !== 'object') throw new Error(`${name} is missing.`);
  const color = x.color == null || x.color === '' ? undefined : String(x.color); if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error(`${name} colour: use a hex colour like #FFAA33.`);
  return { az: r1(wrapAz(num(x.az, -360, 360, `${name} az`))), el: r1(num(x.el, -90, 90, `${name} el`)), kelvin: Math.round(num(x.kelvin, KELVIN_MIN, KELVIN_MAX, `${name} kelvin`) / 50) * 50,
    ...(color ? { color: color.toUpperCase() } : {}), intensity: r1(num(x.intensity, 0, 100, `${name} intensity`)), softness: r1(num(x.softness ?? softDefault, 0, 100, `${name} softness`)) };
}
/** The `light` field (JSON text or an object) → a clean rig, or the reason it's wrong. Blank = null (not used). */
export function parseLightRig(v: unknown): { rig: LightRig } | { error: string } | null {
  if (v == null || v === '') return null;
  try {
    if (typeof v === 'string' && v.length > 800) return { error: 'Light: too long.' };
    const x = typeof v === 'string' ? JSON.parse(v) : v; if (!x || typeof x !== 'object' || Array.isArray(x)) return { error: 'Light: send a JSON object.' };
    const rig: LightRig = { key: parseLight(x.key, 'Key light', 50), ambient: r1(num(x.ambient ?? 30, 0, 100, 'Ambient')) };
    if (x.rim) rig.rim = parseLight(x.rim, 'Rim light', 30);
    if (x.preset != null && x.preset !== '') { const p = String(x.preset); if (!/^[a-z0-9-]{1,32}$/.test(p)) return { error: 'Light preset: use a preset id.' }; rig.preset = p; }
    return { rig };
  } catch (e) { return { error: e instanceof SyntaxError ? 'Light: send valid JSON.' : (e as Error).message }; }
}
/** The canonical text the job stores (stable key order). */
const lightJson = (l: RigLight): RigLight => ({ az: l.az, el: l.el, kelvin: l.kelvin, ...(l.color ? { color: l.color } : {}), intensity: l.intensity, softness: l.softness });
export const rigJson = (rig: LightRig) => JSON.stringify({ key: lightJson(rig.key), ...(rig.rim ? { rim: lightJson(rig.rim) } : {}), ambient: rig.ambient, ...(rig.preset ? { preset: rig.preset } : {}) });

// ---- presets (shared by the sphere and the server) ----
/** A sphere preset: where it puts the lights (always on the fixed positions, so a picked look reads back exactly), and which Relight look it maps to (that look's rich description stays in the prompt). */
export interface SpherePreset { id: string; label: string; /** Relight look id (tools/appRows.ts RELIGHT_LOOKS), 'custom' = none */ look: string; /** the setup's name in the prompt when no look carries one */ light: string; rig: LightRig }
const L = (az: number, el: number, kelvin: number, intensity: number, softness: number, color?: string): RigLight => ({ az, el, kelvin, intensity, softness, ...(color ? { color } : {}) });
export const SPHERE_PRESETS: SpherePreset[] = [
  { id: 'golden-hour', label: 'Golden hour', look: 'golden-hour', light: 'golden-hour sunlight', rig: { key: L(90, 0, 3200, 75, 65), rim: L(180, 0, 2800, 55, 30), ambient: 35 } },
  { id: 'studio-softbox', label: 'Studio softbox', look: 'studio-softbox', light: 'a large studio softbox key light', rig: { key: L(-45, 45, 5500, 65, 80), ambient: 40 } },
  { id: 'neon-rim', label: 'Neon rim', look: 'neon-night', light: 'coloured neon light at night', rig: { key: L(90, 0, 5600, 70, 30, '#E05AD8'), rim: L(-135, 0, 5600, 80, 20, '#33D6FF'), ambient: 8 } },
  { id: 'overhead-noon', label: 'Overhead noon', look: 'custom', light: 'hard midday sun', rig: { key: L(0, 90, 5600, 90, 10), ambient: 30 } },
  { id: 'candle', label: 'Candle', look: 'candlelight', light: 'warm candlelight', rig: { key: L(0, 0, 2000, 35, 70), ambient: 6 } },
  { id: 'moonlight', label: 'Moonlight', look: 'custom', light: 'cool moonlight at night', rig: { key: L(-45, 45, 8500, 35, 45), rim: L(135, 0, 9500, 45, 30), ambient: 12 } },
  { id: 'window', label: 'Window light', look: 'window', light: 'soft natural window light', rig: { key: L(-90, 0, 5600, 60, 75), ambient: 30 } },
  { id: 'blue-hour', label: 'Blue hour', look: 'blue-hour', light: 'cool blue-hour twilight', rig: { key: L(0, 0, 9000, 40, 90), ambient: 45 } },
  { id: 'overcast', label: 'Overcast', look: 'overcast', light: 'soft overcast daylight', rig: { key: L(0, 45, 6500, 50, 95), ambient: 60 } },
  { id: 'rim', label: 'Rim / backlight', look: 'rim', light: 'a strong edge light', rig: { key: L(180, 0, 5600, 75, 25), ambient: 20 } },
];
export const spherePresetOf = (id: string | undefined) => SPHERE_PRESETS.find((p) => p.id === id);
/** The light Relight starts on (2026-10-31): a soft key from the front-left, high up (Rembrandt-style three-quarter light), at Balanced
 *  strength. A clear, flattering change for portraits and products; a light from the front barely changed the photo. It sits on a fixed
 *  position, so the panel and the prompt name the same spot. */
export const DEFAULT_RIG: LightRig = { key: L(-45, 45, 5600, 65, 60), ambient: 30 };
/** The old Relight fields at their defaults with no look: the light was never set (the panel untouched, or an API call with no light fields).
 *  Callers use a readable `light` rig first; otherwise Relight uses DEFAULT_RIG, on the panel and in the prompt alike. Keep in step with the
 *  field defaults (tools/apps.ts relight). */
export function lightUntouched(v: Record<string, string | undefined>): boolean {
  const is = (x: string | undefined, d: string) => x == null || x === '' || x.toUpperCase() === d.toUpperCase();
  return is(v.look, 'custom') && is(v.direction, 'front') && is(v.lightQuality, 'soft') && (v.brightness == null || v.brightness === '' || Number(v.brightness) === 50)
    && is(v.color, '#FFFFFF') && (v.lightX == null || v.lightX === '') && (v.lightY == null || v.lightY === '');
}

/** Today's Relight fields (direction / pad / quality / brightness / colour) → the rig the sphere opens on, so old drafts and links
 *  show where their light is. Nothing is sent until the user moves something (the old fields keep their old light). Untouched fields open on DEFAULT_RIG. */
export function rigFromLegacy(v: Record<string, string | undefined>): LightRig {
  if (lightUntouched(v)) return structuredClone(DEFAULT_RIG);
  const DIR: Record<string, [number, number]> = { top: [0, 90], front: [0, 0], left: [-90, 0], right: [90, 0], back: [180, 0], bottom: [0, -90] };
  let [az, el] = DIR[v.direction ?? 'front'] ?? DIR.front;
  // the pad (−1…1): x = frame left → right; y as Relight's padPhrase reads it (positive = upper)
  if (v.lightX != null && v.lightX !== '' && v.lightY != null && v.lightY !== '') { ({ az, el } = snapAngles(clamp(Number(v.lightX), -1, 1) * 90, clamp(Number(v.lightY), -1, 1) * 60)); }
  const col = String(v.color ?? '#FFFFFF').toUpperCase();
  const WARM: Record<string, number> = { '#FFFFFF': 5600, '#FFC98A': 3200, '#FFB347': 2700, '#BFD9FF': 8000, '#FF9A3C': 2000 };
  const b = Number(v.brightness ?? 50); const intensity = Number.isFinite(b) ? clamp(b, 0, 100) : 50;
  const key: RigLight = { az, el, kelvin: WARM[col] ?? 5600, intensity, softness: v.lightQuality === 'hard' ? 20 : 70, ...(WARM[col] == null && /^#[0-9A-F]{6}$/.test(col) ? { color: col } : {}) };
  return { key, ambient: 30 };
}
