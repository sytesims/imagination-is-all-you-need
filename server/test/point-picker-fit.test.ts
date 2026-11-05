// Who-to-swap click on a letterboxed frame (shared/PointPicker.tsx, 2026-11-06): the click is stored against the picture (object-fit: contain), not the
// box, so a 9:16 clip in a wide box keeps its x / y; the dot is drawn back on the same area. Run: npx tsx test/point-picker-fit.test.ts
import assert from 'node:assert/strict';
const { contentRect } = await import('../../web/src/shared/frameFit.ts');
const near = (a: number, b: number, m: string) => assert.ok(Math.abs(a - b) < 1e-6, `${m}: ${a} ≠ ${b}`);
const ok = (m: string) => console.log('ok ' + m);

/* a 540×960 portrait clip in the 366×260 who-to-swap box: black bars left and right */
{ const f = contentRect(366, 260, 540, 960); const w = (260 * 540 / 960) / 366; near(f.w, w, 'portrait width'); near(f.h, 1, 'portrait height'); near(f.l, (1 - w) / 2, 'portrait bar'); near(f.t, 0, 'portrait top');
  /* a click on the picture's right edge is x = 1, not x ≈ 0.7 of the box */
  const boxX = f.l + f.w; near((boxX - f.l) / f.w, 1, 'right edge of the picture'); }
/* landscape filling the box: no bars */
{ const f = contentRect(366, 206, 1280, 720); assert.ok(Math.abs(f.l) < 0.01 && Math.abs(f.t) < 0.01 && Math.abs(f.w - 1) < 0.02 && Math.abs(f.h - 1) < 0.02, 'landscape fills'); }
/* square in a wide box, and a wide clip in a tall box (bars top and bottom) */
{ const f = contentRect(400, 260, 720, 720); near(f.w, 260 / 400, 'square width'); near(f.l, (1 - 260 / 400) / 2, 'square bar'); }
{ const f = contentRect(200, 400, 1920, 1080); near(f.w, 1, 'wide in tall: width'); near(f.h, (200 * 1080 / 1920) / 400, 'wide in tall: height'); near(f.t, (1 - f.h) / 2, 'wide in tall: top bar'); }
/* nothing known yet (no size, no metadata): the whole box, as before */
assert.deepEqual(contentRect(0, 0, 0, 0), { l: 0, t: 0, w: 1, h: 1 }); assert.deepEqual(contentRect(366, 260, 0, 960), { l: 0, t: 0, w: 1, h: 1 });
ok('who-to-swap clicks map to the picture, not the letterboxed box (portrait, landscape, square, wide in tall, unknown size)');
