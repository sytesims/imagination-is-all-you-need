/**
 * Easy light (2026-10-25): the plain-words layer over the light rig (lightRig.ts) that Relight's compact light panel uses.
 * Isomorphic and pure (no DOM): the web panel (web/src/shared/LightPanel.tsx) and the tests share it.
 * - Six quick picks (Front · Left · Right · Top · Back · Below); the light always sits on one of 26 fixed positions (lightRig.ts lightCell) and
 *   reads back as that position's plain words ("From the left, high up"), the same position the prompt words.
 * - Strength (Subtle · Balanced · Dramatic) maps to the key's intensity and the ambient fill; Light (Soft · Hard) to the softness extremes.
 * - The preview handle: a point on the photo ↔ the light's angles (front half of the sphere, or the back half while the light is behind).
 * - The approximate preview: CSS layers (shadow side, glow, colour tint, rim edge) drawn over the user's photo. Instant and free; never the result.
 * Nothing here changes the rig's shape, so saved settings, the REST/MCP `light` field and the prompt words stay as they were.
 */
import { lightCell, lightRgb, parseLightRig, rigFromLegacy, snapAngles, spherePresetOf, wrapAz, SPHERE_PRESETS, type LightRig, type RigLight } from './lightRig.js';

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

// ---- direction ----
export type DirId = 'front' | 'left' | 'right' | 'top' | 'behind' | 'below';
/** The six quick picks (seen from the camera: az −90 = frame left, el up positive), each one of the fixed positions (lightRig.ts lightCell). */
export const DIRECTIONS: { id: DirId; label: string; az: number; el: number }[] = [
  { id: 'front', label: 'Front', az: 0, el: 0 }, { id: 'left', label: 'Left', az: -90, el: 0 }, { id: 'right', label: 'Right', az: 90, el: 0 },
  { id: 'top', label: 'Top', az: 0, el: 90 }, { id: 'behind', label: 'Back', az: 180, el: 0 }, { id: 'below', label: 'Below', az: 0, el: -90 },
];
/** The quick pick at a light's fixed position, or null when it sits on another position (the plain label still says where). */
export function directionOf(az: number, el: number): DirId | null {
  const s = snapAngles(az, el); return DIRECTIONS.find((d) => d.az === s.az && d.el === s.el)?.id ?? null;
}
/** A light moved to a quick pick: only its angles change (colour, strength and softness stay). */
export function withDirection(l: RigLight, id: DirId): RigLight { const d = DIRECTIONS.find((x) => x.id === id) ?? DIRECTIONS[0]; return { ...l, az: d.az, el: d.el }; }

/** The light's direction in plain words, from its fixed position: "From the left, high up", "From straight above". The prompt words the same position. */
export const plainDir = (az: number, el: number): string => lightCell(az, el).label;
/** The short form for the bar chip: "from the left", "from above", "from behind". */
export function shortDir(az: number, el: number): string {
  const c = lightCell(az, el); if (c.el === 90) return 'from above'; if (c.el === -90) return 'from below';
  return Math.abs(c.az) > 90 ? 'from behind' : c.label.replace(/^From /, 'from ').replace(/, (high up|low down)$/, '');
}
/** The exact angles, for a tooltip only: "80° left, 10° up". */
export function degTip(az: number, el: number): string {
  const a = Math.round(wrapAz(az)); const A = Math.abs(a); const E = Math.round(el);
  return `${A === 0 ? 'straight on' : A === 180 ? 'from behind' : `${A}° ${a < 0 ? 'left' : 'right'}`}, ${E === 0 ? 'eye level' : `${Math.abs(E)}° ${E > 0 ? 'up' : 'down'}`}`;
}

// ---- strength and softness ----
export type StrengthId = 'subtle' | 'balanced' | 'dramatic';
export const STRENGTHS: { id: StrengthId; label: string; hint: string; intensity: number; ambient: number }[] = [
  { id: 'subtle', label: 'Subtle', hint: 'Gentle, open shadows', intensity: 40, ambient: 55 },
  { id: 'balanced', label: 'Balanced', hint: 'Clear light, soft fill', intensity: 65, ambient: 30 },
  { id: 'dramatic', label: 'Dramatic', hint: 'Strong light, deep shadows', intensity: 90, ambient: 8 },
];
/** Which strength a rig reads as (always one): key brighter than the fill by a lot = dramatic, fill as bright as the key = subtle. */
export function strengthOf(rig: LightRig): StrengthId { const d = rig.key.intensity - rig.ambient; return d <= 0 ? 'subtle' : d >= 60 ? 'dramatic' : 'balanced'; }
export function withStrength(rig: LightRig, id: StrengthId): LightRig { const s = STRENGTHS.find((x) => x.id === id) ?? STRENGTHS[1]; return { ...rig, key: { ...rig.key, intensity: s.intensity }, ambient: s.ambient }; }

