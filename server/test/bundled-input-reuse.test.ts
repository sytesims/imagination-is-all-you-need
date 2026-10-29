/** Real copy/hash checks, no HTTP server, provider or generated jobs. All mutable files stay in this test's scratch dir. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
const ROOT = path.resolve(import.meta.dirname, '../..');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'bundled-reuse-')); const D = path.join(T, 'data'); fs.mkdirSync(D);
const reportFile = process.env.OPENHIGGSFIELD_REUSE_REPORT;
const keep = { PATH: process.env.PATH, HOME: process.env.HOME };
for (const k of Object.keys(process.env)) delete process.env[k];
Object.assign(process.env, keep, { OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(T, 'empty.env'), OPENHIGGSFIELD_FILMING_FILE: path.join(T, 'filming.json'), OPENHIGGSFIELD_USE_LOCAL: '0', COMFY_BASE_URL: 'http://127.0.0.1:8908' });
fs.writeFileSync(process.env.OPENHIGGSFIELD_ENV_FILE!, '');
const { reuseInputFiles, formFromInput } = await import('../src/routesPrefill.js');
const { getTool } = await import('../src/tools/registry.js');
const { FEATURED, isStarter } = await import('../src/shared/featured.js');
const portrait = '/examples/starter/presenter-talk-in.jpg'; const speech = '/examples/starter/presenter-talk-speech.mp3';
const sourcePath = (u: string) => u.startsWith('/files/') ? path.join(D, u.slice(7)) : u.startsWith('/samples/') ? path.join(ROOT, 'server/samples', u.slice(9)) : path.join(ROOT, 'web/public', u);
const hash = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const job = (input: any) => ({ id: 'recorded-source', input }) as any;
const imageTool: any = { id: 'image-fixture', name: 'Image fixture', inputs: [{ name: 'image', kind: 'file', accept: 'image/*' }] };
const report: any = { cases: [], catalogue: [] };
let serial = 0;
async function copied(tool: any, input: any, spec = 'all') {
  const id = `reuse-${serial++}`, files: Record<string, string[]> = {};
  const before = formFromInput(tool, job(input), { sameSeed: false });
  const r = await reuseInputFiles(tool, job(input), spec, id, files);
  assert.ok(!('status' in r), JSON.stringify(r));
  assert.deepEqual(r.fields, Object.keys(before.files), 'all expected fields copied');
  for (const [field, urls] of Object.entries(before.files)) for (const [k, u] of urls.entries()) {
    const name = files[field][k]; assert.ok(name.startsWith(id + '-')); assert.equal(path.extname(name), path.extname(u).toLowerCase());
    assert.equal(hash(path.join(D, name)), hash(sourcePath(u)), `${field}[${k}] bytes/order retained`);
  }
  report.cases.push({ input, spec, result: r, files, hashes: Object.fromEntries(Object.entries(files).map(([k, names]) => [k, names.map(n => hash(path.join(D, n)))])) });
  return files;
}
try {
  await copied(getTool('voice')!, FEATURED.find(f => f.key === 'presenter-talk')!.input);
  for (const f of FEATURED.filter(isStarter)) {
    const tool = getTool(f.toolId)!; const p = formFromInput(tool, job({ ...f.input, prompt: f.prompt }), { sameSeed: false });
    report.catalogue.push({ key: f.key, tool: f.toolId, files: p.files, missing: p.missing });
    assert.deepEqual(p.missing, [], f.key);
    if (Object.keys(p.files).length) await copied(tool, { ...f.input, prompt: f.prompt });
  }
  await copied(getTool('app-transition')!, FEATURED.find(f => f.key === 'ltx-morph')!.input);
  fs.copyFileSync(sourcePath(portrait), path.join(D, 'own.jpg'));
  await copied(imageTool, { imageUrl: '/files/own.jpg' });
  await copied(imageTool, { imageUrl: '/samples/sample-character.png' });
  await copied(imageTool, { imageUrl: '/showcase/char-mossbun.webp' });
  await copied(imageTool, { imageUrl: '/examples/showcase-seedance/fashion-still.jpg' });
  const maskTool: any = { ...imageTool, inputs: [...imageTool.inputs, { name: 'mask', kind: 'file', accept: 'image/*' }, { name: 'refs', kind: 'files', accept: 'image/*', max: 3 }] };
  assert.notEqual(hash(sourcePath('/samples/sample-keyframe.png')), hash(sourcePath(portrait)), 'mask fixture differs from its photo');
  await copied(maskTool, { imageUrl: portrait, maskUrl: '/samples/sample-keyframe.png', refUrls: ['/showcase/char-mossbun.webp'] });
  fs.writeFileSync(path.join(D, 'not-image.jpg'), '<html>Not an image</html>');
  for (const bad of ['/files/../outside.jpg', '/files/%2e%2e/outside.jpg', '/files/a%2fb.jpg', '/files/a\\b.jpg', '/files/./own.jpg', '/files//own.jpg', 'https://other.test/a.jpg', 'data:image/png,abc', '/examples/not-allowed/a.jpg', '/models/arbitrary.jpg', '/files/no-file.jpg', '/files/not-image.jpg', '/showcase/char-mossbun-3d.glb', speech]) {
    const before = fs.readdirSync(D); const files = {};
    const r = await reuseInputFiles(imageTool, job({ imageUrl: bad }), 'all', `bad-${serial++}`, files);
    assert.ok('status' in r && r.status === 400, `${bad}: ${JSON.stringify(r)}`); assert.equal((r as any).body.code, 'input_unavailable');
    assert.deepEqual(files, {}); assert.deepEqual(fs.readdirSync(D), before, 'failed reuse leaves no files');
  }
  fs.writeFileSync(path.join(T, 'outside.jpg'), fs.readFileSync(sourcePath(portrait))); fs.symlinkSync(path.join(T, 'outside.jpg'), path.join(D, 'escape.jpg'));
  const before = fs.readdirSync(D), files = {};
  const r = await reuseInputFiles(maskTool, job({ imageUrl: portrait, maskUrl: '/files/escape.jpg' }), 'all', 'atomic-failure', files);
  assert.ok('status' in r && r.status === 400); assert.deepEqual(files, {}); assert.deepEqual(fs.readdirSync(D), before, 'later symlink failure cleans earlier copies');
  const uploads = { image: ['explicit-upload.jpg'] };
  assert.deepEqual(await reuseInputFiles(imageTool, job({ imageUrl: '/files/missing.jpg' }), 'all', 'upload-wins', uploads), { fields: [] });
  assert.deepEqual(uploads, { image: ['explicit-upload.jpg'] });
  const none = await reuseInputFiles(imageTool, job({}), 'image', 'no-input', {});
  assert.ok('status' in none && (none.body as any).code === 'nothing_to_reuse');
  const missing = await reuseInputFiles(imageTool, job({ imageUrl: '/files/gone.jpg' }), 'image', 'missing-input', {});
  assert.ok('status' in missing && (missing.body as any).code === 'input_unavailable');
  const invalid = await reuseInputFiles(imageTool, job({ imageUrl: portrait }), 'video', 'wrong-field', {});
  assert.ok('status' in invalid && (invalid.body as any).code === 'invalid');
  const collision = path.join(D, 'collision-imager0.jpg'); fs.writeFileSync(collision, 'existing file stays');
  const names = fs.readdirSync(D); const conflict = await reuseInputFiles(imageTool, job({ imageUrl: portrait }), 'all', 'collision', {});
  assert.ok('status' in conflict && conflict.status === 400); assert.equal(fs.readFileSync(collision, 'utf8'), 'existing file stays'); assert.deepEqual(fs.readdirSync(D), names);
  assert.equal(report.catalogue.length, 52); report.passed = true;
  console.log(`bundled-input-reuse: PASS; ${report.catalogue.length} example metadata rows; ${report.cases.length} real copy/hash cases; negative safety/atomic cleanup/upload-wins checks`);
} finally {
  if (reportFile) fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  fs.rmSync(T, { recursive: true, force: true });
}
