// MODEL-PICKER-REVIEW task 7: POST /api/models/quotes prices every picker row for THIS run in one call.
//  1. each row = the single quote (GET /api/tools/:id/price?model=…) with the same settings: place, route, credits and cost, for several
//     tools / models / settings (aspect, resolution, count, duration, references, sound) and with a saved run-on choice;
//  2. the price follows the settings (count, duration, sound, references change it);
//  3. a setting the model can't take is snapped like the page does (resolution → its first, duration → nearest) and named in `adjusted`;
//  4. priceRange spans the places that can run the job now and contains priceNow;
//  5. the submit with the row's quoted route + credits runs at that price (never 409 route_changed);
//  6. the listing's pre-selection is judged on the page's first mode (MiniMax H3: Comfy, same as the batch and the page's quote).
// Run: npx tsx test/models-quotes-batch.e2e.ts (port 8979; temp data dir, mock backend, mock keys).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'mqb-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_COMFY_API_KEY: '', OPENHIGGSFIELD_USE_LOCAL: '' };
const PORT = testPort(8979); const B = `http://localhost:${PORT}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, '.env.local'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_HOSTED: '' }, stdio: 'ignore', detached: true });
const get = async (u: string) => { const r = await fetch(B + u); return { status: r.status, body: (await r.json()) as any }; };
const batch = async (toolId: string, params: Record<string, string>, models?: unknown[]) => { const r = await fetch(`${B}/api/models/quotes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ toolId, params, ...(models ? { models } : {}) }) }); assert.equal(r.status, 200, `batch ${toolId}`); return ((await r.json()) as any).quotes as Record<string, any>; };
const single = (toolId: string, params: Record<string, string>, model: string, runOn?: string) => get(`/api/tools/${toolId}/price?${new URLSearchParams({ ...params, model, ...(runOn ? { runOn } : {}) })}`);
const ok = (m: string) => console.log('ok ' + m);
/** A batch row equals the single quote at the same (adjusted) settings. */
async function same(toolId: string, params: Record<string, string>, row: any, runOn?: string) {
  const at: Record<string, string> = { ...params }; for (const [k, v] of Object.entries<any>(row.adjusted ?? {})) { if (v == null) delete at[k]; else at[k] = v; } // a field the model doesn't take is dropped (null)
  const s = await single(toolId, at, row.model, runOn);
  assert.equal(row.status, s.status, `${toolId} ${row.model}: status`);
  for (const k of ['credits', 'runOn', 'routeId', 'demo', 'runnable', 'needsKey', 'chargeable']) assert.deepEqual(row[k], s.body[k], `${toolId} ${row.model} ${JSON.stringify(params)}: ${k} batch ${row[k]} vs single ${s.body[k]}`);
  assert.deepEqual(row.cost ?? null, s.body.cost ?? null, `${toolId} ${row.model}: cost`);
  return s.body;
}
try {
  for (let i = 0; i < 160; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const tools = (await (await fetch(`${B}/api/tools`)).json()) as any[];
  const modelsOf = (id: string) => tools.find((t) => t.id === id).models as any[];

  // ---- 1. every row = the single quote, several tools and settings ----
  const CASES: [string, Record<string, string>][] = [
    ['create-image', { aspect: '1:1', n: '1', refs: '0', mode: 'generate' }],
    ['create-image', { aspect: '16:9', imageResolution: '2K', n: '3', refs: '0', mode: 'generate' }],
    ['create-image', { aspect: 'auto', n: '2', refs: '3', mode: 'edit' }],
    ['h3-video', { duration: '6', resolution: '768p', types: 't2v', aspect: 'auto', audio: '1', quality: 'quality' }],
    ['h3-video', { duration: '15', resolution: '1080p', types: 't2v', aspect: '16:9', audio: '0', quality: 'quality' }],
    ['h3-video', { duration: '8', resolution: '768p', types: 'r2v', refs: '7', audio: '1', quality: 'quality' }],
    ['audio', { types: 'music', seconds: '30', prompt: 'calm piano' }],
    ['camera', { types: '["dolly-in"]', duration: '5' }],
  ];
  let rows = 0;
  for (const [tool, params] of CASES) { const qs = await batch(tool, params);
    const listed = modelsOf(tool).map((m) => m.key); assert.deepEqual(Object.keys(qs).sort(), [...listed].sort(), `${tool}: one row per listed model`);
    for (const row of Object.values(qs)) { await same(tool, params, row); rows++; } }
  ok(`${rows} rows over ${CASES.length} tool/settings cases = the single quote (place, route, credits, cost)`);

  // ---- 2. the price follows the settings ----
  const ci1 = (await batch('create-image', { aspect: '1:1', n: '1', refs: '0', mode: 'generate' }, ['nano-banana-2']))['nano-banana-2'];
  const ci3 = (await batch('create-image', { aspect: '1:1', n: '3', refs: '0', mode: 'generate' }, ['nano-banana-2']))['nano-banana-2'];
  assert.ok(ci3.credits > ci1.credits, `count 3 costs more than 1: ${ci1.credits} → ${ci3.credits}`);
  const v6 = (await batch('h3-video', { duration: '6', resolution: '768p', types: 't2v' }, ['minimax-h3']))['minimax-h3'];
  const v15 = (await batch('h3-video', { duration: '15', resolution: '768p', types: 't2v' }, ['minimax-h3']))['minimax-h3'];
  assert.equal(v6.runOn, 'comfy-cloud'); assert.ok(v15.credits > v6.credits, `15 s costs more than 6 s: ${v6.credits} → ${v15.credits}`);
  assert.equal(v6.cost.billedTo, 'comfy'); assert.ok(v6.cost.estUnits > 0, 'Comfy rows carry Comfy credits (the Generate button unit)');
  // sound and references: whichever models price them, the batch says the same as the single quote (checked in 1); here the change is visible
  const snd = async (audio: string) => batch('h3-video', { duration: '8', resolution: '1080p', types: 't2v', audio }, ['seedance-2.0', 'kling-v3', 'veo-3.1', 'minimax-h3']);
  const on = await snd('1'), off = await snd('0'); const soundPriced = Object.keys(on).filter((k) => on[k].credits !== off[k].credits);
  for (const k of Object.keys(on)) { await same('h3-video', { duration: '8', resolution: '1080p', types: 't2v', audio: '1' }, on[k]); await same('h3-video', { duration: '8', resolution: '1080p', types: 't2v', audio: '0' }, off[k]); }
  const refP = (refs: string) => ({ imageResolution: '1K', aspect: '1:1', mode: 'edit', refs });
  const r3 = (await batch('create-image', refP('2'), ['seedream-5.0-pro']))['seedream-5.0-pro']; const r8 = (await batch('create-image', refP('10'), ['seedream-5.0-pro']))['seedream-5.0-pro'];
  assert.ok(r8.credits > r3.credits, `Seedream 5.0 Pro bills each reference: 2 refs ${r3.credits}, 10 refs ${r8.credits}`); await same('create-image', refP('10'), r8);
  ok(`price follows count (${ci1.credits} → ${ci3.credits}), duration (${v6.credits} → ${v15.credits}), references (${r3.credits} → ${r8.credits}); sound priced on: ${soundPriced.join(', ') || 'none in mock'}`);

  // ---- 3. snapped settings ----
  const sn = await batch('h3-video', { duration: '15', resolution: '1080p', types: 't2v' }, ['minimax-h3', 'veo-3.1']);
  assert.equal(sn['minimax-h3'].adjusted?.resolution, '768p', 'MiniMax H3 has no 1080p: priced at the highest it makes up to yours'); // 2026-10-27: + the place's own lengths (Comfy Cloud workflow 5 / 10 s)
  assert.ok(!sn['minimax-h3'].adjusted?.duration || ['10', '15'].includes(sn['minimax-h3'].adjusted.duration), JSON.stringify(sn['minimax-h3'].adjusted));
  assert.equal(sn['veo-3.1'].adjusted?.duration, '8', `Veo runs 4–8 s: 15 s snaps to the longest up to it (${JSON.stringify(sn['veo-3.1'].adjusted)})`);
  ok('settings a model refuses are snapped (resolution → first allowed, duration → nearest) and named in `adjusted`');

  // ---- 4. priceRange ----
  for (const [tool, params] of CASES.slice(0, 5)) for (const row of Object.values(await batch(tool, params))) {
    if (row.runnable === false || row.demo || row.status >= 400) continue; const pr = row.priceRange; assert.ok(pr, `${tool} ${row.model}: a runnable row has a range`);
    assert.ok(pr.min <= row.credits && row.credits <= pr.max, `${tool} ${row.model}: ${row.credits} within ${pr.min}..${pr.max}`);
    assert.ok(pr.places.some((x: any) => x.runOn === row.runOn), `${tool} ${row.model}: priceNow's place is in the range`); }
  ok('priceRange spans the ready places and contains priceNow');

  // ---- saved choice: the batch prices the place the page would send (runOn) = the single quote with that runOn ----
  const pin = await fetch(`${B}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ global: { useLocal: true }, perTool: { 'h3-video': { 'minimax-h3': { runOn: 'local' } } } }) }); assert.equal(pin.status, 200);
  const pv = await batch('h3-video', { duration: '6', resolution: '768p', types: 't2v' }, [{ model: 'minimax-h3', runOn: 'local' }]); assert.equal(pv['minimax-h3'].runOn, 'local'); assert.equal(pv['minimax-h3'].credits, 0);
  await same('h3-video', { duration: '6', resolution: '768p', types: 't2v' }, pv['minimax-h3'], 'local');
  const pn = await batch('h3-video', { duration: '6', resolution: '768p', types: 't2v' }, ['minimax-h3']); assert.equal(pn['minimax-h3'].runOn, 'local', 'no runOn sent: the server applies the saved choice too');
  await fetch(`${B}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ global: { useLocal: false }, perTool: {} }) });
  const back = await batch('h3-video', { duration: '6', resolution: '768p', types: 't2v' }, ['minimax-h3']); assert.equal(back['minimax-h3'].runOn, 'comfy-cloud', 'the cache never answers from before the choice was cleared');
  ok('a saved run-on choice is priced at that place (and the cache follows the change)');

  // ---- 5. submit at the row's quote ----
  const sub = async (tool: string, fields: Record<string, string>, row: any) => { const fd = new FormData();
    for (const [k, v] of Object.entries({ prompt: 'a calm test scene', rights: '1', ...fields, model: row.model, quotedRouteId: row.routeId, quotedCredits: String(row.credits) })) fd.append(k, v);
    const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); const b = (await r.json()) as any;
    assert.equal(r.status, 200, `${tool} ${row.model}: submit ${r.status} ${b.error ?? ''} ${JSON.stringify({ q: b.quote?.routeId, qc: b.quote?.credits, row: row.routeId, rc: row.credits, e: b.error })}`); assert.equal(b.route, row.routeId, `${tool} ${row.model}: route`); assert.equal(b.cost, row.credits, `${tool} ${row.model}: cost`); };
  const ciP = { aspect: '1:1', n: '2', refs: '0', mode: 'generate' }; const ciQ = await batch('create-image', ciP, ['nano-banana-2', 'gpt-image', 'flux-2-pro']);
  for (const row of Object.values(ciQ)) await sub('create-image', { aspect: '1:1', n: '2', types: '["generate"]' }, row);
  const vP = { duration: '6', resolution: '768p', types: 't2v', audio: '1' }; const vQ = await batch('h3-video', vP, ['minimax-h3', 'kling-v3']);
  for (const row of Object.values(vQ)) await sub('h3-video', { duration: '6', resolution: row.adjusted?.resolution ?? '768p', types: '["t2v"]', audio: '1' }, row);
  ok(`the submit with a row's quoted route and credits runs at that price (${Object.keys(ciQ).length + Object.keys(vQ).length} submits)`);

  // ---- 6. listing pre-selection judged on the page's first mode ----
  const mh = modelsOf('h3-video').find((m) => m.key === 'minimax-h3'); const fresh = ((await (await fetch(`${B}/api/tools`)).json()) as any[]).find((t) => t.id === 'h3-video').models.find((m: any) => m.key === 'minimax-h3');
  assert.equal(fresh.preselect?.runOn, 'comfy-cloud', `MiniMax H3 listing pre-selects ${fresh.preselect?.runOn}`); assert.equal(fresh.rowStatus.runOn, 'comfy-cloud'); void mh;
  assert.equal((await single('h3-video', { types: 't2v' }, 'minimax-h3')).body.runOn, 'comfy-cloud', 'the page quote (t2v) agrees');
  ok('MiniMax H3: listing pre-selection = the page quote = the batch row (Comfy)');

  // ---- 7. other video tools: each row priced at the settings it would send once picked (its own default size, as the bar's valOf) ----
  { const keyOf = (tool: string, engine: string) => modelsOf(tool).find((m) => JSON.stringify(m).includes(`"${engine}"`))?.key as string;
    const PE = { types: '["edit"]', resolution: '480p', seconds: '5' }; const pe = await batch('prompt-edit', PE);
    const k4 = pe[keyOf('prompt-edit', 'cloud-kling4-edit')]; assert.ok(k4, 'Kling 4.0 row');
    assert.equal(k4.adjusted?.resolution, '720p', `Kling 4.0 at 480p is priced at its own 720p: ${JSON.stringify(k4.adjusted)}`);
    assert.notEqual(k4.runnable, false, `Kling 4.0 row runs once picked: ${k4.blockedReason ?? k4.reason ?? ''}`);
    assert.equal(k4.fit?.values?.resolution, '720p'); assert.match(String(k4.fit?.note), /^Resolution set to 720p for .+\.$/, 'the bar\'s note: set to its default, not "the lowest"');
    await same('prompt-edit', PE, k4);
    const bern = pe[keyOf('prompt-edit', 'cloud-bernini-r')]; assert.ok(!bern.adjusted?.resolution, 'a model that makes 480p keeps it');
    const fx = await batch('photo-fx', { types: '["fx-zoom"]', duration: '5', resolution: '720p', aspect: '9:16' }); const ltx = fx[keyOf('photo-fx', 'comfy-ltx25-video')];
    assert.ok(ltx, 'Photo FX LTX-2.5 row'); { assert.equal(ltx.adjusted?.resolution, '448p', `Photo FX LTX-2.5 at its own Draft size: ${JSON.stringify(ltx.adjusted)}`); assert.equal(ltx.fit?.changes?.find((c: any) => c.field === 'resolution')?.why, 'default'); }
    const ex = await batch('h3-extend', { resolution: '1080p', seconds: '5' }); const h3x = ex[keyOf('h3-extend', 'comfy-h3-extend')];
    assert.ok(h3x, 'Extend H3 row'); assert.equal(h3x.adjusted?.resolution, '768p', `Extend H3 at its own 768p: ${JSON.stringify(h3x.adjusted)}`);
    ok(`other video tools: Kling 4.0 at 480p → priced at 720p (${k4.credits} cr); Photo FX LTX → 448p; Extend H3 → 768p`); }

  // validation
  const bad = await fetch(`${B}/api/models/quotes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ toolId: 'nope' }) }); assert.equal(bad.status, 400);
  const unk = await batch('create-image', {}, ['not-a-model']); assert.equal(unk['not-a-model'].ok, false);
  ok('unknown tool → 400; unknown model → a row with ok:false');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } fs.rmSync(D, { recursive: true, force: true }); }
