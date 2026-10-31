// The words in front of an image-based video prompt (shared/modePrompt.ts, 2026-10-29): only when needed, per model, a default for an empty prompt.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../src/config.ts';
import { assemblePrompt, mentionsImage, h3Anchored, H3_I2V_LINE, I2V_DEFAULT_PROMPT } from '../src/shared/modePrompt.ts';
import { withRefGrammar } from '../src/shared/promptRefs.ts';
import { h3VideoTool } from '../src/tools/media.ts';
import { greyPng, promptPeek, videoWorkflowLine } from '../src/routesPromptPeek.ts';

const i2v = (prompt: string, provider: string | null = 'router-kling', style?: string, model?: string) => assemblePrompt({ mode: 'i2v', modePhrase: 'animate the image', prompt, provider, style, model });

// the prompt already speaks about the image or frames: no phrase
const whale = 'Realistic cinematic image-to-video. Use the image as the exact first frame. The whale glides past the rooftop.';
assert.equal(i2v(whale), whale);
// … except on H3: a loose "image" is no anchor, so H3's own alignment line stays (2026-10-31); an explicit <Picture 1> anchor drops it
assert.equal(i2v(whale, 'comfy-h3'), `${H3_I2V_LINE}\n\n${whale}`);
assert.equal(i2v('bring this photo to life', 'comfy-h3'), `${H3_I2V_LINE}\n\nbring this photo to life`);
const anchored = '<Picture 1> (from [Shot 1]) is fully referenced. The whale glides past.';
assert.ok(h3Anchored(anchored)); assert.ok(!h3Anchored('<Picture 1> waves')); assert.equal(i2v(anchored, 'comfy-h3'), anchored);
for (const p of ['the photo comes alive', 'start frame: a cat', '<Picture 1> waves', '@image1 turns around', 'Image 1 smiles', 'from the first frame on']) assert.ok(mentionsImage(p), p);
for (const p of ['a cat walks across a wall', 'keep the framing', 'imagine a storm', 'a picturesque valley']) assert.ok(!mentionsImage(p), p);

// a plain prompt on MiniMax H3 (the routes that run the H3 weights): H3's own alignment line first, then a blank line
for (const p of ['comfy-h3', 'cloud-h3', 'cloud-h3-wf']) assert.equal(i2v('a whale glides past', p), `${H3_I2V_LINE}\n\na whale glides past`);
assert.match(H3_I2V_LINE, /^For the target video, at 0\.00 seconds into the target video, <Picture 1> \(from \[Shot 1\]\) is fully referenced\.$/);
// … and the ref grammar leaves the line alone on every place
const job = { mode: 'i2v', imageUrl: 'x', refUrls: ['x'], finalPrompt: i2v('a whale', 'comfy-h3') };
for (const pl of [undefined, 'local', 'router']) assert.equal(withRefGrammar(job as any, 'minimax-h3', pl).finalPrompt, job.finalPrompt);

// another model: the generic phrase; H3 Fast: none (the frame sets the look); the MiniMax partner API: generic
assert.equal(i2v('a whale glides past'), 'animate the image. a whale glides past');
assert.equal(i2v('a whale glides past', 'api-minimax-h3'), 'animate the image. a whale glides past');
assert.equal(i2v('a whale glides past', 'cloud-h3-fast'), 'a whale glides past');
assert.equal(i2v('a whale glides past', null, 'film grain'), 'animate the image. a whale glides past. film grain');

// empty + image: the default (it names the image, so no phrase)
assert.equal(i2v(''), I2V_DEFAULT_PROMPT);
assert.equal(i2v('   ', 'comfy-h3'), `${H3_I2V_LINE}\n\n${I2V_DEFAULT_PROMPT}`, 'H3 keeps its line on the default too');
// … per model family (shared/promptPatterns.ts i2v-default): Wan motion + "Fixed camera", LTX a paragraph opening on the start image, H3 a static camera
assert.equal(i2v('', 'comfy-wan22-5b', undefined, 'wan-2.2-ti2v-5b'), 'The subject moves naturally and subtly, breathing and blinking, hair and clothes stirring slightly. Fixed camera.');
assert.equal(i2v('', 'router-wan3', undefined, 'wan-3.0'), 'The subject moves naturally and subtly, breathing and blinking, hair and clothes stirring slightly. Fixed camera.');
assert.equal(i2v('', 'comfy-ltx25-video', undefined, 'ltx-2.5-22b'), 'Use the provided start image as the first frame. The subject moves naturally and subtly, breathing and blinking, while small details in the scene stir. The camera holds steady on the subject.');
assert.equal(i2v('', 'comfy-h3', undefined, 'minimax-h3'), `${H3_I2V_LINE}\n\nThe subject moves naturally and subtly, breathing and blinking. The camera holds a static shot.`);
assert.equal(i2v('', 'cloud-h3-fast', undefined, 'minimax-h3-fast'), 'The subject moves naturally and subtly, breathing and blinking. The camera holds a static shot.', 'H3 Fast: no line');
assert.equal(i2v('', 'router-kling', undefined, 'kling-v3'), I2V_DEFAULT_PROMPT, 'Kling keeps the generic default');

