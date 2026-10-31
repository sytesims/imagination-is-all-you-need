// E2E (own mock server :8897, temp data dir): "See the exact prompt" (POST /api/tools/:id/prompt-peek) returns the prompt the job really gets.
// For each form below, the peek's prompt is byte-for-byte the submitted job's input.finalPrompt: Product Shot with and without a photo, a Relight
// look, Camera & Lens, plain Create (with Enhance and a photo edit), and Camera Angles' per-angle prompts. Upscale says it has no prompt.
// Create Video (h3-video): text with Enhance off and on, a start frame, a start frame plus references, a look. The peek itself creates no job and charges nothing.
// Audio (the one Audio page): every workflow (music with lyrics, sound effects, voiceover with and without a voice sample, change voice, translate, music and sound
// for a clip, cover) peeks the job's finalPrompt and lyrics byte for byte; YuE2 without lyrics is the submit's 400.
// Run: npx tsx test/prompt-peek.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { imageDimsOfFile } from '../src/imageDims.ts';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(8897); const B = `http://localhost:${PORT}`;
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'peek-')), OPENHIGGSFIELD_ENV_FILE: path.join(os.tmpdir(), 'peek-none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '1', COMFY_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '' }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const PHOTO = path.join(ROOT, 'samples/sample-product.png'); const PNG = fs.readFileSync(PHOTO); const dims = imageDimsOfFile(PHOTO)!;
const ok = (m: string) => console.log('ok ' + m);
const job = async (tool: string, f: Record<string, string>, imgs: Record<string, Buffer> = {}) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); for (const [k, b] of Object.entries(imgs)) fd.append(k, new Blob([b], { type: 'image/png' }), `${k}.png`);
  const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); const body = await r.json() as any; assert.equal(r.status, 200, `${tool} submit: ${JSON.stringify(body)}`); return body.id as string; };
const peek = async (tool: string, fields: Record<string, string>, files: Record<string, number> = {}) => { const r = await fetch(`${B}/api/tools/${tool}/prompt-peek`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields, files, photo: files.image ? dims : undefined }) });
  const body = await r.json() as any; assert.equal(r.status, 200, `${tool} peek: ${JSON.stringify(body)}`); return body; };
