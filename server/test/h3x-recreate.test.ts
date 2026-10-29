// Recreate keeps the model card + place of an engine shared by several cards, and Extend's direction words are added once (2026-10-27).
//  1 recreateModelKey: h3-extend comfy-h3-extend serves H3 Extend (local, Comfy Cloud, Router) and H3 Max Extend (fal); the job's card comes back
//    per route (and from its recorded modelKey); same for upscale / app-video-upscale comfy-seedvr2 and remove-bg comfy-birefnet-video; null when the
//    engine means one card
//  2 withExtendDirection: added once, never doubled on a Recreate / an old doubled prompt, none when the prompt already asks to continue
// Run: npx tsx test/h3x-recreate.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'h3xrec-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const { recreateModelKey } = await import('../src/routesPrefill.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { withExtendDirection, stripExtendDirections, EXTEND_DIRECTIONS } = await import('../src/shared/extendPrompt.ts');

// ---------- 1 model card per route ----------
const key = (toolId: string, provider: string, route: string | null, modelKey?: string | null, input: any = {}) => { const t = getTool(toolId); assert.ok(t, toolId); return recreateModelKey(t!, { provider, route, input, modelKey } as any); };
for (const [route, want] of [['comfy-cloud:cloud-h3-extend', 'minimax-h3-extend'], ['comfy-router:comfy-h3-extend', 'minimax-h3-extend'], ['local:comfy-h3-extend', 'minimax-h3-extend'], ['fal:minimax/h3-max/extend-video', 'minimax-h3-max-extend']] as const)
  assert.equal(key('h3-extend', 'comfy-h3-extend', route), want, route);
assert.equal(key('h3-extend', 'comfy-h3-extend', 'comfy-cloud:cloud-h3-extend', 'minimax-h3-extend'), 'minimax-h3-extend', 'recorded modelKey');
assert.equal(key('h3-extend', 'comfy-h3-extend', null, 'minimax-h3-max-extend'), 'minimax-h3-max-extend', 'recorded modelKey, no route');
assert.equal(key('h3-extend', 'comfy-h3-extend', 'comfy-cloud:cloud-h3-extend', 'not-a-card'), 'minimax-h3-extend', 'unknown recorded key → by route');
assert.equal(key('h3-extend', 'comfy-ltx25-extend', null), 'ltx-2.5-22b', 'LTX-2.5 extend: one card, still named so the page switches to it');
ok('h3-extend: H3 Extend on local / Comfy Cloud / Router, H3 Max Extend on fal, recorded modelKey wins');
for (const tool of ['upscale', 'app-video-upscale']) { if (!getTool(tool)) continue;
  assert.equal(key(tool, 'comfy-seedvr2', 'local:comfy-seedvr2'), 'seedvr2-3b-video', `${tool} local`);
  assert.equal(key(tool, 'comfy-seedvr2', 'fal:fal-ai/seedvr/upscale/video'), 'seedvr2', `${tool} fal`); }
assert.equal(key('remove-bg', 'comfy-birefnet-video', 'local:comfy-birefnet-video'), 'birefnet');
assert.equal(key('remove-bg', 'comfy-birefnet-video', 'fal:bria/video/background-removal'), 'bria-video-background-removal');
ok('other shared engines: SeedVR2 (upscale), BiRefNet / Bria (remove-bg) come back per route');
const koi = fs.readFileSync(path.join(import.meta.dirname, '../src/shared/featured.ts'), 'utf8').match(/recreateHref: `\$\{VIDEO_PAGE\}\?workflow=extend&recreate=2fb5ac80[^`]*`/)?.[0];
assert.ok(koi && !/model=/.test(koi), `koi recreateHref needs no ?model= now: ${koi}`);
ok('Explore koi: plain ?recreate= (the workaround is gone)');

// ---------- 2 direction words once ----------
const F = EXTEND_DIRECTIONS.forward;
assert.equal(withExtendDirection('', 'forward'), F, 'empty → the phrase');
assert.equal(withExtendDirection(null, 'sequel'), EXTEND_DIRECTIONS.sequel);
assert.equal(withExtendDirection('A koi swims over the roofs.', 'forward'), `A koi swims over the roofs. ${F}`, 'appended once, no ..');
const once = withExtendDirection('A koi swims over the roofs', 'forward');
assert.equal(withExtendDirection(once, 'forward'), once, 'idempotent (Recreate sends the stored prompt again)');
assert.equal(withExtendDirection(withExtendDirection(once, 'forward'), 'forward'), once, 'idempotent ×3');
assert.equal(withExtendDirection(`Same moment, same camera style. ${F}. ${F}`, 'forward'), `Same moment, same camera style. ${F}`, 'an old doubled prompt is cleaned');
assert.equal(withExtendDirection('Continue the same action at the same pace: the koi circles once.', 'forward'), 'Continue the same action at the same pace: the koi circles once.', 'already asks to continue → nothing added');
assert.equal(withExtendDirection(`Continue the same action: the koi circles. Soft shimmer continues. ${F}`, 'forward'), 'Continue the same action: the koi circles. Soft shimmer continues.', 'the koi prompt: stored phrase dropped');
assert.equal(withExtendDirection('He keeps going down the road', 'backward'), 'He keeps going down the road');
assert.equal(withExtendDirection(`A dog runs. ${F}`, 'sequel'), `A dog runs. ${EXTEND_DIRECTIONS.sequel}`, 'direction changed on Recreate: the old phrase is swapped, not stacked');
assert.equal(withExtendDirection(`Continue the run. ${EXTEND_DIRECTIONS['camera-pull']}`, 'camera-pull'), `Continue the run. ${EXTEND_DIRECTIONS['camera-pull']}`, 'camera-pull always says its move, once');
assert.equal(withExtendDirection('A cat CONTINUE THE ACTION NATURALLY', 'forward'), `A cat. ${F}`, 'case-insensitive');
assert.equal(stripExtendDirections(`x. ${F}. ${F}.`), 'x.', 'strip: every trailing copy');
assert.equal(stripExtendDirections('   '), '');
ok('Extend direction words: once, idempotent, none when the prompt already continues, old doubles cleaned');
const src = fs.readFileSync(path.join(import.meta.dirname, '../src/tools/editVideo/index.ts'), 'utf8');
assert.ok(/withExtendDirection\(p, d\)/.test(src) && !/DIRECTIONS\[d\]\]\.filter\(Boolean\)\.join/.test(src), 'Extend parse uses the shared once-only helper');
ok('Extend parse sends prompt / finalPrompt / hostedPrompt through the shared helper');
fs.rmSync(D, { recursive: true, force: true });
console.log('h3x-recreate: all ok');
