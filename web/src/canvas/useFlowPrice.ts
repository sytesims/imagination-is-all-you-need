/**
 * The total a Group's "Run the flow" button shows (release 2, step 1): every step quoted as it is now (the same GET /price a run is checked
 * against), added up by the shared rule (server/src/shared/flowPrice.ts: free on this computer $0, a step with no price apart).
 * Quotes wait until the cards stop changing (450 ms) and a card's quote is kept while nothing about it changes, so typing in one prompt
 * re-prices one card, not the whole Group. The price shown here is a preview: Go in the dock is priced and locked again.
 */
import { useEffect, useState } from 'react';
import { useValue, type BoardApi, type NodeId } from './boardApi';
import { quoteNode } from './nodeRun';
import { flowTotal, flowTotalWords, quoteUsd, type FlowTotal } from '../../../server/src/shared/flowPrice';

/** What can change a card's price: its settings and what feeds it, not its takes or its run state. */
const VOLATILE = new Set(['takes', 'take', 'status', 'jobId', 'error', 'quote', 'progress', 'w', 'h']);
export function priceKeyOf(board: BoardApi, id: NodeId): string {
  const n = board.getNode(id); if (!n) return '';
  const props = Object.fromEntries(Object.entries((n.props ?? {}) as Record<string, unknown>).filter(([k]) => !VOLATILE.has(k)));
  const ins = board.linksInto(id).map((l) => l.from).join(',');
  return `${id}|${JSON.stringify(props)}|${ins}`;
}

const cache = new Map<string, Promise<any>>();
const quoteOnce = (board: BoardApi, id: NodeId, key: string) => {
  let p = cache.get(key);
  if (!p) { p = quoteNode(board, id, { pending: true }).catch(() => null); cache.set(key, p); if (cache.size > 400) cache.delete(cache.keys().next().value!); }
  return p;
};

export interface FlowPrice { words: string | null; total: FlowTotal | null }
export function useFlowPrice(board: BoardApi, ids: NodeId[]): FlowPrice {
  const key = useValue('flow price key', () => ids.map((id) => priceKeyOf(board, id)).join('\n'), [board, ids.join(',')]);
  const [out, setOut] = useState<FlowPrice>({ words: null, total: null });
  useEffect(() => {
    if (!ids.length) { setOut({ words: null, total: null }); return; }
    let on = true;
    const t = window.setTimeout(() => {
      const keys = key.split('\n');
      void Promise.all(ids.map((id, i) => quoteOnce(board, id, keys[i] ?? id))).then((qs) => {
        if (!on) return;
        const total = flowTotal(qs.map((q) => ({ usd: quoteUsd(q), quote: q })));
        setOut({ words: flowTotalWords(total), total });
      });
    }, 450);
    return () => { on = false; window.clearTimeout(t); };
  }, [board, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return out;
}
