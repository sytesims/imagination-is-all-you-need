/**
 * Open city generator (2026-10-26): a seeded, deterministic city of about 800 m across, written as a WorldSpec (worldSpec.ts) that the
 * engine assembles. Our own layout: a valley town by the sea. A main avenue with a palm median runs north–south from the hills to the coast;
 * downtown towers stand north-east of it, low-rise shops and courtyards south-east (midtown), an older quarter of small shops north-west,
 * a park with a plaza and a pond in the middle-west, houses with gardens and fences in the west and south-west, a beach with palms and a
 * pier along the south, and wooded hills (with a lookout) around the rest. Roads on a 10 m grid with junctions, T-splits and corners;
 * street lights, traffic lights, parked cars, and ambient traffic on closed loops.
 * The seed changes the details (which buildings, trees, parked cars, traffic); the street plan stays the same, so spawn points and the
 * minimap hold for any seed. Every solid piece is placed through an overlap check, so footprints never overlap.
 */
import { pieceBox, BoxIndex, kitOf, turn, type Box, type CarLoop, type Quarter, type WorldDistrict, type WorldPiece, type WorldSpec, type WorldSurface, type WorldLandmark, type TerrainSpec } from './worldSpec.js';
import { terrainHeight } from './terrain.js';

const N = 80, T = 10, X0 = -400, Z0 = -400;
/** the street grid (tile columns and rows); 39 and 41 are the avenue's two carriageways, 40 its median */
export const CITY_COLS = [4, 10, 16, 22, 28, 34, 39, 41, 47, 53, 59, 65, 71, 75];
export const CITY_ROWS = [8, 14, 20, 26, 32, 38, 44, 50, 56, 62];
const PARK_IN = { i0: 23, i1: 38, j0: 27, j1: 43 }; /* the park's inside (no streets) */
const PLAZA = { i0: 35, i1: 38, j0: 27, j1: 30 };
export const TILE_TOP = { road: 0, base: 0.15 } as const; /* the road surface and the pavement (tiles stand at y = −0.35) */
const TILE_Y = -0.35;
const cx = (i: number) => X0 + i * T + T / 2, cz = (j: number) => Z0 + j * T + T / 2;
/** N, E, S, W as unit steps on the grid (N = −z) */
const DIRS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export type CityDistrictId = 'downtown' | 'avenue' | 'midtown' | 'oldtown' | 'park' | 'suburbs' | 'beach' | 'hills';
export function isRoadTile(i: number, j: number): boolean {
  if (i < 4 || i > 75 || j < 8 || j > 62) return false;
  if (i >= PARK_IN.i0 && i <= PARK_IN.i1 && j >= PARK_IN.j0 && j <= PARK_IN.j1) return false;
  return CITY_COLS.includes(i) || CITY_ROWS.includes(j);
}
export function districtOfTile(i: number, j: number): CityDistrictId {
  if (j >= 63) return 'beach'; if (i < 4 || i > 75 || j < 8) return 'hills'; if (i >= 39 && i <= 41) return 'avenue';
  if (i >= 41) return j <= 32 ? 'downtown' : 'midtown'; if (j <= 26) return 'oldtown'; if (i >= 22 && j <= 44) return 'park'; return 'suburbs';
}
export const tileOf = (x: number, z: number): [number, number] => [Math.floor((x - X0) / T), Math.floor((z - Z0) / T)];

