// The bar's "+" tile (web/src/shared/AddTile.tsx): no counter text, a badge only near the limit, disabled at the limit.
// Run: npx tsx test/add-tile.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { addTileState } from '../../web/src/shared/addTileState.ts';

assert.deepEqual(addTileState(1, 10), { label: 'Add a picture · up to 10', badge: null, full: false }, 'room: no badge, the real limit in the tooltip');
assert.deepEqual(addTileState(8, 10), { label: 'Add a picture · up to 10', badge: '2 left', full: false }, 'near the limit: a tiny badge');
assert.deepEqual(addTileState(9, 10).badge, '1 left');
assert.deepEqual(addTileState(10, 10), { label: 'That’s the most this model takes', badge: null, full: true }, 'at the limit: disabled');
assert.deepEqual(addTileState(12, 10).full, true, 'over the limit (a model switch): still full');
assert.deepEqual(addTileState(0, 1), { label: 'Add a picture', badge: null, full: false }, 'a one-picture model: no "up to 1", no badge');
assert.deepEqual(addTileState(1, 1).full, true, 'a one-picture model with its picture: full');
assert.deepEqual(addTileState(1, 2).badge, null, 'a two-picture model: no badge (the limit is in the tooltip)');
assert.equal(addTileState(0, 4, 'clip').label, 'Add a clip · up to 4');
console.log('ok add tile: tooltip, badge near the limit, full at the limit');
