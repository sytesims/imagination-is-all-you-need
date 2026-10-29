// Film page (web/src/ui/film): the pure page logic on the shared film document (lengths, trims, transitions, start sources, takes,
// Split / new cards, hide, what Stitch keeps, optimistic ops) and how the tab is wired (a plain header tab after Canvas, /film and
// /film/:id, its own lazy chunk, types from server/src/shared/filmProject.ts, no dev mock left).
// Run: npx tsx test/film-web.test.ts
import assert from 'node:assert/strict';
const L = await import('../../web/src/ui/film/filmLogic.ts');
const { zShot, zFilm } = await import('../src/shared/filmProject.ts');
const ok = (m: string) => console.log('ok ' + m);

const s = (o: any = {}) => zShot.parse({ id: `s${Math.random().toString(36).slice(2, 8)}`, ...o });
const take = (id: string, o: any = {}) => ({ id, jobId: `j${id}`, status: 'done', url: `/files/${id}.mp4`, posterUrl: `/files/${id}.jpg`, durationSec: null, costUsd: 0.4, quotedUsd: 0.45, actualUsd: null, local: false, sample: false, createdAt: 1, star: false, error: null, ...o });
const film = (shots: any[], o: any = {}) => zFilm.parse({ id: 'f1', title: 'T', shots, ...o });

// new cards: the shared defaults (resolution and length left to the model)
{ const a = L.newShot(); assert.equal(a.kind, 'shot'); assert.equal(a.durationSec, null); assert.equal(a.resolution, ''); assert.deepEqual(a.types, ['i2v']); assert.equal(a.hidden, false); assert.equal(a.transitionOut, null);
  assert.match(a.id, /^[\w-]+$/, 'ids pass the server check'); assert.notEqual(L.newShot().id, L.newShot().id); }
ok('new cards');

// lengths: the clip's real length wins, trims, hidden cards, crossfades (own or the film's), unknown length
{ const a = s({ durationSec: 15, trim: { inSec: 1.5, outSec: 11 } }); assert.equal(L.playLen(a), 9.5); assert.ok(L.isTrimmed(a));
  const b = s({ durationSec: 6 }); assert.equal(L.playLen(b), 6); assert.ok(!L.isTrimmed(b));
  const real = s({ durationSec: 6, takes: [take('r', { durationSec: 6.2 })], activeTakeId: 'r' }); assert.equal(L.fullLen(real), 6.2, 'the take’s own length');
  assert.equal(L.playLen(s()), 0, 'model length unknown yet'); assert.equal(L.fullLen(s()), null);
  assert.equal(L.playLen(s({ durationSec: 6, trim: { inSec: 2, outSec: 99 } })), 4, 'out past the end is the end');
  const f = (shots: any[], post?: any) => ({ shots, post: post ?? film([]).post });
  assert.equal(L.totalLen(f([a, b])), 15.5);
  assert.equal(L.totalLen(f([{ ...a, transitionOut: { type: 'crossfade', sec: 0.6 } }, b])), 14.9, 'a crossfade takes its seconds off');
  assert.equal(L.totalLen(f([a, { ...b, transitionOut: { type: 'crossfade', sec: 0.6 } }])), 15.5, 'the last card has no seam');
  assert.equal(L.totalLen(f([{ ...a, transitionOut: { type: 'fade', sec: 1 } }, b])), 15.5, 'fade through black keeps the length');
  assert.equal(L.totalLen(f([a, b], { ...film([]).post, transition: { type: 'crossfade', sec: 0.5 } })), 15, 'null transitionOut = the film’s');
  assert.equal(L.totalLen(f([a, { ...b, hidden: true }])), 9.5, 'hidden cards are left out');
  assert.equal(L.totalLen(f([])), 0); }
ok('lengths');

