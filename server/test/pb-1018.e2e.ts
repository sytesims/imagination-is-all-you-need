// E2E (own mock servers :8951 normal, :8952 open-weights-only; temp data dirs, no keys). Oct 18 PB batch: open-weights markers
// (/api/models + /api/routes openWeights = /api/tools providers[].openWeights; cloud-h3-wf true, cloud-h3 false), /api/config openWeightsOnly,
// camera moves 88 + aliases, mask preview (GET + mock POST, free), Extend backward accepted (silent), Remove BG transparent → .webm,
// Object Swap maskGrow / firstFrame, route fields runnable/demo/pinned. Run: npx tsx test/pb-1018.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' };
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'pb18-'));
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
const REF = path.join(import.meta.dirname, 'fixtures/ref-512.png');
const KEY = path.join(D, 'key-1280.png'); ff('-f', 'lavfi', '-i', 'testsrc2=size=1280x720', '-frames:v', '1', KEY);
const n = boot(testPort(8951)), o = boot(testPort(8952), { OPENHIGGSFIELD_OPEN_WEIGHTS_ONLY: '1' }); const N = api(testPort(8951)), O = api(testPort(8952));
try {
  await N.ready(); await O.ready();
  // ---- open-weights markers ----
  { const cfgN = await N.get('/api/config'), cfgO = await O.get('/api/config'); assert.equal(cfgN.openWeightsOnly, false); assert.equal(cfgO.openWeightsOnly, true);
    const tools = await N.get('/api/tools'); const list = Array.isArray(tools) ? tools : tools.tools; const tp = Object.fromEntries(list.find((t: any) => t.id === 'h3-video').providers.map((p: any) => [p.id, p.openWeights]));
    assert.equal(tp['cloud-h3-wf'], true); assert.equal(tp['cloud-h3'], false); assert.equal(tp['comfy-h3'], true);
    const ms = (await N.get('/api/models?toolId=h3-video')).groups.flatMap((g: any) => g.models); const mo = Object.fromEntries(ms.map((m: any) => [m.id, m.openWeights]));
    for (const id of Object.keys(tp)) if (id in mo) assert.equal(mo[id], tp[id], `/api/models ${id} openWeights = /api/tools`);
    for (const [m, want] of [['cloud-h3-wf', true], ['cloud-h3', false], ['comfy-h3', true]] as const) { const r = (await N.get(`/api/routes?toolId=h3-video&modelId=${m}`)).routes[0].routes;
      assert.ok(r.length && r.every((x: any) => x.openWeights === want), `${m} routes openWeights ${want}`); assert.ok(r.every((x: any) => 'runnable' in x && 'demo' in x && 'pinned' in x)); }
    const oh = (await O.get('/api/tools')); const ol = (Array.isArray(oh) ? oh : oh.tools).find((t: any) => t.id === 'h3-video').providers.map((p: any) => p.id);
    assert.ok(ol.includes('cloud-h3-wf') && !ol.includes('cloud-h3') && !ol.includes('api-minimax-h3') && !ol.some((p: string) => p.startsWith('router-')), JSON.stringify(ol));
    ok(`openWeights: /api/config openWeightsOnly; /api/tools = /api/models = /api/routes (cloud-h3-wf true, cloud-h3 false); open-weights-only shows ${ol.join(',')}`); }
  // ---- camera 88 + aliases ----
  { const t = (await N.get('/api/tools')); const cam = (Array.isArray(t) ? t : t.tools).find((x: any) => x.id === 'camera'); assert.equal(cam.presets.length, 82); assert.ok(cam.app.moveAliases && Object.keys(cam.app.moveAliases).length >= 6); ok('camera 82 moves + moveAliases'); }
  // ---- mask preview ----
  { const g = await N.get('/api/tools/object-swap/mask-preview'); assert.equal(g.credits, 0); assert.equal(g.maskGrow.loose, 40);
    const p = await N.post('/api/tools/object-swap/mask-preview', { swapType: 'object', maskMode: 'point', point: '0.5,0.5', maskGrow: 'loose' }, [['video', MP4, 'video/mp4']]);
    assert.equal(p.status, 200, JSON.stringify(p.body)); assert.equal(p.body.credits, 0); assert.ok(p.body.maskUrl && p.body.bboxes.length); assert.equal((await fetch(N.B + p.body.maskUrl)).status, 200);
    const e = await N.post('/api/tools/object-swap/mask-preview', {}); assert.equal(e.status, 400); ok(`mask preview: GET free, POST mock ${p.body.width}×${p.body.height} grow ${p.body.growPx}px, empty → 400`); }
  // ---- Extend backward ----
  { const r = await N.post('/api/tools/h3-extend/jobs', { direction: 'backward', prompt: 'x', rights: '1' }, [['video', MP4, 'video/mp4']]); assert.equal(r.status, 200, JSON.stringify(r.body));
    const j = await N.until(r.body.id); assert.equal(j.status, 'done', JSON.stringify(j.error)); assert.equal(j.input?.reverseOutput ?? true, true); ok('Extend backward accepted (reversed lead-in, silent)'); }
  // ---- Remove BG transparent → webm ----
  { const r = await N.post('/api/tools/remove-bg/jobs', { types: '["transparent"]', rights: '1' }, [['video', MP4, 'video/mp4']]); assert.equal(r.status, 200, JSON.stringify(r.body));
    const j = await N.until(r.body.id); assert.equal(j.status, 'done', JSON.stringify(j.error)); const u = j.outputs?.[0]?.url ?? j.resultUrl; assert.match(u, /\.webm$/, u);
    const th = await fetch(`${N.B}/api/media/thumb?url=${encodeURIComponent(u)}`); assert.equal(th.status, 200); assert.match(th.headers.get('content-type') ?? '', /png/, 'alpha WebM thumb is a PNG');
    const tp = path.join(D, 'thumb.png'); fs.writeFileSync(tp, Buffer.from(await th.arrayBuffer())); const pix = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=pix_fmt', '-of', 'csv=p=0', tp]).toString().trim(); assert.match(pix, /rgba|ya8|pal8/, pix);
    ok(`Remove BG transparent → ${path.basename(u)}; thumb PNG ${pix} (alpha kept)`); }
  // ---- Object Swap maskGrow / firstFrame ----
  { const bad = await N.post('/api/tools/object-swap/jobs', { maskGrow: 'huge', rights: '1', prompt: 'x' }, [['video', MP4, 'video/mp4'], ['refs', REF, 'image/png']]); assert.equal(bad.status, 400); assert.equal(bad.body.issues?.[0]?.field, 'maskGrow');
    const r = await N.post('/api/tools/object-swap/jobs', { swapType: 'object', maskMode: 'text', maskPrompt: 'mug', maskGrow: 'loose', firstFrameMode: 'upload', rights: '1' }, [['video', MP4, 'video/mp4'], ['refs', REF, 'image/png'], ['firstFrame', REF, 'image/png']]);
    assert.equal(r.status, 200, JSON.stringify(r.body)); const j = await N.get(`/api/jobs/${r.body.id}`); assert.equal(j.input?.maskGrow ?? 'loose', 'loose');
    assert.ok(JSON.stringify(r.body.warnings ?? j.warnings ?? []).includes('first frame'), 'firstFrame warning'); ok('Object Swap: maskGrow validated + stored, firstFrame warned');
    const ts = await N.get('/api/tools'); const os = (Array.isArray(ts) ? ts : ts.tools).find((t: any) => t.id === 'object-swap').providers.find((p: any) => p.id === 'comfy-open');
    assert.equal(os.name, 'Wan 2.2 Animate 14B'); assert.equal(os.openWeights, true);
    const r2 = await N.post('/api/tools/object-swap/jobs', { swapType: 'object', maskMode: 'text', maskPrompt: 'mug', rights: '1', provider: 'comfy-open', route: 'local:comfy-open' }, [['video', MP4, 'video/mp4'], ['refs', REF, 'image/png']]);
    assert.equal(r2.status, 200, JSON.stringify(r2.body)); assert.equal((await N.get(`/api/jobs/${r2.body.id}`)).model, 'Wan 2.2 Animate 14B');
    ok('Object Swap comfy-open label = Wan 2.2 Animate 14B (picker + job), openWeights kept'); }
  // ---- quote = charge when GET ?types=edit is a plain string (demo mode, no keys): same route + credits as the submitted job ----
  { const q = await N.get('/api/tools/create-image/price?types=edit&provider=api-nano-banana&resolution=720p');
    const r = await N.post('/api/tools/create-image/jobs', { types: 'edit', provider: 'api-nano-banana', resolution: '720p', prompt: 'make the sky orange' }, [['image', REF, 'image/png']]);
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.cost, q.credits, `quote ${q.credits} ${q.route} vs charge ${r.body.cost} ${r.body.route}`); assert.equal(r.body.route, q.route);
    const qa = await N.get('/api/tools/create-image/price?types=%5B%22edit%22%5D&provider=api-nano-banana&resolution=720p'); assert.equal(qa.credits, q.credits);
    ok(`quote = charge for types=edit: ${q.credits} credits via ${q.route}`); }
  // ---- LICENSES: 'Runs on' (where it runs, not the licence) ----
  { const L = (await N.get('/api/licenses')).models as any[]; const wf = L.find((m) => m.providerId === 'cloud-h3-wf'), ch = L.find((m) => m.providerId === 'cloud-h3');
    assert.equal(wf.runsOn, 'Comfy Cloud · open workflow'); assert.equal(wf.commercial, 'restricted', 'open graph on Cloud: weight licence, not provider-terms'); assert.equal(L.find((m) => m.providerId === 'cloud-ltx-camera').commercial, 'restricted'); assert.equal(ch.runsOn, 'Comfy Cloud · API nodes'); assert.ok(L.every((m) => typeof m.runsOn === 'string' && m.runsOn));
    const md = fs.readFileSync(path.join(ROOT, '..', 'LICENSES.md'), 'utf8'); assert.match(md, /\| Model \| Runs on \| Licence \|/); assert.match(md, /\| MiniMax H3 · Comfy Cloud workflow \| Comfy Cloud · open workflow \|/); assert.match(md, /"Runs on" says where the model runs/);
    ok('LICENSES Runs on: cloud-h3-wf = Comfy Cloud · open workflow, footnote present'); }
  // ---- H3 720p → 768p mapping (cloud-h3-wf has 768p/480p): quote = charge, note on both ----
  { const q = await N.get('/api/tools/h3-video/price?provider=cloud-h3-wf&seconds=5&resolution=720p'); assert.equal(q.demo ? q.listCredits : q.credits, 40, JSON.stringify(q)); assert.equal(q.resolutionMapped?.to, '768p'); assert.equal(q.resolution, '768p');
    const q768 = await N.get('/api/tools/h3-video/price?provider=cloud-h3-wf&seconds=5&resolution=768p'); assert.equal(q768.credits, q.credits); assert.equal(q768.resolutionMapped, undefined);
    const r = await N.post('/api/tools/h3-video/jobs', { provider: 'cloud-h3-wf', prompt: 'a lighthouse at dusk', duration: '5', resolution: '720p', types: '["t2v"]' }); assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.cost, q.credits, 'quote = charge after mapping'); assert.ok((r.body.warnings ?? []).some((w: string) => /720p was mapped to 768p/.test(w)), JSON.stringify(r.body.warnings));
    const j = await N.get(`/api/jobs/${r.body.id}`); assert.equal(j.input.resolution, '768p');
    // D5 (2026-10-28): a tier the model lacks is made at the nearest one, with a note (never refused): 1080p → 768p, the same price as 720p → 768p
    const big = await N.get('/api/tools/h3-video/price?provider=cloud-h3-wf&seconds=5&resolution=1080p'); assert.notEqual(big.credits, null, JSON.stringify(big).slice(0, 600)); assert.equal(big.listCredits ?? big.credits, q.listCredits ?? q.credits);
    ok(`cloud-h3-wf 720p → 768p: quote ${q.credits} = charge ${r.body.cost}, note in quote + job warnings; 1080p → 768p too (D5)`); }
  // ---- cloud-ltx-camera: Comfy Cloud twin of camera-ltx-api.json (open weights, LTX presets only, placeholder estimated price, LTX2 ETA anchor) ----
  { const cam = (await N.get('/api/tools')); const c = (Array.isArray(cam) ? cam : cam.tools).find((t: any) => t.id === 'camera'); const pv = c.providers.find((p: any) => p.id === 'cloud-ltx-camera');
    assert.ok(pv && pv.openWeights === true, JSON.stringify(pv)); const ltx = c.presets.find((p: any) => p.id === 'ltx-dolly-in'); assert.ok(ltx.providers.includes('cloud-ltx-camera'));
    assert.ok(!c.presets.find((p: any) => p.id === 'push-in' || p.id === 'dolly-in')?.providers?.includes('cloud-ltx-camera'), 'Wan/prompt presets not on the LTX twin');
    assert.equal(c.etaByPresetGroup['LTX camera'].anchor, 'LTX2'); assert.equal(c.etaByProvider['cloud-ltx-camera'].anchor, 'LTX2'); assert.notDeepEqual(c.etaByPresetGroup['LTX camera'].eta.byGpu, c.eta.byGpu, 'LTX presets do not use the WAN_14B anchor');
    const oc = (await O.get('/api/tools')); const ocam = (Array.isArray(oc) ? oc : oc.tools).find((t: any) => t.id === 'camera'); assert.ok(ocam.providers.some((p: any) => p.id === 'cloud-ltx-camera'), 'visible in open-weights-only');
    const rt = (await N.get('/api/routes?toolId=camera&modelId=cloud-ltx-camera')).routes[0].routes; assert.equal(rt[0].routeId, 'comfy-cloud:cloud-ltx-camera'); assert.equal(rt[0].openWeights, true);
    const q = await N.get('/api/tools/camera/price?provider=cloud-ltx-camera&types=%5B%22ltx-dolly-in%22%5D&duration=5&resolution=720p'); assert.ok((q.demo ? q.listCredits : q.credits) > 0, JSON.stringify(q)); assert.equal(q.estimated ?? q.priceEstimated ?? true, true);
    const r = await N.post('/api/tools/camera/jobs', { rights: '1', types: '["ltx-dolly-in"]', provider: 'cloud-ltx-camera', prompt: 'a quiet room', duration: '5', resolution: '720p' }, [['image', KEY, 'image/png']]);
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.cost, q.credits, `quote ${q.credits} = charge ${r.body.cost}`); const j = await N.until(r.body.id); assert.equal(j.status, 'done', JSON.stringify(j.error));
    const w = await N.post('/api/tools/camera/jobs', { rights: '1', types: '["push-in"]', provider: 'cloud-ltx-camera', prompt: 'x' }, [['image', KEY, 'image/png']]); assert.equal(w.status, 400, 'Wan preset refused on the LTX twin');
    ok(`cloud-ltx-camera: open weights (shown in OW-only), route comfy-cloud, quote ${q.credits} = charge, mock run done, LTX2 anchor for LTX presets`); }
  console.log('PASS pb-1018');
} finally { stop(n); stop(o); }
