/**
 * The one "find your ComfyUI" form (Windows setup PR 1, 2026-11-02), used by the Welcome, the connect sheet, Settings → Your computer and
 * Connections. It looks on its own (POST /api/local/comfy/test: the saved address, else ports 8188, 8000, 8189-8191) and, while ComfyUI
 * isn't found, looks again every few seconds so a ComfyUI that starts later shows up without a reload (stops when found, hidden or closed).
 * Never a dead end: Look again, Get ComfyUI, another address, and (where the host offers it) Use Comfy Cloud instead.
 * The host decides what "use it" means (save the address, turn on local runs) through onUse; nothing is saved here.
 */
import { useEffect, useRef, useState } from 'react';
import { setupRequest, setupBody, testedComfyUrl } from './setupConnection';
import { plainCopy } from './plainCopy';
import { CHECK } from './checkGlyph';
import { getComfyFor, COMFY_DOWNLOAD_URL, type HostInfo } from '../../../server/src/shared/getComfy';
import './comfyConnect.css';

/** The official ComfyUI download page (the per-platform choice is getComfyFor). */
export const GET_COMFYUI_URL = COMFY_DOWNLOAD_URL;
/** How often to look again while ComfyUI isn't found (light: a closed port answers at once). */
export const LOOK_EVERY_MS = 5000;

export type ComfyHit = { url: string; version: string | null };
export type ComfyLook = { state: 'looking' | 'found' | 'missing' | 'checking' | 'bad'; url?: string; version?: string | null;
  /** a new address (found on a usual port, or typed): the host saves it when the person uses it */ save?: boolean;
  /** the saved address that stopped answering, when ComfyUI was found on another port */ movedFrom?: string | null; alsoFound?: ComfyHit[]; text?: string };

const portOf = (u?: string | null) => { try { const x = new URL(String(u)); return x.port || (x.protocol === 'https:' ? '443' : '80'); } catch { return ''; } };
const hostOf = (u?: string | null) => { try { return new URL(String(u)).host; } catch { return String(u ?? ''); } };

