/**
 * The board's graph rules, as plain functions (no React, no tldraw): which port drags may land where, who belongs to a
 * group, and the two-press Run all state machine. NodeFrame and the group node read them; server/test/canvas-nodes.test.ts
 * checks them without a browser.
 *
 * Run all never spends on the first press: runAllConfirm only prices the members (the caller's GET /price quotes). A run
 * list comes back only from runAllCommit on a fresh confirm state, which the group node only reaches on the second press.
 */
import { NODE_DEFS, nodeDefOf } from './nodeTypes';
import { ledgerUsd, usdToken } from '../shared/billing';

export interface PortCandidate { id: string; type: string; /** arrows already bound into it */ inputs?: number }
export interface PortTarget { id: string; type: string }

/** Can an output drag from `fromType` land on `toType`? Text nodes feed prompts; media nodes feed inputs; groups and notes never take one. */
export function canConnectTo(fromType: string | null | undefined, toType: string | null | undefined, existingInputs = 0): boolean {
  const from = nodeDefOf(fromType), to = nodeDefOf(toType);
  if (!from?.output || !to?.input) return false;
  if (to.inputMax > 0 && existingInputs >= to.inputMax) return false;
  if (from.kind === 'prompt' || from.kind === 'note') return to.kind === 'gen';
  if (to.kind === 'gen' || to.kind === 'compare') return true;
  return false;
}

/** The node under the pointer a drag can land on: topmost candidate first, never the source, never a full input. */
export function pickPortTarget(candidates: PortCandidate[], fromId: string, fromType?: string | null): PortTarget | null {
  for (const c of candidates) {
    if (c.id === fromId) continue;
    if (canConnectTo(fromType ?? null, c.type, c.inputs ?? 0)) return { id: c.id, type: c.type };
  }
  return null;
}

export interface RunAllQuote { credits?: number | null; demo?: boolean; cost?: { estUsd?: number | null } | null }
export interface RunAllTotal { usd: number | null; credits: number | null; demo: boolean; priced: number }
/** Sum the existing quotes: USD when every quote has a cost, else credits, else nothing made up. */
export function runAllTotal(quotes: (RunAllQuote | null | undefined)[]): RunAllTotal {
  const list = quotes.filter((q): q is RunAllQuote => !!q);
  const allUsd = list.length > 0 && list.every(q => typeof q.cost?.estUsd === 'number' && Number.isFinite(q.cost.estUsd));
  const allCredits = list.length > 0 && list.every(q => typeof q.credits === 'number' && Number.isFinite(q.credits));
  return {
    usd: allUsd ? Math.round(list.reduce((s, q) => s + Number(q.cost!.estUsd), 0) * 1e4) / 1e4 : null,
    credits: !allUsd && allCredits ? list.reduce((s, q) => s + Number(q.credits), 0) : null,
    demo: list.length > 0 && list.every(q => q.demo === true),
    priced: list.length,
  };
}

export interface RunAllConfirm { phase: 'confirm'; ids: string[]; at: number; count: number; total: RunAllTotal }
/** First press: one total, no run. */
export function runAllConfirm(ids: string[], quotes: (RunAllQuote | null | undefined)[], now = Date.now()): RunAllConfirm {
  return { phase: 'confirm', ids: [...ids], at: now, count: ids.length, total: runAllTotal(quotes) };
}
/** Second press: the ids to submit, only while the confirm is fresh (10 s by default). Null means nothing runs. */
export function runAllCommit(state: RunAllConfirm | null | undefined, now = Date.now(), ttlMs = 10000): string[] | null {
  if (!state || state.phase !== 'confirm' || !state.ids.length) return null;
  if (now - state.at > ttlMs) return null;
  return [...state.ids];
}

export interface MemberShape { id: string; type: string; bounds?: { minX: number; minY: number; maxX: number; maxY: number } | null }
/** Generate cards whose centre sits inside the group frame (what Run all prices and runs). */
export function groupGenIds(group: { minX: number; minY: number; maxX: number; maxY: number } | null | undefined, shapes: MemberShape[]): string[] {
  if (!group) return [];
  return shapes.filter(s => s.type === NODE_DEFS.gen.type && s.bounds && (() => {
    const x = (s.bounds!.minX + s.bounds!.maxX) / 2, y = (s.bounds!.minY + s.bounds!.maxY) / 2;
    return x >= group.minX && x <= group.maxX && y >= group.minY && y <= group.maxY;
  })()).map(s => s.id);
}

/** The total's short label for the Run all pill. */
export function runAllPriceLabel(t: RunAllTotal): string {
  if (t.demo) return 'Sample';
  if (t.usd != null) return usdToken(t.usd, { approx: true });
  if (t.credits != null) return ledgerUsd(t.credits);
  return 'Price per node';
}

