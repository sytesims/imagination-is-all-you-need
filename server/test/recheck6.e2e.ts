// Bug Hunter PB re-check 6 (f133dfd): local routes are never demo (FPS Boost RIFE etc.); enum values normalised case-insensitively on quote + submit;
// quality labels/synonyms; tools without quality values say "isn't a setting". Throwaway mock server :8995 (no keys, Use local off), temp data.
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'rc6-')); const B = `http://localhost:${testPort(8995)}`;
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_LUMA_API_KEY: '' };
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, ...NOKEYS, PORT: String(testPort(8995)), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, '.env.local'), OPENHIGGSFIELD_BACKEND: 'mock',
  OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json') } });
const ok = (m: string) => console.log('ok ' + m);
const get = async (u: string) => { const r = await fetch(B + u); return { status: r.status, body: (await r.json()) as any }; };
const form = async (u: string, f: Record<string, string>, files: [string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); for (const [k, fp] of files) fd.append(k, new Blob([fs.readFileSync(fp)]), path.basename(fp)); const r = await fetch(B + u, { method: 'POST', body: fd }); return { status: r.status, body: (await r.json()) as any }; };
const done = async (id: string) => { let j: any; for (let i = 0; i < 300; i++) { j = (await get(`/api/jobs/${id}`)).body; if (['done', 'failed', 'blocked', 'needs_decision', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } return j; };
const MP4 = path.join(D, 'clip.mp4'); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=854x480:rate=24', '-t', '5', '-pix_fmt', 'yuv420p', MP4]);
try {
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); }
  // P2: no local route is ever a demo (lists, menu, quote, job)
  { const all = (await get('/api/routes')).body.routes.flatMap((m: any) => m.routes); const bad = all.filter((r: any) => r.kind === 'local' && (r.demo || r.status === 'Sample')); assert.deepEqual(bad.map((r: any) => r.routeId), []);
    const menu = (await get('/api/edit-video/tools')).body.tools.flatMap((t: any) => t.models.flatMap((m: any) => m.routes)); assert.deepEqual(menu.filter((r: any) => r.kind === 'local' && (r.demo || r.status === 'Sample')).map((r: any) => r.routeId), []);
    // FPS Boost has a fal RIFE route too (tools/editVideo/index.ts): with Use local off and no keys, the sample runs there; the local row says "turn it on", never "Sample"
    const fr = menu.find((r: any) => r.routeId === 'local:comfy-rife'); if (fr) { assert.equal(fr.runnable, false); assert.equal(fr.reasonCode, 'local_off'); assert.ok(!fr.demo); assert.match(fr.priceLine, /^Turn on Your computer/); }
    const q = (await get('/api/tools/fps-boost/price')).body; assert.equal(q.routeKind, 'fal', JSON.stringify(q)); assert.equal(q.demo, true); assert.equal(q.credits, 0);
    const s = await form('/api/tools/fps-boost/jobs', { rights: '1', types: '["60"]' }, [['video', MP4]]); assert.equal(s.status, 200, JSON.stringify(s.body)); assert.equal(s.body.cost, 0); assert.equal(s.body.route, q.route);
    const j = await done(s.body.id); assert.equal(j.status, 'done'); assert.equal(j.demo, true, 'a cloud sample');
    ok(`P2: 0 local routes flagged demo in /api/routes (${all.filter((r: any) => r.kind === 'local').length} local) and the Edit Video menu; FPS Boost local row local_off, quote ${q.route} a free sample`); }
  // P3 case: types/mode/quality/resolution/aspect/scale normalised on quote AND submit
  { const q = await get('/api/tools/create-image/price?types=GENERATE&quality=HIGH&aspect=AUTO&resolution=720P&provider=api-ideogram'); assert.equal(q.status, 200, JSON.stringify(q.body)); // a model that takes Auto and quality tiers (the keyless default, Nano Banana 2.1, has none)
    const s = await form('/api/tools/create-image/jobs', { rights: '1', prompt: 'a mug', types: '["GENERATE"]', resolution: '1080P' }); assert.equal(s.status, 200, JSON.stringify(s.body)); const j = await done(s.body.id); assert.deepEqual(j.input.types, ['generate']);
    assert.equal((await get('/api/tools/upscale/price?mode=PRECISE&scale=X2')).status, 200);
    const u = await form('/api/tools/upscale/jobs', { rights: '1', types: '["Precise"]' }, [['video', MP4]]); assert.equal(u.status, 200, JSON.stringify(u.body));
    const cam = await form('/api/tools/camera/jobs', { rights: '1', types: '["LTX-DOLLY-IN"]', prompt: 'x' }); assert.equal(cam.status, 200, JSON.stringify(cam.body)); const cj = await done(cam.body.id); assert.equal(cj.status, 'done');
    const ua = await fetch(`${B}/api/jobs/${cam.body.id}/upscale`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'PRECISE' }) }); const ub = await ua.json() as any; assert.equal(ua.status, 200, JSON.stringify(ub)); assert.equal(ub.mode, 'precise');
    const bad = await fetch(`${B}/api/jobs/${cam.body.id}/upscale`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'ultra' }) }); const bb = await bad.json() as any; assert.equal(bad.status, 400); assert.equal(bb.code, 'invalid_mode'); assert.match(bb.error, /mode isn't on the list/);
    const empty = await form('/api/tools/create-image/jobs', { rights: '1', prompt: 'x', types: '[]' }); assert.equal(empty.status, 400); assert.ok(empty.body.code, JSON.stringify(empty.body));
    ok('P3 case: types=GENERATE / quality=HIGH (quote) / resolution=1080P / aspect=AUTO / mode=PRECISE / scale=X2 price and submit (stored as generate); upscale action PRECISE → 200 (mode precise), ultra → 400 invalid_mode; every rejection has a code'); }
  // P3 quality: labels + synonyms; tools without their own quality values
  { for (const v of ['Medium', 'medium', 'MED', 'Low', 'High']) assert.equal((await get(`/api/tools/create-image/price?quality=${v}&provider=api-ideogram`)).status, 200, v); /* a model with quality tiers (the keyless default, Nano Banana 2.1, has none) */
    const s = await form('/api/tools/create-image/jobs', { rights: '1', prompt: 'x', types: '["generate"]', provider: 'api-gpt-image', quality: 'Medium' }); assert.equal(s.status, 200, JSON.stringify(s.body)); assert.notEqual(s.body.code, 'invalid_quality'); // Medium passes the allowlist; B6: GPT Image med is priced (estimated), so it submits
    const r = await get('/api/tools/remove-bg/price?quality=high'); assert.equal(r.status, 400); assert.equal(r.body.code, 'invalid_quality'); assert.deepEqual(r.body.allowed, []); assert.equal(r.body.error, "Quality isn't a setting for this tool. Leave it out."); assert.ok(!/Pick 720p/.test(r.body.error));
    assert.equal((await get('/api/tools/remove-bg/price?quality=720p')).status, 200, 'resolution alias still accepted');
    const h = await get('/api/tools/h3-video/price?quality=nope'); assert.equal(h.status, 400); assert.deepEqual(h.body.allowed, ['quality', 'fast']); assert.equal(h.body.error, "Quality nope isn't supported here. Pick Quality or Fast.");
    ok('P3 quality: Medium/medium/MED/Low/High accepted (Medium → med); remove-bg quality=high → allowed [] "isn\'t a setting"; 720p alias kept; h3-video lists its own labels'); }
  console.log('ALL OK recheck6');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } await new Promise((r) => setTimeout(r, 600)); try { fs.rmSync(D, { recursive: true, force: true }); } catch { /* still writing */ } }
