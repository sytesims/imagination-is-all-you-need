// Explore's 3D section (2026-10-27, web/src/ui/explore/Explore3D.tsx + explore3dLive.tsx, data EXPLORE_3D in shared/exploreShowcase.ts). Covers:
//  - every use is a real chain: its tools and the Tripo 3.1 model exist and are runnable (not roadmap rows), its links open real pages,
//    "coming soon" only as plain text (never a link or a button), the Recreate link is the Mockup to film's own;
//  - the media: posters ship small under web/public/showcase, Mossbun's GLB is there; the kit shelf is off the page (user, 2026-10-28);
//  - the page: Home mounts the section after "Block it in 3D", one layout (the wall), one WebGL view at a time
//    (the shared one-live-viewer slot at a low priority), nothing loaded until near the screen, posters for reduced motion / no WebGL / failures,
//    and the section never reaches into shared/previz (it imports it read-only).
// Run: npx tsx test/explore-3d.test.ts   (no server, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
const ok = (m: string) => console.log('ok ' + m);
const ROOT = path.resolve(import.meta.dirname, '../..'); const PUB = path.join(ROOT, 'web/public'); const WEB = path.join(ROOT, 'web/src');
const { EXPLORE_3D, EXPLORE_SHOWCASE_LINKS } = await import('../src/shared/exploreShowcase.ts');
const { THREE_D_WORKFLOWS, threeDModel } = await import('../src/shared/threeD.ts');
const { featuredRecreateHref, featuredByKey, featuredRuns, runByJob, FEATURED_BIG_POSTER } = await import('../src/shared/featured.ts');
const { execFileSync } = await import('node:child_process');
const { KIT } = await import('../src/shared/world/kitCatalog.ts');
const { PROP_PIECES } = await import('../src/shared/world/propCatalog.ts');

// ---- the uses: real chains, real links ----
const X = EXPLORE_3D;
assert.deepEqual(X.uses.map((u) => u.id), ['characters', 'world', 'product', 'merch'], 'four uses, in order');
const LINK = /^\/tools\/3d\?workflow=(image-to-3d|turntable|plan-a-shot)\b/;
const wf = (href: string) => new URLSearchParams(href.split('?')[1]).get('workflow');
for (const u of X.uses) {
  assert.match(u.cta.href, LINK, `${u.id}: its button opens a 3D workflow`);
  const w = THREE_D_WORKFLOWS.find((x) => x.id === wf(u.cta.href)); assert.equal(w?.status, 'ready', `${u.id}: ${wf(u.cta.href)} runs today`);
  if (u.more && !/\.glb$/.test(u.more.href)) assert.match(u.more.href, LINK, `${u.id}: its second link opens a 3D workflow`);
  assert.ok(u.chain.length === 3 && u.chain.every((c) => c.step && c.tool && c.price), `${u.id}: three steps, each with its tool and price`);
  for (const c of u.chain) if (c.model) assert.ok(c.model === 'Tripo 3.1' ? threeDModel('cloud-tripo-31')?.name === c.model : /LTX-2\.5/.test(c.model), `${u.id}: ${c.model} is a real model`);
  assert.doesNotMatch(`${u.name} ${u.line} ${u.shown}`, /higgsfield|coming soon/i, `${u.id}: no other products; nothing promised in the main copy`);
}
assert.equal(new URL(X.uses[0].cta.href, 'http://x').searchParams.get('model'), 'cloud-tripo-31', 'Make a 3D model picks Tripo 3.1, the model Mossbun was made with');
assert.equal(X.uses[1].more!.href, featuredRecreateHref('ltx-mockup-film'), 'Recreate the film: the Mockup to film run');
assert.match(X.uses[1].cta.href, /preset=open-city$/, 'Open the city: Direct a Shot on the open city');
assert.match(X.uses[2].cta.href, /workflow=turntable$/, 'product: the free turntable video');
assert.match(X.uses[3].more!.href, /^\/showcase\/char-mossbun-3d\.glb$/, 'merch: the GLB itself downloads');
assert.deepEqual(X.uses.filter((u) => u.soon).map((u) => u.id), [], 'nothing is marked coming soon (your own model as the actor shipped)');
{ const t = X.uses[1].try!; assert.ok(t, 'the city invites you to put your own model in it');
  assert.match(t.href, /^\/tools\/3d\?workflow=plan-a-shot&preset=open-city&useModel=mossbun$/, 'Try it: Direct a Shot on the open city, with Mossbun placed for you (myModels.ts choiceById)');
  assert.doesNotMatch(t.line, /soon|higgsfield/i, 'a true line'); assert.ok(EXPLORE_SHOWCASE_LINKS().includes(t.href), 'its link is in the checked list');
  assert.ok(X.mossbun.url === '/showcase/char-mossbun-3d.glb', 'the example Mossbun the link places is the shipped GLB'); }
