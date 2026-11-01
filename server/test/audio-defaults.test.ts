// Default models for the Audio page, 2026-10-23 (shared/audioDefaults.ts + routing/defaults.ts). Mirrors test/video-defaults.test.ts.
// Covers: every id is a model its workflow's tool offers for that mode; the user's picks (music: YuE2 local, MiniMax Music 3 hosted; voice: ElevenLabs
// hosted with MiniMax Speech as the fallback); the resolution order (saved route pin > the default for the active setup when it runs > the first
// that runs; Use local picks the setup); and the API (GET /api/audio-workflows defaults + active, GET /api/tools editorialDefault / workflowDefaults).
// Run: npx tsx test/audio-defaults.test.ts   (own mock server :9211, temp data dir, no keys, no network)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'auddef-')); process.env.OPENHIGGSFIELD_DATA_DIR ||= path.join(D, 'pure');
const { pickEditorial } = await import('../src/shared/imageDefaults.ts'); type DefaultModelState = import('../src/shared/imageDefaults.ts').DefaultModelState;
const { AUDIO_DEFAULTS } = await import('../src/shared/audioDefaults.ts');
const { audioWorkflowById, AUDIO_WORKFLOW_IDS } = await import('../src/shared/audioWorkflows.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { initialProviderFor } = await import('../../web/src/shared/defaults.ts');
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(9211); const B = `http://localhost:${PORT}`;
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '', OPENHIGGSFIELD_ARK_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '' };
const ok = (m: string) => console.log('ok ' + m);
const st = (o: Record<string, Partial<DefaultModelState>>) => (id: string) => (o[id] ? { runnable: false, demo: false, routeKind: null, reasonCode: null, reason: null, ...o[id] } as DefaultModelState : undefined);

// ---- 1. pure: the table ----
assert.deepEqual(Object.keys(AUDIO_DEFAULTS).sort(), [...AUDIO_WORKFLOW_IDS].sort(), 'one entry per Audio workflow');
for (const [id, d] of Object.entries(AUDIO_DEFAULTS)) {
  const w = audioWorkflowById(id)!; const t = getTool(w.tool)! as any; const pm = t.app.providerModes as Record<string, string[]>;
  for (const p of [d.local, d.hosted, d.hostedFallback].filter(Boolean) as string[]) {
    assert.ok(t.providers.includes(p), `${id}: ${p} is a provider of ${w.tool}`); assert.ok(pm[p]?.includes(w.mode), `${id}: ${p} does ${w.tool}:${w.mode}`); }
  if (d.local) assert.ok(d.why.local, `${id}: why.local`); if (d.hosted) assert.ok(d.why.hosted, `${id}: why.hosted`);
}
ok('ids: every default is offered by its tool and mode, with a why line');
const A = AUDIO_DEFAULTS;
assert.deepEqual([A.music.local, A.music.hosted, A['soundtrack-music'].hosted], ['comfy-yue2', 'api-seed-audio', 'api-seed-audio'], 'music: YuE2 local; cloud first (2026-10-27): Seed Audio on the Comfy key');
assert.deepEqual([A.voiceover.hosted, A.voiceover.hostedFallback], ['api-eleven-tts', 'direct-minimax-speech'], 'voice: ElevenLabs, MiniMax Speech fallback');
assert.deepEqual([A.sfx.local, A.sfx.hosted, A.voiceover.local, A['change-voice'].local, A.translate.local, A['soundtrack-sound'].local, A['soundtrack-sound'].hosted, A.cover.local],
  ['comfy-stable-audio', 'api-eleven-sfx', 'comfy-chatterbox', 'comfy-chatterbox-vc', 'local-whisper-nllb-chatterbox', 'comfy-mmaudio', null /* Sonilo isn't on Comfy Router */, 'comfy-yue2']);
assert.ok(getTool('audio')!.providers.includes('comfy-minimax-music3'), 'local MiniMax Music 3 is offered');
ok('table: the plan with the user changes');

