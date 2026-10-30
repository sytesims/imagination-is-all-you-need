// Ad layout card (2026-10-30): cover crop, headline wrap / shrink / "…", the bottom-up layout per size, button ink, file names, "Edit ad" geometry (clamping, snapping, picture framing, per-size edits) and the
// shared store-only zip writer. Run: npx tsx test/ad-layout.test.ts   (no server, no network, no browser)
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crc32 as nodeCrc } from 'node:zlib';
import { AD_PRESETS, coverCrop, fitLines, wrapWords, layoutAd, inkOn, buttonColorOf, adVariants, adFileName, scrimAlpha, type AdMeasure } from '../../web/src/canvas/adLayout.ts';
import { AD_PLATFORMS, AD_PLATFORM_LIST, AD_SHAPES, adSizesFor, asPlatforms, asShape, type AdPlatform } from '../../web/src/canvas/adPlatforms.ts';
import { asEdits, clampBox, clearArea, guidesFor, isEdited, moveFrame, picCrop, placeOf, snapBox, snapTo, type AdEdit } from '../../web/src/canvas/adEdit.ts';
import { BUILTIN_KIT } from '../src/shared/brandKit.ts';
import { crc32, zipStore } from '../src/shared/zipStore.ts';
const ok = (m: string) => console.log('ok ' + m);
/** A fake font: every character is 0.55 em wide. */
const measure: AdMeasure = (t, px) => t.length * px * 0.55;

// ---- cover crop: centred, fills the frame, never stretches ----
assert.deepEqual(coverCrop(2000, 1000, 1080, 1080), { x: 500, y: 0, w: 1000, h: 1000 }, 'very wide: the middle square');
const tall = coverCrop(500, 3000, 1080, 1350); assert.equal(tall.w, 500); assert.ok(Math.abs(tall.h - 625) < 1e-9); assert.ok(Math.abs(tall.y - 1187.5) < 1e-9, 'very tall: the middle band');
assert.deepEqual(coverCrop(0, 0, 1080, 1080), { x: 0, y: 0, w: 0, h: 0 });
ok('cover crop');

// ---- wrap, shrink, then "…" ----
assert.deepEqual(wrapWords('one two three', 10 * 0.55 * 10, (s) => s.length * 5.5), ['one two', 'three']);
const short = fitLines('Fresh coffee', 900, 3, 88, 56, (s, px) => measure(s, px, 'heading')); assert.equal(short.px, 88); assert.deepEqual(short.lines, ['Fresh coffee']);
const long = 'The best fresh roasted coffee in town delivered to your door every single morning before you wake up';
const f = fitLines(long, 920, 3, 88, 56, (s, px) => measure(s, px, 'heading'));
assert.ok(f.lines.length <= 3 && f.px < 88 && f.px >= 56, 'a long headline wraps to 3 lines, then shrinks');
assert.ok(f.lines.every((l) => measure(l, f.px, 'heading') <= 920), 'every line fits');
const huge = fitLines(long + ' ' + long + ' ' + long, 920, 3, 88, 56, (s, px) => measure(s, px, 'heading'));
assert.equal(huge.px, 56); assert.equal(huge.lines.length, 3); assert.ok(huge.lines[2].endsWith('…'), 'too long even at the smallest size: ends in …');
assert.ok(huge.lines.every((l) => measure(l, 56, 'heading') <= 920));
const word = fitLines('Supercalifragilisticexpialidocious'.repeat(3), 400, 3, 88, 56, (s, px) => measure(s, px, 'heading'));
assert.ok(word.lines[0].endsWith('…') && measure(word.lines[0], word.px, 'heading') <= 400, 'one huge word is cut');
assert.deepEqual(fitLines('   ', 900, 3, 88, 56, (s, px) => measure(s, px, 'heading')).lines, []);
ok('headline: wrap to 3 lines, shrink, then …');

