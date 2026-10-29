// Director → Story (H3 multi-shot, server/src/cinema/story.ts) over HTTP: mock backend, OPENHIGGSFIELD_MOCK_KEYS=1 (real prices, nothing sent), temp data dir, port 8979.
//  1. quote = the sum of the per-shot GET /api/tools/h3-video/price quotes (same params), × takes;
//  2. a 3-shot run: shot 1 runs on the cast (@element, Reference to video), shot 2 starts from shot 1's LAST FRAME (the exact PNG the story
//     extracted is the image the shot job got), a broken chain goes back to references; one spend-log row per shot; the stitched film exists
//     with video + audio and the crossfaded length; the film is the story's output in Assets;
//  3. failure at shot k: the story stops, shot 1 is kept, later shots never run; retry from shot k (edited prompt) finishes it, shot 1 is not re-run;
//     "stitch what I have" makes a partial film;
//  4. limits on the TOTAL: a daily cap and a budget (maxUsd) refuse the story before any job exists; unknown @element → 400.
// Run: npx tsx test/story.e2e.ts   (ffmpeg on PATH)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'story-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_USE_LOCAL: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '' };
const PORT = testPort(8979); const B = `http://localhost:${PORT}`;
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1',
  OPENHIGGSFIELD_MOCK_DELAY_MS: '300', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' }, stdio: ['ignore', 'ignore', 'inherit'], detached: true });
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a]);
const PNG = path.join(os.tmpdir(), `story-cast-${process.pid}.png`); ff('-f', 'lavfi', '-i', 'testsrc2=size=768x768', '-frames:v', '1', PNG);
const j = async (u: string, init?: RequestInit) => { const r = await fetch(`${B}${u}`, init); let b: any = null; try { b = await r.json(); } catch { /* */ } return { status: r.status, b }; };
const post = (u: string, body: unknown) => j(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const until = async (id: string, ok = (s: any) => s.status !== 'running') => { for (let i = 0; i < 400; i++) { const s = (await j(`/api/stories/${id}`)).b; if (ok(s)) return s; await new Promise((r) => setTimeout(r, 250)); } throw new Error(`story ${id} timed out`); };
const fileOf = (u: string) => path.join(D, u.replace(/^\/files\//, ''));
const ffprobe = (f: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', f]).toString());
let fail = 0; const t0 = Date.now(); const step = (s: string) => console.log(`  ✓ ${s}`);
try {
  for (let i = 0; i < 160; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  // cast: a saved element (@hero) + nothing else
  const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync(PNG)], { type: 'image/png' }), 'hero.png'); fd.append('name', 'hero'); fd.append('kind', 'character');
  const el = await j('/api/elements', { method: 'POST', body: fd }); assert.equal(el.status, 200, JSON.stringify(el.b)); const elUrl = el.b.url ?? el.b.element?.url; assert.ok(elUrl, 'element url');
  const opts = (await j('/api/stories/options')).b; assert.equal(opts.model, 'minimax-h3'); assert.equal(opts.credit, 'Powered by MiniMax H3'); assert.ok(opts.durations.includes(5));
  const spec = { title: 'Lighthouse', cast: ['@hero'], crossfade: 0.3, shots: [
    { prompt: '@hero climbs the lighthouse stairs at dusk', cameras: ['crane-up'] },
    { prompt: '@hero lights the great lamp', duration: 5 },
    { prompt: 'Wide shot: the beam sweeps the night sea', continue: false, duration: 10 }] };

  // ---- 1. quote = sum of the shot quotes
  const q = await post('/api/stories/quote', spec); assert.equal(q.status, 200, JSON.stringify(q.b)); assert.equal(q.b.ok, true, q.b.error);
  assert.deepEqual(q.b.shots.map((s: any) => s.mode), ['r2v', 'i2v', 'r2v'], 'modes: cast → references, chained → first frame, broken chain → references');
  assert.equal(q.b.cast[0].name, 'hero');
  let sum = 0; let usd = 0;
  for (const [k, s] of q.b.shots.entries()) {
    const qs = new URLSearchParams({ types: JSON.stringify([s.mode]), prompt: 'x', duration: String(spec.shots[k].duration ?? 5), model: 'minimax-h3', audio: '1', aspect: s.mode === 't2v' ? '16:9' : 'auto', ...(s.mode === 'i2v' ? { image: '1' } : { refs: '1' }) });
    const one = (await j(`/api/tools/h3-video/price?${qs}`)).b; assert.equal(s.credits, one.credits, `shot ${k + 1} credits = its own quote`); assert.equal(s.route, one.route); sum += one.credits; usd += one.cost.estUsd;
  }
  assert.ok(sum > 0, 'mock keys: real prices'); assert.equal(q.b.total.credits, sum, 'total = sum of the shots'); assert.ok(Math.abs(q.b.total.estUsd - usd) < 1e-6);
  const q2 = await post('/api/stories/quote', { ...spec, takes: 2 }); assert.equal(q2.b.total.credits, 2 * sum, 'takes multiply the total'); assert.equal(q2.b.perTake.credits, sum);
  step(`quote = sum of ${q.b.shots.length} shot quotes (${sum} credits), × takes`);

  // ---- 4 (before any job). limits / budget / unknown @element on the TOTAL: refused, no job created
  const jobsBefore = (await j('/api/jobs?toolId=h3-video')).b; const nBefore = (Array.isArray(jobsBefore) ? jobsBefore : jobsBefore.items ?? jobsBefore.jobs ?? []).length;
  const acct = [...q.b.byAccount].sort((x: any, y: any) => y.estUsd - x.estUsd)[0]; const per = acct.estUsd; assert.ok(per > 0, 'a priced account');
  // spending limits were removed (2026-10-28): an old client's cap is ignored (the story is refused below only for its own budget / inputs)
  assert.equal((await j('/api/settings/billing', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ limits: { [acct.billedTo]: { dailyUsd: per * 0.5 } } }) })).status, 200);
  assert.notEqual((await post('/api/stories/quote', spec)).b.code, 'spend_limit');
  const bud = await post('/api/stories', { ...spec, maxUsd: usd / 2 }); assert.equal(bud.status, 400); assert.equal(bud.b.code, 'over_budget');
  const unk = await post('/api/stories', { ...spec, shots: [{ prompt: '@nobody waves' }, { prompt: 'b' }] }); assert.equal(unk.status, 400); assert.equal(unk.b.code, 'unknown_element');
  const few = await post('/api/stories/quote', { shots: [{ prompt: 'one' }] }); assert.equal(few.status, 400); assert.equal(few.b.code, 'shot_count');
  const stale = await post('/api/stories', { ...spec, quotedCredits: sum - 1 }); assert.equal(stale.status, 409); /* D3: asks again only when dearer */ assert.equal(stale.b.code, 'route_changed');
  const jobsAfter = (await j('/api/jobs?toolId=h3-video')).b; assert.equal((Array.isArray(jobsAfter) ? jobsAfter : jobsAfter.items ?? jobsAfter.jobs ?? []).length, nBefore, 'refused stories create no shot job');
  step('spend limit, budget, unknown @element, shot count and a stale quote refuse the story before any job exists');

  // ---- 2. full run: chaining + stitch + spend rows
  const c = await post('/api/stories', { ...spec, quotedCredits: sum }); assert.equal(c.status, 200, JSON.stringify(c.b));
  const s = await until(c.b.id); assert.equal(s.status, 'done', s.error);
  assert.ok(s.shots.every((x: any) => x.status === 'done' && x.thumbUrl && x.lastFrameUrl && x.jobId));
  const sh = await Promise.all(s.shots.map((x: any) => j(`/api/jobs/${x.jobId}`).then((r) => r.b.job ?? r.b)));
  assert.equal(sh[0].input.mode, 'r2v'); assert.equal(sh[0].input.refUrls.length, 1, 'shot 1: the cast as a reference');
  assert.ok(!/@hero/.test(sh[0].input.prompt) && /hero climbs/.test(sh[0].input.prompt) && /Camera: camera cranes up/.test(sh[0].input.prompt), 'element name + camera move in the shot prompt');
  assert.equal(sh[1].input.mode, 'i2v'); assert.ok(sh[1].input.imageUrl, 'shot 2 got a start image');
  assert.ok(fs.readFileSync(fileOf(sh[1].input.imageUrl)).equals(fs.readFileSync(fileOf(s.shots[0].lastFrameUrl))), 'shot 2 starts from exactly shot 1’s extracted last frame');
  { const last = fileOf(s.shots[0].lastFrameUrl); const dur = Number(ffprobe(fileOf(s.shots[0].resultUrl)).format.duration);
    const ref = path.join(D, 'ref-last.png'); ff('-ss', String(Math.max(0, dur - 0.08)), '-i', fileOf(s.shots[0].resultUrl), '-frames:v', '1', ref);
    assert.ok(fs.statSync(last).size > 1000 && fs.existsSync(ref), 'last frame is a real image'); }
  assert.equal(sh[2].input.mode, 'r2v', 'broken chain → back to the cast references'); assert.equal(sh[2].input.refUrls.length, 1); assert.ok(fs.readFileSync(fileOf(sh[2].input.refUrls[0])).equals(fs.readFileSync(fileOf(elUrl))), 'shot 3 gets the cast image, not a frame');
  assert.ok(sh.every((x: any) => x.parentId === s.id), 'shot jobs are children of the story job');
  const film = fileOf(s.resultUrl); assert.ok(fs.existsSync(film), 'stitched film exists');
  const pf = ffprobe(film); assert.ok(pf.streams.some((x: any) => x.codec_type === 'video') && pf.streams.some((x: any) => x.codec_type === 'audio'), 'film has video + audio');
  const parts = s.shots.map((x: any) => Number(ffprobe(fileOf(x.resultUrl)).format.duration)); const expect = parts.reduce((a: number, b: number) => a + b, 0) - 2 * s.stitch.crossfade;
  assert.equal(s.stitch.method, 'xfade'); assert.ok(Math.abs(Number(pf.format.duration) - expect) < 0.3, `film ${pf.format.duration}s ≈ ${expect}s`);
  const sp = (await j('/api/spend?tool=h3-video&limit=50')).b; for (const x of s.shots) assert.ok(sp.items.some((r: any) => r.jobId === x.jobId), `spend row for shot ${x.index}`);
  const parentJob = (await j(`/api/jobs/${s.id}`)).b; const pj = parentJob.job ?? parentJob; assert.equal(pj.toolId, 'cinema'); assert.equal(pj.resultUrl, s.resultUrl); assert.equal(pj.cost ?? 0, 0, 'the story itself is never charged');
  assert.ok(!sp.items.some((r: any) => r.jobId === s.id), 'no spend row for the story itself');
  assert.equal(s.attribution?.text, 'Powered by MiniMax H3');
  const ex = (await j(`/api/stories/${s.id}/export`)).b; assert.equal(ex.kind, 'openhiggsfield.story'); assert.equal(ex.shots.length, 3); assert.equal(ex.shots[2].continue, false); assert.ok(Number.isInteger(ex.shots[0].seed)); assert.deepEqual(ex.cast, [el.b.id ?? el.b.element?.id]);
  assert.equal((await post('/api/stories/quote', ex)).b.ok, true, 'the export re-imports');
  step(`3 shots chained by last frame, stitched (${Number(pf.format.duration).toFixed(2)} s, video + audio), 3 spend rows, export re-imports`);

  // ---- 3. failure at shot 2, retry from 2, partial stitch
  const f = await post('/api/stories', { shots: [{ prompt: 'A cat on a wall' }, { prompt: 'The cat jumps [mockfail]' }, { prompt: 'The cat lands' }] }); assert.equal(f.status, 200, JSON.stringify(f.b));
  const fs1 = await until(f.b.id); assert.equal(fs1.status, 'failed'); assert.equal(fs1.failedAt, 2);
  assert.deepEqual(fs1.shots.map((x: any) => x.status), ['done', 'failed', 'pending']); assert.match(fs1.error, /retry from shot 2/);
  const keep = fs1.shots[0].jobId; assert.equal(fs1.shots[2].jobId, null, 'later shots never ran');
  const part = await post(`/api/stories/${f.b.id}/stitch`, {}); assert.equal(part.status, 200, JSON.stringify(part.b)); assert.equal(part.b.stitch.partial, true); assert.deepEqual(part.b.stitch.shots, [1]); assert.ok(fs.existsSync(fileOf(part.b.resultUrl)));
  assert.equal((await post(`/api/stories/${f.b.id}/retry`, { from: 3 })).status, 400, 'can’t skip past the failed shot');
  const r = await post(`/api/stories/${f.b.id}/retry`, { from: 2, shots: [{ index: 2, prompt: 'The cat jumps down' }] }); assert.equal(r.status, 200, JSON.stringify(r.b)); assert.equal(r.b.from, 2);
  const fs2 = await until(f.b.id); assert.equal(fs2.status, 'done', fs2.error); assert.equal(fs2.shots[0].jobId, keep, 'shot 1 kept, not re-run'); assert.equal(fs2.shots[1].prompt, 'The cat jumps down');
  assert.equal(fs2.shots[1].attempts.length, 2); assert.equal(fs2.stitch.partial, false); assert.ok(fs.existsSync(fileOf(fs2.resultUrl)));
  const one = await post(`/api/stories/${f.b.id}/retry`, { from: 2, to: 2 }); assert.equal(one.status, 200, 'retry one shot'); const fs3 = await until(f.b.id); assert.equal(fs3.status, 'done'); assert.equal(fs3.shots[2].jobId, fs2.shots[2].jobId, 'shot 3 kept on a one-shot retry');
  step('failure at shot 2 keeps shot 1; partial stitch; retry from 2 (edited) and one-shot retry finish it');

  // ---- takes: 2 parents, same group
  const tk = await post('/api/stories', { shots: [{ prompt: 'Rain on glass' }, { prompt: 'A hand wipes the glass' }], takes: 2 }); assert.equal(tk.status, 200); assert.equal(tk.b.ids.length, 2);
  const [a, b] = await Promise.all(tk.b.ids.map((id: string) => until(id))); assert.equal(a.status, 'done'); assert.equal(b.status, 'done'); assert.equal(a.group, b.group); assert.notEqual(a.shots[0].seed, b.shots[0].seed);
  step('2 takes run as 2 stories in one group with different seeds');
} catch (e) { fail++; console.error('FAIL', e); } finally { try { process.kill(-srv.pid!); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); fs.rmSync(PNG, { force: true }); }
console.log(`story: ${fail ? 'FAILED' : 'all checks passed'} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(fail ? 1 : 0);