for (const u of EXPLORE_SHOWCASE_LINKS()) assert.match(u, /^\/(tools\/(h3-video|3d|audio|create-image)|canvas|workflows|film)\b/, `showcase link opens a real page: ${u}`);
assert.ok(!('shelf' in X), 'the kit shelf is off the page (user, 2026-10-28): no shelf data left');
ok('four uses, each a real chain (Tripo 3.1 image to 3D, the free turntable, Direct a Shot + Layout to Render, the GLB), links open real tools');

// ---- media: small posters, the GLB, real kit pieces ----
const size = (u: string) => { const p = path.join(PUB, u); assert.ok(fs.existsSync(p), `missing ${u}`); return fs.statSync(p).size; };
let posters = 0; for (const u of X.uses.map((x) => x.poster)) { assert.match(u, /^\/showcase\/x3d-[\w-]+\.webp$/); const b = size(u); assert.ok(b < 120_000, `${u}: ${b} B`); posters += b; }
assert.ok(posters < 400_000, `the section's own posters stay small: ${posters} B`);
assert.ok(size(X.mossbun.url) < 3.6e6, 'Mossbun\'s web GLB');
assert.ok(KIT['wb.bottle'] || PROP_PIECES['wb.bottle'], 'the product bottle is a kit piece');
assert.ok(!fs.existsSync(path.join(PUB, 'showcase/x3d-shelf.webp')), 'the shelf poster is gone with it');
for (const f of ['models/open-city/open-city.glb', 'models/kits/props.glb', 'models/kits/bottle.glb', 'models/kits/LICENSE.txt', 'models/open-city/LICENSE.txt']) assert.ok(fs.existsSync(path.join(PUB, f)), f);
assert.match(X.credit, /CC0/, 'the kits\' licence is named');
ok(`posters ${(posters / 1000).toFixed(0)} KB in all (each < 120 KB), Mossbun's GLB, the CC0 kits credited`);