// ---- the layout: bottom up, inside the margins, empty fields not drawn ----
const full = { headline: 'Fresh coffee, every morning', offer: 'From $4 · first cup free', button: 'Order now' };
for (const k of ['1x1', '4x5', '9x16'] as const) {
  const { w: W, h: H } = AD_SHAPES[k]; const l = layoutAd(W, H, full, { w: 400, h: 100 }, measure);
  assert.ok(l.button && l.offer && l.headline && l.logo, k);
  assert.ok(l.headline!.y + l.headline!.lineH * l.headline!.lines.length <= l.offer!.y, `${k}: headline above the offer`);
  assert.ok(l.offer!.y + l.offer!.px <= l.button!.y, `${k}: offer above the button`);
  assert.ok(l.button!.y + l.button!.h <= H - l.margin && l.button!.x + l.button!.w <= W - l.margin, `${k}: button inside the margins`);
  assert.ok(l.logo!.y + l.logo!.h < l.headline!.y, `${k}: logo clear of the headline`);
  assert.ok(l.scrim!.from < l.headline!.y, `${k}: the scrim starts above the text`);
}
const none = layoutAd(1080, 1080, { headline: '', offer: '', button: '' }, null, measure);
assert.equal(none.headline, null); assert.equal(none.offer, null); assert.equal(none.button, null); assert.equal(none.logo, null); assert.equal(none.scrim, null, 'nothing typed: no scrim');
const onlyHead = layoutAd(1080, 1080, { headline: 'Hello', offer: '', button: '' }, null, measure); assert.ok(onlyHead.headline && !onlyHead.offer && !onlyHead.button);
const longBtn = layoutAd(1080, 1080, { headline: '', offer: '', button: 'Click here to claim your very special discount today before it is gone' }, null, measure);
assert.ok(longBtn.button!.w <= 1080 - 2 * longBtn.margin && longBtn.button!.text.endsWith('…'), 'a very long button: shrinks, then …');
const wideLogo = layoutAd(1080, 1080, full, { w: 4000, h: 100 }, measure); assert.ok(wideLogo.logo!.w <= 1080 * 0.4 + 1e-9, 'a very wide logo is capped');
assert.ok(scrimAlpha(1) > scrimAlpha(0), 'a light picture gets a darker scrim');
ok('layout: bottom up, margins, empty fields, long button, wide logo');

// ---- platforms: each one's sizes, the union, old cards ----
const shapesOf = (ps: AdPlatform[]) => adSizesFor(ps).map((s) => `${s.shape}:${s.w}x${s.h}`);
assert.deepEqual(shapesOf(['meta']), ['1x1:1080x1080', '4x5:1080x1350', '9x16:1080x1920'], 'Instagram & Facebook: square, feed, stories');
assert.deepEqual(shapesOf(['tiktok']), ['9x16:1080x1920']);
assert.deepEqual(shapesOf(['x']), ['1x1:1200x1200', '16x9:1200x675']);
assert.deepEqual(shapesOf(['pinterest']), ['2x3:1000x1500']);
assert.deepEqual(shapesOf(['linkedin']), ['1x1:1200x1200', '191x1:1200x628']);
assert.deepEqual(shapesOf(['youtube']), ['9x16:1080x1920', '16x9:1280x720']);
const all = adSizesFor(AD_PLATFORM_LIST); assert.equal(all.length, 6, 'all six: one tab per shape, no repeats');
assert.equal(new Set(all.map((s) => s.shape)).size, all.length);
assert.equal(all.find((s) => s.shape === '1x1')!.w, 1200, 'a shared shape is drawn at the biggest size asked for');
const story9 = adSizesFor(['meta', 'tiktok', 'youtube']).find((s) => s.shape === '9x16')!;
assert.deepEqual(story9.safe, { top: 0.15, right: 0.18, bottom: 0.35, left: 0.06 }, '9:16 keeps clear of every picked app');
assert.deepEqual(adSizesFor(['meta']).find((s) => s.shape === '4x5')!.safe, { top: 0, right: 0, bottom: 0, left: 0 }, 'feed: nothing covers it');
assert.deepEqual(adSizesFor([]), [], 'no platform: no sizes (the card keeps the last ones)');
for (const p of AD_PLATFORM_LIST) for (const s of AD_PLATFORMS[p].sizes) assert.ok(Math.abs(s.w / s.h - AD_SHAPES[s.shape].w / AD_SHAPES[s.shape].h) < 0.02, `${p} ${s.name}: matches its shape`);
assert.deepEqual(asPlatforms(undefined), ['meta'], 'an old card: Instagram & Facebook'); assert.deepEqual(asPlatforms(['youtube', 'nope', 'meta']), ['meta', 'youtube']); assert.deepEqual(asPlatforms([]), []);
assert.equal(asShape('square'), '1x1'); assert.equal(asShape('portrait'), '4x5'); assert.equal(asShape('story'), '9x16'); assert.equal(asShape('191x1'), '191x1'); assert.equal(asShape('?'), '4x5');
ok('platforms: sizes per platform, one tab per shape, safe zones combined, old cards');

