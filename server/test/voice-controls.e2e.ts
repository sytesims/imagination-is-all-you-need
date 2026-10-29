// E2E (own mock server): Voice Studio controls (validation 400s, repeated voiceAudio ≤3, ffmpeg post format/rate/0 credits),
// caps in /api/tools, videoOptionalModes, voiceover quote by script length = charge. Run: npx tsx test/voice-controls.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { parseVoiceControls, postFilters } from '../src/tools/voice/voiceControls.js';
import { minimaxSpeechRequest } from '../src/hostedRequests.js';
const PORT = testPort(8831), B = `http://localhost:${PORT}`, D = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-'));
// unit: mapping
const mm = parseVoiceControls({ mood: '0.8', speed: '1.5', pitch: '-3', volume: '150', sampleRate: '44100' }, 'direct-minimax-speech', 0); assert.ok(mm.ok);
if (mm.ok) { assert.deepEqual(mm.native, { 'voice_setting.emotion': 'happy', 'voice_setting.speed': 1.5, 'voice_setting.pitch': -3, 'voice_setting.vol': 1.5, 'audio_setting.sample_rate': 44100 }); assert.equal(mm.post.speed, undefined);
  const body: any = minimaxSpeechRequest({ prompt: 'hi', native: mm.native } as any).body; assert.equal(body.voice_setting.emotion, 'happy'); assert.equal(body.voice_setting.pitch, -3); assert.equal(body.audio_setting.sample_rate, 44100); }
