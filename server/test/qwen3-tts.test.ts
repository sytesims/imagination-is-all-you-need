// Qwen3 TTS 1.7B (local, open weights; 2026-10-27): ONE "Qwen3 TTS" card (comfy-qwen3tts) on Audio · Voiceover and Voice Studio · Voiceover, the paid
// direct Alibaba entry retired. Plan / graph shape against the node's live schema (GET /object_info/FB_Qwen3TTSCustomVoice, transcribed 2026-10-27),
// speaker / language / Style mapping, script limit, availability gating (node + model files), Recreate prefill. In-process, mock backend, no network.
// Run: npx tsx test/qwen3-tts.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'qwen3tts-')); const MODELS = path.join(D, 'models');
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0',
  OPENHIGGSFIELD_COMFY_MODELS_DIR: MODELS, OPENHIGGSFIELD_ENFORCE_WEIGHTS: '1' });
for (const k of ['COMFY_BASE_URL', 'OPENHIGGSFIELD_HW_MOCK']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);

const Q = await import('../src/tools/voice/qwen3tts.js');
const { parseVoiceControls, VOICE_CAPS } = await import('../src/tools/voice/voiceControls.js');
const { buildPlan, hasPlan } = await import('../src/comfy/plans.js');
const { getTool, listTools } = await import('../src/tools/registry.js');
const { getProvider } = await import('../src/providers.js');
const { RETIRED_MODELS } = await import('../src/shared/lifecycle.js');
const { MODELS: MODEL_DEFS, engineModelKey } = await import('../src/shared/modelIds.js');
const { promptGrammarOf } = await import('../src/shared/promptGrammar.js');
const { audioWorkflowCredit } = await import('../src/shared/audioWorkflows.js');
const { workflowNodeClasses, setComfyNodes } = await import('../src/comfyNodes.js');
const R = await import('../src/hardware/requirements.js');
const { formFromInput } = await import('../src/routesPrefill.ts');

// The node's schema as ComfyUI reports it (flybirdxx/ComfyUI-Qwen-TTS @374c2e0): required inputs and their options.
const SCHEMA = { required: { text: 'STRING', speaker: ['Aiden', 'Dylan', 'Eric', 'Ono_anna', 'Ryan', 'Serena', 'Sohee', 'Uncle_fu', 'Vivian'], model_choice: ['0.6B', '1.7B'], device: ['auto', 'cuda', 'xpu', 'mps', 'cpu'], precision: ['bf16', 'fp32'],
  language: ['Auto', 'Chinese', 'English', 'Japanese', 'Korean', 'French', 'German', 'Spanish', 'Portuguese', 'Russian', 'Italian'] },
  optional: { seed: [0, 18446744073709551615], instruct: 'STRING', max_new_tokens: [512, 4096], top_p: [0, 1], top_k: [0, 100], temperature: [0.1, 2], repetition_penalty: [1, 2], attention: ['auto', 'sage_attn', 'flash_attn', 'sdpa', 'eager'], unload_model_after_generate: 'BOOLEAN', custom_model_path: 'STRING', custom_speaker_name: 'STRING' } } as const;
const validate = (g: Record<string, any>) => { const n = g['1']; assert.equal(n.class_type, Q.QWEN3_TTS_NODE); const all: Record<string, any> = { ...SCHEMA.required, ...SCHEMA.optional };
  for (const k of Object.keys(SCHEMA.required)) assert.ok(k in n.inputs, `required input ${k}`);
  for (const [k, v] of Object.entries<any>(n.inputs)) { const s = all[k]; assert.ok(s, `input ${k} is in the node's schema`);
    if (Array.isArray(s) && typeof s[0] === 'string') assert.ok(s.includes(v), `${k}=${v} is one of the node's options`);
    else if (Array.isArray(s)) assert.ok(typeof v === 'number' && v >= s[0] && v <= s[1], `${k}=${v} in range`);
    else if (s === 'STRING') assert.equal(typeof v, 'string'); else if (s === 'BOOLEAN') assert.equal(typeof v, 'boolean'); }
  assert.equal(g['2'].class_type, 'SaveAudio'); assert.deepEqual(g['2'].inputs.audio, ['1', 0]); assert.deepEqual(Object.keys(g).sort(), ['1', '2']); };

