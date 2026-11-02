/**
 * "Connect a Comfy key or your ComfyUI to start" (the user's option a, 2026-10-29). With no Comfy key and no ComfyUI, Generate never makes a
 * sample: the server answers 402 code no_connection (routing/select.ts needsConnection) and api.ts createJob opens this sheet. Nothing ran,
 * nothing was charged, the prompt stays in the bar. Two paths, each finished here:
 *  - Paste a Comfy key: saved (POST /api/settings/providers), then checked on the spot by reading the Comfy balance (GET /api/accounts?refresh=1).
 *  - Your ComfyUI: the shared form (ComfyConnect: looks on the usual ports, and again every few seconds), then saved (PUT /api/local/comfy) and turned on.
 * The Examples project is what a fresh app shows; this sheet only answers a Generate press.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { navigate } from '../platform/router';
import { refreshTools, TOOLS_REFRESH } from './useTools';
import { refreshAccounts } from './billing';
import { requestRequote } from './quote';
import { setRouting } from './models';
import { plainCopy } from './plainCopy';
import { setupRequest, setupBody } from './setupConnection';
import { ComfyConnect, useComfyConnect, type ComfyLook } from './ComfyConnect';
import { LOCAL_LABEL } from '../../../server/src/shared/modelIds';
import { SecretInput } from './SecretInput';

export const NO_CONNECTION_TITLE = 'Connect a Comfy key or your ComfyUI to start';
const OPEN_EVT = 'ohf:connect-sheet';
export const openConnectSheet = () => { try { dispatchEvent(new Event(OPEN_EVT)); } catch { /* ignore */ } };
/** The error createJob throws after opening the sheet: calm and declined, so no second toast says the same thing. */
export const noConnectionError = () => Object.assign(new Error(`Not run. ${NO_CONNECTION_TITLE}.`), { code: 'no_connection', errorType: 'no_connection', status: 402, calm: true, declined: true, charged: false, issues: [] });

/** The real setup from GET /api/config (cloud | local | both | none; routing/select.ts setupKind), re-read whenever where models run changes. */
export type SetupKind = 'cloud' | 'local' | 'both' | 'none';
export function useSetupKind(): SetupKind | null {
  const [k, setK] = useState<SetupKind | null>(null);
  useEffect(() => { let live = true; const read = () => fetch('/api/config').then(r => (r.ok ? r.json() : null)).then(c => { if (live && c?.setupKind) setK(c.setupKind); }).catch(() => undefined);
    void read(); addEventListener(TOOLS_REFRESH, read); return () => { live = false; removeEventListener(TOOLS_REFRESH, read); }; }, []);
  return k;
}
/** Generate when nothing is connected (setupKind none): it says the next step ("Connect to generate") and opens the connect sheet, the same
 *  as the server's 402 no_connection. Once something is connected, the page's own Generate comes back. */
export const CONNECT_LABEL = 'Connect to generate';
export const CONNECT_HINT = 'Add a Comfy key or use your ComfyUI · about 1 min';
export function ConnectGenerate({ testId, priceTestId, className = 'ic-gen gen-btn gen-dock btn btn-primary' }: { testId: string; priceTestId?: string; className?: string }) {
  return <button type="button" className={className} data-testid={testId} data-needs-connection="1" title={NO_CONNECTION_TITLE} onClick={openConnectSheet}>
    <span className="gen-l">{CONNECT_LABEL}</span><span className="gen-price" data-testid={priceTestId}>{CONNECT_HINT}</span></button>;
}

type Step = { busy?: boolean; ok?: boolean; text?: string };
const json = async (r: Response) => r.json().catch(() => null);
const after = async () => { refreshTools(); void refreshAccounts(); requestRequote(); };

/** Mounted once (App). */
export function ConnectSheetHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => { const f = () => setOpen(true); addEventListener(OPEN_EVT, f); return () => removeEventListener(OPEN_EVT, f); }, []);
  return open ? <ConnectSheet onClose={() => setOpen(false)} /> : null;
}

