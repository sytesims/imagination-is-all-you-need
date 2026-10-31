// Existing 3D recipe → Canvas inputs / quote → named multipart fields. No provider or browser run.
import assert from 'node:assert/strict';
import { flowById, flowSpec, placeInputs, availableFlows, type GenCatalog } from '../../web/src/shared/genFlows.ts';
import { recipeFor } from '../../web/src/shared/threeDRecipe.ts';
import { runForm, type BoardInput } from '../../web/src/canvas/cardModel.ts';
import { missingOf } from '../../web/src/canvas/cardState.ts';
import { workflowRecreateHref } from '../../web/src/shared/workflowLinks.ts';
import { THREE_D_WORKFLOWS, threeDModel } from '../src/shared/threeD.ts';

const cat: GenCatalog = { recipes: [], models: {}, tools: [{ id: 'three-d', defaultProvider: 'fal-trellis2', inputs: [], providers: [
  { id: 'fal-trellis2', name: 'TRELLIS.2' }, { id: 'cloud-tripo-31', name: 'Tripo 3.1' }
] } as any] };
const photo = (key: string): BoardInput => ({ key, kind: 'image', url: `/files/${key}.png`, poster: '', jobId: '', label: key });
const make = (id: string, inputs: BoardInput[], pins: Record<string, string> = {}) => {
  const flow = flowById(id)!;
  const first = flowSpec(flow, cat, { provider: 'fal-trellis2', filled: {} })!;
  const placed = placeInputs(first.slots, inputs, pins);
  const spec = flowSpec(flow, cat, { provider: 'fal-trellis2', filled: placed.bySlot })!;
  return { spec, placed, form: runForm(spec, placed.bySlot, inputs, 'A small ceramic owl', { projectId: null, boardId: '3d', seed: 42 }) };
};
for (const id of ['image-to-3d', 'text-to-3d', 'multiview-to-3d']) {
  assert.ok(availableFlows(cat).some(f => f.id === id));
  const wf = THREE_D_WORKFLOWS.find(w => w.id === id)!;
  const recipe = recipeFor(threeDModel('cloud-tripo-31'), wf);
  assert.equal(recipe.modes.default, id);
  assert.equal(recipe.prompt.mode, id === 'text-to-3d' ? 'required' : 'hidden');
  assert.deepEqual(recipe.controls.map(c => c.field), ['detail', 'faces', 'texture']);
  assert.equal(workflowRecreateHref({ id: 'result', toolId: 'three-d', input: { types: [id] } }), `/3d?workflow=${id}&recreate=result`);
}
const text = make('text-to-3d', []);
assert.equal(text.spec.provider, 'cloud-tripo-31');
assert.deepEqual(text.spec.providers.map(p => p.id), ['cloud-tripo-31']);
assert.equal(text.spec.slots.length, 0);
assert.equal(missingOf(text.spec, {}, '  '), 'Write a prompt');
assert.equal(missingOf(text.spec, {}, 'An owl'), null);
assert.equal(text.form.fields.prompt, 'A small ceramic owl');
assert.equal(text.form.fields.types, '["text-to-3d"]');
assert.equal(text.spec.quote.types, 'text-to-3d');
assert.equal(text.spec.quote.prompt, undefined, 'Typed text does not change the price');
assert.equal(text.spec.quote.image, undefined);
assert.equal(text.form.files.length, 0);
for (const n of [2, 3, 4]) {
  const multi = make('multiview-to-3d', Array.from({ length: n }, (_, i) => photo(String(i))));
  assert.equal(multi.spec.provider, 'cloud-tripo-31');
  assert.deepEqual(multi.spec.slots.map(s => s.label), ['Front', 'Left', 'Back', 'Right']);
  assert.equal(missingOf(multi.spec, multi.placed.bySlot, ''), null);
  assert.deepEqual(multi.form.files.map(f => f.field), ['image', 'image_left', 'image_back', 'image_right'].slice(0, n));
  assert.deepEqual(multi.form.files.map(f => f.input.key), Array.from({ length: n }, (_, i) => String(i)));
  for (const f of multi.form.files) assert.equal(multi.spec.quote[f.field], '1');
  assert.equal(multi.spec.quote.types, 'multiview-to-3d');
  assert.equal(multi.form.fields.types, '["multiview-to-3d"]');
  assert.equal(multi.form.fields.prompt, undefined);
  assert.equal(multi.form.fields.format, 'glb');
}
const one = make('multiview-to-3d', [photo('front')]);
assert.match(missingOf(one.spec, one.placed.bySlot, '')!, /second view/);
const rightOnly = make('multiview-to-3d', [photo('front'), photo('right')], { front: 'image', right: 'image_right' });
assert.equal(missingOf(rightOnly.spec, rightOnly.placed.bySlot, ''), null, 'Any additional view satisfies the minimum');
assert.deepEqual(rightOnly.form.files.map(f => f.field), ['image', 'image_right']);
assert.equal(rightOnly.spec.quote.image_left, undefined);
assert.equal(make('multiview-to-3d', Array.from({ length: 5 }, (_, i) => photo(String(i)))).placed.extra.length, 1);
const image = make('image-to-3d', [photo('front')]);
assert.equal(image.spec.provider, 'fal-trellis2');
assert.deepEqual(image.form.files.map(f => f.field), ['image']);
console.log('3D UI contract passed: prompt, named views, minimum, model filtering, quote, submit and recreate.');
process.exit(0);
