// The 3D page's feed and viewer, UX audit batch A (2026-10-27): web/src/ui/three/feed3d.ts (pure) and the sources that use it.
// Covers: filter order (Models first after All) and the per-workflow default (Image to 3D / Turntable → Models; Direct a Shot → Mockups +
// Renders; never an empty feed), video card posters (every card video has a poster), the short card caption, examples that aren't in this
// app, the viewer in the URL (shared useFeedViewer), the shared Favourite / Share / More on the 3D viewer, no second "Download GLB", the
// start view, and the aria labels.
// Run: npx tsx test/three-d-feed.test.ts   (no server, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
const WEB = path.resolve(import.meta.dirname, '../../web/src'); const web = (p: string) => fs.readFileSync(path.join(WEB, p), 'utf8');
const ok = (m: string) => console.log('ok ' + m);
const F = await import('../../web/src/ui/three/feed3d.ts');

// ---- filter order + default ----
assert.deepEqual(F.KINDS.map((k) => k.id), ['all', '3d', 'preview', 'real'], 'All, then Models first');
assert.equal(F.KINDS.find((k) => k.id === '3d')!.label, 'Models', '"3D" is now "Models"');
const counts = { '3d': 2, preview: 3, real: 1 };
assert.deepEqual(F.shownKinds(null, 'image-to-3d', counts), ['3d']); assert.deepEqual(F.shownKinds(null, 'turntable', counts), ['3d']);
assert.deepEqual(F.shownKinds(null, 'plan-a-shot', counts), ['preview', 'real']);
assert.equal(F.shownKinds(null, 'image-to-3d', { '3d': 0, preview: 3, real: 0 }), null, 'no models yet: All, never an empty feed');
assert.equal(F.shownKinds(null, 'plan-a-shot', { '3d': 4, preview: 0, real: 0 }), null, 'no mockups yet: All');
assert.deepEqual(F.shownKinds(['real'], 'image-to-3d', counts), ['real'], 'a pick wins over the default');
assert.deepEqual(F.countKinds([{ toolId: 'three-d' }, { toolId: 'three-d-turntable' }, { toolId: 'plan-a-shot' }, { toolId: 'make-it-real' }]), { '3d': 2, preview: 1, real: 1 });
const studio = web('ui/three/ThreeDStudio.tsx');
assert.match(studio, /useFeedKinds\(results, wf\.id\)/, 'the feed filter follows the workflow');
assert.doesNotMatch(studio, /label: '3D' \}/, 'no "3D" chip label left');
ok('filter: Models first, default follows the workflow, falls back to All');

