// People prompts (2026-11-01): Face Swap, Person Swap (both outfit choices), Character Sheet (photo and text) and Try-On, as every offered model
// receives them (the prompt peek: the app's compose + that model's reference tokens). No possessive on an image reference on any model:
// "image 1's" reaches Kling as <<<image_1>>>'s, Qwen Image 2.1 as <image1>'s and FLUX 3 Klein as <ref_image_0>'s, so prompts say "the … of image 1".
// Run: npx tsx test/people-prompts.test.ts   (in-process, temp data dir, mock backend, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'people-prompts-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock' });
const ok = (m: string) => console.log('ok ' + m);
const { getTool } = await import('../src/tools/registry.ts');
const { promptPeek } = await import('../src/routesPromptPeek.ts');
/** A possessive straight after a reference, in any model's form. */
const POSSESSIVE = /(?:<<<image_\d+>>>|<image\d+>|<ref_image_\d+>|<Picture \d+>|@Image ?\d+|\b(?:image|picture|img) ?\d+)['’]s\b/i;
const providersOf = (t: any): string[] => t.providers.map((p: any) => (typeof p === 'string' ? p : p.id));
try {
  const cases: [string, Record<string, string>, Record<string, number>][] = [
    ['app-face-swap', { prompt: 'the woman on the left' }, { image: 1, face: 1 }],
    ['app-person-swap', {}, { image: 1, person: 1 }],
    ['app-person-swap', { outfit: 'keep' }, { image: 1, person: 1 }],
    ['app-character-sheet', { prompt: 'the man on the left.' }, { image: 1 }],
    ['app-character-sheet', { prompt: 'a courier in a yellow raincoat' }, {}],
    ['app-try-on', {}, { image: 1, garment: 1 }],
  ];
  let seen = 0;
  for (const [id, fields, filled] of cases) { const t: any = getTool(id); assert.ok(t, id);
    for (const provider of providersOf(t)) for (const runOn of [undefined, 'local', 'comfy-cloud']) {
      const r: any = await promptPeek(t, { ...fields, provider, ...(runOn ? { runOn } : {}) }, filled); if (!r.ok) continue; // a photo needs an edit model
      seen++; assert.doesNotMatch(String(r.prompt ?? ''), POSSESSIVE, `${id} on ${provider}${runOn ? ` (${runOn})` : ''}: ${r.prompt}`); } }
  assert.ok(seen > 100, `checked ${seen} prompts`);
  ok(`no possessive on an image reference: ${seen} People prompts across every offered model`);
  // the tag models really get their tokens (so the check above is not vacuous)
  const face: any = getTool('app-face-swap');
  for (const [provider, tok] of [['api-kling-image', '<<<image_1>>>'], ['comfy-flux3-klein', '<ref_image_0>']]) {
    const r: any = await promptPeek(face, { provider }, { image: 1, face: 1 }); assert.ok(String(r.prompt).includes(`background of ${tok} unchanged`), `${provider}: ${r.prompt}`); }
  ok('Kling and FLUX 3 Klein read "the … of <their token>"');
  // Qwen Image 2.1 runs the BFS LoRA graphs: the preview shows the trained prompt the graph sends; Person Swap "Keep the photo's outfit" runs the
  // head swap (the body-swap LoRA takes the clothing from <image2>, which would contradict it)
  { const { BFS_HEAD_PROMPT, BFS_BODY_PROMPT, bfsSwapFor } = await import('../src/comfy/bfsSwap.ts'); const { buildPlan } = await import('../src/comfy/plans.ts');
    const { jobWorkflows } = await import('../src/hardware/requirements.ts');
    const person: any = getTool('app-person-swap');
    const peek = async (t: any, f: Record<string, string>, files: Record<string, number>) => (await promptPeek(t, { provider: 'comfy-qwen21', ...f }, files)) as any;
    { const r = await peek(face, { prompt: 'warmer skin' }, { image: 1, face: 1 }); assert.equal(r.prompt, `${BFS_HEAD_PROMPT}. warmer skin`); assert.equal(r.workflowFile, 'create-image-qwen21-faceswap-api.json'); }
    { const r = await peek(person, {}, { image: 1, person: 1 }); assert.equal(r.prompt, BFS_BODY_PROMPT); assert.equal(r.workflowFile, 'create-image-qwen21-personswap-api.json'); }
    { const r = await peek(person, { outfit: 'keep', prompt: 'the woman on the left' }, { image: 1, person: 1 }); assert.equal(r.prompt, `${BFS_HEAD_PROMPT}. the woman on the left`);
      assert.equal(r.workflowFile, 'create-image-qwen21-faceswap-api.json'); assert.doesNotMatch(r.prompt, /clothing/); }
    // the run: the plan, and the files the job needs, follow the same choice
    const png = fs.readFileSync(path.resolve(import.meta.dirname, '../samples/sample-character.png')); fs.writeFileSync(path.join(D, 't.png'), png); fs.writeFileSync(path.join(D, 'q.png'), png);
    for (const [outfit, wf, lora] of [['person', 'create-image-qwen21-personswap-api.json', 'bfs_body_swap_v1.0_qwen_2.1.safetensors'], ['keep', 'create-image-qwen21-faceswap-api.json', 'bfs_head_v1.1_qwen_2.1.safetensors']] as const) {
      const input: any = await person.parseInput({ provider: 'comfy-qwen21', rights: '1', outfit }, { image: ['t.png'], person: ['q.png'] }); assert.ok(!input.error, JSON.stringify(input));
      assert.equal(bfsSwapFor('app-person-swap', 'comfy-qwen21', input)?.workflowFile, wf, outfit);
      const p = buildPlan({ id: `t-${outfit}`, toolId: 'app-person-swap', provider: 'comfy-qwen21', status: 'queued', input } as any);
      assert.equal(p.passes[0].workflow, wf, outfit); assert.equal((p.passes[0] as any).expect?.lora, lora, outfit);
      assert.deepEqual(jobWorkflows(person, 'comfy-qwen21', input), [wf], `${outfit}: the job needs that graph's files`); }
    assert.equal(bfsSwapFor('app-person-swap', 'comfy-qwen21')?.workflowFile, 'create-image-qwen21-personswap-api.json', 'no job: the card keeps its own graph'); }
  ok('Qwen Image 2.1: preview shows the BFS prompt; keep-outfit runs the head swap (plan, LoRA, needed files)');
  // the Person Swap card offers the head-swap LoRA too (the same Face Swap file, listed once); a keep-outfit run without it gets the usual
  // "download first" gate with Face Swap's download, never a raw missing-file error
  { const { getProvider, providerWorkflows } = await import('../src/providers.ts'); const { weightsHere } = await import('../src/hardware/variants.ts');
    const { familiesOf, planFiles } = await import('../src/hardware/downloads.ts'); const R = await import('../src/hardware/requirements.ts');
    const person: any = getTool('app-person-swap'); const qwen = getProvider('comfy-qwen21')!;
    const HEAD = 'bfs_head_v1.1_qwen_2.1.safetensors', BODY = 'bfs_body_swap_v1.0_qwen_2.1.safetensors';
    const card = weightsHere(providerWorkflows(person, qwen)).map((w: any) => w.file);
    assert.ok(card.includes(BODY) && card.includes(HEAD), card.join(', ')); assert.equal(new Set(card).size, card.length, 'each file once');
    assert.ok(!weightsHere(providerWorkflows(face, qwen)).some((w: any) => w.file === BODY), 'Face Swap still needs only the head swap');
    const fams = familiesOf('comfy-qwen21'); const pf = fams.find((f: any) => f.toolIds.includes('app-person-swap'))!; const ff = fams.find((f: any) => f.toolIds.includes('app-face-swap'))!;
    assert.deepEqual(pf.workflows, ['create-image-qwen21-personswap-api.json', 'create-image-qwen21-faceswap-api.json']); assert.deepEqual(ff.workflows, ['create-image-qwen21-faceswap-api.json']);
    const job = async (outfit: string) => person.parseInput({ provider: 'comfy-qwen21', rights: '1', outfit }, { image: ['t.png'], person: ['q.png'] });
    const keep = await job('keep'), def = await job('person'); const prev = process.env.OPENHIGGSFIELD_ENFORCE_WEIGHTS; process.env.OPENHIGGSFIELD_ENFORCE_WEIGHTS = '1';
    try { R.setMissingWeights('local:comfy-qwen21', [HEAD]);
      const g = R.weightsGate(person, 'comfy-qwen21', keep)!; assert.equal(g?.code, 'weights_missing', JSON.stringify(g)); assert.ok(g.downloadable);
      assert.deepEqual(g.missingFiles.map((f: any) => f.file), [HEAD]); assert.equal(g.downloadId, ff.downloadId, 'the Face Swap download, reused');
      assert.ok(planFiles({ downloadId: g.downloadId }, null).files.some((f: any) => f.file === HEAD), 'that download fetches the head-swap LoRA');
      assert.equal(R.weightsGate(person, 'comfy-qwen21', def), null, 'the default swap runs without the head-swap LoRA'); }
    finally { R.setMissingWeights('local:comfy-qwen21', null); if (prev == null) delete process.env.OPENHIGGSFIELD_ENFORCE_WEIGHTS; else process.env.OPENHIGGSFIELD_ENFORCE_WEIGHTS = prev; } }
  ok('Person Swap card offers the head-swap LoRA (Face Swap\'s file, once); keep-outfit without it = the usual download gate');
  // Try-On: FASHN takes no prompt and Bria's instruction is only the user's words (none here), so the job stores none and the peek says so
  { const t: any = getTool('app-try-on'); const png = fs.readFileSync(path.resolve(import.meta.dirname, '../samples/sample-character.png'));
    fs.writeFileSync(path.join(D, 'p.png'), png); fs.writeFileSync(path.join(D, 'g.png'), png);
    for (const provider of providersOf(t)) {
      const r: any = await t.parseInput({ provider, rights: '1' }, { image: ['p.png'], garment: ['g.png'] }); assert.ok(!r.error, JSON.stringify(r));
      assert.equal(r.prompt, '', `${provider}: no prompt stored`); assert.equal(r.finalPrompt ?? '', '', provider);
      const pk: any = await promptPeek(t, { provider }, { image: 1, garment: 1 }); assert.equal(pk.prompt, ''); assert.equal(pk.noPrompt, 'No prompt: the model reads the two photos only'); } }
  ok('Try-On: no prompt stored or shown (FASHN, Bria)');
} finally { fs.rmSync(D, { recursive: true, force: true }); }