// ---------------------------------------------------------------- typed ports (2026-10-27)
/** What travels along a connection: a picture, a clip, a sound or text (a prompt). 3D models don't feed other cards. */
export type PortKind = 'image' | 'video' | 'audio' | 'text';
export const PORT_KINDS: PortKind[] = ['image', 'video', 'audio', 'text'];
/** One input a node takes: the kind and how many more of it fit (99 = no real limit, e.g. text joins). */
export interface PortIn { kind: PortKind; room: number; label?: string }
/** A node as a connection sees it: what comes out of it, and what it takes in. */
export interface PortInfo { id: string; type: string; out: PortKind | null; ins: PortIn[] }
export const asPortKind = (k: unknown): PortKind | null => (k === 'image' || k === 'video' || k === 'audio' || k === 'text' ? k : null);
/** The words for a kind ("a picture"), for the "takes …" hint on an illegal drop. */
export const PORT_WORDS: Record<PortKind, string> = { image: 'a picture', video: 'a clip', audio: 'a sound', text: 'text' };

/** What a node puts out, from its plain props (no editor): a finished generate card's active version, else the medium it will make. */
export function outKindOf(type: string, props: any): PortKind | null {
  const def = nodeDefOf(type); const p = props ?? {};
  if (type === 'image' || type === 'video') return type;
  if (!def?.output) return null;
  if (def.kind === 'prompt' || def.kind === 'note') return 'text';
  if (def.kind === 'gen') { const t = Array.isArray(p.takes) ? p.takes[Math.min(p.take ?? 0, p.takes.length - 1)] : null; return asPortKind(t?.kind) ?? asPortKind(p.medium); }
  if (def.kind === 'result') return asPortKind(p.kind);
  if (def.kind === 'upload') return asPortKind(p.mediaKind);
  return null;
}
/** Can `kind` go into this node now? Never into itself; only into an input of that kind with room left. */
export function canFeed(kind: PortKind | null, from: string, target: PortInfo): boolean {
  if (!kind || target.id === from) return false;
  return target.ins.some((i) => i.kind === kind && i.room > 0);
}
/** Every node a drag of `kind` from `from` may land on (the others dim while dragging). */
export const legalTargets = (kind: PortKind | null, from: string, nodes: PortInfo[]): string[] => nodes.filter((n) => canFeed(kind, from, n)).map((n) => n.id);
/** The node under the pointer a typed drag lands on: topmost legal one, else null (and `over` says what was under it). */
export function pickTypedTarget(under: PortInfo[], kind: PortKind | null, from: string): { target: PortInfo | null; over: PortInfo | null } {
  const over = under.find((n) => n.id !== from && nodeDefOf(n.type)) ?? null;
  return { target: under.find((n) => canFeed(kind, from, n)) ?? null, over };
}
/** The hint on an illegal drop: "Create Video takes a picture or text". */
export function takesLine(name: string, ins: PortIn[]): string {
  const kinds = [...new Set(ins.map((i) => i.kind))]; if (!kinds.length) return `${name} takes no inputs`;
  const w = kinds.map((k) => PORT_WORDS[k]); return `${name} takes ${w.length === 1 ? w[0] : `${w.slice(0, -1).join(', ')} or ${w.at(-1)}`}`;
}
/** A generate card's inputs from its workflow's slots: each accepted kind with the room left after what is already wired, plus text for its prompt. */
export function genIns(slots: { accept: string; max: number; label?: string }[], used: Partial<Record<PortKind, number>>, promptHidden: boolean): PortIn[] {
  const out: PortIn[] = [];
  for (const k of ['image', 'video', 'audio'] as PortKind[]) { const cap = slots.filter((s) => s.accept === k).reduce((n, s) => n + (s.max || 0), 0); if (cap > 0) out.push({ kind: k, room: Math.max(0, cap - (used[k] ?? 0)), label: slots.find((s) => s.accept === k)?.label }); }
  if (!promptHidden) out.push({ kind: 'text', room: 99, label: 'Prompt' });
  return out;
}

/** One card a run waits on: the card before it (its arrow input) that has no result yet. */
export interface Upstream { id: string; name: string; status: string }
/** The order a set of runs starts in (2026-10-28). A card whose input comes from a card that has no result yet must not start
 *  without it (the clip would silently ignore its first frame and still be charged):
 *  - now: nothing to wait for, start at once;
 *  - later: waits for cards in this same run (or already running): start each one when those are done;
 *  - blocked: waits for a card that won't run (a draft left out, a failed one): say so and don't start it. */
export function runOrder(ids: string[], waitsOf: (id: string) => Upstream[]): { now: string[]; later: string[]; blocked: { id: string; name: string }[] } {
  const set = new Set(ids); const now: string[] = []; const later: string[] = []; const blocked: { id: string; name: string }[] = [];
  for (const id of ids) { const w = waitsOf(id);
    const stuck = w.find(u => !set.has(u.id) && u.status !== 'running');
    if (stuck) blocked.push({ id, name: stuck.name }); else if (w.length) later.push(id); else now.push(id); }
  return { now, later, blocked };
}
