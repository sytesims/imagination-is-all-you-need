import { useEffect, useState } from 'react';
import { getLedger } from '../api';
import { pollWithBackoff } from './backoff';
/** One balance source for the whole app (header pill, avatar menu, Assets). Polls /api/ledger once, shared: every 3 s, slowing to 15 s
 *  while nothing changes, none while the tab is hidden; a change, focus or 'oj:balance' reads it at once. */
type L = Awaited<ReturnType<typeof getLedger>>;
let cur: L | null = null; const subs = new Set<(l: L) => void>(); let timer: any = null;
export const refreshBalance = () => getLedger().then(l => { cur = l; subs.forEach(f => f(l)); }).catch(() => undefined);
export function useLedger() {
  const [l, setL] = useState<L | null>(cur);
  useEffect(() => { subs.add(setL); if (!timer) { refreshBalance(); timer = pollWithBackoff(() => refreshBalance().then(() => JSON.stringify(cur)), { minMs: 3000, maxMs: 15_000, pauseHidden: true }); addEventListener('focus', refreshBalance); addEventListener('oj:balance', refreshBalance); } else if (cur) setL(cur);
    return () => { subs.delete(setL); if (!subs.size) { timer(); timer = null; removeEventListener('focus', refreshBalance); removeEventListener('oj:balance', refreshBalance); } }; }, []);
  return l;
}
