// Canvas chain run (2026-11-02): Picture → Character sheet → Image to 3D with one Go, on its own mock server (temp data dir, sample runs only).
//  - every downstream card gets its upstream card's output: the card's form (cardModel.runForm) sends that picture as the file and its job as parentId;
//  - quote = charge for an app with recipe text: GPT Image bills prompt text, and the Character Sheet recipe (~1 KB) around the typed words was quoted
//    as a 500-byte prompt, so the sheet's submit came out dearer than its quote and the live run got 409 route_changed (no job, the card back to a
//    draft). The quote now counts the composed prompt (tools/apps.ts appQuotePromptBytes), so quote ≥ what the submit is charged;
//  - a card that doesn't start says so on the card (nodeLogic.runInOrder notStarted), and the card after it doesn't start either.
// Run: npx tsx test/canvas-chain-run.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { flowById, flowSpec, placeInputs, type GenCatalog } from '../../web/src/shared/genFlows.ts';
import { runForm, takesOf } from '../../web/src/canvas/cardModel.ts';
import { runInOrder, type Upstream } from '../../web/src/canvas/nodeLogic.ts';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(9701); const B = `http://localhost:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-chain-')); process.env.OPENHIGGSFIELD_DATA_DIR = DATA; process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_ENV_FILE: path.join(os.tmpdir(), 'cv-chain-none.env'),
  OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', COMFY_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', COMFY_DETECT_URLS: 'http://127.0.0.1:9' }, stdio: 'ignore', detached: true });
const ok = (m: string) => console.log('ok ' + m);
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const until = async (id: string) => { for (let i = 0; i < 200; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'canceled', 'blocked'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 150)); } throw new Error(`job ${id} never ended`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
try {
  for (let i = 0; i < 160; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } await sleep(500); }
  assert.equal((await get('/api/health')).backend, 'mock');
  const cat: GenCatalog = { tools: await get('/api/tools'), recipes: (await get('/api/image-workflows')).workflows, models: Object.fromEntries(((await get('/api/models?toolId=create-image')).groups ?? []).flatMap((g: any) => g.models ?? []).map((m: any) => [m.providerId ?? m.id, m])) };
  type In = { key: string; kind: 'image'; url: string; poster: string; jobId: string; label: string };
  const spec = (flow: string, provider: string, inputs: In[] = []) => { const f = flowById(flow)!; const s0 = flowSpec(f, cat, { provider, filled: {} })!; const pl0 = placeInputs(s0.slots, inputs);
    const s = flowSpec(f, cat, { provider, filled: pl0.bySlot })!; return { s, ...placeInputs(s.slots, inputs) }; };
  /* a card's run as genRun.submitCard sends it: its fields plus each wired input fetched from the board's /files/ URL */
  const run = async (sp: ReturnType<typeof spec>, inputs: In[], prompt: string) => { const form = runForm(sp.s, sp.bySlot, inputs, prompt, { projectId: null, boardId: 'brd_chain' });
    const fd = new FormData(); for (const [k, v] of Object.entries(form.fields)) fd.append(k, v);
    for (const f of form.files) fd.append(f.field, new Blob([await (await fetch(B + f.input.url)).arrayBuffer()], { type: 'image/png' }), `${f.name}.png`);
    const r = await fetch(`${B}/api/tools/${sp.s.tool.id}/jobs`, { method: 'POST', body: fd }); const b = await r.json() as any; assert.equal(r.status, 200, `${sp.s.tool.id}: ${JSON.stringify(b).slice(0, 300)}`);
    return { id: b.id as string, form }; };
  const out = (j: any): In => { const t = takesOf(j)[0]; assert.ok(t, `job ${j.id} has a result`); return { key: t.url, kind: 'image', url: t.url, poster: t.poster ?? t.url, jobId: j.id, label: j.id }; };

  // ---- the chain: each card is fed by the card before it ----
  const SHEET = 'The same small round orange robot gardener with its green watering can: front, side, back and three-quarter views, plain light background';
  const pic = spec('create', 'comfy-zimage-turbo'); const p = await run(pic, [], 'A small round orange robot gardener holding a green watering can'); const pj = await until(p.id); assert.equal(pj.status, 'done');
  const sIn = [out(pj)]; const sheet = spec('character-sheet', 'api-gpt-image-25-flare', sIn); assert.equal(sheet.s.mode, 'edit', 'the sheet edits the picture wired into it');
  const s = await run(sheet, sIn, SHEET); assert.equal(s.form.fields.parentId, pj.id); assert.deepEqual(s.form.files.map((f) => f.field), ['image']);
  const sj = await until(s.id); assert.equal(sj.status, 'done'); assert.equal(sj.parentId, pj.id, 'the sheet job is made from the picture');
  const tIn = [out(sj)]; const to3d = spec('image-to-3d', 'cloud-tripo-31', tIn); const t = await run(to3d, tIn, ''); assert.equal(t.form.fields.parentId, sj.id); assert.ok(t.form.files.length >= 1, 'the 3D card sends the sheet');
  const tj = await until(t.id); assert.equal(tj.status, 'done'); assert.equal(tj.parentId, sj.id, 'the 3D job is made from the sheet');
  ok(`picture ${pj.id} → sheet ${sj.id} → 3D ${tj.id}: each card ran on its upstream card's output`);

  // ---- quote = charge: the sheet's quote (as the card asks for it) covers what its submit is charged ----
  { const A = await import('../src/tools/apps.ts'); const { getTool } = await import('../src/tools/registry.ts'); const { routeCredits, routeInput } = await import('../src/routing/select.ts'); const { findRoute } = await import('../src/routing/routes.ts');
    fs.mkdirSync(path.join(DATA, 'uploads'), { recursive: true }); fs.writeFileSync(path.join(DATA, 'uploads', 'sheet-in.png'), Buffer.from(await (await fetch(B + sIn[0].url)).arrayBuffer()));
    const tool = getTool('app-character-sheet')!; const route = findRoute('comfy-router:api-gpt-image-25-flare')!;
    const inp: any = await tool.parseInput({ ...s.form.fields }, { image: ['uploads/sheet-in.png'] }); assert.ok(!inp.error, JSON.stringify(inp).slice(0, 200));
    const sent = new TextEncoder().encode(inp.prompt).length; assert.ok(sent > 500, `the recipe makes the sent prompt long (${sent} bytes)`);
    assert.equal(A.appQuotePromptBytes(tool, { ...sheet.s.quote, provider: sheet.s.provider, prompt: SHEET }), sent, 'with the typed words: exactly the prompt the submit sends');
    const charge = routeCredits(tool, route, routeInput(tool, inp))!;
    const q = await get(`/api/tools/app-character-sheet/price?${new URLSearchParams({ provider: sheet.s.provider, ...sheet.s.quote })}`); const quoted = q.listCredits ?? q.credits;
    assert.ok(typeof quoted === 'number' && quoted >= charge, `the card's quote (${quoted}) covers the charge (${charge}): no 409 route_changed on Go`);
    const withWords = await get(`/api/tools/app-character-sheet/price?${new URLSearchParams({ provider: sheet.s.provider, ...sheet.s.quote, prompt: SHEET })}`); assert.equal(withWords.listCredits ?? withWords.credits, charge, 'with the words: quote = charge');
    ok(`Character Sheet on GPT Image 2.5 Flare: quote ${quoted} ≥ charge ${charge} (recipe prompt ${sent} bytes)`); }

  // ---- a start failure shows on the card; the card after it doesn't start ----
  { const status: Record<string, string> = { pic: 'draft', sheet: 'draft', to3d: 'draft' }; const shown: Record<string, string> = {}; const heard: Record<string, string> = {};
    const feeds: Record<string, string> = { sheet: 'pic', to3d: 'sheet' };
    const waits = (id: string): Upstream[] => { const u = feeds[id]; return u && status[u] !== 'done' ? [{ id: u, name: u, status: status[u] }] : []; };
    const MSG = 'The price changed since you last saw it. Nothing was charged.';
    const submit = async (id: string) => { if (id === 'sheet') throw new Error(MSG); status[id] = 'running'; setTimeout(() => { status[id] = 'done'; }, 100); return `job-${id}`; };
    const r = await runInOrder(['pic', 'sheet', 'to3d'], { waits, submit, exists: () => true, pollMs: 20, notStarted: (id, e) => { status[id] = 'failed'; shown[id] = e; }, onLater: (id, x) => { heard[id] = x.error ?? x.jobId ?? ''; } });
    assert.deepEqual(r.jobIds, ['job-pic']); assert.deepEqual(r.later, ['sheet', 'to3d']);
    for (let i = 0; i < 100 && Object.keys(heard).length < 2; i++) await sleep(20);
    assert.equal(shown.sheet, MSG, 'the sheet card shows the server’s words'); assert.equal(status.sheet, 'failed');
    assert.match(shown.to3d ?? '', /sheet didn’t finish/, 'the 3D card says why it didn’t run'); assert.equal(heard.sheet, MSG);
    assert.equal(shown.pic, undefined, 'the picture that ran is untouched');
    /* the happy chain: every card starts once the card before it is done */
    for (const k of Object.keys(status)) status[k] = 'draft'; const ran: string[] = []; const ok2 = async (id: string) => { ran.push(id); status[id] = 'running'; setTimeout(() => { status[id] = 'done'; }, 50); return `job-${id}`; };
    await runInOrder(['pic', 'sheet', 'to3d'], { waits, submit: ok2, exists: () => true, pollMs: 20, notStarted: (id, e) => { throw new Error(`${id} should start: ${e}`); } });
    for (let i = 0; i < 100 && ran.length < 3; i++) await sleep(20); assert.deepEqual(ran, ['pic', 'sheet', 'to3d']);
    ok('one Go: a card the server refuses shows its words on the card, the card after it says why it didn’t run; a clean chain starts every card in order'); }
  console.log('PASS canvas-chain-run');
} finally { try { process.kill(-srv.pid!); } catch { /* gone */ } }
