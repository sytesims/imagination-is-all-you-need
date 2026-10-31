// One Audio page (2026-10-23): the Audio workflow registry (shared/audioWorkflows.ts) and the old-URL redirects. Pure: the live tool registry, no server.
// Run: npx tsx test/audio-workflows.test.ts
import assert from 'node:assert/strict';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
process.env.OPENHIGGSFIELD_DATA_DIR ||= fs.mkdtempSync(path.join(os.tmpdir(), 'audiowf-'));
const { getTool } = await import('../src/tools/registry.ts');
const W = await import('../src/shared/audioWorkflows.ts');
const ok = (m: string) => console.log('ok ' + m);

assert.deepEqual(W.validateAudioWorkflows(getTool as any), [], 'recipes agree with their tools');
assert.deepEqual(W.AUDIO_WORKFLOW_IDS, ['music', 'sfx', 'voiceover', 'change-voice', 'translate', 'soundtrack-music', 'soundtrack-sound', 'cover']);
assert.equal(W.AUDIO_DEFAULT_WORKFLOW, 'music');
ok('validate: 8 workflows, no problems, Music first');

const pl = W.audioWorkflowsPayload(getTool as any); const by = Object.fromEntries(pl.workflows.map((w) => [w.id, w]));
const tm = Object.fromEntries(pl.workflows.map((w) => [w.id, `${w.tool}:${w.mode}`]));
assert.deepEqual(tm, { music: 'audio:music', sfx: 'audio:sfx', voiceover: 'voice:voiceover', 'change-voice': 'voice:change-voice', translate: 'voice:translate', 'soundtrack-music': 'soundtrack:music', 'soundtrack-sound': 'soundtrack:v2s', cover: 'audio:cover' });
assert.ok(!pl.workflows.some((w) => /lip/i.test(w.id) || w.mode === 'lipsync'), 'lip sync is not an Audio workflow');
for (const w of pl.workflows) {
  assert.ok(w.models[w.mode]?.length, `${w.id}: has models`); assert.equal(w.route, `/audio?workflow=${w.id}`); assert.equal(w.runner.toolId, w.tool); assert.equal(w.locked.types, JSON.stringify([w.mode]));
  for (const p of w.models[w.mode]) assert.ok(w.modelInfo[p], `${w.id}: modelInfo for ${p}`);
  for (const c of w.controls) if (c.options) assert.ok(c.options.length && (c.default == null || c.options.some((o) => o.value === c.default)), `${w.id}.${c.field}: default is an option`);
}
ok('payload: tool:mode per workflow, models, routes, modelInfo, control defaults');

// local music: YuE2 and MiniMax Music 3 first among the local models; Cover is YuE2 only, needs a song and lyrics
const music = by.music.models.music; // 2026-10-27: cloud-minimax-music (MiniMax Music 3's Comfy Cloud twin) sits right after its open engine
assert.deepEqual(music.filter((p) => p.startsWith('comfy-')), ['comfy-yue2', 'comfy-minimax-music3', 'comfy-acestep']); assert.equal(music[music.indexOf('comfy-minimax-music3') + 1], 'cloud-minimax-music');
assert.ok(by.music.models.music.includes('api-seed-audio') && by.sfx.models.sfx.includes('api-seed-audio') && !by.music.lyrics.models.includes('api-seed-audio'), 'Seed Audio: Music + Sound effects, no lyrics');
assert.deepEqual(by.cover.models.cover, ['comfy-yue2']); assert.equal(by.cover.lyrics.mode, 'required'); assert.deepEqual(by.cover.slots.map((s) => [s.name, s.required]), [['audio', true]]);
assert.equal(by.music.lyrics.mode, 'optional'); assert.deepEqual(by.music.lyrics.requiredFor, ['comfy-yue2']); assert.equal(by.sfx.lyrics.mode, 'hidden');
assert.match(by.cover.modelInfo['comfy-yue2'].workflow?.line ?? '', /audio_yue2_music_cover/); assert.match(by.music.modelInfo['comfy-yue2'].workflow?.line ?? '', /audio_yue2_text2music/);
assert.match(by.music.modelInfo['comfy-minimax-music3'].workflow?.line ?? '', /audio_minimax_music_3/);
assert.deepEqual(by['change-voice'].oneOf, ['video', 'audio']);
ok('music: YuE2 > MiniMax Music 3 > ACE-Step locally; Cover = YuE2 + song + lyrics; credits name the official templates');

// redirects
const R = (p: string, s = '', h = '') => W.audioRedirectTarget(p, s, h);
assert.equal(R('/tools/voice'), '/audio?workflow=voiceover');
assert.equal(R('/tools/voice/', '?mode=change-voice'), '/audio?workflow=change-voice');
assert.equal(R('/tools/voice', '?mode=translate&from=j1', '#x'), '/audio?workflow=translate&from=j1#x', 'other query and hash kept');
const { videoRedirect } = await import('../src/shared/videoWorkflows.ts');
assert.equal(R('/tools/voice', '?mode=lipsync&from=j3'), videoRedirect('/tools/voice', '?mode=lipsync&from=j3'), 'lip sync goes to Video, the same URL as the Video redirect');
assert.match(R('/tools/voice', '?mode=lipsync')!, /^\/video\?workflow=lip-sync/);
assert.equal(R('/tools/soundtrack'), '/audio?workflow=soundtrack-music'); assert.equal(R('/tools/soundtrack', '?mode=v2s'), '/audio?workflow=soundtrack-sound');
assert.equal(R('/tools/soundtrack', '?from=j2'), '/audio?workflow=soundtrack-music&from=j2');
assert.equal(R('/audio', '?mode=cover'), '/audio?workflow=cover'); assert.equal(R('/audio'), null, 'the Audio page itself does not redirect');
assert.equal(R('/audio', '?workflow=sfx&mode=music'), null, 'a workflow link is left alone');
assert.equal(R('/tools/voice', '?mode=unknown'), '/audio?workflow=voiceover', 'an unknown mode falls back to the path');
assert.deepEqual(Object.keys(W.AUDIO_PATH_REDIRECTS).sort(), ['/tools/soundtrack', '/tools/voice']); assert.equal(R('/audio'), null, '/audio is the Audio page itself (2026-10-31)');
ok('redirects: voice / soundtrack and their mode links → /audio?workflow=…; lipsync → Video');
console.log('audio-workflows: all checks passed');
