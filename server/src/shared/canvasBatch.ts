/**
 * Canvas batches (2026-10-27): an agent makes many things on the board at once ("bulk create when needed, not one by one"). Plain
 * functions shared by the server (canvasAgent.ts validates before anything reaches the page) and the board (agentBridge.ts places and
 * creates), so the rules are one copy and the server tests check them without a browser.
 *
 *  - A batch is a list of add_card / add_note / add_frame / connect / move_into items. An item may carry a temporary `ref` ("k1"); a later
 *    item names it where an id goes (inputs_from, from_id, to_id, ids, frame_id, frame). Anything that isn't a ref must be a real node id.
 *  - validateBatch: all or nothing. The first bad item refuses the whole batch with a plain reason (unknown kind, a ref used before it is
 *    made, a duplicate ref, a ref that looks like an id, a card feeding itself, an empty note, too many items).
 *  - batchLayout: where items without `at` go, as one group: each frame is a band (its cards and notes in rows of up to 6), loose items
 *    a band of their own, bands stacked with a gap. Nothing overlaps. Items with `at` keep it (frames with `at` keep their own box).
 *  - batchLine: the one dock line ("Added 12 cards in 3 frames").
 */
export type BatchKind = 'add_card' | 'add_note' | 'add_frame' | 'connect' | 'move_into';
export interface BatchItem {
  kind: BatchKind; ref?: string;
  /* add_card */ workflow?: string; prompt?: string; name?: string; model?: string; settings?: Record<string, string>; inputs_from?: string[];
  /* add_note */ text?: string; color?: string;
  /* cards and notes: the frame they go in (a ref from this batch or a frame id) */ frame?: string;
  /* add_frame */ w?: number; h?: number;
  /* connect */ from_id?: string; to_id?: string;
  /* move_into */ ids?: string[]; frame_id?: string;
  at?: { x: number; y: number };
}
export const BATCH_MAX = 80;
export const BATCH_KINDS: BatchKind[] = ['add_card', 'add_note', 'add_frame', 'connect', 'move_into'];
const REF = /^[A-Za-z0-9_-]{1,40}$/;

/** Every id an item names (where a ref may stand in). */
export function namesOf(it: BatchItem): string[] {
  return [...(it.inputs_from ?? []), ...(it.from_id ? [it.from_id] : []), ...(it.to_id ? [it.to_id] : []), ...(it.ids ?? []), ...(it.frame_id ? [it.frame_id] : []), ...(it.frame ? [it.frame] : [])];
}
const label = (it: BatchItem, i: number) => `Item ${i + 1} (${it.kind}${it.ref ? ` “${it.ref}”` : ''})`;

/** All or nothing: null when the batch is fine, else the plain reason the whole batch is refused. `exists` says whether a real id is on the board (omit to skip). */
export function validateBatch(items: BatchItem[], exists?: (id: string) => boolean): string | null {
  if (!Array.isArray(items) || !items.length) return 'A batch needs at least one item.';
  if (items.length > BATCH_MAX) return `A batch takes at most ${BATCH_MAX} items; this one has ${items.length}. Split it in two.`;
  const made = new Map<string, BatchKind>();
  for (const [i, it] of items.entries()) {
    const at = label(it, i);
    if (!BATCH_KINDS.includes(it?.kind)) return `${at}: “${String(it?.kind)}” can't go in a batch (use add_card, add_note, add_frame, connect or move_into).`;
    if (it.ref != null) {
      if (!REF.test(it.ref)) return `${at}: a ref is a short name like “k1” (letters, digits, - and _).`;
      if (it.kind === 'connect' || it.kind === 'move_into') return `${at}: only cards, notes and frames take a ref.`;
      if (made.has(it.ref)) return `${at}: the ref “${it.ref}” is used twice.`;
    }
    for (const n of namesOf(it)) {
      if (made.has(n)) continue;
      if (items.slice(i + 1).some((x) => x.ref === n)) return `${at}: “${n}” is made later in the batch. Put it before the items that use it.`;
      if (!n.startsWith('shape:')) return `${at}: “${n}” is neither a ref made earlier in this batch nor a node id.`;
      if (exists && !exists(n)) return `${at}: there is no node “${n}” on this board.`;
    }
    const isFrame = (n: string) => made.get(n) === 'add_frame' || (!made.has(n) && n.startsWith('shape:'));
    if (it.kind === 'add_card' && !it.workflow?.trim()) return `${at}: name a workflow (see canvas_list_workflows).`;
    if (it.kind === 'add_note' && !it.text?.trim()) return `${at}: a note needs some text.`;
    if (it.kind === 'add_frame' && !(it.name ?? '').trim()) return `${at}: a frame needs a name.`;
    if (it.kind === 'connect') { if (!it.from_id || !it.to_id) return `${at}: name from_id and to_id.`; if (it.from_id === it.to_id) return `${at}: a card can't feed itself.`; }
    if (it.kind === 'move_into') { if (!it.ids?.length || !it.frame_id) return `${at}: name the ids and the frame_id.`; if (!isFrame(it.frame_id)) return `${at}: “${it.frame_id}” is not a frame.`; }
    if (it.frame && !isFrame(it.frame)) return `${at}: “${it.frame}” is not a frame.`;
    if (it.kind === 'add_card' && it.ref && it.inputs_from?.includes(it.ref)) return `${at}: a card can't feed itself.`;
    if (it.ref) made.set(it.ref, it.kind);
  }
  return null;
}

