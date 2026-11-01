// Canvas agent bridge (2026-10-24): op validation, add/connect through a real SSE canvas page, propose → no job until Go,
// Cancel → no job, Go → the page submits jobs, no open page → a clear error, the over-budget Go refusal, and the MCP tool list.
// The AI dock (2026-10-26): add_card activity carries the media-card meta, the user's Re-roll proposal, and the built-in demo agent
// (plan message, cards through the same ops, a proposal per phase that waits for Go, Cancel / Stop end it with nothing run).
// Run: cd server && npx tsx test/canvas-agent.test.ts   (own mock server on :8897, temp data dir, no real runs)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(8897); const B = `http://localhost:${PORT}`;
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-agent-')),
  OPENHIGGSFIELD_ENV_FILE: path.join(os.tmpdir(), 'canvas-agent-none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '40', OPENHIGGSFIELD_DEMO_STEP_MS: '10' }, stdio: 'ignore', detached: true });
const ok = (m: string) => console.log('ok ' + m);
const get = async (u: string, headers: Record<string, string> = {}) => (await (await fetch(B + u, { headers })).json()) as any;
const send = async (method: string, u: string, body?: unknown, headers: Record<string, string> = {}) => {
  const r = await fetch(B + u, { method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } } : { headers }) });
  return { status: r.status, body: await r.json().catch(() => null) as any };
};
const submitJob = async () => { const fd = new FormData(); fd.append('prompt', 'A canvas agent bridge test'); fd.append('types', '["generate"]');
  const r = await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: fd }); const b = await r.json().catch(() => null) as any; assert.equal(r.status, 200, `job submit: ${JSON.stringify(b)?.slice(0, 300)}`); return b.id as string; };
const until = async (fn: () => Promise<any>, ms = 12_000) => { const end = Date.now() + ms; let v: any; while (Date.now() < end) { v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 120)); } throw new Error('timed out'); };

