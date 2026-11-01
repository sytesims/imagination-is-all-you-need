// The disabled "View workflow" tip (web/src/shared/workflowTip.ts, shared by the result view and the Canvas card panel) and the export's reason
// for a Comfy Router result (server/src/workflowExport.ts): a hosted result says it used a hosted model through Comfy Cloud (the same place
// its details name), then what does come with a workflow, so the two never contradict. Run: npx tsx test/workflow-export-tip.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_DATA_DIR ||= fs.mkdtempSync(path.join(os.tmpdir(), 'wf-tip-')); process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const { workflowTip, WORKFLOW_KINDS } = await import('../../web/src/shared/workflowTip.ts');
const { buildWorkflowExport } = await import('../src/workflowExport.ts');

// 1. the export for a Comfy Router result: no graph, "Comfy Cloud" as its place, an honest reason
const router = await buildWorkflowExport({ id: 'wf-tip-router', toolId: 'h3-video', provider: 'minimax-h3', route: 'comfy-router:no-such-partner', status: 'done', input: { prompt: 'x' } } as any);
assert.equal(router.available, false); assert.equal(router.ranOn.label, 'Comfy Cloud', 'the same place label as the result details');
assert.match(router.reason!, /hosted partner model through Comfy Cloud/); assert.doesNotMatch(router.reason!, /Comfy Router/);
const tipR = workflowTip(router, '')!;
assert.ok(tipR.startsWith(router.reason!) && tipR.endsWith(WORKFLOW_KINDS), tipR);
console.log('ok Comfy Router result:', tipR);

// 2. other places
const hosted = { available: false, headline: 'Not a ComfyUI workflow', reason: 'This ran on Replicate, not a ComfyUI workflow.' };
assert.equal(workflowTip(hosted, ''), `This ran on Replicate, not a ComfyUI workflow. ${WORKFLOW_KINDS}`, 'a lab or aggregator API');
assert.equal(workflowTip({ available: true, headline: 'x' }, ''), null, 'a local or Comfy Cloud workflow result: the button is on');
const hist = { available: false, headline: 'Historical workflow unavailable', reason: 'This H3 swap has no saved submitted graph.' };
assert.equal(workflowTip(hist, ''), hist.reason, 'a Comfy Cloud workflow result without its graph: only its reason, no "Comfy Cloud workflows include one"');
assert.equal(workflowTip({ available: false, headline: '' }, ''), 'No ComfyUI workflow was saved for this result.', 'no reason given');
assert.equal(workflowTip(null, ''), 'Checking…'); assert.match(workflowTip(null, 'not found')!, /no longer in your library/); assert.equal(workflowTip(null, 'HTTP 500'), 'The workflow couldn’t be loaded. HTTP 500');
// 3. both surfaces use the one helper (no copied sentence left)
for (const f of ['shared/ResultView.tsx', 'canvas/CardPanel.tsx']) { const src = fs.readFileSync(path.resolve(import.meta.dirname, '../../web/src', f), 'utf8');
  assert.match(src, /const wfDis = workflowTip\(wfInfo\.info, wfInfo\.err\);/, f); assert.doesNotMatch(src, /Only results made by open models/, f); }
console.log('ALL OK');
