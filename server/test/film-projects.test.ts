// Film (2026-10-27): the FilmProject schema and ops (all or nothing, rev / 409), the REST routes that need no job pipeline (CRUD, ops,
// samples), the stitch body (order, trims, per-seam transitions, hidden shots, music ducked under clip sound), the per-seam timeline plan,
// compose's duckClips / seams parsing, and a real ffmpeg run of the shared engine checking order + trim + length.
// Run: npx tsx test/film-projects.test.ts   (temp data dir, no network, no server port; the last part needs ffmpeg)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
process.env.OPENHIGGSFIELD_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'film-projects-'));
const DATA = process.env.OPENHIGGSFIELD_DATA_DIR;
const Fastify = (await import('fastify')).default;
const FP = await import('../src/shared/filmProject.ts');
const FS = await import('../src/filmProjects.ts');
const { planTimeline } = await import('../src/shared/stitchTimeline.ts');
const { mixGraph, composeRender } = await import('../src/compose.ts');
const { parseSeams, parseEditor } = await import('../src/agentBudget.ts');
const { liveRefs } = await import('../src/mediaGc.ts');
const ok = (m: string) => console.log('ok ' + m);
let n = 0; const ctx = { newId: (p: string) => `${p}_${++n}`, now: 1 };

// ---- schema defaults + ops ----
const f0 = FP.newFilm({ id: 'film_a', title: 'Goodbye', now: 1 });
assert.equal(f0.aspect, '16:9'); assert.equal(f0.rev, 0); assert.deepEqual(f0.shots, []); assert.equal(f0.post.keepClipAudio, true); assert.equal(f0.post.transition.type, 'cut');
let r: any = FP.applyOps(f0, [
  { op: 'upsert_shot', shot: { id: 's1', prompt: 'one', startFrom: { kind: 'still', url: '/files/a.png' } } },
  { op: 'upsert_shot', shot: { id: 's2', prompt: 'two' } },
  { op: 'upsert_shot', shot: { prompt: 'zero' }, index: 0 },
  { op: 'set_trim', shotId: 's1', inSec: 0.5, outSec: 3 },
  { op: 'set_title', title: '  Goodbye  ' },
], ctx);
assert.ok(!('error' in r), JSON.stringify(r));
let f = r.film; assert.deepEqual(f.shots.map((s: any) => s.prompt), ['zero', 'one', 'two']); assert.deepEqual(f.shots.map((s: any) => s.index), [0, 1, 2]);
assert.equal(f.title, 'Goodbye'); assert.deepEqual(f.shots[1].trim, { inSec: 0.5, outSec: 3 }); assert.equal(f.shots[0].kind, 'shot'); assert.equal(f.shots[0].durationSec, null, 'null = the model default');
assert.equal(f.shots[0].status, 'draft'); assert.equal(f0.shots.length, 0, 'the input is not mutated');
// all or nothing: a bad op later in the list leaves nothing applied
const bad = FP.applyOps(f, [{ op: 'set_title', title: 'X' }, { op: 'reorder_shots', order: ['s1'] }], ctx) as any;
assert.equal(bad.code, 'invalid_order'); assert.equal(bad.opIndex, 1); assert.equal(f.title, 'Goodbye');
for (const [op, code] of [[{ op: 'nope' }, 'invalid_op'], [{ op: 'delete_shot', shotId: 'zz' }, 'unknown_shot'], [{ op: 'set_trim', shotId: 's1', inSec: 2, outSec: 2.05 }, 'invalid_trim'],
  [{ op: 'upsert_shot', shot: { id: 's1', bogus: 1 } }, 'invalid_shot'], [{ op: 'set_active_take', shotId: 's1', takeId: 'tk' }, 'unknown_take'], [{ op: 'set_post', post: { duckAmount: 3 } }, 'invalid_post'],
  [{ op: 'upsert_shot', shot: { takes: [{ jobId: 'missing' }] } }, 'unknown_job']] as const)
  assert.equal((FP.applyOps(f, [op], { ...ctx, jobExists: () => false }) as any).code, code, `${(op as any).op} → ${code}`);
