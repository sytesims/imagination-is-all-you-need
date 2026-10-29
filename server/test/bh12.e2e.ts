// BH12 + DP #22 + Cleanroom copy (Oct 19, batch A2): own mock server :9113 (temp data dir).
//  - Photo FX aspect per route: the local graph's list vs each partner model's own (quote and submit, code unsupported_aspect); the job carries it
//  - UGC Ad aspect: allowed ['9:16'] (16:9 → 400 unsupported_aspect on quote and submit, never silently replaced); malformed → invalid_aspect; mock output 720×1280
//  - Relight quote: lightX without lightY → 400 code required; out of −1…1 → 400 out_of_range; both → 200
//  - pins carry displayName '<model> · local | Comfy Cloud | hosted'; job aspectLabel auto → 'Auto (matches your input)'
//  - Change Voice on an audio file → an audio result (outputFormat, MP3 by default), same length; a video still works
//  - deleting an element removes the el-* file it owns (not a job's output it pointed at)
//  - /api/posters slots: Object Swap preset cards, H3 camera card hero, UGC Ad presenter stills
//  - copy: image → 'Turn to video'; free gens wording; Inpaint 'everything else stays as it was'; Through-object in/out (HF short labels)
//  - voice sample sampleKind real / standin (+ sampleIsStandIn) from examples/voice/<value>.json; /api/posters lists the 23 Restyle style posters + loops
//  Run: npx tsx test/bh12.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'bh12-')); const DD = path.join(D, 'data'); fs.mkdirSync(DD);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', HOST: '', OPENHIGGSFIELD_HOST: '', COMFY_BASE_URL: '' };
const ok = (m: string) => console.log('ok ' + m);
let proc: ChildProcess | null = null; const PORT = testPort(9113); const B = `http://localhost:${PORT}`;
const J = async (r: Response) => { const t = await r.text(); let body: any; try { body = JSON.parse(t); } catch { body = t; } return { status: r.status, body }; };
const get = (u: string) => fetch(B + u).then(J);
const png = path.join(D, 'i.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=s=1280x720', '-frames:v', '1', png]);
const wav = path.join(D, 'speech.wav'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=220:d=3', '-c:a', 'pcm_s16le', wav]);
const mime = (p: string) => (p.endsWith('.wav') ? 'audio/wav' : p.endsWith('.mp4') ? 'video/mp4' : 'image/png');
const submit = async (tool: string, f: Record<string, string>, files: [string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); for (const [k, p] of files) fd.append(k, new Blob([fs.readFileSync(p)], { type: mime(p) }), path.basename(p)); return J(await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd })); };
const done = async (id: string) => { for (let i = 0; i < 240; i++) { const j = (await get(`/api/jobs/${id}`)).body; if (['done', 'failed', 'blocked', 'cancelled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 250)); } throw new Error('timeout ' + id); };
const dims = (f: string) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]).toString().trim();
const fileOf = (u: string) => path.join(DD, decodeURIComponent(u.replace(/^\/files\//, '')));
try {
  proc = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: DD, OPENHIGGSFIELD_ENV_FILE: path.join(DD, '.env.local'), OPENHIGGSFIELD_EXAMPLES_DIR: path.join(D, 'examples'),
    OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(DD, 'nf.json') } });
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); }
  const tools = (await get('/api/tools')).body; const T = (id: string) => (tools.items ?? tools).find((t: any) => t.id === id);
  // Photo FX per route
  { const by = T('photo-fx').inputs.find((i: any) => i.name === 'aspect').byProvider; assert.ok(!by['comfy-open'].includes('4:3') && by['router-seedance'].includes('4:3') && by['api-minimax-h3'].includes('4:3'), JSON.stringify(by));
    assert.ok(!('router-veo' in by) && !('router-kling' in by), 'Veo / Kling are not offered on Photo FX (their Router schemas take no first frame here): ' + JSON.stringify(by)); // 2026-10-22: Seedance 2.0 + MiniMax H3 serve the Router side
    const lq = await get('/api/tools/photo-fx/price?provider=comfy-open&aspect=4:3'); assert.equal(lq.status, 400); assert.equal(lq.body.code, 'unsupported_aspect'); assert.deepEqual(lq.body.allowed, by['comfy-open']);
    const vq = await get('/api/tools/photo-fx/price?route=local:comfy-open&aspect=4:3'); assert.equal(vq.status, 400); assert.equal(vq.body.code, 'unsupported_aspect'); assert.deepEqual(vq.body.allowed, by['comfy-open']); // ?route= picks the engine's list too
    const hq = await get('/api/tools/photo-fx/price?route=comfy-router:api-minimax-h3&aspect=4:3'); assert.equal(hq.status, 200, JSON.stringify(hq.body)); assert.equal(hq.body.routeId ?? hq.body.route, 'comfy-router:api-minimax-h3');
    const sq = await get('/api/tools/photo-fx/price?provider=router-seedance&aspect=4:3'); assert.equal(sq.status, 200, JSON.stringify(sq.body)); assert.equal(sq.body.route, 'comfy-router:router-seedance');
    const s0 = await get('/api/tools/photo-fx/price?provider=router-seedance'); assert.equal(sq.body.listCredits ?? sq.body.credits, s0.body.listCredits ?? s0.body.credits); // aspect doesn't change this model's price
    const lj = await submit('photo-fx', { rights: '1', types: '["float"]', provider: 'comfy-open', aspect: '4:3' }, [['image', png]]); assert.equal(lj.status, 400); assert.equal(lj.body.code, 'unsupported_aspect');
    const sj = await submit('photo-fx', { rights: '1', types: '["float"]', provider: 'router-seedance', aspect: '4:3' }, [['image', png]]); assert.equal(sj.status, 200, JSON.stringify(sj.body));
    const j = await done(sj.body.id); assert.equal(j.input.aspect, '4:3'); assert.equal(j.provider, 'router-seedance'); }
  ok('Photo FX aspect per route: local 4:3 → 400 unsupported_aspect (quote + submit), route=local 4:3 → 400, MiniMax H3 / Seedance 4:3 quote, Seedance runs (job aspect 4:3); Veo/Kling not listed');
  // UGC Ad
  { assert.deepEqual(T('app-ugc-ad').allowed.aspect, ['9:16']);
    const q = await get('/api/tools/app-ugc-ad/price?aspect=16:9'); assert.equal(q.status, 400); assert.equal(q.body.code, 'unsupported_aspect'); assert.equal(q.body.field, 'aspect'); assert.deepEqual(q.body.allowed, ['9:16']);
    const s = await submit('app-ugc-ad', { rights: '1', prompt: 'headphones ad', aspect: '16:9' }); assert.equal(s.status, 400); assert.equal(s.body.code, 'unsupported_aspect');
    const r = await submit('app-ugc-ad', { rights: '1', prompt: 'headphones ad' }); assert.equal(r.status, 200, JSON.stringify(r.body)); const j = await done(r.body.id); assert.equal(j.status, 'done'); assert.equal(j.input.aspect, '9:16'); assert.equal(dims(fileOf(j.resultUrl)), '720,1280'); }
  ok('UGC Ad: allowed aspect [9:16], 16:9 → 400 unsupported_aspect (quote + submit), mock output 720×1280');
  // Relight quote
  { const one = await get('/api/tools/app-relight/price?lightX=0.5'); assert.equal(one.status, 400); assert.equal(one.body.code, 'required'); assert.match(one.body.error, /both lightX and lightY/);
    const far = await get('/api/tools/app-relight/price?lightX=1.5&lightY=0'); assert.equal(far.status, 400); assert.equal(far.body.code, 'out_of_range');
    const both = await get('/api/tools/app-relight/price?lightX=-1&lightY=1'); assert.equal(both.status, 200, JSON.stringify(both.body)); }
  ok('Relight quote: one of lightX/lightY → 400 required; 1.5 → 400 out_of_range; −1/1 → 200');
  // pins + labels
  { const pr = (await get('/api/routes?toolId=create-image&modelId=comfy-zimage-turbo')).body; const rs = pr.routes[0].routes ?? pr.routes; const lr = rs.find((x: any) => x.kind === 'local');
    assert.equal((await J(await fetch(`${B}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ perModel: { 'comfy-zimage-turbo': { route: lr.routeId } } }) }))).status, 200);
    const pin = (await get('/api/me/routing')).body.perModel['comfy-zimage-turbo']; assert.equal(pin.displayName, `${pin.modelName} · local`); assert.equal(pin.displayName, 'Z-Image-Turbo · local');
    const r = await submit('photo-fx', { rights: '1', types: '["float"]', aspect: 'auto' }, [['image', png]]); assert.equal((await done(r.body.id)).aspectLabel, 'Auto (matches your input)'); }
  ok('pin displayName "Z-Image-Turbo · local"; aspect auto → "Auto (matches your input)"');
  // Change Voice audio
  { const r = await submit('app-change-voice', { rights: '1', voice: 'builtin' }, [['audio', wav]]); assert.equal(r.status, 200, JSON.stringify(r.body)); const j = await done(r.body.id); assert.equal(j.status, 'done', j.error);
    assert.match(j.resultUrl, /\.mp3$/); /* outputFormat default mp3 */ assert.equal(j.input.outKind, 'audio'); assert.ok(Math.abs(Number(j.input.outputDuration) - 3) < 0.2, String(j.input.outputDuration));
    const none = await submit('app-change-voice', { rights: '1', voice: 'builtin' }); assert.equal(none.status, 400); assert.equal(none.body.code ?? none.body.issues?.[0]?.code, 'required');
    assert.match(String(none.body.error ?? none.body.issues?.[0]?.message ?? ''), /Add a video or an audio clip/i);
    const vin = T('app-change-voice').inputs.find((i: any) => i.name === 'audio'); assert.ok(vin && /audio/.test(vin.accept)); }
  ok('Change Voice: an audio file in → an MP3 back (outputFormat default; same length); no file → 400 Add a video or an audio clip');
  // element delete
  { const r = await submit('create-image', { rights: '1', types: '["generate"]', prompt: 'a red apple' }); const j = await done(r.body.id);
    const el = await J(await fetch(`${B}/api/elements`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Apple', fromJob: j.id, output: '0' }) })); assert.equal(el.status, 200, JSON.stringify(el.body));
    const f = fileOf(el.body.url); assert.match(path.basename(f), /^el-/); assert.ok(fs.existsSync(f));
    const del = await J(await fetch(`${B}/api/elements/${el.body.id}`, { method: 'DELETE' })); assert.equal(del.body.ok, true); assert.ok(del.body.removedFiles >= 1, JSON.stringify(del.body));
    assert.ok(!fs.existsSync(f), 'element copy removed'); assert.ok(fs.existsSync(fileOf(j.resultUrl)), 'the job output stays'); }
  ok('element delete removes its el-* copy, keeps the job output');
  // posters
  { const p = (await get('/api/posters')).body; assert.ok(Array.isArray(p.slots) && Array.isArray(p.slotsNeedingPoster));
    assert.ok(p.slots.filter((s: any) => s.toolId === 'object-swap').length === T('object-swap').presets.length); assert.ok(p.slots.some((s: any) => s.slot === 'card:camera-hero' && s.needsRealPoster));
    assert.ok(p.slots.some((s: any) => s.toolId === 'app-ugc-ad' && s.slot.startsWith('presenter:'))); assert.ok(p.slots.every((s: any) => /^web\/public\/examples\//.test(s.dropAt)));
    assert.ok(p.slots.filter((s: any) => s.toolId === 'app-product-shot' && s.slot.startsWith('scene:')).length >= 8); assert.ok(['compare:before', 'compare:after'].every((k) => p.slots.some((s: any) => s.toolId === 'image-upscale' && s.slot === k)));
    assert.equal(p.slots.filter((s: any) => s.toolId === 'motion-transfer' && s.slot.startsWith('result:')).length, T('motion-transfer').presets.length);
    const ar = p.items.find((i: any) => i.toolId === 'app-anime-restyle'); assert.equal(ar.posterUrl, null); assert.equal(ar.reason, 'text baked in'); assert.equal(ar.needsRealPoster, true); assert.equal(T('app-anime-restyle').posterUrl, null); }
  ok('/api/posters slots: Object Swap preset cards, H3 camera hero, UGC presenter stills, Product Shot scenes, upscale before/after, Motion Transfer results; Anime Restyle card not served (text baked in)');
  // copy
  { const r = await submit('create-image', { rights: '1', types: '["generate"]', prompt: 'a pear' }); const j = await done(r.body.id);
    const na = (await get(`/api/jobs/${j.id}/next-actions`)).body; assert.ok(na.items.some((x: any) => x.label === 'Turn to video'), JSON.stringify(na.items.map((x: any) => x.label))); assert.ok(!JSON.stringify(na).includes('Animate this'));
    assert.equal(T('app-inpaint').description, 'Paint over the area to change and describe it; everything else stays as it was.'); /* Brush Edit (was Inpaint), 2026-10-22 */ assert.equal(T('app-change-voice').description, 'A different voice on the same clip, with the lips still in sync.');
    const all = JSON.stringify(tools); assert.ok(/Through-object/.test(all), 'Through-object in/out labels restored'); assert.ok(!/app balance/.test(all));
    const led = JSON.stringify((await get('/api/ledger')).body); assert.ok(!/app balance/.test(led)); }
  ok('copy: Turn to video; Inpaint; Through-object; Change Voice kept; no app balance');
  // Voice sample kind: stand-in unless examples/voice/builtin.json says {"kind":"real"} (a recording of the built-in Chatterbox voice)
  { const v0 = (await get('/api/tools')).body; const vc = (tt: any) => (tt.items ?? tt).find((t: any) => t.id === 'app-change-voice').inputs.find((i: any) => i.name === 'voice').choices.find((c: any) => c.value === 'builtin');
    let c = vc(v0); assert.equal(c.sampleKind, 'standin'); assert.equal(c.sampleIsStandIn, true);
    const vd = path.join(D, 'examples', 'voice'); fs.mkdirSync(vd, { recursive: true }); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=200:d=1', path.join(vd, 'builtin.mp3')]);
    c = vc((await get('/api/tools')).body); assert.equal(c.sampleKind, 'standin', 'a clip without a sidecar is a stand-in');
    fs.writeFileSync(path.join(vd, 'builtin.json'), '{"kind":"standin"}'); c = vc((await get('/api/tools')).body); assert.equal(c.sampleKind, 'standin');
    fs.writeFileSync(path.join(vd, 'builtin.json'), '{"kind":"real"}'); c = vc((await get('/api/tools')).body); assert.equal(c.sampleKind, 'real'); assert.equal(c.sampleIsStandIn, false); }
  ok('voice sample: sampleKind standin (no clip / no sidecar / sidecar standin) → real only with {"kind":"real"}; sampleIsStandIn follows');
  // Restyle: the 23 style posters + loops are listed as needing real art
  { const ps = (await get('/api/posters')).body; const rs = ps.slots.filter((x: any) => x.toolId === 'restyle');
    assert.equal(rs.length, 23); assert.ok(rs.every((x: any) => /^style:/.test(x.slot) && x.needsRealPoster && x.needsRealLoop && x.standIn && x.posterUrl && x.placeholder && /presets\/restyle-.+\.jpg$/.test(x.dropAt) && /presets\/restyle-.+\.mp4$/.test(x.loopDropAt)), JSON.stringify(rs[0]));
    assert.ok(ps.slotsNeedingPoster.includes('restyle:style:anime-cel')); }
  ok('/api/posters: 23 Restyle style slots, poster + loop stand-ins, needsRealPoster/needsRealLoop');
  { const post = (b: unknown) => fetch(B + '/api/ledger/grant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(J);
    const r = await post({ amount: 5, source: 'refund' }); assert.equal(r.status, 400, JSON.stringify(r.body)); assert.equal(r.body.code, 'invalid_source'); assert.deepEqual(r.body.allowed, ['starter', 'topup', 'promo']);
    const bog = await post({ amount: 5, source: 'bogus' }); assert.equal(bog.status, 400, JSON.stringify(bog.body)); assert.equal(bog.body.code, 'invalid_source'); assert.deepEqual(bog.body.allowed, ['starter', 'topup', 'promo']);
    assert.equal((await post({ amount: 5, source: 'promo' })).status, 200);
    const miss = await post({ amount: 3 }); assert.equal(miss.status, 200); assert.equal(miss.body.bucket.source, 'topup'); }
  ok("ledger grant: source 'refund'|'bogus' → 400 invalid_source; missing source → topup; promo still 200");
  console.log('ALL OK bh12');
} finally { if (proc?.pid) try { process.kill(-proc.pid); } catch { /* gone */ } }
