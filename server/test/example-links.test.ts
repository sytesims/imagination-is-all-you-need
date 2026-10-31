// Opening a showcase example from /workflows (2026-10-23): every shipped example's link (exampleHref) opens Create Image on its workflow, and what
// the bar fills (examplePrefill, the same function ImageCanvas runs) is a valid bar state for that workflow and model: the model is one the
// workflow (or plain Create) offers, every workflow value is one of its controls' options, plain Create's aspect / quality / resolution / count
// are ones the model offers (snapped like a model switch), the seed comes along, and nothing is dropped but what the workflow fixes itself.
// Run: npx tsx test/example-links.test.ts   (in-process, temp data dir, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'exlinks-')); process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const ok = (m: string) => console.log('ok ' + m);
const { SHOWCASE } = await import('../src/shared/showcase.ts');
const { exampleHref, examplePrefill } = await import('../src/shared/exampleLink.ts');
const { capsFor } = await import('../src/shared/imageCaps.ts'); const { featureById } = await import('../src/shared/imageFeatures.ts');
const { imageChoices } = await import('../src/shared/imageSnap.ts');
await import('../src/tools/apps.ts'); const { getTool } = await import('../src/tools/registry.ts');
const { imageWorkflowsPayload } = await import('../src/shared/workflows.ts');
const recipes: any[] = imageWorkflowsPayload(getTool as any).workflows;
const create: any = getTool('create-image'); assert.ok(create, 'create-image tool');

// ---- the link
assert.equal(exampleHref({ id: 'abc', workflow: 'create-image' }), '/image?showcase=abc');
assert.equal(exampleHref({ id: 'abc', workflow: 'character-sheet' }), '/image?workflow=character-sheet&showcase=abc');
ok('exampleHref: plain Create has no workflow=, a workflow keeps it (as presetHref)');

// ---- every shipped example → a valid bar state
const seen = new Set<string>();
for (const s of SHOWCASE) {
  const u = new URL(exampleHref(s), 'http://x'); assert.equal(u.pathname, '/image'); assert.equal(u.searchParams.get('showcase'), s.id, `${s.id}: showcase=`);
  if (s.workflow === 'create-image') {
    assert.equal(u.searchParams.get('workflow'), null, `${s.id}: no workflow=`);
    assert.ok(featureById('create-image')!.providers.includes(s.provider) && capsFor(s.provider), `${s.id}: ${s.provider} is a Create Image model with caps`);
    const caps = capsFor(s.provider); const ch = imageChoices(caps, { editing: false }); const f = examplePrefill(s, { caps });
    assert.equal(f.workflow, ''); assert.equal(f.provider, s.provider); assert.equal(f.prompt, s.prompt); assert.deepEqual(f.skipped, [], `${s.id}: every setting placed (${f.skipped})`);
    assert.ok(f.create && ch.aspects.includes(f.create.aspect), `${s.id}: aspect ${f.create?.aspect} offered by ${s.provider}`);
    if (ch.aspects.includes(String(s.settings.aspect))) assert.equal(f.create!.aspect, s.settings.aspect, `${s.id}: supported aspect kept`);
    assert.ok(ch.tiers.length ? ch.tiers.includes(f.create!.quality) : f.create!.quality === '', `${s.id}: quality ${f.create!.quality}`);
    assert.ok(ch.resList.length ? ch.resList.includes(f.create!.imageResolution) : f.create!.imageResolution === '', `${s.id}: resolution ${f.create!.imageResolution}`);
    assert.ok(f.create!.n >= 1 && f.create!.n <= ch.maxN, `${s.id}: count`);
  } else {
    assert.equal(u.searchParams.get('workflow'), s.workflow, `${s.id}: workflow=${s.workflow}`);
    const r = recipes.find((x) => x.id === s.workflow); assert.ok(r && r.status === 'ready', `${s.id}: ${s.workflow} is a ready workflow`);
    assert.ok(Object.values(r.models as Record<string, string[]>).some((ms) => ms.includes(s.provider)), `${s.id}: ${s.provider} runs ${s.workflow}`);
    const f = examplePrefill(s, { controls: r.controls }); assert.equal(f.workflow, s.workflow); assert.equal(f.provider, s.provider); assert.equal(f.create, null);
    for (const [k, v] of Object.entries(f.vals)) { const c = r.controls.find((x: any) => x.field === k); assert.ok(c, `${s.id}: ${k} is a control`);
      if (c.options?.length) assert.ok(c.options.some((o: any) => String(o.value) === v), `${s.id}: ${k}=${v} is offered`); }
    const fixed = r.controls.some((c: any) => c.field === 'aspect') ? [] : ['aspect', 'imageResolution', 'quality'];
    assert.ok(f.skipped.every((k) => fixed.includes(k)), `${s.id}: only what ${s.workflow} fixes itself is left out (${f.skipped})`);
    if (s.workflow === 'upscale') assert.equal(f.vals.scale, String(s.settings.scale).replace(/x$/i, ''), `${s.id}: "2x" → scale 2`);
    if (r.prompt.mode === 'hidden') assert.equal(s.prompt, '', `${s.id}: no prompt for ${s.workflow}`);
  }
  const f = examplePrefill(s); if (s.settings.seed != null) assert.equal(f.seed, Number(s.settings.seed), `${s.id}: seed`); else assert.equal(f.seed, null);
  seen.add(s.workflow);
}
ok(`${SHOWCASE.length} showcase examples open a valid bar state (${[...seen].join(', ')}): model offered, values offered, seed kept`);

// ---- unsupported settings snap (as a model switch does), and unknown workflow values stay out
{ const prov = featureById('create-image')!.providers.find((id: string) => { const a = imageChoices(capsFor(id), { editing: false }).aspects; return a.length && !a.includes('21:9'); });
  assert.ok(prov, 'a model without 21:9'); const caps = capsFor(prov);
  const f = examplePrefill({ id: 'x', workflow: 'create-image', provider: prov, prompt: 'p', settings: { aspect: '21:9', quality: 'ultra', imageResolution: '8K', n: 99 } }, { caps });
  const ch = imageChoices(caps, { editing: false });
  assert.ok(ch.aspects.includes(f.create!.aspect) && f.create!.aspect !== '21:9', `21:9 snapped to ${f.create!.aspect}`);
  assert.ok(!ch.tiers.length || ch.tiers.includes(f.create!.quality)); assert.ok(!ch.resList.length || ch.resList.includes(f.create!.imageResolution)); assert.equal(f.create!.n, ch.maxN); }
{ const up = recipes.find((x) => x.id === 'upscale'); const f = examplePrefill({ id: 'y', workflow: 'upscale', provider: 'comfy-nomos2', prompt: '', settings: { scale: '3x', nope: 1 } }, { controls: up.controls });
  assert.deepEqual(f.vals, {}); assert.deepEqual(f.skipped.sort(), ['nope', 'scale']); }
ok('unsupported aspect / quality / resolution / count snap to what the model offers; values a workflow lacks are left out');
