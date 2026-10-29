// Swap Two People · Comfy Cloud (2026-10-27, tools/twoPersonSwap.ts + comfy/h3TwoPersonSwapCloud.ts). FAKE fetches only (no network, no real key, no spend).
//  1 graph: every class in the two-pass graph is in Comfy Cloud's object_info snapshot; every link points at a node; nothing is unreachable from Save
//  2 who is who: no clicks = person 1 left, person 2 right; a lone click sets the other's side; clicks become SAM points; own words win in the prompt
//  3 chain: pass 2 takes pass 1's frames as <Video 1> and as its masked latent; each mask subtracts the other person's raw mask
//  4 limits: 2–15 s, the same spot for both refused; 480p / 768p canvases; a silent clip drops the audio guide in both passes
//  5 route + price: standalone Comfy Cloud entry with the LoRA preflight; the price row is an estimate held as unmeasured
// Run: npx tsx test/two-person-swap.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'twoswap-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
for (const k of ['COMFY_API_KEY', 'COMFY_CLOUD_URL', 'OPENHIGGSFIELD_COMFY_CLOUD_URL', 'COMFY_DEPLOY_URL', 'COMFY_RUNNER_URL', 'COMFY_BASE_URL']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const OI = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'object-info-comfy-cloud-2026-10-26.json'), 'utf8'));
const T = await import('../src/comfy/h3TwoPersonSwapCloud.ts');
const { CLOUD_WORKFLOWS, isStandalone } = await import('../src/comfy/cloudWorkflows.ts');
await import('../src/tools/registry.ts');
const { HOSTED_BY_ID } = await import('../src/shared/hostedPrices.ts') as any;

const base = { videoPath: '/x/clip.mp4', personAPath: '/x/a.png', personBPath: '/x/b.png', duration: 5, width: 1920, height: 1080, hasAudio: true, seed: 7 };
const plan = (extra: Record<string, any> = {}) => T.twoSwapCloudPlan({ id: 't', toolId: 'two-person-swap', provider: T.TWO_SWAP_PROVIDER, input: { ...base, ...extra } });
const isLink = (v: any) => Array.isArray(v) && typeof v[0] === 'string';

// 1 graph
for (const extra of [{ cast: [{}, {}] }, { cast: [{ point: { x: 0.7, y: 0.4 } }, { point: { x: 0.2, y: 0.4 } }] }, { hasAudio: false, resolution: '480p', cast: [{ point: { x: 0.8, y: 0.5 } }, {}] }]) {
  const p = plan(extra); const g = p.passes[0].graph;
  for (const [id, n] of Object.entries<any>(g)) { assert.ok(OI[n.class_type], `${id} ${n.class_type} on Comfy Cloud`); for (const v of Object.values<any>(n.inputs)) if (isLink(v)) assert.ok(g[v[0]], `${id} links to ${v[0]}`); }
  const keep = new Set<string>(); const st = [p.passes[0].output, ...(p.passes[0].extraOutputs ?? []).map((e: any) => e.node)]; while (st.length) { const k = st.pop()!; if (keep.has(k)) continue; keep.add(k); for (const v of Object.values<any>(g[k].inputs)) if (isLink(v)) st.push(v[0]); }
  assert.deepEqual(Object.keys(g).filter((k) => !keep.has(k)), [], 'no unreachable nodes');
}
ok('graphs: classes on Comfy Cloud, links whole, nothing unreachable');

// 2 who is who
assert.deepEqual(T.castSides([{}, {}]).map((c) => c.side), ['left', 'right']);
assert.deepEqual(T.castSides([{ point: { x: 0.8, y: 0.5 } }, {}]).map((c) => c.side), ['right', 'left']);
assert.deepEqual(T.castSides([{}, { point: { x: 0.2, y: 0.5 } }]).map((c) => c.side), ['right', 'left']);
{ const g = plan({ cast: [{ point: { x: 0.75, y: 0.5 }, who: 'woman in the red dress' }, {}] }).passes[0].graph;
  assert.equal(g['144'].inputs.value, JSON.stringify([{ x: 1008, y: 368 }])); assert.deepEqual(g['143'].inputs.positive_coords, ['144', 0]); assert.equal(g['145'], undefined);
  assert.match(g['313'].inputs.value, /^Replace the woman in the red dress in <Video 1> with the character in <Picture 1>/);
  assert.match(g['413'].inputs.value, /^Replace the person on the left in <Video 1>/); assert.equal(g['246'].inputs.x, 672); }
ok('who is who: sides, clicks and words');

