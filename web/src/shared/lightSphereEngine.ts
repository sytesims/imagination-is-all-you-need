/**
 * The light sphere's three.js scene (imperative, no React): a hairline wireframe globe around a lit card of the photo, a glowing handle
 * per light, a soft beam from each light to the subject, and hairline guides (latitude + meridian) through the active light.
 * Renders on demand only (each `setRig` / photo load calls render once); there is no animation loop. three is imported lazily here,
 * so it loads only when a sphere opens. Used by shared/LightSphere.tsx.
 */
import { lightRgb, type LightRig } from '../../../server/src/shared/lightRig';

export type Which = 'key' | 'rim';
export interface SphereEngine {
  setRig(rig: LightRig, active: Which): void; setPhoto(url: string | null): void;
  /** the light handle under a canvas point (CSS px), if any */ pick(x: number, y: number): Which | null;
  /** the point on the sphere's near side under a canvas point, as az / el */ hitSphere(x: number, y: number): { az: number; el: number } | null;
  /** 'orbit': turn the camera round the subject (degrees; 0 = from the photo's camera, 180 = from behind) */ setView(yaw: number): void;
  dispose(): void;
}
export const SPHERE_R = 1.6;
const D2R = Math.PI / 180;
const ORANGE = 0xff7a1a;

/** Light position on the sphere: az 0 = toward the camera (+z), −90 = frame left (−x), el up (+y). */
export const sph = (az: number, el: number, r = SPHERE_R): [number, number, number] => [r * Math.cos(el * D2R) * Math.sin(az * D2R), r * Math.sin(el * D2R), r * Math.cos(el * D2R) * Math.cos(az * D2R)];

