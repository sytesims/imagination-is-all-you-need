// E2E (own mock servers :8961 normal, :8962 open-weights-only; temp data dirs, no keys). Oct 18 PB batch 2: settings providers openWeights,
// demo contract (sample runs, Auto = runnable non-demo), quote/submit contract (409 route_changed), unpriceable models 200, ledger.
// Run: npx tsx test/pb-1018b.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' };
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'pb18b-'));
const boot = (port: number, extra: Record<string, string> = {}) => spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(D, 'd-')),
  OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '150', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '0', ...extra }, stdio: ['ignore', fs.openSync(path.join(D, `srv-${port}.log`), 'a'), fs.openSync(path.join(D, `srv-${port}.log`), 'a')], detached: true });
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
const REF = path.join(import.meta.dirname, 'fixtures/ref-512.png');
const MP4 = path.join(D, 'clip.mp4'); ff('-f', 'lavfi', '-i', 'testsrc2=size=854x480:rate=24', '-f', 'lavfi', '-i', 'sine=d=6', '-t', '6', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', MP4);
const n = boot(testPort(8961)), o = boot(testPort(8962), { OPENHIGGSFIELD_OPEN_WEIGHTS_ONLY: '1' }); const N = api(testPort(8961)), O = api(testPort(8962));
try {
  await N.ready(); await O.ready();
  // ---- 6e: openWeights on /api/settings/providers ----
  { const a = (await N.get('/api/settings/providers')).providers as any[]; const b = (await O.get('/api/settings/providers')).providers as any[];
    const by = Object.fromEntries(a.map((p) => [p.id, p])); assert.equal(by.local.openWeights, true); assert.equal(by.comfy.openWeights, false); /* item 5: Comfy API is an API provider */ assert.equal(by.fal.openWeights, false); assert.equal(by.bfl.openWeights, false);
    assert.ok(a.every((p) => typeof p.openWeights === 'boolean' && 'openWeightsNote' in p && p.disabledReason === null), 'normal mode: nothing disabled');
    const bo = Object.fromEntries(b.map((p) => [p.id, p])); assert.equal(bo.local.disabledReason, null); assert.equal(bo.comfy.disabledReason, null); assert.match(bo.fal.disabledReason, /open-weights-only/);
    ok('6e: /api/settings/providers openWeights (local true; comfy, fal, replicate, minimax, dashscope, bfl false; comfy stays on in OW-only) + disabledReason in OW-only mode'); }
  // ---- 6b #1/#2 demo contract: Auto = runnable non-demo routes; demo previews are free (quote 0 = charge 0, no debit), demo:true + demoMessage ----
  { const put = async (b: any) => (await fetch(`${N.B}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).status;
    // L1: h3-video with a saved local pin; the web sends route=auto → the pin (runnable, free) wins over the fal demo
    assert.equal(await put({ perModel: { 'comfy-h3': { route: 'local:comfy-h3' } } }), 200);
    const q = await N.get('/api/tools/h3-video/price?provider=comfy-h3&route=auto&seconds=6'); const before = (await N.get('/api/ledger')).balance ?? null;
    const r = await N.post('/api/tools/h3-video/jobs', { provider: 'comfy-h3', route: 'auto', prompt: 'a lighthouse', seconds: '6', types: '["t2v"]' }); assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.route, 'local:comfy-h3', 'saved local pin wins over a demo route'); assert.equal(q.route, r.body.route); assert.equal(r.body.cost, q.credits); assert.equal(r.body.cost, 0); assert.equal(r.body.demo, false);
    assert.equal(await put({ perModel: { 'comfy-h3': { route: 'auto' } } }), 200);
    // demo preview (no keys, mock): free everywhere
    const ld0 = (await N.get('/api/ledger')); const bal0 = ld0.balance ?? ld0.summary?.balance;
    for (const [tool, extra, files] of [['upscale', { duration: '5', types: '["precise"]' }, [['video', MP4, 'video/mp4']]], ['reframe', { aspect: '9:16' }, [['video', MP4, 'video/mp4']]], ['remove-bg', { types: '["transparent"]' }, [['video', MP4, 'video/mp4']]], ['h3-video', { types: '["t2v"]', prompt: 'waves', seconds: '6' }, []]] as const) {
      const qs = new URLSearchParams(extra as any).toString(); const pq = await N.get(`/api/tools/${tool}/price?${qs}`);
      const sr = await N.post(`/api/tools/${tool}/jobs`, { rights: '1', ...(extra as any) }, files as any); if (sr.status !== 200) { console.log(`  skip ${tool}: ${sr.status} ${sr.body.error}`); continue; }
      assert.equal(sr.body.cost, pq.credits, `${tool} quote ${pq.credits} = charge ${sr.body.cost}`);
      if (pq.demo) { assert.equal(pq.credits, 0, `${tool} demo quote free`); assert.equal(sr.body.demo, true); assert.equal(sr.body.cost, 0); const j = await N.until(sr.body.id); assert.equal(j.demo, true); assert.match(j.demoMessage, /^Sample output, nothing billed\./); assert.equal(j.cost ?? 0, 0); }
      ok(`${tool}: quote ${pq.credits} = charge ${sr.body.cost}${pq.demo ? ` (demo preview, list ✦${pq.listCredits})` : ''}`); }
    const ld1 = (await N.get('/api/ledger')); const bal1 = ld1.balance ?? ld1.summary?.balance; if (bal0 != null) assert.equal(bal1, bal0, 'no ledger debit for demo previews');
    // explicitly requested non-runnable route → friendly 4xx, nothing charged
    const nr = await O.post('/api/tools/h3-video/jobs', { provider: 'comfy-h3', route: 'fal:minimax/h3/text-to-video', prompt: 'x', types: '["t2v"]' }); assert.ok(nr.status >= 400 && nr.status < 500, `${nr.status}`); assert.match(nr.body.error, /Nothing was charged|not|disabled/i);
    ok(`demo contract: pin beats demo (L1), demo previews free with demo:true + demoMessage, no ledger debit; explicit non-runnable route → ${nr.status}`); }
  // ---- quote == charge for every tool × model under auto (whatever the mock accepts) ----
  { const KEY = path.join(D, 'key-1280.png'); ff('-f', 'lavfi', '-i', 'testsrc2=size=1280x720', '-frames:v', '1', KEY);
    const ts = await N.get('/api/tools'); let compared = 0; const bad: string[] = [];
    for (const t of (Array.isArray(ts) ? ts : ts.tools)) for (const p of (t.providers ?? [])) {
      const pq = await N.get(`/api/tools/${t.id}/price?provider=${p.id}&image=1&video=1`); if (pq.credits == null || pq.runnable === false) continue; // image=1&video=1: the uploads below (app mode switches)
      const sr = await N.post(`/api/tools/${t.id}/jobs`, { provider: p.id, rights: '1', prompt: 'a red mug on a table', text: 'hello there', quotedRouteId: pq.routeId ?? pq.route, quotedCredits: String(pq.credits) }, [['image', KEY, 'image/png'], ['video', MP4, 'video/mp4']]);
      if (sr.status === 409 && sr.body.error === 'route_changed') { bad.push(`${t.id}/${p.id}: quoted ${pq.credits} ${pq.route} → ${sr.body.quote?.credits} ${sr.body.quote?.route}`); continue; }
      if (sr.status !== 200) continue; compared++;
      if (sr.body.cost !== pq.credits || (sr.body.route ?? null) !== (pq.route ?? null)) bad.push(`${t.id}/${p.id}: quote ${pq.credits} ${pq.route} vs charge ${sr.body.cost} ${sr.body.route}`); }
    assert.deepEqual(bad, [], bad.join('\n')); assert.ok(compared >= 25, `compared ${compared}`); ok(`quote == charge under auto: ${compared} tool × model pairs submitted, 0 mismatches`); }
  // ---- quote/submit contract: 409 route_changed + happy path ----
  { const pq = await N.get('/api/tools/upscale/price?duration=5&types=%5B%22precise%22%5D'); assert.ok('routeId' in pq && typeof pq.runnable === 'boolean' && typeof pq.demo === 'boolean');
    const okr = await N.post('/api/tools/upscale/jobs', { duration: '5', types: '["precise"]', rights: '1', quotedRouteId: pq.routeId, quotedCredits: String(pq.credits) }, [['video', MP4, 'video/mp4']]); assert.equal(okr.status, 200, JSON.stringify(okr.body)); assert.equal(okr.body.cost, pq.credits);
    const bal = (await N.get('/api/ledger')); const b0 = bal.balance ?? bal.summary?.balance;
    const c1 = await N.post('/api/tools/upscale/jobs', { duration: '5', types: '["precise"]', rights: '1', quotedRouteId: 'fal:nope', quotedCredits: String(pq.credits) }, [['video', MP4, 'video/mp4']]);
    assert.equal(c1.status, 409); assert.equal(c1.body.error, 'route_changed'); assert.equal(c1.body.message, 'The price changed. Nothing was charged.'); assert.equal(c1.body.userMessage, c1.body.message); assert.equal(c1.body.charged, false); assert.equal(c1.body.calm, true); assert.equal(c1.body.refund.charged, false); /* P2 3a */ assert.equal(c1.body.quote.routeId, pq.routeId); assert.equal(c1.body.quote.credits, pq.credits);
    const c2 = await N.post('/api/tools/upscale/jobs', { duration: '5', types: '["precise"]', rights: '1', quotedRouteId: pq.routeId, quotedCredits: String(pq.credits + 7) }, [['video', MP4, 'video/mp4']]); assert.equal(c2.status, 409); assert.equal(c2.body.error, 'route_changed');
    { const nr = await N.post('/api/tools/upscale/jobs', { duration: '5', types: '["precise"]', rights: '1', provider: 'comfy-seedvr2', route: 'local:comfy-seedvr2' } /* 2026-10-26: a pinned route that can't run here (SeedVR2 3B locally needs an NVIDIA GPU); SeedVR2 Creative is now refused at submit (400) */, [['video', MP4, 'video/mp4']]); // P2 3a: route_not_runnable
      assert.equal(nr.status, 409, JSON.stringify(nr.body).slice(0, 300)); assert.equal(nr.body.code, 'route_not_runnable'); assert.equal(nr.body.charged, false); assert.match(nr.body.userMessage, /Nothing was charged\.$/); assert.ok(!/\(/.test(nr.body.userMessage), nr.body.userMessage); }
    const b1 = (await N.get('/api/ledger')); assert.equal(b1.balance ?? b1.summary?.balance, b0, '409 charges nothing');
    const ex = await N.get('/api/tools/h3-extend/price?seconds=5'); assert.equal(typeof ex.credits, 'number', `Extend has a price ${JSON.stringify(ex).slice(0, 200)}`); assert.ok('routeId' in ex);
    ok(`quote/submit: price has routeId/runnable/demo; matching quotedRouteId+quotedCredits → 200; route or credits differ → 409 route_changed with the fresh quote, nothing charged; Extend priced (${ex.credits})`); }
  // ---- L4 UGC Ad photo → r2v (LOW-ROWS: presenter/product refs); L5 Transitions / UGC 720p → 768p with the note ----
  { const KEY = path.join(D, 'key-1280.png');
    const u = await N.post('/api/tools/app-ugc-ad/jobs', { prompt: 'a steel water bottle', rights: '1' }, [['image', KEY, 'image/png']]); assert.equal(u.status, 200, JSON.stringify(u.body));
    const uj = await N.get(`/api/jobs/${u.body.id}`); assert.deepEqual(uj.input.types, ['r2v']); assert.ok(!(uj.warnings ?? []).some((w: string) => /image was ignored/i.test(w)), JSON.stringify(uj.warnings));
    const uq = await N.get('/api/tools/app-ugc-ad/price?image=1'); assert.equal(uq.route, u.body.route); assert.equal(uq.credits, u.body.cost);
    const t7 = await N.post('/api/tools/app-transition/jobs', { prompt: 'morph', rights: '1', resolution: '720p' }, [['image', KEY, 'image/png'], ['lastFrame', KEY, 'image/png']]); assert.equal(t7.status, 200, JSON.stringify(t7.body));
    assert.ok((t7.body.warnings ?? []).some((w: string) => /720p was mapped to 768p/.test(w)), JSON.stringify(t7.body.warnings)); assert.equal((await N.get(`/api/jobs/${t7.body.id}`)).input.resolution, '768p');
    const u7 = await N.post('/api/tools/app-ugc-ad/jobs', { prompt: 'a mug', rights: '1', resolution: '720p' }); assert.equal(u7.status, 200, JSON.stringify(u7.body));
    ok('L4: UGC Ad product photo → i2v (kept, quote = charge); L5: Transitions + UGC Ad 720p → 768p with the note'); }
  // ---- (C) a retired model's quote (2026-10-27: the last unpriced model, the direct Alibaba Qwen3 TTS, gave way to its open weights, comfy-qwen3tts) ----
  { const r = await fetch(`${N.B}/api/models/quote?model=direct-qwen3-tts`); const b = await r.json() as any; assert.equal(r.status, 404, JSON.stringify(b)); assert.equal(b.code, 'unknown_model');
    const r2 = await fetch(`${N.B}/api/models/quote?model=comfy-qwen3tts&text=hello`); const b2 = await r2.json() as any; assert.equal(r2.status, 200, JSON.stringify(b2)); ok('(C) retired direct-qwen3-tts → 404 unknown_model; the local Qwen3 TTS quotes'); }
  // ---- (D) providerGroup / runsOnKind / displayName on /api/models + /api/routes ----
  { const ms = (await N.get('/api/models?toolId=h3-video')).groups.flatMap((g: any) => g.models); const wf = ms.find((m: any) => m.id === 'cloud-h3-wf');
    assert.equal(wf.providerGroup, 'Comfy Cloud'); assert.equal(wf.runsOnKind, 'comfy-cloud-open'); assert.equal(wf.displayName, 'MiniMax H3 · Comfy Cloud workflow');
    assert.equal(ms.find((m: any) => m.id === 'comfy-h3').providerGroup, 'Local'); assert.equal(ms.find((m: any) => m.id === 'cloud-h3').providerGroup, 'API');
    const rv = (await N.get('/api/routes?toolId=h3-video&modelId=cloud-h3-wf')).routes[0]; assert.equal(rv.providerGroup, 'Comfy Cloud'); assert.equal(rv.displayName, 'MiniMax H3 · Comfy Cloud workflow'); assert.equal(rv.routes[0].providerGroup, 'Comfy Cloud');
    const lr = (await N.get('/api/routes?toolId=h3-video&modelId=comfy-h3')).routes[0].routes; assert.equal(lr.find((r: any) => r.kind === 'local').providerGroup, 'Local'); assert.ok(lr.filter((r: any) => r.kind !== 'local').every((r: any) => r.providerGroup === 'API'));
    const ow = (await O.get('/api/models?toolId=h3-video')).groups.flatMap((g: any) => g.models).find((m: any) => m.id === 'cloud-h3-wf'); assert.equal(ow.providerGroup, 'Comfy Cloud');
    ok('(D) providerGroup Local / Comfy Cloud / API + runsOnKind + displayName on /api/models and /api/routes (model and route level)'); }
  // ---- L9 Remove BG: model line follows the route; Recreate quote uses the clip's real length (6 s), = charge ----
  { const r = await N.post('/api/tools/remove-bg/jobs', { types: '["transparent"]', rights: '1' }, [['video', MP4, 'video/mp4']]); assert.equal(r.status, 200, JSON.stringify(r.body));
    const j = await N.until(r.body.id); if (/^fal:/.test(j.route ?? '')) assert.match(j.model, /Bria/, `model line ${j.model} on ${j.route}`); else assert.match(j.model, /BiRefNet/);
    const pf = await N.get(`/api/jobs/${r.body.id}/prefill?action=recreate`); const pc = pf.price?.credits;
    const again = await N.post('/api/tools/remove-bg/jobs', { ...pf.form, ...(pf.submit ?? {}), rights: '1' }, [['video', MP4, 'video/mp4']]); assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal(again.body.cost, pc, `Recreate quote ${pc} = charge ${again.body.cost}`); const q6 = await N.get(`/api/tools/remove-bg/price?seconds=6&types=%5B%22transparent%22%5D`); assert.equal(pf.price?.listCredits ?? pc, q6.listCredits ?? q6.credits, 'priced at the 6 s clip'); const q8 = await N.get(`/api/tools/remove-bg/price?seconds=8&types=%5B%22transparent%22%5D`); assert.notEqual(q8.listCredits ?? q8.credits, q6.listCredits ?? q6.credits, '8 s differs from 6 s');
    ok(`L9 Remove BG: model "${j.model}" on ${j.route}; Recreate quote ${pc} = 6 s price ${q6.credits}${q6.demo ? ` (demo, list ✦${q6.listCredits})` : ''} = charge`); }
  // ---- L13 /pricing: no internal planning copy ----
  { const pr = JSON.stringify(await N.get('/api/pricing')); for (const w of ['Placeholder until', 'B6', 'runner lands', '(placeholder)']) assert.ok(!pr.includes(w), `/api/pricing has "${w}"`);
    // Comfy audit (2026-10-24): unmeasured GPU-time rows now say "Price not measured yet: …" (was "Estimated: …") and carry priceUnmeasured
    { const rows = (JSON.parse(pr).hosted as any[]).filter((x) => x.priceUnmeasured); assert.ok(rows.length && rows.every((x) => x.estimated && /^Price not measured yet/.test(x.note)), 'unmeasured rows say "Price not measured yet"'); }
    ok('L13 /api/pricing: no "Placeholder until B6…" copy; unmeasured rows say "Price not measured yet"'); }
  //@@MORE@@
  console.log('PASS pb-1018b');
} catch (e) { console.log('server logs in', D); throw e; } finally { stop(n); stop(o); }
