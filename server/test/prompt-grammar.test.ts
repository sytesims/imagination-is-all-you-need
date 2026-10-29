/** Prompt grammar (2026-10-26, step 1): every model the app offers has a grammar entry (shared/promptGrammar.ts), known or an explicit unknown with
 *  a reason; every entry has a source URL; the ref helper speaks each model's own syntax on the edge cases (tags, 0-based, words, none, places).
 *  Run: npx tsx test/prompt-grammar.test.ts (temp data dir, mock backend, no keys, no network). */
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'promptgrammar-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
const { listTools } = await import('../src/tools/registry.js');
const R = await import('../src/routing/modelRegistry.js');
const { MODELS } = await import('../src/shared/modelIds.js');
const { THREE_D_MODELS } = await import('../src/shared/threeD.js');
const { PROMPT_GRAMMAR, GRAMMAR_MISMATCHES, promptGrammarOf, refToken } = await import('../src/shared/promptGrammar.js');
const ok = (m: string) => console.log('ok ' + m);

// every model key the app offers: every tool's models, the registry, the 3D models
const offered = new Set<string>([...Object.keys(MODELS), ...THREE_D_MODELS.map((m: { id: string }) => m.id)]);
for (const tool of listTools()) for (const m of R.toolModels(tool)) offered.add(m.key);
const missing = [...offered].filter((k) => !PROMPT_GRAMMAR[k]);
assert.deepEqual(missing, [], `models with no prompt grammar entry: ${missing.join(', ')}`);
const extra = Object.keys(PROMPT_GRAMMAR).filter((k) => !offered.has(k));
assert.deepEqual(extra, [], `grammar entries for keys the app doesn't offer (no new ids): ${extra.join(', ')}`);

let unknown = 0;
for (const [k, e] of Object.entries(PROMPT_GRAMMAR)) {
  assert.equal(e.key, k, `${k}: key matches`);
  if (e.status === 'unknown') { unknown++; assert.ok(e.reason && e.reason.length > 10, `${k}: unknown needs a reason`); }
  assert.ok(e.sources.length > 0, `${k}: at least one source`);
  for (const s of [...e.sources, ...e.refs.src, ...(e.limits?.src ?? [])]) assert.match(s.url, /^https:\/\//, `${k}: source is a URL`);
  assert.ok(e.example.trim() && e.structure.trim(), `${k}: example and structure`);
  if (e.refs.style === 'tag') assert.ok(e.refs.image || e.refs.video || e.refs.audio || e.refs.element, `${k}: a tag style names a token`);
}
ok(`${offered.size} offered models, ${Object.keys(PROMPT_GRAMMAR).length} entries, ${unknown} unknown (with reasons), every one sourced`);

// edge cases: tags (Kling), 0-based (FLUX 3 Klein local), words (Seedance), native vs hosted H3, fal place, no refs, 3D, audio
assert.equal(refToken('kling-v3', 'image', 2), '<<<image_2>>>');
assert.equal(refToken('kling-v3-omni-edit', 'video', 1), '<<<video_1>>>');
assert.equal(refToken('flux-3-klein', 'image', 1), '<ref_image_0>');
assert.equal(refToken('seedance-2.0', 'audio', 1), 'Audio 1');
assert.equal(refToken('seedance-2.0', 'image', 3, 'fal'), '@Image3');
assert.equal(refToken('minimax-h3', 'image', 1), 'Image 1');
assert.equal(refToken('minimax-h3', 'image', 1, 'local'), '<Picture 1>');
assert.equal(refToken('qwen-image-2.1', 'image', 2), '<image2>');
assert.equal(refToken('kling-image-o1', 'image', 1, 'fal'), '@Image1');
assert.equal(refToken('veo-3.1', 'image', 1), null, 'Veo: frames only, nothing to name');
assert.equal(refToken('fal-trellis2', 'image', 1), null, '3D image-only: no prompt');
assert.equal(promptGrammarOf('fal-trellis2')!.prompt, 'none');
assert.equal(promptGrammarOf('yue2')!.kind, 'music');
assert.ok(promptGrammarOf('minimax-h3-crossview')!.triggers!.includes('crossview.'), 'LoRA trigger recorded');
assert.equal(promptGrammarOf('nope'), null);
ok('ref tokens per model and place: tags, zero-based, words, native vs hosted, none');

for (const m of GRAMMAR_MISMATCHES) for (const k of m.models) assert.ok(PROMPT_GRAMMAR[k], `mismatch ${m.id}: model ${k} has an entry`);
assert.deepEqual(GRAMMAR_MISMATCHES.map((m) => m.rank), GRAMMAR_MISMATCHES.map((_, n) => n + 1), 'mismatch ranks are 1..n');
ok(`${GRAMMAR_MISMATCHES.length} mismatches, each on known models`);
