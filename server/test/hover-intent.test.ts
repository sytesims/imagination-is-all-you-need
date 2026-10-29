// Hover intent's aim test (web/src/shared/hoverAim.ts): the corridor from where the pointer left a row to the hover card's near edge,
// used by the model menu's preview card and the Models page card (web/src/shared/hoverIntent.ts).
// Run: npx tsx test/hover-intent.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { inAimTriangle } from '../../web/src/shared/hoverAim.ts';
const ok = (m: string) => console.log('ok ' + m);

const card = { left: 400, top: 100, right: 700, bottom: 540 }; // a card to the right of the menu
const apex = { x: 386, y: 300 }; // where the pointer left the row, 14 px left of the card

assert.equal(inAimTriangle({ x: 395, y: 300 }, apex, card), true); // straight across the gap
assert.equal(inAimTriangle({ x: 395, y: 200 }, apex, card), true); // diagonally up, inside the corridor
assert.equal(inAimTriangle({ x: 395, y: 420 }, apex, card), true); // diagonally down, inside the corridor
ok('moving toward the card counts as aiming');

assert.equal(inAimTriangle({ x: 395, y: 120 }, apex, card), false); // too steep: heading to another row, not the card
assert.equal(inAimTriangle({ x: 380, y: 300 }, apex, card), false); // moving back into the menu
assert.equal(inAimTriangle({ x: 383, y: 330 }, apex, card), false); // down the list, back over the menu
ok('moving away (back, along the list, too steep) is not aiming');

assert.equal(inAimTriangle({ x: 550, y: 110 }, apex, card), true);
ok('a point over the card counts');

const left = { left: 60, top: 100, right: 360, bottom: 540 }; // the card flipped to the left of the menu
assert.equal(inAimTriangle({ x: 365, y: 260 }, { x: 374, y: 300 }, left), true);
assert.equal(inAimTriangle({ x: 380, y: 300 }, { x: 374, y: 300 }, left), false);
ok('mirrored when the card sits on the left');

assert.equal(inAimTriangle({ x: 500, y: 80 }, { x: 500, y: 50 }, card), false); // apex above the card: no corridor, only the card itself
assert.equal(inAimTriangle({ x: 500, y: 120 }, { x: 500, y: 50 }, card), true);
ok('no corridor when the apex is above or below the card');
