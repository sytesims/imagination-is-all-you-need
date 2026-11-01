// Prompt patterns (shared/promptPatterns.ts, 2026-10-31): the sentence each model was trained to read, per preset. The registry is sound, and each
// changed preset sends its exact final prompt through the same function the run uses, with references converted per model.
// Run: npx tsx test/prompt-patterns.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-patterns-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock' });
const P = await import('../src/shared/promptPatterns.ts');
const { PROMPT_GRAMMAR } = await import('../src/shared/promptGrammar.ts');
const { applyRefGrammar, appendUnnamed } = await import('../src/shared/promptRefs.ts');
const ok = (m: string) => console.log('ok ' + m);

// ---- 1. registry: sourced, dated, model keys real, templates free of model tokens, no negative on FLUX / H3 ----
{
  const FAMILIES = ['minimax-h3', 'wan', 'ltx', 'kling', 'seedance', 'qwen-edit', 'nano-banana', 'gpt-image', 'flux', 'bria', 'any'];
  for (const p of P.PROMPT_PATTERNS) {
    const id = `${p.model}/${p.task}`;
    assert.ok(FAMILIES.includes(p.model) || PROMPT_GRAMMAR[p.model], `${id}: a family or a PROMPT_GRAMMAR key`);
    assert.match(p.checked, /^\d{4}-\d{2}-\d{2}$/, id);
    if (p.model !== 'any') assert.ok(p.sources.length && p.sources.every((u) => /^https:\/\//.test(u)), `${id}: official https sources`);
    assert.doesNotMatch(p.template, /<image|<<<|<Picture|@Image|<ref_image/i, `${id}: references as "image N" words only`);
    if (p.form === 'exact-lora-sentence') assert.ok(p.exact && Object.values(p.exact).every((x) => /^[A-Z].*\.$/.test(x)), `${id}: trained sentences listed`);
    if (/^(minimax-h3|flux)/.test(p.model)) assert.equal(p.negative, 'none', `${id}: no negative`);
  }
  for (const k of Object.keys(PROMPT_GRAMMAR)) if (/^(minimax-h3|flux)/.test(k)) assert.notEqual(PROMPT_GRAMMAR[k].negative, 'field', `${k}: no negative field`);
  const { capsFor } = await import('../src/shared/imageCaps.ts');
  for (const prov of ['api-flux2', 'api-flux2-max', 'api-flux3-image', 'comfy-flux3-klein', 'comfy-klein4b', 'comfy-flux2dev', 'direct-flux2-flex', 'direct-flux2-klein-9b'])
    assert.ok(!capsFor(prov)?.extras?.negativePrompt, `${prov}: no negative prompt sent`);
  // lookup: model key, then family, then any; slots and optional parts
  assert.equal(P.familyOf('wan-2.2-animate-14b'), 'wan'); assert.equal(P.familyOf('ltx-2.5-22b'), 'ltx'); assert.equal(P.familyOf('minimax-h3-fast'), 'minimax-h3'); assert.equal(P.familyOf('veo-3.1'), null);
  assert.equal(P.patternFor('i2v-default', 'kling-v3')?.model, 'any');
  assert.equal(P.patternFor('camera-angle', 'qwen-image-edit-2509-angles')?.form, 'exact-lora-sentence');
  assert.equal(P.fillTemplate('The camera {move}[ with {amplitude} amplitude][ at {speed} speed][ {target}].', { move: 'pans right' }), 'The camera pans right.');
  assert.equal(P.captionSubject('the man on the left.'), 'The man on the left'); assert.equal(P.captionSubject(''), 'The character'); assert.equal(P.captionSubject('image 1 surfing'), 'image 1 surfing');
  ok(`registry: ${P.PROMPT_PATTERNS.length} patterns, sourced and dated, no model tokens, no negative on FLUX / H3`);
}

// ---- 2. video swap presets: the new look is "image 1", converted per engine; Kling's unnamed-ref list adds nothing ----
{
  const { getTool } = await import('../src/tools/registry.ts');
  const swap = getTool('object-swap')!.presets!; const motion = getTool('motion-transfer')!.presets!;
  assert.equal(swap.length, 31); assert.equal(motion.length, 4);
  for (const p of [...swap, ...motion]) { assert.match(p.prompt, /\bimage 1\b/, p.id); assert.doesNotMatch(p.prompt, /\breference\b/, `${p.id}: never "the reference X"`); }
  assert.equal(swap.find((p) => p.id === 'shoes')!.prompt, 'replace the shoes with the shoes in image 1');
  assert.equal(motion.find((p) => p.id === 'cast-and-location')!.prompt, 'the character in image 1 in the location in image 2, same motion and camera');
  const main = swap.find((p) => p.id === 'main-person')!.prompt;
  const cases: [string, string | undefined, string][] = [
    ['kling-v3-omni-edit', 'router', 'replace the main person with the character in <<<image_1>>>'],
    ['minimax-h3-character-swap', 'local', 'replace the main person with the character in <Picture 1>'],
    ['minimax-h3', 'local', 'replace the main person with the character in <Picture 1>'],
    ['seedance-2.5-edit', 'router', 'replace the main person with the character in image 1' /* Seedance's own words, left as typed */],
  ];
  for (const [m, pl, want] of cases) { const got = applyRefGrammar(main, m, { image: 1, video: 1 }, pl); assert.equal(got, want, `${m} @ ${pl}`); assert.equal(appendUnnamed(got, m, { image: 1 }, pl), got, `${m}: image 1 is named`); }
  assert.equal(applyRefGrammar('put @image1 on stage', 'kling-v3-omni-edit', { image: 1 }), 'put <<<image_1>>> on stage', 'chips too');
  assert.equal(applyRefGrammar('put @image1 on stage', 'seedance-2.5-edit', { image: 1 }), 'put Image 1 on stage');
  assert.equal(applyRefGrammar('put @image1 on stage', 'minimax-h3-character-swap', { image: 1 }, 'local'), 'put <Picture 1> on stage');
  ok('video swap: 31 swap + 4 motion presets say "image 1"; Kling <<<image_1>>>, H3 <Picture 1>, Seedance image 1; chips converted the same way');
}

// ---- 3. local Wan: Animate gets a caption of the result; VACE restyle a caption without "redrawn" / "keep the motion" ----
{
  const { buildPrompt } = await import('../src/comfyClient.ts');
  const job = (input: any) => ({ id: 'j', toolId: 'object-swap', input } as any);
  assert.equal(buildPrompt(job({ mode: 'object_swap' })), 'The character moves naturally in the scene.');
  assert.equal(buildPrompt(job({ mode: 'object_swap', target: 'the man on the left' })), 'The man on the left moves naturally in the scene.');
  assert.equal(buildPrompt(job({ mode: 'motion_transfer' })), 'The character moves naturally in the scene.');
  const { restylePrompt } = await import('../src/comfy/restyle.ts');
  assert.deepEqual(restylePrompt('anime-cel', ''), { prompt: 'The scene, in anime cel style: flat cel shading, clean ink outlines, anime.', negative: 'photorealistic, blurry, low quality, watermark' });
  assert.equal(restylePrompt('watercolor', 'a girl dancing in a field').prompt, 'A girl dancing in a field, in watercolor style: soft watercolor washes, paper texture, bleeding edges.');
  const styles = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'samples', 'styles', 'styles.json'), 'utf8')).styles as { prompt: string }[];
  for (const s of styles) assert.match(s.prompt, /^\{subject\}, in [^:]+ style: [^.]+\.$/, s.prompt);
  ok('Wan Animate: "{who} moves naturally in the scene."; VACE: "{subject}, in {style} style: {traits}." for all 23 styles');
}

