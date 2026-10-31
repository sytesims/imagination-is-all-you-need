// Media picker tiles and slot labels (2026-10-31). In process, temp data dir; no browser.
//  - shared/shortTitle: a few plain words from a prompt; the job's own title first; the feature last; "Layer N · …" for Image to layers
//  - GET /api/media generations carry that short title (never the bare feature name ×12 for layers)
//  - the picker and Canvas's Assets drawer share one type filter (All · Images · Videos · Audio); the picker starts on what the slot takes
//  - slot labels never break inside a word (shared/SlotLabel in every bar, no overflow-wrap:anywhere on the dock label)
//  - the picker's search draws one focus ring (no outer glow, none on the inner input); pictures sit on the shared checkerboard
// Run: npx tsx test/picker-titles.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'pktitle-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json') });
const ok = (m: string) => console.log('ok ' + m);
const { shortTitle, resultTitle } = await import('../src/shared/shortTitle.ts');
assert.equal(shortTitle('a moody gradient study with soft window light'), 'Moody gradient study');
assert.equal(shortTitle('Cinematic close-up portrait of a fisherman at dawn, golden rim light'), 'Cinematic close-up portrait');
assert.equal(shortTitle('tiny robot watering a bonsai tree'), 'Tiny robot watering a bonsai');
assert.equal(shortTitle(''), ''); assert.equal(shortTitle('Hi'), 'Hi');
assert.ok(shortTitle('x'.repeat(80)).length <= 32, 'one very long word is cut with …');
assert.equal(resultTitle({ title: 'Snowy bus stop', prompt: 'long prompt here', feature: 'Generate Video' }), 'Snowy bus stop', 'the job title first');
assert.equal(resultTitle({ prompt: '', feature: 'Motion Transfer' }), 'Motion Transfer', 'the feature last');
assert.equal(resultTitle({ prompt: 'Auto layers (no prompt)', feature: 'Image to layers', layer: 3 }), 'Layer 3 · Image to layers', 'no prompt: the feature');
assert.equal(resultTitle({ prompt: 'split the sale poster', feature: 'Image to layers', layer: 0 }), 'Background · Split the sale poster');
ok('short titles: job title, prompt words, feature; layers say which layer');

const { jobs } = await import('../src/jobs.ts'); const { listMedia } = await import('../src/mediaLibrary.ts');
const put = (id: string, toolId: string, files: string[], input: any) => { for (const f of files) fs.writeFileSync(path.join(D, f), 'x');
  jobs.set(id, { id, toolId, status: 'done', createdAt: 1000 + jobs.size, finishedAt: 2000 + jobs.size, outputs: files.map((f, k) => ({ label: k ? `Layer ${k}` : 'Background', url: `/files/${f}` })), resultUrl: `/files/${files[0]}`, input } as any); };
put('ly', 'app-image-layers', ['ly-0.png', 'ly-1.png', 'ly-2.png'], { prompt: 'Auto layers (no prompt)', layers: true, transparent: true });
put('im', 'create-image', ['im-0.png'], { prompt: 'product shot of a glass perfume bottle on wet black stone' });
const g = await listMedia({ tab: 'generations', type: 'image', pageSize: 50 });
const t = (u: string) => g.items.find((x: any) => x.url === `/files/${u}`)?.title;
assert.equal(t('ly-0.png'), 'Background · Image to layers'); assert.equal(t('ly-2.png'), 'Layer 2 · Image to layers'); assert.equal(t('im-0.png'), 'Product shot of a glass perfume');
ok('GET /api/media: tiles carry the short title, layers numbered');

const W = path.resolve(import.meta.dirname, '../../web/src'); const rd = (p: string) => fs.readFileSync(path.join(W, p), 'utf8');
const mp = rd('shared/MediaPicker.tsx'); const dr = rd('canvas/AssetsDrawer.tsx'); const tf = rd('shared/TypeFilter.tsx');
assert.match(tf, /all: 'All', image: 'Images', video: 'Videos', audio: 'Audio'/); assert.match(tf, /kinds\.length < 2\) return null/, 'one kind: no filter');
assert.match(mp, /<TypeFilter kinds=\{typeKinds\}/); assert.match(dr, /<TypeFilter kinds=\{kinds\}/); assert.doesNotMatch(dr, /cv-chip/, 'the drawer uses the shared filter');
assert.match(mp, /useState<TypePick>\(kinds\.length === 1 \? kinds\[0\] : 'all'\)/, 'starts on what the slot takes (an image slot: Images)');
assert.match(mp, /return x\.title\?\.trim\(\) \|\|/, 'a tile shows the short title before the feature');
assert.match(mp, /x\.type === 'image' \? ' alpha-bg' : ''/, 'pictures on the shared checkerboard');
const css = rd('shared/mediaPicker.css');
assert.match(css, /\.mpk-search:focus-within\{border-color:var\(--accent\);box-shadow:none/); assert.match(css, /\.mpk-search input:focus-visible\{outline:none;box-shadow:none\}/);
assert.match(css, /\.mpk-cap-d\{flex:none;min-width:30px/, 'the length has its own slot');
ok('one type filter for picker and Assets; one search ring; checkerboard; length slot');

for (const f of ['ui/next/WorkflowBar.tsx', 'ui/video/VideoWorkflowBar.tsx', 'ui/audio/AudioPage.tsx', 'ui/three/ThreeDStudio.tsx']) assert.match(rd(f), /<SlotLabel text=/, f);
assert.doesNotMatch(rd('ui/next/createBar.css').split('\n').find(l => l.includes('.wf-slot .wf-slot-hit b{'))!, /overflow-wrap:anywhere/, 'the dock slot label never breaks a word');
assert.match(rd('shared/slotLabel.css'), /\.slot-w\{display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap/);
ok('slot labels: words never break inside (shared SlotLabel)');

// Pick several (2026-10-31): ticks, Shift-click runs, Space / Enter, "n left", never more than fit
assert.match(mp, /className="mpk-tick"/, 'a tick on hover'); assert.match(mp, /onPick\(x, e\.shiftKey\)/, 'Shift-click ticks a run');
assert.match(mp, /if \(e\.key === ' '\) \{ e\.preventDefault\(\); if \(e\.type === 'keydown' && !e\.repeat\) toggle\(x\)/, 'Space ticks');
assert.match(mp, /if \(e\.key === 'Enter'\)/, 'Enter adds'); assert.match(mp, /left<\/span>/, '"n left"'); assert.match(mp, /Only \$\{room\} fit/, 'extra picks refused with a note');
assert.match(mp, /const maxAttr = /, 'data-picker-max read from the slot'); assert.match(rd('ui/video/VideoWorkflowBar.tsx'), /data-picker-max=\{mx && mx > 1 \? Math\.max\(0, mx - fs\.length\)/);
assert.match(rd('ui/video/StitchPanel.tsx'), /max: MAX_CLIPS - d\.clips\.length/);
ok('pick several: tick, Shift-click run, Space ticks, Enter adds, "n left", refuses past the limit');
