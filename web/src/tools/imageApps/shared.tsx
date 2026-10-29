/* Shared bits for the two-photo / one-photo image apps on Create Image's edit mode (Face Swap, Shots): live quote, submit, a photo slot.
 * Same quote = charge rule as every tool page: the server's /price (route, real cost, demo note), never a client estimate when it answered. */
import { IMAGE_ACCEPT, fileFits } from '../../../../server/src/shared/mediaAccept';
import { useEffect, useRef, useState } from 'react';
import { readQuoteBody, useRequoteTick } from '../../shared/quote';
import { quoteParams } from '../../shared/usePrefill';
import { useRoute, pinQ } from '../../ui/routing/Routes';
import { createJob, issuesOf, JobState, SubmitIssue, ToolInfo } from '../../api';
import { useJobs } from '../../shared/useJobs';
import { useToast } from '../../shared/Toast';
import { cloneForm } from '../../shared/useToolQuery';
import type { Ref } from '../../shared/References';

export type Quote = Record<string, any> | null;
/** Debounced GET /api/tools/:id/price for this provider (+ its saved route pin) and the app's own params. Re-quotes on the requote bus. */
export function useAppQuote(tool: ToolInfo, provider: string, params: Record<string, string>): Quote {
  const [q, setQ] = useState<Quote>(null); const tick = useRequoteTick(); const { route: pin } = useRoute(provider ?? ''); const key = JSON.stringify(params);
  useEffect(() => { const u = new URLSearchParams({ ...quoteParams(), ...(provider ? { provider, ...pinQ(provider) } : {}), types: 'edit', ...params });
    const ac = new AbortController(); const t = setTimeout(() => fetch(`/api/tools/${tool.id}/price?${u}`, { signal: ac.signal }).then(readQuoteBody).then(d => setQ(d ?? null)).catch(() => undefined), 220);
    return () => { clearTimeout(t); ac.abort(); }; }, [tool.id, provider, pin, tick, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return q;
}
/** Jobs list + submit with a placeholder row (same flow as the other tool pages); keeps each job's form for Retry. */
export function useAppSubmit(tool: ToolInfo, onError?: (e: any) => void) {
  const toast = useToast(); const { jobs, add, setJobs, refresh, active } = useJobs(tool.id); const forms = useRef(new Map<string, FormData>());
  const [issues, setIssues] = useState<SubmitIssue[]>([]); const [sel, setSel] = useState<string | null>(null);
  const submit = async (fd: FormData) => {
    const ph: JobState = { id: '', toolId: tool.id, status: 'queued', stage: 'uploading', progress: 0, queuePos: 0, eta: 0, resultUrl: null, outputs: [], error: null, warnings: [], parentId: null, input: {} };
    add(ph); setIssues([]);
    try { const r = await createJob(tool.id, fd, { showsIssues: true }); forms.current.set(r.id, cloneForm(fd)); r.warnings?.forEach(w => toast(w, 'warn'));
      setJobs(js => js.some(j => j.id === r.id) ? js.filter(j => j !== ph) : js.map(j => j === ph ? { ...ph, id: r.id, provider: r.provider } : j)); setSel(r.id); setTimeout(refresh, 50); }
    catch (e: any) { setJobs(js => js.filter(j => j !== ph)); setIssues(issuesOf(e)); onError?.(e); toast(e?.message || 'Generation failed.', 'error'); }
  };
  const retry = (id: string) => { const f = forms.current.get(id); return f ? () => submit(cloneForm(f)) : undefined; };
  const current = jobs.find(j => j.id === sel) ?? jobs[0]; const running = jobs.find(active);
  return { jobs, current, running, active, refresh, issues, setIssues, submit, retry, setSel };
}
/** One photo slot (fixed aspect, so filling it never moves the panel). Drop or click; Remove clears it. */
export function PhotoSlot({ id, label, hint, r, onFile, onClear, disabled, children, hideLabel }: { id: string; label: string; hint: string; hideLabel?: boolean; r: Ref | null; onFile: (f: File) => void; onClear: () => void; disabled?: boolean; children?: React.ReactNode }) {
  const [over, setOver] = useState(false);
  return <div className={`sp-slot ia-slot ${r ? 'filled' : ''} ${over ? 'over' : ''}`} data-testid={`slot-${id}`}>
    <span className={hideLabel ? 'sr-only' : 'sp-label'}>{label}</span>
    <label className="sp-box ia-box" onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); const f = [...(e.dataTransfer?.files ?? [])].find(x => fileFits('image', x)); if (f && !disabled) onFile(f); }}>
      <input type="file" accept={IMAGE_ACCEPT} aria-label={label} data-testid={`slot-${id}-input`} disabled={disabled} onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      {r ? <img src={r.url} alt={label} /> : <span className="sp-empty"><b aria-hidden>+</b><span>{hint}</span><small>PNG or JPG</small></span>}
    </label>
    {r && <button type="button" className="btn btn-sm sp-clear" onClick={onClear} disabled={disabled} data-testid={`slot-${id}-clear`}>Remove</button>}
    {children}
  </div>;
}
export const refOf = (f: File): Ref => ({ file: f, url: URL.createObjectURL(f) });
export const newSeed = (old?: number) => { let n = Math.floor(Math.random() * 1e6); if (n === old) n = (n + 1) % 1e6; return n; };
