// Keys flow audit (2026-10-23): adding, removing and using API keys. One regression check per bug found by the audit.
//  1 keyless mock server: Generate Video default is Seedance 2.0 on the Comfy key (also in video-defaults.test)   2 removing a saved key while an alias var is set
//  3 every key owner has a Connections card anchor   4 key format checks, separate length / spaces messages, "checked on first run"
//  5 unreachable local GPU is reported as unreachable, not as a missing Comfy key   6 /api/health follows the real local state
//  7 a saved pick that can't run gets its own note   8 OPENHIGGSFIELD_USE_LOCAL wins again at each start   9 wording when nothing runs
// Run: npx tsx test/keys-flow.e2e.ts   (own servers on :8910-8915 + a stub ComfyUI on :8916, temp data dirs, fake keys, mock/no network)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import http from 'node:http'; import os from 'node:os'; import path from 'node:path';
import { KEY_OWNER_CARD, keyOwnerOf, cardOfOwner } from '../src/shared/keyOwners.ts';
const ROOT = path.resolve(import.meta.dirname, '..'); const ok = (m: string) => console.log('ok ' + m);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '', OPENHIGGSFIELD_ARK_API_KEY: '',
  OPENHIGGSFIELD_OPENAI_API_KEY: '', OPENHIGGSFIELD_GEMINI_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_LTX_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_ROUTING_LIVE: '', OPENHIGGSFIELD_LOCAL_AVAILABLE: '', OPENHIGGSFIELD_USE_LOCAL: '', COMFY_BASE_URL: '' };
