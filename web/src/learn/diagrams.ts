/**
 * The pop-up figure on each right-hand page of the e-commerce book: props from inkKit.ts arranged per chapter, each on a hinge (pivot) so it
 * can lie flat on the page and rise when the page opens, plus orange flows and the anchor points the tap hotspots follow.
 * Coordinates: the right page's centre is (0, 0, 0); x runs from the spine (-0.5) to the outer edge (0.5), z from the top edge (-0.68)
 * to the bottom edge (0.68); y is up. Footprints are what pageArt.ts prints under each piece.
 */
import type { Chapter } from './ecomChapters';
import type { ArtSlot } from './ecomArt';
import type { Footprint } from './pageArt';
import type { Kit } from './inkKit';

export const PAGE_W = 1; export const PAGE_D = 1.36;
export interface Part { pivot: any; d: number }
export interface Built { root: any; parts: Part[]; anchors: Record<string, any>; feet: Footprint[]; shows: { value: number }[]; ends: any[]; update?: (t: number) => void }

export function buildDiagram(kit: Kit, ch: Chapter, imgs: Partial<Record<ArtSlot, HTMLImageElement | null>>): Built {
  const { T } = kit; const root = new T.Group(); const parts: Part[] = []; const anchors: Record<string, any> = {}; const feet: Footprint[] = [];
  const f0 = kit.flows.length; let update: ((t: number) => void) | undefined;
  /** a piece on a hinge at (x, z); d = when it rises (0 first … 0.5 last) */
  const P = (obj: any, x: number, z: number, d: number, ry = 0, foot: [number, number, boolean?] = [0.16, 0.07]) => {
    const pivot = new T.Group(); pivot.position.set(x, 0, z); obj.rotation.y += ry; pivot.add(obj); root.add(pivot); parts.push({ pivot, d });
    feet.push({ u: 0.5 + x, v: (z + PAGE_D / 2) / PAGE_D, w: foot[0], h: foot[1], accent: foot[2] }); return obj; };
  const A = (id: string, parent: any, x: number, y: number, z: number) => { const o = new T.Object3D(); o.position.set(x, y, z); parent.add(o); anchors[id] = o; return o; };
  const F = (pts: number[][], r?: number) => { const f = kit.flow(pts, r); root.add(f); return f; };
  const art = (s: ArtSlot) => kit.cardTex('photo', imgs[s] ?? null, s);

  switch (ch.diagram) {
    case 'photo': {
      const bd = P(kit.sweep(0.5, 'cream', 0.36, 0.32), 0.02, -0.12, 0, 0, [0.5, 0.26]); A('backdrop', bd, 0.16, 0.3, -0.17);
      P(kit.bottle(1.05), 0.02, -0.04, 0.12, 0, [0.15, 0.06]);
      const sb = P(kit.softbox(), -0.3, -0.06, 0.22, 0.9, [0.14, 0.06]); A('light', sb, 0, 0.3, 0.02);
      const cam = P(kit.camera(), 0.08, 0.34, 0.3, Math.PI + 0.15, [0.16, 0.07]); A('angle', cam, 0, 0.26, 0);
      const fr = P(kit.frame(0.16, 0.16, art('ch1-reference')), 0.33, 0.2, 0.42, -0.5, [0.14, 0.05, true]); A('upscale', fr, 0, 0.2, 0);
      F([[-0.27, 0.3, -0.04], [-0.16, 0.34, -0.06], [-0.04, 0.2, -0.05]]); F([[0.08, 0.2, 0.3], [0.05, 0.17, 0.15], [0.03, 0.12, 0.0]]);
      F([[0.08, 0.12, -0.02], [0.24, 0.2, 0.06], [0.31, 0.18, 0.17]], 0.005);
      break;
    }
    case 'studio': {
      const w = P(kit.sweep(0.24, 'paper', 0.28, 0.26), -0.28, -0.12, 0, 0, [0.24, 0.2]); w.add(kit.at(kit.box(0.08, 0.1, 0.08, 'label'), 0, 0, 0.02)); A('white', w, 0, 0.2, 0.0);
      const c = P(kit.sweep(0.24, 'peach', 0.28, 0.26), 0, -0.12, 0.1, 0, [0.24, 0.2]); c.add(kit.at(kit.bottle(0.8), 0, 0, 0.02)); A('colour', c, 0, 0.26, -0.08);
      const p = P(kit.sweep(0.24, 'sage', 0.28, 0.26), 0.28, -0.12, 0.2, 0, [0.24, 0.2]); p.add(kit.at(kit.plinth(0.075, 0.07, 'cream'), 0, 0, 0.02)); p.add(kit.at(kit.bottle(0.7), 0, 0.07, 0.02)); A('plinth', p, 0, 0.1, 0.06);
      P(kit.frame(0.14, 0.14, art('ch1-reference')), 0, 0.33, 0.34, 0, [0.14, 0.05, true]);
      F([[0, 0.12, 0.3], [-0.16, 0.2, 0.15], [-0.27, 0.12, -0.08]]); F([[0, 0.12, 0.3], [0, 0.18, 0.12], [0, 0.12, -0.08]]); F([[0, 0.12, 0.3], [0.16, 0.2, 0.15], [0.27, 0.14, -0.08]]);
      break;
    }
    case 'lifestyle': {
      const win = P(kit.windowFrame(0.28, 0.26), -0.18, -0.3, 0, 0, [0.3, 0.05]); A('window', win, 0, 0.22, 0.01);
      const ctr = P(kit.box(0.62, 0.11, 0.26, 'wood'), 0.04, -0.05, 0.1, 0, [0.62, 0.2]); ctr.add(kit.at(kit.box(0.64, 0.012, 0.28, 'cream'), 0, 0.11, 0));
      ctr.add(kit.at(kit.bottle(0.85), 0.05, 0.122, 0.02)); ctr.add(kit.at(kit.plant(), -0.19, 0.122, -0.04)); ctr.add(kit.at(kit.mug(), 0.2, 0.122, 0.03)); ctr.add(kit.at(kit.box(0.09, 0.008, 0.06, 'sage'), 0.17, 0.122, 0.07));
      A('counter', ctr, 0.05, 0.2, 0.02); A('props', ctr, -0.19, 0.24, -0.04);
      const fig = P(kit.figure(), 0.3, 0.32, 0.3, -0.4, [0.12, 0.06]); A('person', fig, 0, 0.3, 0);
      F([[-0.12, 0.24, -0.28], [-0.04, 0.32, -0.16], [0.07, 0.26, -0.04]]); F([[0.25, 0.3, 0.3], [0.2, 0.32, 0.14], [0.1, 0.24, -0.02]], 0.005);
      break;
    }
    case 'consistency': {
      const slots: ArtSlot[] = ['ch4-slab', 'ch4-towel', 'ch4-palm']; const xs = [-0.22, 0.04, 0.3];
      slots.forEach((s, i) => P(kit.frame(0.2, 0.25, art(s)), xs[i], -0.2, 0.08 * i, (1 - i) * 0.12, [0.2, 0.06]));
      const rc = P(kit.frame(0.2, 0.2, kit.cardTex('recipe')), -0.24, 0.24, 0.3, 0.35, [0.2, 0.05, true]); A('recipe', rc, 0, 0.2, 0);
      const d = P(kit.die(), 0.02, 0.3, 0.38, 0, [0.09, 0.05]); A('seed', d, 0, 0.09, 0);
      const ref = P(kit.frame(0.15, 0.15, art('ch1-reference')), 0.28, 0.24, 0.44, -0.35, [0.15, 0.05, true]); A('reference', ref, 0, 0.17, 0);
      for (const x of xs) F([[-0.2, 0.22, 0.2], [(x - 0.2) / 2, 0.3, 0.02], [x, 0.18, -0.17]], 0.005);
      F([[0.27, 0.17, 0.2], [0.2, 0.24, 0.0], [0.06, 0.16, -0.17]], 0.004);
      break;
    }
    case 'poster': {
      const ps = P(kit.easel(0.34, 0.46, imgs['ch5-poster'] ? art('ch5-poster') : kit.cardTex('poster')), -0.08, -0.16, 0, 0.1, [0.36, 0.1]);
      A('headline', ps, -0.08, 0.42, 0.02); A('space', ps, 0.08, 0.26, 0.02);
      P(kit.bottle(0.95), 0.22, 0.08, 0.2, 0, [0.14, 0.06]);
      const tg = P(kit.priceTag(1.3), -0.22, 0.27, 0.32, 0.4, [0.12, 0.06, true]); A('price', tg, 0, 0.1, 0);
      F([[-0.2, 0.12, 0.25], [-0.25, 0.2, 0.05], [-0.18, 0.14, -0.1]], 0.005);
      break;
    }
    case 'video': {
      const tt = P(kit.turntable(), 0, -0.08, 0, 0, [0.32, 0.16]); const spin = new T.Group(); spin.position.y = 0.038; spin.add(kit.bottle(0.9)); tt.add(spin); A('turntable', tt, 0.1, 0.12, 0.05);
      const track: number[][] = []; for (let i = 0; i <= 16; i++) { const a = Math.PI * 0.1 + (i / 16) * Math.PI * 0.8; track.push([Math.cos(a) * 0.28, 0.12, -0.08 + Math.sin(a) * 0.28]); } F(track, 0.006);
      const camPivot = new T.Group(); root.add(camPivot); const cam = kit.camera(); cam.scale.setScalar(0.68); camPivot.add(cam); A('move', cam, 0, 0.28, 0);
      const film = P(kit.frame(0.36, 0.11, kit.cardTex('film')), 0.12, 0.44, 0.32, 0, [0.36, 0.04]); A('frames', film, 0.1, 0.12, 0);
      const cb = P(kit.cube(), -0.33, 0.32, 0.4, 0, [0.09, 0.05, true]); A('plan', cb, 0, 0.1, 0);
      F([[-0.3, 0.12, 0.3], [-0.3, 0.2, 0.1], [-0.22, 0.14, 0.06]], 0.004);
      update = (t: number) => { spin.rotation.y = kit.reduced ? 0.6 : t * 0.5; const ang = kit.reduced ? Math.PI * 0.35 : Math.PI * 0.1 + (0.5 + 0.5 * Math.sin(t * 0.35)) * Math.PI * 0.8;
        camPivot.position.set(Math.cos(ang) * 0.28, 0, -0.08 + Math.sin(ang) * 0.28); camPivot.rotation.y = Math.atan2(-Math.cos(ang), -Math.sin(ang)); };
      parts.push({ pivot: camPivot, d: 0.2 }); feet.push({ u: 0.5 + 0.0, v: (0.24 + PAGE_D / 2) / PAGE_D, w: 0.1, h: 0.05 });
      break;
    }
    case 'sound': {
      const sp = P(kit.speaker(), -0.26, -0.12, 0, 0.35, [0.18, 0.1]);
      const bars = new T.Group(); const n = 9; const bar: any[] = []; for (let i = 0; i < n; i++) { const b = kit.box(0.026, 0.1, 0.026, 'accent'); b.position.x = i * 0.04; bars.add(b); bar.push(b); }
      P(bars, -0.08, -0.08, 0.12, 0, [0.36, 0.06, true]); A('tempo', bars, 0.16, 0.14, 0);
      const notes = new T.Group(); [[0, 0.2, 0], [0.12, 0.28, -0.05], [0.24, 0.22, 0.02]].forEach(([x, y, z]) => notes.add(kit.at(kit.note(), x, y, z))); P(notes, -0.05, -0.28, 0.24, 0, [0.3, 0.05]); A('mood', notes, 0.12, 0.34, -0.05);
      const ph = P(kit.phone(imgs['ch7-cover'] ? art('ch7-cover') : kit.cardTex('phone')), 0.24, 0.26, 0.36, -0.3, [0.14, 0.06]); A('phone', ph, 0, 0.25, 0);
      F([[-0.2, 0.18, -0.04], [0.0, 0.3, 0.14], [0.2, 0.16, 0.24]]); void sp;
      update = (t: number) => { bar.forEach((b, i) => { b.scale.y = kit.reduced ? 0.6 + 0.5 * Math.abs(Math.sin(i * 1.3)) : 0.35 + 0.9 * Math.abs(Math.sin(t * 2.6 + i * 0.7)) * (0.6 + 0.4 * Math.sin(t * 1.1 + i)); }); };
      break;
    }
    case 'launch': {
      const board = P(kit.flat(0.48, 0.3, 'cream'), -0.12, -0.2, 0, 0, [0.48, 0.3]); A('canvas', board, -0.2, 0.05, 0.1);
      const a = P(kit.frame(0.16, 0.2, imgs['ch8-a'] ? art('ch8-a') : kit.cardTex('A')), -0.22, -0.22, 0.1, 0.15, [0.16, 0.05]);
      P(kit.frame(0.16, 0.2, imgs['ch8-b'] ? art('ch8-b') : kit.cardTex('B')), -0.02, -0.22, 0.16, -0.15, [0.16, 0.05]); A('ab', a, 0.1, 0.26, 0);
      P(kit.shipBox(), -0.3, 0.12, 0.22, 0.3, [0.18, 0.12]);
      P(kit.phone(kit.cardTex('phone', imgs['ch8-a'] ?? null)), 0.3, -0.12, 0.28, -0.25, [0.14, 0.06]);
      const ct = P(kit.cart(), 0.2, 0.3, 0.38, -0.5, [0.24, 0.12, true]); A('cart', ct, 0, 0.2, 0);
      const cn = P(kit.coins(6), -0.08, 0.34, 0.44, 0, [0.09, 0.05]); A('spend', cn, 0, 0.1, 0); P(kit.priceTag(1), 0.02, 0.18, 0.46, 0.6, [0.08, 0.05]);
      F([[-0.3, 0.16, 0.1], [0.0, 0.32, 0.0], [0.28, 0.2, -0.12]]); F([[-0.12, 0.22, -0.22], [0.1, 0.3, -0.2], [0.27, 0.22, -0.13]], 0.005); F([[0.3, 0.12, -0.08], [0.32, 0.22, 0.12], [0.22, 0.2, 0.26]]);
      break;
    }
  }
  const shows = kit.flows.slice(f0).map((f: any) => f.show); const ends = kit.flows.slice(f0).map((f: any) => f.end);
  return { root, parts, anchors, feet, shows, ends, update };
}
