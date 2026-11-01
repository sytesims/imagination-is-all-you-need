// Explore "Made with Seedance 2.0" (2026-10-27 cinema strip; 2026-10-29 cinema frame). Covers: the media folder web/public/examples/showcase-seedance
// stays small and every file the featured entries use ships there (metadata stripped); the featured entries carry the runs as they were (jobs,
// model, route, price, length, shape); the lighthouse's finished cut and credits now live in the Films catalogue; "Silver, meet
// storm." is gone from Explore (2026-10-29); the section's links open real pages; the copy is the user's, with no machine / place jargon.
// Pure: no server, no network. Run: npx tsx test/explore-seedance.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const ok = (m: string) => console.log('ok ' + m);
const ROOT = path.resolve(import.meta.dirname, '../..'); const PUB = path.join(ROOT, 'web/public'); const DIR = path.join(PUB, 'examples/showcase-seedance');
const F = await import('../src/shared/featured.ts'); const { EXPLORE_SEEDANCE: S, EXPLORE_SHOWCASE_LINKS } = await import('../src/shared/exploreShowcase.ts');
const { featuredIdOf } = await import('../src/featuredSeed.ts');

// ---- the folder: ≤ 3 MB, every used file present
let total = 0; for (const n of fs.readdirSync(DIR)) total += fs.statSync(path.join(DIR, n)).size;
assert.ok(total <= 4.8e6, `examples/showcase-seedance stays ≤ 4.8 MB (the raw lighthouse run + its finished cut): ${total} B`);
const credit = JSON.stringify(S.strip.cut.credits); assert.ok(fs.existsSync(path.join(DIR, 'lighthouse-finished.mp4')) && S.strip.cut.picturePlace === 'Comfy Router' && /Qwen3 TTS/.test(credit) && /YuE2/.test(credit) && /Masefield \(1902\)/.test(credit) && /Einstein \(1929\)/.test(credit), 'the finished cut ships with honest credits');
const lh = F.featuredByKey(S.strip.key)!, fa = F.featuredByKey('seedance-fashion')!; assert.ok(lh && fa, 'both featured entries');
const used = [lh.out.url, lh.out.poster, fa.out.url, fa.out.poster, fa.before!.url, fa.before!.poster, String(fa.input.imageUrl), F.FEATURED_BIG_POSTER[lh.key], F.FEATURED_BIG_POSTER[fa.key]];
for (const u of used) { assert.match(u, /^\/examples\/showcase-seedance\/[\w.-]+\.(mp4|webp|jpg)$/, u); assert.ok(fs.existsSync(path.join(PUB, u)), `missing ${u}`); }
for (const u of [lh.out.url, fa.out.url]) { const tags = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags', '-of', 'json', path.join(PUB, u)]).toString();
  assert.doesNotMatch(tags, /creation_time|location|com\.apple/i, `${u}: metadata stripped`); }
ok(`folder ${(total / 1e6).toFixed(2)} MB (≤ 3 MB); every file the section uses ships there, clips metadata-stripped`);