// ---- 2. pure: the resolver ----
const V = A.voiceover; const pk = (s: (id: string) => DefaultModelState | undefined, useLocal: boolean) => pickEditorial(V, s, useLocal);
const all = st({ 'comfy-chatterbox': { runnable: true, routeKind: 'local' }, 'api-eleven-tts': { runnable: true, routeKind: 'comfy-router' }, 'direct-minimax-speech': { runnable: true, routeKind: 'direct' } });
assert.deepEqual([pk(all, true).id, pk(all, true).setup], ['comfy-chatterbox', 'local']); assert.deepEqual([pk(all, false).id, pk(all, false).setup], ['api-eleven-tts', 'hosted']);
const noEleven = st({ 'api-eleven-tts': { reasonCode: 'key_missing', reason: 'Add a Comfy key' }, 'direct-minimax-speech': { runnable: true, routeKind: 'direct' } });
assert.equal(pk(noEleven, false).id, 'direct-minimax-speech', 'ElevenLabs can not run → MiniMax Speech'); assert.equal(pk(noEleven, false).runs, true);
const neither = st({ 'api-eleven-tts': { demo: true, routeKind: 'comfy-router', reasonCode: 'key_missing', reason: 'Sample output' }, 'direct-minimax-speech': { demo: true, routeKind: 'direct', reasonCode: 'key_missing', reason: 'Sample output' } });
assert.equal(pk(neither, false).id, 'api-eleven-tts', 'neither really runs: ElevenLabs (Comfy key) is named, not the MiniMax lab key'); assert.equal(pk(neither, false).runs, false);
const M = A.music; const mus = st({ 'comfy-yue2': { runnable: true, routeKind: 'local' }, 'cloud-minimax-music': { demo: true, routeKind: 'comfy-cloud' } });
assert.equal(pickEditorial(M, mus, true).id, 'comfy-yue2'); assert.equal(pickEditorial(M, mus, false).id, 'comfy-yue2', 'no hosted default: the unwired MiniMax Music 3 cloud card is never marked Default');
ok('order: Use local picks the setup; voice falls back to MiniMax Speech only when ElevenLabs can not run');

