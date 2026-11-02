// The Audio bar's model picker (2026-11-02): the default view (Music) and every picked workflow list the right models, and the menu's Default,
// Auto and the model the bar starts on come from ONE source (tool.workflowDefaults, shared/workflowDefaults.ts), never a second fetch that could
// be missing or stale (GET /api/audio-workflows: until it loaded, Sound effects' menu had no Default and Auto named Seed Audio while ElevenLabs ran).
// Pure: the registry + routing/defaults.ts, as GET /api/tools sends them. Run: npx tsx test/audio-picker.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_DATA_DIR ||= fs.mkdtempSync(path.join(os.tmpdir(), 'audpick-'));
const { getTool } = await import('../src/tools/registry.ts');
const { defaultsBlock } = await import('../src/routing/defaults.ts');
const { audioWorkflowById, AUDIO_WORKFLOW_IDS, AUDIO_DEFAULT_WORKFLOW } = await import('../src/shared/audioWorkflows.ts');
const { initialProviderFor } = await import('../../web/src/shared/defaults.ts');
const { wfDefaultOf } = await import('../../web/src/shared/workflowDefaults.ts');
const ok = (m: string) => console.log('ok ' + m);

/** The tool as the web gets it (GET /api/tools: providers as objects, the defaults block). */
const toolLike = (id: string) => { const t: any = getTool(id)!; return { ...t, providers: t.providers.map((p: string) => ({ id: p })), ...defaultsBlock(t) }; };
/** The picker's list on the Audio page (AudioPage.tsx provs): the tool's providers that run the workflow's mode. */
const listOf = (t: any, mode: string) => t.providers.map((p: any) => p.id).filter((id: string) => !t.app?.providerModes?.[id] || t.app.providerModes[id].includes(mode));

const WANT: Record<string, string[]> = {
  music: ['api-sonilo-music', 'api-seed-audio', 'comfy-yue2', 'comfy-minimax-music3', 'cloud-minimax-music', 'comfy-acestep'],
  sfx: ['api-seed-audio', 'api-eleven-sfx', 'comfy-stable-audio'],
  cover: ['comfy-yue2'],
  'change-voice': ['comfy-chatterbox-vc'],
  translate: ['local-whisper-nllb-chatterbox', 'local-whisper-nllb-f5'],
  'soundtrack-sound': ['api-sonilo-v2m', 'comfy-mmaudio'],
};
const seen: Record<string, string[]> = {};
for (const id of AUDIO_WORKFLOW_IDS) {
  const w = audioWorkflowById(id)!; const t = toolLike(w.tool); const list = listOf(t, w.mode); seen[id] = list;
  assert.ok(list.length > 0, `${id}: the picker lists models`);
  if (WANT[id]) assert.deepEqual([...list].sort(), [...WANT[id]].sort(), `${id}: the picker lists exactly its mode's models`);
  for (const other of ['sfx', 'voiceover', 'music'] as const) if (other !== id && audioWorkflowById(other)!.tool === w.tool && audioWorkflowById(other)!.mode !== w.mode)
    assert.notDeepEqual(list, listOf(t, audioWorkflowById(other)!.mode), `${id}: not ${other}'s list`);
  const d = wfDefaultOf(t, id); assert.ok(d?.id, `${id}: a Default for the menu (tool.workflowDefaults)`);
  assert.ok(list.includes(d!.id!), `${id}: the menu's Default (${d!.id}) is one of its rows`);
  const start = initialProviderFor(t, w.mode, w.id);
  assert.equal(start, d!.start, `${id}: the bar starts on what the menu's Default block says (one source)`);
  assert.ok(list.includes(start), `${id}: the start model (${start}) is listed`);
}
ok('every Audio workflow: its own model list, a listed Default, and the start model = the Default block');
assert.equal(AUDIO_DEFAULT_WORKFLOW, 'music'); assert.deepEqual(seen.music, listOf(toolLike('audio'), 'music'));
assert.ok(!seen.music.includes('api-eleven-sfx') && !seen.sfx.includes('comfy-yue2'), 'default (Music) and Sound effects never share a stray row');
assert.ok(seen.voiceover.includes('api-eleven-tts') && !seen.voiceover.includes('comfy-chatterbox-vc'), 'Voiceover lists voices, not the voice changer');
ok('the default view (Music) vs a picked workflow');
