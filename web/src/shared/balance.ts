import { useEffect, useState } from 'react';
import { getLedger } from '../api';
/** One balance source for the whole app (header pill, avatar menu, Assets). Polls /api/ledger once, shared. */
type L = Awaited<ReturnType<typeof getLedger>>;
let cur: L | null = null; const subs = new Set<(l: L) => void>(); let timer: any = null;
export const refreshBalance = () => getLedger().then(l => { cur = l; subs.forEach(f => f(l)); }).catch(() => undefined);
export function useLedger() {
  const [l, setL] = useState<L | null>(cur);
  useEffect(() => { subs.add(setL); if (!timer) { refreshBalance(); timer = setInterval(() => { if (!document.hidden) refreshBalance(); } /* hidden tab: skip (focus refreshes) */, 3000); addEventListener('focus', refreshBalance); addEventListener('oj:balance', refreshBalance); } else if (cur) setL(cur);
    return () => { subs.delete(setL); if (!subs.size) { clearInterval(timer); timer = null; removeEventListener('focus', refreshBalance); removeEventListener('oj:balance', refreshBalance); } }; }, []);
  return l;
}
