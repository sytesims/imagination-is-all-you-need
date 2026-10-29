// Input prep + pre-flight (2026-10-23): the pure rules behind "Fit to 4:3" / "Crop" and Generate's problem list.
// Covers: fit / crop geometry (shared/photoFit.ts: whole pixels, the ratio within the server's 1%, never upscaled, 4096 cap, very tall / wide,
// tiny photos), crop box placement and keyboard nudges; the compat rule (imageCaps checkImageCaps photoAspect: a follow-photo edit model runs a
// locked 4:3 when the photo is 4:3), photoFitOf on the real recipes; the submit's header reader (imageDims: PNG, JPEG, EXIF quarter turn);
// preflightProblems (shared/preflight.ts): order inputs → model → setup → money, several at once, the right-aspect photo has none.
// Run: npx tsx test/photo-prep.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { fitPlan, cropBox, cropPlan, nudgeBox, sizeFor, tooSmall, PREP_MAX_SIDE } from '../src/shared/photoFit.ts';
import { checkImageCaps, sameShape, ratioOf } from '../src/shared/imageCaps.ts';
import { imageWorkflowsPayload, photoFitOf, workflowQuoteQueries } from '../src/shared/workflows.ts';
import { preflightProblems, shapeName, PREFLIGHT_CODES } from '../src/shared/preflight.ts';
import { imageDimsOf } from '../src/imageDims.ts';
const ok = (m: string) => console.log('ok ' + m);

// ---- 1. geometry ----
for (const [w, h] of [[1080, 1920], [4000, 3000], [3000, 4000], [6000, 1000], [500, 9000], [130, 130], [1, 1], [8192, 8192]] as const)
  for (const a of ['4:3', '16:9', '9:16', '1:1', '3:2', '21:9']) {
    const f = fitPlan(w, h, a); assert.ok(sameShape(`${f.width}:${f.height}`, a, 0.005) || Math.min(f.width, f.height) < 200, `fit ${w}×${h} → ${a}: ${f.width}×${f.height}`);
    assert.ok(Math.max(f.width, f.height) <= PREP_MAX_SIDE, 'fit: capped'); assert.ok(f.photo.x >= 0 && f.photo.y >= 0 && f.photo.x + f.photo.w <= f.width && f.photo.y + f.photo.h <= f.height, 'fit: the photo is inside');
    assert.ok(f.photo.w <= w && f.photo.h <= h, 'fit: never upscaled'); assert.ok(Math.abs(f.photo.w / f.photo.h - w / h) / (w / h) < 0.02 || f.photo.w < 50 || f.photo.h < 50, 'fit: the photo keeps its shape');
    const b = cropBox(w, h, a); assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= w && b.y + b.h <= h, 'crop: inside'); assert.ok(b.w === w || b.h === h, 'crop: the largest box (touches two sides)');
    const c = cropPlan(w, h, a, b); assert.ok(Math.max(c.width, c.height) <= Math.min(PREP_MAX_SIDE, Math.max(b.w, b.h)) + 1, 'crop: capped, never upscaled');
  }
{ const f = fitPlan(1080, 1920, '4:3'); assert.deepEqual(f, { width: 2560, height: 1920, photo: { x: 740, y: 0, w: 1080, h: 1920 } }, '9:16 → 4:3: bands left and right'); }
{ const f = fitPlan(4000, 3000, '4:3'); assert.deepEqual(f.photo, { x: 0, y: 0, w: 4000, h: 3000 }, 'already 4:3: the photo fills it'); }
{ const f = fitPlan(10000, 1000, '4:3'); assert.equal(f.width, 4096); assert.equal(f.height, 3072); assert.ok(f.photo.h < 500, 'a very wide photo: a thin strip in the middle'); }
assert.deepEqual(sizeFor('4:3', 4096), { width: 4096, height: 3072 }); assert.deepEqual(sizeFor('9:16', 1920), { width: 1080, height: 1920 });
assert.ok(tooSmall(127, 900) && !tooSmall(128, 128), 'tiny: under 128 px on the short side');
ok('fit / crop geometry: whole pixels at the ratio, inside, capped at 4096, never upscaled (tall, wide, tiny, square)');
{ const b = cropBox(1080, 1920, '4:3'); assert.deepEqual(b, { x: 0, y: 555, w: 1080, h: 810 }, 'centred crop');
  assert.deepEqual(cropBox(1080, 1920, '4:3', 0.5, 0), { x: 0, y: 0, w: 1080, h: 810 }, 'top'); assert.deepEqual(cropBox(1080, 1920, '4:3', 0.5, 1), { x: 0, y: 1110, w: 1080, h: 810 }, 'bottom (clamped)');
  assert.equal(nudgeBox(b, 1080, 1920, 0, 1).y, 555 + 19, 'arrow: 1% of the photo'); assert.equal(nudgeBox(b, 1080, 1920, 0, -1, true).y, 555 - 192, 'Shift: 10%');
  assert.equal(nudgeBox(b, 1080, 1920, 1, 0).x, 0, 'no room sideways: stays'); assert.equal(nudgeBox({ ...b, y: 1100 }, 1080, 1920, 0, 1, true).y, 1110, 'clamped at the edge'); }
