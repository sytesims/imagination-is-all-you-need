// Film UX pass (2026-10-27): J / L cuts in the shared timeline and in compose (picture cut + sound placed with adelay / amix, checked on real
// ffmpeg output with two tones), the film's budget (schema, set_meta, meter, Generate block), the gap chip's logic (joins, frames match),
// the page's keyboard shortcuts, the gap-quote route and the sample list's shot count, and how the page is wired.
// Run: npx tsx test/film-ux.test.ts   (temp data dir, no network, no server port; the ffmpeg part is skipped without ffmpeg)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
process.env.OPENHIGGSFIELD_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'film-ux-'));
const DATA = process.env.OPENHIGGSFIELD_DATA_DIR;
const FP = await import('../src/shared/filmProject.ts');
const T = await import('../src/shared/stitchTimeline.ts');
const { pictureArgs, stemArgs, composeRender } = await import('../src/compose.ts');
const { parseSeams } = await import('../src/agentBudget.ts');
const L = await import('../../web/src/ui/film/filmLogic.ts');
const ok = (m: string) => console.log('ok ' + m);
const web = (p: string) => fs.readFileSync(new URL(`../../web/src/${p}`, import.meta.url), 'utf8');

// ---- the timeline: a J / L cut overlaps like a crossfade, the picture joint stays a cut, the sound is placed ----
{ const p = T.planTimeline([3, 3, 3], { seams: [{ type: 'jcut', sec: 1 }, { type: 'lcut', sec: 0.5 }] });
  assert.deepEqual(p.joints, ['cut', 'jcut', 'lcut']); assert.deepEqual(p.overlaps, [0, 1, 0.5]); assert.equal(p.total, 7.5); assert.deepEqual(p.segments.map((s) => s.start), [0, 2, 4.5]);
  assert.ok(T.hasSplitJoint(p)); assert.ok(!T.hasSplitJoint(T.planTimeline([3, 3], { seams: [{ type: 'crossfade', sec: 1 }] })));
  const sp = T.soundPlaces(p);
  assert.deepEqual(sp.map((x) => [x.from, x.to, x.offset]), [[0, 2, 0], [2, 5, 0], [5, 7.5, 0.5]], 'J: A stops when B starts; L: B starts where B’s picture began + sec');
  assert.equal(sp[0].fadeIn, 0); assert.equal(sp[0].fadeOut, T.DECLICK_SEC); assert.equal(sp[2].fadeOut, 0, 'no ramp at the film’s ends');
  /* a crossfade beside a split edit keeps its blend */
  const q = T.planTimeline([3, 3, 3], { seams: [{ type: 'lcut', sec: 1 }, { type: 'crossfade', sec: 0.5 }] }); const sq = T.soundPlaces(q);
  assert.equal(sq[1].fadeOut, 0.5); assert.equal(sq[2].fadeIn, 0.5); assert.equal(sq[1].offset, 1);
  /* clamped like a crossfade: at most 45 % of the shorter clip */
  assert.equal(T.planTimeline([1, 3], { seams: [{ type: 'jcut', sec: 2 }] }).overlaps[1], 0.45);
  /* no seams / plain seams: unchanged */
  assert.deepEqual(T.planTimeline([3, 3], { transition: 'crossfade', transitionSec: 0.5 }).joints, ['cut', 'crossfade']); }
ok('J / L cuts in the shared timeline');

