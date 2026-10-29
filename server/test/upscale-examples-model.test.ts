// QA #18: the upscale Examples popup names the models it compares and follows the picked model.
// Real-ESRGAN / 4x-UltraSharp map to their example runs; SeedVR2 (or any other model) has none, so the popup says so instead of
// showing another model's example as if it were SeedVR2's. Run: npx tsx test/upscale-examples-model.test.ts  (no server)
import assert from 'node:assert/strict';
import { exampleModelOf, EXAMPLES_COMPARE, EXAMPLE_MODELS } from '../../web/src/tools/imageApps/upscaleExamplesData.ts';
const ok = (m: string) => console.log('ok ' + m);
assert.equal(EXAMPLES_COMPARE, 'Real-ESRGAN vs 4x-UltraSharp');
assert.equal(exampleModelOf('comfy-realesrgan'), 'realesrgan'); assert.equal(exampleModelOf('comfy-ultrasharp'), 'ultrasharp');
for (const p of ['router-seedvr2-upscale', 'comfy-seedvr2-image', 'fal-seedvr2-upscale', '', null, undefined]) assert.equal(exampleModelOf(p), null, String(p));
assert.equal(EXAMPLE_MODELS.ultrasharp.name, '4x-UltraSharp', 'same name as the model menu');
ok('examples: titled "Real-ESRGAN vs 4x-UltraSharp"; picked model maps to its example; SeedVR2 has none');
