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
  for (const [provider, tok] of [['api-kling-image', '<<<image_1>>>'], ['comfy-qwen21', '<image1>'], ['comfy-flux3-klein', '<ref_image_0>']]) {
    const r: any = await promptPeek(face, { provider }, { image: 1, face: 1 }); assert.ok(String(r.prompt).includes(`background of ${tok} unchanged`), `${provider}: ${r.prompt}`); }
  ok('Kling, Qwen Image 2.1 and FLUX 3 Klein read "the … of <their token>"');
} finally { fs.rmSync(D, { recursive: true, force: true }); }
