// Unit: Keep the background (2026-11-01). Translate a video and Change Voice split voice from music first when the separation pack + model are here
// (comfy/separation.ts), else run as before with a plain note; the final mix's ffmpeg arguments (comfy/dubMix.ts). Pure: no ComfyUI, no ffmpeg run.
// Run: npx tsx test/voice-separation.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'vsep-'));
process.env.OPENHIGGSFIELD_DATA_DIR ??= path.join(D, 'data');
const { buildPlan } = await import('../src/comfy/plans.js');
const S = await import('../src/comfy/separation.js');
const { voiceMixArgs } = await import('../src/comfy/dubMix.js');
const ok = (m: string) => console.log('ok', m);
const job = (provider: string, input: Record<string, any>) => ({ id: 'vs', toolId: 'voice', provider, input: { videoPath: '/clip.mp4', language: 'es', ...input } });
const files = (g: any) => JSON.stringify(g).match(/"__file":"[^"]+"/g) ?? [];

// --- Translate, separation on: pass 0 = the official template; the voice pass clones from the vocals stem and transcribes it; the mix keeps the background
for (const provider of ['local-whisper-nllb-chatterbox', 'local-whisper-nllb-f5']) {
  const p = buildPlan(job(provider, { mode: 'translate' }) as any, { separation: true });
  assert.equal(p.separation, true); assert.equal(p.passes.length, 2, provider);
  assert.equal(p.passes[0].workflow, S.SEPARATION_WORKFLOW); assert.equal(p.passes[0].output, '4'); assert.deepEqual(p.passes[0].extraOutputs, [{ node: '5', label: 'Background' }]);
  assert.equal(p.passes[0].graph['3'].class_type, 'MelBandRoFormerSampler'); assert.deepEqual(p.passes[0].graph['1'].inputs.audio, { __file: '/clip.mp4' });
  const prep = p.passes[1].prep!; const ref = prep.find((x) => x.kind === 'fileFromPass') as any; const sp = prep.find((x) => x.kind === 'speechLines') as any;
  assert.deepEqual(ref, { kind: 'fileFromPass', from: { pass: 0, index: 0 }, node: '1', field: 'audio' }, `${provider}: clone from the vocals stem`);
  assert.deepEqual(sp.srcPass, { pass: 0, index: 0 }, `${provider}: transcribe the vocals`);
  assert.ok(prep.indexOf(ref) < prep.indexOf(sp));
  assert.deepEqual(p.post, { kind: 'voiceMix', pass: 1, beds: [{ from: { pass: 0, index: 1 }, volume: 1 }], lines: true, maxSpeed: 1.2 });
  assert.deepEqual([sp.node, sp.save], ['2', '3'], 'every line voiced in the pass (translate-dub.test.ts)');
  assert.deepEqual(p.muxOnto, { video: '/clip.mp4', mix: 'replace' }, 'the mixed track replaces the clip sound');
  assert.deepEqual(p.notes, []);
}
ok('translate + separation: template pass, vocals as clone ref and transcript, background under the voice');
{ // blend: the original voice ducked under the new one, the background at full level
  const p = buildPlan(job('local-whisper-nllb-chatterbox', { mode: 'translate', mix: 'blend' }) as any, { separation: true });
  assert.deepEqual((p.post as any).beds, [{ from: { pass: 0, index: 1 }, volume: 1 }, { from: { pass: 0, index: 0 }, volume: 0.25 }]);
  // a voice sample to clone: the sample stays the reference, the vocals are still transcribed
  const q = buildPlan(job('local-whisper-nllb-chatterbox', { mode: 'translate', voiceSamplePath: '/me.wav' }) as any, { separation: true });
  assert.equal(q.passes[1].prep!.some((x) => x.kind === 'fileFromPass'), false); assert.deepEqual(q.passes[1].graph['1'].inputs.audio, { __file: '/me.wav' });
}
ok('translate + separation: blend ducks the original voice; an uploaded voice sample stays the clone reference');

