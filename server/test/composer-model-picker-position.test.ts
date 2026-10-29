// Composer placement contract. Actual browser geometry is verified separately.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = (p: string) => readFileSync(new URL('../../web/src/' + p, import.meta.url), 'utf8');
for (const [file, id] of [['ui/video/VideoStudio.tsx', 'vs-model-list'], ['ui/audio/AudioPage.tsx', 'ap-model-list'], ['ui/next/ImageCanvas.tsx', 'ic-pop-model']]) {
  const text = source(file); const marker = text.indexOf(`testId="${id}"`);
  assert.ok(marker >= 0, `${file}: model picker exists`);
  const props = text.slice(text.lastIndexOf('<ModelMenu', marker), text.indexOf('/>', marker));
  assert.match(props, /placement="top"/, `${file}: composer model menu opens above its trigger`);
  assert.match(props, /gap=\{4\}/, `${file}: same chip gap as Image`);
  assert.match(props, /watch=\{dock\}/, `${file}: repositions when the composer grows`);
  assert.doesNotMatch(props, /avoid=\{dock\}/, `${file}: does not move above/alongside the whole dock`);
}
assert.match(source('ui/film/FilmInspector.tsx'), /placement="right"/, 'intentional inspector-side picker unchanged');
assert.match(source('shared/ModelMenu.tsx'), /placement = 'right'/, 'shared default unchanged for side panels');
console.log('ok Image/Video/Audio composer model pickers share top placement; sidebar pickers unchanged (source contract)');