// bridge defaults, takes attached by job id, active take, reorder, hidden, audio, cast
r = FP.applyOps(f, [{ op: 'upsert_shot', shot: { kind: 'bridge' }, index: 2 }, { op: 'upsert_shot', shot: { id: 's2', takes: [{ jobId: 'j2' }, { jobId: 'j2' }] } },
  { op: 'set_audio', tracks: [{ kind: 'music', url: '/files/m.wav', volume: 0.8 }] }, { op: 'set_cast', cast: [{ name: 'Mother (S2)' }] }, { op: 'set_meta', aspect: '9:16' }], { ...ctx, jobExists: () => true });
assert.ok(!('error' in r), JSON.stringify(r)); f = r.film;
const br = f.shots[2]; assert.equal(br.kind, 'bridge'); assert.deepEqual(br.types, ['flf']); assert.equal(br.modelKey, 'ltx-2.5-22b'); assert.equal(br.runOn, 'comfy-cloud'); assert.equal(br.durationSec, 4);
const s2 = f.shots.find((s: any) => s.id === 's2'); assert.equal(s2.takes.length, 1, 'the same job is attached once'); assert.equal(s2.status, 'queued');
assert.equal(f.audio[0].kind, 'music'); assert.match(f.audio[0].id, /^aud_/); assert.equal(f.cast[0].name, 'Mother (S2)'); assert.equal(f.aspect, '9:16');
r = FP.applyOps(f, [{ op: 'reorder_shots', order: [...f.shots.map((s: any) => s.id)].reverse() }], ctx); assert.equal(r.film.shots[0].id, 's2'); assert.equal(r.film.shots[0].index, 0);
ok('schema defaults, ops in order, all or nothing, op errors, bridge defaults, takes by job id, audio, cast, meta, reorder');

// ---- shot submit: the same fields for quote and render ----
const sub = FP.shotSubmit({ id: 'film_a', aspect: '16:9' }, FP.parseShot({ id: 'x', prompt: 'p', modelKey: 'minimax-h3', runOn: 'comfy-cloud', durationSec: 15, resolution: '480p', startFrom: { kind: 'still', url: '/files/a.png' } }).shot as any);
assert.deepEqual(sub.files, { image: '/files/a.png' }); assert.equal(sub.fields.model, 'minimax-h3'); assert.equal(sub.fields.duration, '15'); assert.equal(sub.fields.types, '["i2v"]'); assert.equal(sub.fields.aspect, '16:9'); assert.equal(sub.fields.filmId, 'film_a');
const subB = FP.shotSubmit({ id: 'film_a', aspect: '16:9' }, FP.parseShot({ id: 'b', kind: 'bridge', types: ['flf'], startFrom: { kind: 'last_frame', url: '/files/l.png' } }).shot as any);
assert.deepEqual(subB.missing, ['lastFrame']); assert.equal(FP.shotSubmit({ id: 'f', aspect: '1:1' }, FP.parseShot({ id: 'c' }).shot as any).missing[0], 'image');
assert.equal('duration' in FP.shotSubmit({ id: 'f', aspect: '1:1' }, FP.parseShot({ id: 'c' }).shot as any).fields, false, 'no length = the model default');
ok('shot submit fields + files, missing stills');