/** Peek, then submit the same form: the job's input.finalPrompt must equal the peek's prompt. */
const same = async (label: string, tool: string, fields: Record<string, string>, withPhoto = false) => {
  const pk = await peek(tool, fields, withPhoto ? { image: 1 } : {});
  const id = await job(tool, { ...fields, ...(withPhoto ? { rights: '1' } : {}) }, withPhoto ? { image: PNG } : {}); const j = await get(`/api/jobs/${id}`);
  assert.equal(typeof j.input?.finalPrompt, 'string', `${label}: the job has a finalPrompt`);
  assert.equal(pk.prompt, j.input.finalPrompt, `${label}: peek = job input.finalPrompt`);
  assert.equal(pk.provider, j.provider, `${label}: same model`);
  ok(`${label}: “${pk.prompt.slice(0, 70)}${pk.prompt.length > 70 ? '…' : ''}” · ${pk.model} · ${pk.workflowFile ?? 'no file'}`); return pk;
};
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const jobsBefore = (await get('/api/jobs?cursor=')).total; // count every job, including examples beyond the default 50-item page

  // ---- Product Shot: text only (the default model), then with a photo (the edit recipe and its keep-lock) ----
  const p0 = await same('Product Shot, no photo', 'app-product-shot', { prompt: 'a ceramic mug', scene: 'marble' });
  assert.match(p0.prompt, /^Product photo of a ceramic mug/i); assert.equal(p0.settings.mode, 'generate');
  const p1 = await same('Product Shot, with a photo', 'app-product-shot', { prompt: 'a ceramic mug', scene: 'marble', provider: 'comfy-qwen21' }, true);
  assert.match(p1.prompt, /uploaded item/i); assert.equal(p1.settings.mode, 'edit'); assert.match(String(p1.workflowFile), /edit/i, 'a photo: the edit graph is named');

  // ---- Relight: a look on two model families ----
  for (const provider of ['comfy-klein4b', 'comfy-qwen21-turbo']) {
    const r = await same(`Relight look (studio-softbox, ${provider})`, 'app-relight', { prompt: 'calm mood', look: 'studio-softbox', direction: 'left', lightQuality: 'soft', brightness: '60', color: '#FFFFFF', provider }, true);
    assert.match(r.prompt, /softbox/i);
  }
  // ---- Relight with the light sphere's rig: the peek shows the precise wording the job gets ----
  { const light = JSON.stringify({ key: { az: -45, el: 30, kelvin: 3200, intensity: 70, softness: 60 }, rim: { az: 150, el: 20, kelvin: 7500, intensity: 60 }, ambient: 25, preset: 'golden-hour' });
    for (const provider of ['api-nano-banana-21', 'comfy-qwen21-turbo']) {
      const r = await same(`Relight light sphere (${provider})`, 'app-relight', { prompt: '', look: 'golden-hour', light, provider }, true);
      assert.match(r.prompt, /front-left of the frame, high above eye level/); assert.doesNotMatch(r.prompt, /°/); assert.match(r.prompt, /warm 3200K tungsten/); assert.match(r.prompt, /rim light/); assert.match(r.prompt, /ambient 25%/);
    }
    const bad = await fetch(`${B}/api/tools/app-relight/prompt-peek`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields: { light: '{"key":{"az":0}}' }, files: { image: 1 } }) });
    assert.equal(bad.status, 400, 'a broken rig is refused'); ok('Relight light sphere: a broken rig is a 400');
  }

  // ---- Camera & Lens: Create Image with a rig ----
  const c = await same('Camera & Lens', 'create-image', { types: '["generate"]', prompt: 'a street at dusk', cameraBody: 'arri-alexa-35', focal: '35', aperture: '4', aspect: '16:9', n: '1' });
  assert.ok(c.prompt.length > 'a street at dusk'.length, 'the camera sentence is added'); assert.equal(c.settings.aspect, '16:9');

  // ---- plain Create: text, Enhance on, a fixed seed; and a photo edit ----
  const t = await same('Create, Enhance on', 'create-image', { types: '["generate"]', prompt: 'a red fox in snow', enhance: '1', seed: '1234', n: '2' });
  assert.equal(t.settings.seed, 1234); assert.equal(t.settings.n, 2);
  await same('Create, photo edit', 'create-image', { types: '["edit"]', prompt: 'make @image1 look like winter', provider: 'comfy-klein4b' }, true);
  await same('Create, empty-ish prompt', 'create-image', { types: '["generate"]', prompt: 'x' });

  // ---- Camera Angles: one prompt per angle, the first is finalPrompt ----
  { const f = { prompt: 'a sneaker', shots: '["front","side"]', provider: 'comfy-qwen-image' }; const pk = await peek('app-shots', f, { image: 1 });
    const id = await job('app-shots', { ...f, rights: '1' }, { image: PNG }); const j = await get(`/api/jobs/${id}`);
    assert.deepEqual(pk.shots.map((s: any) => s.prompt), j.input.shots.map((s: any) => s.prompt)); assert.equal(pk.prompt, j.input.finalPrompt); ok(`Camera Angles: ${pk.shots.length} per-angle prompts match`); }

  // ---- Upscale: no prompt; errors come back as the submit's 400 ----
  { const up = await peek('image-upscale', { scale: '4' }, { image: 1 }); assert.equal(up.prompt, null); assert.match(up.noPrompt, /No prompt/); ok('Upscale: no prompt'); }
  { const r = await fetch(`${B}/api/tools/app-product-shot/prompt-peek`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields: { prompt: 'a mug', provider: 'nope' } }) }); assert.equal(r.status, 400); ok('unknown model: 400'); }
  { const r = await fetch(`${B}/api/tools/nope/prompt-peek`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); assert.equal(r.status, 404); ok('unknown tool: 404'); }

  // ---- Create Video (h3-video): the peek is the job's finalPrompt (mode words, Enhance, a look), with duration / sound / the frames named ----
  const vjob = async (f: Record<string, string>, imgs: [string, Buffer][]) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); imgs.forEach(([k, b], i) => fd.append(k, new Blob([b], { type: 'image/png' }), `${k}${i}.png`));
    const r = await fetch(`${B}/api/tools/h3-video/jobs`, { method: 'POST', body: fd }); const body = await r.json() as any; assert.equal(r.status, 200, `h3-video submit: ${JSON.stringify(body)}`); return (await get(`/api/jobs/${body.id}`)) as any; };
  const vsame = async (label: string, f: Record<string, string>, imgs: [string, Buffer][] = []) => {
    const files: Record<string, number> = {}; for (const [k] of imgs) files[k] = (files[k] ?? 0) + 1;
    const pk = await peek('h3-video', f, files); const j = await vjob(f, imgs);
    assert.equal(pk.prompt, j.input.finalPrompt, `${label}: peek = job input.finalPrompt`); assert.equal(pk.provider, j.provider, `${label}: same model`);
    assert.equal(pk.settings.duration, Number(j.input.duration), `${label}: same length`); assert.equal(pk.settings.resolution, j.input.resolution, `${label}: same resolution`);
    ok(`${label}: “${pk.prompt.slice(0, 70)}${pk.prompt.length > 70 ? '…' : ''}” · ${pk.model} · ${pk.settings.duration} s · ${(pk.inputs ?? []).join(', ') || 'no files'}`); return pk; };
  const vbase = { provider: 'comfy-h3', duration: '5', resolution: '768p', quality: 'quality', aspect: '16:9', audio: '1', bitrate: 'standard' };
  { const off = await vsame('Video, text, Enhance off', { ...vbase, types: '["t2v"]', prompt: 'a lighthouse in a storm' });
    const on = await vsame('Video, text, Enhance on', { ...vbase, types: '["t2v"]', prompt: 'a lighthouse in a storm', enhance: '1' });
    assert.notEqual(on.prompt, off.prompt, 'Enhance changes the video prompt'); assert.match(on.prompt, /smooth natural motion/); assert.equal(on.settings.audio, true); assert.deepEqual(on.inputs, []); }
  { const pk = await vsame('Video, start frame', { ...vbase, types: '["i2v"]', prompt: 'the waves crash', rights: '1' }, [['image', PNG]]);
    assert.match(pk.prompt, /^For the target video, at 0\.00 seconds/); assert.deepEqual(pk.inputs, ['Start frame (your start frame)']); }
  { const pk = await vsame('Video, start frame + refs (Reference)', { ...vbase, types: '["r2v"]', prompt: 'the same hero walks on', rights: '1' }, [['image', PNG], ['refs', PNG], ['refs', PNG]]);
    assert.deepEqual(pk.inputs, ['Reference 1 (your photo)', 'Reference 2 (your image)', 'Reference 3 (your image)']); }
  { const vp = ((await get('/api/video-presets')).items ?? []).find((x: any) => x.kind === 'style');
    if (vp) { const pk = await vsame(`Video, look ${vp.id}`, { ...vbase, types: '["t2v"]', prompt: 'a city at night', videoPreset: vp.id, ...(vp.intensities?.[0] ? { intensity: vp.intensities[0] } : {}) }); assert.ok(pk.prompt.length > 'a city at night'.length, 'the look adds its words'); } }
  { const r = await fetch(`${B}/api/tools/h3-video/prompt-peek`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields: { ...vbase, types: '["i2v"]', prompt: 'x' }, files: {} }) });
    assert.equal(r.status, 400, 'a start-frame mode without a frame is the submit\'s 400'); ok('Video peek without a needed frame: 400'); }

  // ---- Audio page (audio / voice / soundtrack): the peek is the job's finalPrompt (the script, read as written) and its lyrics, with the model, voice, length and format ----
  const CLIP = fs.readFileSync(path.join(ROOT, 'samples/sample-take.mp4'));
  const { silentWav } = await import('../src/routesPromptPeek.ts'); const WAV = silentWav(4);
  type F = [field: string, buf: Buffer, type: string, name: string];
  const ajob = async (tool: string, f: Record<string, string>, fl: F[]) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); for (const [k, b, t, n] of fl) fd.append(k, new Blob([b], { type: t }), n);
    const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); const body = await r.json() as any; assert.equal(r.status, 200, `${tool} submit: ${JSON.stringify(body)}`); return (await get(`/api/jobs/${body.id}`)) as any; };
  let audioJobs = 0;
  const asame = async (label: string, tool: string, f: Record<string, string>, fl: F[] = []) => {
    const files: Record<string, number> = {}; for (const [k] of fl) files[k] = (files[k] ?? 0) + 1;
    const pk = await peek(tool, f, files); const j = await ajob(tool, { ...f, ...(fl.length ? { rights: '1' } : {}) }, fl); audioJobs++;
    assert.equal(pk.prompt, j.input.finalPrompt, `${label}: peek = job input.finalPrompt`); assert.equal(pk.lyrics ?? null, j.input.lyrics ?? null, `${label}: peek lyrics = job input.lyrics`);
    assert.equal(pk.provider, j.provider, `${label}: same model`); assert.equal(pk.settings.mode, j.input.mode, `${label}: same mode`);
    ok(`${label}: “${String(pk.prompt).slice(0, 50)}” · ${pk.lyrics ? 'lyrics · ' : ''}${pk.model} · ${[pk.settings.voice, pk.settings.language, pk.settings.format, pk.settings.duration && `${pk.settings.duration} s`].filter(Boolean).join(' · ') || '-'} · ${(pk.inputs ?? []).join(', ') || 'no files'}`); return pk; };
  const LYR = '[Verse]\nSalt on the window\n\n[Chorus]\nWe sail at dawn';
  { const pk = await asame('Music, YuE2 with lyrics', 'audio', { types: '["music"]', prompt: 'folk song, acoustic guitar, warm', duration: '30', provider: 'comfy-yue2', lyrics: LYR });
    assert.equal(pk.lyrics, LYR); assert.equal(pk.prompt, 'folk song, acoustic guitar, warm'); assert.equal(pk.settings.duration, 30); assert.equal(pk.model, 'YuE2', 'the real model name'); }
  { const r = await fetch(`${B}/api/tools/audio/prompt-peek`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields: { types: '["music"]', prompt: 'a song', duration: '30', provider: 'comfy-yue2' } }) });
    const b = await r.json() as any; assert.equal(r.status, 400); assert.match(b.error, /lyrics/i); ok('Music on YuE2 without lyrics: 400 “Add the lyrics to sing.”'); }
  await asame('Music, MiniMax Music 3 without lyrics', 'audio', { types: '["music"]', prompt: 'synthwave, night drive', duration: '30', provider: 'cloud-minimax-music' });
  await asame('Sound effects', 'audio', { types: '["sfx"]', prompt: 'a door creaks open in a big hall', duration: '10', provider: 'comfy-stable-audio' });
  { const script = 'Welcome back. Tonight: the sea, the salt and the long road home.';
    const pk = await asame('Voiceover script, 2 takes', 'voice', { types: '["voiceover"]', prompt: script, provider: 'comfy-chatterbox', voice: 'narrator-warm', n: '2', outputFormat: 'wav' });
    assert.equal(pk.prompt, script, 'the script is sent word for word (never enhanced)'); assert.equal(pk.settings.voice, 'narrator-warm'); assert.equal(pk.settings.format, 'wav'); assert.equal(pk.settings.n, 2); assert.deepEqual(pk.inputs, []); }
  { const pk = await asame('Voiceover, cloned from a sample', 'voice', { types: '["voiceover"]', prompt: 'Hello from my own voice.', provider: 'comfy-chatterbox', voice: 'clone' }, [['voiceAudio', WAV, 'audio/wav', 'me.wav']]);
    assert.deepEqual(pk.inputs, ['Voice sample (your sample)']); }
  { const pk = await asame('Change voice on a clip', 'voice', { types: '["change-voice"]', prompt: '', provider: 'comfy-chatterbox-vc', voice: 'deep-calm', mix: 'replace' }, [['video', CLIP, 'video/mp4', 'clip.mp4']]);
    assert.equal(pk.settings.format, null, 'a video result has no output format'); assert.deepEqual(pk.inputs, ['Clip (your clip)']); }
  { const pk = await asame('Translate a clip', 'voice', { types: '["translate"]', prompt: '', provider: 'local-whisper-nllb-chatterbox', language: 'es', voice: 'narrator-warm', mix: 'blend' }, [['video', CLIP, 'video/mp4', 'clip.mp4']]);
    assert.equal(pk.settings.language, 'es'); }
  { const pk = await asame('Music for a video, with lyrics', 'soundtrack', { types: '["music"]', prompt: 'upbeat indie pop', provider: 'comfy-acestep', mix: 'blend', lyrics: LYR }, [['video', CLIP, 'video/mp4', 'clip.mp4']]);
    assert.equal(pk.lyrics, LYR); }
  await asame('Sound for a video', 'soundtrack', { types: '["v2s"]', prompt: '', provider: 'comfy-mmaudio', mix: 'replace' }, [['video', CLIP, 'video/mp4', 'clip.mp4']]);
  { const pk = await asame('Cover a song', 'audio', { types: '["cover"]', prompt: 'jazz ballad, female voice', provider: 'comfy-yue2', lyrics: LYR }, [['audio', WAV, 'audio/wav', 'song.wav']]);
    assert.deepEqual(pk.inputs, ['Song (your song)']); assert.equal(pk.lyrics, LYR); }

  // ---- nothing ran for the peeks: only the submits above made jobs ----
  { const n = (await get('/api/jobs?cursor=')).total - jobsBefore; const vpN = ((await get('/api/video-presets')).items ?? []).some((x: any) => x.kind === 'style') ? 5 : 4;
    assert.equal(n, 11 + vpN + audioJobs, `only the ${11 + vpN + audioJobs} submits made jobs (got ${n})`); ok('peeks create no job'); }
  console.log('PASS prompt-peek');
} finally { try { process.kill(-srv.pid!); } catch { /* gone */ } }
