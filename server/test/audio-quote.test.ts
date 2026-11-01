// Audio quote extras (routing/audioQuote.ts, 2026-10-23): perUnit for second / minute / 1k_chars / 1k_bytes / run rows, from the same row as the
// charge, and eta. Checks perUnit × quantity = the run's usd (the charge rounds once to whole credits), local = null, no NaN anywhere.
// Run: npx tsx test/audio-quote.test.ts   (pure part + own mock server :9213, temp data dir, no keys, no network)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'audq-')); process.env.OPENHIGGSFIELD_DATA_DIR ||= path.join(D, 'pure');
const { perUnitOf, audioQuoteFields, PER_UNIT_NOTE, clipEstimateFor } = await import('../src/routing/audioQuote.ts');
const { HOSTED_BY_ID, usdToCredits, COMFY_CREDITS_PER_USD } = await import('../src/shared/hostedPrices.ts');
/** The charge's rounding (2026-10-24): rounded UP to whole credits, at least 1 (hostedPrices.ts usdToCredits; was Math.round). */
const toCredits = (usd: number) => Math.max(1, usdToCredits(usd));
const { priceOf, speechSeconds } = await import('../src/shared/pricing.ts');
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(9213); const B = `http://localhost:${PORT}`;
const ok = (m: string) => console.log('ok ' + m);
const noNaN = (x: unknown, at: string) => JSON.stringify(x, (_k, v) => { assert.ok(!(typeof v === 'number' && !Number.isFinite(v)), `${at}: non-finite number`); return v; });
/** The charge's credits for the same row and input (pricing.ts priceOf, the function routeCredits calls). */
const chargeOf = (ref: string, i: { duration?: number; chars?: number; bytes?: number; mode?: string }) => priceOf({ provider: ref, durationSec: i.duration, chars: i.chars, bytes: i.bytes, mode: i.mode } as any).credits;

// ---- 1. pure: one row per unit ----
const cases: [string, string, Record<string, any>, string][] = [
  ['api-sonilo-music', 'audio', { mode: 'music', duration: 30 }, 'second'],
  ['api-eleven-sfx', 'audio', { mode: 'sfx', duration: 30 }, 'minute'],
  // Seed Audio 1.0 Multilingual (2026-10-24): text to speech in Voice, billed per second of speech returned (estimated from the script)
  ['api-seed-audio', 'voice', { mode: 'voiceover', prompt: 'Welcome back. Today we walk through the old harbour at sunrise.' }, 'second'],
  ['api-eleven-tts', 'voice', { mode: 'voiceover', chars: 2500 }, '1k_chars'],
  ['direct-minimax-speech', 'voice', { mode: 'voiceover', prompt: 'Hello there, this is a voiceover script read aloud.' }, '1k_chars'],
  ['api-fish-tts', 'voice', { mode: 'voiceover', prompt: 'Héllo wörld, ünïcode costs more bytes' }, '1k_bytes'],
  ['cloud-minimax-music', 'audio', { mode: 'music', duration: 60 }, 'second'], // 2026-10-27: Comfy Cloud GPU time per second of song (estimate, unmeasured)
  // Seed Audio music / sound effects (2026-10-27): no script, no length field → the 120 s cap whatever the prompt
  ['api-seed-audio', 'audio', { mode: 'music', duration: 120, prompt: 'Warm lo-fi beat, mellow keys, vinyl crackle' }, 'second'],
  ['api-heygen-tts', 'voice', { mode: 'voiceover', duration: 12 }, 'second'],
];
for (const [ref, tool, input, unit] of cases) {
  assert.equal(HOSTED_BY_ID[ref]?.unit, unit, `${ref} row is billed ${unit}`);
  const p = perUnitOf(tool, ref, input)!; assert.ok(p, `${ref}: perUnit`); noNaN(p, ref);
  assert.equal(p.unit, unit); assert.ok(p.usd > 0 && p.quantity > 0); assert.ok(Math.abs(p.totalUsd - p.usd * p.quantity) < 1e-5, `${ref}: totalUsd = usd × quantity`);
  const text = typeof input.prompt === 'string' ? input.prompt : undefined;
  const charged = chargeOf(ref, { duration: input.duration, chars: input.chars ?? text?.length, bytes: text != null ? Buffer.byteLength(text) : undefined, mode: input.mode });
  assert.equal(toCredits(p.totalUsd), charged, `${ref}: perUnit × quantity (${p.usd} × ${p.quantity}) = the charge (${charged} credits)`);
}
{ const p = perUnitOf('voice', 'api-fish-tts', { mode: 'voiceover', prompt: 'Héllo' })!; assert.equal(p.quantity, Math.max(1, Buffer.byteLength('Héllo')) / 1000, 'bytes, not characters'); }
assert.equal(perUnitOf('audio', 'cloud-minimax-music', { duration: 60 })!.quantity, 60, '60 s of song');
for (const m of ['music', 'sfx']) { const p = perUnitOf('audio', 'api-seed-audio', { mode: m, prompt: 'rain on a tin roof', chars: 18 })!; assert.equal(p.quantity, 120, `Seed Audio ${m}: the 120 s cap, not the prompt length`);
  assert.equal(perUnitOf('audio', 'api-seed-audio', { types: JSON.stringify([m]), prompt: 'x' })!.quantity, 120, `${m} via types`); }
