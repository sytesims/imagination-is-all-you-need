// Image presets (2026-10-22): shared/presets.ts and GET /api/image-presets.
// Covers: every preset validates against the live tools (boot finds nothing), the validator catches bad presets (unknown workflow, field, value,
// out-of-range number, list vs single value, an unwired workflow marked available), every hero has its thumbnail file (512 px JPEG, ≤120 KB),
// the endpoint (shape, ETag / 304), and for EVERY preset a quote on its runner tool (GET /api/tools/<runner>/price) with the preset's settings works.
// Run: npx tsx test/image-presets.test.ts   (own mock server :9173, temp data dir, no network)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { IMAGE_PRESETS, validateImagePresets, fillPresetPrompt, presetFields, type ImagePreset } from '../src/shared/presets.ts';
const ROOT = path.resolve(import.meta.dirname, '..'); const WEB_PUBLIC = path.resolve(ROOT, '../web/public'); const PORT = testPort(9173); const B = `http://localhost:${PORT}`;
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'imgpre-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '' };
const ok = (m: string) => console.log('ok ' + m);

// ---- 1. pure ----
assert.equal(fillPresetPrompt('{subject}, on a wet street', 'a bicycle'), 'a bicycle, on a wet street');
assert.equal(fillPresetPrompt('{subject}, on a wet street', '  '), 'on a wet street');
assert.equal(fillPresetPrompt('deep shadows, {prompt}', ''), 'deep shadows');
assert.equal(fillPresetPrompt('deep shadows, {prompt}', 'add rain'), 'deep shadows, add rain');
assert.equal(fillPresetPrompt('a plate of {subject}: one specimen', ''), 'a plate of: one specimen');
assert.deepEqual(presetFields({ settings: { shots: ['front', 'back'], brightness: 55, color: '#FFFFFF' } }), { shots: '["front","back"]', brightness: '55', color: '#FFFFFF' });
const ids = IMAGE_PRESETS.map((p) => p.id); assert.equal(new Set(ids).size, ids.length, 'unique ids');
const heroes = IMAGE_PRESETS.filter((p) => p.hero); assert.equal(heroes.length, 8, '8 heroes');
assert.ok(heroes.every((p) => p.available), 'every hero is pickable once its workflow is ready');
for (const p of heroes) {
  const f = path.join(WEB_PUBLIC, p.thumbnail!); assert.ok(fs.existsSync(f), `${p.id}: thumbnail ${p.thumbnail} exists`);
  const b = fs.readFileSync(f); assert.ok(b[0] === 0xff && b[1] === 0xd8, `${p.id}: JPEG`); assert.ok(b.length <= 120 * 1024, `${p.id}: ≤120 KB (${b.length})`);
  let i = 2, w = 0, h = 0, exif = false; // walk the JPEG markers: size from SOF, no APP1 (EXIF / XMP) metadata
  while (i < b.length) { const m = b[i + 1]; const len = b.readUInt16BE(i + 2); if (m === 0xe1) exif = true; if (m >= 0xc0 && m <= 0xc2) { h = b.readUInt16BE(i + 5); w = b.readUInt16BE(i + 7); break; } i += 2 + len; }
  assert.deepEqual([w, h], [512, 512], `${p.id}: 512×512`); assert.ok(!exif, `${p.id}: no EXIF/XMP`);
  assert.ok(p.thumbnailModel, `${p.id}: says what made the thumbnail`);
}
assert.ok(IMAGE_PRESETS.every((p) => !/\b(kodachrome|leica|canon|nikon|polaroid|rembrandt|swiss)\b/i.test(`${p.name} ${p.description} ${p.promptTemplate}`)), 'no brand or real names in our copy');
ok(`${IMAGE_PRESETS.length} presets, ${heroes.length} heroes with 512 px thumbnails, prompt filling`);

const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_ROUTING_LIVE: '',
  OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_HOSTED: '' }, stdio: ['ignore', 'ignore', 'pipe'], detached: true });
