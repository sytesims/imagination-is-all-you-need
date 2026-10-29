import { useCallback, useEffect, useRef, useState } from 'react';
import { listTools, type ToolInfo } from '../api';
import { registerToolNames } from './activeJobs';
/** Fire this (window event) after anything that changes where models can run: keys, Local on/off. */
export const TOOLS_REFRESH = 'ohf:tools-refresh';
export const refreshTools = () => { try { dispatchEvent(new Event(TOOLS_REFRESH)); } catch { /* ignore */ } };

/**
 * Tool registry loader with an error state: `error` is the server's message, `retry()` reloads now,
 * and while failing it auto-retries every `intervalMs` (3 s). Visuals are up to the caller (Design Planner).
 */
export function useTools(intervalMs = 3000) {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [error, setError] = useState<string | null>(null); const [failure, setFailure] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [attempts, setAttempts] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const alive = useRef(true);
  const load = useCallback(() => {
    clearTimeout(timer.current); setLoading(true);
    listTools().then((t) => { if (!alive.current) return; registerToolNames(t); setTools(t); setError(null); setFailure(null); setLoading(false); })
      .catch((e: any) => {
        if (!alive.current) return;
        setError(e?.message || 'Failed to load tools'); setFailure(e); setLoading(false); setAttempts((a) => a + 1);
        if (e?.retryable !== false) timer.current = setTimeout(load, e?.retryAfterMs ?? intervalMs);
      });
  }, [intervalMs]);
  useEffect(() => { alive.current = true; load(); return () => { alive.current = false; clearTimeout(timer.current); }; }, [load]);
  /* Model vs Run-on: a key added or removed, or Local turned on, changes where each model can run → re-read the list quietly (no skeleton) */
  useEffect(() => { const f = () => { listTools().then((t) => { if (alive.current) { registerToolNames(t); setTools(t); } }).catch(() => undefined); }; addEventListener(TOOLS_REFRESH, f); return () => removeEventListener(TOOLS_REFRESH, f); }, []);
  return { tools, error, failure, loading, attempts, retry: load, nextRetryMs: error ? intervalMs : null };
}
