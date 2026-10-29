/**
 * How connections look (2026-10-27): "magnetic snap + notches for neighbours, light threads for long links, results that develop, and
 * stardust only during runs". Plain functions (no React, no tldraw), so the server tests check them; LinkLayer.tsx draws, Magnet.ts snaps.
 *
 *  - Neighbours: a card that feeds the card right beside it (same row, a small gap, nothing in between) shows no wire, only a notch.
 *  - Snap: drag a card within SNAP_PX of a compatible card's side and it clicks in beside it and links (typed ports rules apply).
 *    Pulled more than UNLINK_PX apart, a snapped link lets go.
 *  - Threads: other links are thin lines routed with rounded right angles along lanes that never cross a card.
 *  - Tidy: chains laid out as rows, left to right, so every link becomes a neighbour notch.
 *  - linkLook: what moves, and what never does under reduced motion.
 */
export interface LBox { id: string; x: number; y: number; w: number; h: number }
export interface Link { id: string; from: string; to: string; kind?: string | null; snap?: boolean }
export const NEIGHBOUR_GAP = 160; /* the widest gap that still reads as "side by side" (cards sit 100 px apart in a row) */
export const SNAP_PX = 60;
export const SNAP_GAP = 100; /* where a snapped card lands: this far from its neighbour's side */
export const UNLINK_PX = 220;
export const LANE = 28;

const overlapY = (a: LBox, b: LBox) => Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const hits = (a: LBox, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Is `to` right beside `from` (same row, a small gap to its right, nothing in between)? */
export function isNeighbour(from: LBox, to: LBox, others: LBox[] = []): boolean {
  const gap = to.x - (from.x + from.w); if (gap < -8 || gap > NEIGHBOUR_GAP) return false;
  if (overlapY(from, to) < 0.6 * Math.min(from.h, to.h)) return false;
  const between = { x: from.x + from.w, y: Math.max(from.y, to.y), w: Math.max(1, gap), h: Math.max(1, overlapY(from, to)) };
  return !others.some((o) => o.id !== from.id && o.id !== to.id && hits(o, between));
}
/** The notch between two neighbours: the middle of their facing edges (page px). */
export const notchAt = (from: LBox, to: LBox) => ({ x: Math.round((from.x + from.w + to.x) / 2), y: Math.round((Math.max(from.y, to.y) + Math.min(from.y + from.h, to.y + to.h)) / 2), x1: from.x + from.w, x2: to.x });

/** While a card is dragged: the card whose side it is within SNAP_PX of, and where it would click in. `canFeed(a, b)` is the typed rule. */
export function snapTarget(drag: LBox, cards: LBox[], canFeed: (from: string, to: string) => boolean): { id: string; from: string; to: string; x: number; y: number; dist: number } | null {
  let best: { id: string; from: string; to: string; x: number; y: number; dist: number } | null = null;
  for (const c of cards) {
    if (c.id === drag.id || overlapY(drag, c) < 0.35 * Math.min(drag.h, c.h)) continue;
    /* dragged card to the right of c: c feeds it */
    const dRight = Math.abs(drag.x - (c.x + c.w + SNAP_GAP)); if (dRight <= SNAP_PX && canFeed(c.id, drag.id) && (!best || dRight < best.dist)) best = { id: c.id, from: c.id, to: drag.id, x: c.x + c.w + SNAP_GAP, y: c.y, dist: dRight };
    /* dragged card to the left of c: it feeds c */
    const dLeft = Math.abs(drag.x + drag.w + SNAP_GAP - c.x); if (dLeft <= SNAP_PX && canFeed(drag.id, c.id) && (!best || dLeft < best.dist)) best = { id: c.id, from: drag.id, to: c.id, x: c.x - SNAP_GAP - drag.w, y: c.y, dist: dLeft };
  }
  return best;
}
/** A snapped link lets go when its cards are pulled apart: no longer neighbours and more than UNLINK_PX between them. */
export function pulledApart(from: LBox, to: LBox): boolean {
  const gapX = Math.max(to.x - (from.x + from.w), from.x - (to.x + to.w)); const gapY = Math.max(to.y - (from.y + from.h), from.y - (to.y + to.h));
  return Math.max(gapX, gapY) > UNLINK_PX || (overlapY(from, to) === 0 && gapX > SNAP_GAP);
}

/** A thread from `from`'s right side to `to`'s left side: right angles along lanes that don't cross any other card. Returns the points. */
export function routeThread(from: LBox, to: LBox, others: LBox[]): { x: number; y: number }[] {
  const obs = others.filter((o) => o.id !== from.id && o.id !== to.id).map((o) => ({ ...o, x: o.x - 12, y: o.y - 12, w: o.w + 24, h: o.h + 24 }));
  const sx = from.x + from.w, sy = from.y + from.h / 2, ex = to.x, ey = to.y + to.h / 2;
  const segClear = (x1: number, y1: number, x2: number, y2: number) => { const b = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 1, h: Math.abs(y2 - y1) || 1 }; return !obs.some((o) => hits(o as LBox, b)); };
  const pathClear = (pts: { x: number; y: number }[]) => pts.slice(1).every((p, i) => segClear(pts[i].x, pts[i].y, p.x, p.y));
  /* candidate vertical lanes (just out of the source, just before the target) and horizontal lanes (the ends' rows, then the gaps above and below cards) */
  const ax = sx + LANE, bx = ex - LANE;
  const ys = [sy, ey, ...obs.flatMap((o) => [o.y - LANE / 2, o.y + o.h + LANE / 2]), Math.min(from.y, to.y) - 2 * LANE, Math.max(from.y + from.h, to.y + to.h) + 2 * LANE]
    .sort((a, b) => Math.abs(a - (sy + ey) / 2) - Math.abs(b - (sy + ey) / 2));
  if (ex > sx + 2 * LANE) {
    for (const mx of [Math.round((ax + bx) / 2), ax, bx]) { const p = [{ x: sx, y: sy }, { x: mx, y: sy }, { x: mx, y: ey }, { x: ex, y: ey }]; if (pathClear(p)) return dedupe(p); }
  }
  const xs = ex > sx + 2 * LANE ? [ax, bx] : [ax, Math.max(ax, sx + LANE)];
  for (const y of ys) for (const x1 of xs) {
    const x2 = Math.min(bx, ex - LANE); const p = [{ x: sx, y: sy }, { x: x1, y: sy }, { x: x1, y }, { x: x2, y }, { x: x2, y: ey }, { x: ex, y: ey }];
    if (pathClear(p)) return dedupe(p);
  }
  return dedupe([{ x: sx, y: sy }, { x: ax, y: sy }, { x: ax, y: ys.at(-1)! }, { x: bx, y: ys.at(-1)! }, { x: bx, y: ey }, { x: ex, y: ey }]); /* fallback: around everything */
}
const dedupe = (p: { x: number; y: number }[]) => p.map((q) => ({ x: Math.round(q.x), y: Math.round(q.y) })).filter((q, i, a) => i === 0 || q.x !== a[i - 1].x || q.y !== a[i - 1].y);
/** The SVG path of a thread, with rounded corners. */
export function threadPath(pts: { x: number; y: number }[], r = 14): string {
  if (pts.length < 2) return ''; let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) { const p = pts[i - 1], c = pts[i], n = pts[i + 1];
    const r1 = Math.min(r, Math.hypot(c.x - p.x, c.y - p.y) / 2, Math.hypot(n.x - c.x, n.y - c.y) / 2);
    const a = { x: c.x - Math.sign(c.x - p.x) * r1, y: c.y - Math.sign(c.y - p.y) * r1 }, b = { x: c.x + Math.sign(n.x - c.x) * r1, y: c.y + Math.sign(n.y - c.y) * r1 };
    d += ` L ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`; }
  const l = pts.at(-1)!; return `${d} L ${l.x} ${l.y}`;
}

