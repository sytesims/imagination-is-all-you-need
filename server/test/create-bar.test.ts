// Create bar (design audit 2026-10-23): the pure rules behind a bar that never jumps and the preset flow (web/src/shared/presetBar.ts).
// The layout itself (equal bar height in every mode, scroll held at the bottom) needs a real, visible browser: scripts/qa/create-bar.mjs,
// run inside the app page (see its header). This file checks the rules that page relies on.
// Run: npx tsx test/create-bar.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { dockHeightNext, promptHeight, PROMPT_MIN, PROMPT_MAX, subjectParts, fillSubject, presetPromptUntouched, promptAfterPresetClear, lookParts, thumbsShown, modelDownload, intentLine } from '../../web/src/shared/presetBar.ts';
import { presetPrefill, CREATE_PRESET_FIELDS } from '../src/shared/presetLink.ts';
import { IMAGE_PRESETS } from '../src/shared/presets.ts';
import { countWord, countTotal, batchNote, priceDelta } from '../../web/src/shared/barPopText.ts';
const ok = (m: string) => console.log('ok ' + m);

// ---- 1. the feed's bottom padding only grows near the bottom (no drop when the bar gets shorter) ----
/* the bar changes height only with its prompt, so the padding is simply its measure */
assert.equal(dockHeightNext(0, 124), 124, 'first measure');
assert.equal(dockHeightNext(124, 244), 244, 'a long prompt: the padding follows the taller bar');
assert.equal(dockHeightNext(244, 124), 124, 'prompt cleared: back to the short bar');
assert.equal(dockHeightNext(124, 124), 124, 'same height: unchanged');
assert.equal(dockHeightNext(124, 0), 124, 'a hidden pane (no layout, 0px) is never taken');
ok('dock height: the bar\'s measure, hidden measures ignored');

// ---- 1b. the prompt grows with its text: 2 lines → 8 lines, then scrolls; a short window caps it, never under 4 lines ----
assert.equal(PROMPT_MIN, 40); assert.equal(PROMPT_MAX, 160);
assert.deepEqual(promptHeight(0), { h: 40, scroll: false }, 'empty: two lines');
assert.deepEqual(promptHeight(20), { h: 40, scroll: false }, 'one line: still two');
assert.deepEqual(promptHeight(80), { h: 80, scroll: false }, 'four lines: four');
assert.deepEqual(promptHeight(160), { h: 160, scroll: false }, 'eight lines: eight, no scroll');
assert.deepEqual(promptHeight(2400), { h: 160, scroll: true }, 'a 2000+ character prompt: eight lines, scrolls inside');
assert.deepEqual(promptHeight(2400, 100), { h: 100, scroll: true }, 'a short window lowers the cap');
assert.deepEqual(promptHeight(2400, 40), { h: 80, scroll: true }, 'never under four lines');
assert.deepEqual(promptHeight(120, NaN), { h: 120, scroll: false }, 'no CSS max: the 8-line cap');
assert.deepEqual(promptHeight(59.5), { h: 60, scroll: false }, 'fractional measures round up (no clipped last line)');
ok('prompt height: 2 → 8 lines, scrolls past that, a short window never under 4 lines');

// ---- 2. the subject field ----
{ const pf = presetPrefill({ workflow: 'create-image', promptTemplate: '{subject}, on a wet street at night', subjectHint: 'a vintage bicycle', settings: {} }, CREATE_PRESET_FIELDS);
  const s = subjectParts(pf.prompt, pf.select, '{subject}, on a wet street at night')!;
  assert.deepEqual(s, { before: '', hint: 'a vintage bicycle', after: ', on a wet street at night' });
  assert.equal(fillSubject(s, ''), pf.prompt, 'empty field: the sample is used');
  assert.equal(fillSubject(s, '  a red fox '), 'a red fox, on a wet street at night', 'typed subject replaces the sample');
  assert.ok(presetPromptUntouched(fillSubject(s, 'a red fox'), s, 'a red fox', pf.prompt), 'only the subject changed: still the preset\'s prompt');
  /* clearing: the template goes, what you wrote stays */
  assert.equal(promptAfterPresetClear(pf.prompt, s, '', pf.prompt), '', 'untouched: the prompt empties');
  assert.equal(promptAfterPresetClear(fillSubject(s, 'a red fox'), s, 'a red fox', pf.prompt), 'a red fox', 'a typed subject stays as the prompt');
  const edited = 'a red fox in the snow, my own words'; assert.equal(promptAfterPresetClear(edited, s, 'a red fox', pf.prompt), edited, 'a prompt you edited in full is kept');
}
{ const tpl = 'a small triangle of light on the cheek, deep soft shadows, {prompt}'; const pf = presetPrefill({ workflow: 'relight', promptTemplate: tpl, subjectHint: '', settings: {} }, []);
  const s = subjectParts(pf.prompt, pf.select, tpl)!; assert.equal(s.details, tpl, 'touch-up preset: details mode');
  assert.equal(fillSubject(s, ''), 'a small triangle of light on the cheek, deep soft shadows');
  assert.equal(fillSubject(s, 'warm candle tone'), 'a small triangle of light on the cheek, deep soft shadows, warm candle tone', 'details are added at the end');
  assert.equal(promptAfterPresetClear(fillSubject(s, 'warm candle tone'), s, 'warm candle tone', pf.prompt), 'warm candle tone');
  assert.equal(subjectParts('something else', null, tpl), null, 'a prompt that is no longer the template: plain prompt box');
}
/* every shipped preset opens as one line: a subject field or a details field (never a wall of text) */
for (const p of IMAGE_PRESETS) { const pf = presetPrefill(p, Object.keys(p.settings)); const s = subjectParts(pf.prompt, pf.select, p.promptTemplate);
  assert.ok(s, `${p.id}: opens with a subject or details field`); assert.equal(fillSubject(s!, ''), pf.prompt, `${p.id}: an empty field sends the preset's prompt`); }