let stderr = ''; srv.stderr!.on('data', (b) => { stderr += String(b); });
const get = async (u: string, h: Record<string, string> = {}) => { const r = await fetch(B + u, { headers: h }); return { status: r.status, headers: r.headers, body: r.status === 304 ? null : await r.json() as any }; };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  assert.ok(!/\[image-presets\]/.test(stderr), `boot validation is clean: ${stderr.match(/\[image-presets\][\s\S]*/)?.[0]}`);

  // ---- 2. the validator, against the live tool list ----
  const tools = Object.fromEntries(((await get('/api/tools')).body as any[]).map((t) => [t.id, t]));
  const getTool = (id: string) => tools[id];
  assert.deepEqual(validateImagePresets(getTool).errors, [], 'every preset validates against /api/tools');
  const base = IMAGE_PRESETS.find((p) => p.id === 'neon-rim')!;
  const bad = (o: Partial<ImagePreset>) => validateImagePresets(getTool, [{ ...base, ...o }]).errors.join(' | ');
  assert.match(bad({ workflow: 'no-such' as any }), /unknown workflow/);
  assert.match(bad({ settings: { ...base.settings, glow: 'yes' } }), /unknown field glow/);
  assert.match(bad({ settings: { ...base.settings, direction: 'front-left' } }), /direction=front-left is not one of/);
  assert.match(bad({ settings: { ...base.settings, brightness: 140 } }), /outside 0…100/);
  assert.match(bad({ settings: { ...base.settings, brightness: 57 } }), /not on the 5 step/);
  assert.match(bad({ settings: { ...base.settings, color: 'pink' } }), /color=pink doesn't match/);
  assert.match(bad({ settings: { ...base.settings, provider: 'api-nano-banana' } }), /unknown field provider/, 'a preset never picks the model');
  assert.match(bad({ promptTemplate: '{subject} and {thing}' }), /unknown placeholder \{thing\}/);
  assert.match(validateImagePresets(getTool, [{ ...IMAGE_PRESETS.find((p) => p.id === 'full-turnaround')!, settings: { shots: 'front' } }]).errors.join(), /shots must be a list/);
  assert.match(validateImagePresets(getTool, [{ ...IMAGE_PRESETS.find((p) => p.id === 'full-turnaround')!, settings: { shots: ['dutch'] } }]).errors.join(), /shots=dutch is not one of/);
  /* 2026-10-23: Brush Edit, Camera Angles and Camera & Lens are in the bar, so their presets are available and validate clean */
  for (const id of ['sky-swap', 'full-turnaround', 'slide-film-street', 'telephoto-portrait']) { const pr = IMAGE_PRESETS.find((p) => p.id === id)!; assert.ok(pr.available, `${id} available`); assert.deepEqual(validateImagePresets(getTool, [pr]).errors, [], `${id} validates`); }
  assert.match(validateImagePresets(getTool, [{ ...IMAGE_PRESETS.find((p) => p.id === 'slide-film-street')!, settings: { film: 'no-film' } }]).errors.join(), /film=no-film/);
  assert.match(validateImagePresets(getTool, [{ ...IMAGE_PRESETS.find((p) => p.id === 'dark-pedestal')!, settings: { scene: 'podium', aspect: '5:3' } }]).errors.join(), /aspect=5:3/); // 4:5 is now a real create-image shape (Gemini / Seedream lists), 5:3 is offered by no model
  assert.match(validateImagePresets(getTool, [base, base]).errors.join(), /duplicate id/);
  ok('validator catches unknown workflow / field / value, ranges, steps, patterns, lists, model picks, unwired workflows, duplicates');

  // ---- 3. the endpoint ----
  const r = await get('/api/image-presets'); assert.equal(r.status, 200); const PS: any[] = r.body.presets;
  assert.deepEqual(PS.map((p) => p.id), ids, 'every preset is served, in order');
  const etag = r.headers.get('etag')!; assert.ok(etag && /no-cache/.test(r.headers.get('cache-control') ?? ''), 'ETag + no-cache (saved looks are in the list, 2026-10-23)');
  assert.equal((await get('/api/image-presets', { 'if-none-match': etag })).status, 304, 'If-None-Match → 304');
  const wfs = Object.fromEntries((await get('/api/image-workflows')).body.workflows.map((w: any) => [w.id, w]));
  for (const p of PS) {
    const w = wfs[p.workflow]; assert.equal(p.runner.toolId, w ? w.runner.toolId : 'create-image', `${p.id}: runner`);
    assert.equal(p.ready, p.available && (w ? w.status === 'ready' : true), `${p.id}: ready = available and the workflow is pickable`);
  }
  ok(`GET /api/image-presets: ${PS.length} presets (${PS.filter((p) => p.ready).length} ready now), ETag ${etag}, 304 on revalidate`);

  // ---- 4. every preset quotes on its runner with its settings ----
  for (const p of PS) {
    const w = wfs[p.workflow]; const q: Record<string, string> = { ...presetFields(p) };
    for (const s of w?.slots ?? []) if (s.required) q[s.sendsAs] = '1';
    if (q.face || q.person) q.refs = '2';
    if (p.workflow === 'brush-edit') q.mask = '1';
    if (!w || w.runner.toolId === 'create-image') q.mode = 'generate';
    const quote = await get(`/api/tools/${p.runner.toolId}/price?${new URLSearchParams(q)}`);
    assert.equal(quote.status, 200, `${p.id} quote: ${JSON.stringify(quote.body).slice(0, 300)}`);
    assert.ok(quote.body.credits != null || quote.body.listCredits != null || quote.body.free, `${p.id}: a price`);
  }
  ok(`every preset quotes on its runner tool (${PS.length} quotes)`);
  // ---- 5. ?preset= on the three new workflows: ready, the link picks the workflow, every setting lands on one of its controls ----
  { const { presetPrefill, presetHref, presetFields: pf } = await import('../src/shared/presetLink.ts');
    for (const id of ['sky-swap', 'full-turnaround', 'slide-film-street', 'telephoto-portrait']) { const p = PS.find((x) => x.id === id)!; const w = wfs[p.workflow];
      assert.ok(p.ready && w.status === 'ready', `${id}: ready`); assert.equal(p.href, presetHref(p)); assert.equal(new URL(p.href, 'http://x').searchParams.get('workflow'), p.workflow);
      const f = presetPrefill(p, w.controls.map((c: any) => c.field)); assert.deepEqual(f.skipped, [], `${id}: every setting placed`); assert.deepEqual(f.vals, pf(p));
      for (const [k, v] of Object.entries(f.vals)) { const c = w.controls.find((x: any) => x.field === k); if (c.kind === 'chips-multi') { for (const x of JSON.parse(v)) assert.ok(c.options.some((o: any) => o.value === x), `${id}: ${k} ${x}`); } else assert.ok(c.options.some((o: any) => String(o.value) === v), `${id}: ${k}=${v} is an option`); } }
    ok('?preset= works for Brush Edit (Sky Swap), Camera Angles (Full Turnaround) and Camera & Lens (Slide Film Street, Telephoto Portrait)'); }
  console.log('PASS image-presets');
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* */ } }
