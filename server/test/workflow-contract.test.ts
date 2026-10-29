// Workflows page contract (2026-10-27): the page shows every workflow the app can run, exactly once, and nothing it can't.
//  - every tab workflow (Video picker + shortcuts, Create Image, Audio, the 3D tab's ready ones, each Footage Effects effect: WF_SOURCES)
//    has exactly one card, or is in WF_EXCLUDED with a reason; no card stands for a workflow that doesn't exist;
//  - every server tool has a card or is in WF_TOOLS_EXCLUDED with a reason; no card points at a tool that doesn't exist; a preset card's preset
//    is offered by its tool;
//  - with the registry's own tools (mock), every entry resolves to exactly one row; a tool whose models can't run anywhere (only "can't run
//    on this Mac" / "not ready yet") has no row, and a chain shows only when every step has one.
// Run: npx tsx test/workflow-contract.test.ts
import assert from 'node:assert/strict';
process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const ok = (m: string) => console.log('ok ' + m);
const { WF_ENTRIES, WF_SOURCES, WF_EXCLUDED, WF_TOOLS_EXCLUDED, WF_CHAINS } = await import('../src/shared/workflowCatalog.ts');
await import('../src/tools/apps.ts'); await (await import('../src/plugins.ts')).loadPlugins(); const { getTool, listTools } = await import('../src/tools/registry.ts'); const { toolModels } = await import('../src/routing/modelRegistry.ts');
const { resolveRow, whyHidden } = await import('../../web/src/ui/pages/workflowRows.ts');

// 1. tab workflows ↔ cards
const keys = new Set(WF_SOURCES.map((s) => s.key)); assert.equal(keys.size, WF_SOURCES.length, 'source keys are unique');
for (const s of WF_SOURCES) { const n = WF_ENTRIES.filter((e) => e.source === s.key).length;
  if (WF_EXCLUDED[s.key]) assert.equal(n, 0, `${s.key}: excluded (${WF_EXCLUDED[s.key]}) yet has a card`); else assert.equal(n, 1, `${s.key} (${s.name}): exactly one card, has ${n}`); }
for (const e of WF_ENTRIES) assert.ok(keys.has(e.source), `${e.id}: stands for a real tab workflow (${e.source})`);
for (const k of Object.keys(WF_EXCLUDED)) { assert.ok(keys.has(k), `excluded ${k} is a real tab workflow`); assert.ok(WF_EXCLUDED[k].length > 10, `${k}: a reason`); }
ok(`${WF_SOURCES.length} tab workflows: ${WF_ENTRIES.length} cards, ${Object.keys(WF_EXCLUDED).length} left out on purpose with a reason`);

// 2. server tools ↔ cards
const tools = listTools().filter((t: any) => t.status !== 'soon'); const used = new Set(WF_ENTRIES.map((e) => e.toolId));
for (const t of tools) assert.ok(used.has(t.id) || WF_TOOLS_EXCLUDED[t.id], `tool ${t.id} (${t.name}): a card or a reason in WF_TOOLS_EXCLUDED`);
for (const id of Object.keys(WF_TOOLS_EXCLUDED)) { assert.ok(getTool(id), `excluded tool ${id} exists`); assert.ok(!used.has(id), `excluded tool ${id} has no card`); }
for (const e of WF_ENTRIES) { assert.ok(getTool(e.toolId), `${e.id}: tool ${e.toolId} exists`);
  if (e.preset) assert.ok((getTool(e.toolId) as any).presets?.some((p: any) => p.id === e.preset), `${e.id}: preset ${e.preset} offered on ${e.toolId}`); }
ok(`${tools.length} tools: each has a card or a reason (${Object.keys(WF_TOOLS_EXCLUDED).length} excluded); every card's tool and preset exist`);

// 3. rows from the registry's tools, shaped like GET /api/tools (mock: every model runs)
const shaped = (status: string) => tools.map((t: any) => ({ id: t.id, presets: t.presets ?? [], app: t.app ?? {}, providers: [],
  models: toolModels(t.id).map((m: any) => ({ key: m.key, displayName: m.def.name, engines: m.parts.map((p: any) => p.engine), fromPrice: 0, runsOn: [{ id: 'local', status, credits: 0 }] })) }));
const live = shaped('ready'); const rows = WF_ENTRIES.map((e) => resolveRow(e, live as any, null)).filter(Boolean);
assert.equal(rows.length, WF_ENTRIES.length, `every entry has a row when everything runs (missing: ${WF_ENTRIES.filter((e) => !resolveRow(e, live as any, null)).map((e) => e.id).join(', ')})`);
assert.equal(new Set(rows.map((r: any) => r.e.id)).size, rows.length, 'one row per entry');
assert.ok(rows.every((r: any) => r.models.length > 0 || !(live.find((t) => t.id === r.e.toolId)!.models.length)), 'every row names a model when its tool has one');
ok(`${rows.length} rows from the registry, one per entry`);

// 4. what can't run is left out, with the reason; chains need every step
const off = live.map((t) => t.id === 'restyle' ? { ...t, models: t.models.map((m) => ({ ...m, runsOn: [{ id: 'local', status: 'unavailable' }, { id: 'comfy-cloud', status: 'coming-soon' }] })) } : t);
const e = WF_ENTRIES.find((x) => x.id === 'v-restyle')!;
assert.equal(resolveRow(e, off as any, null), null, 'Restyle with no model that can run here: no card'); assert.equal(whyHidden(e, off as any), 'no model of it can run on this computer');
assert.equal(whyHidden(e, live.filter((t) => t.id !== 'restyle') as any), 'not on this server', 'a tool that is gone: no card');
const fx = WF_ENTRIES.find((x) => x.id === 'fx-vanish')!; const noFx = live.map((t) => t.id === 'footage-fx' ? { ...t, presets: t.presets.filter((p: any) => p.id !== 'vanish') } : t);
assert.equal(whyHidden(fx, noFx as any), 'that effect is not offered here', 'an effect the tool dropped: no card');
const half = live.map((t) => t.id === 'voice' ? { ...t, models: t.models.map((m) => (m.key === 'translate-chatterbox' ? m : { ...m, runsOn: [{ id: 'local', status: 'unavailable' }] })) } : t);
const tr = resolveRow(WF_ENTRIES.find((x) => x.id === 'a-translate')!, half as any, null)!; assert.deepEqual(tr.models.map((m: any) => m.key), ['translate-chatterbox'], 'models that can’t run are not listed');
const gone = WF_ENTRIES.filter((x) => x.toolId !== 'h3-extend').map((x) => resolveRow(x, live as any, null)).filter(Boolean) as any[];
const shown = WF_CHAINS.filter((c) => c.steps.every((s) => gone.some((r) => r.e.id === s.entry))).map((c) => c.id);
assert.ok(!shown.includes('long-take') && shown.includes('presenter'), 'a chain with a missing step is hidden; the others stay');
ok('no card for what can’t run (reason given); a chain needs every step');