// ---- stitch body: order, trims, seams, hidden, music ducked under clip sound ----
const take = (id: string, status = 'done') => ({ id: `t_${id}`, jobId: `j_${id}`, status, url: status === 'done' ? `/files/${id}.mp4` : null });
const sf = FP.zFilm.parse({ id: 'film_s', title: 'Cut', shots: [
  { id: 'a', takes: [take('a')], activeTakeId: 't_a', trim: { inSec: 0, outSec: 13.5 }, transitionOut: { type: 'crossfade', sec: 0.6 } },
  { id: 'h', takes: [take('h')], activeTakeId: 't_h', hidden: true, transitionOut: { type: 'fade', sec: 1 } },
  { id: 'b', takes: [take('b')], activeTakeId: 't_b', trim: { inSec: 1, outSec: null }, transitionOut: { type: 'fade', sec: 0.5 } },
  { id: 'q', takes: [take('q', 'running')], activeTakeId: 't_q' },
  { id: 'd' },
  { id: 'c', takes: [take('c')], activeTakeId: 't_c' },
], audio: [{ id: 'm', kind: 'music', url: '/files/m.wav', volume: 0.7 }], post: { endCard: { text: null } } });
const sb = FP.filmStitchBody(sf);
assert.deepEqual(sb.body.clips, ['/files/a.mp4', '/files/b.mp4', '/files/c.mp4'], 'active done takes in shot order');
assert.deepEqual(sb.shotIds, ['a', 'b', 'c']); assert.deepEqual(sb.skipped.map((x) => `${x.shotId}:${x.reason}`), ['h:hidden', 'q:its take is running', 'd:not rendered yet']);
assert.deepEqual(sb.body.trims, [{ out: 13.5 }, { in: 1 }, null]);
assert.deepEqual(sb.body.seams, [{ type: 'crossfade', sec: 0.6 }, { type: 'dip', sec: 0.5 }], "a hidden shot's join is skipped with it; fade = dip");
assert.equal(sb.body.keepClipAudio, true); assert.equal(sb.body.duckClips, true); assert.equal(sb.body.audio, '/files/m.wav'); assert.equal(sb.body.musicVolume, 0.7);
assert.deepEqual(sb.body.endCard, { text: null, style: 'clean', mode: 'black', sec: 2.5 }); assert.equal(sb.body.videoFade, true);
assert.equal('seams' in FP.filmStitchBody(FP.zFilm.parse({ id: 'f2', title: 't', shots: [{ id: 'a', takes: [take('a')], activeTakeId: 't_a' }, { id: 'b', takes: [take('b')], activeTakeId: 't_b' }] })).body, false, 'no seams when every join is the film-wide one');
ok('stitch body: order, trims, seams, hidden, skipped, music ducked under clips');

// ---- timeline plan with seams + compose fields ----
const pl = planTimeline([10, 5, 8], { transition: 'cut', seams: [{ type: 'crossfade', sec: 0.6 }, null] });
assert.deepEqual(pl.overlaps, [0, 0.6, 0]); assert.deepEqual(pl.joints, ['cut', 'crossfade', 'cut']); assert.equal(pl.total, 22.4); assert.equal(pl.segments[1].start, 9.4); assert.equal(pl.overlap, 0.6);
const pl2 = planTimeline([10, 1, 8], { seams: [{ type: 'dip', sec: 2 }, { type: 'crossfade', sec: 2 }] }); assert.deepEqual(pl2.overlaps, [0, 0.45, 0.45], 'each seam clamped to 45 % of its shorter neighbour');
assert.deepEqual(planTimeline([4, 4], { transition: 'crossfade', transitionSec: 0.5 }).overlaps, [0, 0.5], 'no seams = the film-wide transition at every joint');
assert.deepEqual(parseSeams([{ type: 'fade', sec: 0.5 }, null], 3), { list: [{ type: 'dip', sec: 0.5 }, null] });
assert.equal((parseSeams([null, null, null], 3) as any).field, 'seams'); assert.equal((parseSeams([{ type: 'wipe' }], 3) as any).field, 'seams[0].type'); assert.equal((parseSeams([{ type: 'cut', sec: 9 }], 3) as any).field, 'seams[0].sec');
const ed: any = parseEditor({ duckClips: true }); assert.equal(ed.duckClips, true); assert.equal((parseEditor({}) as any).duckClips, false, 'off by default (the Stitch panel is unchanged)');
const mg = mixGraph(['clip', 'music'], { clip: 1, music: 0.5 }, { duck: true, duckAmount: 0.6, endFade: '', duckClips: true });
assert.match(mg.graph, /asplit=2\[clip\]\[csc\]/); assert.match(mg.graph, /\[music0\]\[csc\]sidechaincompress/); assert.equal(mg.ducked, true);
assert.doesNotMatch(mixGraph(['clip', 'music'], { clip: 1, music: 0.5 }, { duck: true, duckAmount: 0.6, endFade: '' }).graph, /csc/, 'without duckClips the old mix');
ok('per-seam plan, parseSeams, duckClips');