/** Tidy: every chain becomes a row, left to right, so each link is a neighbour. Rows stack downward from the group's top-left.
 *  Cards without links keep a row of their own at the end. Returns new top-left positions by id. */
export function tidyLayout(cards: LBox[], links: Link[], o: { gapX?: number; gapY?: number } = {}): Record<string, { x: number; y: number }> {
  const gapX = o.gapX ?? 100, gapY = o.gapY ?? 140; if (!cards.length) return {};
  const byId = new Map(cards.map((c) => [c.id, c])); const ls = links.filter((l) => byId.has(l.from) && byId.has(l.to) && l.from !== l.to);
  const ins = new Map<string, number>(); for (const l of ls) ins.set(l.to, (ins.get(l.to) ?? 0) + 1);
  const outs = (id: string) => ls.filter((l) => l.from === id).map((l) => l.to).sort((a, b) => byId.get(a)!.y - byId.get(b)!.y || byId.get(a)!.x - byId.get(b)!.x);
  const order = [...cards].sort((a, b) => a.y - b.y || a.x - b.x); const placed = new Set<string>(); const rows: string[][] = []; const pending: string[] = [];
  /* a row follows the first output of each card; other outputs start rows of their own under it */
  const grow = (start: string) => { const row: string[] = []; let cur: string | undefined = start;
    while (cur && !placed.has(cur)) { placed.add(cur); row.push(cur); const next: string[] = outs(cur).filter((n) => !placed.has(n)); cur = next[0]; pending.push(...next.slice(1)); }
    if (row.length) rows.push(row); while (pending.length) { const b = pending.shift()!; if (!placed.has(b)) grow(b); } };
  for (const c of order) if (!(ins.get(c.id) ?? 0)) grow(c.id); /* chains start where nothing feeds in */
  for (const c of order) if (!placed.has(c.id)) grow(c.id); /* loops and leftovers */
  const x0 = Math.min(...cards.map((c) => c.x)), y0 = Math.min(...cards.map((c) => c.y)); const out: Record<string, { x: number; y: number }> = {}; let y = y0;
  for (const r of rows) { let x = x0; const h = Math.max(...r.map((id) => byId.get(id)!.h)); for (const id of r) { out[id] = { x: Math.round(x), y: Math.round(y) }; x += byId.get(id)!.w + gapX; } y += h + gapY; }
  return out;
}

/** What a link does on screen. Under reduced motion: no pulse, no dust, no scan line, no easing; a calm fixed look. */
export function linkLook(o: { reduced: boolean; lit: boolean; flowing: boolean; running: boolean }) {
  if (o.reduced) return { opacity: o.lit ? 0.55 : 0.32, pulse: false, dust: false };
  return { opacity: o.lit ? 0.6 : 0.15, pulse: o.flowing || o.lit, dust: o.running };
}