// ---- every layout × every size × every mix: inside the frame, out of the safe zones, nothing on top of each other ----
const longHead = { ...full, headline: 'The best fresh roasted coffee in town, delivered to your door every single morning before you wake up' };
const inside = (b: { x: number; y: number; w: number; h: number }, a: { x: number; y: number; w: number; h: number }) => b.x >= a.x - 0.5 && b.y >= a.y - 0.5 && b.x + b.w <= a.x + a.w + 0.5 && b.y + b.h <= a.y + a.h + 0.5;
const apart = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
let checked = 0;
for (const mix of [...AD_PLATFORM_LIST.map((p) => [p]), AD_PLATFORM_LIST] as AdPlatform[][]) for (const size of adSizesFor(mix)) for (const { id } of AD_PRESETS) for (const t of [full, longHead]) for (const logo of [{ w: 400, h: 100 }, null]) {
  const { w: W, h: H, safe } = size; const l = layoutAd(W, H, t, logo, measure, { safe, preset: id }); const at = `${mix.join('+')} ${size.label} ${id}`;
  const clear = { x: safe.left * W, y: safe.top * H, w: W - (safe.left + safe.right) * W, h: H - (safe.top + safe.bottom) * H };
  const head = { x: l.headline!.x, y: l.headline!.y, w: Math.max(...l.headline!.lines.map((s) => measure(s, l.headline!.px, 'heading'))), h: l.headline!.lineH * l.headline!.lines.length };
  if (l.align === 'center') head.x = l.col.x + (l.col.w - head.w) / 2;
  const offer = { x: l.offer!.x, y: l.offer!.y, w: measure(l.offer!.text, l.offer!.px, 'offer'), h: l.offer!.px * 1.25 }; if (l.align === 'center') offer.x = l.col.x + (l.col.w - offer.w) / 2;
  const parts = [head, offer, l.button!, ...(l.logo ? [l.logo] : [])];
  for (const b of parts) { assert.ok(inside(b, l.area), `${at}: inside the margins`); assert.ok(inside(b, clear), `${at}: out of the safe zones`); }
  if (l.logo) for (const b of [head, offer, l.button!]) assert.ok(apart(l.logo, b), `${at}: the logo doesn't touch the words`);
  assert.ok(head.y + head.h <= offer.y && offer.y + offer.h <= l.button!.y + 0.5, `${at}: headline, offer, button in order`);
  if (id === 'split') { assert.ok(l.panel && inside(head, l.panel) && inside(l.button!, l.panel), `${at}: the words sit on the panel`); assert.ok(l.pic.w > 0 && l.pic.h > 0, `${at}: the picture still shows`); }
  checked++;
}
assert.ok(checked > 100); ok(`presets: ${checked} layouts in bounds, out of the safe zones`);
const wide = layoutAd(1200, 628, full, null, measure, { preset: 'split' }); assert.equal(wide.pic.w, 600, 'split on a wide size: picture on the left half');
const tallSplit = layoutAd(1080, 1350, full, null, measure, { preset: 'split' }); assert.equal(tallSplit.pic.w, 1080, 'split on a tall size: picture on top'); assert.ok(tallSplit.panel!.y === tallSplit.pic.h);

