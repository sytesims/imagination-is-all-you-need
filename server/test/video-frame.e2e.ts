// "Use a video's frame as the start image" (2026-10-26). Own mock server on a temp data dir (never the live app, no paid calls).
//  - POST /api/media/frame from a video result ({jobId, out}) and from an upload ({url}): last / first / at=<sec>, full size, listed in the picker's
//    Uploads with frameOf, content-addressed (the same frame twice = one entry), and taken by an image slot by reference (@file:).
//  - The picker's "Pick a frame" path: an image slot's listing (type=image,video) shows the video; the frame it takes goes into a job.
//  - GET /api/jobs/:id/prefill?t=last&cont=1 into Generate Video: the exact last frame in the start slot, i2v, "Continue the shot: <prompt>".
//  - Errors: bad at, an image source, unknown job, a path outside the library.
// Run: npx tsx test/video-frame.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' };
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'vframe-e2e-')); const DATA = fs.mkdtempSync(path.join(D, 'data-')); const PORT = testPort(8809); const B = `http://localhost:${PORT}`;
const ok = (m: string) => console.log('ok ' + m);
const FF = await import('../src/ffmpeg.ts');
// a 24-frame portrait clip (frame n = luma 20 + 8n) with a title tag
const CLIP = path.join(D, 'grey.mp4');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'nullsrc=s=270x480:r=12:d=2,format=yuv420p,geq=lum=\'20+8*N\':cb=128:cr=128', '-frames:v', '24', '-c:v', 'libx264', '-qp', '0', '-pix_fmt', 'yuv420p', '-metadata', 'title=secret', CLIP]);
const srv: ChildProcess = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_USE_LOCAL: '0' },
  stdio: ['ignore', fs.openSync(path.join(D, 'srv.log'), 'a'), fs.openSync(path.join(D, 'srv.log'), 'a')], detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const json = async (u: string, body: any) => { const r = await fetch(B + u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() as any }; };
