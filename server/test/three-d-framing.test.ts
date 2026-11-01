// 3D framing (2026-11-02): web/src/shared/front3d.ts (pure) and the card still. Tiles showed a tall model's head only (the poster <img> grew
// to its own height inside the grid button) and some Tripo models side-on (posters saved with an older start view).
// Stills came out cut on a slow GPU (model-viewer's lowered render scale).
// Covers: each model's front (Tripo 3.1 faces +X), the start view 30° off it, posters from an older framing made again (not a sample's or a
// rig's), the still fitted inside the card above its caption, and the viewer / poster maker using the shared start view.
// Run: npx tsx test/three-d-framing.test.ts   (no server, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
const WEB = path.resolve(import.meta.dirname, '../../web/src'); const web = (p: string) => fs.readFileSync(path.join(WEB, p), 'utf8');
const ok = (m: string) => console.log('ok ' + m);
const F = await import('../../web/src/shared/front3d.ts');

assert.equal(F.frontOf({ provider: 'cloud-tripo-31' }), 90, 'Tripo 3.1 faces +X');
assert.equal(F.frontOf({ provider: 'scenario' }), 0); assert.equal(F.frontOf(null), 0); assert.equal(F.frontOf({}), 0, 'unknown: +Z');
assert.equal(F.orbitFor(0), '330deg 75deg 120%'); assert.equal(F.orbitFor(90), '60deg 75deg 120%', '3/4 view of a +X model');
assert.equal(F.orbitFor(270), '240deg 75deg 120%'); assert.equal(F.orbitFor(10, -30), '340deg 75deg 120%', 'wraps below 0');
assert.equal(F.orbitFor(350, 30), '20deg 75deg 120%', 'wraps above 360'); assert.equal(F.START_ORBIT, F.orbitFor(0));
assert.equal(F.startOrbitOf({ provider: 'cloud-tripo-31' }), '60deg 75deg 120%'); assert.equal(F.startOrbitOf(undefined), F.START_ORBIT);
for (const p of ['cloud-tripo-31', 'x', null]) { const o = F.startOrbitOf({ provider: p }); const th = parseFloat(o); const front = F.frontOf({ provider: p });
  const off = Math.min(Math.abs(th - front), 360 - Math.abs(th - front)); assert.ok(off <= 45, `${p}: the start view shows the front (${off}° off)`); }
ok('front per provider; start view 30° off the front, wrapped');

const P = (o: any) => ({ threeD: { posterUrl: '/files/a-poster.png', ...o } });
assert.equal(F.posterStale({}), true, 'no poster yet'); assert.equal(F.posterStale(P({})), true, 'a poster from before the framing fix');
assert.equal(F.posterStale(P({ posterV: F.POSTER_V })), false); assert.equal(F.posterStale(P({ posterV: F.POSTER_V - 1 })), true);
assert.equal(F.posterStale({ ...P({}), demo: true }), false, 'samples keep the stills they ship with');
assert.equal(F.posterStale({ ...P({}), input: { rig: { name: 'x' } } }), false, 'a rig keeps its own still');
assert.equal(F.posterStale({ outputs: [{ posterUrl: '/files/b.png' }], threeD: { posterV: F.POSTER_V } }), false, 'outputs[0].posterUrl counts');
assert.equal(F.posterOf3d({ outputs: [{ posterUrl: '/files/b.png' }] }), '/files/b.png'); assert.equal(F.posterOf3d(null), null);
ok('posters from an older framing are made again; samples and rigs keep theirs');

const css = web('ui/three/threeD.css'); const rule = css.match(/\.t3 \.t3-hit img \{[^}]*\}/)?.[0] ?? '';
assert.match(rule, /position: absolute/, 'the card still is placed in the card, not sized by the grid row'); assert.match(rule, /object-fit: contain/);
assert.match(rule, /inset: 10px 10px 46px/, 'kept above the caption');
const studio = web('ui/three/ThreeDStudio.tsx'); const v3d = web('shared/Viewer3D.tsx'); const m3 = web('shared/model3d.tsx');
assert.match(studio, /jobs\.filter\(\(j\) => posterStale\(j\)/, 'the poster maker remakes stale stills'); assert.match(studio, /cameraOrbit=\{startOrbitOf\(next\)\}/);
assert.match(v3d, /fd\.append\('posterV', String\(POSTER_V\)\)/, 'stills are saved with their framing version');
assert.match(v3d, /posterSaved\.current = !!item\.poster && !item\.posterStale/, 'the viewer replaces a stale still'); assert.match(v3d, /cameraOrbit: startOrbitOf\(j\)/);
assert.doesNotMatch(m3, /ORBIT_BY_PROVIDER|'-30deg 75deg 120%'/, 'one source for start views');
assert.match(m3, /minimumRenderScale = 1;[^]*?toBlob\(\{ mimeType: 'image\/png', idealAspect: true \}\)[^]*?minimumRenderScale = was/, 'stills render at full scale (a slow GPU cut them in half), then the setting comes back');
assert.match(studio, /if \(liveViewerId\(\) !== 'poster'\) return;/, 'no still while an opened viewer holds the renderer');
ok('card still fits; poster maker + viewer share the start view and the framing version; stills at full render scale');