assert.ok(perUnitOf('voice', 'api-seed-audio', { mode: 'voiceover', prompt: 'Hello there.' })!.quantity < 120, 'Seed Audio speech: still from the script'); assert.equal(perUnitOf('audio', 'api-eleven-sfx', { duration: 30 })!.quantity, 0.5, '30 s = 0.5 minute');
ok('rows: second, minute, 1k_chars, 1k_bytes and run; perUnit × quantity = the charge');
assert.equal(perUnitOf('audio', null, { duration: 30 }), null, 'local (no price row) → null');
assert.equal(perUnitOf('audio', 'comfy-yue2', {}), null); assert.equal(perUnitOf('voice', 'comfy-qwen3tts', { chars: 100 }), null, 'local Qwen3 TTS (no price row) → null');
assert.equal(perUnitOf('audio', 'api-nano-banana', {}), null, 'a per-image row is not an audio unit');
for (const bad of [{ duration: 'abc' }, { duration: NaN, chars: NaN, bytes: -3 }, { duration: -10 }, { chars: Infinity }, {}]) for (const ref of ['api-sonilo-music', 'api-eleven-tts', 'api-fish-tts', 'api-eleven-sfx', 'cloud-minimax-music']) {
  const p = perUnitOf('voice', ref, bad as any); noNaN(p, `${ref} ${JSON.stringify(bad)}`); if (p) assert.ok(p.quantity > 0 && Number.isFinite(p.totalUsd)); }