// trims: half-second steps, clamped, extending as easy as cutting, out at the end = null
{ assert.deepEqual(L.clampTrim(10, 0, 9.5), { inSec: 0, outSec: 9.5 }); assert.deepEqual(L.clampTrim(10, 0, 10), { inSec: 0, outSec: null }, 'out at the end clears it');
  assert.deepEqual(L.clampTrim(10, -1, null), { inSec: 0, outSec: null }); assert.deepEqual(L.clampTrim(10, 4, 4.1), { inSec: 4, outSec: 4.5 }, 'at least half a second');
  const a = s({ durationSec: 10 }); assert.deepEqual(L.nudgeTrim(a, 'out', -0.5), { inSec: 0, outSec: 9.5 }); assert.deepEqual(L.nudgeTrim({ ...a, trim: { inSec: 0, outSec: 9.5 } }, 'out', 0.5), { inSec: 0, outSec: null }); }
ok('trims');

// transitions
{ assert.deepEqual(L.transitionOf('crossfade'), { type: 'crossfade', sec: 0.6 }); assert.deepEqual(L.transitionOf('crossfade', { type: 'crossfade', sec: 0.8 }), { type: 'crossfade', sec: 0.8 });
  assert.deepEqual(L.transitionOf('cut', { type: 'crossfade', sec: 0.8 }), { type: 'cut', sec: 0 }); assert.equal(L.transitionOf('dip').type, 'fade', 'dip is fade');
  assert.equal(L.transitionText({ type: 'crossfade', sec: 0.4 }), 'Crossfade 0.4 s'); assert.equal(L.transitionText({ type: 'dip', sec: 1 }), 'Fade'); assert.equal(L.transitionText(null), 'Cut');
  const p = film([]).post; assert.deepEqual(L.seamOf(s(), { post: p }), p.transition); assert.deepEqual(L.seamOf(s({ transitionOut: { type: 'fade', sec: 1 } }), { post: p }), { type: 'fade', sec: 1 }); }
ok('transitions');

// labels, start sources, missing, takes
{ assert.deepEqual(L.shotLabels([s(), s({ kind: 'bridge' }), s(), s()]), ['Shot 1', 'Bridge', 'Shot 2', 'Shot 3']);
  const p = s({ takes: [take('p')], activeTakeId: 'p', stillUrl: '/files/a.png', startFrom: { kind: 'still', url: '/files/a.png', jobId: null } });
  const c = s({ startFrom: { kind: 'last_frame', url: '/files/p-last.png', jobId: 'jp' } }); const same = s({ stillUrl: '/files/a.png' }); const none = s(); const t2v = s({ types: ['t2v'] });
  const row = [p, c, same, none, t2v]; assert.equal(L.startSourceOf(row, 0), 'Start still'); assert.equal(L.startSourceOf(row, 1), 'Last frame of Shot 1');
  assert.equal(L.startSourceOf(row, 2), 'Same still as Shot 1'); assert.equal(L.startSourceOf(row, 3), 'No start still yet'); assert.equal(L.startSourceOf(row, 4), 'Text only, no start still');
  const F = { id: 'f', aspect: '16:9' };
  assert.equal(L.missingOf(F, none), 'Write a prompt'); assert.equal(L.missingOf(F, { ...none, prompt: 'x' }), 'Add a start still'); assert.equal(L.missingOf(F, { ...t2v, prompt: 'x' }), null);
  assert.equal(L.missingOf(F, s({ kind: 'bridge', types: ['flf'], prompt: 'm', startFrom: { kind: 'last_frame', url: '/files/a.png', jobId: null } })), 'Needs the next start still');
  const a = s({ takes: [1, 2, 3, 4, 5].map(n => take(`t${n}`, { createdAt: n })), activeTakeId: 't2' });
  assert.equal(L.activeTake(a)!.id, 't2'); const v = L.takesView(a); assert.deepEqual(v.lead.map(t => t.id), ['t2', 't5', 't4']); assert.deepEqual(v.older.map(t => t.id), ['t3', 't1']);
  assert.equal(L.activeTake(s({ takes: [take('x')] })), null, 'no active id: none (the server picks)');
  assert.ok(L.playable(take('d'))); assert.ok(!L.playable(take('m', { status: 'missing' }))); assert.ok(!L.playable(take('q', { status: 'running', url: null }))); }
ok('labels, start sources, missing, takes');

