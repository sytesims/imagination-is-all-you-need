// DP sign-off #14 server asks + Bug Hunter PB re-check 2 (Oct 18):
//  (1) Re-shoot presets carry yaw/tilt; custom yaw/tilt snap or become a phrase; still-image source per provider (400 image_input_unsupported)
//  (2) 'already processing' 409 mentions credits back only for charged jobs  (3) FPS Boost local RIFE native plan
//  (4) plain ledger notes (never 'refund')  (5) saved user styles API  (7) distinct tool posters + /api/posters  (8) Remove BG / app upscale quotes are estimates
// Throwaway mock servers :8961 (keyless) / :8962 (OPENHIGGSFIELD_MOCK_KEYS=1), temp data dirs. Run: npx tsx test/dp14-server.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { createHash } from 'node:crypto';
const ROOT = path.resolve(import.meta.dirname, '..');
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' };
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'dp14-')); const procs: ChildProcess[] = [];
const boot = (port: number, extra: Record<string, string> = {}) => { const dd = fs.mkdtempSync(path.join(D, 'd-'));
  const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, ...NOKEYS, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: dd, OPENHIGGSFIELD_ENV_FILE: path.join(dd, '.env.local'),
    OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '150', OPENHIGGSFIELD_USE_LOCAL: '0', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(dd, 'nofilm.json'), ...extra } });
  procs.push(p); return `http://localhost:${port}`; };