// ---- compose: the picture is a hard cut inside the overlap; the sound goes on the timeline only when a split edit is there ----
{ const clip = (f: string) => ({ file: f, full: 3, cut: null, w: 320, h: 180, audio: true });
  const base: any = { clips: [clip('a.mp4'), clip('b.mp4')], layout: 'sequence', aspect: null, fit: 'fit', crop: { x: 0.5, y: 0.5 }, transition: 'cut', transitionSec: 0.5, title: null, end: null, captions: [],
    music: null, voice: null, keepClip: true, mix: { clip: 1, music: 1, voice: 1, duck: false, duckAmount: 0, normalize: false }, fade: 0, videoFade: false, out: 'o.mp4', tmp: 't' };
  const files = { clip: 'c.wav', music: 'm.wav', voice: 'v.wav' };
  const j = { ...base, seams: [{ type: 'jcut', sec: 1 }] }; const pj = T.planTimeline([3, 3], { seams: j.seams });
  const gj = pictureArgs(j, pj, 320, 180, 'v.mp4', null).join(' ');
  assert.match(gj, /\[s1\]trim=start=1,setpts=PTS-STARTPTS\[s1h\]/); assert.match(gj, /\[s0\]\[s1h\]concat=n=2:v=1:a=0/); assert.doesNotMatch(gj, /xfade/);
  const sj = stemArgs(j, pj, files)!.args.join(' ');
  assert.match(sj, /adelay=2000:all=1/); assert.match(sj, /amix=inputs=2:duration=longest:normalize=0\[cj\]/); assert.doesNotMatch(sj, /acrossfade/);
  const l = { ...base, seams: [{ type: 'lcut', sec: 1 }] }; const pl = T.planTimeline([3, 3], { seams: l.seams });
  assert.match(pictureArgs(l, pl, 320, 180, 'v.mp4', null).join(' '), /\[s0\]trim=duration=2,setpts=PTS-STARTPTS\[s0t\];\[s0t\]\[s1\]concat/);
  assert.match(stemArgs(l, pl, files)!.args.join(' '), /atrim=start=1:end=3/);
  /* a crossfade film builds exactly as before */
  const c = { ...base, seams: [{ type: 'crossfade', sec: 0.5 }] }; const pc = T.planTimeline([3, 3], { seams: c.seams });
  assert.match(stemArgs(c, pc, files)!.args.join(' '), /acrossfade=d=0.5:c1=tri:c2=tri/); assert.match(pictureArgs(c, pc, 320, 180, 'v.mp4', null).join(' '), /xfade=transition=fade:duration=0.5:offset=2.5/);
  /* every xfade input ends with fps=30 after settb (ffmpeg 7.1's settb drops the frame rate and xfade then fails) */
  assert.match(pictureArgs(c, pc, 320, 180, 'v.mp4', null).join(' '), /settb=AVTB,fps=30\[s0\].*settb=AVTB,fps=30\[s1\]/); }
ok('compose: J / L picture cut and placed sound; crossfade unchanged');

// ---- compose seams parser and the film's stitch body ----
{ const r: any = parseSeams([{ type: 'jcut', sec: 1 }, { type: 'l-cut', sec: 0.5 }, null], 4); assert.deepEqual(r.list, [{ type: 'jcut', sec: 1 }, { type: 'lcut', sec: 0.5 }, null]);
  assert.match((parseSeams([{ type: 'wipe' }], 2) as any).error, /jcut/);
  const take = (id: string) => ({ id, jobId: `j${id}`, status: 'done', url: `/files/${id}.mp4` });
  const f = FP.zFilm.parse({ id: 'f', title: 'T', shots: [
    { id: 'a', takes: [take('a')], activeTakeId: 'a', transitionOut: { type: 'jcut', sec: 1 } },
    { id: 'b', takes: [take('b')], activeTakeId: 'b', transitionOut: { type: 'lcut', sec: 1.5 } },
    { id: 'c', takes: [take('c')], activeTakeId: 'c' }] });
  assert.deepEqual(FP.filmStitchBody(f).body.seams, [{ type: 'jcut', sec: 1 }, { type: 'lcut', sec: 1.5 }]);
  /* a film-wide J-cut goes on every seam (compose's film-wide transition stays cut / crossfade / dip) */
  const g = FP.zFilm.parse({ ...f, shots: f.shots.map((s) => ({ ...s, transitionOut: null })), post: { transition: { type: 'jcut', sec: 1 } } });
  const gb = FP.filmStitchBody(g).body; assert.equal(gb.transition, 'cut'); assert.deepEqual(gb.seams, [{ type: 'jcut', sec: 1 }, { type: 'jcut', sec: 1 }]); }