const f = audioQuoteFields('audio', { local: true, priceRef: null, etaRange: { low: 30, high: 60, source: 'reported' } }, { duration: 30 });
assert.deepEqual(f, { perUnit: null, perUnitNote: null, eta: { lowSec: 30, highSec: 60, basis: 'estimate' } }, 'local: free, published ETA');
assert.equal(audioQuoteFields('audio', { priceRef: 'api-sonilo-music', etaRange: null }, { duration: 10 }).perUnitNote, PER_UNIT_NOTE.second);
assert.equal(audioQuoteFields('audio', { priceRef: 'api-sonilo-music', etaRange: { source: 'first_run', low: null, high: null } }, {}).eta, null, 'first run: no ETA');
ok('local and unpriced → null; bad inputs never give NaN; eta from the step-ETA range');
{ const est = { estimated: true, assumedSeconds: 8, estimateReason: 'clip_not_loaded', estimateMessage: 'Estimate for an 8 s clip; the exact price shows once your clip is loaded.' };
  assert.deepEqual(clipEstimateFor(est, 'api-eleven-sfx', 'soundtrack', { mode: 'sfx' }), est, 'per-minute row: the 8 s estimate stands');
  const cap = clipEstimateFor(est, 'api-seed-audio', 'soundtrack', { mode: 'music' }, 'Seed Audio'); assert.equal(cap.assumedSeconds, undefined); assert.equal(cap.capSeconds, 120);
  assert.equal(cap.estimateMessage, "Priced at up to 120 s: Seed Audio bills the audio it returns, up to 2 minutes, whatever your clip's length.");
  assert.deepEqual(clipEstimateFor(est, 'api-seed-audio', 'voice', { mode: 'voiceover', prompt: 'Hello there' }), {}, 'speech from the script: no clip note');
  assert.match(clipEstimateFor(est, 'api-seed-audio', 'voice', { mode: 'voiceover' }).estimateMessage, /until you add the script/);
  assert.deepEqual(clipEstimateFor(est, 'api-eleven-tts', 'voice', { mode: 'voiceover' }), {}, 'per 1k characters: no clip note');
  assert.deepEqual(clipEstimateFor(est, null, 'soundtrack', {}), est, 'local route: unchanged');
  ok('clipEstimateFor: "8 s" only where the price follows the clip; Seed Audio says its 120 s cap'); }

// ---- 1b. Seed Audio: the quote is never below what Comfy can bill for the script (hard rule: charge ≤ quote) ----
// Comfy bills original_duration × 0.7543 credits / s, capped at 120 s (docs.comfy.org/development/comfy-router/models/byteplus/seed-audio-1-0-multilingual/code,
// docs.comfy.org/development/comfy-router/pricing). The script is quoted at 8 letters / 2.5 CJK characters per second, slower than normal speech.
{ const h = HOSTED_BY_ID['api-seed-audio']; const sp = h.speech!; assert.equal(h.unit, 'second'); assert.equal(sp.maxSec, 120);
  const TRUE_USD = 0.7543 / COMFY_CREDITS_PER_USD; assert.ok(Math.abs(h.usd - TRUE_USD) <= 5e-6, 'rate = 0.7543 Comfy credits per second (row keeps 5 decimals)');
  const quote = (text?: string) => chargeOf('api-seed-audio', { chars: text?.length, bytes: text != null ? Buffer.byteLength(text) : undefined });
  const worst = (sec: number) => toCredits(Math.min(120, sec) * TRUE_USD); // Comfy's bill for `sec` seconds of speech, at the unrounded rate
  const capBill = worst(120);
  assert.equal(quote(), capBill, 'no script known → the 120 s billing cap (the most Comfy can bill)');
  const scripts: [string, number][] = [ // [script, a slow natural reading in seconds: 12 letters / 3 CJK characters per second]
    ['Hi.', 1], ['Welcome back. Today we walk through the old harbour at sunrise.', 63 / 12],
    ['The quick brown fox jumps over the lazy dog. '.repeat(10), 450 / 12], ['欢迎回来，今天我们一起走过日出时的老港口。', 21 / 3],
    ['こんにちは、今日は良い天気ですね。'.repeat(4), 68 / 3], ['A long audiobook chapter. '.repeat(200), 5200 / 12]];
  for (const [t, slow] of scripts) { const q = quote(t); const sec = speechSeconds(sp, t.length, Buffer.byteLength(t));
    assert.ok(q >= worst(slow), `${t.slice(0, 24)}…: quote ${q} ≥ bill at a slow natural pace ${worst(slow)}`); assert.ok(q <= capBill, 'never above the 120 s cap');
    assert.equal(q, toCredits(sec * h.usd), 'quote = quoted seconds × rate, rounded up'); assert.ok(sec >= sp.minSec && sec <= 120); }
  assert.equal(quote('A long audiobook chapter. '.repeat(200)), capBill, 'a script longer than 120 s of speech is quoted at the cap (Comfy bills at most 120 s)');
  const f = audioQuoteFields('voice', { priceRef: 'api-seed-audio', etaRange: null }, { mode: 'voiceover', prompt: 'Hello there' });
  assert.equal(f.upTo, true, 'Seed Audio quote is an "up to" figure'); assert.ok(f.upToNote && /120/.test(f.upToNote)); assert.match(String(f.perUnitNote), /speech returned/);
  assert.equal(audioQuoteFields('audio', { priceRef: 'api-sonilo-music', etaRange: null }, { duration: 10 }).upTo, undefined, 'a length-billed row is not "up to"');
  ok(`Seed Audio: quote ≥ Comfy's bill for every script (Latin / CJK / empty / over-long), capped at 120 s = ${capBill} credits; flagged "up to"`); }

