// No server or real provider calls: navigation, discovery, request guards and historical provenance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swap-consolidation-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: dir, OPENHIGGSFIELD_ENV_FILE: path.join(dir, 'unused.env'), OPENHIGGSFIELD_BACKEND: 'mock' });
globalThis.fetch = (async () => { throw new Error('No network in consolidation tests'); }) as typeof fetch;
await import('../src/tools/apps.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { VIDEO_WORKFLOWS, VIDEO_PAGE, videoRedirect, videoWorkflowHref } = await import('../src/shared/videoWorkflows.ts');
const { WF_ENTRIES } = await import('../src/shared/workflowCatalog.ts');
const { inVideoFeed, videoWorkflowNameOf } = await import('../src/shared/videoFeed.ts');
const { toolModels, resolveModelRequest, jobModelFields } = await import('../src/routing/modelRegistry.ts');
const { recreateHref } = await import('../../web/src/shared/workflowLinks.ts');

assert.equal(VIDEO_WORKFLOWS.find(w => w.id === 'object-swap')?.name, 'Object / Person Swap');
assert.ok(!VIDEO_WORKFLOWS.some(w => w.id === 'two-person-swap'));
assert.ok(!WF_ENTRIES.some(w => w.toolId === 'two-person-swap'));
assert.equal(WF_ENTRIES.find(w => w.toolId === 'object-swap')?.name, 'Swap in a clip'); // plain page name (Workflows copy pass)
assert.equal(WF_ENTRIES.find(w => w.toolId === 'object-swap')?.tabName, 'Object / Person Swap'); // the Video menu name stays
assert.equal(getTool('two-person-swap')?.listed, false);
assert.equal(getTool('two-person-swap')?.name, 'Swap Two People');
assert.equal(videoWorkflowHref('two-person-swap'), `${VIDEO_PAGE}?workflow=object-swap`);
for (const p of ['/tools/two-person-swap', '/tools/edit-video/two-person-swap', VIDEO_PAGE]) {
  const prefix = p === VIDEO_PAGE ? 'workflow=two-person-swap&' : '';
  assert.equal(videoRedirect(p, `?${prefix}model=minimax-h3-character-swap`, '#clip'), `${VIDEO_PAGE}?workflow=object-swap&model=minimax-h3-character-swap#clip`);
  assert.equal(videoRedirect(p, `?${prefix}recreate=old`, '#clip'), p === VIDEO_PAGE ? null : `${VIDEO_PAGE}?workflow=two-person-swap&recreate=old#clip`);
}
const old = { id: 'old', toolId: 'two-person-swap', provider: 'cloud-h3-two-swap', route: 'comfy-cloud:cloud-h3-two-swap', input: { personAPath: 'a.png', personBPath: 'b.png', outKind: 'video' }, outputs: [] };
const before = structuredClone(old);
assert.equal(recreateHref(old), `${VIDEO_PAGE}?workflow=two-person-swap&recreate=old`);
assert.equal(videoWorkflowNameOf(old), 'Swap Two People');
for (const feed of ['all', 'two-person-swap', 'group:swap', 'group:edit', 'edit-video']) assert.ok(inVideoFeed(old, feed), feed);
assert.equal(jobModelFields(old as any).modelKey, 'minimax-h3-character-swap');
assert.deepEqual(old, before, 'reading historical metadata never rewrites the run');

const motion = getTool('motion-transfer')!;
assert.ok(!motion.providers.includes('comfy-h3-charswap'));
for (const id of ['router-kling-edit', 'router-seedance-25-edit', 'comfy-open', 'cloud-wan-animate2']) assert.ok(motion.providers.includes(id), id);
assert.ok(!toolModels(motion).some(m => m.key === 'minimax-h3-character-swap'), 'model grouping cannot reintroduce H3');
assert.ok(toolModels('object-swap').some(m => m.key === 'minimax-h3-character-swap'));
for (const req of [{ provider: 'comfy-h3-charswap' }, { provider: 'cloud-h3-charswap' }, { model: 'comfy-h3-charswap' }, { model: 'minimax-h3-character-swap' }, { route: 'local:comfy-h3-charswap' }, { route: 'comfy-cloud:cloud-h3-charswap' }]) {
  const r = resolveModelRequest(motion, req); assert.ok(!r.ok); if (!r.ok) { assert.equal(r.code, 'motion_model_unavailable'); assert.match(r.error, /Object \/ Person Swap/); }
}
assert.equal(resolveModelRequest('object-swap', { provider: 'comfy-h3-charswap' }).ok, true);
assert.equal(jobModelFields({ ...old, toolId: 'motion-transfer', provider: 'comfy-h3-charswap', route: 'comfy-cloud:cloud-h3-charswap' } as any).modelKey, 'minimax-h3-character-swap', 'old H3 motion jobs keep model provenance');
console.log('ok consolidated discovery, old links, historical names/inputs, scoped H3 motion guard');
