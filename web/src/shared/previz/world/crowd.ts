/**
 * City life: the crowd (2026-10-27). People walking the open city's pavements, drawn as the same mannequin the person you play uses
 * (previz/actor.ts: Quaternius' Universal Animation Library mannequin, CC0). Where they are comes from CityWorld.pedsNear(t, …)
 * (server/src/shared/world/openCity.ts), a pure function of t, and each figure is posed from that alone through the actor's own pose():
 * idle → walk by speed, the stride cycle on the distance walked. So a recording that seeks t gets the same people in the same step every time.
 * Only the nearest few are drawn (a small pool of rigs, reassigned each frame to the people closest to the camera); how many comes from the
 * graphics quality (previz/quality.ts) and the Crowd setting.
 * Families (2026-10-27): people come in groups (couples, parents with children, someone with a dog). A group is drawn whole or not at all,
 * children are the same figure at their own size (their stride scaled to match), and dogs are a few of our own primitives, legs swinging on
 * the distance walked. Each person wears their own seeded clothes: a top, trousers, shoes and a skin tone, painted by height on the
 * mannequin in the shader (its bind pose, so the colours stay put while it walks). Clay and Depth draw their own material over all of it.
 */
import type { CityWorld, PedAt } from '../../../../../server/src/shared/world/openCity';
import { createActorRig, type ActorRig } from '../actor';
import { QUALITY } from '../quality';

type T3 = typeof import('three');
export type CrowdLevel = 'off' | 'some' | 'busy';
/** the rank cut-off (Some shows about two in five) and the share of the quality's head count it may draw */
export const CROWD: Record<Exclude<CrowdLevel, 'off'>, { rank: number; share: number }> = { some: { rank: 0.4, share: 0.6 }, busy: { rank: 1, share: 1 } };
const RANGE = 60;
/** clothing: muted tops (the person you play, in brand orange, still stands out), darker trousers, shoes, skin tones; children's tops a little brighter */
export const WEAR = {
  top: ['#5d6b7e', '#8a5a4e', '#4f6b58', '#b8a68c', '#4a4c63', '#7d6178', '#7a6a55', '#5f7d86', '#8d8f93', '#3f4a52', '#9b6a5f', '#6f7a5a', '#c2b9ad', '#56606e', '#a4876a', '#e3dcd0'],
  kid: ['#c98f5a', '#6f9aa0', '#b9a35b', '#a96f7b', '#7f9a6c', '#8a86b8', '#cf9f86', '#5f8fb0'],
  bottom: ['#2f3540', '#3c4a5e', '#5a5248', '#2a2b2e', '#6b6458', '#44403b', '#4b5a6b', '#8a7f6e'],
  shoes: ['#1f1f22', '#3a2f28', '#d9d4cc', '#4a4440', '#262a30'],
  skin: ['#e8c4a8', '#d9a888', '#c08a68', '#9b6a4c', '#7a4f38', '#f0d2bc', '#b47d5c'],
  dog: [['#8a6a4a', '#e8dccb'], ['#2b2522', '#4a3d34'], ['#c9a46e', '#efe2c8'], ['#ece7de', '#c9c0b2'], ['#6b5a4a', '#2b2522']] as [string, string][],
};
/** a person's clothes from their seeded tint (pure: the same person always wears the same) */
export function wearOf(tint: number, kind: 'adult' | 'child') { const pick = <X,>(a: X[], k: number) => a[Math.floor(((tint * 2654435761) >>> k) % a.length)];
  return { top: kind === 'child' ? pick(WEAR.kid, 3) : pick(WEAR.top, 3), bottom: pick(WEAR.bottom, 7), shoes: pick(WEAR.shoes, 11), skin: pick(WEAR.skin, 15) }; }
/** Pick whole groups, nearest first (ahead of the camera before behind it), until `cap` people (dogs don't count) are in. Pure. */
export function pickGroups(near: PedAt[], cap: number, ahead: (p: PedAt) => boolean): PedAt[] {
  const by = new Map<number, PedAt[]>(); for (const p of near) { const g = by.get(p.group); if (g) g.push(p); else by.set(p.group, [p]); }
  const order: number[] = []; const seen = new Set<number>(); for (const pass of [true, false]) for (const p of near) if (ahead(p) === pass && !seen.has(p.group)) { seen.add(p.group); order.push(p.group); }
  const out: PedAt[] = []; let people = 0;
  for (const g of order) { const list = by.get(g)!; const n = list.filter((p) => p.kind !== 'dog').length; if (people + n > cap) continue; people += n; out.push(...list); if (people >= cap) break; }
  return out;
}