// ---- 1. the workflow file + plans: Audio (voice mode), Voice Studio voiceover with and without a clip ----
{ const g = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../workflows', Q.QWEN3_TTS_WORKFLOW), 'utf8')); validate(g);
  assert.equal(g['1'].inputs.model_choice, '1.7B', 'only the 1.7B is downloaded'); assert.equal(g['1'].inputs.device, 'auto', 'any GPU (mps on a Mac)'); assert.deepEqual(workflowNodeClasses(Q.QWEN3_TTS_WORKFLOW).sort(), ['FB_Qwen3TTSCustomVoice', 'SaveAudio']); }
const pl = (toolId: string, input: any) => buildPlan({ id: 'x', toolId, provider: Q.QWEN3_TTS, input } as any);
const vf = (f: Record<string, string>, text = 'Hello there.') => { const v = parseVoiceControls(f, Q.QWEN3_TTS, 0, text); assert.ok(v.ok, JSON.stringify(!v.ok && v.issues)); return v.ok ? v.native : {}; };
{ // Audio tool, voice mode: the script, the picked voice, language and Style reach node 1
  const native = vf({ speaker: 'Sohee', speechLanguage: 'ko', voiceDetails: 'Warm, excited, like a friendly trailer narrator.' });
  assert.deepEqual(native, { instruct: 'Warm, excited, like a friendly trailer narrator.', speaker: 'Sohee', language: 'ko' });
  const p = pl('audio', { mode: 'voice', types: ['voice'], audioKind: 'voice', prompt: '  Hello there.  ', seed: 42, voiceNative: native });
  assert.equal(p.outKind, 'audio'); assert.equal(p.passes.length, 1); const ps = p.passes[0]; assert.equal(ps.workflow, Q.QWEN3_TTS_WORKFLOW); assert.equal(ps.output, '2'); validate(ps.graph);
  assert.deepEqual({ ...ps.graph['1'].inputs, max_new_tokens: 0 }, { text: 'Hello there.', speaker: 'Sohee', model_choice: '1.7B', device: 'auto', precision: 'bf16', language: 'Korean', seed: 42, instruct: 'Warm, excited, like a friendly trailer narrator.',
    max_new_tokens: 0, top_p: 1, top_k: 50, temperature: 0.9, repetition_penalty: 1.05, attention: 'auto', unload_model_after_generate: false });
  assert.equal(ps.expect.speaker, 'Sohee'); assert.equal(ps.expect.language, 'Korean');
  assert.ok(hasPlan({ id: 'x', toolId: 'audio', provider: Q.QWEN3_TTS, input: { audioKind: 'voice' } } as any), 'Audio · Voice runs it locally'); }
{ // defaults: no fields → Ryan, Auto, no Style; every speaker / language maps to a node option
  const native = vf({}); assert.deepEqual(native, { speaker: 'Ryan', language: 'auto' });
  const g = pl('audio', { mode: 'voice', types: ['voice'], audioKind: 'voice', prompt: 'Hi.', seed: 1, voiceNative: native }).passes[0].graph; validate(g);
  assert.equal(g['1'].inputs.speaker, 'Ryan'); assert.equal(g['1'].inputs.language, 'Auto'); assert.equal(g['1'].inputs.instruct, '');
  for (const s of Q.QWEN3_TTS_SPEAKERS) validate(pl('audio', { mode: 'voice', types: ['voice'], audioKind: 'voice', prompt: 'Hi.', voiceNative: vf({ speaker: s.id }) }).passes[0].graph);
  for (const l of Q.QWEN3_TTS_LANGUAGES) assert.equal(pl('audio', { mode: 'voice', types: ['voice'], audioKind: 'voice', prompt: 'Hi.', voiceNative: vf({ speechLanguage: l.value }) }).passes[0].graph['1'].inputs.language, l.node);
  assert.equal(Q.QWEN3_TTS_SPEAKERS.length, 9); assert.deepEqual(Q.QWEN3_TTS_SPEAKERS.map((s) => s.id).sort(), [...SCHEMA.required.speaker].sort(), 'the 9 voices are exactly the node\'s');
  assert.ok(Q.QWEN3_TTS_SPEAKERS.every((s) => s.hint), 'each voice says its native language'); }
{ // Voice Studio voiceover: no clip → audio back (Audio page's Voiceover); with a clip → muxed onto it
  const native = vf({ speaker: 'Aiden' });
  const a = pl('voice', { mode: 'voiceover', types: ['voiceover'], prompt: 'Over the hills.', seed: 7, voiceNative: native, videoPath: '' });
  assert.equal(a.outKind, 'audio'); assert.equal(a.muxOnto, undefined); assert.equal(a.passes[0].graph['1'].inputs.speaker, 'Aiden'); validate(a.passes[0].graph);
  const v = pl('voice', { mode: 'voiceover', types: ['voiceover'], prompt: 'Over the hills.', seed: 7, voiceNative: native, videoPath: '/tmp/clip.mp4' });
  assert.equal(v.outKind, 'video'); assert.equal((v as any).muxOnto.video, '/tmp/clip.mp4'); validate(v.passes[0].graph);
  assert.ok(hasPlan({ id: 'x', toolId: 'voice', provider: Q.QWEN3_TTS, input: { mode: 'voiceover' } } as any)); assert.ok(!hasPlan({ id: 'x', toolId: 'voice', provider: Q.QWEN3_TTS, input: { mode: 'change-voice' } } as any), 'voiceover only');
  // the shared fix: Chatterbox on the Audio page's Voiceover with no clip now returns audio too (was "Voice Studio needs a video")
  const cb = buildPlan({ id: 'x', toolId: 'voice', provider: 'comfy-chatterbox', input: { mode: 'voiceover', types: ['voiceover'], prompt: 'Hi.', videoPath: '' } } as any); assert.equal(cb.outKind, 'audio');
  assert.throws(() => buildPlan({ id: 'x', toolId: 'voice', provider: 'comfy-f5tts', input: { mode: 'voiceover', types: ['voiceover'], prompt: 'Hi.', videoPath: '' } } as any), /voice sample/); }
