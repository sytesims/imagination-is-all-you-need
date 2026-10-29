// Canvas node controls: which pointer events a node keeps away from tldraw (nodeFrameModel.isNodeControl).
// 2026-10-28: picking an image model on a card did nothing. The shared model menu renders in a portal on <body> and its rows are
// divs (role=option), so their pointerdown bubbled through the node's React tree into tldraw, whose pointer capture ate the click.
// Run: npx tsx test/canvas-node-controls.test.ts   (no server, no network, no browser)
import assert from 'node:assert/strict';
import { isNodeControl } from '../../web/src/canvas/nodeFrameModel.ts';

/** a tiny stand-in for an element: its own selectors (what closest() matches) and its parent chain */
const el = (sel: string[], parent: any = null) => ({ sel, parent,
  closest(q: string) { const qs = q.split(','); let n: any = this; while (n) { if (n.sel.some((s: string) => qs.includes(s))) return n; n = n.parent; } return null; },
  contains(t: any) { let n = t; while (n) { if (n === this) return true; n = n.parent; } return false; } });

const node = el(['.node']);
const body = el(['body']);
const pop = el(['.apop'], body); const row = el(['[role=option]'], pop); const rowText = el(['b'], row);
const plain = el(['div'], node); const btn = el(['button'], node); const ta = el(['textarea'], node);

// a portalled menu row (outside the node's DOM) is always a control
assert.equal(isNodeControl(rowText, node), true);
assert.equal(isNodeControl(row, node), true);
// inside the node: buttons and fields are controls, the card body is not (so a drag on it still moves the card)
assert.equal(isNodeControl(btn, node), true);
assert.equal(isNodeControl(ta, node), true);
assert.equal(isNodeControl(plain, node), false);
// no node known: the selector rule alone (a popover or an option still counts)
assert.equal(isNodeControl(rowText, null), true);
assert.equal(isNodeControl(null, node), false);
console.log('ok canvas node controls: portalled menus and node controls never reach tldraw');
process.exit(0); // the canvas modules keep timers alive in node