interface Dog { root: any; legs: any[]; tail: any; head: any; mats: any[]; who: number }
export interface Crowd { root: any; /** resolves once the full pool of figures exists (or the mannequin failed): a recording waits for it, so every frame has the same people */ ready: Promise<void>; update(t: number, cam: { x: number; z: number; fx: number; fz: number }, level: CrowdLevel, max: number): void; readonly shown: number; dispose(): void }

export function createCrowd(T: T3, world: CityWorld): Crowd {
  const root = new T.Group(); root.name = 'city-crowd';
  const pool: { rig: ActorRig; who: number; wear: ReturnType<typeof dress> }[] = []; const want = Math.max(...Object.values(QUALITY).map((q) => q.crowd)); let gone = false; let shown = 0;
  /* the clothes: every mesh of a rig gets its zone colours (top, trousers, shoes, skin) by bind-pose height */
  const dress = (rig: ActorRig) => { const u = { uTop: { value: new T.Color() }, uBottom: { value: new T.Color() }, uShoes: { value: new T.Color() }, uSkin: { value: new T.Color() }, uAxis: { value: new T.Vector3(0, 1, 0) }, uH: { value: new T.Vector2(0, 1.8) } };
    const box = new T.Box3(); const mats = new Set<any>();
    rig.root.traverse((o: any) => { if (!o.isMesh) return; o.geometry.computeBoundingBox?.(); if (o.geometry.boundingBox) box.union(o.geometry.boundingBox); mats.add(o.material); });
    const ax = [0, 1, 0]; /* glTF is y-up; the bind pose's arms stretch as wide as it is tall, so the widest side would not do */ u.uAxis.value.set(ax[0], ax[1], ax[2]);
    u.uH.value.set(ax[1] ? box.min.y : ax[2] ? box.min.z : box.min.x, ax[1] ? box.max.y : ax[2] ? box.max.z : box.max.x);
    const lum = (m: any) => m.color.r + m.color.g + m.color.b; const top = Math.max(...[...mats].map(lum)); /* the joints are the darker of the mannequin's two materials */
    for (const m of mats) { const joint = lum(m) < top - 1e-3; m.roughness = 0.8;
      m.onBeforeCompile = (sh: any) => { Object.assign(sh.uniforms, u);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec3 uAxis; uniform vec2 uH; varying float vWearH;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWearH = ( dot( position, uAxis ) - uH.x ) / max( uH.y - uH.x, 1e-4 );');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uShoes; uniform vec3 uSkin; varying float vWearH;')
          .replace('#include <color_fragment>', `#include <color_fragment>
          { float h = vWearH; vec3 c = h < 0.055 ? uShoes : h < 0.5 ? uBottom : h < 0.835 ? uTop : uSkin; diffuseColor.rgb = c${joint ? ' * 0.82' : ''}; }`); };
      m.customProgramCacheKey = () => `crowd-wear-${joint ? 'j' : 'b'}`; m.needsUpdate = true; }
    return { set(tint: number, kind: 'adult' | 'child') { const w = wearOf(tint, kind); u.uTop.value.set(w.top); u.uBottom.value.set(w.bottom); u.uShoes.value.set(w.shoes); u.uSkin.value.set(w.skin); } }; };
  /* the dogs: a body, a head with a snout and ears, four legs and a tail (about 0.5 m at the shoulder at size 1) */
  const dogs: Dog[] = []; const dogG = { body: new T.CapsuleGeometry(0.13, 0.42, 4, 10), head: new T.BoxGeometry(0.17, 0.17, 0.2), snout: new T.BoxGeometry(0.09, 0.08, 0.12), ear: new T.ConeGeometry(0.045, 0.1, 4), leg: new T.CylinderGeometry(0.03, 0.025, 0.3, 6), tail: new T.CylinderGeometry(0.018, 0.012, 0.24, 5) };
  dogG.body.rotateX(Math.PI / 2); dogG.leg.translate(0, -0.15, 0); dogG.tail.translate(0, 0.12, 0);
  const makeDog = (): Dog => { const coat = new T.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.9 }), dark = new T.MeshStandardMaterial({ color: 0x2b2522, roughness: 0.85 }); const g = new T.Group(); g.visible = false;
    const body = new T.Mesh(dogG.body, coat); body.position.y = 0.42; g.add(body);
    const head = new T.Group(); head.position.set(0, 0.56, 0.33); g.add(head); head.add(new T.Mesh(dogG.head, coat)); const sn = new T.Mesh(dogG.snout, dark); sn.position.set(0, -0.03, 0.14); head.add(sn);
    for (const s of [-1, 1]) { const e = new T.Mesh(dogG.ear, dark); e.position.set(0.06 * s, 0.11, -0.03); head.add(e); }
    const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => { const l = new T.Mesh(dogG.leg, coat); l.position.set(0.075 * sx, 0.32, 0.2 * sz); g.add(l); return l; });
    const tail = new T.Mesh(dogG.tail, coat); tail.position.set(0, 0.48, -0.32); tail.rotation.x = -0.9; g.add(tail);
    g.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); root.add(g); return { root: g, legs, tail, head, mats: [coat, dark], who: -1 }; };
  for (let i = 0; i < 8; i++) dogs.push(makeDog());
  const poseDog = (dg: Dog, p: PedAt) => { dg.root.visible = true; dg.root.position.set(p.x, p.y, p.z); dg.root.rotation.y = p.heading; dg.root.scale.setScalar(p.scale);
    const ph = (p.d / (0.55 * p.scale)) * Math.PI * 2; const sw = p.v > 0.05 ? 0.55 : 0; dg.legs.forEach((l, i) => { l.rotation.x = Math.sin(ph + (i === 0 || i === 3 ? 0 : Math.PI)) * sw; });
    dg.tail.rotation.z = Math.sin(p.time * 9) * 0.35; dg.head.rotation.x = p.v > 0.05 ? Math.sin(ph * 2) * 0.04 : -0.1; };
  /* the whole pool is made up front (each rig clones the mannequin once), so the people a recording shows never depend on how far it got */
  let done!: () => void; const ready = new Promise<void>((r) => { done = r; });
  const grow = () => { if (gone || pool.length >= want) { done(); return; }
    createActorRig(T).then((rig) => { if (!rig) { done(); return; } if (gone) { rig.dispose(); done(); return; } rig.root.visible = false; root.add(rig.root); pool.push({ rig, who: -1, wear: dress(rig) }); grow(); })
      .catch(() => done()); };
  grow();
  return {
    root, ready,
    get shown() { return shown; },
    update(t, cam, level, max) {
      if (level === 'off' || !pool.length) { for (const p of pool) { p.rig.root.visible = false; p.who = -1; } for (const d of dogs) { d.root.visible = false; d.who = -1; } shown = 0; return; }
      const L = CROWD[level]; const cap = Math.min(Math.round(max * L.share), pool.length);
      const near = world.pedsNear(t, cam.x, cam.z, RANGE + (max > 24 ? 15 : 0), L.rank, 160);
      const ahead = (p: PedAt) => (p.x - cam.x) * cam.fx + (p.z - cam.z) * cam.fz > -3;
      const chosen = pickGroups(near, cap, ahead); const people = chosen.filter((p) => p.kind !== 'dog'); const pets = chosen.filter((p) => p.kind === 'dog').slice(0, dogs.length);
      /* keep each figure on the person it already shows (no colour flicker), give the free ones to the newcomers */
      const ids = new Set(people.map((p) => p.id)); const held = new Map<number, (typeof pool)[number]>();
      for (const p of pool) { if (ids.has(p.who)) held.set(p.who, p); else p.who = -1; }
      const free = pool.filter((p) => p.who < 0);
      for (const ped of people) { let slot = held.get(ped.id); if (!slot) { slot = free.shift(); if (!slot) continue; slot.who = ped.id; slot.wear.set(ped.tint, ped.kind === 'child' ? 'child' : 'adult'); }
        slot.rig.root.scale.setScalar(ped.scale); /* children: the same figure, smaller, with a shorter stride */
        slot.rig.pose({ pos: [ped.x, ped.y, ped.z], heading: ped.heading, v: ped.v, d: ped.d / ped.scale, time: ped.time, beat: null }); }
      for (const p of free) p.rig.root.visible = false;
      const dIds = new Set(pets.map((p) => p.id)); const dHeld = new Map<number, Dog>(); for (const d of dogs) { if (dIds.has(d.who)) dHeld.set(d.who, d); else d.who = -1; }
      const dFree = dogs.filter((d) => d.who < 0);
      for (const p of pets) { let d = dHeld.get(p.id); if (!d) { d = dFree.shift(); if (!d) continue; d.who = p.id; const [c0, c1] = WEAR.dog[p.tint % WEAR.dog.length]; d.mats[0].color.set(c0); d.mats[1].color.set(c1); } poseDog(d, p); }
      for (const d of dFree) d.root.visible = false;
      shown = people.length;
    },
    dispose() { gone = true; for (const p of pool) p.rig.dispose(); pool.length = 0; for (const d of dogs) for (const m of d.mats) m.dispose(); for (const g of Object.values(dogG)) g.dispose(); root.removeFromParent(); },
  };
}