ok('1 graph matches the node schema; Audio · Voice and Voice Studio · Voiceover (audio without a clip, muxed with one); speaker / language / Style mapped');

// ---- 2. validation: bad voice / language, Style, the script limit, other models refuse the fields ----
{ const bad = parseVoiceControls({ speaker: 'Cherry' }, Q.QWEN3_TTS, 0); assert.ok(!bad.ok && bad.issues[0].field === 'speaker');
  const badL = parseVoiceControls({ speechLanguage: 'ar' }, Q.QWEN3_TTS, 0); assert.ok(!badL.ok && badL.issues[0].field === 'speechLanguage');
  const clone = parseVoiceControls({}, Q.QWEN3_TTS, 1); assert.ok(!clone.ok && clone.issues[0].field === 'voiceAudio', 'no cloning (CustomVoice)');
  const mood = parseVoiceControls({ mood: '0.8' }, Q.QWEN3_TTS, 0); assert.ok(!mood.ok, 'no mood control');
  const style = parseVoiceControls({ voiceDetails: 'x'.repeat(501) }, Q.QWEN3_TTS, 0); assert.ok(!style.ok && style.issues[0].field === 'voiceDetails');
  const post = parseVoiceControls({ speed: '1.25' }, Q.QWEN3_TTS, 0); assert.ok(post.ok && post.post.speed === 1.25, 'speed applied after (ffmpeg)');
  const long = parseVoiceControls({}, Q.QWEN3_TTS, 0, 'a'.repeat(Q.QWEN3_TTS_MAX_CHARS + 1)); assert.ok(!long.ok && long.issues[0].field === 'prompt' && long.issues[0].code === 'too_long', 'very long script → 400');
  assert.ok(parseVoiceControls({}, Q.QWEN3_TTS, 0, 'a'.repeat(Q.QWEN3_TTS_MAX_CHARS)).ok, 'exactly the limit is fine');
  const cb = parseVoiceControls({ speaker: 'Ryan' }, 'comfy-chatterbox', 0); assert.ok(!cb.ok && cb.issues[0].field === 'speaker', 'another model refuses a Qwen voice');
  const cbS = parseVoiceControls({ voiceDetails: 'warm' }, 'comfy-chatterbox', 0); assert.ok(!cbS.ok, 'Style only where the model takes it');
  assert.ok(parseVoiceControls({}, 'comfy-chatterbox', 0, 'a'.repeat(5000)).ok, 'no limit for other models');
  // token budget follows the script, within the node's range
  assert.equal(Q.qwen3TtsMaxTokens('Hi.'), 512); assert.equal(Q.qwen3TtsMaxTokens('a'.repeat(Q.QWEN3_TTS_MAX_CHARS)), 3840, '2,000 chars at a slow 10/s, 12.5 tokens/s, +50%'); assert.ok(Q.qwen3TtsMaxTokens('a'.repeat(100000)) <= 4096); }
{ // the tool parse: Audio page Voiceover (voice tool, no clip) — 400s, and a good job
  const t = getTool('voice')!; const base = { types: '["voiceover"]', provider: Q.QWEN3_TTS };
  const empty: any = await t.parseInput({ ...base, prompt: '   ' }, {}); assert.ok(empty.error, 'empty script blocked');
  const long: any = await t.parseInput({ ...base, prompt: 'word '.repeat(500) }, {}); assert.ok(long.error && long.issues?.[0]?.field === 'prompt', `long script blocked: ${long.error}`);
  const good: any = await t.parseInput({ ...base, prompt: 'Tonight, one small robot is about to change everything.', speaker: 'Vivian', speechLanguage: 'en', voiceDetails: 'calm' }, {});
  assert.ok(!good.error, good.error); assert.deepEqual(good.voiceNative, { instruct: 'calm', speaker: 'Vivian', language: 'en' }); assert.equal(good.voiceFields.speaker, 'Vivian'); assert.equal(good.outKind, 'audio');
  // Recreate gives the voice, language and Style back
  const { form } = formFromInput(t, { id: 'j', toolId: 'voice', provider: Q.QWEN3_TTS, input: good } as any, { sameSeed: false });
  assert.equal(form.speaker, 'Vivian'); assert.equal(form.speechLanguage, 'en'); assert.equal(form.voiceDetails, 'calm'); assert.equal(form.prompt, 'Tonight, one small robot is about to change everything.'); }
