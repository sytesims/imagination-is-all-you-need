// Cleanroom licence add-ons (Oct 18): SAM 3.1 (SAM License) on the Object Swap mask preview; one name for cloud-h3 ('MiniMax H3 · Comfy Cloud').
// Run: npx tsx test/licences-1018.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_DATA_DIR ||= fs.mkdtempSync(path.join(os.tmpdir(), 'lic18-'));
await import('../src/tools/registry.js');
const { LICENSES, LICENSE_COMPONENTS } = await import('../src/licenses.js'); const { buildLicenseReport, licensesMarkdown } = await import('../src/licensesReport.js');
const sam = LICENSES['sam-license']; assert.equal(sam.name, 'SAM License'); assert.equal(sam.url, 'https://github.com/facebookresearch/sam3/blob/main/LICENSE');
assert.ok(sam.terms!.some((t) => /royalty-free/i.test(t)) && sam.terms!.some((t) => /licence text/i.test(t)) && sam.terms!.some((t) => /ITAR/.test(t) && /military/.test(t)));
const c = LICENSE_COMPONENTS['object-swap'].find((x) => /sam3\.1_multiplex_fp16/.test(x.model)); assert.ok(c); assert.equal(c!.licenseId, 'sam-license');
const r: any = buildLicenseReport(); assert.ok(r.components['object-swap'].some((x: any) => /SAM 3\.1/.test(x.model))); assert.match(licensesMarkdown(r), /SAM 3\.1 \(sam3\.1_multiplex_fp16\) · mask preview \| SAM License/);
const repo = path.resolve(import.meta.dirname, '../..');
assert.match(fs.readFileSync(path.join(repo, 'docs/ATTRIBUTION.md'), 'utf8'), /SAM 3\.1.*SAM License.*ITAR/); assert.match(fs.readFileSync(path.join(repo, 'workflows/LICENSES.md'), 'utf8'), /SAM 3\.1 \(sam3\.1_multiplex_fp16\).*SAM License/);
assert.match(fs.readFileSync(path.join(repo, 'openapi.json'), 'utf8'), /\\"sam3\.1\\"/); assert.doesNotMatch(fs.readFileSync(path.join(repo, 'openapi.json'), 'utf8'), /\\"sam3\\"/);
console.log('ok SAM 3.1 / SAM License: licences.ts entry with terms, Object Swap mask-preview component, LICENSES.md + ATTRIBUTION.md + workflows/LICENSES.md, openapi engine sam3.1');
const { MODEL_CATALOG } = await import('../src/shared/modelCatalog.js'); assert.equal(MODEL_CATALOG['cloud-h3'].name, 'MiniMax H3 · Comfy Cloud');
for (const f of ['src/shared/modelCatalog.ts', 'src/shared/hostedPrices.ts', 'src/providers.ts', 'src/models.ts']) assert.doesNotMatch(fs.readFileSync(path.join(repo, 'server', f), 'utf8'), /MiniMax H3 Cloud|MiniMax H3 on Comfy Cloud/, f);
console.log('ok cloud-h3 is "MiniMax H3 · Comfy Cloud" everywhere in server/');
console.log('ALL OK licences-1018');
