/** Toolsets: stdio defaults to core; the app's HTTP bridge (--http, what the Canvas connect sheet points at) defaults to core + canvas;
 *  an explicit env or permissions-file list always wins. Run: npx tsx test/toolsets.ts (no server, no network). */
import assert from 'node:assert/strict';
import { enabledToolsets, toolsetOf, TOOLSETS } from '../src/toolsets.js';
import { BOARD_EDIT, READ_ONLY, SPEND } from '../src/permissions.js';

const list = (s: Set<string>) => [...s].sort().join(',');
assert.equal(list(enabledToolsets({}, null)), 'core');
assert.equal(list(enabledToolsets({}, null, true)), 'canvas,core');
assert.equal(list(enabledToolsets({ OPENHIGGSFIELD_MCP_TOOLSETS: 'core' }, null, true)), 'core');
assert.equal(list(enabledToolsets({}, ['core', 'library'], true)), 'core,library');
assert.throws(() => enabledToolsets({ OPENHIGGSFIELD_MCP_TOOLSETS: 'nope' }, null, true));
/* canvas_add_from_job (2026-10-28): a canvas tool that edits the board, never spends */
assert.equal(toolsetOf('canvas_add_from_job'), 'canvas'); assert.ok(BOARD_EDIT.includes('canvas_add_from_job') && !READ_ONLY.includes('canvas_add_from_job') && !SPEND.includes('canvas_add_from_job'));
for (const t of TOOLSETS.canvas) assert.ok(READ_ONLY.includes(t) || BOARD_EDIT.includes(t), `${t} has a permission tier`);
console.log('ok toolsets: http bridge = core,canvas; stdio = core; explicit lists win');
