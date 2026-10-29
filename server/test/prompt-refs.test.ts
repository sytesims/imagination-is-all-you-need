/** Prompt grammar step 2 (2026-10-26): the one reference rewrite (shared/promptRefs.ts) and the exact prompt text each builder sends, built the way
 *  the runners build it (routing/jobRefs.ts refInputFor, then the body): Kling, Seedance, MiniMax H3 (Router and local), FLUX 3 Klein (local),
 *  Qwen-Edit-2509 (local) and Veo; plus the edge cases (no refs, 4+ refs, a removed ref, a model switch, an over-long prompt).
 *  Run: npx tsx test/prompt-refs.test.ts (temp data dir, mock backend, no keys, no network). */
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'promptrefs-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
const { applyRefGrammar, appendUnnamed, promptLimitIssue, withRefGrammar } = await import('../src/shared/promptRefs.js');
const { refInputFor } = await import('../src/routing/jobRefs.js');
const { routerModelOfRoute } = await import('../src/routing/routerModels.js');
const { findRoute } = await import('../src/routing/routes.js');
const { buildPlan } = await import('../src/comfy/plans.js');
const { getTool } = await import('../src/tools/registry.js');
const { option } = await import('../src/routing/select.js');
const ok = (m: string) => console.log('ok ' + m);
// tiny PNGs (1×1) for bodies that inline images
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const img = (n: number) => { const p = path.join(D, `ref${n}.png`); fs.writeFileSync(p, PNG); return p; };
const refs = (n: number) => Array.from({ length: n }, (_, k) => img(k + 1));

// ---- the rewrite itself ----
assert.equal(applyRefGrammar('@image1 hugs @image2', 'kling-v3', { image: 2 }), '<<<image_1>>> hugs <<<image_2>>>');
assert.equal(applyRefGrammar('@image1 hugs @image2', 'seedance-2.0', { image: 2 }), 'Image 1 hugs Image 2');
assert.equal(applyRefGrammar('@image1 hugs @image2', 'seedance-2.0', { image: 2 }, 'fal'), '@Image1 hugs @Image2');
assert.equal(applyRefGrammar('@image1 in @video1 to @audio1', 'minimax-h3', { image: 1, video: 1, audio: 1 }, 'local'), '<Picture 1> in <Video 1> to <Audio 1>');
assert.equal(applyRefGrammar('lamp from image 1 on the desk in image 2', 'flux-3-klein', { image: 2 }, 'local'), 'lamp from <ref_image_0> on the desk in <ref_image_1>');
assert.equal(applyRefGrammar('lamp from image 1 on the desk in image 2', 'flux-3-klein', { image: 2 }, 'direct'), 'lamp from image 1 on the desk in image 2', 'hosted Klein reads words');
assert.equal(applyRefGrammar('the face of image 2 on image 1', 'qwen-image-edit-2509', { image: 2 }, 'local'), 'the face of Picture 2 on Picture 1');
assert.equal(applyRefGrammar('@image1 walks in, slow push', 'veo-3.1', { image: 1 }), 'the subject walks in, slow push', 'no-ref model: plain words, no dangling @');
// never double-tags; tokens and right-form words stay
assert.equal(applyRefGrammar('<<<image_1>>> and @image1', 'kling-v3', { image: 1 }), '<<<image_1>>> and <<<image_1>>>');
assert.equal(applyRefGrammar('Image 1 dances', 'seedance-2.0', { image: 1 }), 'Image 1 dances');
assert.equal(applyRefGrammar('<image1> and <Picture 1>', 'qwen-image-2.1', { image: 1 }), '<image1> and <Picture 1>');
// edge cases: zero refs (words left), a removed ref (@image? stays for the composer to flag), an index past the refs (left), unknown model (unchanged)
assert.equal(applyRefGrammar('image 1 at dawn', 'kling-v3', {}), 'image 1 at dawn');
assert.equal(applyRefGrammar('@image? waves', 'kling-v3', { image: 1 }), '@image? waves');
assert.equal(applyRefGrammar('image 3 waves', 'kling-v3', { image: 2 }), 'image 3 waves');
assert.equal(applyRefGrammar('@image1 waves', 'no-such-model', { image: 1 }), '@image1 waves');
// model switch after typing: the same words, each model's own form
const typed = '@image1 meets @image2 at the station';
assert.deepEqual(['kling-v3', 'seedance-2.0', 'wan-3.0', 'ltx-2-19b'].map((m) => applyRefGrammar(typed, m, { image: 2 })),
  ['<<<image_1>>> meets <<<image_2>>> at the station', 'Image 1 meets Image 2 at the station', 'Image 1 meets Image 2 at the station', 'subject 1 meets subject 2 at the station']);