const cb = parseVoiceControls({ expression: '10' }, 'comfy-chatterbox', 1); assert.ok(cb.ok && cb.native.exaggeration === 2);
const cb5 = parseVoiceControls({}, 'comfy-chatterbox', 0); assert.ok(cb5.ok && cb5.native.exaggeration === 0.5);
assert.ok(!parseVoiceControls({ mood: '0.5' }, 'comfy-chatterbox', 0).ok);
assert.ok(!parseVoiceControls({}, 'api-eleven-tts', 1).ok);
assert.ok(postFilters({ pitch: 12 }).some((f) => f.startsWith('asetrate=96000')));
const { buildPlan } = await import('../src/comfy/plans.js');
const pl = (provider: string, toolId: string, input: any) => buildPlan({ id: 'x', toolId, provider, input } as any);
const g1: any = pl('comfy-chatterbox', 'voice', { mode: 'voiceover', types: ['voiceover'], prompt: 'hi', videoPath: '/tmp/v.mp4', voiceNative: { exaggeration: 2 } }).passes[0].graph; assert.equal(g1['2'].inputs.exaggeration, 2);
const g2: any = pl('comfy-f5tts', 'voice', { mode: 'voiceover', types: ['voiceover'], prompt: 'hi', videoPath: '/tmp/v.mp4', voiceNative: { speed: 1.5 } }).passes[0].graph; assert.equal(g2['2'].inputs.speed, 1.5);
const g3: any = pl('comfy-chatterbox', 'audio', { mode: 'voice', types: ['voice'], audioKind: 'voice', prompt: 'hi', voiceNative: { exaggeration: 0.25 } }).passes[0].graph; assert.equal(g3['2'].inputs.exaggeration, 0.25);
console.log('ok unit mapping + comfy plans read voiceNative');
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BILLING_MODE: 'team', OPENHIGGSFIELD_BACKEND: 'mock', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '1' /* runnable gate: mock-keys simulation instead of a fake real key */ }, stdio: ['ignore', fs.openSync(path.join(D, 'server.log'), 'a'), fs.openSync(path.join(D, 'server.log'), 'a')], detached: true });
// if the server goes away mid-test, say how (exit code / signal) and show its last lines instead of a bare ECONNREFUSED
let srvExit: string | null = null; srv.on('exit', (code, sig) => { srvExit = `server exited (code ${code}, signal ${sig})`; });
const get = async (u: string) => (await fetch(B + u)).json();
const bal = async () => (await get('/api/ledger')).balance;
const post = async (f: Record<string, string>, files: [string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); for (const [k, p] of files) fd.append(k, new Blob([fs.readFileSync(p)]), path.basename(p)); const r = await fetch(`${B}/api/tools/voice/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() }; };
const wait = async (id: string) => { for (let i = 0; i < 80; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 500)); } throw new Error('timeout'); };
try {
  try { await fetch(`${B}/api/health`); throw new Error(`port ${PORT} already in use (stale server)`); } catch (e) { if (String(e).includes('stale')) throw e; }
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); }
  await fetch(`${B}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ global: { mode: 'auto', allowFallback: true, useLocal: true, mockKeys: true } }) });
  const tools = await get('/api/tools'); const vt = (tools.tools ?? tools).find((t: any) => t.id === 'voice');
  assert.deepEqual(vt.app.videoOptionalModes, ['voiceover', 'lipsync']); assert.equal(vt.app.voiceCaps['comfy-chatterbox'].controls.expression.param, 'exaggeration'); assert.equal(vt.app.voiceControls.sampleRate.default, 24000);
  for (const n of ['voiceDetails', 'expression', 'mood', 'speed', 'pitch', 'volume', 'outputFormat', 'sampleRate', 'voiceAudio']) assert.ok(vt.inputs.some((i: any) => i.name === n), n);
  console.log('ok /api/tools voice: inputs, voiceCaps, videoOptionalModes');
  const s = (k: string) => { const f = path.join(D, k + '.wav'); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=d=2', f]); return f; };
  const base = { types: '["voiceover"]', prompt: 'Hello there, this is a test of the voice studio.', provider: 'comfy-chatterbox' };
  for (const [k, v] of [['speed', '3'], ['pitch', '13'], ['volume', '-1'], ['expression', '4.5'], ['mood', '2'], ['outputFormat', 'flac'], ['sampleRate', '22050'], ['voiceDetails', 'x'.repeat(501)]]) {
    const b0 = await bal(); const r = await post({ ...base, [k]: v }); assert.equal(r.status, 400, `${k}=${v} ${JSON.stringify(r.body)}`); assert.equal(r.body.issues?.[0]?.field, k); assert.equal(await bal(), b0);
  }
  const op = await post({ ...base, outputFormat: 'opus', sampleRate: '44100' }); assert.equal(op.status, 400); assert.equal(op.body.issues[0].field, 'sampleRate');
  const four = await post(base, [['voiceAudio', s('a')], ['voiceAudio', s('b')], ['voiceAudio', s('c')], ['voiceAudio', s('d')]]); assert.equal(four.status, 400); assert.equal(four.body.issues[0].field, 'voiceAudio');
  console.log('ok range 400s, nothing charged');
  const b0 = await bal();
  // Local picked explicitly: with mock keys a connected API comes first in the Run on order (Comfy → other API → Local, 2026-10-22)
  const ok = await post({ ...base, route: 'local:comfy-chatterbox', voice: 'clone', speed: '1.25', pitch: '2', volume: '80', outputFormat: 'wav', sampleRate: '16000' }, [['voiceAudio', s('a')], ['voiceAudio', s('b')], ['voiceAudio', s('c')]]);
  assert.equal(ok.status, 200, JSON.stringify(ok.body)); const j = await wait(ok.body.id ?? ok.body.jobId); assert.equal(j.status, 'done', j.error); assert.equal(j.route, 'local:comfy-chatterbox');
  assert.match(j.outputs[0].url, /\.wav$/); const f = path.join(D, j.outputs[0].url.slice('/files/'.length));   const pr = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', f]).toString()).streams[0]; assert.equal(pr.sample_rate, '16000'); assert.equal(pr.codec_name, 'pcm_s16le');
  assert.equal(b0 - (await bal()), 0, 'local + post-process = 0 credits'); console.log('ok 3 samples + post-process wav/16k, 0 credits');
  // hosted voiceover quote by script length = charge
  const text = 'a'.repeat(2500);
  const q = await get(`/api/tools/voice/price?provider=direct-minimax-speech&types=voiceover&text=${text}`); const q2 = await get(`/api/tools/voice/price?provider=direct-minimax-speech&types=voiceover&chars=2500`);
  assert.equal(q.credits, q2.credits); assert.equal(q.credits, 25);
  const b1 = await bal(); const h = await post({ types: '["voiceover"]', prompt: text, provider: 'direct-minimax-speech' }); assert.equal(h.status, 200, JSON.stringify(h.body));
  assert.equal(b1 - (await bal()), q.credits); console.log(`ok hosted quote ${q.credits} credits for 2,500 chars = charge`);
  // Fish Audio S2.1 Pro is not on Comfy Router (routerModels.ts NOT_ON_ROUTER → routes.ts COMING_SOON): Coming soon, never priced, never charged.
  // Its per-1k-UTF-8-byte price formula stays covered in pricing-1018 (priceOf).
  const jp = 'こんにちは、世界。'.repeat(120);
  const fq = await get(`/api/tools/voice/price?provider=api-fish-tts&types=voiceover&text=${encodeURIComponent(jp)}`); assert.equal(fq.runnable, false, JSON.stringify(fq)); assert.equal(fq.credits ?? null, null);
  const b2 = await bal(); const fj = await post({ types: '["voiceover"]', prompt: jp, provider: 'api-fish-tts' }); assert.notEqual(fj.status, 200, JSON.stringify(fj.body)); assert.equal(await bal(), b2);
  console.log(`ok fish: coming soon (not on Comfy Router), refused with ${fj.status}, nothing charged`);
  // video mux path: post on the audio track
  const mp4 = path.join(D, 'src.mp4'); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=854x480:rate=24', '-f', 'lavfi', '-i', 'sine=d=5', '-t', '5', '-pix_fmt', 'yuv420p', '-shortest', mp4]);
  const vj = await post({ ...base, rights: '1', sampleRate: '16000', volume: '50' }, [['video', mp4]]); assert.equal(vj.status, 200, JSON.stringify(vj.body));
  const vd = await wait(vj.body.id ?? vj.body.jobId); assert.equal(vd.status, 'done', JSON.stringify([vd.error, vd.errorType, vd.provider, vd.route])); const vf = path.join(D, vd.outputs[0].url.slice('/files/'.length));
  const st = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', vf]).toString()).streams; assert.equal(st.find((x: any) => x.codec_type === 'audio').sample_rate, '16000'); assert.ok(st.some((x: any) => x.codec_type === 'video'));
  console.log('ok mux path post-process (audio track 16 kHz, video kept)');
  // change-voice / translate / lipsync: caps present, post runs on the video's audio track, unsupported → 400
  for (const id of ['comfy-chatterbox-vc', 'local-whisper-nllb-chatterbox', 'local-whisper-nllb-f5', 'comfy-h3-lipsync']) assert.ok(vt.app.voiceCaps[id], id);
  assert.equal(vt.app.voiceCaps['comfy-h3-lipsync'].controls.speed.via, 'unsupported'); assert.equal(vt.app.voiceCaps['local-whisper-nllb-f5'].controls.speed.via, 'native');
  const vprobe = (u: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', path.join(D, u.slice('/files/'.length))]).toString()).streams;
  for (const [mode, provider, extra] of [['change-voice', 'comfy-chatterbox-vc', {}], ['translate', 'local-whisper-nllb-chatterbox', { language: 'es', expression: '8' }], ['translate', 'local-whisper-nllb-f5', { language: 'es', speed: '1.2' }]] as const) {
    const bad = await post({ types: `["${mode}"]`, provider, rights: '1', outputFormat: 'wav' }, [['video', mp4]]); assert.equal(bad.status, 400, `${provider} wav`); assert.equal(bad.body.issues[0].field, 'outputFormat');
    const r = await post({ types: `["${mode}"]`, provider, rights: '1', sampleRate: '16000', volume: '70', pitch: '2', ...extra }, [['video', mp4]]); assert.equal(r.status, 200, `${provider} ${JSON.stringify(r.body)}`);
    const d = await wait(r.body.id); assert.equal(d.status, 'done', `${provider} ${d.error}`); const st2 = vprobe(d.outputs[0].url);
    assert.equal(st2.find((x: any) => x.codec_type === 'audio').sample_rate, '16000', provider); assert.ok(st2.some((x: any) => x.codec_type === 'video'));
    console.log(`ok ${mode} ${provider}: post on audio track`);
  }
  assert.ok((await fetch(`${B}/api/health`)).ok, 'the API is still up after change-voice + translate');
  const png = path.join(D, 'face.png'); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=768x768', '-frames:v', '1', png]); const sp = s('speech');
  const ls1 = await post({ types: '["lipsync"]', provider: 'comfy-h3-lipsync', rights: '1', speed: '1.5' }, [['image', png], ['speech', sp]]); assert.equal(ls1.status, 400); assert.equal(ls1.body.issues[0].field, 'speed');
  const ls2 = await post({ types: '["lipsync"]', provider: 'comfy-h3-lipsync', rights: '1', pitch: '3' }, [['image', png], ['speech', sp]]); assert.equal(ls2.status, 400); assert.equal(ls2.body.issues[0].field, 'pitch');
  const ls3 = await post({ types: '["lipsync"]', provider: 'comfy-h3-lipsync', rights: '1', volume: '60', sampleRate: '16000' }, [['image', png], ['speech', sp]]); assert.equal(ls3.status, 200, JSON.stringify(ls3.body));
  const ld = await wait(ls3.body.id); assert.equal(ld.status, 'done', ld.error); assert.equal(vprobe(ld.outputs[0].url).find((x: any) => x.codec_type === 'audio').sample_rate, '16000');
  console.log('ok lipsync: speed/pitch 400, volume + rate post on the video audio');
  // Audio tool voice mode: same controls
  const at = (await get('/api/tools')); const aud = (at.tools ?? at).find((t: any) => t.id === 'audio'); assert.ok(aud.app.voiceCaps['comfy-chatterbox']); assert.ok(aud.inputs.some((i: any) => i.name === 'pitch'));
  const fd = new FormData(); for (const [k, v] of Object.entries({ types: '["voice"]', prompt: 'hello', provider: 'comfy-chatterbox', speed: '9' })) fd.append(k, v);
  const ar = await fetch(`${B}/api/tools/audio/jobs`, { method: 'POST', body: fd }); assert.equal(ar.status, 400); assert.equal((await ar.json()).issues[0].field, 'speed');
  const fd2 = new FormData(); for (const [k, v] of Object.entries({ types: '["voice"]', prompt: 'hello', provider: 'comfy-chatterbox', outputFormat: 'opus', sampleRate: '48000' })) fd2.append(k, v);
  const a2 = await (await fetch(`${B}/api/tools/audio/jobs`, { method: 'POST', body: fd2 })).json(); const ad = await wait(a2.id ?? a2.jobId); assert.equal(ad.status, 'done', ad.error); assert.match(ad.outputs[0].url, /\.ogg$/);
  console.log('ok Audio tool voice mode: controls + opus post');
} catch (e) {
  if (srvExit) console.error(srvExit); try { console.error(fs.readFileSync(path.join(D, 'server.log'), 'utf8').split('\n').slice(-40).join('\n')); } catch { /* */ }
  throw e;
} finally { try { process.kill(-srv.pid!); } catch { /* */ } }
console.log('voice-controls: all ok');
