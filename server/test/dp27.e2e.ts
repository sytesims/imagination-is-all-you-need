// DP #27 (Oct 19): provider-specific quotes keep defaultFallback; aspect unsupported_aspect {field,allowed,provider}
// on quote+submit (UGC Ad / Photo FX / Camera); voice sampleUrl on /api/tools, /api/apps, /api/voices; Restyle presets
// carry loopUrl/loopPlaceholder/needsRealLoop/standIn; demoTag 'Sample' next to demoLabel. Port :9127.
// Run: npx tsx test/dp27.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'dp27-')); const DD = path.join(D, 'data'); fs.mkdirSync(DD);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', HOST: '', OPENHIGGSFIELD_HOST: '', COMFY_BASE_URL: '' };
const ok = (m: string) => console.log('ok ' + m);
let proc: ChildProcess | null = null; const PORT = testPort(9127); const B = `http://localhost:${PORT}`;
const J = async (r: Response) => { const t = await r.text(); let body: any; try { body = JSON.parse(t); } catch { body = t; } return { status: r.status, body }; };
const get = (u: string) => fetch(B + u).then(J);
const png = path.join(D, 'i.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=s=1280x720', '-frames:v', '1', png]);
const mime = (p: string) => (p.endsWith('.wav') ? 'audio/wav' : p.endsWith('.mp4') ? 'video/mp4' : 'image/png');
const submit = async (tool: string, f: Record<string, string>, files: [string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); for (const [k, p] of files) fd.append(k, new Blob([fs.readFileSync(p)], { type: mime(p) }), path.basename(p)); return J(await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd })); };
try {
  proc = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: DD, OPENHIGGSFIELD_ENV_FILE: path.join(DD, '.env.local'),
    OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(DD, 'nf.json') } });
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); }
  const tools = (await get('/api/tools')).body; const T = (id: string) => (tools.items ?? tools).find((t: any) => t.id === id);

  // 1) provider-specific quote keeps preferredProvider / defaultProvider / defaultFallback
  { const ci = T('create-image'); assert.ok(ci.preferredProvider && ci.defaultProvider);
    const gen = await get('/api/tools/create-image/price'); assert.equal(gen.status, 200, JSON.stringify(gen.body));
    for (const k of ['preferredProvider', 'defaultProvider', 'defaultFallback'] as const) assert.ok(k in gen.body, `general quote.${k}`);
    const pin = ci.providers.find((p: any) => p.id !== ci.defaultProvider)?.id ?? ci.preferredProvider;
    const specific = await get(`/api/tools/create-image/price?provider=${encodeURIComponent(pin)}`); assert.equal(specific.status, 200, JSON.stringify(specific.body));
    assert.equal(specific.body.preferredProvider, gen.body.preferredProvider);
    assert.equal(specific.body.defaultProvider, gen.body.defaultProvider);
    assert.deepEqual(specific.body.defaultFallback, gen.body.defaultFallback);
    const mq = await get(`/api/models/quote?model=${encodeURIComponent(pin)}`); assert.equal(mq.status, 200, JSON.stringify(mq.body));
    assert.equal(mq.body.preferredProvider, gen.body.preferredProvider); assert.equal(mq.body.defaultProvider, gen.body.defaultProvider);
    assert.deepEqual(mq.body.defaultFallback, gen.body.defaultFallback); }
  ok('1 provider-specific quote (?provider= / models/quote) keeps preferredProvider, defaultProvider, defaultFallback');

  // 2) unsupported_aspect {field, allowed, provider} on quote + submit; malformed stays invalid_aspect
  { const shape = (b: any, allowed: string[], provider?: string | null) => {
      assert.equal(b.code, 'unsupported_aspect'); assert.equal(b.field, 'aspect'); assert.deepEqual(b.allowed, allowed);
      assert.ok('provider' in b, 'provider field'); if (provider != null) assert.equal(b.provider, provider);
    };
    // UGC Ad
    { const q = await get('/api/tools/app-ugc-ad/price?aspect=16:9'); assert.equal(q.status, 400); shape(q.body, ['9:16']);
      const s = await submit('app-ugc-ad', { rights: '1', prompt: 'ad', aspect: '16:9' }); assert.equal(s.status, 400); shape(s.body, ['9:16']);
      const bad = await get('/api/tools/app-ugc-ad/price?aspect=zzq'); assert.equal(bad.status, 400); assert.equal(bad.body.code, 'invalid_aspect'); }
    // Photo FX
    { const by = T('photo-fx').inputs.find((i: any) => i.name === 'aspect').byProvider;
      const lq = await get('/api/tools/photo-fx/price?provider=comfy-open&aspect=4:3'); assert.equal(lq.status, 400); shape(lq.body, by['comfy-open'], 'comfy-open');
      const lj = await submit('photo-fx', { rights: '1', types: '["float"]', provider: 'comfy-open', aspect: '4:3' }, [['image', png]]); assert.equal(lj.status, 400); shape(lj.body, by['comfy-open'], 'comfy-open');
      const mal = await get('/api/tools/photo-fx/price?provider=comfy-open&aspect=zz'); assert.equal(mal.status, 400); assert.equal(mal.body.code, 'invalid_aspect'); }
    // Camera (7:7 is well-formed but not on the union allowlist → unsupported_aspect with provider)
    { const cq = await get('/api/tools/camera/price?provider=comfy-open&aspect=7:7'); assert.equal(cq.status, 400); shape(cq.body, cq.body.allowed, 'comfy-open'); assert.ok(Array.isArray(cq.body.allowed) && cq.body.allowed.length > 0);
      const cj = await submit('camera', { rights: '1', provider: 'comfy-open', aspect: '7:7', types: '["push-in"]' }, [['image', png]]); assert.equal(cj.status, 400); assert.equal(cj.body.code, 'unsupported_aspect'); assert.equal(cj.body.field, 'aspect'); assert.ok('provider' in cj.body); assert.ok(Array.isArray(cj.body.allowed));
      const mal = await get('/api/tools/camera/price?aspect=nope'); assert.equal(mal.status, 400); assert.equal(mal.body.code, 'invalid_aspect'); } }
  ok('2 unsupported_aspect {field,allowed,provider} on quote+submit (UGC Ad, Photo FX, Camera); malformed → invalid_aspect');

  // 3) voice sampleUrl non-null on /api/tools, /api/apps, /api/voices
  { const v = T('app-change-voice').inputs.find((i: any) => i.name === 'voice').choices.find((c: any) => c.value === 'builtin');
    assert.equal(v.sampleUrl, '/examples/voice/builtin.mp3'); assert.equal(v.needsSample, false);
    const apps = (await get('/api/apps')).body.items as any[]; const cv = apps.find((a) => a.id === 'change-voice' || a.toolId === 'app-change-voice');
    assert.ok(cv, 'change-voice app'); const builtin = cv.inputOptions.voice.find((x: any) => x.value === 'builtin');
    assert.equal(builtin.sampleUrl, '/examples/voice/builtin.mp3'); assert.equal(builtin.needsSample, false);
    const one = (await get('/api/apps/change-voice')).body; assert.equal(one.inputOptions.voice.find((x: any) => x.value === 'builtin').sampleUrl, '/examples/voice/builtin.mp3');
    const voices = (await get('/api/voices')).body.voices as any[]; assert.ok(voices.length >= 2);
    for (const x of voices.filter((v) => v.id !== 'clone')) { assert.equal(x.sampleUrl, '/examples/voice/builtin.mp3', x.id); assert.equal(x.needsSample, false); }
    const clone = voices.find((v) => v.id === 'clone'); assert.equal(clone.sampleUrl, null); }
  ok('3 voice sampleUrl /examples/voice/builtin.mp3 on /api/tools, /api/apps, /api/voices (non-clone)');

  // 4) Restyle presets carry loop fields (same as /api/posters slots)
  { const rs = T('restyle').presets as any[]; assert.equal(rs.length, 23);
    assert.ok(rs.every((p) => 'loopUrl' in p && 'loopPlaceholder' in p && 'needsRealLoop' in p && 'standIn' in p), JSON.stringify(rs[0]));
    assert.ok(rs.every((p) => p.needsRealLoop === true && p.standIn === true), 'stand-ins until real files');
    const listed = (await get('/api/presets?toolId=restyle')).body.items as any[]; assert.equal(listed.length, 23);
    assert.ok(listed.every((p) => p.needsRealLoop === true && 'loopUrl' in p && 'standIn' in p));
    const slots = ((await get('/api/posters')).body.slots as any[]).filter((s) => s.toolId === 'restyle' && /^style:/.test(s.slot));
    assert.equal(slots.length, 23); assert.ok(slots.every((s) => s.needsRealLoop && s.standIn && 'loopUrl' in s));
    // single source: preset loopUrl matches the posters slot for the same style
    for (const p of rs) { const s = slots.find((x) => x.slot === `style:${p.id}`); assert.ok(s, p.id); assert.equal(s.loopUrl, p.loopUrl, p.id); assert.equal(s.standIn, p.standIn); } }
  ok('4 Restyle presets: loopUrl/loopPlaceholder/needsRealLoop/standIn on /api/tools, /api/presets, /api/posters (same source)');

  // 5) demoTag next to demoLabel / demoPreview
  { const q = await get('/api/tools/upscale/price'); // keyless cloud → demo on mock
    if (q.body.demo) { assert.equal(q.body.demoTag, 'Sample'); assert.ok(q.body.demoLabel); assert.ok(q.body.demoReason); }
    const demoProv = (T('upscale').providers as any[]).find((p) => p.demoPreview); assert.ok(demoProv, 'a demo provider'); assert.equal(demoProv.demoTag, 'Sample');
    const routes = (await get('/api/routes?toolId=upscale')).body; const row = (routes.routes as any[]).flatMap((m: any) => m.routes).find((r: any) => r.demo);
    if (row) assert.equal(row.demoTag, 'Sample');
    if (routes.via?.demoLabel) assert.equal(routes.via.demoTag, 'Sample'); }
  ok('5 demoTag "Sample" next to demoLabel on quotes/routes and next to demoPreview on providers');

  console.log('ALL dp27 ok');
} finally { if (proc?.pid) try { process.kill(-proc.pid, 'SIGKILL'); } catch { /* gone */ } try { fs.rmSync(D, { recursive: true, force: true }); } catch { /* ignore */ } }
