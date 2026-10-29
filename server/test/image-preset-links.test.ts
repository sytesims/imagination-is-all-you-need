// Image menu preset links (2026-10-23): every hero preset the header Image menu shows opens the right workflow in Create Image with its settings applied.
// Checks the link (GET /api/image-presets href = presetHref) → the workflow it picks (a ready recipe in GET /api/image-workflows, or plain Create)
// → what the bar fills (shared/presetLink presetPrefill, the same function ImageCanvas runs): every setting lands on a control of that workflow
// (plain Create: aspect + style), the prompt is the template with the subject hint selected, and no placeholder is left. Unavailable presets aren't `ready`.
// Run: npx tsx test/image-preset-links.test.ts   (own mock server :9183, temp data dir, no network)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { presetHref, presetPrefill, presetFields, CREATE_PRESET_FIELDS } from '../src/shared/presetLink.ts';
import { IMAGE_PRESETS } from '../src/shared/presets.ts';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(9183); const B = `http://localhost:${PORT}`;
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'imgprelink-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '' };
const ok = (m: string) => console.log('ok ' + m);

// ---- 1. pure ----
assert.equal(presetHref({ id: 'golden-haze', workflow: 'create-image' }), '/tools/create-image?preset=golden-haze');
assert.equal(presetHref({ id: 'neon-rim', workflow: 'relight' }), '/tools/create-image?workflow=relight&preset=neon-rim');
{ const f = presetPrefill({ workflow: 'create-image', promptTemplate: '{subject}, on a wet street', subjectHint: 'a bicycle', settings: { aspect: '16:9', style: 'neon-night' } }, CREATE_PRESET_FIELDS);
  assert.deepEqual(f, { workflow: '', prompt: 'a bicycle, on a wet street', select: [0, 9], vals: { aspect: '16:9', style: 'neon-night' }, skipped: [] }); }
{ const f = presetPrefill({ workflow: 'create-image', promptTemplate: 'a plate of {subject}: one specimen', subjectHint: 'a fern', settings: {} }, CREATE_PRESET_FIELDS);
  assert.equal(f.prompt.slice(...f.select!), 'a fern'); }
{ const f = presetPrefill({ workflow: 'relight', promptTemplate: 'deep shadows, {prompt}', subjectHint: '', settings: { brightness: 55, nope: 'x' } }, ['brightness']);
  assert.deepEqual(f, { workflow: 'relight', prompt: 'deep shadows', select: null, vals: { brightness: '55' }, skipped: ['nope'] }); }
ok('presetHref / presetPrefill');

const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_ROUTING_LIVE: '',
  OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_HOSTED: '' }, stdio: ['ignore', 'ignore', 'pipe'], detached: true });
const get = async (u: string) => { const r = await fetch(B + u); assert.equal(r.status, 200, `${u} → ${r.status}`); return await r.json() as any; };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const P: any[] = (await get('/api/image-presets')).presets; const W: any[] = (await get('/api/image-workflows')).workflows;
  const tools: any[] = await get('/api/tools'); const create = tools.find((t) => t.id === 'create-image'); assert.ok(create, 'create-image tool');
  const opts = (name: string) => (create.inputs ?? []).find((i: any) => i.name === name)?.options?.map((o: any) => String(typeof o === 'object' ? o.value ?? o.id : o)) ?? [];
  // what the menu lists: hero, ready (available + its workflow in Create Image), with a thumbnail
  const menu = P.filter((p) => p.hero && p.ready && p.available && p.thumbnail);
  assert.equal(menu.length, IMAGE_PRESETS.filter((p) => p.hero).length, 'every hero preset is in the menu');
  assert.ok(P.filter((p) => !p.available).every((p) => !p.ready), 'unavailable presets are never ready (left out of the menu)');
  const seenWf = new Set<string>();
  for (const p of menu) {
    assert.equal(p.href, presetHref(p), `${p.id}: href`);
    const u = new URL(p.href, B); assert.equal(u.pathname, '/tools/create-image', `${p.id}: opens Create Image`); assert.equal(u.searchParams.get('preset'), p.id, `${p.id}: preset=`);
    if (p.workflow === 'create-image') { assert.equal(u.searchParams.get('workflow'), null, `${p.id}: plain Create has no workflow=`);
      const f = presetPrefill(p, CREATE_PRESET_FIELDS); assert.deepEqual(f.skipped, [], `${p.id}: every setting placed (${f.skipped})`); assert.deepEqual(f.vals, presetFields(p), `${p.id}: settings applied`);
      if (f.vals.style) assert.ok(opts('style').includes(f.vals.style), `${p.id}: style ${f.vals.style} is a Create Image style`);
      if (f.vals.aspect) assert.ok(opts('aspect').length === 0 || opts('aspect').includes(f.vals.aspect), `${p.id}: aspect ${f.vals.aspect} is offered`);
      check(p, f); seenWf.add('create-image'); continue; }
    assert.equal(u.searchParams.get('workflow'), p.workflow, `${p.id}: workflow=${p.workflow}`);
    const w = W.find((x) => x.id === p.workflow); assert.ok(w && w.status === 'ready', `${p.id}: ${p.workflow} is a ready workflow in Create Image`);
    const fields = w.controls.map((c: any) => c.field); const f = presetPrefill(p, fields);
    assert.deepEqual(f.skipped, [], `${p.id}: every setting is a ${p.workflow} control (${f.skipped})`); assert.deepEqual(f.vals, presetFields(p), `${p.id}: settings applied`);
    for (const [k, v] of Object.entries(f.vals)) { const c = w.controls.find((x: any) => x.field === k); if (c.options?.length) assert.ok(c.options.some((o: any) => String(o.value) === v), `${p.id}: ${k}=${v} is a ${p.workflow} option`); }
    if (w.prompt.mode === 'hidden') assert.equal(f.prompt, '', `${p.id}: ${p.workflow} has no prompt box`);
    check(p, f); seenWf.add(p.workflow);
  }
  ok(`${menu.length} hero preset links open the right workflow with their settings (${[...seenWf].join(', ')})`);
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* gone */ } fs.rmSync(D, { recursive: true, force: true }); }

function check(p: any, f: ReturnType<typeof presetPrefill>) {
  assert.ok(!/\{(subject|prompt)\}/.test(f.prompt), `${p.id}: no placeholder left in the prompt`); assert.ok(f.prompt.length > 0, `${p.id}: a prompt`);
  if (p.subjectHint && /\{(subject|prompt)\}/.test(p.promptTemplate)) assert.equal(f.prompt.slice(...f.select!), p.subjectHint, `${p.id}: the subject hint is selected`);
  else assert.equal(f.select, null, `${p.id}: no selection without a hint`);
}
