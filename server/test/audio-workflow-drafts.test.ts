// B5: workflows sharing an engine do not overwrite each other's unsent form/model.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../../web/src/tools/app/AppTool.tsx', import.meta.url), 'utf8');
assert.match(src, /useFormDraft\(awf \? `\$\{tool.id\}:audio:\$\{awf.id\}` : tool.id,/);
console.log('ok audio draft identity includes workflow, not only engine/tool');