ok('crop box: centred, placed by its centre, arrow nudges 1% / Shift 10%, clamped');

// ---- 2. compat: a follow-photo edit model runs a locked aspect when the photo already has it ----
assert.equal(ratioOf('4:3'), 4 / 3); assert.equal(ratioOf('2560x1920'), 4 / 3); assert.equal(ratioOf('nope'), null);
assert.ok(sameShape('2560:1920', '4:3') && sameShape('1441:1081', '4:3') && !sameShape('1080:1920', '4:3'), 'sameShape within 1%');
{ const bad: any = checkImageCaps('comfy-flux3-klein', { aspect: '4:3', mode: 'edit', refs: 1 }); assert.ok(bad.ok && /keeps it when editing/.test(bad.notes?.[0]), `no photo shape: made in the photo's shape, with a note (D5): ${JSON.stringify(bad)}`);
  const no: any = checkImageCaps('comfy-flux3-klein', { aspect: '4:3', mode: 'edit', refs: 1, photoAspect: '1080:1920' }); assert.ok(no.ok && !no.followsPhoto && no.notes?.length, '9:16 photo: runs in the photo\'s shape, with a note');
  const yes = checkImageCaps('comfy-flux3-klein', { aspect: '4:3', mode: 'edit', refs: 1, photoAspect: '2560:1920' }); assert.ok(yes.ok && yes.followsPhoto === true && yes.aspect === '4:3', 'fitted 4:3 photo: runs, following the photo');
  const gen = checkImageCaps('comfy-flux3-klein', { aspect: '4:3', mode: 'generate', photoAspect: '1:1' }); assert.ok(gen.ok && !gen.followsPhoto, 'generate ignores the photo shape');
  const any = checkImageCaps('api-nano-banana', { aspect: '4:3', mode: 'edit', refs: 1, photoAspect: '1080:1920' }); assert.ok(any.ok && !any.followsPhoto, 'a model that renders any aspect needs no prep'); }
ok('checkImageCaps: photoAspect makes a locked 4:3 run on a follow-photo edit model only when the photo is 4:3');
{ const getTool = (id: string) => ({ id, inputs: [{ name: 'image', kind: 'file' }, { name: 'prompt', kind: 'text' }], providers: ['comfy-flux3-klein', 'api-nano-banana', 'comfy-qwen-image'],
    app: { gallery: { locked: id === 'app-character-sheet' ? { types: '["generate"]', aspect: '4:3' } : { types: '["edit"]' }, modeWhenFile: id === 'app-character-sheet' || id === 'app-product-shot' ? { image: '["edit"]' } : null, providersByMode: null, fields: [] } } });
  const ws = (imageWorkflowsPayload(getTool as any) as any).workflows as any[]; const cs = ws.find((w) => w.id === 'character-sheet'); const rl = ws.find((w) => w.id === 'relight');
  assert.equal(photoFitOf(cs, 'edit', 'comfy-flux3-klein'), '4:3'); assert.equal(photoFitOf(cs, 'generate', 'comfy-flux3-klein'), null, 'text only: nothing to fit');
  assert.equal(photoFitOf(cs, 'edit', 'api-nano-banana'), null, 'renders 4:3 itself'); assert.equal(photoFitOf(rl, 'edit', 'comfy-flux3-klein'), null, 'Relight follows the photo: nothing locked');
  assert.equal(workflowQuoteQueries(cs, 'edit', 'comfy-flux3-klein')[0].photoAspect, '4:3', 'the compat quote says the photo is fitted'); assert.equal(workflowQuoteQueries(cs, 'edit', 'api-nano-banana')[0].photoAspect, undefined);
  assert.deepEqual(cs.prep?.edit?.['comfy-flux3-klein'], { fit: '4:3', note: 'Fits your photo to 4:3 first' }, 'payload: prep with the menu words'); }