// unnamed refs: tag models list them once, at the end; others unchanged
assert.equal(appendUnnamed('<<<image_2>>> runs', 'kling-v3', { image: 5 }), '<<<image_2>>> runs. Reference images: <<<image_1>>>, <<<image_3>>>, <<<image_4>>>, <<<image_5>>>.');
assert.equal(appendUnnamed('runs', 'seedance-2.0', { image: 3 }), 'runs');
// the job keeps what was typed
const j0 = { prompt: '@image1 smiles', refPaths: ['a.png'] }; const j1 = withRefGrammar(j0, 'kling-v3'); assert.equal(j0.prompt, '@image1 smiles'); assert.equal(j1.prompt, '<<<image_1>>> smiles');
ok('rewrite: tags, words, places, zero-based, no-ref models, no double tags, edge cases, model switch');

// over-limit: refused with the cap (model cap, or the route's lower one), never cut
assert.match(promptLimitIssue('kling-v3', 'x'.repeat(2501))!, /up to 2,500 characters; yours is 2,501/);
assert.equal(promptLimitIssue('kling-v3', 'x'.repeat(2500)), null);
assert.match(promptLimitIssue('minimax-h3', 'x'.repeat(7001), 'direct:minimax/h3')!, /up to 7,000/);
assert.equal(promptLimitIssue('minimax-h3', 'x'.repeat(7001), 'comfy-router:api-minimax-h3'), null);
const h3 = getTool('h3-video')!; const tooLong = option(h3, findRoute('direct:minimax/h3')!, { mode: 't2v', prompt: 'y'.repeat(7200) });
assert.equal(tooLong.available, false); assert.match(String(tooLong.reason), /7,000 characters/);
ok('over-long prompts refused at quote with the cap');

// ---- exact body text, built like the runners (refInputFor → body) ----
const routerBody = async (routeId: string, job: { toolId: string; provider: string; input: Record<string, any> }) => {
  const r = findRoute(routeId)!; assert.ok(r, routeId); const spec = routerModelOfRoute(routeId)!; return spec.body(refInputFor(job, r), 0) as Promise<any>; };
// Kling 3.0 Omni: chips become tags; the unnamed refs are added once (4+ refs)
const kb = await routerBody('comfy-router:router-kling', { toolId: 'h3-video', provider: 'router-kling', input: { mode: 'r2v', prompt: '@image2 walks past @image1 in the rain', refPaths: refs(4) } });
assert.equal(kb.prompt, '<<<image_2>>> walks past <<<image_1>>> in the rain. Reference images: <<<image_3>>>, <<<image_4>>>.');
const kb0 = await routerBody('comfy-router:router-kling', { toolId: 'h3-video', provider: 'router-kling', input: { mode: 't2v', prompt: 'A paper boat on a puddle' } });
assert.equal(kb0.prompt, 'A paper boat on a puddle', 'zero refs: untouched');
// Seedance 2.0: Image N
const sb = await routerBody('comfy-router:router-seedance', { toolId: 'h3-video', provider: 'router-seedance', input: { mode: 'r2v', prompt: '@image1 dances with @image2 on a rooftop', refPaths: refs(2) } });
assert.equal(sb.content[0].text, 'Image 1 dances with Image 2 on a rooftop');
// MiniMax H3 on Router: Image N
const hb = await routerBody('comfy-router:api-minimax-h3', { toolId: 'h3-video', provider: 'api-minimax-h3', input: { mode: 'r2v', prompt: '@image1 waves at the camera', refPaths: refs(1) } });
assert.equal(hb.content[0].text, 'Image 1 waves at the camera');
// Veo: no refs to name; enhancePrompt follows the rewrite switch (off unless asked)
const vb = await routerBody('comfy-router:router-veo', { toolId: 'h3-video', provider: 'router-veo', input: { mode: 't2v', prompt: 'A fox in snow. She says: "cold!"' } });
assert.equal(vb.instances[0].prompt, 'A fox in snow. She says: "cold!"'); assert.equal(vb.parameters.enhancePrompt, true, 'no switch: Veo rewrites, as before');
const vb2 = await routerBody('comfy-router:router-veo', { toolId: 'h3-video', provider: 'router-veo', input: { mode: 't2v', prompt: 'A fox', promptRewrite: false } });
assert.equal(vb2.parameters.enhancePrompt, false, 'an explicit off (switch or API) is sent');
ok(`Router bodies: Kling "${kb.prompt}", Seedance "${sb.content[0].text}", H3 "${hb.content[0].text}", Veo enhancePrompt ${vb.parameters.enhancePrompt}`);

