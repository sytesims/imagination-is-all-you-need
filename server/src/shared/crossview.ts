/**
 * H3 runner Step 3 (Oct 26): "New angle · H3 CrossView · cloud", the shared numbers (server parse + web pad). Isomorphic: no imports.
 * Comfy's own Reshoot recipe (Comfy-Org/comfy-reshoot, MIT): MiniMax H3 Ref2VA + CrossView-Warp v1 LoRA, guided by a MoGe-2 depth warp of the take
 * to the new camera (CrossViewWarp, comfyrob/ComfyUI-CrossViewWarp fork of cseti007's pack, Apache-2.0). One camera for the whole clip.
 *
 * Camera: azimuth (deg, negative = orbit to the left, as the pad's Left), elevation (deg, positive = camera above), distance (1 = the take's).
 * Zones (the node pack's README + Comfy's picker): green = checked (ellipse to ±45° azimuth, +30° / −20° elevation); yellow = trained, less reliable
 * (to ±90°, +45° / −35°); red = the hidden side is invented (azimuth ±90° and anything past the yellow ellipse).
 */
export const CROSSVIEW_PROVIDER = 'cloud-h3-crossview';
export const CROSSVIEW_LABEL = 'New angle · H3 CrossView · cloud';
export const CROSSVIEW_AZ = { min: -90, max: 90, default: -30 } as const;
export const CROSSVIEW_EL = { min: -45, max: 45, default: 15 } as const;
/** Comfy's public app keeps distance to 0.5–2; the LoRA card says distance isn't followed reliably yet. */
export const CROSSVIEW_DIST = { min: 0.5, max: 2, default: 1 } as const;
/** Clip length the recipe takes (Comfy's app refuses outside 5–15 s). From 4 s (our upload minimum) a short take is padded to 5 s. */
export const CROSSVIEW_SECONDS = { min: 5, max: 15, padFrom: 4 } as const;
/** Output size: pixel budget in megapixels (CrossViewPrepareClip, multiple of 32, shape follows the take). */
export const CROSSVIEW_SIZES = { '480p': 0.4, '768p': 1 } as const;
export type CrossViewSize = keyof typeof CROSSVIEW_SIZES;
export const CROSSVIEW_RESOLUTIONS = Object.keys(CROSSVIEW_SIZES) as CrossViewSize[];
export type CrossViewZone = 'green' | 'yellow' | 'red';
const ell = (az: number, el: number, a: number, up: number, down: number) => (az / a) ** 2 + (el / (el >= 0 ? up : down)) ** 2;
export function crossviewZone(az: number, el: number): CrossViewZone {
  if (ell(az, el, 45, 30, 20) <= 1) return 'green';
  return ell(az, el, 90, 45, 35) < 1 ? 'yellow' : 'red';
}
export const CROSSVIEW_ZONE_WORDS: Record<CrossViewZone, string> = {
  green: 'Green: a checked angle, the most reliable',
  yellow: 'Yellow: trained but less reliable, details may drift',
  red: 'Red: the camera sees what the take never showed, so the hidden side is invented',
};
/** Very small moves: the LoRA misbehaves when the warp is almost the take (node pack README). */
export const crossviewTooSmall = (az: number, el: number) => Math.abs(az) < 5 && Math.abs(el) < 5;
/** Frames the recipe renders for a clip: floor(min(s, 15) × 24) snapped down to 17k+5 (MiniMax H3). */
export const crossviewFrames = (seconds: number) => { const n = Math.max(5, Math.floor(Math.min(seconds, CROSSVIEW_SECONDS.max) * 24)); return n - ((n - 5) % 17); };
/** Width × height CrossViewPrepareClip makes for a w×h take (source shape, multiple of 32). Mirrors the node's arithmetic for display only. */
export function crossviewSize(w: number, h: number, size: CrossViewSize) {
  const s = Math.sqrt((CROSSVIEW_SIZES[size] * 1024 * 1024) / (w * h)); const r = (v: number) => Math.max(32, Math.round((v * s) / 32) * 32);
  return { width: r(w), height: r(h) };
}
