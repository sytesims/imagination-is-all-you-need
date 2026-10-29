// BH11/BH12 + DP #21 + Cleanroom copy (Oct 19, Batch A): own mock server :9112 (temp data dir, temp examples folder).
//  - job details carry qualityLabel / aspectLabel (Medium, Best quality, Auto, 16:9), never the raw value
//  - /api/me/routing perModel pins carry modelName, routeLabel, provider, routeKind; global.modeLabel; PUT ignores them back
//  - Relight: only one of lightX/lightY → plain 400 code required; out of −1…1 → 400 out_of_range; both → 200
//  - Photo FX: aspect field + allowlist (tool.allowed.aspect; zz → 400 with a code; 9:16 → job input aspect 9:16)
//  - Anime Restyle: app.gallery.lockedStyle {field:'preset', id:'anime-cel', label}; Transitions prompt required:false
//  - per-option posterUrl / loopUrl / needsRealPoster (orbit, transition, presenter, relight direction) + GET /api/posters options;
//    a file dropped in the examples folder switches the option on
//  - Change Voice built-in voice: sampleUrl /examples/voice/builtin.mp3 (stand-in) + needsSample:false; every example placeholder:true
//  - Camera Moves description says 'start image' (no 'keyframe'); FPS Boost local route never demo / 'List price'
//  Run: npx tsx test/bh11.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'bh11-')); const EX = path.join(D, 'examples');
fs.mkdirSync(path.join(EX, 'options', 'orbit-shot'), { recursive: true }); fs.writeFileSync(path.join(EX, 'options', 'orbit-shot', 'orbit-full.jpg'), 'x'); fs.writeFileSync(path.join(EX, 'options', 'orbit-shot', 'orbit-full.mp4'), 'x');
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', HOST: '', OPENHIGGSFIELD_HOST: '', COMFY_BASE_URL: '' };
const ok = (m: string) => console.log('ok ' + m);
let proc: ChildProcess | null = null; const PORT = testPort(9112); const B = `http://localhost:${PORT}`;
const J = async (r: Response) => ({ status: r.status, body: (await r.json()) as any });
const get = (u: string) => fetch(B + u).then(J);
const png = path.join(D, 'i.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=s=1280x720', '-frames:v', '1', png]);
const submit = async (tool: string, f: Record<string, string>, files: [string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); for (const [k, p] of files) fd.append(k, new Blob([fs.readFileSync(p)], { type: 'image/png' }), path.basename(p)); return J(await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd })); };
const job = (id: string) => get(`/api/jobs/${id}`).then((r) => r.body);
try {
  const DD = path.join(D, 'data'); fs.mkdirSync(DD);
  proc = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: DD, OPENHIGGSFIELD_ENV_FILE: path.join(DD, '.env.local'), OPENHIGGSFIELD_EXAMPLES_DIR: EX,
    OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(DD, 'nf.json') } });
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); }
  const tools = (await get('/api/tools')).body; const T = (id: string) => (tools.items ?? tools).find((t: any) => t.id === id);
  // job labels
  { const r = await submit('create-image', { rights: '1', types: '["generate"]', prompt: 'a red apple', quality: 'Medium', aspect: '16:9' }); assert.equal(r.status, 200, JSON.stringify(r.body));
    const j = await job(r.body.id); assert.equal(j.qualityLabel, 'Medium'); assert.equal(j.aspectLabel, '16:9');
    const r2 = await submit('h3-video', { rights: '1', prompt: 'waves', quality: 'quality', types: '["t2v"]' }); assert.equal(r2.status, 200, JSON.stringify(r2.body));
    const j2 = await job(r2.body.id); assert.equal(j2.qualityLabel, 'Best quality'); assert.ok(j2.aspectLabel === null || j2.aspectLabel === 'Auto (matches your input)' || /^\d+:\d+$/.test(j2.aspectLabel), String(j2.aspectLabel));
    const r3 = await submit('photo-fx', { rights: '1', types: '["float"]', aspect: 'auto' }, [['image', png]]); assert.equal(r3.status, 200, JSON.stringify(r3.body)); assert.equal((await job(r3.body.id)).aspectLabel, 'Auto (matches your input)'); }
  ok('job qualityLabel / aspectLabel: Medium, Best quality (Mode=quality), Auto (matches your input)');
  // pins
  { const pr = (await get('/api/routes?toolId=create-image&modelId=comfy-qwen-image')).body; const rs = pr.routes[0].routes ?? pr.routes; const lr = rs.find((x: any) => x.kind === 'local') ?? rs[0];
    const put = await J(await fetch(`${B}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ perModel: { 'comfy-qwen-image': { route: lr.routeId } } }) }));
    assert.equal(put.status, 200, JSON.stringify(put.body)); const g = (await get('/api/me/routing')).body; const pin = g.perModel['comfy-qwen-image'];
    assert.equal(pin.route, lr.routeId); assert.ok(pin.modelName && !pin.modelName.includes(':'), JSON.stringify(pin)); assert.ok(pin.routeLabel && pin.routeLabel !== lr.routeId, JSON.stringify(pin)); assert.ok(pin.provider, JSON.stringify(pin)); assert.equal(pin.routeKind, lr.kind);
    assert.equal(g.global.modeLabel, 'Best ready place'); // Run on: global mode 'auto' = the pre-selected place, never shown as Auto
    const back = await J(await fetch(`${B}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(g) })); assert.equal(back.status, 200, JSON.stringify(back.body));
    const raw = JSON.parse(JSON.stringify(back.body)); assert.equal(raw.perModel['comfy-qwen-image'].route, lr.routeId);
    ok(`pins: ${JSON.stringify({ modelName: pin.modelName, routeLabel: pin.routeLabel, provider: pin.provider, routeKind: pin.routeKind })}; GET body PUT back → 200`); }
  // Relight
  { const one = await submit('app-relight', { rights: '1', lightX: '0.5' }, [['image', png]]); assert.equal(one.status, 400); assert.equal(one.body.code, 'required'); assert.match(one.body.error, /both lightX and lightY/);
    const far = await submit('app-relight', { rights: '1', lightX: '2', lightY: '0' }, [['image', png]]); assert.equal(far.status, 400); assert.equal(far.body.code, 'out_of_range');
    const both = await submit('app-relight', { rights: '1', lightX: '-1', lightY: '1' }, [['image', png]]); assert.equal(both.status, 200, JSON.stringify(both.body));
    const f = T('app-relight').app.gallery.fields.find((x: any) => x.name === 'lightX'); assert.equal(f.min, -1); assert.equal(f.max, 1); }
  ok('Relight: one of lightX/lightY → 400 required; 2 → 400 out_of_range; −1/1 → 200; range −1…1');
  // Photo FX aspect
  { const t = T('photo-fx'); for (const a of ['auto', '16:9', '9:16', '1:1']) assert.ok(t.allowed.aspect.includes(a), a); assert.deepEqual(t.inputs.find((i: any) => i.name === 'aspect').byProvider['comfy-open'], ['auto', '16:9', '9:16', '1:1']); assert.ok(t.inputs.some((i: any) => i.name === 'aspect'));
    const bad = await get('/api/tools/photo-fx/price?aspect=zz'); assert.equal(bad.status, 400); assert.ok(bad.body.code, JSON.stringify(bad.body));
    const s = await submit('photo-fx', { rights: '1', types: '["float"]', aspect: '9:16' }, [['image', png]]); assert.equal(s.status, 200, JSON.stringify(s.body)); assert.equal((await job(s.body.id)).input.aspect, '9:16');
    const sb = await submit('photo-fx', { rights: '1', types: '["float"]', aspect: '4:3' }, [['image', png]]); assert.equal(sb.status, 400); assert.ok(sb.body.code, JSON.stringify(sb.body)); }
  ok('Photo FX: aspect field (byProvider; local auto/16:9/9:16/1:1), zz → 400 invalid_aspect, 4:3 on the local graph → 400 unsupported, 9:16 runs');
  // Anime Restyle + Transitions
  { const ls = T('app-anime-restyle').app.gallery.lockedStyle; assert.equal(ls.field, 'preset'); assert.equal(ls.id, 'anime-cel'); assert.ok(ls.label && ls.label !== 'anime-cel', JSON.stringify(ls));
    const p = T('app-transition').inputs.find((i: any) => i.name === 'prompt'); assert.equal(p.required, false); }
  ok('Anime Restyle lockedStyle; Transitions prompt required:false');
  // option media
  { const orbit = T('app-orbit-shot').app.gallery.fields.find((f: any) => f.name === 'orbit').options; const full = orbit.find((o: any) => o.value === 'full'); const arc = orbit.find((o: any) => o.value === 'arc-left');
    assert.equal(full.posterUrl, '/examples/options/orbit-shot/orbit-full.jpg'); assert.equal(full.loopUrl, '/examples/options/orbit-shot/orbit-full.mp4'); assert.equal(full.needsRealPoster, false);
    assert.equal(arc.posterUrl, null); assert.equal(arc.loopUrl, null); assert.equal(arc.needsRealPoster, true);
    for (const [app, field] of [['app-transition', 'transition'], ['app-ugc-ad', 'presenter'], ['app-relight', 'direction']]) { const os2 = T(app).app.gallery.fields.find((f: any) => f.name === field).options; assert.ok(os2.length && os2.every((o: any) => 'posterUrl' in o && 'loopUrl' in o && o.needsRealPoster === true), app); }
    const ps = (await get('/api/posters')).body; assert.ok(Array.isArray(ps.items) && Array.isArray(ps.needsRealPoster));
    assert.ok(ps.options.some((o: any) => o.toolId === 'app-orbit-shot' && o.value === 'full' && !o.needsRealPoster)); assert.ok(ps.optionsNeedingPoster.includes('app-relight:direction:top')); assert.ok(!ps.optionsNeedingPoster.includes('app-orbit-shot:orbit:full'));
    assert.match(ps.options.find((o: any) => o.value === 'arc-left').file, /^web\/public\/examples\/options\/orbit-shot\/orbit-arc-left\.jpg$/); }
  ok('option posterUrl / loopUrl / needsRealPoster live from the examples folder; /api/posters options + optionsNeedingPoster');
  // voice sample + examples
  { const v = T('app-change-voice').inputs.find((i: any) => i.name === 'voice').choices.find((c: any) => c.value === 'builtin');
    assert.equal(v.sampleUrl, '/examples/voice/builtin.mp3'); assert.equal(v.needsSample, false); assert.equal(v.sampleKind, 'standin'); assert.equal(v.sampleIsStandIn, true);
    const ex = (await get('/api/examples')).body; assert.ok(ex.length > 10 && ex.every((e: any) => e.placeholder === true && e.real === false)); }
  ok('built-in voice sampleUrl stand-in + needsSample:false; every example placeholder:true');
  // Cleanroom copy + FPS Boost local
  { assert.match(T('camera').description, /start image/); assert.ok(!/keyframe/i.test(T('camera').description));
    const ts = T('camera').stages?.map((s: any) => (Array.isArray(s) ? s[1] : s.label)).join(' ') ?? ''; assert.ok(!/keyframe/i.test(ts), ts);
    const fb = (tools.items ?? tools).find((t: any) => (t.providers ?? []).some((p: any) => (p.id ?? p) === 'comfy-rife')); assert.ok(fb, 'FPS Boost tool');
    { const rs = (await get(`/api/routes?toolId=${fb.id}&modelId=comfy-rife`)).body; const all = JSON.stringify(rs); assert.ok(!/"demo":true/.test(all) && !/list price/i.test(all), all.slice(0, 400)); }
    { const q = (await get(`/api/tools/${fb.id}/price`)).body; assert.notEqual(q.demo, true, JSON.stringify(q)); assert.ok(!/list price/i.test(JSON.stringify(q)), JSON.stringify(q).slice(0, 300)); } }
  ok('Camera Moves copy says start image; FPS Boost quote never demo / list price');
  console.log('ALL OK bh11');
} finally { if (proc?.pid) try { process.kill(-proc.pid); } catch { /* gone */ } }
