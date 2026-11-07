// Canvas release 1 (2026-11-06), plain rules with no browser: auto titles (never "Untitled"), the pick ask (only a click after the ask
// counts, deleted choices drop out, the edge chip, the server's timeout) and the Ctrl / ⌘ + wheel zoom curve.
// Run: cd server && npx tsx test/canvas-card-look.test.ts
import assert from 'node:assert/strict';
const { autoTitle, promptTitle, failHeadline } = await import('../../web/src/canvas/cardLook.ts');
const { pickFromSelection, livePickChoices, pickOffscreen } = await import('../../web/src/canvas/pickAsk.ts');
const { wheelZoomFactor, wheelPixels, zoomAround, ZOOM_STEP_MAX } = await import('../../web/src/canvas/rf/zoom.ts');
const { pickExpired } = await import('../src/canvasAgent.ts');
const ok = (m: string) => console.log('ok ' + m);

// ---- auto titles ----
assert.equal(autoTitle({ kind: 'gen', name: '  Hero close-up ', prompt: 'anything' }), 'Hero close-up', 'your name wins');
assert.equal(autoTitle({ kind: 'gen', flow: 'material-swap', inputs: [{ label: 'Armchair' }, { label: 'velvet.jpg', many: true }] }), 'Velvet armchair');
assert.equal(autoTitle({ kind: 'gen', flow: 'material-swap', inputs: [{ label: 'armchair.png' }, { label: 'velvet', many: true }, { label: 'gold', many: true }] }), '2 materials armchair');
assert.equal(autoTitle({ kind: 'gen', flow: 'material-swap', inputs: [{ label: 'Armchair' }], flowName: 'Material Swap' }), 'Armchair', 'no swatch yet: the object');
assert.equal(autoTitle({ kind: 'gen', flow: 'create-image', prompt: 'A red coat in a white studio, soft light', flowName: 'Create Image' }), 'Red coat in a white studio', 'small words stay; only a leading article goes');
assert.equal(autoTitle({ kind: 'gen', flow: 'animate', prompt: 'She crosses the neon street, slow push-in, rain on the lens.' }), 'She crosses the neon street');
assert.equal(autoTitle({ kind: 'gen', flow: 'create-image', prompt: '   ', flowName: 'Create Image' }), 'Create Image', 'an empty prompt: the workflow');
assert.equal(autoTitle({ kind: 'gen', prompt: '' }), 'Generate');
assert.equal(autoTitle({ kind: 'upload', fileName: 'kaito_sheet.final.png' }), 'kaito sheet.final');
assert.equal(autoTitle({ kind: 'upload', fileName: '' }), 'Upload');
assert.equal(autoTitle({ kind: 'result', title: 'Neon crossing' }), 'Neon crossing');
assert.equal(autoTitle({ kind: 'result', title: '', prompt: 'a koi made of paper lanterns' }), 'Koi made of paper lanterns');
/* non-Latin: words written without spaces keep their first 24 characters; spaced scripts still use words */
assert.equal(promptTitle('雨の夜、ネオンの通りを渡る女性、ゆっくりとしたプッシュイン'), '雨の夜、ネオンの通りを渡る女性、ゆっ…', 'no spaces: a short first clause is not enough, cut at 18 characters');
assert.equal(promptTitle('ネオンの通りを渡る女性、ゆっくりとしたプッシュイン'), 'ネオンの通りを渡る女性', 'no spaces: the first clause');
assert.equal(promptTitle('Девушка в красном пальто идёт по мокрой улице'), 'Девушка в красном пальто идёт по…', 'other scripts with spaces: cut at a word');
assert.equal(promptTitle('Make an image of Tokyo at night'), 'Make an image of Tokyo at night');
assert.equal(promptTitle('The lighthouse keeper finds a glowing bottle on the shore at dawn'), 'Lighthouse keeper finds…', 'a long clause ends neatly with …');
assert.equal(promptTitle('"a koi in the rain."'), 'Koi in the rain');
assert.notEqual(autoTitle({ kind: 'gen' }), 'Untitled');
ok('auto titles: your name, Material Swap, the prompt in its own words cut with …, file names, non-Latin, never Untitled');

// ---- a failed card leads with its reason ----
assert.deepEqual(failHeadline('Kling refused the start frame: its content check said no.'), { head: 'Kling refused the start frame', rest: 'Its content check said no.' });
assert.deepEqual(failHeadline('Out of memory on your GPU. Try a smaller size'), { head: 'Out of memory on your GPU', rest: 'Try a smaller size.' });
assert.deepEqual(failHeadline('Canceled.'), { head: 'Canceled', rest: '' });
assert.equal(failHeadline(''), null, 'no reason: the shared wording'); assert.equal(failHeadline(null), null);
ok('failed: the reason is the heading');

