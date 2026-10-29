// (O) LTX-2 start + end frame on Camera Moves + generateAudio. Plan unit checks + own mock server :8982 (temp data dir) + static_validate (0 errors).
// Run: npx tsx test/ltx-flf.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path';
import { buildPlan } from '../src/comfy/plans.ts';
const ROOT = path.resolve(import.meta.dirname, '..'); const TMP = process.env.TMPDIR || path.join(ROOT, '../../pb-scratch/tmp'); fs.mkdirSync(TMP, { recursive: true }); const D = fs.mkdtempSync(path.join(TMP, 'flf-')); const ok = (m: string) => console.log('ok ' + m);
const KEY = path.join(D, 'start.png'), END = path.join(D, 'end.png');
for (const [f, src] of [[KEY, 'testsrc2'], [END, 'smptebars']]) execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `${src}=size=1280x720`, '-frames:v', '1', f]);
const PORT = testPort(8982); const B = `http://localhost:${PORT}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '100', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' } });
try {
  // static validation of both graphs (validator lives next to the openhiggsfield repo under higgsfield-challenge/tools/; skip clearly if absent)
  const validator = [path.join(ROOT, '../../higgsfield-challenge/tools/static_validate.py'), path.join(ROOT, '../../tools/static_validate.py'), path.join(ROOT, '../tools/static_validate.py')].find((x) => fs.existsSync(x));
  if (!validator) { console.log('SKIP static_validate: tools/static_validate.py not found relative to the repo'); }
  else {
    const sv = execFileSync('python3', [validator, 'camera-ltx-flf-api.json', 'cloud/camera-ltx-flf-api.json'], { cwd: path.join(ROOT, '../workflows') }).toString();
    assert.equal((sv.match(/^PASS .*errors=0/gm) ?? []).length, 2, sv); ok('static_validate: camera-ltx-flf-api.json + cloud twin PASS, 0 errors');
  }
  const G = JSON.parse(fs.readFileSync(path.join(ROOT, '../workflows/camera-ltx-flf-api.json'), 'utf8'));
  assert.deepEqual(G, JSON.parse(fs.readFileSync(path.join(ROOT, '../workflows/cloud/camera-ltx-flf-api.json'), 'utf8')), 'cloud twin = local graph');
  assert.ok(!Object.values<any>(G).some((n) => /^ComfyCloud|Api$|ApiNode/.test(n.class_type)), 'no API nodes');
  for (const id of ['92:210', '92:211']) { assert.equal(G[id].class_type, 'LTXVAddGuide'); assert.equal(G[id].inputs.frame_idx, -1); }
  // plans
  const base = { id: 'j1', toolId: 'camera', provider: 'comfy-open', input: { types: ['ltx-dolly-in'], imagePath: KEY, duration: 5, prompt: 'p' } } as any;
  const p0 = buildPlan(base); assert.equal(p0.passes[0].workflow, 'camera-ltx-api.json'); assert.deepEqual(p0.post, { kind: 'concat', audio: true }); assert.ok(p0.passes[0].graph['92:97'].inputs.audio);
  const p1 = buildPlan({ ...base, input: { ...base.input, endImagePath: END } }); assert.equal(p1.passes[0].workflow, 'camera-ltx-flf-api.json'); assert.deepEqual(p1.passes[0].graph['200'].inputs.image, { __file: END }); assert.deepEqual(p1.passes[0].graph['98'].inputs.image, { __file: KEY });
  assert.equal(p1.passes[0].graph['201'].inputs['resize_type.width'], p1.passes[0].expect.width);
  const p2 = buildPlan({ ...base, input: { ...base.input, endImagePath: END, generateAudio: false } }); assert.equal(p2.passes[0].graph['92:97'].inputs.audio, undefined); assert.equal(p2.post.kind === 'concat' && p2.post.audio, false);
  const p3 = buildPlan({ ...base, input: { ...base.input, types: ['orbit', 'ltx-dolly-in'], endImagePath: END } }); assert.equal(p3.passes.at(-1)!.workflow, 'camera-ltx-flf-api.json'); assert.ok(p3.passes.slice(0, -1).every((x) => x.workflow !== 'camera-ltx-flf-api.json')); assert.equal(p3.post.kind === 'concat' && p3.post.audio, false, 'mixed with Fun Camera → no audio');
  ok('plan: endImagePath → last LTX move uses camera-ltx-flf (node 200 = end frame, sized like the start); audio kept for all-LTX (generateAudio:false drops it); mixed plans silent');
  // server
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const cam = (await (await fetch(`${B}/api/tools`)).json() as any[]).find((t) => t.id === 'camera'); const ins = cam.inputs.map((x: any) => x.name); assert.ok(ins.includes('endImage') && ins.includes('generateAudio'), JSON.stringify(ins));
  const send = async (f: Record<string, string>, end = true) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); fd.append('image', new Blob([fs.readFileSync(KEY)], { type: 'image/png' }), 'start.png');
    if (end) fd.append('endImage', new Blob([fs.readFileSync(END)], { type: 'image/png' }), 'end.png'); const r = await fetch(`${B}/api/tools/camera/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
  const q = await (await fetch(`${B}/api/tools/camera/price?provider=comfy-open&types=%5B%22ltx-dolly-in%22%5D&duration=5`)).json() as any;
  const j = await send({ types: '["ltx-dolly-in"]', provider: 'comfy-open', rights: '1', duration: '5', generateAudio: 'false' }); assert.equal(j.status, 200, JSON.stringify(j.body)); assert.equal(j.body.cost, q.credits, 'quote = charge');
  const jd = await (await fetch(`${B}/api/jobs/${j.body.id}`)).json() as any; assert.match(JSON.stringify(jd), /endImageUrl|-endImage/);
  const bad = await send({ types: '["ltx-dolly-in"]', provider: 'comfy-open', rights: '1', generateAudio: 'maybe' }, false); assert.equal(bad.status, 400);
  const fun = await send({ types: '["orbit"]', provider: 'comfy-open', rights: '1' }); assert.equal(fun.status, 200, JSON.stringify(fun.body));
  ok(`server: camera inputs list endImage + generateAudio; LTX job with endImage accepted, cost ${j.body.cost} = quote ${q.credits}; generateAudio=maybe → 400; Fun Camera + endImage accepted (end frame ignored with a warning)`);
  console.log('ALL OK ltx-flf');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); }