export type QualityId = 'soft' | 'hard';
export const QUALITIES: { id: QualityId; label: string; hint: string; softness: number }[] = [
  { id: 'soft', label: 'Soft', hint: 'Gentle shadow edges', softness: 80 }, { id: 'hard', label: 'Hard', hint: 'Crisp, sharp shadows', softness: 20 },
];
export const qualityOf = (l: Pick<RigLight, 'softness'>): QualityId => (l.softness >= 50 ? 'soft' : 'hard');
export function withQuality(rig: LightRig, id: QualityId): LightRig { const q = QUALITIES.find((x) => x.id === id) ?? QUALITIES[0]; return { ...rig, key: { ...rig.key, softness: q.softness } }; }

/** Background brightness (the ambient fill) in plain words. */
export const ambientPlain = (a: number) => (a <= 15 ? 'Dark mood' : a <= 40 ? 'Moody' : a <= 65 ? 'Even' : 'Bright and airy');
/** Warm ↔ cool in plain words (a colour wins over it). */
export const warmthPlain = (l: Pick<RigLight, 'kelvin' | 'color'>) => (l.color ? 'Colour' : l.kelvin < 3000 ? 'Very warm' : l.kelvin < 4500 ? 'Warm' : l.kelvin < 6200 ? 'Neutral' : l.kelvin < 8000 ? 'Cool' : 'Very cool');

// ---- presets: "edited" after a tweak ----
const sameLight = (a: RigLight | undefined, b: RigLight | undefined) => (!a && !b) || (!!a && !!b && a.az === b.az && a.el === b.el && a.kelvin === b.kelvin && (a.color ?? '') === (b.color ?? '') && a.intensity === b.intensity && a.softness === b.softness);
/** The rig still says it started from a preset, but something moved since. */
export function presetEdited(rig: LightRig): boolean { const p = spherePresetOf(rig.preset); if (!p) return false; return !(sameLight(rig.key, p.rig.key) && sameLight(rig.rim, p.rig.rim) && rig.ambient === p.rig.ambient); }

/** The bar chip: "Window light · from the left". No preset: "Soft light · from the front". (A rim light is named in the chip's tooltip.) */
export function rigChipPlain(rig: LightRig): string {
  const p = spherePresetOf(rig.preset); const name = p?.label ?? `${qualityOf(rig.key) === 'soft' ? 'Soft' : 'Hard'} light`;
  return `${name} · ${shortDir(rig.key.az, rig.key.el)}`;
}

/** The light group's saved values → the rig the panel opens on. A `light` rig wins; an old draft or link without one (direction / pad /
 *  quality / brightness / colour, and a look) opens where its old fields put the light, on the preset of its look. Nothing new is sent
 *  until the user changes something, so the old prompt stays. */
export function rigOfFields(vals: Record<string, string | undefined>): LightRig {
  const p = vals.light ? parseLightRig(vals.light) : null; if (p && 'rig' in p) return p.rig;
  const r = rigFromLegacy(vals); const pr = vals.look && vals.look !== 'custom' ? SPHERE_PRESETS.find((x) => x.look === vals.look) : undefined; return pr ? { ...r, preset: pr.id } : r;
}

// ---- the preview handle: a point on the photo ↔ angles ----
const SPAN = 0.42; /* ±90° maps to ±42% from the centre, so the handle never sits on the photo's edge */
/** Where a light's handle sits on the preview (0…1 from the top-left), and whether it is behind the subject (drawn as a dashed ring). */
export function handleOf(az: number, el: number): { x: number; y: number; behind: boolean } {
  const a = wrapAz(az); const A = Math.abs(a); const behind = A > 90; const u = ((behind ? 180 - A : A) / 90) * (a < 0 ? -1 : 1);
  return { x: 0.5 + u * SPAN, y: 0.5 - (clamp(el, -90, 90) / 90) * SPAN, behind };
}
/** A point on the preview → the nearest fixed position, on the half of the sphere the light is on now (front unless it is behind). */
export function anglesOfPoint(x: number, y: number, behind = false): { az: number; el: number } {
  const u = clamp((x - 0.5) / SPAN, -1, 1); const v = clamp((0.5 - y) / SPAN, -1, 1);
  const az = behind ? (u < 0 ? -1 : 1) * (180 - Math.abs(u) * 90) : u * 90;
  return snapAngles(az, v * 90);
}
/** Where the fixed positions sit on the preview for one half (front, or behind): the snap guide drawn while you move the light. */
export function gridPoints(behind = false): { x: number; y: number; id: string }[] {
  const azs = behind ? [-135, 180, 135] : [-90, -45, 0, 45, 90];
  return [{ az: 0, el: 90 }, ...[45, 0, -45].flatMap((el) => azs.map((az) => ({ az, el }))), { az: 0, el: -90 }].map((p) => ({ ...handleOf(p.az, p.el), id: lightCell(p.az, p.el).id }));
}

