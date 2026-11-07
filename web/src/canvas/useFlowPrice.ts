/**
 * The total a Group's "Run the flow" button shows (release 2, step 1): every step quoted as it is now (the same GET /price a run is checked
 * against), added up by the shared rule (server/src/shared/flowPrice.ts: free on this computer $0, a step with no price apart).
 * Quotes wait until the cards stop changing (450 ms) and a card's quote is kept for 30 s while nothing about it changes, so typing in one
 * prompt re-prices one card, not the whole Group; every 30 s it asks again (a key added, a place switched).
 * The price shown here is a preview: Go in the dock is priced and locked again.
 */
import { useEffect, useState } from 'react';
import { useValue, type BoardApi, type NodeId } from './boardApi';
import { quoteNode } from './nodeRun';
import { flowTotal, flowTotalParts, flowTotalWords, quoteUsd, type FlowTotal } from '../../../server/src/shared/flowPrice';

/** What can change a card's price: its settings and what feeds it, not its takes or its run state. */
const VOLATILE = new Set(['takes', 'take', 'status', 'jobId', 'error', 'quote', 'progress', 'w', 'h']);
export function priceKeyOf(board: BoardApi, id: NodeId): string {
  const n = board.getNode(id); if (!n) return '';
  const props = Object.fromEntries(Object.entries((n.props ?? {}) as Record<string, unknown>).filter(([k]) => !VOLATILE.has(k)));
  const ins = board.linksInto(id).map((l) => l.from).join(',');
  return `${id}|${JSON.stringify(props)}|${ins}`;
}

/** A quote is kept this long (prices, keys and places can change without the card changing); the header asks again as often. */
const FRESH_MS = 30_000;
const cache = new Map<string, { at: number; p: Promise<any> }>();
const quoteOnce = (board: BoardApi, id: NodeId, key: string) => {
  const hit = cache.get(key); if (hit && Date.now() - hit.at < FRESH_MS) return hit.p;
  const p = quoteNode(board, id, { pending: true }).catch(() => null);
  cache.set(key, { at: Date.now(), p }); if (cache.size > 400) cache.delete(cache.keys().next().value!);
  return p;
};

export interface FlowPrice { words: string | null; parts: ReturnType<typeof flowTotalParts> | null; total: FlowTotal | null }
export function useFlowPrice(board: BoardApi, ids: NodeId[]): FlowPrice {
  const key = useValue('flow price key', () => ids.map((id) => priceKeyOf(board, id)).join('\n'), [board, ids.join(',')]);
  const [out, setOut] = useState<FlowPrice>({ words: null, parts: null, total: null });
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => setTick((n) => n + 1), FRESH_MS); return () => window.clearInterval(t); }, []);
  useEffect(() => {
    if (!ids.length) { setOut({ words: null, parts: null, total: null }); return; }
    let on = true;
    const t = window.setTimeout(() => {
      const keys = key.split('\n');
      void Promise.all(ids.map((id, i) => quoteOnce(board, id, keys[i] ?? id))).then((qs) => {
        if (!on) return;
        const total = flowTotal(qs.map((q) => ({ usd: quoteUsd(q), quote: q })));
        setOut({ words: flowTotalWords(total), parts: flowTotalParts(total), total });
      });
    }, 450);
    return () => { on = false; window.clearTimeout(t); };
  }, [board, key, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return out;
}
