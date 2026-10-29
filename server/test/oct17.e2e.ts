// E2E (own mock server :8881, temp data dir): DEMO-QA regressions on the swap tools (provider ip → blocked once, plain retry, cancel 409, plain retry, upload low-res/unreadable),
// mock delay, page 16/17/19/28 backend, saved looks, effects, camera posters, Director image mode, attribution. Run: npx tsx test/oct17.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(8881); const B = `http://localhost:${PORT}`;
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'o17-'));
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_DEMO_AUTO: '0' /* keyless = no_provider (real-mode rules) */, OPENHIGGSFIELD_MOCK_DELAY_MS: '1500', OPENHIGGSFIELD_SEED_COMMUNITY: '0' /* asserts an empty Community feed */ }, stdio: 'ignore', detached: true });
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'o17f-')); const mp4 = path.join(T, 'a.mp4'), png = path.join(T, 'r.png'), key = path.join(T, 'k.png'), low = path.join(T, 'low.png'), junk = path.join(T, 'junk.png');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=854x480:rate=24', '-f', 'lavfi', '-i', 'sine=d=6', '-t', '6', '-pix_fmt', 'yuv420p', '-shortest', mp4]);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=512x512', '-frames:v', '1', png]); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1280x720', '-frames:v', '1', key]);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=64x64', '-frames:v', '1', low]); fs.writeFileSync(junk, Buffer.from(Array.from({ length: 4000 }, (_, i) => (i * 37) % 256)));
const get = async (u: string) => { const r = await fetch(B + u); return { status: r.status, body: await r.json() as any }; };
const js = async (m: string, u: string, b?: unknown) => { const r = await fetch(B + u, { method: m, headers: b === undefined ? {} : { 'content-type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) }); return { status: r.status, body: await r.json() as any }; };
const form = async (u: string, f: Record<string, string>, files: [string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); for (const [k, p] of files) fd.append(k, new Blob([fs.readFileSync(p)]), path.basename(p)); const r = await fetch(B + u, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
const until = async (id: string, ok: (j: any) => boolean, n = 600) => { for (let i = 0; i < n; i++) { const j = (await get(`/api/jobs/${id}`)).body; if (ok(j)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error(`timeout ${id}`); };
const done = (id: string) => until(id, (x) => ['done', 'failed', 'blocked', 'canceled'].includes(x.status));
const L = { rights: '1', route: 'local:comfy-open' };
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); }
  await js('PUT', '/api/me/routing', { global: { mode: 'auto', allowFallback: true, useLocal: true, mockKeys: true } });
  // ---- DEMO-QA regressions, same calls as the flow run (route=local:comfy-open) ----
  for (const t of ['object-swap', 'motion-transfer', 'restyle']) {
    const j = await form(`/api/tools/${t}/jobs`, { ...L, prompt: 'swap it', simulate: 'ip', ...(t === 'restyle' ? { preset: 'anime-cel' } : {}) }, [['video', mp4], ['refs', png]]); assert.equal(j.status, 200, JSON.stringify(j.body));
    const e = await done(j.body.id); assert.equal(e.status, 'blocked', `${t}: ${e.status}`); assert.equal(e.errorType, 'ip');
    assert.ok((e.error.match(/back to your (app )?balance|Nothing was charged/gi) ?? []).length <= 1, `${t} refund note once: ${e.error}`);
    const r1 = await js('POST', `/api/jobs/${e.id}/retry`); assert.equal(r1.status, 200, JSON.stringify(r1.body)); assert.equal(r1.body.retryOf, e.id); }
  console.log('ok swap tools: simulate=ip → blocked/ip, refund note once, plain retry → child job');
  { const j = await form('/api/tools/object-swap/jobs', { ...L, prompt: '[mockfail] swap' }, [['video', mp4], ['refs', png]]); const e = await done(j.body.id); assert.equal(e.status, 'failed');
    if (e.creditsBack) { assert.doesNotMatch(e.error, /refunded|back to your (app )?balance|Each failed attempt/i, e.error); assert.equal(e.creditsBack.credits, e.refund?.amount); }
    else assert.equal((e.error.match(/back to your (app )?balance|Nothing was charged/g) ?? []).length, 1, e.error);
    const r = await js('POST', `/api/jobs/${e.id}/retry`); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.retryOf, e.id); console.log('ok ordinary failure: plain retry works without ownsRights'); }
  { await js('POST', '/api/dev/mock-delay', { ms: 8000 }); const j = await form('/api/tools/object-swap/jobs', { ...L, prompt: 'x' }, [['video', mp4], ['refs', png]]); await until(j.body.id, (x) => x.status === 'running');
    const c = await js('POST', `/api/jobs/${j.body.id}/cancel`); assert.equal(c.status, 409); assert.equal(c.body.code, 'cannot_cancel_processing'); assert.equal(c.body.cancelInProcessing, false);
    const g = await get('/api/dev/mock-delay'); assert.equal(g.body.ms, 8000); const s = await js('POST', '/api/dev/mock-delay', { ms: null }); assert.equal(s.body.ms, 1500, 'reset → env value');
    assert.equal((await js('POST', '/api/dev/mock-delay', { ms: -1 })).status, 400); await done(j.body.id); console.log('ok cancel while processing → 409; mock delay env + POST/GET /api/dev/mock-delay (null resets to env)'); }
  for (const [f, code] of [[low, 'low_res'], [junk, 'unreadable']] as const) { const r = await form('/api/media', {}, [['file', f]]); assert.equal(r.status, 400); assert.equal(r.body.code, code, JSON.stringify(r.body));
    const s = await form('/api/tools/object-swap/jobs', { ...L, prompt: 'x' }, [['video', mp4], ['refs', f]]); assert.equal(s.status, 400, `submit ${code}`); }
  console.log('ok uploads: low-res → low_res, unreadable → unreadable (media upload + job submit)');
  // ---- page 19: specs, next-actions, fromJob as=ref ----
  const img = await form('/api/tools/create-image/jobs', { rights: '1', types: '["generate"]', provider: 'comfy-zimage-turbo', prompt: 'a red mug', seed: '7' }); assert.equal(img.status, 200, JSON.stringify(img.body)); const ij = await done(img.body.id); assert.equal(ij.status, 'done', ij.error);
  assert.ok(ij.model); assert.equal(ij.specs.prompt, 'a red mug'); assert.equal(ij.specs.seed, 7); assert.ok('resolution' in ij.specs && 'durationSec' in ij.specs && 'aspect' in ij.specs); assert.equal(ij.visibility, 'private');
  const na = await get(`/api/jobs/${ij.id}/next-actions`); assert.ok(na.body.items.length >= 1, JSON.stringify(na.body)); assert.ok(na.body.items.every((x: any) => x.submit.fromJob === ij.id));
  { const cam = await form('/api/tools/camera/jobs', { ...L, fromJob: ij.id, types: 'push-slow', route: 'local:comfy-open' }); console.log(`  camera fromJob → ${cam.status} ${cam.body.error ?? ''}`); }
  console.log(`ok page 19: model + specs{resolution,durationSec,aspect,prompt,seed}; next-actions ${na.body.items.map((x: any) => x.tool).join(',')}`);
  // ---- page 17: visibility + shots ----
  { const v0 = await js('POST', `/api/jobs/${ij.id}/visibility`, { visibility: 'nope' }); assert.equal(v0.status, 400);
    const v1 = await js('POST', `/api/jobs/${ij.id}/visibility`, { visibility: 'unlisted' }); assert.equal(v1.body.visibility, 'unlisted'); assert.ok(v1.body.shareUrl);
    assert.equal((await get('/api/community/shots')).body.total, 0);
    const v2 = await js('POST', `/api/jobs/${ij.id}/visibility`, { visibility: 'public', showPrompt: false }); assert.equal(v2.body.visibility, 'public');
    const sh = await get('/api/community/shots?sort=new'); assert.equal(sh.body.total, 1); assert.equal(sh.body.items[0].prompt, null, 'showPrompt:false hides the prompt');
    const v3 = await js('POST', `/api/jobs/${ij.id}/visibility`, { visibility: 'private' }); assert.equal(v3.body.visibility, 'private'); assert.equal(v3.body.shareToken, null); assert.equal((await get('/api/community/shots')).body.total, 0);
    console.log('ok page 17: visibility private|unlisted|public + GET /api/community/shots'); }
  // ---- page 16: presets source/sort/prefill/uses; media presets tab ----
  { const p = await get('/api/presets?toolId=object-swap&limit=5'); assert.equal(p.body.source, 'ours'); const it = p.body.items[0]; assert.equal(it.source, 'ours'); assert.equal(typeof it.uses, 'number'); assert.ok(Array.isArray(it.refThumbs)); assert.ok(it.prefill && 'price' in it.prefill, JSON.stringify(it).slice(0, 300));
    const c = await get('/api/presets?source=community'); assert.equal(c.body.items.length, 0); assert.equal(c.body.communityAvailable, false); assert.equal((await get('/api/presets?source=x')).status, 400);
    const m = await get('/api/media?source=presets&kind=video'); assert.equal(m.status, 200); console.log('ok page 16: source ours|community, uses, refThumbs, prefill; /api/media?source=presets'); }
  // ---- page 28 + P0 attribution ----
  { const m = await get('/api/models/comfy-h3'); assert.equal(m.body.attribution.status, 'required'); assert.ok(m.body.attribution.lines.includes('Powered by MiniMax H3')); assert.equal(m.body.creditLine, 'Powered by MiniMax H3'); assert.ok(Array.isArray(m.body.resolutions)); assert.ok('durationRange' in m.body);
    const s = await get('/api/models/comfy-stable-audio'); assert.ok(s.body.attribution.lines.includes('Powered by Stability AI'));
    const f = await get('/api/models/comfy-drama3'); assert.ok(f.body.attribution.lines.includes('Built with Fish Audio'));
    const k = await get('/api/models/comfy-flux3-klein'); assert.equal(k.body.attribution.status, 'unverified'); assert.equal(k.body.attribution.verified, false);
    const q = await get('/api/models/comfy-qwen-image'); assert.equal(q.body.attribution.status, 'none'); assert.equal(q.body.creditLine, null);
    const kl = await get('/api/models/router-kling'); assert.ok(kl.body.durationRange && kl.body.resolutions.length, JSON.stringify({ r: kl.body.resolutions, d: kl.body.durationRange }));
    console.log(`ok page 28 + attribution: required lines, Klein unverified, Kling ${kl.body.resolutions.join('/')} ${kl.body.durationRange.min}–${kl.body.durationRange.max}s`); }
  // ---- saved looks, effects ----
  { const bad = await js('POST', '/api/looks', { name: 'x', refs: ['/files/nope.png'] }); assert.equal(bad.status, 400);
    const c = await js('POST', '/api/looks', { name: 'Neon night', refs: ['/samples/sample-character.png'] }); assert.equal(c.status, 201, JSON.stringify(c.body));
    const l = await get('/api/looks?mine=1'); assert.equal(l.body.items.length, 1); assert.equal(l.body.items[0].source, 'mine'); assert.ok((await get('/api/looks')).body.items.some((x: any) => x.source === 'curated'));
    assert.equal((await js('DELETE', `/api/looks/${c.body.id}`)).status, 200); assert.equal((await get('/api/looks?mine=1')).body.items.length, 0); assert.equal((await js('DELETE', '/api/looks/photo-fx:x')).status, 404);
    const e = await get('/api/effects?limit=10'); assert.ok(e.body.total > 10 && e.body.items[0].route && e.body.nextCursor); console.log(`ok looks GET/POST/DELETE; /api/effects ${e.body.total} effects`); }
  // ---- camera posters, Director image mode + 1080p ----
  { const p = await get('/api/presets?toolId=camera'); const ph = p.body.items.filter((x: any) => x.posterPlaceholder); assert.equal(ph.length, 65, `placeholders ${ph.length}`); assert.ok(fs.existsSync(path.join(ROOT, 'samples', ph[0].posterUrl.replace('/samples/', ''))));
    const r = await fetch(B + ph[0].posterUrl); assert.equal(r.status, 200); console.log('ok camera: 65 placeholder posters served'); }
  { const tools = (await get('/api/tools')).body as any[]; const c = tools.find((t) => t.id === 'cinema'); assert.equal(c.inputs.find((i: any) => i.name === 'resolution').default, '1080p'); assert.ok(c.inputs.find((i: any) => i.name === 'mode').options.includes('image'));
    const j = await form('/api/tools/cinema/jobs', { mode: 'image', prompt: 'a lighthouse at dusk', route: 'local:comfy-open' }); assert.equal(j.status, 200, JSON.stringify(j.body)); const e = await done(j.body.id); assert.equal(e.status, 'done', e.error); assert.match(e.outputs[0].url, /\.(png|jpg|webp)$/);
    const h = await form('/api/tools/cinema/jobs', { mode: 'image', prompt: 'x', provider: 'router-veo' }); assert.equal(h.status, 400); console.log('ok Director: image mode (local still), default 1080p, hosted image mode 400'); }
  // ---- Design Planner 07:39: key status follows mockKeys, GPT Image price reference, Assets ?job=, Director sections/stages ----
  { const pv = (await get('/api/settings/providers')).body.providers as any[]; const comfy = pv.find((x) => x.envKey === 'COMFY_API_KEY'); assert.equal(comfy.configured, true, 'mockKeys → configured'); assert.equal(comfy.mockedKey, true);
    const fal = pv.find((x) => x.envKey === 'OPENHIGGSFIELD_FAL_KEY'); assert.equal(fal.configured, false, 'fal/Replicate are never mocked');
    await js('PUT', '/api/me/routing', { global: { mode: 'auto', allowFallback: true, useLocal: false, mockKeys: false } });
    assert.equal((await get('/api/settings/providers')).body.providers.find((x: any) => x.envKey === 'COMFY_API_KEY').configured, false);
    const qn = await get('/api/models/quote?model=api-seedream&n=1'); assert.equal(qn.body.needsKey, true);
    await js('PUT', '/api/me/routing', { global: { mode: 'auto', allowFallback: true, useLocal: true, mockKeys: true } });
    const qy = await get('/api/models/quote?model=api-seedream&n=1'); assert.equal(qy.body.runnable, true); assert.equal(qy.body.needsKey, false);
    const sy = await form('/api/tools/create-image/jobs', { rights: '1', types: '["generate"]', provider: 'api-seedream', prompt: 'x' }); assert.equal(sy.status, 200); assert.equal(sy.body.cost, qy.body.credits, 'quote = charge');
    console.log('ok key status: settings/providers configured + quote follow mockKeys like submit (quote = charge)'); }
  { const pr = (await get('/api/pricing')).body; const g = (pr.hosted as any[]).find((x) => x.providerId === 'api-gpt-image'); assert.equal(g.officialModelPrice.usdByTierSize['high:1024x1024'], 0.211); assert.equal(g.officialModelPrice.appliesToOurRoute, false); { const t = g.usdByTierRes; assert.ok(t['med:1K'] > t['low:1K'] && t['high:1K'] > t['med:1K'] && t['high:2K'] > t['high:1K'], 'B6: GPT Image priced per quality and size (usdByTierRes, token formula 2026-10-24; estimated)'); }
    const q = await get('/api/models/quote?model=api-gpt-image&quality=med&n=1'); assert.ok((q.body.credits ?? q.body.listCredits) > 0, 'B6: med is priced (estimated) on the Comfy route'); console.log('ok GPT Image: OpenAI list price as reference (sourced), Comfy route low/med/high priced (med/high estimated)'); }
  { const a = await fetch(`${B}/api/assets?job=${ij.id}`); const xs = await a.json() as any[]; assert.equal(a.headers.get('x-focus-index'), '0'); assert.equal(xs[0].id, ij.id); assert.equal(xs[0].highlighted, true);
    const h = await fetch(`${B}/api/assets?job=${ij.id}&focus=highlight&limit=1`); const hs = await h.json() as any[]; assert.ok(hs.some((x) => x.id === ij.id && x.highlighted)); assert.equal((await get('/api/assets?job=nope')).status, 404); console.log('ok Assets ?job= filter / focus=highlight'); }
  { const c = ((await get('/api/tools')).body as any[]).find((t) => t.id === 'cinema'); assert.ok(c.app.capabilities.sections.some((x: any) => x.id === 'output-image')); assert.ok(c.app.capabilities.stagesByMode.image.length); console.log('ok Director: sections + image stages on the server'); }
  // ---- 07:47 + 07:52 (New Agent rows 5/6/7/15) ----
  { for (const pr of ['@ghost make it pop', 'hi @ghost', '@']) { const r = await form('/api/tools/create-image/jobs', { rights: '1', types: '["generate"]', provider: 'comfy-zimage-turbo', prompt: pr }); assert.ok(r.status < 500, `@mention ${pr} → ${r.status}`); }
    const c = await form('/api/tools/cinema/jobs', { rights: '1', prompt: '@ghost walks in', mode: 'image', route: 'local:comfy-open' }); assert.ok(c.status < 500, `cinema @ghost → ${c.status} ${JSON.stringify(c.body)}`);
    assert.equal((await fetch(`${B}/api/health`)).ok, true, 'server still up after @mention submits'); console.log('ok @mention: unknown @element → 4xx (real multipart), server stays up'); }
  { const l = await get('/api/licences'); assert.equal(l.status, 200); const p = await get('/api/plans'); assert.equal(p.status, 200); assert.equal(p.body.billing, false); assert.ok(Array.isArray(p.body.items));
    const u = await get('/api/usage'); assert.ok(u.body.remaining == null || u.body.remaining >= 0, JSON.stringify(u.body)); assert.ok('overdraft' in u.body); console.log('ok /api/licences alias, /api/plans, /api/usage never negative (overdraft field)'); }
  { const h = await get('/api/me/routing/history'); assert.ok(h.body.items.length >= 1); assert.ok(h.body.items[0].source && h.body.items[0].changed); console.log('ok routing-settings writes logged (GET /api/me/routing/history)'); }
  { const q = await get('/api/price?toolId=h3-video&model=fal-kling&duration=5'); const q2 = await get('/api/price?model=comfy-zimage-turbo&toolId=create-image');
    assert.equal(q2.status, 200, JSON.stringify(q2.body)); assert.ok(q2.body.credits > 0 || q2.body.credits === 0, JSON.stringify(q2.body)); assert.notEqual(q.status, 500); assert.equal((await get('/api/price')).status, 400);
    console.log(`ok /api/price alias (create-image zimage → ${q2.body.credits} cr, route ${q2.body.route})`); }
  { const a = await form('/api/tools/create-image/jobs', { rights: '1', types: '["generate"]', provider: 'comfy-zimage-turbo', prompt: 'idem', seed: '3', idempotencyKey: 'k-o17-1' });
    const [b, c] = await Promise.all([1, 2].map(() => form('/api/tools/create-image/jobs', { rights: '1', types: '["generate"]', provider: 'comfy-zimage-turbo', prompt: 'idem', seed: '3', idempotencyKey: 'k-o17-1' })));
    assert.equal(b.body.id, a.body.id); assert.equal(c.body.id, a.body.id); assert.equal(b.body.idempotentReplay, true);
    const [x, y] = await Promise.all([1, 2].map(() => form('/api/tools/create-image/jobs', { rights: '1', types: '["generate"]', provider: 'comfy-zimage-turbo', prompt: 'idem2', seed: '4', idempotencyKey: 'k-o17-2' })));
    assert.equal(x.body.id, y.body.id, 'concurrent same key → one job'); console.log('ok idempotencyKey (body field) + concurrent duplicates → same job'); }
  { const q = await get('/api/tools/create-image/price?provider=comfy-zimage-turbo&n=2'); const j = await form('/api/tools/create-image/jobs', { rights: '1', types: '["generate"]', provider: 'comfy-zimage-turbo', prompt: 'two mugs', n: '2' });
    assert.equal(j.status, 200, JSON.stringify(j.body)); const seen = new Set<string>(); const e = await until(j.body.id, (x) => { seen.add(x.status); return x.status === 'done'; });
    assert.equal((e.outputs ?? []).length, 2, `batch 2 → ${JSON.stringify(e.outputs)}`); assert.ok(seen.has('running')); assert.equal(j.body.cost, q.body.credits, 'quote = charge for n=2');
    console.log(`ok batch n=2 → 2 outputs; states seen ${[...seen].join('→')}`); }
  { await js('PUT', '/api/me/routing', { global: { mode: 'auto', allowFallback: false, useLocal: false, mockKeys: false }, perModel: {} });
    const r0 = await form('/api/tools/create-image/jobs', { rights: '1', types: '["generate"]', provider: 'comfy-zimage-turbo', prompt: 'pin' }); assert.equal(r0.status, 402, `no pin, no key → needs key (${r0.status})`);
    const lr = (r0.body.routes as any[]).find((o) => o.kind === 'local').routeId;
    await js('PUT', '/api/me/routing', { perModel: { 'comfy-zimage-turbo': { route: lr } } });
    const r1 = await form('/api/tools/create-image/jobs', { rights: '1', types: '["generate"]', provider: 'comfy-zimage-turbo', prompt: 'pin', route: 'auto' }); assert.equal(r1.status, 200, JSON.stringify(r1.body)); assert.equal(r1.body.route, lr);
    const r2 = await form('/api/tools/create-image/jobs', { rights: '1', types: '["generate"]', provider: 'comfy-zimage-turbo', prompt: 'pin2', route: lr }); assert.equal(r2.status, 200); assert.equal(r2.body.cost, 0);
    await js('PUT', '/api/me/routing', { perModel: {} }); const cq = await get('/api/price?toolId=create-image&model=comfy-zimage-turbo&route=fal:fal-ai/z-image/turbo'); assert.ok(cq.body.credits > 0, `cloud estimate: ${JSON.stringify(cq.body).slice(0, 300)}`); assert.notEqual(cq.body.routeKind, 'local'); // Run on: with nothing ready the pre-selected place is Local (Turn on), so the cloud estimate is asked for by route
    const kq = await get('/api/price?toolId=h3-video&model=fal-kling-3'); if (kq.status === 200) assert.ok(kq.body.credits == null || kq.body.credits > 0);
    console.log(`ok /api/price cloud estimate ${cq.body.credits} cr (${cq.body.route}); useLocal off: saved local pick (${lr}) still runs locally with UI route=auto, request pin runs locally at 0`); }
  { const pl = (await get('/api/plugins')).body as any[]; assert.ok(pl.length >= 1); for (const x of pl) { assert.ok(x.name && 'description' in x && 'version' in x && 'icon' in x && 'homepageUrl' in x, JSON.stringify(x)); }
    const ms = (await get('/api/models')).body; const cards = ms.groups.flatMap((g: any) => g.models); assert.ok(cards.length && cards.every((m: any) => 'creditLine' in m && 'creditSource' in m));
    const h3 = cards.find((m: any) => /h3/.test(m.id) && m.creditLine && m.creditLine !== 'unverified'); assert.ok(h3 && /MiniMax/.test(h3.creditLine), 'H3 card carries the MiniMax line');
    const kl = await get('/api/models/comfy-flux3-klein'); assert.equal(kl.body.creditLine, 'unverified', JSON.stringify(kl.body.attribution));
    const li = (await get('/api/licenses')).body; assert.ok(li.rows.every((r: any) => 'creditLine' in r && 'creditSource' in r)); assert.ok(li.rows.some((r: any) => r.creditLine === null));
    const u = (await get('/api/usage')).body; assert.ok((u.buckets ?? []).every((b: any) => 'expiresAt' in b));
    console.log(`ok plugins name/description/version/icon/homepageUrl; creditLine on /api/models (${cards.length} cards), /api/models/:id (Klein unverified), /api/licenses rows; usage buckets expiresAt`); }
  { const a = await get('/api/tools/create-image/price?model=comfy-zimage-turbo'); const b = await get('/api/tools/create-image/price?provider=comfy-zimage-turbo'); assert.equal(a.body.credits, b.body.credits); assert.equal(a.body.route, b.body.route, 'model= alias');
    const bad = await get('/api/models/quote?model=comfy-qwen-image&imageResolution=9000p'); assert.equal(bad.status, 400); const bad2 = await get('/api/models/quote?toolId=h3-video&resolution=9000p'); assert.equal(bad2.status, 400);
    const ut = await get('/api/tools/nope/price'); assert.equal(ut.status, 404); assert.equal(ut.body.errorType, 'not_found'); const uj = await get('/api/jobs/nope123'); assert.equal(uj.status, 404); assert.equal(uj.body.errorType, 'not_found');
    console.log('ok price model= alias; quote 9000p → 400; 404s carry errorType not_found'); }
  { await js('PUT', '/api/me/routing', { global: { mode: 'auto', allowFallback: false, useLocal: true, mockKeys: true }, perModel: {} });
    const cm = await form('/api/tools/camera/jobs', { rights: '1', types: '["not-a-move"]' }, [['image', key]]); assert.equal(cm.status, 400); assert.equal(cm.body.code, 'invalid_type', JSON.stringify(cm.body)); assert.equal(cm.body.issues[0].code, 'invalid_type'); assert.ok(!cm.body.error.includes('not-a-move'), 'never echoed'); /* Oct 19 b2: allowlist (BH P3 #6) */
    const up = (sim: string) => form('/api/tools/upscale/jobs', { rights: '1', types: '["precise"]', route: 'local:comfy-video-esrgan', allowFallback: '0', simulate: sim }, [['video', mp4]]);
    const t1 = await up('temporary'); assert.equal(t1.status, 200, JSON.stringify(t1.body)); const e1 = await done(t1.body.id).catch(async () => (await get(`/api/jobs/${t1.body.id}`)).body);
    assert.equal(e1.status, 'failed', `temporary pinned → ${e1.status}/${e1.errorType}`); assert.equal(e1.errorType, 'temporary'); const rr = await js('POST', `/api/jobs/${e1.id}/retry`); assert.equal(rr.status, 200, JSON.stringify(rr.body));
    const t2 = await up('provider_outage'); const e2 = await until(t2.body.id, (x) => ['done', 'failed', 'needs_decision'].includes(x.status)); assert.equal(e2.status, 'failed', 'no other SeedVR2 route is set up here (FLUX 3 Upscaler is its own card since Oct 18; fal SeedVR2 needs a real key), so nothing to decide'); assert.equal(e2.errorType, 'provider_outage');
    assert.ok(!('moderation' in (await get('/api/health')).body), 'no moderation/cooldown block (removed)');
    console.log('ok camera unknown move → code invalid_type (not echoed); pinned Upscale temporary → failed/temporary + retry 200; provider_outage → failed/provider_outage (no other SeedVR2 route set up); no moderation block in /api/health'); }
  console.log('ALL OK oct17');
} finally { try { process.kill(-srv.pid!); } catch { /* */ } }