/** The look and its state. auto: look on mount, then again every few seconds while it isn't found. */
export function useComfyConnect({ auto = true }: { auto?: boolean } = {}) {
  const [look, setLook] = useState<ComfyLook>({ state: auto ? 'looking' : 'missing' }); const [host, setHost] = useState<HostInfo | null>(null);
  const live = useRef(true); const abort = useRef(new AbortController()); const probe = useRef(0); const busy = useRef(false);
  const sig = () => abort.current.signal;
  /** quiet: a background look (keeps the current words until something changes) */
  const find = async (quiet = false) => { if (quiet && busy.current) return; const id = ++probe.current; busy.current = true; if (!quiet) setLook({ state: 'looking' });
    try { const t = await setupRequest('/api/local/comfy/test', setupBody('POST', {}, sig()), 'Couldn’t look for ComfyUI.');
      if (!live.current || id !== probe.current) return; if (t.host?.platform) setHost(t.host);
      if (!t.reachable) { setLook(l => (quiet && l.state === 'missing' ? l : { state: 'missing' })); return; }
      setLook({ state: 'found', url: testedComfyUrl(t.url), version: t.version ?? null, save: !!t.detected, movedFrom: t.movedFrom ?? null,
        alsoFound: Array.isArray(t.alsoFound) ? t.alsoFound.filter((h: any) => typeof h?.url === 'string').map((h: any) => ({ url: String(h.url), version: h.version ?? null })) : [] });
    } catch { if (live.current && id === probe.current && !quiet) setLook({ state: 'missing' }); } finally { busy.current = false; } };
  const check = async (raw: string) => { const url = raw.trim(); if (!url) return; const id = ++probe.current; setLook({ state: 'checking' });
    try { const t = await setupRequest('/api/local/comfy/test', setupBody('POST', { url }, sig()), 'Couldn’t check that address.');
      if (!live.current || id !== probe.current) return;
      if (!t.reachable) { setLook({ state: 'bad', text: 'No answer there. Is ComfyUI open, and is the port right?' }); return; }
      setLook({ state: 'found', url: testedComfyUrl(t.url), version: t.version ?? null, save: true });
    } catch (e) { if (live.current && id === probe.current) setLook({ state: 'bad', text: plainCopy((e as Error).message) }); } };
  /** Pick another ComfyUI that also answers (two installs, or two ports). */
  const pick = (h: ComfyHit) => setLook(l => ({ state: 'found', url: h.url, version: h.version, save: true, alsoFound: [...(l.url ? [{ url: l.url, version: l.version ?? null }] : []), ...(l.alsoFound ?? []).filter(x => x.url !== h.url)] }));

  useEffect(() => { live.current = true; if (auto) void find(); return () => { live.current = false; probe.current++; abort.current.abort(); abort.current = new AbortController(); }; }, []);
  /* ComfyUI not found: look again quietly every few seconds while the page is visible, so a ComfyUI that starts now is noticed */
  useEffect(() => { if (!auto || look.state !== 'missing') return;
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') void find(true); }, LOOK_EVERY_MS); return () => clearInterval(t); }, [auto, look.state]);
  return { look, set: setLook, find, check, pick, host };
}
export type ComfyConnectState = ReturnType<typeof useComfyConnect>;

function Line({ kind, children, testId }: { kind: 'busy' | 'ok' | 'bad' | 'calm'; children: React.ReactNode; testId?: string }) {
  return <p className={`cc-line cc-${kind}`} role="status" data-testid={testId}>{kind === 'busy' ? <span className="as-spin" aria-hidden /> : kind === 'ok' ? <span className="cc-tick" aria-hidden>{CHECK}</span> : null}<span>{children}</span></p>;
}

type Props = { c: ComfyConnectState;
  /** "Use Comfy Cloud instead" (the Welcome): switches the person's pick */ onCloud?: () => void;
  /** the host's action for a found ComfyUI (save the address, turn on local runs) */ onUse?: (l: ComfyLook) => void | Promise<void>; useLabel?: string;
  /** show onUse only for a new address (Settings: a saved address that answers needs nothing) */ useOnlyIfNew?: boolean; useBusy?: boolean;
  /** false: the server isn't on this computer, so the address can't be changed from here */ canChange?: boolean };

/** The form: what was found (or not), and the next steps. */
export function ComfyConnect({ c, onCloud, onUse, useLabel = 'Use this ComfyUI', useOnlyIfNew, useBusy, canChange = true }: Props) {
  const [other, setOther] = useState(false); const [addr, setAddr] = useState(''); const l = c.look;
  const busy = l.state === 'looking' || l.state === 'checking';
  const showUse = !!onUse && l.state === 'found' && (!useOnlyIfNew || l.save) && canChange; const get = getComfyFor(c.host);
  return <div className="cc" data-testid="cc">
    {l.state === 'looking' && <Line kind="busy" testId="cc-looking">Looking for ComfyUI on this computer…</Line>}
    {l.state === 'found' && <>
      <Line kind="ok" testId="cc-found">Found ComfyUI{l.version ? ` ${l.version}` : ''}{l.url ? ` at ${hostOf(l.url)}` : ''}</Line>
      {l.movedFrom && <p className="cc-hint" data-testid="cc-moved">It used to answer at {hostOf(l.movedFrom)}. Use the new port {portOf(l.url)}?</p>}
      {!!l.alsoFound?.length && <div className="cc-also" data-testid="cc-also"><span className="cc-hint">Also open on this computer:</span>
        {l.alsoFound.map(h => <button key={h.url} type="button" className="btn btn-sm btn-ghost" onClick={() => c.pick(h)} data-testid="cc-pick">Port {portOf(h.url)}{h.version ? ` · ${h.version}` : ''}</button>)}</div>}
      {showUse && <div className="cc-acts"><button type="button" className="btn btn-sm" disabled={useBusy} aria-busy={useBusy || undefined} onClick={() => void onUse!(l)} data-testid="cc-use">{useBusy ? 'Saving…' : useLabel}</button></div>}
    </>}
    {l.state === 'missing' && <>
      <Line kind="calm" testId="cc-missing">ComfyUI isn’t open on this computer yet.</Line>
      <p className="cc-hint" data-testid="cc-auto">The app checks again every few seconds, so you can open it now.</p>
      <div className="cc-acts">
        <button type="button" className="btn btn-sm" onClick={() => void c.find()} data-testid="cc-look-again">It’s open now, check again</button>
        {get.url && <a className="btn btn-sm btn-ghost" href={get.url} target="_blank" rel="noreferrer" data-testid="cc-get">{get.label}</a>}
        {onCloud && <button type="button" className="btn btn-sm btn-ghost" onClick={onCloud} data-testid="cc-cloud">Use Comfy Cloud instead</button>}
      </div>
      {get.note && <p className="cc-hint" data-testid="cc-get-note">{get.note}</p>}
      {get.help.length > 0 && <div className="cc-hint cc-new" data-testid="cc-desktop-help"><span>Just installed ComfyUI Desktop?</span>{get.help.map(x => <span key={x} className="cc-help-line">{x}</span>)}</div>}
    </>}
    {canChange && (!other ? (l.state !== 'looking' && l.state !== 'checking' && <button type="button" className="cc-link" onClick={() => setOther(true)} data-testid="cc-other-addr">Use another address</button>)
      : <form className="cc-row ls-comfy-row" onSubmit={e => { e.preventDefault(); void c.check(addr); }}>
        <label className="cc-field"><span>ComfyUI address</span><input type="url" inputMode="url" value={addr} placeholder="http://127.0.0.1:8188" autoFocus aria-describedby="cc-port-hint"
          onChange={e => { setAddr(e.target.value); if (l.state === 'bad') c.set({ state: 'missing' }); }} data-testid="cc-addr" /></label>
        <button type="submit" className="btn btn-sm" disabled={!addr.trim() || busy} data-testid="cc-check">{l.state === 'checking' ? 'Checking…' : 'Check'}</button>
        <small className="cc-hint" id="cc-port-hint">ComfyUI Desktop shows its address in its menu: ⋮ → Manage → About.</small></form>)}
    {l.state === 'checking' && <Line kind="busy">Checking that address…</Line>}
    {l.state === 'bad' && <Line kind="bad" testId="cc-bad">{l.text}</Line>}
  </div>;
}
