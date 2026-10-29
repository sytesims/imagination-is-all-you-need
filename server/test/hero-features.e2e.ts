// Hero features (Oct 21 2026). Run: npx tsx test/hero-features.e2e.ts  (needs ffmpeg on PATH)
//  A. "Get workflow": the runner's submitted graph is stored, and the export rebuilt from the job input equals what the runner submitted
//     (in-process runNative with a fake ComfyUI transport: local create-image, local object-swap with an ffmpeg prep, a Comfy Cloud workflow route);
//     over HTTP: local → rebuilt/exact, fal → equivalent/not exact, hosted without a workflow → "This ran on …", partner node → partner graph.
//  B. Share cards: /s/<token> has Open Graph + X card meta (and never the prompt), /s/<token>/card.png is a 1200×630 PNG (server card),
//     the browser card upload is validated and only accepted while shared, revoke → 404 everywhere.
//  C. Open models only: with the switch on, NO closed / partner / hosted route is quotable or submittable (every tool × engine × route the
//     server listed with the switch off, with mock keys so those routes would otherwise run), and listings only show open models.
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-')); const DIN = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-in-'));
process.env.PATH = `/opt/homebrew/bin:${process.env.PATH}`;
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a]);
const MP4 = path.join(D, 'clip.mp4'); ff('-f', 'lavfi', '-i', 'testsrc2=size=854x480:rate=24', '-f', 'lavfi', '-i', 'sine=d=4', '-t', '4', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', MP4);
const PNG = path.join(D, 'img.png'); ff('-f', 'lavfi', '-i', 'testsrc2=size=768x768', '-frames:v', '1', PNG);
const WAV = path.join(D, 'a.wav'); ff('-f', 'lavfi', '-i', 'sine=d=4', '-ar', '44100', WAV);
let fail = 0; const bad: string[] = []; const ok = (c: unknown, m: string) => { if (!c) bad.push(m); };

// ---------------- A (in process): submitted == rebuilt ----------------
process.env.OPENHIGGSFIELD_DATA_DIR = DIN; process.env.OPENHIGGSFIELD_BACKEND = 'mock'; process.env.OPENHIGGSFIELD_FILMING_FILE = path.join(DIN, 'nofilm.json');
{
  const { runNative } = await import('../src/comfy/runNative.js'); const { buildPlan } = await import('../src/comfy/plans.js'); const { buildCloudPlan } = await import('../src/comfy/cloudWorkflows.js');
  const { buildWorkflowExport, storedGraphs, GRAPHS_DIR } = await import('../src/workflowExport.js');
  const fake = (sent: any[]) => ({ upload: async (f: string) => path.basename(f), download: async (_o: any, dest: string) => { fs.copyFileSync(PNG, dest); return dest; },
    run: async (g: any) => { sent.push(JSON.parse(JSON.stringify(g))); return { outputs: new Proxy({}, { get: () => [{ filename: 'o.png' }] }) } as any; } });
  const cp = (f: string, n: string) => { const d = path.join(DIN, n); fs.copyFileSync(f, d); return d; };
  const cases = [
    { id: 'wfa00001', toolId: 'create-image', provider: 'comfy-zimage-turbo', route: 'local:comfy-zimage-turbo', input: { types: ['generate'], mode: 'generate', prompt: 'a red fox in snow', finalPrompt: 'a red fox in snow', seed: 1234, aspect: '1:1', resolution: '720p', n: 1 }, cloud: false },
    { id: 'wfa00002', toolId: 'object-swap', provider: 'comfy-open', route: 'local:comfy-open', input: { prompt: 'swap the person', seed: 7, duration: 4, width: 854, height: 480, videoPath: cp(MP4, 'wfa00002-video0.mp4'), refPaths: [cp(PNG, 'wfa00002-refs0.png')], keepAudio: true }, cloud: false },
    { id: 'wfa00003', toolId: 'h3-video', provider: 'comfy-h3', route: 'comfy-cloud:cloud-h3-wf', input: { types: ['t2v'], mode: 't2v', prompt: 'a paper boat on a rainy street', seed: 42, duration: 5, resolution: '768p', aspect: '16:9' }, cloud: true },
  ];
  for (const c of cases) {
    const job: any = { ...c, status: 'queued', stage: 'queued', progress: 0, queuePos: 0, eta: 0, resultUrl: null, outputs: [], error: null, warnings: [], createdAt: Date.now() }; delete job.cloud;
    const sent: any[] = [];
    try { await runNative(job, fake(sent), c.cloud ? (j, o) => buildCloudPlan({ ...j, provider: 'cloud-h3-wf' }, o) : buildPlan); } catch (e) { bad.push(`${c.toolId}: runNative failed: ${(e as Error).message}`); continue; }
    ok(job.status === 'done', `${c.toolId}: fake run not done (${job.status})`);
    const st = storedGraphs(job.id); ok(!!st && st.passes.length === sent.length, `${c.toolId}: stored passes ${st?.passes.length} vs sent ${sent.length}`);
    sent.forEach((g, k) => ok(JSON.stringify(st?.passes[k]?.graph) === JSON.stringify(g), `${c.toolId}: stored pass ${k} differs from the submitted graph`));
    const ex1 = await buildWorkflowExport(job); ok(ex1.available && ex1.source === 'submitted' && ex1.exact, `${c.toolId}: export source ${ex1.source}`);
    ex1.graphs.forEach((g, k) => assert.deepEqual(g, sent[k], `${c.toolId}: exported (submitted) pass ${k} != sent`));
    fs.rmSync(path.join(GRAPHS_DIR, `${job.id}.json`)); // an older job: no stored graph → rebuilt from the input
    const ex2 = await buildWorkflowExport(job); ok(ex2.available && ex2.source === 'rebuilt' && ex2.exact, `${c.toolId}: rebuilt source ${ex2.source} ${ex2.reason ?? ''}`);
    ok(ex2.graphs.length === sent.length, `${c.toolId}: rebuilt ${ex2.graphs.length} passes vs ${sent.length}`);
    ex2.graphs.forEach((g, k) => { try { assert.deepEqual(g, sent[k]); } catch { bad.push(`${c.toolId}: rebuilt pass ${k} != submitted graph`); } });
    if (c.toolId === 'object-swap') ok(ex2.media.some((m) => /16 fps/.test(m.what) && /^ffmpeg /.test(m.how ?? '')) && ex2.media.some((m) => m.what === 'Your upload'), 'object-swap: media notes (upload + ffmpeg prep)');
    const seed = JSON.stringify(ex2.graphs); ok(seed.includes(String(c.input.seed)) && seed.includes(c.input.prompt), `${c.toolId}: prompt/seed in the export`);
  }
  console.log(`A. runner graph == stored == rebuilt export for ${cases.length} jobs`);
}

// ---------------- HTTP server ----------------
const PORT = testPort(8981); const B = `http://localhost:${PORT}`;
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_USE_LOCAL: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_LUMA_API_KEY: '', OPENHIGGSFIELD_OPEN_WEIGHTS_ONLY: '' };
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, OPENHIGGSFIELD_MOCK_KEYS: '1', PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_MAX_QUEUED: '5000', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' }, stdio: ['ignore', 'ignore', 'inherit'], detached: true });
const j = async (u: string, init?: RequestInit) => { const r = await fetch(`${B}${u}`, init); const txt = await r.text(); let b: any = null; try { b = JSON.parse(txt); } catch { b = txt; } return { status: r.status, b, h: r.headers }; };
const fileFor = (accept = '', name = '') => /video/.test(accept) || /video|clip|source/i.test(name) && !/image|audio/.test(accept) ? [MP4, 'video/mp4'] : /audio/.test(accept) || /audio|voice|speech/i.test(name) ? [WAV, 'audio/wav'] : [PNG, 'image/png'];
const formOf = (t: any) => { const fields: Record<string, string> = { rights: '1' }; const files: [string, string, string][] = [];
  for (const inp of t.inputs ?? []) {
    if (inp.kind === 'file' && inp.required) { const [f, ty] = fileFor(inp.accept, inp.name); files.push([inp.name, f, ty]); }
    else if (inp.kind === 'text' && inp.required) fields[inp.name] = 'a calm test scene';
    else if (inp.kind === 'select' && inp.required) fields[inp.name] = String(inp.default ?? inp.options?.[0]?.value ?? t.presets?.[0]?.id ?? '');
    else if (inp.kind === 'files' && inp.name === 'refs' && /swap|motion/.test(t.id)) files.push(['refs', PNG, 'image/png']);
  }
  if (!fields.prompt) fields.prompt = 'a calm test scene'; if (t.presets?.length && !fields.types && t.id !== 'camera') fields.types = JSON.stringify([t.presets[0].id]);
  return { fields, files }; };