const ready = async (B: string) => { for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) return; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); } throw new Error(`${B} did not start`); };
const get = async (B: string, u: string) => { const r = await fetch(B + u); return { status: r.status, body: (await r.json()) as any }; };
const sendJson = async (B: string, m: string, u: string, b?: unknown) => { const r = await fetch(B + u, { method: m, headers: b ? { 'content-type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: (await r.json()) as any }; };
const submit = async (B: string, tool: string, f: Record<string, string>, files: [string, string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries({ rights: '1', ...f })) fd.append(k, v);
  for (const [k, p, t] of files) fd.append(k, new Blob([fs.readFileSync(p)], { type: t }), path.basename(p)); const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: (await r.json()) as any }; };
const until = async (B: string, id: string, states = ['done', 'failed', 'needs_decision', 'blocked', 'canceled']) => { for (let i = 0; i < 600; i++) { const j = (await get(B, `/api/jobs/${id}`)).body; if (states.includes(j.status)) return j; await new Promise((r) => setTimeout(r, 50)); } throw new Error('timeout ' + id); };
const ok = (m: string) => console.log('ok ' + m);
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a]);
const MP4 = path.join(D, 'clip.mp4'); ff('-f', 'lavfi', '-i', 'testsrc2=size=854x480:rate=24', '-f', 'lavfi', '-i', 'sine=d=6', '-t', '6', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', MP4);
const PNG = path.join(D, 'still.png'); ff('-f', 'lavfi', '-i', 'testsrc2=size=854x480', '-frames:v', '1', PNG);
try {
  // (4) unit: legacy ledger notes are rewritten on read; new notes are plain (own temp DB)
  process.env.OPENHIGGSFIELD_DATA_DIR = fs.mkdtempSync(path.join(D, 'unit-'));
  const L = await import('../src/ledger.js');
  assert.equal(L.plainNote('refund', 'Credits back · run failed, temporary problem'), 'Run failed (temporary problem): credits back to your balance');
  assert.equal(L.plainNote('refund', 'failed (temporary): auto-refund'), 'Run failed (temporary): credits back to your balance');
  assert.equal(L.plainNote('refund', 'auto-refund'), 'Run did not finish: credits back to your balance');
  assert.equal(L.plainNote('refund', 'route fal:x/y failed: credits back to balance'), 'A route failed, trying the next one: credits back to your balance');
  assert.equal(L.plainNote('refund', 'canceled: 2/4 groups not started: partial credits back to balance'), 'Run canceled, 2 of 4 groups not started: partial credits back to your balance');
  assert.equal(L.plainNote('refund', '1/3 ref groups failed: partial credits back to balance'), '1 of 3 reference groups failed: partial credits back to your balance');
  assert.equal(L.plainNote('refund', 'Credits back · run canceled: free gen returned (3 left)'), 'Run canceled: free gen returned (3 left)');
  assert.equal(L.plainNote('refund', 'Run failed (temporary problem): free run returned (2 left)'), 'Run failed (temporary problem): free gen returned (2 left)');
  assert.equal(L.plainNote('charge', 'free run (4 left)'), 'free gen (4 left)');
  assert.equal(L.plainNote('charge', '40 credits'), '40 credits');
  for (const n of ['auto-refund', 'refunded after failure', 'Credits back · run blocked, blocked by the provider']) assert.doesNotMatch(L.plainNote('refund', n), /refund/i, n);
  ok('ledger notes: legacy rows rewritten on read ("Run failed (temporary problem): credits back to your balance"), never "refund"');
  // (3) FPS Boost local RIFE plan (native runner): multiplier = ceil(target / source fps), postFps = target
  const P = await import('../src/comfy/plans.js');
  const fj = (t: string) => ({ id: 'x', toolId: 'fps-boost', provider: 'comfy-rife', input: { videoPath: '/data/in.mp4', types: [t], keepAudio: true } });
  assert.equal(P.hasPlan(fj('60') as any), true); assert.equal(P.hasPlan({ ...fj('60'), provider: 'other' } as any), false);
  for (const [src, tgt, mult, fps] of [[24, '60', 3, 72], [25, '60', 3, 75], [30, '60', 2, 60], [24, '48', 2, 48], [60, '60', 2, 120]] as const) {
    const pl = P.buildPlan(fj(tgt) as any, { srcFps: src }); const g = pl.passes[0].graph;
    assert.equal(g['3'].class_type, 'RIFE VFI'); assert.equal(g['3'].inputs.multiplier, mult, `${src}→${tgt}`); assert.equal(g['4'].inputs.fps, fps); assert.equal(pl.postFps, Number(tgt)); assert.match(JSON.stringify(g['1'].inputs.file), /in\.mp4/); }
  ok('FPS Boost: comfy-rife has a native plan (RIFE VFI ×ceil(target/src), CreateVideo at src×mult, ffmpeg fps=target)');

  const A = boot(testPort(8961)), K = boot(testPort(8962), { OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '2500', OPENHIGGSFIELD_BILLING_MODE: 'team' /* (2)/(4) check the team ledger wording; own-accounts (default since 2026-10-21) never charges the app balance */ }); await ready(A); await ready(K);
  // (1) presets + capabilities
  const tools = (await get(A, '/api/tools')).body; const rs = (Array.isArray(tools) ? tools : tools.tools).find((t: any) => t.id === 'reshoot');
  for (const p of rs.presets) { assert.equal(typeof p.yaw, 'number', p.id); assert.equal(typeof p.tilt, 'number', p.id); assert.equal(typeof p.zoom, 'number'); assert.equal(typeof p.pad, 'boolean'); }
  assert.deepEqual(rs.presets.find((p: any) => p.id === 'left-side'), { id: 'left-side', label: 'left side', prompt: 'left side', yaw: -90, tilt: 0, zoom: 1, move: null, pad: true, previewUrl: rs.presets.find((p: any) => p.id === 'left-side').previewUrl });
  const cap = rs.capabilities; assert.equal(cap.angleSpace.yaw.min, -180); assert.equal(cap.angleSpace.tilt.max, 60); assert.equal(cap.angleSpace.snapDeg, 20);
  assert.equal(cap.imageInputByProvider['comfy-open'], false); assert.equal(cap.imageInputByProvider['comfy-funcamera'], true); assert.ok(cap.imageInputProviders.includes('comfy-funcamera'));
  assert.ok(rs.inputs.some((i: any) => i.name === 'sourceImage'));
  ok('Re-shoot presets carry yaw/tilt/zoom/move/pad; capabilities.angleSpace + imageInputByProvider');
  const snap = await submit(A, 'reshoot', { provider: 'comfy-open', angles: JSON.stringify([{ start: 0, end: 3, yaw: -80, tilt: 5 }, { start: 3, end: 6, yaw: 45, tilt: 0 }]) }, [['video', MP4, 'video/mp4']]);
  assert.equal(snap.status, 200, JSON.stringify(snap.body)); const sj = await until(A, snap.body.id); assert.equal(sj.status, 'done', sj.error);
  assert.deepEqual(sj.input.angles[0], { start: 0, end: 3, angle: 'left side', yaw: -80, tilt: 5, preset: 'left side' });
  assert.equal(sj.input.angles[1].angle, "camera 45° to the subject's right, at eye level"); assert.equal(sj.input.angles[1].preset, 'right side');
  const top = await submit(A, 'reshoot', { provider: 'comfy-open', yaw: '0', tilt: '40' }, [['video', MP4, 'video/mp4']]); assert.equal(top.status, 200, JSON.stringify(top.body));
  assert.equal((await until(A, top.body.id)).input.angles[0].angle, 'high angle');
  const far = await submit(A, 'reshoot', { provider: 'comfy-open', angles: JSON.stringify([{ yaw: 200, tilt: 0 }]) }, [['video', MP4, 'video/mp4']]); assert.equal(far.status, 400); assert.equal(far.body.issues[0].field, 'angles[0].yaw'); assert.equal(far.body.refund.charged, false);
  const tl = await submit(A, 'reshoot', { provider: 'comfy-open', tilt: '-90' }, [['video', MP4, 'video/mp4']]); assert.equal(tl.status, 400); assert.equal(tl.body.issues[0].field, 'tilt');
  const RS = await import('../src/tools/reshoot.js'); assert.deepEqual(RS.resolveYawTilt(5, 2), { angle: 'camera from the front, at eye level', preset: null, yaw: 5, tilt: 2, snapped: false }); assert.equal(RS.resolveYawTilt(180, 0).angle, 'camera from behind the subject, at eye level');
  ok('custom yaw/tilt: within 20° → preset (left side, high angle); else phrase + nearest preset; out of range → 400 angles[i].yaw / tilt');
  const noImg = await submit(A, 'reshoot', { provider: 'comfy-open', angles: '["low angle"]' }, [['sourceImage', PNG, 'image/png']]); assert.equal(noImg.status, 400, JSON.stringify(noImg.body));
  assert.equal(noImg.body.code, 'image_input_unsupported'); assert.equal(noImg.body.issues[0].field, 'sourceImage'); assert.ok(noImg.body.issues[0].providers.includes('comfy-funcamera')); assert.match(noImg.body.error, /needs a video/);
  const both = await submit(A, 'reshoot', { provider: 'comfy-funcamera', angles: '["low angle"]' }, [['video', MP4, 'video/mp4'], ['sourceImage', PNG, 'image/png']]); assert.equal(both.status, 400);
  const img = await submit(A, 'reshoot', { provider: 'comfy-funcamera', angles: JSON.stringify([{ yaw: 90, tilt: 0 }]), seconds: '4' }, [['sourceImage', PNG, 'image/png']]); assert.equal(img.status, 200, JSON.stringify(img.body));
  const ij = await until(A, img.body.id); assert.equal(ij.status, 'done', ij.error); assert.equal(ij.input.sourceKind, 'image'); assert.equal(ij.input.duration, 4); assert.match(ij.input.imageSourceUrl, /^\/files\//); assert.ok(!JSON.stringify(ij.input).includes(D), 'no host paths');
  const badSec = await submit(A, 'reshoot', { provider: 'comfy-funcamera', angles: '["low angle"]', seconds: '30' }, [['sourceImage', PNG, 'image/png']]); assert.equal(badSec.status, 400); assert.equal(badSec.body.issues[0].field, 'seconds');
  const q = (await get(A, '/api/tools/reshoot/price?sourceImage=1&duration=5')).body; const auto = await submit(A, 'reshoot', { angles: '["low angle"]' }, [['sourceImage', PNG, 'image/png']]);
  assert.equal(auto.status, 200, JSON.stringify(auto.body)); assert.ok(RS.RESHOOT_IMAGE_INPUT[auto.body.provider], auto.body.provider); assert.equal(q.routeId?.split(':').pop(), auto.body.provider, `quote ${q.routeId} = submit ${auto.body.provider}`);
  const fsP = P.buildPlan({ id: 'j', toolId: 'reshoot', provider: 'comfy-funcamera', input: { ...ij.input, imageSourcePath: '/data/s.png', videoPath: '', angles: ij.input.angles } } as any);
  assert.equal(fsP.post.kind, 'concat'); assert.equal((fsP.passes[0] as any).prep[0].src, '/data/s.png'); assert.equal(fsP.passes[0].graph['108'].inputs.camera_pose, 'Pan Right');
  ok('still source: comfy-funcamera runs it (sourceKind image, seconds 2–10); comfy-open → 400 image_input_unsupported; both → 400; Auto picks an image model (quote = submit); Fun Camera plan uses the still');
  // (2) 409 'already processing' wording
  const paid = await submit(K, 'h3-video', { provider: 'router-veo', duration: '8', prompt: 'a paper boat', types: '["t2v"]' }); assert.equal(paid.status, 200, JSON.stringify(paid.body)); assert.ok(paid.body.cost > 0, JSON.stringify(paid.body));
  await until(K, paid.body.id, ['running', 'done', 'failed']); const c1 = await sendJson(K, 'POST', `/api/jobs/${paid.body.id}/cancel`);
  assert.equal(c1.status, 409, JSON.stringify(c1.body)); assert.equal(c1.body.charged, true); assert.match(c1.body.error, /credits go back to your balance/); assert.doesNotMatch(c1.body.error, /refund/i);
  const free = await submit(K, 'sdr-hdr', {}, [['video', MP4, 'video/mp4']]); assert.equal(free.status, 200, JSON.stringify(free.body)); assert.equal(free.body.cost, 0);
  await until(K, free.body.id, ['running', 'done', 'failed']); const c2 = await sendJson(K, 'POST', `/api/jobs/${free.body.id}/cancel`);
  assert.equal(c2.status, 409, JSON.stringify(c2.body)); assert.equal(c2.body.charged, false); assert.equal(c2.body.error, 'This job is already processing and can no longer be canceled. It will finish on its own.');
  ok('409 cannot_cancel_processing: charged job mentions credits back (charged:true); free job plain wording (charged:false)');
  // (4) live ledger note on a charged failure
  const fail = await submit(K, 'h3-video', { provider: 'router-veo', duration: '8', prompt: 'a paper boat', types: '["t2v"]', simulate: 'temporary' }); assert.equal(fail.status, 200, JSON.stringify(fail.body));
  const fjb = await until(K, fail.body.id); assert.equal(fjb.status, 'failed');
  const led = (await get(K, '/api/ledger')).body.entries.filter((e: any) => e.kind === 'refund' && String(e.jobId).startsWith(fail.body.id));
  assert.ok(led.length >= 1, 'a credits-back row'); for (const e of led) { assert.match(e.note, /: (partial )?credits back to your balance$/, e.note); assert.doesNotMatch(e.note, /refund/i); }
  assert.ok(led.some((e: any) => /^Run failed \(temporary problem\)|failed/.test(e.note)), JSON.stringify(led));
  ok(`ledger: charged failure → "${led[0].note}"`);
  // (5) saved user styles
  const s0 = await sendJson(A, 'POST', '/api/user-styles', { name: 'Teal noir', prompt: 'teal shadows, hard key light', settings: { aspect: '16:9', quality: 'high' } }); assert.equal(s0.status, 201, JSON.stringify(s0.body));
  assert.deepEqual(Object.keys(s0.body).sort(), ['createdAt', 'id', 'name', 'prompt', 'settings', 'toolId']); assert.equal(s0.body.toolId, 'create-image'); assert.deepEqual(s0.body.settings, { aspect: '16:9', quality: 'high' });
  assert.equal((await sendJson(A, 'POST', '/api/user-styles', { name: 'teal NOIR', prompt: 'x' })).status, 409);
  const v1 = await sendJson(A, 'POST', '/api/user-styles', { name: '', prompt: 'x' }); assert.equal(v1.status, 400); assert.equal(v1.body.issues[0].field, 'name');
  const v2 = await sendJson(A, 'POST', '/api/user-styles', { name: 'a', promptFragment: 'y'.repeat(1001) }); assert.equal(v2.status, 400); assert.equal(v2.body.issues[0].field, 'prompt');
  assert.equal((await sendJson(A, 'POST', '/api/user-styles', { name: 'b', prompt: 'y', settings: [1] })).status, 400);
  const s1 = await sendJson(A, 'POST', '/api/user-styles', { name: 'Soft pastel', promptFragment: 'soft pastel palette' }); assert.equal(s1.status, 201); assert.equal(s1.body.settings, null);
  let ls = (await get(A, '/api/user-styles')).body; assert.equal(ls.items.length, 2); assert.equal(ls.max, 200); assert.equal((await get(A, '/api/user-styles?toolId=soul')).body.items.length, 0);
  assert.equal((await sendJson(A, 'DELETE', `/api/user-styles/${s0.body.id}`)).status, 200); assert.equal((await sendJson(A, 'DELETE', `/api/user-styles/${s0.body.id}`)).status, 404);
  ls = (await get(A, '/api/user-styles')).body; assert.deepEqual(ls.items.map((x: any) => x.name), ['Soft pastel']);
  const spec = (await get(A, '/api/openapi.json')).body; assert.ok(spec.paths['/api/user-styles']?.post && spec.paths['/api/user-styles/{id}']?.delete && spec.components.schemas.UserStyle);
  ok('user styles: create (201) / duplicate 409 / 400 issues / list ?toolId / delete 404 after; in openapi');
  // (7) posters: the 7 image tiles are distinct files; no app borrows create-image art
  const ps = (await get(A, '/api/posters')).body; const by = Object.fromEntries(ps.items.map((x: any) => [x.toolId, x]));
  for (const id of ['app-character-sheet', 'app-product-shot', 'app-inpaint', 'app-relight']) { assert.notEqual(by[id].file, 'create-image-generate.jpg', id); assert.ok(!String(by[id].file ?? '').startsWith('create-image'), id); }
  // /image tiles are menu features now (ids like 'relight' → tool app-relight), so each tile carries its own posterUrl (or posterStandIn: no art yet, the
  // branded stand-in shows). Camera & Lens is Create Image with a rig, so it shows Create Image's poster: distinct poster URLs must be distinct files.
  const byUrl = new Map<string, any>(ps.items.map((x: any) => [x.posterUrl, x])); const cards404: string[] = []; const standIns: string[] = [];
  const drawtext = (() => { try { return /\bdrawtext\b/.test(execFileSync('ffmpeg', ['-hide_banner', '-filters'], { env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` }, stdio: ['ignore', 'pipe', 'ignore'] }).toString()); } catch { return false; } })();
  const tiles = (await get(A, '/api/browse/image')).body.tools as any[]; const img7 = tiles.map((t) => t.id); const hashes = new Map<string, string>(); const seen = new Set<string>();
  for (const t of tiles) { if (t.posterStandIn) { assert.equal(t.posterUrl ?? null, null, `${t.id}: stand-in has no poster url`); standIns.push(t.id); continue; }
    assert.match(t.posterUrl ?? '', /^\/api\/posters\/[\w-]+\.jpg$/, t.id); if (seen.has(t.posterUrl)) { assert.ok(t.id === 'camera-lens' && t.posterUrl === '/api/posters/create-image.jpg', `${t.id} reuses ${t.posterUrl}`); continue; } seen.add(t.posterUrl);
    const r = await fetch(`${A}${t.posterUrl}`);
    // a title card (no art file yet) is drawn with ffmpeg drawtext; builds without it 404 and the web shows the tool glyph instead (Live.tsx)
    if (r.status === 404 && byUrl.get(t.posterUrl)?.kind === 'card' && !drawtext) { cards404.push(t.id); continue; } assert.equal(r.status, 200, t.id); const h = createHash('md5').update(Buffer.from(await r.arrayBuffer())).digest('hex'); assert.ok(!hashes.has(h), `${t.id} shares its poster with ${hashes.get(h)}`); hashes.set(h, t.id); }
  assert.ok(hashes.size + cards404.length + (drawtext ? 0 : standIns.length) >= 7, `${hashes.size} distinct posters`); /* no drawtext: title-card tools are stand-in tiles (routesDiscover.posterStandIn) */ if (cards404.length) console.log(`  (ffmpeg has no drawtext here: title cards not rendered for ${cards404.join(', ')})`);
  ok(`posters: ${hashes.size} distinct posters across ${img7.length} /image tiles; still need a real poster: ${ps.needsRealPoster.join(', ') || 'none'}`);
  // (8) Remove BG / app video upscale: no clip → estimate flags
  for (const t of ['remove-bg', 'app-video-upscale']) { const p = (await get(A, `/api/tools/${t}/price`)).body; assert.equal(p.estimated, true, t); assert.equal(typeof p.assumedSeconds, 'number', t); assert.match(p.estimateMessage, /Estimate for/, t); }
  ok('Remove BG + app video upscale quotes: estimated / assumedSeconds / estimateMessage without a clip');
  console.log('ALL OK dp14-server');
} finally { for (const p of procs) { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } } fs.rmSync(D, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) /* the killed server may still be writing: ENOTEMPTY under load */; }