// 3 chain
{ const g = plan().passes[0].graph;
  assert.deepEqual(g['420'].inputs['ref_videos.ref_video_0'], ['326', 0]); assert.deepEqual(g['463'].inputs.pixels, ['326', 0]); assert.deepEqual(g['464'].inputs.mask, ['255', 0]);
  assert.deepEqual(g['364'].inputs.mask, ['155', 0]); assert.deepEqual(g['154'].inputs.source, ['252', 0]); assert.deepEqual(g['254'].inputs.source, ['152', 0]);
  assert.deepEqual(g['430'].inputs.video, ['428', 0]); assert.deepEqual(g['428'].inputs.images, ['426', 0]); assert.equal(g['421'].inputs.noise_seed, 8);
  assert.deepEqual(g['312'].inputs.image, { __file: '/x/a.png' }); assert.deepEqual(g['412'].inputs.image, { __file: '/x/b.png' }); }
ok('chain: pass 2 builds on pass 1; masks keep to their own person');

// 3b the real job 84505322 (2026-10-28): portrait 834×1112 → 864×1152 at 768p, person 1 clicked on the left man, person 2 on the right one.
// Person 1 was never recast: each person had their own SAM track (max_objects 1, text detection on), so a track could merge with or jump to the
// other man in the same dark suit. Now: one joint track, two objects, no text detection; each click excludes the other person's click.
{ const p = plan({ width: 834, height: 1112, duration: 10, cast: [{ point: { x: 0.3727, y: 0.4864 }, who: 'man on the left, dark red tie' }, { point: { x: 0.7303, y: 0.5045 }, who: 'man on the right, blue tie' }] });
  const g = p.passes[0].graph; const tracks = Object.keys(g).filter((k) => g[k].class_type === 'SAM3_VideoTrack').sort();
  // the clicks share one track ('170'); since fd1a2425 a second, "person" track ('180') finds the whole bodies (block 3c)
  assert.deepEqual(tracks, ['170', '180'], 'one joint click track + one body track'); const tid = '170'; const t = g[tid];
  assert.equal(t.inputs.max_objects, 2); assert.equal(t.inputs.conditioning, undefined, 'no text detection: a track never picks up someone new'); assert.deepEqual(t.inputs.images, ['11', 0]);
  assert.deepEqual(g['148'].inputs, { track_data: [tid, 0], object_indices: '0' }); assert.deepEqual(g['248'].inputs, { track_data: [tid, 0], object_indices: '1' });
  assert.deepEqual(t.inputs.initial_mask, ['163', 0]); assert.deepEqual([g['162'].inputs['images.image0'], g['162'].inputs['images.image1']], [['160', 0], ['161', 0]]);
  assert.deepEqual(g['160'].inputs.mask, ['143', 0]); assert.deepEqual(g['161'].inputs.mask, ['243', 0]);
  assert.equal(g['144'].inputs.value, JSON.stringify([{ x: 322, y: 560 }])); assert.equal(g['244'].inputs.value, JSON.stringify([{ x: 631, y: 581 }]));
  assert.deepEqual(g['143'].inputs.negative_coords, ['244', 0]); assert.deepEqual(g['243'].inputs.negative_coords, ['144', 0]);
  assert.deepEqual([g['320'].inputs.width, g['320'].inputs.height, g['320'].inputs.length], [864, 1152, 243]); assert.deepEqual([g['150'].inputs.width, g['150'].inputs.height], [54, 72]);
  assert.deepEqual(g['320'].inputs['ref_videos.ref_video_0'], ['11', 0]); assert.deepEqual(g['364'].inputs, { samples: ['63', 0], mask: ['155', 0] });
  assert.deepEqual(g['420'].inputs['ref_videos.ref_video_0'], ['326', 0], 'pass 2 builds on pass 1'); assert.deepEqual(g['463'].inputs.pixels, ['326', 0]); assert.deepEqual(g['326'].inputs.samples, ['325', 0]);
  assert.match(g['313'].inputs.value, /^Replace the man on the left, dark red tie in <Video 1>/); assert.match(g['413'].inputs.value, /^Replace the man on the right, blue tie in <Video 1>/);
  assert.deepEqual(p.passes[0].extraOutputs!.map((e) => e.node), ['172', '272']); assert.deepEqual(g['180'].inputs.conditioning, ['41', 0], 'the "person" prompt now feeds the body track'); }
{ const g = plan({ cast: [{}, {}] }).passes[0].graph; assert.deepEqual(g['160'].inputs.mask, ['146', 0]); assert.deepEqual(g['161'].inputs.mask, ['246', 0]); assert.equal(g['143'].inputs.negative_coords, undefined); }
ok('real job 84505322: one joint click track, each click excludes the other, pass 2 on pass 1');

