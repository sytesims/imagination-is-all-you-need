/**
 * Scene kits (2026-10-26): the build-time asset pipeline for Direct a Shot's presets and its "Add props" drawer. Reads the CC0 kits (KayKit
 * Furniture / Restaurant / Forest Nature, Kenney Holiday Kit) and the Khronos WaterBottle sample (CC0), keeps only the pieces we use, scales
 * each to metres, and writes:
 *   - web/public/models/kits/props.glb: one top-level node per piece (named by its id), deduped, welded, textures at most 1024 px as WebP,
 *     quantized and meshopt-compressed. Small cabins for the diorama are assembled here from the Holiday kit's walls, corners and roofs.
 *   - web/public/models/kits/bottle.glb: the WaterBottle with its label made blank (no logo, no words) and 1024 px textures.
 *   - server/src/shared/world/propCatalog.ts: each piece's label, group, footprint and height (generated; the drawer and the presets read it).
 * The engine (web/src/shared/previz/kits.ts) loads them on first use and pulls their colours into the brand theme (previz/theme.ts).
 * Not part of the app build. Run it with the gltf-transform packages from npm, outside the repo (as for build-open-city.mjs):
 *   npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer sharp
 *   node build-scene-kits.mjs <assets dir> <repo dir>
 * <assets dir> holds the unpacked kits (kaykit-furniture, kaykit-restaurant, kaykit-forest, kenney-holiday-kit, water-bottle) in the folder
 * layout of each kit's own download. Sources and licences: docs/ATTRIBUTION.md.
 */
import fs from 'node:fs'; import path from 'node:path';
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, getBounds, dedup, prune, weld, quantize, meshopt, textureCompress, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const [ASSETS, REPO] = process.argv.slice(2);
if (!ASSETS || !REPO) { console.error('usage: node build-scene-kits.mjs <assets dir> <repo dir>'); process.exit(2); }
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const FU = path.join(ASSETS, 'kaykit-furniture/src/KayKit_Furniture_Bits_1.0_FREE/Assets/gltf');
const RE = path.join(ASSETS, 'kaykit-restaurant/src/KayKit_Restaurant_Bits_1.0_FREE/Assets/gltf');
const FO = path.join(ASSETS, 'kaykit-forest/src/KayKit_Forest_Nature_Pack_1.0_FREE/Assets/gltf');
const HO = path.join(ASSETS, 'kenney-holiday-kit/src/Models/GLB format');
const WB = path.join(ASSETS, 'water-bottle/WaterBottle.glb');

/* group: the drawer's tab. label: what the drawer calls it. scale: kit units → metres (KayKit Furniture ×0.7: the couch 2.1 m; Restaurant
   ×0.85: a counter 0.85 m; Forest trees ×1.6, bushes ×2.4; Holiday ×1.6: a cabin wall 1.6 m, the toy train about 1 m). */
const P = [];
const add = (prefix, dir, ext, scale, group, items) => { for (const [n, label, s] of items) P.push({ id: `${prefix}.${n}`, file: path.join(dir, `${n}.${ext}`), scale: s ?? scale, group, label }); };
add('fu', FU, 'gltf', 0.7, 'home', [['couch', 'Sofa'], ['couch_pillows', 'Sofa with cushions'], ['armchair', 'Armchair'], ['armchair_pillows', 'Armchair with cushions'], ['table_low', 'Coffee table'],
  ['table_medium', 'Table'], ['table_medium_long', 'Long table'], ['table_small', 'Side table'], ['chair_A', 'Chair'], ['chair_A_wood', 'Wooden chair'], ['chair_B', 'Dining chair'], ['chair_stool', 'Stool'],
  ['lamp_standing', 'Floor lamp'], ['lamp_table', 'Table lamp'], ['shelf_A_big', 'Bookcase'], ['shelf_B_large_decorated', 'Shelf with things'], ['shelf_B_small_decorated', 'Small shelf'],
  ['cabinet_medium_decorated', 'Sideboard'], ['cabinet_small_decorated', 'Small cabinet'], ['bed_double_A', 'Double bed'], ['bed_single_A', 'Single bed'], ['rug_rectangle_A', 'Rug'],
  ['rug_oval_A', 'Round rug'], ['rug_rectangle_stripes_A', 'Striped rug'], ['pictureframe_large_A', 'Picture'], ['pictureframe_standing_A', 'Photo frame'], ['cactus_medium_A', 'Plant'],
  ['cactus_small_A', 'Small plant'], ['book_set', 'Books'], ['pillow_A', 'Cushion']]);
