// Canvas step 2 (generate cards), end to end on its own mock server (:8893, temp data dir, sample runs only, nothing billed):
//  - arrow inputs → slots: frames into Create Video (first / last, pins), a model's real image cap (Nano Banana 2.1: 4), a kind no slot takes;
//  - a card → a job: the card's form (cardModel.runForm from the shared flow spec) carries the board's projectId and boardId; the board's spend
//    endpoint counts it; 4 takes come back as 4 takes (cardModel.takesOf);
//  - a quick action's card is a draft and submits nothing (the job count stays);
//  - reattach: a saved board with a running card lists that job again after a reload (runningCards) and the job still finishes;
//  - the saved snapshot holds URLs only (no base64; a data: input is refused).
// Run: npx tsx test/canvas-generate.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { flowById, flowSpec, placeInputs, tooManyNote, audioCardDefault, type GenCatalog } from '../../web/src/shared/genFlows.ts';
import { draftProps, runForm, takesOf, runningCards, GEN_TYPE } from '../../web/src/canvas/cardModel.ts';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(8893); const B = `http://localhost:${PORT}`;
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'cv-gen-')), OPENHIGGSFIELD_ENV_FILE: path.join(os.tmpdir(), 'cv-gen-none.env'),
  OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', COMFY_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '' }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const send = async (method: string, u: string, body?: unknown) => { const r = await fetch(B + u, { method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}) }); return { status: r.status, body: await r.json().catch(() => null) as any }; };
