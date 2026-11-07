/**
 * One box type on the Canvas: the Group (Canvas release 2, step 1; user decision 2026-11-07).
 *
 * Release 1 had two boxes: the old "group" card (`ohf-group`, membership by position: whatever sat inside its box) and the frame
 * (`ohf-frame`, real children through parentId). They are now one Group, stored as `ohf-frame`. Old boards are moved over when they
 * load, by the centre rule the old group used for Run all (nodeLogic.groupGenIds): a card whose centre sits inside the old group's box
 * becomes its child. So nobody's group changes what it holds.
 *
 * Rules (pure, no React, no DOM; boardDocOf runs it for every reader: the page, the agent's summary, the item count):
 *  - each `ohf-group` becomes an `ohf-frame` with an empty name (an empty name = the auto name from its first step) and `meta.from: 'group'`;
 *  - only nodes on the page (no parent yet) move in; a node already inside a frame keeps its frame;
 *  - a node goes into the smallest old group whose box holds its centre and is bigger than the node (so a small box can sit in a big
 *    one, and two boxes of the same size never hold each other);
 *  - positions stay where they were on the page (a child's x, y become relative to its group);
 *  - parents come before their children in the draw order.
 */
import type { BoardDoc, BoardDocNode } from './boardDoc.js';

/** The Group's saved type (boardDoc.FRAME_TYPE; written out here so the two files don't import each other at run time). */
const FRAME_TYPE = 'ohf-frame';

/** The old group card's type (release 1 and before). */
export const OLD_GROUP_TYPE = 'ohf-group';

type Box = { x: number; y: number; w: number; h: number };
const area = (b: Box) => Math.max(0, b.w) * Math.max(0, b.h);
const holds = (b: Box, x: number, y: number) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

/** Page boxes of every node (x, y in the doc are relative to the parent). */
function pageBoxes(nodes: BoardDocNode[]): Map<string, Box> {
  const by = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map<string, Box>();
  const abs = (n: BoardDocNode, seen = 0): { x: number; y: number } => {
    const p = n.parentId && seen < 64 ? by.get(n.parentId) : undefined;
    const pp = p ? abs(p, seen + 1) : { x: 0, y: 0 };
    return { x: pp.x + n.x, y: pp.y + n.y };
  };
  for (const n of nodes) out.set(n.id, { ...abs(n), w: n.w, h: n.h });
  return out;
}

/** Parents before their children, otherwise the old draw order; z renumbered 0…n-1. */
function parentsFirst(nodes: BoardDocNode[]): BoardDocNode[] {
  const by = new Map(nodes.map((n) => [n.id, n]));
  const sorted = [...nodes].sort((a, b) => a.z - b.z);
  const out: BoardDocNode[] = [];
  const done = new Set<string>();
  const place = (n: BoardDocNode, depth = 0) => {
    if (done.has(n.id)) return;
    const p = n.parentId ? by.get(n.parentId) : undefined;
    if (p && depth < 64) place(p, depth + 1);
    done.add(n.id);
    out.push(n);
  };
  for (const n of sorted) place(n);
  return out.map((n, z) => ({ ...n, z }));
}

/** Does this board still hold an old group card? */
export const hasOldGroups = (doc: BoardDoc) => doc.nodes.some((n) => n.type === OLD_GROUP_TYPE);

/** Every old group card → a Group (`ohf-frame`) holding what sat inside it. A board without one comes back as it was. */
export function migrateGroups(doc: BoardDoc): BoardDoc {
  if (!hasOldGroups(doc)) return doc;
  const boxes = pageBoxes(doc.nodes);
  const groups = doc.nodes.filter((n) => n.type === OLD_GROUP_TYPE);
  /* the smallest old group that holds this node's centre and is bigger than it */
  const homeOf = (n: BoardDocNode): BoardDocNode | null => {
    const b = boxes.get(n.id)!;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    let best: BoardDocNode | null = null;
    for (const g of groups) {
      if (g.id === n.id) continue;
      const gb = boxes.get(g.id)!;
      if (!holds(gb, cx, cy) || area(gb) <= area(b)) continue;
      if (!best || area(gb) < area(boxes.get(best.id)!)) best = g;
    }
    return best;
  };
  const nodes = doc.nodes.map((n): BoardDocNode => {
    let out: BoardDocNode = n;
    if (n.type === OLD_GROUP_TYPE) {
      out = { ...n, type: FRAME_TYPE, props: { name: '', color: 'black' }, meta: { ...(n.meta ?? {}), from: 'group' } };
    }
    if (n.parentId) return out;
    const home = homeOf(n);
    if (!home) return out;
    const b = boxes.get(n.id)!;
    const hb = boxes.get(home.id)!;
    return { ...out, parentId: home.id, x: b.x - hb.x, y: b.y - hb.y };
  });
  return { ...doc, nodes: parentsFirst(nodes) };
}