add('re', RE, 'gltf', 0.85, 'kitchen', [['kitchencounter_straight_A', 'Counter'], ['kitchencounter_straight_A_decorated', 'Counter with things'], ['kitchencounter_sink_backsplash', 'Sink'],
  ['kitchencabinet', 'Wall cabinet'], ['fridge_A', 'Fridge'], ['oven', 'Oven'], ['stove_multi_countertop', 'Hob'], ['extractorhood', 'Cooker hood'], ['kitchentable_A', 'Kitchen table'],
  ['table_round_A_decorated', 'Café table'], ['table_round_A', 'Round table'], ['chair_A', 'Café chair'], ['crate_carrots', 'Crate of vegetables'], ['pot_A', 'Pot'], ['plate', 'Plate']]);
add('fo', FO, 'gltf', 1.6, 'nature', [['Tree_1_A_Color1', 'Round tree'], ['Tree_2_A_Color1', 'Leafy tree'], ['Tree_3_A_Color1', 'Wide tree'], ['Tree_4_A_Color1', 'Tall tree'],
  ['Tree_Bare_1_A_Color1', 'Bare tree'], ['Bush_1_A_Color1', 'Bush', 3.2], ['Bush_2_A_Color1', 'Big bush', 2.4], ['Rock_1_A_Color1', 'Rock', 1.8], ['Rock_2_A_Color1', 'Boulder', 1.8], ['Grass_1_A_Color1', 'Grass', 2]]);
add('ho', HO, 'glb', 1.6, 'holiday', [['tree-snow-a', 'Snowy pine'], ['tree-snow-b', 'Snowy pine, tall'], ['tree-snow-c', 'Snowy pine, small'], ['tree', 'Pine'], ['tree-decorated', 'Decorated tree'],
  ['snowman', 'Snowman'], ['snowman-hat', 'Snowman with hat'], ['lantern', 'Lantern'], ['bench', 'Bench'], ['sled', 'Sled'], ['reindeer', 'Reindeer'], ['present-a-cube', 'Present'], ['present-b-round', 'Round present'],
  ['rocks-large', 'Snowy rocks'], ['rocks-medium', 'Snowy stones'], ['snow-pile', 'Snow pile'], ['snow-flat-large', 'Snow patch'], ['train-locomotive', 'Toy train engine'], ['train-tender', 'Toy train tender'],
  ['train-wagon', 'Toy train wagon'], ['train-wagon-logs', 'Toy log wagon']]);
/* small cabins assembled from the Holiday kit: four walls on a 1-unit cell (front: door or window), four corner posts and a snowy gable roof */
const CABINS = [
  ['cabin-a', 'Snowy cabin', 'cabin-doorway', ['cabin-window-a', 'cabin-wall', 'cabin-window-a'], 'cabin-roof-snow-point'],
  ['cabin-b', 'Cabin with chimney', 'cabin-doorway', ['cabin-wall', 'cabin-window-b', 'cabin-wall'], 'cabin-roof-snow-point'],
  ['cabin-c', 'Cabin with big window', 'cabin-window-large', ['cabin-doorway', 'cabin-wall', 'cabin-window-c'], 'cabin-roof-snow-point'],
];
for (const [id, label, front, others, roof] of CABINS) P.push({ id: `ho.${id}`, scale: 1.6, group: 'holiday', label, cabin: { front, others, roof, chimney: id === 'cabin-b' } });

const out = new Document(); out.createBuffer(); const scene = out.createScene('kits'); const catalog = {};
const r2 = (x) => Math.round(x * 100) / 100;
const readScene = async (file) => { const src = await io.read(file); const s = src.getRoot().getDefaultScene() ?? src.getRoot().listScenes()[0]; return { src, s }; };
/** merge a file's scene into `out` under a new node (position, rotation about y); returns the node */
async function graft(file, pos = [0, 0, 0], rotY = 0) {
  const { src, s } = await readScene(file); const map = mergeDocuments(out, src); const merged = map.get(s);
  const n = out.createNode(path.basename(file)).setTranslation(pos).setRotation([0, Math.sin(rotY / 2), 0, Math.cos(rotY / 2)]);
  for (const ch of merged.listChildren()) { merged.removeChild(ch); n.addChild(ch); } merged.dispose(); return n;
}
for (const p of P) {
  const wrap = out.createNode(p.id).setScale([p.scale, p.scale, p.scale]);
  if (p.cabin) { const c = p.cabin; const f = (n) => path.join(HO, `${n}.glb`);
    /* the walls stand on the cell's edge at +z; turn them to the four sides (front faces +z) */
    wrap.addChild(await graft(f(c.front), [0, 0, 0], 0));
    for (let i = 0; i < 3; i++) wrap.addChild(await graft(f(c.others[i]), [0, 0, 0], (Math.PI / 2) * (i + 1)));
    for (let i = 0; i < 4; i++) wrap.addChild(await graft(f('cabin-corner'), [0, 0, 0], (Math.PI / 2) * i));
    wrap.addChild(await graft(f(c.chimney ? 'cabin-roof-snow-chimney' : c.roof), [0, 1, 0], Math.PI / 2));
  } else {
    if (!fs.existsSync(p.file)) { console.error('missing', p.file); process.exit(1); }
    wrap.addChild(await graft(p.file));
  }
  scene.addChild(wrap);
}
for (const s of out.getRoot().listScenes()) if (s !== scene) s.dispose();
out.getRoot().setDefaultScene(scene);
for (const p of P) { const node = scene.listChildren().find((n) => n.getName() === p.id); const tmp = out.createScene('tmp'); scene.removeChild(node); tmp.addChild(node);
  const b = getBounds(tmp); tmp.removeChild(node); tmp.dispose(); scene.addChild(node);
  catalog[p.id] = { label: p.label, group: p.group, cx: r2((b.min[0] + b.max[0]) / 2), cz: r2((b.min[2] + b.max[2]) / 2), w: r2(b.max[0] - b.min[0]), d: r2(b.max[2] - b.min[2]), y0: r2(b.min[1]), h: r2(b.max[1]) }; }
