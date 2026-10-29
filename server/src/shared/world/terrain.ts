/**
 * Open city terrain (2026-10-26): the ground height under any point, as one pure function, so the engine's terrain mesh, the person's feet,
 * the camera's ground clamp and the tests all agree. A flat city floor, hills that rise (with seeded value noise) towards the north, west
 * and east edges, and a beach that slopes south into the sea. Deterministic: the same spec gives the same heights.
 */
import type { TerrainSpec } from './worldSpec.js';

const hash = (i: number, j: number, s: number) => { let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(s, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const fade = (t: number) => t * t * (3 - 2 * t);
/** smooth value noise in 0…1 */
export function noise2(x: number, z: number, seed: number): number {
  const i = Math.floor(x), j = Math.floor(z); const fx = fade(x - i), fz = fade(z - j);
  const a = hash(i, j, seed), b = hash(i + 1, j, seed), c = hash(i, j + 1, seed), d = hash(i + 1, j + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
export const smoothstep = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
/** the city floor's height (the terrain sits just under the street tiles, whose road surface is at 0) */
export const CITY_FLOOR = -0.05;

/** The terrain height at (x, z), metres. */
export function terrainHeight(t: TerrainSpec, x: number, z: number): number {
  const [x0, x1, z0, z1] = t.flat;
  const dx = Math.max(x0 - x, 0, x - x1), dn = Math.max(z0 - z, 0); const d = Math.hypot(dx, dn);
  let y = CITY_FLOOR;
  if (d > 0) { const n = noise2(x / 95, z / 95, t.seed), m = noise2(x / 31, z / 31, t.seed + 7);
    y += t.hill * smoothstep(0, 110, d) * (0.45 + 0.75 * n) + 5 * (m - 0.5) * smoothstep(0, 30, d); }
  if (z > z1) { /* the beach: from the coast road down to the shore, then under the sea */
    const k = (z - z1) / Math.max(1, t.shoreZ - z1); const beach = k <= 1 ? CITY_FLOOR - (CITY_FLOOR - (t.water - 0.15)) * k : t.water - 0.15 - (z - t.shoreZ) * 0.06;
    y += beach - CITY_FLOOR; }
  return y;
}
