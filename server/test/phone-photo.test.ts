// Phone Photo (2026-11-01, shared/phonePhoto.ts): a casual phone photo of a made-up person. Two chip rows (Taken by, Light) with our exact
// sentences, worded per model family (promptPatterns ugc-photo); the "Phone photo (UGC)" look opens it with Selfie + Window; the Modern phone
// camera rig. Pure: no server. Run: npx tsx test/phone-photo.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-photo-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock' });
const { PHONE_HOLDERS, PHONE_LIGHTS, phonePhotoPrompt } = await import('../src/shared/phonePhoto.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { IMAGE_PRESETS, validateImagePresets, presetPrefill } = await import('../src/shared/presets.ts');
const { imageWorkflowsPayload } = await import('../src/shared/workflows.ts');
const { CAMERA_BODIES, rigSentence } = await import('../src/shared/cameraLens.ts');
const ok = (m: string) => console.log('ok ' + m);

// ---- the chips: our exact sentences ----
assert.deepEqual(PHONE_HOLDERS.map((o) => o.label), ['Selfie', 'Mirror', 'Propped', 'Friend']);
assert.deepEqual(PHONE_LIGHTS.map((o) => o.label), ['Window', 'Overhead', 'Car', 'Flash', 'Outdoor']);
assert.equal(PHONE_HOLDERS[0].prompt, "Taken with the phone's front camera at arm's length, the arm reaching toward the lens");
assert.equal(PHONE_LIGHTS[4].prompt, 'Bright shade on a sunny day');
ok('chips: 4 holders, 5 lights');

// ---- per family; FLUX gets the subject first and the chips as phrases ----
const who = 'a fictional man in his forties fixing a bike.';
const gpt = phonePhotoPrompt({ who, holder: 'friend', light: 'car' }, 'api-gpt-image-25-flare');
assert.equal(gpt, 'A casual phone photo of a fictional man in his forties fixing a bike. Taken by a friend with a phone from about two metres away, at chest height. Soft overcast light through the windscreen. Real skin with visible pores, a little shine and small marks, hair slightly out of place. Everyday background left as it is, framing a little off-centre, phone-camera sharpness with light noise in the shadows. Unposed, no heavy retouching.');
assert.match(phonePhotoPrompt({ who }, 'api-nano-banana'), /^A casual, unposed phone photo: a fictional man .* Taken with the phone's front camera .* Daylight from a window/);
assert.equal(phonePhotoPrompt({ who, holder: 'mirror', light: 'flash' }, 'comfy-klein4b'), "A fictional man in his forties fixing a bike. Modern smartphone photo, taken in a mirror, the phone visible in their hand, the phone's flash at night, a dark background. Natural skin with pores and slight shine, loose hair strands. Lived-in background, slightly off-centre framing, small-sensor noise, deep focus.");
assert.equal(phonePhotoPrompt({ who, holder: 'propped' }, 'api-seedream'), phonePhotoPrompt({ who, holder: 'propped' }, 'api-gpt-image'), 'other models: the GPT sentences');
assert.match(phonePhotoPrompt({ who: '', holder: 'nope', light: 'nope' }, null), /^A casual phone photo of a person\. Taken with the phone's front camera/, 'empty and unknown values fall back');
for (const pv of ['api-gpt-image', 'api-nano-banana', 'comfy-klein4b', 'api-seedream', 'comfy-qwen21', undefined]) assert.doesNotMatch(phonePhotoPrompt({ who, detail: 'a plaster on one finger' }, pv), /photorealistic|8K|4K|ultra|masterpiece|cinematic|shallow/i, String(pv));
ok('wording: GPT / Nano Banana / FLUX / others, no quality tags');

// ---- the app: compose through the gallery, chips as segmented fields ----
const t: any = getTool('app-phone-photo'); assert.ok(t, 'app-phone-photo registered');
const holder = t.inputs.find((i: any) => i.name === 'holder'); assert.deepEqual(holder.options, ['selfie', 'mirror', 'propped', 'friend']); assert.equal(holder.default, 'selfie');
const light = t.inputs.find((i: any) => i.name === 'light'); assert.deepEqual(light.options, ['window', 'overhead', 'car', 'flash', 'outdoor']); assert.equal(light.default, 'window');
const w = imageWorkflowsPayload(getTool as any).workflows.find((x: any) => x.id === 'phone-photo')!; assert.ok(w, 'workflow listed');
assert.equal(w.category, 'people'); assert.deepEqual(w.controls.map((c: any) => [c.field, c.kind]), [['holder', 'segmented'], ['light', 'segmented']]); assert.equal(w.prompt.mode, 'required');
ok(`app: ${t.name}, chips ${holder.options.length} + ${light.options.length}, workflow ${w.id}`);

// ---- the look: People, Selfie + Window, passes the live checks, fills the bar ----
const look = IMAGE_PRESETS.find((p) => p.id === 'phone-photo-ugc')!; assert.equal(look.name, 'Phone photo (UGC)'); assert.equal(look.category, 'People');
const v = validateImagePresets(getTool as any, [look]); assert.deepEqual(v.errors, []);
const pf = presetPrefill(look, w.controls.map((c: any) => c.field)); assert.deepEqual(pf.vals, { holder: 'selfie', light: 'window' }); assert.deepEqual(pf.skipped, []);
assert.doesNotMatch(`${look.name} ${look.description} ${look.subjectHint}`, /\bMac\b/); assert.match(look.subjectHint, /fictional/);
ok('look: Phone photo (UGC), People, Selfie + Window');

// ---- Modern phone camera rig ----
const mp = CAMERA_BODIES.find((b) => b.id === 'modern-phone')!; assert.equal(mp.label, 'Modern phone camera');
assert.match(rigSentence({ body: 'modern-phone', lens: 'modern-prime', focal: 24, aperture: '8' }), /^modern smartphone photo, small-sensor deep focus/);
ok('rig: Modern phone camera');
console.log('phone-photo: all ok');