// ---- the hero film: Mossbun, picture → 3D model → city → film (every run real, read from the featured entry) ----
{ const H = X.hero; const f = featuredByKey(H.key)!; assert.ok(f, 'the hero film is a featured entry');
  assert.deepEqual([f.jobId, f.model, f.modelKey, f.provider, f.route, f.costUsd, f.input.mode, f.input.duration, f.input.resolution, f.input.audio], ['a11a0c78', 'LTX-2.5 Pro', 'ltx-2.5-pro', 'router-ltx-25-pro', 'comfy-cloud:cloud-ltx25-pro-api', 1.46, 'i2v', 6, '1080p', true], 'the film as it ran: LTX-2.5 Pro image to video on Comfy Cloud, 6 s, 1080p, sound, $1.46');
  assert.deepEqual(featuredRuns(f).map((r) => r.jobId), ['9564386e', '092abb03', '13aca5cc', 'ea410812', 'b688b9c3', 'a11a0c78'], 'every run behind it, oldest first');
  assert.deepEqual(H.steps.map((s) => s.step), ['Picture', '3D model', 'City', 'Film'], 'four steps, in order');
  assert.deepEqual(H.steps.flatMap((s) => s.jobs), featuredRuns(f).map((r) => r.jobId), 'the steps name every run once, nothing else');
  assert.deepEqual(H.steps[2].jobs.map(j => H.steps[2].jobRoles?.[j].role), ['Browser capture', 'First-frame paint', 'Golden-hour edit'], 'the city separates the browser activity from the two real image models');
  assert.equal(H.steps[2].jobRoles?.['13aca5cc'].tool, 'Direct a Shot', 'browser mockup is presented as a tool, not an ML model');
  for (const s of H.steps) for (const [j, role] of Object.entries(s.jobRoles ?? {})) {
    assert.ok(s.jobs.includes(j) && role.role, 'presentation roles refer only to the existing historical jobs');
    assert.deepEqual(Object.keys(role).sort(), j === '13aca5cc' ? ['role', 'tool'] : ['role'], 'no duplicated model, price or provider metadata');
  }
  assert.match(X.line, /recorded demo/); assert.doesNotMatch(X.line, /everything is live/);
  for (const s of H.steps) for (const j of s.jobs) { const r = runByJob(j); assert.ok(r && r.model && r.place, `${s.step}: run ${j} names its model and place (runByJob)`); }
  assert.equal(runByJob('9564386e')!.costUsd, featuredByKey('sheet-mossbun')!.costUsd, 'the sheet\'s price is the sheet entry\'s own');
  assert.equal(runByJob('092abb03')!.costUsd, X.mossbun.usd, 'the 3D model\'s price is the one the wall shows');
  assert.equal(featuredRecreateHref(H.key), '/tools/h3-video?recreate=50c0d92b', 'Recreate this shot opens Video with the prompt and the painted frame');
  assert.equal(f.input.imageUrl, f.before!.url, 'the frame Recreate attaches is the painted city frame the run started from');
  assert.match(H.make.href, /^\/tools\/3d\?workflow=image-to-3d&model=cloud-tripo-31$/, 'Make your own: 3D › Image to 3D on Tripo 3.1');
  assert.ok(EXPLORE_SHOWCASE_LINKS().includes(H.make.href) && EXPLORE_SHOWCASE_LINKS().includes(featuredRecreateHref(H.key)!), 'its links are in the checked list');
  assert.match(H.honest, /image to video/i, 'says plainly the film starts from the painted frame'); assert.match(H.honest, /Layout to Render/, '...and that Layout to Render follows the camera'); assert.equal(H.honestLink.href, '#xp-film');
  /* the media: its own folder (web/public/showcase is at its cap), small, metadata stripped, with sound */
  const DIR = path.join(PUB, 'examples/showcase-3d'); let total = 0; for (const n of fs.readdirSync(DIR)) total += fs.statSync(path.join(DIR, n)).size;
  assert.ok(total < 3e6, `examples/showcase-3d stays under 3 MB: ${total} B`);
  for (const u of [f.out.url, f.out.poster, f.before!.url, f.before!.poster, FEATURED_BIG_POSTER[H.key], ...H.steps.flatMap((s) => [s.thumb, s.thumb2 ?? s.thumb])]) assert.ok(fs.existsSync(path.join(PUB, u)), `missing ${u}`);
  const film = path.join(PUB, f.out.url); assert.match(f.out.url, /^\/examples\/showcase-3d\//); assert.ok(fs.statSync(film).size <= 2.5e6, `the film ≤ 2.5 MB: ${fs.statSync(film).size} B`);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,profile,width,height:format_tags', '-of', 'json', film]).toString());
  assert.deepEqual(probe.streams.map((x: any) => x.codec_name), ['h264', 'aac'], 'H.264 + AAC'); assert.equal(probe.streams[0].profile, 'High'); assert.deepEqual([probe.streams[0].width, probe.streams[0].height], [1920, 1080]);
  assert.doesNotMatch(JSON.stringify(probe.format?.tags ?? {}), /creation_time|location|com\.apple/i, 'metadata stripped');
  assert.ok(fs.statSync(path.join(PUB, FEATURED_BIG_POSTER[H.key])).size < 1.5e5, 'the big poster < 150 KB'); for (const u of [f.out.poster, f.before!.poster, H.steps[2].thumb]) assert.ok(fs.statSync(path.join(PUB, u)).size < 4e4, `${u} < 40 KB`);
  const jpg = fs.readFileSync(path.join(PUB, f.before!.url)); assert.ok(jpg.length <= 250_000 && !jpg.includes('Exif'), 'the start frame: ≤ 250 KB, no EXIF');
  ok(`hero film: 4 steps / ${featuredRuns(f).length} real runs from the featured entry, Recreate + Make your own, the film ${(fs.statSync(film).size / 1e6).toFixed(2)} MB, folder ${(total / 1e6).toFixed(2)} MB`); }

// ---- the page ----
const home = fs.readFileSync(path.join(WEB, 'ui/Home.tsx'), 'utf8');
assert.match(home, /<XpHero \/>[\s\S]{0,200}<Xp3D \/>[\s\S]{0,200}<XpFilms \/>/, '3D follows the hero; the lighthouse is now in Films (user, 2026-10-29)');
const sec = fs.readFileSync(path.join(WEB, 'ui/explore/Explore3D.tsx'), 'utf8');
assert.match(sec, /usd\(f\.costUsd \?\? 0, f\.costEstimated\)/, 'film chip marks historical estimates as estimates');
assert.match(sec, /credit\?\.tool \?\? r\.model/, 'real model names still come from featured runs');
assert.match(sec, /r\.place === OUR_COMPUTER \? 'Created locally' : r\.place/, 'historical local execution is not a promise about the current computer');
assert.match(sec, /<HeroFilm \/>\s*<p className="x3-credit">/, 'only the hero film (the live tiles and the shelf are off the page, user 2026-10-28)');
assert.ok(!fs.existsSync(path.join(WEB, 'ui/explore/explore3dLive.tsx')), 'no live views left in the section');
assert.match(sec, /<ShowcaseFilm\b[^\n]*restartOnSound/, 'the film is the shared ShowcaseFilm (plays muted on screen, shared SoundToggle, poster first, reduced motion = poster)');
assert.doesNotMatch(sec.slice(sec.indexOf('function HeroFilm'), sec.indexOf('export function Xp3D')), /useX3dTurn|Model3D|<Live\b/, 'the hero is a video: it takes no WebGL view'); assert.doesNotMatch(sec, /x3d=|useSearch|Studio|Showroom/, 'one layout: no switch left');
assert.doesNotMatch(sec + fs.readFileSync(path.join(WEB, 'ui/explore/explore3d.css'), 'utf8'), /x3b-shelf|x3-tile-shelf|x3-shelf-cta|SHELF_POSTER|x3-tip/, 'the kit shelf tile, its poster and its styles are gone');
/* Mossbun lives in the city (mossbunCity.ts): Direct a Shot's own loader and hop, reused read-only; pure in t; the city runs without him if his file fails */
const moss = fs.readFileSync(path.join(WEB, 'ui/explore/mossbunCity.ts'), 'utf8');
assert.match(moss, /import \{ loadUserModel \} from '\.\.\/\.\.\/shared\/previz\/userModels'/, 'his GLB comes through Direct a Shot\'s loader (checked, normalised, cached)');
assert.match(moss, /modelMotionAt\('hop'/, '...and hops with Direct a Shot\'s hop'); assert.match(moss, /startHeight\(L\.fw, 'open-city'\)/, '...at the height Direct a Shot gives him in the city');
assert.doesNotMatch(moss, /Math\.random|performance\.now|Date\.now/, 'his day is a pure function of t');
assert.match(moss, /\.clone\(\); mats\.push\(m\)/, 'the ear bend goes on our own copy of his material (the cached one stays Direct a Shot\'s)');
for (const f of ['Explore3D.tsx', 'mossbunCity.ts']) assert.doesNotMatch(fs.readFileSync(path.join(WEB, 'ui/explore', f), 'utf8'), /setCityQuality|setCityCrowd|localStorage\.setItem/, `${f}: never changes Direct a Shot's own settings`);
assert.match(fs.readFileSync(path.join(WEB, 'ui/explore/explore3d.css'), 'utf8'), /prefers-reduced-motion:reduce/, 'reduced motion in the styles too');
ok('Home mounts it after Mockup to film; only the hero film; Mossbun\'s city code stays for Direct a Shot; posters for reduced motion / no WebGL / failures');