// ---- 4. Camera Angles (2026-11-01): each family's camera-angle wording; the angles LoRA's card commands first on its own route ----
{
  const { SHOT_ANGLES, SHOT_DEFAULTS, shotPrompt, parseShots } = await import('../src/tools/shots.ts');
  const at = (id: string) => SHOT_ANGLES.find((a) => a.value === id)!;
  assert.deepEqual(SHOT_ANGLES.map((a) => a.value).slice(-2), ['over-shoulder', 'full-body']); assert.equal(SHOT_DEFAULTS.length, 9);
  assert.deepEqual(parseShots(''), { ids: SHOT_DEFAULTS }, 'blank = the nine defaults'); assert.deepEqual(parseShots('["full-body","over-shoulder"]'), { ids: ['over-shoulder', 'full-body'] });
  assert.equal(shotPrompt(at('three-quarter-left'), 'a woman in a red coat.', 'api-gpt-image-25-flare'),
    'Image 1: the subject. Keep the subject exactly the same: a woman in a red coat; same face, hair, skin tone, build and clothes. New camera angle: from a camera moved 45° to their left, a three-quarter view. Same place and the same light as image 1, in the same photo style as image 1.');
  assert.equal(shotPrompt(at('side'), '', 'api-nano-banana'),
    'Using the provided image of the subject, show the same subject in full side profile, from a camera moved 90° to the side. Their face, hair, skin tone, build and clothes stay exactly as in the image, and the place, the light and the photo style stay the same.');
  assert.equal(shotPrompt(at('over-shoulder'), 'a red fox', 'comfy-klein4b'),
    'The subject from image 1, a red fox, seen from just behind their shoulder as they glance back at the camera, in the same place, light and photo style as image 1.');
  assert.equal(shotPrompt(at('full-body'), '', 'api-seedream'),
    'Show the subject in image 1 in full body from head to feet, with the outfit and shoes in frame. Keep their face, hair, skin tone, build and clothes, the place, the light and the photo style exactly as in image 1.');
  for (const a of SHOT_ANGLES) for (const pv of ['api-gpt-image', 'api-nano-banana', 'comfy-flux3-klein', 'api-seedream', 'comfy-qwen-image', 'comfy-qwen-angles', undefined]) {
    const s = shotPrompt(a, 'x', pv); assert.doesNotMatch(s, /photorealistic|phone photo/i, `${a.value} · ${pv}: style-neutral`); assert.match(s, /\.$/); }
  // the LoRA route: only the card's commands; low and side get the plain wording; high = top-down
  const exact = P.patternFor('camera-angle', 'qwen-image-edit-2509-angles')!.exact!;
  assert.deepEqual(Object.keys(exact).sort(), ['close-up', 'high', 'three-quarter-left', 'three-quarter-right', 'wide']); assert.equal(exact.high, 'Turn the camera to a top-down view.');
  for (const [id, sentence] of Object.entries(exact)) assert.ok(shotPrompt(at(id), 'x', 'comfy-qwen-angles').startsWith(`${sentence} The subject: x. `), id);
  assert.equal(shotPrompt(at('close-up'), '', 'comfy-qwen-angles'), 'Turn the camera to a close-up. Keep the subject, the place, the light and the photo style the same.');
  for (const id of ['low', 'side', 'front']) assert.match(shotPrompt(at(id), '', 'comfy-qwen-angles'), /^Show the subject in image 1 /, `${id}: not on the card, plain wording`);
  ok('Camera Angles: per-family wording, style-neutral, 11 views (9 by default); LoRA commands only where the card has one');
}

