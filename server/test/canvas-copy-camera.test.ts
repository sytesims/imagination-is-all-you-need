// Copy and camera (B15 / B19, 2026-10-31): a fed prompt says where it comes from; the board slides a card clear of the panel.
// Run: npx tsx test/canvas-copy-camera.test.ts   (no server, no network, no browser)
import assert from 'node:assert/strict';
import { linkedFrom, panelSlide } from '../../web/src/canvas/cardLook.ts';

assert.equal(linkedFrom(['ohf-prompt']), 'From a prompt');
assert.equal(linkedFrom(['ohf-note']), 'From a note');
assert.equal(linkedFrom(['ohf-note', 'ohf-prompt', 'ohf-prompt']), 'From a prompt and a note');

// fits: no slide
assert.equal(panelSlide(200, 700, 1000), 0);
assert.equal(panelSlide(200, 976, 1000), 0);
// grown past the edge (a resize): slide just enough to show its right edge 24 px inside
assert.equal(panelSlide(500, 1100, 1000), 124);
// a card wider than the board: its left edge stops 80 px in, never off the left
assert.equal(panelSlide(300, 1800, 1000), 220);
assert.equal(panelSlide(60, 1200, 1000), 0);
console.log('canvas copy and camera: ok');
