// Video › Look (2026-10-27 trim): 12 Style looks with real local covers, removed look ids kept as aliases (old jobs, Recreate, MCP),
// 6 near-duplicate camera ids folded into the kept move, and the size cap on web/public/examples/covers.
// Run: npx tsx test/video-looks.test.ts   (in-process, mock backend, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_DATA_DIR ??= fs.mkdtempSync(path.join(os.tmpdir(), 'video-looks-')); process.env.OPENHIGGSFIELD_BACKEND ??= 'mock';
const ok = (m: string) => console.log('ok ' + m);
const PUB = path.resolve(import.meta.dirname, '../../web/public');
const { VIDEO_LOOKS, VIDEO_LOOK_ALIASES, videoLookId } = await import('../src/tools/h3/videoLooks.ts');
const { videoPresets, videoPresetById } = await import('../src/tools/h3/videoCaps.ts');
await import('../src/tools/h3/index.ts'); const { cameraApp, cameraMoveId, cameraMovePrompt, CAMERA_ALIASES } = await import('../src/tools/apps.ts'); const { listTools } = await import('../src/tools/registry.ts');

// ---- the 12 looks: distinct ids, labels and prompts, a one-line description each, a real cover each
const st = videoPresets().filter((x: any) => x.kind === 'style') as any[];
assert.equal(st.length, 12, 'twelve Style looks');
for (const k of ['id', 'label', 'prompt'] as const) assert.equal(new Set(st.map((x) => x[k])).size, st.length, `unique ${k}`);
for (const x of st) {
  assert.ok(x.description && x.description.length <= 70 && !x.description.includes('\n'), `${x.id}: one-line description`);
  assert.match(x.posterUrl, /^\/examples\/covers\/video-looks\/[\w-]+\.webp$/, x.posterUrl);
  const f = path.join(PUB, x.posterUrl.slice(1)); assert.ok(fs.existsSync(f), `missing cover ${x.posterUrl}`); const n = fs.statSync(f).size; assert.ok(n > 5_000 && n <= 60_000, `${x.posterUrl} ${n} B`);
  assert.match(x.posterNote, /made with FLUX\.2 \[klein\] 4B/, 'the cover says which model made it');
}
ok(`12 looks, unique, each with a description and a real cover (${st.map((x) => x.id).join(', ')})`);

// ---- removed look ids are aliases of a kept look: lookup, the job, and the list
const kept = new Set(VIDEO_LOOKS.map((x) => x.id));
for (const [old, to] of Object.entries(VIDEO_LOOK_ALIASES)) {
  assert.ok(kept.has(to), `${old} → ${to} is a kept look`); assert.ok(!kept.has(old), `${old} is no longer listed`);
  assert.equal(videoLookId(`style-${old}`), `style-${to}`); assert.equal((videoPresetById(`style-${old}`) as any)?.id, `style-${to}`, `style-${old} resolves`);
  assert.ok(st.find((x) => x.id === `style-${to}`).aliases.includes(`style-${old}`), `style-${to} lists style-${old} as an alias`);
}
for (const id of ['warm-ambient', 'street-2000s', 'mono', 'editorial', 'product', 'vintage-polaroid', 'flat-light', 'low-key']) assert.ok(VIDEO_LOOK_ALIASES[id], `every removed id of the old 20 is an alias: ${id}`);
assert.equal(videoPresetById('style-nope'), null, 'unknown stays unknown'); assert.equal((videoPresetById('h3-orbit') as any)?.kind, 'camera', 'camera presets unchanged');
const h3 = (listTools() as any[]).find((t) => t.id === 'h3-video');
const base = { types: JSON.stringify(['t2v']), prompt: 'A lighthouse on a cliff at dusk', provider: 'router-seedance', duration: '5' };
const rOld: any = await h3.parseInput({ ...base, videoPreset: 'style-mono' }, {}); const rNew: any = await h3.parseInput({ ...base, videoPreset: 'style-noir' }, {});
assert.ok(!rOld.error, String(rOld.error)); assert.equal(rOld.videoPreset, 'style-noir', 'an old job (Recreate, MCP) runs the kept look'); assert.equal(rOld.finalPrompt, rNew.finalPrompt, 'same words as the kept look');
assert.equal(rNew.finalPrompt, `A lighthouse on a cliff at dusk. ${VIDEO_LOOKS.find((x) => x.id === 'noir')!.prompt}`, 'the look phrase is appended after a full stop (what the covers were made with)');
const rNone: any = await h3.parseInput({ ...base, videoPreset: '' }, {}); assert.ok(!rNone.error && !rNone.videoPreset, 'no look → nothing added');
const rBad: any = await h3.parseInput({ ...base, videoPreset: 'style-nope' }, {}); assert.ok(rBad.error, 'unknown look → 400');
ok(`${Object.keys(VIDEO_LOOK_ALIASES).length} removed look ids run as the kept look (old jobs, Recreate, MCP); none / unknown handled`);

// ---- camera: 6 near-duplicate ids folded into the kept move (Camera Moves list and Look); model-specific moves stay in Camera Moves
const folded: Record<string, string> = { 'push-slow': 'push-in', 'pull-slow': 'pull-out', locked: 'static', 'orbit-r': 'orbit', 'vertigo-in': 'vertigo', 'crash-in': 'snap-zoom' };
const ids = new Set((cameraApp.presets as any[]).map((x) => x.id));
for (const [old, to] of Object.entries(folded)) {
  assert.equal(CAMERA_ALIASES[old], to); assert.equal(cameraMoveId(old), to); assert.ok(!ids.has(old) && ids.has(to), `${old} folded into ${to}`);
  assert.equal(cameraMovePrompt(old), cameraMovePrompt(to)); assert.ok((cameraApp.presets as any[]).find((x) => x.id === to).aliases.includes(old));
  const r: any = await h3.parseInput({ ...base, cameraMove: old }, {}); assert.ok(!r.error, String(r.error)); assert.equal(r.cameraMove, to, `Look camera ${old} → ${to}`);
}
assert.equal(ids.size, 82, 'Camera Moves lists 82 moves');
assert.ok([...ids].some((x) => /^(ltx|h3)-/.test(x)), 'LTX and H3 LoRA moves stay in Camera Moves');
const vs = fs.readFileSync(path.resolve(import.meta.dirname, '../../web/src/ui/video/VideoStudio.tsx'), 'utf8');
assert.match(vs, /camPresets\.filter\(x => x\.id !== 'free' && !\/\^\(ltx\|h3\)-\/\.test\(x\.id\)\)/, 'Look › Camera hides the model-specific moves');
ok('6 camera near-duplicates are aliases (82 moves); Look hides ltx-* / h3-*');

// ---- size cap: web/public/examples/covers (not showcase, which is at its cap)
const walk = (d: string): number => fs.readdirSync(d, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? walk(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
const covers = walk(path.join(PUB, 'examples/covers'));
assert.ok(covers <= 10_000_000, `examples/covers ${covers} B (cap 10 MB)`);
ok(`examples/covers ${(covers / 1e6).toFixed(2)} MB (≤ 10 MB)`);
