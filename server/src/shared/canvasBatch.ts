/**
 * Canvas batches (2026-10-27): an agent makes many things on the board at once ("bulk create when needed, not one by one"). Plain
 * functions shared by the server (canvasAgent.ts validates before anything reaches the page) and the board (agentBridge.ts places and
 * creates), so the rules are one copy and the server tests check them without a browser.
 *
 *  - A batch is a list of add_card / add_note / add_frame / connect / move_into items. An item may carry a temporary `ref` ("k1"); a later
 *    item names it where an id goes (inputs_from, from_id, to_id, ids, frame_id, frame). Anything that isn't a ref must be a real node id.
 *  - validateBatch: all or nothing. The first bad item refuses the whole batch with a plain reason (unknown kind, a ref used before it is
 *    made, a duplicate ref, a ref that looks like an id, a card feeding itself, an empty note, too many items).
 *  - batchLayout: where items without `at` go, left to right: compact grids (each frame wraps its own), right of the cards that feed
 *    them, mirroring their inputs' slots when each card has one input of its own. Nothing overlaps. Items with `at` keep it.
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

/** Sizes on the board (page px), the same as the cards and notes the agent makes one by one. `gap`: between a group and what feeds it. */
export const BATCH_GRID = { colW: 440, cardW: 340, cardH: 430, noteSize: 260, rowGap: 130, gap: 160, pad: 36, head: 40, cols: 6 };
export interface Box { x: number; y: number; w: number; h: number }
/** What the board knows when it lays a batch out (all optional: without it the group's top-left is simply `origin`). */
export interface LayoutCtx {
  /** the page box of a node already on the board (an input), else null */ boxOf?: (id: string) => Box | null;
  /** a group without inputs goes right of this (the selection, or the latest group) */ anchor?: Box | null;
  /** what is already on the board: the group never overlaps it */ taken?: Box[];
}
/** A compact grid: one row for 1–2, two columns for 3–4, three for 5–9, then wider (at most six). */
export const gridCols = (n: number) => (n <= 2 ? Math.max(1, n) : n <= 4 ? 2 : n <= 9 ? 3 : Math.min(BATCH_GRID.cols, Math.ceil(Math.sqrt(n))));
const hit = (a: Box, b: Box, m = 24) => a.x - m < b.x + b.w && a.x + a.w + m > b.x && a.y - m < b.y + b.h && a.y + a.h + m > b.y;
const common = (bs: Box[]): Box => { const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y)); return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y }; };

/** Where each item without `at` goes (centre points by item index), and each frame's box. Left to right (2026-11-03):
 *  - the new cards form compact grids (gridCols), each frame wrapping its own, frames and the loose group side by side;
 *  - a group whose cards are fed by cards already on the board sits just right of them (`gap`), centred on them;
 *  - mirroring: when every new card has exactly one input of its own (inputs every new card shares, like the chair, don't count), each
 *    lands in the same slot as that input, one step right: a 2×2 of swatches becomes a 2×2 of chairs, each beside its swatch;
 *  - a group without inputs sits right of ctx.anchor, else at `origin`;
 *  - never on top of ctx.taken (it moves down or up, then right). Items with `at` keep it. */