ok('seams parser and stitch body carry J / L');

// ---- the budget: schema, set_meta, the meter and the Generate block ----
{ const f0 = FP.newFilm({ id: 'f', title: 'T', now: 1 }); assert.equal(f0.budgetUsd, null);
  const r: any = FP.applyOps(f0, [{ op: 'set_meta', budgetUsd: 5 }], { newId: (p: string) => p, now: 1 }); assert.equal(r.film.budgetUsd, 5);
  assert.equal((FP.applyOps(r.film, [{ op: 'set_meta', budgetUsd: null }], { newId: (p: string) => p, now: 1 }) as any).film.budgetUsd, null);
  assert.ok('error' in FP.applyOps(f0, [{ op: 'set_meta', budgetUsd: -1 }], { newId: (p: string) => p, now: 1 }));
  const at = (spent: number, budget: number | null) => L.budgetOf({ spend: { countedUsd: spent, actualUsd: 0, actualRuns: 0, quotedUsd: 0, runs: 1, sampleRuns: 0 }, budgetUsd: budget });
  assert.equal(at(1, null).level, 'none'); assert.equal(at(1, 5).level, 'ok'); assert.equal(at(4, 5).level, 'warn'); assert.equal(at(5, 5).level, 'over'); assert.equal(at(4.6, 5).left, 0.4);
  const film = { spend: { countedUsd: 4.6, actualUsd: 0, actualRuns: 0, quotedUsd: 0, runs: 1, sampleRuns: 0 }, budgetUsd: 5 };
  assert.match(L.budgetBlock(film, { credits: 52, cost: { billedTo: 'comfy', estUsd: 0.52 } })!, /Over budget: \$0\.52 needed, \$0\.40 left/);
  assert.equal(L.budgetBlock(film, { credits: 30, cost: { billedTo: 'comfy', estUsd: 0.3 } }), null);
  assert.equal(L.budgetBlock(film, { credits: 0, demo: true }), null, 'a free sample never blocks');
  assert.equal(L.budgetBlock(film, { credits: 90, cost: { billedTo: 'local' } }), null, 'your computer is free');
  assert.equal(L.budgetBlock({ ...film, budgetUsd: null }, { credits: 999 }), null);
  assert.equal(L.quoteUsd({ credits: 52 }), 0.52); assert.equal(L.quoteUsd(null), null);
  assert.equal(L.parseBudget('$12.50'), 12.5); assert.equal(L.parseBudget(''), null); assert.equal(L.parseBudget('lots'), undefined); assert.equal(L.parseBudget('1,000'), 1000); }
ok('budget');

// ---- the gap chip's logic: joins, lengths, frames match ----
{ assert.deepEqual(L.FREE_JOINS.map((j) => j.kind), ['cut', 'jcut', 'lcut', 'crossfade', 'fade']); assert.ok(L.FREE_JOINS.every((j) => j.tip.length > 10));
  assert.deepEqual(L.transitionOf('jcut'), { type: 'jcut', sec: 1 }); assert.deepEqual(L.transitionOf('lcut', { type: 'jcut', sec: 1.5 }), { type: 'lcut', sec: 1.5 });
  assert.equal(L.transitionText({ type: 'jcut', sec: 1 }), 'J-cut 1 s'); assert.equal(L.joinKindOf({ type: 'dip', sec: 1 }), 'fade');
  const s = (o: any) => FP.zShot.parse({ id: `s${Math.random().toString(36).slice(2, 7)}`, durationSec: 5, ...o });
  assert.equal(L.totalLen({ shots: [s({ transitionOut: { type: 'jcut', sec: 1 } }), s({})], post: FP.zPost.parse({}) }), 9, 'a J-cut takes its seconds off like a crossfade');
  const px = (r: number, g: number, b: number, n = 64) => { const a: number[] = []; for (let i = 0; i < n; i++) a.push(r, g, b, 255); return a; };
  const warm = L.frameStatsOf(px(200, 120, 60)); const same = L.frameStatsOf(px(205, 118, 62)); const blue = L.frameStatsOf(px(30, 60, 200));
  assert.equal(L.frameMatch(warm, same).level, 'close'); assert.equal(L.frameMatch(warm, blue).level, 'far');
  assert.equal(L.frameMatch(warm, blue).line, 'Far apart: a bridge may morph. Try a cut with a sound bridge.');
  const half = L.frameStatsOf([...px(200, 120, 60, 40), ...px(30, 60, 200, 24)]); assert.equal(L.frameMatch(warm, half).level, 'far');
  const tint = L.frameStatsOf([...px(200, 120, 60, 48), ...px(30, 60, 200, 16)]); assert.equal(L.frameMatch(warm, tint).level, 'risky');
  assert.ok(Math.abs(L.frameStatsOf(px(255, 255, 255)).luma - 1) < 1e-9); }