// ---- the runs as they were (GET /api/jobs/<id> on the maintainer's app)
assert.equal(lh.jobId, '5b612365'); assert.equal(lh.model, 'Seedance 2.0'); assert.equal(lh.modelKey, 'seedance-2.0'); assert.equal(lh.route, 'comfy-router:router-seedance');
assert.equal(lh.prompt, 'A lighthouse on a cliff at dusk, waves crashing'); assert.equal(lh.prompt.split(/\s+/).length, 9, 'nine words');
assert.equal(lh.input.duration, 15); assert.equal(lh.input.resolution, '720p'); assert.deepEqual([lh.out.width, lh.out.height], [1280, 720]); assert.ok(Math.abs(lh.costUsd! - 3.25) < 0.01, 'billed $3.25 (quoted $3.27)');
assert.equal(fa.jobId, '4bb53e5b'); assert.equal(fa.route, 'comfy-router:router-seedance'); assert.equal(fa.input.duration, 5); assert.equal(fa.input.mode, 'i2v'); assert.deepEqual([fa.out.width, fa.out.height], [720, 1280], '9:16');
assert.ok(Math.abs(fa.costUsd! - 1.09) < 0.01); assert.deepEqual(fa.from, [{ jobId: 'ab863543', model: 'Qwen Image 2.1', place: 'on our computer', costUsd: 0 }], 'the still: Qwen Image 2.1, free');
assert.deepEqual(F.runByJob('ab863543'), fa.from![0]); assert.equal(F.runByJob('5b612365')?.model, 'Seedance 2.0');
for (const f of [lh, fa]) { assert.equal(F.FEATURED_SEED_IDS[f.key], featuredIdOf(f.key)); assert.equal(F.featuredRecreateHref(f.key), `/video?recreate=${featuredIdOf(f.key)}`, `${f.key}: Recreate opens Video (Seedance from the seeded job)`); }
const cuts = S.strip.shots.map((x) => x.t0); assert.deepEqual(cuts, [...cuts].sort((a, b) => a - b)); assert.ok(cuts[0] === 0 && cuts.at(-1)! < lh.out.sec!, 'shot cuts inside the clip');
ok('Lighthouse (5b612365, $3.25, 15 s, 1280×720) and fashion (4bb53e5b, $1.09, 5 s, 9:16, still ab863543 free) as they ran; Recreate opens Video');

// ---- links and copy
const links = [F.featuredRecreateHref(lh.key)!, S.make.href];
for (const u of links) { assert.match(u, /^\/video\?/, u); assert.ok(EXPLORE_SHOWCASE_LINKS().includes(u), `${u}: in the checked list`); }
assert.equal(S.make.href, '/video?model=seedance-2.0', 'Make your own: Video with Seedance 2.0 picked');
assert.equal(S.strip.title, 'A star to steer by.'); assert.equal(S.strip.line, 'Nine words became the picture. A poem, a lullaby and a final line made it a film.');
assert.ok(!('part' in S) && !('stillHref' in S), 'Silver, meet storm. is gone from Explore (user, 2026-10-29)');
for (const t of [S.strip.title, S.strip.line]) assert.doesNotMatch(t, /\bMac\b|\blocal\b|Comfy|Qwen|Seedance/i, `no jargon in the words: ${t}`);
const filmsUi = fs.readFileSync(path.join(ROOT, 'web/src/ui/explore/ExploreFilms.tsx'), 'utf8'); const home = fs.readFileSync(path.join(ROOT, 'web/src/ui/Home.tsx'), 'utf8');
assert.doesNotMatch(home, /XpSeedance|#xp-seedance/, 'no standalone lighthouse import, mount or dead footer anchor');
assert.match(home, /<XpHero \/>[\s\S]{0,200}<XpSong \/>[\s\S]{0,240}<Xp3D \/>[\s\S]{0,200}<XpFilms \/>/, 'the existing finished lighthouse is now in Films, not between the hero and 3D');
const { EXPLORE_FILMS } = await import('../src/shared/exploreShowcase.ts');
assert.equal(EXPLORE_FILMS.lighthouse.url, S.strip.cut.url, 'the existing finished cut is reused by Films');
assert.equal(EXPLORE_FILMS.lighthouse.editor.href, F.featuredRecreateHref(lh.key), 'Films Recreate preserves the original run');
assert.ok(EXPLORE_FILMS.lighthouse.credit.includes(lh.model), 'Films names the actual picture model');
assert.match(filmsUi, /const FILMS: Feature\[\] = \[[^\]]*X\.lighthouse\]/, 'the lighthouse is playable in the mounted catalogue');
assert.match(filmsUi, /data-testid="xp-films-credit">\{f\.credit\}/, 'Films renders the selected film\'s own credits');
ok('links open Video and are checked; original run and cut metadata retained, standalone section removed');
{ const film = fs.readFileSync(path.join(ROOT, 'web/src/shared/ShowcaseFilm.tsx'), 'utf8');
  assert.ok(film.includes('useDirectedSound({'), 'ShowcaseFilm registers with the sound director'); }
ok('ShowcaseFilm shares one sound at a time (shared/soundDirector.ts)');
console.log('explore-seedance: all checks passed');