// ---- 3. the API on a keyless mock server ----
const env = { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'env'), OPENHIGGSFIELD_BACKEND: 'mock',
  OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_ROUTING_LIVE: '', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '0', OPENHIGGSFIELD_HOSTED: '', OPENHIGGSFIELD_SEED_COMMUNITY: '0' };
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'pipe'], detached: true });
let stderr = ''; srv.stderr!.on('data', (b) => { stderr += String(b); });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const put = async (body: any) => { const r = await fetch(`${B}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); assert.ok(r.ok, `PUT routing ${r.status}`); };
const wfs = async () => Object.fromEntries(((await get('/api/audio-workflows')).workflows as any[]).map((w) => [w.id, w]));
const tool = async (id: string) => ((await get('/api/tools')) as any[]).find((t) => t.id === id);
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 500)); }
  assert.ok(!/audio-workflows\] \d+ recipe problem/.test(stderr), 'no recipe problems at boot');
  let W = await wfs();
  for (const id of AUDIO_WORKFLOW_IDS) { const d = W[id].defaults; assert.ok(d, `${id}: defaults`); assert.equal(d.local, (A as any)[id].local); assert.equal(d.hosted, (A as any)[id].hosted); assert.ok('active' in d, `${id}: active`); }
  assert.equal(W.voiceover.defaults.hostedFallback, 'direct-minimax-speech');
  assert.equal(W.music.defaults.active.id, 'api-seed-audio'); assert.equal(W.music.defaults.active.setup, 'hosted'); assert.notEqual(W.music.defaults.active.id, 'cloud-minimax-music');
  assert.equal(W.voiceover.defaults.active.id, 'api-eleven-tts', 'keyless: ElevenLabs is named'); assert.equal(W.voiceover.defaults.active.defaultProvider, 'api-eleven-tts');
  assert.equal(W.cover.defaults.active.id, 'comfy-yue2', 'Cover has no hosted model: YuE2 even with Use local off'); assert.equal(W.cover.defaults.active.setup, 'local');
  let T = await tool('audio'); assert.equal(T.editorialDefault?.feature, 'music'); assert.notEqual(T.editorialDefault?.id, 'cloud-minimax-music');
  for (const id of ['music', 'sfx', 'cover']) assert.ok(T.workflowDefaults?.[id], `audio tool workflowDefaults.${id}`);
  const V2 = await tool('voice'); assert.equal(V2.editorialDefault?.feature, 'voiceover'); assert.equal(V2.defaultProvider, 'api-eleven-tts');
  assert.equal(V2.defaultsByMode?.['change-voice']?.defaultProvider, 'comfy-chatterbox-vc'); assert.equal(V2.defaultsByMode?.translate?.defaultProvider, 'local-whisper-nllb-chatterbox');
  ok('API hosted setup: music Seed Audio (cloud first), voiceover ElevenLabs, cover YuE2');
  // P3-01: a fresh Audio page starts on its workflow's own default (the bar AppTool opens = what the workflow says it starts on), not the tool's
  const startsOn = async () => { const out: Record<string, string> = {}; for (const id of AUDIO_WORKFLOW_IDS) { const w = audioWorkflowById(id)!; const t = await tool(w.tool); if (!t) continue;
    out[id] = initialProviderFor(t, w.mode, w.id); const a = W[id].defaults.active; if (a) assert.equal(out[id], a.defaultProvider, `${id}: a fresh page starts on the workflow's default`); } return out; };
  let S = await startsOn(); assert.equal(S.sfx, W.sfx.defaults.active.id, 'Sound effects: the bar and the menu Default agree on first load');
  assert.notEqual(S.sfx, 'api-seed-audio', 'Sound effects no longer opens on the tool default (Seed Audio)'); assert.equal(S.voiceover, 'api-eleven-tts'); assert.equal(S['change-voice'], 'comfy-chatterbox-vc');
  ok('P3-01: every Audio workflow opens on its own default (hosted)');
  // the quote follows the default (no provider named)
  const q = await get('/api/tools/audio/price?mode=music'); assert.equal(q.defaultProvider, T.defaultsByMode?.music?.defaultProvider ?? T.defaultProvider, 'the quote follows the default');
  assert.equal((await get('/api/tools/voice/price?mode=voiceover&chars=200')).defaultProvider, 'api-eleven-tts');
  await put({ global: { mode: 'auto', allowFallback: false, useLocal: true } }); W = await wfs(); T = await tool('audio');
  assert.equal(W.music.defaults.active.id, 'comfy-yue2'); assert.equal(W.music.defaults.active.setup, 'local'); assert.equal(T.defaultProvider, 'comfy-yue2', 'Use local on: YuE2');
  assert.equal(W.voiceover.defaults.active.id, 'comfy-chatterbox'); assert.equal(W['soundtrack-music'].defaults.active.id, 'comfy-acestep'); assert.equal(W.sfx.defaults.active.id, 'comfy-stable-audio');
  assert.equal(T.defaultsByMode?.cover?.defaultProvider, 'comfy-yue2');
  const ql = await get('/api/tools/audio/price?mode=music&lyrics=1'); assert.equal(ql.defaultProvider, 'comfy-yue2'); assert.equal(ql.routeId, 'local:comfy-yue2'); assert.equal(ql.credits, 0, 'local = free');
  S = await startsOn(); assert.equal(S.sfx, 'comfy-stable-audio'); assert.equal(S['soundtrack-music'], 'comfy-acestep');
  ok('API local setup: YuE2 / Chatterbox / ACE-Step / Stable Audio');
  // music with no lyrics: YuE2 only sings lyrics, so the default steps aside (submit and quote alike); with lyrics, YuE2; a named YuE2 without lyrics → 400
  const submit = async (tool: string, form: Record<string, string>, files: Record<string, string> = {}) => { const fd = new FormData(); for (const [k, v] of Object.entries(form)) fd.append(k, v);
    for (const [k, p] of Object.entries(files)) fd.append(k, new Blob([fs.readFileSync(p)]), path.basename(p));
    const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
  const noLy = await submit('audio', { types: '["music"]', prompt: 'lofi beat', duration: '30', seed: '5' }); assert.equal(noLy.status, 200, JSON.stringify(noLy.body));
  const jobOf = async (id: string) => get(`/api/jobs/${id}`);
  assert.equal((await jobOf(noLy.body.id)).provider, 'comfy-minimax-music3', 'no lyrics: the next local music model');
  const withLy = await submit('audio', { types: '["music"]', prompt: 'lofi beat', lyrics: '[Verse]\nla la la', duration: '30' }); assert.equal(withLy.status, 200, JSON.stringify(withLy.body));
  const jl = await jobOf(withLy.body.id); assert.equal(jl.provider, 'comfy-yue2'); assert.equal(jl.input.lyrics, '[Verse]\nla la la', 'lyrics stored on the job');
  const named = await submit('audio', { types: '["music"]', prompt: 'lofi beat', provider: 'comfy-yue2' }); assert.equal(named.status, 400); assert.equal(named.body.issues?.[0]?.field, 'lyrics');
  assert.equal((await get('/api/tools/audio/price?mode=music')).routeId, 'local:comfy-minimax-music3', 'quote without lyrics = submit');
  assert.equal((await get('/api/tools/audio/price?mode=music&lyrics=1')).routeId, 'local:comfy-yue2', 'quote with lyrics = submit');
  const oldText = await submit('audio', { types: '["music"]', prompt: 'lofi beat', text: '[Chorus]\nhey', provider: 'comfy-acestep' }); assert.equal(oldText.status, 200);
  assert.equal((await jobOf(oldText.body.id)).input.lyrics, '[Chorus]\nhey', '`text` is still read as lyrics in music');
  const song = path.resolve(ROOT, '../readiness/stub/voice.wav');
  const noSong = await submit('audio', { types: '["cover"]', prompt: 'jazz', lyrics: '[Verse]\nhey' }); assert.equal(noSong.status, 400); assert.equal(noSong.body.issues?.[0]?.field, 'audio');
  const noWords = await submit('audio', { types: '["cover"]', prompt: 'jazz' }, { audio: song }); assert.equal(noWords.status, 400); assert.equal(noWords.body.issues?.[0]?.field, 'lyrics');
  const cov = await submit('audio', { types: '["cover"]', prompt: 'jazz', lyrics: '[Verse]\nhey' }, { audio: song }); assert.equal(cov.status, 200, JSON.stringify(cov.body));
  const cj = await jobOf(cov.body.id); assert.equal(cj.provider, 'comfy-yue2'); assert.equal(cj.input.audioInput, true); assert.ok(cj.input.duration > 0, 'cover length = the song');
  ok('lyrics: no lyrics → MiniMax Music 3 locally (quote = submit), lyrics → YuE2; Cover needs a song and lyrics');
  // a saved route pin beats the default
  const m = (T.models as any[]).find((x) => (x.engines ?? []).includes('comfy-acestep')); assert.ok(m, 'ACE-Step listed on Audio');
  await put({ perTool: { audio: { [m.key]: { runOn: 'local' } } } }); T = await tool('audio');
  assert.equal(T.defaultProvider, 'comfy-acestep', 'saved pin wins over the default'); assert.equal(T.editorialDefault.source, 'pin');
  await put({ perTool: {} }); T = await tool('audio'); assert.equal(T.defaultProvider, 'comfy-yue2', 'pin cleared: the default again');
  ok('order: saved pin > default for the setup');
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* gone */ } fs.rmSync(D, { recursive: true, force: true }); if (process.exitCode) console.error(stderr.slice(-2000)); }
console.log('audio-defaults: all checks passed');
