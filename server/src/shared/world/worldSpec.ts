/**
 * World spec (2026-10-26): the placement JSON a Direct a Shot world is built from. Isomorphic and pure (no three.js, no DOM), like
 * previzTemplates.ts. The city generator (cityGen.ts) writes one; later a text brief ("rainy neon downtown") can too: the engine assembles
 * whatever spec it is given, and validateWorld() says what is wrong in plain words so an agent can fix it and retry.
 *  - pieces: kit piece id (kitCatalog.ts) + where it stands (x, z, metres; y = its base height) + quarter turns (r) + an optional scale (s).
 *  - tiles snap to the 10 m grid; every solid piece (building, prop, tree, car) has a box collider from its footprint (pieceBox).
 *  - surfaces: raised walkable floors the terrain doesn't know (a pier deck, with an optional ramp along z).
 *  - districts, spawns, landmarks: for the minimap and "teleport to district"; carLoops: the ambient traffic's closed routes.
 */
import { KIT, type KitPiece } from './kitCatalog.js';

export type Quarter = 0 | 1 | 2 | 3;
export interface WorldPiece { k: string; x: number; z: number; y: number; r: Quarter; s?: number }
export interface WorldSurface { id: string; rect: [number, number, number, number]; /** deck height at z0 and z1 (a ramp when they differ) */ y: [number, number] }
export interface WorldDistrict { id: string; name: string; colour: string; rects: [number, number, number, number][]; spawn: { pos: [number, number]; heading: number } }
export interface WorldLandmark { id: string; name: string; pos: [number, number] }
export interface CarLoop { id: string; /** the route's corners (a closed loop, metres), already on the lane */ pts: [number, number][]; cars: { k: string; phase: number; speed: number; colour?: string }[] }
export interface TerrainSpec { /** the flat city floor: x0, x1, z0, z1 */ flat: [number, number, number, number]; /** hill height at the map edge */ hill: number;
  /** where the sand meets the sea (z) and the water level */ shoreZ: number; water: number; seed: number }
export interface WorldSpec {
  version: 1; name: string; seed: number; tile: number;
  /** the tile grid: n × n tiles of `tile` metres from (x0, z0) */ grid: { n: number; x0: number; z0: number };
  /** half the playable size (metres from the centre) */ half: number;
  terrain: TerrainSpec; pieces: WorldPiece[]; surfaces: WorldSurface[]; districts: WorldDistrict[]; landmarks: WorldLandmark[]; carLoops: CarLoop[];
  /** park pond / extra water discs: x, z, radius */ ponds: [number, number, number][];
}

/** A box on the ground: x0..x1, z0..z1 (metres), from y0 up to y1. */
export interface Box { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number }
export const SOLID_KINDS = new Set(['building', 'prop', 'tree', 'car']);
export const kitOf = (k: string): KitPiece | null => KIT[k] ?? null;
/** a local point (x, z) of a piece turned by r quarter turns (three.js: rotation.y = r·π/2) */
export function turn(x: number, z: number, r: number): [number, number] {
  switch (((r % 4) + 4) % 4) { case 1: return [z, -x]; case 2: return [-x, -z]; case 3: return [-z, x]; default: return [x, z]; }
}
/** The ground box a piece covers (its collider when it has one, else its whole footprint); null for an unknown kit id. */
export function pieceBox(p: WorldPiece, collider = true): Box | null {
  const kit = kitOf(p.k); if (!kit) return null; const s = p.s ?? 1;
  const [cx, cz, w, d] = collider && kit.col ? kit.col : [kit.cx, kit.cz, kit.w, kit.d];
  const [ox, oz] = turn(cx * s, cz * s, p.r); const odd = p.r % 2 === 1; const hw = ((odd ? d : w) * s) / 2, hd = ((odd ? w : d) * s) / 2;
  return { x0: p.x + ox - hw, x1: p.x + ox + hw, z0: p.z + oz - hd, z1: p.z + oz + hd, y0: p.y + kit.y0 * s, y1: p.y + kit.h * s };
}
export const isSolid = (p: WorldPiece) => SOLID_KINDS.has(kitOf(p.k)?.kind ?? '');
export const isTile = (p: WorldPiece) => kitOf(p.k)?.kind === 'tile';
/** the solid pieces' colliders (what the person and the camera can't pass through) */
export function collidersOf(spec: WorldSpec): Box[] { const out: Box[] = []; for (const p of spec.pieces) if (isSolid(p)) { const b = pieceBox(p); if (b) out.push(b); } return out; }

/** A grid of buckets so overlap and collision queries only look at nearby boxes. */
export class BoxIndex {
  readonly cell: number; private m = new Map<number, number[]>(); readonly boxes: Box[];
  constructor(boxes: Box[], cell = 16) { this.cell = cell; this.boxes = boxes; boxes.forEach((b, i) => this.each(b.x0, b.x1, b.z0, b.z1, (k) => { const a = this.m.get(k); if (a) a.push(i); else this.m.set(k, [i]); })); }
  private key(i: number, j: number) { return (i + 4096) * 8192 + (j + 4096); }
  private each(x0: number, x1: number, z0: number, z1: number, f: (k: number) => void) {
    const c = this.cell; for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) f(this.key(i, j)); }
  /** indices of boxes whose bucket touches the area (may include boxes that don't overlap it) */
  near(x0: number, x1: number, z0: number, z1: number): number[] { const seen = new Set<number>(); this.each(x0, x1, z0, z1, (k) => { for (const i of this.m.get(k) ?? []) seen.add(i); }); return [...seen]; }
}
const overlapArea = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));

