// E2E (own mock server): Generate Video per-model limits, duration/aspect/audio/bitrate/refKinds validation and routing,
// price follows duration (= charge), video preset library, shared history. Run: npx tsx test/video-caps.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const PORT = testPort(8826), B = `http://localhost:${PORT}`, D = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-'));
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BILLING_MODE: 'team', OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FAL_KEY: 'mock-test', OPENHIGGSFIELD_REPLICATE_API_TOKEN: 'mock-test', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '1' /* runnable gate: mock-keys simulation instead of a fake real key */, OPENHIGGSFIELD_MAX_QUEUED: '200', MAX_QUEUED: '200' }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await fetch(B + u)).json();
const bal = async () => (await get('/api/ledger')).balance;
const post = async (tool: string, f: Record<string, string>, files: [string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); for (const [k, p] of files) fd.append(k, new Blob([fs.readFileSync(p)]), path.basename(p)); const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() }; };
const wait = async (id: string) => { for (let i = 0; i < 1400; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 500)); } const jj = await get(`/api/jobs/${id}`); const q = await get('/api/queue'); throw new Error('timeout ' + JSON.stringify({ s: jj.status, st: jj.stage, qp: jj.queuePos, q }).slice(0, 800)); };
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); }
  await fetch(`${B}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ global: { mode: 'auto', allowFallback: true, useLocal: true, mockKeys: true } }) });
  const png = path.join(import.meta.dirname, 'fixtures/ref-512.png'); const wav = path.join(D, 'a.wav'); const mp4 = path.join(D, 'r.mp4');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=d=3', wav]); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=24', '-t', '3', '-pix_fmt', 'yuv420p', mp4]);
  // 6) per-model limits in /api/models
  const ms = (await get('/api/models?toolId=h3-video')).groups.flatMap((g: any) => g.models); const by = Object.fromEntries(ms.map((m: any) => [m.id, m]));
  const c = by['comfy-h3'].capabilities; assert.equal(c.minSeconds, 4); assert.equal(c.maxSeconds, 15); assert.deepEqual(c.duration, { min: 4, max: 15, step: 1, values: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] }); assert.equal(c.maxResolution, '768p');
  assert.deepEqual(c.aspects, ['auto', '16:9', '9:16', '4:3', '3:4', '1:1', '21:9']); assert.deepEqual(c.refMax, { image: 9, video: 3, audio: 3 }); assert.equal(c.audio.priceAffects, false); assert.deepEqual(by['router-kling'].capabilities.durations, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]); assert.deepEqual(by['router-veo'].capabilities.duration, { min: 4, max: 8, step: 2, values: [4, 6, 8] }); assert.ok(['api-minimax-h3', 'router-kling', 'router-veo', 'router-seedance'].every((id) => by[id].capabilities.verified));
  const local = by['comfy-h3'].routes.find((r: any) => r.routeId === 'local:comfy-h3'); assert.deepEqual(local.caps.aspects, ['auto', '16:9', '9:16', '1:1']); assert.deepEqual(local.caps.refMax, { image: 2 });
  console.log('ok /api/models h3-video capabilities + per-route caps');
  // 2) duration: any 4–15 s on H3, priced per second (= charge)
  for (const d of [7, 12]) {
    const pr = await get(`/api/tools/h3-video/price?provider=comfy-h3&route=fal:minimax/h3/text-to-video&duration=${d}&resolution=768p&mode=t2v`);
    const b0 = await bal(); const j = await post('h3-video', { types: '["t2v"]', prompt: 'a fox runs', duration: String(d), resolution: '768p', provider: 'comfy-h3', route: 'fal:minimax/h3/text-to-video', rights: '1' });
    assert.equal(j.status, 200, JSON.stringify(j.body)); const charged = b0 - (await bal()); assert.equal(charged, Math.round(0.06 * d * 100)); assert.equal(pr.credits, charged); console.log(`ok duration ${d}s → ${charged} credits = price`);
  }
  { // fal's H3 schemas take 5–15 s (2026-10-26): a 4 s job pinned to fal is refused up front, nothing charged; Auto runs it on another place
    const b0 = await bal(); const j4 = await post('h3-video', { types: '["t2v"]', prompt: 'a fox runs', duration: '4', resolution: '768p', provider: 'comfy-h3', route: 'fal:minimax/h3/text-to-video', rights: '1' });
    assert.equal(j4.status, 409, JSON.stringify(j4.body)); assert.match(j4.body.reason, /doesn't do 4 s; it does 5–15 s/); assert.equal(await bal(), b0); console.log('ok fal H3 4 s → 409, nothing charged'); }
  const k7 = await post('h3-video', { types: '["t2v"]', prompt: 'x', duration: '5', provider: 'router-veo', rights: '1' }); assert.equal(k7.status, 200, JSON.stringify(k7.body)); assert.ok(k7.body.warnings.some((w: string) => /Made at 6 s, the closest length/.test(w)), JSON.stringify(k7.body.warnings)); // D5: snapped, not refused
  const tiers: [string, string[], number[]][] = [['router-kling', ['720p', '1080p'], [3, 15]], ['router-veo', ['720p', '1080p', '4K'], [4, 8]] /* 4K added 2026-10-28 (priced, 8 s only) */, ['router-seedance', ['720p', '480p', '1080p'], [4, 15]], ['api-minimax-h3', ['768p', '2K'], [4, 15]] /* Router takes 4–15 s (2026-10-28) */, ['comfy-h3', ['768p', '480p'], [5, 15]] /* priced on the fal route, whose schema starts at 5 s */];
  for (const [prov, rs, ds] of tiers) { // per tier × per second, quote = charge
    const m = by[prov]; assert.deepEqual(m.resolutions, rs); assert.equal(m.defaultResolution, rs[0]);
    for (const res of rs) for (const d0 of ds) {
      const only = m.capabilities.durationsByResolution?.[res] as number[] | undefined; const d = only && !only.includes(d0) ? only[0] : d0; // Veo 1080p: 8 s only
      const rt = prov === 'comfy-h3' ? 'fal:minimax/h3/text-to-video' : ''; const pr = await get(`/api/tools/h3-video/price?provider=${prov}&duration=${d}&resolution=${res}${rt ? `&route=${rt}&types=${encodeURIComponent('["t2v"]')}` : ''}`); // the text-to-video route quotes the t2v job it runs (Oct 18: a route that can't run the quoted job gives credits null + listCredits) assert.ok(pr.credits > 0, JSON.stringify(pr));
      const b0 = await bal(); const j = await post('h3-video', { types: '["t2v"]', prompt: 'a fox runs', duration: String(d), resolution: res, provider: prov, ...(rt ? { route: rt } : {}), rights: '1' }); assert.equal(j.status, 200, JSON.stringify(j.body));
      assert.equal(b0 - (await bal()), pr.credits, `${prov} ${res} ${d}s`); console.log(`ok ${prov} ${res} ${d}s → ${pr.credits} credits = charge (route ${pr.route})`); }
    const badRes = prov === 'comfy-h3' ? '1080p' : '768p' === rs[0] ? '480p' : '2K';
    const bp = await fetch(`${B}/api/tools/h3-video/price?provider=${prov}&duration=${ds[0]}&resolution=${badRes}`); const bpb: any = await bp.json(); assert.equal(bp.status, 200, JSON.stringify(bpb).slice(0, 300)); assert.ok((bpb.adjustNotes ?? []).some((n: string) => /closest size/.test(n)), JSON.stringify(bpb.adjustNotes)); // D5: nearest tier, with a note
    const bj = await post('h3-video', { types: '["t2v"]', prompt: 'x', duration: String(ds[0]), resolution: badRes, provider: prov, rights: '1' }); assert.equal(bj.status, 200, JSON.stringify(bj.body)); assert.ok(rs.includes((await get(`/api/jobs/${bj.body.id}`)).input.resolution));
  }
  console.log('ok a tier the model lacks → the nearest one, with a note (price + job)');
  { // 2026-10-25 fixes: Veo 1080p = 8 s only (4K too, 2026-10-28), MiniMax H3 ≥ 4 s (was 5, 2026-10-28), Kling Standard / Pro labels, Veo sound off by default (quote = toggle)
    const vc = by['router-veo'].capabilities; assert.deepEqual(vc.durationsByResolution, { '1080p': [8], '4K': [8] });
    for (const d of [4, 6]) { const bq = await fetch(`${B}/api/tools/h3-video/price?provider=router-veo&duration=${d}&resolution=1080p`); const bb: any = await bq.json(); assert.equal(bq.status, 200); assert.ok((bb.adjustNotes ?? []).some((n: string) => /Made at 8 s.*at 1080p/.test(n)), JSON.stringify(bb.adjustNotes));
      const bj = await post('h3-video', { types: '["t2v"]', prompt: 'x', duration: String(d), resolution: '1080p', provider: 'router-veo', rights: '1' }); assert.equal(bj.status, 200); assert.equal((await get(`/api/jobs/${bj.body.id}`)).input.duration, 8); }
    for (const t of ['i2v'] /* Start + end frame isn't a Veo mode here (providerModes) */) { const fs2: [string, string][] = [['image', png], ...(t === 'flf' ? [['lastFrame', png] as [string, string]] : [])]; const bj = await post('h3-video', { types: `["${t}"]`, prompt: 'x', duration: '4', resolution: '1080p', provider: 'router-veo', rights: '1' }, fs2); assert.equal(bj.status, 200, `${t} ${JSON.stringify(bj.body)}`); assert.ok(bj.body.warnings.some((w: string) => /Made at 8 s/.test(w)), `${t} ${JSON.stringify(bj.body)}`); } // D5
    const v720 = await fetch(`${B}/api/tools/h3-video/price?provider=router-veo&duration=4&resolution=720p`); assert.equal(v720.status, 200); // 720p keeps 4 / 6 / 8 s
    const vd = await post('h3-video', { types: '["t2v"]', prompt: 'x', resolution: '1080p', provider: 'router-veo', rights: '1' }); assert.equal(vd.status, 200, JSON.stringify(vd.body)); assert.equal((await get(`/api/jobs/${vd.body.id}`)).input.duration, 8); // no length asked at 1080p → 8 s
    const rows = await fetch(`${B}/api/models/quotes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ toolId: 'h3-video', params: { duration: '4', resolution: '1080p', audio: '1' } }) }).then((r) => r.json()) as any;
    const vr = Object.entries(rows.quotes).find(([k]) => /veo/i.test(k))?.[1] as any; assert.equal(vr?.adjusted?.duration, '8', JSON.stringify(vr)); // the picker row snaps a saved 4 s / 1080p to 8 s and names it
    assert.equal(vr.adjusted.audio, '0'); assert.equal(vr.credits, (await get('/api/tools/h3-video/price?provider=router-veo&duration=8&resolution=1080p&audio=0')).credits); // row = Veo's sound-off default, as the bar after picking
    const kr = Object.entries(rows.quotes).find(([k]) => /kling/i.test(k))?.[1] as any; assert.equal(kr?.adjusted?.audio, undefined, JSON.stringify(kr)); // Kling: sound on by default, nothing moved
    // 2026-10-28: MiniMax H3 on Comfy Router takes 4–15 s (minimax-h3/code.md duration field): 4 s runs, 3 s is still refused
    const mc = by['api-minimax-h3'].capabilities; assert.equal(mc.minSeconds, 4); assert.equal(mc.durations[0], 4); assert.equal(mc.durations.at(-1), 15);
    const m4 = await fetch(`${B}/api/tools/h3-video/price?provider=api-minimax-h3&duration=4&resolution=768p`); assert.equal(m4.status, 200);
    const m3 = await fetch(`${B}/api/tools/h3-video/price?provider=api-minimax-h3&duration=3&resolution=768p`); assert.equal(m3.status, 200); assert.equal((await m3.json() as any).credits, (await m4.json() as any).credits, '3 s is made (and priced) as 4 s');
    const m3j = await post('h3-video', { types: '["t2v"]', prompt: 'x', duration: '3', provider: 'api-minimax-h3', rights: '1' }); assert.equal(m3j.status, 200); assert.equal((await get(`/api/jobs/${m3j.body.id}`)).input.duration, 4);
    assert.deepEqual(by['router-kling'].capabilities.resolutionLabels, { '720p': 'Standard', '1080p': 'Pro' }); assert.equal(by['router-kling'].capabilities.resolutions[1], '1080p'); // values unchanged for saved settings
    const vOn = await get('/api/tools/h3-video/price?provider=router-veo&duration=8&resolution=720p&audio=1'); const vOff = await get('/api/tools/h3-video/price?provider=router-veo&duration=8&resolution=720p&audio=0'); const vDef = await get('/api/tools/h3-video/price?provider=router-veo&duration=8&resolution=720p');
    assert.ok(vOn.credits > vOff.credits, `${vOn.credits} ${vOff.credits}`); assert.equal(vDef.credits, vOff.credits); assert.equal(vc.audio.default, false); assert.equal(by['router-kling'].capabilities.audio.default, true);
    console.log(`ok Veo 1080p 8 s only (quote, t2v / i2v submit, default 8 s, picker row adjusted); MiniMax H3 3 s → 4 s; Kling Standard / Pro; Veo sound ${vOn.credits} on / ${vOff.credits} off (default off)`);
  }
  { // `quality` and `resolution` resolve the same way against the model's tiers (quality is also H3's fast/quality speed)
    const P = (qs: string) => fetch(`${B}/api/tools/h3-video/price?provider=router-kling&duration=5&${qs}`).then(async (r) => ({ status: r.status, body: await r.json() as any }));
    const viaRes = await P('resolution=1080p'), viaQ = await P('quality=1080p'), viaUpper = await P('quality=1080P'), ui = await P('resolution=1080p&quality=quality'), fast = await P('resolution=720p&quality=fast');
    for (const r of [viaRes, viaQ, viaUpper, ui]) { assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.credits, viaRes.body.credits); }
    assert.equal(fast.status, 200); assert.ok(fast.body.credits < viaRes.body.credits); { const q768 = await P('quality=768p'); assert.equal(q768.status, 200); assert.ok(q768.body.adjustNotes?.length, 'snapped with a note'); }
    const mx = await fetch(`${B}/api/tools/h3-video/price?provider=api-minimax-h3&duration=5&quality=2k`).then((r) => r.json()) as any; assert.equal(mx.credits, (await get('/api/tools/h3-video/price?provider=api-minimax-h3&duration=5&resolution=2K')).credits);
    for (const f of [{ quality: '1080p' }, { quality: '1080P' }, { resolution: '1080p', quality: 'quality' }]) {
      const b0 = await bal(); const j = await post('h3-video', { types: '["t2v"]', prompt: 'x', duration: '5', provider: 'router-kling', rights: '1', ...f }); assert.equal(j.status, 200, JSON.stringify(j.body));
      assert.equal(b0 - (await bal()), viaRes.body.credits); assert.equal((await get(`/api/jobs/${j.body.id}`)).input.resolution, '1080p'); }
    const jb = await post('h3-video', { types: '["t2v"]', prompt: 'x', duration: '5', provider: 'router-kling', rights: '1', quality: '480p' }); assert.equal(jb.status, 200); assert.equal((await get(`/api/jobs/${jb.body.id}`)).input.resolution, '720p');
    console.log(`ok quality=1080p / 1080P / resolution=1080p&quality=quality → ${viaRes.body.credits} credits on price and job; quality=2k → 2K; quality=480p on Kling → 720p`);
  }
  { // Seedance reference videos: (input s + output s) × video-input rate; quote (refVideoSeconds or uploaded files) = charge
    const v2 = path.join(D, 'v2.mp4'), v1 = path.join(D, 'v1.mp4');
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=24', '-t', '2', '-pix_fmt', 'yuv420p', v2]); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=24', '-t', '1', '-pix_fmt', 'yuv420p', v1]);
    for (const [res, perSec] of [['720p', 28.1918], ['1080p', 69.356], ['480p', 13.0271]] as const) { // hostedPrices videoInput (largest frame per resolution, 2026-10-24)
      const expect = Math.ceil(Math.round(Math.round((5 + 5) * perSec / 211 * 1e5) / 1e3 * 1e6) / 1e6); // 3 s + 2 s refs, 5 s output; Comfy credits → USD → our credits (rounded up)
      const g = await get(`/api/tools/h3-video/price?provider=router-seedance&duration=5&resolution=${res}&refVideoSeconds=5`); assert.equal(g.credits, expect, JSON.stringify(g));
      const fd = new FormData(); for (const [k, v] of Object.entries({ provider: 'router-seedance', duration: '5', resolution: res })) fd.append(k, v); for (const f of [mp4, v2]) fd.append('refVideos', new Blob([fs.readFileSync(f)]), path.basename(f));
      const pq = await (await fetch(`${B}/api/tools/h3-video/price`, { method: 'POST', body: fd })).json(); assert.equal(pq.refVideoSeconds, 5); assert.deepEqual(pq.refVideoSecondsEach, [3, 2]); assert.equal(pq.credits, expect);
      const b0 = await bal(); const j = await post('h3-video', { types: '["r2v"]', prompt: 'keep the motion', duration: '5', resolution: res, provider: 'router-seedance', rights: '1' }, [['image', png], ['refVideos', mp4], ['refVideos', v2]]);
      assert.equal(j.status, 200, JSON.stringify(j.body)); assert.equal(b0 - (await bal()), expect); assert.equal((await get(`/api/jobs/${j.body.id}`)).input.refVideoSeconds, 5);
      const plain = await get(`/api/tools/h3-video/price?provider=router-seedance&duration=5&resolution=${res}`); console.log(`ok Seedance ${res} 5 s + 5 s ref video → ${expect} credits (GET = POST upload = charge); without refs ${plain.credits}`);
    }
    const short = await post('h3-video', { types: '["r2v"]', prompt: 'x', duration: '5', provider: 'router-seedance', rights: '1' }, [['image', png], ['refVideos', v1]]); assert.equal(short.status, 400); assert.equal(short.body.issues[0].field, 'refVideos');
    const kOnly = await get('/api/tools/h3-video/price?provider=router-kling&duration=5&resolution=720p&refVideoSeconds=5'); const k0 = await get('/api/tools/h3-video/price?provider=router-kling&duration=5&resolution=720p'); assert.equal(kOnly.credits, k0.credits);
    console.log('ok 1 s ref clip → 400 (min 1.8 s); refVideoSeconds has no effect on non-token models');
  }
  const kd = await post('h3-video', { types: '["t2v"]', prompt: 'x', provider: 'router-kling', rights: '1' }); assert.equal(kd.status, 200); assert.equal((await get(`/api/jobs/${kd.body.id}`)).input.duration, 4);
  // 1) aspect per route
  const a21 = await post('h3-video', { types: '["t2v"]', prompt: 'x', duration: '6', aspect: '21:9', provider: 'comfy-h3', route: 'local:comfy-h3', rights: '1' }); assert.equal(a21.status, 409, JSON.stringify(a21.body));
  const a21auto = await post('h3-video', { types: '["t2v"]', prompt: 'x', duration: '6', aspect: '21:9', provider: 'comfy-h3', rights: '1' }); assert.equal(a21auto.status, 200); assert.notEqual(a21auto.body.route, 'local:comfy-h3');
  const bad = await post('h3-video', { types: '["t2v"]', prompt: 'x', duration: '6', aspect: '5:4', provider: 'comfy-h3', rights: '1' }); assert.ok(bad.status === 200 || (bad.status === 400 && bad.body.issues[0].field === 'aspect'), JSON.stringify(bad.body));
  if (bad.status === 200) assert.ok(bad.body.warnings.some((w: string) => /closest shape|shape of your picture/.test(w)), JSON.stringify(bad.body.warnings)); // D5: the nearest shape this model makes
  console.log(`ok aspect: 21:9 refused on local (409), Auto routes it to ${a21auto.body.route}; 5:4 → ${bad.status === 200 ? 'nearest shape' : '400 (not a video shape)'}`);
  // 3) audio: Kling prices audio separately; H3 doesn't
  const kOn = await get('/api/tools/h3-video/price?provider=router-kling&duration=10&resolution=720p&audio=1'); const kOff = await get('/api/tools/h3-video/price?provider=router-kling&duration=10&resolution=720p&audio=0'); assert.ok(kOn.credits > kOff.credits, `${kOn.credits} ${kOff.credits}`);
  const hOn = await get('/api/tools/h3-video/price?provider=comfy-h3&route=fal:minimax/h3/text-to-video&types=%5B%22t2v%22%5D&duration=6&resolution=768p&audio=1'); const hOff = await get('/api/tools/h3-video/price?provider=comfy-h3&route=fal:minimax/h3/text-to-video&types=%5B%22t2v%22%5D&duration=6&resolution=768p&audio=0'); assert.equal(hOn.credits, hOff.credits);
  console.log(`ok audio price: Kling ${kOn.credits} on / ${kOff.credits} off; H3 ${hOn.credits} both`);
  // 4) bitrate + audio off = our encode, no price effect (local mock render)
  const enc = await post('h3-video', { types: '["t2v"]', prompt: 'x', duration: '4', provider: 'comfy-h3', route: 'local:comfy-h3', audio: '0', bitrate: 'high', rights: '1' }); assert.equal(enc.status, 200, JSON.stringify(enc.body)); assert.equal(enc.body.cost, 0);
  const ej = await wait(enc.body.id); assert.equal(ej.status, 'done'); const out = path.join(D, path.basename(ej.outputs[0].url));
  const streams = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', out]).toString(); assert.ok(!/audio/.test(streams), streams + JSON.stringify(ej).slice(0, 1500));
  const hb = await post('h3-video', { types: '["t2v"]', prompt: 'x', duration: '6', provider: 'comfy-h3', bitrate: 'ultra', rights: '1' }); assert.equal(hb.status, 400); assert.equal(hb.body.issues[0].field, 'bitrate');
  console.log('ok bitrate high + audio off: re-encoded, no audio stream, 0 credits; bad bitrate → 400');
  // refs: image + video + audio refs → local (2 images, no video/audio) refused → fal reference-to-video
  const rr = await post('h3-video', { types: '["r2v"]', prompt: 'keep the subject', duration: '6', provider: 'comfy-h3', rights: '1' }, [['image', png], ['refs', png], ['refs', png], ['refVideos', mp4], ['refAudios', wav]]);
  assert.equal(rr.status, 200, JSON.stringify(rr.body)); assert.equal(rr.body.route, 'fal:minimax/h3/reference-to-video');
  const tooMany = await post('h3-video', { types: '["r2v"]', prompt: 'x', duration: '6', provider: 'comfy-h3', rights: '1' }, [['image', png], ['refVideos', mp4], ['refVideos', mp4], ['refVideos', mp4], ['refVideos', mp4]]); assert.equal(tooMany.status, 400); assert.equal(tooMany.body.issues[0].field, 'refVideos');
  console.log('ok refKinds: 3 images + 1 video + 1 audio → fal reference-to-video; 4 videos → 400');
  // presets library
  const vp = await get('/api/video-presets'); assert.equal(vp.items.filter((x: any) => x.kind === 'camera').length, 7); assert.equal(vp.items.filter((x: any) => x.kind === 'style').length, 12);
  for (const it of vp.items) if (it.posterUrl.startsWith('/examples/')) assert.ok(fs.existsSync(path.resolve(import.meta.dirname, '../../web/public', it.posterUrl.slice(1))), it.posterUrl); else assert.equal((await fetch(B + it.posterUrl)).status, 200, it.posterUrl); // look covers are web/public files (served by the web app)
  const withPreset = await post('h3-video', { types: '["t2v"]', prompt: 'a fox', duration: '6', provider: 'comfy-h3', videoPreset: 'h3-orbit', intensity: 'aggressive', rights: '1' }); assert.equal(withPreset.status, 200);
  const wp = await get(`/api/jobs/${withPreset.body.id}`); assert.match(String(wp.input.finalPrompt), /fast, aggressive orbit/);
  console.log(`ok /api/video-presets: ${vp.items.length} presets, all posters 200; videoPreset applied to the prompt`);
  // 7) history
  const ci = await post('create-image', { types: '["generate"]', prompt: 'a red fox', provider: 'comfy-zimage-turbo', rights: '1' }); assert.equal(ci.status, 200); await wait(ci.body.id);
  const h = await get('/api/history?kind=image&limit=1'); assert.ok(h.items.length === 1 && h.items[0].kind === 'image' && h.total >= 1);
  await fetch(`${B}/api/jobs/${ci.body.id}/favourite`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on: true }) });
  const hl = await get('/api/history?kind=image&liked=1'); assert.ok(hl.items.length >= 1 && hl.items.every((x: any) => x.liked)); assert.equal((await fetch(`${B}/api/history?kind=nope`)).status, 400);
  const hv = await get('/api/history?kind=video&limit=2'); assert.equal(hv.items.length, 2); assert.equal(hv.nextCursor, '2');
  console.log('ok /api/history: kind, liked, paging (nextCursor)');
} finally { try { process.kill(-srv.pid!); } catch { /* */ } }
process.exit(0);
