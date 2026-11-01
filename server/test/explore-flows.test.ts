// Explore + Featured (2026-10-26, replaces examples-shelf.test.ts). Covers:
//  - shared/featured.ts: unique keys, every file ships small under web/public/showcase, the seed ids match featuredIdOf, Recreate links;
//  - shared/exploreFlows.ts: every card opens a real tool page, names a model the tool offers, and a featured card's media exists; no
//    "coming soon" wording; the hero takes are Direct a Shot Mockup → Render pairs;
//  - the server: featured seeds are listed by GET /api/jobs?featured=1 (tagged example, never in your own list), POST /api/jobs/:id/feature
//    stars your own result, Recreate of a seeded clip re-attaches its frames, and a sample run is a real clip / still at the asked shape;
//  - the web: the Examples shelf is gone and every tab mounts the Featured feed.
// Run: npx tsx test/explore-flows.test.ts   (own mock server, temp data dir, no keys, no network)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ok = (m: string) => console.log('ok ' + m);
const ROOT = path.resolve(import.meta.dirname, '../..'); const PUB = path.join(ROOT, 'web/public'); const WEB = path.join(ROOT, 'web/src');
const { FEATURED, FEATURED_VIDEO, FEATURED_STARTER_VIDEO, FEATURED_AUDIO, FEATURED_SEED_IDS, FEATURED_BIG_POSTER, STARTER, featuredRecreateHref, SAMPLE_CLIPS, SAMPLE_STILLS } = await import('../src/shared/featured.ts');
const { EXPLORE_ROWS, EXPLORE_CARDS, EXPLORE_HERO } = await import('../src/shared/exploreFlows.ts');
const { featuredIdOf } = await import('../src/featuredSeed.ts');
const { getTool } = await import('../src/tools/registry.ts');

// ---- featured catalogue ----
assert.equal(new Set(FEATURED.map((f) => f.key)).size, FEATURED.length, 'unique keys');
const file = (u: string, max = 1.5e6) => { assert.match(u, /^\/(showcase|examples\/(showcase-(3d|seedance)|starter))\/[\w.-]+\.(webp|jpe?g|mp4|mp3)$/, `${u}: a shipped showcase file`); const p = path.join(PUB, u); assert.ok(fs.existsSync(p), `missing ${u}`); assert.ok(fs.statSync(p).size < max, `${u}: small`); return p; };
// (Explore 3D's hero film, 'mossbun-golden-hour', ships in web/public/examples/showcase-3d: ≤ 2.5 MB, checked in explore-3d.test.ts; the Seedance
//  section's clips in web/public/examples/showcase-seedance: ≤ 3 MB in all, checked in explore-seedance.test.ts)
// the Explore hero is a 10 s 720p clip with sound, shown full-bleed: it may be up to 4 MB (kept sharp); every other clip stays under 1.5 MB
const HERO_MAX = 4e6; const BIG = new Set(['h3-glass-whale', 'ltx-pro-painter', 'kling-dance-swap', 'h3-koi-take', 'ltx-pro-whale-glide', 'ltx-pro-whale-dive', 'ltx-mockup-film', 'h3-kdrama-script', 'mossbun-golden-hour']); // the Mockup to film first shot (≤ 3 MB, checked below), the hero, the dance swap upscaled to 1080p, the 20 s koi take (Explore's letterbox), the two "From one still" takes (≤ 3 MB, checked below)
// three 10 s 720p LTX-2.5 Pro featured clips with sound (grass, rain, confetti) may be up to 2.5 MB each so they stay sharp
const LTX_ROW_MAX = 2.5e6; const LTX_ROW = new Set(['ltx-pro-fox', 'ltx-pro-koi']);
// the starter pack's new picks (2026-10-28, web/public/examples/starter): clips up to 3.2 MB each (the 15 s 1080p upscale is 3.1 MB; a smaller copy would
// undo the upscale), the whole folder under 21 MB (checked below)
const STARTER_MAX = 3.2e6; const isStarterFile = (u: string) => u.startsWith('/examples/starter/');
const maxOf = (k: string) => (BIG.has(k) ? HERO_MAX : LTX_ROW.has(k) ? LTX_ROW_MAX : isStarterFile(FEATURED.find((f) => f.key === k)?.out.url ?? '') ? STARTER_MAX : undefined);
for (const f of FEATURED) { file(f.out.url, maxOf(f.key)); if (f.tab === 'audio') assert.equal(f.out.poster, '', `${f.key}: a sound draws its own cover`); else file(f.out.poster); if (f.before) { file(f.before.url); file(f.before.poster); } if (f.end) { file(f.end.url); file(f.end.poster); }
  for (const k of ['imageUrl', 'lastFrameUrl']) if (f.tab !== 'image' && typeof f.input[k] === 'string') { assert.match(String(f.input[k]), /\.(jpe?g|png)$/, `${f.key}.${k}: a JPG/PNG the bar accepts`); file(String(f.input[k])); }
  assert.ok(getTool(f.toolId), `${f.key}: ${f.toolId} is a real tool`); assert.ok(['local', 'comfy-cloud'].includes(f.runOn), `${f.key}: runOn`);
  if (f.runOn !== 'local') { assert.ok((f.costUsd ?? 0) > 0, `${f.key}: a cloud run names its real cost`); assert.match(f.route ?? '', /^comfy-(router|cloud):/, `${f.key}: its cloud route`); } }
for (const f of [...FEATURED_STARTER_VIDEO, ...FEATURED_VIDEO, ...FEATURED_AUDIO]) { const p = file(f.out.url, maxOf(f.key)); const tags = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags', '-of', 'json', p]).toString();
  assert.doesNotMatch(tags, /creation_time|location|com\.apple/i, `${f.key}: metadata stripped`); assert.equal(f.out.sound, true, `${f.key}: LTX-2.5 clips carry sound`); }
{ // the starter pack (user's picks, 2026-10-28): what each tab opens with; Explore-only entries stay for Explore but no tab lists them
  const keys = (t: string) => STARTER.filter((f) => f.tab === t || f.alsoOn?.includes(t as any)).map((f) => f.key);
  assert.equal(STARTER.filter((f) => f.tab === 'image').length, 26, 'Image: 6 new + 20 kept'); assert.equal(STARTER.filter((f) => f.tab === 'audio').length, 6, 'Audio: 6 sounds');
  assert.deepEqual(keys('3d'), ['mossbun-mockup-film', 'ltx-mockup-film'], '3D: the two Mockup to Film takes');
  assert.deepEqual(keys('3d'), STARTER.filter((f) => f.toolId === 'make-it-real').map((f) => f.key), '3D lists exactly the Direct a Shot takes (its tab shows make-it-real results)');
  assert.deepEqual(keys('video').includes('mossbun-golden-hour') && !keys('3d').includes('mossbun-golden-hour'), true, 'Mossbun at golden hour: a Video pick (Explore 3D shows it by key, not as a 3D example)');
  assert.equal(STARTER.filter((f) => /\.mp4$/.test(f.out.url)).length, 20, 'Video: 7 new (with the Mossbun take) + 12 kept + Mockup to Film');
  for (const k of ['ltx-christmas-take', 'ltx-street-take', 'ltx-fox-meadow-close', 'ltx-rain-city', 'ltx-lighthouse', 'ltx-village-loop', 'ltx-morph', 'seedance-fashion', 'sc-0f1a0117', 'sc-fad0bbe6', 'sc-d3c80885',
    'sc-016bdc27', 'sc-973c88f8', 'sc-31465e96', 'sc-b718e875', 'sc-f7699cd4', 'sc-7205edb3', 'sc-fa96f109']) { assert.ok(FEATURED.some((f) => f.key === k), `${k}: Explore still shows it`); assert.ok(!STARTER.some((f) => f.key === k), `${k}: out of the starter pack`); }
  for (const k of ['ltx-pro-duet', 'sc-c0ce448f', 'sc-baed513e', 'sc-e774ad5c']) assert.ok(!FEATURED.some((f) => f.key === k), `${k}: removed`);
  for (const f of FEATURED_AUDIO) { assert.match(f.out.url, /^\/examples\/starter\/[\w-]+\.mp3$/); assert.match(featuredRecreateHref(f.key)!, /^\/audio\?workflow=(music|sfx)&recreate=[0-9a-f]{8}$/, `${f.key}: Recreate opens Audio`); }
  assert.equal(featuredRecreateHref('presenter-talk'), '/video?workflow=lip-sync&mode=lipsync&recreate=af93a883', 'Lip Sync (its workflow link carries the mode)');
  assert.equal(featuredRecreateHref('bus-stop-sharp'), '/video?workflow=upscale&recreate=d47db426', 'Video Upscale');
  assert.equal(featuredRecreateHref('h3-fox-extend'), '/video?workflow=extend&recreate=0f0707ea', 'Extend');
  assert.match(featuredRecreateHref('mossbun-mockup-film')!, /^\/3d\?workflow=plan-a-shot&preset=open-city&realPrompt=/, 'Direct a Shot');
  const dir = path.join(PUB, 'examples/starter'); let total = 0; for (const n of fs.readdirSync(dir)) { total += fs.statSync(path.join(dir, n)).size; if (/\.webp$|\.jpg$/.test(n)) assert.ok(!fs.readFileSync(path.join(dir, n)).includes('Exif'), `${n}: no EXIF`); }
  assert.ok(total < 21e6, `starter folder ${total} B (< 21 MB)`); }
for (const [k, id] of Object.entries(FEATURED_SEED_IDS)) assert.equal(featuredIdOf(k), id, `${k}: seed id`);
assert.match(featuredRecreateHref('ltx-village-loop', { loop: '1' })!, /^\/video\?recreate=e29ad72e&loop=1$/);
assert.match(featuredRecreateHref('ltx-morph')!, /^\/video\?workflow=transitions&recreate=a3c693af$/);
for (const [k, id] of [['ltx-fox-meadow', '7964e9db'], ['ltx-fox-meadow-close', '4781fc98']]) { const f = FEATURED.find((x) => x.key === k)!;
  assert.equal(featuredRecreateHref(k), `/video?recreate=${id}`, `${k}: Try this prompt opens Video`); assert.equal(f.modelKey, 'ltx-2.5-22b'); assert.match(f.prompt, /fox/); }
/* Explore's four acts (user, 2026-11-02): each section mounted once, in this order */
const EXPLORE_ORDER = ['XpHero', 'Xp3D', 'XpStill', 'XpSheets', 'XpKoi', 'XpSong', /* act 2 */ 'XpFilm', 'XpSwap', 'XpLooks', 'XpPresenter', /* act 3 */ 'XpWork', 'XpLayers', /* act 4 */ 'XpBoard', 'XpFilms', 'XpYourTurn'];
{ const home = fs.readFileSync(path.join(WEB, 'ui/Home.tsx'), 'utf8'); const at = EXPLORE_ORDER.map((n) => { const m = [...home.matchAll(new RegExp(`<${n} />`, 'g'))]; assert.equal(m.length, 1, `${n} is mounted once`); return m[0].index!; });
  at.forEach((x, k) => k && assert.ok(x > at[k - 1], `${EXPLORE_ORDER[k]} follows ${EXPLORE_ORDER[k - 1]}`));
  assert.match(home, /<\/footer>\s*<\/div>;\s*\}\s*$/, 'the footer closes the page'); assert.doesNotMatch(home, /XpTrending|XpSeedance/, 'no Trends, no standalone lighthouse'); }
{ const xs = fs.readFileSync(path.join(WEB, 'ui/explore/ExploreShowcase.tsx'), 'utf8'); const hero = xs.slice(xs.indexOf('export function heroChip'), xs.indexOf('/* ===', xs.indexOf('export function XpHero')));
  assert.match(hero, /<ShowcaseFilm\b[\s\S]*xp-headline[\s\S]*<HeroCredit /, 'the header plays the hero clip under its headline, line and credit');
  assert.doesNotMatch(hero, /xph-quick|xph-make|xp-quick|EXPLORE_QUICK/, 'no quick links on the hero (2026-10-28)');
  assert.match(hero, /<RunChip onMedia c=\{heroChip\(s, f\)\}/, 'the shared run chip: model · where it ran · price (2026-11-01, was the MADE WITH · LENGTH · RAN ON block)');
  assert.match(hero, /data-testid="xp-hero-recreate">Make your own <Arrow \/>/, 'one action: Make your own'); }
{ const xs = fs.readFileSync(path.join(WEB, 'ui/explore/ExploreShowcase.tsx'), 'utf8');
  assert.doesNotMatch(xs, /MakeBox|xp-make|queueGenerate|What do you want to make/, 'no prompt box or Generate in the hero');
  assert.ok(!fs.existsSync(path.join(WEB, 'shared/queuedGenerate.tsx')), 'queued Generate (prompt box only) removed'); }
