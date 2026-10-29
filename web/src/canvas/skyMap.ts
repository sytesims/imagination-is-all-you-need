/**
 * Constellations (2026-10-27): a big board zoomed far out reads like a night sky. Plain functions (no React, no tldraw), so the server
 * test checks the grouping, the threshold and the click target without a browser; Constellation.tsx draws the result.
 *
 *  - starsOn: below STAR_ZOOM, and only on a board with more than STAR_MIN stars. Small boards keep cards and pills at any zoom.
 *  - starMap: every frame is a cluster (its cards and notes are its stars, joined to the cluster centre by hairlines, the frame name
 *    under it). Cards outside frames that share a shot ("Shot 3 · …") form a shot cluster; anything else is a single star. Clusters
 *    join the board's idea note (the agent's first note outside a frame) with faint dashed lines. The final film is flagged for its ring.
 *    The order is stable: frames by their board order, members by board order, so the same board always draws the same sky.
 *  - zoomTarget: the camera for a click on a cluster: its frame at a readable zoom (at least FOLLOW_MIN 55%, at most 100%), and when the
 *    frame is too big for that, its start (left / top) so the first shots are in view.
 */
export const STAR_ZOOM = 0.35;
export const STAR_MIN = 12;
export const READABLE_ZOOM = 0.55;
export type StarKind = 'image' | 'video' | 'audio' | 'text' | '3d';

export interface StarNode { id: string; kind: StarKind; x: number; y: number; w: number; h: number; order: string; frameId: string | null; name?: string | null; film?: boolean; idea?: boolean }
export interface StarFrame { id: string; name: string; x: number; y: number; w: number; h: number; order: string }
export interface Star { id: string; kind: StarKind; x: number; y: number; film: boolean }
export interface Cluster { id: string; label: string; cx: number; cy: number; labelY: number; stars: Star[]; box: { x: number; y: number; w: number; h: number } }
export interface StarMap { clusters: Cluster[]; singles: Star[]; idea: { id: string; x: number; y: number } | null; links: { from: string; x1: number; y1: number; x2: number; y2: number }[]; count: number }

export const starsOn = (zoom: number, count: number) => zoom < STAR_ZOOM && count > STAR_MIN;

const byOrder = <T extends { order: string; id: string }>(a: T, b: T) => (a.order < b.order ? -1 : a.order > b.order ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const cx = (n: StarNode) => n.x + n.w / 2, cy = (n: StarNode) => n.y + n.h / 2;
const star = (n: StarNode): Star => ({ id: n.id, kind: n.kind, x: Math.round(cx(n)), y: Math.round(cy(n)), film: !!n.film });
const shotOf = (name?: string | null) => { const m = /^\s*shot\s+(\d+)\b/i.exec(name ?? ''); return m ? Number(m[1]) : null; };
function clusterOf(id: string, label: string, members: StarNode[], box?: { x: number; y: number; w: number; h: number }): Cluster {
  const stars = members.map(star); const n = stars.length || 1;
  const b = box ?? (() => { const x0 = Math.min(...members.map((m) => m.x)), y0 = Math.min(...members.map((m) => m.y)), x1 = Math.max(...members.map((m) => m.x + m.w)), y1 = Math.max(...members.map((m) => m.y + m.h)); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; })();
  const sx = stars.reduce((s, m) => s + m.x, 0) / n; let sy = stars.reduce((s, m) => s + m.y, 0) / n;
  /* a row of stars (a frame of shots): the hub drops a little below it, so the hairlines fan out like a constellation instead of lying on the row */
  const spanX = Math.max(...stars.map((s) => s.x)) - Math.min(...stars.map((s) => s.x)), spanY = Math.max(...stars.map((s) => s.y)) - Math.min(...stars.map((s) => s.y));
  if (stars.length > 1 && spanY < 0.15 * spanX) sy += Math.min(b.h * 0.3, spanX * 0.12);
  return { id, label, cx: Math.round(stars.length ? sx : b.x + b.w / 2), cy: Math.round(stars.length ? sy : b.y + b.h / 2), labelY: Math.round(Math.max(b.y + b.h, ...stars.map((s) => s.y)) + 40), stars, box: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) } };
}

/** The sky for a board: clusters, single stars, the idea note and the dashed links from it. Deterministic for the same input. */
export function starMap(nodes: StarNode[], frames: StarFrame[]): StarMap {
  const ns = [...nodes].sort(byOrder); const fs = [...frames].sort(byOrder); const known = new Set(fs.map((f) => f.id));
  const idea = ns.find((n) => n.idea && !(n.frameId && known.has(n.frameId))) ?? null;
  const rest = ns.filter((n) => n !== idea);
  const clusters: Cluster[] = [];
  for (const f of fs) { const m = rest.filter((n) => n.frameId === f.id); if (m.length) clusters.push(clusterOf(f.id, f.name.trim() || 'Frame', m, f)); }
  const loose = rest.filter((n) => !(n.frameId && known.has(n.frameId)));
  const shots = new Map<number, StarNode[]>(); for (const n of loose) { const s = shotOf(n.name); if (s != null) shots.set(s, [...(shots.get(s) ?? []), n]); }
  const grouped = new Set<string>();
  for (const s of [...shots.keys()].sort((a, b) => a - b)) { const m = shots.get(s)!; if (m.length < 2) continue; m.forEach((n) => grouped.add(n.id)); clusters.push(clusterOf(`shot:${s}`, `Shot ${s}`, m)); }
  const singles = loose.filter((n) => !grouped.has(n.id)).map(star);
  const ic = idea ? { id: idea.id, x: Math.round(cx(idea)), y: Math.round(cy(idea)) } : null;
  const links = ic ? clusters.map((c) => ({ from: c.id, x1: ic.x, y1: ic.y, x2: c.cx, y2: c.cy })) : [];
  return { clusters, singles, idea: ic, links, count: nodes.length };
}

/** The camera for a click on a cluster box (page px) in a viewport of vw × vh screen px: centre on it at a readable zoom; a box too big
 *  for that is entered at its start. Returns tldraw's camera (x, y are the page offset: screen = (page + camera) × zoom). */
export function zoomTarget(box: { x: number; y: number; w: number; h: number }, vw: number, vh: number, inset = 72) {
  const fit = Math.min((vw - inset * 2) / Math.max(1, box.w), (vh - inset * 2) / Math.max(1, box.h));
  const z = Math.round(Math.min(1, Math.max(READABLE_ZOOM, fit)) * 1000) / 1000;
  const viewW = vw / z, viewH = vh / z;
  const px = box.w + (inset * 2) / z <= viewW ? box.x + box.w / 2 : box.x - inset / z + viewW / 2;
  const py = box.h + (inset * 2) / z <= viewH ? box.y + box.h / 2 : box.y - inset / z + viewH / 2;
  return { x: Math.round(viewW / 2 - px), y: Math.round(viewH / 2 - py), z, center: { x: Math.round(px), y: Math.round(py) } };
}
