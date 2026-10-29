/**
 * Sample mode (the mock backend, the default on a fresh clone): every run makes a free, labelled sample, even after a key is saved or ComfyUI
 * is found. One shared note says so and gives the one step to real results, for the first-run sheet (RunSetup) and Settings → Connections.
 * The backend is read once from GET /api/config (it only changes when the server restarts).
 */
import { useEffect, useState } from 'react';
import { Notice } from './Notice';

export const REAL_RUNS_CMD = 'OPENHIGGSFIELD_BACKEND=comfy npm run dev';
export const REAL_RUNS_LINE = 'OPENHIGGSFIELD_BACKEND=comfy';

let cached: Promise<string | null> | null = null;
const readBackend = () => (cached ??= fetch('/api/config').then(r => (r.ok ? r.json() : null)).then(c => (typeof c?.backend === 'string' ? c.backend : null)).catch(() => { cached = null; return null; }));
/** 'mock' | 'comfy' once known, null while loading or when the server can't be reached. */
export function useBackend(): string | null {
  const [b, setB] = useState<string | null>(null);
  useEffect(() => { let live = true; void readBackend().then(v => { if (live) setB(v); }); return () => { live = false; }; }, []);
  return b;
}

function CopyCmd({ text }: { text: string }) {
  const [done, setDone] = useState<'' | 'ok' | 'err'>('');
  const copy = () => { const p = navigator.clipboard?.writeText(text); if (!p) { setDone('err'); return; } p.then(() => setDone('ok'), () => setDone('err')).finally(() => setTimeout(() => setDone(''), 1400)); };
  return <span className="sm-cmd"><code>{text}</code><button type="button" className={`btn btn-sm cp-line ${done}`} aria-label="Copy the command" onClick={copy} data-testid="sample-mode-copy">{done === 'ok' ? 'Copied' : done === 'err' ? 'Couldn’t copy' : 'Copy'}</button></span>;
}

/** "Samples for now": what to do so saved keys and your ComfyUI make real results. `saved` = the user just saved something (first-run sheet). */
export function SampleModeNote({ saved = false, testId = 'sample-mode-note' }: { saved?: boolean; testId?: string }) {
  return <Notice kind="info" tone="box" className="sm-note" testId={testId} title={saved ? 'Saved. One more step for real results' : 'You’re in sample mode'}>
    Runs make free samples for now{saved ? '' : ', even with a key or ComfyUI connected'}. For real results, stop the app in its terminal (Ctrl+C) and start it again with:
    <CopyCmd text={REAL_RUNS_CMD} />
    <small className="sm-more">To keep it on, set <code>{REAL_RUNS_LINE}</code> in <code>.env.local</code> in the app’s folder. Every paid run still shows its price first.</small>
  </Notice>;
}
