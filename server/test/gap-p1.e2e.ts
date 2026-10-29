// E2E (own mock server :8883, temp data dir): GAP-MATRIX backend P1s: saved looks CRUD, presets use counter + sort/search/prefill,
// job visibility + community shots feed (no report route), cinema options. Run: npx tsx test/gap-p1.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(8883); const B = `http://localhost:${PORT}`;
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'gp1-'));
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '300', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_USE_LOCAL: '1' }, stdio: 'ignore', detached: true });
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'gp1f-')); const png = path.join(T, 'r.png'), mp4 = path.join(T, 'a.mp4');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=854x480:rate=24', '-t', '4', '-pix_fmt', 'yuv420p', mp4]);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=512x512', '-frames:v', '1', png]);
const get = async (u: string) => { const r = await fetch(B + u); return { status: r.status, body: await r.json() as any }; };
const js = async (m: string, u: string, b?: unknown) => { const r = await fetch(B + u, { method: m, headers: b === undefined ? {} : { 'content-type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) }); return { status: r.status, body: await r.json().catch(() => null) as any }; };
const form = async (u: string, f: Record<string, string>, files: [string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); for (const [k, p] of files) fd.append(k, new Blob([fs.readFileSync(p)]), path.basename(p)); const r = await fetch(B + u, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
const done = async (id: string) => { for (let i = 0; i < 300; i++) { const j = (await get(`/api/jobs/${id}`)).body; if (['done', 'failed', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout ' + id); };
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); }
  // ---- 1. saved looks: GET / POST / GET :id / PATCH / DELETE, persisted ----
  { const ref = '/samples/sample-product.png';
    const c = await js('POST', '/api/looks', { name: 'Neon', refs: [ref], toolId: 'photo-fx' }); assert.equal(c.status, 201, JSON.stringify(c.body)); const id = c.body.id;
    assert.equal((await get(`/api/looks/${id}`)).body.name, 'Neon');
    const p = await js('PATCH', `/api/looks/${id}`, { name: 'Neon night', addRefs: ['/samples/sample-character.png'], toolId: null }); assert.equal(p.status, 200, JSON.stringify(p.body));
    assert.equal(p.body.name, 'Neon night'); assert.equal(p.body.refs.length, 2); assert.equal(p.body.toolId, null); assert.ok(p.body.updatedAt);
    assert.equal((await js('PATCH', `/api/looks/${id}`, { refs: [] })).status, 400); assert.equal((await js('PATCH', `/api/looks/${id}`, { refs: Array(11).fill(ref) })).status, 400);
    assert.equal((await js('PATCH', `/api/looks/${id}`, { refs: ['/files/nope.png'] })).status, 400);
    const cur = (await get('/api/looks')).body.items.find((x: any) => x.source !== 'mine'); if (cur) assert.equal((await js('PATCH', `/api/looks/${cur.id}`, { name: 'x' })).status, 404);
    assert.equal((await get('/api/looks?mine=1&q=night')).body.items.length, 1);
    assert.equal((await js('DELETE', `/api/looks/${id}`)).status, 200); assert.equal((await get(`/api/looks/${id}`)).status, 404);
    console.log('ok looks: POST 201 / GET :id / PATCH name+addRefs+toolId (validation 400, curated 404) / DELETE'); }
  // ---- 2. presets: uses counter, sort=popular, q, prefill ----
  { const ps = (await get('/api/presets?toolId=photo-fx')).body; const p0 = ps.items[0]; assert.ok(p0 && 'uses' in p0 && 'prefill' in p0 && p0.source === 'ours');
    const u1 = await js('POST', `/api/presets/${p0.id}/use`, { toolId: 'photo-fx' }); assert.equal(u1.status, 200, JSON.stringify(u1.body)); assert.equal(u1.body.picks, 1);
    const u2 = await js('POST', `/api/presets/${p0.id}/use`, { toolId: 'photo-fx' }); assert.equal(u2.body.picks, 2); assert.equal(u2.body.uses, u2.body.runs + 2);
    const pop = (await get('/api/presets?toolId=photo-fx&sort=popular')).body; assert.equal(pop.items[0].id, p0.id); assert.equal(pop.items[0].uses, u2.body.uses);
    assert.equal((await js('POST', '/api/presets/not-a-preset/use', {})).status, 404);
    const q = (await get(`/api/presets?toolId=photo-fx&q=${encodeURIComponent(p0.label.slice(0, 4))}`)).body; assert.ok(q.items.some((x: any) => x.id === p0.id));
    console.log(`ok presets: POST /use counts picks (uses=${u2.body.uses}), sort=popular, q search, prefill on every item`); }
  // ---- 3. visibility + community shots (report routes removed → 404) ----
  { const j = await form('/api/tools/create-image/jobs', { rights: '1', types: '["generate"]', provider: 'comfy-zimage-turbo', prompt: 'a red mug' }); assert.equal(j.status, 200, JSON.stringify(j.body)); await done(j.body.id);
    assert.equal((await get(`/api/jobs/${j.body.id}`)).body.visibility, 'private');
    const v = await js('POST', `/api/jobs/${j.body.id}/visibility`, { visibility: 'public', showPrompt: true }); assert.equal(v.status, 200, JSON.stringify(v.body));
    let feed = (await get('/api/community/shots?sort=new')).body; assert.ok(feed.items.some((x: any) => x.id === j.body.id));
    assert.equal((await js('POST', `/api/community/shots/${j.body.id}/report`, { reason: 'spam' })).status, 404, 'report route removed');
    feed = (await get('/api/community/shots?sort=new')).body; assert.ok(feed.items.some((x: any) => x.id === j.body.id), 'still listed');
    console.log('ok visibility default private → public shows in /api/community/shots; shot report route is gone (404)'); }
  // ---- 4. upscale target long edge ----
  { const sub = (f: Record<string, string>) => form('/api/tools/upscale/jobs', { rights: '1', types: '["precise"]', scale: '4', ...f }, [['video', mp4]]);
    const a = await sub({ targetLongEdge: '1920' }); assert.equal(a.status, 200, JSON.stringify(a.body)); const ja = (await get(`/api/jobs/${a.body.id}`)).body;
    const os = ja.input?.outputSize ?? ja.outputSize; assert.ok(os, 'outputSize on job: ' + Object.keys(ja).join(',')); assert.equal(Math.max(os.width, os.height), 1920, JSON.stringify(os));
    const q = await get('/api/models/quote?toolId=upscale&scale=4&width=854&height=480&seconds=4&targetLongEdge=1920'); assert.equal(q.status, 200, JSON.stringify(q.body)); assert.equal(q.body.credits, a.body.cost, `quote ${q.body.credits} = charge ${a.body.cost}`);
    const b = await sub({ target: '2560x1440' }); assert.equal(b.status, 200, JSON.stringify(b.body));
    for (const bad of [{ targetLongEdge: '9000' }, { targetLongEdge: '100' }, { target: 'big' }]) { const r = await sub(bad); assert.equal(r.status, 400, `${JSON.stringify(bad)} → ${r.status}`); }
    assert.equal((await get('/api/models/quote?toolId=upscale&scale=4&width=854&height=480&targetLongEdge=9000')).status, 400);
    await js('PUT', '/api/me/routing', { global: { mode: 'auto', allowFallback: false, useLocal: false, mockKeys: true } });
    // 2026-10-26: an exact size runs on the scale models in the cloud (FLUX Video Upscale); SeedVR2 on fal / Topaz take their fixed sizes only (shared/videoUpscale.ts)
    const qc = await get('/api/models/quote?toolId=upscale&model=direct-flux3-upscale&scale=2&width=854&height=480&seconds=4&targetLongEdge=1280'); const qf = await get('/api/models/quote?toolId=upscale&model=direct-flux3-upscale&scale=2&width=854&height=480&seconds=4');
    const cc = await sub({ targetLongEdge: '1280', scale: '2', provider: 'direct-flux3-upscale' });
    { const fx = await sub({ targetLongEdge: '1280', provider: 'comfy-seedvr2' }); assert.equal(fx.status, 400, 'SeedVR2 on fal: fixed sizes only'); assert.match(fx.body.error, /not an exact size/); } assert.equal(cc.status, 200, JSON.stringify(cc.body)); assert.equal(cc.body.cost, qc.body.credits, `cloud quote ${qc.body.credits} = charge ${cc.body.cost} (${cc.body.route})`);
    console.log(`ok cloud upscale: target 1280 at 2× quote ${qc.body.credits} = charge (${cc.body.route}); uncapped 2× quote ${qf.body.credits}`);
    await js('PUT', '/api/me/routing', { global: { useLocal: true } });
    console.log(`ok upscale targetLongEdge 1920 / target 2560x1440; out of range → 400; quote ${q.body.credits} = charge`); }
  // ---- 5. cinema options ----
  { const o = (await get('/api/cinema/options')).body; for (const k of ['cameras', 'lenses', 'apertures', 'movements', 'emotions', 'intensities', 'durations', 'resolutions', 'aspects', 'fields']) assert.ok(o[k] && (Array.isArray(o[k]) ? o[k].length : Object.keys(o[k]).length), k);
    assert.equal(o.defaultResolution, '1080p'); assert.ok(o.movements[0].tag.startsWith('#')); assert.ok(o.maxCount >= 1);
    console.log(`ok /api/cinema/options: ${o.cameras.length} cameras, ${o.lenses.length} lenses, ${o.movements.length} movements, durations ${o.durations.join('/')}`); }
  console.log('ALL OK gap-p1');
} finally { try { process.kill(-srv.pid!); } catch { /* */ } }
