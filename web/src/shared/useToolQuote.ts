/**
 * The one debounced quote hook for a bar: GET /api/tools/<toolId>/price with the params the submit implies (quote = charge).
 * Off when toolId is null. Used by Create Image's workflows, 3D and the Canvas bar (moved here from ui/next/WorkflowBar.tsx, 2026-10-24;
 * WorkflowBar re-exports it as useWorkflowQuote so existing imports keep working).
 */
import { useEffect, useState } from 'react';
import { readQuoteBody, useRequoteTick } from './quote';
import { quoteParams } from './usePrefill';
import { useRoute, pinQ } from '../ui/routing/Routes';

export function useToolQuote(toolId: string | null, provider: string, params: Record<string, string>) {
  const [q, setQ] = useState<any>(null); const tick = useRequoteTick(); const { route: pin } = useRoute(provider ?? ''); const key = JSON.stringify(params);
  useEffect(() => { if (!toolId) { setQ(null); return; } const u = new URLSearchParams({ ...quoteParams(), ...(provider ? { provider, ...pinQ(provider) } : {}), ...params });
    const ac = new AbortController(); const t = setTimeout(() => fetch(`/api/tools/${toolId}/price?${u}`, { signal: ac.signal }).then(readQuoteBody).then(d => setQ(d ?? null)).catch(() => undefined), 220);
    return () => { clearTimeout(t); ac.abort(); }; }, [toolId, provider, pin, tick, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return q;
}
