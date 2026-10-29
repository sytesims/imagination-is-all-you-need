// Fit to model, end to end (2026-10-26): a throwaway server (mock backend, a fake Comfy key) whose Comfy Router is a FAKE local HTTP server, so nothing
// leaves this computer and nothing is spent. Video Swap on Kling 3.0 Omni Edit:
//  - quote = submit for every case (quotedRouteId / quotedCredits; a 409 route_changed would fail the test), and the quote carries the same plan;
//  - 1280×536 (2.39:1): the clip reaches Kling padded to 1280×720 (black bars), the fake model answers 16:9, the result comes back 1280×536 with the
//    clip's sound and length, and job.videoFit says what was done (viewer details);
//  - 1720×720 Crop to fill: Kling gets the middle 1280×720, the result stays 16:9 (nothing to undo);
//  - 9:16 540×960: enlarged to 720×1280;
//  - Fit off and a 2.5 s clip: the quote is not runnable and says why; the submit is refused (400 video_fit), nothing charged.
// Run: npx tsx test/video-fit.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import http from 'node:http'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'vfit-')); const M = fs.mkdtempSync(path.join(os.tmpdir(), 'vfit-media-'));
const PORT = testPort(9621); const FAKE = testPort(9622); const B = `http://localhost:${PORT}`;
const ok = (m: string) => console.log('ok ' + m);
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a]);
const pr = (f: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', f]).toString());
const vs = (f: string) => { const v = pr(f).streams.find((s: any) => s.codec_type === 'video'); return `${v.width}x${v.height}`; };
for (const [n, size] of [['w536', '1280x536'], ['w239', '1720x720'], ['tall', '540x960']]) ff('-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=24`, '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-t', '8', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(M, `${n}.mp4`));
ff('-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=24', '-t', '2.5', '-pix_fmt', 'yuv420p', path.join(M, 'short.mp4'));
ff('-f', 'lavfi', '-i', 'color=c=teal:s=512x768', '-frames:v', '1', path.join(M, 'char.png'));

// ---- the fake Comfy Router: Kling's queue API; the "model" fetches the clip it was sent (our public /files link), records its size, and answers
// at Kling's own shape: the clip scaled to 1280×720 (16:9) or 720×1280 (9:16), silent (the app puts the clip's sound back).
const sent: string[] = []; let n = 0; const outs = new Map<number, string>();
const fake = http.createServer(async (req, res) => { const url = req.url ?? ''; let body = ''; for await (const c of req) body += c;
  const j = (o: unknown, s = 200) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (url.endsWith('/estimate')) return j({ source: 'exact', amount: '0.30' });
  if (req.method === 'POST' && /\/requests\?/.test(url)) { const b = JSON.parse(body); const link = b.video_list?.[0]?.video_url as string; const id = ++n; const f = path.join(M, `sent-${id}.mp4`);
    fs.writeFileSync(f, Buffer.from(await (await fetch(link)).arrayBuffer())); const size = vs(f); sent.push(size); const [w, h] = size.split('x').map(Number);
    const o = path.join(M, `out-${id}.mp4`); ff('-i', f, '-vf', `scale=${w >= h ? '1280:720' : '720:1280'},setsar=1`, '-an', '-pix_fmt', 'yuv420p', o); outs.set(id, o);
    const base = `http://localhost:${FAKE}/v2/models/kling/kling-v3-omni/requests/r${id}`; return j({ request_id: `r${id}`, status: 'IN_QUEUE', status_url: `${base}/status`, response_url: base, cancel_url: `${base}/cancel` }, 201); }
  if (url.endsWith('/status')) return j({ status: 'COMPLETED' });
  const m = url.match(/requests\/r(\d+)$/); if (m) { res.writeHead(200, { 'content-type': 'application/json', 'x-comfy-credits-used': '30' }); return res.end(JSON.stringify({ code: 0, data: { task_status: 'succeed', task_result: { videos: [{ url: `http://localhost:${FAKE}/out/${m[1]}.mp4` }] } } })); }
  const o = url.match(/^\/out\/(\d+)\.mp4$/); if (o && outs.has(Number(o[1]))) { res.writeHead(200, { 'content-type': 'video/mp4' }); return res.end(fs.readFileSync(outs.get(Number(o[1]))!)); }
  j({ error: 'not here' }, 404); });
await new Promise<void>((r) => fake.listen(FAKE, r));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_LUMA_API_KEY: '' };
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, ...NOKEYS, COMFY_API_KEY: 'test-not-a-real-key', OPENHIGGSFIELD_COMFY_ROUTER_URL: `http://localhost:${FAKE}`, OPENHIGGSFIELD_PUBLIC_BASE_URL: B,
  PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, '.env.local'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json') } });
const PROV = 'router-kling-edit';
const quote = async (w: number, h: number, sec: number, fit: string) => (await fetch(`${B}/api/tools/object-swap/price?provider=${PROV}&model=${PROV}&mode=object_swap&count=1&resolution=720p&keepAudio=1&seconds=${sec}&width=${w}&height=${h}&fit=${fit}&refs=1&video=1`)).json() as Promise<any>;
const submit = async (clip: string, fit: string, q: any) => { const fd = new FormData(); fd.append('video', new Blob([fs.readFileSync(path.join(M, clip))], { type: 'video/mp4' }), clip); fd.append('refs', new Blob([fs.readFileSync(path.join(M, 'char.png'))], { type: 'image/png' }), 'char.png');
  for (const [k, v] of Object.entries({ rights: '1', provider: PROV, mode: 'object_swap', count: '1', resolution: '720p', keepAudio: '1', target: 'the person', fit, ...(q?.route ? { quotedRouteId: q.route, quotedCredits: String(q.credits) } : {}) })) fd.append(k, v);
  const r = await fetch(`${B}/api/tools/object-swap/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
const done = async (id: string) => { for (let i = 0; i < 240; i++) { const j = await (await fetch(`${B}/api/jobs/${id}`)).json() as any; if (['failed', 'canceled'].includes(j.status) || (j.status === 'done' && (!j.videoFit?.restore || j.videoFit.restored != null))) return j; await new Promise((r) => setTimeout(r, 250)); } throw new Error('job did not finish'); };
const fileOf = (u: string) => path.join(D, decodeURIComponent(u.replace(/^\/files\//, '')));
try {
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); }
  // 1. 1280×536, Keep everything: padded to 1280×720 for Kling, the 16:9 answer cropped back to 1280×536, sound and length kept
  { const q = await quote(1280, 536, 8, 'pad'); assert.equal(q.runnable, true, JSON.stringify(q).slice(0, 400)); assert.ok(q.credits > 0); assert.equal(q.route, `comfy-router:${PROV}`);
    assert.equal(q.videoFit?.note, 'Adjusted for Kling: padded to 16:9, full frame kept'); assert.match(q.videoFit.reason, /at least 720 px tall; yours is 536 px/);
    const s = await submit('w536.mp4', 'pad', q); assert.equal(s.status, 200, JSON.stringify(s.body).slice(0, 400)); assert.equal(s.body.cost, q.credits, 'quote = submit'); assert.equal(s.body.route, q.route); assert.deepEqual(s.body.videoFit.frame, q.videoFit.frame);
    const j = await done(s.body.id); assert.equal(j.status, 'done', j.error); assert.equal(sent.at(-1), '1280x720', 'Kling got the padded 16:9 clip');
    { const raw = JSON.stringify(j) + await (await fetch(`${B}/api/jobs?limit=50`)).text(); assert.ok(!raw.includes(D), 'a fitted job never shows a host path (videoFitSourcePath, videoPath) in /api/jobs'); }
    const out = fileOf(j.outputs[0].url); assert.equal(vs(out), '1280x536', 'the result keeps the clip framing'); assert.ok(pr(out).streams.some((x: any) => x.codec_type === 'audio'), 'the clip sound is back');
    assert.ok(Math.abs(Number(pr(out).format.duration) - 8) < 0.3); assert.equal(j.videoFit?.restored, true); assert.equal(j.videoFit?.note, 'Adjusted for Kling: padded to 16:9, full frame kept'); assert.equal(j.videoFit?.sent, '1280×720');
    ok(`1280×536 Keep everything: quote ${q.credits} = submit ${s.body.cost}; Kling got 1280×720; result 1280×536 with sound; job.videoFit recorded`); }
  // 2. 1720×720 Crop to fill: the middle 1280×720 goes, the 16:9 result stays
  { const q = await quote(1720, 720, 8, 'crop'); assert.equal(q.runnable, true); assert.equal(q.videoFit.note, 'Adjusted for Kling: cropped to 16:9');
    const s = await submit('w239.mp4', 'crop', q); assert.equal(s.status, 200, JSON.stringify(s.body).slice(0, 300)); assert.equal(s.body.cost, q.credits);
    const j = await done(s.body.id); assert.equal(j.status, 'done', j.error); assert.equal(sent.at(-1), '1280x720'); assert.equal(vs(fileOf(j.outputs[0].url)), '1280x720'); assert.equal(j.videoFit?.restore, false);
    ok(`1720×720 Crop to fill: quote ${q.credits} = submit; Kling got the middle 1280×720; the result stays 16:9`); }
  // 3. 1720×720 Keep everything: 1720×968 sent, cropped back to 2.39:1
  { const q = await quote(1720, 720, 8, 'pad'); const s = await submit('w239.mp4', 'pad', q); assert.equal(s.status, 200); assert.equal(s.body.cost, q.credits);
    const j = await done(s.body.id); assert.equal(j.status, 'done', j.error); assert.equal(sent.at(-1), '1720x968'); const [w, h] = vs(fileOf(j.outputs[0].url)).split('x').map(Number); assert.ok(Math.abs(w / h - 1720 / 720) < 0.01, `${w}×${h}`);
    ok(`1720×720 Keep everything: Kling got 1720×968; result ${w}×${h} (2.39:1)`); }
  // 4. 9:16 540×960: enlarged to 720×1280
  { const q = await quote(540, 960, 8, 'pad'); assert.equal(q.videoFit.note, 'Adjusted for Kling: enlarged to 720p'); const s = await submit('tall.mp4', 'pad', q); assert.equal(s.status, 200); assert.equal(s.body.cost, q.credits);
    const j = await done(s.body.id); assert.equal(j.status, 'done', j.error); assert.equal(sent.at(-1), '720x1280'); assert.equal(vs(fileOf(j.outputs[0].url)), '720x1280');
    ok('9:16 540×960: enlarged to 720×1280 for Kling'); }
  // 5. what can't run: Fit off on 1280×536, and a 2.5 s clip
  { const before = sent.length;
    const q = await quote(1280, 536, 8, 'off'); assert.notEqual(q.runnable, true); assert.match(JSON.stringify(q), /Turn on Fit to model/);
    const s = await submit('w536.mp4', 'off', null); assert.equal(s.status, 400); assert.equal(s.body.code, 'video_fit'); assert.match(s.body.error, /536 px/); assert.equal(s.body.refund.charged, false);
    const q2 = await quote(1280, 720, 2.5, 'pad'); assert.notEqual(q2.runnable, true); assert.match(JSON.stringify(q2), /at least 4 s of clip|Allowed: 4, /); /* the duration rule (videoCaps) answers first on a quote */
    const s2 = await submit('short.mp4', 'pad', null); assert.equal(s2.status, 400); assert.match(JSON.stringify(s2.body), /4 s/); assert.equal(sent.length, before, 'nothing sent');
    ok('Fit off / 2.5 s: quote not runnable with the reason; submit 400, nothing sent or charged'); }
  console.log('ALL OK video-fit e2e');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } fake.close(); await new Promise((r) => setTimeout(r, 600)); for (const d of [D, M]) try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* still writing */ } }
