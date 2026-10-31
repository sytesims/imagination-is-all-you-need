// Shared Video recipe → Canvas slots/quote → multipart submission, without a server or provider run.
import assert from 'node:assert/strict';
import { flowById, flowSpec, placeInputs, type GenCatalog } from '../../web/src/shared/genFlows.ts';
import { runForm, type BoardInput } from '../../web/src/canvas/cardModel.ts';
import { missingOf } from '../../web/src/canvas/cardState.ts';
import { placeOf } from '../../web/src/shared/queueActivity.ts';
import { compositeCostText } from '../../web/src/shared/billing.ts';
import { jobInputs } from '../../web/src/shared/jobInputs.ts';

const cat: GenCatalog = { recipes: [], models: {}, tools: [{ id: 'app-photos-to-reel', name: 'Photos → Reel',
  defaultProvider: 'comfy-camera', providers: [{ id: 'comfy-camera', name: 'Camera Moves' }], inputs: [], app: {} } as any] };
const flow = flowById('photos-to-reel')!;
const photo = (n: number): BoardInput => ({ key: String(n), kind: 'image', url: `/files/photo-${n}.png`, poster: '', jobId: '', label: `Photo ${n}` });
const make = (n: number, vals: Record<string, string> = { title: 'Weekend away' }, order?: BoardInput[]) => {
  const inputs = order ?? Array.from({ length: n }, (_, i) => photo(i + 1));
  const initial = flowSpec(flow, cat, { vals, filled: {} })!;
  const placed = placeInputs(initial.slots, inputs);
  const spec = flowSpec(flow, cat, { vals, filled: placed.bySlot })!;
  const form = runForm(spec, placed.bySlot, inputs, '', { projectId: null, boardId: 'reel', seed: 42 });
  return { inputs, placed, spec, form };
};

for (const n of [8, 15]) {
  const { inputs, placed, spec, form } = make(n, { title: 'Our hotel', endLine: 'See you soon', kind: 'hotel', seconds: '15', motion: 'all', music: 'off' });
  assert.equal(spec.quote.photoCount, String(n));
  assert.equal(spec.quote.seconds, '15');
  assert.equal(spec.quote.motion, 'all');
  assert.equal(spec.quote.music, 'off');
  assert.equal('title' in spec.quote, false, 'private title is not sent through the quote URL');
  assert.equal('endLine' in spec.quote, false, 'private end line is not sent through the quote URL');
  assert.equal(form.files.length, n);
  assert.ok(form.files.every(f => f.field === 'photos'));
  assert.deepEqual(form.files.map(f => f.input.key), inputs.map(i => i.key));
  assert.equal(form.fields.title, 'Our hotel');
  assert.equal(form.fields.endLine, 'See you soon');
  assert.equal(form.fields.kind, 'hotel');
  assert.equal(form.fields.seconds, '15');
  assert.equal(form.fields.music, 'off');
  assert.equal(form.fields.aspect, '9:16');
  assert.equal(missingOf(spec, placed.bySlot, ''), null);
}
{
  const reversed = Array.from({ length: 8 }, (_, i) => photo(8 - i));
  assert.deepEqual(make(8, { title: 'Ordered trip' }, reversed).form.files.map(f => f.input.key), ['8', '7', '6', '5', '4', '3', '2', '1']);
  const extra = make(16);
  assert.equal(extra.placed.extra.length, 1);
  assert.equal(extra.form.files.length, 15);
  assert.equal(extra.spec.quote.photoCount, '15');
}
for (const n of [0, 1, 7]) {
  const { spec, placed } = make(n);
  assert.match(missingOf(spec, placed.bySlot, '')!, /8–15 photos/);
  assert.equal(spec.quote.photoCount, String(n), 'incomplete selections never invent a billable count');
}
{
  const noTitle = make(8, { title: '   ' });
  assert.equal(missingOf(noTitle.spec, noTitle.placed.bySlot, ''), 'Add title');
  const defaults = make(8);
  assert.equal(defaults.form.fields.seconds, '30');
  assert.equal(defaults.form.fields.motion, 'heroes');
  assert.equal(defaults.form.fields.music, 'on');
  assert.equal(defaults.form.fields.endLine, undefined);
  const input = { photoUrls: ['/files/a.png', '/files/b.png', '/files/a.png'] };
  assert.deepEqual(jobInputs({ toolId: 'app-photos-to-reel', input } as any).map(i => i.url), input.photoUrls, 'viewer preserves repeated photos and ordering');
}
assert.equal(compositeCostText({ toolId: 'app-photos-to-reel', cost: 0 }), 'See step costs');
assert.equal(compositeCostText({ toolId: 'app-photos-to-reel', cost: 0, input: { reelCostText: 'Estimated $2.50 across steps' } }), 'Estimated $2.50 across steps');
assert.equal(compositeCostText({ toolId: 'app-photos-to-reel', cost: 0, simulated: true }), 'Sample');
assert.equal(compositeCostText({ toolId: 'camera', cost: 0 }), null);
assert.equal(placeOf(null, { toolId: 'app-photos-to-reel', price: { free: true, credits: 0, sample: false }, place: { runOn: null, label: '' } } as any).price, 'See step costs');
console.log('Photos → Reel Canvas contract: 8/15 inputs, order, settings, count, preflight and viewer passed');

// Browser-side Canvas imports keep runtime timers alive; all assertions above are synchronous.
process.exit(0);
