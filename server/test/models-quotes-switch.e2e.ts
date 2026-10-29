// Create Image model menu: a row's price = what Generate shows right after picking that model (bug 2026-10-23: with a local model and
// Auto aspect selected, every hosted row said "Not for these settings", because the batch quoted Auto on models that have no Auto).
//  1. local FLUX 3 Klein + Auto (and 4K, 21:9, count 4, quality): every hosted row is priced (no 400) and equals the bar's own quote after
//     switching to it (shared/imageSnap.ts paramsOnSwitch on the model's caps + its default route's resolutions → GET /api/models/quote);
//  2. hosted GPT Image 2.5 Flare (quality high, 16:9, 4 images) selected → local rows priced, quality dropped;
//  3. edit with a photo ("Match photo" = auto): rows priced; models that keep Auto in edits keep it;
//  4. only what picking can't fix still blocks, with a specific reason: too many images ("Takes up to 4 images; you have 6."), a mask on a
//     model without one; the hover card's per-place prices (priceRange) are quoted at the switched settings too.
// Run: npx tsx test/models-quotes-switch.e2e.ts (port 8987; temp data dir, mock backend, mock keys).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { paramsOnSwitch } from '../src/shared/imageSnap.ts'; import { capsFor } from '../src/shared/imageCaps.ts';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'mqs-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_COMFY_API_KEY: '', OPENHIGGSFIELD_USE_LOCAL: '' };
const PORT = testPort(8987); const B = `http://localhost:${PORT}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, '.env.local'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_HOSTED: '' }, stdio: 'ignore', detached: true });
const ok = (m: string) => console.log('ok ' + m);
const batch = async (params: Record<string, string>) => { const r = await fetch(`${B}/api/models/quotes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ toolId: 'create-image', params }) }); assert.equal(r.status, 200); return (await r.json()).quotes as Record<string, any>; };
try {
  for (let i = 0; i < 160; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
  const tool = ((await (await fetch(`${B}/api/tools`)).json()) as any[]).find((t) => t.id === 'create-image');
  const models: any[] = tool.models; const provs: any[] = tool.providers;
  const isLocal = (m: any) => m.home === 'gpu' || m.section === 'gpu';
  const runs = (m: any) => m.rowStatus?.kind === 'ready';
  /** The bar after picking model m: its settings (paramsOnSwitch on the model's caps and its default route's resolutions), then its quote. */
  const afterSwitch = async (m: any, cur: Record<string, string>) => {
    const engine = m.primaryEngine; const pv = provs.find((x) => x.id === engine) ?? {}; const rs: any[] = pv.routes ?? [];
    const rc = (rs.find((r) => r.routeId === pv.defaultRoute) ?? rs.find((r) => r.kind === 'local') ?? rs[0])?.caps ?? {};
    const sw = paramsOnSwitch(capsFor(engine), cur, { routeResolutions: rc.resolutions ?? null });
    const r = await fetch(`${B}/api/models/quote?${new URLSearchParams({ ...sw, model: engine })}`); return { status: r.status, body: (await r.json()) as any, sw };
  };

  // ---- 1. local FLUX 3 Klein selected: hosted rows priced = the quote after switching ----
  const LOCAL_SETS: Record<string, string>[] = [
    { aspect: 'auto', imageResolution: '1K', n: '1', refs: '0', mode: 'generate' }, // the bug report
    { aspect: 'auto', imageResolution: '4K', n: '4', refs: '0', mode: 'generate' }, // 4K and 4 images on models without them
    { aspect: '21:9', imageResolution: '2K', n: '2', refs: '0', mode: 'generate' }, // 21:9 on models without it
  ];
  let n1 = 0;
  for (const cur of LOCAL_SETS) { const qs = await batch(cur);
    for (const m of models.filter((x) => !isLocal(x) && runs(x))) { const row = qs[m.key]; assert.ok(row, `${m.key}: a row`);
      assert.ok(row.status < 400 && row.ok, `${m.key} at ${JSON.stringify(cur)}: priced, not "${row.error ?? row.blockedReason ?? ''}"`);
      const s = await afterSwitch(m, cur); assert.equal(s.status, 200, `${m.key}: the bar's quote after switching (${JSON.stringify(s.sw)}): ${s.body?.error ?? ''}`);
      assert.equal(row.credits, s.body.credits, `${m.key} ${JSON.stringify(cur)}: row ${row.credits} = after switching ${s.body.credits}`);
      assert.equal(row.runOn, s.body.runOn ?? row.runOn, `${m.key}: same place`);
      if (cur.aspect === 'auto' && !capsFor(m.primaryEngine)?.allowAuto) assert.ok(row.adjusted?.aspect && row.adjusted.aspect !== 'auto', `${m.key}: Auto snapped (${JSON.stringify(row.adjusted)})`);
      n1++; } }
  assert.ok(n1 >= 20, `checked ${n1} hosted rows`);
  ok(`local model + Auto / 4K / 21:9 / 4 images: ${n1} hosted rows priced, each = the quote after switching to it`);
  const q1 = await batch(LOCAL_SETS[0]); for (const k of ['flux-2-flex', 'flux-2-klein-9b']) assert.notEqual(q1[k].runnable, false, `${k}: refs=0 is no images (was read as one and sent to the edit route): ${q1[k].blockedReason ?? ''}`);
  const nb = (await batch(LOCAL_SETS[1]))['nano-banana-pro'];
  assert.equal(nb.adjusted?.imageResolution, undefined, 'picking Nano Banana Pro keeps 4K: the bar keeps a resolution the new model supports (user, 2026-10-23)');
  assert.ok(nb.priceRange?.places?.length >= 1 && nb.priceRange.places.every((x: any) => typeof x.credits === 'number'), 'the hover card per-place prices are quoted too');
  ok('switched settings are named in `adjusted`; the per-place prices use them');

  // ---- 2. hosted selected → local rows ----
  const hosted = { aspect: '16:9', quality: 'high', n: '4', refs: '0', mode: 'generate' };
  const qh = await batch(hosted); let n2 = 0;
  for (const m of models.filter((x) => isLocal(x) && runs(x))) { const row = qh[m.key]; if (!row) continue;
    assert.ok(row.status < 400, `${m.key}: priced with GPT's settings: ${row.error ?? ''}`); assert.equal(row.adjusted?.quality, null, `${m.key}: no quality chip → quality dropped`);
    const s = await afterSwitch(m, hosted); assert.equal(row.credits, s.body.credits, `${m.key}: row = after switching`); n2++; }
  ok(`hosted model (quality high, 16:9, 4 images) selected: ${n2} local rows priced = after switching`);

  // ---- 3. edit with a photo (Match photo) ----
  const edit = { aspect: 'auto', imageResolution: '1K', n: '1', refs: '1', mode: 'edit' };
  const qe = await batch(edit); let n3 = 0;
  for (const m of models.filter((x) => runs(x) && capsFor(x.primaryEngine)?.supports.refs)) { const row = qe[m.key]; if (!row || row.runnable === false) continue; // a route that can't edit says so itself
    assert.ok(row.status < 400, `${m.key}: edit priced: ${row.error ?? ''}`);
    const s = await afterSwitch(m, edit); assert.equal(row.credits, s.body.credits, `${m.key}: edit row = after switching (${JSON.stringify(s.sw)})`);
    if (capsFor(m.primaryEngine)?.edit?.allowAuto) assert.equal(row.adjusted?.aspect, undefined, `${m.key}: keeps Match photo`); n3++; }
  assert.ok(n3 >= 10, `checked ${n3} edit rows`); ok(`edit with a photo: ${n3} edit rows priced = after switching; Match photo kept where the model takes it`);

  // ---- 4. real limits still block, with the reason ----
  const q6 = await batch({ ...edit, refs: '6' });
  assert.equal(q6['nano-banana-2'].status, 400); assert.equal(q6['nano-banana-2'].error, 'Takes up to 4 images; you have 6.');
  assert.ok(q6['gpt-image-2.5-flare'].status < 400, 'GPT Image 2.5 Flare takes 16');
  const q16 = await batch({ ...edit, refs: '16' }); assert.ok(q16['gpt-image-2.5-flare'].status < 400, '16 images fit GPT Image 2.5 Flare'); assert.equal(q16['flux-3-klein'].error, 'Takes up to 10 images; you have 16.');
  const q0 = await batch({ ...edit, refs: '0', mode: 'generate' }); assert.ok(Object.values(q0).every((r: any) => r.code !== 'unsupported' || r.field !== 'refs'), 'no images: nothing blocked for images');
  const qm = await batch({ ...edit, mode: 'inpaint' });
  assert.equal(qm['nano-banana-2'].status, 400); assert.match(qm['nano-banana-2'].error, /mask/); assert.ok(qm['gpt-image'].status < 400, 'GPT Image 2 takes a mask');
  ok('too many images (6 / 16) and a mask on a model without one still block, each with its own reason; 0–1 images never do');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } fs.rmSync(D, { recursive: true, force: true }); }