ok(`subject / details field: sample used when empty, typed text kept on clear, all ${IMAGE_PRESETS.length} presets open as one line`);

// ---- 3. the preset's Look (its tile's tooltip) ----
assert.deepEqual(lookParts({ style: 'neon-night', aspect: '16:9' }, { style: 'neon-night', styleLabel: 'Neon night', aspect: '16:9' }), ['Neon night', '16:9']);
assert.deepEqual(lookParts({ style: 'neon-night', aspect: '16:9' }, { style: '', aspect: '1:1' }), [], 'changed back: nothing claimed');
ok('Look shows only what is still in effect');
// (the context row's next-step cue is gone since the 2026-10-23 clean-up: Generate's second line and its pre-flight list say the next step)

// ---- 4. photos inline on the prompt line: up to four tiles, then the first three and "+N" ----
assert.deepEqual(thumbsShown(0), { show: 0, more: 0 }, 'no photos: nothing');
assert.deepEqual(thumbsShown(1), { show: 1, more: 0 });
assert.deepEqual(thumbsShown(4), { show: 4, more: 0 }, 'four fit');
assert.deepEqual(thumbsShown(5), { show: 3, more: 2 }, 'five: three and +2');
assert.deepEqual(thumbsShown(10), { show: 3, more: 7 }, 'ten: three and +7');
assert.deepEqual(thumbsShown(12, 4), { show: 3, more: 9 });
ok('thumbnails: four fit, more show three and "+N"');

// ---- 5. the model chip's download ring and Generate's line for a chosen download ----
const J = (o: any) => ({ status: 'running', provider: 'comfy-flux3-klein', ...o });
assert.equal(modelDownload([], 'comfy-flux3-klein'), null, 'no runs: no ring');
assert.deepEqual(modelDownload([J({ stage: 'downloading_model', stageDetail: { stage: 'downloading_model', bytesTotal: 12e9, bytesDone: 5.04e9 } })], 'comfy-flux3-klein'), { pct: 42 }, 'real progress');
assert.deepEqual(modelDownload([J({ stage: 'downloading_model', stageDetail: { stage: 'downloading_model', bytesTotal: null, bytesDone: null } })], 'comfy-flux3-klein'), { pct: null }, 'no bytes yet: indeterminate');
assert.deepEqual(modelDownload([J({ status: 'queued', input: { downloadWeights: '1' } })], 'comfy-flux3-klein'), { pct: null }, 'queued with a download: indeterminate');
assert.equal(modelDownload([J({ stage: 'loading_model', stageDetail: { stage: 'loading_model' } })], 'comfy-flux3-klein'), null, 'loading the model: the run card says it, no ring');
assert.equal(modelDownload([J({ stage: 'downloading_model' })], 'other-model'), null, 'another model downloading: not this chip');
assert.equal(modelDownload([J({ status: 'done', stage: 'downloading_model' })], 'comfy-flux3-klein'), null, 'finished runs: no ring');
assert.equal(intentLine('12 GB'), 'Free · downloads 12 GB first');
ok('download ring: real % or indeterminate, only for this model\'s live runs; Generate says a chosen download');

// ---- 6. the small bar popovers (web/src/shared/BarPop.tsx): count total, one-call note, price differences ----
assert.equal(countWord(1), '1 image'); assert.equal(countWord(4), '4 images'); assert.equal(countWord(2, 'take'), '2 takes');
assert.equal(countTotal(4, '≈ $0.10'), '4 images · ≈ $0.10', 'hosted: count and the quote\'s price');
assert.equal(countTotal(3, 'Free'), '3 images · Free', 'local: Free');
assert.equal(countTotal(2, null), '2 images', 'no price yet: just the count');
assert.equal(batchNote({ n: 1, local: false }), null, 'one image: no note');
assert.equal(batchNote({ n: 4, local: null }), null, 'unknown route: no note');
assert.match(batchNote({ n: 4, local: true })!, /one run on your GPU/, 'local: one batch');
assert.match(batchNote({ n: 3, local: false })!, /^3 separate requests/, 'hosted: one request per image');
assert.equal(priceDelta({ diffCredits: 3, own: true }), '+$0.03');
assert.equal(priceDelta({ diffCredits: -24, own: true }), '−$0.24');
assert.equal(priceDelta({ diffCredits: 0.2, own: true }), 'Same price');
assert.equal(priceDelta({ diffCredits: 12, own: false }), '+$0.12', 'team mode: dollars too');
assert.equal(priceDelta({ diffCredits: 5, own: true, local: true }), null, 'local: no difference shown');
assert.equal(priceDelta({ diffCredits: null, own: true }), null, 'no price: nothing');
ok('bar popovers: count total, one-call vs separate runs, price differences');
