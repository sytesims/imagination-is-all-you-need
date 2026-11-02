// The workflow counts in README.md and docs/SUBMISSION-README.md, from the ONE shared count (shared/workflowCount.ts) that the Workflows tab's
// header and "Everything" filter use (2026-11-02; before, the README counted the tab pickers and said 62 while the tab said 34): every ready-made
// workflow in the catalogue (each opens its tab with it picked) plus the bundled plugins (plugins/*/plugin.json) with a tab, then the step-by-step
// chains. The one-click apps are the engines behind some of these, so the docs say "including", never "plus".
// Run: npx tsx test/readme-counts.test.ts   (in-process, mock backend, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_DATA_DIR ??= fs.mkdtempSync(path.join(os.tmpdir(), 'readme-counts-')); process.env.OPENHIGGSFIELD_BACKEND ??= 'mock';
const { workflowCounts } = await import('../src/shared/workflowCount.ts');
const { APP_GALLERY, cameraApp } = await import('../src/tools/apps.ts');

const ROOT = path.resolve(import.meta.dirname, '../..');
const pluginTabs = fs.readdirSync(path.join(ROOT, 'plugins'), { withFileTypes: true }).filter((d) => d.isDirectory())
  .map((d) => path.join(ROOT, 'plugins', d.name, 'plugin.json')).filter((f) => fs.existsSync(f)).map((f) => String(JSON.parse(fs.readFileSync(f, 'utf8')).tab ?? '')).filter(Boolean);
const c = workflowCounts(pluginTabs);
const n = { ...c, apps: APP_GALLERY.length, camera: (cameraApp as any).presets.length };
console.log('counted', JSON.stringify(n));

const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');
assert.ok(read('README.md').includes(`**${n.workflows} ready-made workflows** (${n.image} image · ${n.video} video · ${n.audio} audio · ${n.three} 3D), including the **${n.apps} one-click apps**, plus **${n.chains} step-by-step chains**`), 'README.md workflow counts match the shared count');
assert.ok(read('README.md').includes(`(${n.camera} moves)`), 'README.md camera move count');
assert.ok(read('docs/SUBMISSION-README.md').includes(`${n.workflows} ready-made workflows (${n.image} image, ${n.video} video, ${n.audio} audio and ${n.three} 3D, the ${n.apps} one-click apps among them) and ${n.chains} step-by-step chains, plus ${n.camera} camera presets`), 'SUBMISSION-README.md counts');
const providers = read('docs/PROVIDERS-AND-MODELS.md');
assert.ok(providers.includes(`${n.camera} camera presets`) && providers.includes(`${n.apps} apps in the current catalogue`), 'PROVIDERS-AND-MODELS.md counts');
console.log('ok README, SUBMISSION-README and PROVIDERS-AND-MODELS counts match the code');
