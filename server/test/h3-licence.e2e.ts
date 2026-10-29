// E2E (own mock servers :8884 normal, :8885 open-weights-only; temp data dirs): H3 licence reconcile.
// 'Powered by MiniMax H3' attribution on every response carrying H3 output (job, list, share JSON + /s page, community shot, handoff),
// H3 never hidden in open-weights-only mode. Run: npx tsx test/h3-licence.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const ROOT = path.resolve(import.meta.dirname, '..');
const boot = (port: number, extra: Record<string, string> = {}) => spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), `h3l${port}-`)), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '300', OPENHIGGSFIELD_USE_LOCAL: '1', ...extra }, stdio: 'ignore', detached: true });
// Non-OSI local plugin fixture (K2): a copy of plugins/cutout re-licensed under the LTX-2 Community License, in its own temp plugins dir.
const PD = fs.mkdtempSync(path.join(os.tmpdir(), 'h3pl-')); fs.cpSync(path.resolve(ROOT, '../plugins/cutout'), path.join(PD, 'cutout-nc'), { recursive: true });
{ const f = path.join(PD, 'cutout-nc', 'plugin.json'); const m = JSON.parse(fs.readFileSync(f, 'utf8')); m.id = 'cutout-nc'; m.name = 'Cutout NC'; m.license = { id: 'ltx-2-community' }; fs.writeFileSync(f, JSON.stringify(m)); }
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'h3f-')); const png = path.join(T, 'r.png'), mp4 = path.join(T, 'a.mp4');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1280x720', '-frames:v', '1', png]);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=854x480:rate=24', '-t', '5', '-pix_fmt', 'yuv420p', mp4]);
const S = [boot(testPort(8884), { OPENHIGGSFIELD_MOCK_DELAY_MS: '3000' }), boot(testPort(8885), { OPENHIGGSFIELD_OPEN_WEIGHTS_ONLY: '1', OPENHIGGSFIELD_PLUGINS_DIR: PD })];
const api = (port: number) => { const B = `http://localhost:${port}`; return {
  B, get: async (u: string) => { const r = await fetch(B + u); const t = await r.text(); let body: any = t; try { body = JSON.parse(t); } catch { /* html */ } return { status: r.status, body }; },
  js: async (m: string, u: string, b?: unknown) => { const r = await fetch(B + u, { method: m, headers: b === undefined ? {} : { 'content-type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) }); return { status: r.status, body: await r.json().catch(() => null) as any }; },
  form: async (u: string, f: Record<string, string>, files: [string, string][] = [], h: Record<string, string> = {}) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); for (const [k, p] of files) fd.append(k, new Blob([fs.readFileSync(p)]), path.basename(p)); const r = await fetch(B + u, { method: 'POST', body: fd, headers: h }); return { status: r.status, body: await r.json() as any }; } }; };
const A = api(testPort(8884)), O = api(testPort(8885));
const done = async (a: ReturnType<typeof api>, id: string) => { for (let i = 0; i < 900; i++) { const j = (await a.get(`/api/jobs/${id}`)).body; if (['done', 'failed', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout ' + id); };
const H3 = { rights: '1', provider: 'comfy-h3', prompt: 'a lighthouse at dusk, waves', types: '["t2v"]', duration: '5', route: 'local:comfy-h3' };
try {
  for (const a of [A, O]) for (let i = 0; i < 60; i++) { try { if ((await fetch(`${a.B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); }
  // ---- licence names + clause (reconcile §4) ----
  { const l = (await A.get('/api/licenses')).body; const h3 = l.rows.filter((r: any) => /minimax-community/.test(r.licenseId ?? ''));
    assert.ok(h3.length, 'H3 rows'); assert.ok(h3.every((r: any) => /MiniMax H3 Community License/.test(r.license ?? r.licenseName ?? '')), JSON.stringify(h3[0]));
    const m = (await A.get('/api/models/comfy-h3')).body; const part = m.attribution.parts.find((p: any) => p.licenseId === 'minimax-community');
    assert.match(part.source.clause, /^§IV\.2 \(required\)/); assert.ok(!/Sec\. 4\(a\)/.test(JSON.stringify(m)), 'old Sec. 4(a) citation gone'); assert.equal(m.attribution.lines[0], 'Powered by MiniMax H3');
    console.log('ok licence name "MiniMax H3 Community License", §IV.2 clause, credit line "Powered by MiniMax H3"'); }
  // ---- attribution on every H3 output response ----
  const j = await A.form('/api/tools/h3-video/jobs', H3); assert.equal(j.status, 200, JSON.stringify(j.body)); const e = await done(A, j.body.id); assert.equal(e.status, 'done', JSON.stringify(e).slice(0, 300));
  const isH3 = (x: any, where: string) => { assert.ok(x?.attribution, `${where}: attribution missing`); assert.equal(x.attribution.text, 'Powered by MiniMax H3', where); assert.equal(x.attribution.required, false, where); assert.equal(x.attribution.level, 'encouraged', where); assert.equal(x.attribution.requiredText, 'MiniMax H3', where); assert.equal(x.attribution.display, 'prominent', where); };
  isH3(e, 'GET /api/jobs/:id');
  { const list = (await A.get('/api/jobs?limit=50')).body; const xs = Array.isArray(list) ? list : list.items ?? list.jobs; isH3(xs.find((x: any) => x.id === e.id), 'GET /api/jobs');
    const v = await A.js('POST', `/api/jobs/${e.id}/visibility`, { visibility: 'public', showPrompt: true }); assert.equal(v.status, 200); const tok = (await A.js('POST', `/api/jobs/${e.id}/share`)).body.token; assert.ok(tok, 'share token');
    isH3((await A.get(`/api/share/${tok}`)).body, 'GET /api/share/:token');
    const html = (await A.get(`/s/${tok}`)).body as string; assert.match(html, /Powered by MiniMax H3/, '/s page renders the credit line'); assert.match(html, /data-attribution/);
    isH3((await A.get('/api/community/shots?sort=new')).body.items.find((x: any) => x.id === e.id), 'community shot');
    isH3((await A.get(`/api/jobs/${e.id}/handoff`)).body, 'handoff');
    const img = await A.form('/api/tools/create-image/jobs', { rights: '1', types: '["generate"]', provider: 'comfy-zimage-turbo', prompt: 'a mug' }); const ie = await done(A, img.body.id);
    assert.equal(ie.attribution ?? null, null, 'non-H3 (Apache) result carries no credit line');
    console.log('ok attribution {text:"Powered by MiniMax H3", required:false, level:encouraged, requiredText:"MiniMax H3", display:prominent} on job, job list, share JSON, /s page, community shot, handoff; null for Apache results'); }
  // ---- open-weights-only: H3 is never hidden ----
  { const tools = (await O.get('/api/tools')).body as any[]; const hv = tools.find((t) => t.id === 'h3-video'); assert.ok(hv, 'h3-video listed in open-weights-only mode');
    assert.ok((hv.providers ?? []).some((p: any) => (p.id ?? p) === 'comfy-h3'), 'comfy-h3 provider listed: ' + JSON.stringify(hv.providers).slice(0, 200));
    const ms = (await O.get('/api/models?toolId=h3-video')).body.groups.flatMap((g: any) => g.models); assert.ok(ms.some((m: any) => m.id === 'comfy-h3'), 'comfy-h3 in /api/models');
    const r = await O.form('/api/tools/h3-video/jobs', H3); assert.equal(r.status, 200, `H3 submit in open-weights-only: ${JSON.stringify(r.body)}`);
    const ids = tools.flatMap((t) => (t.providers ?? []).map((p: any) => p.id ?? p));
    assert.ok((hv.providers ?? []).some((p: any) => (p.id ?? p) === 'cloud-h3-wf'), 'cloud-h3-wf (Comfy Cloud, our open-weight workflow) listed in OW mode');
    for (const h of ['cloud-h3', 'api-minimax-h3', 'router-kling']) /* cloud-minimax-music is an open-weights Comfy Cloud workflow since 2026-10-27 */ assert.ok(!ids.includes(h), `${h} (partner/API node or hosted model API) hidden in OW mode`);
    const rt = (await O.get('/api/routes?toolId=h3-video&modelId=cloud-h3-wf')).body.routes[0].routes.find((x: any) => x.kind === 'comfy-cloud'); assert.ok(rt && rt.reason !== 'open-weights-only mode', 'Comfy Cloud route not blocked by OW: ' + JSON.stringify(rt).slice(0, 200));
    const c = await O.form('/api/tools/h3-video/jobs', { ...H3, provider: 'cloud-h3-wf', route: 'comfy-cloud:cloud-h3-wf' }); assert.ok(c.status !== 400 || !/open-weights-only/.test(JSON.stringify(c.body)), 'cloud-h3-wf not rejected for OW: ' + JSON.stringify(c.body).slice(0, 300));
    console.log('ok open-weights-only: h3-video + comfy-h3 listed and runnable (no licence gating); cloud-h3-wf (Comfy Cloud workflow) listed + routable; cloud-h3 (API nodes), api-minimax-h3, cloud-minimax-music, router-kling hidden'); }
  // ---- K1–K5: open-weights-only hides hosted APIs only; non-OSI local models/plugins stay visible + runnable ----
  { const tools = (await O.get('/api/tools')).body as any[];
    const cam = tools.find((t) => t.id === 'camera'); assert.ok(cam, 'camera tool'); assert.ok((cam.presets ?? []).some((p: any) => p.id === 'ltx-dolly-in'), 'LTX camera preset (LTX-2 Community, non-OSI) listed');
    assert.ok(!tools.flatMap((t) => t.providers ?? []).some((p: any) => /^(fal|replicate|kling|runway|openai|google|minimax-api)/.test(p.id ?? p) && (p.kind ?? '') === 'hosted'), 'no hosted providers');
    const r = await O.form('/api/tools/camera/jobs', { rights: '1', types: '["ltx-dolly-in"]', provider: 'comfy-open', prompt: 'a room' }, [['image', png]]); assert.equal(r.status, 200, 'LTX preset submit in OW mode: ' + JSON.stringify(r.body));
    const pl = (await O.get('/api/plugins')).body; const items = Array.isArray(pl) ? pl : pl.items ?? pl.plugins; const nc = items.find((x: any) => x.id === 'cutout-nc');
    assert.ok(nc && nc.ok, 'non-OSI plugin loaded in OW mode: ' + JSON.stringify(nc).slice(0, 300)); assert.ok(tools.some((t) => t.id === 'cutout-nc'), 'plugin tool listed');
    const pr = await O.form('/api/tools/cutout-nc/jobs', { rights: '1', types: '["green"]' }, [['video', mp4]]); assert.equal(pr.status, 200, 'non-OSI plugin submit in OW mode: ' + JSON.stringify(pr.body));
    const pe = await done(O, pr.body.id); assert.equal(pe.status, 'done', JSON.stringify(pe).slice(0, 300));
    console.log('ok open-weights-only: LTX camera preset (ltx-2-community) + non-OSI plugin cutout-nc listed, submitted and done'); }
  // ---- concurrency ----
  // 2026-10-25 run lanes (queue.ts): one local run at a time (ComfyUI runs one prompt per GPU), up to 10 hosted runs; concurrency = both lanes
  { const c = (await A.get('/api/config')).body; assert.equal(c.concurrency, 11); assert.equal(c.lanes.local.limit, 1); assert.equal(c.lanes.cloud.limit, 10); assert.equal((await A.get('/api/queue')).body.concurrency, 11);
    const a = await A.form('/api/tools/h3-video/jobs', H3), b = await A.form('/api/tools/h3-video/jobs', H3); let both = false; let waited = false;
    for (let i = 0; i < 130; i++) { await new Promise((r) => setTimeout(r, 150)); const q = (await A.get('/api/queue')).body; both ||= q.lanes.local.running >= 2; waited ||= q.lanes.local.running === 1 && q.lanes.local.waiting === 1; if (waited) break; }
    assert.ok(!both && waited, 'two local jobs: one runs, the other waits'); await done(A, a.body.id); await done(A, b.body.id);
    console.log('ok local lane: 1 at a time (the 2nd local job waited)'); }
  console.log('ALL OK h3-licence');
} finally { for (const s of S) try { process.kill(-s.pid!); } catch { /* */ } fs.rmSync(PD, { recursive: true, force: true }); fs.rmSync(T, { recursive: true, force: true }); }
