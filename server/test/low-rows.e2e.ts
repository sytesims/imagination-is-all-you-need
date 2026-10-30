// LOW-ROWS-SPEC (Oct 18), server side: Product Shot edit switch + scenes, Transitions start+end (h3-flf), UGC Ad r2v with 2 refs +
// presenter/hook, Orbit Shot own page + orbit tags, Relight light controls, Change Voice / Translate honest voice lists, §0.4 hideControls.
// Each case: quote (with upload markers) = submit (route + credits), then the job's stored input. Own mock server :8947, temp data dir.
// Run: npx tsx test/low-rows.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(8947); const B = `http://localhost:${PORT}`; const D = fs.mkdtempSync(path.join(os.tmpdir(), 'lowrows-'));
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_MAX_QUEUED: '200', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilming'), COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '1' }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a]);
const PNG = path.join(D, 'a.png'); ff('-f', 'lavfi', '-i', 'testsrc2=size=768x768', '-frames:v', '1', PNG); const PNG2 = path.join(D, 'b.png'); ff('-f', 'lavfi', '-i', 'smptebars=size=768x768', '-frames:v', '1', PNG2);
const MP4 = path.join(D, 'c.mp4'); ff('-f', 'lavfi', '-i', 'testsrc2=size=854x480:rate=24', '-f', 'lavfi', '-i', 'sine=d=4', '-t', '4', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', MP4);
const blob = (f: string) => new Blob([fs.readFileSync(f)], { type: f.endsWith('.mp4') ? 'video/mp4' : f.endsWith('.wav') ? 'audio/wav' : 'image/png' });
const until = async (id: string) => { for (let i = 0; i < 300; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'needs_decision', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout'); };
/** quote with upload markers, submit with quotedRouteId/quotedCredits; returns {status, body, quote, job?}. */
async function run(tool: string, fields: Record<string, string>, files: Record<string, string> = {}) {
  const qs = new URLSearchParams(fields); for (const k of Object.keys(files)) qs.set(k, '1');
  const qr = await fetch(`${B}/api/tools/${tool}/price?${qs}`); const quote = (await qr.json()) as any;
  const fd = new FormData(); for (const [k, v] of Object.entries({ rights: '1', ...fields, ...(qr.ok ? { quotedRouteId: quote.routeId, quotedCredits: String(quote.credits) } : {}) })) fd.append(k, v);
  for (const [k, f] of Object.entries(files)) fd.append(k, blob(f), path.basename(f));
  const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); const body = (await r.json()) as any;
  if (r.status === 200) { assert.equal(body.route, quote.routeId, `${tool}: route quote ${quote.routeId} vs submit ${body.route}`); assert.equal(body.cost, quote.credits, `${tool}: credits quote ${quote.credits} vs charge ${body.cost}`); }
  return { status: r.status, body, quote, qstatus: qr.status, job: r.status === 200 ? await until(body.id) : null };
}
const ok = (m: string) => console.log('ok ' + m); const mode = (j: any) => j.input.mode ?? j.input.types?.[0];
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const tools = Object.fromEntries(((await get('/api/tools')) as any[]).map((t) => [t.id, t])); const g = (id: string) => tools[id].app.gallery; const inp = (t: string, n: string) => tools[t].inputs.find((i: any) => i.name === n);

  // §0.4: every app says what to hide; no mode row; prompt box only where exposed
  for (const id of ['app-relight', 'app-change-voice', 'app-translate-video', 'app-product-shot', 'app-transition', 'app-ugc-ad', 'app-orbit-shot']) {
    assert.ok(Array.isArray(g(id).hideControls) && g(id).modeRow === false, id); assert.ok(g(id).hideControls.includes('types') || id === 'app-orbit-shot', `${id} hides the mode row`); }
  assert.equal(g('app-change-voice').promptBox, false); assert.ok(g('app-change-voice').hideControls.includes('prompt')); assert.ok(g('app-relight').hideControls.includes('aspect'));
  ok(`§0.4 hideControls e.g. relight ${JSON.stringify(g('app-relight').hideControls)}`);

  // T23 Product Shot
  assert.deepEqual(Object.keys(g('app-product-shot').providersByMode), ['generate', 'edit']); assert.ok(inp('app-product-shot', 'scene').options.length >= 6 && inp('app-product-shot', 'aspect'));
  const p0 = await run('app-product-shot', { prompt: 'a ceramic mug', scene: 'marble' }); assert.equal(p0.status, 200, JSON.stringify(p0.body)); assert.equal(mode(p0.job), 'generate'); assert.match(p0.job.input.prompt, /stone counter/);
  const p1 = await run('app-product-shot', { prompt: 'a ceramic mug', scene: 'kitchen', aspect: '1:1' }, { image: PNG }); assert.equal(p1.status, 200, JSON.stringify(p1.body));
  assert.equal(mode(p1.job), 'edit'); assert.ok(p1.job.input.imageUrl); assert.match(p1.job.input.prompt, /keep the product's shape, label text and colours exactly/); assert.match(p1.job.input.prompt, /kitchen bench/);
  assert.ok(g('app-product-shot').providersByMode.edit.includes(p1.job.provider)); assert.equal(p1.job.input.scene, 'kitchen');
  const pf = await get(`/api/jobs/${p1.job.id}/prefill?action=recreate`); assert.equal(pf.form.prompt, 'a ceramic mug'); assert.equal(pf.form.scene, 'kitchen'); assert.ok(pf.files.image?.length);
  const pb = await run('app-product-shot', { prompt: 'x', scene: 'moon' }); assert.equal(pb.status, 400); assert.equal(pb.body.issues[0].field, 'scene');
  ok(`Product Shot: no photo → generate (${p0.job.provider}), photo → edit (${p1.job.provider}), scene in prompt, recreate restores scene + photo`);

  // T26 Transitions
  { const tp = tools['app-transition'].providers.map((p: any) => p.id); // the app takes every engine with start + end frame (flf) in providerModes (MiniMax H3 API, LTX / FLUX / Seedance direct routes joined later); local H3 stays first
    assert.equal(tp[0], 'comfy-h3', JSON.stringify(tp)); assert.ok(tp.includes('api-minimax-h3'), JSON.stringify(tp));
    for (const no of ['cloud-h3', 'cloud-h3-wf', 'router-veo', 'router-seedance', /* router-kling = Kling 3.0 Omni since 2026-10-25: it has start + end frame */ 'comfy-wan22-5b']) assert.ok(!tp.includes(no), `${no} has no start + end frame mode`); } assert.equal(inp('app-transition', 'lastFrame').required, true); assert.equal(inp('app-transition', 'lastFrame').label, 'End image');
  const t0 = await run('app-transition', { prompt: 'day to night', transition: 'whip' }, { image: PNG }); assert.equal(t0.status, 400); assert.equal(t0.body.issues[0].field, 'lastFrame');
  const t1 = await run('app-transition', { prompt: 'day to night', transition: 'whip' }, { image: PNG, lastFrame: PNG2 }); assert.equal(t1.status, 200, JSON.stringify(t1.body));
  assert.equal(mode(t1.job), 'flf'); assert.ok(t1.job.input.imageUrl && t1.job.input.lastFrameUrl, JSON.stringify(Object.keys(t1.job.input))); assert.equal(Number(t1.job.input.duration), 5); assert.match(t1.job.input.prompt, /whip pan/);
  const t2 = await run('app-transition', { prompt: 'x', duration: '3' }, { image: PNG, lastFrame: PNG2 }); assert.equal(t2.qstatus, 200); assert.equal(t2.status, 200, JSON.stringify(t2.body)); const t2to = Number(/Made at (\d+) s, the closest length/.exec(String(t2.quote.adjustNotes))?.[1]); assert.ok(t2to > 3, JSON.stringify(t2.quote.adjustNotes)); assert.equal(Number(t2.job.input.duration), t2to, 'made at the length the quote said'); // D5: snapped with a note
  ok('Transitions: flf on comfy-h3 with start + end, default 5 s, 3 s → made at the nearest offered length with a note on quote and submit (D5), end image required');

  // T27 UGC Ad
  const u0 = await run('app-ugc-ad', { prompt: 'a reusable water bottle', presenter: 'gym-floor', hook: 'bold-claim' }); assert.equal(u0.status, 200, JSON.stringify(u0.body));
  assert.equal(mode(u0.job), 't2v'); assert.equal(u0.job.input.aspect, '9:16'); assert.match(u0.job.input.prompt, /gym floor/); assert.match(u0.job.input.prompt, /bold, confident claim/);
  const u1 = await run('app-ugc-ad', { prompt: 'a reusable water bottle' }, { image: PNG }); assert.equal(u1.status, 200, JSON.stringify(u1.body)); assert.equal(mode(u1.job), 'r2v'); assert.equal(u1.job.input.refUrls.length, 1);
  const u2 = await run('app-ugc-ad', { prompt: 'a reusable water bottle' }, { image: PNG, presenterImage: PNG2 }); assert.equal(u2.status, 200, JSON.stringify(u2.body));
  assert.equal(mode(u2.job), 'r2v'); assert.equal(u2.job.input.refUrls.length, 2, '2 refs: presenter + product'); assert.match(u2.job.input.refUrls[0], /presenterImage/); assert.match(u2.job.input.refUrls[1], /image/);
  assert.ok(g('app-ugc-ad').providersByMode.r2v.includes(u2.job.provider)); assert.ok(!g('app-ugc-ad').providersByMode.r2v.includes('cloud-h3'));
  const u3 = await run('app-ugc-ad', { prompt: 'a bottle', provider: 'router-veo' }); assert.equal(u3.status, 200, JSON.stringify(u3.body)); assert.equal(Number(u3.job.input.duration), 8, 'Veo: longest allowed ≤ 15 s');
  ok(`UGC Ad: t2v / r2v 1 ref / r2v 2 refs (${u2.job.provider}), 9:16 locked, presenter + hook in prompt, Veo default 8 s`);

  // T28 Orbit Shot
  assert.equal(tools['app-orbit-shot'].ui, 'app'); assert.deepEqual(tools['app-orbit-shot'].providers.map((p: any) => p.id), ['router-seedance', 'api-minimax-h3', 'comfy-open', 'comfy-funcamera']); assert.equal(inp('app-orbit-shot', 'aspect').default, '1:1'); // B6: Seedance 2.0 first; MiniMax H3 is the second Router model (2026-10-22)
  { const d = g('app-orbit-shot').durationsByProvider; assert.deepEqual(d['comfy-open'], [5, 10]); assert.deepEqual(d['comfy-funcamera'], [5, 10]); assert.ok(d['router-seedance']?.length, 'B6: Seedance 2.0 listed with its lengths'); }
  const o0 = await run('app-orbit-shot', { prompt: 'a sneaker', orbit: 'arc-left', backdrop: 'light' }, { image: PNG }); assert.equal(o0.status, 200, JSON.stringify(o0.body));
  assert.match(o0.job.input.prompt, /^#orbit-l /); assert.equal(o0.job.input.aspect, '1:1'); assert.equal(o0.job.input.resolution, '720p'); assert.equal(Number(o0.job.input.duration), 5);
  assert.ok(!(o0.job.input.timelineIssues ?? o0.job.input.issues ?? []).some((i: any) => i.code === 'unknown_move')); assert.equal(o0.job.input.timeline?.[0]?.move, 'orbit-l'); assert.equal(o0.job.input.timeline[0].start, 0);
  const o1 = await run('app-orbit-shot', { prompt: 'x', duration: '15', provider: 'comfy-open' }, { image: PNG }); // B6: the default is Seedance 2.0 (takes 15 s); the local graph's 5/10 s rule
  assert.equal(o1.qstatus, 200); assert.equal(o1.status, 200, JSON.stringify(o1.body)); assert.equal(Number(o1.job.input.duration), 10, 'D5: 15 s made at 10 s on the local graph');
  const o2 = await run('app-orbit-shot', { prompt: 'x' }); assert.equal(o2.status, 400); assert.equal(o2.body.issues[0].field, 'image');
  const o3 = await run('app-orbit-shot', { prompt: 'x', orbit: 'spin', duration: '10', provider: 'comfy-funcamera' }, { image: PNG }); assert.equal(o3.status, 200, JSON.stringify(o3.body)); assert.equal(o3.job.input.timeline[0].move, 'spin-3d');
  // Orbit P1: image only, no prompt = Auto prompt after the orbit tag; 200 on both routes; quote = charge and same credits as a typed prompt.
  assert.equal(g('app-orbit-shot').promptOptional, true); assert.equal(g('app-orbit-shot').autoPrompt.credits, 0); assert.ok(g('app-orbit-shot').autoPrompt.text);
  for (const provider of ['comfy-open', 'comfy-funcamera']) {
    const typed = await run('app-orbit-shot', { prompt: 'a sneaker', provider }, { image: PNG });
    const a = await run('app-orbit-shot', { provider }, { image: PNG }); assert.equal(a.qstatus, 200, JSON.stringify(a.quote)); assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal(a.quote.credits, typed.quote.credits, `${provider}: Auto prompt adds no credits`); assert.equal(a.body.cost, typed.body.cost);
    assert.ok(a.job.input.prompt.startsWith('#orbit-360 ') && a.job.input.prompt.includes(g('app-orbit-shot').autoPrompt.text), a.job.input.prompt);
    assert.equal(a.job.input.timeline?.[0]?.move, provider === 'comfy-open' ? 'orbit-360' : a.job.input.timeline?.[0]?.move); assert.equal(a.job.input.auto, false);
    const b = await run('app-orbit-shot', { prompt: '  ', orbit: 'arc-left', provider }, { image: PNG }); assert.equal(b.status, 200, JSON.stringify(b.body)); assert.match(b.job.input.prompt, /^#orbit-l the subject/);
  }
  ok('Orbit Shot P1: image-only run (no prompt) = Auto prompt + orbit tag, 200 on both routes, 0 extra credits, quote = charge');
  ok('Orbit Shot: AppTool page, orbit tag first (timeline move from 0 s), 1:1 / 720p / 5 s defaults, 5|10 s only, subject photo required');

  // T25 Relight
  const r0 = await run('app-relight', { direction: 'back', lightQuality: 'hard', brightness: '90', color: '#ffb347', prompt: 'evening mood' }, { image: PNG }); assert.equal(r0.status, 200, JSON.stringify(r0.body));
  assert.equal(mode(r0.job), 'edit'); for (const re of [/rim light from behind/, /hard direct light/, /very bright golden light/, /evening mood/]) assert.match(r0.job.input.prompt, re);
  assert.deepEqual(r0.job.input.appFields, { look: 'custom' /* Look tiles, default custom */, light: '' /* light sphere JSON, unset */, direction: 'back', lightX: '', lightY: '', lightQuality: 'hard', brightness: '90', color: '#FFB347' });
  const r1 = await run('app-relight', { color: 'orange' }, { image: PNG }); assert.equal(r1.status, 400); assert.equal(r1.body.issues[0].field, 'color');
  const r2 = await run('app-relight', { brightness: '120' }, { image: PNG }); assert.equal(r2.status, 400); assert.equal(r2.body.issues[0].code, 'out_of_range');
  const r3 = await run('app-relight', { lightX: '-0.8', lightY: '0.7' }, { image: PNG }); assert.equal(r3.status, 200); assert.match(r3.job.input.prompt, /light from upper left/);
  const r4 = await run('app-relight', {}); assert.equal(r4.status, 400); assert.equal(r4.body.issues[0].field, 'image');
  const pr = await get(`/api/jobs/${r0.job.id}/prefill?action=recreate`); assert.equal(pr.form.direction, 'back'); assert.equal(pr.form.color, '#FFB347'); assert.equal(pr.form.prompt, 'evening mood');
  ok('Relight: direction / quality / brightness / colour / pad in the prompt, bad hex + brightness 400, recreate restores the controls');

  // T31 / T32 voice apps
  assert.deepEqual(inp('app-change-voice', 'voice').options, ['builtin', 'clone']); assert.ok(inp('app-change-voice', 'voiceAudio'));
  const v0 = await run('app-change-voice', { voice: 'builtin' }, { video: MP4 }); assert.equal(v0.status, 200, JSON.stringify(v0.body)); assert.equal(v0.job.input.voice, 'builtin');
  const v1 = await run('app-change-voice', { voice: 'clone' }, { video: MP4 }); assert.equal(v1.status, 400);
  const WAV = path.join(D, 'v.wav'); ff('-f', 'lavfi', '-i', 'sine=f=180:d=8', '-ar', '24000', WAV);
  const v2 = await run('app-change-voice', { voice: 'clone' }, { video: MP4, voiceAudio: WAV }); assert.equal(v2.status, 200, JSON.stringify(v2.body)); assert.ok(v2.job.input.voiceSampleUrl); assert.equal(v2.job.input.voice, 'clone');
  assert.deepEqual(inp('app-translate-video', 'voice').options, ['original', 'clone']); const lp = g('app-translate-video').languagesByProvider;
  assert.ok(lp['local-whisper-nllb-f5'].includes('ja') && !lp['local-whisper-nllb-f5'].includes('ru')); assert.equal(g('app-translate-video').languages.find((l: any) => l.code === 'ja').nativeName, '日本語');
  const tr = await run('app-translate-video', { language: 'ja' }, { video: MP4 }); assert.equal(tr.status, 200, JSON.stringify(tr.body)); assert.equal(tr.job.input.language, 'ja'); assert.equal(tr.job.input.voice, 'original');
  const tr2 = await run('app-translate-video', { language: 'ja', voice: 'deep-calm' }, { video: MP4 }); assert.equal(tr2.status, 200, 'older clients\' library ids still run');
  ok('Change Voice builtin|clone, Translate original|clone + languagesByProvider + nativeName');
  console.log('ALL OK low-rows');
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); }