assert.match(featuredRecreateHref('ltx-christmas-take')!, /^\/3d\?workflow=plan-a-shot&preset=diorama&realPrompt=/);
for (const c of SAMPLE_CLIPS) file(`/${c}`); for (const s of SAMPLE_STILLS) file(`/${s}`);
ok(`${FEATURED.length} featured generations: files ship small, metadata stripped, seed ids and Recreate links right`);

// ---- Explore rows ----
assert.equal(EXPLORE_ROWS[0].id, 'video'); assert.deepEqual(EXPLORE_ROWS.map((r) => r.title), ['Make a video', 'Direct a Shot', 'Swap a character', 'New angle', 'Loop & Morph', 'Exploded view & effects', 'Viral templates', 'Make music & make it talk', '3D', 'Agents']);
assert.equal(new Set(EXPLORE_CARDS.map((c) => c.id)).size, EXPLORE_CARDS.length, 'unique card ids');
const PAGES = /^\/(3d|audio|image|video|mcp|canvas)\b/;
for (const c of EXPLORE_CARDS) {
  assert.match(c.href, PAGES, `${c.id}: opens a real page (${c.href})`); assert.doesNotMatch(`${c.title} ${c.line}`, /coming soon|soon\b/i, `${c.id}: no coming-soon card`);
  if (c.toolId && !['plan-a-shot', 'make-it-real', 'three-d-turntable'].includes(c.toolId)) assert.ok(getTool(c.toolId), `${c.id}: ${c.toolId} is a tool`);
  if (c.modelKey && c.toolId && getTool(c.toolId)) { const keys = ((getTool(c.toolId) as any).providers ?? []).map((p: any) => (typeof p === 'string' ? p : p.id)); assert.ok(keys.length > 0); }
  if (c.featured) assert.ok(FEATURED.some((f) => f.key === c.featured), `${c.id}: featured ${c.featured} ships`);
  assert.ok(c.featured || c.art || c.standIn, `${c.id}: real media or our own art`);
}
for (const k of EXPLORE_HERO.takes) { const f = FEATURED.find((x) => x.key === k)!; assert.equal(f.flow, 'Direct a Shot'); assert.match(f.before!.url, /\.mp4$/, `${k}: a Mockup clip`); }
assert.match(EXPLORE_HERO.cta.href, /workflow=plan-a-shot/);
ok(`${EXPLORE_ROWS.length} rows, ${EXPLORE_CARDS.length} cards: each opens a real tool, real media or our own art, no coming-soon`);