// ---- 1c. ElevenLabs SFX v2: Comfy takes 0.5–30 s (docs.comfy.org/development/comfy-router/models/elevenlabs/eleven-sfx-v2/code), the body clamps to 30 ----
{ const h = HOSTED_BY_ID['api-eleven-sfx']; assert.equal(h.maxSec, 30);
  const { ROUTER_MODELS } = await import('../src/routing/routerModels.ts');
  for (const d of [45, 60, 300]) { assert.equal(perUnitOf('audio', 'api-eleven-sfx', { mode: 'sfx', duration: d })!.quantity, 0.5, `${d} s → quoted as 30 s`);
    assert.equal(chargeOf('api-eleven-sfx', { duration: d }), chargeOf('api-eleven-sfx', { duration: 30 }), `${d} s charge = 30 s charge`);
    assert.equal((await ROUTER_MODELS['api-eleven-sfx'].body({ prompt: 'thunder', duration: d } as any, 0) as any).duration_seconds, 30, `${d} s → body sends 30`); }
  assert.equal(perUnitOf('audio', 'api-eleven-sfx', { mode: 'sfx', duration: 10 })!.quantity, Math.round((10 / 60) * 1e4) / 1e4, 'under the cap: the picked length');
  assert.equal(chargeOf('api-eleven-sfx', { duration: 30 }), toCredits(0.5 * h.usd));
  ok(`SFX v2: any length above 30 s is quoted, charged (${chargeOf('api-eleven-sfx', { duration: 60 })} credits) and sent as 30 s`); }

// ---- 1d. 2026-10-25: SFX v2 short lengths offered on the Audio page; Seed Audio's 3,000-character script cap ----
{ const { audioTool } = await import('../src/tools/media.ts'); const app = (audioTool as any).app; const { ROUTER_MODELS, SEED_AUDIO_TEXT_MAX } = await import('../src/routing/routerModels.ts');
  assert.deepEqual(app.durationsByProvider['api-eleven-sfx'], [1, 2, 3, 5, 10, 15, 30]); assert.deepEqual(app.durationsByProvider['comfy-yue2'], [30, 60, 120, 180, 240, 360], 'YuE2: its own lengths (2026-10-27)');
  assert.deepEqual(app.durationsByProvider['comfy-stable-audio'], [5, 10, 20, 30, 47], 'Stable Audio Open 1.0: up to 47 s'); assert.deepEqual(app.lengthUpTo, ['comfy-yue2', 'comfy-minimax-music3', 'cloud-minimax-music']);
  assert.equal((audioTool as any).inputs.find((i: any) => i.name === 'duration').default, '10', 'no length sent = 10 s, as before');
  let last = 0; for (const d of [1, 2, 3, 5, 10, 15, 30]) { const pu = perUnitOf('audio', 'api-eleven-sfx', { mode: 'sfx', duration: d })!; assert.equal(pu.quantity, Math.round((d / 60) * 1e4) / 1e4, `${d} s quoted as ${d} s`);
    const c = chargeOf('api-eleven-sfx', { duration: d }); assert.ok(c >= last, `${d} s costs no less than shorter`); last = c;
    assert.equal((await ROUTER_MODELS['api-eleven-sfx'].body({ prompt: 'door slam', duration: d } as any, 0) as any).duration_seconds, d, `${d} s sent as ${d} s`); }
  const sa = ROUTER_MODELS['api-seed-audio']; assert.equal(SEED_AUDIO_TEXT_MAX, 3000);
  assert.equal(sa.block!({ prompt: 'x'.repeat(3000) } as any), null, '3,000 characters run'); assert.match(String(sa.block!({ prompt: 'x'.repeat(3001) } as any)), /3,000 characters; yours is 3,001/);
  assert.equal(sa.block!({} as any), null, 'no script in a listing: not blocked (the voice tool asks for one)');
  await assert.rejects(() => sa.body({ prompt: 'y'.repeat(3500) } as any, 0) as Promise<any>, /3,000/, 'never sent over the cap');
  ok('SFX v2 offers 1–30 s, each quoted and sent as picked; Seed Audio blocks scripts over 3,000 characters before sending'); }