/** Sizes on the board (page px), the same as the cards and notes the agent makes one by one. */
export const BATCH_GRID = { colW: 440, cardW: 340, cardH: 430, noteSize: 260, rowGap: 130, bandGap: 150, pad: 36, head: 40, cols: 6 };
export interface Box { x: number; y: number; w: number; h: number }
/** Where each item without `at` goes (centre points by item index), and each frame's box, for a group whose top-left is `origin`. */
export function batchLayout(items: BatchItem[], origin: { x: number; y: number }) {
  const G = BATCH_GRID; const at: Record<number, { x: number; y: number }> = {}; const frames: Record<number, Box> = {};
  const refIndex = new Map(items.map((it, i) => [it.ref ?? `#${i}`, i] as const));
  const placed = (it: BatchItem) => !!it.at;
  const frameIdx = items.map((it, i) => (it.kind === 'add_frame' ? i : -1)).filter((i) => i >= 0);
  /* a frame's members: cards and notes with frame = its ref, plus ids a move_into names */
  const members = new Map<number, number[]>(frameIdx.map((f) => [f, []]));
  const inFrame = new Set<number>();
  items.forEach((it, i) => { if ((it.kind === 'add_card' || it.kind === 'add_note') && it.frame && refIndex.has(it.frame)) { const f = refIndex.get(it.frame)!; if (members.has(f)) { members.get(f)!.push(i); inFrame.add(i); } } });
  items.forEach((it) => { if (it.kind === 'move_into' && it.frame_id && refIndex.has(it.frame_id)) { const f = refIndex.get(it.frame_id)!; for (const id of it.ids ?? []) { const m = refIndex.get(id); if (m != null && members.has(f) && !inFrame.has(m) && (items[m].kind === 'add_card' || items[m].kind === 'add_note')) { members.get(f)!.push(m); inFrame.add(m); } } } });
  const loose = items.map((it, i) => i).filter((i) => (items[i].kind === 'add_card' || items[i].kind === 'add_note') && !inFrame.has(i) && !placed(items[i]));
  const sizeOf = (i: number) => (items[i].kind === 'add_note' ? { w: G.noteSize, h: G.noteSize } : { w: G.cardW, h: G.cardH });
  let y = origin.y; let maxW = 0;
  const band = (list: number[], framed: boolean) => {
    const todo = list.filter((i) => !placed(items[i])); const rows = Math.max(1, Math.ceil(todo.length / G.cols));
    const top = y + (framed ? G.head + G.pad : 0); let rowTop = top;
    for (let r = 0; r < rows; r++) {
      const row = todo.slice(r * G.cols, (r + 1) * G.cols); const rowH = row.length ? Math.max(...row.map((i) => sizeOf(i).h)) : G.noteSize;
      row.forEach((i, c) => { const s = sizeOf(i); at[i] = { x: Math.round(origin.x + (framed ? G.pad : 0) + c * G.colW + G.cardW / 2), y: Math.round(rowTop + s.h / 2) }; });
      rowTop += rowH + (r < rows - 1 ? G.rowGap : 0);
    }
    const cols = Math.min(G.cols, Math.max(1, todo.length)); const w = (cols - 1) * G.colW + G.cardW + (framed ? 2 * G.pad : 0); const h = rowTop - y + (framed ? G.pad : 0);
    maxW = Math.max(maxW, w); const box = { x: Math.round(origin.x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }; y += h + G.bandGap; return box;
  };
  for (const f of frameIdx) { if (placed(items[f])) continue; const m = members.get(f)!; frames[f] = m.length ? band(m, true) : (() => { const b = { x: Math.round(origin.x), y: Math.round(y), w: Math.round(items[f].w ?? 820), h: Math.round(items[f].h ?? 520) }; y += b.h + G.bandGap; maxW = Math.max(maxW, b.w); return b; })(); }
  if (loose.length) band(loose, false);
  return { at, frames, size: { w: Math.round(maxW), h: Math.round(Math.max(0, y - origin.y - G.bandGap)) } };
}

/** The one dock line for a batch: "Added 12 cards and 4 notes in 3 frames". */
export function batchLine(c: { cards: number; notes: number; frames: number; links?: number }): string {
  const p = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  const things = [c.cards ? p(c.cards, 'card') : '', c.notes ? p(c.notes, 'note') : ''].filter(Boolean);
  const what = things.length ? things.join(' and ') : c.frames ? p(c.frames, 'frame') : 'nothing';
  return `Added ${what}${things.length && c.frames ? ` in ${p(c.frames, 'frame')}` : ''}${c.links ? `, ${p(c.links, 'connection')}` : ''}`;
}