export interface WorldCheck { ok: boolean; problems: string[]; counts: Record<string, number> }
/** What is wrong with a spec, in plain words (at most 40 lines): unknown pieces, bad turns, tiles off the grid or stacked, pieces outside
 *  the map, solid pieces that overlap (a tree inside a house, two cars in one spot). */
export function validateWorld(spec: WorldSpec, max = 40): WorldCheck {
  const problems: string[] = []; const counts: Record<string, number> = {}; const say = (m: string) => { if (problems.length < max) problems.push(m); };
  const { n, x0, z0 } = spec.grid; const T = spec.tile; const tiles = new Set<string>(); const solid: { p: WorldPiece; b: Box }[] = [];
  spec.pieces.forEach((p, i) => {
    const kit = kitOf(p.k); if (!kit) { say(`Piece ${i}: "${p.k}" is not in the kit catalogue.`); return; }
    counts[kit.kind] = (counts[kit.kind] ?? 0) + 1;
    if (![0, 1, 2, 3].includes(p.r)) say(`Piece ${i} (${p.k}): turn r must be 0, 1, 2 or 3 quarter turns.`);
    if (![p.x, p.y, p.z, p.s ?? 1].every(Number.isFinite)) { say(`Piece ${i} (${p.k}): position is not a number.`); return; }
    if (Math.abs(p.x) > spec.half + 200 || Math.abs(p.z) > spec.half + 200) say(`Piece ${i} (${p.k}) stands outside the map at (${p.x.toFixed(1)}, ${p.z.toFixed(1)}).`);
    if (kit.kind === 'tile') { const gi = (p.x - x0 - T / 2) / T, gj = (p.z - z0 - T / 2) / T;
      if (Math.abs(gi - Math.round(gi)) > 1e-6 || Math.abs(gj - Math.round(gj)) > 1e-6) say(`Tile ${i} (${p.k}) is off the ${T} m grid at (${p.x}, ${p.z}).`);
      else if (gi < 0 || gj < 0 || gi >= n || gj >= n) say(`Tile ${i} (${p.k}) is outside the grid.`);
      const key = `${Math.round(gi)},${Math.round(gj)}`; if (tiles.has(key)) say(`Two tiles share the grid square ${key}.`); tiles.add(key); return; }
    if (SOLID_KINDS.has(kit.kind)) { const b = pieceBox(p); if (b) solid.push({ p, b }); }
  });
  const idx = new BoxIndex(solid.map((s) => s.b)); let clashes = 0;
  solid.forEach((s, i) => { for (const j of idx.near(s.b.x0, s.b.x1, s.b.z0, s.b.z1)) if (j > i && overlapArea(s.b, solid[j].b) > 0.01) { clashes++; say(`${s.p.k} at (${s.p.x.toFixed(1)}, ${s.p.z.toFixed(1)}) overlaps ${solid[j].p.k} at (${solid[j].p.x.toFixed(1)}, ${solid[j].p.z.toFixed(1)}).`); } });
  counts.overlaps = clashes; counts.pieces = spec.pieces.length;
  return { ok: problems.length === 0, problems, counts };
}

/** Any input (an agent's JSON) → a spec with only known pieces and finite numbers; null when it isn't a spec at all. */
export function normalizeWorldSpec(raw: unknown): WorldSpec | null {
  if (!raw || typeof raw !== 'object') return null; const r = raw as Record<string, any>; if (!Array.isArray(r.pieces) || !r.grid || !r.terrain) return null;
  const num = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const pieces: WorldPiece[] = []; for (const p of r.pieces.slice(0, 60000)) { if (!p || typeof p !== 'object' || !kitOf(String(p.k))) continue;
    const q: WorldPiece = { k: String(p.k), x: num(p.x, 0), z: num(p.z, 0), y: num(p.y, 0), r: ((Math.round(num(p.r, 0)) % 4) + 4) % 4 as Quarter }; if (p.s != null) q.s = Math.max(0.1, Math.min(4, num(p.s, 1))); pieces.push(q); }
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  return { version: 1, name: String(r.name ?? 'World').slice(0, 80), seed: num(r.seed, 1) >>> 0, tile: num(r.tile, 10), grid: { n: num(r.grid.n, 80), x0: num(r.grid.x0, -400), z0: num(r.grid.z0, -400) }, half: num(r.half, 400),
    terrain: { flat: arr(r.terrain.flat).map(Number) as any, hill: num(r.terrain.hill, 30), shoreZ: num(r.terrain.shoreZ, 1e9), water: num(r.terrain.water, -0.8), seed: num(r.terrain.seed, 1) },
    pieces, surfaces: arr(r.surfaces), districts: arr(r.districts), landmarks: arr(r.landmarks), carLoops: arr(r.carLoops), ponds: arr(r.ponds) };
}