// ---- 2. the API on a keyless mock server: a quote per workflow ----
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '', OPENHIGGSFIELD_ARK_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '' };
const env = { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '',
  OPENHIGGSFIELD_ROUTING_LIVE: '', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '0', OPENHIGGSFIELD_HOSTED: '', OPENHIGGSFIELD_SEED_COMMUNITY: '0' };
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'pipe'], detached: true });
let stderr = ''; srv.stderr!.on('data', (b) => { stderr += String(b); });
const get = async (u: string) => { const r = await fetch(B + u); const t = await r.text(); assert.ok(!/\bNaN\b/.test(t), `${u}: NaN in the body`); return JSON.parse(t) as any; };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 500)); }
  const wfs = (await get('/api/audio-workflows')).workflows as any[];
  for (const w of wfs) { // every workflow quotes with its default model (and each of its models) without errors and with the new fields present
    for (const p of [null, ...w.models[w.mode]]) {
      const q = await get(`/api/tools/${w.tool}/price?mode=${w.mode}${p ? `&provider=${p}` : ''}&seconds=30&chars=600${w.mode === 'translate' ? '&language=es' : ''}`);
      assert.ok('perUnit' in q && 'eta' in q, `${w.id}/${p ?? 'default'}: perUnit + eta on the quote (${JSON.stringify(q).slice(0, 200)})`);
      if (q.local) assert.equal(q.perUnit, null, `${w.id}/${p}: local is free`);
      if (q.perUnit) { const usd = (q.listCredits ?? q.credits) * 0.01; assert.equal(toCredits(q.perUnit.totalUsd), q.listCredits ?? q.credits, `${w.id}/${p}: perUnit × quantity = ${usd}`);
        assert.equal(q.perUnit.unit, q.unit, `${w.id}/${p}: same row as the charge`); }
    }
  }
  ok(`API: ${wfs.length} workflows × their models quote with perUnit + eta, perUnit × quantity = the list price`);
  const tts = await get('/api/tools/voice/price?mode=voiceover&provider=api-eleven-tts&chars=2500');
  assert.equal(tts.perUnit.unit, '1k_chars'); assert.equal(tts.perUnit.quantity, 2.5); assert.equal(tts.perUnitNote, PER_UNIT_NOTE['1k_chars']);
  const mm = await get('/api/tools/audio/price?mode=music&provider=cloud-minimax-music&seconds=60'); assert.equal(mm.perUnit?.unit ?? 'second', 'second');
  for (const m of ['music', 'sfx']) { const sa = await get(`/api/tools/audio/price?mode=${m}&provider=api-seed-audio&prompt=${encodeURIComponent('Warm lo-fi beat')}`); assert.equal(sa.perUnit.unit, 'second'); assert.equal(sa.perUnit.quantity, 120, `Seed Audio ${m} quote: 120 s cap`);
    assert.equal(sa.upTo, true); assert.match(sa.perUnitNote, /2-minute cap/); assert.equal(sa.listCredits ?? sa.credits, 43, `Seed Audio ${m}: 120 × 0.7543 credits ÷ 211 = $0.429 → 43 cents ${JSON.stringify({ c: sa.credits, l: sa.listCredits, d: sa.demo })}`); }
  const yue = await get('/api/tools/audio/price?mode=music&provider=comfy-yue2&seconds=60'); assert.equal(yue.perUnit, null); assert.equal(yue.credits, 0);
  const cover = await get('/api/tools/audio/price?mode=cover&provider=comfy-yue2'); assert.equal(cover.perUnit, null); assert.equal(cover.credits, 0);
  const sfx = await get('/api/tools/audio/price?mode=sfx&provider=api-eleven-sfx&seconds=30'); assert.equal(sfx.perUnit.unit, 'minute'); assert.equal(sfx.perUnit.quantity, 0.5);
  const sfx60 = await get('/api/tools/audio/price?mode=sfx&provider=api-eleven-sfx&seconds=60'); assert.equal(sfx60.perUnit.quantity, 0.5, 'SFX 60 s quoted as 30 s'); assert.equal(sfx60.credits, sfx.credits);
  const seed = await get('/api/tools/voice/price?mode=voiceover&provider=api-seed-audio&chars=80'); assert.equal(seed.perUnit.unit, 'second'); assert.equal(seed.upTo, true, 'Seed Audio quote says up to');
  const seedNone = await get('/api/tools/voice/price?mode=voiceover&provider=api-seed-audio'); assert.ok(seedNone.credits >= seed.credits, 'no script → cap');
  const vid = await get('/api/tools/h3-video/price?mode=t2v&seconds=5'); assert.ok(!('perUnit' in vid), 'Generate Video quote unchanged (perSecond, not perUnit)');
  // P3-02: a tool that takes a clip, quoted before the clip loads: "8 s" only where the price follows the clip. Seed Audio (no length field) is priced at its
  // 120 s cap and says so; its price is the same with any clip length (= the charge); ElevenLabs SFX (per minute of the clip, capped at 30 s) keeps the 8 s note.
  const sa0 = await get('/api/tools/soundtrack/price?mode=music&provider=api-seed-audio&prompt=calm');
  assert.equal(sa0.assumedSeconds, undefined, 'Seed Audio: no "8 s" assumption'); assert.equal(sa0.estimateReason, 'billed_cap'); assert.equal(sa0.capSeconds, 120);
  assert.match(sa0.estimateMessage, /up to 120 s/); assert.doesNotMatch(sa0.estimateMessage, /\b8 s\b/);
  const sa30 = await get('/api/tools/soundtrack/price?mode=music&provider=api-seed-audio&prompt=calm&seconds=30'); assert.equal(sa30.estimated, undefined, 'a loaded clip: no estimate');
  const lp = (q: any) => q.listCredits ?? q.credits; /* keyless mock = sample runs (credits 0): the list price is the real run's */
  assert.equal(lp(sa0), lp(sa30), 'Seed Audio: the same price before and after the clip loads'); assert.equal(lp(sa0), chargeOf('api-seed-audio', { mode: 'music' }), 'price = the charge (120 s cap)');
  assert.equal(sa0.perUnit?.quantity, 120, 'quoted on 120 s');
  const el0 = await get('/api/tools/soundtrack/price?mode=sfx&provider=api-eleven-sfx&prompt=rain');
  assert.equal(el0.estimated, true); assert.equal(el0.assumedSeconds, 8, 'ElevenLabs SFX follows the clip: the 8 s estimate stays'); assert.equal(lp(el0), chargeOf('api-eleven-sfx', { mode: 'sfx', duration: 8 }));
  ok('P3-02: Seed Audio on a clip tool is priced at its 120 s cap and says so (no "8 s"); ElevenLabs SFX keeps the 8 s clip estimate');
  ok('API: ElevenLabs per 1k characters, MiniMax Music 3 per run, YuE2 free, ElevenLabs SFX per minute (capped at 30 s), Seed Audio up to; video quote untouched');
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* gone */ } fs.rmSync(D, { recursive: true, force: true }); if (process.exitCode) console.error(stderr.slice(-2000)); }
console.log('audio-quote: all checks passed');
