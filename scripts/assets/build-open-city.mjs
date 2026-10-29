/**
 * Open city (2026-10-26): the build-time asset pipeline for Direct a Shot's open-world map. Reads the CC0 kits (KayKit City Builder Bits,
 * Kenney City Kit Commercial + Suburban, Kenney Car Kit, Kenney Nature Kit), keeps only the pieces the city generator uses, scales each to
 * metres (one scale per kit, measured against a 4.4 m car and a 1.75 m person), and writes:
 *   - web/public/models/open-city/open-city.glb: one file, one top-level node per piece (named by its id), deduped (identical materials and
 *     textures shared across kits), textures resized to at most 1024 px and stored as WebP, welded, quantized and meshopt-compressed.
 *     The engine (web/src/shared/previz/world/assemble.ts) instances or merges the pieces per map cell at load time.
 *   - server/src/shared/world/kitCatalog.ts: each piece's footprint, height and collider (generated; the generator and the physics read it).
 * Not part of the app build. Run it with the gltf-transform packages from npm, outside the repo (as for optimize-mannequin.mjs):
 *   npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer sharp
 *   node build-open-city.mjs <assets dir> <repo dir>
 * <assets dir> holds the unpacked kits: kaykit-city-builder, kenney-city-kit-commercial, kenney-city-kit-suburban, kenney-car-kit,
 * kenney-nature-kit (the folder layout of each kit's own download). Sources and licences: ASSETS-CREDITS.md.
 */
import fs from 'node:fs'; import path from 'node:path';
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, getBounds, dedup, prune, weld, quantize, meshopt, textureCompress, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const [ASSETS, REPO] = process.argv.slice(2);
if (!ASSETS || !REPO) { console.error('usage: node build-open-city.mjs <assets dir> <repo dir>'); process.exit(2); }
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const KK = path.join(ASSETS, 'kaykit-city-builder/src/KayKit_City_Builder_Bits_1.0_FREE/Assets/gltf');
const KC = path.join(ASSETS, 'kenney-city-kit-commercial/src/Models/GLB format');
const KS = path.join(ASSETS, 'kenney-city-kit-suburban/src/Models/GLB format');
const KV = path.join(ASSETS, 'kenney-car-kit/src/Models/GLB format');
const KN = path.join(ASSETS, 'kenney-nature-kit/src/Models/GLTF format');

/* kind: tile (a 10 m ground square on the grid) · building · prop (street furniture) · tree · car · deco (no collider: flowers, grass,
   awnings). col: a collider [w, d] (metres, centred) instead of the whole footprint (tree trunks, lamp posts). body: a file whose bounds
   are the collider (KayKit buildings: the block without its pavement base). */
const P = [];
const add = (kit, dir, ext, scale, kind, names, extra = {}) => { for (const n of names) P.push({ id: `${kit}.${n}`, file: path.join(dir, `${n}.${ext}`), scale, kind, ...extra, ...(extra.per?.[n] ?? {}) }); };
// KayKit City Builder Bits: ×5 (its car is 0.94 units → 4.7 m; a road tile 2 units → 10 m)
add('kk', KK, 'gltf', 5, 'tile', ['road_straight', 'road_straight_crossing', 'road_junction', 'road_tsplit', 'road_corner', 'road_corner_curved', 'base']);
add('kk', KK, 'gltf', 5, 'building', ['building_A', 'building_B', 'building_C', 'building_D', 'building_E', 'building_F', 'building_G', 'building_H'], { bodyOf: (n) => path.join(KK, `${n}_withoutBase.gltf`) });
add('kk', KK, 'gltf', 5, 'prop', ['bench', 'dumpster', 'firehydrant', 'trafficlight_A', 'trafficlight_B', 'trafficlight_C', 'watertower', 'box_A'], { per: { trafficlight_C: { col: [0.5, 0.5] } } });
add('kk', KK, 'gltf', 5, 'prop', ['streetlight'], { col: [0.4, 0.4] });
add('kk', KK, 'gltf', 5, 'deco', ['bush', 'trash_A']);
add('kk', KK, 'gltf', 5, 'car', ['car_hatchback', 'car_police', 'car_sedan', 'car_stationwagon', 'car_taxi']);
// Kenney City Kit Commercial: ×11 (the tallest tower 5.47 units → 60 m; a shop front's door about 2.4 m)
add('kc', KC, 'glb', 11, 'building', ['building-a', 'building-b', 'building-c', 'building-d', 'building-f', 'building-g', 'building-h', 'building-i', 'building-l', 'building-m',
  'building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c', 'building-skyscraper-d', 'building-skyscraper-e']);
add('kc', KC, 'glb', 5, 'prop', ['detail-parasol-a', 'detail-parasol-b'], { col: [0.3, 0.3] });
// Kenney City Kit Suburban: ×8 (a house about 10 m wide)
add('ks', KS, 'glb', 8, 'building', ['building-type-a', 'building-type-b', 'building-type-c', 'building-type-d', 'building-type-e', 'building-type-f', 'building-type-g', 'building-type-h',
  'building-type-i', 'building-type-j', 'building-type-k', 'building-type-l', 'building-type-m', 'building-type-n', 'building-type-o', 'building-type-p', 'building-type-r', 'building-type-s', 'building-type-t', 'building-type-u']);
