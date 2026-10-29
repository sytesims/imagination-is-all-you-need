// A workflow switch never brings in a foreign prompt (2026-10-26 bug: picking Re-shoot showed an old Motion Control job's prompt, in Kling's
// <<<video_1>>> form). Covers: the model-token → chip mapping (shared/typedPrompt.ts), the saved-draft cleaning (web/src/shared/batch1.ts
// useDraftField / useFormDraft), per-workflow draft keys, and that the Video picker carries no prompt. Run: npx tsx test/prompt-stale.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs'; import path from 'node:path';
const { chipsFromModelTokens, hasModelTokens } = await import('../src/shared/typedPrompt.ts');

// 1. tokens back to chips; plain words and chips untouched
{ const live = 'In <<<video_1>>>, replace the blue mannequin with the woman from <<<image_1>>>: same face, long dark hair, black crop top';
  assert.equal(chipsFromModelTokens(live), 'In @video1, replace the blue mannequin with the woman from @image1: same face, long dark hair, black crop top');
  assert.equal(chipsFromModelTokens('<Picture 2> dances in <Video 1> to <Audio 1>'), '@image2 dances in @video1 to @audio1');
  assert.equal(chipsFromModelTokens('<image3> and <ref_image_0>'), '@image3 and @image1', 'Qwen <imageN>; FLUX Klein zero-based');
  const typed = 'Image 1 walks; @image2 waves, video 1 style'; assert.equal(chipsFromModelTokens(typed), typed, 'typed words and chips stay');
  assert.ok(hasModelTokens(live)); assert.ok(!hasModelTokens(typed)); assert.ok(!hasModelTokens(undefined)); assert.ok(!hasModelTokens(''));
  assert.ok(hasModelTokens('x <<<video_1>>>') && hasModelTokens('x <<<video_1>>>'), 'no global-regex lastIndex carry-over between calls');
  console.log('ok model tokens → chips'); }

// 2. saved drafts: per workflow, and a rewritten-form prompt is dropped on load
const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, String(v)), removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear(), key: () => null, get length() { return mem.size; } };
const React = (await import('react')).default; const { renderToString } = await import('react-dom/server');
const { useDraftField, useFormDraft, formDraftKey } = await import('../../web/src/shared/batch1.ts');
const put = (k: string, x: unknown) => mem.set(`${formDraftKey(k)}:prompt`, JSON.stringify({ v: 1, x }));
const promptOf = (dKey: string) => { let out = ''; const C = () => { const [p] = useDraftField(dKey, 'prompt', ''); out = p; return null; }; renderToString(React.createElement(C)); return out; };
{ put('motion-transfer:vbar:motion-control', 'my dancer in @video1');
  assert.equal(promptOf('reshoot:vbar:reshoot'), '', 'Re-shoot starts empty: Motion Control\'s draft is not its own');
  assert.equal(promptOf('motion-transfer:vbar:motion-control'), 'my dancer in @video1', 'a workflow keeps its own typed draft');
  put('reshoot:vbar:reshoot', 'In <<<video_1>>>, replace the blue mannequin with the woman from <<<image_1>>>');
  assert.equal(promptOf('reshoot:vbar:reshoot'), '', 'a rewritten-form draft is discarded');
  put('reshoot:vbar:reshoot', 'orbit left around @image1'); assert.equal(promptOf('reshoot:vbar:reshoot'), 'orbit left around @image1');
  mem.set(formDraftKey('h3-video'), JSON.stringify({ v: 1, state: { prompt: '<Picture 1> walks', duration: 8 } }));
  let st: any = null; const F = () => { st = useFormDraft('h3-video', { prompt: '', duration: 5 }).state; return null; }; renderToString(React.createElement(F));
  assert.equal(st.prompt, '', 'useFormDraft drops a rewritten prompt'); assert.equal(st.duration, 8, '…and keeps the rest of the draft');
  console.log('ok drafts: per workflow, rewritten form dropped'); }

// 3. the Video picker carries no prompt between workflows (the old CARRY copied any on-screen text box into the next workflow)
{ const web = path.resolve(import.meta.dirname, '../../web/src');
  const vw = fs.readFileSync(path.join(web, 'ui/video/VideoWorkflows.tsx'), 'utf8'); const app = fs.readFileSync(path.join(web, 'App.tsx'), 'utf8');
  assert.ok(!/useCarriedPrompt|CARRY\s*=|promptBox\(/.test(vw), 'no prompt carry in the Video picker'); assert.ok(!/useCarriedPrompt/.test(app), 'App does not fill the box on a switch');
  assert.match(vw, /export function pickVideoWorkflow\(id: string\) \{ navigate\(videoWorkflowHref\(id\)\); \}/);
  console.log('ok workflow switch carries no prompt'); }
console.log('ALL OK');
