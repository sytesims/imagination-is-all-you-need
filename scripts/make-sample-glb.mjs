#!/usr/bin/env node
/**
 * Our own sample 3D result for the mock backend (server/samples/result-3d.glb, AGPL-3.0-or-later like the repo): a small orange bean on a round base, made
 * here from numbers (no model, no download). glTF 2.0 binary: positions, normals, vertex colours (COLOR_0) and indices, one PBR material.
 * Run: node scripts/make-sample-glb.mjs [out]
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = process.argv[2] ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../server/samples/result-3d.glb');
const P = [], N = [], C = [], I = [];
const ORANGE = [1.0, 0.42, 0.09], DEEP = [0.82, 0.26, 0.04], DARK = [0.12, 0.1, 0.12], CREAM = [1.0, 0.93, 0.82], BASE = [0.2, 0.2, 0.24];
/** A surface of revolution: radius r(t) and height y(t) for t in [0,1], with a colour per vertex. */
function lathe(seg, rings, f, col) {
  const start = P.length / 3;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings; const [r, y, dr, dy] = f(t);
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2; const x = Math.cos(a), z = Math.sin(a);
      P.push(r * x, y, r * z);
      const nx = dy * x, ny = -dr, nz = dy * z; const l = Math.hypot(nx, ny, nz) || 1; N.push(nx / l, ny / l, nz / l);
      C.push(...col(t, a, r * x, y, r * z), 1);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = start + i * (seg + 1) + j, b = a + seg + 1;
    I.push(a, a + 1, b, b, a + 1, b + 1);
  }
}
// the bean: a capsule that leans in a little at the top
lathe(64, 48, (t) => { const th = t * Math.PI; const r = Math.sin(th) * (0.55 - 0.08 * t); const y = 0.25 + (1 - Math.cos(th)) * 0.62;
  const dr = Math.cos(th) * Math.PI * (0.55 - 0.08 * t) - 0.08 * Math.sin(th), dy = Math.sin(th) * Math.PI * 0.62; return [r, y, dr, dy]; },
(t, a, x, y, z) => {
  const eye = (cx) => Math.hypot(x - cx, y - 1.12) < 0.07 && z > 0.3; const cheek = Math.hypot(x, y - 0.95) < 0.2 && z > 0.35;
  if (eye(-0.16) || eye(0.16)) return DARK; if (cheek) return CREAM; return t < 0.12 ? DEEP : ORANGE; });
// the base: a short, wide disc
lathe(64, 8, (t) => { const r = t < 0.5 ? 0.9 : 0.9 - (t - 0.5) * 1.8; const y = t < 0.5 ? t * 0.5 : 0.25; return [Math.max(0.001, r), y, t < 0.5 ? 0 : -1.8, t < 0.5 ? 0.5 : 0]; }, () => BASE);

const f32 = (a) => Buffer.from(new Float32Array(a).buffer); const u32 = Buffer.from(new Uint32Array(I).buffer);
const pos = f32(P), nor = f32(N), col = f32(C);
const min = [0, 1, 2].map((k) => Math.min(...P.filter((_, i) => i % 3 === k))), max = [0, 1, 2].map((k) => Math.max(...P.filter((_, i) => i % 3 === k)));
const views = [pos, nor, col, u32]; let off = 0; const bufferViews = views.map((b, i) => { const v = { buffer: 0, byteOffset: off, byteLength: b.length, target: i === 3 ? 34963 : 34962 }; off += b.length; return v; });
const n = P.length / 3;
const gltf = { asset: { version: '2.0', generator: 'Imagination Is All You Need sample (scripts/make-sample-glb.mjs)' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'Bean' }],
  meshes: [{ name: 'Bean', primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, indices: 3, material: 0 }] }],
  materials: [{ name: 'Glaze', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.45 } }],
  accessors: [{ bufferView: 0, componentType: 5126, count: n, type: 'VEC3', min, max }, { bufferView: 1, componentType: 5126, count: n, type: 'VEC3' }, { bufferView: 2, componentType: 5126, count: n, type: 'VEC4' }, { bufferView: 3, componentType: 5125, count: I.length, type: 'SCALAR' }],
  bufferViews, buffers: [{ byteLength: off }] };
const pad = (b, c) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, c)]);
const json = pad(Buffer.from(JSON.stringify(gltf)), 0x20); const bin = pad(Buffer.concat(views), 0);
const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const ch = (b, t) => { const h = Buffer.alloc(8); h.writeUInt32LE(b.length, 0); h.writeUInt32LE(t, 4); return Buffer.concat([h, b]); };
writeFileSync(out, Buffer.concat([head, ch(json, 0x4e4f534a), ch(bin, 0x004e4942)]));
console.log(`wrote ${out}: ${n} vertices, ${I.length / 3} triangles`);