ok('2 400s: unknown voice / language, a sample (no cloning), mood, Style > 500, script > 2,000; other models refuse Qwen fields; Recreate prefill');

// ---- 3. one card: the direct Alibaba entry is gone everywhere; the local one is on both voice lists ----
{ assert.equal(getProvider('direct-qwen3-tts'), undefined, 'direct entry not registered'); assert.ok(RETIRED_MODELS['direct-qwen3-tts'], 'listed as retired');
  for (const t of listTools() as any[]) { const ids = (t.providers ?? []).map((p: any) => (typeof p === 'string' ? p : p.id)); assert.ok(!ids.includes('direct-qwen3-tts'), `${t.id} still lists direct-qwen3-tts`); }
  for (const id of ['audio', 'voice']) { const t: any = getTool(id); const ids = t.providers.map((p: any) => (typeof p === 'string' ? p : p.id)); assert.equal(ids.filter((p: string) => /qwen3/.test(p)).length, 1, `${id}: one Qwen3 TTS`);
    assert.ok(ids.includes(Q.QWEN3_TTS)); assert.deepEqual(t.app.providerModes[Q.QWEN3_TTS], [id === 'audio' ? 'voice' : 'voiceover']); assert.ok(t.workflows.includes(Q.QWEN3_TTS_WORKFLOW)); assert.ok(t.app.voiceCaps[Q.QWEN3_TTS].voices.length === 9); }
  const p = getProvider(Q.QWEN3_TTS)!; assert.equal(p.kind, 'open-weights'); assert.deepEqual(p.nodes, ['FB_Qwen3TTSCustomVoice']); assert.deepEqual(p.licenseParts, ['apache-2.0']);
  const key = engineModelKey('voice', Q.QWEN3_TTS); assert.equal(key, 'qwen3-tts'); assert.equal(MODEL_DEFS['qwen3-tts'].name, 'Qwen3 TTS 1.7B', 'the real model shown'); assert.equal(MODEL_DEFS['qwen3-tts'].openWeights, true);
  assert.equal(Object.values(MODEL_DEFS).filter((m: any) => /qwen3 tts/i.test(m.name)).length, 1, 'one Qwen3 TTS model');
  const gr: any = promptGrammarOf('qwen3-tts'); assert.ok(gr && gr.name === 'Qwen3 TTS 1.7B' && gr.prompt === 'required');
  const credit: any = audioWorkflowCredit('voiceover', Q.QWEN3_TTS); assert.equal(credit?.file, Q.QWEN3_TTS_WORKFLOW);
  assert.equal(VOICE_CAPS[Q.QWEN3_TTS].controls.voiceDetails.via, 'native'); assert.equal(VOICE_CAPS[Q.QWEN3_TTS].detailsLabel, 'Style'); }
