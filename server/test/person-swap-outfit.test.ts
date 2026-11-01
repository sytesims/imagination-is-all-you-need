// Person Swap's Outfit choice (2026-11-01): "Use the person's outfit" (default, the swap as before) or "Keep the photo's outfit" (only who the
// person is changes). Covers: the exact prompt for both choices (the registry's person-swap rows: GPT Image, Nano Banana, the shared row), a job without the field runs as before (old jobs,
// Recreate), an unknown value is refused, the choice is stored for Recreate, and the newer 2+ image models are offered.
// Run: npx tsx test/person-swap-outfit.test.ts   (in-process, temp data dir, mock backend, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'person-swap-outfit-')); process.env.OPENHIGGSFIELD_DATA_DIR = D; process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const ok = (m: string) => console.log('ok ' + m);
const { getTool } = await import('../src/tools/registry.ts');
const { TWO_IMAGE_MODELS } = await import('../src/shared/imageFeatures.ts');
try {
  const png = fs.readFileSync(path.resolve(import.meta.dirname, '../samples/sample-character.png'));
  fs.writeFileSync(path.join(D, 'target.png'), png); fs.writeFileSync(path.join(D, 'person.png'), png);
  const t = getTool('app-person-swap')!; const files = { image: ['target.png'], person: ['person.png'] };
  const run = (f: Record<string, string>) => t.parseInput({ prompt: '', ...f }, files) as Promise<any>;
  // 2026-11-01: both choices go through the registry's person-swap rows (GPT Image, Nano Banana, else the shared row)
  const GPT = (who: string, keep = '') => `Image 1: the photo to keep. Image 2: the person to put in it. Replace only the person in image 1 with the person from image 2: their ${who}.${keep} Do not change the pose, framing, camera angle, lighting, colours or background of image 1. Match its light and grain.`;
  const NB = (who: string, keep = '') => `Using the provided images, replace the person in image 1 with the person from image 2: their ${who}.${keep} Keep everything else in image 1 exactly the same: the pose, framing, camera angle, lighting, colours and background. The new person takes on the light and grain of image 1.`;
  const ANY = (who: string, keep = '') => `Replace the person in image 1 with the person from image 2: their ${who}.${keep} Keep the pose, framing, camera angle, lighting, colours and background of image 1 unchanged, and match its light and grain.`;
  const OUTFIT = ' Keep the outfit and accessories of image 1 (glasses, sunglasses, jewellery, bags), refitted naturally to their body.';
  for (const [provider, W] of [['api-gpt-image-25-flare', GPT], ['api-nano-banana', NB], ['api-seedream', ANY]] as const) {
    const SWAP = W('face, hair, body and outfit'); const KEEP = W('face, hair, skin tone and body shape', OUTFIT);
    assert.ok(!/image 1's/.test(SWAP + KEEP), 'no possessive on a reference (tag models would read <image1>\'s)');
    assert.equal((await run({ provider })).prompt, SWAP, `${provider}: no outfit sent = the person's outfit`);
    assert.equal((await run({ provider, outfit: 'person' })).prompt, SWAP);
    const k = await run({ provider, outfit: 'keep' }); assert.equal(k.prompt, KEEP, `${provider}: keep outfit`); assert.equal(k.appFields.outfit, 'keep', 'stored for Recreate');
  }
  ok('prompt: default and "person" = the person\'s outfit; "keep" = keep-outfit wording; GPT Image, Nano Banana and the shared row; stored for Recreate');
  assert.match((await run({ provider: 'api-nano-banana', outfit: 'keep', prompt: 'the woman on the left' })).prompt, /light and grain of image 1\. The woman on the left\.$/, 'touch-ups last, as a sentence');
  const bad = await run({ provider: 'api-nano-banana', outfit: 'pyjamas' }); assert.equal(bad.issues?.[0]?.field, 'outfit', JSON.stringify(bad));
  ok('touch-ups follow the keep list; an unknown outfit is refused');
  for (const m of ['api-gpt-image-25-flare', 'api-gpt-image-25-sunburst', 'api-nano-banana-21', 'api-nano-banana-pro', 'api-flux3-image']) {
    assert.ok(TWO_IMAGE_MODELS.includes(m), m); assert.ok(t.providers.some((p: any) => (typeof p === 'string' ? p : p.id) === m), `${m} offered`); }
  assert.equal(TWO_IMAGE_MODELS[1], 'api-nano-banana', 'the list order (and so the default) is unchanged'); ok('the newer 2+ image models are offered; order unchanged');
} finally { fs.rmSync(D, { recursive: true, force: true }); }