const ok = (m: string) => console.log('ok ' + m);
const img = (key: string) => ({ key, kind: 'image' as const, url: `/files/${key}.png`, poster: `/files/${key}.png`, jobId: '', label: key });
const until = async (id: string) => { for (let i = 0; i < 200; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'canceled', 'blocked'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 150)); } throw new Error(`job ${id} never finished`); };
const submit = async (toolId: string, fields: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const r = await fetch(`${B}/api/tools/${toolId}/jobs`, { method: 'POST', body: fd }); const b = await r.json() as any; assert.equal(r.status, 200, `${toolId} submit: ${JSON.stringify(b).slice(0, 300)}`); return b.id as string; };
try {
  for (let i = 0; i < 160; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
  const tools = await get('/api/tools'); const recipes = (await get('/api/image-workflows')).workflows;
  const models = Object.fromEntries(((await get('/api/models?toolId=create-image')).groups ?? []).flatMap((g: any) => g.models ?? []).map((m: any) => [m.providerId ?? m.id, m]));
  const cat: GenCatalog = { tools, recipes, models };
  const spec = (flow: string, o: { provider?: string; vals?: Record<string, string>; inputs?: ReturnType<typeof img>[]; pins?: Record<string, string> } = {}) => {
    const f = flowById(flow)!; const s0 = flowSpec(f, cat, { provider: o.provider, vals: o.vals, filled: {} })!; const pl0 = placeInputs(s0.slots, o.inputs ?? [], o.pins);
    const s = flowSpec(f, cat, { provider: o.provider, vals: o.vals, filled: pl0.bySlot })!; return { s, ...placeInputs(s.slots, o.inputs ?? [], o.pins) }; };

  // ---- arrow inputs → slots ----
  { const v = spec('video', { inputs: [img('a'), img('b')] }); assert.deepEqual(v.bySlot.image.map((x) => x.key), ['a']); assert.deepEqual(v.bySlot.lastFrame.map((x) => x.key), ['b']); assert.equal(v.s.mode, 'flf', 'two frames → first / last frame');
    assert.equal(spec('video', { inputs: [img('a')] }).s.mode, 'i2v'); assert.equal(spec('video').s.mode, 't2v');
    const pin = spec('video', { inputs: [img('a'), img('b')], pins: { b: 'image' } }); assert.equal(pin.bySlot.image[0].key, 'b', 'a pinned input takes its slot'); assert.equal(pin.bySlot.lastFrame[0].key, 'a');
    const three = spec('video', { inputs: [img('a'), img('b'), img('c')] }); assert.equal(three.extra.length, 1); assert.match(tooManyNote(three.s, 1, 'MiniMax H3')!, /2 images: 1 not used/);
    const snd = spec('create', { inputs: [{ ...img('s'), kind: 'audio' } as any] }); assert.equal(snd.extra.length, 1, 'a sound has no slot on Create Image');
    ok('frames go to first / last frame, pins win, extras are counted'); }
  { // a new Music card's model: the server's mode default, never just the first of the quality order; a lyrics-only model gives way (a card has no lyrics box)
    const t: any = { id: 'audio', defaultsByMode: { music: { defaultProvider: 'comfy-yue2', qualityOrder: ['cloud-minimax-music', 'comfy-yue2', 'comfy-minimax-music3'] }, sfx: { defaultProvider: 'api-eleven-sfx' } }, app: { lyricsRequired: ['comfy-yue2'] } };
    const ps: any[] = [{ id: 'cloud-minimax-music', runnable: false }, { id: 'comfy-yue2', runnable: true }, { id: 'comfy-minimax-music3', runnable: true }, { id: 'api-eleven-sfx', runnable: true }];
    assert.equal(audioCardDefault(t, 'music', ps), 'comfy-minimax-music3', 'skips the unrunnable first pick and the lyrics-only default');
    assert.equal(audioCardDefault({ ...t, app: {} }, 'music', ps), 'comfy-yue2', 'no lyrics rule → the server default as is');
    assert.equal(audioCardDefault(t, 'sfx', ps), 'api-eleven-sfx');
    const m = spec('music').s; const lr: string[] = (m.tool as any).app?.lyricsRequired ?? []; assert.ok(!lr.includes(m.provider), `music card default ${m.provider} needs no lyrics`);
    assert.notEqual((m.providers.find((p) => p.id === m.provider) as any)?.runnable, false, `music card default ${m.provider} runs here`);
    ok('a new Music card starts on a model that runs here without lyrics (the server default, not the quality order head)'); }
  { // the Music card's length is one its model takes (2026-10-27): MiniMax Music 3 starts at 30 s, so the card has a price and runs (a 10 s card had none and failed on Go)
    const m = spec('music').s; const own: number[] = (m.providers.find((p) => p.id === m.provider) as any)?.durations ?? [];
    if (own.length) assert.ok(own.map(String).includes(m.vals.duration), `${m.provider}: ${m.vals.duration} s is one of its lengths (${own.join(', ')})`);
    const mm = spec('music', { provider: 'comfy-minimax-music3' }).s; assert.equal(mm.provider, 'comfy-minimax-music3'); assert.equal(mm.vals.duration, '30', 'MiniMax Music 3 starts at 30 s');
    assert.equal(spec('music', { provider: 'comfy-minimax-music3', vals: { duration: '10' } }).s.vals.duration, '30', 'a length the model refuses gives way to its own first length');
    assert.equal(spec('music', { provider: 'comfy-minimax-music3', vals: { duration: '60' } }).s.vals.duration, '60', 'a length it takes is kept');
    assert.ok(mm.recipe.controls.find((c: any) => c.field === 'duration')!.options.every((o: any) => Number(o.value) >= 30), 'the card only offers lengths the model takes');
    const q = await (await fetch(`${B}/api/tools/audio/price?${new URLSearchParams({ provider: mm.provider, ...mm.quote })}`)).json() as any;
    assert.ok(!q.error && (typeof q.credits === 'number' || !!q.cost), `the 30 s MiniMax Music 3 card is priced: ${JSON.stringify(q).slice(0, 200)}`);
    ok('a Music card asks only for lengths its model takes (MiniMax Music 3: 30 s), so it is priced'); }
  { const c = spec('create', { provider: 'api-nano-banana', inputs: ['a', 'b', 'c', 'd', 'e', 'f'].map(img) }); assert.equal(c.s.maxImages, 4, 'Nano Banana 2.1 takes 4 on its route');
    assert.equal(c.bySlot.refs.length, 4); assert.equal(c.extra.length, 2); assert.match(tooManyNote(c.s, 2, 'Nano Banana 2.1')!, /up to 4 images: 2 not used/);
    const form = runForm(c.s, c.bySlot, c.bySlot.refs, 'x', { projectId: null, boardId: 'brd_x' }); assert.deepEqual(form.files.map((f) => f.field), ['image', 'refs', 'refs', 'refs'], 'the first image, then refs');
    assert.equal(c.s.quote.mode, 'edit'); ok('a model\'s real reference cap: 4 used, 2 noted'); }
  { const r = spec('relight', { inputs: [img('p')] }); assert.equal(r.bySlot.image[0].key, 'p'); assert.ok(r.s.recipe.groups.some((g: any) => g.id === 'light'), 'Relight keeps its light group (the sphere)');
    const u = spec('upscale', { inputs: [img('p')] }); assert.equal(u.s.promptMode, 'hidden'); assert.ok(u.s.quote.scale); ok('image workflows read their recipes'); }

  // ---- a card → a job with the board's project and id; 4 takes; the spend chip counts it ----
  const proj = (await send('POST', '/api/projects', { name: 'Board runs' })).body; const board = (await send('POST', '/api/canvas/boards', { name: 'Gen test' })).body;
  const before = (await get('/api/jobs')).length;
  const c4 = spec('create', { vals: { n: '4' } }); assert.equal(c4.s.vals.n, '4');
  const q = await get(`/api/tools/create-image/price?${new URLSearchParams({ provider: c4.s.provider, ...c4.s.quote })}`); assert.equal(typeof q.credits, 'number', 'the card is priced before it runs');
  const f4 = runForm(c4.s, c4.bySlot, [], 'A ceramic mug on a sunlit table', { projectId: proj.id, boardId: board.id });
  assert.equal(f4.fields.projectId, proj.id); assert.equal(f4.fields.boardId, board.id); assert.equal(f4.fields.types, '["generate"]');
  const id = await submit('create-image', f4.fields); const j = await until(id);
  assert.equal(j.status, 'done'); assert.equal(j.input.boardId, board.id, 'the job keeps the board id');
  assert.ok((await get(`/api/jobs?project=${proj.id}`)).some?.((x: any) => x.id === id) ?? (await get(`/api/jobs?project=${proj.id}&limit=50`)).items?.some((x: any) => x.id === id), 'the job is in the board\'s project');
  const takes = takesOf(j); assert.equal(takes.length, 4, '4 images → 4 takes'); assert.ok(takes.every((t) => t.kind === 'image' && t.url.startsWith('/') && t.jobId === id));
  const sp = await get(`/api/canvas/boards/${board.id}/spend`); assert.equal(sp.runs, 1); assert.equal(sp.running, 0); assert.ok(sp.estUsd > 0, 'priced like a real run'); assert.equal(sp.countedUsd, 0, 'a sample run counts $0');
  assert.equal((await send('GET', '/api/canvas/boards/nope/spend')).status, 404);
  ok(`card → job ${id}: projectId + boardId, 4 takes, spend ${JSON.stringify(sp)}`);

  // ---- a quick action's card is a draft and runs nothing ----
  const n1 = (await get('/api/jobs')).length; assert.equal(n1, before + 1);
  const src = { id: 'shape:src', typeName: 'shape', type: 'ohf-result', x: 0, y: 0, rotation: 0, index: 'a1', parentId: 'page:page', isLocked: false, opacity: 1, meta: {}, props: { w: 320, h: 320, kind: 'image', jobId: id, url: takes[0].url, poster: takes[0].poster, title: 'Mug', model: 'Nano Banana 2.1', place: '', price: '', time: '' } };
  const qa = draftProps({ flow: 'upscale', parents: ['shape:src'] }); assert.equal(qa.status, 'draft'); assert.equal(qa.jobId, ''); assert.equal(qa.flow, 'upscale'); assert.equal(qa.medium, 'image');
  const up = spec('upscale', { inputs: [{ ...img('src'), url: takes[0].url }] }); const uq = await get(`/api/tools/${up.s.tool.id}/price?${new URLSearchParams({ provider: up.s.provider, ...up.s.quote })}`);
  assert.equal(typeof uq.credits, 'number', 'the Upscale draft shows a price');
  const card = (sid: string, props: any) => ({ id: sid, typeName: 'shape', type: GEN_TYPE, x: 400, y: 0, rotation: 0, index: 'a2', parentId: 'page:page', isLocked: false, opacity: 1, meta: {}, props });
  const arrow = { id: 'shape:arr', typeName: 'shape', type: 'arrow', x: 320, y: 160, rotation: 0, index: 'a3', parentId: 'page:page', isLocked: false, opacity: 1, meta: {}, props: { start: { x: 0, y: 0 }, end: { x: 80, y: 0 } } };
  const doc = (extra: Record<string, unknown>) => ({ schema: { schemaVersion: 2, sequences: {} }, store: { 'shape:src': src, 'shape:arr': arrow, ...extra } });
  const s1 = await send('PUT', `/api/canvas/boards/${board.id}`, { snapshot: doc({ 'shape:qa': card('shape:qa', qa) }) }); assert.equal(s1.status, 200);
  await new Promise((r) => setTimeout(r, 400)); assert.equal((await get('/api/jobs')).length, n1, 'a quick action\'s card submits nothing');
  ok('quick action → a priced draft, no job');

  // ---- reattach: a running card in a saved board is followed again after a reload, and finishes ----
  const vid = spec('video'); const runId = await submit(vid.s.tool.id, runForm(vid.s, vid.bySlot, [], 'A slow dolly over a coastal road at dusk', { projectId: null, boardId: board.id }).fields);
  const running = { ...draftProps({ flow: 'video', prompt: 'A slow dolly' }), status: 'running', jobId: runId };
  const s2 = await send('PUT', `/api/canvas/boards/${board.id}`, { snapshot: doc({ 'shape:qa': card('shape:qa', qa), 'shape:run': card('shape:run', running) }), rev: s1.body.rev }); assert.equal(s2.status, 200);
  const reopened = await get(`/api/canvas/boards/${board.id}`); assert.deepEqual(runningCards(reopened.snapshot), [{ shapeId: 'shape:run', jobId: runId }], 'the reopened board lists the running card');
  const rj = await until(runId); assert.equal(rj.status, 'done', 'the reattached job finishes'); assert.equal(takesOf(rj)[0]?.kind, 'video');
  assert.equal((await get(`/api/canvas/boards/${board.id}/spend`)).runs, 2); ok('reattach after reload: the job is followed and finishes');

  // ---- the snapshot holds URLs only ----
  const json = JSON.stringify(reopened.snapshot); assert.ok(!/data:(image|video|audio)\//.test(json), 'no base64 media in the board'); assert.ok(json.includes(takes[0].url), 'results are /files/ URLs');
  const bad = { ...qa, inputs: [{ key: 'u:1', kind: 'image', url: 'data:image/png;base64,iVBORw0KGgo=', poster: '', jobId: '', label: 'x' }] };
  const s3 = await send('PUT', `/api/canvas/boards/${board.id}`, { snapshot: doc({ 'shape:bad': card('shape:bad', bad) }) }); assert.equal(s3.status, 400); assert.equal(s3.body.code, 'inline_media');
  ok('snapshot: URLs only, a data: input is refused');
  console.log('PASS canvas-generate');
} finally { try { process.kill(-srv.pid!); } catch { /* gone */ } }
