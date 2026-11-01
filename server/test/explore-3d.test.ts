// Explore's 3D section, "Create your character. Bring it to life." (rebuilt 2026-10-31, web/src/ui/explore/Explore3D.tsx, data EXPLORE_3D in shared/exploreShowcase.ts). Covers:
//  - one headline in the chapter style, the finished film big with the shared player (controls, sound) and nothing over it;
//  - four steps, each one model and one price read from the featured runs; the city shows the frame the film starts from, the capture as a small
//    "before", the other two tools in a tip; the 3D card turns the shipped GLB with the shared Model3D (lowest priority, on screen only);
//  - one bottom row: the chain's price, Recreate, Make your own and a Credits tip that names the CC0 kits;
//  - the media: small, metadata stripped, the film H.264 + AAC; Mossbun's city code stays for Direct a Shot.
// Run: npx tsx test/explore-3d.test.ts   (no server, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
const ok = (m: string) => console.log('ok ' + m);
const ROOT = path.resolve(import.meta.dirname, '../..'); const PUB = path.join(ROOT, 'web/public'); const WEB = path.join(ROOT, 'web/src');
const { EXPLORE_3D, EXPLORE_SHOWCASE_LINKS } = await import('../src/shared/exploreShowcase.ts');
const { featuredRecreateHref, featuredByKey, featuredRuns, runByJob, FEATURED_BIG_POSTER } = await import('../src/shared/featured.ts');
const { execFileSync } = await import('node:child_process');
const X = EXPLORE_3D;
const size = (u: string) => { const p = path.join(PUB, u); assert.ok(fs.existsSync(p), `missing ${u}`); return fs.statSync(p).size; };

// ---- the data: one story, four steps, every run real ----
{ const f = featuredByKey(X.key)!; assert.ok(f, 'the film is a featured entry');
  assert.deepEqual(X.title, ['Create your character.', 'Bring it to life.']); assert.ok(!('eyebrow' in X) && !('uses' in X) && !('hero' in X), 'one headline, no eyebrow, no leftover data');
  assert.doesNotMatch(X.line, /recorded demo|Layout to Render/i, 'the line tells the story, nothing else');
  assert.deepEqual([f.jobId, f.model, f.modelKey, f.provider, f.route, f.costUsd, f.input.mode, f.input.duration, f.input.resolution, f.input.audio], ['a11a0c78', 'LTX-2.5 Pro', 'ltx-2.5-pro', 'router-ltx-25-pro', 'comfy-cloud:cloud-ltx25-pro-api', 1.46, 'i2v', 6, '1080p', true], 'the film as it ran: LTX-2.5 Pro image to video on Comfy Cloud, 6 s, 1080p, sound, $1.46');
  assert.deepEqual(featuredRuns(f).map((r) => r.jobId), ['9564386e', '092abb03', '13aca5cc', 'ea410812', 'b688b9c3', 'a11a0c78'], 'every run behind it, oldest first');
  assert.deepEqual(X.steps.map((s) => s.step), ['Design it', 'Spin it in 3D', 'Place it', 'Film it'], 'four steps as actions, in order');
  assert.deepEqual(X.steps.flatMap((s) => [...(s.tools ?? []).map((t) => t.job), s.job]).sort(), featuredRuns(f).map((r) => r.jobId).sort(), 'the steps name every run once, nothing else');
  assert.deepEqual(X.steps.map((s) => runByJob(s.job)?.model), ['GPT Image 2.5 Flare', 'Tripo 3.1', 'GPT Image 2.5 Flare', 'LTX-2.5 Pro'], 'one model per card, from the runs');
  const total = featuredRuns(f).reduce((n, r) => n + r.costUsd, 0); assert.equal(total.toFixed(2), '1.79', 'the whole chain: about $1.79');
  const city = X.steps[2]; assert.equal(city.thumb, f.before!.poster, 'the City card shows the painted frame the film starts from (its poster)');
  assert.equal(f.input.imageUrl, f.before!.url, '...the same frame the film run started from');
  assert.match(city.before!, /mossbun-city-mockup-480\.webp$/, 'the grey capture is the small before');
  assert.deepEqual(city.tools!.map((t) => [t.job, runByJob(t.job)?.costUsd]), [['13aca5cc', 0], ['ea410812', 0]], 'the two other tools, both free');
  assert.equal(city.tools![0].tool, 'Direct a Shot', 'the browser capture is a tool, not a model');
  assert.equal(X.steps[1].spin, X.mossbun.url, 'the 3D card turns the shipped GLB'); assert.ok(size(X.mossbun.url) < 3.6e6, 'Mossbun\'s web GLB');
  assert.equal(runByJob('092abb03')!.costUsd, X.mossbun.usd, 'the 3D model\'s price is the run\'s');
  assert.equal(featuredRecreateHref(X.key), '/video?recreate=50c0d92b', 'Recreate this shot opens Video with the prompt and the painted frame');
  assert.match(X.make.href, /^\/3d\?workflow=image-to-3d&model=cloud-tripo-31$/, 'Make your own: 3D › Image to 3D on Tripo 3.1');
  assert.ok(EXPLORE_SHOWCASE_LINKS().includes(X.make.href) && EXPLORE_SHOWCASE_LINKS().includes(featuredRecreateHref(X.key)!), 'its links are in the checked list');
  for (const u of EXPLORE_SHOWCASE_LINKS()) assert.match(u, /^\/(video|3d|audio|image|canvas|workflows|film)\b/, `showcase link opens a real page: ${u}`);
  assert.match(X.credit, /KayKit by Kay Lousberg and Kenney, CC0/, 'the CC0 kits are credited'); assert.match(X.credit, /Tripo 3\.1/, '...and Mossbun');
  for (const f2 of ['models/open-city/open-city.glb', 'models/kits/LICENSE.txt', 'models/open-city/LICENSE.txt']) assert.ok(fs.existsSync(path.join(PUB, f2)), f2);
  for (const u of ['showcase/x3d-bottle.webp', 'showcase/x3d-clay.webp', 'showcase/x3d-shelf.webp']) assert.ok(!fs.existsSync(path.join(PUB, u)), `${u}: gone with the old tiles`);
  ok('one headline, four steps from the six real runs, the painted frame on the City card, about $1.79, CC0 credit'); }