export function batchLayout(items: BatchItem[], origin: { x: number; y: number }, ctx: LayoutCtx = {}) {
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
  const existing = (n: string) => !refIndex.has(n) && n.startsWith('shape:');
  const boxOf = (id: string) => (ctx.boxOf ? ctx.boxOf(id) : null);

  /* each group's spots relative to its own top-left (x, y: centres), and its size */
  type Group = { frame: number | null; spots: Record<number, { x: number; y: number }>; w: number; h: number };
  const grid = (list: number[], framed: boolean): Group => {
    const todo = list.filter((i) => !placed(items[i])); const cols = gridCols(todo.length); const rows = Math.max(1, Math.ceil(todo.length / cols));
    const spots: Group['spots'] = {}; const top = framed ? G.head + G.pad : 0; const left = framed ? G.pad : 0; let rowTop = top;
    for (let r = 0; r < rows; r++) {
      const row = todo.slice(r * cols, (r + 1) * cols); const rowH = row.length ? Math.max(...row.map((i) => sizeOf(i).h)) : G.noteSize;
      row.forEach((i, c) => { spots[i] = { x: left + c * G.colW + G.cardW / 2, y: rowTop + sizeOf(i).h / 2 }; });
      rowTop += rowH + (r < rows - 1 ? G.rowGap : 0);
    }
    return { frame: null, spots, w: (Math.max(1, Math.min(cols, todo.length)) - 1) * G.colW + G.cardW + 2 * left, h: rowTop + (framed ? G.pad : 0) };
  };
  const groups: Group[] = [];
  for (const f of frameIdx) { if (placed(items[f])) continue; const m = members.get(f)!; groups.push(m.length ? { ...grid(m, true), frame: f } : { frame: f, spots: {}, w: items[f].w ?? 820, h: items[f].h ?? 520 }); }
  if (loose.length) groups.push(grid(loose, false));

  /* the whole thing, groups side by side, relative to (0, 0) */
  const rel: Record<number, { x: number; y: number }> = {}; const relFrames: Record<number, Box> = {}; let x = 0; let H = 0;
  for (const g of groups) {
    for (const [i, c] of Object.entries(g.spots)) rel[Number(i)] = { x: x + c.x, y: c.y };
    if (g.frame != null) relFrames[g.frame] = { x, y: 0, w: g.w, h: g.h };
    x += g.w + G.gap; H = Math.max(H, g.h);
  }
  const W = Math.max(0, x - G.gap);

  /* mirroring: one loose group of cards, each with exactly one input of its own that is already on the board */
  const cards = loose.filter((i) => items[i].kind === 'add_card');
  const ins = cards.map((i) => (items[i].inputs_from ?? []).filter(existing));
  const shared = cards.length > 1 ? ins[0].filter((n) => ins.every((l) => l.includes(n))) : [];
  const own = ins.map((l) => l.filter((n) => !shared.includes(n)));
  let mirror: Record<number, { x: number; y: number }> | null = null;
  if (!frameIdx.length && cards.length === loose.length && cards.length && own.every((l) => l.length === 1) && new Set(own.map((l) => l[0])).size === cards.length) {
    const ob = own.map((l) => boxOf(l[0]));
    if (ob.every(Boolean)) {
      const A = common(ob as Box[]); const all = [...(ob as Box[]), ...(shared.map(boxOf).filter(Boolean) as Box[])]; const baseX = Math.max(...all.map((b) => b.x + b.w)) + G.gap;
      const m: Record<number, { x: number; y: number }> = {}; cards.forEach((i, k) => { const b = ob[k]!; m[i] = { x: baseX + (b.x - A.x) + G.cardW / 2, y: b.y + G.cardH / 2 }; });
      const bx = cards.map((i) => ({ x: m[i].x - G.cardW / 2, y: m[i].y - G.cardH / 2, w: G.cardW, h: G.cardH }));
      if (!bx.some((a, p) => bx.some((b, q) => q > p && hit(a, b, 20)))) mirror = m;
    }
  }

  let o: { x: number; y: number }; let size = { w: W, h: H };
  if (mirror) { const b = common(cards.map((i) => ({ x: mirror![i].x - G.cardW / 2, y: mirror![i].y - G.cardH / 2, w: G.cardW, h: G.cardH }))); o = { x: b.x, y: b.y }; size = { w: b.w, h: b.h }; }
  else {
    const fed = [...new Set(items.filter((it) => it.kind === 'add_card' && !placed(it)).flatMap((it) => (it.inputs_from ?? []).filter(existing)))].map(boxOf).filter(Boolean) as Box[];
    const right = fed.length ? common(fed) : ctx.anchor ?? null;
    o = right ? { x: right.x + right.w + G.gap, y: right.y + right.h / 2 - H / 2 } : { x: origin.x, y: origin.y };
  }
  /* never on top of what is there: try down and up in steps, then a column further right */
  const taken = ctx.taken ?? [];
  if (taken.length && (W || mirror)) {
    const free = (dx: number, dy: number) => !taken.some((t) => hit({ x: o.x + dx, y: o.y + dy, w: size.w, h: size.h }, t));
    search: for (let c = 0; c < 24; c++) for (let r = 0; r <= 16; r++) for (const s of r ? [1, -1] : [1]) { const dx = c * 240, dy = s * r * 140; if (free(dx, dy)) { o = { x: o.x + dx, y: o.y + dy }; break search; } }
  }
  if (mirror) { const b0 = common(cards.map((i) => ({ x: mirror![i].x - G.cardW / 2, y: mirror![i].y - G.cardH / 2, w: 0, h: 0 }))); for (const i of cards) at[i] = { x: Math.round(o.x + mirror[i].x - b0.x), y: Math.round(o.y + mirror[i].y - b0.y) }; }
  else {
    for (const [i, c] of Object.entries(rel)) at[Number(i)] = { x: Math.round(o.x + c.x), y: Math.round(o.y + c.y) };
    for (const [i, b] of Object.entries(relFrames)) frames[Number(i)] = { x: Math.round(o.x + b.x), y: Math.round(o.y + b.y), w: Math.round(b.w), h: Math.round(b.h) };
  }
  return { at, frames, size: { w: Math.round(size.w), h: Math.round(size.h) }, box: { x: Math.round(o.x), y: Math.round(o.y), w: Math.round(size.w), h: Math.round(size.h) } };
}

/** The one dock line for a batch: "Added 12 cards and 4 notes in 3 frames". */
export function batchLine(c: { cards: number; notes: number; frames: number; links?: number }): string {
  const p = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  const things = [c.cards ? p(c.cards, 'card') : '', c.notes ? p(c.notes, 'note') : ''].filter(Boolean);
  const what = things.length ? things.join(' and ') : c.frames ? p(c.frames, 'frame') : 'nothing';
  return `Added ${what}${things.length && c.frames ? ` in ${p(c.frames, 'frame')}` : ''}${c.links ? `, ${p(c.links, 'connection')}` : ''}`;
}
