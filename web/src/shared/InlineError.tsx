import { useCallback, useEffect, useRef, useState } from 'react';
import { isOffline, onReconnect } from './connectivity';
import { Notice } from './Notice';

/** What went wrong, in plain words. Never the raw response body or "(Failed to fetch)". */
export type ErrKind = 'offline' | 'restart' | 'server' | 'timeout' | 'other';
export function errKind(e: unknown): ErrKind {
  const m = String((e as any)?.message ?? e ?? ''); const st = Number((e as any)?.status ?? (m.match(/\bHTTP (\d{3})\b/)?.[1] ?? 0));
  if ((e as any)?.kind === 'timeout' || /timed? ?out/i.test(m)) return 'timeout';
  if (/restart/i.test(m) || st === 503) return 'restart';
  if (isOffline() || /failed to fetch|networkerror|load failed|network request failed|can.?t reach/i.test(m) || (e instanceof TypeError)) return 'offline';
  if (st >= 500) return 'server';
  return 'other';
}
const WHY: Record<ErrKind, string> = {
  offline: 'Can’t reach the server right now. This retries when the connection is back.',
  restart: 'The server is restarting. This retries on its own.',
  server: 'That didn’t load. Try again in a moment.',
  timeout: 'This is taking longer than it should.',
  other: 'Something went wrong.',
};
export const friendlyError = (e: unknown, what = 'this') => ({ kind: errKind(e), title: `Couldn’t load ${what}.`, why: WHY[errKind(e)] });

/** The server's technical detail (`detail`, `reasonDetail`) for a submit or job error. Never shown as the message;
 *  only behind a collapsed “Technical details”. */
export const techOf = (x: any): string => [x?.detail, x?.reasonDetail, x?.errorDetail].filter((v, i, a) => typeof v === 'string' && v.trim() && a.indexOf(v) === i).join('\n');
/** The one "show more" disclosure for details most people can skip: raw error text (`text`, shown as code) or any short note (`children`,
 *  e.g. the env names behind a setting in Settings → Connections). `summary` is the link text. */
export function TechDetails({ text, children, summary = 'Technical details', className = '', testId = 'tech-details' }: { text?: string | null; children?: React.ReactNode; summary?: string; className?: string; testId?: string }) {
  if (children == null && (!text || !text.trim())) return null;
  return <details className={`tech-details ${className}`} data-testid={testId}><summary>{summary}</summary>{children ?? <code>{text}</code>}</details>;
}
/** Friendly inline error with Retry. Sits where the content would be; never takes over the page. */
export function InlineError({ what = 'this', error, onRetry, className = '', note, title, why, testId }: { what?: string; error?: unknown; onRetry?: () => void; className?: string; note?: string; title?: string; why?: string; testId?: string }) {
  const f0 = friendlyError(error, what); const f = { ...f0, ...(title ? { title, kind: 'other' as ErrKind } : {}), ...(why ? { why } : {}) }; // B15: a caller's own title/why (submit refusals, not load errors)
  /* 2026-10-25: drawn by the shared Notice (same look as every in-page message); offline / restarting / slow is amber, a real failure red */
  const nk = f.kind === 'offline' || f.kind === 'restart' || f.kind === 'timeout' ? 'warn' : 'error';
  return <Notice kind={nk} live="alert" className={`inline-error ie-${f.kind} ${className}`.trim()} testId={testId ?? 'inline-error'} data-kind={f.kind} title={f.title}
    action={onRetry && <button type="button" className="btn btn-sm ie-retry" data-testid="inline-retry" onClick={onRetry}>Retry</button>}>
    {f.why}{note ? ` ${note}` : ''}<TechDetails text={techOf(error)} /></Notice>;
}

/** Load data with a timeout (skeletons never spin forever), Retry, and an automatic reload when the connection comes back. */
export function useLoad<T>(fn: (signal: AbortSignal) => Promise<T>, deps: any[] = [], { timeoutMs = 12000 } = {}) {
  const [s, setS] = useState<{ data: T | null; error: unknown; loading: boolean }>({ data: null, error: null, loading: true });
  const n = useRef(0); const fnRef = useRef(fn); fnRef.current = fn;
  const run = useCallback(() => { const id = ++n.current; const ac = new AbortController(); setS(x => ({ ...x, loading: true, error: null }));
    const t = setTimeout(() => { if (id !== n.current) return; ac.abort(); setS(x => ({ ...x, loading: false, error: Object.assign(new Error('timed out'), { kind: 'timeout' }) })); }, timeoutMs);
    fnRef.current(ac.signal).then(d => { if (id === n.current) setS({ data: d, error: null, loading: false }); }, e => { if (id === n.current && !(ac.signal.aborted && (e as any)?.name === 'AbortError')) setS(x => ({ ...x, loading: false, error: e })); }).finally(() => clearTimeout(t));
    return () => { ac.abort(); clearTimeout(t); }; }, [timeoutMs]);
  useEffect(() => run(), deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onReconnect(() => { if (n.current) run(); }), [run]);
  return { ...s, retry: run };
}
/** fetch → JSON that throws a typed error (status kept, body dropped) on a non-2xx answer. */
export async function getJSON<T = any>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal }); if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status }); return r.json();
}