add('ks', KS, 'glb', 8, 'prop', ['fence-1x4', 'fence-1x3', 'planter']);
add('ks', KS, 'glb', 8, 'deco', ['driveway-long', 'path-long']);
add('ks', KS, 'glb', 8, 'tree', ['tree-large', 'tree-small'], { col: [0.7, 0.7] });
// Kenney Car Kit: ×1.7 (the sedan 2.55 units → 4.3 m)
add('kv', KV, 'glb', 1.7, 'car', ['sedan', 'suv', 'van', 'taxi', 'police', 'truck', 'delivery', 'hatchback-sports', 'ambulance']);
// Kenney Nature Kit: ×7 for trees and rocks (a tall palm about 9.5 m), ×3 for small plants
add('kn', KN, 'glb', 7, 'tree', ['tree_palmTall', 'tree_palmBend', 'tree_palmDetailedTall', 'tree_palmShort', 'tree_oak', 'tree_default', 'tree_detailed', 'tree_fat', 'tree_cone',
  'tree_pineTallA', 'tree_pineTallB', 'tree_pineRoundA', 'tree_pineRoundC', 'tree_pineDefaultA', 'tree_pineSmallA', 'tree_oak_fall', 'tree_default_dark'], { col: [0.8, 0.8] });
add('kn', KN, 'glb', 7, 'prop', ['rock_largeA', 'rock_largeB', 'rock_largeC', 'rock_tallA', 'rock_tallB', 'stone_largeA', 'stone_tallA', 'statue_obelisk', 'statue_column', 'tent_detailedOpen', 'log_stack', 'fence_simple']);
add('kn', KN, 'glb', 3, 'prop', ['pot_large', 'canoe']);
add('kn', KN, 'glb', 3, 'deco', ['plant_bushLarge', 'plant_bush', 'plant_bushDetailed', 'flower_redA', 'flower_yellowA', 'flower_purpleA', 'grass_large', 'grass_leafsLarge', 'campfire_logs', 'mushroom_redGroup']);

const out = new Document(); out.createBuffer(); const scene = out.createScene('open-city'); const catalog = {};
const r2 = (x) => Math.round(x * 100) / 100;
for (const p of P) {
  if (!fs.existsSync(p.file)) { console.error('missing', p.file); process.exit(1); }
  const src = await io.read(p.file); const srcScene = src.getRoot().getDefaultScene() ?? src.getRoot().listScenes()[0];
  const b = getBounds(srcScene); let col = null;
  if (p.bodyOf) { const body = await io.read(p.bodyOf(p.id.split('.')[1])); const bb = getBounds(body.getRoot().getDefaultScene() ?? body.getRoot().listScenes()[0]);
    col = [r2((bb.min[0] + bb.max[0]) / 2 * p.scale), r2((bb.min[2] + bb.max[2]) / 2 * p.scale), r2((bb.max[0] - bb.min[0]) * p.scale), r2((bb.max[2] - bb.min[2]) * p.scale)]; }
  else if (p.col) col = [0, 0, p.col[0], p.col[1]]; /* a pole or trunk stands at the piece's origin */
  const map = mergeDocuments(out, src); const merged = map.get(srcScene);
  const wrap = out.createNode(p.id).setScale([p.scale, p.scale, p.scale]);
  for (const ch of merged.listChildren()) { merged.removeChild(ch); wrap.addChild(ch); } merged.dispose(); scene.addChild(wrap);
  catalog[p.id] = { kind: p.kind, cx: r2((b.min[0] + b.max[0]) / 2 * p.scale), cz: r2((b.min[2] + b.max[2]) / 2 * p.scale), w: r2((b.max[0] - b.min[0]) * p.scale), d: r2((b.max[2] - b.min[2]) * p.scale),
    y0: r2(b.min[1] * p.scale), h: r2(b.max[1] * p.scale), ...(col ? { col } : {}) };
}
for (const s of out.getRoot().listScenes()) if (s !== scene) s.dispose();
out.getRoot().setDefaultScene(scene);
await out.transform(unpartition(), dedup(), prune({ keepLeaves: true }), weld(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }), dedup(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
const dir = path.join(REPO, 'web/public/models/open-city'); fs.mkdirSync(dir, { recursive: true });
await io.write(path.join(dir, 'open-city.glb'), out);
const ts = `/**\n * Open city: the kit pieces the generator places (GENERATED by scripts/assets/build-open-city.mjs; do not edit by hand).\n * Metres, before rotation: cx/cz = the footprint's centre from the piece's origin, w/d = its size along x/z, y0/h = its lowest and highest\n * point; col = [cx, cz, w, d], the collider when it is smaller than the footprint (a building without its pavement, a tree trunk).\n */\nexport type KitKind = 'tile' | 'building' | 'prop' | 'tree' | 'car' | 'deco';\nexport interface KitPiece { kind: KitKind; cx: number; cz: number; w: number; d: number; y0: number; h: number; col?: [number, number, number, number] }\nexport const KIT: Record<string, KitPiece> = ${JSON.stringify(catalog, null, 0).replace(/\},"/g, '},\n  "').replace(/^\{/, '{\n  ').replace(/\}$/, ',\n}')};\n`;
fs.mkdirSync(path.join(REPO, 'server/src/shared/world'), { recursive: true }); fs.writeFileSync(path.join(REPO, 'server/src/shared/world/kitCatalog.ts'), ts);
console.log(`pieces ${P.length}, glb ${(fs.statSync(path.join(dir, 'open-city.glb')).size / 1e6).toFixed(2)} MB`);
