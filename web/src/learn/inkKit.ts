/**
 * The "Ink & Pop-up" look for the learn books (2026-10-24), our own three.js code:
 *  - ink(): a hatching material. Half-Lambert light from the upper left picks a tone; darker tones add line sets (one diagonal, then the
 *    cross diagonal, then horizontals). Lines are laid in screen space at a fixed pixel spacing, anti-aliased with fwidth, so they never
 *    shimmer; colours are warm paper tints with a dark ink.
 *  - outlines: an inverted hull drawn in ink, pushed out in screen space by a fixed pixel width along a smoothed normal (no corner cracks).
 *  - flow(): an orange dashed tube with a soft halo whose dashes run along the curve.
 *  - simple props made from primitives (bottle, box, shoe, plinth, camera, phone, price tag, cart…). Self-contained on purpose so they can
 *    be swapped for a shared prop kit later.
 * Everything here is created from code; no models or images are downloaded.
 */
import { ACCENT, drawCard } from './pageArt';
import type { ArtSlot } from './ecomArt';

export type Kind = 'paper' | 'light' | 'glass' | 'label' | 'dark' | 'wood' | 'kraft' | 'peach' | 'sage' | 'terracotta' | 'accent' | 'gold' | 'edge' | 'cover' | 'cream';
const PALETTE: Record<Kind, [string, string]> = {
  paper: ['#F7F1E6', '#26221E'], light: ['#FFF7E6', '#8E7E64'], glass: ['#E6EDEC', '#22303A'], label: ['#FBF6EC', '#26221E'], dark: ['#4A4540', '#14110F'],
  wood: ['#E8CFA6', '#5A3D1E'], kraft: ['#D9B888', '#4E3518'], peach: ['#F6C9A8', '#6E3A1C'], sage: ['#CBD5BA', '#34402A'], terracotta: ['#E39C6C', '#5A2A10'],
  accent: ['#FFB27A', '#8A3A05'], gold: ['#F5D08A', '#6B4A10'], edge: ['#E6DCC9', '#8E8170'], cover: ['#232428', '#08080A'], cream: ['#FFF9EE', '#5A524A'],
};

const INK_VERT = `varying vec3 vN; void main(){ vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`;
const INK_FRAG = `uniform vec3 uBase; uniform vec3 uInk; uniform vec3 uL; uniform float uPx; uniform float uFade; varying vec3 vN;
float stripe(float c, float w){ float d = abs(fract(c) - 0.5); float aa = fwidth(c) * 0.75; return 1.0 - smoothstep(w - aa, w + aa, d); }
void main(){
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  float t = clamp(dot(n, uL) * 0.5 + 0.5, 0.0, 1.0); t = mix(t, t * 0.85 + 0.15 * max(n.y, 0.0), 0.5);
  vec2 p = gl_FragCoord.xy / uPx;
  float h1 = stripe((p.x + p.y) * 0.7071, mix(0.0, 0.2, smoothstep(0.74, 0.5, t)));
  float h2 = stripe((p.x - p.y) * 0.7071, mix(0.0, 0.18, smoothstep(0.52, 0.3, t)));
  float h3 = stripe(p.y + 0.5, mix(0.0, 0.16, smoothstep(0.32, 0.12, t)));
  float ink = max(h1, max(h2, h3)) * uFade;
  vec3 base = uBase * mix(0.84, 1.0, smoothstep(0.15, 0.85, t));
  gl_FragColor = vec4(mix(base, uInk, ink * 0.82), 1.0);
  #include <colorspace_fragment>
}`;
const HULL_VERT = `uniform vec2 uRes; uniform float uW; attribute vec3 aSmooth;
void main(){ vec4 c = projectionMatrix * modelViewMatrix * vec4(position, 1.0); vec3 nv = normalize(normalMatrix * aSmooth);
  vec2 d = (projectionMatrix * vec4(nv, 0.0)).xy; float l = length(d); d = l > 1e-5 ? d / l : vec2(0.0); c.xy += d * uW * c.w * 2.0 / uRes; gl_Position = c; }`;
