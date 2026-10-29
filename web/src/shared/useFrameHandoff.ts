import { useEffect, useRef, useState } from 'react';
import { frameDeliveryGuard, frameHandoffFailure, singleFrameRequests } from './frameHandoff';
import type { Ref } from './References';
import type { Handoff } from './usePrefill';

const requests = singleFrameRequests();
type Request = { jobId: string; out: string; as: string; at: string; cont: boolean; toolId: string; mode: string; focus: string };
type State = { phase: 'loading' | 'error'; message?: string; imageUrl?: string } | null;
const scope = () => `${location.pathname}?workflow=${new URLSearchParams(location.search).get('workflow') ?? ''}`;
const failure = (message: string, fields: Record<string, unknown> = {}) => Object.assign(new Error(message), fields);
async function json(url: string) {
  const r = await fetch(url); const body = await r.json().catch(() => null);
  if (!r.ok || !body || body.available === false) throw failure(body?.error ?? body?.reason ?? `HTTP ${r.status}`, { status: r.status, code: body?.code });
  return body;
}

/** The frame is decoded before delivery; loading stays visible until the actual
 * start thumbnail's onLoad. Canceling stops delivery, not server-side ffmpeg. */
export function useFrameHandoff(opts: { onImage?: (r: Ref) => void; onHandoff?: (h: Handoff) => void; onFrameStart?: () => void; keepQuote: (q: any) => void; loaded: (text: string) => void }) {
  const [state, setState] = useState<State>(null); const current = useRef(opts); current.current = opts;
  const guard = useRef(frameDeliveryGuard()).current;
  const active = useRef<{ key: string; scope: string; retry: () => void; imageUrl?: string; delivered?: boolean } | null>(null);
  const cancel = () => { guard.cancel(); const a = active.current; active.current = null; if (a?.imageUrl && !a.delivered) URL.revokeObjectURL(a.imageUrl); setState(null); };
  const start = (request: Request, retrying = false) => {
    const q = new URLSearchParams({ action: 'send-to', tool: request.toolId, out: request.out || '0', as: request.as, t: request.at, ...(request.cont ? { cont: '1' } : {}) });
    const key = `/api/jobs/${encodeURIComponent(request.jobId)}/prefill?${q}`;
    if (active.current?.key === key && state?.phase === 'loading') return;
    cancel(); const live = guard.begin(); const origin = scope();
    const a = { key, scope: origin, retry: () => start(request, true), imageUrl: undefined as string | undefined, delivered: false }; active.current = a;
    if (!retrying) current.current.onFrameStart?.(); setState({ phase: 'loading' });
    const valid = () => live() && scope() === origin;
    void (async () => {
      try {
        const h = await requests.get(key, () => json(key)); if (!valid()) return;
        const slot = h.slot ?? 'image'; const field = h.fields?.[slot];
        const url = (Array.isArray(field) ? field[0] : field) ?? h.files?.[slot]?.[0] ?? h.startFrame;
        if (!url) throw failure('No frame returned', { code: 'frame_failed' });
        const r = await fetch(url); if (!r.ok) throw failure(`HTTP ${r.status}`, { status: r.status });
        const blob = await r.blob(); if (!valid()) return;
        const file = new File([blob], url.split('/').pop() || 'last-frame.png', { type: blob.type || 'image/png' });
        a.imageUrl = URL.createObjectURL(file);
        await new Promise<void>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(); image.onerror = () => reject(failure('Frame image could not be decoded', { code: 'decode' })); image.src = a.imageUrl!; });
        if (!valid()) { URL.revokeObjectURL(a.imageUrl); return; }
        if (!current.current.onImage) throw failure('This tool cannot take a start frame');
        current.current.keepQuote(h.quoteParams); setState({ phase: 'loading', imageUrl: a.imageUrl });
        a.delivered = true; current.current.onImage({ file, url: a.imageUrl });
        current.current.onHandoff?.({ jobId: request.jobId, slot, url, prompt: '', toolId: request.toolId, mode: request.mode || h.form?.mode || '', focus: request.focus || h.focus || '', form: h.form ?? {}, frame: request.at, cont: request.cont, continueRoute: h.continueRoute ?? null });
      } catch (error) {
        if (!valid()) return; if (a.imageUrl && !a.delivered) URL.revokeObjectURL(a.imageUrl);
        setState({ phase: 'error', message: frameHandoffFailure(error) });
      }
    })();
  };
  const ready = (url: string) => { const a = active.current; if (a?.imageUrl !== url) return; active.current = null; setState(null); current.current.loaded('Last frame loaded as the start image'); };
  const retry = () => { const a = active.current; if (a && a.scope === scope() && state?.phase === 'error') a.retry(); };
  useEffect(() => { const changed = () => { if (active.current && active.current.scope !== scope()) cancel(); }; addEventListener('popstate', changed);
    return () => { guard.cancel(); const a = active.current; active.current = null; if (a?.imageUrl && !a.delivered) URL.revokeObjectURL(a.imageUrl); removeEventListener('popstate', changed); }; }, []);
  return { state, start, cancel, ready, retry };
}
