// Create Image composer (Image QA 2026-10-23): #3 every photo survives a refresh, in order, and a lost one leaves its mention visibly broken;
// #10 removing a photo renumbers mentions without deleting words, and the broken mention says so; #9 an edit starts on Match photo (Auto)
// where the model's edit takes it, else on the listed aspect closest to the photo.
// Pure functions only: server/src/shared/mentions.ts, web/src/shared/draftFiles.ts (pack / unpack), web/src/shared/composerDraft.ts.
// Run: npx tsx test/create-image-composer.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { removeImageMention, mentionsAfterRestore, validateMentions } from '../src/shared/mentions.ts';
import { packDraftFiles, unpackDraftFiles } from '../../web/src/shared/draftFiles.ts';
import { closestAspect, defaultAspectFor, settingsOnSwitch } from '../../web/src/shared/composerDraft.ts';
import { IMAGE_CAPS } from '../src/shared/imageCaps.ts';
const ok = (m: string) => console.log('ok ' + m);

// ---- #3: the draft keeps every photo, in order ----
{
  const fs = [new File([new Uint8Array([1, 2, 3])], 'one.png', { type: 'image/png', lastModified: 1 }), new File([new Uint8Array([4, 5])], 'two.jpg', { type: 'image/jpeg', lastModified: 2 }),
    new File([new Uint8Array([6])], 'three.png', { type: 'image/png', lastModified: 3 })];
  const back = unpackDraftFiles(packDraftFiles(fs));
  assert.deepEqual(back.map(f => f?.name), ['one.png', 'two.jpg', 'three.png'], 'same photos, same order');
  assert.deepEqual(back.map(f => f?.type), ['image/png', 'image/jpeg', 'image/png']);
  assert.deepEqual(await Promise.all(back.map(async f => [...new Uint8Array(await f!.arrayBuffer())])), [[1, 2, 3], [4, 5], [6]], 'same bytes');
  ok('#3: three photos are stored and come back in order (name, type, bytes)');

  const saved: any[] = packDraftFiles(fs); saved[1] = { name: 'two.jpg' }; /* an entry whose data is gone */
  const partial = unpackDraftFiles(saved); assert.deepEqual(partial.map(f => f?.name ?? null), ['one.png', null, 'three.png'], 'a lost photo is a null in its place');
  assert.deepEqual(unpackDraftFiles(undefined), []); assert.deepEqual(unpackDraftFiles('nope'), []);
  ok('#3: an unreadable entry comes back as null (its number is known), junk as no photos');

  /* all came back: the prompt is untouched and valid */
  const prompt = 'Put the person from @image2 into the forest of @image1';
  assert.equal(mentionsAfterRestore(prompt, [true, true]), prompt);
  assert.ok(validateMentions(prompt, { images: 2, videos: 0 }).ok, 'two photos restored: Edit is not blocked');
  /* photo 2 lost: @image2 stays, visibly broken (not silently blocked) */
  const p2 = mentionsAfterRestore(prompt, [true, false]); assert.equal(p2, 'Put the person from @image? into the forest of @image1');
  const v2 = validateMentions(p2, { images: 1, videos: 0 }); assert.equal(v2.ok, false); assert.equal(v2.issues[0].mention.raw, '@image?'); assert.match(v2.issues[0].message, /removed/);
  /* photo 1 lost, photo 2 back (it is now photo 1): mentions follow the photo */
  assert.equal(mentionsAfterRestore(prompt, [false, true]), 'Put the person from @image1 into the forest of @image?');
  assert.equal(mentionsAfterRestore('@image3 and @image1 and @image2', [true, false, false]), '@image? and @image1 and @image?');
  /* an old draft that only saved photo 1: the leftover @image2 is flagged with a clear message */
  const v3 = validateMentions(prompt, { images: 1, videos: 0 }); assert.equal(v3.ok, false); assert.match(v3.issues[0].message, /^@image2 has no photo \(1 attached\)/);
  ok('#3: a photo that can\'t come back leaves its mention visibly broken; the others keep theirs');
}