// ---- the pick ask ----
const choices = ['a', 'b'];
assert.equal(pickFromSelection({ before: ['a'], now: ['a'], choices, pressedSinceAsk: true }), null, 'a card already selected when the ask came is not a pick');
assert.equal(pickFromSelection({ before: [], now: ['a'], choices, pressedSinceAsk: false }), null, 'a selection with no click after the ask (the agent, an undo) is not a pick');
assert.equal(pickFromSelection({ before: [], now: ['a'], choices, pressedSinceAsk: true }), 'a', 'a click on a choice is');
assert.equal(pickFromSelection({ before: ['x'], now: ['b'], choices, pressedSinceAsk: true }), 'b');
assert.equal(pickFromSelection({ before: [], now: ['c'], choices, pressedSinceAsk: true }), null, 'not a choice');
assert.equal(pickFromSelection({ before: [], now: ['a', 'b'], choices, pressedSinceAsk: true }), null, 'two cards is not one pick');
assert.deepEqual(livePickChoices(['a', 'b', 'c'], (id) => id !== 'b'), ['a', 'c'], 'a deleted choice drops out');
const view = { minX: 0, minY: 0, maxX: 1000, maxY: 800 }; const box = (x: number, y: number) => ({ minX: x, minY: y, maxX: x + 300, maxY: y + 400 });
assert.equal(pickOffscreen([box(2000, 0), box(-900, 0)], view), true, 'all off screen: the edge chip');
assert.equal(pickOffscreen([box(2000, 0), box(800, 600)], view), false, 'one on screen (even partly): no chip');
assert.equal(pickOffscreen([], view), false);
assert.equal(pickExpired({ status: 'waiting', createdAt: 0 }, 1000, 1000), true, 'the server closes a pick nobody answered');
assert.equal(pickExpired({ status: 'waiting', createdAt: 0 }, 999, 1000), false);
assert.equal(pickExpired({ status: 'picked', createdAt: 0 }, 5000, 1000), false);
ok('pick: only a click after the ask counts; deleted choices drop; edge chip only when all are off screen; timeout');

// ---- Ctrl / ⌘ + wheel zoom ----
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;
assert.ok(close(wheelZoomFactor(-100, 0), Math.exp(0.15)), 'pixels: exp(-deltaY × 0.0015)');
assert.ok(close(wheelZoomFactor(100, 0) * wheelZoomFactor(-100, 0), 1), 'in and out cancel');
assert.equal(wheelPixels(3, 1), 48, 'lines × 16'); assert.equal(wheelPixels(1, 2, 700), 700, 'pages × the board height');
assert.ok(close(wheelZoomFactor(3, 1), Math.exp(-48 * 0.0015)), 'a mouse notch in lines zooms like 48 px');
assert.equal(wheelZoomFactor(-100000, 0), ZOOM_STEP_MAX, 'one event never zooms past the clamp'); assert.equal(wheelZoomFactor(1, 2, 100000), 1 / ZOOM_STEP_MAX);
assert.ok(close(wheelZoomFactor(-4, 0), Math.exp(0.04)), 'a trackpad pinch step (small pixel delta) zooms at 0.01/px');
assert.ok(close(wheelZoomFactor(-30, 0), Math.exp(0.1)), 'a pinch step is capped at 10 px');
{ let f = 1; for (let i = 0; i < 40; i++) f *= wheelZoomFactor(-4, 0); assert.ok(f > 3 && f < 7, `a full pinch zooms 3–7× (${f.toFixed(2)})`); }
const cam = { x: 10, y: 20, z: 1 }; const at = { x: 400, y: 300 }; const n = zoomAround(cam, at, 2, 0.05, 4);
assert.equal(n.z, 2); assert.ok(close(at.x / cam.z - cam.x, at.x / n.z - n.x) && close(at.y / cam.z - cam.y, at.y / n.z - n.y), 'the point under the pointer stays');
assert.equal(zoomAround({ x: 0, y: 0, z: 4 }, at, 2, 0.05, 4).z, 4, 'kept within the zoom range');
ok('zoom: one smooth curve, normalised by deltaMode, clamped, around the pointer');
console.log('canvas-card-look: all ok');
process.exit(0);