ok('gap chip logic');

// ---- keyboard: off while typing, the keys, S picks the newest finished take ----
{ const k = (key: string, o: any = {}) => L.filmKeyOf({ key, metaKey: false, ctrlKey: false, altKey: false, target: null, ...o });
  assert.equal(k(' '), 'play'); assert.equal(k('ArrowLeft'), 'prev'); assert.equal(k('ArrowRight'), 'next'); assert.equal(k('C'), 'continue'); assert.equal(k('b'), 'gap'); assert.equal(k('r'), 'again'); assert.equal(k('s'), 'star');
  assert.equal(k('?'), 'help'); assert.equal(k('/', { shiftKey: true }), 'help'); assert.equal(k('x'), null); assert.equal(k('s', { metaKey: true }), null, 'Cmd+S is the browser’s');
  assert.equal(k('c', { target: { tagName: 'TEXTAREA' } }), null); assert.equal(k('c', { target: { tagName: 'INPUT', type: 'text' } }), null); assert.equal(k('c', { target: { tagName: 'DIV', isContentEditable: true } }), null);
  assert.equal(k('c', { target: { tagName: 'BUTTON' } }), 'continue');
  assert.deepEqual(L.SHORTCUTS.map((x) => x.keys), ['Space', '← →', 'C', 'B', 'R', 'S', '?']);
  const t = (id: string, createdAt: number, status = 'done') => FP.zTake.parse({ id, jobId: `j${id}`, status, url: status === 'done' ? `/files/${id}.mp4` : null, createdAt });
  const sh = FP.zShot.parse({ id: 'x', takes: [t('a', 1), t('b', 2), t('c', 3, 'running')], activeTakeId: 'a' });
  assert.equal(L.newestDoneTake(sh)?.id, 'b'); assert.equal(L.newestDoneTake({ ...sh, activeTakeId: 'b' }), null); }
ok('keyboard');

// ---- routes: gap-quote checks its input; the sample list says how many shots ----
{ const Fastify = (await import('fastify')).default; const FS = await import('../src/filmProjects.ts');
  const app = Fastify(); FS.registerFilms(app); await app.ready();
  const f = (await app.inject({ method: 'POST', url: '/api/films', payload: { title: 'G' } })).json();
  await app.inject({ method: 'POST', url: `/api/films/${f.id}/ops`, payload: { baseRev: f.rev, ops: [{ op: 'upsert_shot', shot: { id: 'a', prompt: 'x' } }] } });
  assert.equal((await app.inject({ method: 'POST', url: `/api/films/${f.id}/gap-quote`, payload: { afterShotId: 'nope', kind: 'bridge' } })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: `/api/films/${f.id}/gap-quote`, payload: { afterShotId: 'a', kind: 'morph' } })).statusCode, 400);
  const sm = (await app.inject({ method: 'GET', url: '/api/films/samples' })).json(); const gb = sm.items.find((x: any) => x.name === 'goodbye');
  if (gb) { assert.ok(gb.shotCount > 0); assert.equal(gb.aspect, '16:9'); }
  await app.close(); }