// ---- #10: removing a photo never deletes words ----
{
  const p = 'Put the person from @image2 into the forest of @image3, lit like @image1.';
  assert.equal(removeImageMention(p, 2), 'Put the person from @image? into the forest of @image2, lit like @image1.', 'remove photo 2: its mention is marked, @image3 → @image2');
  assert.equal(removeImageMention(p, 1), 'Put the person from @image1 into the forest of @image2, lit like @image?.', 'remove photo 1: everything moves down one');
  assert.equal(removeImageMention(p, 3), 'Put the person from @image2 into the forest of @image?, lit like @image1.');
  for (const n of [1, 2, 3]) assert.equal(removeImageMention(p, n).replace(/@image[\d?]+/g, '@'), p.replace(/@image\d+/g, '@'), `remove ${n}: every other word stays`);
  assert.equal(removeImageMention('no mentions', 1), 'no mentions');
  assert.equal(removeImageMention('@img2 then @image 3', 1), '@image1 then @image2', '@img2 / "@image 3" spellings renumber too');
  const v = validateMentions(removeImageMention('@image1 on @image2', 2), { images: 1, videos: 0 });
  assert.equal(v.ok, false, 'a broken mention blocks the run with a reason'); assert.match(v.issues[0].message, /^@image\? points to a photo you removed/);
  ok('#10: removing a photo renumbers the rest and leaves the removed one\'s mention as a flagged "@image?"');
}

// ---- #9: the aspect an edit starts on ----
{
  assert.equal(closestAspect(['1:1', '16:9', '9:16', '4:3', '3:4'], 1280 / 720), '16:9');
  assert.equal(closestAspect(['1:1', '16:9', '9:16', '4:3', '3:4'], 900 / 1200), '3:4');
  assert.equal(closestAspect(['1:1', '16:9', '9:16'], 1), '1:1');
  assert.equal(closestAspect(['Auto', '21:9', '16:9'], 2.4), '21:9', 'Auto is skipped');
  assert.equal(closestAspect(['1:1'], null), null);
  // a hosted model with no Auto and no edit override (FLUX.2 [pro]; Kling Image O1 has its API's Auto since 2026-10-24, Seedream 5.0 Pro Match photo): the closest listed aspect
  const sd = IMAGE_CAPS['api-flux2']; assert.ok(sd && !sd.edit && sd.allowAuto === false, 'FLUX.2 [pro] has no Auto and no edit override');
  { const s5 = IMAGE_CAPS['api-seedream']; assert.ok(s5.allowAuto === false && s5.edit?.allowAuto === true && s5.edit.aspects.length === 10, 'Seedream 5.0 Pro: Match photo on edits, 10 shapes');
    assert.equal(defaultAspectFor({ aspects: ['Auto', ...s5.edit!.aspects], photoRatio: 16 / 9, editing: true, editAllowsAuto: true, defaultAspect: s5.defaultAspect }), 'Auto', 'Seedream edit: Match photo first'); }
  const sdAspects = sd.aspects; /* the bar's list for it: no Auto */
  assert.equal(defaultAspectFor({ aspects: sdAspects, photoRatio: 16 / 9, editing: true, editAllowsAuto: false, defaultAspect: sd.defaultAspect }), '16:9', 'FLUX.2 [pro] + a 16:9 photo: 16:9, not 1:1');
  assert.equal(defaultAspectFor({ aspects: sdAspects, photoRatio: null, editing: true, editAllowsAuto: false, defaultAspect: sd.defaultAspect }), '1:1', 'size not known yet: the model default');
  assert.equal(defaultAspectFor({ aspects: sdAspects, photoRatio: 16 / 9, editing: false, editAllowsAuto: false, defaultAspect: sd.defaultAspect }), '1:1', 'no photo: the model default');
  // Nano Banana 2 (2026-10-24): edits start on Match photo (aspectRatio left out); a prompt-only run has no Auto (its default isn't documented the same way twice)
  const nb = IMAGE_CAPS['api-nano-banana']; assert.ok(nb.allowAuto === false && nb.edit?.allowAuto === true && nb.edit.aspects.length === 14, 'Nano Banana 2: Auto on edits only, 14 aspects');
  assert.equal(defaultAspectFor({ aspects: ['Auto', ...nb.edit!.aspects], photoRatio: 16 / 9, editing: true, editAllowsAuto: true, defaultAspect: nb.defaultAspect }), 'Auto', 'NB2 edit: Match photo first');
  assert.equal(defaultAspectFor({ aspects: nb.aspects, photoRatio: null, editing: false, editAllowsAuto: false, defaultAspect: nb.defaultAspect }), '1:1', 'NB2 prompt only: 1:1');
  for (const id of ['comfy-flux3-klein', 'comfy-flux2dev', 'comfy-qwen-image']) { const e = IMAGE_CAPS[id].edit!; assert.ok(e.allowAuto && !e.aspects.length, id);
    assert.equal(defaultAspectFor({ aspects: ['Auto', ...e.aspects], photoRatio: 16 / 9, editing: true, editAllowsAuto: e.allowAuto, defaultAspect: IMAGE_CAPS[id].defaultAspect }), 'Auto', `${id}: Match photo (it refuses anything else)`); }
  const fx = IMAGE_CAPS['api-flux3-image'].edit!; assert.equal(defaultAspectFor({ aspects: ['Auto', ...fx.aspects], photoRatio: 16 / 9, editing: true, editAllowsAuto: fx.allowAuto }), 'Auto', 'FLUX 3 edit: Match photo first');
  ok('#9: edits start on Match photo where the model takes it, else on the closest listed aspect (NB2 + 16:9 photo → 16:9)');
}
// 2026-10-25: a picked shape carries over a model switch by shape: Runway's own pixel ratios (16:9 → 1920:1080, 1:1 → 1024:1024, back again), else the
// nearest shape on a model with no Auto (21:9 → 2112:912); a model with Auto and no match still starts on its own default.
{ const rw = IMAGE_CAPS['api-runway-image']; const sw = (caps: any, aspect: string, editing = false) => settingsOnSwitch(caps, { editing, n: 1, cur: { aspect } }).aspect;
  assert.equal(sw(rw, '16:9'), '1920:1080'); assert.equal(sw(rw, '1:1'), '1024:1024'); assert.equal(sw(rw, '9:16'), '1080:1920'); assert.equal(sw(rw, '4:3'), '1440:1080');
  assert.equal(sw(rw, '21:9'), '2112:912', 'nearest Runway ratio'); assert.equal(sw(rw, 'Auto'), '1024:1024', 'Auto: the model default');
  assert.equal(sw(rw, '16:9', true), '1920:1080', 'editing: same shape kept');
  assert.equal(sw(IMAGE_CAPS['api-nano-banana'], '1920:1080'), '16:9', 'back from Runway: the same shape by its plain name');
  assert.equal(sw(IMAGE_CAPS['api-krea'], '1920:1080'), '16:9');
  ok('a picked shape carries over a model switch by shape (Runway pixel ratios, nearest on a model with no Auto)'); }