ok('photoFitOf / payload prep: Character Sheet edit on a follow-photo model fits to 4:3; nothing for text-only, any-aspect models or Relight');

// ---- 3. the submit's header reader ----
const png = (w: number, h: number) => { const b = Buffer.alloc(33); b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(0x0d0a1a0a, 4); b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
assert.deepEqual(imageDimsOf(png(2560, 1920)), { width: 2560, height: 1920 });
const jpeg = (w: number, h: number, orient?: number) => { const parts: Buffer[] = [Buffer.from([0xff, 0xd8])];
  if (orient) { const tiff = Buffer.alloc(26); tiff.write('MM', 0, 'ascii'); tiff.writeUInt16BE(42, 2); tiff.writeUInt32BE(8, 4); tiff.writeUInt16BE(1, 8); tiff.writeUInt16BE(0x0112, 10); tiff.writeUInt16BE(3, 12); tiff.writeUInt32BE(1, 14); tiff.writeUInt16BE(orient, 18);
    const body = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]); const hd = Buffer.alloc(4); hd[0] = 0xff; hd[1] = 0xe1; hd.writeUInt16BE(body.length + 2, 2); parts.push(hd, body); }
  const sof = Buffer.alloc(19); sof[0] = 0xff; sof[1] = 0xc0; sof.writeUInt16BE(17, 2); sof[4] = 8; sof.writeUInt16BE(h, 5); sof.writeUInt16BE(w, 7); parts.push(sof, Buffer.alloc(16)); return Buffer.concat(parts); };
assert.deepEqual(imageDimsOf(jpeg(1920, 1080)), { width: 1920, height: 1080 }); assert.deepEqual(imageDimsOf(jpeg(1920, 1080, 6)), { width: 1080, height: 1920 }, 'EXIF 6: shown turned');
assert.deepEqual(imageDimsOf(jpeg(1920, 1080, 1)), { width: 1920, height: 1080 }); assert.equal(imageDimsOf(Buffer.from('GIF89a')), null);
ok('imageDims: PNG, JPEG, EXIF quarter turn swaps the sides');

// ---- 4. pre-flight ----
assert.equal(shapeName(1080, 1920), '9:16'); assert.equal(shapeName(3000, 1000), '3:1'); assert.equal(shapeName(1000, 1000), '1:1');
const slot = (o: Record<string, any> = {}) => ({ name: 'image', label: 'Your photo', required: false, filled: true, width: 1080, height: 1920, fitTo: '4:3', ...o });
{ const ps = preflightProblems({ slots: [slot()], modelName: 'FLUX 3 Klein' }); assert.equal(ps.length, 1); assert.equal(ps[0].code, 'photo_shape'); assert.equal(ps[0].message, 'Your photo is 9:16; FLUX 3 Klein needs 4:3');
  assert.deepEqual(ps[0].fix, { kind: 'fit-photo', label: 'Fit to 4:3', args: { slot: 'image', aspect: '4:3' } }); assert.equal(ps[0].alt?.kind, 'crop-photo'); }