// ---- REST: CRUD, ops / 409, samples, media GC sees film files ----
const app = Fastify(); FS.registerFilms(app); await app.ready();
const req = async (method: string, url: string, body?: unknown) => { const x = await app.inject({ method: method as any, url, ...(body !== undefined ? { payload: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}) }); return { status: x.statusCode, body: x.body ? JSON.parse(x.body) : null }; };
assert.deepEqual((await req('GET', '/api/films')).body, { items: [] });
const c = await req('POST', '/api/films', { title: 'Goodbye', aspect: '16:9' }); assert.equal(c.status, 201); assert.match(c.body.id, /^film_/); assert.equal(c.body.rev, 0);
assert.equal((await req('POST', '/api/films', {})).body.title, 'Untitled film 2'); assert.equal((await req('POST', '/api/films', { aspect: 'wide' })).body.code, 'invalid_aspect');
const id = c.body.id;
const e1 = await req('POST', `/api/films/${id}/ops`, { baseRev: 0, ops: [{ op: 'upsert_shot', shot: { id: 's1', stillUrl: '/files/still-x.png' } }] }); assert.equal(e1.status, 200); assert.equal(e1.body.rev, 1);
const stale = await req('POST', `/api/films/${id}/ops`, { baseRev: 0, ops: [{ op: 'set_title', title: 'Late' }] }); assert.equal(stale.status, 409); assert.equal(stale.body.code, 'rev_conflict'); assert.equal(stale.body.film.rev, 1); assert.equal(stale.body.film.title, 'Goodbye');
assert.equal((await req('POST', `/api/films/${id}/ops`, { ops: [] })).body.code, 'invalid_rev'); assert.equal((await req('POST', `/api/films/${id}/ops`, { baseRev: 1, ops: [] })).body.code, 'invalid_ops');
const be = await req('POST', `/api/films/${id}/ops`, { baseRev: 1, ops: [{ op: 'delete_shot', shotId: 'nope' }] }); assert.equal(be.status, 400); assert.equal(be.body.opIndex, 0);
assert.equal((await req('GET', `/api/films/${id}`)).body.rev, 1, 'a refused edit changes nothing');
const list = (await req('GET', '/api/films')).body.items; assert.equal(list.length, 2); assert.equal(list.find((x: any) => x.id === id).shotCount, 1); assert.equal(list.find((x: any) => x.id === id).posterUrl, '/files/still-x.png');
assert.ok(liveRefs().has('still-x.png'), 'media GC keeps a film\'s stills');
assert.equal((await req('POST', `/api/films/${id}/bridge`, { afterShotId: 's1' })).body.code, 'no_next_shot');
assert.equal((await req('POST', `/api/films/${id}/shots/s1/continue-frame`)).body.code, 'no_previous_shot');
assert.equal((await req('POST', `/api/films/${id}/shots/s1/render`, {})).body.code, 'quote_required', 'render needs the quote');
assert.equal((await req('POST', `/api/films/${id}/stitch`)).body.code, 'nothing_to_stitch'); assert.equal((await req('POST', `/api/films/${id}/preview`)).body.code, 'nothing_to_stitch');
const smp = (await req('GET', '/api/films/samples')).body.items; const gb = smp.find((x: any) => x.name === 'goodbye'); assert.ok(gb, 'the Goodbye sample is listed'); assert.equal(gb.available, false, 'its jobs are not in a fresh data folder');
assert.equal((await req('POST', '/api/films/samples/goodbye')).status, 409); assert.equal((await req('GET', '/api/films')).body.items.length, 2, 'not seeded without its jobs');
assert.equal((await req('DELETE', `/api/films/${id}`)).body.ok, true); assert.equal((await req('GET', `/api/films/${id}`)).status, 404); assert.equal((await req('DELETE', `/api/films/${id}`)).status, 404);
ok('REST: create, ops + rev, 409 with the current film, op errors, list summary, GC, guards, samples, delete');
// the sample file itself parses as a film
const sample = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../samples/films/goodbye.json'), 'utf8'));
const sp = FP.zFilm.safeParse({ ...sample.film, id: 'film_sample', shots: sample.film.shots.map((s: any) => ({ ...s, takes: (s.takes ?? []).map((t: any, i: number) => ({ id: `t${i}`, jobId: t.jobId })) })) });
assert.ok(sp.success, JSON.stringify(sp.error?.issues?.slice(0, 2))); assert.equal(sp.data!.shots.filter((s) => s.kind === 'bridge').length, 1);
ok('the Goodbye sample parses');
await app.close();