// 3c whole bodies (job fd1a2425, 2026-10-28: one click masked only the clicked jacket). A "person" track ('180') for up to 4 bodies; each person keeps the
// body that covers their click cell on frame 0 (plus their own click mask); grow, the mutual subtraction and the area outputs read that whole body.
{ const p = plan({ width: 834, height: 1112, duration: 4, cast: [{ point: { x: 0.3545, y: 0.4955 }, who: 'man on the left, dark red tie' }, { point: { x: 0.7, y: 0.4818 }, who: 'man on the right, blue tie' }] });
  const g = p.passes[0].graph; const cw = 54, ch = 72; const B = T.TWO_SWAP_BODIES;
  assert.deepEqual(g['180'].inputs, { images: ['11', 0], model: ['40', 0], conditioning: ['41', 0], detection_threshold: 0.5, max_objects: B, detect_interval: 1 }); assert.equal(g['41'].inputs.text, 'person');
  for (let j = 0; j < B; j++) assert.deepEqual(g[`5${j}0`].inputs, { track_data: ['180', 0], object_indices: String(j) });
  assert.deepEqual([g['602'].inputs.x, g['602'].inputs.y], [Math.floor(0.3545 * cw), Math.floor(0.4955 * ch)]); assert.deepEqual([g['612'].inputs.x, g['612'].inputs.y], [Math.floor(0.7 * cw), Math.floor(0.4818 * ch)]);
  const sum = (k: number) => `8${k}${B - 1}`;
  for (const k of [0, 1]) { let n = sum(k); const seen: string[] = []; while (n !== (k ? '252' : '152')) { seen.push(g[n].inputs.source[0]); n = g[n].inputs.destination[0]; } assert.deepEqual(seen.reverse(), Array.from({ length: B }, (_, j) => `7${k}${j}8`)); }
  assert.deepEqual(g['7008'].inputs.destination, ['504', 0]); assert.deepEqual(g['7000'].inputs, { destination: ['506', 0], source: ['602', 0], x: 0, y: 0, operation: 'multiply' });
  assert.equal(g['7004'].inputs.value, 0.0001); assert.deepEqual([g['7006'].inputs.width, g['7006'].inputs.height], [cw, ch]);
  assert.deepEqual(g['153'].inputs.mask, [sum(0), 0]); assert.deepEqual(g['253'].inputs.mask, [sum(1), 0]);
  assert.deepEqual(g['154'].inputs.source, [sum(1), 0]); assert.deepEqual(g['155'].inputs.source, [sum(0), 0]); assert.deepEqual(g['254'].inputs.source, [sum(0), 0]); assert.deepEqual(g['255'].inputs.source, [sum(1), 0]);
  assert.deepEqual(g['364'].inputs.mask, ['155', 0]); assert.deepEqual(g['464'].inputs.mask, ['255', 0]);
  assert.deepEqual(g['171'].inputs.images, ['901', 0]); assert.deepEqual(g['900'].inputs.mask, [sum(0), 0]); assert.deepEqual([g['901'].inputs.width, g['901'].inputs.height], [864, 1152]);
  assert.deepEqual(g['271'].inputs.images, ['911', 0]);
  for (const [id, n] of Object.entries<any>(g)) { assert.ok(OI[n.class_type], `${id} ${n.class_type}`); for (const v of Object.values<any>(n.inputs)) if (isLink(v)) assert.ok(g[v[0]], `${id} -> ${v[0]}`); } }
{ const g = plan({ cast: [{}, {}] }).passes[0].graph; assert.equal(g['180'], undefined, 'no clicks: the side split, no body track'); assert.deepEqual(g['153'].inputs.mask, ['152', 0]); }
ok('whole bodies: the tracked body under each click, read by grow, subtraction and the area outputs');

// 4 limits
assert.match(String(T.twoSwapIssue({ duration: 16 })), /up to 15 s/); assert.match(String(T.twoSwapIssue({ duration: 1 })), /at least 2 s/);
assert.match(String(T.twoSwapIssue({ duration: 5, cast: [{ point: { x: 0.5, y: 0.5 } }, { point: { x: 0.51, y: 0.5 } }] })), /same spot/);
assert.equal(T.twoSwapIssue({ duration: 15 }), null);
{ const g = plan({ resolution: '480p' }).passes[0].graph; assert.deepEqual([g['320'].inputs.width, g['320'].inputs.height, g['320'].inputs.length], [928, 512, 124]); }
{ const g = plan({ width: 1080, height: 1920 }).passes[0].graph; assert.deepEqual([g['420'].inputs.width, g['420'].inputs.height], [736, 1344]); }
{ const g = plan({ hasAudio: false }).passes[0].graph; assert.equal(g['319'], undefined); assert.equal(g['419'], undefined); assert.deepEqual(g['424'].inputs.conditioning, ['420', 0]); }
assert.throws(() => plan({ personBPath: '' }), /one photo for each person/);
ok('limits: length, same spot, canvases, silent clips, a missing photo');

// 5 route + price
const w = CLOUD_WORKFLOWS[T.TWO_SWAP_ROUTE]; assert.ok(isStandalone(w) && w.target === 'cloud' && typeof w.preflight === 'function');
const h = HOSTED_BY_ID[T.TWO_SWAP_PROVIDER]; assert.ok(h && h.priceUnmeasured && h.estimated && h.usdByQuality['480p'] < h.usdByQuality['768p']);
ok('route and estimate');