ok('3 one Qwen3 TTS card (local, "Qwen3 TTS 1.7B", Apache-2.0); direct-qwen3-tts unregistered and retired; grammar, credit and caps in place');

// ---- 4. availability: runnable only with the node and the model folder ----
{ const tool = getTool('voice')!; const IN = { types: ['voiceover'], mode: 'voiceover' };
  setComfyNodes(['SaveAudio']); const g1 = R.weightsGate(tool, Q.QWEN3_TTS, IN); assert.equal(g1?.code, 'nodes_missing'); assert.deepEqual(g1?.missingNodes, ['FB_Qwen3TTSCustomVoice']);
  setComfyNodes(['SaveAudio', 'FB_Qwen3TTSCustomVoice']); R.clearRequirementsCache();
  const g2 = R.weightsGate(tool, Q.QWEN3_TTS, IN); assert.equal(g2?.code, 'weights_missing', 'node there, model folder not');
  assert.deepEqual(g2!.missingFiles.map((f) => f.file).sort(), ['Qwen3-TTS-12Hz-1.7B-CustomVoice/model.safetensors', 'Qwen3-TTS-12Hz-1.7B-CustomVoice/speech_tokenizer/model.safetensors']);
  assert.equal(g2!.downloadable, false, 'a model folder: installed by hand, never a one-click partial download');
  const dir = path.join(MODELS, 'qwen-tts', 'Qwen3-TTS-12Hz-1.7B-CustomVoice'); fs.mkdirSync(path.join(dir, 'speech_tokenizer'), { recursive: true });
  for (const [f, n] of [['model.safetensors', 3833402552], ['speech_tokenizer/model.safetensors', 682293092]] as const) { const fd = fs.openSync(path.join(dir, f), 'w'); fs.ftruncateSync(fd, n); fs.closeSync(fd); } // sparse stand-ins
  R.clearRequirementsCache(); assert.equal(R.weightsGate(tool, Q.QWEN3_TTS, IN), null, 'node + model → runnable');
  const req = R.requirementsFor(tool, Q.QWEN3_TTS, IN)!; assert.deepEqual(req.missingFiles, []); assert.equal(req.workflows[0], `workflows/${Q.QWEN3_TTS_WORKFLOW}`);
  setComfyNodes(undefined); }