function mulberry(seed: number): () => number { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Places pieces; solid ones only when they clear everything solid placed before (and the reserved spots). */
class Placer {
  pieces: WorldPiece[] = []; private boxes: Box[] = []; private grid = new Map<number, number[]>(); private tiles = new Set<number>();
  private key(i: number, j: number) { return (i + 512) * 2048 + (j + 512); }
  private cells(b: Box, f: (k: number) => void) { for (let i = Math.floor(b.x0 / 16); i <= Math.floor(b.x1 / 16); i++) for (let j = Math.floor(b.z0 / 16); j <= Math.floor(b.z1 / 16); j++) f(this.key(i, j)); }
  clear(b: Box) { let ok = true; this.cells(b, (k) => { if (!ok) return; for (const i of this.grid.get(k) ?? []) { const o = this.boxes[i]; if (Math.min(o.x1, b.x1) - Math.max(o.x0, b.x0) > 1e-3 && Math.min(o.z1, b.z1) - Math.max(o.z0, b.z0) > 1e-3) { ok = false; return; } } }); return ok; }
  reserve(b: Box) { const n = this.boxes.length; this.boxes.push(b); this.cells(b, (k) => { const a = this.grid.get(k); if (a) a.push(n); else this.grid.set(k, [n]); }); }
  tile(k: string, i: number, j: number, r: Quarter = 0) { const key = i * 1000 + j; if (this.tiles.has(key)) return false; this.tiles.add(key); this.pieces.push({ k, x: cx(i), z: cz(j), y: TILE_Y, r }); return true; }
  /** a grid square taken by a piece that brings its own pavement */ claim(i: number, j: number) { this.tiles.add(i * 1000 + j); }
  hasTile(i: number, j: number) { return this.tiles.has(i * 1000 + j); }
  /** a solid or decorative piece; false (and nothing placed) when a solid one would overlap */
  put(p: WorldPiece): boolean { const kit = kitOf(p.k); if (!kit) return false;
    if (kit.kind === 'car') p = { ...p, y: r4(p.y - kit.y0 * (p.s ?? 1)) }; /* wheels on the ground */
    if (['building', 'prop', 'tree', 'car'].includes(kit.kind)) { const b = pieceBox(p)!; if (!this.clear(b)) return false; this.reserve(b); }
    this.pieces.push(p); return true; }
  /** place so the piece's footprint centre lands on (x, z) */
  putCentred(k: string, x: number, z: number, y: number, r: Quarter, s = carScale(k)): boolean { /* cars come at the car scale */ const kit = kitOf(k)!; const [ox, oz] = turn(kit.cx * s, kit.cz * s, r); return this.put({ k, x: r4(x - ox), z: r4(z - oz), y, r, ...(s !== 1 ? { s: r4(s) } : {}) }); }
}
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const pick = <T>(R: () => number, a: readonly T[]): T => a[Math.floor(R() * a.length) % a.length];
/** the quarter turn that makes a piece's front (+z) face direction d (0 N, 1 E, 2 S, 3 W) */
const faceTo = (d: number): Quarter => (((2 - d) % 4 + 4) % 4) as Quarter;
/** the quarter turn that points a street light's arm (its −x) towards direction d */
const armTo = (d: number): Quarter => (((3 - d) % 4 + 4) % 4) as Quarter;

const KK_BUILDINGS = ['kk.building_A', 'kk.building_B', 'kk.building_C', 'kk.building_D', 'kk.building_E', 'kk.building_F', 'kk.building_G', 'kk.building_H'];
const TOWERS = ['kc.building-skyscraper-a', 'kc.building-skyscraper-b', 'kc.building-skyscraper-c', 'kc.building-skyscraper-d', 'kc.building-skyscraper-e', 'kc.building-l', 'kc.building-m', 'kc.building-i'];
const SHOPS = ['kc.building-a', 'kc.building-b', 'kc.building-c', 'kc.building-d', 'kc.building-f', 'kc.building-g', 'kc.building-h'];
const HOUSES = ['ks.building-type-a', 'ks.building-type-b', 'ks.building-type-c', 'ks.building-type-d', 'ks.building-type-e', 'ks.building-type-f', 'ks.building-type-g', 'ks.building-type-h', 'ks.building-type-i', 'ks.building-type-j',
  'ks.building-type-k', 'ks.building-type-l', 'ks.building-type-m', 'ks.building-type-n', 'ks.building-type-o', 'ks.building-type-p', 'ks.building-type-r', 'ks.building-type-s', 'ks.building-type-t', 'ks.building-type-u'];
export const CITY_CARS = ['kk.car_hatchback', 'kk.car_sedan', 'kk.car_stationwagon', 'kk.car_taxi', 'kk.car_police', 'kv.sedan', 'kv.suv', 'kv.van', 'kv.taxi', 'kv.truck', 'kv.delivery', 'kv.hatchback-sports'];
/** Car scale (2026-10-27): the kits' cars are toy-sized next to a 1.75 m person (Kenney's are 2.55 m wide and up to 2.55 m tall, KayKit's 2.1 m
 *  wide). Every car is drawn and collides at this scale, parked, in traffic or yours: about 1.9–2 m wide and 1.4–2 m tall. */
export const CAR_SCALE = { kv: 0.8, kk: 0.9 } as const;
export const carScale = (k: string): number => (k.startsWith('kv.') ? CAR_SCALE.kv : k.startsWith('kk.car') ? CAR_SCALE.kk : 1);
const PARKED = ['kk.car_hatchback', 'kk.car_sedan', 'kk.car_stationwagon', 'kv.sedan', 'kv.suv', 'kv.van', 'kv.hatchback-sports'];
const LEAFY = ['kn.tree_oak', 'kn.tree_default', 'kn.tree_detailed', 'kn.tree_fat', 'kn.tree_cone', 'kn.tree_oak_fall'];
const PINES = ['kn.tree_pineTallA', 'kn.tree_pineTallB', 'kn.tree_pineRoundA', 'kn.tree_pineRoundC', 'kn.tree_pineDefaultA', 'kn.tree_pineSmallA', 'kn.tree_default_dark'];
const PALMS = ['kn.tree_palmTall', 'kn.tree_palmBend', 'kn.tree_palmDetailedTall', 'kn.tree_palmShort'];
const FLOWERS = ['kn.flower_redA', 'kn.flower_yellowA', 'kn.flower_purpleA', 'kn.plant_bush', 'kn.plant_bushLarge', 'kn.plant_bushDetailed', 'kn.grass_large', 'kn.grass_leafsLarge'];

/** the car loops, as tile corners in driving order (cars keep to the right) */
const LOOPS: { id: string; tiles: [number, number][]; speed: number }[] = [
  { id: 'avenue', tiles: [[39, 8], [39, 62], [41, 62], [41, 8]], speed: 12 },
  { id: 'downtown', tiles: [[47, 8], [65, 8], [65, 26], [47, 26]], speed: 9 },
  { id: 'midtown', tiles: [[53, 38], [71, 38], [71, 56], [53, 56]], speed: 9 },
  { id: 'oldtown', tiles: [[10, 8], [34, 8], [34, 20], [10, 20]], speed: 8 },
  { id: 'coast', tiles: [[4, 56], [75, 56], [75, 62], [4, 62]], speed: 11 },
  { id: 'suburbs', tiles: [[4, 32], [16, 32], [16, 50], [4, 50]], speed: 7 },
  { id: 'east', tiles: [[65, 14], [75, 14], [75, 50], [65, 50]], speed: 10 },
  { id: 'ring', tiles: [[22, 26], [59, 26], [59, 44], [22, 44]], speed: 10 },
];
const LANE = 1.5; const CORNER_R = 4.5;

export const CITY_TERRAIN = (seed: number): TerrainSpec => ({ flat: [-362, 362, -322, 232], hill: 42, shoreZ: 300, water: -0.8, seed: (seed % 997) + 3 });
export const PIER = { x0: 131.5, x1: 138.5, z0: 230, ramp: 262, z1: 395, deck: 1.6 };
export const POND: [number, number, number] = [-135, -5, 17];

export interface CityOptions { seed?: number }
/** The whole city for a seed (same seed → the same spec, piece for piece). */
export function generateCity(opts: CityOptions = {}): WorldSpec {
  const seed = (opts.seed ?? 1) >>> 0; const R = mulberry(seed * 2654435761 + 12345); const P = new Placer(); const terrain = CITY_TERRAIN(seed);
  const groundY = (x: number, z: number) => terrainHeight(terrain, x, z);
  const road = (i: number, j: number) => isRoadTile(i, j);
  const loopTiles = new Set<number>();
  for (const L of LOOPS) for (let k = 0; k < L.tiles.length; k++) { const [a, b] = L.tiles[k], [c, d] = L.tiles[(k + 1) % L.tiles.length];
    for (let i = Math.min(a, c); i <= Math.max(a, c); i++) for (let j = Math.min(b, d); j <= Math.max(b, d); j++) loopTiles.add(i * 1000 + j); }

  // ---- spawn points and landmarks first (kept clear of everything) ----
  const S = (i: number, j: number): [number, number] => [cx(i), cz(j)];
  const lookout: [number, number] = [-120, -372];
  const spawns: Record<CityDistrictId, { pos: [number, number]; heading: number }> = {
    downtown: { pos: S(50, 20), heading: -Math.PI / 2 }, avenue: { pos: S(39, 31), heading: 0 }, midtown: { pos: S(62, 44), heading: -Math.PI / 2 },
    oldtown: { pos: S(25, 14), heading: Math.PI / 2 }, park: { pos: [-30, -94], heading: Math.PI }, suburbs: { pos: S(10, 38), heading: Math.PI / 2 },
    beach: { pos: [135, 240], heading: 0 }, hills: { pos: [lookout[0] + 6, lookout[1] + 8], heading: 0 },
  };
  /* the spot itself and the strip behind it where the teleport camera waits (6 m back) stay clear */
  for (const s of Object.values(spawns)) { const bx = s.pos[0] - Math.sin(s.heading) * 7, bz = s.pos[1] - Math.cos(s.heading) * 7;
    P.reserve({ x0: Math.min(s.pos[0], bx) - 2.5, x1: Math.max(s.pos[0], bx) + 2.5, z0: Math.min(s.pos[1], bz) - 2.5, z1: Math.max(s.pos[1], bz) + 2.5, y0: 0, y1: 0 }); }

  // ---- streets ----
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (!road(i, j)) continue; const open = DIRS.map(([di, dj]) => road(i + di, j + dj)); const n = open.filter(Boolean).length; const dist = districtOfTile(i, j);
    let k = 'kk.road_straight', r: Quarter = 0;
    if (n === 4) k = 'kk.road_junction';
    else if (n === 3) { k = 'kk.road_tsplit'; const closed = open.indexOf(false); r = (((3 - closed) % 4 + 4) % 4) as Quarter; } /* r 0 is open N, E, S (closed W = 3) */
    else if (n === 2 && open[0] !== open[2]) { k = dist === 'suburbs' || dist === 'hills' ? 'kk.road_corner_curved' : 'kk.road_corner'; const a = open.findIndex((o, d) => o && open[(d + 1) % 4]); r = (((1 - a) % 4 + 4) % 4) as Quarter; } /* r 0 is open E, S */
    else { const alongX = open[1] || open[3]; r = alongX ? 1 : 0;
      const nearJunction = (alongX ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]]).some(([di, dj]) => DIRS.filter(([a, b]) => road(i + di + a, j + dj + b)).length >= 3 && road(i + di, j + dj));
      if (nearJunction && (dist === 'downtown' || dist === 'midtown' || dist === 'oldtown') && (i + j) % 2 === 0) k = 'kk.road_straight_crossing'; }
    P.tile(k, i, j, r);
  }
  const straightAxis = (i: number, j: number): 'x' | 'z' | null => { const o = DIRS.map(([di, dj]) => road(i + di, j + dj)); const n = o.filter(Boolean).length;
    if (n > 2 || (n === 2 && o[0] !== o[2])) return null; return o[1] || o[3] ? 'x' : 'z'; };
  // street lights along the kerbs every other tile, and traffic lights at downtown and midtown junctions
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { if (!road(i, j)) continue; const ax = straightAxis(i, j); const x = cx(i), z = cz(j); const dist = districtOfTile(i, j);
    if (ax && (i + j) % 2 === 0) { const side = (i * 7 + j * 3) % 2 === 0 ? 1 : -1;
      if (ax === 'z') P.put({ k: 'kk.streetlight', x: x + side * 4.75, z, y: 0.15, r: armTo(side > 0 ? 3 : 1) }); else P.put({ k: 'kk.streetlight', x, z: z + side * 4.75, y: 0.15, r: armTo(side > 0 ? 0 : 2) }); }
    if (!ax && (dist === 'downtown' || dist === 'midtown' || dist === 'avenue') && DIRS.every(([a, b]) => road(i + a, j + b))) P.put({ k: 'kk.trafficlight_C', x: x + 4.7, z: z + 4.7, y: 0.15, r: 0 }); }

  // ---- blocks ----
  const cols = [...CITY_COLS], rows = [...CITY_ROWS];
  const inPark = (i: number, j: number) => i >= 22 && i <= 39 && j >= 26 && j <= 44;
  for (let a = 0; a < cols.length - 1; a++) for (let b = 0; b < rows.length - 1; b++) {
    const i0 = cols[a] + 1, i1 = cols[a + 1] - 1, j0 = rows[b] + 1, j1 = rows[b + 1] - 1; if (i1 < i0 || j1 < j0) continue;
    if (i0 >= 22 && i1 <= 39 && j0 >= 26 && j1 <= 44) continue; /* the park is laid out on its own */
    const dist = districtOfTile(i0, j0); if (dist === 'avenue') { median(j0, j1); continue; }
    fillBlock(dist, i0, i1, j0, j1);
  }
  function roadDir(i: number, j: number): number[] { return DIRS.map(([di, dj], d) => (road(i + di, j + dj) ? d : -1)).filter((d) => d >= 0); }
  function median(j0: number, j1: number) { for (let j = j0; j <= j1; j++) { const x = cx(40), z = cz(j);
    P.putCentred(pick(R, ['kn.tree_palmTall', 'kn.tree_palmDetailedTall']), x, z, -0.05, Math.floor(R() * 4) as Quarter, 0.85 + R() * 0.25);
    for (let f = 0; f < 3; f++) P.put({ k: pick(R, FLOWERS), x: r4(x + (R() - 0.5) * 6), z: r4(z + (R() - 0.5) * 8), y: -0.05, r: Math.floor(R() * 4) as Quarter, s: 0.8 + R() * 0.5 }); } }
  function lot2(i: number, j: number, k: string, y: number, face: number, maxSize: number, sJitter: number) {
    const kit = kitOf(k)!; const s = Math.min(1, maxSize / Math.max(kit.w, kit.d)) * (1 - sJitter * R()); const x = (cx(i) + cx(i + 1)) / 2, z = (cz(j) + cz(j + 1)) / 2;
    return P.putCentred(k, x, z, y, faceTo(face), s); }
  function fillBlock(dist: CityDistrictId, i0: number, i1: number, j0: number, j1: number) {
    const w = i1 - i0 + 1, h = j1 - j0 + 1; const used = new Set<number>();
    const corners: [number, number][] = []; if (w >= 2 && h >= 2) { const as = w >= 4 ? [i0, i1 - 1] : [i0]; const bs = h >= 4 ? [j0, j1 - 1] : [j0]; for (const a of as) for (const b of bs) corners.push([a, b]); }
    const outward = (a: number, b: number) => { const ds = [b === j0 ? 0 : -1, a + 1 === i1 || a === i1 ? 1 : -1, b + 1 === j1 || b === j1 ? 2 : -1, a === i0 ? 3 : -1].filter((d) => d >= 0); return ds.length ? pick(R, ds) : 2; };
    if (dist === 'downtown' || dist === 'suburbs') for (const [a, b] of corners) {
      const mark = () => { for (const [p, q] of [[a, b], [a + 1, b], [a, b + 1], [a + 1, b + 1]]) used.add(p * 1000 + q); };
      if (dist === 'downtown') { for (const [p, q] of [[a, b], [a + 1, b], [a, b + 1], [a + 1, b + 1]]) P.tile('kk.base', p, q); lot2(a, b, pick(R, TOWERS), 0.15, outward(a, b), 18.4, 0.12); mark(); }
      else { lot2(a, b, pick(R, HOUSES), -0.05, outward(a, b), 13.5, 0.1); yard(a, b, outward(a, b)); mark(); }
    }
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { if (used.has(i * 1000 + j)) continue; const rd = roadDir(i, j); const x = cx(i), z = cz(j);
      if (dist === 'suburbs') { /* the gaps between gardens: lawn and trees */ for (let t = 0; t < 2; t++) P.putCentred(pick(R, LEAFY), r4(x + (R() - 0.5) * 7), r4(z + (R() - 0.5) * 7), -0.05, Math.floor(R() * 4) as Quarter, 0.6 + R() * 0.4);
        if (R() < 0.6) P.put({ k: pick(R, FLOWERS), x: r4(x + (R() - 0.5) * 8), z: r4(z + (R() - 0.5) * 8), y: -0.05, r: 0, s: 1 }); continue; }
      if (rd.length) { /* on a street: a building facing it */
        if (dist === 'oldtown' && R() < 0.55) { P.tile('kk.base', i, j); const k = pick(R, SHOPS); const kit = kitOf(k)!; P.putCentred(k, x, z, 0.15, faceTo(pick(R, rd)), Math.min(1, 9.3 / Math.max(kit.w, kit.d))); }
        else { P.claim(i, j); /* the KayKit block brings its own pavement */ P.put({ k: pick(R, KK_BUILDINGS), x, z, y: TILE_Y, r: faceTo(pick(R, rd)) }); }
        continue; }
      P.tile('kk.base', i, j); /* inside a block: a courtyard */
      if (dist === 'midtown') { /* a car park */ for (const dx of [-2.6, 2.6]) if (R() < 0.65) P.putCentred(pick(R, PARKED), x + dx, z + (R() - 0.5) * 1.2, 0.15, (R() < 0.5 ? 0 : 2) as Quarter);
        if (R() < 0.35) P.putCentred('kk.dumpster', x + (R() - 0.5) * 6, z + 4.2, 0.15, 0); continue; }
      P.putCentred(pick(R, LEAFY), x + (R() - 0.5) * 2, z + (R() - 0.5) * 2, 0.15, Math.floor(R() * 4) as Quarter, 0.55 + R() * 0.25);
      for (const [bx, bz, br] of [[-3.6, 0, 1], [3.6, 0, 3], [0, 3.6, 0]] as [number, number, Quarter][]) if (R() < 0.5) P.putCentred('kk.bench', x + bx, z + bz, 0.15, br);
      if (R() < 0.4) P.putCentred('kk.firehydrant', x - 4, z - 4, 0.15, 0); if (R() < 0.5) P.put({ k: 'kk.bush', x: r4(x + 4), z: r4(z - 4), y: 0.15, r: 0 });
    }
  }
  /** a house's garden: fence along the sides away from the street, a tree or two, maybe a car in the drive */
  function yard(a: number, b: number, face: number) {
    const x0 = cx(a) - 5, x1 = cx(a + 1) + 5, z0 = cz(b) - 5, z1 = cz(b + 1) + 5; const back = (face + 2) % 4;
    for (const side of [back, (face + 1) % 4, (face + 3) % 4]) { if (side === face) continue; const alongX = side === 0 || side === 2;
      const fixed = side === 0 ? z0 + 0.4 : side === 2 ? z1 - 0.4 : side === 1 ? x1 - 0.4 : x0 + 0.4;
      for (let k = 0; k < 4; k++) { const t = (alongX ? x0 : z0) + 2.5 + k * 5; P.putCentred('kn.fence_simple', alongX ? t : fixed, alongX ? fixed : t, -0.05, alongX ? 0 : 1, 0.7); } }
    for (let t = 0; t < 3; t++) P.putCentred(pick(R, LEAFY), r4(x0 + 3 + R() * 14), r4(z0 + 3 + R() * 14), -0.05, Math.floor(R() * 4) as Quarter, 0.55 + R() * 0.3);
    const [fx, fz] = DIRS[face]; if (R() < 0.55) { const mx = (x0 + x1) / 2 + fx * 7.2 + (fz ? 0 : 0) + (fz !== 0 ? 6 : 0), mz = (z0 + z1) / 2 + fz * 7.2 + (fx !== 0 ? 6 : 0);
      P.putCentred(pick(R, PARKED), mx, mz, -0.05, (fx !== 0 ? 1 : 0) as Quarter); }
    for (let t = 0; t < 4; t++) P.put({ k: pick(R, FLOWERS), x: r4(x0 + 2 + R() * 16), z: r4(z0 + 2 + R() * 16), y: -0.05, r: 0, s: 0.9 });
  }

  // ---- the park: cross paths, a plaza with an obelisk, a pond, trees and flowers ----
  const pathTile = (i: number, j: number) => (i === 30 && j >= PARK_IN.j0 && j <= PARK_IN.j1) || (j === 35 && i >= PARK_IN.i0 && i <= PARK_IN.i1);
  const plazaTile = (i: number, j: number) => i >= PLAZA.i0 && i <= PLAZA.i1 && j >= PLAZA.j0 && j <= PLAZA.j1;
  for (let i = PARK_IN.i0; i <= PARK_IN.i1; i++) for (let j = PARK_IN.j0; j <= PARK_IN.j1; j++) if (pathTile(i, j) || plazaTile(i, j)) P.tile('kk.base', i, j);
  const pc: [number, number] = [(cx(PLAZA.i0) + cx(PLAZA.i1)) / 2, (cz(PLAZA.j0) + cz(PLAZA.j1)) / 2];
  P.putCentred('kn.statue_obelisk', pc[0], pc[1] - 6, 0.15, 0, 1.6);
  for (const [dx, dz] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) P.putCentred('kn.statue_column', pc[0] + dx, pc[1] - 6 + dz, 0.15, 0, 1.2);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; P.putCentred('kk.bench', pc[0] + Math.cos(a) * 9, pc[1] - 6 + Math.sin(a) * 9, 0.15, faceTo(Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) > 0 ? 3 : 1) : (Math.sin(a) > 0 ? 0 : 2))); }
  for (const [dx, dz] of [[-19, 0], [19, 0], [-19, -19], [19, -19]]) P.put({ k: 'kk.streetlight', x: pc[0] + dx, z: pc[1] - 6 + dz, y: 0.15, r: 0 });
  for (let k = 0; k < 40; k++) P.put({ k: pick(R, FLOWERS.slice(0, 6)), x: r4(pc[0] + (R() - 0.5) * 36), z: r4(pc[1] - 6 + (R() - 0.5) * 36), y: 0.15, r: 0, s: 0.9 + R() * 0.4 });
  const parkBox = { x0: cx(PARK_IN.i0) - 5, x1: cx(PARK_IN.i1) + 5, z0: cz(PARK_IN.j0) - 5, z1: cz(PARK_IN.j1) + 5 };
  for (let n = 0, tries = 0; n < 230 && tries < 3000; tries++) { const x = parkBox.x0 + 3 + R() * (parkBox.x1 - parkBox.x0 - 6), z = parkBox.z0 + 3 + R() * (parkBox.z1 - parkBox.z0 - 6); const [i, j] = tileOf(x, z);
    if (P.hasTile(i, j) || Math.hypot(x - POND[0], z - POND[1]) < POND[2] + 4) continue; if (P.putCentred(pick(R, LEAFY), r4(x), r4(z), -0.05, Math.floor(R() * 4) as Quarter, 0.65 + R() * 0.45)) n++; }
  for (let n = 0; n < 380; n++) { const x = parkBox.x0 + R() * (parkBox.x1 - parkBox.x0), z = parkBox.z0 + R() * (parkBox.z1 - parkBox.z0); const [i, j] = tileOf(x, z);
    if (P.hasTile(i, j) || Math.hypot(x - POND[0], z - POND[1]) < POND[2] + 1) continue; P.put({ k: pick(R, FLOWERS), x: r4(x), z: r4(z), y: -0.05, r: Math.floor(R() * 4) as Quarter, s: 0.8 + R() * 0.6 }); }
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; P.putCentred(pick(R, ['kn.rock_largeA', 'kn.stone_largeA', 'kn.rock_largeB']), POND[0] + Math.cos(a) * (POND[2] + 1.5), POND[1] + Math.sin(a) * (POND[2] + 1.5), -0.2, Math.floor(R() * 4) as Quarter, 0.35 + R() * 0.2); }
  for (let j = PARK_IN.j0; j <= PARK_IN.j1; j += 3) P.putCentred('kk.bench', cx(30) - 4.2, cz(j), 0.15, 1); /* benches along the north–south path */

  // ---- the beach and the pier ----
  P.reserve({ x0: PIER.x0 - 1.5, x1: PIER.x1 + 1.5, z0: PIER.z0, z1: PIER.z1, y0: 0, y1: 0 });
  for (let n = 0, tries = 0; n < 110 && tries < 2000; tries++) { const x = -380 + R() * 760, z = 240 + R() * 46; if (P.putCentred(pick(R, PALMS), r4(x), r4(z), groundY(x, z), Math.floor(R() * 4) as Quarter, 0.8 + R() * 0.35)) n++; }
  for (let n = 0; n < 26; n++) { const x0 = -340 + R() * 680, z0 = 250 + R() * 30; for (let k = 0; k < 3; k++) { const x = x0 + (R() - 0.5) * 12, z = z0 + (R() - 0.5) * 8; P.putCentred(pick(R, ['kc.detail-parasol-a', 'kc.detail-parasol-b']), r4(x), r4(z), groundY(x, z), 0); } }
  for (let n = 0; n < 14; n++) { const x = -360 + R() * 720, z = 286 + R() * 10; P.putCentred('kn.canoe', r4(x), r4(z), groundY(x, z), Math.floor(R() * 4) as Quarter, 1.6); }
  for (let n = 0; n < 30; n++) { const x = -390 + R() * 780, z = 292 + R() * 14; P.putCentred(pick(R, ['kn.rock_largeA', 'kn.rock_largeC', 'kn.stone_largeA']), r4(x), r4(z), groundY(x, z) - 0.2, Math.floor(R() * 4) as Quarter, 0.5 + R() * 0.5); }
  const surfaces: WorldSurface[] = [{ id: 'pier-ramp', rect: [PIER.x0, PIER.x1, PIER.z0, PIER.ramp], y: [0.15, PIER.deck] }, { id: 'pier', rect: [PIER.x0, PIER.x1, PIER.ramp, PIER.z1], y: [PIER.deck, PIER.deck] }];
  const pierLights: WorldPiece[] = []; for (let z = PIER.ramp + 8; z < PIER.z1; z += 22) { pierLights.push({ k: 'kk.streetlight', x: PIER.x0 + 0.35, z, y: PIER.deck, r: armTo(1) }, { k: 'kk.streetlight', x: PIER.x1 - 0.35, z: z + 11, y: PIER.deck, r: armTo(3) }); }
  for (const p of pierLights) P.pieces.push(p); /* on the deck (the reserved pier strip keeps the beach clear of them) */
  P.pieces.push({ k: 'kk.bench', x: PIER.x0 + 1.2, z: PIER.z1 - 6, y: PIER.deck, r: 1 }, { k: 'kk.bench', x: PIER.x1 - 1.2, z: PIER.z1 - 6, y: PIER.deck, r: 3 });

  // ---- the hills: a lookout, pines, rocks ----
  P.putCentred('kk.watertower', lookout[0], lookout[1], groundY(lookout[0], lookout[1]) - 0.2, 0, 2.6);
  P.putCentred('kn.tent_detailedOpen', lookout[0] - 9, lookout[1] - 2, groundY(lookout[0] - 9, lookout[1] - 2), 1, 0.9);
  P.put({ k: 'kn.campfire_logs', x: lookout[0] - 6, z: lookout[1] + 5, y: groundY(lookout[0] - 6, lookout[1] + 5), r: 0, s: 1.4 });
  P.putCentred('kn.log_stack', lookout[0] - 2, lookout[1] + 9, groundY(lookout[0] - 2, lookout[1] + 9), 1, 0.6);
  P.reserve({ x0: lookout[0] - 16, x1: lookout[0] + 16, z0: lookout[1] - 12, z1: lookout[1] + 22, y0: 0, y1: 0 });
  const [fx0, fx1, fz0, fz1] = terrain.flat;
  for (let n = 0, tries = 0; n < 1700 && tries < 12000; tries++) { const x = -440 + R() * 880, z = -440 + R() * (fz1 + 440 - 20);
    if (x > fx0 - 6 && x < fx1 + 6 && z > fz0 - 6) continue; const y = groundY(x, z);
    if (P.putCentred(pick(R, PINES), r4(x), r4(z), r4(y - 0.1), Math.floor(R() * 4) as Quarter, 0.75 + R() * 0.6)) n++; }
  for (let n = 0; n < 120; n++) { const x = -440 + R() * 880, z = -440 + R() * 660; if (x > fx0 - 4 && x < fx1 + 4 && z > fz0 - 4) continue;
    P.putCentred(pick(R, ['kn.rock_largeA', 'kn.rock_largeB', 'kn.rock_tallA', 'kn.rock_tallB', 'kn.stone_tallA']), r4(x), r4(z), r4(groundY(x, z) - 0.3), Math.floor(R() * 4) as Quarter, 0.6 + R() * 0.9); }

  // ---- parked cars along quiet streets (not on the traffic loops) ----
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { if (!road(i, j) || loopTiles.has(i * 1000 + j)) continue; const ax = straightAxis(i, j); if (!ax) continue;
    const dist = districtOfTile(i, j); if (dist === 'avenue' || dist === 'hills') continue;
    for (const side of [-1, 1]) if (R() < 0.3) { const along = (R() - 0.5) * 3; const k = pick(R, PARKED);
      if (ax === 'z') P.putCentred(k, cx(i) + side * 3.3, cz(j) + along, 0, (side > 0 ? 2 : 0) as Quarter); else P.putCentred(k, cx(i) + along, cz(j) + side * 3.3, 0, (side > 0 ? 1 : 3) as Quarter); } }

  // ---- traffic ----
  const carLoops: CarLoop[] = LOOPS.map((L) => { const pts = lanePath(L.tiles.map(([i, j]) => [cx(i), cz(j)] as [number, number])); const len = pathLength(pts); const n = Math.max(2, Math.floor(len / 55));
    return { id: L.id, pts, cars: Array.from({ length: n }, (_, k) => ({ k: pick(R, CITY_CARS), phase: r4((k + R() * 0.4) / n), speed: L.speed })) }; });

  const col = (i0: number, i1: number, j0: number, j1: number): [number, number, number, number] => [X0 + i0 * T, X0 + (i1 + 1) * T, Z0 + j0 * T, Z0 + (j1 + 1) * T];
  const districts: WorldDistrict[] = [
    { id: 'downtown', name: 'Downtown', colour: '#5B7CE6', rects: [col(42, 75, 8, 32)], spawn: spawns.downtown },
    { id: 'midtown', name: 'Midtown', colour: '#E0904A', rects: [col(42, 75, 33, 62)], spawn: spawns.midtown },
    { id: 'avenue', name: 'Main avenue', colour: '#E8742A', rects: [col(39, 41, 8, 62)], spawn: spawns.avenue },
    { id: 'oldtown', name: 'Old town', colour: '#C9653C', rects: [col(4, 38, 8, 25)], spawn: spawns.oldtown },
    { id: 'park', name: 'Park & plaza', colour: '#5FA35A', rects: [col(22, 38, 26, 44)], spawn: spawns.park },
    { id: 'suburbs', name: 'Suburbs', colour: '#B9A27A', rects: [col(4, 21, 26, 62), col(22, 38, 45, 62)], spawn: spawns.suburbs },
    { id: 'beach', name: 'Beach & pier', colour: '#E6C98A', rects: [col(0, 79, 63, 79)], spawn: spawns.beach },
    { id: 'hills', name: 'Hills & lookout', colour: '#4F7A4A', rects: [col(0, 79, 0, 7), col(0, 3, 8, 62), col(76, 79, 8, 62)], spawn: spawns.hills },
  ];
  const landmarks: WorldLandmark[] = [{ id: 'plaza', name: 'Plaza', pos: [pc[0], pc[1] - 6] }, { id: 'pier', name: 'Pier', pos: [(PIER.x0 + PIER.x1) / 2, PIER.z1 - 20] },
    { id: 'lookout', name: 'Lookout', pos: lookout }, { id: 'pond', name: 'Pond', pos: [POND[0], POND[1]] }];
  return { version: 1, name: 'Open city', seed, tile: T, grid: { n: N, x0: X0, z0: Z0 }, half: 400, terrain, pieces: P.pieces, surfaces, districts, landmarks, carLoops, ponds: [POND] };
}