const HULL_FRAG = `uniform vec3 uInk; void main(){ gl_FragColor = vec4(uInk, 1.0);
  #include <colorspace_fragment>
}`;
const FLOW_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FLOW_FRAG = `uniform vec3 uCol; uniform float uTime; uniform float uShow; uniform float uDash; uniform float uHalo; varying vec2 vUv;
void main(){ float d = fract(vUv.x * uDash - uTime * 0.9); float on = smoothstep(0.0, 0.06, d) * (1.0 - smoothstep(0.52, 0.58, d));
  float head = smoothstep(uShow - 0.08, uShow, vUv.x); float a = uHalo > 0.5 ? 0.16 : on; a *= 1.0 - head;
  if (a < 0.01) discard; gl_FragColor = vec4(uCol, a);
  #include <colorspace_fragment>
}`;

export type Kit = ReturnType<typeof makeKit>;
export function makeKit(T: any, o: { reduced: boolean }) {
  const res = { value: new T.Vector2(1, 1) }; const px = { value: 5 }; const time = { value: 0 }; const L = new T.Vector3(-0.55, 0.8, 0.35).normalize();
  const mats = new Map<Kind, any>(); const hulls = new Map<string, any>(); const textures: any[] = []; const flows: any[] = [];
  const ink = (k: Kind) => { let m = mats.get(k); if (!m) { const [b, i] = PALETTE[k];
    m = new T.ShaderMaterial({ vertexShader: INK_VERT, fragmentShader: INK_FRAG, uniforms: { uBase: { value: new T.Color(b) }, uInk: { value: new T.Color(i) }, uL: { value: L }, uPx: px, uFade: { value: 1 } } });
    mats.set(k, m); } return m; };
  const hull = (color = '#1E1A16', w = 1.6) => { const key = color + w; let m = hulls.get(key); if (!m) {
    m = new T.ShaderMaterial({ vertexShader: HULL_VERT, fragmentShader: HULL_FRAG, side: T.BackSide, uniforms: { uRes: res, uW: { value: w }, uInk: { value: new T.Color(color) } } }); hulls.set(key, m); } return m; };
  /** Averaged normals per position (an attribute the hull pushes along), so hard-edged shapes get a closed outline. */
  const smooth = (geo: any) => { if (geo.getAttribute('aSmooth')) return; const p = geo.getAttribute('position'); const n = geo.getAttribute('normal'); const acc = new Map<string, number[]>(); const key = (i: number) => `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    for (let i = 0; i < p.count; i++) { const k = key(i); const a = acc.get(k) ?? [0, 0, 0]; a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i); acc.set(k, a); }
    const out = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const a = acc.get(key(i))!; const l = Math.hypot(a[0], a[1], a[2]) || 1; out[i * 3] = a[0] / l; out[i * 3 + 1] = a[1] / l; out[i * 3 + 2] = a[2] / l; }
    geo.setAttribute('aSmooth', new T.BufferAttribute(out, 3)); };
  /** A shaded, outlined solid. */
  const solid = (geo: any, k: Kind, outline = true, w = 1.6) => { const g = new T.Group(); g.add(new T.Mesh(geo, ink(k))); if (outline) { smooth(geo); g.add(new T.Mesh(geo, hull(undefined, w))); } return g; };
  const at = (obj: any, x = 0, y = 0, z = 0, ry = 0) => { obj.position.set(x, y, z); obj.rotation.y = ry; return obj; };
  const group = (...kids: any[]) => { const g = new T.Group(); kids.forEach((k) => g.add(k)); return g; };

  // ---------- textures for cards ----------
  const cardTex = (kind: string, img: HTMLImageElement | null = null, slot?: ArtSlot) => { const c = document.createElement('canvas'); drawCard(c, kind, img, slot);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; textures.push(t); return t; };
  const cardMats: any[] = [];
  const cardMat = (tex: any) => { const m = new T.MeshBasicMaterial({ map: tex, toneMapped: false }); cardMats.push(m); return m; };

  // ---------- primitives ----------
  const box = (w: number, h: number, d: number, k: Kind, outline = true) => { const geo = new T.BoxGeometry(w, h, d); geo.translate(0, h / 2, 0); return solid(geo, k, outline); };
  const cyl = (r1: number, r2: number, h: number, k: Kind, seg = 32, open = false) => { const geo = new T.CylinderGeometry(r1, r2, h, seg, 1, open); geo.translate(0, h / 2, 0); return solid(geo, k); };
  const sphere = (r: number, k: Kind) => solid(new T.SphereGeometry(r, 24, 16), k);
  const lathe = (pts: [number, number][], k: Kind, seg = 40) => solid(new T.LatheGeometry(pts.map(([r, y]) => new T.Vector2(r, y)), seg), k);

  // ---------- props (origin at the base, standing on +y; sizes in page widths, 1 = one page) ----------
  const bottle = (s = 1, k: Kind = 'glass') => { const g = group(
    lathe([[0.001, 0], [0.058, 0], [0.064, 0.008], [0.064, 0.15], [0.058, 0.172], [0.03, 0.19], [0.022, 0.196], [0.022, 0.212], [0.001, 0.212]], k),
    at(cyl(0.0655, 0.0655, 0.07, 'label', 40, true), 0, 0.045), at(cyl(0.026, 0.028, 0.055, 'dark'), 0, 0.21), at(sphere(0.022, 'dark'), 0, 0.272));
    g.children[3].scale.set(1, 1.25, 1); g.scale.setScalar(s); return g; };
  const sweep = (w: number, k: Kind, depth = 0.34, high = 0.3) => { const s = new T.Shape(); const th = 0.012, r = 0.09;
    s.moveTo(-depth / 2, high); s.lineTo(-depth / 2, r); s.quadraticCurveTo(-depth / 2, 0, -depth / 2 + r, 0); s.lineTo(depth / 2, 0); s.lineTo(depth / 2, th);
    s.lineTo(-depth / 2 + r, th); s.quadraticCurveTo(-depth / 2 + th, th, -depth / 2 + th, r); s.lineTo(-depth / 2 + th, high); s.closePath();
    const geo = new T.ExtrudeGeometry(s, { depth: w, bevelEnabled: false, curveSegments: 10 }); geo.translate(0, 0, -w / 2); geo.rotateY(-Math.PI / 2); geo.computeVertexNormals(); return solid(geo, k); };
  const softbox = () => { const g = group(cyl(0.006, 0.008, 0.3, 'dark', 8), at(box(0.2, 0.15, 0.025, 'light'), 0, 0.26), at(cyl(0.05, 0.05, 0.01, 'dark', 16), 0, 0));
    g.children[1].rotation.x = -0.25; return g; };
  const camera = () => { const body = group(box(0.13, 0.08, 0.065, 'dark'), at(box(0.04, 0.02, 0.04, 'dark'), -0.03, 0.08), at(cyl(0.008, 0.008, 0.01, 'accent', 12), 0.045, 0.08));
    const lens = cyl(0.03, 0.034, 0.05, 'dark'); lens.rotation.x = Math.PI / 2; lens.position.set(0, 0.04, 0.03); body.add(lens); const ring = cyl(0.036, 0.036, 0.008, 'accent'); ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.04, 0.078); body.add(ring);
    body.position.y = 0.17; const g = group(body); for (let i = 0; i < 3; i++) { const leg = cyl(0.004, 0.006, 0.19, 'dark', 6); const a = (i / 3) * Math.PI * 2; leg.position.set(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05); leg.rotation.set(Math.sin(a) * 0.26, 0, -Math.cos(a) * 0.26); g.add(leg); } return g; };
  const shoe = (s = 1, k: Kind = 'paper') => { const up = solid(new T.CapsuleGeometry(0.042, 0.13, 6, 16), k); up.rotation.z = Math.PI / 2; up.scale.set(0.85, 1, 1); up.position.set(-0.005, 0.05, 0);
    const g = group(box(0.27, 0.026, 0.1, 'cream'), up, at(box(0.07, 0.07, 0.085, k), -0.09, 0.02), at(box(0.06, 0.03, 0.06, k), -0.07, 0.085));
    for (let i = 0; i < 3; i++) g.add(at(box(0.008, 0.006, 0.05, 'accent', false), 0.0 + i * 0.024, 0.088 - i * 0.008)); g.scale.setScalar(s); return g; };
  const mug = () => group(lathe([[0.001, 0], [0.04, 0], [0.042, 0.01], [0.044, 0.09], [0.04, 0.09], [0.038, 0.012], [0.001, 0.012]], 'cream'), at((() => { const t = solid(new T.TorusGeometry(0.024, 0.007, 8, 20, Math.PI), 'cream'); t.rotation.z = -Math.PI / 2; return t; })(), 0.044, 0.045));
  const plant = () => { const g = group(cyl(0.035, 0.026, 0.06, 'terracotta')); for (let i = 0; i < 6; i++) { const l = sphere(0.04, 'sage'); l.scale.set(0.35, 1, 0.16); const a = (i / 6) * Math.PI * 2; l.position.set(Math.cos(a) * 0.022, 0.1, Math.sin(a) * 0.022); l.rotation.set(Math.sin(a) * 0.5, -a, -Math.cos(a) * 0.5); g.add(l); } return g; };
  const windowFrame = (w = 0.3, h = 0.32) => { const t = 0.016; const g = group(at(box(w, t, t, 'wood'), 0, 0), at(box(w, t, t, 'wood'), 0, h - t), at(box(t, h, t, 'wood'), -w / 2 + t / 2, 0), at(box(t, h, t, 'wood'), w / 2 - t / 2, 0), at(box(t * 0.7, h, t * 0.7, 'wood'), 0, 0), at(box(w, t * 0.7, t * 0.7, 'wood'), 0, h / 2));
    const glass = new T.Mesh(new T.PlaneGeometry(w - t, h - t), new T.MeshBasicMaterial({ color: new T.Color('#FFE7C4'), transparent: true, opacity: 0.55, toneMapped: false })); glass.position.set(0, h / 2, -0.002); g.add(glass); return g; };
  const figure = () => { const g = group(at(cyl(0.012, 0.01, 0.13, 'dark', 10), -0.018, 0), at(cyl(0.012, 0.01, 0.13, 'dark', 10), 0.018, 0), at(solid(new T.CapsuleGeometry(0.04, 0.09, 6, 14), 'peach'), 0, 0.2), at(sphere(0.032, 'cream'), 0, 0.31),
    at(box(0.07, 0.08, 0.025, 'accent'), 0.07, 0.07)); const arm = cyl(0.009, 0.009, 0.12, 'peach', 8); arm.position.set(0.05, 0.25, 0); arm.rotation.z = 2.75; g.add(arm); const arm2 = cyl(0.009, 0.009, 0.12, 'peach', 8); arm2.position.set(-0.05, 0.25, 0); arm2.rotation.z = -2.9; g.add(arm2); return g; };
  /** A picture card on a little stand (art slot picture, or a drawn card). */
  const frame = (w: number, h: number, tex: any, k: Kind = 'paper') => { const g = group(box(w, h, 0.012, k)); const face = new T.Mesh(new T.PlaneGeometry(w * 0.88, h * 0.88), cardMat(tex)); face.position.set(0, h / 2 + h * 0.02, 0.0065); g.add(face);
    const leg = box(0.012, h * 0.7, 0.012, k); leg.position.set(0, 0, -h * 0.18); leg.rotation.x = -0.35; g.add(leg); g.rotation.x = -0.12; return g; };
  const die = () => { const s = 0.07; const g = group(box(s, s, s, 'paper')); const pip = (x: number, y: number, z: number, rx: number, rz: number) => { const p = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 0.004, 12), ink('dark')); p.position.set(x, y, z); p.rotation.set(rx, 0, rz); g.add(p); };
    pip(0, s + 0.001, 0, 0, 0); for (const [a, b] of [[-0.018, -0.018], [0.018, 0.018]]) pip(a, s / 2 + b, s / 2 + 0.001, Math.PI / 2, 0); for (const [a, b] of [[-0.018, -0.018], [0, 0], [0.018, 0.018]]) pip(s / 2 + 0.001, s / 2 + a, b, 0, Math.PI / 2); g.rotation.y = 0.5; return g; };
  const easel = (w: number, h: number, tex: any) => { const g = group(); const board = box(w, h, 0.014, 'cream'); board.position.y = 0.04; g.add(board); const face = new T.Mesh(new T.PlaneGeometry(w * 0.92, h * 0.92), cardMat(tex)); face.position.set(0, 0.04 + h / 2, 0.0075); g.add(face);
    for (const x of [-w * 0.35, w * 0.35]) { const l = cyl(0.006, 0.006, h * 0.95, 'wood', 6); l.position.set(x, 0, 0.03); l.rotation.x = -0.1; g.add(l); } const back = cyl(0.006, 0.006, h, 'wood', 6); back.position.set(0, 0, -0.12); back.rotation.x = 0.28; g.add(back); g.rotation.x = -0.08; return g; };
  const priceTag = (s = 1) => { const sh = new T.Shape(); sh.moveTo(-0.05, -0.03); sh.lineTo(0.03, -0.03); sh.lineTo(0.06, 0); sh.lineTo(0.03, 0.03); sh.lineTo(-0.05, 0.03); sh.closePath(); const hole = new T.Path(); hole.absarc(0.03, 0, 0.008, 0, Math.PI * 2, true); sh.holes.push(hole);
    const geo = new T.ExtrudeGeometry(sh, { depth: 0.008, bevelEnabled: false }); geo.computeVertexNormals(); const tag = solid(geo, 'accent'); tag.rotation.z = Math.PI / 2; tag.position.y = 0.05; const g = group(tag);
    const str = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(0, 0.08, 0.004), new T.Vector3(0.02, 0.11, 0.004), new T.Vector3(0.0, 0.14, 0.004)]), 12, 0.0025, 5), ink('dark')); g.add(str); g.scale.setScalar(s); return g; };
  const turntable = () => group(cyl(0.15, 0.155, 0.03, 'dark', 48), at(cyl(0.13, 0.13, 0.008, 'cream', 48), 0, 0.03));
  const speaker = () => { const g = group(box(0.15, 0.24, 0.12, 'wood')); for (const [y, r] of [[0.16, 0.04], [0.065, 0.05]]) { const c = cyl(r, r * 0.8, 0.01, 'cream', 28); c.rotation.x = Math.PI / 2; c.position.set(0, y, 0.062); g.add(c); const d = cyl(r * 0.35, r * 0.35, 0.012, 'accent', 16); d.rotation.x = Math.PI / 2; d.position.set(0, y, 0.066); g.add(d); } return g; };
  const note = () => { const head = sphere(0.022, 'accent'); head.scale.set(1.25, 0.85, 0.8); const g = group(head, at(cyl(0.004, 0.004, 0.09, 'dark', 6), 0.022, 0), at(box(0.03, 0.012, 0.006, 'dark'), 0.036, 0.08)); return g; };
  const phone = (tex: any) => { const g = group(box(0.13, 0.25, 0.014, 'dark')); const scr = new T.Mesh(new T.PlaneGeometry(0.115, 0.225), cardMat(tex)); scr.position.set(0, 0.125, 0.0075); g.add(scr);
    const leg = box(0.03, 0.12, 0.01, 'dark'); leg.position.set(0, 0, -0.05); leg.rotation.x = -0.45; g.add(leg); g.rotation.x = -0.22; return g; };
  const cart = () => { const t = 0.008; const W = 0.2, H = 0.1, D = 0.13, y0 = 0.07; const g = group(at(box(W, t, D, 'accent'), 0, y0), at(box(W, H, t, 'accent'), 0, y0, D / 2), at(box(W, H, t, 'accent'), 0, y0, -D / 2), at(box(t, H, D, 'accent'), W / 2, y0), at(box(t, H, D, 'accent'), -W / 2, y0));
    const h = cyl(0.005, 0.005, 0.1, 'dark', 6); h.position.set(-W / 2 - 0.01, y0 + H, 0); h.rotation.z = 0.5; g.add(h); const bar = cyl(0.005, 0.005, D + 0.03, 'dark', 6); bar.rotation.x = Math.PI / 2; bar.position.set(-W / 2 - 0.055, y0 + H + 0.085, 0); g.add(bar);
    for (const [x, z] of [[-0.08, -0.05], [-0.08, 0.05], [0.08, -0.05], [0.08, 0.05]]) { const w = solid(new T.TorusGeometry(0.018, 0.007, 8, 16), 'dark'); w.position.set(x, 0.022, z); g.add(w); const s = cyl(0.004, 0.004, y0 - 0.02, 'dark', 6); s.position.set(x, 0.02, z); g.add(s); } return g; };
  const shipBox = () => group(box(0.18, 0.13, 0.15, 'kraft'), at(box(0.03, 0.002, 0.152, 'accent', false), 0, 0.13), at(box(0.18, 0.002, 0.004, 'dark', false), 0, 0.13));
  const coins = (n = 5) => { const g = group(); for (let i = 0; i < n; i++) { const c = cyl(0.04, 0.04, 0.012, 'gold', 28); c.position.set((i % 2) * 0.004, i * 0.0125, 0); g.add(c); } return g; };
  const plinth = (r = 0.085, h = 0.08, k: Kind = 'cream') => cyl(r, r, h, k, 48);
  const flat = (w: number, d: number, k: Kind) => box(w, 0.006, d, k);
  /** Direct a Shot icon: a little wire cube on a stand. */
  const cube = () => { const g = group(); const e = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(0.09, 0.09, 0.09)), new T.LineBasicMaterial({ color: new T.Color(ACCENT) })); e.position.y = 0.06; g.add(e); g.add(at(cyl(0.03, 0.035, 0.015, 'dark', 16), 0, 0)); g.add(at(sphere(0.012, 'accent'), 0, 0.06)); return g; };

  // ---------- flows ----------
  /** An orange dashed flow along points (a halo tube under a dashed core). The dashes run while the book is idle (still with reduced motion). */
  const flow = (pts: number[][], r = 0.0065) => { const curve = new T.CatmullRomCurve3(pts.map((p) => new T.Vector3(p[0], p[1], p[2]))); const len = curve.getLength();
    const uni = { uCol: { value: new T.Color(ACCENT) }, uTime: time, uShow: { value: 0 }, uDash: { value: Math.max(4, Math.round(len * 26)) } };
    const core = new T.Mesh(new T.TubeGeometry(curve, 64, r, 8, false), new T.ShaderMaterial({ vertexShader: FLOW_VERT, fragmentShader: FLOW_FRAG, transparent: true, depthWrite: false, uniforms: { ...uni, uHalo: { value: 0 } } }));
    const halo = new T.Mesh(new T.TubeGeometry(curve, 64, r * 2.8, 8, false), new T.ShaderMaterial({ vertexShader: FLOW_VERT, fragmentShader: FLOW_FRAG, transparent: true, depthWrite: false, uniforms: { ...uni, uHalo: { value: 1 } } }));
    const g = group(halo, core); const endA = new T.Mesh(new T.SphereGeometry(r * 2.2, 12, 8), new T.MeshBasicMaterial({ color: new T.Color(ACCENT), toneMapped: false })); endA.position.copy(curve.getPoint(1)); g.add(endA);
    flows.push({ show: uni.uShow, end: endA }); return g; };

  return {
    T, res, px, time, flows, textures, ink, hull, solid, at, group, cardTex, cardMat,
    box, cyl, sphere, lathe, bottle, sweep, softbox, camera, shoe, mug, plant, windowFrame, figure, frame, die, easel, priceTag, turntable, speaker, note, phone, cart, shipBox, coins, plinth, flat, cube, flow,
    /** Free the GPU side of everything the kit made (materials, textures; geometries are freed by the scene walk). */
    dispose() { mats.forEach((m) => m.dispose()); hulls.forEach((m) => m.dispose()); cardMats.forEach((m) => m.dispose()); textures.forEach((t) => t.dispose()); mats.clear(); hulls.clear(); },
    reduced: o.reduced,
  };
}