// ---- "Edit ad": hand-placed parts stay in the clear area, snapping, picture framing, per-size edits ----
for (const mix of [...AD_PLATFORM_LIST.map((p) => [p]), AD_PLATFORM_LIST] as AdPlatform[][]) for (const size of adSizesFor(mix)) {
  const { w: W, h: H, safe } = size; const clear = clearArea(W, H, safe); const at = `${mix.join('+')} ${size.label}`;
  /* every corner and edge, far outside, very small and very big */
  for (const [x, y] of [[-1, -1], [2, -1], [-1, 2], [2, 2], [0.5, -3], [0.5, 3], [-3, 0.5], [3, 0.5], [0.4, 0.4]]) for (const k of [0.001, 0.2, 5]) {
    const edit: AdEdit = { at: { logo: { x, y, w: k }, headline: { x, y, w: k, s: k / 4 }, offer: { x, y, s: k / 6 }, button: { x, y, w: k } } };
    const l = layoutAd(W, H, longHead, { w: 400, h: 100 }, measure, { safe, preset: 'bottom', edit });
    for (const p of ['logo', 'headline', 'offer', 'button'] as const) { const b = l.boxes[p]!; assert.ok(b && inside(b, clear), `${at} ${p} at ${x},${y} × ${k}: inside the clear area`); }
    const hl = l.headline!; assert.ok(hl.lines.every((s) => measure(s, hl.px, 'heading') <= hl.w + 0.5), `${at}: headline lines fit their block`);
    assert.ok(measure(l.button!.text, l.button!.px, 'button') <= l.button!.w, `${at}: button words fit the button`);
  }
}
ok('edit: every part clamped inside the clear area in every size, at every edge, corner and size');
const tiny = adSizesFor(AD_PLATFORM_LIST).find((s) => s.shape === '9x16')!; const tc = clearArea(tiny.w, tiny.h, tiny.safe);
assert.ok(Math.abs(tc.x - 0.06 * 1080) < 1e-6 && Math.abs(tc.y - 0.15 * 1920) < 1e-6 && Math.abs(tc.w - 0.76 * 1080) < 1e-6 && Math.abs(tc.h - 0.5 * 1920) < 1e-6, 'all six in 9:16: the combined clear area');
assert.deepEqual(clampBox({ x: -50, y: 9999, w: 100, h: 100 }, { x: 0, y: 0, w: 500, h: 500 }), { x: 0, y: 400, w: 100, h: 100 });
assert.deepEqual(clampBox({ x: 10, y: 10, w: 900, h: 10 }, { x: 0, y: 0, w: 500, h: 500 }).x, 0, 'too wide: on the left edge');

// snapping: the nearest guide within the threshold, nothing beyond it
assert.deepEqual(snapTo([100], [96, 108], 6), { d: -4, at: 96 }); assert.deepEqual(snapTo([100], [107, 120], 6), { d: 0, at: null }, 'beyond the threshold: no snap');
assert.deepEqual(snapTo([100, 150], [153, 97.5], 6), { d: -2.5, at: 97.5 }, 'the nearest of all edges wins');
const g = guidesFor(1080, 1080, { x: 0, y: 0, w: 1080, h: 1080 }, { x: 80, y: 80, w: 920, h: 920 }, [{ x: 600, y: 700, w: 200, h: 100 }]);
const sc = snapBox({ x: 437, y: 300, w: 200, h: 50 }, g, 8); assert.equal(sc.box.x, 440, 'centre snaps to the frame centre'); assert.equal(sc.gx, 540); assert.equal(sc.gy, null);
const se = snapBox({ x: 84, y: 696, w: 100, h: 100 }, g, 8); assert.equal(se.box.x, 80, 'left edge to the margin'); assert.equal(se.box.y, 700, 'top to another part');
ok('snapping: nearest guide within the threshold');

