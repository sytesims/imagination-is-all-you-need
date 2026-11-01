// Workflow goals (2026-11-01, T1): server/src/shared/workflowGoals.ts. Seven goals, each with a label and a line; every workflow and every
// multi-step chain in exactly one goal; no goal for something that doesn't exist; a goal's words find its workflows in search.
// Run: npx tsx test/workflow-goals.test.ts
import assert from 'node:assert/strict';
process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const ok = (m: string) => console.log('ok ' + m);
const { WF_GOALS, GOAL_OF, goalOf, isGoal } = await import('../src/shared/workflowGoals.ts');
const { WF_ENTRIES, WF_CHAINS, matchesQuery, entryHay, chainHay } = await import('../src/shared/workflowCatalog.ts');

assert.deepEqual(WF_GOALS.map((g) => g.label), ['Make something new', 'Products & shop', 'Ads & social', 'People & voices', 'Stories & film', 'Music & sound', 'Fix & finish'], 'the seven goals, in page order');
assert.equal(new Set(WF_GOALS.map((g) => g.id)).size, WF_GOALS.length, 'unique goal ids');
for (const g of WF_GOALS) { assert.ok(g.line.length > 10 && /\.$/.test(g.line), `${g.id}: one plain line`); assert.doesNotMatch(`${g.label} ${g.line}`, /\bMac\b/, `${g.id}: plain words`); }
ok(`${WF_GOALS.length} goals with a label and a line each`);

const ids = [...WF_ENTRIES.map((e) => e.id), ...WF_CHAINS.map((c) => `chain:${c.id}`)];
const missing = ids.filter((id) => !goalOf(id)); assert.deepEqual(missing, [], `every workflow and chain has a goal (add a line to GOAL_OF): ${missing.join(', ')}`);
const known = new Set(ids); const stray = Object.keys(GOAL_OF).filter((id) => !known.has(id)); assert.deepEqual(stray, [], `no goal for a workflow that doesn't exist: ${stray.join(', ')}`);
for (const [id, g] of Object.entries(GOAL_OF)) assert.ok(isGoal(g), `${id}: a known goal (${g})`);
ok(`${ids.length} workflows and chains, one goal each (${WF_GOALS.map((g) => `${g.id} ${Object.values(GOAL_OF).filter((x) => x === g.id).length}`).join(', ')})`);

for (const g of WF_GOALS) assert.ok(Object.values(GOAL_OF).includes(g.id), `${g.id}: holds at least one workflow`);
const find = (q: string) => WF_ENTRIES.filter((e) => matchesQuery(entryHay(e), q)).map((e) => e.id);
assert.ok(find('shop').includes('i-try-on') && find('shop').includes('i-material-swap'), 'a goal word finds its workflows');
assert.ok(find('ads social').includes('v-reframe'), 'Ads & social finds Reframe');
assert.ok(WF_CHAINS.filter((c) => matchesQuery(chainHay(c), 'people voices')).some((c) => c.id === 'presenter'), 'a goal finds its chains');
ok('goal words find their workflows and chains in search');
