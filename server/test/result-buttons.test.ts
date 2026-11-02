// Result viewer buttons (QA 2026-11-02): one media-kind helper (FLAC / OGG / Opus / AAC are audio, Save keeps the real extension); the hand-off
// list offers a tool only when its main input takes this kind (no Voice Studio or clip tools for a picture); Translate / Change voice / Music Bed
// open the Audio composer with the workflow picked, and that page asks the server for the workflow's own tool's slot.
// Run: npx tsx test/result-buttons.test.ts   (temp data dir, no server, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'rbuttons-')); process.env.OPENHIGGSFIELD_DATA_DIR = D; process.env.OPENHIGGSFIELD_ENV_FILE = path.join(D, 'none.env'); process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const { resultKindOfUrl, fileExtOf } = await import('../../web/src/shared/mediaKind.ts');
const { toolOpenHref, handoffHome, pageToolId } = await import('../../web/src/shared/workflowLinks.ts');
const { mainInputTakes } = await import('../src/routesGaps.ts');
const { getTool } = await import('../src/tools/registry.ts');
const ok = (m: string) => console.log('ok ' + m);

for (const e of ['flac', 'ogg', 'opus', 'aac', 'm4a', 'mp3', 'wav']) assert.equal(resultKindOfUrl(`/files/a.${e}?v=1`), 'audio', e);
assert.equal(resultKindOfUrl('/files/a.mp4'), 'video'); assert.equal(resultKindOfUrl('/files/a.png'), 'image'); assert.equal(resultKindOfUrl('/files/a.glb'), '3d');
assert.equal(fileExtOf('/files/song.FLAC?x=1'), 'flac'); assert.equal(fileExtOf('/files/clip.webm#t=1'), 'webm'); assert.equal(fileExtOf('/api/x'), null);
ok('FLAC / OGG / Opus / AAC results are audio; Save keeps the real extension');

const T = (id: string) => { const t = getTool(id); assert.ok(t, id); return t!; };
assert.equal(mainInputTakes(T('voice'), '/files/a.png'), false, 'Voice Studio is not offered for a picture');
for (const id of ['object-swap', 'motion-transfer', 'restyle', 'reshoot', 'h3-extend']) assert.equal(mainInputTakes(T(id), '/files/a.png'), false, `${id}: a clip tool is not offered for a picture`);
for (const id of ['image-upscale', 'app-relight', 'camera', 'h3-video']) assert.equal(mainInputTakes(T(id), '/files/a.png'), true, `${id} takes a picture`);
for (const id of ['upscale', 'object-swap', 'app-music-bed']) assert.equal(mainInputTakes(T(id), '/files/a.mp4'), true, `${id} takes a clip`);
assert.equal(mainInputTakes(T('image-upscale'), '/files/a.mp4'), false); assert.equal(mainInputTakes(T('upscale'), '/files/a.flac'), false);
ok('hand-off list: a tool is offered only when its main input takes the result’s kind');

assert.equal(toolOpenHref({ id: 'app-translate-video' }), '/audio?workflow=translate');
assert.equal(toolOpenHref({ id: 'app-change-voice' }), '/audio?workflow=change-voice');
assert.equal(toolOpenHref({ id: 'app-music-bed' }), '/audio?workflow=soundtrack-music');
assert.equal(handoffHome('/tools/app-translate-video?fromJob=j1&as=video&out=0'), '/audio?workflow=translate&fromJob=j1&as=video&out=0');
assert.equal(handoffHome('/tools/app-relight?fromJob=j1&out=0'), '/image?workflow=relight&fromJob=j1&out=0');
assert.equal(handoffHome('/video?workflow=extend&fromJob=j1'), '/video?workflow=extend&fromJob=j1');
assert.equal(pageToolId('/audio', '?workflow=translate'), 'voice'); assert.equal(pageToolId('/audio', '?workflow=soundtrack-music'), 'soundtrack');
assert.equal(pageToolId('/audio', ''), 'audio'); assert.equal(pageToolId('/video', '?workflow=extend'), 'h3-extend');
ok('Translate / Change voice / Music Bed open the Audio composer; the page asks for its workflow tool’s slot (voice, soundtrack)');
process.exit(0);
