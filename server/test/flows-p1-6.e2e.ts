// E2E (own mock server, port 8829): flow-run fixes — plain retry for failed jobs, /api/media quality checks
// (low_res / unreadable / all-black images; audio unreadable / too_short / silent), audio uploads, voice previewUrl,
// precheck with toolId=soul + reference photos, GET /api/tools/:toolId/jobs. Run: npx tsx test/flows-p1-6.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const PORT = testPort(8829), B = `http://localhost:${PORT}`, D = fs.mkdtempSync(path.join(os.tmpdir(), 'fp16-')), F = fs.mkdtempSync(path.join(os.tmpdir(), 'fp16f-'));
const uploadsOnly = process.argv.includes('--uploads-only');
const srv = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: '/dev/null', OPENHIGGSFIELD_FILMING_FILE: '/dev/null', OPENHIGGSFIELD_BILLING_MODE: 'team', OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_USE_LOCAL: uploadsOnly ? '0' : '1', OPENHIGGSFIELD_MOCK_KEYS: uploadsOnly ? '0' : '1' /* mocked hosted keys → priced routes */ }, stdio: 'ignore' });
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);
const mk = (n: string) => path.join(F, n);
ff('-f', 'lavfi', '-i', 'testsrc=s=800x800', '-frames:v', '1', mk('ok.png')); ff('-f', 'lavfi', '-i', 'testsrc=s=800x600', '-frames:v', '1', mk('ok.jpg'));
ff('-f', 'lavfi', '-i', 'testsrc=s=64x64', '-frames:v', '1', mk('tiny.png')); ff('-f', 'lavfi', '-i', 'testsrc=s=320x320', '-frames:v', '1', mk('small.png'));
ff('-f', 'lavfi', '-i', 'color=black:s=800x800', '-frames:v', '1', mk('black.png')); fs.writeFileSync(mk('corrupt.png'), fs.readFileSync(mk('ok.png')).subarray(0, 300));
ff('-f', 'lavfi', '-i', 'sine=f=220:d=5', mk('ok.wav')); ff('-f', 'lavfi', '-i', 'sine=d=5', mk('ok.mp3')); ff('-f', 'lavfi', '-i', 'sine=d=5', '-c:a', 'aac', mk('ok.m4a'));
ff('-f', 'lavfi', '-i', 'sine=d=1', mk('short.wav')); ff('-f', 'lavfi', '-i', 'anullsrc=d=5', '-t', '5', mk('silent.wav')); fs.writeFileSync(mk('junk.wav'), 'not audio');
const req = async (m: string, u: string, body?: unknown) => { const r = await fetch(B + u, { method: m, ...(body !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) }); return { status: r.status, body: await r.json().catch(() => null) as any }; };
const form = async (u: string, fields: Record<string, string>, files: [string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v); for (const [k, f] of files) fd.append(k, new Blob([fs.readFileSync(mk(f))]), f); const r = await fetch(B + u, { method: 'POST', body: fd }); return { status: r.status, body: await r.json().catch(() => null) as any }; };
const upload = (f: string) => form('/api/media', {}, [['file', f]]);
const settle = async (id: string) => { for (let i = 0; i < 240; i++) { const j = (await req('GET', `/api/jobs/${id}`)).body; if (['done', 'failed', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 250)); } throw new Error(`job ${id} never settled`); };
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); }
  if (!uploadsOnly) {
  await req('PUT', '/api/me/routing', { global: { mode: 'auto', allowFallback: true, useLocal: true } });
  // 1) plain retry
  const img = { types: 'generate', prompt: 'a red fox in snow', provider: 'api-nano-banana' /* hosted, 9 credits */, rights: '1' };
  const f = await form('/api/tools/create-image/jobs', { ...img, simulate: 'temporary' }); assert.equal(f.status, 200, JSON.stringify(f.body)); const fj = await settle(f.body.id); assert.equal(fj.status, 'failed');
  const bal0 = (await req('GET', '/api/ledger')).body.balance;
  const r1 = await req('POST', `/api/jobs/${f.body.id}/retry`); assert.equal(r1.status, 200, JSON.stringify(r1.body)); assert.notEqual(r1.body.id, f.body.id); assert.equal(r1.body.retryOf, f.body.id);
  const r2 = await req('POST', `/api/jobs/${f.body.id}/retry`); assert.equal(r2.body.id, r1.body.id); assert.equal(r2.body.idempotentReplay, true);
  const nj = await settle(r1.body.id); assert.equal(nj.status, 'done'); assert.equal(nj.parentId, f.body.id);
  const led = (await req('GET', '/api/ledger')).body; const charge = led.entries.find((e: any) => e.jobId === r1.body.id && e.kind === 'charge');
  assert.equal(led.balance, bal0 - r1.body.cost); assert.ok(r1.body.cost > 0); assert.ok(charge, 'retry is charged'); assert.equal(fj.refunded ?? r1.body.cost, r1.body.cost);
  console.log(`ok POST /api/jobs/:id/retry: failed ${f.body.id} → new ${r1.body.id} (cost ${r1.body.cost}, charged=${!!charge}), second click → same id (idempotentReplay), runs to done`);
  assert.equal((await req('POST', `/api/jobs/${r1.body.id}/retry`)).body.code, 'not_failed'); assert.equal((await req('POST', `/api/jobs/${r1.body.id}/retry`)).status, 409);
  const nsfw = await form('/api/tools/create-image/jobs', { ...img, simulate: 'nsfw' }); await settle(nsfw.body.id); const rb = await req('POST', `/api/jobs/${nsfw.body.id}/retry`); assert.equal(rb.status, 200, JSON.stringify(rb.body)); assert.equal(rb.body.retryOf, nsfw.body.id);
  const ip = await form('/api/tools/create-image/jobs', { ...img, simulate: 'ip' }, [['refs', 'ok.png']]); const ipj = await settle(ip.body.id);
  assert.equal(ipj.status, 'blocked'); assert.equal(ipj.errorType, 'ip'); { const ri = await req('POST', `/api/jobs/${ip.body.id}/retry`); assert.equal(ri.status, 200, JSON.stringify(ri.body)); assert.equal(ri.body.retryOf, ip.body.id); }
  console.log('ok retry rejects done (409 not_failed); provider-blocked nsfw / ip → plain retry 200 (new job)');
  assert.equal((await req('POST', '/api/jobs/nope/retry')).status, 404);
  }
  // 2) + 3) /api/media checks + audio uploads
  for (const ok of ['ok.png', 'ok.jpg']) { const u = await upload(ok); assert.equal(u.status, 200, JSON.stringify(u.body)); assert.ok(u.body.items[0].width > 0); }
  const sm = await upload('small.png'); assert.equal(sm.status, 200); assert.equal(sm.body.items[0].warnings[0].code, 'low_res');
  for (const [bad, code] of [['tiny.png', 'low_res'], ['corrupt.png', 'upload_format'], ['black.png', 'dark'], ['short.wav', 'too_short'], ['silent.wav', 'silent'], ['junk.wav', 'upload_format']]) {
    const u = await upload(bad); assert.equal(u.status, 400, bad); assert.equal(u.body.code, code, `${bad}: ${JSON.stringify(u.body)}`); assert.equal(u.body.errorType, 'validation'); }
  for (const a of ['ok.wav', 'ok.mp3', 'ok.m4a']) { const u = await upload(a); assert.equal(u.status, 200, `${a} ${JSON.stringify(u.body)}`); assert.equal(u.body.items[0].type, 'audio'); assert.ok(u.body.items[0].duration >= 4.5); }
  const la = (await req('GET', '/api/media?tab=uploads&type=audio')).body; assert.equal(la.total, 3); const li = (await req('GET', '/api/media?tab=uploads')).body; assert.ok(li.items.every((m: any) => m.type !== 'audio'));
  assert.equal((await form('/api/media', {}, [['file', 'ok.png']])).status, 200);
  console.log('ok POST /api/media: 64px → 400 low_res, corrupt/junk → 400 upload_format, all-black → 400 dark, 320px → 200 + warning low_res; wav/mp3/m4a → 200 type audio + duration; 1 s → too_short, silent → silent; audio listed only with ?type=audio');
  // precheck
  const pc = await form('/api/precheck', { toolId: 'soul' }, [['refs', 'ok.png'], ['refs', 'small.png']]); assert.equal(pc.status, 200, JSON.stringify(pc.body)); assert.equal(pc.body.blocking, false); assert.equal(pc.body.checks.refs.length, 2); assert.ok(pc.body.warnings.some((w: any) => w.code === 'low_res' && w.field === 'refs[1]'));
  const pcb = await form('/api/precheck', { toolId: 'soul' }, [['refs', 'black.png'], ['refs', 'tiny.png']]); assert.equal(pcb.body.blocking, true);
  assert.deepEqual(pcb.body.warnings.map((w: any) => w.code), ['dark', 'low_res']);
  const pcs = await form('/api/precheck', {}, [['image', 'corrupt.png']]); assert.equal(pcs.status, 400); assert.equal(pcs.body.code, 'upload_format');
  const pca = await form('/api/precheck', { toolId: 'voice' }, [['samples', 'ok.wav'], ['samples', 'short.wav'], ['samples', 'silent.wav']]);
  assert.deepEqual(pca.body.warnings.map((w: any) => `${w.field}:${w.code}`), ['samples[1]:too_short', 'samples[2]:silent']); assert.equal(pca.body.checks.audio.length, 3);
  const junk = await form('/api/precheck', {}, [['samples', 'junk.wav']]); assert.equal(junk.status, 400); assert.equal(junk.body.code, 'upload_format');
  assert.equal((await form('/api/precheck', { toolId: 'soul' })).status, 400);
  console.log('ok POST /api/precheck: refs/audio retain quality advisories; corrupt files rejected before precheck with 400 upload_format');
  if (!uploadsOnly) {
  // 4) voices
  const v = (await req('GET', '/api/voices')).body.voices; assert.ok(v.filter((x: any) => x.id !== 'clone').every((x: any) => typeof x.previewUrl === 'string'));
  const pr = await fetch(B + v[0].previewUrl); assert.equal(pr.status, 200); assert.equal(pr.headers.get('content-type'), 'audio/wav'); const buf = Buffer.from(await pr.arrayBuffer()); assert.equal(buf.subarray(0, 4).toString(), 'RIFF');
  assert.equal((await fetch(`${B}/api/voices/clone/preview`)).status, 404); assert.equal((await fetch(`${B}/api/voices/nope/preview`)).status, 404);
  console.log(`ok GET /api/voices: ${v.length - 1} voices with previewUrl (local mock wav, ${buf.length} bytes); clone → previewUrl null`);
  // 5/6) soul history
  const s1 = await form('/api/tools/soul/jobs', { prompt: 'portrait of a woman in golden hour light', rights: '1' }); assert.equal(s1.status, 200, JSON.stringify(s1.body));
  const h1 = await req('GET', '/api/tools/soul/jobs'); const h2 = await req('GET', '/api/jobs?toolId=soul'); assert.equal(h1.status, 200); assert.deepEqual(h1.body.map((j: any) => j.id), h2.body.map((j: any) => j.id)); assert.ok(h1.body.some((j: any) => j.id === s1.body.id)); assert.ok(h1.body.every((j: any) => j.toolId === 'soul'));
  assert.equal((await req('GET', '/api/tools/nope/jobs')).status, 404); assert.ok((await req('GET', '/api/tools/soul/jobs?tool=create-image')).body.every((j: any) => j.toolId === 'soul'));
  console.log(`ok GET /api/tools/soul/jobs = GET /api/jobs?toolId=soul (${h1.body.length} jobs); unknown tool → 404`);
  }
} finally { srv.kill('SIGTERM'); await new Promise<void>(r => { srv.once('exit', () => r()); setTimeout(() => { srv.kill('SIGKILL'); r(); }, 5000).unref(); }); fs.rmSync(D, { recursive: true, force: true }); fs.rmSync(F, { recursive: true, force: true }); }
process.exit(0);
