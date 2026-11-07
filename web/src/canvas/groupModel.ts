/**
 * The Group (Canvas release 2, step 1): one box that holds cards. Pure over BoardApi, so the server tests run it on a real board store.
 *
 * A Group is the board's 'frame' node (saved as `ohf-frame`). Nothing about it is stored beyond its name: its steps, whether its cards are
 * linked and its total are worked out from the board each time, so they can't go stale.
 *  - steps: the generate cards inside it, at any depth, in the order they run (a card fed by another step comes after it);
 *  - linked: at least one link runs between two things inside it. Only a linked Group with a step shows "Run the flow";
 *  - name: what the person typed, else the first step's own title (it follows that card until someone renames the Group).
 */
import type { BoardApi, BoardNode, NodeId } from './boardApi';
import { GEN_TYPE, NODE_DEFS } from './nodeTypes';

/** A card's title (cardTitle.titleOf in the page; passed in so this file stays free of the page's UI imports). */
export type TitleOf = (n: BoardNode) => string;

/** The board's word for a Group node. */
export const GROUP_NODE = 'frame';
/** The room above the cards for the Group's header strip (rf.css .cv-gstrip is 52 px tall), page px. */
export const GROUP_TOP = 76;
/** The name a Group with no steps shows. */
export const GROUP_WORD = 'Group';

export const isGroupNode = (board: BoardApi, id: string | null | undefined) => !!id && board.getNode(id as NodeId)?.type === GROUP_NODE;

/** Everything inside a Group, at any depth (not the Group itself). */
export function groupMembers(board: BoardApi, id: NodeId): NodeId[] {
  const out: NodeId[] = []; const seen = new Set<string>([id]);
  const walk = (pid: NodeId, depth: number) => {
    if (depth > 64) return;
    for (const k of board.childrenOf(pid)) { if (seen.has(k)) continue; seen.add(k); out.push(k); walk(k, depth + 1); }
  };
  walk(id, 0);
  return out;
}

/** Ids in the order they run: a card fed by another one in the list comes after it; otherwise left to right, then top to bottom. */
export function runOrderOf(board: BoardApi, ids: NodeId[]): NodeId[] {
  const set = new Set<string>(ids);
  const pos = (id: NodeId) => board.boundsOf(id) ?? { x: 0, y: 0 };
  const byPlace = [...ids].sort((a, b) => pos(a).x - pos(b).x || pos(a).y - pos(b).y);
  const out: NodeId[] = []; const done = new Set<string>(); const busy = new Set<string>();
  const place = (id: NodeId) => {
    if (done.has(id) || busy.has(id)) return; /* busy: a loop on an old board; it keeps its place */
    busy.add(id);
    for (const l of board.linksInto(id)) if (l.from && set.has(l.from)) place(l.from);
    busy.delete(id); done.add(id); out.push(id);
  };
  for (const id of byPlace) place(id);
  return out;
}

/** The generate cards inside a Group, in run order. */
export function groupSteps(board: BoardApi, id: NodeId): NodeId[] {
  return runOrderOf(board, groupMembers(board, id).filter((k) => board.getNode(k)?.type === GEN_TYPE));
}

/** At least one link between two things inside the Group. */
export function groupLinked(board: BoardApi, id: NodeId): boolean {
  const inside = new Set<string>(groupMembers(board, id));
  return board.links().some((l) => !!l.from && !!l.to && inside.has(l.from) && inside.has(l.to));
}

/** The name the Group shows: the one typed, else its first step's title, else "Group". */
export function groupName(board: BoardApi, id: NodeId, title: TitleOf): string {
  const typed = String((board.getNode(id)?.props as any)?.name ?? '').trim();
  if (typed) return typed;
  const first = groupSteps(board, id)[0]; const n = first ? board.getNode(first) : null;
  return (n ? title(n) : '') || GROUP_WORD;
}

/** "Run the flow" takes every step that isn't running already (a running one is waited for by the cards after it). */
export function flowRunIds(board: BoardApi, id: NodeId): NodeId[] {
  return groupSteps(board, id).filter((k) => (board.getNode(k)?.props as any)?.status !== 'running');
}