const form = async (u: string, f: Record<string, string>, files: [string, string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v);
  for (const [k, p, t] of files) fd.append(k, new Blob([fs.readFileSync(p)], { type: t }), path.basename(p)); const r = await fetch(B + u, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
const until = async (id: string) => { for (let i = 0; i < 900; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'needs_decision', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout'); };
const file = (u: string) => path.join(DATA, u.replace(/^\/files\//, ''));
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
  assert.equal((await get('/api/health')).backend, 'mock');
  // ---- from an upload: last / first / at, full size, no metadata, listed with frameOf ----
  const up = await form('/api/media', {}, [['file', CLIP, 'video/mp4']]); assert.equal(up.status, 200, JSON.stringify(up.body)); const vurl = up.body.items[0].url;
  let lastUrl = '';
  { const r = await json('/api/media/frame', { url: vurl, at: 'last' }); assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.frame.frames, 24, 'frame count'); assert.equal(r.body.frame.index, 23, 'the final frame');
    assert.match(r.body.item.url, /^\/files\/upl-[0-9a-f]{16}\.png$/); assert.equal(r.body.item.width, 270); assert.equal(r.body.item.height, 480);
    assert.ok(Math.abs(await FF.meanLuma(file(r.body.item.url)) - (20 + 8 * 23)) <= 2, 'pixels are frame 23');
    assert.doesNotMatch(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags:stream_tags', '-of', 'json', file(r.body.item.url)]).toString(), /secret/);
    assert.deepEqual({ ...r.body.item.frameOf, t: undefined, index: undefined, frames: undefined }, { url: vurl, jobId: null, out: null, at: 'last', t: undefined, index: undefined, frames: undefined });
    lastUrl = r.body.item.url;
    const again = await json('/api/media/frame', { url: vurl }); assert.equal(again.body.item.url, lastUrl, 'at defaults to last; same frame = same file');
    ok(`upload → last frame (23 of 24) at 270×480, no metadata, ${lastUrl}`); }
  { const f = await json('/api/media/frame', { url: vurl, at: 'first' }); assert.equal(f.status, 200); assert.ok(Math.abs(await FF.meanLuma(file(f.body.item.url)) - 20) <= 2, 'first');
    const t = await json('/api/media/frame', { url: vurl, at: 1.0 }); assert.equal(t.status, 200); assert.ok(Math.abs(await FF.meanLuma(file(t.body.item.url)) - (20 + 8 * 12)) <= 2, 'at=1.0 → frame 12');
    const p = await json('/api/media/frame', { url: vurl, at: '50' }); assert.equal(p.body.item.url, lastUrl, 'past the end = last');
    const m = await get('/api/media?tab=uploads&type=image&pageSize=100'); const fr = m.items.filter((x: any) => x.frameOf);
    assert.equal(fr.length, 3, `three distinct frames listed: ${JSON.stringify(m.items.map((x: any) => x.name))}`); assert.ok(fr.every((x: any) => x.label === 'Video frame' && x.frameOf.url === vurl));
    assert.ok(fr.some((x: any) => /^Last frame/.test(x.name)) && fr.some((x: any) => /^Frame at 1 s/.test(x.name)));
    ok('first / at=1.0 s (frame 12) / past the end; the picker\'s Uploads lists 3 frames, each with frameOf and a plain name'); }
  // ---- picker "Pick a frame": an image slot's listing shows the video, the taken frame goes into a job by reference ----
  { const m = await get('/api/media?tab=uploads&type=image,video&pageSize=100'); assert.ok(m.items.some((x: any) => x.url === vurl && x.type === 'video'), 'video offered to an image slot');
    const r = await form('/api/tools/image-upscale/jobs', { types: '["x2"]', rights: '1', '@file:image': lastUrl }); assert.equal(r.status, 200, JSON.stringify(r.body));
    const j = await until(r.body.id); assert.equal(j.status, 'done', j.error);
    ok('picker: the video is listed for an image slot; its last frame runs in an image job by reference (@file:image)'); }
  // ---- from a video result + Continue hand-off into Generate Video ----
  { const r = await form('/api/tools/h3-video/jobs', { types: '["t2v"]', prompt: 'a drone over cliffs', duration: '6', seed: '7' }); assert.equal(r.status, 200, JSON.stringify(r.body));
    const j = await until(r.body.id); assert.equal(j.status, 'done', j.error); const vOut = j.outputs[0].url; const N = await FF.countFrames(file(vOut)); assert.ok(N > 1, `result frames ${N}`);
    const f = await json('/api/media/frame', { jobId: j.id, out: 0, at: 'last' }); assert.equal(f.status, 200, JSON.stringify(f.body));
    assert.equal(f.body.frame.frames, N); assert.equal(f.body.frame.index, N - 1); assert.equal(f.body.item.frameOf.jobId, j.id); assert.match(f.body.item.name, /a drone over cliffs/);
    const vs = await FF.videoSize(file(vOut)); assert.equal(f.body.item.width, vs!.width); assert.equal(f.body.item.height, vs!.height);
    ok(`result → last frame ${N - 1} of ${N} at ${vs!.width}×${vs!.height}, linked to job ${j.id}`);
    const p = await get(`/api/jobs/${j.id}/prefill?action=send-to&tool=h3-video&as=image&out=0&t=last&cont=1`);
    assert.equal(p.available, true, JSON.stringify(p)); assert.equal(p.slot, 'image'); assert.match(p.output.frameUrl, new RegExp(`${j.id}-out0-flast\\.png$`)); assert.equal(p.output.t, 'last');
    assert.equal(p.form.types, '["i2v"]'); assert.equal(p.form.prompt, 'Continue the shot: a drone over cliffs'); assert.equal(p.files.image[0], p.output.frameUrl); assert.equal(p.submit, null);
    assert.ok(p.url.includes('&t=last&cont=1'), p.url); assert.ok(!(p.needs ?? []).includes('prompt'), 'prompt filled');
    const rows = await get('/api/media?tab=uploads&type=image&pageSize=100'); assert.equal(rows.items.filter((x: any) => x.frameOf?.jobId === j.id).length, 1, 'hand-off frame listed once (same pixels as the saved last frame fold into one entry)');
    const a = execFileSync('ffmpeg', ['-v', 'error', '-i', file(p.output.frameUrl), '-f', 'md5', '-']).toString(); const b = execFileSync('ffmpeg', ['-v', 'error', '-i', file(f.body.item.url), '-f', 'md5', '-']).toString();
    assert.equal(a, b, 'prefill frame = the endpoint\'s last frame (same pixels)');
    // the model: the source's own when it takes a start image, else LTX-2.5 22B
    const { continueModel } = await import('../src/shared/continueFrame.ts'); const T = (await get('/api/tools')).find((t: any) => t.id === 'h3-video'); const ids = T.providers.map((x: any) => x.id);
    assert.equal(p.form.provider, continueModel(j.provider, ids, T.app?.providerModes ?? null), 'continue model rule'); assert.equal(continueModel('nope-model', ids, { 'nope-model': ['t2v'] }), 'comfy-ltx25-video');
    { const { continuePrompt } = await import('../src/shared/continueFrame.ts'); // a timed prompt: style (length updated), cast and closing kept word for word; the source's beats swapped for one empty beat
      const src = 'Drama scene, 15 seconds, film look.\r\n\r\nCharacters: a mother; her daughter.\r\n\r\n0–7s: She hands over a lunchbox.\r\n\r\n7–15s: The bus leaves. Hold on her face.\r\n\r\nNo subtitles.';
      const c = continuePrompt(src, 10); assert.equal(c, 'Drama scene, 10 seconds, film look.\n\nCharacters: a mother; her daughter.\n\n0–10s: \n\nNo subtitles.');
      assert.equal(continuePrompt(c.replace('0–10s: ', '0–10s: She waves.'), 10), c, 'a continued prompt continues cleanly'); }
    // submit what the page would: the frame as the start image
    const s = await form('/api/tools/h3-video/jobs', { ...p.form, duration: '6' /* LTX-2.5 Pro (the cloud default) takes 6, 8 or 10 s */ }, [['image', file(p.output.frameUrl), 'image/png']]); assert.equal(s.status, 200, JSON.stringify(s.body));
    const sj = await until(s.body.id); assert.equal(sj.status, 'done', sj.error);
    ok(`prefill t=last&cont=1 → start image = exact last frame, i2v, "${p.form.prompt}", model ${p.form.provider}; submit runs`);
    const t = await get(`/api/jobs/${j.id}/prefill?action=send-to&tool=h3-video&as=image&out=0&t=1.5`); assert.match(t.output.frameUrl, /-out0-f1500\.png$/); assert.equal(t.form.prompt ?? '', '', 'no continue prompt without cont=1');
    const bt = await fetch(`${B}/api/jobs/${j.id}/prefill?action=send-to&tool=h3-video&t=abc`); assert.equal(bt.status, 400);
    ok('prefill t=1.5 → that frame (no continue prompt); t=abc → 400'); }
  // ---- errors ----
  { const img = await form('/api/media', {}, [['file', path.join(import.meta.dirname, 'fixtures/ref-512.png'), 'image/png']]);
    const cases: [any, number][] = [[{ url: vurl, at: 'soon' }, 400], [{ url: vurl, at: -1 }, 400], [{ url: img.body.items[0].url }, 400], [{ jobId: 'nope' }, 404], [{ url: '/files/../openhiggsfield.db' }, 400], [{ url: 'https://example.com/a.mp4' }, 400], [{}, 400], [{ url: '/files/missing.mp4' }, 404]];
    for (const [b, code] of cases) { const r = await json('/api/media/frame', b); assert.equal(r.status, code, `${JSON.stringify(b)} → ${r.status} ${JSON.stringify(r.body)}`); assert.ok(r.body.error); }
    assert.equal(fs.readdirSync(DATA).filter((f) => /^frm-tmp-|\.png\.\w+\.png$/.test(f)).length, 0, 'no temp files');
    ok('bad at, negative at, an image, unknown job, .., remote URL, nothing, missing file → plain 400 / 404; no temp files'); }
  console.log('video-frame e2e: all ok');
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* gone */ } }
