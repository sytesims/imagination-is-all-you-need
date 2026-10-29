// MODEL-ROUTE-SPEC step 2 over HTTP (mock backend, no keys, temp data dir, port 8977):
//  1. quote route == submit route for EVERY tool × model × runOn (none, auto and each run-on the model lists), with quotedRouteId /
//     quotedCredits (a mismatch is a 409 route_changed); model errors (run_on_unavailable…) are the same 400 on both; the job stores modelKey/runOn.
//  2. equivalence with the old fields: model=<key> (no split) quotes the same route and credits as provider=<its engine>; model=<old engine id>
//     quotes exactly like provider=<id>.
//  3. v2 routing prefs: PUT/GET perTool, old perModel pins shown as migrated 'legacy' rows, no cross-tool leak, validation.
//  4. an old job + spend row written before v2 (no modelKey / runOn) get them derived on read.
// Run: npx tsx test/model-runon.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import Database from 'better-sqlite3';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'mro-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_USE_LOCAL: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_LUMA_API_KEY: '' };
// 4. seed a pre-v2 job + spend row (no modelKey / runOn) before the server opens the DB
{ const db = new Database(path.join(D, 'openhiggsfield.db')); for (const t of ['jobs', 'spend']) db.exec(`CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
  const at = Date.now() - 60_000;
  db.prepare('INSERT INTO jobs (id, data) VALUES (?, ?)').run('oldjob01', JSON.stringify({ id: 'oldjob01', toolId: 'camera', provider: 'comfy-open', status: 'done', stage: 'done', progress: 100, queuePos: 0, eta: 0, resultUrl: null, outputs: [], error: null, warnings: [], input: { types: ['ltx-dolly-in'], prompt: 'old' }, createdAt: at, finishedAt: at + 1000, route: 'comfy-cloud:cloud-ltx-camera', cost: 0 }));
  db.prepare('INSERT INTO spend (id, data) VALUES (?, ?)').run('oldjob01', JSON.stringify({ id: 'oldjob01', jobId: 'oldjob01', createdAt: at, finishedAt: at + 1000, toolId: 'camera', model: 'comfy-open', modelName: null, route: 'comfy-cloud:cloud-ltx-camera', routeKind: 'comfy-cloud', billedTo: 'comfy', estUsd: 0, estUnits: null, unitLabel: null, actualUsd: null, actualSource: null, status: 'done', started: true, failureRule: 'may-charge', demo: true, mode: 'own-accounts', credits: 0 }));
  db.close(); }
const PORT = testPort(8977); const B = `http://localhost:${PORT}`;
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_MAX_QUEUED: '2000', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_MOCK_RENDER: 'copy' /* routes + prices only: video samples copied, not encoded (CI runners have 2 cores) */ }, stdio: ['ignore', 'ignore', 'inherit'], detached: true });
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a]);
const MP4 = path.join(D, 'clip.mp4'); ff('-f', 'lavfi', '-i', 'testsrc2=size=854x480:rate=24', '-f', 'lavfi', '-i', 'sine=d=4', '-t', '4', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', MP4);
const PNG = path.join(D, 'img.png'); ff('-f', 'lavfi', '-i', 'testsrc2=size=768x768', '-frames:v', '1', PNG);
const WAV = path.join(D, 'a.wav'); ff('-f', 'lavfi', '-i', 'sine=d=4', '-ar', '44100', WAV);
const fileFor = (accept = '', name = '') => /video/.test(accept) || /video|clip|source/i.test(name) && !/image|audio/.test(accept) ? [MP4, 'video/mp4'] : /audio/.test(accept) || /audio|voice|speech/i.test(name) ? [WAV, 'audio/wav'] : [PNG, 'image/png'];
const MODEL_CODES = new Set(['unknown_model', 'invalid_run_on', 'run_on_unavailable', 'route_not_in_model', 'model_provider_mismatch', 'preset_model_mismatch']);
const j = async (u: string, init?: RequestInit) => { const r = await fetch(`${B}${u}`, init); let b: any = null; try { b = await r.json(); } catch { /* */ } return { status: r.status, b }; };
const put = (body: unknown) => j('/api/me/routing', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); })); }
let fail = 0; const bad: string[] = []; const t0 = Date.now();
try {
  for (let i = 0; i < 160; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const tools: any[] = (await j('/api/tools')).b;
  // ---- 1 + 2: every tool × model × runOn
  type Case = { t: any; fields: Record<string, string>; files: [string, string, string][]; m: any; ro: string | null };
  const cases: Case[] = []; const equiv: { t: any; fields: Record<string, string>; files: [string, string, string][]; a: Record<string, string>; b: Record<string, string>; what: string }[] = [];
  for (const t of tools) {
    const fields: Record<string, string> = { rights: '1' }; const files: [string, string, string][] = [];
    for (const inp of t.inputs ?? []) {
      if (inp.kind === 'file' && inp.required) { const [f, ty] = fileFor(inp.accept, inp.name); files.push([inp.name, f, ty]); }
      else if (inp.kind === 'text' && inp.required) fields[inp.name] = 'a calm test scene';
      else if (inp.kind === 'select' && inp.required) fields[inp.name] = String(inp.default ?? inp.options?.[0]?.value ?? t.presets?.[0]?.id ?? '');
      else if (inp.kind === 'files' && inp.name === 'refs' && /swap|motion/.test(t.id)) files.push(['refs', PNG, 'image/png']);
      else if (inp.kind === 'file' && inp.name === 'mask') files.push(['mask', PNG, 'image/png']);
    }
    if (!fields.prompt) fields.prompt = 'a calm test scene';
    if (t.presets?.length && !fields.types && t.id !== 'camera') fields.types = JSON.stringify([t.presets[0].id]); // Camera: the model picks its own first move
    for (const inp of t.inputs ?? []) if (inp.kind === 'file' && !inp.required && /^(image|video)$/.test(inp.name) && !files.some(([n]) => n === inp.name)) {
      const need = /image/.test(inp.accept ?? '') ? 'image' : 'video'; if ((t.app?.input ?? '').includes(need) || /^app-/.test(t.id) || t.id === 'camera') { const [f, ty] = fileFor(inp.accept, inp.name); files.push([inp.name, f, ty]); } }
    assert.ok(Array.isArray(t.models) && t.models.length, `${t.id}: models[]`);
    for (const m of t.models) {
      for (const ro of [null, 'auto', ...m.runsOn.map((r: any) => r.id)]) cases.push({ t, fields, files, m, ro });
      for (const e of m.engines) equiv.push({ t, fields, files, a: { model: e }, b: { provider: e }, what: `model=${e} ≡ provider=${e}` });
    }
  }
  const quote = async (t: any, fields: Record<string, string>, files: [string, string, string][], extra: Record<string, string>) => {
    const qs = new URLSearchParams(Object.entries({ ...fields, ...extra }).filter(([k]) => k !== 'rights')); for (const [n] of files) qs.set(n, '1'); return j(`/api/tools/${t.id}/price?${qs}`); };
  let quoted = 0, ran = 0, sameErr = 0, skipped = 0;
  await pool(cases, 6, async ({ t, fields, files, m, ro }) => {
    const extra: Record<string, string> = { model: m.key, ...(ro ? { runOn: ro } : {}) }; const tag = `${t.id} ${m.key} runOn=${ro ?? '-'}`;
    const q = await quote(t, fields, files, extra); quoted++;
    const fd = new FormData(); const qok = q.status < 300 && typeof q.b?.credits === 'number' && q.b?.routeId;
    for (const [k, v] of Object.entries({ ...fields, ...extra, ...(qok ? { quotedRouteId: q.b.routeId, quotedCredits: String(q.b.credits) } : {}) })) fd.append(k, v);
    for (const [n, f, ty] of files) fd.append(n, new Blob([fs.readFileSync(f)], { type: ty }), path.basename(f));
    const s = await j(`/api/tools/${t.id}/jobs`, { method: 'POST', body: fd });
    if (q.status >= 400 && MODEL_CODES.has(q.b?.code)) { if (s.status !== q.status || s.b?.code !== q.b.code) bad.push(`${tag}: quote ${q.status} ${q.b.code} but submit ${s.status} ${s.b?.code ?? s.b?.error}`); else sameErr++; return; }
    if (s.status === 409 && s.b?.error === 'route_changed') { bad.push(`${tag}: quote ${q.b?.routeId}/${q.b?.credits} → submit now ${s.b.quote?.routeId}/${s.b.quote?.credits}`); return; }
    if (!qok) { skipped++; return; }
    if (ro && ro !== 'auto' && q.b.runOn !== ro && q.b.runnable !== false) bad.push(`${tag}: quote ran on ${q.b.runOn} (${q.b.routeId})`);
    if (q.b.modelKey !== m.key) bad.push(`${tag}: quote modelKey ${q.b.modelKey}`);
    if (s.status === 200) { ran++; if (s.b.route !== q.b.routeId || s.b.cost !== q.b.credits) bad.push(`${tag}: 200 but ${s.b.route}/${s.b.cost} vs quote ${q.b.routeId}/${q.b.credits}`);
      const job = (await j(`/api/jobs/${s.b.id}`)).b; if (job?.modelKey !== m.key || job?.runOn !== q.b.runOn) bad.push(`${tag}: job modelKey/runOn ${job?.modelKey}/${job?.runOn} vs ${m.key}/${q.b.runOn}`); }
    else if (s.b?.routeId && s.b.routeId !== q.b.routeId) bad.push(`${tag}: submit ${s.status} on ${s.b.routeId} vs quote ${q.b.routeId}`);
    else skipped++;
  });
  console.log(`1. ${cases.length} tool×model×runOn cases: ${ran} ran with quote route = submit route, ${sameErr} same model error on both, ${skipped} not runnable without keys (same answer checked where a route was named)`);
  // 2. model=<key> (unsplit) ≡ provider=<its engine>; model=<old id> ≡ provider=<old id>. A split engine (one old id, several models on the tool:
  //    Upscale comfy-seedvr2 = SeedVR2 on fal + SeedVR2 3B locally) is the old id of ONE of them (the registry alias); the others ≡ provider=<engine>&runOn=<their place>.
  const aliases = (await j('/api/models/registry')).b.aliases;
  for (const t of tools) for (const m of t.models) if (m.engines.length && !/camera|remove-bg|h3-extend/.test(t.app?.gallery?.base ?? t.id)) {
    const al = aliases[m.primaryEngine]?.[t.id]?.model; const place = al && al !== m.key && m.runsOn.length === 1 ? m.runsOn[0].id : null;
    const fields: Record<string, string> = { prompt: 'a calm test scene' }; const b = { provider: m.primaryEngine, ...(place ? { runOn: place } : {}) };
    equiv.push({ t, fields, files: [], a: { model: m.key }, b, what: `model=${m.key} ≡ provider=${m.primaryEngine}${place ? `&runOn=${place}` : ''}` }); }
  let eq = 0; await pool(equiv, 6, async (e) => { const [a, b] = await Promise.all([quote(e.t, e.fields, e.files, e.a), quote(e.t, e.fields, e.files, e.b)]);
    if (a.status !== b.status || a.b?.routeId !== b.b?.routeId || a.b?.credits !== b.b?.credits) bad.push(`${e.t.id} ${e.what}: ${a.status} ${a.b?.routeId}/${a.b?.credits} vs ${b.status} ${b.b?.routeId}/${b.b?.credits}`); else eq++; });
  console.log(`2. ${eq}/${equiv.length} old-field equivalences hold`);
  // ---- 3. v2 routing prefs over HTTP
  { assert.equal((await put({ perTool: { camera: { 'wan-2.2-fun-camera-14b': { runOn: 'gpu' } } } })).status, 200);
    const g = (await j('/api/me/routing')).b; assert.equal(g.v, 2); assert.equal(g.perTool.camera['wan-2.2-fun-camera-14b'].runOn, 'local'); assert.equal(g.perTool.camera['wan-2.2-fun-camera-14b'].source, 'tool'); assert.deepEqual(g.perModel, {});
    const qc = (await j('/api/tools/camera/price?model=wan-2.2-fun-camera-14b&image=1')).b; assert.equal(qc.routing?.mode, 'pinned'); assert.equal(qc.routeId, 'local:comfy-open'); assert.equal(qc.runOn, 'local');
    const qo = (await j('/api/tools/object-swap/price?provider=comfy-open&seconds=4')).b; assert.notEqual(qo.routing?.mode, 'pinned', 'Object Swap is not pinned by a Camera choice');
    const rs = (await j('/api/routes?toolId=restyle&modelId=comfy-open')).b; assert.notEqual(rs.routes[0].routing.mode, 'pinned');
    assert.equal((await put({ perTool: { camera: { 'wan-2.2-fun-camera-14b': { runOn: 'fal' } } } })).b.issues[0].code, 'run_on_unavailable');
    assert.equal((await put({ perTool: { camera: { 'nope': { runOn: 'auto' } } } })).b.issues[0].code, 'unknown_model');
    assert.equal((await put({ perTool: { 'h3-video': { 'minimax-h3': { runOn: 'comfy-cloud', route: 'fal:minimax/h3/text-to-video' } } } })).b.issues[0].code, 'route_run_on_mismatch');
    const viaEngine = await put({ perTool: { 'h3-video': { 'cloud-h3-wf': { runOn: 'comfy' } } } }); assert.equal(viaEngine.status, 200); assert.ok(viaEngine.b.perTool['h3-video']['minimax-h3'], 'an old engine id as key is stored under its model');
    // old v1 write still works and is shown as migrated rows where it applies
    const v1 = await put({ perTool: {}, perModel: { 'comfy-open': { route: 'comfy-cloud:cloud-ltx-camera' } } }); assert.equal(v1.status, 200);
    assert.equal(v1.b.perTool.camera['ltx-2-19b'].source, 'legacy'); assert.equal(v1.b.perTool['object-swap'], undefined, 'the twin route pin does not leak to Object Swap');
    const qo2 = (await j('/api/tools/object-swap/price?provider=comfy-open&seconds=4')).b; assert.ok(!qo2.fallback || qo2.fallback.fallbackReason?.code !== 'pin_invalid', 'no stale-pin notice on Object Swap');
    assert.equal((await put({ perModel: {}, perTool: {} })).status, 200); }
  // ---- 4. a pre-v2 job and spend row
  { const oj = (await j('/api/jobs/oldjob01')).b; assert.equal(oj.modelKey, 'ltx-2-19b'); assert.equal(oj.runOn, 'comfy-cloud'); assert.equal(oj.runOnLabel, 'Comfy Cloud');
    const sp = (await j(`/api/spend?tool=camera&limit=200&to=${Date.now() - 45_000}`)).b; const row = sp.items.find((r: any) => r.id === 'oldjob01'); assert.equal(row?.modelKey, 'ltx-2-19b'); assert.equal(row?.runOn, 'comfy-cloud');
    const sp2 = (await j('/api/spend?tool=h3-video&limit=5')).b; assert.ok(sp2.items.length && sp2.items.every((r: any) => ['minimax-h3', 'seedance-2.0', 'veo-3.1', 'kling-v3', 'ltx-2.5-pro', 'ltx-2.5-fast', 'ltx-2.3-fast', 'flux-3-video', 'seedance-2.5', 'seedance-2.0-fast', 'seedance-2.0-mini', 'wan-2.2-ti2v-5b' /* local Wan 2.2 5B route, 2026-10-24 */, 'ltx-2.5-22b' /* local LTX-2.5 22B route, 2026-10-25 */, 'wan-3.0', 'veo-3.1-fast' /* Comfy Router video models, 2026-10-25 */].includes(r.modelKey)), `new spend rows carry modelKey: ${JSON.stringify(sp2.items.map((r: any) => r.modelKey))}`); }
  // registry + resolver endpoints
  { const reg = (await j('/api/models/registry')).b; assert.ok(reg.models.length > 40 && reg.aliases['comfy-open'].camera.model === 'wan-2.2-fun-camera-14b' && reg.aliases['api-minimax-h3']['h3-video'].model === 'minimax-h3');
    assert.equal((await j('/api/models/resolve?toolId=h3-video&model=cloud-h3-wf')).b.runOn, 'comfy-cloud'); assert.equal((await j('/api/models/resolve?model=nano-banana-2')).b.toolId, 'create-image');
    assert.equal((await j('/api/models/resolve?toolId=h3-video&model=nope')).status, 404);
    const mq = (await j('/api/models/quote?model=nano-banana-2&runOn=fal')).b; assert.equal(mq.modelKey, 'nano-banana-2'); assert.equal(mq.runOn, 'fal');
    const pa = (await j('/api/price?model=minimax-h3&runOn=replicate&mode=t2v')).b; assert.equal(pa.toolId, 'h3-video'); assert.equal(pa.runOn, 'replicate'); }
} catch (e) { fail++; console.error('FAIL', e); } finally { try { process.kill(-srv.pid!); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) /* the killed server may still be flushing its data dir */; }
if (bad.length) { console.error(bad.slice(0, 60).join('\n')); console.error(`${bad.length} mismatches`); fail++; }
console.log(`model-runon: ${fail ? 'FAILED' : 'all checks passed'} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(fail ? 1 : 0);
