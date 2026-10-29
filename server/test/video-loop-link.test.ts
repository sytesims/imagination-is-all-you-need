// B6: same-page links must reach the mounted Create Video model and pending Loop state.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../../web/src/tools/app/AppTool.tsx', import.meta.url), 'utf8');
const studio = readFileSync(new URL('../../web/src/ui/video/VideoStudio.tsx', import.meta.url), 'utf8');
const effect = app.slice(app.indexOf('/* The Create Video composer'), app.indexOf('useModelLink(tool'));
assert.match(effect, /tool.id !== 'h3-video'/);
assert.match(effect, /location.pathname !== path/);
assert.match(effect, /engineForModelParam\(tool, modelParam\(\)\)/);
assert.match(effect, /addEventListener\('popstate', apply\)/);
assert.match(effect, /removeEventListener\('popstate', apply\)/);
assert.match(studio, /setAskLoop\(true\)/);
assert.match(studio, /\[canLoop, askLoop\]/);
console.log('ok mounted video composer observes same-page model/Loop links and removes listeners');
