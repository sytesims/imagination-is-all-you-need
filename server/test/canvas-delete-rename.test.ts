// Delete and rename (B8 / B13, 2026-10-31): a deleted card takes its link arrows with it; a typed name is kept clean.
// Run: npx tsx test/canvas-delete-rename.test.ts   (no server, no network, no browser)
import assert from 'node:assert/strict';
import { linkArrowsWith } from '../../web/src/canvas/links.ts';
import { cleanName, NAME_MAX } from '../../web/src/canvas/cardLook.ts';

const arrows = [
  { id: 'a1', from: 'up', to: 'card' }, // into the card
  { id: 'a2', from: 'card', to: 'next' }, // out of it
  { id: 'a3', from: 'up', to: 'other' }, // someone else's link
  { id: 'a4', from: 'card', to: null }, // a loose arrow drawn from the card: stays
  { id: 'a5', from: null, to: null },
];
assert.deepEqual(linkArrowsWith('card', arrows), ['a1', 'a2']);
assert.deepEqual(linkArrowsWith('up', arrows), ['a1', 'a3']);
assert.deepEqual(linkArrowsWith('nobody', arrows), []);
assert.deepEqual(linkArrowsWith('card', []), []);

assert.equal(cleanName('  Hero   close-up \n'), 'Hero close-up');
assert.equal(cleanName('   '), '');
const long = cleanName('word '.repeat(60)); assert.ok(long.length <= NAME_MAX && !long.endsWith(' '));
console.log('canvas delete and rename: ok');
