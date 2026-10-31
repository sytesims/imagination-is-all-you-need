// Run on without Auto (2026-10-22), over HTTP on own mock servers (temp data dirs, ports 8961 / 8962):
//  1. pre-selection order (user decision 2026-10-22): Comfy → a connected other API → Local (on, files here; wins only when it is the only
//     ready place); nothing ready → NOTHING is pre-selected (never a download or a key place): models[].setup / quote.setupOptions list every
//     place in that order with its one action, the submit is refused and nothing is charged; a GPU that isn't ready is never "Free";
//  2. the listing's pre-selection (models[].preselect) = the quote's place (no runOn) = the quote with the legacy runOn "auto", and the
//     submit's reply names the same place (runOn + runOnLabel);
//  3. a saved per-model choice persists and never switches on its own (a ready GPU / fal doesn't take over; a broken place says its fix);
//  4. no automatic fallback: a failed run stays failed on its place and lists tryOn (other ready places, priced);
//  5. "Try on <place>" (POST /api/jobs/:id/retry {runOn}) re-runs there, pinned, no fallback; allowFallback=1 on a request still opts in.
// Run: npx tsx test/runon-preselect.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_USE_LOCAL: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_LUMA_API_KEY: '' };
const boot = (port: number, extra: Record<string, string> = {}) => spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'rop-')), OPENHIGGSFIELD_ENV_FILE: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rope-')), 'x.env'),
  OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '80', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', ...extra }, stdio: 'ignore', detached: true });
