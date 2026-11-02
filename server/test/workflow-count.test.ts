// The one workflow count (2026-11-02): the Workflows tab's header and "Everything" filter, the README and the submission README all use
// shared/workflowCount.ts, and the tab lists every workflow and chain once (workflowCatalog.ts workflowPageSections), so the count it shows
// on a setup that runs them all is that same number. Run: npx tsx test/workflow-count.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
const { WF_ENTRIES, WF_CHAINS, WF_PAGE_ALL, workflowPageSections } = await import('../src/shared/workflowCatalog.ts');
const { WF_START_HERE } = await import('../src/shared/workflowGoals.ts');
const { workflowCounts, countLine } = await import('../src/shared/workflowCount.ts');
const ok = (m: string) => console.log('ok ' + m);
const ROOT = path.resolve(import.meta.dirname, '../..');

// the count is the catalogue: every ready-made workflow by medium, then the chains
const c = workflowCounts();
assert.equal(c.workflows, WF_ENTRIES.length); assert.equal(c.chains, WF_CHAINS.length); assert.equal(c.cards, WF_ENTRIES.length + WF_CHAINS.length);
assert.equal(c.image + c.video + c.audio + c.three, c.workflows, 'the media add up');
assert.ok(c.workflows >= 60, `over sixty ready-made workflows (${c.workflows})`);
ok(`${c.workflows} workflows (${c.image} image, ${c.video} video, ${c.audio} audio, ${c.three} 3D) + ${c.chains} chains = ${c.cards}`);

// the tab: Start here + every goal's section hold each workflow and chain exactly once, so "Everything" (the sections plus the plugins)
// equals the shared count with the bundled plugins
const { start, goals } = workflowPageSections();
const ids = [...start, ...goals.flatMap((g) => g.ids)];
assert.equal(new Set(ids).size, ids.length, 'no card twice');
assert.deepEqual([...ids].sort(), [...WF_ENTRIES.map((e) => e.id), ...WF_CHAINS.map((x) => `chain:${x.id}`)].sort(), 'every workflow and chain is on the tab');
assert.deepEqual(WF_PAGE_ALL, ids); assert.deepEqual(start, WF_START_HERE, 'Start here first, in its order');
const plugins = fs.readdirSync(path.join(ROOT, 'plugins'), { withFileTypes: true }).filter((d) => d.isDirectory())
  .map((d) => path.join(ROOT, 'plugins', d.name, 'plugin.json')).filter((f) => fs.existsSync(f)).map((f) => String(JSON.parse(fs.readFileSync(f, 'utf8')).tab ?? '')).filter(Boolean);
assert.equal(ids.length + plugins.length, workflowCounts(plugins).cards, 'Everything = the shared count, plugins included');
ok(`the tab lists ${ids.length} cards + ${plugins.length} bundled plugin(s) = ${workflowCounts(plugins).cards}, the README's number`);

// a section keeps only what runs here (has), still each once
const half = new Set(ids.filter((_, i) => i % 2 === 0)); const s2 = workflowPageSections((id) => half.has(id));
assert.equal(s2.start.length + s2.goals.reduce((a, g) => a + g.ids.length, 0), half.size);
ok('a setup that runs fewer shows fewer, each once');

// the header's words
assert.equal(countLine(69, 8), '77 ways to start: 69 workflows and 8 step by step.');
assert.equal(countLine(1, 0), '1 way to start: 1 workflow.'); assert.equal(countLine(0, 0), '');
ok('header line');