// a structured H3 prompt: unchanged
const st = `${H3_I2V_LINE}\n\nintegrated_multimodal_description: [Shot 1] a whale`;
assert.equal(i2v(st, 'comfy-h3'), st);
assert.equal(i2v('integrated_multimodal_description: [Shot 1] a whale', 'comfy-h3'), 'integrated_multimodal_description: [Shot 1] a whale');

// start + end frame and reference
const flf = (p: string) => assemblePrompt({ mode: 'flf', modePhrase: 'move from the start frame to the end frame', prompt: p, provider: 'comfy-h3' });
assert.equal(flf('the door opens'), 'move from the start frame to the end frame. the door opens');
assert.equal(flf('from the start frame the door opens to the end frame'), 'from the start frame the door opens to the end frame');
const r2v = (p: string) => assemblePrompt({ mode: 'r2v', modePhrase: 'keep the referenced subject', prompt: p, provider: 'router-kling' });
assert.equal(r2v('she dances in the rain'), 'keep the referenced subject. she dances in the rain');
assert.equal(r2v('@image1 dances in the rain'), '@image1 dances in the rain');

// other modes: as before
assert.equal(assemblePrompt({ mode: 't2v', modePhrase: '', prompt: 'a whale' }), 'a whale');

// the job: typed words in `prompt` (Recreate), the assembled words in `finalPrompt`; an empty image-to-video prompt is accepted
fs.mkdirSync(DATA_DIR, { recursive: true });
const photo = 'mode-prompt-photo.png';
fs.writeFileSync(path.join(DATA_DIR, photo), greyPng(32, 32));
const parse = (fields: Record<string, string>) => h3VideoTool.parseInput(fields, { image: [photo] }) as any;
const a = await parse({ types: '["i2v"]', prompt: 'a whale glides past', provider: 'comfy-h3' });
assert.ok(!a.error, a.error); assert.equal(a.prompt, 'a whale glides past'); assert.equal(a.finalPrompt, `${H3_I2V_LINE}\n\na whale glides past`);
const b = await parse({ types: '["i2v"]', prompt: '', provider: 'router-kling' });
assert.ok(!b.error, b.error); assert.equal(b.prompt, ''); assert.equal(b.finalPrompt, I2V_DEFAULT_PROMPT);
const bw = await parse({ types: '["i2v"]', prompt: '', provider: 'router-wan3' }); // the job path passes the model key (shared/modelIds.ts engineModelKey)
assert.ok(!bw.error, bw.error); assert.match(bw.finalPrompt, /Fixed camera\.$/);
const c = await parse({ types: '["t2v"]', prompt: '', provider: 'router-kling' });
assert.ok(c.error, 'text to video still needs a prompt');
// the peek's Workflow line names the model, mode, place and source
assert.equal(videoWorkflowLine({ model: 'MiniMax H3', mode: 'Image to video', place: 'Comfy Cloud', workflow: { source: 'official', name: 'x', url: null, author: 'Comfy Org', licence: 'MIT' } as any }), 'MiniMax H3 image to video · Comfy Cloud · official Comfy template');
assert.equal(videoWorkflowLine({ model: 'Kling 3.0', mode: 'Image to video', place: 'Comfy Router', workflow: null }), 'Kling 3.0 image to video · Comfy Router');
assert.equal(videoWorkflowLine({ model: 'MiniMax H3', mode: 'Start + end frame', place: 'Your computer', workflow: { source: 'ours', name: 'h3-flf-api.json', url: null, author: 'us', licence: 'AGPL' } as any }), 'MiniMax H3 start + end frame · Your computer · ours');
console.log('ok mode prompt: only when needed, per model, default for an empty image prompt');

// The same parser powers preview and submit; no job or network request is needed to compare them.
for (const prompt of [whale, 'a whale glides past', '', st]) {
  const fields = { types: '["i2v"]', prompt, provider: 'comfy-h3', runOn: 'local' };
  const parsed = await parse(fields);
  const peek = await promptPeek(h3VideoTool, fields, { image: 1 });
  assert.ok(!('error' in peek), JSON.stringify(peek));
  if ('error' in peek) throw new Error(peek.error);
  assert.equal(peek.prompt, parsed.finalPrompt);
  assert.equal(parsed.prompt, prompt, 'Recreate keeps the original words');
  assert.match(peek.workflowLine ?? '', /Your computer/);
}
const routerPeek = await promptPeek(h3VideoTool, { types: '["i2v"]', prompt: whale, provider: 'router-kling', runOn: 'comfy-cloud' }, { image: 1 });
assert.ok(!('error' in routerPeek));
if (!('error' in routerPeek)) assert.match(routerPeek.workflowLine ?? '', /Comfy Router/);

fs.unlinkSync(path.join(DATA_DIR, photo));