function ConnectSheet({ onClose }: { onClose: () => void }) {
  const [key, setKey] = useState(''); const [can, setCan] = useState<boolean | null>(null);
  const [k, setK] = useState<Step>({}); const [g, setG] = useState<Step>({}); const cc = useComfyConnect();
  const back = useRef<HTMLElement | null>(null); const box = useRef<HTMLDivElement>(null);
  const live = useRef(true); const abort = useRef(new AbortController()); const localBusy = useRef(false);
  const savedKey = useRef(''); const keyBusy = useRef(false);
  useEffect(() => { back.current = document.activeElement as HTMLElement; requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus());
    fetch('/api/settings/providers', { signal: abort.current.signal }).then(r => (r.ok ? r.json() : null)).then(d => { if (live.current) setCan(!!d?.canStoreKeys); }).catch(() => { if (live.current) setCan(false); });
    return () => { live.current = false; abort.current.abort(); }; }, []);
  const close = () => { live.current = false; abort.current.abort(); onClose(); back.current?.focus?.(); };
  const done = k.ok || g.ok;

  const saveKey = async () => { const v = key.trim(); if (!v || keyBusy.current) return; keyBusy.current = true; setK({ busy: true, text: 'Checking your key…' });
    try {
      if (savedKey.current !== v) { await setupRequest('/api/settings/providers', setupBody('POST', { id: 'comfy', key: v }, abort.current.signal), 'Couldn’t save the key.'); savedKey.current = v; }
      const a = await json(await fetch('/api/accounts?refresh=1', { signal: abort.current.signal })); const c = (a?.accounts ?? []).find((x: any) => x.provider === 'comfy');
      if (!live.current) return;
      let text = 'Key saved. Your balance couldn’t be read just now; you see the price before every run.';
      if (c && typeof c.balanceUsd === 'number') text = `Key works. Your Comfy account has $${c.balanceUsd.toFixed(2)}.`;
      else if (c?.note && /didn.t accept|refused|401|403/i.test(c.note)) { setK({ ok: false, text: plainCopy(c.note) }); return; }
      await setupRequest('/api/setup', setupBody('PUT', { done: true, choices: ['comfy'] }, abort.current.signal), 'Key saved, but couldn’t save setup.');
      if (!live.current) return; setK({ ok: true, text }); setKey(''); await after();
    } catch (e) { if (live.current) setK({ ok: false, text: (e as Error).message }); } finally { keyBusy.current = false; } };

  /* the shared form found it (or the person typed it): save a new address, turn on local runs, mark setup done */
  const useComfy = async (l: ComfyLook) => { if (localBusy.current || !l.url) return; localBusy.current = true; setG({ busy: true });
    try {
      if (l.save) await setupRequest('/api/local/comfy', setupBody('PUT', { url: l.url }, abort.current.signal), 'Couldn’t save the ComfyUI address.');
      const rb = await setupRequest('/api/me/routing', { ...setupBody('PUT', { global: { useLocal: true } }, abort.current.signal), headers: { 'content-type': 'application/json', 'x-openhiggsfield-source': 'web connect sheet' } }, 'Couldn’t enable ComfyUI routing.'); setRouting(rb);
      await setupRequest('/api/setup', setupBody('PUT', { done: true, choices: ['gpu'] }, abort.current.signal), 'ComfyUI connected, but couldn’t save setup.');
      if (!live.current) return;
      setG({ ok: true, text: 'Connected. Models you have run here for free.' }); cc.set({ ...l, save: false });
      await after();
    } catch (e) { if (live.current) setG({ ok: false, text: (e as Error).message }); } finally { localBusy.current = false; } };

  const go = (to: string) => () => { close(); navigate(to); };
  return createPortal(<div className="dlg-scrim" onMouseDown={e => e.target === e.currentTarget && close()} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); close(); } }}>
    <div ref={box} className="dlg cs" role="dialog" aria-modal="true" aria-labelledby="cs-t" data-testid="connect-sheet">
      <h2 id="cs-t" className="dlg-t">{NO_CONNECTION_TITLE}</h2>
      <p className="dlg-b">Nothing ran and nothing was charged. Pick one way to run, then press Generate again. Your prompt stays in the bar.</p>
      <div className="cs-paths">
        <section className="cs-path" data-testid="cs-comfy">
          <b>Paste a Comfy key</b><small>One key for most models: workflows on Comfy Cloud and partner models on Comfy Router. Billed to your Comfy account; you see the price before every run.</small>
          {can === false ? <small className="cs-warn">Keys can be saved here only when the app runs on this computer. Add it to the app’s settings file instead.</small>
            : <div className="cs-row">
              <SecretInput onEnter={() => { if (key.trim() && !k.busy) void saveKey(); }} placeholder="Paste your Comfy API key" value={key} onChange={e => setKey(e.target.value)} data-autofocus aria-label="Comfy API key" data-testid="cs-key" />
              <button type="button" className="btn btn-sm" onClick={() => void saveKey()} disabled={!key.trim() || k.busy} data-testid="cs-key-save">{k.busy ? 'Checking…' : 'Check and save'}</button></div>}
          <a className="cs-get" href="https://platform.comfy.org/profile/api-keys" target="_blank" rel="noreferrer">Get a key ↗</a>
          {k.text && <p className={`helper cs-st${k.ok ? ' ok' : k.ok === false ? ' bad' : ''}`} role="status" data-testid="cs-key-status">{k.text}</p>}
        </section>
        <section className="cs-path" data-testid="cs-local">
          <b>Use your own ComfyUI</b><small>Free and private on {LOCAL_LABEL.toLowerCase()}, with the models you have.</small>
          {g.ok ? null : <ComfyConnect c={cc} onUse={useComfy} useBusy={g.busy} />}
          {g.text && <p className={`helper cs-st${g.ok ? ' ok' : g.ok === false ? ' bad' : ''}`} role="status" data-testid="cs-local-status">{g.text}</p>}
        </section>
      </div>
      <div className="dlg-a"><button type="button" className="link-btn" onClick={go('/settings#connections')}>More ways in Settings</button>
        <button type="button" className={done ? 'btn btn-sm' : 'btn btn-sm btn-ghost'} data-testid="cs-close" onClick={close}>{done ? 'Done, back to Generate' : 'Not now'}</button></div>
      <style>{`.cs{width:min(600px,calc(100vw - 32px));max-width:600px;max-height:calc(100dvh - 32px);overflow:auto}.cs-paths{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;margin:14px 0 4px}.cs-path{min-width:0;overflow-wrap:anywhere}@media (max-width:620px){.cs-paths{grid-template-columns:1fr}}
.cs-path{box-sizing:border-box;display:flex;flex-direction:column;gap:8px;padding:14px;border-radius:14px;border:1px solid var(--border);background:var(--surface-2)}
.cs-path b{font:600 14px/18px var(--font-display);color:var(--text)}.cs-path small{font:400 12px/16px var(--font-ui);color:var(--text-2)}.cs-warn{color:var(--text-3)!important}
.cs-row{display:flex;gap:6px;flex-wrap:wrap}.cs-row>input,.cs-row>.secret{flex:1 1 140px;min-width:0}
.cs-get{font:500 12px/16px var(--font-ui);color:var(--accent)}.cs-st{margin:0}.cs-st.ok{color:var(--ok, #2fb170)}.cs-st.bad{color:var(--danger, #e5484d)}.cs .dlg-a{justify-content:space-between;align-items:center}`}</style>
    </div></div>, document.body);
}