// ---- the approximate preview: CSS layers over the photo ----
export interface SketchLayer { bg: string; blend: 'multiply' | 'screen' | 'soft-light' | 'normal'; opacity: number }
export interface Sketch { /** on the photo itself */ filter: string; /** over it, bottom to top */ layers: SketchLayer[] }
const rgba = (c: number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${Math.round(clamp(a, 0, 1) * 1000) / 1000})`;
const r1 = (n: number) => Math.round(n * 10) / 10;
/** Screen-space angle (CSS degrees) a light shines *toward*: from its side across the frame. */
const towards = (az: number, el: number) => { const D = Math.PI / 180; const sx = Math.sin(wrapAz(az) * D) * Math.cos(el * D); const sy = Math.sin(el * D); return { sx, sy, deg: r1((Math.atan2(sx, sy) * 180) / Math.PI + 180) }; };
/** The light sketched on the photo: the far side darkens (hard light = a crisp edge, soft = a long fade), a glow on the near side in the
 *  light's colour, a colour wash, a bright edge for a backlight or rim, and the photo's contrast follows the strength. */
export function sketchOf(rig: LightRig): Sketch {
  const k = rig.key; const I = k.intensity / 100; const amb = rig.ambient / 100; const soft = k.softness / 100; const col = lightRgb(k);
  const h = handleOf(k.az, k.el); const t = towards(k.az, k.el); const side = Math.hypot(t.sx, t.sy); const layers: SketchLayer[] = [];
  const dark = Math.min(0.92, (1 - amb * 0.85) * (0.62 + 0.38 * I));
  // the shadow side
  if (h.behind) layers.push({ bg: `radial-gradient(ellipse 70% 75% at 50% 52%,rgba(0,0,0,${r1(dark * 0.75 * 10) / 10}) 0%,rgba(0,0,0,${r1(dark * 0.35 * 10) / 10}) 100%)`, blend: 'multiply', opacity: 1 });
  else if (side < 0.3) layers.push({ bg: `radial-gradient(ellipse 85% 85% at ${r1(h.x * 100)}% ${r1(h.y * 100)}%,rgba(0,0,0,0) ${r1(35 + soft * 25)}%,rgba(0,0,0,${r1(dark * 0.6 * 100) / 100}) 100%)`, blend: 'multiply', opacity: 1 });
  else { const w = 6 + soft * 38; const mid = 50 + (1 - side) * 10;
    layers.push({ bg: `linear-gradient(${t.deg}deg,rgba(0,0,0,0) ${r1(mid - w)}%,rgba(0,0,0,${r1(dark * 100) / 100}) ${r1(Math.min(100, mid + w))}%)`, blend: 'multiply', opacity: 1 }); }
  // the glow where the light lands (a backlight leaves a bright edge instead)
  if (h.behind) layers.push({ bg: `radial-gradient(ellipse 62% 66% at ${r1(h.x * 100)}% ${r1(h.y * 100)}%,rgba(0,0,0,0) 62%,${rgba(col, 0.85 * I)} 100%)`, blend: 'screen', opacity: 1 });
  else layers.push({ bg: `radial-gradient(circle at ${r1(h.x * 100)}% ${r1(h.y * 100)}%,${rgba(col, 0.62 * I + 0.12)} 0%,${rgba(col, 0)} ${r1(40 + soft * 40)}%)`, blend: 'screen', opacity: 1 });
  // the light's colour over everything it reaches
  layers.push({ bg: rgba(col, 1), blend: 'soft-light', opacity: r1((0.3 + 0.5 * I) * 100) / 100 });
  // rim: a bright edge on its side
  if (rig.rim) { const rc = lightRgb(rig.rim); const rt = towards(rig.rim.az, rig.rim.el);
    layers.push({ bg: `linear-gradient(${rt.deg}deg,${rgba(rc, 0.9 * (rig.rim.intensity / 100))} 0%,${rgba(rc, 0)} 22%)`, blend: 'screen', opacity: 1 }); }
  const contrast = 1 + (1 - amb) * 0.4 * (1 - soft * 0.4); const bright = 0.62 + amb * 0.3 + I * 0.18;
  return { filter: `brightness(${r1(bright * 100) / 100}) contrast(${r1(contrast * 100) / 100})`, layers };
}
