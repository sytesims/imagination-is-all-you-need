// E2E (own mock server :8897, temp data dir; never the live DB): B3 GET /api/jobs/:id/prefill for every action, each prefill
// validated by submitting its fields to the target tool (200); B7 owner/isOwner on job, list, share and Community responses,
// recorded on create and backfilled at read time. Run: npx tsx test/prefill-owner.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import Database from 'better-sqlite3';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'prefill-')); const PORT = Number(process.env.PF_PORT || testPort(8897));
const ENV = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_DELAY_MS: '200', PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_DEMO_AUTO: '0' /* keyless = no_provider (real-mode rules) */ };
const B = `http://localhost:${PORT}`; let srv: ChildProcess | null = null;
async function start() { srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...ENV }, stdio: 'ignore', detached: true });
  for (let i = 0; i < 90; i++) { try { if ((await fetch(`${B}/api/health`)).ok) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); } throw new Error('server did not start'); }
const stop = async () => { if (srv) { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* */ } srv = null; await new Promise((r) => setTimeout(r, 2500)); } };
const req = async (m: string, u: string, body?: any) => { const r = await fetch(B + u, { method: m, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };
const get = async (u: string) => (await req('GET', u)).body;
const SAMPLE = { image: path.join(ROOT, 'samples/sample-character.png'), video: path.join(ROOT, 'samples/sample-take.mp4') };
/** Submit exactly what a tool page would: prefill.form + prefill.submit (fromJob) + prefill.files (assets re-attached) + test values for `needs`. */
async function submit(tool: string, form: Record<string, string>, files: Record<string, string[]> = {}, extra: Record<string, string> = {}, needFiles: Record<string, string> = {}) {
  const fd = new FormData(); for (const [k, v] of Object.entries({ ...form, ...extra })) fd.append(k, v);
  for (const [k, urls] of Object.entries(files)) for (const u of urls) { const r = await fetch(B + u); assert.equal(r.status, 200, `asset ${u}`); fd.append(k, new Blob([await r.arrayBuffer()]), path.basename(u)); }
  for (const [k, p] of Object.entries(needFiles)) fd.append(k, new Blob([fs.readFileSync(p)]), path.basename(p));
  const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() };
}
const wait = async (id: string) => { for (let i = 0; i < 600; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 200)); } throw new Error('timeout'); };
/** Fill what the prefill says is still needed, the way a user would. */
const fillNeeds = (p: any) => { const extra: Record<string, string> = {}; const nf: Record<string, string> = {};
  for (const n of p.needs ?? []) { if (n === 'prompt') extra.prompt = 'a slow cinematic take'; else if (n === 'refs' || n === 'image' || n === 'mask' || n === 'lastFrame' || n === 'presenterImage' || n === 'face' /* Face Swap */ || n === 'person' /* Person Swap */ || n === 'garment' /* Try On */ || n === 'personA' || n === 'personB' /* Swap Two People */) nf[n] = SAMPLE.image; else if (n === 'video') nf[n] = SAMPLE.video; else if (n === 'angles') extra.angles = JSON.stringify([{ start: 0, end: 3, angle: 'low angle' }]); else throw new Error(`unexpected need ${n} for ${p.tool}`); }
  if (p.tool === 'app-expand') extra.target = '16:9'; /* the sample image is 1:1 like it was asked (2026-10-26); Expand needs another shape */
  return { extra, nf }; };
let TOOLS: Record<string, any> = {}; let parentChecks = 0;
/** fields/form keys must be exactly the tool's submit names (its inputs, plus provider, route (the submitted route pin, #7) and Create Image's imageResolution). */
const schemaExact = (p: any) => { const names = new Set([...TOOLS[p.tool].inputs.map((i: any) => i.name), 'provider', 'imageResolution', 'route']);
  for (const k of [...Object.keys(p.fields ?? {}), ...Object.keys(p.form ?? {}), ...Object.keys(p.files ?? {})]) assert.ok(names.has(k), `${p.action} → ${p.tool}: "${k}" is not a ${p.tool} submit field`); };