// --- Translate, no separation: one voice pass (lines placed as usual) + the note; blend keeps today's whole original at 25 % under the voice
for (const mix of ['replace', 'blend']) {
  const p = buildPlan(job('local-whisper-nllb-chatterbox', { mode: 'translate', mix }) as any, { separation: false });
  assert.equal(p.separation, false); assert.equal(p.passes.length, 1); assert.equal(p.passes[0].workflow, 'voice-chatterbox-ml-api.json');
  assert.equal(p.passes[0].prep!.some((x) => x.kind === 'fileFromPass'), false); assert.equal((p.passes[0].prep![0] as any).srcPass, undefined);
  assert.deepEqual(p.post, { kind: 'voiceMix', pass: 0, beds: mix === 'blend' ? [{ from: 'source', volume: 0.25 }] : [], lines: true, maxSpeed: 1.2 });
  assert.equal(p.muxOnto!.mix, 'replace', 'the mixed track replaces the clip sound'); assert.deepEqual(p.notes, [S.NO_SEPARATION_NOTE]); assert.equal(S.NO_SEPARATION_NOTE, 'Background music not kept: add the separation model.');
  assert.ok(!files(p.passes[0].graph).some((f) => f.includes('Roformer')));
}
ok('translate without separation: one voice pass, original ducked (blend) or dropped (replace), plain note');

// --- Change Voice: the same shared step
{
  const p = buildPlan(job('comfy-chatterbox-vc', { mode: 'change-voice' }) as any, { separation: true });
  assert.equal(p.passes.length, 2); assert.equal(p.passes[0].workflow, S.SEPARATION_WORKFLOW);
  assert.deepEqual(p.passes[1].prep, [{ kind: 'fileFromPass', from: { pass: 0, index: 0 }, node: '1', field: 'audio' }]);
  assert.equal(p.post.kind, 'voiceMix'); assert.equal(p.outKind, 'video');
  const a = buildPlan({ id: 'vs', toolId: 'voice', provider: 'comfy-chatterbox-vc', input: { mode: 'change-voice', audioInput: true, sourceAudioPath: '/in.wav' } } as any, { separation: true });
  assert.equal(a.outKind, 'audio'); assert.equal(a.post.kind, 'voiceMix'); assert.equal(a.muxOnto, undefined);
  const n = buildPlan(job('comfy-chatterbox-vc', { mode: 'change-voice' }) as any, { separation: false });
  assert.equal(n.passes.length, 1); assert.deepEqual(n.post, { kind: 'each', only: [0] }); assert.deepEqual(n.notes, [S.NO_SEPARATION_NOTE]);
  const vo = buildPlan(job('comfy-chatterbox', { mode: 'voiceover', prompt: 'Hi.' }) as any, { separation: true });
  assert.equal(vo.passes.length, 1); assert.equal(vo.separation, undefined, 'voiceover never separates'); assert.deepEqual(vo.notes, []);
}
ok('change voice: same separation step (video and audio in); voiceover untouched');

// --- the run's own choice wins over this computer (Get workflow rebuild); this computer: unknown ComfyUI = not ready
{
  S.setSeparationReady(null); assert.equal(S.separationStatus().ready, false, 'no ComfyUI answer: not ready, never a guess');
  assert.equal(buildPlan(job('local-whisper-nllb-chatterbox', { mode: 'translate' }) as any).passes.length, 1);
  assert.equal(buildPlan(job('local-whisper-nllb-chatterbox', { mode: 'translate', separation: true }) as any).passes.length, 2, 'input.separation (the run) wins');
  S.setSeparationReady(true); assert.equal(buildPlan(job('local-whisper-nllb-chatterbox', { mode: 'translate' }) as any).passes.length, 2);
  const st = S.separationStatus(); assert.equal(st.ready, true); assert.equal(st.missingBytes, 0); assert.equal(st.note, null);
  S.setSeparationReady(false); const off = S.separationStatus(); assert.equal(off.ready, false); assert.equal(off.missingBytes, 456_479_072); assert.equal(off.downloadId, S.SEPARATION_PROVIDER); assert.match(off.note!, /^Background music not kept/);
  S.setSeparationReady(null);
}
ok('readiness: forced on/off, unknown = off, the run’s choice wins');