// ---- video card posters ----
assert.equal(F.videoCardPoster({ resultUrl: '/files/a-out0.mp4', outputs: [{ url: '/files/a-out0.mp4', posterUrl: '/api/media/poster?url=%2Ffiles%2Fa-out0.mp4' }] }, 320)?.startsWith('/api/media/thumb?url='), true, 'the server poster, as a grid thumb');
assert.match(F.videoCardPoster({ resultUrl: '/files/b-out0.mp4', outputs: [{ url: '/files/b-out0.mp4' }] })!, /^\/api\/media\/thumb\?url=%2Fapi%2Fmedia%2Fposter%3Furl%3D%252Ffiles%252Fb-out0\.mp4&w=\d+$/, 'no posterUrl yet: the poster route');
assert.equal(F.videoCardPoster({ resultUrl: null, outputs: [] }), undefined); assert.equal(F.videoCardPoster({ resultUrl: 'https://x.test/v.mp4' }), undefined, 'remote clips: no poster route');
const cardSrc = studio.slice(studio.indexOf('function Card('), studio.indexOf('function Showcase(')); const videos = cardSrc.match(/<video\b[^>]*>/g) ?? [];
const cardVideos = videos.filter((v) => !/t3-tt/.test(v)); /* the 3D card's hover turntable sits over the model's still */
assert.ok(cardVideos.length >= 4, 'mockup, render (+ its plan inset) and turntable cards'); for (const v of cardVideos) assert.match(v, /\bposter=\{/, `every card video has a poster: ${v.slice(0, 80)}`);
assert.match(web('ui/three/threeD.css'), /video:not\(\[data-ready\]\)[^{]*\{[^}]*animation: t3-shimmer/, 'a shimmer until the video is ready');
ok('video cards: first-frame poster + shimmer');

// ---- card caption ----
assert.equal(F.metaShort({ faces: 1_400_000, bytes: 44e6 }), '1.4M faces'); assert.equal(F.metaShort({ faces: 7200, bytes: 1 }), '7k faces');
assert.equal(F.metaShort({ faces: null, bytes: 4.2e6 }), '4.2 MB'); assert.equal(F.metaShort(null), '');
assert.match(studio, /parts=\{\[metaShort\(meta\), price/, 'cards use the short line'); assert.doesNotMatch(studio, /metaLine\(/, 'the long line stays in the viewer');
ok('card caption: short 3D line');

// ---- examples ----
const models = [{ id: 'cloud-tripo-31', name: 'Tripo 3.1' }, { id: 'fal-trellis2', name: 'TRELLIS.2' }, { id: 'comfy-pixal3d-trellis2', name: 'Pixal3D + TRELLIS.2' }];
assert.equal(F.exampleModel('Tripo 3.1', models)?.id, 'cloud-tripo-31'); assert.equal(F.exampleModel('Pixal3D', models)?.id, 'comfy-pixal3d-trellis2');
for (const n of ['Meshy 7.1', 'Rodin Gen-2.5', 'Rodin Gen-2.5 Fast', 'Tripo P1']) assert.equal(F.exampleModel(n, models), null, `${n}: not in this app`);
assert.match(studio, /data-testid="v3d-use-image"[\s\S]{0,300}Use this image</, 'examples: Use this image');
assert.match(studio, /t3-ex-notin-/, 'example cards mark models not in this app');
assert.match(studio, /className=\{`t3-ex-in\$\{inOk\.has\(s\.id\) \? ' ok' : ''\}`\}/, 'the input box shows only once its picture loaded');
const v3d = web('shared/Viewer3D.tsx');
assert.match(v3d, /inputLabel: threeDMode\(j\.input \?\? \{\}\) === 'multiview-to-3d' \? 'Front' : 'Image'/, 'multiview input is labelled Front');
assert.equal((v3d.match(/Download GLB</g) ?? []).length, 0, 'no second Download GLB button (the GLB tile downloads it)');
assert.equal((v3d.match(/data-testid="v3d-download"/g) ?? []).length, 1, 'one GLB download tile');
ok('examples: Use this image, not-in-app marks, no duplicate download');

// ---- viewer in the URL + shared actions ----
assert.match(studio, /useFeedViewer\(/, 'the shared viewer-in-URL hook (?view=<id>)'); assert.doesNotMatch(studio, /useState<\{ kind: 'job'/, 'no local viewer state');
assert.match(studio, /<ResultView job=\{viewJob\} variant="viewer"/, 'a 3D job opens in the shared ResultView (Favourite, Share, More)');
const rv = web('shared/ResultView.tsx');
assert.match(rv, /<Viewer3D [^\n]*headActions=\{fav\}[\s\S]{0,400}tiles=\{sample \? null : <>\{shareBtn && <button[^>]*data-testid="rv-share"[\s\S]{0,200}\{moreOf\([^)]*\)\}/, 'Viewer3D gets the shared Share and More (the one ResultMenu, 2026-10-29)');
assert.match(v3d, /primary\?: ReactNode;[\s\S]*tiles\?: ReactNode; [^\n]*children\?: ReactNode/, 'Viewer3D: new optional props only (API stays compatible)');
ok('viewer: ?view=<id>, shared Favourite / Share / More');

// ---- start view + a11y ----
const m3 = web('shared/model3d.tsx');
assert.match(m3, /START_ORBIT = '-30deg 75deg 120%'/); assert.match(m3, /'camera-orbit': cameraOrbit/); assert.match(m3, /'cloud-tripo-31': '60deg 75deg 120%'/);
assert.match(studio, /data-testid="t3-model" aria-label=\{`Model: \$\{modelName\}\. Change model`\}/, 'model chip label');
assert.match(web('shared/ResultViewer.tsx'), /aria-label=\{open \? 'Hide details' : 'Show details'\} data-testid="rvx-details-toggle"/, 'details collapse label');
assert.match(v3d, /aria-label="Auto-rotate"/, 'rotate button label');
assert.match(v3d, /<Model3D key=\{item\.key\} /, 'Textured / Clay keep the same viewer (no remount per look)'); assert.match(m3, /applyLook\(m, look\); \}, \[look, state\]\)/, 'the look is applied in place');
assert.match(web('shared/ResultViewer.tsx'), /root\.inert = true/, 'the page behind any viewer (3D too) is inert');
ok('start view off-front; aria labels; page behind the viewer inert');

// ---- UX audit batch B (2026-10-27): the Render step's mockup, coming-soon links, picker order, option captions + prices, price before required inputs ----
{ const pj = (id: string, template: string, extra: Record<string, unknown> = {}, status = 'done', scene = 'preset') => ({ id, toolId: 'plan-a-shot', status, input: { previz: { scene, presetName: template, shot: { template, move: 'dolly', ...extra } } } });
  const jobs = [pj('n1', 'city-night', {}, 'running'), pj('w2', 'walk-by', { move: 'push-in' }), pj('c3', 'city', { cameraPath: { takes: [{ id: 't1' }], chosen: 't1' } }), pj('w4', 'walk-by'), pj('i5', 'x', {}, 'done', 'imported'), { id: 'm6', toolId: 'make-it-real', status: 'done', input: {} }];
  assert.equal(F.mockupForShot(jobs, { template: 'walk-by', move: 'dolly', takeId: null, imported: false })?.id, 'w4', 'same set and same move wins over a newer other move');
  assert.equal(F.mockupForShot(jobs, { template: 'walk-by', move: 'orbit', takeId: null, imported: false })?.id, 'w2', 'same set, no exact move: the newest of that set');
  assert.equal(F.mockupForShot(jobs, { template: 'city', move: 'dolly', takeId: 't1', imported: false })?.id, 'c3', 'the same flown take');
  assert.equal(F.mockupForShot(jobs, { template: 'city-night', move: 'dolly', takeId: null, imported: false }), null, 'a mockup still saving or another set never stands in (the audit: night on stage, a day take offered)');
  assert.equal(F.mockupForShot(jobs, { template: 'walk-by', move: 'dolly', takeId: null, imported: true })?.id, 'i5', 'an imported scene takes an imported mockup');
  assert.equal(F.mockupForShot([], { template: 'walk-by', move: 'dolly', takeId: null, imported: false }), null, 'no mockups');
  assert.match(studio, /mockupForShot\(results, \{ template: shot\.template/, 'the Render step uses it');
  assert.match(studio, /data-testid="ps-use-last"/, 'no mockup of this shot: the newest one is one click away, never silent');
  ok('Render step: the mockup of the shot on stage'); }
{ const T = await import('../src/shared/threeD.ts');
  for (const m of T.THREE_D_MODELS) for (const f of ['detail', 'texture', 'faces'] as const) for (const o of m[f] ?? []) {
    assert.ok(o.note && o.note.length <= 30, `${m.name} ${f} ${o.label} has a short caption`); assert.doesNotMatch(o.note!, /\$/, `${m.name} ${f} ${o.label}: the price is shown live, not in the caption`); }
  assert.match(studio, /optPrice=\{optPrice\}/, 'the 3D bar passes option prices to the shared group panels');
  assert.match(studio, /useVariantQuotes\(/, 'option prices come from the shared variant quotes (= Generate once picked)');
  assert.match(web('ui/next/WorkflowBar.tsx'), /<OptPrice text=\{optPrice\(c\.field, o\.value\)\}/, 'the shared panel shows the shared OptPrice');
  assert.match(studio, /const priceFirst = !!inputMissing && !gate && !unpricedWhy && !blockWhy && credits != null/, 'the price shows before required inputs are added in every generation mode');
  assert.match(studio, /const inputMissing = textMode \? .*multiMode \? .*Add one more view/, 'price-first readiness covers text, multiview and image inputs');
  assert.match(studio, /priceFirst \? <><GenPrice/, 'missing-input price and next step use the existing button column, so neither clips');
  assert.match(studio, /const isSoon = wf\.status === 'soon'/, 'a coming-soon link is guarded');
  for (const w of T.THREE_D_WORKFLOWS.filter((x) => x.status === 'soon')) assert.match(studio, new RegExp(`'?${w.id}'?: \\{ line: `), `${w.name} points to what works today`);
  assert.match(studio, /noModel = isTT \|\| isPS \|\| isSoon/, 'no Image to 3D controls on a coming-soon workflow');
  const picker = web('shared/WorkflowPicker.tsx');
  assert.match(picker, /data-testid=\{`\$\{prefix\}-soon-toggle`\}/, 'the picker has one Coming soon group');
  assert.match(picker, /const rows = showSoon \? \[\.\.\.ready, \.\.\.later\] : ready/, 'working workflows first; the soon ones after, only when open');
  ok('coming-soon guard, picker order, option captions + prices, price before required inputs'); }