// ---- the shared engine (compose.ts): order, trim, a crossfade seam, length ----
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { console.log('skip ffmpeg part (no ffmpeg)'); console.log('film-projects: all ok'); process.exit(0); }
const mk = (name: string, src: string, d: number) => { const out = path.join(DATA, name); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `${src}:s=320x180:r=24:d=${d}`, '-f', 'lavfi', '-i', `sine=frequency=440:duration=${d}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out]); return out; };
const red = mk('red.mp4', 'color=c=red', 4), blue = mk('blue.mp4', 'color=c=blue', 3);
const out = path.join(DATA, 'cut.mp4');
const cr = await composeRender({ clips: [{ file: blue, full: 3, cut: { in: 0.5, out: 2.5 }, w: 320, h: 180, audio: true }, { file: red, full: 4, cut: null, w: 320, h: 180, audio: true }], layout: 'sequence', aspect: null, fit: null, crop: { x: 0.5, y: 0.5 },
  transition: 'cut', transitionSec: 0.5, seams: [{ type: 'crossfade', sec: 0.5 }], title: null, end: null, captions: [], music: null, voice: null, keepClip: true,
  mix: { clip: 1, music: 1, voice: 1, duck: true, duckAmount: 0.6, normalize: true }, fade: 0, videoFade: false, out, tmp: path.join(DATA, '.tmp-cut') });
assert.ok(cr.ok, `compose exit ${cr.code}`); assert.equal(cr.total, 5.5, '2 s (trimmed) + 4 s − 0.5 s crossfade');
const px = (t: number) => execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', out, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
const first = px(0.3), last = px(5.2); assert.ok(first[2] > 150 && first[0] < 80, `blue first (trimmed clip 1): ${[...first]}`); assert.ok(last[0] > 150 && last[2] < 80, `red last: ${[...last]}`);
const prev = path.join(DATA, 'rough.mp4');
const dr = await composeRender({ clips: [{ file: blue, full: 3, cut: null, w: 320, h: 180, audio: true }, { file: red, full: 4, cut: null, w: 320, h: 180, audio: true }], layout: 'sequence', aspect: null, fit: null, crop: { x: 0.5, y: 0.5 },
  transition: 'cut', transitionSec: 0.5, draft: true, title: null, end: null, captions: [], music: null, voice: null, keepClip: true, mix: { clip: 1, music: 1, voice: 1, duck: false, duckAmount: 0, normalize: false }, fade: 0, videoFade: false, out: prev, tmp: path.join(DATA, '.tmp-rough') });
assert.ok(dr.ok); assert.equal(dr.total, 7); assert.ok(dr.H <= 360);
ok('compose: order, trim, crossfade seam, draft rough cut');
console.log('film-projects: all ok');
