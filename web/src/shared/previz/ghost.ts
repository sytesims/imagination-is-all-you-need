/**
 * The Add props ghost (2026-10-27, build mode): a see-through copy of the piece or model you are placing, standing where it would go, on a
 * soft footprint that is green where it can go and red where it can't. Live view only: the engine hides it while recording (and it never
 * touches the shot). A hover ring (white) marks what a click would pick. The maths of where it may stand is server/src/shared/previzPlace.ts.
 */
import { loadPieces, piece } from './kits';
import { loadUserModel } from './userModels';

type T3 = typeof import('three');
export type GhostSpec = { x: number; y: number; z: number; r: number; ok: boolean; /** footprint radius (metres) */ rad: number }
  & ({ kind: 'prop'; k: string; s: number } | { kind: 'model'; src: string; h: number; front: number });
const OK = 0x3ddc97, BAD = 0xf06464; /* the app's --success / --error */

export function createGhost(T: T3, scene: any, redraw: () => void) {
  const root = new T.Group(); root.visible = false; scene.add(root);
  const body = new T.Group(); root.add(body); const turn = new T.Group(); body.add(turn); const size = new T.Group(); turn.add(size);
  const footM = new T.MeshBasicMaterial({ color: OK, transparent: true, opacity: 0.22, depthWrite: false, depthTest: false, fog: false });
  const edgeM = new T.MeshBasicMaterial({ color: OK, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, fog: false });
  const foot = new T.Mesh(new T.CircleGeometry(1, 48), footM); const edge = new T.Mesh(new T.RingGeometry(0.95, 1, 48), edgeM);
  for (const m of [foot, edge]) { m.rotation.x = -Math.PI / 2; m.renderOrder = 21; m.userData.noCast = true; root.add(m); }
  const hover = new T.Mesh(new T.RingGeometry(0.93, 1, 48), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthTest: false, fog: false }));
  hover.rotation.x = -Math.PI / 2; hover.renderOrder = 20; hover.visible = false; scene.add(hover);
  let hov = false; let key = ''; let spec: GhostSpec | null = null; let mats: { m: any; base: any }[] = []; let gen = 0; let clone: ((o: any) => any) | null = null;
  const clear = () => { for (const c of [...size.children]) size.remove(c); for (const { m } of mats) m.dispose(); mats = []; };
  /* every material of the copy: see-through, no depth write (the set shows through), tinted red when it can't go there */
  const glass = (o: any) => { const made = new Map<any, any>();
    o.traverse((n: any) => { if (!n.isMesh) return; n.castShadow = false; n.receiveShadow = false; n.raycast = () => undefined;
      const one = (src: any) => { let m = made.get(src); if (!m) { m = src.clone(); m.transparent = true; m.opacity = 0.55; m.depthWrite = false; made.set(src, m); mats.push({ m, base: m.color?.clone?.() ?? null }); } return m; };
      n.material = Array.isArray(n.material) ? n.material.map(one) : one(n.material); }); };
  const build = (s: GhostSpec) => { const k = s.kind === 'prop' ? `p:${s.k}` : `m:${s.src}`; if (k === key) return; key = k; const my = ++gen; clear();
    if (s.kind === 'prop') { const add = () => { if (my !== gen) return; const o = piece(s.k); if (!o) return; glass(o); size.add(o); tint(); redraw(); };
      if (piece(s.k)) add(); else void loadPieces(T, [s.k]).then(add).catch(() => undefined); }
    else void (async () => { const L = await loadUserModel(T, s.src).catch(() => null); if (!L || my !== gen) return;
      clone ??= (await import('three/examples/jsm/utils/SkeletonUtils.js')).clone; if (my !== gen) return; const c = clone(L.proto); glass(c); size.add(c); tint(); redraw(); })(); };
  const red = new T.Color(BAD);
  const tint = () => { const ok = spec?.ok ?? true; footM.color.setHex(ok ? OK : BAD); edgeM.color.setHex(ok ? OK : BAD);
    for (const { m, base } of mats) if (base && m.color) { m.color.copy(base); if (!ok) m.color.lerp(red, 0.65); } };
  return {
    /** show the ghost (null hides it) */
    set(s: GhostSpec | null) { spec = s; if (!s) { root.visible = false; key = ''; gen++; clear(); return; } build(s);
      body.position.set(s.x, s.y, s.z); body.rotation.set(0, s.r, 0);
      if (s.kind === 'prop') { turn.rotation.set(0, 0, 0); size.scale.setScalar(s.s); } else { turn.rotation.set(0, s.front, 0); size.scale.setScalar(s.h); }
      for (const m of [foot, edge]) { m.position.set(s.x, s.y + 0.025, s.z); m.scale.setScalar(Math.max(0.12, s.rad)); }
      tint(); },
    /** the white hover ring (null hides it) */
    hover(h: { x: number; y: number; z: number; r: number } | null) { hov = !!h; hover.visible = !!h; if (h) { hover.position.set(h.x, h.y + 0.02, h.z); hover.scale.setScalar(h.r); } },
    /** before each draw: hidden while recording */
    show(live: boolean) { root.visible = live && !!spec; hover.visible = live && hov; },
    get on() { return !!spec; },
  };
}
export type Ghost = ReturnType<typeof createGhost>;
