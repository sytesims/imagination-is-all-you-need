// Layers (2026-11-07, plugin layers: server/src/layers). What a split promises, without a model:
//  1. names: chips are tidied (no commas / colons for SAM), deduped, a JSON list or words; the mode follows Clean background.
//  2. graph: the SAM part of Swap Two People (frame-0 SAM3_Detect per name → batched → one seeded SAM3_VideoTrack, no text detection), unused chains and
//     switched-off parts removed, every class known to Comfy Cloud's node list; the output order.
//  3. mask combine: the edge band filter (SAM core ∪ (BiRefNet ∩ grown SAM)), overlaps cut by the nearer layers; a real ffmpeg run on tiny frames.
//  4. depth: percentiles, the clip-wide stretch, per-object median depth and the order (far → near; no depth: first chip on top).
//  5. layers.json: order, colours, the background note, export file names.
//  6. export: the ProRes 4444 command; the streaming ZIP opens (central directory, names, sizes).
//  7. registration: the tool, its two places (your computer, Comfy Cloud twin), the Cloud workflow route, the unmeasured price row, the bill seconds.
//  8. the plan: analysis pass + the Vanish pass, custom finish, image batches kept.
//  9. the unmeasured-price gate: with OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD=0 a Comfy Cloud run is refused before anything is sent.
// Run: npx tsx test/layers.test.ts
import assert from 'node:assert/strict'; import { execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'layers-')); const DATA = fs.mkdtempSync(path.join(D, 'data-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_BACKEND: 'mock', COMFY_API_KEY: '', OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD: '0' });
const ok = (m: string) => console.log('ok ' + m);

const K = await import('../src/layers/constants.ts');
const G = await import('../src/layers/graph.ts');
const M = await import('../src/layers/masks.ts');
const Dp = await import('../src/layers/depth.ts');
const Mf = await import('../src/layers/manifest.ts');
const X = await import('../src/layers/exportZip.ts');
const Z = await import('../src/layers/zipStream.ts');

// ---------------- 1. names ----------------
{
  assert.deepEqual(K.objectNames('["woman", "Woman", " neon,  sign ", ""]'), ['woman', 'neon sign']);
  assert.deepEqual(K.objectNames('steam, dog\ncar'), ['steam', 'dog', 'car']);
  assert.equal(K.cleanObjectName('person:2'), 'person 2', 'no ":N" counts reach SAM');
  assert.equal(K.cleanObjectName('x'.repeat(80)).length, K.LAYERS_MAX_NAME);
  assert.equal(K.layersMode({ background: '0' }), 'split'); assert.equal(K.layersMode({ background: true }), 'with-plate');
  assert.equal(K.layersMode({ types: 'split', background: '1' }), 'split', 'a quote sends the mode as types');
  assert.equal(K.layersMode({ types: '["with-plate"]' }), 'with-plate'); assert.equal(K.layersMode({}), 'with-plate');
  ok('names: tidied, deduped, JSON or words; the mode follows Clean background');
}
// ---------------- 2. graph ----------------
{
  const g = G.layersGraph({ source: '/x/src.mp4', objects: ['woman', 'steam'], edges: true, depth: true });
  assert.deepEqual(g['1'].inputs.file, { __file: '/x/src.mp4' });
  // exactly the SAM part of Swap Two People (proven on Comfy Cloud): one SAM3_Detect per name on frame 0 → batched → ONE tracker seeded with them
  for (const [k, name] of ['woman', 'steam'].entries()) {
    const b = 100 + 10 * k; const det = g[String(b + 1)];
    assert.equal(g[String(b)].inputs.text, name); assert.equal(det.class_type, 'SAM3_Detect'); assert.deepEqual(det.inputs.image, ['4', 0], 'detect on the first frame');
    assert.equal(det.inputs.threshold, 0.35); assert.equal(det.inputs.refine_iterations, 2);
    assert.deepEqual(g['150'].inputs[`images.image${k}`], [String(b + 2), 0]);
    assert.equal(g[String(200 + 10 * k)].inputs.object_indices, String(k), 'track index k = name k'); assert.equal(g[G.maskNode(k)].class_type, 'SaveImage');
  }
  const trk = g['152']; assert.equal(trk.class_type, 'SAM3_VideoTrack'); assert.equal(trk.inputs.max_objects, 2); assert.deepEqual(trk.inputs.initial_mask, ['151', 0]);
  assert.ok(!('conditioning' in trk.inputs), 'no text detection while tracking (the path that hung on Comfy Cloud)');
  assert.deepEqual(Object.keys(g['150'].inputs), ['images.image0', 'images.image1']);
  assert.ok(!g['120'] && !g['220'], 'chains 3 and 4 removed');
  const two = JSON.parse(fs.readFileSync(new URL('../../workflows/cloud/h3-two-person-swap-api.json', import.meta.url), 'utf8'));
  for (const [ours, theirs] of [['101', '143'], ['152', '170'], ['151', '163']]) for (const k of Object.keys(two[theirs].inputs)) if (!Array.isArray(two[theirs].inputs[k]) && k !== 'max_objects')
    assert.deepEqual(g[ours].inputs[k], two[theirs].inputs[k], `${ours}.${k} as Swap Two People ${theirs}`);
  assert.deepEqual(G.outputNodes({ objects: ['a', 'b'], edges: true, depth: true }).map((o) => o.role), ['mask0', 'mask1', 'edges', 'depth']);
  const bare = G.layersGraph({ source: 's', objects: ['a'], edges: false, depth: false });
  assert.ok(!bare['300'] && !bare['400'] && !bare[G.EDGES_NODE] && !bare[G.DEPTH_NODE]);
  assert.throws(() => G.layersGraph({ source: 's', objects: [], edges: true, depth: true }));
  assert.throws(() => G.layersGraph({ source: 's', objects: ['a', 'b', 'c', 'd', 'e'], edges: true, depth: true }));
  // every link points at a node that exists
  const full = G.layersGraph({ source: 's', objects: ['a', 'b', 'c', 'd'], edges: true, depth: true });
  for (const [id, n] of Object.entries<any>(full)) for (const v of Object.values<any>(n.inputs)) if (Array.isArray(v) && typeof v[0] === 'string') assert.ok(full[v[0]], `${id} → ${v[0]}`);
  // SAM classes and inputs as Comfy Cloud lists them (object_info 2026-10-26)
  const oi = JSON.parse(fs.readFileSync(new URL('./fixtures/object-info-comfy-cloud-2026-10-26.json', import.meta.url), 'utf8'));
  for (const n of Object.values<any>(full)) { const def = oi[n.class_type]; if (!def) continue; const known = [...Object.keys(def.input?.required ?? {}), ...Object.keys(def.input?.optional ?? {})];
    for (const k of Object.keys(n.inputs)) assert.ok(known.includes(k.split(".")[0]), `${n.class_type}.${k} is a Comfy Cloud input`); } // "images.image0": an autogrow input
  ok('graph: the proven Swap Two People SAM chain, parts removed when off, links and Cloud inputs valid');
}
// ---------------- 3. mask combine ----------------
{
  assert.deepEqual(M.bandPx(1280, 720), { core: 3, outer: 8 }); assert.deepEqual(M.bandPx(100, 100), { core: 1, outer: 3 });
  const f = M.combineFilter({ edges: true, core: 2, outer: 5 });
  assert.match(f, /\[a\]erosion,erosion\[core\]/); assert.match(f, /\[b\](dilation,){4}dilation\[outer\]/);
  assert.match(f, /\[outer\]\[soft\]blend=all_mode=darken\[band\]/); assert.match(f, /\[core\]\[band\]blend=all_mode=lighten/);
  assert.equal(M.combineFilter({ edges: false, core: 2, outer: 5 }), '[0:v]format=gray,gblur=sigma=0.7[m]');
  const oc = M.occludeArgs({ matte: 'm.mkv', front: ['a', 'b'], fps: 24, out: 'o.mkv' }).join(' ');
  assert.match(oc, /\[f0\]\[f1\]blend=all_mode=lighten\[u1\]/); assert.match(oc, /\[u1\]negate\[keep\]/); assert.match(oc, /blend=all_mode=multiply/);
  // real frames: SAM = a hard square, BiRefNet = soft everywhere; the result keeps the core, softens only near the edge, never far away
  const sam = path.join(D, 'sam'), soft = path.join(D, 'soft'); fs.mkdirSync(sam); fs.mkdirSync(soft);
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', "color=black:s=64x64:d=0.25:r=8,format=gray,geq=lum='255*between(X\\,16\\,47)*between(Y\\,16\\,47)'", M.seq(sam)]);
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=0x808080:s=64x64:d=0.25:r=8,format=gray', M.seq(soft)]);
  const out = path.join(D, 'm.mkv'); execFileSync('ffmpeg', M.combineArgs({ sam, edges: soft, fps: 8, core: 2, outer: 5, out }));
  const px = execFileSync('ffmpeg', ['-v', 'error', '-i', out, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
  const at = (x: number, y: number) => px[y * 64 + x];
  assert.equal(at(32, 32), 255, 'inside: fully opaque'); assert.equal(at(5, 5), 0, 'far outside: nothing');
  assert.ok(at(15, 32) > 100 && at(15, 32) < 160, `just outside the edge: BiRefNet's soft value (${at(15, 32)})`);
  ok('mask combine: the band filter and the overlap cut; real frames keep the core and soften only the edge');
}
// ---------------- 4. depth ----------------
{
  const v = Uint8Array.from({ length: 100 }, (_, i) => i);
  assert.equal(Dp.percentile(v, 1), 0); assert.equal(Dp.percentile(v, 99), 98); assert.equal(Dp.percentile(v, 50), 49);
  assert.deepEqual(Dp.clipRange(v), { lo: 0, hi: 98 }); assert.deepEqual(Dp.clipRange(new Uint8Array(10).fill(7)), { lo: 6, hi: 8 }, 'never a zero range');
  assert.match(Dp.stretchLut({ lo: 10, hi: 20 }), /^lut=c0='clip\(\(val-2570\)\*25\.500000,0,65535\)'$/);
  assert.ok(Dp.depth16Args({ dir: 'd', fps: 24, range: { lo: 0, hi: 255 }, outDir: 'o' }).includes('gray16be'));
  // two frames of 4 px; object A in the far half (depth 10), B in the near half (200)
  const depth = Uint8Array.from([10, 10, 200, 200, 10, 10, 200, 200]);
  const a = Uint8Array.from([255, 255, 0, 0, 255, 255, 0, 0]), b = Uint8Array.from([0, 0, 255, 255, 0, 0, 255, 255]), never = new Uint8Array(8);
  const zs = Dp.objectDepths(depth, [a, b, never], 4, 2); assert.deepEqual(zs, [10, 200, null]);
  assert.deepEqual(Dp.layerOrder(3, zs), [2, 0, 1], 'bottom first: never seen, far, near');
  assert.deepEqual(Dp.layerOrder(3, null), [2, 1, 0], 'no depth: the first chip on top');
  assert.deepEqual(Dp.layerOrder(2, [50, 50]), [1, 0], 'a tie: the earlier chip nearer');
  assert.equal(Dp.coverage(Uint8Array.from([255, 255, 255, 255, 0, 0, 0, 0]), 4), 0.5);
  ok('depth: percentiles, clip-wide 16-bit stretch, per-object median depth and the order');
}
// ---------------- 5. layers.json ----------------
let man: any;
{
  man = Mf.buildManifest({ jobId: 'j1', width: 640, height: 360, fps: 24, frames: 240, names: ['woman', 'steam'], order: [1, 0], depths: [200, 40], coverage: [1, 0.4], range: { lo: 3, hi: 250 },
    plate: { seconds: 4.7, model: 'LTX-2.5 Clean Plate' }, edges: true, where: 'your-computer',
    urls: { preview: ['/files/j1-layer1.webm', '/files/j1-layer2.webm'], matte: ['/files/j1-matte1.mp4', '/files/j1-matte2.mp4'], overview: '/files/j1-overview.mp4', source: '/files/s.mp4', depth: '/files/j1-depth.mp4', background: '/files/j1-background.mp4' } });
  assert.equal(man.seconds, 10); assert.deepEqual(man.layers.map((l: any) => [l.name, l.order, l.colour]), [['steam', 0, K.LAYER_COLOURS[1]], ['woman', 1, K.LAYER_COLOURS[0]]]);
  assert.equal(man.layers[1].depth, 0.784); assert.match(man.background.note, /first 4.7 s/); assert.equal(man.depth.bits, 16);
  assert.deepEqual(man.models.map((m: any) => m.name), ['SAM 3.1', 'BiRefNet', 'Depth Anything 3 Small', 'LTX-2.5 Clean Plate']);
  const short = Mf.buildManifest({ ...{ jobId: 'j2', width: 64, height: 64, fps: 24, frames: 113, names: ['a'], order: [0], depths: null, coverage: [1], range: null, edges: false, where: 'sample' as const },
    plate: { seconds: 4.7, model: 'x' }, urls: { preview: ['p'], matte: ['m'], overview: 'o', source: 's', depth: null, background: 'b' } });
  assert.equal(short.background.note, null, 'a plate as long as the clip: no note'); assert.deepEqual(short.models.map((m: any) => m.name), ['SAM 3.1', 'x']);
  const ex = Mf.exportManifest(man, { layer: (e) => ({ prores: `layers/${X.stem(e)}.mov`, matte: `mattes/${X.stem(e)}-matte.mp4` }), depth: 'depth/', background: 'background/clean-background.mov' });
  assert.deepEqual(ex.layers.map((l: any) => l.prores), ['layers/01-steam.mov', 'layers/02-woman.mov']); assert.equal(ex.fps, 24); assert.equal(ex.depth?.bits, 16);
  ok('layers.json: order bottom first, colours, background note, models, export file names');
}
// ---------------- 6. export ----------------
{
  const a = X.proresArgs({ source: 's.mp4', matte: 'm.mkv', frames: 120, out: 'o.mov' });
  const i = a.indexOf('-c:v'); assert.deepEqual(a.slice(i, i + 6), ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le']);
  assert.ok(a.join(' ').includes('alphamerge') && a.includes('-alpha_bits'));
  assert.deepEqual(X.prores422Args({ source: 'b.mp4', out: 'b.mov' }).slice(5, 11), ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le']);
  assert.equal(X.slug('Neon Sign!'), 'neon-sign'); assert.equal(X.slug('***'), 'layer');
  const src = path.join(D, 'big.bin'); fs.writeFileSync(src, Buffer.alloc(300_000, 7)); const zf = path.join(D, 't.zip');
  const n = await Z.writeZip(zf, [{ name: 'layers.json', data: Buffer.from('{"a":1}') }, { name: 'layers/01-ü.mov', path: src }]);
  const z = fs.readFileSync(zf); assert.equal(z.length, n);
  const eocd = z.length - 22; assert.equal(z.readUInt32LE(eocd), 0x06054b50); assert.equal(z.readUInt16LE(eocd + 10), 2);
  const cd = z.readUInt32LE(eocd + 16); assert.equal(z.readUInt32LE(cd), 0x02014b50); assert.equal(z.readUInt32LE(cd + 24), 7, 'first file: 7 bytes');
  try { execFileSync('unzip', ['-tq', zf]); ok('export zip: unzip -t passes'); } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
  ok('export: ProRes 4444 / 422 HQ commands, streaming ZIP with central directory');
}
// ---------------- 7. registration ----------------
{
  const R = await import('../src/tools/registry.ts'); const t = R.findTool('layers'); assert.ok(t, 'Layers is a tool (no-boot set = the desktop profile)');
  assert.deepEqual(t!.providers, [K.LAYERS_LOCAL]); assert.equal(t!.category, 'Edit Video');
  const { allRoutesFor } = await import('../src/routing/routes.ts'); const rs = allRoutesFor(K.LAYERS_LOCAL, t);
  assert.deepEqual(rs.map((r) => r.routeId), ['local:comfy-layers', K.LAYERS_CLOUD_ROUTE], 'one card, two places');
  const cloud = rs[1]; assert.equal(cloud.priceRef, K.LAYERS_CLOUD); assert.equal(cloud.label, 'Comfy Cloud');
  const { HOSTED_BY_ID } = await import('../src/shared/hostedPrices.ts'); assert.equal(HOSTED_BY_ID[K.LAYERS_CLOUD].priceUnmeasured, true);
  const { CLOUD_WORKFLOWS, isStandalone } = await import('../src/comfy/cloudWorkflows.ts'); const w = CLOUD_WORKFLOWS[K.LAYERS_CLOUD_ROUTE];
  assert.ok(isStandalone(w) && w.target === 'cloud' && w.graphs.includes(K.LAYERS_WORKFLOW));
  const { CLOUD_RUNNER_ROUTES } = await import('../src/routing/runnable.ts'); assert.ok(CLOUD_RUNNER_ROUTES.has(K.LAYERS_CLOUD_ROUTE));
  const { layersBillSeconds } = await import('../src/layers/register.ts');
  assert.equal(layersBillSeconds({ duration: 5, types: 'split' }), 5); assert.equal(layersBillSeconds({ duration: 5, types: ['with-plate'] }), 16.25);
  assert.equal(layersBillSeconds({ duration: 12, background: false }), 12); assert.equal(layersBillSeconds({ duration: 40 }), 15 + 11.25, 'capped at 15 s, plate at 5 s');
  assert.equal(cloud.priceInput!({ duration: 5, types: 'split' }).duration, 5, 'the twin route bills the same seconds');
  const { PLUGIN_CATALOG } = await import('../src/shared/pluginCatalog.ts'); const row = PLUGIN_CATALOG.find((e) => e.id === 'layers');
  assert.equal(row?.group, 'features'); assert.equal(row?.description, 'Split a video into separate layers');
  const { readProfile } = await import('../src/kernel/profile.ts'); assert.ok(readProfile('desktop').plugins.includes('layers'), 'on in the desktop edition');
  const { FEATURE_IDS } = await import('../src/plugins-builtin/features.ts'); assert.ok(FEATURE_IDS.includes('layers'), 'a feature plugin (routes after the core)');
  ok('registration: tool, two places, Cloud workflow + runner route, unmeasured price row, bill seconds, catalogue row, profile');
}
// ---------------- 8. plan ----------------
{
  const { layersPlan } = await import('../src/layers/plan.ts');
  const i = { videoPath: '/d/src.mp4', objects: ['woman'], edges: true, depth: false, background: false, width: 64, height: 64, fps: 24, frames: 48 };
  const p = layersPlan({ id: 'j', toolId: 'layers', provider: K.LAYERS_LOCAL, input: i }, 'local');
  assert.equal(p.passes.length, 1); assert.equal(p.passes[0].output, G.maskNode(0)); assert.deepEqual(p.passes[0].extraOutputs, [{ node: G.EDGES_NODE, label: 'edges' }]);
  assert.equal(p.post.kind, 'custom'); assert.equal(p.imageBatches, true); assert.equal(p.outKind, 'video');
  assert.throws(() => layersPlan({ id: 'j', toolId: 'layers', provider: K.LAYERS_LOCAL, input: {} }, 'local'), /not prepared/);
  const c = layersPlan({ id: 'j', toolId: 'layers', provider: K.LAYERS_LOCAL, input: { ...i, depth: true } }, 'cloud');
  assert.equal(c.passes[0].graph['400'].inputs.model_name, G.DA3_CLOUD_MODEL, 'Comfy Cloud: the depth template default (Mono-Large)');
  assert.equal(p.passes[0].graph['400'], undefined);
  ok('plan: one analysis pass (mattes + edges), custom finish on this computer, every frame kept; Mono-Large depth on Comfy Cloud');
}
// ---------------- 9. the unmeasured-price gate ----------------
{
  const { runCloudWorkflow, setCloudFetch } = await import('../src/routing/cloudRun.ts'); const { findRoute } = await import('../src/routing/routes.ts');
  const { UNMEASURED_PRICE_REASON } = await import('../src/routing/runnable.ts');
  let sent = 0; setCloudFetch((async () => { sent++; return new Response('{}'); }) as any, 1);
  const job: any = { id: 'g1', toolId: 'layers', provider: K.LAYERS_LOCAL, input: { videoPath: '/d/x.mp4', objects: ['a'] }, status: 'running' };
  await assert.rejects(runCloudWorkflow(job, findRoute(K.LAYERS_CLOUD_ROUTE)!, { n: 1 } as any), (e: any) => e.message === UNMEASURED_PRICE_REASON);
  assert.equal(job.reasonCode, 'price_unmeasured'); assert.equal(sent, 0, 'nothing was sent');
  setCloudFetch(null);
  ok('unmeasured price gate: a Comfy Cloud run is refused before anything is sent');
}
fs.rmSync(D, { recursive: true, force: true });