// 2026-10-25: photos on a model whose default route takes none (Comfy Router's Grok Imagine Image 2.0): hidden on Router only, offered when its fal edit route has a key
{ const { routeCapsOf, maxRefsOf } = await import('../../web/src/shared/refCaps.ts');
  const grok = (falKey: boolean) => ({ defaultRoute: 'comfy-router:api-grok-image', routes: [{ routeId: 'comfy-router:api-grok-image', configured: true, caps: { maxRefs: 0 } }, { routeId: 'fal:xai/grok-imagine-image/v2.0/edit', configured: falKey, caps: { maxRefs: 5 } }] });
  assert.equal(maxRefsOf({ maxRefs: 5 }, routeCapsOf(grok(false))), 0, 'Router only: no photos');
  assert.equal(maxRefsOf({ maxRefs: 5 }, routeCapsOf(grok(true))), 5, 'fal key set: its edit route takes 5');
  assert.equal(maxRefsOf({ maxRefs: 5 }, routeCapsOf(grok(true), 'comfy-router:api-grok-image')), 0, 'Router pinned: no photos');
  assert.equal(maxRefsOf({ maxRefs: 0 }, routeCapsOf({ defaultRoute: 'comfy-router:api-ideogram', routes: [{ routeId: 'comfy-router:api-ideogram', configured: true, caps: { maxRefs: 0 } }] })), 0, 'Ideogram V4: prompt only');
  ok('photos follow the route: hidden where only a prompt-only route can run, offered where a keyed edit route exists'); }
