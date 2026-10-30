// E2E (own mock server): backend gap fixes (P0). Run: npx tsx test/backend-gaps.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const PORT = testPort(8831), B = `http://localhost:${PORT}`, D = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-'));
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BILLING_MODE: 'team', OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FAL_KEY: 'mock-test', OPENHIGGSFIELD_REPLICATE_API_TOKEN: 'mock-test', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '1' /* runnable gate: a real Comfy key makes partner nodes not_wired; the mock-keys simulation keeps the pricing mechanics testable */, OPENHIGGSFIELD_MAX_QUEUED: '200', MAX_QUEUED: '200' }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await fetch(B + u)).json();
const bal = async () => (await get('/api/ledger')).balance;
const post = async (tool: string, f: Record<string, string>, files: [string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); for (const [k, p] of files) fd.append(k, new Blob([fs.readFileSync(p)]), path.basename(p)); const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() }; };
const wait = async (id: string) => { for (let i = 0; i < 600; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 500)); } throw new Error('timeout ' + id); };
const tool = async (id: string) => (await get('/api/tools')).find((t: any) => t.id === id);
const field = (b: any) => b.issues?.[0]?.field; const code = (b: any) => b.issues?.[0]?.code;
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); }
  await fetch(`${B}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ global: { mode: 'auto', allowFallback: true, useLocal: true, mockKeys: true } }) });
  const mp4 = path.join(D, 'src.mp4'), ref = path.join(D, 'ref.mp4'), png = path.join(D, 'ref.png'), key = path.join(D, 'key.png');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=854x480:rate=24', '-f', 'lavfi', '-i', 'sine=d=5', '-t', '5', '-pix_fmt', 'yuv420p', '-shortest', mp4]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=24', '-t', '3', '-pix_fmt', 'yuv420p', ref]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=512x512', '-frames:v', '1', png]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1280x720', '-frames:v', '1', key]);
  const R = { rights: '1' };

  // P0-1: trash revokes the share link; restore does not revive it
  { const j = await post('object-swap', { ...R, prompt: 'swap' }, [['video', mp4], ['refs', png]]); assert.equal(j.status, 200, JSON.stringify(j.body)); const w0 = await wait(j.body.id); assert.equal(w0.status, 'done', JSON.stringify(w0).slice(0, 600));
    const sh = await (await fetch(`${B}/api/jobs/${j.body.id}/share`, { method: 'POST' })).json(); assert.equal((await fetch(`${B}/api/share/${sh.token}`)).status, 200, JSON.stringify(sh));
    await fetch(`${B}/api/jobs/${j.body.id}`, { method: 'DELETE' }); assert.equal((await fetch(`${B}/api/share/${sh.token}`)).status, 404);
    await fetch(`${B}/api/jobs/${j.body.id}/restore`, { method: 'POST' }); assert.equal((await fetch(`${B}/api/share/${sh.token}`)).status, 404); assert.equal((await fetch(`${B}/api/share/${sh.token}/download.zip`)).status, 404);
    assert.ok(!(await get(`/api/jobs/${j.body.id}`)).shareToken); console.log('ok P0 trash revokes share; restore keeps it off'); }
  // P0-2: licence credit lines
  { const l = await get('/api/licenses'); assert.ok(l.attributions.includes('Powered by MiniMax H3')); assert.ok(l.models.some((m: any) => m.attribution === 'Powered by MiniMax H3')); assert.ok(l.models.every((m: any) => 'attribution' in m)); console.log('ok P0 licence attribution:', l.attributions.join(' | ')); }

  // 07/08/09 batch: count versions, price × count, per-version refund
  for (const tool of ['object-swap', 'motion-transfer', 'restyle']) {
    const extra = tool === 'restyle' ? { preset: 'anime-cel' } : {};
    const q = await get(`/api/tools/${tool}/price?provider=router-seedance&duration=5&resolution=720p&passes=3`);
    const b0 = await bal(); const j = await post(tool, { ...R, ...extra, prompt: 'x', count: '3', provider: 'router-seedance', simulateGroup: '2' }, [['video', mp4], ['refs', png]]);
    assert.equal(j.status, 200, JSON.stringify(j.body)); const charged = b0 - (await bal()); assert.ok(charged > 0); assert.equal(charged, q.credits, `${tool} quote passes=3 = charge`);
    const d = await wait(j.body.id); assert.equal(d.status, 'done'); assert.equal(d.outputs.length, 2); assert.ok(d.partial); assert.deepEqual(d.failedGroups, [2]);
    assert.equal(d.refund.amount, Math.round(charged / 3)); assert.ok(d.outputs[0].label.startsWith('Version 1'));
    const bad = await post(tool, { ...R, ...extra, prompt: 'x', count: '5' }, [['video', mp4], ['refs', png]]); assert.equal(bad.status, 400); assert.equal(field(bad.body), 'count');
    console.log(`ok ${tool} count=3 → ${charged} credits (= quote), version 2 failed → refunded ${d.refund.amount}`);
  }
  { const local = await post('object-swap', { ...R, prompt: 'x', count: '2', provider: 'comfy-open' }, [['video', mp4], ['refs', png]]); assert.equal(local.status, 200); assert.equal(local.body.cost ?? 0, 0); console.log('ok local batch = 0 credits'); }
  // 09 restyle refs up to 30
  { const refs: [string, string][] = Array.from({ length: 30 }, () => ['refs', png]); const j = await post('restyle', { ...R, preset: 'anime-cel' }, [['video', mp4], ...refs]); assert.equal(j.status, 200, JSON.stringify(j.body));
    const d = await get(`/api/jobs/${j.body.id}`); assert.equal(d.input.refBatches.length, 4);
    const b = await post('restyle', { ...R, preset: 'anime-cel' }, [['video', mp4], ...refs, ['refs', png]]); assert.equal(b.status, 400); assert.equal(code(b.body), 'too_many'); console.log('ok restyle 30 refs (4 groups), 31 → 400'); }
  // 10 re-shoot
  { const po = await post('reshoot', { ...R, prompt: 'left side, then a low angle' }, [['video', mp4]]); assert.equal(po.status, 200, JSON.stringify(po.body)); const d = await get(`/api/jobs/${po.body.id}`); assert.ok(d.input.promptOnly); assert.equal(d.input.angles.length, 1);
    const none = await post('reshoot', { ...R }, [['video', mp4]]); assert.equal(none.status, 400); assert.equal(field(none.body), 'angles');
    const vr = await post('reshoot', { ...R, prompt: 'x', provider: 'comfy-open' }, [['video', mp4], ['videoRefs', ref]]); assert.equal(vr.status, 400); assert.equal(field(vr.body), 'videoRefs');
    const ga = await post('reshoot', { ...R, prompt: 'x', provider: 'router-veo', generateAudio: '1' }, [['video', mp4]]); assert.equal(ga.status, 400); assert.equal(code(ga.body), 'audio_unsupported');
    const q0 = await get('/api/tools/reshoot/price?provider=router-seedance&duration=5&resolution=720p'); const q1 = await get('/api/tools/reshoot/price?provider=router-seedance&duration=5&resolution=720p&refVideoSeconds=3');
    const b0 = await bal(); const ok = await post('reshoot', { ...R, prompt: 'orbit left', provider: 'router-seedance', generateAudio: '1' }, [['video', mp4], ['videoRefs', ref]]); assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const charged = b0 - (await bal()); const dj = await get(`/api/jobs/${ok.body.id}`); assert.equal(dj.input.refVideoSeconds, 3); assert.ok(dj.input.generateAudio);
    const q5 = await get('/api/tools/reshoot/price?provider=router-seedance&duration=5&resolution=720p&refVideoSeconds=3'); assert.ok(q1.credits > q0.credits, 'refs must cost more'); assert.equal(charged, q5.credits);
    console.log(`ok reshoot prompt-only, seedance videoRefs+generateAudio → ${charged} credits (quote ${q0.credits} source only, ${q1.credits} with 3 s refs)`); }
  // 11 camera New / Trending
  { const j = await post('camera', { ...R, types: '["orbit"]' }, [['image', key]]); assert.equal(j.status, 200, JSON.stringify(j.body)); await wait(j.body.id);
    const c = await get('/api/camera/categories'); assert.equal(c.trending[0].id, 'orbit'); assert.equal(c.trending[0].count, 1); assert.equal(c.trending[0].kind, 'camera-preset'); assert.ok(!('videoPreset' in c.trending[0])); // New = shipped after launch (2026-10-16) and within newDays: the H3 camera moves (2026-10-17) while that window is open, then nothing (clock-independent check)
    { const open = Date.now() - Date.parse('2026-10-17') < c.newDays * 86400_000; assert.equal(typeof c.newDays, 'number');
      if (open) assert.ok(c.new.length > 0 && c.new.every((x: any) => x.addedAt === '2026-10-17'), 'H3 moves are New inside the window'); else assert.deepEqual(c.new, [], 'the New window has closed');
      assert.deepEqual(c.groups.find((g: any) => g.id === 'new').items, c.new.map((x: any) => x.id)); }
    console.log(`ok camera categories: trending ${JSON.stringify(c.trending)}, new ${c.new.length} (H3 camera)`); }
  // 12 photo fx
  { const t = await tool('photo-fx'); assert.equal(t.presets.length, 32) /* + Exploded view (2026-10-26) */; assert.ok(t.inputs.some((i: any) => i.name === 'prompt'));
    const j = await post('photo-fx', { ...R, types: '["frost"]', prompt: 'snowy night' }, [['image', key]]); assert.equal(j.status, 200, JSON.stringify(j.body)); const d = await get(`/api/jobs/${j.body.id}`); assert.ok(d.input.finalPrompt.includes('snowy night'));
    for (const p of t.presets) { if (p.standIn) { assert.equal(p.posterUrl, null, p.id); continue; } assert.ok(fs.existsSync(path.resolve(import.meta.dirname, '..', p.posterUrl.slice(1))), p.posterUrl); } // a new effect without a still: posterUrl null + standIn (branded stand-in tile), never a 404
    console.log('ok photo-fx 31 effects + prompt + posters (or stand-ins)'); }
  // posters for swap/motion/restyle
  for (const id of ['object-swap', 'motion-transfer', 'restyle']) { const t = await tool(id); for (const p of t.presets) assert.ok(fs.existsSync(path.resolve(import.meta.dirname, '..', p.posterUrl.slice(1))), p.posterUrl); }
  console.log('ok preset posters exist');
  // 13 upscale scene + 8K
  { const t = await tool('upscale'); assert.deepEqual(t.app.outputTargetsByProvider['comfy-video-esrgan'], ['720p', '1080p', '1440p', '4k']); assert.deepEqual(t.app.outputTargetsByProvider['cloud-topaz-starlight-fast'], ['1080p', '4k']); assert.deepEqual(t.app.outputTargetsByProvider['comfy-seedvr2'], ['720p', '1080p', '1440p', '4k']); // 2026-10-26: each model's own sizes (shared/videoUpscale.ts)
    const s = await post('upscale', { ...R, types: '["precise"]', scene: 'old-film' }, [['video', mp4]]); assert.equal(s.status, 200, JSON.stringify(s.body)); const d = await get(`/api/jobs/${s.body.id}`); assert.equal(d.input.scene, 'old-film'); assert.ok(d.input.finalPrompt.includes('old film'));
    const k8 = await post('upscale', { ...R, types: '["precise"]', maxOutput: '8k' }, [['video', mp4]]); assert.equal(k8.status, 400); assert.equal(code(k8.body), 'unsupported'); assert.deepEqual(k8.body.issues[0].allowed, ['1080p', '720p', '1440p', '4k', '2k']);
    const bs = await post('upscale', { ...R, types: '["precise"]', scene: 'nope' }, [['video', mp4]]); assert.equal(bs.status, 400); console.log('ok upscale scenes; 8k → 400 unsupported'); }
  // 14 director
  { const o = await get('/api/cinema/options'); assert.ok(o.look.lens.length && o.look.palette.length); assert.equal(o.maxRefsByProvider['router-seedance'], 9);
    const j = await post('cinema', { ...R, prompt: 'a chase at night', genre: 'thriller', era: '1980s', tempo: 'fast', cameraBody: '35mm-film', lens: 'anamorphic', aperture: 'f2.8', palette: 'neon', lighting: 'low-key' }); assert.equal(j.status, 200, JSON.stringify(j.body));
    const d = await get(`/api/jobs/${j.body.id}`); assert.ok(d.input.finalPrompt.includes('anamorphic lens')); assert.equal(d.input.look.palette, 'neon');
    const bl = await post('cinema', { ...R, prompt: 'x', lens: 'fisheye' }); assert.equal(bl.status, 400); assert.equal(field(bl.body), 'lens');
    const refs9: [string, string][] = Array.from({ length: 9 }, () => ['refs', png]);
    const r9l = await post('cinema', { ...R, prompt: 'x', provider: 'comfy-open' }, refs9); assert.equal(r9l.status, 400); assert.equal(code(r9l.body), 'too_many');
    const r9s = await post('cinema', { ...R, prompt: 'x', provider: 'router-seedance' }, refs9); assert.equal(r9s.status, 200, JSON.stringify(r9s.body));
    const ex0 = await post('cinema', { ...R, mode: 'extend' }); assert.equal(ex0.status, 400); assert.equal(field(ex0.body), 'video');
    const exv = await post('cinema', { ...R, mode: 'extend', provider: 'router-veo' }, [['video', mp4]]); assert.equal(exv.status, 400); assert.equal(field(exv.body), 'mode');
    const ex = await post('cinema', { ...R, mode: 'extend', provider: 'comfy-open' }, [['video', mp4]]); assert.equal(ex.status, 200, JSON.stringify(ex.body)); assert.equal(ex.body.cost ?? 0, 0); // B6: the default is Seedance 2.0 now; local extend stays free
    const ed = await post('cinema', { ...R, mode: 'edit', prompt: 'make it rain', provider: 'router-seedance' }, [['video', mp4]]); assert.equal(ed.status, 200, JSON.stringify(ed.body)); const de = await get(`/api/jobs/${ed.body.id}`); assert.equal(de.input.refVideoSeconds, 5);
    console.log('ok director look fields, per-route maxRefs, extend/edit modes'); }
  // P1/P2 endpoints
  { const j = await post('object-swap', { ...R, prompt: 'swap' }, [['video', mp4], ['refs', png]]); await wait(j.body.id);
    const sh = await (await fetch(`${B}/api/jobs/${j.body.id}/share`, { method: 'POST' })).json();
    assert.equal((await fetch(`${B}/api/share/${sh.token}/report`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'nsfw' }) })).status, 404, 'report route removed');
    assert.equal((await fetch(`${B}/api/share/${sh.token}`)).status, 200); assert.equal((await get('/api/community?limit=500')).items.some((x: any) => x.id === `job:${j.body.id}`), true);
    console.log('ok share link stays up (no report route)');
    const j2 = await post('object-swap', { ...R, prompt: 'secret prompt' }, [['video', mp4], ['refs', png]]); await wait(j2.body.id);
    const pb2 = await fetch(`${B}/api/jobs/${j2.body.id}/publish`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ showPrompt: false }) }); assert.equal(pb2.status, 200);
    const pubs = (await get('/api/community?source=published')).items.filter((x: any) => x.author === 'you'); /* mock mode also seeds other authors' results */ assert.equal(pubs.length, 1); assert.ok(!pubs[0].title.includes('secret')); console.log('ok publish (showPrompt=false hides the prompt)');
    const ho = await get(`/api/jobs/${j2.body.id}/handoff`); assert.ok(ho.targets.some((t: any) => t.toolId === 'upscale' && t.slot === 'video'));
    const hu = await get(`/api/jobs/${j2.body.id}/handoff?to=restyle`); assert.equal(hu.slot, 'video'); assert.ok(hu.route.includes('fromJob=')); console.log('ok hand-off targets', ho.targets.length);
    const sp = await get('/api/presets?toolId=object-swap&sort=trending'); assert.ok(sp.items[0].uses >= 0); const sn = await get('/api/presets?toolId=camera&sort=new'); assert.equal(sn.items[0].addedAt, '2026-10-17'); assert.ok((await get('/api/presets?q=orbit')).items.every((x: any) => /orbit/i.test(`${x.label} ${x.id} ${x.group} ${x.toolName}`)));
    console.log('ok presets sort=trending|new, q');
    const hs = await get('/api/health/self-host'); assert.ok('comfy' in hs && 'gpu' in hs && hs.models.total > 100);
    const ep = await get('/api/openapi/endpoints'); assert.ok(ep.items.some((x: any) => x.path === '/api/health/self-host'));
    const us = await get('/api/usage/series'); assert.ok(us.items.length >= 1 && us.items.some((r: any) => r.charged > 0));
    const pr = await (await fetch(`${B}/api/me/profile`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: 'Test User' }) })).json(); assert.equal(pr.displayName, 'Test User');
    const rp = await (await fetch(`${B}/api/route-prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'upscale my clip to 4k' }) })).json(); assert.equal(rp.toolId, 'upscale');
    const md = await get('/api/models/comfy-h3'); assert.equal(md.license.attribution, 'Powered by MiniMax H3');
    const cf = await get('/api/config'); assert.ok(cf.maxParallel > 0 && cf.locales.includes('es'));
    const wh = await fetch(`${B}/api/jobs/${j2.body.id}/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'ftp://x' }) }); assert.equal(wh.status, 400);
    console.log('ok self-host health, endpoints table, usage series, profile, route-prompt, model page, config limits, webhook validation'); }
  // webhookUrl on submit, delivered to a local receiver; plugin toggle
  { const http = await import('node:http'); const got: any[] = []; const rx = http.createServer((q, r) => { let b = ''; q.on('data', (c) => (b += c)); q.on('end', () => { got.push({ id: q.headers['x-webhook-id'], body: JSON.parse(b) }); r.end('ok'); }); }).listen(testPort(8832));
    const bw = await post('object-swap', { ...R, prompt: 'x', webhookUrl: 'ftp://nope' }, [['video', mp4], ['refs', png]]); assert.equal(bw.status, 400); assert.equal(field(bw.body), 'webhookUrl');
    const j = await post('object-swap', { ...R, prompt: 'x', webhookUrl: `http://127.0.0.1:${testPort(8832)}/hook` }, [['video', mp4], ['refs', png]]); assert.equal(j.status, 200); await wait(j.body.id);
    for (let i = 0; i < 20 && !got.length; i++) await new Promise((r) => setTimeout(r, 500));
    assert.equal(got[0].id, `${j.body.id}:done`); assert.equal(got[0].body.status, 'done'); const ws = await get(`/api/jobs/${j.body.id}/webhook`); assert.deepEqual(ws.delivered, ['done']); rx.close();
    console.log('ok webhookUrl on submit → delivered once (X-Webhook-Id', got[0].id + ')');
    const pl = await get('/api/plugins'); const pid = pl[0].id; const tid = pl[0].toolId; assert.equal(pl[0].enabled, true);
    const off = await (await fetch(`${B}/api/plugins/${pid}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: false }) })).json(); assert.equal(off.enabled, false);
    assert.ok(!(await get('/api/tools')).some((t: any) => t.id === tid)); assert.equal((await post(tid, { ...R })).status, 404); assert.equal((await get('/api/plugins'))[0].enabled, false);
    await fetch(`${B}/api/plugins/${pid}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true }) }); assert.ok((await get('/api/tools')).some((t: any) => t.id === tid));
    console.log(`ok plugin ${pid} off → tool hidden + submit 404, on → back`); }
  // Design Planner queue: seconds on quote + submit (one resolver), share page (no report form), model releasedAt/badges, zero-filled usage
  { const q = await get('/api/tools/object-swap/price?seconds=5&resolution=720p&provider=router-seedance'); assert.equal(q.credits, 134, JSON.stringify(q)); assert.equal(q.credits, Math.ceil(q.exactUsd * 100 - 1e-9), 'rounded up from the exact price ($1.3361)');
    assert.ok((await get('/api/tools/object-swap/price?seconds=10&resolution=720p&provider=router-seedance')).credits > 134);
    const bad = await fetch(`${B}/api/tools/object-swap/price?seconds=99&provider=router-seedance`); const badB: any = await bad.json(); assert.equal(bad.status, 200, 'D5: an off-list length snaps, never refused'); assert.ok((badB.adjustNotes ?? []).some((n: string) => /closest length/.test(n)), JSON.stringify(badB.adjustNotes));
    const q4 = await get('/api/tools/object-swap/price?seconds=4&resolution=720p&provider=router-seedance');
    const b0 = await bal(); const j = await post('object-swap', { ...R, prompt: 'swap', provider: 'router-seedance', resolution: '720p', seconds: '4' }, [['video', mp4], ['refs', png]]); assert.equal(j.status, 200, JSON.stringify(j.body));
    assert.equal(b0 - (await bal()), q4.credits, 'submit with seconds charges the quote'); await wait(j.body.id);
    const jb = await post('object-swap', { ...R, prompt: 'swap', provider: 'router-seedance', seconds: '99' }, [['video', mp4], ['refs', png]]); assert.equal(jb.status, 200, JSON.stringify(jb.body)); assert.ok((jb.body.warnings ?? []).some((n: string) => /^Made at /.test(n)), JSON.stringify(jb.body.warnings)); await wait(jb.body.id);
    console.log(`ok seconds: quote 5 s 720p = 134, 4 s quote = charge ${q4.credits}, 99 s → snapped with a note`); }
  { const j = await post('object-swap', { ...R, prompt: 'swap' }, [['video', mp4], ['refs', png]]); await wait(j.body.id); const sh = await (await fetch(`${B}/api/jobs/${j.body.id}/share`, { method: 'POST' })).json();
    const html = await (await fetch(`${B}/s/${sh.token}`)).text(); assert.ok(!html.includes('/report') && !html.includes('name="reason"') && !html.includes('mailto:'), 'no report form / abuse contact on /s/:token');
    assert.equal((await fetch(`${B}/s/${sh.token}`)).status, 200); console.log('ok /s/:token has no report form'); }
  { const m = await get('/api/models'); const all = m.groups.flatMap((g: any) => g.models); assert.ok(all.every((x: any) => 'releasedAt' in x && Array.isArray(x.badges)));
    const f5 = all.find((x: any) => x.id === 'comfy-f5tts'); assert.equal(f5.releasedAt, '2024-10-09'); assert.ok(!f5.badges.includes('new'));
    assert.ok(all.filter((x: any) => x.badges.includes('new')).every((x: any) => x.releasedAt && Date.now() - Date.parse(x.releasedAt) <= 30 * 86400_000), "'new' only from a sourced date");
    const one = await get('/api/models/comfy-f5tts'); assert.equal(one.releasedAt, '2024-10-09'); assert.deepEqual(one.badges, []); assert.equal((await get('/api/models/router-kling')).releasedAt, null);
    console.log('ok models releasedAt + badges'); }
  { const u = await get('/api/usage/series?days=5'); assert.equal(u.items.length, 6); assert.ok(u.items.every((r: any) => typeof r.charged === 'number'));
    const h = await get('/api/usage/series?bucket=hour&days=1'); assert.ok(h.items.length >= 24 && h.items.length <= 25); console.log('ok usage series zero-filled'); }
  console.log('ALL OK backend-gaps');
} finally { try { process.kill(-srv.pid!); } catch { /* */ } }