// local graphs: the prompt the graph receives
const promptsOf = (p: any) => p.passes.flatMap((x: any) => Object.values<any>(x.graph).map((n) => n?.inputs?.prompt ?? n?.inputs?.text ?? n?.inputs?.value).filter((t) => typeof t === 'string' && t.length > 2));
// MiniMax H3 local talking photo: template and user words in native tags
const lp = buildPlan({ id: 't1', toolId: 'voice', provider: 'comfy-h3-lipsync', status: 'queued', input: { mode: 'lipsync', types: ['lipsync'], prompt: '@image1 smiles at the end', imagePath: img(9), refPaths: [img(9)], speechPath: path.join(D, 's.wav'), duration: 5 } } as any);
const lpText = promptsOf(lp).join(' | ');
assert.match(lpText, /<Picture 1> speaks the words of <Audio 1>/); assert.match(lpText, /<Picture 1> smiles at the end/); assert.doesNotMatch(lpText, /\bImage 1\b|@image1/);
// MiniMax H3 local style transfer: user's own words point at the right inputs
const st = buildPlan({ id: 't2', toolId: 'restyle', provider: 'comfy-h3-restyle', status: 'queued', input: { prompt: 'restyle @video1 like the painting in image 1', videoPath: path.join(D, 'v.mp4'), refPaths: [img(8)], duration: 5 } } as any);
assert.ok(promptsOf(st).includes('style_transfer: restyle <Video 1> like the painting in <Picture 1>'), promptsOf(st).join(' | '));
// FLUX 3 Klein local multi-reference: zero-based tags
const fk = buildPlan({ id: 't3', toolId: 'create-image', provider: 'comfy-flux3-klein', status: 'queued', input: { mode: 'edit', types: ['edit'], prompt: 'Put the lamp from image 1 on the desk in image 2', imagePath: img(1), refPaths: refs(2), imageResolution: '1K' } } as any);
assert.ok(promptsOf(fk).includes('Put the lamp from <ref_image_0> on the desk in <ref_image_1>'), promptsOf(fk).join(' | '));
// Qwen-Edit-2509 local Face Swap: Picture N
const qe = buildPlan({ id: 't4', toolId: 'app-face-swap', provider: 'comfy-qwen-image', status: 'queued', input: { baseTool: 'create-image', mode: 'edit', types: ['edit'], finalPrompt: 'Replace the face of the person in image 1 with the face of the person in image 2', imagePath: img(1), refPaths: refs(2) } } as any);
assert.ok(promptsOf(qe).includes('Replace the face of the person in Picture 1 with the face of the person in Picture 2'), promptsOf(qe).join(' | '));
ok(`local graphs: H3 "${lpText.slice(0, 60)}…", Klein, Qwen-Edit "Picture 1 / Picture 2"`);

// Kling Image O1: Edit's "image N" words become the place's own tags (Router <<<image_N>>>, fal @ImageN)
const ki = { toolId: 'create-image', provider: 'api-kling-image', input: { mode: 'edit', types: ['edit'], prompt: 'Dress image 1 in the coat from image 2', imagePath: img(1), refPaths: refs(2) } };
const kir = await routerBody('comfy-router:api-kling-image', ki); assert.equal(kir.prompt, 'Dress <<<image_1>>> in the coat from <<<image_2>>>');
const falK = findRoute('fal:fal-ai/kling-image/o1')!; assert.ok(falK?.request, 'fal Kling route'); const kif: any = await falK.request!({ ...ki, id: 'j', input: refInputFor(ki, falK) } as any);
assert.equal(kif.prompt, 'Dress @Image1 in the coat from @Image2');
// Seedance 2.5 Edit swap: its own labels
const { swapPromptOf } = await import('../src/routing/routerModels.js');
assert.match(swapPromptOf('router-seedance-25-edit', { mode: 'object_swap', target: 'the man in red', prompt: '' }), /^Replace the man in red in Video 1 with the character from Image 1\./);
ok(`Kling Image O1 Router "${kir.prompt}", fal "${kif.prompt}"; Seedance 2.5 Edit swap says Video 1 / Image 1`);
