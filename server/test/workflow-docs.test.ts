// docs/WORKFLOWS.md (2026-11-02): generated from the app's own catalogue by server/scripts/gen-workflow-docs.ts. Regenerates it in memory and
// fails when the committed file is out of date; every workflow and chain the shared count counts (shared/workflowCount.ts) is in it exactly
// once; every relative link points at a file in the repo and every in-page link at an entry. Fix a failure with: npm run docs:workflows
// Run: npx tsx test/workflow-docs.test.ts   (in-process, mock backend, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
const { render, OUT } = await import('../scripts/gen-workflow-docs.ts');
const { WF_ENTRIES, WF_CHAINS } = await import('../src/shared/workflowCatalog.ts');
const { workflowCounts } = await import('../src/shared/workflowCount.ts');
const ok = (m: string) => console.log('ok ' + m);
const ROOT = path.resolve(import.meta.dirname, '../..');

const md = render();
assert.ok(fs.existsSync(OUT), 'docs/WORKFLOWS.md exists (npm run docs:workflows)');
assert.equal(fs.readFileSync(OUT, 'utf8'), md, 'docs/WORKFLOWS.md is out of date: run npm run docs:workflows');
ok('docs/WORKFLOWS.md matches the code');

// every card once: the catalogue's workflows, the bundled plugins with a tab, the chains = the README's number
const ids = [...md.matchAll(/<a id="([^"]+)"><\/a>/g)].map((m) => m[1]);
assert.equal(new Set(ids).size, ids.length, 'no entry twice');
for (const e of WF_ENTRIES) assert.ok(ids.includes(e.id), `${e.id} is documented`);
for (const c of WF_CHAINS) assert.ok(ids.includes(`chain-${c.id}`), `chain ${c.id} is documented`);
const pluginTabs = fs.readdirSync(path.join(ROOT, 'plugins'), { withFileTypes: true }).filter((d) => d.isDirectory())
  .map((d) => path.join(ROOT, 'plugins', d.name, 'plugin.json')).filter((f) => fs.existsSync(f)).map((f) => String(JSON.parse(fs.readFileSync(f, 'utf8')).tab ?? '')).filter(Boolean);
assert.equal(ids.length, workflowCounts(pluginTabs).cards, 'one entry per card the Workflows tab counts');
ok(`${ids.length} entries, each once (${WF_ENTRIES.length} catalogue + ${pluginTabs.length} plugin + ${WF_CHAINS.length} chains)`);

// every link resolves: files in the repo, anchors on the page
const links = [...md.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
let files = 0, anchors = 0;
for (const l of links) {
  if (/^https?:\/\//.test(l)) continue;
  if (l.startsWith('#')) { anchors++; if (['image', 'video', 'audio', '3d', 'step-by-step'].includes(l.slice(1))) continue; assert.ok(ids.includes(l.slice(1)), `in-page link ${l}`); continue; }
  files++; assert.ok(fs.existsSync(path.resolve(ROOT, 'docs', l.split('#')[0])), `linked file ${l}`);
}
ok(`${files} file links and ${anchors} in-page links resolve`);

// plain words: no private paths
assert.ok(!/\/Users\/|\/home\/|C:\\/.test(md), 'no local paths');
ok('no local paths');