// ---- Explore v3 showcase sections (shared/exploreShowcase.ts) ----
{ const X = await import('../src/shared/exploreShowcase.ts');
  assert.equal(X.EXPLORE_HERO.key, 'ltx-pro-painter', 'the hero is the LTX-2.5 Pro painter'); assert.equal(X.EXPLORE_HERO.title, 'Remember being a kid?'); assert.equal(X.EXPLORE_HEADLINE, 'Bring your ideas to life'); assert.deepEqual(X.EXPLORE_HERO.after, ['Music · YuE2 · Free'], 'the score made here is credited');
  assert.equal(X.EXPLORE_HERO.model, 'LTX-2.5 Pro'); assert.deepEqual(X.EXPLORE_HERO.facts, ['10 s']);
  { const h = FEATURED.find((x) => x.key === 'ltx-pro-painter')!; assert.equal(h.toolId, 'h3-video'); assert.equal(h.provider, 'router-ltx-25-pro'); assert.equal(h.modelKey, 'ltx-2.5-pro'); assert.equal(h.model, 'LTX-2.5 Pro');
    assert.equal(h.runOn, 'comfy-cloud'); assert.equal(h.route, 'comfy-router:router-ltx-25-pro'); assert.equal(h.costUsd!.toFixed(2), '1.72', 'the run\u2019s real cost');
    assert.deepEqual([h.input.mode, h.input.duration, h.input.resolution, h.input.aspect, h.input.audio], ['t2v', 10, '720p', '16:9', true]); assert.match(h.prompt, /whale/);
    assert.equal(featuredRecreateHref('ltx-pro-painter'), '/video?recreate=8e4d7d98', 'Recreate opens Video › Create Video');
    const pr = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height', '-of', 'csv=p=0', path.join(PUB, h.out.url)]).toString();
    assert.match(pr, /h264,1280,720/); assert.match(pr, /aac/); assert.ok(fs.readFileSync(path.join(PUB, h.out.url)).subarray(0, 64).includes('moov'), 'faststart: moov up front'); }
  assert.equal((X as Record<string, unknown>).EXPLORE_REEL, undefined, 'no rotating reel');
  { const d = FEATURED.find((x) => x.key === 'kling-dance-swap')!; assert.equal(d.toolId, 'motion-transfer'); assert.equal(d.modelKey, 'kling-v3-omni-edit'); assert.equal(d.costUsd, 1.01);
    assert.equal(featuredRecreateHref('kling-dance-swap'), '/video?workflow=motion-control&recreate=487a04e5'); file(String(d.input.videoUrl), 1.5e6); for (const u of d.input.refUrls as string[]) file(u); }
  { const hero = fs.readFileSync(path.join(WEB, 'ui/explore/ExploreShowcase.tsx'), 'utf8'); const film = fs.readFileSync(path.join(WEB, 'shared/ShowcaseFilm.tsx'), 'utf8');
    const xp = hero.slice(hero.indexOf('export function XpHero'), hero.indexOf('a prompt as it ran (shared)'));
    assert.match(xp, /<ShowcaseFilm\b[\s\S]*?\bpriority\n/, 'the hero: the page\u2019s first film'); assert.doesNotMatch(xp, /soundOn|soundKey|soundLabel/, 'the hero\u2019s sound is the page-wide choice (shared/soundDirector.ts)');
    assert.match(xp, /url: f\.out\.url/, 'the hero clip comes from the featured entry (one place to swap the file)');
    assert.doesNotMatch(xp, /\bonce\b|onEnded|Now showing|xph-reel|role="tablist"/, 'one looping clip: no reel, no counter, no play-once');
    assert.match(film, /loop=\{!once && !t0\}/, 'ShowcaseFilm loops unless once (natively when the take has no start)');
    assert.match(film, /onEnded=\{once \? [\s\S]*? : t0 \? \(e\) => \{ e\.currentTarget\.currentTime = t0; start\(\); \}/, 'a take with a start (no opener) still loops, back to its start');
    assert.match(film, /NotAllowedError[\s\S]*el\.muted = true; soundRefused\(\)/, 'refused sound: plays muted and waits for a gesture');
    assert.match(film, /useDirectedSound\(\{ root, media: \(\) => v\.current/, 'the sound director owns the film\u2019s sound');
    const dir = fs.readFileSync(path.join(WEB, 'shared/soundDirector.ts'), 'utf8');
    assert.match(dir, /\['pointerdown', 'keydown', 'touchstart'\]/, 'the first click, key or tap anywhere turns the sound on');
    assert.match(dir, /try \{ return localStorage\.getItem\(k\); \} catch/, 'the sound choice is remembered, safely');
    assert.match(film, /\{still && !controls && <button[^>]*className="sfilm-play"/, 'reduced motion: the poster with a play button'); }
  for (const r of [X.EXPLORE_HERO]) { const f = FEATURED.find((x) => x.key === r.key); assert.ok(f, `${r.key}: a featured clip`); assert.match(f!.out.url, /\.mp4$/); file(r.poster, 3e5); assert.ok(featuredRecreateHref(r.key), `${r.key}: Recreate`); }
    assert.match(fs.readFileSync(path.join(WEB, 'ui/Home.tsx'), 'utf8'), /<div className="xp-in"><XpBoard \/><\/div>\s*<XpFilms \/>/, 'Trends is hidden; Canvas opens the last act, right before the films');
  /* From one still: one LTX-2.5 Pro image-to-video take on Comfy Cloud (job 530ab5eb, 6 s, $1.46). Take 2 · Dive (33be70a9) left the section on 2026-10-28;
     its featured entry and files stay (featured feed, seeded job), so both are still checked below */
  { const W = X.EXPLORE_STILL; assert.equal(W.eyebrow, 'Bring a picture to life'); assert.equal(W.title, 'What if it could move?');
    assert.equal(W.line, 'A whale made of glass. A sea made of sand. One still becomes a moving scene, complete with sound.');
    assert.ok(!('takes' in W) && !('loops' in W) && !('next' in W), 'one take: no switch, no auto-alternation, no next-take hint');
    assert.doesNotMatch(`${W.title} ${W.line}`, /higgsfield|kling|seedance|veo|sora|LTX|Lightricks|model|prompt|seed/i, 'plain words, no tech names in the copy');
    assert.doesNotMatch(`${W.eyebrow} ${W.title} ${W.line} ${W.stillLabel} ${W.clipLabel} ${W.take.line}`, /higgsfield|kling|seedance|veo|sora/i, 'our own words, no other products named');
    assert.deepEqual([W.maker, W.place, W.sound], ['MiniMax', 'Comfy Cloud', 'Sound made with the shot']);
    assert.deepEqual([W.take.key, W.take.trimmedTo], ['h3-glass-whale', undefined], 'one take: the user’s latest MiniMax H3 whale run');
    const latestWhale = FEATURED.find((x) => x.key === W.take.key)!;
    assert.equal(latestWhale.jobId, 'd71d11f6'); assert.equal(latestWhale.input.seed, 303988);
    assert.equal(latestWhale.model, 'MiniMax H3'); assert.equal(latestWhale.costEstimated, true);
    assert.equal(featuredRecreateHref(W.take.key), '/video?recreate=654bac59');
    const still = FEATURED.find((x) => x.key === 'ltx-pro-whale-glide')!.before!;
    for (const [k, id, dur, usd, w, h, sec, words] of [['ltx-pro-whale-glide', 'bc0005d7', 6, 1.46, 1920, 1080, 6.04, /^The whale glides slowly overhead, its tail sweeping once;[\s\S]*Sound: low whale song, soft desert wind\.$/],
      ['ltx-pro-whale-dive', '39346ee1', 10, 2.44, 1280, 720, 7.42, /^The whale zooms past the rider, its tail sweeping beautifully[\s\S]*Sound: slow beautiful matched with the whales speed$/]] as const) {
      const f = FEATURED.find((x) => x.key === k)!; assert.ok(f, `${k}: a featured entry`); assert.equal(featuredIdOf(k), id, `${k}: seed id`);
      assert.deepEqual([f.toolId, f.provider, f.modelKey, f.model, f.runOn, f.route, f.costUsd], ['h3-video', 'router-ltx-25-pro', 'ltx-2.5-pro', 'LTX-2.5 Pro', 'comfy-cloud', 'comfy-cloud:cloud-ltx25-pro-api', usd], `${k}: LTX-2.5 Pro on Comfy Cloud, its real cost`);
      assert.deepEqual([f.input.mode, f.input.duration, f.input.resolution, f.input.aspect, f.input.audio, f.input.seed, f.input.imageUrl], ['i2v', dur, '1080p', '16:9', true, 116459, '/showcase/ltx-pro-whale-in.jpg'], `${k}: settings as they ran, the still attached`);
      assert.match(f.prompt, words, `${k}: the prompt as it ran`); assert.equal(featuredRecreateHref(k), `/video?recreate=${id}`, `${k}: Recreate opens Video with the still and prompt`);
      assert.equal(f.before!.url, still.url, 'the same still for both takes'); assert.equal(f.out.sec, sec);
      const p = file(f.out.url, 3e6); assert.ok(fs.statSync(p).size <= 3e6, `${k}: ≤ 3 MB`);
      const pr = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,profile,width,height', '-of', 'csv=p=0', p]).toString();
      assert.match(pr, new RegExp(`h264,High,${w},${h}`), `${k}: H.264 High ${w}×${h}`); assert.match(pr, /aac/, `${k}: AAC`); assert.ok(fs.readFileSync(p).subarray(0, 64).includes('moov'), `${k}: faststart`);
      const d = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).toString()); assert.ok(Math.abs(d - sec) < 0.1, `${k}: ${d} s`);
      assert.doesNotMatch(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags', '-of', 'json', p]).toString(), /creation_time|location|com\.apple|comment|encoder/i, `${k}: metadata stripped`);
      file(FEATURED_BIG_POSTER[k], 1.5e5); file(f.out.poster, 4e4); }
    for (const u of [still.url, '/showcase/ltx-pro-whale-in.jpg']) { const p = file(u, 250_001); assert.ok(fs.statSync(p).size <= 250_000, `${u}: ≤ 250 KB`); assert.ok(!fs.readFileSync(p).includes('Exif'), `${u}: no EXIF`); }
    file(still.poster, 4e4); assert.match(still.url, /\.webp$/); assert.deepEqual([still.width, still.height], [1344, 756], 'the still, cropped to 16:9 the way the app cropped it');
    const xs = fs.readFileSync(path.join(WEB, 'ui/explore/ExploreShowcase.tsx'), 'utf8'); const wx = xs.slice(xs.indexOf('export function XpStill'), xs.indexOf('Make your own cartoon (MiniMax H3'));
    assert.match(wx, /<HeroReel className=\{cls\}[^\n]*\breveal replay=\{replay\}[^\n]*sound=\{f\.out\.sound === true\} restartOnSound/, 'the shared HeroReel wipe (reveal), the page\u2019s sound: one reel for every layout');
    assert.equal((wx.match(/<HeroReel /g) ?? []).length, 1, 'the layouts only frame the one reel');
    assert.match(wx, /before=\{\{ url: still\.url[\s\S]*after=\{\{ url: f\.out\.url/, 'still → the take’s clip, both from the featured entry');
    assert.match(wx, /reel\('xpo-film xpo-bleed', <div className="xpo-over">\{copy\}<\/div>\)\}\s*<div className="xpo-under">\{run\}\{acts\}<\/div>/, 'today (0): the reel to the window edges, the copy once over the picture, one row under it');
    assert.match(xs, /get\('whalesection'\)[^\n]*v === 'a' \|\| v === 'b' \|\| v === 'c' \? v : '0'/, 'layouts being picked: ?whalesection=a|b|c, today by default');
    assert.match(wx, /reel\('hreel-framed xpo-film xpo-pair', undefined, 0\.5\)/, 'C parks the reveal half way: the still and the moving shot side by side');
    assert.match(fs.readFileSync(path.join(WEB, 'ui/explore/exploreShowcase.css'), 'utf8'), /\.xpo-bleed \.hreel-shade\{display:none\}/, 'no shade darkens the picture');
    assert.doesNotMatch(xs, /stillsection/, 'one layout, no gate');
    assert.doesNotMatch(wx, /Segmented|xp-still-take|xp-still-next|onTick|setPick/, 'one take: no take switch, no auto-alternation');
    assert.match(wx, /\$\{ran\} s run, trimmed to \$\{Math\.floor\(t\.trimmedTo\)\} s/, 'the trim said honestly'); assert.match(wx, /<RunChip c=\{chipOfFeatured\(f\)\} testId="xp-still-chip"/, 'the real model, place and price: the shared run chip');
    assert.match(wx, /featuredRecreateHref\(f\.key\)[\s\S]*xp-still-recreate/, 'Recreate from the featured entry'); assert.doesNotMatch(wx, /xp-still-read|xp-still-prompt/, 'no prompt reader here: Recreate this shot opens the full prompt'); assert.match(wx, /<Link to=\{rec\} className="xv-btn" data-testid="xp-still-recreate">Recreate this shot/, 'one primary action');
    const hr = fs.readFileSync(path.join(WEB, 'shared/HeroReel.tsx'), 'utf8');
    assert.match(hr, /reveal && \(failed \|\| still\)/, 'a missing clip or reduced motion: the still'); assert.match(hr, /reveal && still && !failed && <button[^>]*className="hreel-play"/, 'reduced motion: the still with a play button');
    assert.match(hr, /useDirectedSound\(\{ root, media: \(\) => b\.current/, 'the shared sound director');
    assert.match(hr, /window\.setInterval\([\s\S]*!onScreen\.current \|\| document\.hidden \|\| !live\(\)[\s\S]*WATCH_MS/, 'keeps looping: a watchdog plays a paused or stuck clip while on screen');
    assert.match(hr, /played\.current !== after\.url \|\| retries\.current >= RETRIES\) \{ if \(reveal\) \{? ?setBad/, 'an error after the clip played reloads it; only a clip that never played is broken');
    assert.match(hr, /onEnded=\{/, 'a missed loop restarts from 0');
    ok('From one still: one LTX-2.5 Pro take (Comfy Cloud, $1.46, 6 s) ≤ 3 MB, one still, the shared wipe, no switch, Recreate into Video'); }
  /* Make your own cartoon (letterbox): MiniMax H3 (job 42ceb1af, 10 s, $0.80) + H3 Extend on Comfy Cloud (job 50d2a3a0, +10 s, $0.52) */
  { const K = X.EXPLORE_KOI; assert.equal(K.key, 'h3-koi-take'); assert.equal(K.title, 'Make your own cartoon.'); assert.match(K.line, /^A boy in the rain, a paper lantern, a wish\. Write the scene the way you'd tell it/); assert.equal(K.eyebrow, 'Made with MiniMax H3');
    assert.doesNotMatch(`${K.eyebrow} ${K.title} ${K.line}`, /higgsfield|kling|seedance|veo|sora/i, 'our own words, no other products named');
    assert.deepEqual(K.first, { model: 'MiniMax H3', place: 'Comfy Cloud', usd: 0.8 }, 'the first 10 s: its model, place and real price'); assert.equal(K.place, 'Comfy Cloud');
    assert.equal(K.cta.label, 'Start your scene'); assert.equal(K.cta.href, '/video?model=minimax-h3', 'Start your scene opens Video with MiniMax H3 picked');
    const f = FEATURED.find((x) => x.key === K.key)!; assert.ok(f?.before, 'the take ships as a featured entry with its first 10 s');
    assert.deepEqual([f.toolId, f.provider, f.modelKey, f.model, f.flow, f.runOn, f.route, f.costUsd], ['h3-extend', 'comfy-h3-extend', 'minimax-h3-extend', 'H3 Extend', 'Extend', 'comfy-cloud', 'comfy-cloud:cloud-h3-extend', 0.52], 'H3 Extend on Comfy Cloud, its real cost');
    assert.deepEqual([f.input.mode, f.input.extendSeconds, f.input.resolution, f.input.seed, f.input.keepAudio, f.input.videoUrl], ['extend', 10, '768p', 1517254433, true, f.before!.url], 'settings as they ran; Recreate loads the first 10 s');
    assert.match(f.prompt, /^Continue the same action at the same pace, same camera: the glowing koi circles once above the rooftops/, 'the extend prompt as it ran');
    assert.equal(f.out.url, '/showcase/h3-koi-take.mp4', 'the plain take lives in the featured entry (Extend page, feeds, Recreate; one line to swap for an upscale)'); assert.equal(f.out.sec, 20.13);
    assert.deepEqual(K.ending, { url: '/showcase/h3-koi-take-ending.mp4', sec: 30.13, label: 'Ending · made with Imagination · Free' }, 'Explore only: the take + its 10 s ending (hold, title card, end mark)'); assert.equal(f.before!.sec, 10.125);
    assert.equal(featuredIdOf(K.key), '2fb5ac80'); assert.equal(featuredRecreateHref(K.key), `/video?workflow=extend&recreate=${FEATURED_SEED_IDS[K.key]}`, 'Recreate opens Video › Extend; the prefill names H3 Extend itself (modelKey), not H3 Max Extend, which shares the engine)');
    assert.ok(fs.statSync(file(f.out.url, 4e6)).size <= 4e6, 'the take stays ≤ 4 MB'); assert.ok(fs.statSync(file(K.ending.url, 4e6)).size <= 4e6, 'the ending version stays ≤ 4 MB'); file(f.before.url, 1.2e6); file(FEATURED_BIG_POSTER[K.key], 1.5e5); for (const u of [f.out.poster, f.before.poster, K.newFrame]) file(u, 4e4);
    for (const [u, sec] of [[f.out.url, 20.1], [K.ending.url, 30.1], [f.before.url, 10.1]] as const) { const p = path.join(PUB, u);
      const pr = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,profile,width,height', '-of', 'csv=p=0', p]).toString();
      assert.match(pr, /h264,High,1280,714/, `${u}: H.264 High, 1280 wide`); assert.match(pr, /aac/, `${u}: AAC`); assert.ok(fs.readFileSync(p).subarray(0, 64).includes('moov'), `${u}: faststart`);
      const d = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).toString()); assert.ok(Math.abs(d - sec) < 0.2, `${u}: ${d} s`);
      assert.doesNotMatch(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags', '-of', 'json', p]).toString(), /creation_time|location|com\.apple|comment|encoder/i, `${u}: metadata stripped`); }
    const xs = fs.readFileSync(path.join(WEB, 'ui/explore/ExploreShowcase.tsx'), 'utf8'); const kx = xs.slice(xs.indexOf('export function XpKoi'), xs.indexOf("a chapter's copy column"));
    assert.match(kx, /<ShowcaseFilm className="sfilm-letterbox"[^\n]*restartOnSound onTick=\{onTick\}[^\n]*onFail=/, 'the shared film: page sound and progress from onTick; a missing clip keeps its poster');
    assert.doesNotMatch(kx, /\{K\.line\}|xp-koi-time/, 'the descriptive paragraph and elapsed/total time are removed only from Explore');
    assert.match(kx, /url: K\.ending\.url/, 'Explore plays the cut with its title-card ending (the featured entry keeps the plain take for Extend)'); assert.match(kx, /left: `\$\{\(first \/ total\) \* 100\}%`/, 'the join notch sits at 0:10 of 0:20');
    assert.match(kx, /\{K\.first\.model\}<i>·<\/i>\{f\.model\}<i>·<\/i>\{K\.place\}/, 'the bar names both models and the place');
    assert.match(kx, /data-testid="xp-koi-eq"[\s\S]*f\.before\.poster[\s\S]*K\.newFrame[\s\S]*one \{Math\.round\(take\)\} s take/, '[frame] 10 s + [frame] 10 s = one 20 s take (the generated take, not the ending)');
    assert.match(kx, /const take = f\.out\.sec[^\n]*const total = K\.ending\.sec/, 'the sum and pills use the plain take, the readout the ending version'); assert.match(kx, /url: K\.ending\.url/, 'Explore plays the ending version'); assert.match(kx, /xp-koi-ending[\s\S]*xp-koi-paid-ending/, 'the ending marked on the progress line and credited as made here');
    assert.match(kx, /xp-koi-paid-first[^\n]*K\.first\.usd[^\n]*first \$\{Math\.round\(first\)\} s[\s\S]*xp-koi-paid-extend[^\n]*chipOfFeatured\(f, \{ note: `\+\$\{added\} s`/, 'two run chips: each run\u2019s model, place and price');
    assert.match(kx, /featuredRecreateHref\(f\.key\)[\s\S]*xp-koi-recreate">Recreate<[\s\S]*K\.cta\.href/, 'Recreate and Start your scene');
    assert.match(fs.readFileSync(path.join(WEB, 'shared/ShowcaseFilm.tsx'), 'utf8'), /onError=\{\(\) => \{ setBad\(t\.url\); onFail\?\.\(\); \}\}/, 'ShowcaseFilm: a clip that fails keeps its poster');
    ok('Make your own cartoon: MiniMax H3 + H3 Extend (Comfy Cloud), 20 s take ≤ 4 MB, its first 10 s, posters, prices, Recreate into Extend'); }
  assert.equal((X as Record<string, unknown>).EXPLORE_QUICK, undefined, 'the hero has no quick links (2026-10-28)');
  assert.equal(X.EXPLORE_TAGLINES.length, 3, 'three tagline options'); assert.ok(X.EXPLORE_TAGLINES.includes(X.EXPLORE_TAGLINE));
  for (const t of X.EXPLORE_TAGLINES) { assert.ok(t.title.length && t.line, 'tagline copy'); assert.doesNotMatch(`${t.title.join(' ')} ${t.line}`, /higgsfield/i, 'no other products named'); }
  const LINK = /^\/(3d|audio|image|video|canvas|workflows|film)\b/;
  for (const u of X.EXPLORE_SHOWCASE_LINKS()) assert.match(u, LINK, `showcase link opens a real page: ${u}`);
  /* chapter 1: swap a character, the dance-off (2026-10-28, the user's pick C): two swaps of one dance, H3 Character Swap (job 1f0cf6a2) and Kling 3.0 Omni Edit (job dc114104) */
  { const S = X.EXPLORE_SWAP; assert.equal((X as Record<string, unknown>).EXPLORE_STAGE, undefined, 'the Direct a Shot chapter is gone'); assert.equal((X as Record<string, unknown>).EXPLORE_SWAP_DUO, undefined, 'one layout, no A / B leftovers');
    assert.deepEqual(S.title, ['Same dance.', 'Two new casts.']); assert.match(S.eyebrow, /^Chapter 1 · Swap a character$/);
    assert.doesNotMatch(`${S.title.join(' ')} ${S.line} ${S.runs.map((r) => `${r.who} ${r.photos} ${r.cta.label}`).join(' ')}`, /higgsfield|seedance|kling|\bmac\b/i, 'our own words (the model names come from the featured entries)');
    assert.deepEqual(S.runs.map((r) => r.key), ['h3-char-swap', 'kling-dance-swap']); assert.equal(S.key, 'h3-char-swap');
    assert.equal(S.cta.href, '/video?workflow=object-swap&model=minimax-h3-character-swap', 'the first CTA opens Object Swap on H3 Character Swap'); assert.equal(S.runs[0].cta.href, S.cta.href);
    assert.equal(S.runs[1].cta.href, '/video?workflow=motion-control&model=kling-v3-omni-edit', 'the whole-cast CTA opens Motion Control on Omni Edit');
    const f = FEATURED.find((x) => x.key === S.key)!; assert.ok(f, 'the H3 swap ships as a featured entry');
    assert.deepEqual([f.toolId, f.provider, f.modelKey, f.model, f.route, f.costUsd, f.runOn], ['object-swap', 'comfy-h3-charswap', 'minimax-h3-character-swap', 'H3 Character Swap', 'comfy-cloud:cloud-h3-charswap', 0.42, 'comfy-cloud']);
    assert.deepEqual([f.input.mode, f.input.swapType, f.input.preset, f.input.target, f.input.resolution, f.input.seed, f.prompt], ['object_swap', 'person', 'right-person', 'the woman on the right', '1080p', 737688, ''], 'the run’s input, as it ran');
    assert.equal(featuredRecreateHref(S.key), '/video?workflow=object-swap&recreate=bb7e11f4', 'Recreate opens Video › Object Swap');
    const om = FEATURED.find((x) => x.key === 'kling-dance-swap')!; assert.deepEqual([om.model, om.costUsd, om.runOn, om.jobId, FEATURED_SEED_IDS['kling-dance-swap']], ['Kling 3.0 Omni Edit', 1.01, 'comfy-cloud', 'dc114104', '487a04e5'], 'the shipped Omni Edit run (the upscaled one)');
    assert.equal(featuredRecreateHref(om.key), '/video?workflow=motion-control&recreate=487a04e5');
    /* the original both runs started from: the same 8 s take, H.264 + AAC, faststart, metadata stripped */
    assert.equal(S.original.url, f.before!.url, 'the original is the clip both runs started from'); assert.equal(f.input.videoUrl, f.before!.url); file(S.original.poster);
    { const p = file(S.original.url); const pr = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height', '-of', 'csv=p=0', p]).toString();
      assert.match(pr, /h264,1280,720/); assert.match(pr, /aac/); assert.ok(fs.readFileSync(p).subarray(0, 64).includes('moov'), 'faststart');
      assert.doesNotMatch(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags', '-of', 'json', p]).toString(), /creation_time|location|com\.apple/i, 'metadata stripped'); }
    /* both results play their Topaz upscale (1080p, ≤ ~3 MB, 8 s, sound) */
    for (const r of S.runs) { const e = FEATURED.find((x) => x.key === r.key)!; const h = e.sharp!; assert.ok(h, `${r.key}: ships its upscale`); assert.deepEqual([h.model, h.place, h.costUsd, h.sound], ['Topaz Starlight Precise 2.5', 'Comfy Cloud', 0.64, true]);
      const p = file(h.url, 3.3e6); const pr = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height', '-of', 'csv=p=0', p]).toString();
      assert.match(pr, /h264,1920,1080/, `${r.key}: H.264 1080p`); assert.match(pr, /aac/, `${r.key}: AAC`); assert.ok(fs.readFileSync(p).subarray(0, 64).includes('moov'), `${r.key}: faststart`);
      const d = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).toString()); assert.ok(Math.abs(d - 8) < 0.1, `${r.key}: 8 s (${d})`);
      for (const u of e.input.refUrls as string[]) file(u, 2e5); file(FEATURED_BIG_POSTER[r.key] ?? e.out.poster.replace(/-480\.webp$/, '.webp')); }
    assert.equal(f.sharp!.url, '/showcase/h3-char-swap-sharp.mp4'); assert.equal(f.out.url, '/showcase/h3-char-swap.mp4', 'the original H3 result stays the featured result (Recreate, feeds)');
    const xs = fs.readFileSync(path.join(WEB, 'ui/explore/ExploreShowcase.tsx'), 'utf8'); const sw = xs.slice(xs.indexOf('function swapRuns'), xs.indexOf('export function XpLayers')); /* the runs helper (Recreate links) sits just above XpSwap */
    assert.match(sw, /useSyncClips\(4\)/, 'the original under each slider and both swaps play in step (shared useSyncClips)');
    assert.match(sw, /<CompareFrame [^>]*intro="nudge"/, 'each card is the shared before / after slider (CompareFrame), nudged once');
    assert.doesNotMatch(xs, /xsdc-mid|xsdc-orig/, 'no small original between the cards');
    for (const r of S.runs) if (r.originalPoster) file(r.originalPoster); assert.match(sw, /<SoundToggle on=\{g\.sound\.lit\} waiting=\{g\.sound\.waiting\} label=\{g\.sound\.hint\}/, 'the shared sound toggle');
    assert.match(sw, /g\.still \? <img className="xsdc-media" src=\{poster\}/, 'reduced motion: posters'); assert.match(sw, /featuredRecreateHref\(f\.key\)/, 'Recreate from each featured entry');
    assert.match(sw, /chip: chipOfFeatured\(f\)[\s\S]*<RunChip c=\{x\.chip\}/, 'each card names the real model, place and price (the shared run chip)'); assert.doesNotMatch(xs, /\?swap=|SWAP_DEV|XpSwapNow|XpSwapThree|XpSwapPick|XpStage|EXPLORE_STAGE/, 'no leftover layouts');
    assert.match(fs.readFileSync(path.join(WEB, 'shared/SyncClips.ts'), 'utf8'), /export function useSyncClips/);
    assert.match(fs.readFileSync(path.join(WEB, 'ui/Home.tsx'), 'utf8'), /Same dance\. Two new casts\.[\s\S]*<XpSwap \/>/, 'Home names and mounts the chapter'); }
  /* chapter 2: image to layers (Seedream 5.0 Flash on Comfy Router, job 829b6ef1) */
  { const L = X.EXPLORE_LAYERS; assert.match(L.eyebrow, /^Chapter 2 · Image to layers$/); assert.deepEqual(L.title, ['One picture.', 'Every layer.']);
    assert.deepEqual(L.steps.map((x) => x.name), ['Picture', 'Split'], 'two steps from the data, the third is the run itself');
    assert.doesNotMatch(`${L.title.join(' ')} ${L.line} ${L.steps.map((x) => x.line).join(' ')}`, /higgsfield/i, 'our own words, no other products named');
    assert.equal(L.cta.href, '/image?workflow=image-layers', 'Split an image opens Create Image with Image to layers picked');
    const f = FEATURED.find((x) => x.key === L.key)!; assert.ok(f, 'the run ships as a featured entry');
    assert.deepEqual([f.tab, f.toolId, f.provider, f.modelKey, f.model, f.route, f.costUsd, f.runOn], ['image', 'app-image-layers', 'api-seedream-layers-flash', 'seedream-5.0-flash-layers',
      'ByteDance Seedream 5.0 Flash · layers (hosted)', 'comfy-router:api-seedream-layers-flash', 0.3346, 'comfy-cloud'], 'the real model and its real cost ($0.33)');
    assert.equal(featuredIdOf(L.key), FEATURED_SEED_IDS[L.key]); assert.equal(featuredRecreateHref(L.key), `/image?workflow=image-layers&recreate=${FEATURED_SEED_IDS[L.key]}`, 'Recreate opens Image to layers');
    assert.equal(f.input.layers, true); assert.equal(f.input.imageUrl, f.before!.url, 'the poster Recreate loads is the strip’s input');
    assert.ok(fs.statSync(file(String(f.input.imageUrl), 200_001)).size <= 200_000, 'the input stays ≤ 200 KB');
    assert.equal(f.layers!.length, 13, '13 layers'); assert.equal(f.layers![0].label, 'Background'); assert.deepEqual([...L.order].sort((a, b) => a - b), f.layers!.map((_, k) => k), 'the strip shows every layer once');
    for (const l of f.layers!) { file(l.url, 60_001); assert.ok(fs.statSync(path.join(PUB, l.url)).size <= 60_000, `${l.url}: ≤ 60 KB`); assert.equal(l.box.length, 4);
      assert.ok(l.box[0] < l.box[2] && l.box[1] < l.box[3] && l.box[2] <= f.out.width && l.box[3] <= f.out.height, `${l.label}: its content box`);
      assert.equal(fs.readFileSync(path.join(PUB, l.url)).subarray(12, 16).toString(), l === f.layers![0] ? 'VP8 ' : 'VP8X', `${l.url}: a WebP${l === f.layers![0] ? '' : ' with alpha'}`); }
    for (const u of [L.film.poster, L.film.thumb, f.before!.poster]) file(u);
    { const p = file(L.film.url, 2e6); const pr = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height', '-of', 'csv=p=0', p]).toString().trim();
      assert.match(pr, /^h264,video,1280,720,?\naac,audio,*$/, 'the animation: H.264 1280×720 plus its AAC sound design');
      assert.ok(Math.abs(Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).toString()) - 16.67) < 0.05, '~16.67 s'); assert.ok(fs.readFileSync(p).subarray(0, 64).includes('moov'), 'faststart');
      assert.doesNotMatch(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags', '-of', 'json', p]).toString(), /creation_time|location|com\.apple|comment|encoder/i, 'metadata stripped'); }
    const xs = fs.readFileSync(path.join(WEB, 'ui/explore/ExploreShowcase.tsx'), 'utf8'); const ly = xs.slice(xs.indexOf('export function XpLayers'), xs.indexOf('export function XpLooks'));
    assert.match(ly, /<HoverClip src=\{S\.film\.url\}[^>]*mode="view"[^>]*directed restart=\{restart\} onFail=/, 'the shared HoverClip plays the animation on screen (loop; reduced motion: the poster); the sound director owns its sound');
    assert.match(ly, /useDirectedSound\(\{ root: box, media: \(\) => box\.current\?\.querySelector\('video'\)/, 'the shared sound director (the page\u2019s one choice)'); assert.doesNotMatch(xs, /_SOUND_KEY|useClipSound/, 'no per-section sound keys');
    assert.match(ly, /\{S\.film\.sound === true && !still && !failed && <SoundToggle on=\{snd\.lit\} waiting=\{snd\.waiting\} label=\{snd\.hint\} onToggle=\{onSound\} testId="xp-layers-sound"/, 'the shared SoundToggle, only for a clip with sound, hidden under reduced motion and when the clip fails');
    assert.match(ly, /if \(snd\.toggle\(\)\) setRestart\(/, 'turning sound on restarts the clip from 0 so the sound lines up with the layers');
    assert.match(fs.readFileSync(path.join(WEB, 'shared/HoverClip.tsx'), 'utf8'), /restart\?: number[\s\S]*el\.currentTime = 0/, 'HoverClip: a new restart value plays from 0');
    assert.match(ly, /<LayerTile\b/, 'the shared LayerTile'); assert.doesNotMatch(ly, /xv-tag[^"]*"[^>]*>\{S\.film|xpy-badge/, 'no badge over the animation');
    assert.match(fs.readFileSync(path.join(WEB, 'ui/Home.tsx'), 'utf8'), /<XpWork \/>\s*<XpLayers \/>/, 'Image to layers closes the work act, right after Made for your work'); }
  /* one sound button (2026-10-27): every Explore clip with sound uses the shared SoundToggle; silent clips get none; no per-section look-alikes */
  { const xs = fs.readFileSync(path.join(WEB, 'ui/explore/ExploreShowcase.tsx'), 'utf8'); const film = fs.readFileSync(path.join(WEB, 'shared/ShowcaseFilm.tsx'), 'utf8');
    const reel = fs.readFileSync(path.join(WEB, 'shared/HeroReel.tsx'), 'utf8'); const tog = fs.readFileSync(path.join(WEB, 'shared/SoundToggle.tsx'), 'utf8');
    const css = fs.readFileSync(path.join(WEB, 'shared/soundToggle.css'), 'utf8');
    const part = (a: string, b: string) => xs.slice(xs.indexOf(a), xs.indexOf(b));
    /* the players draw the shared toggle, and only for a clip marked as having sound */
    assert.match(film, /import \{ SoundToggle \} from '\.\/SoundToggle'/); assert.match(film, /\{!controls && t\.sound === true && !still && !failed && <SoundToggle on=\{snd\.lit\} waiting=\{snd\.waiting\} label=\{snd\.hint\}/, 'ShowcaseFilm: the shared toggle, only for a take with sound');
    assert.match(reel, /import \{ SoundToggle \} from '\.\/SoundToggle'/); assert.match(reel, /sound = false,/, 'HeroReel: no sound button unless the clip has sound'); assert.match(reel, /\{sound && !still && !failed && <SoundToggle on=\{snd\.lit\} waiting=\{snd\.waiting\} label=\{snd\.hint\}/, 'HeroReel: the shared toggle');
    /* each section: its sound flag comes from the clip's data; the sound itself is the page's one choice (shared/soundDirector.ts) */
    const hero = part('export function XpHero', 'a prompt as it ran (shared)'); assert.match(hero, /sound: f\.out\.sound/);
    const still = part('export function XpStill', 'Make your own cartoon (MiniMax H3'); assert.match(still, /<HeroReel [^\n]*sound=\{f\.out\.sound === true\} restartOnSound/, 'From one still: the shared toggle, from 0 when sound goes on');
    const koi = part('export function XpKoi', "a chapter's copy column"); assert.match(koi, /restartOnSound/, 'the koi take: from 0 when sound goes on'); assert.match(koi, /sound: f\.out\.sound/);
    const swap = part('export function XpSwap', 'Chapter 2: image to layers'); assert.match(swap, /useSyncClips\(4\)[\s\S]*\{!g\.still && <SoundToggle on=\{g\.sound\.lit\}/, 'the swap: the shared toggle (the original leads and carries the sound; not under reduced motion)');
    assert.doesNotMatch(xs, /_SOUND_KEY|soundKey|soundGroup|useClipSound/, 'no per-section sound keys or groups left');
    for (const src of [film, reel, fs.readFileSync(path.join(WEB, 'shared/SyncClips.ts'), 'utf8')]) { assert.match(src, /useDirectedSound\(/, 'every Explore player registers with the sound director'); assert.doesNotMatch(src, /soundKey|soundGroup|useClipSound|setBlocked/, 'no per-player sound state'); }
    assert.ok(!fs.existsSync(path.join(WEB, 'shared/soundGroup.ts')), 'sound groups folded into the director');
    /* the swap's sound is the original's track (clip 0 of its synced three) */
    assert.match(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', path.join(PUB, X.EXPLORE_SWAP.original.url)]).toString(), /audio/, 'the swap original has an audio track');
    /* every clip that shows a sound button really carries an audio track */
    const withSound = [X.EXPLORE_HERO.key, X.EXPLORE_STILL.take.key, X.EXPLORE_KOI.key, X.EXPLORE_SWAP.key];
    for (const k of withSound) { const f = FEATURED.find((x) => x.key === k)!; for (const m of [f.out, k === X.EXPLORE_SWAP.key ? f.sharp : undefined]) { if (!m?.sound) continue;
      assert.match(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', path.join(PUB, m.url)]).toString(), /audio/, `${m.url}: marked with sound, has an audio track`); } }
    assert.equal(X.EXPLORE_LAYERS.film.sound, true, 'the layers animation is marked with sound (its AAC track is checked above)');
    /* no per-section look-alikes left */
    for (const [n, src] of [['ExploreShowcase', xs], ['ShowcaseFilm', film], ['HeroReel', reel], ['explore css', fs.readFileSync(path.join(WEB, 'ui/explore/exploreShowcase.css'), 'utf8')], ['editorial css', fs.readFileSync(path.join(WEB, 'shared/editorial.css'), 'utf8')]] as const)
      assert.doesNotMatch(src, /xpl-sound|sfilm-sound|hreel-sound|SoundOffIcon/, `${n}: no own sound button`);
    /* the button itself: 40 px circle bottom right, dark glass off, orange on, a focus ring, words for screen readers, a tooltip */
    assert.match(css, /\.snd\{position:absolute;right:var\(--snd-right,var\(--snd-inset,15px\)\);bottom:var\(--snd-bottom,var\(--snd-inset,15px\)\)/, 'bottom right, 15 px in');
    assert.match(css, /\.snd-toggle\{[^}]*width:40px;height:40px[^}]*border-radius:50%[^}]*background:rgba\(12,12,14,\.46\)[^}]*backdrop-filter:blur/, 'a 40 px dark glass circle');
    assert.match(css, /\.snd-toggle\.is-on\{background:var\(--accent\)/, 'orange when on'); assert.match(css, /\.snd-toggle:focus-visible\{outline:var\(--focus-ring-w/, 'the focus ring');
    assert.match(tog, /aria-pressed=\{lit\} aria-label=\{t\.aria\} title=\{t\.tip\}/, 'pressed state, words and a tooltip');
    ok('one sound button: hero, From one still, koi, swap and layers share SoundToggle (a page-wide mute); silent clips get none; one director, no per-section keys'); }
  { const B = X.EXPLORE_BOARD; const r = B.recording;
    const video = file(r.url, 7e6); file(r.poster, 250e3);
    assert.equal(B.cta.href, '/canvas', 'opens the existing Canvas route, no invented demo flags');
    assert.equal(r.caption, 'Canvas demo · product shots');
    assert.match(r.disclosure, /Recorded Canvas workflow demonstration/);
    assert.match(r.disclosure, /Playback does not run models or spend credits/);
    const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', video]).toString());
    assert.equal(info.streams.length, 2, 'recording includes the approved introductory voiceover');
    assert.deepEqual(info.streams[0], { codec_name: 'h264', codec_type: 'video', width: 1440, height: 900 });
    assert.equal(info.streams[1].codec_type, 'audio'); assert.equal(info.streams[1].codec_name, 'aac');
    assert.ok(Math.abs(Number(info.format.duration) - r.sec) < 0.1, 'the user-selected uncut product-shots recording');
    const xs = fs.readFileSync(path.join(WEB, 'ui/explore/ExploreShowcase.tsx'), 'utf8');
    const board = xs.slice(xs.indexOf('export function XpBoard'), xs.indexOf('Audio: SyteSim dances'));
    assert.match(board, /<ShowcaseFilm className="xpb-player"[\s\S]*controls/, 'same on-screen looping player as the hero, with accessible transport');
    assert.doesNotMatch(board, /\bmanual\s*[=/>]|\bonce\s*[=/>]/, 'autoplays and loops by default; shared player handles reduced motion');
    assert.match(board, /sec: B\.recording\.sec, sound: true/, 'the voice track participates in shared page sound');
    assert.match(board, /controls restartOnSound/, 'enabling sound replays the introductory line');
    assert.doesNotMatch(board, /<SoundToggle|useDirectedSound/, 'one shared player owns its sound toggle and audio candidate');
    assert.match(board, /Narrated screen recording/, 'replacement media does not inherit an unverified narrator identity');
    assert.match(board, /aria-describedby="xp-board-caption xp-board-disclosure"/);
    assert.doesNotMatch(board, /setTimeout|Rendering|xp-board-step|xpb-chat|xpb-card|localStorage|setMuted/, 'no fake progress, fake board or separate sound preference');
    const css = fs.readFileSync(path.join(WEB, 'ui/explore/exploreShowcase.css'), 'utf8');
    assert.match(css, /\.xpb-player \.sfilm-stage\{[^}]*aspect-ratio:8\/5/, 'full 1440×900 frame');
    assert.match(css, /\.xpb-player \.sfilm-media\{object-fit:contain\}/, 'uncropped screen recording');
    assert.match(css, /\.xpb-player \.sfilm-controls\{position:relative/, 'transport does not cover screen text');
    assert.match(board, /className="xv-btn" data-testid="xp-board-cta"/, 'Canvas uses the same full-size primary action as other chapters');
    assert.match(css, /\.xpb-player \.sfilm-btn,\.xpb-player \.sfilm-transport \.snd-toggle\{width:44px;height:44px\}/, 'Canvas keeps touch-sized round controls, sound included');
    assert.doesNotMatch(xs.slice(xs.indexOf('export function XpSwap'), xs.indexOf('export function XpLayers')), /\{S\.eyebrow\}/, 'swap chapter label removed');
    assert.match(xs, /<ChapterText id="layers" title=/, 'layers chapter label omitted without removing its headline');
    ok('Canvas: selected product-shots demo, on-screen loop, shared page sound button, uncropped recording; chapter labels removed'); }
  /* One idea. Every look. (replaces Stills with a point of view): twelve free FLUX.2 [klein] 4B looks of one prompt; then Now it's your turn. */
  { const L = X.EXPLORE_LOOKS; assert.equal((X as Record<string, unknown>).EXPLORE_IMAGES, undefined, 'Stills with a point of view is gone');
    assert.deepEqual(L.looks.map((l) => l.name), ['Golden hour', 'Film noir', 'Neon rain', 'Teal & orange', '35mm', 'Documentary', 'Studio white', 'Spotlight', 'Pastel', 'Anime', 'Watercolour', 'Clay']);
    assert.equal(L.model, 'FLUX.2 [klein] 4B'); assert.equal(L.looks[L.start].name, 'Anime');
    assert.equal(L.looks.find((l) => l.id === 'neon-rain')?.model, 'Qwen Image 2.1'); assert.equal(L.looks.find((l) => l.id === 'anime')?.model, 'FLUX.2 [klein] 4B');
    for (const l of L.looks) for (const u of [l.url, l.thumb]) { assert.match(u, /^\/showcase\/look-[a-z0-9-]+\.webp$/, `${u}: a neutral name`); assert.ok(fs.existsSync(path.join(PUB, u)), `${u}: shipped`); }
    const Y = X.EXPLORE_YOUR_TURN; const wall = Y.wall.flat(); assert.equal(Y.wall.length, 6); assert.ok(wall.length >= 28, `about 30 on the wall (${wall.length})`);
    for (const t of wall) { assert.ok(fs.existsSync(path.join(PUB, t.src)), `${t.src}: shipped`); assert.ok(t.model, `${t.src}: names its model`); if (/\/(wall|look)-/.test(t.src)) assert.match(t.src, /^\/showcase\/(wall|look)-[a-z0-9-]+\.webp$/, `${t.src}: a neutral name`); }
    assert.deepEqual(wall.filter((t) => t.star).map((t) => t.src), ['/showcase/wall-tortoise-village.webp'], 'the tortoise village is the one spotlit tile');
    assert.equal(X.yourTurnHref('  a fox in the snow '), '/image?prompt=a+fox+in+the+snow', 'Make it: Create Image with the words in the bar');
    assert.equal(X.yourTurnHref(''), `/image?${new URLSearchParams({ prompt: Y.placeholder })}`, 'empty: the example in the box');
    const xs = fs.readFileSync(path.join(WEB, 'ui/explore/ExploreShowcase.tsx'), 'utf8');
    assert.match(xs, /onMouseEnter=\{\(\) => setCur\(k\)\} onFocus=\{\(\) => setCur\(k\)\} onClick=\{\(\) => setCur\(k\)\}/, 'hover, focus or tap swaps the look');
    assert.match(xs, /goToWorkflow\(yourTurnHref\(text\)\)/, 'Make it goes in-app');
    assert.match(fs.readFileSync(path.join(WEB, 'ui/explore/exploreShowcase.css'), 'utf8'), /prefers-reduced-motion:reduce\)\{\.xyt-track\{animation:none\}/, 'reduced motion: the wall stays still'); }
  /* One character. Every angle. (four GPT Image 2.5 Flare sheets on Comfy Router; Mossbun as a Tripo 3.1 model) */
  { const S = X.EXPLORE_SHEETS; assert.equal(S.title, 'One character. Every angle.'); assert.equal(S.eyebrow, 'Made with GPT Image 2.5 Flare'); assert.equal(S.via, 'Comfy Cloud');
    assert.doesNotMatch(`${S.title} ${S.line} ${S.cast.map((c) => `${c.name} ${c.style}`).join(' ')}`, /higgsfield|kling|seedance/i, 'our own words, no other products named');
    const want = [['sheet-kaito', 'b5b82fcc', '492ddf3d', 1536, 1024, 0.0159, /KAITO VEY/], ['sheet-mossbun', '7793115c', '9564386e', 1456, 624, 0.0087, /MOSSBUN/], ['sheet-mechanic', '224bbf14', 'd5c4b1a5', 1536, 1024, 0.0159, /harbour mechanic/], ['sheet-kip', '8d939956', 'a4084c61', 1344, 1008, 0.0166, /KIP RALLY/]] as const;
    assert.deepEqual(S.cast.map((c) => c.key), want.map((w) => w[0]), 'Kaito, Mossbun, the mechanic, Kip');
    for (const [k, id, , w, h, usd, words] of want) { const f = FEATURED.find((x) => x.key === k)!; const c = S.cast.find((x) => x.key === k)!; assert.ok(f, `${k}: a featured entry`);
      assert.deepEqual([f.tab, f.toolId, f.provider, f.modelKey, f.model, f.runOn, f.route, f.costUsd], ['image', 'create-image', 'api-gpt-image-25-flare', 'gpt-image-2.5-flare', 'GPT Image 2.5 Flare', 'comfy-cloud', 'comfy-router:api-gpt-image-25-flare', usd], `${k}: GPT Image 2.5 Flare on Comfy Router, its billed price`);
      assert.match(f.prompt, words); assert.equal(f.input.seed, 397533); assert.equal(featuredIdOf(k), id); assert.equal(featuredRecreateHref(k), `/image?recreate=${id}`, `${k}: Recreate opens Create Image`);
      assert.deepEqual([f.out.width, f.out.height], [w, h], `${k}: its real size`); const p = file(f.out.url, 2e5); assert.equal(fs.readFileSync(p).subarray(8, 12).toString(), 'WEBP');
      assert.ok(!fs.readFileSync(p).includes('EXIF') && !fs.readFileSync(p).includes('Exif'), `${k}: no EXIF`); file(f.out.poster, 5e4); file(c.face, 8e3);
      assert.ok(c.panels.length >= 5, `${k}: its panels`); for (const [l, x, y, pw, ph] of c.panels) assert.ok(l && x >= 0 && y >= 0 && pw > 0 && ph > 0 && x + pw <= w && y + ph <= h, `${k} ${l}: inside the sheet`); }
    const td = S.cast.find((c) => c.key === 'sheet-mossbun')!.threeD!; assert.ok(td, 'Mossbun has a 3D model');
    assert.deepEqual([td.model, td.place, td.usd, td.jobId], ['Tripo 3.1', 'Comfy Cloud', 0.3, '092abb03'], '3D: Tripo 3.1 · Comfy Cloud · $0.30');
    { assert.match(td.url, /^\/showcase\/[\w-]+\.glb$/); const p = path.join(PUB, td.url); const b = fs.readFileSync(p); assert.ok(b.length <= 4e6, `the GLB web copy is ≤ 4 MB (${b.length} B)`);
      assert.equal(b.subarray(0, 4).toString(), 'glTF'); const jl = b.readUInt32LE(12); const gj = JSON.parse(b.subarray(20, 20 + jl).toString());
      assert.ok(!(gj.extensionsRequired ?? []).some((e: string) => /draco|meshopt|basisu/i.test(e)), 'no decoder needed (no Draco / meshopt / KTX2: the viewer never fetches a decoder from a CDN)');
      const faces = gj.accessors[gj.meshes[0].primitives[0].indices].count / 3; assert.equal(faces, td.faces, `${faces} faces`); assert.ok(faces <= 150_000, 'decimated to ≤ 150k faces');
      assert.ok(gj.nodes.some((n: any) => n.name === 'mossbun-front' && n.rotation), 'turned so its front faces the camera at 0°'); }
    const xs = fs.readFileSync(path.join(WEB, 'ui/explore/ExploreShowcase.tsx'), 'utf8'); const sx = xs.slice(xs.indexOf('export function XpSheets'), xs.indexOf('Mockup to film (Direct a Shot made real)'));
    assert.match(sx, /<Model3D src=\{td!\.url\}[^>]*autoRotate=\{!still\}/, 'the shared Model3D viewer; reduced motion: no auto-rotate');
    assert.match(sx, /Spin him in 3D/, 'the 3D toggle'); assert.match(sx, /<RunChip c=\{chipOfRun\(\{ jobId: td\.jobId, model: td\.model, place: td\.place, costUsd: td\.usd/, 'the 3D credit (the shared run chip)');
    assert.match(sx, /className="xpk-frame xpc-frame"/, 'the koi’s letterbox frame (shared look)'); assert.match(sx, /featuredRecreateHref\(f\.key\)[\s\S]*xp-sheets-recreate/, 'Recreate from the featured entry');
    assert.match(sx, /if \(!now \|\| paused \|\| still \|\| spin \|\| !seen\) return/, 'steps only on screen; Pause, reduced motion and 3D stop it');
    assert.match(fs.readFileSync(path.join(WEB, 'ui/explore/exploreShowcase.css'), 'utf8'), /\.xpc-sheet\{[^}]*width:min\(100cqw,calc\(100cqh \* var\(--ar\)\)\)/, 'the whole sheet fitted, never cropped');
    assert.match(fs.readFileSync(path.join(WEB, 'ui/Home.tsx'), 'utf8'), /<XpStill \/>\s*<XpSheets \/>\s*<XpKoi \/>/, 'character sheets follow What if it could move?, then the cartoon');
    ok('One character. Every angle.: 4 GPT Image 2.5 Flare sheets (Comfy Router, billed prices), real panels, Recreate into Create Image; Mossbun GLB ≤ 4 MB, no decoder'); }
  /* Mockup to film (replaces Build a world): Direct a Shot mockup (a1a50672, free) → first frame (645de70d, GPT Image 2.5 Flare, $0.02 billed) → film (1a1a33c6, LTX-2.5 22B + Layout to Render, Comfy Cloud, $0.28) */
  { const F = X.EXPLORE_FILM; assert.equal((X as Record<string, unknown>).EXPLORE_WORLDS, undefined, 'the Worlds tiles are gone'); assert.ok(!fs.existsSync(path.join(PUB, 'explore/worlds')), 'their images are gone');
    assert.equal(F.title, 'Block it in 3D. Film it for real.'); assert.deepEqual(F.beats.map((b) => [b.n, b.step, b.model, b.place, b.usd, b.jobId]),
      [[1, 'Mockup', 'Direct a Shot', 'drawn in your browser', 0, 'a1a50672'], [2, 'First frame', 'GPT Image 2.5 Flare', 'Comfy Cloud', 0.0238, '645de70d'], [3, 'Film', 'LTX-2.5 22B + Layout to Render', 'Comfy Cloud', 0.28, '1a1a33c6']], 'the three passes, real models and prices');
    assert.match(F.beats[2].note, /8 s run · first shot shown/); assert.equal(F.cta.href, '/3d?workflow=plan-a-shot&preset=open-city');
    const f = FEATURED.find((x) => x.key === F.key)!; assert.ok(f?.before, 'the film ships as a featured entry with its mockup');
    assert.deepEqual([f.toolId, f.provider, f.model, f.flow, f.runOn, f.route, f.costUsd], ['make-it-real', 'comfy-ltx25-layout', 'LTX-2.5 + Layout to Render', 'Direct a Shot', 'comfy-cloud', 'comfy-cloud:cloud-ltx25-layout', 0.28]);
    assert.match(f.prompt, /^A young woman in a burnt-orange jacket walks/); assert.equal(featuredIdOf(F.key), '8ec31949');
    assert.match(featuredRecreateHref(F.key)!, /^\/3d\?workflow=plan-a-shot&preset=open-city&realPrompt=A%20young%20woman/, 'Recreate: Direct a Shot on Open city, the Render prompt waiting');
    for (const [u, audio, max] of [[f.out.url, true, 3e6], [f.before!.url, false, 1.2e6]] as const) { const p = file(u, max); const pr = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,profile,width,height,nb_frames', '-of', 'csv=p=0', p]).toString();
      assert.match(pr, /h264,High,1280,720,95/, `${u}: H.264 High 1280×720, 95 frames (the first shot)`); if (audio) assert.match(pr, /aac/, `${u}: AAC`); else assert.doesNotMatch(pr, /aac/, `${u}: silent`);
      assert.ok(fs.readFileSync(p).subarray(0, 64).includes('moov'), `${u}: faststart`);
      const d = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).toString()); assert.ok(Math.abs(d - 3.958) < 0.05, `${u}: ${d} s, both the same length (in step)`);
      assert.doesNotMatch(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags', '-of', 'json', p]).toString(), /creation_time|location|com\.apple|comment|encoder/i, `${u}: metadata stripped`); }
    for (const u of [FEATURED_BIG_POSTER[F.key], F.first.url, f.before!.url.replace(/\.mp4$/, '.webp')]) { const p = file(u, 2.5e5); assert.ok(!fs.readFileSync(p).includes('Exif'), `${u}: no EXIF`); } file(F.first.thumb, 4e4); file(f.out.poster, 4e4); file(f.before!.poster, 4e4);
    const xs = fs.readFileSync(path.join(WEB, 'ui/explore/ExploreShowcase.tsx'), 'utf8'); const fx = xs.slice(xs.indexOf('export function XpFilm'));
    assert.match(fx, /<HeroReel className="hreel-framed xpo-film xpf-film"[^\n]*\breveal holdSweep parkAt=\{F\.parkAt\} onPhase=\{onPhase\} jump=\{jump\} sound=\{f\.out\.sound === true\} restartOnSound/, 'the shared HeroReel (reveal with a before clip), the shared sound button');
    assert.match(fx, /before=\{\{ url: f\.before\.url[\s\S]*after=\{\{ url: f\.out\.url/, 'mockup → film, both from the featured entry');
    assert.match(fx, /xp-film-recreate">Recreate this shot<[\s\S]*F\.cta\.label/, 'Recreate this shot and Open Direct a Shot');
    const hr = fs.readFileSync(path.join(WEB, 'shared/HeroReel.tsx'), 'utf8'); assert.match(hr, /holdSweep \? 'hold' : 'park'/, 'HeroReel: the held sweep'); assert.match(hr, /p\.x = p\.from \+ \(parkAt - p\.from\) \* ease\(k\)/, 'then the line eases to parkAt');
    assert.match(fs.readFileSync(path.join(WEB, 'ui/Home.tsx'), 'utf8'), /<div className="xp-in">\s*<XpFilm \/>[\s\S]{0,300}<XpSwap \/>/, '3D mockup-to-film opens the control act (the free local rail stays hidden there)'); assert.doesNotMatch(fs.readFileSync(path.join(WEB, 'ui/Home.tsx'), 'utf8'), /^\s*<RealResults \/>/m, 'the free local rail stays hidden');
    assert.doesNotMatch(xs + fs.readFileSync(path.join(WEB, 'ui/explore/exploreShowcase.css'), 'utf8'), /XpWorlds|EXPLORE_WORLDS|xpw-/, 'no Worlds leftovers');
    ok('Mockup to film: Direct a Shot (free) → GPT Image 2.5 Flare ($0.02) → LTX-2.5 + Layout to Render (Comfy Cloud, $0.28), first shot in step, shared HeroReel + sound, Recreate into Direct a Shot'); }
  /* The K-drama beat (one MiniMax H3 run, fb0b44ca, Comfy Cloud, $1.20): its script's timings feed the IIAYN FILMS comedy's subtitles */
  { const W = X.EXPLORE_SCRIPT; const f = FEATURED.find((x) => x.key === W.key)!; assert.ok(f, 'the scene ships as a featured entry');
    assert.deepEqual([f.tab, f.toolId, f.provider, f.modelKey, f.model, f.runOn, f.route, f.costUsd], ['video', 'h3-video', 'comfy-h3', 'minimax-h3', 'MiniMax H3', 'comfy-cloud', 'comfy-cloud:cloud-h3-wf', 1.2], 'MiniMax H3 on Comfy Cloud, its real price');
    assert.match(f.prompt, /^Korean drama comedy scene, 15 seconds/); assert.match(f.prompt, /부딪쳤으면 사과는 해야죠\.[\s\S]*내가 왜\?[\s\S]*그래요\?/, 'the prompt as it ran, Korean lines and all');
    assert.equal(featuredIdOf(W.key), 'a82dd012'); assert.equal(featuredRecreateHref(W.key), '/video?recreate=a82dd012', 'Recreate opens Video with the prompt');
    const p = file(f.out.url, 2.5e6); const pr = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,profile,width,height', '-of', 'csv=p=0', p]).toString();
    assert.match(pr, /h264,High,1280,714/, 'H.264 High'); assert.match(pr, /aac/, 'the voices kept'); assert.ok(fs.readFileSync(p).subarray(0, 64).includes('moov'), 'faststart');
    let added = fs.statSync(p).size; for (const [u, max] of [[FEATURED_BIG_POSTER[W.key], 1.5e5], [f.out.poster, 4e4]] as const) { const q = file(u, max); added += fs.statSync(q).size; assert.ok(!fs.readFileSync(q).includes('Exif'), `${u}: no EXIF`); }
    assert.ok(added <= 2.5e6, `the section adds ≤ 2.5 MB (${added} B)`);
    /* the script: four shots in order, cut where the clip cuts, each line inside its shot */
    assert.deepEqual(W.shots.map((x) => [x.t0, x.t1]), [[0, 6.54], [6.54, 11.17], [11.17, 13.17], [13.17, 15.08]], 'measured cuts');
    for (const x of W.shots) for (const l of x.lines ?? []) { assert.ok(l.t0 >= x.t0 && l.t1 <= x.t1 && l.t0 < l.t1, `${l.en}: inside its shot`); assert.ok(f.prompt.includes(l.ko), `${l.ko}: the prompt's own words`); }
    assert.equal(W.shots.flatMap((x) => x.lines ?? []).length, 3, 'three lines of dialogue');
    { const home = fs.readFileSync(path.join(WEB, 'ui/Home.tsx'), 'utf8'); assert.doesNotMatch(home, /XpScript/, 'the scene left Explore (2026-10-28): it is a film in IIAYN FILMS now'); assert.equal(X.EXPLORE_FILMS.comedy.ko, '그래요?'); }
    ok('The K-drama beat: MiniMax H3 (Comfy Cloud, $1.20), 2.1 MB clip with sound, the script\'s measured cuts and lines (now a film in IIAYN FILMS)'); }
  for (const m of X.EXPLORE_MOODS) assert.ok(m.bpm >= 60 && m.bpm <= 180 && m.words, `mood ${m.id}`);
  ok(`Explore v3: the LTX-2.5 Pro hero with its film credit, ${X.EXPLORE_SHEETS.cast.length} character sheets, Mockup to film; every file ships, every link opens a real page`); }

// ---- web: the Examples shelf and the empty-tab Featured feed are gone ----
for (const f of ['shared/ExamplesShelf.tsx', 'shared/examplesShelf.css']) assert.ok(!fs.existsSync(path.join(WEB, f)), `${f} removed`);
assert.ok(!fs.existsSync(path.join(ROOT, 'server/src/shared/examplesShelf.ts')), 'catalogue removed');
const web = (p: string) => fs.readFileSync(path.join(WEB, p), 'utf8');
assert.ok(!fs.existsSync(path.join(WEB, 'shared/FeaturedFeed.tsx')), 'the empty-tab Featured feed is gone (2026-10-29): the examples are ordinary results in the Examples project');
for (const p of ['ui/next/ImageCanvas.tsx', 'ui/video/VideoStudio.tsx', 'ui/video/VideoWorkflowBar.tsx', 'ui/three/ThreeDStudio.tsx', 'platform/History.tsx']) { assert.doesNotMatch(web(p), /ExamplesShelf|TabExamples|ExamplesToggle/, `${p}: no Examples shelf`); }
assert.match(web('ui/next/feed/FeedToolbar.tsx'), /\['featured', <><StarMark \/>Featured<\/>/, 'the feed toolbar offers Filter › From › Featured');
assert.match(web('shared/ResultView.tsx'), /testid: 'rv-feature'/, 'the viewer offers Feature (the shared ResultMenu row, 2026-10-29)');
ok('web: Examples shelf and empty-tab Featured feed removed; Filter › From › Featured; Feature this');

// Truth (2026-10-27, workflow audit): no "lowest-priced" claim typed by hand, and no "Local" badge on a model that isn't installed (ACE-Step 1.5)
{ const music = EXPLORE_CARDS.find((c) => c.id === 'music')!; assert.equal(music.modelKey, 'yue2', 'Music opens on YuE2 (installed, has runs)');
  assert.ok(!EXPLORE_CARDS.some((c) => c.modelKey === 'ace-step-1.5' && c.badge === 'Local'), 'ACE-Step 1.5 never badged Local');
  assert.ok(!EXPLORE_CARDS.some((c) => /lowest[- ]priced|cheapest/i.test(c.line)), 'no hand-typed cheapest claim');
  ok('Explore Flows: no false cheapest claim; ACE-Step not badged Local'); }

// VFX with LTX-2.5 (2026-10-27) and the audit's leftover Explore fixes (#14, #15, #16, the whale still, ACE-Step)
{ const X = await import('../src/shared/exploreShowcase.ts'); const { FOOTAGE_EFFECTS } = await import('../src/shared/footageFx.ts'); const { LTX_LORAS } = await import('../src/shared/ltxLoras.ts');
  const V = X.EXPLORE_VFX; const tool = getTool('footage-fx') as any; const presets = new Set((tool.presets ?? []).map((p: any) => p.id));
  for (const v of V.effects) { const t = X.vfxTile(v)!; assert.ok(t, `${v.effect}: a Footage Effects pick`); const e = FOOTAGE_EFFECTS.find((x) => x.id === v.effect)!;
    assert.ok(presets.has(t.id), `${t.id}: the tool offers it`); assert.equal(t.lora, LTX_LORAS[e.lora].label, `${t.id}: names its IC-LoRA`); assert.equal(t.maker, 'Lightricks');
    assert.match(t.model, /^LTX-2\.5 22B \+ /); assert.match(t.sourceUrl, /^https:\/\/huggingface\.co\/Lightricks\//); assert.equal(t.href, `/video?workflow=footage-fx&preset=${t.id}`, `${t.id}: Try it opens Footage Effects with it picked`);
    if (t.key) { const f = FEATURED.find((x) => x.key === t.key)!; assert.ok(f?.before, `${t.key}: a shipped before / after`); assert.equal(f.toolId, 'footage-fx'); assert.equal(f.runOn, 'local'); } }
  assert.deepEqual(V.effects.map((v) => v.effect), ['day-to-night', 'vanish', 'flood', 'alpha-matte']);
  const lay = FEATURED.find((x) => x.key === V.layout.key)!; assert.equal(lay.model, 'LTX-2.5 + Layout to Render', 'Layout to Render reuses the Mockup to film clip'); assert.match(V.layout.sourceUrl, /Layout-To-Render/);
  assert.ok(X.EXPLORE_SHOWCASE_LINKS().includes(V.cta.href), 'the section\'s links are checked');
  const home = fs.readFileSync(path.join(WEB, 'ui/Home.tsx'), 'utf8'); assert.match(home, /<XpFilms \/>[\s\S]*?<XpYourTurn \/>\s*<footer/, 'Explore ends with the films, then Now it\u2019s your turn. full width, then the footer'); assert.doesNotMatch(home, /<XpVfx/);
  assert.doesNotMatch(home, /<MadeHere\s*\/>|<Jump\b|<Row\b|className="xp-flows-gap"|data-testid="xp-(learn|all)"/, 'the approved shorter page omits the shared bottom rows, jump links, Learn/Spend cards and workflow chip shelf');
  const xs = fs.readFileSync(path.join(WEB, 'ui/explore/ExploreShowcase.tsx'), 'utf8'); assert.match(xs, /EXPLORE_VFX\.pending/, 'an effect without a shipped example says so');
  // #14: the swap's featured entry keeps the size the run rendered at
  const sw = FEATURED.find((x) => x.key === 'h3-char-swap')!; assert.deepEqual(sw.rendered, { width: 1344, height: 736 });
  // #15: the Made row's model pills are the featured entries' (the walk-by is a Layout to Render render)
  // #16: no stale job id for the swap
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'server/src/shared/exploreShowcase.ts'), 'utf8'), /'h3-char-swap', job d39ac752/);
  // the whale still is credited (GPT Image 2.5 Flare, Comfy Router, job d4ab9018)
  for (const k of ['ltx-pro-whale-glide', 'ltx-pro-whale-dive']) assert.deepEqual(FEATURED.find((x) => x.key === k)!.from, [{ jobId: 'd4ab9018', model: 'GPT Image 2.5 Flare', place: 'Comfy Cloud', costUsd: 0.0159 }]);
  // ACE-Step 1.5 is not installed: Explore never says it runs free here
  assert.doesNotMatch(X.EXPLORE_DANCE.note, /ACE-Step 1\.5 runs free/); assert.match(X.EXPLORE_DANCE.note, /YuE2/);
  ok('VFX with LTX-2.5: 4 Footage Effects tiles (model, IC-LoRA, Lightricks, Try it with the effect picked) + Layout to Render; truth fixes #14, #15, #16, whale still, ACE-Step'); }

// ---- server ----
const PORT = testPort(9231); const B = `http://localhost:${PORT}`; const D = fs.mkdtempSync(path.join(os.tmpdir(), 'xpflows-'));
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: path.join(ROOT, 'server'), env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '300', COMFY_API_KEY: '' }, stdio: ['ignore', 'ignore', 'pipe'], detached: true });
let stderr = ''; srv.stderr!.on('data', (b) => { stderr += String(b); });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 500)); }
  /* the Examples project (2026-10-29): a fresh install's starter results are ordinary results of yours in a normal project, $0, never featured */
  const proj = ((await get('/api/projects')) as any[]).find((p) => p.name === 'Examples'); assert.ok(proj, 'a fresh install has an Examples project');
  assert.equal(proj.count, STARTER.length, 'holding every starter result');
  const vid = await get(`/api/jobs?media=video&status=done&order=desc&cursor=&project=${proj.id}`);
  const starterOf = (re: RegExp) => STARTER.filter((f) => re.test(f.out.url)).length;
  assert.equal(vid.total, starterOf(/\.mp4$/), 'every starter clip is in Examples (Explore-only ones are not)');
  for (const j of vid.items) { assert.equal(j.featured, false); assert.ok(j.example?.key, 'tagged as the app’s example'); assert.equal(j.isOwner, true, 'an ordinary result'); assert.equal(j.cost, 0, '$0'); assert.equal(j.projectId, proj.id); assert.equal(j.status, 'done'); }
  assert.equal(vid.items[0].example.key, 'h3-fox-extend', 'newest first: the starter pack\u2019s new picks lead');
  const img = await get(`/api/jobs?media=image&status=done&cursor=&project=${proj.id}`); assert.equal(img.total, starterOf(/\.webp$/), 'the Image examples too');
  const snd = await get(`/api/jobs?media=audio&status=done&cursor=&project=${proj.id}`); assert.equal(snd.total, 6, 'the Audio examples');
  for (const j of snd.items) { assert.ok(j.example?.key, 'tagged as an example'); assert.equal(j.isOwner, true); }
  assert.equal(snd.items.find((j: any) => j.example.key === 'audio-lofi-piano').example.costUsd, 0.08, 'a cloud sound names its real cost');
  assert.equal((await get('/api/jobs?featured=1&status=done&cursor=')).total, 0, 'nothing is featured until you feature it');
  { const ex = await get(`/api/jobs/${FEATURED_SEED_IDS['ltx-morph']}`); assert.equal(ex.status, 'done', 'an Explore-only entry is still seeded (its Recreate opens)'); assert.equal(ex.featured, false, 'but no tab lists it'); assert.equal(ex.isOwner, false); }
  { const ar = await get(`/api/jobs/${FEATURED_SEED_IDS['audio-last-train']}/prefill?action=recreate`); assert.equal(ar.available, true, JSON.stringify(ar)); assert.equal(ar.tool, 'audio'); assert.match(String(ar.form.prompt), /indie folk/); }
  assert.equal((await get('/api/jobs?cursor=')).total, proj.count, 'the examples are in your own list; Explore-only seeds are not');
  assert.equal((await get('/api/spend/summary')).totals.spentUsd, 0, 'examples never count in Spend'); assert.equal((await get('/api/me/stats')).generations, 0, 'or in your totals');
  const rc = await get(`/api/jobs/${FEATURED_SEED_IDS['ltx-morph']}/prefill?action=recreate`); assert.deepEqual(rc.files, { image: ['/showcase/ltx-village-start.jpg'], lastFrame: ['/showcase/ltx-morph-end.jpg'] }, 'Recreate re-attaches both frames');
  const dr = await get(`/api/jobs/${FEATURED_SEED_IDS['kling-dance-swap']}/prefill?action=recreate`); assert.equal(dr.available, true); assert.deepEqual(dr.files, { video: ['/showcase/kling-dance-swap-in.mp4'], refs: ['/showcase/kling-dance-swap-ref1.jpg', '/showcase/kling-dance-swap-ref2.jpg'] }, 'Recreate re-attaches the dance clip and both photos');
  const hr = await get(`/api/jobs/${FEATURED_SEED_IDS['h3-char-swap']}/prefill?action=recreate`); assert.equal(hr.available, true, JSON.stringify(hr)); assert.equal(hr.tool, 'object-swap');
  assert.deepEqual(hr.files, { video: ['/showcase/h3-char-swap-in.mp4'], refs: ['/showcase/h3-char-swap-face.jpg'] }, 'Recreate re-attaches the clip and the photo');
  { const kr = await get(`/api/jobs/${FEATURED_SEED_IDS['h3-koi-take']}/prefill?action=recreate`); assert.equal(kr.available, true, JSON.stringify(kr)); assert.equal(kr.tool, 'h3-extend');
    assert.deepEqual(kr.files, { video: ['/showcase/h3-koi-take-in.mp4'] }, 'Recreate re-attaches the first 10 s'); assert.match(String(kr.form.prompt ?? ''), /^Continue the same action/, 'and the extend prompt');
    assert.equal(String(kr.form.extendSeconds), '10', '+10 s'); assert.equal(kr.modelKey, 'minimax-h3-extend', 'Recreate names the H3 Extend card (the engine also serves H3 Max Extend)');
    assert.doesNotMatch(String(kr.form.prompt), /continue the action naturally/i, 'the direction phrase is not in the box (added once at submit)'); }
  for (const [k, dur] of [['ltx-pro-whale-glide', '6'], ['ltx-pro-whale-dive', '10']] as const) { const wr = await get(`/api/jobs/${FEATURED_SEED_IDS[k]}/prefill?action=recreate`);
    assert.equal(wr.available, true, JSON.stringify(wr)); assert.equal(wr.tool, 'h3-video'); assert.deepEqual(wr.files, { image: ['/showcase/ltx-pro-whale-in.jpg'] }, `${k}: Recreate re-attaches the still`);
    assert.equal(wr.form.provider, 'router-ltx-25-pro', `${k}: on LTX-2.5 Pro`); assert.equal(wr.routeId, 'comfy-cloud:cloud-ltx25-pro-api', `${k}: on Comfy Cloud`); assert.equal(String(wr.form.duration), dur); assert.equal(wr.form.resolution, '1080p');
    assert.match(String(wr.form.prompt), /^The whale /, `${k}: and the prompt`); }
  assert.equal(hr.form.target, 'the woman on the right', 'and the person to swap'); assert.equal(hr.form.resolution, '1080p');
  const lr = await get(`/api/jobs/${FEATURED_SEED_IDS['image-layers-paw']}/prefill?action=recreate`); assert.equal(lr.available, true, JSON.stringify(lr)); assert.equal(lr.tool, 'app-image-layers');
  assert.deepEqual(lr.files, { image: ['/showcase/image-layers-paw-in.jpg'] }, 'Recreate re-attaches the poster');
  { const lj = await get(`/api/jobs/${FEATURED_SEED_IDS['image-layers-paw']}`); assert.equal(lj.outputs.length, 13, 'the seeded layers job carries every layer'); assert.equal(lj.outputs[12].label, 'Right brown and white dog'); assert.ok(lj.layersPosterUrl, 'a layered job (composite poster)'); }
  { const sr = await get(`/api/jobs/${FEATURED_SEED_IDS['sheet-kaito']}/prefill?action=recreate`); assert.equal(sr.available, true, JSON.stringify(sr)); assert.equal(sr.tool, 'create-image');
    assert.equal(sr.modelKey, 'gpt-image-2.5-flare'); assert.equal(sr.routeId, 'comfy-router:api-gpt-image-25-flare'); assert.match(String(sr.form.prompt), /KAITO VEY/); assert.equal(sr.form.aspect, '3:2'); }
  { const kd = await get(`/api/jobs/${FEATURED_SEED_IDS['h3-kdrama-script']}/prefill?action=recreate`); assert.equal(kd.available, true, JSON.stringify(kd)); assert.equal(kd.tool, 'h3-video');
    assert.deepEqual([kd.form.provider, kd.routeId, kd.modelKey, String(kd.form.duration), kd.form.resolution], ['comfy-h3', 'comfy-cloud:cloud-h3-wf', 'minimax-h3', '15', '768p'], 'Script → Screen: Recreate on MiniMax H3, Comfy Cloud, 15 s 768p');
    assert.match(String(kd.form.prompt), /^Korean drama comedy scene/, 'and the prompt'); }
  { const fr = await get(`/api/jobs/${FEATURED_SEED_IDS['ltx-mockup-film']}`); assert.equal(fr.status, 'done'); assert.equal(fr.resultUrl, '/showcase/ltx-mockup-film.mp4'); }
  ok('the Examples project: every starter result, ordinary and $0, tagged with its real model and price; Recreate brings the frames back');
  // a sample run: a real still at the asked shape, a real clip at the asked shape (no test patterns)
  const sub = async (tool: string, f: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries({ rights: '1', ...f })) fd.append(k, v); const d = await (await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd })).json() as any; assert.ok(d.id, JSON.stringify(d)); return d; };
  const im = await sub('create-image', { prompt: 'a red mug', aspect: '1:1', types: '["generate"]' }); const vd = await sub('h3-video', { prompt: 'a lighthouse', aspect: '9:16', duration: '6', types: '["t2v"]' });
  assert.equal(vd.provider, 'router-ltx-25-pro', 'the Video tab runs its cloud default, LTX-2.5 Pro (cloud first, 2026-10-27)');
  const done = async (id: string) => { for (let i = 0; i < 120; i++) { const j = await get(`/api/jobs/${id}`); if (j.status === 'done' || j.status === 'failed') return j; await new Promise((r) => setTimeout(r, 300)); } throw new Error('timeout'); };
  const ji = await done(im.id); const jv = await done(vd.id); assert.equal(ji.status, 'done'); assert.equal(jv.status, 'done');
  const dims = (u: string) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path.join(D, u.replace(/^\/files\//, ''))]).toString().trim();
  assert.equal(dims(ji.resultUrl), '1024,1024', '1:1 sample image is square'); assert.equal(dims(jv.resultUrl), '1080,1920', '9:16 sample clip is vertical (LTX-2.5 Pro: 1080p)');
  ok('sample runs: a real still / clip at the asked shape');
  // Feature this: your own result
  const f1 = await (await fetch(`${B}/api/jobs/${ji.id}/feature`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on: true }) })).json() as any; assert.equal(f1.featured, true);
  const mine = await get('/api/jobs?featured=1&media=image&status=done&order=desc&cursor='); assert.equal(mine.items[0].id, ji.id, 'your featured result leads'); assert.equal(mine.items[0].example, null);
  const f0 = await (await fetch(`${B}/api/jobs/${ji.id}/feature`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"on":false}' })).json() as any; assert.equal(f0.featured, false);
  const r = await fetch(`${B}/api/jobs/nope/feature`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); assert.equal(r.status, 404);
  ok('Feature this: on, listed first, off; unknown job 404');
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* gone */ } fs.rmSync(D, { recursive: true, force: true }); if (process.exitCode) console.error(stderr.slice(-2000)); }
console.log('explore-flows: all checks passed');
process.exit(0);
