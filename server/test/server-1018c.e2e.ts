// Oct 18 batch 3 (DP asks): /api/apps posters, non-chargeable not_wired quotes, Camera modelName, camera quote = submit (image_required / unsupported),
// translate languages per route, unit fields on every quote, upscale given-size not estimated, Edit Video Reframe reason, real-backend RIFE never 'demo',
// plain route reasons. Throwaway servers :8987 (mock demo), :8988 (mock, DEMO_AUTO=0, a dummy Comfy key → not_wired), :8989 (backend comfy, unreachable). Temp data.
// Run: npx tsx test/server-1018c.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_LUMA_API_KEY: '' };
const D = fs.mkdtempSync(path.join(os.tmpdir(), 's1018c-')); const procs: ChildProcess[] = [];
const boot = (port: number, extra: Record<string, string> = {}) => { const dd = fs.mkdtempSync(path.join(D, 'd-'));
  procs.push(spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, ...NOKEYS, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: dd, OPENHIGGSFIELD_ENV_FILE: path.join(dd, '.env.local'),
    OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(dd, 'nofilm.json'), ...extra } })); return `http://localhost:${port}`; };
const ready = async (B: string) => { for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) return; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); } throw new Error(`${B} did not start`); };
const get = async (B: string, u: string) => { const r = await fetch(B + u); return { status: r.status, body: (await r.json()) as any }; };
const post = async (B: string, u: string, fields: Record<string, string>, files: Record<string, string> = {}) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const [k, f] of Object.entries(files)) fd.append(k, new Blob([fs.readFileSync(f)]), path.basename(f)); const r = await fetch(B + u, { method: 'POST', body: fd }); return { status: r.status, body: (await r.json()) as any }; };
const ok = (m: string) => console.log('ok ' + m);
try {
  const img = path.join(D, 'key.jpg'), clip = path.join(D, 'clip.mp4');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x335577:s=1280x720', '-frames:v', '1', img]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=s=1280x720:d=5', '-f', 'lavfi', '-i', 'sine=d=5', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', clip]);
  const M = boot(testPort(8987)), N = boot(testPort(8988), { OPENHIGGSFIELD_DEMO_AUTO: '0', COMFY_API_KEY: 'dummy-not-a-real-key' }), R = boot(testPort(8989), { OPENHIGGSFIELD_BACKEND: 'comfy', OPENHIGGSFIELD_COMFY_URL: 'http://127.0.0.1:59999' });
  await ready(M); await ready(N); await ready(R);
  // (1) app posters = the tool's /api/posters entry
  const apps = (await get(M, '/api/apps')).body.items as any[]; const posters = new Map(((await get(M, '/api/posters')).body.items as any[]).map((x) => [x.toolId, x]));
  assert.ok(apps.length > 5); for (const a of apps) { const p: any = posters.get(a.toolId); assert.ok(a.poster || p.reason === 'text baked in' || p.standIn === true /* Face Swap / Shots: branded stand-in until art is dropped */, a.id); /* DP #23: a title card with the name baked in (Anime Restyle) is not served: null */ assert.equal(a.poster, p.posterUrl, a.id); assert.equal(a.posterUrl, a.poster); assert.equal(a.posterKind, p.kind); assert.equal(a.needsRealPoster, p.needsRealPoster); }
  assert.equal((await get(M, `/api/apps/${apps[0].id}`)).body.poster, apps[0].poster);
  ok(`apps: ${apps.length} apps carry poster/posterUrl/posterKind/needsRealPoster = /api/posters (null only for a card with text baked in)`);
  // (2) not_wired quote: not chargeable; the 409 keeps 'Nothing was charged'
  const nw = (await get(N, '/api/tools/h3-video/price?provider=cloud-h3&route=comfy-cloud:cloud-h3&types=t2v&duration=5')).body; // a Comfy Cloud API-node route (still mock only; Router models are wired now)
  assert.equal(nw.reasonCode, 'not_wired'); assert.equal(nw.runnable, false); assert.equal(nw.priceAvailable, false); assert.equal(nw.credits, null); assert.equal(nw.chargeable, false); assert.equal(nw.needsKey, false);
  assert.ok(nw.listCredits > 0); assert.match(nw.priceLine, /isn’t ready yet\. Pick another model\. List price ≈ \$\d+\.\d{2,3}\.$/); assert.ok(nw.unavailableReason);
  assert.doesNotMatch(JSON.stringify([nw.reason, nw.priceLine, nw.unavailableReason, nw.noProvider?.error]), /Nothing was charged/);
  const nwS = await post(N, '/api/tools/h3-video/jobs', { provider: 'cloud-h3', route: 'comfy-cloud:cloud-h3', prompt: 'x', types: '["t2v"]', duration: '5' }, {});
  assert.equal(nwS.status, 409, JSON.stringify(nwS.body).slice(0, 300)); assert.equal(nwS.body.code, 'route_not_runnable'); assert.match(nwS.body.error, /isn’t ready yet\..*Nothing was charged\.$/);
  const km = (await get(N, '/api/tools/reframe/price?route=fal:fal-ai/luma-dream-machine/ray-2/reframe')).body; // needsKey keeps its shape (+ chargeable:false, keyOwner)
  assert.equal(km.needsKey, true); assert.equal(km.credits, km.listCredits); assert.equal(km.priceAvailable, true); assert.equal(km.chargeable, false); assert.equal(km.keyOwner, 'fal');
  const run = (await get(M, '/api/tools/create-image/price')).body; assert.equal(typeof run.chargeable, 'boolean'); if (run.demo) assert.equal(run.chargeable, false);
  ok(`not_wired: credits null, priceAvailable false, listCredits ${nw.listCredits}, priceLine "${nw.priceLine}"; submit 409 keeps "Nothing was charged"; needsKey shape unchanged`);
  // (3) Camera presets: modelName
  const cps = (await get(M, '/api/presets?toolId=camera')).body.items as any[]; const by = (id: string) => cps.find((x) => x.id === id);
  assert.equal(by('ltx-dolly-in').modelName, 'LTX-2 19B'); assert.equal(by('push-in').modelName, 'Seedance'); assert.equal(by('push-in').modelNameByProvider['comfy-open'], 'Wan 2.2 Fun Camera 14B'); assert.equal(by('h3-push-in').modelName, 'H3 Camera Motion'); assert.equal(by('h3-push-in').prefill.provider, 'comfy-h3-camera'); // B6: Seedance 2.0 heads the camera quality order
  assert.ok(cps.every((x) => x.modelName && x.modelNameByProvider && Object.keys(x.modelNameByProvider).join() === x.providers.join()));
  ok('camera presets: modelName (LTX-2 19B / Wan 2.2 Fun Camera 14B / H3 Camera Motion) + modelNameByProvider; H3 prefill provider = comfy-h3-camera');
  // (4) camera quote = submit for an H3 move
  for (const [prov, withImg, code] of [['', false, 'image_required'], ['comfy-h3-camera', false, 'image_required'], ['comfy-open', false, 'image_required'], ['comfy-open', true, 'unsupported'], ['router-seedance', false, 'unsupported'], ['router-seedance', true, 'unsupported'] /* Kling is no longer a Camera Moves model */, ['', true, null], ['comfy-h3-camera', true, null]] as const) {
    const q = await get(M, `/api/tools/camera/price?types=h3-push-in${prov ? `&provider=${prov}` : ''}${withImg ? '&image=1' : ''}`);
    const s = await post(M, '/api/tools/camera/jobs', { types: '["h3-push-in"]', prompt: 'x', ...(prov ? { provider: prov } : {}) }, withImg ? { image: img } : {});
    if (code === 'image_required' && prov !== 'comfy-open') { // Oct 19 b2 (BH P3 #7): the quote is a priced input block; submit keeps 400 image_required
      assert.equal(q.status, 200, `${prov} quote`); assert.equal(q.body.runnable, false); assert.equal(q.body.chargeable, false); assert.equal(q.body.blockedCode, 'input_blocked'); assert.equal(q.body.submitCode, 'image_required'); assert.equal(q.body.priceAvailable, true); assert.equal(q.body.blockedReason, s.body.error.replace(/\s*Nothing was charged\.?/, '').trim());
      assert.equal(s.status, 400); assert.equal(s.body.code, 'image_required'); }
    else if (code) { assert.equal(q.status, 400, `${prov} ${withImg} quote`); assert.equal(q.body.code, code); assert.equal(s.status, 400); assert.equal(s.body.code, code, `${prov} ${withImg}`); assert.equal(q.body.error, s.body.error); assert.equal(q.body.credits, null); }
    else { assert.equal(q.status, 200); assert.equal(s.status, 200, JSON.stringify(s.body).slice(0, 200)); assert.equal(s.body.provider, 'comfy-h3-camera'); assert.equal(q.body.route, s.body.route); }
  }
  ok('camera H3 move: quote and submit agree for Auto / H3 / Wan / Seedance, with and without an image (no image: priced input block on the quote + 400 image_required on submit | 400 unsupported | same route)');
  // (6) translate languages per route
  const vt: any = (await get(M, '/api/tools')).body.find((t: any) => t.id === 'voice'); assert.ok(vt.app.languagesByProvider['local-whisper-nllb-chatterbox']); assert.ok(!vt.app.languagesByProvider['local-whisper-nllb-chatterbox'].includes('id'));
  assert.equal(vt.app.languages.find((l: any) => l.code === 'id').available, false); assert.ok(vt.inputs.find((i: any) => i.name === 'language').byProvider);
  for (const [prov, lang, want] of [['', 'id', 400], ['local-whisper-nllb-chatterbox', 'id', 400], ['local-whisper-nllb-f5', 'ko', 400], ['', 'ko', 'local-whisper-nllb-chatterbox'], ['local-whisper-nllb-f5', 'es', 'local-whisper-nllb-f5']] as const) {
    const q = await get(M, `/api/tools/voice/price?types=translate&language=${lang}${prov ? `&provider=${prov}` : ''}`); const s = await post(M, '/api/tools/voice/jobs', { types: '["translate"]', language: lang, ...(prov ? { provider: prov } : {}) }, { video: clip });
    if (want === 400) { assert.equal(q.status, 400); assert.equal(q.body.code, 'unsupported_language'); assert.equal(s.status, 400); assert.equal(s.body.code, 'unsupported_language'); assert.equal(q.body.error, s.body.error); assert.equal(s.body.issues[0].field, 'language'); }
    else { assert.equal(q.status, 200); assert.equal(q.body.route, `local:${want}`); assert.equal(s.status, 200); assert.equal(s.body.provider, want); }
  }
  const tv = await get(M, '/api/tools/app-translate-video/price?language=id'); assert.equal(tv.status, 400); assert.equal(tv.body.code, 'unsupported_language');
  ok('translate: languagesByProvider on Voice Studio + Translate Video; id refused (quote = submit), F5 refuses ko, Auto picks the route that voices the language');
  // (7) unit fields at top level on every quote
  const dq = (await get(M, '/api/tools/upscale/price?provider=direct-flux3-upscale')).body; assert.equal(dq.demo, true); assert.equal(dq.unit, 'mp_second'); assert.equal(dq.unitLabel, 'per megapixel-second'); assert.ok(dq.unitHelp); assert.ok(['direct-flux3-upscale', 'comfy-router:direct-flux3-upscale'].includes(dq.hosted?.providerId), dq.hosted?.providerId); /* 2026-10-26: FLUX Video Upscale also on Comfy Router */
  assert.equal(km.unit, 'second'); assert.equal(km.unitLabel, 'per second'); assert.ok(km.hosted);
  const lq = (await get(M, '/api/tools/fps-boost/price')).body; assert.ok('unitLabel' in lq && 'unit' in lq && 'unitHelp' in lq); if (lq.routeKind === 'local') assert.equal(lq.unitLabel, null);
  ok('quotes: unit/unitLabel/unitHelp at top level always (demo + needsKey too, hosted filled from the route); local routes → null');
  // (8) upscale: a given source size is not an estimate
  const g = (await get(M, '/api/tools/upscale/price?sourceResolution=720p&duration=8')).body; assert.equal(g.estimated, false); assert.equal(g.estimateReason, undefined); assert.equal(g.assumedSize, undefined); assert.deepEqual(g.sourceSize, { width: 1280, height: 720 });
  const g2 = (await get(M, '/api/tools/upscale/price?sourceResolution=1080p')).body; assert.equal(g2.estimated, true); assert.equal(g2.estimateReason, 'clip_not_loaded'); assert.equal(g2.assumedSize, undefined);
  const g3 = (await get(M, '/api/tools/upscale/price?width=1280&height=720&duration=8')).body; assert.equal(g3.estimated, false);
  const g4 = (await get(M, '/api/tools/upscale/price?duration=8')).body; assert.equal(g4.estimated, true); assert.equal(g4.estimateReason, 'source_size_unknown');
  assert.equal(g.listCredits ?? g.credits, g4.listCredits ?? g4.credits);
  const ev = (await get(M, '/api/edit-video/tools?seconds=8&sourceResolution=720p')).body.tools.find((t: any) => t.id === 'upscale'); assert.equal(ev.estimated, false); assert.deepEqual(ev.sourceSize, { width: 1280, height: 720 });
  ok('upscale: sourceResolution / real size → estimated false (only missing seconds keep clip_not_loaded); no size → source_size_unknown; Edit Video menu the same');
  // (9) Edit Video Reframe reason
  // the Comfy key alone runs Reframe on Comfy Router (cloud first, shared/cloudDefaults.ts); the fal row still names its own key
  const rf = (await get(N, '/api/edit-video/tools')).body.tools.find((t: any) => t.id === 'reframe'); assert.equal(rf.available, true); assert.equal(rf.needsKey, false);
  assert.ok(rf.models[0].routes.some((r: any) => r.routeId.startsWith('comfy-router:') && r.available), JSON.stringify(rf.models[0].routes.map((r: any) => r.routeId)));
  const rr = rf.models[0].routes.find((r: any) => r.routeId === 'fal:fal-ai/luma-dream-machine/ray-2/reframe'); assert.equal(rr.needsKey, true); assert.equal(rr.keyOwner, 'fal'); assert.match(rr.priceLine, /^Needs a fal key\. Price once it's added/);
  const rfM = (await get(M, '/api/edit-video/tools')).body.tools.find((t: any) => t.id === 'reframe'); assert.equal(rfM.available, true); assert.equal(rfM.demo, true);
  assert.doesNotMatch(JSON.stringify(rf), /Auto picks a fal route/);
  ok('edit video: Reframe runs on Comfy Router with the Comfy key; its fal route says "Needs a fal key." (demo preview on mock)');
  // steering: every Edit Video menu route carries the quote's runnable / needsKey / demo / reasonCode / priceLine / credits
  { let n = 0; const diffs: string[] = [];
    for (const [B, tag] of [[M, 'demo'], [N, 'nodemo']] as const) for (const t of (await get(B, '/api/edit-video/tools')).body.tools as any[]) for (const m of t.models ?? []) for (const r of m.routes) {
      for (const k of ['runnable', 'needsKey', 'demo', 'reasonCode', 'priceLine', 'credits', 'listCredits']) assert.ok(k in r, `${t.id} ${r.routeId} lacks ${k}`);
      if (r.reasonCode === 'local_off') { // Oct 19 #3: Use local off → the menu says not runnable (as /api/routes) and the Auto quote never picks it; choosing the route explicitly pins it (runs locally, BH #5)
        const a = await get(B, `/api/tools/${t.id}/price?provider=${encodeURIComponent(m.id)}`); if (a.status === 200 && a.body.route === r.routeId && a.body.runnable !== false) diffs.push(`${tag} ${t.id}/${r.routeId}: Auto quote picks a local_off route`);
        if (r.runnable !== false || r.credits !== null) diffs.push(`${tag} ${t.id}/${r.routeId}: local_off but runnable ${r.runnable} credits ${r.credits}`); n++; continue; }
      const q = await get(B, `/api/tools/${t.id}/price?provider=${encodeURIComponent(m.id)}&route=${encodeURIComponent(r.routeId)}`); if (q.status !== 200) continue; n++;
      for (const k of ['runnable', 'needsKey', 'demo', 'priceLine', 'credits']) if (JSON.stringify(q.body[k] ?? null) !== JSON.stringify(r[k] ?? null)) diffs.push(`${tag} ${t.id}/${m.id}/${r.routeId} ${k}: menu ${JSON.stringify(r[k])} quote ${JSON.stringify(q.body[k])}`);
      if ((q.body.reasonCode ?? null) !== (r.reasonCode ?? null) && q.body.runnable === false) diffs.push(`${tag} ${t.id}/${r.routeId} reasonCode ${r.reasonCode} vs ${q.body.reasonCode}`); }
    assert.deepEqual(diffs, [], diffs.slice(0, 8).join('\n')); assert.ok(n > 20, `${n}`);
    ok(`edit video menu: ${n} routes (demo + no-demo) carry the same runnable/needsKey/demo/reasonCode/priceLine/credits as their quote`); }
  // (10) real backend: RIFE never 'demo'
  const rt: any = (await get(R, '/api/tools')).body.find((t: any) => t.id === 'fps-boost'); for (const p of rt.providers) { assert.equal(!!p.demo, false); for (const r of p.routes ?? []) assert.equal(!!r.demo, false, r.routeId); }
  const rl = (await get(R, '/api/routes?toolId=fps-boost')).body; assert.equal(rl.demo, false); assert.ok(rl.routes.every((m: any) => m.routes.every((r: any) => !r.demo && r.status !== 'Sample')));
  assert.equal((await get(R, '/api/tools/fps-boost/price')).body.demo, false);
  ok('real backend: FPS Boost / RIFE never marked demo (tools, routes, quote)');
  // BH P3: plain route reasons
  const all = [...(await get(M, '/api/routes')).body.routes, ...(await get(M, '/api/routes?mode=r2v&refs=11&aspect=2:1&quality=fast')).body.routes]; const reasons = new Set<string>();
  for (const m of all) for (const o of m.routes) if (o.reason && o.reason !== 'local_off') reasons.add(o.reason);
  for (const r of reasons) { assert.doesNotMatch(r, /\b(t2v|i2v|flf|r2v)\b|quality=|OPENHIGGSFIELD_|fal-ai\/|on this route$|^only /, r); }
  const fl = (await get(N, '/api/edit-video/tools?resolution=high')).body.tools.find((t: any) => t.id === 'reframe').models[0].routes.find((r: any) => /flash/.test(r.routeId));
  assert.equal(fl.reason, 'High quality runs on Ray 2 instead');
  ok(`route reasons: ${reasons.size} distinct reasons, none with mode ids / field=value / env names ("High quality runs on Ray 2 instead")`);
  console.log('ALL OK server-1018c');
} finally { for (const p of procs) { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } } await new Promise((r) => setTimeout(r, 500)); try { fs.rmSync(D, { recursive: true, force: true }); } catch { /* a server still writing */ } }