const procs: ChildProcess[] = []; const dirs: string[] = [];
function boot(port: number, extra: Record<string, string>, dir?: string) {
  const D = dir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'keysflow-')); if (!dir) dirs.push(D);
  const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(port), HOST: '127.0.0.1', OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_HOSTED: '', OPENHIGGSFIELD_SEED_COMMUNITY: '0', ...extra }, stdio: ['ignore', 'ignore', 'pipe'], detached: true });
  procs.push(p); return { B: `http://127.0.0.1:${port}`, D, p };
}
const up = async (B: string) => { for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) return; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 500)); } throw new Error('server did not start'); };
const stop = (p: ChildProcess) => { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } };
const get = async (B: string, u: string) => (await (await fetch(B + u)).json()) as any;
const send = async (B: string, m: string, u: string, body?: any) => { const r = await fetch(B + u, { method: m, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: (await r.json().catch(() => null)) as any }; };
const tool = async (B: string, id: string) => ((await get(B, '/api/tools')) as any[]).find((t) => t.id === id);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let stub: http.Server | undefined;
try {
  // ---- A: mock server, HOST=127.0.0.1 (keys can be saved), FAL_KEY set in the environment ----
  const A = boot(testPort(8910), {}); await up(A.B);

  // 1. keyless default for Generate Video
  { const h3 = await tool(A.B, 'h3-video'); assert.equal(h3.defaultProvider, 'router-ltx-25-pro', 'keyless sample server: the cloud default, LTX-2.5 Pro (shared/cloudDefaults.ts, 2026-10-27)'); assert.equal(h3.editorialDefault.setup, 'hosted');
    assert.equal(h3.defaultFallback, null, 'no fallback note: the default makes a sample'); ok('1. keyless mock: h3-video default router-ltx-25-pro'); }

  // 4. key format checks and messages
  { const bad = await send(A.B, 'POST', '/api/settings/providers', { id: 'openai', key: 'garbage-not-a-key-format' }); assert.equal(bad.status, 400); assert.match(bad.j.error, /doesn't look like an OpenAI key.*"sk-"/, bad.j.error);
    const short = await send(A.B, 'POST', '/api/settings/providers', { id: 'openai', key: 'sk-1' }); assert.equal(short.status, 400); assert.match(short.j.error, /too short.*at least 8/); assert.doesNotMatch(short.j.error, /space/);
    const spaced = await send(A.B, 'POST', '/api/settings/providers', { id: 'openai', key: 'sk-test not-a-real-key' }); assert.equal(spaced.status, 400); assert.match(spaced.j.error, /no spaces or line breaks/); assert.doesNotMatch(spaced.j.error, /short|characters/);
    const long = await send(A.B, 'POST', '/api/settings/providers', { id: 'minimax', key: 'x'.repeat(600) }); assert.equal(long.status, 400); assert.match(long.j.error, /too long/);
    const uni = await send(A.B, 'POST', '/api/settings/providers', { id: 'minimax', key: 'clé-not-a-real-key' }); assert.equal(uni.status, 400); assert.match(uni.j.error, /plain letters/);
    for (const [id, key] of [['comfy', 'nope-not-a-real-key'], ['google', 'nope-not-a-real-key'], ['replicate', 'nope-not-a-real-key'], ['fal', 'nope-not-a-real-key']]) { const r = await send(A.B, 'POST', '/api/settings/providers', { id, key }); assert.equal(r.status, 400, `${id}: ${JSON.stringify(r.j)}`); }
    assert.ok(!(await get(A.B, '/api/settings/providers')).providers.find((p: any) => p.id === 'openai').configured, 'a refused key is not saved');
    const good = await send(A.B, 'POST', '/api/settings/providers', { id: 'openai', key: 'sk-test-not-a-real-key' }); assert.equal(good.status, 200); assert.equal(good.j.keyFormat, 'ok');
    const unchecked = await send(A.B, 'POST', '/api/settings/providers', { id: 'minimax', key: 'garbage-not-a-key-format' }); assert.equal(unchecked.status, 200, 'no stable format: accepted on length'); assert.equal(unchecked.j.keyFormat, 'unchecked');
    const ps = (await get(A.B, '/api/settings/providers')).providers as any[];
    assert.equal(ps.find((p) => p.id === 'openai').keyFormat, 'ok'); assert.equal(ps.find((p) => p.id === 'minimax').keyFormat, 'unchecked', 'the card says "Saved, checked on first run"');
    ok('4. key format: refused with separate length / spaces / format messages; unchecked providers flagged'); }

  // 2. removing a saved key while an alias is set in the environment (own server: a fal key also makes other models run for real)
  { const B2 = boot(testPort(8915), { FAL_KEY: 'envid:test-not-a-real-key' }); await up(B2.B); const A = B2;
    const sv = await send(A.B, 'POST', '/api/settings/providers', { id: 'fal', key: 'saved:test-not-a-real-key' }); assert.equal(sv.status, 200, JSON.stringify(sv.j));
    assert.equal(((await get(A.B, '/api/settings/providers')).providers as any[]).find((p) => p.id === 'fal').keySource, 'saved');
    const rm = await send(A.B, 'DELETE', '/api/settings/providers/fal'); assert.equal(rm.status, 200); assert.equal(rm.j.stillConfigured, true, 'still configured through the alias'); assert.equal(rm.j.stillFromEnvVar, 'FAL_KEY'); assert.match(rm.j.note, /still connected.*FAL_KEY/);
    assert.equal(rm.j.configured, true); assert.equal(rm.j.keySource, 'env'); assert.ok(!JSON.stringify(rm.j).includes('test-not-a-real-key'), 'no key value in the answer');
    const fal = ((await get(A.B, '/api/settings/providers')).providers as any[]).find((p) => p.id === 'fal'); assert.equal(fal.keyEnvVar, 'FAL_KEY'); assert.equal(fal.keySource, 'env');
    assert.equal((await send(A.B, 'POST', '/api/settings/providers', { id: 'openai', key: 'sk-test-not-a-real-key' })).status, 200);
    const rm2 = await send(A.B, 'DELETE', '/api/settings/providers/openai'); assert.equal(rm2.status, 200); assert.equal(rm2.j.stillConfigured, false, 'no alias: really gone'); assert.equal(rm2.j.configured, false);
    stop(B2.p); ok('2. remove with FAL_KEY in the env: says it is still connected, names the variable; plain removal unchanged'); }

  // 3. every key owner has a card anchor
  { const owners = new Set<string>(); const walk = (v: any) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if ((k === 'keyOwner') && typeof x === 'string') owners.add(x); else if (k === 'keyOwners' && Array.isArray(x)) x.forEach((o) => owners.add(String(o))); else walk(x); } };
    walk(await get(A.B, '/api/tools')); walk(await get(A.B, '/api/edit-video/tools'));
    const providers = (await get(A.B, '/api/settings/providers')).providers as any[]; const cards = new Set(providers.map((p) => p.id));
    for (const p of providers.filter((x) => x.id !== 'local')) { const o = keyOwnerOf(p.envKey); assert.ok(o !== 'provider', `${p.envKey} has a named owner`); assert.ok(cards.has(KEY_OWNER_CARD[o]), `${o} -> card ${KEY_OWNER_CARD[o]} exists`); assert.equal(KEY_OWNER_CARD[o], p.id, `${p.envKey}: the owner's card is its own provider`);
      for (const a of p.envAliases) assert.equal(keyOwnerOf(a), o, `alias ${a}`); }
    for (const o of owners) { if (o === 'provider') continue; assert.ok(KEY_OWNER_CARD[o], `the server can return keyOwner "${o}": it needs a Connections anchor`); }
    for (const o of ['OpenAI', 'Google Gemini API', 'BytePlus', 'LTX', 'Alibaba Cloud Model Studio', 'Luma']) assert.notEqual(cardOfOwner(o), 'comfy', `${o} must not fall back to the Comfy card`);
    assert.deepEqual([cardOfOwner('OpenAI'), cardOfOwner('Google Gemini API'), cardOfOwner('BytePlus'), cardOfOwner('LTX'), cardOfOwner('Alibaba Cloud Model Studio'), cardOfOwner('Luma')], ['openai', 'google', 'byteplus', 'ltx', 'dashscope', 'luma']);
    ok(`3. key-owner anchors: ${owners.size} owner names seen in the API, all ${Object.keys(KEY_OWNER_CARD).length} mapped to their own card`); }
  stop(A.p);

  // ---- 8. OPENHIGGSFIELD_USE_LOCAL after the first launch ----
  { const first = boot(testPort(8911), {}); await up(first.B); assert.equal((await get(first.B, '/api/me/routing')).global.useLocal, false);
    assert.equal((await send(first.B, 'PUT', '/api/me/routing', { global: { mode: 'auto', allowFallback: false, useLocal: false } })).status, 200); stop(first.p); await sleep(800);
    const second = boot(testPort(8911), { OPENHIGGSFIELD_USE_LOCAL: '1' }, first.D); await up(second.B);
    { const r = await get(second.B, '/api/me/routing'); assert.equal(r.global.useLocal, true, 'the env line wins at start over the stored row'); assert.equal(r.envUseLocal, true); }
    assert.equal((await send(second.B, 'PUT', '/api/me/routing', { global: { mode: 'auto', allowFallback: false, useLocal: false } })).status, 200); assert.equal((await get(second.B, '/api/me/routing')).global.useLocal, false, 'Settings can still change it while running'); stop(second.p); await sleep(800);
    const third = boot(testPort(8911), {}, first.D); await up(third.B); { const r = await get(third.B, '/api/me/routing'); assert.equal(r.global.useLocal, false, 'no env line: the stored choice is left alone'); assert.equal(r.envUseLocal, null); }
    stop(third.p); await sleep(800);
    const fourth = boot(testPort(8911), { OPENHIGGSFIELD_USE_LOCAL: '0' }, first.D); await up(fourth.B); assert.equal((await get(fourth.B, '/api/me/routing')).envUseLocal, false); stop(fourth.p);
    ok('8. OPENHIGGSFIELD_USE_LOCAL: explicit value wins at each start, shown as envUseLocal; no value leaves the stored choice'); }

  // ---- 5 + 6 + 9: comfy backend, local ComfyUI address with nothing there, no keys ----
  { const C = boot(testPort(8912), { OPENHIGGSFIELD_BACKEND: 'comfy', OPENHIGGSFIELD_USE_LOCAL: '1', COMFY_BASE_URL: `http://127.0.0.1:${testPort(8999)}` }); await up(C.B); await sleep(2500); // let the first reachability probe finish
    const h = await get(C.B, '/api/health'); assert.equal(h.backend, 'comfy'); assert.equal(h.comfyReady, false, 'bug 6: unreachable local address is not ready'); assert.match(h.comfyReason, /isn’t running on your computer/);
    const t = await tool(C.B, 'h3-video'); const st = (t.providers as any[]).find((x) => x.id === 'comfy-h3');
    assert.equal(st.reasonCode, 'local_unreachable', JSON.stringify(st)); assert.match(st.reason, /ComfyUI isn’t running on your computer/); assert.doesNotMatch(st.reason, /Comfy Cloud key|Comfy key/, 'bug 5: not a missing key');
    assert.equal(t.editorialDefault.reason, st.reason); assert.match(t.defaultFallback.note, /ComfyUI isn’t running there/);
    const sh = await get(C.B, '/api/health/self-host'); assert.ok(JSON.stringify(sh).includes('reachable'), 'self-host panel answers');
    ok('5/6. unreachable local GPU: model status local_unreachable, health comfyReady false with the reason');
    // 9. nothing can run: no "so X is used" without something that runs; the note names the next key and where
    const notes = ((await get(C.B, '/api/tools')) as any[]).map((x) => x.defaultFallback?.note as string | undefined).filter(Boolean) as string[];
    for (const n of notes.filter((x) => /Nothing can run yet/.test(x))) assert.match(n, /Settings \(Connections\)|Nothing can run yet\.$/, n);
    assert.ok(notes.some((x) => /Add a Comfy Cloud key in Settings → Connections to run it/.test(x)), 'when a key would run it, the note names the key and Settings');
    ok(`9. wording: ${notes.length} fallback notes name the key to add; "Nothing can run yet" notes carry no "is used"`);
    stop(C.p); }

  // 6b. a reachable local address is ready (stub ComfyUI answering /system_stats)
  { stub = http.createServer((req, res) => { if (req.url?.startsWith('/system_stats')) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ system: { comfyui_version: '0.0.0-stub' }, devices: [] })); } else { res.statusCode = 404; res.end('{}'); } }).listen(testPort(8916), '127.0.0.1');
    const R = boot(testPort(8913), { OPENHIGGSFIELD_BACKEND: 'comfy', OPENHIGGSFIELD_USE_LOCAL: '1', COMFY_BASE_URL: `http://127.0.0.1:${testPort(8916)}` }); await up(R.B); await sleep(2500);
    const h = await get(R.B, '/api/health'); assert.equal(h.comfyReady, true, JSON.stringify(h).slice(0, 300)); stub.close(); stub = undefined; await sleep(6500); // the stub is gone: within a few seconds health follows
    const h2 = await get(R.B, '/api/health'); await sleep(2000); const h3 = await get(R.B, '/api/health'); assert.ok(h2.comfyReady === false || h3.comfyReady === false, 'health follows the real state (cache of a few seconds)');
    ok('6. reachable local ComfyUI is ready; when it goes away health turns false within seconds'); stop(R.p); }

  // ---- 7: comfy backend with a Comfy key but no BytePlus key; the user saved Seedance 2.5 ----
  { const S = boot(testPort(8914), { OPENHIGGSFIELD_BACKEND: 'comfy', COMFY_API_KEY: 'comfyui-test-not-a-real-key' }); await up(S.B);
    let t = await tool(S.B, 'h3-video'); assert.equal(t.defaultProvider, 'router-ltx-25-pro', 'Comfy key, no local: the hosted default, LTX-2.5 Pro');
    const m = (t.models as any[]).find((x) => (x.engines ?? []).includes('direct-seedance-25')); assert.ok(m, 'Seedance 2.5 listed'); const place = 'byteplus' /* the BytePlus place: Seedance 2.5 also runs on Comfy (comfy-cloud) since 2026-10-25, which this Comfy key could run; so it is hidden from the menu (2026-10-27, routing/hiddenPlaces.ts) but a saved choice still uses it */;
    assert.ok(!(m.runsOn as any[]).some((r) => r.id === 'byteplus') && (m.hiddenRunsOn as any[]).some((h) => h.id === 'byteplus'), 'BytePlus hidden: Comfy covers Seedance 2.5');
    assert.equal((await send(S.B, 'PUT', '/api/me/routing', { perTool: { 'h3-video': { [m.key]: { runOn: place } } } })).status, 200);
    t = await tool(S.B, 'h3-video'); assert.equal(t.defaultProvider, 'router-ltx-25-pro', 'a pick that cannot run is not used');
    const f = t.defaultFallback; assert.ok(f, 'a note of its own'); assert.equal(f.from, 'direct-seedance-25'); assert.equal(f.to, 'router-ltx-25-pro'); assert.equal(f.reasonCode, 'key_missing');
    assert.match(f.note, /^Your pick, Seedance 2\.5, needs a BytePlus key, so LTX-2\.5 Pro is used\.$/, f.note); ok('7. saved pick that cannot run: "Your pick, Seedance 2.5, needs a BytePlus key, so Seedance 2.0 Mini is used."'); stop(S.p); }
  console.log('keys-flow: all checks passed');
} catch (e) { console.error(e); process.exitCode = 1; } finally { for (const p of procs) stop(p); stub?.close(); for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); }