// split + move
{ const a = s({ prompt: 'Wide, she turns', takes: [take('k')], activeTakeId: 'k', durationSec: 10, stillUrl: '/files/a.png' }); const sp = L.splitShot(a);
  assert.equal(sp.prompt, a.prompt); assert.equal(sp.stillUrl, a.stillUrl); assert.equal(sp.takes.length, 0, 'takes stay on the original'); assert.notEqual(sp.id, a.id);
  assert.deepEqual(L.moveId(['a', 'b', 'c'], 'a', 1), ['b', 'a', 'c']); const same = ['a', 'b']; assert.equal(L.moveId(same, 'a', -1), same); assert.equal(L.moveId(same, 'zz', 1), same); }
ok('split, move');

// what Stitch keeps, and its note
{ assert.equal(L.stitchNote(film([])).blocked, 'Add a shot first');
  const a = s({ id: 'a', takes: [take('a', { durationSec: 6 })], activeTakeId: 'a', trim: { inSec: 1, outSec: null } }); const b = s({ id: 'b' });
  const f = film([a, b]); assert.equal(f.shots[1].status, 'draft');
  assert.deepEqual(L.stitchNote(f), { blocked: null, note: 'Leaves out Shot 2 (no clip yet)' });
  assert.deepEqual(L.stitchNote(film([a, { ...b, hidden: true }])), { blocked: null, note: null }, 'hidden cards aren’t called out');
  assert.equal(L.stitchNote(film([{ ...a, hidden: true }])).blocked, 'Every card is hidden'); assert.equal(L.stitchNote(film([b])).blocked, 'No card has a finished clip yet');
  assert.equal(L.cutLen(f), 5, 'only kept cards count'); }
ok('stitch note, cut length');

// optimistic ops use the shared applyOps with the server's field names; a bad op leaves the film as it was
{ const f = film([s({ id: 'a' }), s({ id: 'b' })]);
  assert.equal(L.applyLocal(f, [{ op: 'set_title', title: 'Goodbye' }]).title, 'Goodbye');
  assert.deepEqual(L.applyLocal(f, [{ op: 'reorder_shots', order: ['b', 'a'] }]).shots.map(x => x.id), ['b', 'a']);
  assert.deepEqual(L.applyLocal(f, [{ op: 'upsert_shot', shot: { id: 'n' }, index: 1 }]).shots.map(x => x.id), ['a', 'n', 'b']);
  assert.equal(L.applyLocal(f, [{ op: 'upsert_shot', shot: { id: 'a', hidden: true } }]).shots[0].hidden, true);
  assert.deepEqual(L.applyLocal(f, [{ op: 'set_trim', shotId: 'b', inSec: 1, outSec: 3 }]).shots[1].trim, { inSec: 1, outSec: 3 });
  assert.equal(L.applyLocal(f, [{ op: 'set_audio', tracks: [{ kind: 'music', url: '/files/m.mp3' }] }]).audio.length, 1);
  assert.equal(L.applyLocal(f, [{ op: 'set_post', post: { videoFade: false } }]).post.videoFade, false);
  assert.equal(L.applyLocal(f, [{ op: 'set_meta', aspect: '9:16' }]).aspect, '9:16');
  assert.equal(L.applyLocal(f, [{ op: 'delete_shot', shotId: 'zz' }]), f, 'unknown shot: unchanged');
  assert.equal(f.title, 'T', 'ops never mutate the film'); }
ok('optimistic ops');

assert.equal(L.usdText(0), '$0'); assert.equal(L.usdText(0.12), '$0.12'); assert.equal(L.usdText(2.857), '$2.86'); assert.equal(L.clockOf(100), '1:40'); assert.equal(L.clockOf(3725), '1:02:05');
ok('money and clock');

