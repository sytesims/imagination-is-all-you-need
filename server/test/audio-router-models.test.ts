// ElevenLabs v3 / v4 Turbo on Comfy Router (2026-10-25), next to ElevenLabs v4 and Seed Audio: bodies (voices, Expression → stability, seed),
// script caps and clone refusals (block = body, so quote = submit), prices from the Router pricing page, tool membership and names.
// Optional official Router input schemas (<provider>__<model>.json) use MODEL_HEALTH_SCHEMAS / ROUTER_SCHEMAS_DIR or the generic user cache;
// that additional check skips with a note when files are absent. Body, cap and price assertions below always run.
// Run: npx tsx test/audio-router-models.test.ts   (in-process, temp data dir, mock backend, no keys, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { createRequire } from 'node:module';
import { ROUTER_SCHEMA_DIR } from './_model-health.js';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'audrm-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' });
const M = await import('../src/routing/routerModels.ts');
const { HOSTED_BY_ID, usdToCredits, COMFY_CREDITS_PER_USD } = await import('../src/shared/hostedPrices.ts');
const { priceOf } = await import('../src/shared/pricing.ts');
const { parseVoiceControls, VOICE_CAPS } = await import('../src/tools/voice/voiceControls.ts');
const { audioTool, voiceStudioTool } = await import('../src/tools/media.ts');
const { MODELS, engineModelKey } = await import('../src/shared/modelIds.ts');
const { CATALOGUE } = await import('../src/shared/modelRank.ts');
const ok = (m: string) => console.log('ok ' + m);
const R = M.ROUTER_MODELS;
const ELEVEN: [string, string, string][] = [['api-eleven-tts', 'elevenlabs/eleven_v4', 'ElevenLabs v4'], ['api-eleven-v3', 'elevenlabs/eleven_v3', 'ElevenLabs v3'], ['api-eleven-v4-turbo', 'elevenlabs/eleven_v4_turbo', 'ElevenLabs v4 Turbo']];