// --- manifest + pack rows agree with the module (the download flow reads them)
{
  const REPO = path.resolve(import.meta.dirname, '..', '..');
  const man = JSON.parse(fs.readFileSync(path.join(REPO, 'readiness/manifest/models.json'), 'utf8'));
  const row = man.models.find((m: any) => m.file === S.SEPARATION_MODEL.file);
  assert.equal(row.size, S.SEPARATION_MODEL.bytes); assert.equal(row.folder, 'diffusion_models'); assert.equal(row.url, S.SEPARATION_MODEL.url); assert.deepEqual(row.workflows, [`workflows/${S.SEPARATION_WORKFLOW}`]);
  const cn = JSON.parse(fs.readFileSync(path.join(REPO, 'readiness/manifest/custom-nodes.json'), 'utf8'));
  assert.equal(cn.packs[S.SEPARATION_PACK.name].pin, S.SEPARATION_PACK.pin); assert.deepEqual(cn.packs[S.SEPARATION_PACK.name].classes, S.SEPARATION_NODES);
}
{ // the "Get it" download plans exactly this one file (planning only: nothing is fetched)
  await import('../src/tools/registry.js'); const { planFiles } = await import('../src/hardware/downloads.js');
  const dir = path.join(D, 'models'); fs.mkdirSync(dir, { recursive: true }); const pl = planFiles({ downloadId: S.SEPARATION_PROVIDER }, dir);
  assert.deepEqual(pl.files.map((f) => [f.file, f.folder, f.bytesTotal, f.status]), [[S.SEPARATION_MODEL.file, 'diffusion_models', S.SEPARATION_MODEL.bytes, 'queued']]);
}
ok('manifest rows match (file, size, folder, pack pin); the download plans the one file');

// --- the final mix
{
  const a = voiceMixArgs([{ file: 'bg.flac', volume: 1 }, { file: 'v.flac', volume: 0.25 }], [{ file: 'new.flac', at: 0, speed: 1 }], 'o.wav');
  assert.deepEqual(a.filter((x, k) => a[k - 1] === '-i'), ['bg.flac', 'v.flac', 'new.flac']);
  const f = a[a.indexOf('-filter_complex') + 1];
  assert.match(f, /\[0:a\]aresample=44100[^;]*\[b0\]/); assert.match(f, /\[1:a\][^;]*volume=0\.25\[b1\]/); assert.doesNotMatch(f, /\[0:a\][^;]*volume/);
  assert.match(f, /\[b0\]\[b1\]\[v0\]amix=inputs=3:duration=longest:normalize=0,alimiter=limit=0\.95\[a\]/); assert.doesNotMatch(f, /atempo|adelay/);
  const b = voiceMixArgs([], [{ file: 'a.wav', at: 1.5, speed: 1.2 }, { file: 'b.wav', at: 3, speed: 1 }], 'o.wav'); const g = b[b.indexOf('-filter_complex') + 1];
  assert.match(g, /\[0:a\][^;]*atempo=1\.2,adelay=1500:all=1\[v0\]/); assert.match(g, /\[1:a\][^;]*adelay=3000:all=1\[v1\]/); assert.doesNotMatch(g.split(';')[1], /atempo/);
  const c = voiceMixArgs([], [{ file: 'a.wav', at: 0, speed: 1 }], 'o.wav'); assert.match(c[c.indexOf('-filter_complex') + 1], /\[v0\]anull\[a\]$/);
  assert.throws(() => voiceMixArgs([{ file: 'bg', volume: 1 }], [], 'o.wav'), /no voice/);
}
ok('voice mix: beds at their level, voices sped up + placed, no normalisation, limiter');
fs.rmSync(D, { recursive: true, force: true }); console.log('voice-separation: all ok');