// wiring
const { FILM_NAV, CANVAS_NAV } = await import('../../web/src/ui/headerMenus.ts');
assert.equal(FILM_NAV.to, '/film'); assert.equal(FILM_NAV.label, 'Editor'); assert.equal(CANVAS_NAV.to, '/canvas');
const { readFileSync, existsSync } = await import('node:fs'); const web = (p: string) => readFileSync(new URL(`../../web/src/${p}`, import.meta.url), 'utf8');
const shell = web('ui/Shell.tsx'); assert.ok(shell.indexOf('FILM_NAV.to, FILM_NAV.label') > shell.indexOf('CANVAS_NAV.to, CANVAS_NAV.label'), 'Film comes after Canvas');
const chunks = web('platform/routeChunks.ts'); assert.match(chunks, /film: once\(\(\) => import\('\.\.\/ui\/film\/FilmPage'\)\)/); assert.match(chunks, /'\/film': 'film'/);
const router = web('platform/router.tsx'); assert.match(router, /'\/film': \['Editor'/); assert.match(router, /FILM_ID_PATH = /); assert.match(web('App.tsx'), /FILM_ID_PATH\.test\(path\)/);
assert.match(web('ui/film/types.ts'), /from '\.\.\/\.\.\/\.\.\/\.\.\/server\/src\/shared\/filmProject'/, 'types come from the shared film document');
assert.ok(!existsSync(new URL('../../web/src/ui/film/filmMock.ts', import.meta.url)), 'the dev mock is gone');
assert.ok(!/filmMock/.test(web('ui/film/FilmPage.tsx') + web('ui/film/FilmEditor.tsx')), 'nothing loads a mock');
ok('wiring: Film tab after Canvas, routes, lazy chunk, shared types, no mock');

// IIAYN FILMS: the ident and the end credit naming the cut's real models (as many as fit compose's 120 characters)
{ assert.equal(L.IDENT_TEXT, 'IIAYN FILMS presents'); assert.equal(L.identCard().mode, 'black');
  assert.equal(L.creditText([]), 'Made in Imagination Is All You Need');
  assert.equal(L.creditText(['MiniMax H3']), 'Made in Imagination Is All You Need with MiniMax H3');
  assert.equal(L.creditText(['MiniMax H3', 'LTX-2.5 22B', 'MiniMax H3']), 'Made in Imagination Is All You Need with MiniMax H3 and LTX-2.5 22B', 'each model once');
  const many = L.creditText(Array.from({ length: 12 }, (_, i) => `A long model name number ${i}`)); assert.ok(many.length <= L.CARD_MAX); assert.match(many, /and \d+ more$/);
  assert.ok(L.isAutoCredit(L.creditText(['X']))); assert.ok(!L.isAutoCredit('Thanks for watching')); assert.ok(!L.isAutoCredit(null));
  const p = L.brandedPost(); assert.equal(p.titleCard?.text, 'IIAYN FILMS presents'); assert.ok(L.isAutoCredit(p.endCard?.text));
  const a = s({ modelKey: 'minimax-h3', takes: [take('a')], activeTakeId: 'a' }); const b = s({ kind: 'bridge', modelKey: 'ltx-2.5-22b', takes: [take('b')], activeTakeId: 'b' });
  const h = s({ modelKey: 'wan', takes: [take('h')], activeTakeId: 'h', hidden: true }); const d = s({ modelKey: 'kling' });
  assert.deepEqual(L.cutModelKeys(film([a, b, h, d])), ['minimax-h3', 'ltx-2.5-22b'], 'only the takes in the cut'); }
ok('IIAYN FILMS ident and credit');

// World notes: one marked block in the script, the rest of the script kept; the prompt hint
{ const md = L.withWorldNotes('# Scene 1\nRain.', 'Traffic drives on the right.'); assert.equal(L.worldNotesOf(md), 'Traffic drives on the right.'); assert.match(md, /# Scene 1\nRain\.$/);
  const md2 = L.withWorldNotes(md, 'The shelter is on the right.'); assert.equal(L.worldNotesOf(md2), 'The shelter is on the right.'); assert.equal((md2.match(/<!-- world -->/g) ?? []).length, 1);
  assert.equal(L.withWorldNotes(md2, '  '), '# Scene 1\nRain.', 'empty notes remove the block'); assert.equal(L.worldNotesOf(''), '');
  assert.ok(L.needsWorld('A wide shot.', 'Traffic on the right.')); assert.ok(!L.needsWorld('A wide shot. Traffic on the right.', 'Traffic on the right.')); assert.ok(!L.needsWorld('x', ''));
  assert.equal(L.promptWithWorld('A wide shot.  ', 'Traffic on the right.'), 'A wide shot.\n\nTraffic on the right.'); assert.equal(L.promptWithWorld('', 'N'), 'N'); }
ok('world notes');

// Seams: a bridge joins with plain cuts; bridgeCutOps fixes blends into and out of it
{ const a = s({ transitionOut: { type: 'crossfade', sec: 0.6 } }); const b = s({ kind: 'bridge', transitionOut: { type: 'fade', sec: 1 } }); const c = s({ transitionOut: { type: 'crossfade', sec: 0.6 } }); const d = s();
  const f = film([a, b, c, d]); assert.ok(L.seamLocked(f, a)); assert.ok(L.seamLocked(f, b)); assert.ok(!L.seamLocked(f, c));
  assert.deepEqual(L.bridgeCutOps(f).map((o: any) => o.shot.id), [a.id, b.id]); assert.deepEqual((L.bridgeCutOps(f)[0] as any).shot.transitionOut, { type: 'cut', sec: 0 });
  const g = film([s(), s({ kind: 'bridge' }), s()], { post: { transition: { type: 'crossfade', sec: 0.5 } } }); assert.equal(L.bridgeCutOps(g).length, 2, 'the film-wide blend is overridden too');
  assert.ok(L.SEAM_TIPS.cut && L.SEAM_TIPS.crossfade && L.SEAM_TIPS.fade); }
ok('bridge seams stay cuts');

// Frames as handles and the next-shot context the agent will read
{ const a = s({ prompt: 'Wide.', modelKey: 'minimax-h3', seed: 7, takes: [take('a', { durationSec: 6 })], activeTakeId: 'a', beatId: 'b1' }); const br = s({ kind: 'bridge' }); const c = s();
  const f = film([a, br, c], { beats: [{ id: 'b1', summary: 'They wait.' }, { id: 'b2', summary: 'The bus comes.' }], cast: [{ id: 'm', name: 'Mum', lookLine: 'grey coat' }], script: { markdown: L.withWorldNotes('', 'Right-hand traffic.') } });
  assert.equal(L.lastFrameTarget(f, a).shot?.id, br.id); assert.equal(L.lastFrameTarget(f, c).kind, 'new'); assert.equal(L.firstFrameTarget(f, c)?.id, br.id); assert.equal(L.firstFrameTarget(f, a), null);
  const x = L.nextShotContext(f, a, 'MiniMax H3', '/files/a-flast.png');
  assert.deepEqual(x.take, { jobId: 'ja', durationSec: 6, seed: 7, url: '/files/a.mp4' }); assert.equal(x.modelName, 'MiniMax H3'); assert.equal(x.lastFrameUrl, '/files/a-flast.png');
  assert.equal(x.worldNotes, 'Right-hand traffic.'); assert.equal(x.nextBeat, 'The bus comes.'); assert.deepEqual(x.cast, [{ name: 'Mum', lookLine: 'grey coat' }]);
  assert.equal(L.nextShotContext(f, c, 'X', null).take, null); }
ok('frame handles and next-shot context');

// the new UI is wired: studio mark, ident/credit switches, world notes, frame chips, in-place still, the ideas slot
{ const page = web('ui/film/FilmPage.tsx'), ed = web('ui/film/FilmEditor.tsx'), ins = web('ui/film/FilmInspector.tsx');
  assert.match(page, /data-testid="film-studio"/); assert.match(page, /branded\(/); assert.match(web('ui/film/filmApi.ts'), /brandedPost\(\)/);
  for (const id of ['film-ident-on', 'film-credit-on', 'film-world']) assert.match(ed, new RegExp(`"${id}"`));
  assert.match(web('ui/film/GapChip.tsx'), /film-gap-match/, 'the join tips live in the gap chip');
  for (const id of ['film-frame-', 'film-make-still', 'film-still-go', 'film-next-ideas', 'film-world-hint']) assert.match(ins, new RegExp(id)); }
ok('IIAYN FILMS, world notes, frames, still and ideas wired');