// ---- additional ajv checks against optional official schemas ----
const SCHEMAS = ROUTER_SCHEMA_DIR;
const AJV = path.resolve(import.meta.dirname, '../../node_modules/ajv/dist/2020.js');
type V = ((b: unknown) => boolean) & { errors?: unknown };
const validators: Record<string, V | null> = {};
const validatorFor = (routerId: string): V | null => {
  if (routerId in validators) return validators[routerId];
  const f = path.join(SCHEMAS, `${routerId.replace('/', '__')}.json`);
  if (!fs.existsSync(f) || !fs.existsSync(AJV)) return (validators[routerId] = null);
  const Ajv = createRequire(import.meta.url)(AJV).default; const ajv = new Ajv({ strict: false, validateFormats: false });
  const { openapi: _o, ...doc } = JSON.parse(fs.readFileSync(f, 'utf8')); doc.$id = `https://router.schema/${routerId}`; ajv.addSchema(doc);
  const p = `/v2/models/${routerId}`.replace(/~/g, '~0').replace(/\//g, '~1');
  return (validators[routerId] = ajv.compile({ $ref: `https://router.schema/${routerId}#/paths/${p}/post/requestBody/content/application~1json/schema` }));
};
let checked = 0; let skipped = 0;
const valid = (routerId: string, body: unknown, what: string) => { const v = validatorFor(routerId); if (!v) { skipped++; return; }
  assert.ok(v(body), `${routerId} ${what}: ${JSON.stringify(v.errors)} body ${JSON.stringify(body).slice(0, 300)}`); checked++; };

// ---- 1. the three ElevenLabs entries: one body, synchronous ----
for (const [pid, id, name] of ELEVEN) { const E = R[pid]; assert.ok(E, pid); assert.equal(E.id, id); assert.equal(E.queue, false, `${pid}: synchronous (the queue refuses raw audio bytes)`);
  assert.equal(E.out, 'audio'); assert.match(E.doc, new RegExp(`/models/${id.replace('_', '-').replace('_', '-')}/code$`));
  const variants: [string, any][] = [
    ['default voice', { prompt: 'Hello there.' }],
    ['library voice + Expression', { prompt: 'Hello there.', voice: 'deep-calm', voiceControls: { expression: 8 }, voiceNative: { stability: 0.2 } }],
    ['ElevenLabs voice id + seed', { prompt: 'Hi', voice: 'AbCdEfGhIjKlMnOpQrSt', seed: 4294967295 + 7 }],
    ['audio tags', { prompt: '[whispers] Come closer. [laughs] Gotcha!', voice: 'whisper-soft' }],
    ['Expression 0', { prompt: 'x', voiceControls: { expression: 0 } }], ['Expression 10', { prompt: 'x', voiceControls: { expression: 10 } }]];
  for (const [what, i] of variants) { const b: any = await E.body(i, 0); valid(id, b, what);
    assert.equal(b.inputs.length, 1); assert.equal(b.inputs[0].text, i.prompt, `${pid} ${what}: the script as typed (tags kept)`); assert.equal(b.language_code, undefined); assert.equal(b.model_id, undefined, 'Router fills model_id from the path'); }
  for (const [v, x] of Object.entries(M.ELEVEN_VOICES)) assert.equal(((await E.body({ prompt: 'x', voice: v }, 0)) as any).inputs[0].voice_id, x.id, `${pid} ${v}`);
  assert.equal(((await E.body({ prompt: 'x', voice: 'not-a-voice' }, 0)) as any).inputs[0].voice_id, M.ELEVEN_VOICES['narrator-warm'].id, 'unknown voice → Rachel');
  const s: any = await E.body({ prompt: 'x', seed: 4294967295 + 7 }, 0); assert.ok(s.seed >= 0 && s.seed <= 4294967295, 'seed in 0–4294967295');
  // a cloned voice is refused before sending, with the model's name
  assert.match(String(E.block!({ voice: 'clone', prompt: 'x' } as any)), new RegExp(`^${name} on Comfy Router reads with its own voices`));
  assert.match(String(E.block!({ voice: 'narrator-warm', prompt: 'x', voiceSamplePaths: ['/tmp/a.wav'] } as any)), /voice cloning runs on another model/);
  assert.equal(E.block!({ voice: 'narrator-crisp', prompt: 'x' } as any), null); assert.equal(E.block!({} as any), null, 'no script in a listing: not blocked');
}
// stability: v4 / v4 Turbo take Expression as is (7 → 0.3); v3 snaps to Creative 0 / Natural 0.5 / Robust 1
for (const [e, v4, v3] of [[0, 1, 1], [2, 0.8, 1], [3, 0.7, 0.5], [5, 0.5, 0.5], [7, 0.3, 0.5], [8, 0.2, 0], [10, 0, 0]] as const) {
  const vc: any = parseVoiceControls({ expression: String(e) }, 'api-eleven-v3', 0); assert.ok(vc.ok);
  const i = { prompt: 'x', voiceControls: { expression: e }, voiceNative: vc.native };
  assert.equal(((await R['api-eleven-tts'].body(i, 0)) as any).settings.stability, v4, `v4 expression ${e}`);
  assert.equal(((await R['api-eleven-v4-turbo'].body(i, 0)) as any).settings.stability, v4, `v4 Turbo expression ${e}`);
  assert.equal(((await R['api-eleven-v3'].body(i, 0)) as any).settings.stability, v3, `v3 expression ${e}`); }
for (const pid of ['api-eleven-v3', 'api-eleven-v4-turbo']) { assert.equal(VOICE_CAPS[pid].maxVoiceSamples, 0); assert.equal(VOICE_CAPS[pid].controls.expression.via, 'native');
  const bad: any = parseVoiceControls({ mood: '0.5' }, pid, 0); assert.equal(bad.ok, false, `${pid}: no mood control`);
  const smp: any = parseVoiceControls({}, pid, 1); assert.equal(smp.ok, false, `${pid}: no voice samples`); assert.match(smp.issues[0].message, /own voices/); }
ok(`ElevenLabs v4 / v3 / v4 Turbo: one body (voices, seed, tags as typed), synchronous, clone refused; v3 stability snapped to its 3 presets`);

// ---- 2. script caps: v3 5,000 characters (block and body agree, so the quote and the submit refuse alike); v4 / Turbo none; Seed Audio 3,000 ----
{ const V3 = R['api-eleven-v3']; assert.equal(M.ELEVEN_V3_TEXT_MAX, 5000);
  assert.equal(V3.block!({ prompt: 'x'.repeat(5000) } as any), null, '5,000 run'); valid('elevenlabs/eleven_v3', await V3.body({ prompt: 'x'.repeat(5000) } as any, 0), '5,000 characters');
  const msg = String(V3.block!({ prompt: 'x'.repeat(5001) } as any)); assert.match(msg, /^ElevenLabs v3 reads scripts up to 5,000 characters; yours is 5,001\. Shorten it or pick another voice model$/);
  await assert.rejects(() => V3.body({ prompt: 'y'.repeat(6000) } as any, 0) as Promise<any>, /5,000 characters; yours is 6,000/, 'never sent over the cap');
  for (const pid of ['api-eleven-tts', 'api-eleven-v4-turbo']) assert.equal(R[pid].block!({ prompt: 'x'.repeat(9000) } as any), null, `${pid}: no published cap`);
  const SA = R['api-seed-audio']; assert.match(String(SA.block!({ prompt: 'x'.repeat(3001) } as any)), /^Seed Audio reads scripts up to 3,000 characters; yours is 3,001\./);
  // empty script: the voice tools' own 400 before any route (both tools, every new model)
  for (const pid of ['api-eleven-v3', 'api-eleven-v4-turbo']) {
    const v: any = await (voiceStudioTool as any).parseInput({ types: '["voiceover"]', prompt: '   ', provider: pid }, {}); assert.ok(v.error, `voice ${pid}: empty script refused`);
    const a: any = await (audioTool as any).parseInput({ types: '["voice"]', prompt: '', provider: pid }, {}); assert.ok(a.error, `audio ${pid}: empty script refused`); }
  ok('caps: v3 runs 5,000 characters and refuses 5,001 before sending (block = body); v4 / Turbo uncapped; empty scripts are the tools\' 400'); }

// ---- 3. Seed Audio: one entry on the Multilingual id; its body fits both Seed Audio 1.0 schemas (the same shared input schema) ----
{ const SA = R['api-seed-audio']; assert.equal(SA.id, 'byteplus/seed-audio-1.0-multilingual'); assert.ok(!Object.values(R).some((r) => r.id === 'byteplus/seed-audio-1.0'), 'no near-duplicate Seed Audio 1.0 row');
  for (const t of ['Hello from the harbour.', '欢迎回来，今天我们一起走过日出时的老港口。', 'x'.repeat(3000)]) { const b = await SA.body({ prompt: t } as any, 0);
    valid('byteplus/seed-audio-1.0-multilingual', b, `${t.length} chars`); valid('byteplus/seed-audio-1.0', b, `${t.length} chars`); }
  for (const m of ['music', 'sfx']) { const b: any = await SA.body({ types: [m], prompt: 'Warm lo-fi beat, vinyl crackle' } as any, 0); assert.equal(b.audio_config.sample_rate, 44100); valid('byteplus/seed-audio-1.0-multilingual', b, `${m} body`); } // 2026-10-27: Music / Sound effects
  ok('Seed Audio: the Multilingual body validates on both seed-audio-1.0 schemas; no duplicate row'); }

// ---- 4. prices: Router pricing page, per 1,000 characters; the quote follows the script length ----
{ const rows: [string, number][] = [['api-eleven-v3', 21.1], ['api-eleven-v4-turbo', 12.0692]];
  for (const [pid, cr] of rows) { const h = HOSTED_BY_ID[pid]; assert.equal(h.unit, '1k_chars'); assert.equal(h.estimated, false); assert.match(h.sourceUrl, /comfy-router\/pricing/);
    assert.ok(Math.abs(h.usd! - cr / COMFY_CREDITS_PER_USD) <= 5e-6, `${pid}: ${cr} credits per 1K characters`);
    for (const chars of [1, 999, 1000, 2500, 5000]) assert.equal(priceOf({ provider: pid, chars } as any).credits, Math.max(1, usdToCredits((Math.max(1, chars) / 1000) * h.usd!)), `${pid} ${chars} chars`); }
  assert.ok(priceOf({ provider: 'api-eleven-v4-turbo', chars: 2500 } as any).credits < priceOf({ provider: 'api-eleven-tts', chars: 2500 } as any).credits, 'Turbo costs less than v4');
  ok(`prices: v3 ${priceOf({ provider: 'api-eleven-v3', chars: 1000 } as any).credits} / v4 Turbo ${priceOf({ provider: 'api-eleven-v4-turbo', chars: 1000 } as any).credits} credits per 1K characters`); }

// ---- 5. where they show: Audio → Voice and Voice Studio → Voiceover, right after ElevenLabs v4; names and catalogue ----
{ const ap = (audioTool as any).app?.providerModes ?? (audioTool as any).providerModes; const vp = (voiceStudioTool as any).app?.providerModes ?? (voiceStudioTool as any).providerModes;
  for (const [pid, key, nm] of [['api-eleven-v3', 'elevenlabs-v3', 'ElevenLabs v3'], ['api-eleven-v4-turbo', 'elevenlabs-v4-turbo', 'ElevenLabs v4 Turbo']] as const) {
    if (ap) assert.deepEqual(ap[pid], ['voice'], `audio: ${pid}`); if (vp) assert.deepEqual(vp[pid], ['voiceover'], `voice: ${pid}`);
    assert.equal(engineModelKey('voice', pid), key); assert.equal(MODELS[key].name, nm); assert.equal(MODELS[key].medium, 'audio'); assert.equal(CATALOGUE[key].kind, 'voice'); assert.equal(CATALOGUE[key].home, 'api'); }
  const ids = (t: any) => (t.providers ?? []).map((p: any) => p.id ?? p); const a = ids(audioTool); const v = ids(voiceStudioTool);
  for (const xs of [a, v]) { const k = xs.indexOf('api-eleven-tts'); assert.deepEqual(xs.slice(k, k + 3), ['api-eleven-tts', 'api-eleven-v3', 'api-eleven-v4-turbo'], xs.join(',')); }
  assert.equal(CATALOGUE['elevenlabs-v4-turbo'].variantOf, 'elevenlabs-v4'); assert.equal(CATALOGUE['seed-audio'].kind, 'voice');
  ok('tools: Audio Voice + Voice Studio Voiceover list v4, v3, v4 Turbo together; model keys, names and catalogue entries set'); }

// ---- 6. HeyGen Voice on Comfy Router (2026-10-31): heygen/starfish (docs.comfy.org/development/comfy-router/models/heygen/starfish/code), no longer "Not on Router" ----
{ const H = R['api-heygen-tts']; assert.ok(H, 'HeyGen Voice has a Router spec'); assert.equal(H.id, 'heygen/starfish'); assert.equal(H.out, 'audio'); assert.match(H.doc, /\/models\/heygen\/starfish\/code$/);
  assert.equal(M.NOT_ON_ROUTER['api-heygen-tts'], undefined, 'the outdated "Not on Comfy Router yet" note is gone');
  const b: any = await H.body({ prompt: 'Thanks for watching.', voice: 'deep-calm', voiceNative: { speed: 1.25 } } as any, 0); valid('heygen/starfish', b, 'library voice + speed');
  assert.deepEqual(b, { text: 'Thanks for watching.', voice_id: M.HEYGEN_VOICES['deep-calm'].id, speed: 1.25, input_type: 'text' });
  for (const [v, x] of Object.entries(M.HEYGEN_VOICES)) { assert.match(x.id, /^[0-9a-f]{32}$/); assert.equal(((await H.body({ prompt: 'x', voice: v } as any, 0)) as any).voice_id, x.id, v); }
  assert.equal(M.HEYGEN_VOICES['narrator-crisp'].id, 'd2f4f24783d04e22ab49ee8fdc3715e0', 'the docs example voice');
  assert.equal(((await H.body({ prompt: 'x', voice: '0123456789abcdef0123456789abcdef' } as any, 0)) as any).voice_id, '0123456789abcdef0123456789abcdef', 'a HeyGen voice id passes as is');
  assert.equal(((await H.body({ prompt: 'x', voice: 'nope' } as any, 0)) as any).voice_id, M.HEYGEN_VOICES['narrator-warm'].id, 'unknown → the default voice');
  for (const [sp, want] of [[0.1, 0.5], [3, 2], [undefined, 1], [0.75, 0.75]] as const) assert.equal(((await H.body({ prompt: 'x', voiceNative: sp == null ? undefined : { speed: sp } } as any, 0)) as any).speed, want, `speed ${sp}`);
  assert.equal(H.block!({ prompt: 'x'.repeat(5000) } as any), null); assert.match(String(H.block!({ prompt: 'x'.repeat(5001) } as any)), /^HeyGen Voice reads scripts up to 5,000 characters; yours is 5,001\./);
  await assert.rejects(() => H.body({ prompt: 'y'.repeat(6000) } as any, 0) as Promise<any>, /5,000 characters/); await assert.rejects(() => H.body({ prompt: '  ' } as any, 0) as Promise<any>, /needs a script/);
  assert.match(String(H.block!({ voice: 'clone', prompt: 'x' } as any)), /own voices; voice cloning runs on another model/);
  assert.deepEqual(H.outputs({ data: { audio_url: 'https://x.test/s.mp3', duration: 2.5 } }), [{ url: 'https://x.test/s.mp3' }]);
  // price: Router pricing "Rates by duration" 0.2013 credits / s, seconds estimated from the script (6 letters / s), up to 840 s
  const h = HOSTED_BY_ID['api-heygen-tts']; assert.equal(h.unit, 'second'); assert.match(h.sourceUrl, /comfy-router\/pricing/); assert.equal(h.checkedAt, '2026-10-31'); assert.equal(h.usd, 0.000954);
  assert.equal(priceOf({ provider: 'api-heygen-tts', chars: 600 } as any).credits, Math.max(1, usdToCredits(100 * 0.000954)), '600 letters ≈ up to 100 s');
  assert.equal(priceOf({ provider: 'api-heygen-tts', chars: 5000 } as any).credits, usdToCredits(834 * 0.000954), '5,000 letters ≈ up to 834 s');
  assert.equal(priceOf({ provider: 'api-heygen-tts' } as any).credits, usdToCredits(840 * 0.000954), 'no script yet: the 840 s cap');
  const { routesFor } = await import('../src/routing/routes.ts'); const rr = routesFor('api-heygen-tts')[0]; assert.equal(rr.routeId, 'comfy-router:api-heygen-tts'); assert.ok(!rr.comingSoon, 'not Coming soon any more'); assert.equal((rr.caps as any)?.routerModel, 'heygen/starfish');
  ok('HeyGen Voice: heygen/starfish body (voices, speed 0.5–2, 5,000 characters), clone refused, outputs; 0.2013 credits per s from the script; Router route live'); }

console.log(checked ? `ok schema: ${checked} body variants valid against the official Router schemas` : `skip schema: ${SCHEMAS} not found (${skipped} checks skipped)`);
fs.rmSync(D, { recursive: true, force: true });
console.log('audio-router-models: all checks passed');
