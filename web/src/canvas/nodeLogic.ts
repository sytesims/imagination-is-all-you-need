/**
 * The board's graph rules, as plain functions (no React, no tldraw): which port drags may land where, who belongs to an old
 * group card, run order and proposals. NodeFrame and the group node read them; server/test/canvas-nodes.test.ts checks them
 * without a browser. (Release 2: the two-press Run all is gone; a Group's "Run the flow" goes through the dock's proposal card.)
 */
import { NODE_DEFS, nodeDefOf } from './nodeTypes';

export interface PortCandidate { id: string; type: string; /** arrows already bound into it */ inputs?: number }
export interface PortTarget { id: string; type: string }

/** Can an output drag from `fromType` land on `toType`? Text nodes feed prompts; media nodes feed inputs; groups and notes never take one. */
export function canConnectTo(fromType: string | null | undefined, toType: string | null | undefined, existingInputs = 0): boolean {
  const from = nodeDefOf(fromType), to = nodeDefOf(toType);
  if (!from?.output || !to?.input) return false;
  if (to.inputMax > 0 && existingInputs >= to.inputMax) return false;
  if (from.kind === 'prompt' || from.kind === 'note') return to.kind === 'gen';
  if (to.kind === 'gen' || to.kind === 'compare' || to.kind === 'ad') return true;
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

export interface MemberShape { id: string; type: string; bounds?: { minX: number; minY: number; maxX: number; maxY: number } | null }
/** Generate cards whose centre sits inside the group frame (what Run all prices and runs). */
export function groupGenIds(group: { minX: number; minY: number; maxX: number; maxY: number } | null | undefined, shapes: MemberShape[]): string[] {
  if (!group) return [];
  return shapes.filter(s => s.type === NODE_DEFS.gen.type && s.bounds && (() => {
    const x = (s.bounds!.minX + s.bounds!.maxX) / 2, y = (s.bounds!.minY + s.bounds!.maxY) / 2;
    return x >= group.minX && x <= group.maxX && y >= group.minY && y <= group.maxY;
  })()).map(s => s.id);
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

/** A card that didn't start; a price stop (priceLock.ts) carries its code, why and both prices. */
export interface RunFailure { cardId: string; error: string; code?: string; reason?: string; wasUsd?: number | null; nowUsd?: number | null }
const stopInfo = (e: any) => (e?.code === 'price_changed' ? { code: 'price_changed', reason: e.reason, wasUsd: e.wasUsd ?? null, nowUsd: e.nowUsd ?? null } : {});
export interface OrderedRun { jobIds: string[]; failed: RunFailure[]; /** start by themselves once the cards before them are done */ later: string[] }
export interface RunDeps {
  waits: (id: string) => Upstream[]; submit: (id: string) => Promise<string>; exists: (id: string) => boolean;
  /** a card that didn't start: shown on the card itself (2026-11-02: it used to go silently back to a draft) */ notStarted: (id: string, error: string) => void;
  stop?: (e: Error) => boolean; onLater?: (id: string, r: { jobId?: string; error?: string; failure?: RunFailure }) => void; timeoutMs?: number; pollMs?: number;
}
/** Run several cards (Go on a proposal, a group's Run all) in graph order (2026-10-28): cards with nothing to wait for start now; a card fed
 *  by another card in the same run starts when that card has its result, so a clip gets its first frame instead of running without it.
 *  `stop` ends the immediate loop on an error nothing after may ignore (a budget). `onLater` hears how each waiting card went. Every card
 *  that doesn't start (the server refused it, or a card before it didn't finish) gets notStarted with the reason. */
export async function runInOrder(ids: string[], d: RunDeps): Promise<OrderedRun> {
  const plan = runOrder(ids, d.waits); const out: OrderedRun = { jobIds: [], failed: [], later: [] };
  const fail = (cardId: string, error: string, e?: unknown) => { out.failed.push({ cardId, error, ...stopInfo(e) }); d.notStarted(cardId, error); };
  for (const b of plan.blocked) fail(b.id, `Waits for ${b.name}, which isn’t running. Generate it first.`);
  for (const id of plan.now) { try { out.jobIds.push(await d.submit(id)); } catch (e) { fail(id, (e as Error).message, e); if (d.stop?.(e as Error)) return out; } }
  out.later = plan.later;
  /* chains of any length (A → B → C): C waits on B while B waits on A; a card in this run that didn't start (or gave up) ends the wait after it */
  const gaveUp = new Set(out.failed.map(f => f.cardId));
  const later = (id: string, r: { jobId?: string; error?: string; failure?: RunFailure }) => { if (r.error) { gaveUp.add(id); d.notStarted(id, r.error); } d.onLater?.(id, r); };
  for (const id of plan.later) void (async () => { const end = Date.now() + (d.timeoutMs ?? 3_600_000);
    while (Date.now() < end) { const up = d.waits(id); if (!d.exists(id)) return;
      if (!up.length) { try { later(id, { jobId: await d.submit(id) }); } catch (e) { later(id, { error: (e as Error).message, failure: { cardId: id, error: (e as Error).message, ...stopInfo(e) } }); } return; }
      const dead = up.find(u => (u.status !== 'running' && u.status !== 'draft') || gaveUp.has(u.id)); /* failed (a done card is an input, so it's no longer listed) */
      if (dead || up.every(u => u.status === 'draft' && !ids.includes(u.id))) { later(id, { error: `${dead?.name ?? up[0].name} didn’t finish, so this card didn’t run.` }); return; }
      await new Promise(r => setTimeout(r, d.pollMs ?? 1500)); }
    later(id, { error: 'Waited too long for the card before it.' }); })();
  return out;
}

/** One card of a run proposal, as settleProposal reads it. `missing`: what it lacks as the board is now; `missingFed`: what it would still lack
 *  once the cards upstream that haven't run yet have passed on their result; `ups`: those cards (graph.waitingInputsOf); `other`: a quote
 *  problem (a model that can't run here, no price). */
export interface ProposalCard { id: string; title: string; usd: number | null; credits: number | null; missing: string | null; missingFed: string | null; ups: Upstream[]; other: string | null }
/** Which cards of a proposal Go starts, and its total (2026-11-02). A card fed by a card in this same proposal (at any depth) or by one already
 *  running counts its input as there: it waits for it, in runOrder's graph order. Only an input with no source at all is missing; a card fed
 *  by a draft left out of the run, or by a card in the run that can't run, is skipped with the reason. The total is every card Go starts. */
export function settleProposal(cards: ProposalCard[]): { problems: Record<string, string | null>; totalUsd: number; totalCredits: number } {
  const set = new Set(cards.map(c => c.id)); const problems: Record<string, string | null> = {};
  for (const c of cards) { const stuck = c.ups.find(u => !set.has(u.id) && u.status !== 'running');
    problems[c.id] = (stuck ? `Waits for “${stuck.name.slice(0, 40)}”, which isn’t in this run` : c.ups.length ? c.missingFed : c.missing) ?? c.other; }
  /* a card that can't run can't feed one after it: that one is skipped too (repeat until nothing changes, for chains) */
  for (let changed = true; changed;) { changed = false;
    for (const c of cards) { if (problems[c.id]) continue; const src = c.ups.map(u => cards.find(x => x.id === u.id && problems[x.id])).find(Boolean);
      if (src) { problems[c.id] = `Waits on “${src.title.slice(0, 40)}”, which can’t run here`; changed = true; } } }
  let usd = 0; let credits = 0; for (const c of cards) if (!problems[c.id]) { usd += c.usd ?? 0; credits += c.credits ?? 0; }
  return { problems, totalUsd: Math.round(usd * 1e4) / 1e4, totalCredits: credits };
}