// picture framing: always covers the frame (inside the picture, the frame's shape) at any zoom and focal point
for (const [sw, sh] of [[4000, 3000], [800, 2400], [1080, 1080]]) for (const [fw, fh] of [[1080, 1920], [1200, 628], [1080, 1080], [600, 1350]]) for (const zoom of [1, 1.7, 4, 9, 0.2]) for (const fx of [0, 0.3, 1, -2, 5]) for (const fy of [0, 0.7, 1, 3]) {
  const c = picCrop(sw, sh, fw, fh, { zoom, fx, fy }); const at = `${sw}x${sh} in ${fw}x${fh} zoom ${zoom} at ${fx},${fy}`;
  assert.ok(c.x >= -1e-6 && c.y >= -1e-6 && c.x + c.w <= sw + 1e-6 && c.y + c.h <= sh + 1e-6, `${at}: inside the picture`);
  assert.ok(Math.abs(c.w / c.h - fw / fh) < 1e-6 && c.w > 0, `${at}: the frame's shape, so no empty edges`);
}
assert.deepEqual(picCrop(2000, 1000, 1080, 1080, null), coverCrop(2000, 1000, 1080, 1080), 'no framing: the plain cover crop');
const zoomed = moveFrame(null, 4000, 3000, 1080, 1080, 0, 0, 2); assert.equal(zoomed.zoom, 2);
const far = moveFrame(zoomed, 4000, 3000, 1080, 1080, 99999, 99999); const fc = picCrop(4000, 3000, 1080, 1080, far);
assert.ok(Math.abs(fc.x) < 1e-6 && Math.abs(fc.y) < 1e-6, 'dragged right and down to the limit: the top-left corner shows');
const back = moveFrame(far, 4000, 3000, 1080, 1080, -100, 0); assert.ok(picCrop(4000, 3000, 1080, 1080, back).x > 0, 'and moves straight back (no dead zone)');
ok('picture: covers the frame at any zoom and focal point; drag stops at the edges');

// per size: edited sizes draw where the user put them, untouched sizes stay automatic, old cards unchanged
const sq = layoutAd(1080, 1080, full, { w: 400, h: 100 }, measure); const moved = placeOf({ ...sq.boxes.button!, x: 300, y: 200 }, 1080, 1080);
const edits = asEdits({ '1x1': { at: { button: moved } }, '4x5': {} });
const e1 = layoutAd(1080, 1080, full, { w: 400, h: 100 }, measure, { edit: edits['1x1'] });
assert.equal(e1.button!.x, 300); assert.equal(e1.button!.y, 200); assert.deepEqual(e1.headline, sq.headline, 'other parts keep their spot');
assert.ok(!isEdited(edits['4x5']) && edits['4x5'] === undefined, 'an empty edit is no edit');
const f45 = layoutAd(1080, 1350, full, { w: 400, h: 100 }, measure, { edit: edits['4x5'] }); assert.deepEqual(f45, layoutAd(1080, 1350, full, { w: 400, h: 100 }, measure), 'an untouched size is automatic');
assert.deepEqual(asEdits(undefined), {}, 'an old card: no edits'); assert.deepEqual(asEdits({ x: { at: { logo: { x: 'a' } }, hide: ['headline', 'nope'] } }), {}, 'odd values are dropped');
const scaled = layoutAd(1200, 1200, full, { w: 400, h: 100 }, measure, { edit: edits['1x1'] }); assert.ok(Math.abs(scaled.button!.x - 300 * 1200 / 1080) < 1e-6, 'fractions: the same spot on a bigger 1:1');
const hid = layoutAd(1080, 1080, full, { w: 400, h: 100 }, measure, { edit: { hide: ['offer', 'logo'] } }); assert.equal(hid.offer, null); assert.equal(hid.logo, null); assert.ok(hid.button && hid.headline, 'hidden parts are left out');
assert.ok(isEdited({ hide: ['offer'] }) && isEdited({ pic: { zoom: 1.5, fx: 0.5, fy: 0.5 } }) && !isEdited({ pic: { zoom: 1, fx: 0.5, fy: 0.5 } }));
for (const [W, H, safe] of [[1080, 1920, { top: 0.15, right: 0.18, bottom: 0.35, left: 0.06 }], [1080, 1350, undefined], [1200, 628, undefined]] as const) for (const preset of ['bottom', 'center'] as const) {
  const a = layoutAd(W, H, longHead, null, measure, { safe, preset }); const hb = a.boxes.headline!;
  const b = layoutAd(W, H, longHead, null, measure, { safe, preset, edit: { at: { headline: placeOf(hb, W, H, a.headline!.px) } } });
  assert.deepEqual(b.headline!.lines, a.headline!.lines, `${W}x${H} ${preset}: picking up the headline keeps its lines`); assert.equal(b.headline!.px, a.headline!.px);
  for (const k of ['x', 'y', 'w', 'h'] as const) assert.ok(Math.abs(b.boxes.headline![k] - hb[k]) < 1e-6, `${W}x${H} ${preset}: same box`);
}
ok('per size: edits as fractions, untouched sizes automatic, old cards unchanged, hidden parts');