function canvasTex(T: any, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!); const t = new T.CanvasTexture(c); t.minFilter = T.LinearFilter; return t;
}
/** No photo yet: a quiet head-and-shoulders silhouette on the card. */
function silhouette(T: any) {
  return canvasTex(T, 256, 320, (g) => {
    const bg = g.createLinearGradient(0, 0, 0, 320); bg.addColorStop(0, '#2a2c30'); bg.addColorStop(1, '#1a1b1e'); g.fillStyle = bg; g.fillRect(0, 0, 256, 320);
    const fig = g.createLinearGradient(0, 60, 0, 320); fig.addColorStop(0, '#9a9ca2'); fig.addColorStop(1, '#5d5f64'); g.fillStyle = fig;
    g.beginPath(); g.ellipse(128, 120, 46, 56, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(40, 320); g.bezierCurveTo(44, 236, 84, 206, 128, 204); g.bezierCurveTo(172, 206, 212, 236, 216, 320); g.closePath(); g.fill();
    g.fillRect(110, 168, 36, 44);
  });
}

const CARD_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
/* Cheap relight: the card is shaded as a gentle dome. Soft light wraps past the terminator, hard light cuts it; a light behind the subject
   leaves an edge glow on its side; the rim light adds an outline; ambient lifts everything. Works in the photo's own sRGB values. */
const CARD_FS = `
uniform sampler2D map; uniform vec3 kDir; uniform vec3 kCol; uniform float kInt; uniform float kSoft;
uniform vec3 rDir; uniform vec3 rCol; uniform float rInt; uniform float amb; varying vec2 vUv;
float edgeGlow(vec2 p, vec3 d){ vec2 q = normalize(p + 1e-5); vec2 s = normalize(d.xy + 1e-5); float side = max(dot(q, s), 0.0); float e = smoothstep(0.18, 0.62, length(p * 1.25)); return e * side * side; }
void main(){
  vec4 tex = texture2D(map, vUv); vec2 p = vUv - 0.5; vec3 n = normalize(vec3(p * 2.2, 1.0));
  float lam = dot(n, kDir); float w = 0.04 + kSoft * 0.9;
  float dk = smoothstep(-w * 0.7, w * 0.7 + 0.03, lam) * (0.45 + 0.55 * max(lam, 0.0));
  float backK = smoothstep(0.15, -0.7, kDir.z);
  float lr = max(dot(n, rDir), 0.0);
  vec3 light = vec3(0.05 + amb * 0.85) + kCol * kInt * (dk * 1.25 + edgeGlow(p, kDir) * backK * 1.4) + rCol * rInt * (edgeGlow(p, rDir) * 1.6 + lr * 0.35);
  gl_FragColor = vec4(tex.rgb * light, 1.0);
}`;
const BALL_VS = `varying vec3 vN; varying vec3 vV; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`;
const BALL_FS = `
uniform vec3 kDir; uniform vec3 kCol; uniform float kInt; uniform float kSoft; uniform vec3 rDir; uniform vec3 rCol; uniform float rInt; uniform float amb; varying vec3 vN; varying vec3 vV;
void main(){
  vec3 n = normalize(vN); float lam = dot(n, kDir); float w = 0.04 + kSoft * 0.9;
  float dk = smoothstep(-w * 0.7, w * 0.7 + 0.03, lam) * (0.4 + 0.6 * max(lam, 0.0));
  float fres = pow(1.0 - max(dot(n, vV), 0.0), 3.0); float lr = max(dot(n, rDir), 0.0);
  vec3 base = vec3(0.3, 0.305, 0.315);
  float kb = smoothstep(-0.25, 0.45, lam) * fres * (0.35 + 1.4 * max(dot(-vV, kDir), 0.0));
  float rb = smoothstep(-0.25, 0.45, dot(n, rDir)) * fres * (0.35 + 1.4 * max(dot(-vV, rDir), 0.0));
  vec3 c = base * (0.3 + amb * 0.6) + kCol * kInt * (dk * 0.8 + kb * 1.2) + rCol * rInt * (pow(lr, 3.0) * 0.5 + rb * 0.9) + vec3(0.06) * fres;
  gl_FragColor = vec4(c, 1.0);
}`;
const BEAM_VS = `varying float vT; varying vec3 vN; varying vec3 vV; void main(){ vT = position.y + 0.5; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const BEAM_FS = `uniform vec3 col; uniform float op; varying float vT; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(vN, vV)), 2.0); float a = op * f * (0.15 + 0.85 * vT * vT); gl_FragColor = vec4(col, a); }`;

/** look 'wire' (default): the hairline globe around the lit photo card. 'ball' (2026-10-25): a soft shaded ball lit by the rig, the glowing
 *  light handles orbiting it; no wireframe, no card, no beams. 'orbit' (Relight's panel, 2026-10-31): a plain bust (head with a nose, so front
 *  and back read at a glance) lit by the rig, inside the orbit of the 26 fixed light positions (three rings, four great circles, a dot per
 *  position), Front / Back marks on the ring, and a camera you can turn to look from behind. A light behind the bust is hidden by it (a faint
 *  ghost shows where it is) and outlines its edges, as a back light does. */
export async function createSphereEngine(canvas: HTMLCanvasElement, size: number, opts: { look?: 'wire' | 'ball' | 'orbit' } = {}): Promise<SphereEngine> {
  const T = await import('three'); const orbit = opts.look === 'orbit'; const ball = opts.look === 'ball' || orbit;
  const R = SPHERE_R;
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: ball, powerPreference: 'low-power', preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(size, size, false); renderer.setClearColor(0x0f1113, ball ? 0 : 1);
  const scene = new T.Scene();
  const cam = new T.PerspectiveCamera(31, 1, 0.1, 50);
  const pitch = (orbit ? 16 : 14) * D2R, dist = orbit ? 6.6 : 7.4; let cd = new T.Vector3();
  const aim = (yawDeg: number) => { const yaw = yawDeg * D2R; cam.position.set(dist * Math.cos(pitch) * Math.sin(yaw), dist * Math.sin(pitch), dist * Math.cos(pitch) * Math.cos(yaw)); cam.lookAt(0, orbit ? -0.05 : 0, 0); cam.updateMatrixWorld(); cd = cam.position.clone().normalize(); };
  aim(orbit ? 28 : 18);
  const facing = (p: number[]) => (p[0] * cd.x + p[1] * cd.y + p[2] * cd.z) / R;
  const disposables: any[] = [];
  const keep = <X,>(x: X) => { disposables.push(x); return x; };

  // ---- the globe: latitudes every 30°, meridians every 30°, a brighter equator and front meridian, ticks every 15° on the equator ----
  if (!ball) { const pos: number[] = []; const col: number[] = []; const seg = 120;
    const push = (p: number[], boost: number) => { pos.push(p[0], p[1], p[2]); const f = facing(p); const a = (f > 0 ? 0.04 + 0.08 * f : 0.025 + 0.02 * (1 + f)) * boost; col.push(a, a, a); };
    const circle = (pt: (t: number) => number[], boost = 1) => { for (let i = 0; i < seg; i++) { push(pt((i / seg) * Math.PI * 2), boost); push(pt(((i + 1) / seg) * Math.PI * 2), boost); } };
    for (const el of [-60, -30, 0, 30, 60]) { const y = R * Math.sin(el * D2R); const r = R * Math.cos(el * D2R); circle((t) => [r * Math.cos(t), y, r * Math.sin(t)], el === 0 ? 1.9 : 1); }
    for (let az = 0; az < 180; az += 30) { const s = Math.sin(az * D2R), c = Math.cos(az * D2R); circle((t) => [R * Math.cos(t) * s, R * Math.sin(t), R * Math.cos(t) * c], az === 0 ? 1.5 : 1); }
    for (let az = 0; az < 360; az += 15) { const big = az % 45 === 0; const a = sph(az, 0, R), b = sph(az, 0, R * (big ? 1.07 : 1.04)); push(a, big ? 3.2 : 2.2); push(b, big ? 3.2 : 2.2); }
    const g = keep(new T.BufferGeometry()); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    scene.add(new T.LineSegments(g, keep(new T.LineBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false })))); }
  // the silhouette: one crisp circle where the sphere's edge is seen
  if (!ball) { const rr = R * Math.sqrt(1 - (R / dist) ** 2); const off = (R * R) / dist; const up = new T.Vector3(0, 1, 0); const u = up.clone().cross(cd).normalize(); const v = cd.clone().cross(u).normalize(); const pts: number[] = [];
    for (let i = 0; i <= 160; i++) { const t = (i / 160) * Math.PI * 2; pts.push(cd.x * off + (u.x * Math.cos(t) + v.x * Math.sin(t)) * rr, cd.y * off + (u.y * Math.cos(t) + v.y * Math.sin(t)) * rr, cd.z * off + (u.z * Math.cos(t) + v.z * Math.sin(t)) * rr); }
    const g = keep(new T.BufferGeometry()); g.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
    scene.add(new T.Line(g, keep(new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, depthWrite: false })))); }

  // ---- guides through the active light: its latitude ring and meridian (a unit circle in the XY plane, placed per light) ----
  const unit = keep(new T.BufferGeometry()); { const pts: number[] = []; for (let i = 0; i <= 128; i++) { const t = (i / 128) * Math.PI * 2; pts.push(Math.cos(t), Math.sin(t), 0); } unit.setAttribute('position', new T.Float32BufferAttribute(pts, 3)); }
  const guideMat = keep(new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
  const lat = new T.Line(unit, guideMat); lat.rotation.x = Math.PI / 2; const mer = new T.Line(unit, guideMat); lat.visible = mer.visible = !ball; scene.add(lat, mer);

  // ---- the card: the photo (or a silhouette), shaded by the lights ----
  const ph = keep(silhouette(T));
  const cardMat = keep(new T.ShaderMaterial({ vertexShader: CARD_VS, fragmentShader: CARD_FS, uniforms: { map: { value: ph }, kDir: { value: new T.Vector3(0, 0, 1) }, kCol: { value: new T.Vector3(1, 1, 1) }, kInt: { value: 0.7 }, kSoft: { value: 0.5 },
    rDir: { value: new T.Vector3(0, 0, -1) }, rCol: { value: new T.Vector3(1, 1, 1) }, rInt: { value: 0 }, amb: { value: 0.3 } } }));
  const cardGeo = keep(new T.PlaneGeometry(1, 1)); const card = new T.Group(); card.add(new T.Mesh(cardGeo, cardMat));
  { const g = keep(new T.BufferGeometry()); g.setAttribute('position', new T.Float32BufferAttribute([-.5, -.5, .001, .5, -.5, .001, .5, -.5, .001, .5, .5, .001, .5, .5, .001, -.5, .5, .001, -.5, .5, .001, -.5, -.5, .001], 3));
    card.add(new T.LineSegments(g, keep(new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16 })))); }
  const fit = (aspect: number) => { const m = 1.5; const a = Math.max(0.4, Math.min(2.5, aspect || 0.8)); card.scale.set(a >= 1 ? m : m * a, a >= 1 ? m / a : m, 1); };
  fit(256 / 320); card.visible = !ball; scene.add(card);
  // ---- 'ball': a matte ball shaded by the same light uniforms as the card (soft light wraps, hard light cuts, ambient lifts, rim outlines) ----
  if (ball) { const m = keep(new T.ShaderMaterial({ vertexShader: BALL_VS, fragmentShader: BALL_FS, uniforms: cardMat.uniforms }));
    if (!orbit) scene.add(new T.Mesh(keep(new T.SphereGeometry(R * 0.6, 64, 48)), m));
    else { // the bust: head (with a nose pointing at the camera side), neck, shoulders; one material, so it lights as one form
      const part = (g: any, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0) => { const o = new T.Mesh(keep(g), m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.x = rx; scene.add(o); return o; };
      const B = 1.18; /* the bust's scale inside the orbit */
      part(new T.SphereGeometry(0.4 * B, 48, 36), 0, 0.42 * B, 0, 0.92, 1.1, 1); part(new T.ConeGeometry(0.075 * B, 0.2 * B, 20), 0, 0.38 * B, 0.42 * B, 1, 1, 1, Math.PI / 2);
      part(new T.CylinderGeometry(0.15 * B, 0.18 * B, 0.36 * B, 32), 0, -0.04 * B, 0); part(new T.SphereGeometry(0.8 * B, 48, 32), 0, -0.52 * B, 0, 1, 0.42, 0.55); } }
  // ---- 'orbit': the snap guides (rings at high / level / low, great circles every 45°, a dot per fixed position) and Front / Back marks ----
  if (orbit) {
    const pos: number[] = []; const seg = 96; const ring = (pt: (t: number) => number[]) => { for (let i = 0; i < seg; i++) { pos.push(...pt((i / seg) * Math.PI * 2), ...pt(((i + 1) / seg) * Math.PI * 2)); } };
    for (const el of [-45, 0, 45]) { const y = R * Math.sin(el * D2R); const r = R * Math.cos(el * D2R); ring((t) => [r * Math.cos(t), y, r * Math.sin(t)]); }
    for (const az of [0, 45, 90, 135]) { const sa = Math.sin(az * D2R), ca = Math.cos(az * D2R); ring((t) => [R * Math.cos(t) * sa, R * Math.sin(t), R * Math.cos(t) * ca]); }
    const g = keep(new T.BufferGeometry()); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    scene.add(new T.LineSegments(g, keep(new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.11, depthWrite: false }))));
    const dots: number[] = [0, R, 0, 0, -R, 0]; for (const el of [-45, 0, 45]) for (let az = 0; az < 360; az += 45) dots.push(...sph(az, el, R));
    const dg = keep(new T.BufferGeometry()); dg.setAttribute('position', new T.Float32BufferAttribute(dots, 3));
    const dotTex0 = keep(canvasTex(T, 32, 32, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(16, 16, 12, 0, Math.PI * 2); c.fill(); }));
    scene.add(new T.Points(dg, keep(new T.PointsMaterial({ size: 5, sizeAttenuation: false, map: dotTex0, transparent: true, opacity: 0.55, depthWrite: false, alphaTest: 0.2 }))));
    const word = (t: string) => { const tex = keep(canvasTex(T, 128, 48, (c) => { c.font = '600 26px Inter, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = 'rgba(255,255,255,.7)'; c.fillText(t, 64, 24); }));
      const sp = new T.Sprite(keep(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))); sp.scale.set(0.8, 0.3, 1); return sp; };
    const fr = word('FRONT'); fr.position.set(...sph(0, -8, R * 1.2)); const bk = word('BACK'); bk.position.set(...sph(180, -8, R * 1.2)); scene.add(fr, bk);
  }

  // ---- per light: beam (cone from the light to the subject), a dashed line to the centre, glow + core + ring sprites ----
  const glowTex = keep(canvasTex(T, 128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.18, 'rgba(255,255,255,.55)'); r.addColorStop(0.5, 'rgba(255,255,255,.12)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); }));
  const dotTex = keep(canvasTex(T, 64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, '#fff'); r.addColorStop(0.55, '#fff'); r.addColorStop(0.75, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }));
  const ringTex = keep(canvasTex(T, 128, 128, (g) => { g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.stroke(); }));
  const coneGeo = keep(new T.ConeGeometry(1, 1, 48, 1, true));
  const mkLight = () => {
    const beamMat = keep(new T.ShaderMaterial({ vertexShader: BEAM_VS, fragmentShader: BEAM_FS, uniforms: { col: { value: new T.Vector3(1, 1, 1) }, op: { value: 0.1 } }, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
    const beam = new T.Mesh(coneGeo, beamMat);
    const lg = keep(new T.BufferGeometry()); lg.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    const line = new T.Line(lg, keep(new T.LineDashedMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, dashSize: 0.05, gapSize: 0.045, depthWrite: false })));
    const sp = (map: any, add: boolean) => new T.Sprite(keep(new T.SpriteMaterial({ map, transparent: true, depthTest: false, depthWrite: false, ...(add ? { blending: T.AdditiveBlending } : {}) })));
    const glow = sp(glowTex, true), core = sp(dotTex, false), ring = sp(ringTex, false), ghost = sp(dotTex, false);
    if (orbit) { glow.material.depthTest = true; core.material.depthTest = true; ghost.material.opacity = 0.28; } else ghost.visible = false; /* 'orbit': the bust hides a light behind it; the ghost still marks it */
    const g = new T.Group(); g.add(glow, core, ghost, ring); for (const s of [glow, core, ring, ghost]) s.renderOrder = 10;
    scene.add(beam, line, g); return { beam, beamMat, line, lg, glow, core, ring, ghost, g, pos: [0, 0, 1] as number[], on: false };
  };
  const lights = { key: mkLight(), rim: mkLight() };
  const up = new T.Vector3(0, 1, 0);

  const render = () => renderer.render(scene, cam);
  let photoUrl: string | null = null; let photoTex: any = null; let lastRig: { rig: LightRig; active: Which } | null = null;
  const place = (L: ReturnType<typeof mkLight>, l: LightRig['key'] | undefined, active: boolean, isKey: boolean) => {
    L.on = !!l; L.g.visible = !!l; for (const o of [L.beam, L.line]) o.visible = !!l && !ball; if (!l) return;
    const p = sph(l.az, l.el); L.pos = p; const c = lightRgb(l).map((x) => x / 255); const k = l.intensity / 100; const behind = facing(p) < -0.15;
    L.g.position.set(p[0], p[1], p[2]);
    L.glow.material.color.setRGB(c[0], c[1], c[2]); L.glow.material.opacity = (behind ? 0.5 : 1) * (0.55 + 0.45 * k); const gs = (isKey ? 0.95 : 0.75) * (0.6 + 0.6 * k); L.glow.scale.set(gs, gs, 1);
    L.core.material.color.setRGB(0.5 + c[0] * 0.5, 0.5 + c[1] * 0.5, 0.5 + c[2] * 0.5); L.core.material.opacity = behind ? 0.6 : 1; const cs = isKey ? 0.12 : 0.1; L.core.scale.set(cs, cs, 1);
    L.ring.material.color.set(active ? ORANGE : 0xffffff); L.ring.material.opacity = (active ? 1 : 0.4) * (orbit && behind ? 0.6 : 1); const rs = active ? 0.3 : 0.24; L.ring.scale.set(rs, rs, 1);
    if (orbit) { L.glow.material.opacity = (behind ? 0.45 : 1) * (0.55 + 0.45 * k); L.core.material.opacity = behind ? 0.7 : 1; L.ghost.material.color.setRGB(0.5 + c[0] * 0.5, 0.5 + c[1] * 0.5, 0.5 + c[2] * 0.5); L.ghost.scale.set(cs, cs, 1); }
    const soft = isKey ? l.softness / 100 : 0.3; const rb = 0.22 + soft * 0.55;
    L.beam.scale.set(rb, R, rb); L.beam.position.set(p[0] / 2, p[1] / 2, p[2] / 2); L.beam.quaternion.setFromUnitVectors(up, new T.Vector3(p[0], p[1], p[2]).normalize());
    L.beamMat.uniforms.col.value.set(c[0], c[1], c[2]); L.beamMat.uniforms.op.value = (isKey ? 0.34 : 0.26) * (0.25 + k);
    const a = L.lg.attributes.position; a.setXYZ(0, p[0], p[1], p[2]); a.setXYZ(1, 0, 0, 0); a.needsUpdate = true; L.line.computeLineDistances();
  };
  const api: SphereEngine = {
    setRig(rig, active) { lastRig = { rig, active };
      place(lights.key, rig.key, active === 'key' || !rig.rim, true); place(lights.rim, rig.rim, active === 'rim' && !!rig.rim, false);
      const u = cardMat.uniforms; const kp = lights.key.pos; const kc = lightRgb(rig.key).map((x) => x / 255);
      u.kDir.value.set(kp[0], kp[1], kp[2]).normalize(); u.kCol.value.set(kc[0], kc[1], kc[2]); u.kInt.value = (rig.key.intensity / 100) * 1.15; u.kSoft.value = rig.key.softness / 100; u.amb.value = rig.ambient / 100;
      if (rig.rim) { const rp = lights.rim.pos; const rc = lightRgb(rig.rim).map((x) => x / 255); u.rDir.value.set(rp[0], rp[1], rp[2]).normalize(); u.rCol.value.set(rc[0], rc[1], rc[2]); u.rInt.value = (rig.rim.intensity / 100) * 1.1; } else u.rInt.value = 0;
      const a = active === 'rim' && rig.rim ? rig.rim : rig.key; const el = a.el * D2R;
      lat.scale.set(R * Math.cos(el), R * Math.cos(el), 1); lat.position.set(0, R * Math.sin(el), 0); mer.scale.set(R, R, 1); mer.rotation.set(0, (a.az - 90) * D2R, 0);
      render();
    },
    setPhoto(url) {
      if (url === photoUrl) return; photoUrl = url;
      if (!url) { photoTex?.dispose(); photoTex = null; cardMat.uniforms.map.value = ph; fit(256 / 320); render(); return; }
      new T.TextureLoader().load(url, (tex: any) => { if (photoUrl !== url) { tex.dispose(); return; } tex.minFilter = T.LinearFilter; photoTex?.dispose(); photoTex = tex;
        cardMat.uniforms.map.value = tex; fit(tex.image.width / tex.image.height); render(); }, undefined, () => { /* unreadable photo: keep the silhouette */ });
    },
    pick(x, y) {
      let best: Which | null = null; let bd = 18;
      for (const w of ['rim', 'key'] as Which[]) { const L = lights[w]; if (!L.on) continue; const v = new T.Vector3(L.pos[0], L.pos[1], L.pos[2]).project(cam);
        const d = Math.hypot(((v.x + 1) / 2) * size - x, ((1 - v.y) / 2) * size - y); if (d < bd) { bd = d; best = w; } }
      return best;
    },
    hitSphere(x, y) {
      const d = new T.Vector3((x / size) * 2 - 1, 1 - (y / size) * 2, 0.5).unproject(cam).sub(cam.position).normalize(); const o = cam.position;
      const b = o.dot(d); const c = o.dot(o) - R * R; const disc = b * b - c; if (disc < 0) return null; const t = -b - Math.sqrt(disc);
      const p = o.clone().add(d.multiplyScalar(t)); return { az: Math.round(Math.atan2(p.x, p.z) / D2R), el: Math.round(Math.asin(Math.max(-1, Math.min(1, p.y / R))) / D2R) };
    },
    setView(yaw) { aim(yaw); if (lastRig) api.setRig(lastRig.rig, lastRig.active); else render(); },
    dispose() { photoTex?.dispose(); for (const x of disposables) x.dispose?.(); renderer.dispose(); renderer.forceContextLoss?.(); },
  };
  return api;
}
