// E2E (own mock server :8897, temp data dir): no policing layer. Report / moderation queue / suspension /
// rights-ack (Terms-style acceptance) routes are gone (404, no stubs); generating needs no rights/Terms acceptance; no app-side
// prompt/image pre-blocking and no moderation cooldown. Kept: provider-side refusals (mock simulate=nsfw|ip → blocked, refunded once),
// technical upload validation, and the 'Powered by MiniMax H3' attribution. No 'I own the rights' gate: a plain Retry resubmits a refused job (DEMO-QA 33/34). Run: npx tsx test/no-policing.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(8897); const B = `http://localhost:${PORT}`;
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'nop-'));
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BILLING_MODE: 'team', OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '300', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_SUSPEND_AFTER: '1', OPENHIGGSFIELD_MOD_COOLDOWN_SEC: '600' }, stdio: 'ignore', detached: true });
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'nopf-')); const png = path.join(T, 'r.png'), mp4 = path.join(T, 'a.mp4'), low = path.join(T, 'low.png');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=854x480:rate=24', '-t', '4', '-pix_fmt', 'yuv420p', mp4]);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=512x512', '-frames:v', '1', png]);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=64x64', '-frames:v', '1', low]);
const raw = async (m: string, u: string, b?: unknown) => { const r = await fetch(B + u, { method: m, headers: b === undefined ? {} : { 'content-type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) }); const t = await r.text(); let body: any = t; try { body = JSON.parse(t); } catch { /* html */ } return { status: r.status, body }; };
const get = (u: string) => raw('GET', u);
const form = async (u: string, f: Record<string, string>, files: [string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); for (const [k, p] of files) fd.append(k, new Blob([fs.readFileSync(p)]), path.basename(p)); const r = await fetch(B + u, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
const done = async (id: string) => { for (let i = 0; i < 300; i++) { const j = (await get(`/api/jobs/${id}`)).body; if (['done', 'failed', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout ' + id); };
const IMG = { types: '["generate"]', provider: 'comfy-zimage-turbo', route: 'local:comfy-zimage-turbo' };
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); }
  // a finished, shared job to aim the old routes at
  const j0 = await form('/api/tools/create-image/jobs', { ...IMG, prompt: 'a red mug' }); assert.equal(j0.status, 200, JSON.stringify(j0.body)); const e0 = await done(j0.body.id); assert.equal(e0.status, 'done');
  const tok = (await raw('POST', `/api/jobs/${e0.id}/share`)).body.token; assert.ok(tok);
  assert.equal((await raw('POST', `/api/jobs/${e0.id}/visibility`, { visibility: 'public' })).status, 200);
  // ---- removed routes → 404 (JSON not_found, no stubs) ----
  for (const [m, u, b] of [['POST', `/api/jobs/${e0.id}/report`, { reason: 'spam' }], ['POST', `/api/share/${tok}/report`, { reason: 'spam' }], ['POST', `/api/community/shots/${e0.id}/report`, { reason: 'spam' }],
    ['GET', '/api/reports'], ['POST', `/api/reports/${e0.id}/resolve`, { action: 'remove' }], ['GET', '/api/admin/suspensions'], ['DELETE', '/api/admin/suspensions/client:x'],
    ['GET', '/api/me/rights-ack'], ['POST', '/api/me/rights-ack', { acknowledged: true }], ['GET', '/api/terms'], ['POST', '/api/terms/accept', {}], ['POST', '/api/me/terms', { accepted: true }]] as [string, string, unknown?][]) {
    const r = await raw(m, u, b); assert.equal(r.status, 404, `${m} ${u} → ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`); }
  { const spec = (await get('/api/openapi.json')).body; const ps = Object.keys(spec.paths);
    for (const p of ps) assert.ok(!/report$|\/reports|suspension|rights-ack|\/terms/.test(p), `openapi still lists ${p}`); }
  console.log('ok report, moderation queue, suspension and rights-ack/terms routes → 404; none left in openapi.json');
  // ---- no flags/fields left over ----
  { const c = (await get('/api/config')).body; for (const k of ['rightsAck', 'rightsAckVersion', 'contactEmail', 'moderation', 'termsAccepted']) assert.ok(!(k in c), `/api/config.${k}`);
    const me = (await get('/api/me')).body; assert.ok(!('rightsAck' in me)); assert.ok(!('moderation' in (await get('/api/health')).body)); assert.ok(!('moderation' in (await get('/api/health/self-host')).body));
    assert.ok(!('cooldown' in (await get('/api/queue')).body));
    const html = (await get(`/s/${tok}`)).body as string; assert.ok(!/report|mailto:/i.test(html), 'share page: no report form / abuse contact');
    console.log('ok no rightsAck/contactEmail/moderation/cooldown fields; share page has no report form'); }
  // ---- generation needs no Terms / rights acceptance, and nothing is pre-blocked by the app ----
  { const sw = await form('/api/tools/object-swap/jobs', { prompt: 'swap the mug', route: 'local:comfy-open' }, [['video', mp4], ['refs', png]]); assert.equal(sw.status, 200, `no rights field: ${JSON.stringify(sw.body)}`); assert.equal((await done(sw.body.id)).status, 'done');
    const kw = await form('/api/tools/create-image/jobs', { ...IMG, prompt: 'nude figure study, gore, nsfw' }); assert.equal(kw.status, 200); const ke = await done(kw.body.id); assert.equal(ke.status, 'done', `no app keyword filter: ${ke.status} ${ke.error}`);
    const im = await form('/api/tools/object-swap/jobs', { prompt: 'x', route: 'local:comfy-open', simulateModeration: '1' }, [['video', mp4], ['refs', png]]); assert.equal(im.status, 200, `no app image filter: ${JSON.stringify(im.body)}`);
    assert.equal((await done(im.body.id)).status, 'done');
    console.log('ok submit without rights/Terms → 200 + done; denylist words and simulateModeration no longer block'); }
  // ---- kept: provider-side refusal (mock) → blocked, honest message, refunded once; no cooldown after many ----
  { const ids: string[] = []; for (let i = 0; i < 6; i++) { const r = await form('/api/tools/create-image/jobs', { ...IMG, prompt: 'p' + i, simulate: 'nsfw' }); assert.equal(r.status, 200, `submit ${i} (no cooldown): ${JSON.stringify(r.body)}`); ids.push(r.body.id); }
    for (const id of ids) { const e = await done(id); assert.equal(e.status, 'blocked'); assert.equal(e.errorType, 'nsfw'); assert.match(e.error, /provider/i); assert.ok(((e.error as string).match(/back to your (app )?balance/gi) ?? []).length <= 1); assert.doesNotMatch(e.error, /refunded/i, 'plain wording: credits back to your balance'); }
    const after = await form('/api/tools/create-image/jobs', { ...IMG, prompt: 'after six blocks' }); assert.equal(after.status, 200, `no 429 moderation_cooldown: ${JSON.stringify(after.body)}`);
    const ip = await form('/api/tools/object-swap/jobs', { prompt: 'x', route: 'local:comfy-open', simulate: 'ip' }, [['video', mp4], ['refs', png]]); const ie = await done(ip.body.id); assert.equal(ie.status, 'blocked'); assert.equal(ie.errorType, 'ip'); assert.match(ie.error, /provider/i);
    console.log('ok provider refusals (mock nsfw/ip) end blocked with a provider message; 6 in a row → no cooldown'); }
  // ---- DEMO-QA 33 / 34: provider refusal → honest message, refunded once, plain Retry resubmits (new job, own quote + charge) ----
  for (const [row, sim] of [[33, 'nsfw'], [34, 'ip']] as const) {
    const PAID = { prompt: 'retry me', provider: 'router-seedance', resolution: '720p', seconds: '4' };
    const bal = async () => (await get('/api/usage')).body.balance ?? (await get('/api/ledger')).body.balance;
    const q = (await get('/api/tools/object-swap/price?provider=router-seedance&resolution=720p&seconds=4')).body; const b0 = await bal();
    const j = await form('/api/tools/object-swap/jobs', { ...PAID, simulate: sim }, [['video', mp4], ['refs', png]]); assert.equal(j.status, 200, `row ${row}: ${JSON.stringify(j.body)}`);
    const e = await done(j.body.id); assert.equal(e.status, 'blocked', `row ${row}`); assert.equal(e.errorType, sim); assert.match(e.error, /provider/i);
    assert.ok(((e.error as string).match(/back to your (app )?balance|Nothing was charged/gi) ?? []).length <= 1, `row ${row} refund text once`);
    const led0 = (await get('/api/ledger')).body.entries.filter((x: any) => x.jobId === e.id || String(x.jobId ?? '').startsWith(`${e.id}#a`));
    const charged = led0.filter((x: any) => x.kind === 'charge').reduce((s: number, x: any) => s - x.amount, 0), refunded = led0.filter((x: any) => x.kind === 'refund').reduce((s: number, x: any) => s + x.amount, 0);
    assert.equal(refunded, charged, `row ${row}: refunded once in full (${charged} charged, ${refunded} refunded)`); assert.equal(await bal(), b0, `row ${row}: balance back after the refusal`);
    const r = await raw('POST', `/api/jobs/${e.id}/retry`); assert.equal(r.status, 200, `row ${row} plain retry: ${JSON.stringify(r.body)}`); assert.equal(r.body.retryOf, e.id); assert.notEqual(r.body.id, e.id);
    assert.equal(r.body.cost, q.credits, `row ${row}: retry charged its own quote`); assert.equal(await bal(), b0 - r.body.cost, `row ${row}: new charge`);
    assert.equal((await raw('POST', `/api/jobs/${e.id}/retry`)).body.id, r.body.id, `row ${row}: double click → same retry`);
    const re = await done(r.body.id); assert.equal(re.status, 'done', `row ${row}: retry ran`); assert.equal((await get(`/api/jobs/${e.id}`)).body.status, 'blocked', `row ${row}: refused job still shown as blocked`);
    for (const u of [`/api/jobs/${e.id}/retry?ownsRights=1`]) assert.equal((await raw('POST', u)).body.code === 'needs_rights', false);
    console.log(`ok DEMO-QA ${row}: provider ${sim} refusal → blocked, refunded once (${charged}); plain retry → new job ${r.body.id}, cost ${r.body.cost} = quote, done`); }
  // ---- kept: technical image validation (low_res) ----
  { const r = await form('/api/tools/object-swap/jobs', { prompt: 'x', route: 'local:comfy-open' }, [['video', mp4], ['refs', low]]);
    assert.equal(r.status, 400, JSON.stringify(r.body)); assert.ok(JSON.stringify(r.body).includes('low_res'), JSON.stringify(r.body).slice(0, 300)); console.log('ok low_res upload still rejected (technical validation)'); }
  // ---- kept: 'Powered by MiniMax H3' attribution ----
  { const h = await form('/api/tools/h3-video/jobs', { provider: 'comfy-h3', prompt: 'a lighthouse at dusk', types: '["t2v"]', duration: '5', route: 'local:comfy-h3' }); assert.equal(h.status, 200, JSON.stringify(h.body));
    const he = await done(h.body.id); assert.equal(he.status, 'done'); assert.equal(he.attribution?.text, 'Powered by MiniMax H3'); assert.equal(he.attribution?.required, false); assert.equal(he.attribution?.requiredText, 'MiniMax H3'); console.log('ok H3 attribution kept, H3 runs without a rights field'); }
  // ---- licence/usage note on the Models & Licences data ----
  { const l = (await get('/api/licenses')).body; assert.match(l.usageNote, /responsible for following each model's licence/); console.log('ok /api/licenses usageNote'); }
  console.log('ALL OK no-policing');
} finally { try { process.kill(-srv.pid!); } catch { /* */ } fs.rmSync(T, { recursive: true, force: true }); }
