/**
 * lightMap (hidden helper, 2026-10-24): a small light-direction map from a light rig, the kind of map a future local IC-Light workflow
 * could take as its light condition. Same cheap dome shading as the sphere's preview card (lightSphereEngine.ts), on a plain 2D canvas
 * (no three, no model). Not used by any page yet.
 */
import { lightRgb, type LightRig } from '../../../server/src/shared/lightRig';

const D2R = Math.PI / 180;
const dirOf = (az: number, el: number) => [Math.cos(el * D2R) * Math.sin(az * D2R), Math.sin(el * D2R), Math.cos(el * D2R) * Math.cos(az * D2R)];
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Render the map: `colour` false = greyscale luminance, true = tinted by each light's colour. Returns the canvas (call toDataURL for a PNG). */
export function lightMap(rig: LightRig, opts: { width?: number; height?: number; colour?: boolean } = {}): HTMLCanvasElement {
  const w = opts.width ?? 64, h = opts.height ?? 64; const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!; const img = g.createImageData(w, h);
  const k = dirOf(rig.key.az, rig.key.el); const kc = lightRgb(rig.key).map((x) => x / 255); const kI = (rig.key.intensity / 100) * 1.15; const soft = rig.key.softness / 100;
  const r = rig.rim ? dirOf(rig.rim.az, rig.rim.el) : null; const rc = rig.rim ? lightRgb(rig.rim).map((x) => x / 255) : [0, 0, 0]; const rI = rig.rim ? (rig.rim.intensity / 100) * 1.1 : 0;
  const amb = 0.05 + (rig.ambient / 100) * 0.85; const wrap = 0.04 + soft * 0.9;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = (x + 0.5) / w - 0.5, py = 0.5 - (y + 0.5) / h; const nz = 1; const l = Math.hypot(px * 2.2, py * 2.2, nz); const n = [(px * 2.2) / l, (py * 2.2) / l, nz / l];
    const lam = n[0] * k[0] + n[1] * k[1] + n[2] * k[2]; const dk = smooth(-wrap * 0.7, wrap * 0.7 + 0.03, lam) * (0.45 + 0.55 * Math.max(lam, 0));
    const pl = Math.hypot(px, py) || 1e-5; const edge = smooth(0.18, 0.62, pl * 1.25);
    const side = (d: number[]) => { const dl = Math.hypot(d[0], d[1]) || 1e-5; const s = Math.max(0, (px / pl) * (d[0] / dl) + (py / pl) * (d[1] / dl)); return edge * s * s; };
    const backK = smooth(0.15, -0.7, k[2]); const kt = dk * 1.25 + side(k) * backK * 1.4; const rt = r ? side(r) * 1.6 + Math.max(0, n[0] * r[0] + n[1] * r[1] + n[2] * r[2]) * 0.35 : 0;
    const col = [0, 1, 2].map((i) => amb + kc[i] * kI * kt + rc[i] * rI * rt); const i4 = (y * w + x) * 4;
    if (opts.colour) for (let i = 0; i < 3; i++) img.data[i4 + i] = Math.round(Math.min(1, col[i]) * 255);
    else { const v = Math.round(Math.min(1, 0.2126 * col[0] + 0.7152 * col[1] + 0.0722 * col[2]) * 255); img.data[i4] = img.data[i4 + 1] = img.data[i4 + 2] = v; }
    img.data[i4 + 3] = 255;
  }
  g.putImageData(img, 0, 0); return c;
}