/** What a Group's header shows, in one read: the step count, whether "Run the flow" is offered, and which cards it runs. */
export interface GroupFacts { name: string; steps: number; linked: boolean; runIds: NodeId[]; allDone: boolean }
export function groupFacts(board: BoardApi, id: NodeId, title: TitleOf): GroupFacts {
  const steps = groupSteps(board, id);
  const status = (k: NodeId) => (board.getNode(k)?.props as any)?.status;
  return { name: groupName(board, id, title), steps: steps.length, linked: groupLinked(board, id), runIds: flowRunIds(board, id),
    allDone: steps.length > 0 && steps.every((k) => status(k) === 'done') };
}
/** "Run the flow" shows only on a Group whose cards are linked and that holds a step (while every step runs, it stays, off). */
export const showsRun = (f: Pick<GroupFacts, 'linked' | 'steps'>) => f.linked && f.steps > 0;
export const stepsWords = (n: number) => (n === 0 ? 'No steps yet' : `${n} step${n === 1 ? '' : 's'}`);

/** Where a node lands after a drag (the centre rule, as old boards were moved over): inside the smallest Group whose box holds its centre
 *  and is bigger than it, never inside itself or one of its own children; else on the board. */
export function groupAt(board: BoardApi, id: NodeId): NodeId | null {
  const b = board.boundsOf(id); if (!b) return null;
  const mine = new Set<string>([id, ...groupMembers(board, id)]);
  let best: { id: NodeId; area: number } | null = null;
  for (const n of board.nodes()) {
    if (n.type !== GROUP_NODE || mine.has(n.id)) continue;
    const g = board.boundsOf(n.id); if (!g) continue;
    const area = g.w * g.h;
    if (b.midX < g.minX || b.midX > g.maxX || b.midY < g.minY || b.midY > g.maxY || area <= b.w * b.h) continue;
    if (!best || area < best.area) best = { id: n.id, area };
  }
  return best?.id ?? null;
}
/** After a drag: each moved node goes into the Group under its centre, or out onto the board (part of the same undo step). */
export function settleIntoGroups(board: BoardApi, ids: NodeId[]): number {
  let moved = 0;
  for (const id of ids) {
    if (!board.getNode(id)) continue;
    /* a node dragged along with its Group stays where it is */
    const up = board.parentOf(id); if (up && ids.includes(up)) continue;
    const home = groupAt(board, id);
    if (home === (up ?? null)) continue;
    board.setParent([id], home); moved++;
  }
  return moved;
}

/** A Group (release 2: the one box) around the selected cards, which move into it, or an empty Group in the middle of the view. It sits
 *  behind its cards, leaves room at the top for its header strip, and has no name of its own: it takes its first step's title. ⌘G, the
 *  toolbar's Group and the right-click menu all make it. One undo step. */
export function createGroupNode(board: BoardApi, o: { at?: { x: number; y: number }; select?: boolean } = {}): NodeId {
  const def = NODE_DEFS.group;
  const sel = board.selection().filter((id) => board.getNode(id));
  /* a card inside a selected Group goes with its Group */
  const inSelected = (id: string) => { let up = board.parentOf(id as NodeId); for (let k = 0; up && k < 64; k++) { if (sel.includes(up)) return true; up = board.parentOf(up); } return false; };
  const picked = sel.filter((id) => !inSelected(id)) as NodeId[];
  const bounds = picked.map((id) => board.boundsOf(id)).filter(Boolean) as { minX: number; minY: number; maxX: number; maxY: number }[];
  let box: { x: number; y: number; w: number; h: number };
  if (bounds.length) {
    const minX = Math.min(...bounds.map((b) => b.minX)), minY = Math.min(...bounds.map((b) => b.minY));
    const maxX = Math.max(...bounds.map((b) => b.maxX)), maxY = Math.max(...bounds.map((b) => b.maxY));
    box = { x: minX - 32, y: minY - GROUP_TOP, w: Math.max(def.minW, maxX - minX + 64), h: Math.max(def.minH, maxY - minY + GROUP_TOP + 32) };
  } else {
    const c = o.at ?? board.viewportBounds().center;
    box = { x: c.x - def.defaultW / 2, y: c.y - def.defaultH / 2, w: def.defaultW, h: def.defaultH };
  }
  /* cards that all sit in one Group: the new Group goes inside that one */
  const parents = new Set(picked.map((id) => board.parentOf(id) ?? ''));
  const outer = parents.size === 1 ? ([...parents][0] as NodeId) || null : null;
  board.mark('new group');
  let id = '' as NodeId;
  board.batch(() => {
    id = board.addNode({ type: GROUP_NODE, x: box.x, y: box.y, props: { w: box.w, h: box.h, name: '', color: 'black' } });
    if (outer) board.setParent([id], outer);
    board.toBack([id]);
    if (picked.length) board.setParent(picked, id);
  });
  if (o.select !== false) board.select([id]);
  return id;
}