ok('4 availability: nodes_missing without FB_Qwen3TTSCustomVoice, weights_missing without the model folder (not one-click), runnable with both');
// ---- 5. garbled takes (2026-10-27): long Style / "..." reshaped before the node, token budget fits a slow read ----
{ const narr = 'Deep, low, hushed nature documentary narrator. Calm, slow and full of quiet wonder, with long pauses.'; // 5 of 6 takes babbled
  const graphOf = (prompt: string, voiceDetails?: string, speechLanguage = 'en') => { const g = pl('audio', { mode: 'voice', types: ['voice'], audioKind: 'voice', prompt, seed: 5, voiceNative: vf({ speaker: 'Aiden', speechLanguage, ...(voiceDetails ? { voiceDetails } : {}) }, prompt) }).passes[0].graph; validate(g); return g['1'].inputs; };
  const a = graphOf('The forest sleeps... Then, a sound. Wait... what was that?', narr);
  assert.equal(a.instruct, 'Deep, low, hushed nature documentary narrator. Calm, slow and full of quiet wonder.', 'the pause request is dropped, the rest kept word for word');
  assert.ok(a.instruct.length <= Q.QWEN3_TTS_INSTRUCT_MAX); assert.equal(a.text, 'The forest sleeps. Then, a sound. Wait, what was that?', 'ellipses: full stop before a new sentence, comma inside one');
  const ok85 = 'Low, intimate, whispery narrator of a tense thriller trailer. Slow, grave and suspenseful.'; // the Style that worked: sent unchanged
  assert.equal(graphOf('He is here.', ok85).instruct, ok85);
  assert.equal(graphOf('Hi.', 'Very happy.').instruct, 'Very happy.'); assert.equal(graphOf('Hi.').instruct, '', 'no Style → empty instruct');
  assert.equal(graphOf('Hi.', 'Pauses.').instruct, '', 'a Style that only asks for pauses sends nothing');
  const long = graphOf('Hi.', 'A warm and friendly and bright and slightly husky voice that sounds like an old radio host who has seen it all and still loves every song'); // one long sentence
  assert.ok(long.instruct.length <= Q.QWEN3_TTS_INSTRUCT_MAX && long.instruct.endsWith('.') && !/\b(and|of|that|who)\.$/.test(long.instruct), long.instruct);
  const multi = graphOf('Hi.', '"Calm."\n\nSlow; with dramatic beats... and breaths. Third sentence that is quite long and would push the whole instruction well past the limit we send.');
  assert.equal(multi.instruct, 'Calm. Slow.', 'quotes / newlines gone, pause clauses dropped, whole sentences up to the limit');
  for (const [t, want] of [['And then...', 'And then.'], ['... It began.', 'It began.'], ['Hmm…okay!!!', 'Hmm, okay!'], ['One. . . two', 'One, two'], ['Version 2.5 is here.', 'Version 2.5 is here.']] as const) assert.equal(Q.qwen3TtsText(t), want, t);
  assert.equal(graphOf('其实……我知道。', undefined, 'zh').text, '其实，我知道。', 'CJK ellipsis → full-width comma');
  // seed: the job's seed, inside the node's range; sampling: the checkpoint's own defaults (generation_config.json), never changed by the patch
  assert.equal(a.seed, 5); assert.deepEqual([a.temperature, a.top_k, a.top_p, a.repetition_penalty], [0.9, 50, 1, 1.05]);
  // token budget: 12.5 codec tokens per second, a slow 10 characters a second (CJK ×2.5), +50%, in 512–4096 steps of 256
  assert.equal(a.max_new_tokens, 512); assert.equal(Q.qwen3TtsMaxTokens('a'.repeat(400)), 768); assert.equal(Q.qwen3TtsMaxTokens('其'.repeat(200)), 1024, 'CJK reads slower: never cut off');
  assert.ok(Q.qwen3TtsMaxTokens('其'.repeat(200)) / 12.5 >= 200 / 4, '200 Chinese characters (~50 s at 4/s) fit');
  for (const n of [1, 150, 777, 2000]) { const t = Q.qwen3TtsMaxTokens('a'.repeat(n)); assert.ok(t % 256 === 0 && t >= 512 && t <= 4096 && t / 12.5 >= n / 10, `${n}: ${t}`); }
  assert.equal(pl('voice', { mode: 'voiceover', types: ['voiceover'], prompt: 'Over the hills...', seed: 7, voiceNative: vf({ voiceDetails: narr }), videoPath: '' }).passes[0].graph['1'].inputs.text, 'Over the hills.', 'Voice Studio voiceover gets the same patch'); }
ok('5 long Style reshaped (pause asks dropped, ≤100 chars, whole sentences), ellipses normalised (Latin + CJK), checkpoint sampling kept, token budget fits a slow read');
console.log('qwen3-tts: all ok');
process.exit(0);