// ---- brand colours and readable ink ----
assert.equal(buttonColorOf(BUILTIN_KIT), '#FF7A1A');
assert.equal(buttonColorOf({ ...BUILTIN_KIT, colors: [] }), '#FFFFFF', 'no colours: white, never our orange');
assert.equal(buttonColorOf(null), '#FFFFFF');
assert.equal(buttonColorOf({ ...BUILTIN_KIT, colors: [{ hex: '#000', name: '', role: 'background' }, { hex: '#1a73e8', name: '', role: '' }] }), '#1A73E8', 'no primary: the first non-background colour');
assert.equal(inkOn('#FFFFFF'), '#14151A'); assert.equal(inkOn('#0A0A0A'), '#FFFFFF'); assert.equal(inkOn('#FFE14D'), '#14151A'); assert.equal(inkOn('#1A73E8'), '#FFFFFF');
ok('brand: button colour, readable text on it');

// ---- the pack: variants and file names ----
assert.deepEqual(adVariants(['A', '', 'C']), [{ n: 1, headline: 'A' }, { n: 3, headline: 'C' }]);
assert.deepEqual(adVariants(['', ' ', '']), [{ n: 0, headline: '' }], 'no headline: one plain variant');
assert.equal(adFileName('Café Lumière', 1, '4x5'), 'cafe-lumiere-headline1-4x5.png');
assert.equal(adFileName('', 0, AD_SHAPES['191x1'].tag), 'ad-1.91x1.png');
ok('pack: variants and clear file names');

// ---- the shared zip writer: crc matches node, the archive opens ----
const bytes = new TextEncoder().encode('123456789'); assert.equal(crc32(bytes), 0xcbf43926); assert.equal(crc32(bytes), nodeCrc(bytes) >>> 0);
const z = zipStore([{ name: 'a.txt', data: bytes }, { name: 'b/c.txt', data: new TextEncoder().encode('hello') }]);
assert.equal(new DataView(z.buffer).getUint32(0, true), 0x04034b50); assert.equal(new DataView(z.buffer).getUint32(z.length - 22, true), 0x06054b50);
const dir = mkdtempSync(path.join(tmpdir(), 'adzip-')); try {
  writeFileSync(path.join(dir, 'p.zip'), z);
  let listed = ''; try { listed = execFileSync('unzip', ['-t', path.join(dir, 'p.zip')], { encoding: 'utf8' }); } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
  if (listed) assert.match(listed, /No errors detected/);
} finally { rmSync(dir, { recursive: true, force: true }); }
ok('zip: crc-32, headers, a valid archive');
console.log('ad-layout: all ok');
