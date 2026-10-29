// Enhance rules (QA #5, 2026-10-23): the words Enhance adds to an image prompt follow the prompt. Skin texture only for people, a light only
// when the prompt names none (light, a time of day, a light source), product detail for products, nothing about skin for landscapes.
// @mentions and #tags stay as written. Video / audio keep their fixed lists. Run: npx tsx test/enhance-rules.test.ts (pure, no server)
import assert from 'node:assert/strict';
import { enhanceRules } from '../src/cinema/enhance.ts';
const ok = (m: string) => console.log('ok ' + m);
const has = (p: string, w: string) => enhanceRules(p).added.includes(w);

{ // landscape: no skin, a light added when none is named
  const r = enhanceRules('a misty mountain valley with a river');
  assert.ok(!r.added.includes('natural skin texture'), r.prompt); assert.ok(r.added.includes('soft directional light'), r.prompt); assert.ok(r.added.includes('highly detailed'));
  ok(`landscape → ${r.added.join(', ')}`); }
{ // product: product detail + studio light, no skin
  const r = enhanceRules('a glass perfume bottle on a marble counter');
  assert.ok(r.added.includes('crisp product detail'), r.prompt); assert.ok(!r.added.includes('natural skin texture')); assert.ok(!r.added.includes('highly detailed'));
  assert.ok(r.added.includes('soft even studio light'));
  // Product Shot's composed prompt already names its light: nothing about light is added
  const ps = enhanceRules('product photo of a ceramic mug; on a seamless white studio backdrop, soft even key light, gentle floor shadow');
  assert.ok(!ps.added.some((w) => /light/.test(w)), ps.prompt); assert.ok(ps.added.includes('crisp product detail'));
  ok(`product → ${r.added.join(', ')}`); }
{ // night scene: the prompt's own light is kept, no soft directional light, no skin
  for (const p of ['a city street at night', 'a harbour under moonlight', 'a bar lit by neon signs', 'a cabin at dusk', 'a candle on a table', 'backlit trees at sunrise', 'a stage with dramatic lighting', 'rim light on a motorbike'])
    assert.ok(!enhanceRules(p).added.some((w) => /light/.test(w)), `${p} → ${enhanceRules(p).prompt}`);
  assert.ok(!has('a city street at night', 'natural skin texture'));
  ok('night / light-source prompts get no added light'); }
{ // portrait: skin texture + a light
  const r = enhanceRules('portrait of an old fisherman');
  assert.ok(r.added.includes('natural skin texture'), r.prompt); assert.ok(r.added.includes('soft directional light'));
  for (const p of ['a woman reading', 'two kids playing football', 'a selfie of a man in a cafe', 'a fashion model on a runway']) assert.ok(has(p, 'natural skin texture'), p);
  assert.ok(!has('portrait of a woman, visible skin pores', 'natural skin texture'), 'skin already named → not added twice');
  ok(`portrait → ${r.added.join(', ')}`); }
{ // golden hour: a person keeps skin texture but gets no added light
  const r = enhanceRules('a woman walking on the beach at golden hour');
  assert.ok(r.added.includes('natural skin texture')); assert.ok(!r.added.some((w) => /light/.test(w)), r.prompt);
  assert.ok(!has('a lighthouse at golden hour', 'soft directional light'));
  ok(`golden hour → ${r.added.join(', ')}`); }
{ // @mentions / #tags kept as written and never taken for a person or a light
  const r = enhanceRules('@image1 in a red coat #push-in');
  assert.ok(r.prompt.startsWith('@image1 in a red coat #push-in, '), r.prompt); assert.ok(!r.added.includes('natural skin texture'), r.prompt);
  assert.ok(has('@light on a table', 'soft directional light'), '@light is a mention, not a light');
  ok('@mentions and #tags kept; a mention alone adds no skin'); }
{ // words the prompt already covers are not repeated; video / audio unchanged
  const r = enhanceRules('a sharp, highly detailed macro of a beetle, centred composition');
  assert.ok(!r.added.includes('sharp focus') && !r.added.includes('highly detailed') && !r.added.includes('balanced composition'), r.prompt);
  assert.deepEqual(enhanceRules('a man running', 'video').added, ['cinematic', 'smooth natural motion', 'consistent subject identity', 'motivated lighting', 'shallow depth of field']);
  assert.deepEqual(enhanceRules('a calm voice', 'audio').added, ['clean mix', 'well-balanced levels', 'clear dynamics']);
  assert.equal(enhanceRules('').prompt.split(', ')[0], 'A striking subject in a well-composed scene');
  ok('no repeats; video and audio lists unchanged'); }
console.log('ALL OK enhance-rules');
