/**
 * Rig as a character: the little 3D stage inside the sheet (RigSheet.tsx). It shows the model, the bones over it (orange joints you can
 * drag in the view's plane, the other side following when Mirror is on), then the rigged character playing a move. Draws only when
 * something changes or a move plays, so an idle sheet costs nothing. Drag empty space to turn the view.
 */
import { AmbientLight, AnimationMixer, BufferGeometry, Clock, Color, DirectionalLight, Float32BufferAttribute, Group, HemisphereLight, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  PerspectiveCamera, Plane, Raycaster, Scene, SphereGeometry, Vector2, Vector3, WebGLRenderer, CircleGeometry, type AnimationClip, type Material } from 'three';
import { HUMAN_BONES, JOINTS, TEMPLATE_HEIGHT, mirrorOf, type Joints } from './humanRig';
import type { RigModel } from './rigCharacter';

const ORANGE = 0xff7a1a; const H = TEMPLATE_HEIGHT;
const SIDE: Record<string, string> = { l: 'Left', r: 'Right' };
const PART: Record<string, string> = { pelvis: 'Hips', spine_01: 'Lower back', spine_02: 'Middle back', spine_03: 'Chest', neck_01: 'Neck', head: 'Head', head_leaf: 'Top of the head', clavicle: 'collarbone', upperarm: 'shoulder', lowerarm: 'elbow', hand: 'wrist', hand_leaf: 'fingertips', thigh: 'hip', calf: 'knee', foot: 'ankle', ball: 'toes', ball_leaf: 'toe tip' };
/** "Left elbow", "Chest": a joint in plain words (left and right are the character's own) */
export const jointLabel = (n: string) => { const m = /^(.*)_([lr])$/.exec(n); return m ? `${SIDE[m[2]]} ${PART[m[1]] ?? m[1]}` : PART[n] ?? n; };
export type StageView = 'front' | 'side';