// ---- the media: its own folder, small, metadata stripped, with sound ----
{ const f = featuredByKey(X.key)!;
  /* the media: its own folder (web/public/showcase is at its cap), small, metadata stripped, with sound */
  const DIR = path.join(PUB, 'examples/showcase-3d'); let total = 0; for (const n of fs.readdirSync(DIR)) total += fs.statSync(path.join(DIR, n)).size;
  assert.ok(total < 3e6, `examples/showcase-3d stays under 3 MB: ${total} B`);
  for (const u of [f.out.url, f.out.poster, f.before!.url, f.before!.poster, FEATURED_BIG_POSTER[X.key], ...X.steps.flatMap((s) => [s.thumb, s.before ?? s.thumb])]) assert.ok(fs.existsSync(path.join(PUB, u)), `missing ${u}`);
  const film = path.join(PUB, f.out.url); assert.match(f.out.url, /^\/examples\/showcase-3d\//); assert.ok(fs.statSync(film).size <= 2.5e6, `the film ≤ 2.5 MB: ${fs.statSync(film).size} B`);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,profile,width,height:format_tags', '-of', 'json', film]).toString());
  assert.deepEqual(probe.streams.map((x: any) => x.codec_name), ['h264', 'aac'], 'H.264 + AAC'); assert.equal(probe.streams[0].profile, 'High'); assert.deepEqual([probe.streams[0].width, probe.streams[0].height], [1920, 1080]);
  assert.doesNotMatch(JSON.stringify(probe.format?.tags ?? {}), /creation_time|location|com\.apple/i, 'metadata stripped');
  assert.ok(fs.statSync(path.join(PUB, FEATURED_BIG_POSTER[X.key])).size < 1.5e5, 'the big poster < 150 KB'); for (const u of [f.out.poster, f.before!.poster, X.steps[2].thumb]) assert.ok(fs.statSync(path.join(PUB, u)).size < 4e4, `${u} < 40 KB`);
  const jpg = fs.readFileSync(path.join(PUB, f.before!.url)); assert.ok(jpg.length <= 250_000 && !jpg.includes('Exif'), 'the start frame: ≤ 250 KB, no EXIF');
  ok(`the film ${(fs.statSync(film).size / 1e6).toFixed(2)} MB, folder ${(total / 1e6).toFixed(2)} MB`); }

// ---- the page ----
const home = fs.readFileSync(path.join(WEB, 'ui/Home.tsx'), 'utf8');
assert.match(home, /<XpHero \/>\s*(?:\{\/\*[^*]*\*\/\}\s*)?<div className="xp-in">\s*<Xp3D \/>\s*<XpStill \/>[\s\S]*<XpFilms \/>/, '3D is the first section under the hero (user, 2026-11-02); the lighthouse is now in Films (user, 2026-10-29)');
const sec = fs.readFileSync(path.join(WEB, 'ui/explore/Explore3D.tsx'), 'utf8'); const css = fs.readFileSync(path.join(WEB, 'ui/explore/explore3d.css'), 'utf8');
assert.match(sec, /<h2 id="xp-h-x3d" className="xps-h xsdc-h">/, 'the headline is the chapter style (#xp-swap\'s classes)');
assert.match(sec, /<ShowcaseFilm\b[^\n]*controls restartOnSound[\s\S]{0,240}\/>/, 'the film is the shared ShowcaseFilm with its on-brand controls and sound');
assert.doesNotMatch(sec, /<ShowcaseFilm[^>]*>\s*<(h3|p|span)/, 'nothing over the film (no overlay, no chips)');
assert.doesNotMatch(sec, /Layout to Render|xv-eb|x3h-|honest/, 'no camera footnote, no eyebrow, no old hero classes');
assert.match(sec, /<Model3D src=\{s\.spin!\}[^\n]*pri=\{0\}[^\n]*controls=\{false\}/, 'the 3D card: the shared Model3D at the lowest priority, no drag');
assert.match(sec, /prefersReducedMotion\(\)[^\n]*IntersectionObserver[^\n]*hasWebGL\(\)/, '...only on screen, never under reduced motion or without WebGL (the still stays)');
assert.match(sec, /\{\.\.\.tip\(X\.credit\)\}/, 'the credits sit in the shared tooltip on the bottom row');
assert.doesNotMatch(css, /x3b|x3h|x3-live|x3-film-cap|x3-chain/, 'the old wall, hero and chain styles are gone');
assert.match(css, /prefers-reduced-motion:reduce/, 'reduced motion in the styles too');
assert.ok(!fs.existsSync(path.join(WEB, 'ui/explore/explore3dLive.tsx')), 'no live views left in the section');
/* Mossbun lives in the city (mossbunCity.ts): Direct a Shot's own loader and hop, reused read-only; pure in t; the city runs without him if his file fails */
const moss = fs.readFileSync(path.join(WEB, 'ui/explore/mossbunCity.ts'), 'utf8');
assert.match(moss, /import \{ loadUserModel \} from '\.\.\/\.\.\/shared\/previz\/userModels'/, 'his GLB comes through Direct a Shot\'s loader (checked, normalised, cached)');
assert.match(moss, /modelMotionAt\('hop'/, '...and hops with Direct a Shot\'s hop'); assert.match(moss, /startHeight\(L\.fw, 'open-city'\)/, '...at the height Direct a Shot gives him in the city');
assert.doesNotMatch(moss, /Math\.random|performance\.now|Date\.now/, 'his day is a pure function of t');
assert.match(moss, /\.clone\(\); mats\.push\(m\)/, 'the ear bend goes on our own copy of his material (the cached one stays Direct a Shot\'s)');
for (const f of ['Explore3D.tsx', 'mossbunCity.ts']) assert.doesNotMatch(fs.readFileSync(path.join(WEB, 'ui/explore', f), 'utf8'), /setCityQuality|setCityCrowd|localStorage\.setItem/, `${f}: never changes Direct a Shot's own settings`);
ok('Home mounts it after the hero; chapter headline, the shared player, the spin, the credits tip; Mossbun\'s city code stays for Direct a Shot');