const submit = (t: any, extra: Record<string, string>) => { const { fields, files } = formOf(t); const fd = new FormData(); for (const [k, v] of Object.entries({ ...fields, ...extra })) fd.append(k, v);
  for (const [n, f, ty] of files) fd.append(n, new Blob([fs.readFileSync(f)], { type: ty }), path.basename(f)); return j(`/api/tools/${t.id}/jobs`, { method: 'POST', body: fd }); };
const quote = (t: any, extra: Record<string, string>) => { const { fields, files } = formOf(t); const qs = new URLSearchParams(Object.entries({ ...fields, ...extra }).filter(([k]) => k !== 'rights')); for (const [n] of files) qs.set(n, '1'); return j(`/api/tools/${t.id}/price?${qs}`); };
const waitDone = async (id: string) => { for (let i = 0; i < 200; i++) { const r = await j(`/api/jobs/${id}`); const s = (r.b?.job ?? r.b)?.status; if (s === 'done' || s === 'failed') return s; await new Promise((x) => setTimeout(x, 150)); } return 'timeout'; };
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); })); }

try {
  for (let i = 0; i < 160; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const tools: any[] = (await j('/api/tools')).b; const ci = tools.find((t) => t.id === 'create-image');

  // ---- A over HTTP
  await j('/api/me/routing', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ global: { useLocal: true } }) });
  const loc = await submit(ci, { provider: 'comfy-zimage-turbo', route: 'local:comfy-zimage-turbo', seed: '99', prompt: 'a lighthouse at dusk', types: '["generate"]' }); assert.equal(loc.status < 300, true, `local submit ${loc.status} ${JSON.stringify(loc.b).slice(0, 200)}`);
  const fal = await submit(ci, { provider: 'comfy-zimage-turbo', route: 'fal:fal-ai/z-image/turbo', seed: '99', prompt: 'a lighthouse at dusk', types: '["generate"]' });
  const rep = await submit(ci, { provider: 'api-nano-banana', route: 'replicate:google/nano-banana-2', prompt: 'a lighthouse', types: '["generate"]' });
  const par = await submit(ci, { provider: 'api-nano-banana', route: 'comfy-router:api-nano-banana', prompt: 'a lighthouse', seed: '5', types: '["generate"]' });
  for (const s of [loc, fal, rep, par]) if (s.status < 300) await waitDone(s.b.id);
  const w1 = await j(`/api/jobs/${loc.b.id}/workflow`); ok(w1.b.available && w1.b.exact && w1.b.source === 'rebuilt' && w1.b.ranOn.label === 'Your computer', `HTTP local export: ${JSON.stringify(w1.b).slice(0, 200)}`);
  const g1 = await j(`/api/jobs/${loc.b.id}/workflow?format=api`); ok(g1.status === 200 && /attachment; filename="imagination-create-image-/.test(g1.h.get('content-disposition') ?? '') && Object.values<any>(g1.b).every((n) => typeof n.class_type === 'string'), 'HTTP api download: attachment + API format');
  ok(JSON.stringify(g1.b).includes('a lighthouse at dusk') && JSON.stringify(g1.b).includes('99'), 'HTTP api download carries prompt + seed');
  if (fal.status < 300) { const w2 = await j(`/api/jobs/${fal.b.id}/workflow`); ok(w2.b.available && !w2.b.exact && w2.b.source === 'equivalent' && /This ran on fal, not a ComfyUI workflow/.test(w2.b.headline), `HTTP fal export: ${w2.b.headline}`); }
  if (rep.status < 300) { const w3 = await j(`/api/jobs/${rep.b.id}/workflow`); ok(!w3.b.available && /This ran on Replicate, not a ComfyUI workflow/.test(w3.b.reason), `HTTP replicate export: ${w3.b.reason}`);
    ok((await j(`/api/jobs/${rep.b.id}/workflow?format=api`)).status === 409, 'HTTP replicate api download → 409'); }
  if (par.status < 300) { const w4 = await j(`/api/jobs/${par.b.id}/workflow?format=api`); ok(w4.status === 200 && Object.values<any>(w4.b).some((n) => n.class_type === 'GeminiNanoBanana2'), 'HTTP partner export contains the partner node'); }
  ok((await j(`/api/jobs/${loc.b.id}/workflow?format=ui`)).status === 404, 'format=ui → 404 (API format only)');
  console.log('A. HTTP export: local, fal (equivalent), Replicate (not a workflow), partner node');

  // ---- B share cards + OG
  const id = loc.b.id;
  ok((await j(`/api/jobs/${id}/share/card`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: fs.readFileSync(PNG) })).status === 409, 'card upload before sharing → 409');
  const sh = await j(`/api/jobs/${id}/share`, { method: 'POST' }); const tok = sh.b.token; assert.ok(tok, 'share token');
  const page = await j(`/s/${tok}`); const html = String(page.b);
  for (const m of ['og:title', 'og:description', 'og:image', 'og:image:width" content="1200', 'twitter:card" content="summary_large_image', 'twitter:image', 'Made with Imagination Is All You Need · open source']) ok(html.includes(m), `share page: ${m}`);
  ok(new RegExp(`og:image" content="http://localhost:${PORT}/s/${tok}/card\\.png`).test(html), 'og:image is an absolute card URL');
  ok(!html.includes('a lighthouse at dusk'), 'share page never shows the prompt');
  const card = await fetch(`${B}/s/${tok}/card.png`); const cb = Buffer.from(await card.arrayBuffer());
  ok(card.status === 200 && card.headers.get('content-type') === 'image/png' && cb.readUInt32BE(16) === 1200 && cb.readUInt32BE(20) === 630, `server card: ${card.status} ${cb.length} B`);
  ok((await j(`/api/jobs/${id}/share/card`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: fs.readFileSync(PNG) })).status === 400, 'card upload: wrong size → 400');
  ok((await j(`/api/jobs/${id}/share/card`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: cb })).status === 200, 'card upload: 1200×630 PNG accepted');
  ok((await fetch(`${B}/s/${tok}/card.png`)).headers.get('x-card-source') === 'designed', 'uploaded card is served');
  await j(`/api/jobs/${id}/share`, { method: 'DELETE' });
  ok((await j(`/s/${tok}`)).status === 404 && (await fetch(`${B}/s/${tok}/card.png`)).status === 404, 'revoked link → 404 page + card');
  console.log('B. share page OG/X meta, server card PNG, upload validation, revoke');

  // ---- C open models only
  type Case = { t: any; engine: string; route: string | null; closedEngine: boolean };
  const closed: Case[] = []; const ALLOWED_KINDS = new Set(['local']);
  for (const t of tools) for (const p of t.providers ?? []) {
    const openEngine = p.openWeights === true;
    if (!openEngine) closed.push({ t, engine: p.id, route: null, closedEngine: true });
    for (const r of p.routes ?? []) if (!ALLOWED_KINDS.has(r.kind) && !(r.kind === 'comfy-cloud' && r.tier === 0)) closed.push({ t, engine: p.id, route: r.routeId, closedEngine: !openEngine });
  }
  assert.ok(closed.length > 50, `closed cases ${closed.length}`);
  const sanity = await quote(ci, { provider: 'api-nano-banana' }); ok(sanity.status === 200 && typeof sanity.b.credits === 'number', 'switch off: a closed model is quotable (baseline)');
  const on = await j('/api/settings/open-models', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on: true }) }); ok(on.b.on === true && on.b.locked === false, 'switch on');
  ok((await j('/api/config')).b.openWeightsOnly === true && (await j('/api/health')).b.openWeightsOnly === true, 'config + health report it');
  const before = new Set(((await j('/api/jobs?limit=5000')).b?.jobs ?? (await j('/api/jobs?limit=5000')).b ?? []).map((x: any) => x.id));
  let quoted = 0, submitted = 0;
  await pool(closed, 6, async (c) => {
    const extra: Record<string, string> = { provider: c.engine, ...(c.route ? { route: c.route } : {}) }; const tag = `${c.t.id} ${c.engine} ${c.route ?? '(auto)'}`;
    const q = await quote(c.t, extra); quoted++;
    if (q.status < 400 && typeof q.b?.credits === 'number' && q.b?.runnable !== false) bad.push(`${tag}: quotable (${q.status}, ${q.b.credits} credits on ${q.b.routeId})`);
    const s = await submit(c.t, extra); submitted++;
    if (s.status < 400) bad.push(`${tag}: submitted (${s.status}, job ${s.b?.id} on ${s.b?.route})`);
  });
  const after: any[] = (await j('/api/jobs?limit=5000')).b?.jobs ?? []; ok(after.filter((x) => !before.has(x.id)).length === 0, `no new jobs while open models only (${after.filter((x) => !before.has(x.id)).length})`);
  const tools2: any[] = (await j('/api/tools')).b;
  for (const t of tools2) { for (const p of t.providers ?? []) ok(p.openWeights === true, `listing: ${t.id} ${p.id} is not open`);
    for (const m of t.models ?? []) { ok(m.runsOn.length > 0, `listing: ${t.id} ${m.key} has no place to run`); for (const r of m.runsOn) ok(r.id === 'local' || r.id === 'comfy-cloud' && !(r.comfyVariants ?? []).includes('partner'), `listing: ${t.id} ${m.key} runs on ${r.id}`); } }
  const pr = (await j('/api/pricing')).b; ok(pr.hosted.every((h: any) => /^cloud-/.test(h.providerId)), `pricing hosted rows: ${pr.hosted.map((h: any) => h.providerId)}`);
  const sum = (await j('/api/settings/open-models')).b; ok(sum.toolsAvailable >= 30, `tools still available: ${sum.toolsAvailable}/${sum.tools}`);
  // an open model still runs
  const openRun = await submit(ci, { provider: 'comfy-zimage-turbo', prompt: 'still works', types: '["generate"]' }); ok(openRun.status < 300 && /^local:/.test(openRun.b.route), `open model still runs: ${openRun.status} ${openRun.b?.route}`);
  const off = await j('/api/settings/open-models', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on: false }) }); ok(off.b.on === false, 'switch off again');
  ok((await quote(ci, { provider: 'api-nano-banana' })).status === 200, 'switch off: closed model quotable again');
  console.log(`C. open models only: ${closed.length} closed engine/route cases, ${quoted} quotes and ${submitted} submits refused; listings open only (${sum.toolsAvailable}/${sum.tools} tools available)`);
} catch (e) { fail++; console.error('FAIL', e); } finally { try { process.kill(-srv.pid!); } catch { /* */ } for (const d of [D, DIN]) fs.rmSync(d, { recursive: true, force: true }); }
if (bad.length) { console.error(`${bad.length} problems:\n  ${bad.slice(0, 60).join('\n  ')}`); fail++; }
console.log(fail ? 'FAIL' : 'PASS'); process.exit(fail ? 1 : 0);
