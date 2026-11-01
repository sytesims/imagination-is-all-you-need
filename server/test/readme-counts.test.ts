// The workflow counts in README.md and docs/SUBMISSION-README.md, recounted from the lists each tab's Workflows picker ("See all") shows.
// Image: Create + the image recipes. Video: the video workflows (not the old Edit Video row) + the flow shortcuts. Audio: the audio recipes.
// 3D: the ready ones (coming-soon rows aren't counted). A bundled plugin (plugins/*/plugin.json) joins its tab. The one-click apps are the
// engines behind some of these rows, so the docs say "including", never "plus".
// Run: npx tsx test/readme-counts.test.ts   (in-process, mock backend, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_DATA_DIR ??= fs.mkdtempSync(path.join(os.tmpdir(), 'readme-counts-')); process.env.OPENHIGGSFIELD_BACKEND ??= 'mock';
const { WORKFLOW_IDS } = await import('../src/shared/workflows.ts');
const { VIDEO_WORKFLOWS, VIDEO_FLOW_SHORTCUTS } = await import('../src/shared/videoWorkflows.ts');
const { AUDIO_WORKFLOW_IDS } = await import('../src/shared/audioWorkflows.ts');
const { THREE_D_WORKFLOWS } = await import('../src/shared/threeD.ts');
const { APP_GALLERY, cameraApp } = await import('../src/tools/apps.ts');

const ROOT = path.resolve(import.meta.dirname, '../..');
const pluginsIn = (tab: string) => fs.readdirSync(path.join(ROOT, 'plugins'), { withFileTypes: true }).filter((d) => d.isDirectory())
  .map((d) => path.join(ROOT, 'plugins', d.name, 'plugin.json')).filter((f) => fs.existsSync(f) && JSON.parse(fs.readFileSync(f, 'utf8')).tab === tab).length;
const n = {
  image: 1 + WORKFLOW_IDS.length + pluginsIn('image'),
  video: VIDEO_WORKFLOWS.filter((w) => w.surface !== 'edit-hub').length + VIDEO_FLOW_SHORTCUTS.length + pluginsIn('video'),
  audio: AUDIO_WORKFLOW_IDS.length + pluginsIn('audio'),
  three: THREE_D_WORKFLOWS.filter((w) => w.status !== 'soon').length + pluginsIn('3d'),
  apps: APP_GALLERY.length, camera: (cameraApp as any).presets.length,
};
console.log('counted', JSON.stringify(n));

const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');
assert.ok(read('README.md').includes(`**${n.image} image · ${n.video} video · ${n.audio} audio · ${n.three} 3D workflows**, including the **${n.apps} one-click apps**`), 'README.md workflow counts match the pickers');
assert.ok(read('README.md').includes(`(${n.camera} moves)`), 'README.md camera move count');
assert.ok(read('docs/SUBMISSION-README.md').includes(`${n.image} image, ${n.video} video, ${n.audio} audio and ${n.three} 3D workflows (the ${n.apps} one-click apps among them), plus ${n.camera} camera presets`), 'SUBMISSION-README.md counts');
const providers = read('docs/PROVIDERS-AND-MODELS.md');
assert.ok(providers.includes(`${n.camera} camera presets`) && providers.includes(`${n.apps} apps in the current catalogue`), 'PROVIDERS-AND-MODELS.md counts');
console.log('ok README, SUBMISSION-README and PROVIDERS-AND-MODELS counts match the code');
