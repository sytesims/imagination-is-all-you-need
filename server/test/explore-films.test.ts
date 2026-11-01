// Explore "IIAYN FILMS" (2026-10-29; five displayed films, archived comedy retained). Covers: every file the section uses ships in web/public/examples/iiayn-films (≤ 15.5 MB in all, MUM
// ≤ 3.2 MB, clips metadata-stripped, the film 1280×720 with sound, the loop silent); the shots run in order inside the film; the credit names the
// real models; Make your own opens Video › Stitch (the Goodbye sample still ships for /film); the steps cover the recipe; the copy has no machine / place jargon.
// Pure: no server, no network. Run: npx tsx test/explore-films.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process'; import { createHash } from 'node:crypto';
const ok = (m: string) => console.log('ok ' + m);
const ROOT = path.resolve(import.meta.dirname, '../..'); const PUB = path.join(ROOT, 'web/public'); const DIR = path.join(PUB, 'examples/iiayn-films');
const { EXPLORE_FILMS: X, EXPLORE_SHOWCASE_LINKS } = await import('../src/shared/exploreShowcase.ts');
const M = X.feature;

// ---- the folder
let total = 0; for (const n of fs.readdirSync(DIR)) total += fs.statSync(path.join(DIR, n)).size;
assert.ok(total <= 15.5e6, `examples/iiayn-films stays ≤ 15.5 MB: ${total} B`); // Existing ~11.22 MB + approved Counter-Offer streams/posters ~3.93 MB; no extra master.
const used = [M.url, M.poster, M.alt, M.loop, M.tall, M.trailer, ...M.shots.flatMap((s) => [s.start, s.frame])];
for (const u of used) { assert.match(u, /^\/examples\/iiayn-films\/[\w.-]+\.(mp4|jpg)$/, u); assert.ok(fs.existsSync(path.join(PUB, u)), `missing ${u}`); }
assert.ok(fs.statSync(path.join(PUB, M.url)).size <= 3.2e6, 'the film ≤ 3.2 MB (2026-10-28, with the new end card)');
const probe = (u: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration:format_tags', '-of', 'json', path.join(PUB, u)]).toString());
const film = probe(M.url), loop = probe(M.loop);
const v = film.streams.find((s: any) => s.codec_type === 'video'); assert.deepEqual([v.width, v.height], [1280, 720]);
assert.ok(film.streams.some((s: any) => s.codec_type === 'audio'), 'the film has sound'); assert.ok(Math.abs(Number(film.format.duration) - M.sec) < 1, `${M.sec} s`);
assert.ok(!loop.streams.some((s: any) => s.codec_type === 'audio'), 'the loop is silent'); assert.ok(Number(loop.format.duration) <= 8, 'the loop ≤ 8 s'); assert.ok(fs.statSync(path.join(PUB, M.loop)).size <= 1e6, 'the loop < 1 MB');
const tr = probe(M.trailer); assert.ok(!tr.streams.some((s: any) => s.codec_type === 'audio') && Number(tr.format.duration) <= 12, 'the trailer: silent, ≤ 12 s');
assert.ok(M.identEnd > 3 && M.identEnd < M.shots[0].t0 + 0.01, 'recorded ident boundary precedes the first scene; full-film playback starts there (the opener is skipped)');
for (const p of [film, loop]) assert.doesNotMatch(JSON.stringify(p.format.tags ?? {}), /creation_time|location|com\.apple/i, 'metadata stripped');
ok(`folder ${(total / 1e6).toFixed(2)} MB; the film 1280×720 with sound, the loop silent, metadata stripped`);

// ---- the shots, in order, inside the film; before the title
const t0 = M.shots.map((s) => s.t0); assert.deepEqual(t0, [...t0].sort((a, b) => a - b)); assert.ok(t0[0] > 0 && t0.at(-1)! < M.endAt && M.endAt < M.sec);
assert.deepEqual(new Set(M.shots.map((s) => s.model)), new Set(['MiniMax H3', 'LTX-2.5 22B']));
ok('five shots in order, before the title and credits');

// ---- credits, links, steps, copy
for (const m of ['GPT Image 2.5 Flare', 'MiniMax H3', 'LTX-2.5 22B', 'Whisper']) assert.ok(M.credit.includes(m), `credit names ${m}`);
const stitch = new URL(X.editor.href, 'http://x'); assert.equal(stitch.pathname, '/video'); assert.equal(stitch.searchParams.get('workflow'), 'stitch', 'Make your own opens Video › Stitch (the Editor tab is hidden, 2026-11-01)');
assert.ok(fs.existsSync(path.join(ROOT, 'server/samples/films/goodbye.json')), 'the Goodbye sample still ships (/film still opens it)');
assert.ok(EXPLORE_SHOWCASE_LINKS().includes(X.editor.href), 'the link is checked with the others');
assert.deepEqual(X.steps.map((s) => s.name), ['Stills', 'Clips', 'Continue', 'Bridge', 'L-cut', 'Sound beds', 'Subtitles', 'Ending']);
assert.deepEqual(X.next.map((n) => n.key), [], 'no coming-soon card'); assert.equal(X.yours.href, X.editor.href); assert.equal(X.label, 'IIAYN FILMS');
const copy = JSON.stringify([X.title, X.line, M.logline, M.credit, M.cost, X.steps, X.next, X.yours, M.shots.map((s) => [s.name, s.what])]);
assert.doesNotMatch(copy, /\bMac\b|\blocal\b|Comfy Router|seamless|stunning|unleash/i, 'brand voice');
ok('credits name the real models; Make your own → Stitch; eight steps; copy on voice');

// ---- the films beside MUM (2026-10-28: 그래요? · IS THAT SO?, The Airport Run, LE SEPTIÈME): files ship, sound kept, small for the web, plain copy
for (const f of [X.comedy, X.teaser, X.horror, X.counterOffer]) {
  for (const u of [f.url, f.poster, f.loop, f.tall]) { assert.match(u, /^\/examples\/iiayn-films\/[\w.-]+\.(mp4|jpg)$/, u); assert.ok(fs.existsSync(path.join(PUB, u)), `missing ${u}`); }
  const p = probe(f.url); assert.ok(p.streams.some((s: any) => s.codec_type === 'audio'), `${f.key} has sound`); assert.ok(Math.abs(Number(p.format.duration) - f.sec) < 1, `${f.key} ${f.sec} s`);
  const cap = f === X.counterOffer ? 3.4e6 : 3e6; // Preserve the approved 3.315 MB cut without another lossy encode.
  assert.ok(fs.statSync(path.join(PUB, f.url)).size <= cap, `${f.key} ≤ ${cap} B`); assert.ok(!probe(f.loop).streams.some((s: any) => s.codec_type === 'audio'), `${f.key} loop silent`); assert.ok(fs.statSync(path.join(PUB, f.loop)).size <= 1e6, `${f.key} loop < 1 MB`);
  assert.ok(f.steps.length >= 4 && f.credit.includes('MiniMax H3'), `${f.key}: How it was made and the real model`);
  assert.doesNotMatch(JSON.stringify([f.logline, f.credit, f.steps]), /\bMac\b|\blocal\b|Comfy Router|seamless|stunning|unleash/i, 'brand voice');
}
assert.equal(X.comedy.ko, '그래요?');
assert.equal(X.teaser.en, 'The Airport Run'); assert.equal(X.teaser.ko, '', 'no Korean title'); assert.ok(X.teaser.identEnd > 5 && X.teaser.identEnd < 6, 'recorded opener boundary');
assert.ok(X.teaser.credit.includes('ElevenLabs v3'), 'the voice-over model is named');
assert.equal(X.horror.en, 'LE SEPTIÈME'); assert.ok(X.horror.credit.includes('Qwen3 TTS'), 'Maman’s voice model is named'); assert.ok(X.horror.identEnd > 5 && X.horror.identEnd < 6, 'recorded opener boundary');
for (const f of [M, X.comedy, X.teaser, X.horror, X.counterOffer]) assert.ok(f.credit.includes('SyteSim × AI'), `${f.key}: the directing credit`);
const C = X.counterOffer;
assert.equal(C.identEnd, 1.25); assert.equal(C.endAt, 17.083333);
assert.ok(Math.abs(Number(probe(C.url).format.duration) - 20.096) < 0.002, 'approved revised cut, not the older 21 s version');
assert.ok(Math.abs(Number(probe(C.loop).format.duration) - 4.583333) < 0.002, 'existing spoiler-free loop');
assert.match(C.cost, /estimated \$1\.20 \/ 254 Comfy credits/); assert.match(C.cost, /Actual provider charge unavailable/);
assert.match(C.credit, /Whisper small/);
const provenance = JSON.parse(fs.readFileSync(path.join(PUB, 'examples/iiayn-films/counter-offer.provenance.json'), 'utf8'));
assert.equal(provenance.jobId, '415c2ab2'); assert.equal(provenance.route, 'comfy-cloud:cloud-h3-wf');
assert.equal(provenance.actualUsd, null); assert.equal(provenance.seed, 744799);
assert.equal(createHash('sha256').update(fs.readFileSync(path.join(PUB, C.url))).digest('hex'), provenance.delivery.sha256, 'approved media unchanged');
for (const u of [C.url, C.loop]) {
  const bytes = fs.readFileSync(path.join(PUB, u));
  assert.ok(bytes.indexOf('moov') < bytes.indexOf('mdat'), `${u}: faststart`);
  assert.doesNotMatch(JSON.stringify(probe(u).format.tags ?? {}), /creation_time|location|com\.apple|\/Users\//i, 'metadata stripped');
}
assert.doesNotMatch(JSON.stringify(provenance), /\/Users\/|\/private\/|api[_-]?key|token/i);
assert.ok(fs.existsSync(path.join(PUB, 'examples/iiayn-films/counter-offer.en.srt')));
const ui = fs.readFileSync(path.join(ROOT, 'web/src/ui/explore/ExploreFilms.tsx'), 'utf8');
assert.match(ui, /const FILMS: Feature\[\] = \[M, X\.teaser, X\.horror, X\.counterOffer, X\.lighthouse\]/, 'five playable catalogue films; IS THAT SO is not displayed');
assert.doesNotMatch(ui, /#t=|<Film preview/, 'poster selection plays the complete film, never a fragment after the ident');
assert.match(ui, /key=\{`\$\{on\.key\}:\$\{p\.watch\}`\}/, 'a fresh watch session on every poster selection, including reselect');
assert.match(ui, /setWatch\(n => n \+ 1\)/, 'only explicit poster selection advances the watch session');
assert.match(ui, /from the beginning, \$\{f\.episode\}/, 'selected poster explains its restart action; Close remains a separate button');
const L = X.lighthouse;
const { EXPLORE_SEEDANCE: SD } = await import('../src/shared/exploreShowcase.ts');
const { featuredRecreateHref, featuredByKey } = await import('../src/shared/featured.ts');
assert.equal(L.en, 'A Star to Steer By'); assert.equal(L.url, SD.strip.cut.url, 'reuse the existing finished film, no new encode');
assert.equal(L.identEnd, 0, 'no opener to skip in the existing lighthouse cut');
const lp = probe(L.url); assert.ok(Math.abs(Number(lp.format.duration) - 21.3) < 0.002);
assert.ok(lp.streams.some((s: any) => s.codec_type === 'audio'), 'existing finished soundtrack retained');
assert.deepEqual(lp.streams.find((s: any) => s.codec_type === 'video'), { codec_type: 'video', width: 1280, height: 720 });
for (const name of ['Seedance 2.0', 'Comfy Router', 'Qwen3 TTS', 'YuE2', 'Masefield (1902)', 'Einstein (1929)']) assert.ok(L.credit.includes(name), `lighthouse credit: ${name}`);
assert.match(L.cost, /\$3\.25/); assert.equal(featuredByKey(SD.strip.key)?.costUsd?.toFixed(2), '3.25', 'recorded original picture cost rounded to cents, not invented finishing spend');
assert.equal(L.editor.href, featuredRecreateHref(SD.strip.key)); assert.equal(L.make.href, SD.make.href);
assert.match(JSON.stringify(L.steps), /original generation, not a saved edit/);
for (const u of [L.poster, L.tall, L.loop]) assert.ok(fs.existsSync(path.join(PUB, u)), u);
const tall = probe(L.tall).streams.find((s: any) => s.codec_type === 'video'); assert.deepEqual([tall.width, tall.height], [360, 540], 'small 2:3 poster derivative');
const ll = probe(L.loop); assert.ok(!ll.streams.some((s: any) => s.codec_type === 'audio'), 'lighthouse hover loop is genuinely silent');
assert.ok(Number(ll.format.duration) <= 4 && fs.statSync(path.join(PUB, L.loop)).size < 300e3, 'small local derivative, not a duplicate master');
assert.match(ui, /f\.make && <Link to=\{f\.make\.href\}/, 'lighthouse Make your own route remains available beside Recreate picture');
const home = fs.readFileSync(path.join(ROOT, 'web/src/ui/Home.tsx'), 'utf8');
assert.doesNotMatch(home, /XpSeedance|#xp-seedance/, 'no standalone lighthouse mount or dead anchor');
ok('Lighthouse: existing 21.3 s film and soundtrack, truthful credits/cost, silent preview, Recreate picture and Make your own, five-film catalogue');
ok('Counter-Offer: approved ending, original job provenance, estimated cost, subtitles and five-film catalogue');
ok('four companion films: sound kept, bounded web copies, silent loops < 1 MB, posters, the real models');