assert.deepEqual(preflightProblems({ slots: [slot({ width: 2560, height: 1920 })] }), [], 'already 4:3: no chip, no problem');
assert.deepEqual(preflightProblems({ slots: [slot({ fitTo: null })] }), [], 'a model that renders 4:3 itself: no problem');
assert.equal(preflightProblems({ slots: [slot({ width: 100, height: 400 })], minSide: 128 })[0].code, 'photo_too_small', 'tiny: blocked with the min size, not offered a fit');
{ /* several at once, out of order in the state: inputs → model → setup → money */
  const q = { valid: true, runnable: false, credits: 12, needsKey: true, setupOptions: [{ runOn: 'comfy', runOnLabel: 'Comfy', action: 'add_key' }, { runOn: 'local', action: 'download', missingBytes: 12e9 }], blockedCode: 'x' };
  const ps = preflightProblems({ quote: q, prompt: { missing: 'Describe the character' }, images: { count: 6, max: 4 }, slots: [slot(), { name: 'face', label: 'Face', required: true, filled: false, missing: 'Add a face' }], mask: { needed: true, painted: false } });
  assert.deepEqual(ps.map((p) => p.code), ['photo_shape', 'photo_missing', 'too_many_images', 'mask_missing', 'prompt_missing', 'needs_key']);
  assert.deepEqual(ps.find((p) => p.code === 'too_many_images')!.fix, { kind: 'use-first', label: 'Use first 4', args: { n: 4 } }); assert.equal(ps.find((p) => p.code === 'too_many_images')!.alt?.kind, 'pick-model');
  assert.equal(ps.find((p) => p.code === 'photo_missing')!.message, 'Add a face'); assert.equal(ps.find((p) => p.code === 'needs_key')!.fix.label, 'Add key');
  const dl = preflightProblems({ quote: { ...q, runOn: 'local' } }); assert.deepEqual(dl.map((p) => [p.code, p.fix.label]), [['needs_download', 'Download 12 GB']], 'the chosen place leads (Local: a download)'); }
{ const lim = preflightProblems({ quote: { valid: true, runnable: true, credits: 40 }, prompt: { missing: 'Write a prompt' } }); // spending limits were removed (2026-10-28): no money step
  assert.deepEqual(lim.map((p) => [p.code, p.stage]), [['prompt_missing', 'inputs']]); }
{ const cant = preflightProblems({ quote: { valid: false, error: 'Takes up to 4 images; you have 6.', issues: [{ field: 'refs' }] }, images: { count: 6, max: 4 } });
  assert.deepEqual(cant.map((p) => p.code), ['too_many_images'], 'the refs 400 is said once, as the inputs fix');
  const other = preflightProblems({ quote: { valid: false, error: 'Can’t edit with a mask.', issues: [{ field: 'mode' }] } }); assert.deepEqual(other.map((p) => [p.code, p.fix.kind]), [['model_cant_run', 'pick-model']]);
  const unp = preflightProblems({ quote: { valid: true, runnable: false, credits: null, priceAvailable: false } }); assert.deepEqual(unp.map((p) => p.code), ['price_unavailable']); }
assert.deepEqual(preflightProblems({ quote: { valid: true, runnable: true, credits: 3 } }), [], 'a runnable quote: nothing');
for (const p of preflightProblems({ quote: { runnable: false, setup: { runOn: 'local', action: 'turn_on' } } })) assert.ok((PREFLIGHT_CODES as readonly string[]).includes(p.code));
{ const blk = { runnable: false, chargeable: false, credits: 239, blockedCode: 'input_blocked', reasonCode: 'input_blocked', blockedReason: "Comfy Router can't run this job. Seedance 2.5 on Comfy Router takes your clip only as a public web link." };
  const ps = preflightProblems({ quote: blk, modelName: 'Seedance 2.5 Edit' }); assert.equal(ps.length, 1); assert.equal(ps[0].code, 'model_cant_run'); assert.equal(ps[0].message, 'Seedance 2.5 on Comfy Router takes your clip only as a public web link');
  assert.equal(preflightProblems({ quote: { ...blk, blockedField: 'image' } }).length, 0, "a blocked field (Camera's start image) is the inputs' step");
  assert.deepEqual(preflightProblems({ quote: blk, slots: [{ name: 'video', label: 'Clip', required: true, filled: false }] }).map((p) => p.code), ['photo_missing'], 'a missing input says itself, once'); }
ok('preflightProblems: an input-blocked quote (price kept, not chargeable) says why on Generate');
ok('preflightProblems: one list, ordered inputs → model → setup → money, each with its fix; right-aspect photos and runnable quotes have none');
console.log('PASS photo-prep');
