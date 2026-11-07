/** Merging the agent's proposals (pure, no imports, so a node test can load it). Re-exported from agentDockModel. */
import type { Proposal } from './agentBridge';
/** How far along a proposal is. A late reply (Go's POST answer saying "running") must never undo a newer live update ("failed",
 *  "approved") that arrived first (2026-10-28: the card stayed on "Starting the runs…" after the runs had failed). */
const STAGE: Record<string, number> = { pending: 0, running: 1, approved: 2, cancelled: 2, failed: 2 };
export function mergeProposals(prev: Proposal[], incoming: Proposal[]) {
  const map = new Map(prev.map((p) => [p.id, p]));
  for (const p of incoming) { if (!p?.id) continue; const old = map.get(p.id); if (old && (STAGE[old.status] ?? 0) > (STAGE[p.status] ?? 0)) continue; map.set(p.id, p); }
  return [...map.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
}


/* ---- a price stop reads as ONE card (owner-approved design, 2026-11-06) ----
 * Go stopped some rows because their price rose 10% or more (priceLock.ts); the page asked again with a fresh proposal (repriceOf). The dock
 * draws the stopped approval and its ask-again as one card that changes in place: "New price · Nothing ran", old price struck over the new one,
 * Cancel / Run for $x, and one quiet history line. The log lines that only repeat it ("Approved the run.", "Started 0 runs · 1 didn't start",
 * the ask-again's "Proposed…" row and its "Cancelled the run.") are left out; real runs keep theirs. */

/** Every row Go refused stopped on a price change (nothing else went wrong). */
export const isPriceStop = (p: Proposal | null | undefined): boolean => { const f = p?.failedIds ?? []; return !!p && f.length > 0 && f.every((id) => !!p.items.find((i) => i.cardId === id)?.priceChanged); };

/** origin id → its newest ask-again, and ask-again id → its origin (only pairs whose both halves the dock holds). */
export function repricePairs(proposals: Proposal[]) {
  const byId = new Map(proposals.map((p) => [p.id, p])); const childOf = new Map<string, Proposal>(); const originOf = new Map<string, Proposal>();
  for (const c of [...proposals].sort((a, b) => a.createdAt - b.createdAt)) { const o = c.repriceOf ? byId.get(c.repriceOf) : undefined; if (!o || !isPriceStop(o)) continue;
    const before = childOf.get(o.id); if (before) originOf.delete(before.id); /* a newer ask-again for the same approval takes the slot; the older draws on its own */
    childOf.set(o.id, c); originOf.set(c.id, o); }
  return { childOf, originOf };
}

/** Feed rows the one card already says. */
export function hiddenByReprice(e: { type: string; text: string; proposalId?: string; decision?: string }, byId: Map<string, Proposal>, pairs: ReturnType<typeof repricePairs>): boolean {
  const p = e.proposalId ? byId.get(e.proposalId) : undefined; if (!p) return false;
  const stoppedAll = isPriceStop(p) && p.jobIds.length === 0;
  if (stoppedAll && e.type === 'decision' && e.decision === 'go') return true; /* "Approved the run.": the history line says it */
  if (stoppedAll && e.type === 'activity' && /^Started 0 runs/.test(e.text)) return true;
  if (pairs.originOf.has(p.id)) { if (e.type === 'activity' && /^Proposed/.test(e.text)) return true; if (e.type === 'decision' && e.decision === 'cancel') return true; }
  return false;
}

export type RepriceRow = { cardId: string; title: string; workflow: string; model: string | null; quote: any; credits: number | null;
  /** moved: old → new and waits for your OK; started: ran at Go; skipped: can't run here; failed: refused for another reason */ state: 'moved' | 'started' | 'skipped' | 'failed'; wasUsd: number | null; nowUsd: number | null };
/** The card's rows: the approval's rows in order, each one either moved (from the ask-again), started at Go, skipped or refused. */
export function repriceRows(origin: Proposal, child: Proposal | null): RepriceRow[] {
  const failed = new Set(origin.failedIds ?? []); const runs = new Set(origin.runCardIds ?? origin.items.filter((i) => !i.problem).map((i) => i.cardId));
  return origin.items.map((it) => { const c = child?.items.find((x) => x.cardId === it.cardId); const moved = it.priceChanged;
    const state: RepriceRow['state'] = !runs.has(it.cardId) ? 'skipped' : moved ? 'moved' : failed.has(it.cardId) ? 'failed' : 'started';
    const now = c ?? it;
    return { cardId: it.cardId, title: now.title, workflow: now.workflow, model: now.model, quote: c ? c.quote : it.quote, credits: c ? c.credits : it.credits, state,
      wasUsd: moved?.wasUsd ?? it.usd, nowUsd: c ? c.usd : moved?.nowUsd ?? null }; });
}
