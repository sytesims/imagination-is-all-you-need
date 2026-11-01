// Character Sheet layouts + the doubled-prompt fix (2026-10-25). Layouts: each one's panel text, a keep block that fits it (feet only where there
// are full-body panels), its own shape snapped to the model, a clear 400 for an unknown value, the same one-image price. Doubling: a composed
// prompt that comes back as the words (an example's prompt, an old draft, a caller sending the whole prompt, an older job's appPrompt) is
// peeled back to the user's own words for the run, Use again / Recreate, result cards and the example link, for every composing workflow.
// Run: npx tsx test/character-sheet-layouts.test.ts   (in-process, temp data dir, mock backend, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'charsheet-')); process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const ok = (m: string) => console.log('ok ' + m);
const A = await import('../src/tools/apps.ts'); const { CHARACTER_LAYOUTS } = await import('../src/tools/appRows.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { typedFromFrames, typedPromptOf, stripEcho, composedDiffers } = await import('../src/shared/typedPrompt.ts');
const { examplePrefill } = await import('../src/shared/exampleLink.ts'); const { SHOWCASE, SHOWCASE_FOR, showcaseById } = await import('../src/shared/showcase.ts');
const { imageWorkflowsPayload } = await import('../src/shared/workflows.ts');

// ---- layouts: wording
const OLD = 'Character reference sheet of a knight: one image split into three equal vertical panels side by side, separated by thin dark divider lines. Left panel: full-body front view from head to toe with the shoes fully in frame, standing straight, arms relaxed at the sides, facing the camera. Centre panel: full-body back view from head to toe in the same pose, facing away from the camera. Right panel: tight close-up of the face and shoulders, looking straight into the lens. Every panel has the same plain neutral grey seamless studio backdrop and soft, even, almost shadowless light, neutral 5600K white balance, natural skin texture with visible detail, catchlights in the eyes. Keep exactly one identical person in all three views: the same face, hair, skin tone, body proportions and the complete outfit and accessories; feet visible in both full-body panels; no extra people, no text, no props, no cropping of the body; sharp, realistic photo';
assert.equal(A.characterSheetPrompt('a knight', false), OLD, 'Classic is the Oct 22 sheet word for word');
assert.equal(A.characterSheetPrompt('a knight', false, 'classic'), OLD);
assert.ok(A.characterSheetPrompt('', true).includes('accessories from image 1; feet visible in both full-body panels'));
// 2026-11-01: the photo is "image 1" (each model's own token), your words say which person; trailing punctuation tidied; a named style keeps its look
assert.ok(A.characterSheetPrompt('', true).startsWith('Character reference sheet of the person in image 1: one image'));
assert.ok(A.characterSheetPrompt('the man on the left.', true).startsWith('Character reference sheet of the person in image 1 (the man on the left): one image'));
assert.ok(A.characterSheetPrompt('A courier in a raincoat. No watermark.', false).startsWith('Character reference sheet of A courier in a raincoat. No watermark: one image'), 'no ".:" join');
assert.equal(A.characterSheetWords('Character sheet of the pale figure (not the woman).'), 'the pale figure (not the woman)');
assert.equal(A.characterSheetWords('character reference sheet'), ''); assert.equal(A.characterSheetWords('  a knight ;'), 'a knight');
for (const w of ['an anime courier', 'a 3D cartoon fox', 'watercolour painting of a sailor', 'pixel art knight', 'a claymation baker']) { const p = A.characterSheetPrompt(w, false);
  assert.ok(p.endsWith('in the style described above, the same style in every panel') && !/realistic photo|5600K|skin texture/.test(p), w); }
for (const w of ['a knight', 'a woman in a red coat']) assert.ok(A.characterSheetPrompt(w, false).endsWith('sharp, realistic photo'), w);
assert.ok(A.characterSheetPrompt('an anime courier', false, 'classic', 800).endsWith('in the style described above, the same style in every panel'), 'short sheet too');
assert.deepEqual(CHARACTER_LAYOUTS.map((l) => [l.value, l.aspect]), [['classic', '4:3'], ['turnaround', '16:9'], ['turnaround-face', '21:9'], ['expressions', '3:2'], ['full-sheet', '16:9']]);
for (const l of CHARACTER_LAYOUTS) { const p = A.characterSheetPrompt('a knight', false, l.value);
  assert.ok(p.startsWith('Character reference sheet of a knight: ') && p.includes('grey seamless studio backdrop') && p.endsWith('sharp, realistic photo'), l.value);
  assert.equal(/feet visible/.test(p.split(' Keep ')[1]), !!l.keep.fullBody, `${l.value}: feet only with full-body panels`);
  assert.equal(/no cropping of the body/.test(p), !!l.keep.fullBody, `${l.value}: body cropping only with full-body panels`); }
assert.match(A.characterSheetPrompt('x', false, 'expressions'), /neutral, a gentle smile, laughing.*angry, sad, surprised.*only the facial expression changes/);
assert.match(A.characterSheetPrompt('x', false, 'turnaround'), /four equal vertical panels.*three-quarter view turned 45 degrees to the left, side profile facing left/);
ok('layout prompts (Classic unchanged, keep block per layout)');

// ---- layouts: shape per model, snapped
assert.equal(A.sheetAspect('21:9', 'api-nano-banana-pro', 'generate'), '21:9');
assert.equal(A.sheetAspect('21:9', 'api-hunyuan-image', 'generate'), '16:9', 'no 21:9 → the nearest, 16:9'); assert.equal(A.sheetAspect('3:2', 'api-hunyuan-image', 'generate'), '4:3');
assert.equal(A.sheetAspect('21:9', 'comfy-qwen21', 'generate'), '21:9', 'local graphs take any shape');
assert.equal(A.sheetAspect('16:9', 'comfy-flux3-klein', 'edit'), null, 'edits that keep the photo shape stay on the fitted 4:3');
const t: any = getTool('app-character-sheet'); assert.ok(t);
const run = (fields: Record<string, string>, files: Record<string, string[]> = {}) => t.parseInput({ rights: '1', ...fields }, files);
for (const l of CHARACTER_LAYOUTS) { const r = await run({ provider: 'comfy-zimage-turbo', prompt: 'a knight', layout: l.value }); assert.ok(!('error' in r), JSON.stringify(r));
  assert.equal(r.aspect, l.aspect, `${l.value} aspect`); assert.equal(r.appFields.layout, l.value); assert.equal(r.appPrompt, 'a knight'); assert.equal(r.prompt, A.characterSheetPrompt('a knight', false, l.value)); }
{ const r = await run({ provider: 'comfy-zimage-turbo', prompt: 'a knight' }); assert.equal(r.aspect, '4:3'); assert.equal(r.appFields.layout, 'classic'); }
{ const r = await run({ provider: 'comfy-zimage-turbo', prompt: 'a knight', layout: 'collage' }); assert.equal(r.issues?.[0]?.field, 'layout'); assert.match(r.error, /Layout: pick one of classic, turnaround/); }
{ const q = A.appQuoteParams(t, { provider: 'comfy-zimage-turbo', layout: 'turnaround-face' }); assert.equal(q.aspect, '21:9'); assert.equal(A.appQuoteParams(t, { provider: 'comfy-zimage-turbo' }).aspect, '4:3'); }
ok('layout aspect on run and quote; unknown layout → 400');

// ---- Wan 2.5 Image (800-character cap, 2026-10-26): the short sheet, so the route is offered; over the cap with the user's words = the usual refusal
{ const { toolModels, modelRoutes } = await import('../src/routing/modelRegistry.ts'); const { option } = await import('../src/routing/select.ts');
  const wan: any = toolModels(t).find((m: any) => m.key === 'wan-image-2.5'); assert.ok(wan, 'Wan 2.5 Image is offered on Character Sheet');
  const route = modelRoutes(t, wan).find((x: any) => x.engine === 'api-wan-image')!.route;
  for (const l of CHARACTER_LAYOUTS) for (const photo of [false, true]) {
    const r = await run({ provider: 'api-wan-image', prompt: 'a friendly explorer in a green coat, short curly hair', layout: l.value }, photo ? { image: ['x.png'] } : {}); if ('error' in r) continue; // a photo needs an edit model
    assert.ok(r.prompt.length <= 800, `${l.value}: ${r.prompt.length} characters`); assert.match(r.prompt, /^Character reference sheet of .*green coat/);
    assert.match(r.prompt, /grey studio backdrop/); assert.match(r.prompt, /same face, hair and outfit/); if (l.keep.fullBody) assert.match(r.prompt, /back.*neutral relaxed standing pose/);
    assert.equal(r.appPrompt, 'a friendly explorer in a green coat, short curly hair'); const o = option(t, route, r); assert.ok(!/800 characters/.test(o.reason ?? ''), `${l.value}: ${o.reason}`); }
  { const r = await run({ provider: 'api-wan-image', prompt: 'a knight', layout: 'turnaround' }); assert.match(r.prompt, /front, three-quarter, side profile and back/); }
  { const r = await run({ provider: 'comfy-zimage-turbo', prompt: 'a knight' }); assert.equal(r.prompt, OLD, 'models without a small cap keep the full sheet'); }
  { const r = await run({ provider: 'api-wan-image', prompt: 'a very tall knight in shining armour '.repeat(14).trim() }); const o = option(t, route, r);
    assert.match(o.reason ?? '', /Wan 2\.5 Image takes prompts up to 800 characters; yours is \d/, 'too long with the words: the existing message'); }
  assert.equal(A.appTypedPrompt('character-sheet', A.characterSheetPrompt('a knight', false, 'full-sheet', 800)), 'a knight', 'the short sheet peels back to the words'); }
ok('Wan 2.5 Image: short sheet fits 800 characters, route offered; too long still refused');

// ---- the doubling: words only, whatever came in
const twice = A.characterSheetPrompt(A.characterSheetPrompt('character sheet', true), true);
assert.equal(A.appTypedPrompt('character-sheet', twice), 'character sheet', 'a prompt composed twice peels back to the words');
assert.equal(A.appTypedPrompt('character-sheet', A.characterSheetPrompt('', true)), '', 'photo, no words');
assert.equal(A.appTypedPrompt('character-sheet', A.characterSheetPrompt('a knight', false, 'expressions')), 'a knight', 'another layout');
assert.equal(A.appTypedPrompt('character-sheet', 'a knight\nwith a red cape'), 'a knight\nwith a red cape', 'plain words untouched (line breaks kept)');
const long = 'a tall knight '.repeat(60).trim(); assert.equal(A.appTypedPrompt('character-sheet', A.characterSheetPrompt(long, false, 'full-sheet')), long, 'very long subject');
{ const r = await run({ provider: 'comfy-qwen21', prompt: twice, layout: 'turnaround' }, { image: ['x.png'] }); if (!('error' in r)) { assert.equal(r.appPrompt, 'character sheet'); assert.equal((r.prompt.match(/Character reference sheet/g) ?? []).length, 1, 'composed once'); } }
{ const r = await run({ provider: 'comfy-zimage-turbo', prompt: A.characterSheetPrompt('a knight', false), layout: 'expressions' }); assert.equal(r.appPrompt, 'a knight', 'a REST / MCP caller sending the full prompt'); assert.equal((r.prompt.match(/Character reference sheet/g) ?? []).length, 1); }
// other composing workflows
const ps: any = getTool('app-product-shot'); { const r = await ps.parseInput({ rights: '1', provider: 'comfy-zimage-turbo', prompt: 'product photo of a red mug; on a seamless white studio backdrop, soft even key light, gentle floor shadow', scene: 'studio-white' }, {}); assert.equal(r.appPrompt, 'a red mug'); }
for (const id of ['relight', 'face-swap', 'person-swap', 'product-shot', 'character-sheet']) { const g = (getTool(`app-${id}`) as any).app.gallery; assert.ok(g.promptFrames.length, `${id} has frames`); }
assert.equal(JSON.parse(JSON.stringify((getTool('app-character-sheet') as any).app.gallery)).lockedFor, undefined, 'lockedFor never on the wire');
// older jobs: appPrompt that held a composed prompt; result cards show words only
// (an Oct 25 job, in that day's photo wording: "the person in the photo, …" and "from the photo")
const oldSheet = (subj: string) => A.characterSheetPrompt('', true).replace('the person in image 1', subj).replaceAll('from image 1', 'from the photo');
const oldApp = oldSheet('the person in the photo, character sheet'); const oldJob = { prompt: oldSheet(`the person in the photo, ${oldApp}`), appPrompt: oldApp, appId: 'character-sheet' };
assert.equal(typedPromptOf(oldJob), 'character sheet'); assert.equal(typedPromptOf({ prompt: 'a cat' }), 'a cat'); assert.equal(typedPromptOf({ prompt: OLD, appPrompt: 'a knight' }), 'a knight');
assert.equal(typedPromptOf({ prompt: OLD, appPrompt: '' }), ''); assert.ok(composedDiffers({ prompt: OLD, appPrompt: 'a knight' })); assert.ok(!composedDiffers({ prompt: 'a cat' }));
assert.equal(stripEcho('short', 'short'), 'short'); assert.equal(typedFromFrames('hello', []), 'hello');
ok('doubled / full prompts peel back to the words (run, REST/MCP, old jobs, cards)');

// ---- the example link fills only the words (that was the live bug: Workflows → Character Sheet opened with the full sheet in the box)
for (const s of SHOWCASE.filter((x) => x.workflow !== 'create-image' && x.prompt)) assert.equal(typeof s.subject, 'string', `${s.id}: a composing workflow's example names its words`);
assert.equal(examplePrefill(showcaseById(SHOWCASE_FOR['character-sheet'])!).prompt, ''); assert.equal(examplePrefill(showcaseById(SHOWCASE_FOR.relight)!).prompt, '');
const cs = (imageWorkflowsPayload(getTool as any) as any).workflows.find((w: any) => w.id === 'character-sheet');
assert.deepEqual(cs.controls.map((c: any) => [c.field, c.kind, c.default]), [['layout', 'tiles', 'classic']]); assert.deepEqual(cs.controls[0].options.map((o: any) => o.aspect), ['4:3', '16:9', '21:9', '3:2', '16:9']);
assert.ok(cs.prompt.frames.length >= 10); assert.equal(typedFromFrames(twice, cs.prompt.frames), 'character sheet', 'the web can clean a draft with the payload frames');
ok('example link + recipe payload');
process.exit(0);