// ---- 4b. Phone photo (ugc-photo): per-family wording, the chips' sentences, no quality tags ----
{
  const fill = (fam: string) => P.fillPattern('ugc-photo', fam, { who: 'a fictional woman', holder: 'Taken in a mirror, the phone visible in their hand', light: 'Flat overhead indoor light' });
  for (const fam of ['gpt-image', 'nano-banana', 'flux', 'any']) { const s = fill(fam); assert.equal(P.patternFor('ugc-photo', fam)?.model, fam);
    assert.doesNotMatch(s, /photorealistic|8K|4K|ultra|masterpiece|\{|\[/i, fam); assert.match(s, /mirror/, fam); }
  assert.equal(P.familyOfProvider('api-gpt-image-25-flare'), 'gpt-image'); assert.equal(P.familyOfProvider('api-nano-banana'), 'nano-banana'); assert.equal(P.familyOfProvider('comfy-klein4b'), 'flux'); assert.equal(P.familyOfProvider('api-seedream'), 'any');
  ok('ugc-photo: 4 families, chip sentences in, no quality tags');
}

// ---- 5. camera moves: base H3 grammar on Router, one named move on local LTX, Fixed camera on Wan, plain enhance sentence ----
{
  const { h3CameraRouterPrompt, videoAppPrompt } = await import('../src/routing/routerModels.ts');
  const tail = 'Start exactly on the first frame and keep its subject, setting and look; only the camera moves. One continuous shot, no cuts.';
  assert.equal(h3CameraRouterPrompt({ types: ['h3-push-in'], intensity: 'slow', prompt: '' }), `The camera pushes in with small amplitude at slow speed toward the subject. ${tail}`);
  assert.equal(h3CameraRouterPrompt({ types: ['h3-pan'], intensity: 'aggressive', prompt: 'Rain' }), `The camera pans right with large amplitude at fast speed across the scene. Rain. ${tail}`);
  const { cameraSentence, cameraPreset, mixPlan } = await import('../src/comfy/cameraPresets.ts');
  assert.equal(cameraSentence(cameraPreset('ltx-dolly-in')!), 'The camera performs a single, smooth dolly in only.');
  assert.equal(cameraSentence(cameraPreset('ltx-dolly-right')!), 'The camera performs a single, smooth dolly right only, with parallax.');
  assert.equal(cameraSentence(cameraPreset('ltx-static')!), 'The camera stays locked off and static, with no camera movement.');
  assert.equal(cameraSentence(cameraPreset('static')!), 'Fixed camera, subtle natural motion.');
  assert.equal(cameraSentence(cameraPreset('pan-left')!), 'smooth pan left', 'Fun Camera moves: the pose input moves the camera; hint kept');
  assert.equal((mixPlan(['ltx-jib-up'], 5)[0] as any).sentence, 'The camera performs a single, smooth jib up only.');
  const app = videoAppPrompt({ mode: 'camera', typePrompt: 'slow dolly push in', prompt: 'a red car', enhance: true } as any);
  assert.ok(app.includes('Cinematic, detailed, smooth motion.') && !app.includes('(enhanced'), app);
  const { cameraApp } = await import('../src/tools/apps.ts');
  const r: any = await cameraApp.parseInput({ types: '["ltx-dolly-in"]', prompt: 'a red car', enhance: '1', provider: 'comfy-open', duration: '5' }, {});
  assert.ok(!r.error, r.error); assert.equal(r.finalPrompt, 'dolly in. a red car. Cinematic, detailed, smooth motion.');
  ok('camera: H3 type + amplitude + speed + target; LTX single named move; Wan Fixed camera; Enhance = a plain sentence');
}
fs.rmSync(D, { recursive: true, force: true });
console.log('prompt-patterns: all ok');