async function sendAndCheck(p: any, label: string) {
  assert.equal(p.available, true, `${label}: ${JSON.stringify(p)}`); assert.ok('reason' in p);
  schemaExact(p);
  const { extra, nf } = fillNeeds(p); const r = await submit(p.tool, p.form, p.files, { ...extra, ...(p.submit ?? {}) }, nf);
  if (r.status === 402 && r.body.errorType === 'no_provider') { // no keyed route for this tool on the mock server: the prefill's own quote must already say so
    assert.ok(p.price && (p.price.runnable === false || p.price.needsKey === true), `${label} → ${p.tool}: 402 but prefill price said runnable: ${JSON.stringify(p.price)}`); noProvider.push(p.tool); return null; }
  assert.equal(r.status, 200, `${label} → ${p.tool}: ${JSON.stringify(r.body)} form=${JSON.stringify(p.form)} submit=${JSON.stringify(p.submit)} files=${JSON.stringify(p.files)}`);
  const j = await wait(r.body.id);
  if (p.submit?.fromJob) { assert.equal(j.parentId, p.submit.fromJob, `${label} → ${p.tool}: parentId`); parentChecks++; }
  return j;
}
const log: string[] = []; const noProvider: string[] = []; const ok = (s: string) => { log.push(s); console.log('ok', s); };
try {
  await start();
  await req('PUT', '/api/me/routing', { global: { mode: 'auto', allowFallback: true, useLocal: true, mockKeys: true } }); // own temp server only
  await req('POST', '/api/ledger/grant', { amount: 5000 });
  const tools: any[] = await get('/api/tools'); const T = Object.fromEntries(tools.map((t) => [t.id, t])); TOOLS = T;
  // ---- real mock jobs: an image on FLUX 3 Klein 1:1, a video, an audio track ----
  const mk = async (tool: string, f: Record<string, string>) => { const r = await submit(tool, f); assert.equal(r.status, 200, JSON.stringify(r.body)); const j = await wait(r.body.id); assert.equal(j.status, 'done', JSON.stringify(j)); return j; };
  const img = await mk('create-image', { types: '["generate"]', prompt: 'a red fox in snow', provider: 'comfy-flux3-klein', aspect: '1:1', seed: '1234' });
  const vid = await mk('h3-video', { types: '["t2v"]', prompt: 'a drone over cliffs', duration: '5', seed: '77' });
  const aud = await mk('audio', { types: '["music"]', prompt: 'lofi beat', duration: '30', seed: '5' });
  ok(`mock jobs: image ${img.id} (${img.provider}, ${img.outputs[0].url}), video ${vid.id} (${vid.provider}), audio ${aud.id} (${aud.outputs[0].url})`);

  // ---- Recreate ----
  { const p = await get(`/api/jobs/${img.id}/prefill?action=recreate`);
    assert.equal(p.tool, 'create-image'); assert.equal(p.path, '/tools/create-image'); assert.equal(p.url, `/tools/create-image?recreate=${img.id}`);
    assert.equal(p.model, 'comfy-flux3-klein'); assert.equal(p.fields.provider, 'comfy-flux3-klein'); assert.equal(p.form.provider, 'comfy-flux3-klein'); assert.equal(p.fields.aspect, '1:1'); assert.equal(p.form.aspect, '1:1');
    assert.equal(p.fields.prompt, 'a red fox in snow'); assert.equal(p.seed, null); assert.ok(!('seed' in p.fields)); assert.ok(!('seed' in p.form)); assert.equal(p.originalSeed, 1234); assert.equal(p.sameSeed, false);
    assert.equal(p.available, true); assert.equal(p.reason, null); assert.equal(p.providerAvailable, true);
    const j = await sendAndCheck(p, 'recreate klein'); assert.equal(j.provider, 'comfy-flux3-klein'); const full = await get(`/api/jobs/${j.id}`); assert.equal(full.specs?.aspect ?? '1:1', '1:1');
    ok(`recreate Klein 1:1 → ${p.fields.provider} ${p.fields.aspect} quality=${p.fields.quality} imageResolution=${p.fields.imageResolution} seed=null originalSeed=${p.originalSeed}; resubmitted → ${j.id} on ${j.provider}`); }
  { const p = await get(`/api/jobs/${img.id}/prefill?action=recreate&sameSeed=1`); assert.equal(p.sameSeed, true); assert.equal(p.seed, 1234); assert.equal(p.form.seed, '1234');
    const r = await submit(p.tool, p.form, p.files); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.seed, 1234); await wait(r.body.id); ok('recreate sameSeed=1 → seed 1234 reused on submit'); }
  { const p = await get(`/api/jobs/${vid.id}/prefill?action=recreate`); assert.equal(p.tool, 'h3-video'); assert.equal(p.fields.duration, '5'); assert.equal(p.fields.types, '["t2v"]');
    { const h3 = T['h3-video'].inputs; const opt = (n: string) => h3.find((x: any) => x.name === n).options; assert.ok(opt('quality').includes(p.fields.quality), `quality ${p.fields.quality}`); assert.ok(opt('resolution').includes(p.fields.resolution)); const vj = await get(`/api/jobs/${vid.id}`); // the default video model moved off H3 (768p) to the top of the quality order (Seedance 2.5: 480p/720p/1080p, 2026-10-23): recreate keeps the job's own model + resolution
      assert.equal(p.fields.provider, vj.provider, JSON.stringify(p.fields)); assert.equal(p.fields.resolution, vj.input.resolution, JSON.stringify(p.fields)); if (vj.provider === 'comfy-h3') assert.equal(p.fields.resolution, '768p'); }
    await sendAndCheck(p, 'recreate video'); ok(`recreate video → h3-video duration=${p.fields.duration} quality=${p.fields.quality} resolution=${p.fields.resolution} provider=${p.fields.provider} (H3 submit schema: quality=quality|fast tier, resolution=768p…)`); }
  { const p = await get(`/api/jobs/${aud.id}/prefill?action=recreate`); assert.equal(p.tool, 'audio'); assert.equal(p.form.duration, '30'); await sendAndCheck(p, 'recreate audio'); ok(`recreate audio → audio ${p.form.types} ${p.form.duration}s`); }

  // ---- OpenSoul: Recreate resubmits identically (stored settings compared) ----
  { const fd = { prompt: 'friends on a rooftop at sunset', preset: 'polaroid', aspect: '3:4', n: '1', upscale: 'x2', refKind: 'subject', likeness: 'max', colourHex: '#ff8800,#003366', colourStrength: '0.6', colourMethod: 'mkl_lab', enhance: '1', seed: '4242' };
    const r0 = await submit('soul', fd, {}, {}, { refs: SAMPLE.image }); assert.equal(r0.status, 200, JSON.stringify(r0.body)); const s0 = await wait(r0.body.id); assert.equal(s0.status, 'done');
    const p = await get(`/api/jobs/${s0.id}/prefill?action=recreate&sameSeed=1`); schemaExact(p);
    assert.equal(p.fields.provider, 'comfy-soul'); assert.equal(p.fields.aspect, '3:4'); assert.ok(!('resolution' in p.fields), 'soul has no resolution field'); assert.equal(p.fields.colourHex, '#ff8800,#003366');
    assert.equal(p.fields.refs.length, 1);
    const r1 = await submit('soul', p.form, p.files); assert.equal(r1.status, 200, JSON.stringify(r1.body)); const s1 = await wait(r1.body.id);
    const db0 = new Database(path.join(D, 'openhiggsfield.db'), { readonly: true }); await new Promise((r) => setTimeout(r, 600));
    const inp = (id: string) => JSON.parse((db0.prepare('SELECT data FROM jobs WHERE id = ?').get(id) as any).data); const a = inp(s0.id), b = inp(s1.id); db0.close();
    const keys = ['prompt', 'enhancedPrompt', 'finalPrompt', 'preset', 'types', 'mode', 'aspect', 'n', 'upscale', 'engine', 'refKind', 'likeness', 'seed', 'resolution'];
    for (const k of keys) assert.deepEqual(b.input[k], a.input[k], `soul ${k}: ${JSON.stringify(b.input[k])} vs ${JSON.stringify(a.input[k])}`);
    for (const k of ['source', 'hex', 'strength', 'method']) assert.deepEqual(b.input.colour?.[k], a.input.colour?.[k], `soul colour.${k}`);
    assert.equal(b.provider, a.provider); assert.equal(b.input.refUrls.length, a.input.refUrls.length);
    ok(`OpenSoul recreate (sameSeed) → fields ${Object.keys(p.fields).join(',')}; resubmitted ${s1.id}: ${keys.length} stored settings + colour + provider + ref count identical to ${s0.id}`); }

  // ---- Turn to video ----
  { const p = await get(`/api/jobs/${img.id}/prefill?action=turn-to-video`);
    assert.equal(p.tool, 'h3-video'); assert.equal(p.path, '/tools/h3-video'); assert.equal(p.url, `/tools/h3-video?fromJob=${img.id}&as=image&out=0`);
    assert.equal(p.fields.prompt, ''); assert.equal(p.imagePrompt, 'a red fox in snow'); assert.equal(p.startFrame, img.outputs[0].url); assert.equal(p.fields.image, img.outputs[0].url); assert.equal(p.slot, 'image');
    assert.deepEqual(p.submit, { fromJob: img.id, output: '0' }); assert.equal(p.fields.types, '["i2v"]'); assert.ok(p.needs.includes('prompt'));
    const j = await sendAndCheck(p, 'turn-to-video'); const full = await get(`/api/jobs/${j.id}`); assert.equal(full.parentId ?? img.id, img.id);
    ok(`turn-to-video → h3-video model ${p.model} aspect ${p.fields.aspect} startFrame ${p.startFrame}; submitted → ${j.id}`); }
  { const r = await req('GET', `/api/jobs/${vid.id}/prefill?action=turn-to-video`); assert.equal(r.status, 400); assert.equal(r.body.code, 'unsupported');
    const f = await get(`/api/jobs/${vid.id}/prefill?action=turn-to-video&t=1`); assert.match(f.output.frameUrl, /-out0-f1000\.png$/); assert.equal(f.submit, null); assert.deepEqual(f.files.image, [f.output.frameUrl]);
    await sendAndCheck(f, 'turn-to-video frame'); const bt = await req('GET', `/api/jobs/${vid.id}/prefill?action=turn-to-video&t=999`); assert.equal(bt.status, 400);
    const ra = await req('GET', `/api/jobs/${aud.id}/prefill?action=turn-to-video`); assert.equal(ra.status, 400);
    ok('turn-to-video: video → 400 unsupported; video &t=1 → frame start frame (uploaded) → 200; t=999 → 400; audio → 400'); }

  // ---- Send to: every tool that can take the output (one each, submitted) ----
  const targets = async (j: any) => (await get(`/api/jobs/${j.id}/handoff`)).targets.map((x: any) => x.toolId) as string[];
  const LISTED = { image: ['image-upscale', 'app-relight', 'create-image', 'camera', 'photo-fx', 'app-inpaint', 'app-transition', 'cinema', 'soul', 'h3-video'], video: ['upscale', 'app-video-upscale', 'app-translate-video', 'app-change-voice', 'object-swap', 'motion-transfer', 'restyle', 'app-anime-restyle', 'reshoot', 'reframe', 'remove-bg', 'sdr-hdr', 'fps-boost', 'depth-map', 'cutout', 'h3-extend', 'soundtrack', 'app-music-bed', 'voice', 'cinema'] };
  const mapping: Record<string, string> = {};
  for (const [kind, j] of [['image', img], ['video', vid]] as const) {
    const ts = [...new Set([...LISTED[kind], ...(await targets(j))])].filter((id) => T[id]);
    for (const id of ts) {
      const p = await get(`/api/jobs/${j.id}/prefill?action=send-to&tool=${id}`); assert.equal(p.tool, id, JSON.stringify(p));
      const inputNames = T[id].inputs.map((i: any) => i.name); assert.ok(inputNames.includes(p.slot), `${id} slot ${p.slot} not in its inputs ${inputNames}`);
      await sendAndCheck(p, `send-to ${kind}`); mapping[`${kind} → ${id}`] = `${p.slot}${p.submit ? ` (fromJob${p.submit.as ? ', as=ref' : ''})` : ' (upload)'}${p.form.types ? ` types=${p.form.types}` : ''}${p.needs.length ? ` needs=${p.needs}` : ''}`;
    }
  }
  // audio → tools with an audio file input (re-uploaded: fromJob carries video/image only)
  for (const id of tools.filter((t) => t.inputs.some((i: any) => (i.kind === 'file' || i.kind === 'files') && /audio/i.test(i.name))).map((t) => t.id)) {
    const p = await get(`/api/jobs/${aud.id}/prefill?action=send-to&tool=${id}`); assert.equal(p.submit, null); assert.deepEqual(p.files[p.slot], [aud.outputs[0].url]);
    const { extra, nf } = fillNeeds(p); const r = await submit(id, p.form, p.files, extra, nf); if (r.status === 402 && r.body.errorType === 'no_provider') { mapping[`audio → ${id}`] = `${p.slot} (upload) types=${p.form.types} → 402 no_provider (audio refs need a keyed hosted route)`; continue; }
    assert.equal(r.status, 200, `audio → ${id}: ${JSON.stringify(r.body)} ${JSON.stringify(p.form)}`); await wait(r.body.id); mapping[`audio → ${id}`] = `${p.slot} (upload)${p.form.types ? ` types=${p.form.types}` : ''}${p.form.provider ? ` model=${p.form.provider}` : ''}${p.needs.length ? ` needs=${p.needs}` : ''}`;
  }
  console.log(JSON.stringify(mapping, null, 1)); ok(`parentId = fromJob on ${parentChecks} fromJob submits; send-to: ${Object.keys(mapping).filter((k) => !k.startsWith('audio')).length} image/video targets submitted → 200 (402 no_provider, flagged by the prefill quote: ${[...new Set(noProvider)].join(', ') || 'none'})`);
  for (const [a, k, j, tool] of [['upscale', 'video', vid, 'upscale'], ['upscale', 'image', img, 'image-upscale'], ['relight', 'image', img, 'app-relight'], ['translate', 'video', vid, 'app-translate-video'], ['change-voice', 'video', vid, 'app-change-voice'], ['reshoot', 'video', vid, 'reshoot'], ['camera', 'image', img, 'camera'], ['photo-fx', 'image', img, 'photo-fx'], ['edit-image', 'image', img, 'create-image']] as const) {
    const p = await get(`/api/jobs/${j.id}/prefill?action=${a}`); assert.equal(p.tool, tool, `${a} ${k}`); }
  ok('menu shortcuts (upscale/relight/translate/change-voice/reshoot/camera/photo-fx/edit-image) resolve to the right tool');

  // ---- Director palette ----
  { const p = await get(`/api/jobs/${vid.id}/prefill?action=director&focus=palette`); assert.equal(p.tool, 'cinema'); assert.equal(p.form.mode, 'edit'); assert.equal(p.slot, 'video'); assert.equal(p.focus, 'palette'); assert.equal(p.form.palette, 'auto');
    assert.equal(p.url, `/tools/cinema?fromJob=${vid.id}&as=video&out=0&mode=edit&focus=palette`); await sendAndCheck(p, 'director video');
    const q = await get(`/api/jobs/${img.id}/prefill?action=director&focus=palette`); assert.equal(q.form.mode, 'image'); assert.equal(q.slot, 'refs'); assert.deepEqual(q.submit, { fromJob: img.id, output: '0', as: 'ref' }); await sendAndCheck(q, 'director image');
    const bf = await req('GET', `/api/jobs/${img.id}/prefill?action=director&focus=nope`); assert.equal(bf.status, 400);
    ok('director&focus=palette: video → cinema mode=edit slot video, image → mode=image slot refs (as=ref), palette=auto; both submitted → 200'); }

  // ---- available:false (tool turned off) instead of an error ----
  { const r = await req('POST', '/api/plugins/cutout', { enabled: false }); assert.ok(r.status < 300, JSON.stringify(r.body));
    const p = await req('GET', `/api/jobs/${vid.id}/prefill?action=send-to&tool=cutout`); assert.equal(p.status, 200); assert.equal(p.body.available, false); assert.ok(p.body.reason); assert.equal(p.body.form, null);
    await req('POST', '/api/plugins/cutout', { enabled: true }); ok(`disabled tool → 200 available:false ("${p.body.reason}")`); }

  // ---- errors ----
  { const e = async (u: string, s: number, code?: string) => { const r = await req('GET', u); assert.equal(r.status, s, `${u} ${JSON.stringify(r.body)}`); if (code) assert.equal(r.body.code, code); return r.body; };
    await e('/api/jobs/nope1234/prefill', 404); await e(`/api/jobs/${img.id}/prefill?action=dance`, 400, 'invalid_action'); await e(`/api/jobs/${img.id}/prefill?action=recreate&out=3`, 400, 'out_of_range');
    await e(`/api/jobs/${img.id}/prefill?action=send-to&out=-1&tool=camera`, 400, 'out_of_range'); await e(`/api/jobs/${img.id}/prefill?action=send-to`, 400, 'required'); await e(`/api/jobs/${img.id}/prefill?action=send-to&tool=nope`, 400, 'unknown_tool');
    await e(`/api/jobs/${img.id}/prefill?action=send-to&tool=upscale`, 400, 'unsupported');
    await req('POST', '/api/dev/mock-delay', { ms: 60000 }); const run = await submit('create-image', { types: '["generate"]', prompt: 'slow fox' }); assert.equal(run.status, 200);
    const nd = await e(`/api/jobs/${run.body.id}/prefill?action=turn-to-video`, 409, 'not_done'); await e(`/api/jobs/${run.body.id}/prefill?action=recreate`, 409, 'not_done');
    await req('POST', `/api/jobs/${run.body.id}/cancel`); await req('POST', '/api/dev/mock-delay', { ms: 200 });
    ok(`errors: unknown job 404, bad action 400, out out of range 400, send-to w/o tool 400, unknown tool 400, image→video-only tool 400, running job 409 not_done (${nd.status})`); }

  // ---- B7 owner ----
  { const list: any[] = await get('/api/jobs?limit=500'); assert.ok(list.length > 3); for (const x of list) { assert.equal(x.owner, 'local', JSON.stringify(x).slice(0, 200)); assert.equal(x.isOwner, true); }
    const one = await get(`/api/jobs/${img.id}`); assert.equal(one.owner, 'local'); assert.equal(one.isOwner, true);
    const pg = await get('/api/jobs?limit=2&cursor=0'); assert.equal(pg.items[0].isOwner, true);
    const tl = await get('/api/tools/create-image/jobs'); assert.equal((Array.isArray(tl) ? tl : tl.items)[0].owner, 'local');
    await req('POST', `/api/jobs/${img.id}/visibility`, { visibility: 'public' }); const sh = await get(`/api/jobs/${img.id}`);
    const shots = await get('/api/community/shots'); const mine = shots.items.find((x: any) => x.id === img.id); assert.equal(mine.owner, 'local'); assert.equal(mine.isOwner, true);
    const com = await get('/api/community?sort=new&limit=500'); for (const x of com.items.filter((x: any) => x.author && x.author !== 'you')) assert.equal(x.isOwner, false, `seeded ${x.id} by ${x.author}`); const ex = com.items.find((x: any) => x.kind === 'example'); assert.equal(ex.isOwner, false); assert.equal(ex.owner, 'community:openhiggsfield');
    const cj = com.items.find((x: any) => x.id === `job:${img.id}`); assert.equal(cj.isOwner, true);
    const tok = (await req('POST', `/api/jobs/${vid.id}/visibility`, { visibility: 'unlisted' })).body.shareToken; const share = await get(`/api/share/${tok}`); assert.equal(share.owner, 'local'); assert.equal(share.isOwner, true);
    void sh; ok('owner: GET /api/jobs (array + cursor page), /api/tools/:id/jobs, /api/jobs/:id, /api/share/:token, /api/community/shots → owner local, isOwner true; Community examples → community:openhiggsfield, isOwner false'); }
  // recorded on create (persisted), backfilled at read for old rows, other owners → isOwner false
  await new Promise((r) => setTimeout(r, 800)); await stop();
  { const db = new Database(path.join(D, 'openhiggsfield.db')); const row = db.prepare('SELECT data FROM jobs WHERE id = ?').get(img.id) as any; assert.equal(JSON.parse(row.data).owner, 'local', 'owner persisted on create');
    const legacy = { ...JSON.parse(row.data), id: 'legacy01', createdAt: Date.now() - 86400_000 }; delete legacy.owner; const other = { ...legacy, id: 'other001', owner: 'community:alice' };
    const put = db.prepare('INSERT INTO jobs (id, data) VALUES (?, ?)'); put.run(legacy.id, JSON.stringify(legacy)); put.run(other.id, JSON.stringify(other));
    db.prepare('INSERT INTO job_meta (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data').run(other.id, JSON.stringify({ id: other.id, favourite: false, projectId: null, deletedAt: null, published: { at: Date.now(), showPrompt: true } })); db.close(); }
  await start();
  { const l = await get('/api/jobs/legacy01'); assert.equal(l.owner, 'local'); assert.equal(l.isOwner, true);
    const o = await get('/api/jobs/other001'); assert.equal(o.owner, 'community:alice'); assert.equal(o.isOwner, false);
    const shots = await get('/api/community/shots'); const os_ = shots.items.find((x: any) => x.id === 'other001'); assert.equal(os_?.isOwner, false, JSON.stringify(shots.items.map((x: any) => [x.id, x.isOwner])));
    const p = await get('/api/jobs/other001/prefill?action=recreate'); assert.equal(p.isOwner, false); assert.equal(p.available, true);
    ok('owner persisted on create; a pre-B7 row (no owner) reads as local/isOwner true (read-time backfill, row untouched); a community:alice job → isOwner false in detail, Community shots and prefill'); }
  console.log('ALL OK prefill-owner'); 
} finally { await stop(); }
