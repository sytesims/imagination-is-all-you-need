// Re-shoot Comfy Cloud route (prep for Oct 23): cloud-reshoot runs workflows/cloud/reshoot-cloud-api.json (our reshoot-api.json) as a Comfy Cloud
// workflow job: open weights, visible in open-weights-only mode, route comfy-cloud / providerGroup 'Comfy Cloud', estimated price, mock run.
// Run: npx tsx test/reshoot-cloud.e2e.ts (ports 8973/8974; temp data dirs).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' };
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'rsc-'));
const boot = (port: number, extra: Record<string, string> = {}) => spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(D, 'd-')),
  OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '150', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '0', ...extra }, stdio: 'ignore', detached: true });
const stop = (p: ChildProcess) => { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } };
const api = (port: number) => { const B = `http://localhost:${port}`;
  const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
  const post = async (u: string, f: Record<string, string>, files: [string, string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v);
    for (const [k, p, t] of files) fd.append(k, new Blob([fs.readFileSync(p)], { type: t }), path.basename(p)); const r = await fetch(B + u, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
  const until = async (id: string) => { for (let i = 0; i < 600; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'needs_decision', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout ' + id); };
  const ready = async () => { for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); } throw new Error(`server ${port} did not start`); };
  return { B, get, post, until, ready }; };
const ok = (m: string) => console.log('ok ' + m);
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a]);
const MP4 = path.join(D, 'clip.mp4'); ff('-f', 'lavfi', '-i', 'testsrc2=size=854x480:rate=24', '-f', 'lavfi', '-i', 'sine=d=6', '-t', '6', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', MP4);
const n = boot(testPort(8973)), o = boot(testPort(8974), { OPENHIGGSFIELD_OPEN_WEIGHTS_ONLY: '1' }); const N = api(testPort(8973)), O = api(testPort(8974));
try {
  await N.ready(); await O.ready();
  const g = JSON.parse(fs.readFileSync(path.join(ROOT, '../workflows/cloud/reshoot-cloud-api.json'), 'utf8')); const local = JSON.parse(fs.readFileSync(path.join(ROOT, '../workflows/reshoot-api.json'), 'utf8'));
  assert.deepEqual(g, local, 'clean-room twin = our own reshoot-api.json'); assert.ok(!Object.values<any>(g).some((x) => /Api|Partner|ComfyCloud/.test(x.class_type)), 'no API/partner nodes'); ok('cloud graph = our reshoot-api.json, no API nodes');
  const t = (await N.get('/api/tools')); const rs = (Array.isArray(t) ? t : t.tools).find((x: any) => x.id === 'reshoot'); const pv = rs.providers.find((p: any) => p.id === 'cloud-reshoot');
  assert.ok(pv && pv.openWeights === true, JSON.stringify(pv)); assert.deepEqual(pv.workflows, [], 'tool.workflows untouched (comfy-open keeps its graphs)');
  assert.ok(!rs.providers.find((p: any) => p.id === 'comfy-open').workflows.includes('cloud/reshoot-cloud-api.json'));
  const ot = (await O.get('/api/tools')); assert.ok((Array.isArray(ot) ? ot : ot.tools).find((x: any) => x.id === 'reshoot').providers.some((p: any) => p.id === 'cloud-reshoot'), 'visible in open-weights-only'); ok('cloud-reshoot open weights, visible in open-weights-only mode');
  const R = await N.get('/api/routes?toolId=reshoot&modelId=cloud-reshoot'); const rt = R.routes[0].routes; assert.equal(rt[0].routeId, 'comfy-cloud:cloud-reshoot'); assert.equal(rt[0].openWeights, true);
  assert.equal(R.routes[0].providerGroup ?? rt[0].providerGroup, 'Comfy Cloud', JSON.stringify(R).slice(0, 600)); ok('route comfy-cloud:cloud-reshoot, providerGroup Comfy Cloud');
  // Veo 3.1 isn't listed on Re-shoot any more (2026-11-02: it takes no source video)
  assert.ok(!rs.providers.some((p: any) => p.id === 'router-veo'), 'no Veo on Re-shoot'); ok('Re-shoot lists no Veo 3.1');
  const q = await N.get('/api/tools/reshoot/price?provider=cloud-reshoot&duration=5&resolution=720p'); const listed = q.demo ? q.listCredits : q.credits; assert.ok(listed > 0, JSON.stringify(q).slice(0, 500));
  const copy = JSON.stringify(q); assert.ok(!/placeholder until|\(placeholder\)|B6|mock|OPENHIGGSFIELD_/i.test(copy), `neutral user copy: ${copy.slice(0, 800)}`);
  // Comfy audit (2026-10-24): an unmeasured GPU-time price says so plainly ("Price not measured yet … The figure shown is a placeholder.") and is flagged
  assert.equal(q.hosted?.priceUnmeasured, true); assert.match(String(q.hosted?.note), /^Price not measured yet/);
  const r = await N.post('/api/tools/reshoot/jobs', { rights: '1', provider: 'cloud-reshoot', angles: JSON.stringify(['low angle']), resolution: '720p' }, [['video', MP4, 'video/mp4']]);
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 600)); assert.equal(r.body.cost, q.credits, `quote ${q.credits} = charge ${r.body.cost}`); const j = await N.until(r.body.id); assert.equal(j.status, 'done', JSON.stringify(j.error));
  ok(`estimated price ${listed} cr listed (charge ${r.body.cost}${q.demo ? ', demo preview' : ''}), mock run done`);
  console.log('ALL OK reshoot-cloud');
} finally { stop(n); stop(o); fs.rmSync(D, { recursive: true, force: true }); }
