// B3: a model-specific preset waits for the linked model, then is consumed once.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../../web/src/ui/video/VideoWorkflowBar.tsx', import.meta.url), 'utf8');
const effect = src.slice(src.indexOf('const pendingPreset'), src.indexOf('/* ---- slots ---- */'));
assert.match(effect, /useRef\(q0.preset\)/);
assert.match(effect, /optionsOf\(g\)\.some/);
assert.match(effect, /setVal\(g.field, pre\); pendingPreset.current = ''/);
assert.match(effect, /\[wf.id, prov\]/);
console.log('ok preset link retries after model selection, without reapplying on later model switches');
