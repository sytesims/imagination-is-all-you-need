// Header hover menus: picking an item closes the menu and hover can't reopen it until the pointer leaves (web/src/shared/hoverMenuLock.ts).
// Run: npx tsx test/hover-menu-lock.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { isMenuActivation, createHoverLock } from '../../web/src/shared/hoverMenuLock.ts';
const ok = (m: string) => console.log('ok ' + m);

assert.equal(isMenuActivation({ type: 'click', button: 0 }), true); // plain click, cmd/ctrl-click (new tab) too
assert.equal(isMenuActivation({ type: 'auxclick', button: 1 }), true); // middle-click opens a new tab: still closes
assert.equal(isMenuActivation({ type: 'auxclick', button: 2 }), false); // right-click: context menu, keep the menu
assert.equal(isMenuActivation({ type: 'keydown', key: 'Enter' }), true);
assert.equal(isMenuActivation({ type: 'keydown', key: ' ' }), true);
assert.equal(isMenuActivation({ type: 'keydown', key: 'ArrowDown' }), false);
assert.equal(isMenuActivation({ type: 'mouseenter' }), false);
ok('click, middle-click, Enter and Space pick an item; arrows, right-click and hover do not');

const l = createHoverLock();
assert.equal(l.canHoverOpen(), true);
l.lock(); assert.equal(l.canHoverOpen(), false);
l.pointerAt(true); l.pointerAt(true); assert.equal(l.canHoverOpen(), false); // still over the trigger / where the panel was
l.pointerAt(false); assert.equal(l.canHoverOpen(), true); // left once: hover opens again on the way back
l.lock(); l.unlock(); assert.equal(l.canHoverOpen(), true); // a click on the trigger opens it and unlocks
l.pointerAt(false); l.pointerAt(false); assert.equal(l.locked, false); // moves outside while unlocked change nothing
ok('the lock holds while the pointer stays, releases once it leaves');

l.lock('image'); assert.equal(l.canHoverOpen('image'), false); // same menu: stays shut
assert.equal(l.canHoverOpen('more'), true); assert.equal(l.locked, false); // another trigger: opens, lock gone
assert.equal(l.canHoverOpen('image'), true);
ok('hovering a different trigger opens it; the used menu stays shut until the pointer leaves');
