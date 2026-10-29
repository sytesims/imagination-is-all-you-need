// E2E (own mock server, :8861): flow-run defects + Camera Moves backend. Run: npx tsx test/p11-defects.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const PORT = testPort(8861), B = `http://localhost:${PORT}`, D = fs.mkdtempSync(path.join(os.tmpdir(), 'p11-'));
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock' }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await fetch(B + u)).json();
const post = async (tool: string, f: Record<string, string>, files: [string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); for (const [k, p] of files) fd.append(k, new Blob([fs.readFileSync(p)]), path.basename(p)); const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() }; };
const wait = async (id: string) => { for (let i = 0; i < 400; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 250)); } throw new Error('timeout'); };
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); }
  await fetch(`${B}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ global: { mode: 'auto', allowFallback: false, useLocal: true, mockKeys: true } }) });
  const mp4 = path.join(D, 'src.mp4'), png = path.join(D, 'ref.png'), key = path.join(D, 'key.png'), junk = path.join(D, 'junk.mp4');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=854x480:rate=24', '-t', '5', '-pix_fmt', 'yuv420p', mp4]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=512x512', '-frames:v', '1', png]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1280x720', '-frames:v', '1', key]); fs.writeFileSync(junk, Buffer.alloc(1 << 20));
  const R = { rights: '1', route: 'local:comfy-open' };
  // (a) forced (provider) IP block → 'blocked', refund note once; plain retry resubmits
  for (const [tool, extra, fl] of [['object-swap', { prompt: 'x' }, [['video', mp4], ['refs', png]]], ['motion-transfer', {}, [['video', mp4], ['refs', png]]], ['restyle', { preset: 'anime-cel' }, [['video', mp4]]], ['reshoot', { angles: '["low"]' }, [['video', mp4]]]] as const) {
    const j = await post(tool, { ...R, ...extra, simulate: 'ip' }, fl as any); assert.equal(j.status, 200, `${tool} ${JSON.stringify(j.body)}`);
    const w = await wait(j.body.id); assert.equal(w.status, 'blocked', `${tool}: ${w.status}`); assert.equal(w.errorType, 'ip', JSON.stringify({ e: w.error, s: w.status, st: w.stage, ra: w.routeAttempts }).slice(0, 400));
    await new Promise((r) => setTimeout(r, 300)); const again = await get(`/api/jobs/${j.body.id}`);
    assert.ok(((again.error ?? '').match(/back to your (app )?balance|Nothing was charged/g) ?? []).length <= 1, `${tool} refund text once: ${again.error}`);
    const rr = await fetch(`${B}/api/jobs/${j.body.id}/retry`, { method: 'POST' }); assert.equal(rr.status, 200, `${tool} plain retry after a provider block`);
  }
  console.log('ok (a) simulate=ip → blocked (errorType ip) on pages 7–10, refund text once, plain retry 200');
  // (b) restyle reference cap (RESTYLE_MAX_REFS): one over the max → 400 too_many
  { const t = (await get('/api/tools')).find((x: any) => x.id === 'restyle'); const max = t.inputs.find((i: any) => i.name === 'refs').max;
    const j = await post('restyle', { ...R, preset: 'anime-cel' }, [['video', mp4], ...Array.from({ length: max + 1 }, () => ['refs', png] as [string, string])]); assert.equal(j.status, 400); assert.ok(JSON.stringify(j.body).includes('too_many'), JSON.stringify(j.body).slice(0, 200));
    console.log(`ok (b) restyle rejects ref ${max + 1} (max ${max})`); }
  // (c) unreadable upload → code unreadable
  { const j = await post('object-swap', { ...R, prompt: 'x' }, [['video', junk], ['refs', png]]); assert.equal(j.status, 400); assert.equal(j.body.issues.find((i: any) => i.field === 'video')?.code, 'unreadable', JSON.stringify(j.body).slice(0, 200)); console.log('ok (c) zero-filled .mp4 → unreadable'); }
  // page 11
  { const l = await get('/api/presets?toolId=camera'); assert.ok(l.categories.includes('General') && l.categories.includes('Timelapse')); assert.ok(l.total >= 82, `camera presets: ${l.total}`) /* 65 + 20 catalogue moves, minus near-duplicates folded into aliases (94 → 88 → 82, 2026-10-27 preset audit) */; assert.equal(l.items[0].id, 'free');
    for (const p of l.items) { assert.ok(p.category && p.description && Array.isArray(p.providers) && Array.isArray(p.aspects), p.id); }
    const pg = await get('/api/presets?toolId=camera&limit=24'); assert.equal(pg.items.length, 24); assert.equal(pg.nextCursor, '24');
    const h3 = await get('/api/presets?toolId=camera&provider=comfy-h3-camera'); assert.ok(h3.items.length > 0 && h3.items.every((p: any) => p.providers.includes('comfy-h3-camera')));
    const cl = await get('/api/presets?toolId=camera&category=Close'); assert.ok(cl.items.some((p: any) => p.id === 'eye-push') && cl.items.every((p: any) => p.category === 'Close'));
    const d = await get('/api/presets/eye-push?toolId=camera'); assert.equal(d.preset.camera.verb, 'dolly'); assert.ok(Array.isArray(d.examples));
    assert.equal((await fetch(`${B}/api/presets/nope?toolId=camera`)).status, 404);
    const t = (await get('/api/tools')).find((x: any) => x.id === 'camera'); assert.ok(t.inputs.some((i: any) => i.name === 'aspect' && i.byProvider));
    const okJ = await post('camera', { ...R, types: '["eye-push"]', prompt: 'a woman in the rain', aspect: '9:16' }, [['image', key]]); assert.equal(okJ.status, 200, JSON.stringify(okJ.body));
    const jj = await get(`/api/jobs/${okJ.body.id}`); assert.ok(String(jj.input.finalPrompt).startsWith("camera slowly pushes into the character's eyes"), jj.input.finalPrompt); assert.ok(jj.input.finalPrompt.indexOf('a woman in the rain') > 0); assert.equal(jj.input.aspect, '9:16');
    const badA = await post('camera', { ...R, types: '["eye-push"]', aspect: '21:9' }, [['image', key]]); assert.equal(badA.status, 400); assert.equal(badA.body.issues?.[0]?.field, 'aspect');
    const badP = await post('camera', { rights: '1', route: 'local:comfy-open', provider: 'comfy-open', types: `["${h3.items[0].id}"]` }, [['image', key]]); assert.equal(badP.status, 400); assert.equal(badP.body.issues?.[0]?.field, 'types');
    await wait(okJ.body.id); assert.ok((await get('/api/presets/eye-push?toolId=camera')).examples.some((e: any) => e.jobId === okJ.body.id));
    console.log(`ok page 11: ${l.total} camera presets in ${l.categories.length} categories, paging, provider/category filters, detail + examples, aspect per provider, preset prompt first`); }
  console.log('ALL OK p11-defects');
} finally { try { process.kill(-srv.pid!); } catch { /* */ } }