ok('gap-quote input checks and sample shot counts');

// ---- the page is wired: gap chips between cards, budget meter, shortcuts, the start tiles ----
{ const ed = web('ui/film/FilmEditor.tsx'), gap = web('ui/film/GapChip.tsx'), ins = web('ui/film/FilmInspector.tsx'), page = web('ui/film/FilmPage.tsx');
  assert.match(ed, /<GapChip /); assert.doesNotMatch(ed, /function SeamTransition/, 'the old seam control is gone');
  for (const id of ['film-gap-match', 'film-gap-continue', 'film-gap-bridge', 'film-gap-extend', 'film-join-${j.kind}']) assert.ok(gap.includes(id), id);
  assert.match(gap, /gapQuote\(film\.id, a\.id, 'bridge'\)/, 'AI joins show their price first');
  for (const id of ['film-spend', 'film-budget-input', 'film-shortcuts', 'film-keys', 'film-empty-start']) assert.ok(ed.includes(`"${id}"`), id);
  assert.match(ins, /budgetBlock\(film, q\)/); assert.match(ins, /FILM_AGAIN_EVENT/); assert.match(ins, /askConfirm/, 'R asks with the price first');
  assert.match(page, /<FilmStart /); }
ok('page wiring');

// ---- a real ffmpeg run: J-cut and L-cut timing on two tones (A 440 Hz red, B 1760 Hz blue, 3 s each, 1 s split) ----
let ff = true; try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { ff = false; }
if (ff) {
  const mk = (name: string, color: string, hz: number) => { const p = path.join(DATA, name); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=160x90:r=30:d=3`, '-f', 'lavfi', '-i', `sine=f=${hz}:d=3:sample_rate=48000`, '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', p]); return p; };
  const A = mk('a.mp4', 'red', 440), B = mk('b.mp4', 'blue', 1760);
  const hz = (file: string, at: number) => { const raw = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(at), '-t', '0.2', '-i', file, '-ac', '1', '-ar', '48000', '-f', 's16le', '-']);
    let z = 0; for (let i = 2; i < raw.length; i += 2) if ((raw.readInt16LE(i - 2) < 0) !== (raw.readInt16LE(i) < 0)) z++; return z / 0.2 / 2; };
  const red = (file: string, at: number) => execFileSync('ffmpeg', ['-v', 'error', '-ss', String(at), '-i', file, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])[0] > 128;
  for (const type of ['jcut', 'lcut'] as const) {
    const out = path.join(DATA, `${type}.mp4`); const clip = (file: string) => ({ file, full: 3, cut: null, w: 160, h: 90, audio: true });
    const r = await composeRender({ clips: [clip(A), clip(B)], layout: 'sequence', aspect: null, fit: null, crop: { x: 0.5, y: 0.5 }, transition: 'cut', transitionSec: 0.5, seams: [{ type, sec: 1 }],
      title: null, end: null, captions: [], music: null, voice: null, keepClip: true, mix: { clip: 1, music: 0, voice: 0, duck: false, duckAmount: 0, normalize: false }, fade: 0, videoFade: false, out, tmp: path.join(DATA, `tmp-${type}`) });
    assert.ok(r.ok); assert.equal(r.total, 5);
    if (type === 'jcut') { assert.ok(red(out, 2.5), 'J: A’s picture holds to 3 s'); assert.ok(!red(out, 3.2)); assert.ok(Math.abs(hz(out, 2.3) - 1760) < 80, 'J: B’s sound from 2 s'); assert.ok(Math.abs(hz(out, 1.6) - 440) < 40); }
    else { assert.ok(!red(out, 2.3), 'L: the picture cuts to B at 2 s'); assert.ok(Math.abs(hz(out, 2.5) - 440) < 40, 'L: A’s sound runs to 3 s'); assert.ok(Math.abs(hz(out, 3.3) - 1760) < 80); }
  }
  ok('ffmpeg: J / L cut timing');
} else console.log('skip ffmpeg: J / L cut timing (no ffmpeg)');