/** a loop through tile centres → the lane (LANE m to the right of the centre line) with rounded corners, as a closed polyline */
export function lanePath(corners: [number, number][]): [number, number][] {
  const n = corners.length; const out: [number, number][] = [];
  const dir = (a: [number, number], b: [number, number]): [number, number] => { const dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
  const right = (d: [number, number]): [number, number] => [-d[1], d[0]];
  for (let k = 0; k < n; k++) { const p = corners[k], prev = corners[(k + n - 1) % n], next = corners[(k + 1) % n]; const din = dir(prev, p), dout = dir(p, next); const rin = right(din), rout = right(dout);
    const c: [number, number] = [p[0] + (rin[0] + rout[0]) * LANE, p[1] + (rin[1] + rout[1]) * LANE];
    const a: [number, number] = [c[0] - din[0] * CORNER_R, c[1] - din[1] * CORNER_R], b: [number, number] = [c[0] + dout[0] * CORNER_R, c[1] + dout[1] * CORNER_R];
    for (let s = 0; s <= 6; s++) { const t = s / 6; const u = 1 - t; out.push([r4(u * u * a[0] + 2 * u * t * c[0] + t * t * b[0]), r4(u * u * a[1] + 2 * u * t * c[1] + t * t * b[1])]); } }
  return out;
}
export function pathLength(pts: [number, number][]): number { let L = 0; for (let k = 0; k < pts.length; k++) { const a = pts[k], b = pts[(k + 1) % pts.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); } return L; }

// ---- city life (2026-10-27): where people walk ----
/** how far from a street's centre line people walk: the street tiles end in a kerb at 4.5–5 m (the parking lane is inside it), so people
 *  walk the block's own pavement just past it; the two directions keep to their own line */
export const PAVE = { in: 5.9, out: 5.35 } as const;
export interface WalkLoop { id: string; /** the loop's corners (closed rectangle, metres) */ rect: [number, number, number, number]; /** offset from the rect for each direction */ kind: 'kerb' | 'path' }
/** The pavement loops round every city block (the same for every seed: the street plan never changes), the park's edge and its two paths. */
export function walkLoops(): WalkLoop[] {
  const out: WalkLoop[] = [];
  for (let a = 0; a < CITY_COLS.length - 1; a++) for (let b = 0; b < CITY_ROWS.length - 1; b++) {
    const ca = CITY_COLS[a], cb = CITY_COLS[a + 1], ra = CITY_ROWS[b], rb = CITY_ROWS[b + 1]; if (cb - ca < 3) continue; /* the avenue's median */
    const mi = Math.round((ca + cb) / 2), mj = Math.round((ra + rb) / 2);
    if (!isRoadTile(ca, mj) || !isRoadTile(cb, mj) || !isRoadTile(mi, ra) || !isRoadTile(mi, rb)) continue; /* inside the park: no streets */
    out.push({ id: `block-${ca}-${ra}`, rect: [cx(ca), cx(cb), cz(ra), cz(rb)], kind: 'kerb' }); }
  out.push({ id: 'park-edge', rect: [cx(22), cx(39), cz(26), cz(44)], kind: 'kerb' });
  out.push({ id: 'park-path-ns', rect: [cx(30) - 1.1, cx(30) + 1.1, cz(PARK_IN.j0) - 4, cz(PARK_IN.j1) + 4], kind: 'path' });
  out.push({ id: 'park-path-ew', rect: [cx(PARK_IN.i0) - 4, cx(PARK_IN.i1) + 4, cz(35) - 1.1, cz(35) + 1.1], kind: 'path' });
  return out;
}