await out.transform(unpartition(), dedup(), prune({ keepLeaves: true }), weld(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }), dedup(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
const dir = path.join(REPO, 'web/public/models/kits'); fs.mkdirSync(dir, { recursive: true });
await io.write(path.join(dir, 'props.glb'), out);

// the bottle: blank label (the logo and its words painted over with the label's own colour), no glow map, 1024 px textures
{ const doc = await io.read(WB); const m = doc.getRoot().listMaterials()[0];
  const base = m.getBaseColorTexture(); const img = sharp(Buffer.from(base.getImage())); const { width: W } = await img.metadata(); const k = W / 512;
  /* the label is a flat pale yellow; two logos sit on it (measured on a 512 px copy) */
  const lab = await sharp(Buffer.from(base.getImage())).extract({ left: Math.round(140 * k), top: Math.round(150 * k), width: Math.round(40 * k), height: Math.round(20 * k) }).png().toBuffer().then((b) => sharp(b).stats());
  const band = await sharp(Buffer.from(base.getImage())).extract({ left: Math.round(250 * k), top: Math.round(12 * k), width: Math.round(60 * k), height: Math.round(20 * k) }).png().toBuffer().then((b) => sharp(b).stats());
  const c = lab.channels.map((x) => Math.round(x.mean)); const cb = band.channels.map((x) => Math.round(x.mean));
  const patch = (w, h, col = c) => ({ create: { width: Math.round(w * k), height: Math.round(h * k), channels: 3, background: { r: col[0], g: col[1], b: col[2] } } });
  const painted = await img.composite([{ input: await sharp(patch(70, 66)).png().toBuffer(), left: Math.round(42 * k), top: Math.round(178 * k) }, { input: await sharp(patch(84, 62)).png().toBuffer(), left: Math.round(206 * k), top: Math.round(180 * k) },
    { input: await sharp(patch(372, 32, cb)).png().toBuffer(), left: 0, top: Math.round(40 * k) }, { input: await sharp(patch(372, 12)).png().toBuffer(), left: 0, top: Math.round(74 * k) }]).png().toBuffer();
  base.setImage(painted); m.setEmissiveTexture(null); m.setEmissiveFactor([0, 0, 0]);
  await doc.transform(prune(), dedup(), weld(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  const b = getBounds(doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]); catalog['wb.bottle'] = { label: 'Bottle', group: 'product', cx: 0, cz: 0, w: r2(b.max[0] - b.min[0]), d: r2(b.max[2] - b.min[2]), y0: r2(b.min[1]), h: r2(b.max[1]) };
  await io.write(path.join(dir, 'bottle.glb'), doc); }

const ts = `/**\n * Scene kits: the pieces in web/public/models/kits (GENERATED by scripts/assets/build-scene-kits.mjs; do not edit by hand).\n * Metres, before rotation: cx/cz = the footprint's centre from the piece's origin, w/d = its size along x/z, y0/h = its lowest and highest point.\n */\nexport type PropGroup = 'home' | 'kitchen' | 'nature' | 'holiday' | 'product';\nexport interface PropPiece { label: string; group: PropGroup; cx: number; cz: number; w: number; d: number; y0: number; h: number }\nexport const PROP_PIECES: Record<string, PropPiece> = ${JSON.stringify(catalog, null, 0).replace(/\},"/g, '},\n  "').replace(/^\{/, '{\n  ').replace(/\}$/, ',\n}')};\n`;
fs.writeFileSync(path.join(REPO, 'server/src/shared/world/propCatalog.ts'), ts);
for (const f of ['props.glb', 'bottle.glb']) console.log(f, (fs.statSync(path.join(dir, f)).size / 1e6).toFixed(2), 'MB'); console.log('pieces', P.length);