const stop = (p: ChildProcess) => { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } };
const api = (port: number) => { const B = `http://localhost:${port}`;
  const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
  const send = async (m: string, u: string, b: unknown) => { const r = await fetch(B + u, { method: m, headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json() as any }; };
  const job = async (f: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries({ prompt: 'a lighthouse at dusk', rights: '1', types: '["generate"]', ...f })) fd.append(k, v); const r = await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
  const until = async (id: string) => { for (let i = 0; i < 300; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'needs_decision', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout ' + id); };
  const ready = async () => { for (let i = 0; i < 160; i++) { try { if ((await fetch(`${B}/api/health`)).ok) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); } throw new Error(`server ${port} did not start`); };
  const models = async () => ((await get('/api/tools')) as any[]).find((t) => t.id === 'create-image').models as any[];
  const model = async (key: string) => (await models()).find((m) => m.key === key);
  const quote = (key: string, extra = '') => get(`/api/models/quote?toolId=create-image&model=${key}${extra}`);
  const global = (g: Record<string, unknown>) => send('PUT', '/api/me/routing', { global: g });
  return { get, send, job, until, ready, models, model, quote, global }; };
const ok = (m: string) => console.log('ok ' + m);
const EMPTY_MODELS = fs.mkdtempSync(path.join(os.tmpdir(), 'rop-models-'));
const S1 = boot(testPort(8961), { OPENHIGGSFIELD_FAL_KEY: 'test-not-a-real-key' });
const S2 = boot(testPort(8962), { OPENHIGGSFIELD_DEMO_AUTO: '0', OPENHIGGSFIELD_ENFORCE_WEIGHTS: '1', OPENHIGGSFIELD_COMFY_MODELS_DIR: EMPTY_MODELS, OPENHIGGSFIELD_DISK_FREE_GB: '500' /* hermetic: the mock disk has room for every download (this machine's free space would turn 'download' into not_enough_disk) */ });
try {
  const a = api(testPort(8961)), b = api(testPort(8962)); await Promise.all([a.ready(), b.ready()]);
  // every create-image model: listing pre-selection = quote place = quote with runOn=auto (the legacy value) = what a submit names
  const agree = async (s: ReturnType<typeof api>, label: string) => { let n = 0;
    for (const m of await s.models()) { const q = await s.quote(m.key); const qa = await s.quote(m.key, '&runOn=auto'); if (!m.preselect) { assert.ok(!q.runOn || q.runnable === false, `${label} ${m.key}: no pre-selection but the quote runs on ${q.runOn}`); continue; }
      assert.equal(q.runOn, m.preselect.runOn, `${label} ${m.key}: listing pre-selects ${m.preselect.runOn}, the quote runs on ${q.runOn} (${q.route})`);
      assert.equal(qa.runOn, q.runOn, `${label} ${m.key}: runOn=auto must equal the pre-selected place`); assert.equal(qa.route, q.route); assert.equal(typeof q.runOnLabel, 'string'); assert.ok(!/auto/i.test(q.runOnLabel), q.runOnLabel);
      assert.equal(m.autoRunOn, m.preselect.runOn, 'autoRunOn (older clients) = preselect.runOn'); n++; }
    return n; };

  // ---- 1. order: Comfy → other API → Local (among READY places) ----
  await a.global({ useLocal: true, mockKeys: true });
  { const m = await a.model('qwen-image'); assert.equal(m.preselect.runOn, 'fal', `GPU and fal ready: the other API first: ${JSON.stringify(m.preselect)}`); assert.equal(m.preselect.status, 'ready');
    assert.equal(m.runsOn.find((r: any) => r.id === 'local').status, 'ready'); assert.equal(m.rowStatus.kind, 'ready'); assert.equal(m.rowStatus.runOn, 'fal');
    const q = await a.quote('qwen-image'); assert.equal(q.runOn, 'fal'); assert.equal(q.runOnLabel, 'fal'); assert.ok(q.credits > 0);
    const nb = await a.model('nano-banana-2'); assert.equal(nb.preselect.runOn, 'comfy-cloud', 'Comfy before fal when both are ready'); const qn = await a.quote('nano-banana-2'); assert.equal(qn.runOn, 'comfy-cloud'); assert.equal(qn.runOnLabel, 'Comfy Cloud'); assert.equal(qn.demo, false);
    for (const r of nb.runsOn) assert.equal(r.group, r.id === 'local' ? 'gpu' : r.id === 'comfy-cloud' ? 'comfy' : 'api');
    assert.ok(nb.runsOn.find((r: any) => r.id === 'comfy-cloud').detail, 'the Comfy row says how it runs (open workflow / partner model)');
    // (a) Comfy ready + GPU ready → Comfy (Camera Moves: LTX-2 19B runs locally and on Comfy Cloud)
    const lx = ((await a.get('/api/tools')) as any[]).find((t) => t.id === 'camera').models.find((x: any) => x.key === 'ltx-2-19b');
    assert.equal(lx.runsOn.find((r: any) => r.id === 'local').status, 'ready'); assert.equal(lx.runsOn.find((r: any) => r.id === 'comfy-cloud').status, 'ready');
    assert.equal(lx.preselect.runOn, 'comfy-cloud', 'Comfy ready + GPU ready → Comfy'); assert.equal((await a.get('/api/tools/camera/price?model=ltx-2-19b')).runOn, 'comfy-cloud'); assert.equal((await a.get('/api/tools/h3-video/price?model=minimax-h3&types=t2v')).runOn, 'comfy-cloud', 'MiniMax H3 text to video: Comfy over a ready GPU');
    // (b) only Local ready → Local (free)
    const zi = await a.model('z-image'); assert.deepEqual(zi.runsOn.map((r: any) => r.id), ['local']); assert.equal(zi.preselect.runOn, 'local'); assert.equal(zi.rowStatus.kind, 'ready'); assert.equal(zi.rowStatus.credits, 0); assert.equal(zi.fromPrice, 0);
    const qz = await a.quote('z-image'); assert.equal(qz.runOn, 'local'); assert.equal(qz.runOnLabel, 'Your computer'); assert.equal(qz.credits, 0);
    ok(`GPU on + Comfy + fal ready: Qwen-Image → fal (GPU ready too), Nano Banana 2 → Comfy (${qn.route}), LTX-2 19B and MiniMax H3 → Comfy over a ready GPU, Z-Image (GPU only) → Local (free); agreement on ${await agree(a, 'gpu+comfy+fal')} models`); }
  await a.global({ useLocal: false, mockKeys: true });
  { assert.equal((await a.model('qwen-image')).preselect.runOn, 'fal', 'GPU off → the connected direct API'); const m = await a.model('qwen-image'); assert.equal(m.runsOn.find((r: any) => r.id === 'local').action.kind, 'turn_on');
    assert.equal(m.runsOn.find((r: any) => r.id === 'local').credits, null, 'an off GPU has no price (never "Free")'); assert.ok(m.fromPrice > 0, `from price = a ready place: ${m.fromPrice}`);
    ok(`GPU off: Qwen-Image → fal; Local row offers "${m.runsOn.find((r: any) => r.id === 'local').action.text}"; agreement on ${await agree(a, 'comfy+fal')} models`); }
  await a.global({ useLocal: false, mockKeys: false });
  { const nb = await a.model('nano-banana-2'); assert.equal(nb.preselect.runOn, 'fal', 'a READY fal beats a Comfy that is only a sample'); assert.equal(nb.runsOn.find((r: any) => r.id === 'comfy-cloud').status, 'sample');
    assert.equal(nb.runsOn.find((r: any) => r.id === 'comfy-cloud').action.text, 'Add a Comfy Cloud key');
    ok(`no Comfy key: Nano Banana 2 → fal (ready) over Comfy (sample, "Add a Comfy key"); agreement on ${await agree(a, 'fal only')} models`); }

  // every tool × model (default job): listing pre-selection = quote place = runOn=auto
  { let n = 0; for (const t of (await a.get('/api/tools')) as any[]) for (const m of t.models ?? []) { if (!m.preselect) continue;
      const u = t.id === 'create-image' ? `/api/models/quote?toolId=create-image&model=${m.key}` : `/api/tools/${t.id}/price?model=${m.key}`; const q = await a.get(u); if (!q.runOn) continue;
      const qa = await a.get(`${u}&runOn=auto`); assert.equal(q.runOn, m.preselect.runOn, `${t.id} ${m.key}: listing ${m.preselect.runOn} vs quote ${q.runOn} (${q.route})`); assert.equal(qa.runOn, q.runOn, `${t.id} ${m.key}: runOn=auto`); n++; }
    assert.ok(n > 150, `checked ${n}`); ok(`every tool: listing pre-selection = quote = runOn=auto on ${n} tool × model pairs`); }
  // ---- 1b. nothing ready (real-mode rules: no samples) → nothing pre-selected; the setup options in the same order ----
  { await b.global({ useLocal: false, showOtherProviders: true }); // every place listed (2026-10-27: other providers Comfy or this computer covers are hidden by default; checked below)
    const m = await b.model('qwen-image'); assert.equal(m.preselect, null, `GPU off, no key: nothing pre-selected: ${JSON.stringify(m.preselect)}`); assert.equal(m.autoRunOn, null);
    assert.deepEqual(m.setup.map((x: any) => `${x.runOn}:${x.action.kind}`), ['fal:add_key', 'replicate:add_key', 'local:turn_on']); assert.equal(m.rowStatus.kind, 'set_up');
    const q = await b.quote('qwen-image'); assert.equal(q.runnable, false); assert.equal(q.runOn, null, JSON.stringify(q).slice(0, 400)); assert.equal(q.route, null); assert.equal(q.credits, null);
    assert.deepEqual(q.setupOptions.map((x: any) => `${x.runOn}:${x.action}`), ['fal:add_key', 'replicate:add_key', 'local:turn_on']); assert.equal(q.setup.action, 'add_key', 'the first fix follows the order');
    { await b.global({ showOtherProviders: false }); const mh = await b.model('qwen-image'); const qh0 = await b.quote('qwen-image');
      assert.deepEqual(mh.setup.map((x: any) => `${x.runOn}:${x.action.kind}`), ['local:turn_on'], 'hidden: your computer covers Qwen-Image'); assert.deepEqual(qh0.setupOptions.map((x: any) => `${x.runOn}:${x.action}`), ['local:turn_on'], 'the quote agrees');
      assert.deepEqual(mh.hiddenRunsOn.map((h: any) => h.id).sort(), ['fal', 'replicate']); await b.global({ showOtherProviders: true }); }
    await b.global({ useLocal: true });
    // (c) GPU needs a download + APIs need a key + nothing ready → nothing pre-selected, setup lists Comfy, fal, Replicate, Local (download), submit refused, nothing charged
    const h3 = ((await b.get('/api/tools')) as any[]).find((t) => t.id === 'h3-video').models.find((x: any) => x.key === 'minimax-h3');
    assert.equal(h3.preselect, null, JSON.stringify(h3.preselect)); assert.deepEqual(h3.setup.map((x: any) => `${x.runOn}:${x.action.kind}`), ['comfy-cloud:add_key', 'fal:add_key', 'replicate:add_key', 'minimax:add_key' /* MiniMax API (2026-10-23) */, 'local:download']);
    assert.equal(h3.setup[4].credits, 0, 'Local: free per run once set up'); assert.ok(h3.setup[4].action.missingBytes > 0); assert.equal(h3.rowStatus.kind, 'set_up'); assert.equal(h3.fromPrice, null, 'no price when nothing runs');
    const qh = await b.get('/api/tools/h3-video/price?model=minimax-h3&types=t2v'); assert.equal(qh.runnable, false); assert.equal(qh.runOn, null);
    // dd271521 (2026-10-26): fal's H3 schemas take 5–15 s, so the default 4 s quote no longer offers fal as a fix; a 5 s quote does, in the same order
    assert.deepEqual(qh.setupOptions.map((x: any) => x.runOn), ['comfy-cloud', 'replicate', 'minimax', 'local'], '4 s: fal (5–15 s) is not a fix');
    const qh5 = await b.get('/api/tools/h3-video/price?model=minimax-h3&types=t2v&duration=5'); assert.equal(qh5.runnable, false); assert.deepEqual(qh5.setupOptions.map((x: any) => x.runOn), ['comfy-cloud', 'fal', 'replicate', 'minimax', 'local'], '5 s: every place, in order');
    const m2 = await b.model('qwen-image'); assert.equal(m2.preselect, null, 'a GPU that needs a download is never pre-selected'); assert.equal(m2.setup.at(-1).action.kind, 'download'); assert.match(m2.setup.at(-1).action.text, /^Download [\d.]+ GB$/);
    const q2 = await b.quote('qwen-image'); assert.equal(q2.runnable, false); assert.equal(q2.runOn, null); assert.equal(q2.setupOptions.at(-1).action, 'download');
    const kl = await b.model('flux-3-klein'); assert.equal(kl.preselect, null); assert.deepEqual(kl.setup.map((x: any) => x.runOn), ['fal', 'bfl', 'local']); assert.equal(kl.setup[2].action.kind, 'download');
    // (d) no "Free" when the GPU isn't ready
    assert.equal(kl.fromPrice, null, 'FLUX 3 Klein: no "Free" from an uninstalled GPU'); assert.equal(kl.runsOn.find((r: any) => r.id === 'local').credits, null); assert.equal(kl.rowStatus.kind, 'set_up'); assert.equal(kl.rowStatus.text, 'Set up');
    const L0 = await b.get('/api/ledger');
    const s2 = await b.job({ provider: 'comfy-flux3-klein', model: 'flux-3-klein' }); assert.ok(s2.status === 402 || s2.status === 409, `nothing ready: refused: ${s2.status} ${JSON.stringify(s2.body).slice(0, 300)}`);
    assert.match(String(s2.body.error), /Nothing was charged/); assert.notEqual(s2.body.charged, true); const L1 = await b.get('/api/ledger'); assert.equal(L1.balance, L0.balance, 'balance unchanged'); assert.equal(L1.entries.length, L0.entries.length, 'no ledger entry');
    const s3 = await b.job({ provider: 'comfy-qwen-image', model: 'qwen-image', runOn: 'local' }); assert.equal(s3.status, 409, `Local chosen, files missing: ${JSON.stringify(s3.body).slice(0, 300)}`); assert.equal(s3.body.code, 'weights_missing');
    const g = await b.model('gpt-image'); assert.equal(g.preselect, null); assert.deepEqual(g.setup.map((x: any) => x.action.text), ['Add a Comfy Cloud key', 'Add an OpenAI key'] /* + OpenAI API place (batch 2) */); assert.equal(g.rowStatus.kind, 'set_up'); assert.equal(g.rowStatus.text, 'Set up');
    const qg = await b.quote('gpt-image'); assert.equal(qg.runnable, false); assert.equal(qg.runOn, null); assert.equal(qg.setup.action, 'add_key'); assert.equal(qg.setup.actionText, 'Add a Comfy Cloud key');
    ok(`nothing ready: nothing pre-selected; MiniMax H3 setup = Comfy, fal, Replicate, MiniMax, Local (${h3.setup[4].action.text}); FLUX 3 Klein = fal, BFL, GPU download, no "Free", submit ${s2.status} nothing charged; GPU chosen with files missing → 409 weights_missing; GPT Image → "Add key · Comfy", then OpenAI; agreement on ${await agree(b, 'nothing ready')} models`); }

  // ---- 2. the submit names the place; runOn=auto = the pre-selected place ----
  await a.global({ useLocal: true, mockKeys: true });
  { for (const [key, engine] of [['qwen-image', 'comfy-qwen-image'], ['nano-banana-2', 'api-nano-banana']] as const) {
      const pre = (await a.model(key)).preselect.runOn; const q = await a.quote(key);
      const s = await a.job({ model: key, runOn: 'auto', provider: engine }); assert.equal(s.status, 200, JSON.stringify(s.body)); assert.equal(s.body.runOn, pre, `${key}: submit runOn=auto ran on ${s.body.runOn}, pre-selected ${pre}`); assert.equal(s.body.route, q.route, 'quote route = submit route');
      assert.equal(typeof s.body.runOnLabel, 'string'); /* D4 (2026-10-28): Auto's pre-selected place moves on to the next ready place that costs the same or less (routing/select.ts planInner) */ assert.equal(s.body.routing.allowFallback, true); assert.equal(s.body.routing.order[0], q.route, 'the pre-selected place first');
      const s2 = await a.job({ model: key, provider: engine }); assert.equal(s2.body.runOn, pre, 'no runOn = the same place');
      const j = await a.until(s.body.id); assert.equal(j.status, 'done'); assert.equal(j.runOn, pre); }
    ok('submit with runOn=auto and without runOn: same place as the listing and the quote, named (runOn, runOnLabel), routing.order has one route'); }

  // ---- 3. a saved choice persists and never switches ----
  { const put = await a.send('PUT', '/api/me/routing', { perTool: { 'create-image': { 'qwen-image': { runOn: 'replicate' }, 'z-image-turbo': { runOn: 'auto' } } } }); assert.equal(put.status, 200, JSON.stringify(put.body));
    assert.equal(put.body.perTool['create-image']['qwen-image'].runOn, 'replicate'); assert.equal(put.body.perTool['create-image']['z-image-turbo'], undefined, 'a legacy "auto" choice is no choice: not stored');
    const q = await a.quote('qwen-image'); assert.equal(q.runOn, 'replicate', 'GPU and fal are ready, but the saved choice wins'); assert.equal(q.demo, true, 'keyless Replicate on the mock backend: a sample'); assert.equal(q.setup.action, 'add_key');
    await a.global({ useLocal: false }); await a.global({ useLocal: true });
    const q2 = await a.quote('qwen-image'); assert.equal(q2.runOn, 'replicate', 'still there after settings changes'); assert.equal((await a.get('/api/me/routing')).perTool['create-image']['qwen-image'].runOn, 'replicate');
    const s = await a.job({ provider: 'comfy-qwen-image' }); assert.equal(s.body.runOn, 'replicate');
    // real-mode rules (no samples): a saved Comfy choice without its key says so (with the fix) and does NOT run on anything else
    await b.global({ mockKeys: true }); assert.equal((await b.send('PUT', '/api/me/routing', { perTool: { 'create-image': { 'nano-banana-2': { runOn: 'comfy-cloud' } } } })).status, 200);
    assert.equal((await b.quote('nano-banana-2')).runOn, 'comfy-cloud'); await b.global({ mockKeys: false });
    const qb = await b.quote('nano-banana-2'); assert.equal(qb.runOn, 'comfy-cloud'); assert.equal(qb.runnable, false); assert.equal(qb.setup?.action, 'add_key', JSON.stringify(qb).slice(0, 300));
    const sb = await b.job({ provider: 'api-nano-banana' }); assert.ok(sb.status >= 400, 'refused, not moved'); assert.equal(sb.body.charged, false); assert.equal(sb.body.setup?.runOn, 'comfy-cloud', 'the refusal names the fix for the saved place');
    await a.send('PUT', '/api/me/routing', { perTool: {} }); await b.send('PUT', '/api/me/routing', { perTool: {} });
    ok('saved choice: Replicate kept over a ready GPU and fal (quote + submit), survives settings changes; a saved Comfy without its key → runnable:false + "Add a Comfy key", submit refused, nothing charged'); }

  // ---- 4. Auto moves on only when free and not dearer (D4, 2026-10-28), allowFallback=0 stays put; 5. Try on pins the place ----
  { const pre = await a.quote('qwen-image'); assert.equal(pre.runOn, 'fal');
    // D4 (2026-10-28): Auto's pre-selected place moves on to the next ready place that costs the same or less when the failed try wasn't charged
    const mv = await a.job({ provider: 'comfy-qwen-image', simulateRouteFail: pre.route }); const jm = await a.until(mv.body.id);
    assert.equal(jm.status, 'done', JSON.stringify(jm.routeAttempts)); assert.equal(jm.routeAttempts.length, 2); assert.equal(jm.runOn, 'local', 'moved on to the free ready place');
    // allowFallback=0 turns that off: the failure stays on its place and lists tryOn
    const s = await a.job({ provider: 'comfy-qwen-image', simulateRouteFail: pre.route, allowFallback: '0' }); assert.equal(s.status, 200, JSON.stringify(s.body));
    const j = await a.until(s.body.id); assert.equal(j.status, 'failed', 'stays failed: no automatic switch'); assert.equal(j.routeAttempts.length, 1); assert.equal(j.route, pre.route); assert.equal(j.runOn, 'fal');
    assert.ok(Array.isArray(j.tryOn) && j.tryOn.length >= 1, JSON.stringify(j.tryOn)); assert.ok(j.tryOn.every((o: any) => o.runOn !== 'fal'), 'only OTHER places');
    assert.equal(j.tryOn[0].runOn, 'local', 'the next ready place first (Local is ready; Replicate is only a sample)'); assert.equal(j.tryOn[0].credits, 0); assert.equal(j.tryOn[0].runOnLabel, 'Your computer');
    const r = await a.send('POST', `/api/jobs/${j.id}/retry`, { runOn: 'local' }); assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.runOn, 'local'); assert.equal(r.body.routing.mode, 'pinned'); assert.equal(r.body.routing.allowFallback, false); assert.deepEqual(r.body.routing.order, [r.body.route]); assert.match(r.body.route, /^local:/);
    const j2 = await a.until(r.body.id); assert.equal(j2.status, 'done'); assert.equal(j2.runOn, 'local'); assert.equal(j2.retryOf ?? j2.input?.retryOf ?? j.id, j.id);
    const bad = await a.send('POST', `/api/jobs/${j.id}/retry`, { runOn: 'nowhere' }); assert.equal(bad.status, 400); assert.equal(bad.body.code, 'invalid_run_on');
    ok(`failed on fal: stays failed (1 attempt), tryOn ${j.tryOn.map((o: any) => `${o.runOnLabel} ✦${o.credits}`).join(', ')}; Try locally → pinned job on ${r.body.route}, done`); }
  { const nb = await a.quote('nano-banana-2'); assert.equal(nb.runOn, 'comfy-cloud');
    const s = await a.job({ provider: 'api-nano-banana', simulateRouteFail: nb.route, allowFallback: '1' }); const j = await a.until(s.body.id);
    assert.ok(j.routeAttempts.length > 1 || j.status === 'needs_decision', `allowFallback=1 (API opt-in) still moves on or asks: ${j.status} ${j.routeAttempts.length}`);
    const s0 = await a.job({ provider: 'api-nano-banana', simulateRouteFail: nb.route, allowFallback: '0' }); const j0 = await a.until(s0.body.id); assert.equal(j0.status, 'failed', JSON.stringify([j0.status, j0.routeAttempts, j0.routing])); assert.equal(j0.routeAttempts.length, 1);
    ok(`allowFallback=1 on the request still opts in (${j.status}, ${j.routeAttempts.length} attempts); allowFallback=0 keeps the same failure on Comfy (tryOn ${j0.tryOn.map((o: any) => o.runOn).join(', ')})`); }
  // the saved global allowFallback from older settings is ignored (read as off)
  { await a.global({ allowFallback: true }); assert.equal((await a.get('/api/me/routing')).global.allowFallback, false);
    // a place the user picked never moves on unless the request says allowFallback=1 (D4): the stored true doesn't change that
    const q = await a.quote('qwen-image'); const s = await a.job({ provider: 'comfy-qwen-image', runOn: q.runOn, simulateRouteFail: q.route }); const j = await a.until(s.body.id); assert.equal(j.status, 'failed', JSON.stringify(j.routeAttempts)); assert.equal(j.routeAttempts.length, 1);
    ok('a stored global allowFallback:true is read as off: a picked place still stays put'); }
  console.log('ALL OK runon-preselect');
} finally { stop(S1); stop(S2); }