let ctrl: AbortController | null = null; let loop: Promise<void> | null = null; let closed = false;
try {
  for (let i = 0; i < 160; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
  const board = (await send('POST', '/api/canvas/boards', { name: 'Agent bridge test' })).body;

  // ---- a fake canvas page: reads SSE, applies ops and posts the results back ----
  ctrl = new AbortController();
  const res = await fetch(`${B}/api/canvas/boards/${board.id}/agent/stream`, { signal: ctrl.signal });
  assert.equal(res.status, 200, 'SSE opens');
  assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/);
  const reader = res.body!.getReader(); const dec = new TextDecoder(); let buf = ''; const queue: { event: string; data: any }[] = []; const waiters: ((v: any) => void)[] = [];
  const push = (ev: any) => { if (waiters.length) waiters.shift()!(ev); else queue.push(ev); };
  const pump = (async () => { try { for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
    while ((i = buf.indexOf('\n\n')) >= 0) { const block = buf.slice(0, i); buf = buf.slice(i + 2); let event = 'message'; let data = '';
      for (const line of block.split('\n')) { if (line.startsWith('event:')) event = line.slice(6).trim(); else if (line.startsWith('data:')) data += line.slice(5).trim(); }
      if (data) { try { push({ event, data: JSON.parse(data) }); } catch { /* ignore */ } } } } } catch { /* aborted */ } finally { push(null); } })();
  const nextEvent = () => (queue.length ? Promise.resolve(queue.shift()) : new Promise<any>((r) => waiters.push(r)));

  let cardN = 0; const cards = new Map<string, any>(); const placed: any[] = []; const seen: any[] = []; const notes: any[] = []; const frames = new Map<string, string>(); const frameKids = new Map<string, string[]>(); const ran: string[] = []; const pageOps: any[] = [];
  const fakeApply = async (op: any) => {
    pageOps.push(op);
    /* a batch: each item through the same fake page (refs mapped to the ids it made), like agentBridge.applyBatch (all or nothing there) */
    if (op.kind === 'batch') { const refs: Record<string, string> = {}; const m = (x?: string) => (x ? refs[x] ?? x : x); const out: any = { refs, cards: [], notes: [], frames: [], arrows: [] };
      for (const it of op.items) { const { ref, frame, ...rest } = it; const sub: any = { ...rest, ...(it.inputs_from ? { inputs_from: it.inputs_from.map(m) } : {}), ...(frame ? { frame_id: m(frame) } : {}), ...(it.frame_id ? { frame_id: m(it.frame_id) } : {}), ...(it.ids ? { ids: it.ids.map(m) } : {}), ...(it.from_id ? { from_id: m(it.from_id), to_id: m(it.to_id) } : {}) };
        const r: any = await fakeApply(sub); const id = r?.card?.id ?? r?.id ?? null; if (ref && id) refs[ref] = id;
        if (it.kind === 'add_card') out.cards.push(r.card); if (it.kind === 'add_note') out.notes.push(id); if (it.kind === 'add_frame') out.frames.push(id); }
      out.line = `Added ${out.cards.length} cards`; return out; }
    if (op.kind === 'add_card') { const id = `shape:card${++cardN}`; const card = { id, type: 'card', kind: 'image', workflow: op.workflow, name: op.name ?? null, model: 'Mock Model', prompt: op.prompt ?? '', status: 'draft', inputs: op.inputs_from ?? [], results: [], price: { usd: 0.04, credits: 4, label: '≈ $0.04', demo: false, local: false, runnable: true } };
      cards.set(id, card); return { card }; }
    if (op.kind === 'update_card') { const c = cards.get(op.card_id); if (!c) throw new Error('no card'); if (op.prompt != null) c.prompt = op.prompt; return { card: c }; }
    if (op.kind === 'connect') return { arrowId: 'shape:arrow1', fromId: op.from_id, toId: op.to_id };
    if (op.kind === 'remove_card') { cards.delete(op.card_id); return { removed: op.card_id }; }
    if (op.kind === 'summary') return { nodes: [...cards.values(), ...placed, ...notes.map((n) => ({ id: n.id, type: 'note', title: n.text })), ...[...frames.entries()].map(([id, name]) => ({ id, type: 'frame', title: name, children: frameKids.get(id) ?? [] }))] };
    if (op.kind === 'propose_run') return { items: (op.card_ids as string[]).map((id) => ({ cardId: id, title: cards.get(id)?.prompt || 'Card', workflow: 'create', model: 'Mock Model', status: 'draft', usd: 0.04, credits: 4, quote: { credits: 4, demo: false, cost: { estUsd: 0.04, billedTo: 'mock' } }, problem: /UNWIRED/.test(cards.get(id)?.prompt ?? '') ? "MiniMax Music 3 isn't available on this server yet." : null })), totalUsd: 0.04 * (op.card_ids as string[]).length, totalCredits: 4 * (op.card_ids as string[]).length };
    /* a card the server refuses (here: the poster look) stays a draft and is reported as failed, like agentBridge.runProposal */
    if (op.kind === 'run_proposal') { const jobIds: string[] = []; const failed: any[] = []; for (const id of op.card_ids as string[]) { const c = cards.get(id); ran.push(id); if (/graphic poster/.test(c?.prompt ?? '')) { failed.push({ cardId: id, error: 'That model is busy. Nothing was charged.' }); continue; } jobIds.push(await submitJob()); if (c) { c.status = 'done'; c.results = [...(c.results ?? []), { url: '/samples/sample-keyframe.png', kind: 'image' }]; } } return { jobIds, failed }; }
    if (op.kind === 'add_note') { const id = `shape:note${++cardN}`; notes.push({ id, ...op }); if (op.frame_id) frameKids.set(op.frame_id, [...(frameKids.get(op.frame_id) ?? []), id]); return { id, text: op.text }; }
    if (op.kind === 'add_frame') { const id = `shape:frame${++cardN}`; frames.set(id, op.name); return { id, name: op.name, x: op.at?.x ?? 0, y: op.at?.y ?? 0, w: op.w ?? 800, h: op.h ?? 500 }; }
    if (op.kind === 'move_into') { if (!frames.has(op.frame_id)) throw new Error(`No frame with id "${op.frame_id}" on this board.`); frameKids.set(op.frame_id, [...(frameKids.get(op.frame_id) ?? []), ...op.ids]); return { moved: op.ids.length, frameId: op.frame_id, frameName: frames.get(op.frame_id) }; }
    if (op.kind === 'point_at') { if (!op.ids?.length && !op.at) throw new Error('Name ids or a point (at).'); return { pointed: true }; }
    if (op.kind === 'free_area') return { x: 100, y: 200 };
    if (op.kind === 'review_versions') { for (const c of op.cards) { const card = cards.get(c.card_id); if (!card) throw new Error('no card'); card.reviews = c.reviews; card.recommend = c.recommend; } return { updated: op.cards.length }; }
    if (op.kind === 'next_steps') { if (!cards.has(op.card_id)) throw new Error(`No node with id "${op.card_id}" on this board.`); return { card_id: op.card_id, kind: 'image', steps: [{ workflow: 'video', label: 'Animate' }, { workflow: 'upscale', label: 'Upscale' }] }; }
    if (op.kind === 'add_from_job') { const id = `shape:result${++cardN}`; const node = { id, type: 'result', kind: 'image', title: 'From a job', jobId: op.job_id }; placed.push(node); return { id, node }; }
    throw new Error(`fake page: unknown op ${op.kind}`);
  };
  loop = (async () => { for (;;) { const ev = await nextEvent(); if (!ev || closed) break; seen.push(ev); if (ev.event !== 'op') continue;
    try { const result = await fakeApply(ev.data.op); await send('POST', `/api/canvas/boards/${board.id}/agent/results`, { id: ev.data.id, ok: true, result }); }
    catch (e) { await send('POST', `/api/canvas/boards/${board.id}/agent/results`, { id: ev.data.id, ok: false, error: (e as Error).message }); } } })();
  await new Promise((r) => setTimeout(r, 150));

  // ---- validation ----
  assert.equal((await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [] })).status, 400, 'empty ops refused');
  const unknown = await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'paint_everything' }] });
  assert.equal(unknown.status, 400); assert.match(String(unknown.body.error), /kind|Invalid discriminator/);
  const missing = await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'add_card' }] });
  assert.equal(missing.status, 400); assert.match(String(missing.body.error), /workflow/);
  assert.equal((await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'say', text: 'hi' }], extra: true })).status, 400, 'unknown body fields refused');
  ok('op validation: unknown kinds, missing fields and extra body fields are refused');

  // ---- add and connect through the bridge ----
  const add = await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'add_card', workflow: 'create', prompt: 'A white sneaker' }] });
  assert.equal(add.status, 200); assert.equal(add.body.ok, true); const cardId = add.body.results[0].result.card.id; assert.match(cardId, /^shape:card/);
  const conn = await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'connect', from_id: cardId, to_id: 'shape:card2' }] });
  assert.equal(conn.body.results[0].result.arrowId, 'shape:arrow1');
  const sum = await get(`/api/canvas/boards/${board.id}/agent/summary`); assert.equal(sum.live, true); assert.ok(sum.nodes.some((n: any) => n.id === cardId));
  ok('add_card and connect go through the SSE page and return real ids; the live summary reads the page');
  /* typed connections: "What next?" for a node goes through the page; a bad op is refused before it reaches the page */
  assert.equal((await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'next_steps' }] })).status, 400, 'next_steps needs a card id');
  const ns = await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'next_steps', card_id: cardId }] });
  assert.equal(ns.status, 200); assert.equal(ns.body.results[0].result.kind, 'image'); assert.equal(ns.body.results[0].result.steps[0].workflow, 'video');
  const nsBad = await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'next_steps', card_id: 'shape:nope' }] });
  assert.equal(nsBad.body.ok, false); assert.match(String(nsBad.body.results[0].error), /No node/);
  ok('next_steps: validated, answered by the page, a missing node is a plain error');

  /* canvas_add_from_job (2026-10-28): an existing generation on the board; the server checks the job before the page places it */
  { const ops = (o: any) => send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [o] });
    assert.equal((await ops({ kind: 'add_from_job' })).status, 400, 'a job id is required');
    const nope = await ops({ kind: 'add_from_job', job_id: 'nope1234' }); assert.equal(nope.body.ok, false); assert.equal(nope.body.results[0].code, 'job_not_found');
    const jid = await submitJob(); await until(async () => (await get(`/api/jobs/${jid}`)).status === 'done');
    const badOut = await ops({ kind: 'add_from_job', job_id: jid, out: 7 }); assert.equal(badOut.body.results[0].code, 'invalid_out', 'an output it does not have');
    const before = pageOps.length; const placed = await ops({ kind: 'add_from_job', job_id: jid, at: { x: 10, y: 20 } });
    assert.equal(placed.body.ok, true); assert.match(placed.body.results[0].result.node.id, /^shape:result/); assert.equal(pageOps.length, before + 1, 'only the valid one reached the page');
    assert.deepEqual(pageOps.at(-1), { kind: 'add_from_job', job_id: jid, at: { x: 10, y: 20 } });
    const feed = await get(`/api/canvas/boards/${board.id}/agent/feed?since=0&limit=240`); assert.ok((feed.items as any[]).some((e: any) => e.meta?.tool === 'add_from_job' && e.meta?.jobId === jid), 'a dock line says it was placed');
    /* the summary links each finished result's ComfyUI graph (View workflow), the same one GET /api/jobs/:id/workflow serves */
    const wfInfo = await get(`/api/jobs/${jid}/workflow`); assert.equal(wfInfo.available, true, 'a mock create-image result has a workflow');
    const placedNode = (await get(`/api/canvas/boards/${board.id}/agent/summary`)).nodes.find((n: any) => n.jobId === jid); assert.equal(placedNode?.workflowGraph, wfInfo.passes[0].url);
    assert.equal(placedNode.workflowGraph, `/api/jobs/${jid}/workflow?format=api`);
    ok('add_from_job: unknown job / missing output refused before the page; a finished job is placed and returns its node id; the summary links its workflow graph'); }

  /* canvas_batch: all or nothing before the page, refs resolve, one dock line, one quote for every card */
  { const before = pageOps.length;
    const badRef = await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'batch', items: [{ kind: 'add_card', ref: 'a', workflow: 'create', prompt: 'x' }, { kind: 'connect', from_id: 'a', to_id: 'zz' }] }] });
    assert.equal(badRef.body.ok, false); assert.match(badRef.body.results[0].error, /Item 2.*“zz”/); assert.equal(pageOps.length, before, 'a bad batch never reaches the page: nothing is made');
    const late = await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'batch', items: [{ kind: 'add_card', workflow: 'video', inputs_from: ['k'] }, { kind: 'add_card', ref: 'k', workflow: 'create' }] }] });
    assert.match(late.body.results[0].error, /made later/); assert.equal(pageOps.length, before);
    const items = [{ kind: 'add_frame', ref: 'f', name: 'Launch set' }, ...Array.from({ length: 12 }, (_, i) => ({ kind: 'add_card', ref: `c${i}`, workflow: i % 2 ? 'video' : 'create', prompt: `Shot ${i + 1}`, frame: 'f', ...(i % 2 ? { inputs_from: [`c${i - 1}`] } : {}) }))];
    const ok12 = await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'batch', items, note: 'Launch set' }] });
    assert.equal(ok12.body.ok, true); const res = ok12.body.results[0].result; assert.equal(res.cards.length, 12); assert.equal(Object.keys(res.refs).length, 13);
    assert.deepEqual(cards.get(res.refs.c3).inputs, [res.refs.c2], 'a temp ref became the real id of the card made earlier in the batch');
    assert.ok(((await get(`/api/canvas/boards/${board.id}/agent/feed?since=0&limit=500`)).items as any[]).some((e) => e.meta?.tool === 'batch' && e.meta?.cardIds?.length === 12), 'one dock line for the batch');
    const q = await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'propose_run', card_ids: res.cards.map((c: any) => c.id), note: 'Launch set' }] });
    const prop = q.body.results[0].result.proposal; assert.equal(prop.items.length, 12, 'one quote covers the whole batch'); assert.equal(prop.status, 'pending', 'nothing runs before Go');
    await send('POST', `/api/canvas/boards/${board.id}/agent/proposals/${prop.id}/decision`, { decision: 'cancel' });
    ok('batch: refused whole before the page (bad or late ref), temp refs resolve, one dock line, one pending quote for all 12 cards'); }
  /* canvas_review from an MCP agent with vision: badges + a recommendation line; free (no job, no proposal) */
  { const jobsNow = async () => (await get('/api/jobs?cursor=')).total /* the plain list is one 50-job page */; const j0 = await jobsNow(); const p0 = (await get(`/api/canvas/boards/${board.id}/agent/proposals`)).items.length; const id = [...cards.keys()].at(-1)!;
    const rv = await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'review_versions', cards: [{ card_id: id, reviews: [{ version: 1, verdict: 'check', reason: 'the face drifts' }, { version: 2, verdict: 'fits', reason: 'her face matches the sheet' }], recommend: 2 }], say: "Shot 2: I'd pick v2: her face matches the sheet. You choose." }] }, { 'x-ohf-agent-name': 'Claude' });
    assert.equal(rv.body.ok, true); assert.equal(cards.get(id).recommend, 2); assert.equal(cards.get(id).reviews[1].verdict, 'fits');
    assert.equal((await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'review_versions', cards: [{ card_id: id, reviews: [{ version: 1, verdict: 'great' }] }] }] })).status, 400, 'only fits / check');
    assert.ok(((await get(`/api/canvas/boards/${board.id}/agent/feed?since=0&limit=500`)).items as any[]).some((e) => e.from === 'agent' && e.meta?.review && /I'd pick v2/.test(e.text)));
    assert.equal(await jobsNow(), j0, 'reviewing starts no job'); assert.equal((await get(`/api/canvas/boards/${board.id}/agent/proposals`)).items.length, p0, 'and asks for no Go: it costs nothing');
    ok('canvas_review: an agent\'s own look lands as badges and a recommendation; no job, no quote'); }

  const jobCount = async () => (await get('/api/jobs?cursor=')).total /* the plain list is one 50-job page */;
  const jobs0 = await jobCount();

  // ---- propose prices, but no job until Go ----
  const prop1 = (await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'propose_run', card_ids: [cardId], note: 'One card' }] })).body.results[0].result.proposal;
  assert.match(prop1.id, /^prop_/); assert.equal(prop1.status, 'pending'); assert.equal(prop1.totalUsd, 0.04); assert.equal(prop1.items[0].usd, 0.04);
  await new Promise((r) => setTimeout(r, 400)); assert.equal(await jobCount(), jobs0, 'propose submitted no job');
  assert.equal((await get(`/api/canvas/agent/proposals/${prop1.id}`)).status, 'pending');
  ok('propose_run prices every card and submits nothing');

  // ---- Cancel: nothing runs, the inbox has the decision ----
  const prop2 = (await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'propose_run', card_ids: [cardId] }] })).body.results[0].result.proposal;
  const cancel = await send('POST', `/api/canvas/boards/${board.id}/agent/proposals/${prop2.id}/decision`, { decision: 'cancel' });
  assert.equal(cancel.status, 200); assert.equal(cancel.body.proposal.status, 'cancelled');
  await new Promise((r) => setTimeout(r, 300)); assert.equal(await jobCount(), jobs0, 'cancel submitted no job');
  const inbox1 = await get(`/api/canvas/boards/${board.id}/agent/inbox`); assert.ok(inbox1.items.some((e: any) => e.type === 'decision' && e.decision === 'cancel' && e.proposalId === prop2.id));
  ok('Cancel marks the proposal cancelled, submits no job, and lands in the inbox');

  // ---- Go: the page submits the runs; the proposal becomes approved with job ids ----
  const prop3 = (await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'propose_run', card_ids: [cardId] }] })).body.results[0].result.proposal;
  const go = await send('POST', `/api/canvas/boards/${board.id}/agent/proposals/${prop3.id}/decision`, { decision: 'go' });
  assert.equal(go.status, 200); assert.equal(go.body.proposal.status, 'running');
  const approved = await until(async () => { const p = await get(`/api/canvas/agent/proposals/${prop3.id}`); return p.status === 'approved' ? p : null; });
  assert.equal(approved.jobIds.length, 1); assert.ok(approved.jobIds[0]);
  assert.equal(await jobCount(), jobs0 + 1, 'Go submitted exactly one job');
  const job = await until(async () => { const j = await get(`/api/jobs/${approved.jobIds[0]}`); return ['done', 'failed', 'canceled', 'blocked'].includes(j.status) ? j : null; });
  assert.equal(job.status, 'done', 'the mock run finished');
  const inbox2 = await get(`/api/canvas/boards/${board.id}/agent/inbox`); assert.ok(inbox2.items.some((e: any) => e.type === 'decision' && e.decision === 'go' && e.proposalId === prop3.id));
  ok('Go makes the page submit the run through the jobs API; the proposal is approved with the job id');

  // ---- one card that can't run here is skipped, not a blocker: Go starts the rest; all blocked → Go refused ----
  const bad = (await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'add_card', workflow: 'music', prompt: 'UNWIRED score' }] })).body.results[0].result.card.id;
  const mixed = (await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'propose_run', card_ids: [cardId, bad] }] })).body.results[0].result.proposal;
  assert.equal(mixed.reason, null, 'one bad row does not block the batch'); assert.deepEqual(mixed.runCardIds, [cardId]); assert.equal(mixed.skipped.length, 1); assert.equal(mixed.skipped[0].cardId, bad);
  assert.equal(mixed.totalUsd, 0.04, 'the total counts only what runs');
  const jobsM = await jobCount(); const goM = await send('POST', `/api/canvas/boards/${board.id}/agent/proposals/${mixed.id}/decision`, { decision: 'go' }); assert.equal(goM.status, 200);
  const apM = await until(async () => { const p = await get(`/api/canvas/agent/proposals/${mixed.id}`); return p.status === 'approved' ? p : null; });
  assert.equal(apM.jobIds.length, 1); assert.equal(await jobCount(), jobsM + 1, 'Go submitted only the runnable card');
  const allBad = (await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'propose_run', card_ids: [bad] }] })).body.results[0].result.proposal;
  assert.match(String(allBad.reason), /isn't available on this server yet/); assert.deepEqual(allBad.runCardIds, []);
  const goBad = await send('POST', `/api/canvas/boards/${board.id}/agent/proposals/${allBad.id}/decision`, { decision: 'go' }); assert.equal(goBad.status, 409);
  await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'remove_card', card_id: bad }] });
  ok('a card that cannot run is skipped (Go runs the rest, total counts only them); when none can run, Go is refused');

  // ---- the agent budget: a proposal over it is shown but Go is refused ----
  const budget = (await send('POST', '/api/agent/budgets', { name: 'Tiny budget', budgetUsd: 0.01 })).body;
  const prop4r = await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'propose_run', card_ids: [cardId] }] }, { 'x-ohf-agent-budget': budget.id });
  const prop4 = prop4r.body.results[0].result.proposal; assert.equal(prop4.overBudget, true); assert.match(String(prop4.reason), /over the \$0\.01 left/);
  const before4 = await jobCount(); const go4 = await send('POST', `/api/canvas/boards/${board.id}/agent/proposals/${prop4.id}/decision`, { decision: 'go' });
  assert.equal(go4.status, 409); assert.equal(go4.body.code, 'over_budget'); assert.equal(await jobCount(), before4, 'over-budget Go submits nothing');
  ok('over the agent budget: the proposal shows why and Go is refused with nothing submitted');

  // ---- say + inbox ----
  const said = await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'say', text: 'I can make a launch set.' }] });
  assert.equal(said.body.results[0].result.message.text, 'I can make a launch set.');
  const reply = await send('POST', `/api/canvas/boards/${board.id}/agent/messages`, { text: 'Use the blue one.' });
  assert.equal(reply.body.ok, true);
  const inbox3 = await get(`/api/canvas/boards/${board.id}/agent/inbox`); assert.ok(inbox3.items.some((e: any) => e.type === 'message' && e.from === 'agent' && /launch set/.test(e.text)));
  assert.ok(inbox3.items.some((e: any) => e.type === 'message' && e.from === 'user' && /blue one/.test(e.text)));
  ok('say and the panel reply are stored per board and read back from the inbox');

  // ---- the dock: media-card meta, the user's Re-roll proposal ----
  const feedNow = async () => (await get(`/api/canvas/boards/${board.id}/agent/feed?since=0&limit=500`)).items as any[];
  const addEv = (await feedNow()).find((e) => e.type === 'activity' && e.cardId === cardId);
  assert.equal(addEv?.meta?.tool, 'add_card'); assert.equal(addEv?.meta?.by, 'mcp'); assert.equal(addEv?.meta?.price?.label, '≈ $0.04');
  assert.equal((await send('POST', `/api/canvas/boards/${board.id}/agent/proposals`, { card_ids: [] })).status, 400, 'empty re-roll refused');
  const jobsR = await jobCount();
  const rr = await send('POST', `/api/canvas/boards/${board.id}/agent/proposals`, { card_ids: [cardId], note: 'Re-roll “A white sneaker”' });
  assert.equal(rr.status, 200); assert.equal(rr.body.proposal.status, 'pending'); assert.equal(rr.body.proposal.note, 'Re-roll “A white sneaker”');
  await new Promise((r) => setTimeout(r, 300)); assert.equal(await jobCount(), jobsR, 're-roll proposal submitted nothing');
  assert.equal((await send('POST', `/api/canvas/boards/${board.id}/agent/proposals/${rr.body.proposal.id}/decision`, { decision: 'cancel' })).status, 200);
  ok('add_card activity carries the media-card meta; Re-roll from the dock is a priced proposal that waits for Go');

  // ---- the built-in demo agent ----
  assert.ok((await get('/api/canvas/agent/starters')).items.some((x: any) => x.id === 'film'));
  assert.equal((await send('POST', `/api/canvas/boards/${board.id}/agent/demo`, {})).status, 400, 'demo needs a prompt');
  const pendingProp = async (note: RegExp) => until(async () => (await get(`/api/canvas/boards/${board.id}/agent/proposals`)).items.find((p: any) => p.status === 'pending' && note.test(p.note ?? '')) ?? null);
  const jobsD = await jobCount(); const cardsBefore = cards.size;
  const d1 = await send('POST', `/api/canvas/boards/${board.id}/agent/demo`, { prompt: 'Product shots for a red kettle', starter: 'product' });
  assert.equal(d1.status, 200); assert.equal(d1.body.plan.id, 'product'); assert.match(d1.body.runId, /^demo_/);
  assert.equal((await send('POST', `/api/canvas/boards/${board.id}/agent/demo`, { prompt: 'again', starter: 'free' })).status, 409, 'one demo run per board');
  const p1 = await pendingProp(/Four product shots/);
  assert.equal(p1.items.length, 4); assert.equal(cards.size, cardsBefore + 4, 'four cards added through the page');
  assert.equal(await jobCount(), jobsD, 'the demo proposal submitted nothing');
  const f1 = await feedNow();
  assert.ok(f1.some((e) => e.type === 'message' && e.from === 'user' && /red kettle/.test(e.text)), 'the prompt is in the conversation');
  assert.ok(f1.some((e) => e.type === 'message' && e.from === 'agent' && Array.isArray(e.meta?.plan) && e.meta.runId === d1.body.runId), 'the plan message');
  assert.equal(f1.filter((e) => e.meta?.tool === 'add_card' && e.meta?.by === 'demo').length, 4, 'four add_card tool calls');
  assert.equal((await get(`/api/canvas/boards/${board.id}/agent/state`)).demo.running, true);
  /* typing while the proposal waits for Go (2026-10-31): an honest reply, never an approval, a new step or a new plan */
  const propsBefore = (await get(`/api/canvas/boards/${board.id}/agent/proposals`)).items.length; const feedBefore = (await feedNow()).length;
  const typed = await send('POST', `/api/canvas/boards/${board.id}/agent/demo`, { prompt: 'How much will this cost me?' });
  assert.equal(typed.status, 200); assert.equal(typed.body.kept, true, 'the words stay in the box'); assert.equal(typed.body.runId, undefined, 'no new demo');
  assert.match(typed.body.reply.text, /built-in demo, so I can’t answer questions yet\. Press Go or Cancel on the card above to continue, or Stop the demo\. Connect Claude/);
  await send('POST', `/api/canvas/boards/${board.id}/agent/demo`, { prompt: 'How much will this cost me?' });
  await new Promise((r) => setTimeout(r, 600));
  assert.equal((await get(`/api/canvas/agent/proposals/${p1.id}`)).status, 'pending', 'typing never approves');
  assert.equal((await get(`/api/canvas/boards/${board.id}/agent/proposals`)).items.length, propsBefore, 'no new proposal');
  assert.equal(await jobCount(), jobsD, 'typing ran nothing');
  const fT = (await feedNow()).slice(feedBefore);
  assert.equal(fT.length, 1, 'one honest reply (sent twice, said once); the question is not echoed and no step is added');
  assert.ok(!fT.some((e) => e.type === 'decision'), 'no decision');
  ok('demo agent: typing while a proposal waits gives an honest reply; nothing is approved, priced or run');
  await send('POST', `/api/canvas/boards/${board.id}/agent/proposals/${p1.id}/decision`, { decision: 'cancel' });
  await until(async () => ((await get(`/api/canvas/boards/${board.id}/agent/state`)).demo.running ? null : true));
  assert.ok((await feedNow()).some((e) => e.from === 'agent' && /Nothing ran/.test(e.text) && e.meta?.runId === d1.body.runId));
  assert.equal(await jobCount(), jobsD, 'Cancel: the demo ran nothing');
  ok('demo agent: plan, four add_card tool calls, one proposal that waits; Cancel ends it with no job');

  assert.ok(f1.some((e) => e.meta?.tool === 'add_note' && e.meta?.by === 'demo'), 'the demo starts with an idea note'); assert.ok(f1.some((e) => e.meta?.tool === 'add_frame' && /Product shots/.test(e.text)), 'a named frame per phase');
  assert.ok(f1.some((e) => e.meta?.tool === 'move_into'), 'the cards go into their frame');
  assert.equal((await feedNow()).filter((e) => e.from === 'agent' && /^Stopped/.test(e.text) && e.meta?.runId === d1.body.runId).length, 1, 'one stop line, never two');

  /* the free plan: three versions → Go → one is refused (it stays a draft): the demo says so kindly and moves on at once (it used to wait
     15 minutes on a card that never started, showing "Working on the board…") → it asks you to pick → only your pick goes on */
  const t0 = Date.now();
  const d2 = await send('POST', `/api/canvas/boards/${board.id}/agent/demo`, { prompt: 'A paper boat in the rain', starter: 'free' });
  assert.equal(d2.body.plan.id, 'free');
  const p2 = await pendingProp(/Three versions/); const versionIds: string[] = p2.runCardIds;
  await send('POST', `/api/canvas/boards/${board.id}/agent/proposals/${p2.id}/decision`, { decision: 'go' });
  const pk = await until(async () => (await get(`/api/canvas/boards/${board.id}/agent/state`)).pick ?? null);
  assert.ok(Date.now() - t0 < 10_000, 'a refused card never stalls the demo');
  assert.equal(await jobCount(), jobsD + 2, 'Go ran the two cards the server took');
  const refusedId = versionIds.find((id) => /graphic poster/.test(cards.get(id)?.prompt ?? ''))!;
  assert.equal(pk.status, 'waiting'); assert.equal(pk.cardIds.length, 2, 'only finished versions can be picked'); assert.ok(!pk.cardIds.includes(refusedId));
  const f2 = await feedNow();
  assert.ok(f2.some((e) => e.from === 'agent' && e.meta?.error && /didn’t start, so nothing was charged/.test(e.text) && e.meta?.runId === d2.body.runId), 'the refused card is named kindly');
  assert.ok(f2.some((e) => e.from === 'agent' && e.meta?.pick?.id === pk.id && /Pick/.test(e.text)), 'the pick question is in the conversation');
  assert.equal((await get(`/api/canvas/boards/${board.id}/agent/state`)).demo.running, true, 'the demo waits for the pick');
  assert.equal((await send('POST', `/api/canvas/boards/${board.id}/agent/pick`, { pick_id: pk.id, card_id: refusedId })).status, 409, 'a card that is not a choice is refused');
  assert.equal((await send('POST', `/api/canvas/boards/${board.id}/agent/pick`, { pick_id: 'pick_nope', card_id: pk.cardIds[0] })).status, 404, 'an unknown pick');
  const chosen = pk.cardIds[1];
  const pr = await send('POST', `/api/canvas/boards/${board.id}/agent/pick`, { pick_id: pk.id, card_id: chosen, title: 'Painterly' });
  assert.equal(pr.status, 200); assert.equal(pr.body.pick.chosen, chosen);
  assert.equal((await send('POST', `/api/canvas/boards/${board.id}/agent/pick`, { pick_id: pk.id, card_id: pk.cardIds[0] })).status, 409, 'one pick only');
  const p3 = await pendingProp(/A clip from your pick/);
  assert.equal(p3.items.length, 1); assert.deepEqual(cards.get(p3.items[0].cardId)?.inputs, [chosen], 'only your pick goes on to video');
  assert.equal(await jobCount(), jobsD + 2, 'the clip waits for its own Go');
  assert.ok((await feedNow()).some((e) => e.from === 'agent' && e.meta?.proposalId === p3.id && /^Step 2 of 2 is a new run: .*Nothing runs until you press Go\. Cancel stops here\./.test(e.text)), 'a later paid step says it is a new run');
  const typed2 = await send('POST', `/api/canvas/boards/${board.id}/agent/demo`, { prompt: 'wait, can it be longer?' });
  assert.match(typed2.body.reply.text, /Press Go or Cancel/); await new Promise((r) => setTimeout(r, 400));
  assert.equal((await get(`/api/canvas/agent/proposals/${p3.id}`)).status, 'pending', 'typed words never approve the next step'); assert.equal(await jobCount(), jobsD + 2);
  assert.ok((await get(`/api/canvas/boards/${board.id}/agent/inbox`)).items.some((e: any) => e.from === 'user' && e.meta?.pickId === pk.id && e.meta?.cardId === chosen), 'the pick lands in the inbox');
  const stopped = await send('POST', `/api/canvas/boards/${board.id}/agent/demo/stop`);
  assert.equal(stopped.body.running, false);
  assert.equal((await get(`/api/canvas/agent/proposals/${p3.id}`)).status, 'cancelled', 'Stop cancels the waiting proposal');
  await new Promise((r) => setTimeout(r, 300)); assert.equal(await jobCount(), jobsD + 2, 'Stop ran nothing more');
  assert.equal((await feedNow()).filter((e) => e.from === 'agent' && e.meta?.runId === d2.body.runId && /^Stopped/.test(e.text)).length, 1, 'Stop posts one "Stopped" line, never two');
  assert.equal((await get(`/api/canvas/boards/${board.id}/agent/state`)).demo.running, false);
  ok('demo agent: a refused card is named kindly and never stalls it; it waits for your pick; only your pick goes on; Stop cancels');

  /* a Go where nothing starts: the demo ends kindly (no endless "Working on the board…") */
  /* typed words with no demo running: an honest reply with the matching demo suggested, never a plan or a proposal */
  { const propsN = (await get(`/api/canvas/boards/${board.id}/agent/proposals`)).items.length; const jobsN = await jobCount();
    const q = await send('POST', `/api/canvas/boards/${board.id}/agent/demo`, { prompt: 'Can you extend my clip by 5 seconds?' });
    assert.equal(q.status, 200); assert.equal(q.body.runId, undefined); assert.equal(q.body.kept, true);
    assert.match(q.body.reply.text, /^I’m the built-in demo, so I can’t chat yet\. Connect Claude \(the plug icon\)/); assert.equal(q.body.reply.meta.suggest, 'animate');
    const q2 = await send('POST', `/api/canvas/boards/${board.id}/agent/demo`, { prompt: 'what is this?', starter: 'nope' });
    assert.equal(q2.body.runId, undefined); assert.equal(q2.body.reply.meta.suggest, null, 'an unknown starter is typed words too');
    await new Promise((r) => setTimeout(r, 600));
    assert.equal((await get(`/api/canvas/boards/${board.id}/agent/state`)).demo.running, false, 'no demo started');
    assert.equal((await get(`/api/canvas/boards/${board.id}/agent/proposals`)).items.length, propsN, 'no proposal'); assert.equal(await jobCount(), jobsN);
    ok('demo agent: a typed question never starts a demo or a proposal; it answers honestly and suggests the matching demo'); }
  const d3 = await send('POST', `/api/canvas/boards/${board.id}/agent/demo`, { prompt: 'Three takes on a graphic poster idea', starter: 'free' });
  const p4 = await pendingProp(/Three versions/);
  for (const id of p4.runCardIds) { const c = cards.get(id); if (c) c.prompt = `${c.prompt} graphic poster`; } /* every card is refused now */
  await send('POST', `/api/canvas/boards/${board.id}/agent/proposals/${p4.id}/decision`, { decision: 'go' });
  await until(async () => ((await get(`/api/canvas/boards/${board.id}/agent/state`)).demo.running ? null : true));
  assert.ok((await feedNow()).some((e) => e.from === 'agent' && e.meta?.runId === d3.body.runId && /Nothing was charged/.test(e.text)), 'it says nothing was charged and ends');
  ok('demo agent: when nothing starts it ends kindly instead of waiting');


  /* "Short film from idea", the flagship: beats as notes → Looks good (an edit adds a beat, an edited note is what gets drawn) → cast →
     key frames from the cast → pick versions → film: clip cards wired to the picks are priced but NEVER run (video runs are off); only
     voice + music run on Go. A beat edited after its key frame exists rewrites that card. */
  { const opsFrom = pageOps.length; const ranFrom = ran.length; const notesFrom = notes.length; const jobsS = await jobCount();
    const confirmAfter = async (seq: number) => until(async () => (await feedNow()).find((e) => e.seq > seq && e.from === 'agent' && e.meta?.confirm?.id) ?? null, 20_000);
    const ds = await send('POST', `/api/canvas/boards/${board.id}/agent/demo`, { prompt: 'A short film: a lighthouse keeper teaches a seagull to read the stars', starter: 'short' });
    assert.equal(ds.status, 200); assert.equal(ds.body.plan.id, 'short'); assert.deepEqual(ds.body.plan.steps, ['Beats', 'Cast', 'Key frames', 'Film']);
    const c1 = await confirmAfter(ds.body.message.seq);
    const myOps = () => pageOps.slice(opsFrom);
    const ideaNote = myOps().find((o) => o.kind === 'add_note'); assert.ok(ideaNote && !ideaNote.frame_id, 'the idea note comes first, outside the frames');
    const beatNotes = myOps().filter((o) => o.kind === 'add_note' && o.frame_id); assert.equal(beatNotes.length, 6, 'six beats for a short idea, in the Beats frame');
    assert.equal(myOps().filter((o) => o.kind === 'add_card').length, 0, 'no card before the beats are OK');
    assert.ok((await feedNow()).some((e) => e.meta?.runId === ds.body.runId && e.meta?.tracker === true && Array.isArray(e.meta?.plan)), 'the plan message carries the step tracker');
    /* an edit typed in the dock becomes a new beat; then edit a note on the board itself */
    await send('POST', `/api/canvas/boards/${board.id}/agent/messages`, { text: 'End on the seagull reading the first star' });
    const c2 = await confirmAfter(c1.seq); assert.equal(myOps().filter((o) => o.kind === 'add_note' && o.frame_id).length, 7, 'your edit is a new beat');
    const myNotes = notes.slice(notesFrom).filter((n) => n.frame_id); myNotes[1].text = 'The keeper: alone in the lamp room, counting gulls';
    await send('POST', `/api/canvas/boards/${board.id}/agent/messages`, { text: 'Looks good', confirm_id: c2.meta.confirm.id });
    const pc = await pendingProp(/cast/i); assert.equal(pc.items.length, 2, 'cast: a character sheet and the place');
    assert.equal(await jobCount(), jobsS, 'the cast waits for Go');
    await send('POST', `/api/canvas/boards/${board.id}/agent/proposals/${pc.id}/decision`, { decision: 'go' });
    const pk2 = await pendingProp(/key frame/i); assert.equal(pk2.items.length, 7, 'one key frame per beat (yours too)');
    const keyCards = pk2.runCardIds.map((id: string) => cards.get(id)); assert.ok(keyCards.every((c: any) => c.inputs.length === 1 && pc.runCardIds.includes(c.inputs[0])), 'key frames are made from the character sheet');
    assert.match(keyCards[1].prompt, /alone in the lamp room/, 'your edited note is what gets drawn');
    await send('POST', `/api/canvas/boards/${board.id}/agent/proposals/${pk2.id}/decision`, { decision: 'go' });
    const c3 = await confirmAfter(c2.seq); assert.match(c3.text, /Pick a version/);
    /* a beat edited after its key frame exists rewrites that card */
    myNotes[2].text = 'The spark: a star falls into the sea';
    await until(async () => (await feedNow()).find((e) => e.from === 'agent' && /Beat 3 changed/.test(e.text)) ?? null, 15_000);
    assert.match(cards.get(pk2.runCardIds[2]).prompt, /a star falls into the sea/, 'the key frame follows the beat');
    await send('POST', `/api/canvas/boards/${board.id}/agent/messages`, { text: 'Looks good', confirm_id: c3.meta.confirm.id });
    const pf = await pendingProp(/voice and the music/i);
    const clips = myOps().filter((o) => o.kind === 'add_card' && o.workflow === 'video'); assert.equal(clips.length, 7, 'a clip card per shot');
    assert.ok(clips.every((o, i) => o.inputs_from?.length === 1 && o.inputs_from[0] === pk2.runCardIds[i]), 'each clip is wired from its key frame (your pick flows on)');
    assert.deepEqual(pf.items.map((i: any) => cards.get(i.cardId)?.workflow).sort(), ['music', 'voice'], 'Go runs only voice and music');
    const adds = myOps().filter((o) => o.kind === 'add_card');
    assert.ok(adds.filter((o) => o.workflow === 'create' || o.workflow === 'video').every((o) => typeof o.model === 'string' && o.model.length > 0), 'picture and clip cards carry the tool default from the shared resolver');
    assert.ok(adds.filter((o) => o.workflow === 'voice' || o.workflow === 'music').every((o) => !o.model), 'sound cards keep the page default (no lyrics-only model)');
    assert.ok((await feedNow()).some((e) => e.meta?.runId === ds.body.runId && /switched off/.test(e.text)), 'it says the clips stay priced drafts');
    await send('POST', `/api/canvas/boards/${board.id}/agent/proposals/${pf.id}/decision`, { decision: 'go' });
    await until(async () => ((await get(`/api/canvas/boards/${board.id}/agent/state`)).demo.running ? null : true), 20_000);
    const mine = ran.slice(ranFrom).map((id) => cards.get(id)?.workflow); assert.ok(!mine.includes('video'), `never starts a video job (ran: ${mine.join(',')})`);
    assert.equal(mine.length, 2 + 7 + 2, 'ran: cast, key frames, voice and music (reviewing ran nothing and spent nothing)');
    const order = myOps().filter((o) => o.kind === 'add_note' || o.kind === 'add_card').map((o) => (o.kind === 'add_note' ? 'beat' : /^Shot \d+ · clip/.test(o.name ?? '') ? 'clip' : /^Shot/.test(o.name ?? '') ? 'key' : o.workflow === 'voice' || o.workflow === 'music' ? 'sound' : 'cast'));
    const firstOf = (k: string) => order.indexOf(k), lastOf = (k: string) => order.lastIndexOf(k);
    assert.ok(lastOf('cast') < firstOf('key') && lastOf('key') < firstOf('clip') && firstOf('beat') === 0 && order.indexOf('cast') > order.indexOf('beat'), `ordering: beats → cast → key frames → film (${order.join(' ')})`);
    assert.ok((await feedNow()).some((e) => e.meta?.runId === ds.body.runId && e.meta?.finished && e.meta?.stepsDone === 4), 'all four steps done');
    /* the agent reviewed its own versions (free sample reviews in this mock server) and recommended per shot; it ran nothing for it */
    const reviewsSent = myOps().filter((o) => o.kind === 'review_versions'); assert.equal(reviewsSent.length, 2, 'one review after the cast, one after the key frames');
    assert.equal(reviewsSent[1].cards.length, 7); assert.ok(reviewsSent[1].cards.every((c: any) => c.reviews.length === 1 && ['fits', 'check'].includes(c.reviews[0].verdict)));
    assert.equal(reviewsSent[1].by, 'sample', 'the mock sandbox uses the deterministic sample reviews');
    const revMsg = (await feedNow()).find((e) => e.meta?.runId === ds.body.runId && e.meta?.review && /I looked at each version/.test(e.text) && /Shot/.test(e.text));
    assert.ok(revMsg && /(fits|needs a look)/.test(revMsg.text) && /You choose/.test(revMsg.text) && /sample reviews/.test(revMsg.text), 'the recommendation says who looked and that you choose');
    const batches = myOps().filter((o) => o.kind === 'batch'); assert.equal(batches.length, 3, 'beats, key frames and the film each arrive as one batch');
    assert.deepEqual(batches.map((b) => b.items.length), [1 + 6, 1 + 7, 1 + 7 + 2], 'each batch carries its frame and all its items');
    assert.ok((await feedNow()).some((e) => e.meta?.tool === 'batch' && /^Added 7 cards/.test(e.text)), 'one dock line per batch');
    assert.equal(myOps().filter((o) => o.kind === 'add_card' && /Main character|The place/.test(o.name ?? '')).length, 2, 'the cast stays a guided single step');
    ok('short film: beats wait for Looks good, edits count, cast → key frames → film in order, a late beat edit rewrites its key frame, never a video job'); }

  /* Stop mid-flow: the waiting quote is cancelled and nothing more runs */
  { const jobsT = await jobCount();
    const dt = await send('POST', `/api/canvas/boards/${board.id}/agent/demo`, { prompt: 'A short film from my idea: a robot learns to whistle', starter: 'short' });
    const cs = await until(async () => (await feedNow()).find((e) => e.seq > dt.body.message.seq && e.from === 'agent' && e.meta?.confirm?.id) ?? null);
    await send('POST', `/api/canvas/boards/${board.id}/agent/messages`, { text: 'Looks good', confirm_id: cs.meta.confirm.id });
    const pcs = await pendingProp(/cast/i);
    await send('POST', `/api/canvas/boards/${board.id}/agent/demo/stop`);
    assert.equal((await get(`/api/canvas/agent/proposals/${pcs.id}`)).status, 'cancelled');
    await new Promise((r) => setTimeout(r, 400)); assert.equal(await jobCount(), jobsT, 'Stop mid-flow runs nothing');
    ok('short film: Stop mid-flow cancels the waiting quote, nothing runs'); }

  /* MCP: notes, frames, move_into, point_at and ask_pick go through the page; point_at leaves no feed row */
  const ops = await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'add_frame', name: 'Shot 1 · Dawn', at: { x: 0, y: 0 }, w: 900, h: 500 }, { kind: 'add_note', text: 'Warm haze, low sun', color: 'yellow' }] });
  assert.equal(ops.body.ok, true); const frameId = ops.body.results[0].result.id; const noteId = ops.body.results[1].result.id;
  const mv = await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'move_into', ids: [noteId], frame_id: frameId }, { kind: 'point_at', ids: [noteId], text: 'This one' }] });
  assert.equal(mv.body.ok, true); assert.equal(mv.body.results[0].result.moved, 1);
  assert.equal((await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'add_note', text: '' }] })).status, 400, 'an empty note is refused');
  assert.equal((await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'add_note', text: 'x', color: 'neon' }] })).status, 400, 'an unknown colour is refused');
  assert.equal((await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'move_into', ids: [noteId], frame_id: 'shape:nope' }] })).body.results[0].ok, false, 'no such frame');
  const fx = await feedNow();
  assert.ok(fx.some((e) => /Made a frame: Shot 1 · Dawn/.test(e.text)) && fx.some((e) => /Added a note: “Warm haze, low sun”/.test(e.text)) && fx.some((e) => /Put 1 card in Shot 1 · Dawn/.test(e.text)));
  assert.ok(!fx.some((e) => /This one/.test(e.text)), 'pointing leaves no feed row');
  const ask = await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'ask_pick', card_ids: [pk.cardIds[0], chosen], text: 'Pick your favourite' }] });
  const askPick = ask.body.results[0].result.pick; assert.equal(askPick.status, 'waiting');
  assert.equal((await send('POST', `/api/canvas/boards/${board.id}/agent/pick`, { pick_id: askPick.id, card_id: chosen })).status, 200);
  assert.ok((await get(`/api/canvas/boards/${board.id}/agent/inbox`)).items.some((e: any) => e.meta?.pickId === askPick.id), 'an MCP agent reads the pick from its inbox');
  ok('notes, frames, move_into and point_at go through the page; ask_pick waits for a click and lands in the inbox');

  // ---- no open page: a clear error ----
  ctrl.abort(); closed = true; await pump.catch(() => undefined); await loop.catch(() => undefined); await new Promise((r) => setTimeout(r, 300));
  const noPage = await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'add_card', workflow: 'create', prompt: 'x' }] });
  assert.equal(noPage.body.ok, false); assert.equal(noPage.body.results[0].code, 'canvas_not_open'); assert.match(noPage.body.results[0].error, /Open the board in the app first/);
  const noPageProp = await send('POST', `/api/canvas/boards/${board.id}/agent/ops`, { ops: [{ kind: 'propose_run', card_ids: [cardId] }] });
  assert.equal(noPageProp.body.results[0].code, 'canvas_not_open');
  assert.equal((await send('POST', `/api/canvas/boards/${board.id}/agent/demo`, { prompt: 'x', starter: 'free' })).body.code, 'canvas_not_open');
  ok('no open canvas page: add and propose return "Open the board in the app first"');

  // ---- connected clients (2026-10-28): the MCP server's session list flips presence before any tool call ----
  assert.equal((await send('POST', '/api/canvas/agent/sessions', { process_id: 'p-test', sessions: [{ id: 's1', client: 'claude-code', transport: 'http', since: Date.now(), lastSeen: Date.now() }] })).status, 200);
  let pres = await get('/api/canvas/agent/presence');
  assert.equal(pres.sessions.length, 1); assert.equal(pres.sessions[0].name, 'Claude Code'); assert.equal(pres.connected, true);
  assert.equal((await send('POST', '/api/canvas/agent/sessions', { process_id: 'p-test', sessions: [] })).status, 200);
  pres = await get('/api/canvas/agent/presence'); assert.equal(pres.sessions.length, 0);
  assert.equal((await send('POST', '/api/canvas/agent/open', { board_id: 'brd_nope' })).status, 404);
  ok('MCP sessions: connected on connect (named "Claude Code"), gone on disconnect; open refuses an unknown board');

  // ---- the MCP tool list includes the canvas tools ----
  const tools = (await get('/api/mcp/tools')).items.map((t: any) => t.name);
  const want = ['canvas_list_boards', 'canvas_create_board', 'canvas_rename_board', 'canvas_switch_board', 'canvas_open_board', 'canvas_read_board', 'canvas_list_workflows', 'canvas_add_card', 'canvas_update_card', 'canvas_connect', 'canvas_remove_card', 'canvas_propose_run', 'canvas_proposal_status', 'canvas_say', 'canvas_inbox',
    'canvas_add_note', 'canvas_add_frame', 'canvas_move_into', 'canvas_point_at', 'canvas_ask_pick', 'canvas_next_steps', 'canvas_batch', 'canvas_review', 'canvas_wait_for_message', 'canvas_add_from_job'];
  for (const n of want) assert.ok(tools.includes(n), `MCP tool list is missing ${n}`);
  ok(`MCP tool list includes all ${want.length} canvas tools (${tools.length} tools total)`);

  console.log('canvas-agent: all ok');
} finally {
  closed = true; try { ctrl?.abort(); } catch { /* gone */ }
  try { process.kill(-srv.pid!); } catch { /* gone */ }
}
