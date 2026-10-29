// MiniMax H3 aspect labels (2026-10-27): every route that fills ComfyUI's ResolutionSelector sends one of the node's own options.
// Bug: plans.ts sent "9:16 (Portrait)", which Comfy Cloud refuses (its option is "9:16 (Portrait Widescreen)"). Checked against the saved
// Comfy Cloud object_info (fixtures/object-info-h3-fast-cloud-2026-10-26.json, ResolutionSelector) for local H3, the Comfy Cloud twin and
// H3 Fast, in every mode and aspect. In-process, no network. Run: npx tsx test/h3-aspect-labels.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import zlib from 'node:zlib';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'h3aspect-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const { buildPlan } = await import('../src/comfy/plans.ts');
const { buildCloudPlan } = await import('../src/comfy/cloudWorkflows.ts');
const { H3F_PROVIDER } = await import('../src/comfy/h3FastCloud.ts');
const { RESOLUTION_SELECTOR_ASPECTS, resolutionSelectorAspect } = await import('../src/comfy/resolutionSelector.ts');
const { checkCloudGraph } = await import('../src/comfy/cloudGraphCheck.ts');
const OI = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'object-info-h3-fast-cloud-2026-10-26.json'), 'utf8'));
const cloudOptions: string[] = OI.ResolutionSelector.input.required.aspect_ratio[1].options;
assert.deepEqual([...RESOLUTION_SELECTOR_ASPECTS], cloudOptions, 'our list is Comfy Cloud\'s, word for word');
// An optional full saved Cloud object_info can corroborate the mandatory bundled-fixture check above.
const FULL = process.env.MODEL_HEALTH_OBJECT_INFO;
if (FULL) { assert.ok(fs.existsSync(FULL), 'MODEL_HEALTH_OBJECT_INFO must name an existing gzip snapshot'); assert.deepEqual(JSON.parse(zlib.gunzipSync(fs.readFileSync(FULL)).toString()).ResolutionSelector.input.required.aspect_ratio[1].options, cloudOptions); }
assert.equal(resolutionSelectorAspect('9:16'), '9:16 (Portrait Widescreen)'); assert.equal(resolutionSelectorAspect('16:9'), '16:9 (Widescreen)'); assert.equal(resolutionSelectorAspect('1:1'), '1:1 (Square)');
assert.equal(resolutionSelectorAspect('auto'), '16:9 (Widescreen)'); assert.equal(resolutionSelectorAspect(undefined), '16:9 (Widescreen)');

const IMG = path.join(D, 'f.png'); fs.writeFileSync(IMG, 'x');
const WANT: Record<string, string> = { '16:9': '16:9 (Widescreen)', '9:16': '9:16 (Portrait Widescreen)', '1:1': '1:1 (Square)', auto: '16:9 (Widescreen)' };
const labels = (g: Record<string, any>) => Object.values<any>(g).filter((n) => n?.class_type === 'ResolutionSelector').map((n) => n.inputs.aspect_ratio);
let n = 0;
for (const [route, provider, build, modes] of [
  ['local ComfyUI', 'comfy-h3', buildPlan, ['t2v', 'i2v', 'r2v']],
  ['Comfy Cloud twin', 'cloud-h3-wf', buildCloudPlan, ['t2v', 'i2v']],
  ['H3 Fast on Comfy Cloud', H3F_PROVIDER, buildCloudPlan, ['t2v']],
] as const) {
  for (const mode of modes) for (const aspect of Object.keys(WANT)) {
    const input: any = { mode, prompt: 'a lighthouse at dusk', duration: 5, seed: 3, aspect, resolution: '768p', ...(mode !== 't2v' ? { imagePath: IMG, refPaths: [IMG] } : {}) };
    const p = (build as any)({ id: 'x', toolId: 'h3-video', provider, input }); const ls = p.passes.flatMap((ps: any) => labels(ps.graph));
    assert.ok(ls.length, `${route} ${mode}: has a ResolutionSelector`);
    for (const l of ls) { assert.ok(cloudOptions.includes(l), `${route} ${mode} ${aspect}: "${l}" is one of the node's options`); assert.equal(l, WANT[aspect], `${route} ${mode} ${aspect}`); n++; }
    if (provider !== 'comfy-h3') for (const ps of p.passes) assert.ok(!checkCloudGraph(ps.graph, OI).errors.some((e: string) => /aspect_ratio/.test(e)), `${route} ${mode} ${aspect}: Cloud's own check passes the aspect`);
  }
}
console.log(`ok ${n} ResolutionSelector labels on local H3 (t2v/i2v/r2v), the Comfy Cloud twin (t2v/i2v) and H3 Fast (t2v) are Cloud's options; 9:16 = "9:16 (Portrait Widescreen)"`);
console.log('h3-aspect-labels: all ok');
process.exit(0);
