/** Prompt grammar step 2 (2026-10-26): the plain-words tips the model cards, reference chips, enhancer and MCP show (shared/promptTips.ts),
 *  and the per-model voice tag chips (tools/voiceTags.ts) served on the Audio / Voice tools.
 *  Run: npx tsx test/prompt-tips.test.ts (temp data dir, mock backend, no keys, no network). */
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'prompttips-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
const { promptTipOf, refChipTip, enhancerGuide } = await import('../src/shared/promptTips.js');
const { PROMPT_GRAMMAR } = await import('../src/shared/promptGrammar.js');
const { getTool } = await import('../src/tools/registry.js');
const ok = (m: string) => console.log('ok ' + m);

const k = promptTipOf('kling-v3')!; assert.equal(k.refs, 'We send @image1 as <<<image_1>>>.'); assert.equal(k.limit, 'Up to 2,500 characters'); assert.match(k.negative!, /write what to leave out/);
assert.equal(promptTipOf('seedance-2.0')!.refs, 'We send @image1 as Image 1, @video1 as Video 1, @audio1 as Audio 1.');
assert.equal(promptTipOf('flux-3-klein')!.refs, 'We send @image1 as <ref_image_0> (counts from 0).');
assert.match(promptTipOf('gpt-image')!.refs, /order you add them/);
assert.match(promptTipOf('veo-3.1')!.refs, /start frame/);
assert.equal(promptTipOf('minimax-h3-crossview')!.triggers, 'Starts with: crossview.');
assert.equal(promptTipOf('fal-trellis2')!.noPrompt, true);
assert.equal(promptTipOf('nope'), null);
// every entry gives a tip with short lines (the card clamps at 3 lines of ~44 characters)
for (const key of Object.keys(PROMPT_GRAMMAR)) { const t = promptTipOf(key)!; assert.ok(t.refs.length <= 130, `${key}: refs line ${t.refs.length}`); }
ok('model card tips: tags, words, zero-based, order, frames, triggers, no prompt; every model fits the card');

assert.equal(refChipTip('kling-v3', 'image', 2), 'Photo 2 · @image2 · Kling 3.0 Omni reads it as <<<image_2>>>');
assert.equal(refChipTip('kling-v3', 'image', 9), 'Photo 9 · @image9 · Kling 3.0 Omni takes 7; this one isn\'t sent');
assert.match(refChipTip('veo-3.1', 'image', 1), /can't name it/);
assert.match(refChipTip('nano-banana-2', 'image', 2), /reads it by order/);
ok('reference chip tips, including a ref past the model\'s limit');

const g = enhancerGuide('minimax-h3')!; assert.match(g, /Target model: MiniMax H3\./); assert.match(g, /Timeline/); assert.match(g, /Image 1/);
assert.equal(enhancerGuide('fal-trellis2'), null);
ok('enhancer guide carries structure, syntax and references');

const app: any = getTool('voice')!.app; const by = app.metaTagsByProvider;
assert.ok(by['api-eleven-v3'].some((t: any) => t.tag.startsWith('[whispers]')), 'ElevenLabs v3 [tags]');
assert.ok(by['direct-minimax-speech'].some((t: any) => t.tag === '(laughs) ') && by['direct-minimax-speech'].some((t: any) => t.tag === '<#0.8#> '), 'MiniMax (sounds) and <#pauses#>');
assert.equal(app.metaTagStyles['direct-minimax-speech'].custom, null, 'MiniMax: fixed list, no free [tags]');
assert.deepEqual(app.metaTagProviders, ['comfy-drama3'], 'older clients keep Drama 3 only');
ok('voice tag chips per model: Drama 3, ElevenLabs v3, MiniMax Speech');

// the enhancer, per model: never past the model's cap, never cut; the LLM gets the model's structure, syntax and references
const { enhanceRules, enhancePrompt } = await import('../src/cinema/enhance.js');
const near = 'a quiet harbour at dawn with fishing boats and gulls, ' .repeat(14).trim(); // ~770 characters
const w = enhanceRules(near, 'image', undefined, 'wan-image-2.5'); assert.ok(w.prompt.length <= 800, `Wan 2.5 cap: ${w.prompt.length}`); assert.equal(w.forModel, 'Wan 2.5 Image');
const over = 'x'.repeat(900); const wo = enhanceRules(over, 'image', undefined, 'wan-image-2.5'); assert.equal(wo.prompt, over); assert.deepEqual(wo.added, []); assert.match(wo.note!, /up to 800 characters/);
const http = await import('node:http'); let seen = '';
const stub = http.createServer((q, s) => { let b = ''; q.on('data', (c) => (b += c)); q.on('end', () => { seen = JSON.parse(b).messages[0].content; s.setHeader('content-type', 'application/json'); s.end(JSON.stringify({ choices: [{ message: { content: 'Image 1 crosses a rope bridge in fog; slow push in. Sound: wind.' } }] })); }); });
await new Promise<void>((ok) => stub.listen(0, '127.0.0.1', () => ok())); process.env.OPENHIGGSFIELD_ENHANCE_LLM_URL = `http://127.0.0.1:${(stub.address() as any).port}/v1/chat/completions`;
const llm = await enhancePrompt('@image1 crosses a bridge', 'video', undefined, 'minimax-h3'); stub.close(); delete process.env.OPENHIGGSFIELD_ENHANCE_LLM_URL;
assert.equal(llm.source, 'llm'); assert.match(seen, /Target model: MiniMax H3\./); assert.match(seen, /Timeline/); assert.match(seen, /under 50000 characters/);
ok(`enhancer per model: Wan 2.5 stays under 800 (${w.prompt.length}); over-cap prompts untouched with a note; the LLM gets "${seen.slice(seen.indexOf('Target'), seen.indexOf('Target') + 60)}…"`);
