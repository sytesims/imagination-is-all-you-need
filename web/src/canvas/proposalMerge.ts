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