export class RigStage {
  private r: WebGLRenderer; private scene = new Scene(); private cam = new PerspectiveCamera(28, 1, 0.01, 50); private yaw = 0; private pitch = 0.08;
  private model = new Group(); private glass = new MeshStandardMaterial({ color: 0xd9dbe0, roughness: 0.6, transparent: true, opacity: 0.38, depthWrite: false });
  private dots = new Group(); private lines: LineSegments; private dotGeo = new SphereGeometry(0.018, 14, 10); private dotMat = new MeshBasicMaterial({ color: ORANGE, depthTest: false });
  private hotMat = new MeshBasicMaterial({ color: 0xffffff, depthTest: false }); private character: Group | null = null; private mixer: AnimationMixer | null = null; private clock = new Clock();
  private playing = false; private raf = 0; private joints: Joints = {}; private editable = false; private hot: string | null = null; private drag: { name: string; plane: Plane } | null = null; private turning: { x: number; y: number; yaw: number; pitch: number } | null = null;
  mirror = true; onChange: ((j: Joints, name: string) => void) | null = null; onHover: ((name: string | null) => void) | null = null; onDragEnd: (() => void) | null = null;
  constructor(private canvas: HTMLCanvasElement) {
    this.r = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true }); this.r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.scene.add(new HemisphereLight(0xffffff, 0x3a3a40, 1.1), new AmbientLight(0xffffff, 0.35)); const key = new DirectionalLight(0xffffff, 1.6); key.position.set(1.5, 3, 2.5); this.scene.add(key);
    const floor = new Mesh(new CircleGeometry(0.75, 48), new MeshBasicMaterial({ color: new Color(0xffffff), transparent: true, opacity: 0.05 })); floor.rotation.x = -Math.PI / 2; this.scene.add(floor);
    this.scene.add(this.model, this.dots);
    this.lines = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: ORANGE, depthTest: false, transparent: true, opacity: 0.85 })); this.lines.renderOrder = 10; this.scene.add(this.lines);
    canvas.addEventListener('pointerdown', this.down); canvas.addEventListener('pointermove', this.move); window.addEventListener('pointerup', this.up); canvas.addEventListener('pointerleave', this.leave);
    this.resize();
  }
  resize() { const w = this.canvas.clientWidth || 400, h = this.canvas.clientHeight || 400; this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); this.place(); this.draw(); }
  setView(v: StageView) { this.yaw = v === 'side' ? Math.PI / 2 : 0; this.pitch = 0.08; this.place(); this.draw(); }
  private place() { const d = (H * 0.62) / Math.tan((this.cam.fov * Math.PI) / 360) / Math.min(1, this.cam.aspect * 1.05); const t = new Vector3(0, H * 0.5, 0);
    this.cam.position.set(t.x + Math.sin(this.yaw) * Math.cos(this.pitch) * d, t.y + Math.sin(this.pitch) * d, t.z + Math.cos(this.yaw) * Math.cos(this.pitch) * d); this.cam.lookAt(t); }
  /** the model as it stands (glass = see-through, for checking the bones) */
  showModel(m: RigModel | null, glass: boolean) { this.clearCharacter(); this.model.clear(); if (!m) { this.draw(); return; }
    for (const p of m.parts) { const mesh = new Mesh(p.geometry, glass ? this.glass : (p.material as Material | Material[])); mesh.renderOrder = 1; this.model.add(mesh); }
    this.model.visible = true; this.draw(); }
  setJoints(j: Joints, editable: boolean) { this.joints = j; this.editable = editable; this.dots.clear();
    for (const n of JOINTS) { const s = new Mesh(this.dotGeo, n === this.hot ? this.hotMat : this.dotMat); s.name = n; s.renderOrder = 11; s.position.set(...j[n]); s.scale.setScalar(/leaf|ball/.test(n) ? 0.7 : 1); this.dots.add(s); }
    const pts: number[] = []; HUMAN_BONES.forEach(([n, p]) => { if (p <= 0 || !j[n]) return; const a = j[HUMAN_BONES[p][0]]; if (a) pts.push(...a, ...j[n]); });
    this.lines.geometry.dispose(); this.lines.geometry = new BufferGeometry(); this.lines.geometry.setAttribute('position', new Float32BufferAttribute(pts, 3));
    this.dots.visible = this.lines.visible = true; this.draw(); }
  hideBones() { this.dots.visible = this.lines.visible = false; this.draw(); }
  /** the rigged character, playing one clip (null = still); still = hold this time instead of playing (reduced motion) */
  showCharacter(c: Group, clips: AnimationClip[]) { this.clearCharacter(); this.model.visible = false; this.hideBones(); this.character = c; this.scene.add(c); this.mixer = new AnimationMixer(c); this.mixer.timeScale = 1; void clips; this.draw(); }
  play(clip: AnimationClip | null, still: number | null) { if (!this.mixer) return; this.mixer.stopAllAction(); if (!clip) { this.stop(); this.draw(); return; }
    const a = this.mixer.clipAction(clip); a.reset().play();
    if (still != null) { this.stop(); this.mixer.setTime(still * clip.duration); this.draw(); return; }
    if (!this.playing) { this.playing = true; this.clock.start(); const tick = () => { if (!this.playing) return; this.mixer?.update(Math.min(0.05, this.clock.getDelta())); this.draw(); this.raf = requestAnimationFrame(tick); }; this.raf = requestAnimationFrame(tick); } }
  stop() { this.playing = false; cancelAnimationFrame(this.raf); }
  private clearCharacter() { this.stop(); if (this.character) { this.mixer?.stopAllAction(); this.scene.remove(this.character); this.character = null; this.mixer = null; } }
  draw() { this.r.render(this.scene, this.cam); }
  snapshot(): Promise<Blob | null> { this.draw(); return new Promise((res) => this.canvas.toBlob((b) => res(b), 'image/png')); }
  // ---- pointer: drag a joint in the view's plane, or turn the view ----
  private ndc(e: PointerEvent) { const b = this.canvas.getBoundingClientRect(); return new Vector2(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1); }
  private nearest(e: PointerEvent): string | null { if (!this.editable || !this.dots.visible) return null; const b = this.canvas.getBoundingClientRect(); let best: string | null = null, bd = 16 * 16;
    for (const n of JOINTS) { const p = new Vector3(...this.joints[n]).project(this.cam); const dx = ((p.x + 1) / 2) * b.width - (e.clientX - b.left), dy = ((1 - p.y) / 2) * b.height - (e.clientY - b.top); const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = n; } }
    return best; }
  /** show one joint as picked (the sheet's joint menu) */
  highlight(n: string | null) { this.setHot(n); }
  private setHot(n: string | null) { if (n === this.hot) return; this.hot = n; for (const d of this.dots.children as Mesh[]) d.material = d.name === n ? this.hotMat : this.dotMat; this.canvas.style.cursor = n ? 'grab' : 'default'; this.onHover?.(n); this.draw(); }
  private down = (e: PointerEvent) => { if (e.button !== 0) return; const n = this.nearest(e);
    if (n) { const normal = this.cam.getWorldDirection(new Vector3()).negate(); this.drag = { name: n, plane: new Plane().setFromNormalAndCoplanarPoint(normal, new Vector3(...this.joints[n])) }; this.canvas.style.cursor = 'grabbing'; }
    else this.turning = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch };
    this.canvas.setPointerCapture?.(e.pointerId); e.preventDefault(); };
  private move = (e: PointerEvent) => {
    if (this.drag) { const ray = new Raycaster(); ray.setFromCamera(this.ndc(e), this.cam); const hit = ray.ray.intersectPlane(this.drag.plane, new Vector3()); if (!hit) return;
      const n = this.drag.name; const j: Joints = { ...this.joints, [n]: [hit.x, Math.max(0, hit.y), hit.z] }; const o = mirrorOf(n); if (this.mirror && o) j[o] = [-hit.x, Math.max(0, hit.y), hit.z];
      this.setJoints(j, true); this.onChange?.(j, n); return; }
    if (this.turning) { const t = this.turning; this.yaw = t.yaw - (e.clientX - t.x) * 0.01; this.pitch = Math.max(-0.4, Math.min(0.9, t.pitch + (e.clientY - t.y) * 0.006)); this.place(); this.draw(); return; }
    this.setHot(this.nearest(e)); };
  private up = () => { if (this.drag) { this.drag = null; this.canvas.style.cursor = this.hot ? 'grab' : 'default'; this.onDragEnd?.(); } this.turning = null; };
  private leave = () => { if (!this.drag) this.setHot(null); };
  /** move one joint with the keyboard (arrow keys, in the view's plane) */
  nudge(n: string, dx: number, dy: number) { const right = new Vector3().setFromMatrixColumn(this.cam.matrixWorld, 0).setY(0).normalize(); const p = new Vector3(...this.joints[n]).addScaledVector(right, dx).add(new Vector3(0, dy, 0));
    const j: Joints = { ...this.joints, [n]: [p.x, Math.max(0, p.y), p.z] }; const o = mirrorOf(n); if (this.mirror && o) j[o] = [-p.x, Math.max(0, p.y), p.z]; this.setJoints(j, true); this.onChange?.(j, n); }
  dispose() { this.stop(); this.canvas.removeEventListener('pointerdown', this.down); this.canvas.removeEventListener('pointermove', this.move); window.removeEventListener('pointerup', this.up); this.canvas.removeEventListener('pointerleave', this.leave);
    this.clearCharacter(); this.dotGeo.dispose(); this.glass.dispose(); this.r.dispose(); }
}
