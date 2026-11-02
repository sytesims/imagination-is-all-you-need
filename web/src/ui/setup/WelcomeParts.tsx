/**
 * The first-run Welcome's parts (WelcomeSteps lays them out: How → Connect → Ready): the connection state (useWelcome), the small connect
 * forms, the Ready step and the sheet frame. Same APIs as the connect sheet:
 *  - ComfyUI: looked for on open (POST /api/local/comfy/test), saved and turned on only when picked (PUT /api/local/comfy, PUT /api/me/routing).
 *  - Keys: checked when pasted: saved (POST /api/settings/providers), then read back (GET /api/accounts?refresh=1 → keyCheck). A refused key is removed again.
 *  - The answer: PUT /api/setup {done, choices}. "Look around first" answers with what is already connected, so nothing pretends to be set up.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { navigate } from '../../platform/router';
import { setupRequest, setupBody, testedComfyUrl } from '../../shared/setupConnection';
import { plainCopy } from '../../shared/plainCopy';
import { SecretInput } from '../../shared/SecretInput';
import { refreshTools } from '../../shared/useTools';
import { refreshAccounts } from '../../shared/billing';
import { requestRequote } from '../../shared/quote';
import { setRouting } from '../../shared/models';
import { repoDoc } from '../../shared/brand';
import { CHECK } from '../../shared/checkGlyph';
import { OrbitIntro } from '../../shared/OrbitIntro';
import { MakerTile } from '../../shared/MakerTile';
import { SampleModeNote, useBackend } from '../../shared/SampleMode';
import { LaptopIcon, KeyIcon } from '../Icons';
import { DIRECT_KEYS, RUN_SETUP_TITLE, RUN_SETUP_TAGLINE, type RunChoice } from '../../shared/runChoices';
import './welcome.css';

const SEEN = 'ohf:setup:seen';
export const seen = () => { try { return localStorage.getItem(SEEN) === '1'; } catch { return false; } };
export const markSeen = () => { try { localStorage.setItem(SEEN, '1'); } catch { /* private mode */ } };

/** The card's small picture: a laptop, the Comfy maker tile, a key. */
export function ChoiceVisual({ id }: { id: RunChoice }) {
  if (id === 'comfy') return <span className="wl-vis"><MakerTile maker="comfy" title={false} /></span>;
  const G = id === 'gpu' ? LaptopIcon : KeyIcon;
  return <span className="wl-vis"><span className="wl-glyph"><G size={18} /></span></span>;
}

/** Short, plain names and one line each, for the calm Welcome. */
export const WELCOME_CHOICES: readonly { id: RunChoice; name: string; line: string }[] = [
  { id: 'gpu', name: 'Your computer', line: 'Free and private, with ComfyUI.' },
  { id: 'comfy', name: 'Comfy Cloud', line: 'One key for most models. Pay as you go.' },
  { id: 'direct', name: 'Your own keys', line: 'Use accounts you already have.' },
];
export const COMFY_KEYS_URL = 'https://platform.comfy.org/profile/api-keys';
/** "How to get it": the official ComfyUI Desktop download (Mac, Windows, Linux), not our own docs */
const SET_UP_COMFYUI = 'https://www.comfy.org/download';

export type Comfy = { state: 'looking' | 'found' | 'missing' | 'checking' | 'bad'; url?: string; version?: string | null; save?: boolean; text?: string };
export type KeyState = { state: 'checking' | 'ok' | 'bad'; text: string };
const okKey = (k?: KeyState) => k?.state === 'ok';

/** All the connection state both layouts share. Nothing is picked or saved until the person acts. */
export function useWelcome(onClose: () => void) {
  const live = useRef(true); const abort = useRef(new AbortController()); const probe = useRef(0);
  const [can, setCan] = useState<boolean | null>(null);
  const [comfy, setComfy] = useState<Comfy>({ state: 'looking' });
  const [keys, setKeys] = useState<Record<string, KeyState>>({});
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const backend = useBackend();
  const sig = () => abort.current.signal;

  const look = async () => { const id = ++probe.current; setComfy({ state: 'looking' });
    try { const t = await setupRequest('/api/local/comfy/test', setupBody('POST', {}, sig()), 'Couldn’t look for ComfyUI.');
      if (!live.current || id !== probe.current) return;
      if (!t.reachable) { setComfy({ state: 'missing' }); return; }
      setComfy({ state: 'found', url: testedComfyUrl(t.url), version: t.version ?? null, save: !!t.detected });
    } catch { if (live.current && id === probe.current) setComfy({ state: 'missing' }); } };
  const checkAddress = async (raw: string) => { const url = raw.trim(); if (!url) return; const id = ++probe.current; setComfy({ state: 'checking' });
    try { const t = await setupRequest('/api/local/comfy/test', setupBody('POST', { url }, sig()), 'Couldn’t check that address.');
      if (!live.current || id !== probe.current) return;
      if (!t.reachable) { setComfy({ state: 'bad', text: 'No answer there. Is ComfyUI open?' }); return; }
      setComfy({ state: 'found', url: testedComfyUrl(t.url), version: t.version ?? null, save: true });
    } catch (e) { if (live.current && id === probe.current) setComfy({ state: 'bad', text: (e as Error).message }); } };

  useEffect(() => {
    fetch('/api/settings/providers', { signal: sig() }).then(r => r.ok ? r.json() : null).then(d => { if (live.current) setCan(!!d?.canStoreKeys); }).catch(() => { if (live.current) setCan(false); });
    /* keys added before (Settings → Run setup again) show as added, never as a fresh check */
    fetch('/api/setup', { signal: sig() }).then(r => r.ok ? r.json() : null).then(v => { if (!live.current || !Array.isArray(v?.keys)) return;
      setKeys(k => ({ ...Object.fromEntries(v.keys.map((id: string) => [id, { state: 'ok', text: 'Added before' } as KeyState])), ...k })); }).catch(() => 0);
    void look();
    return () => { live.current = false; probe.current++; abort.current.abort(); };
  }, []);

  const lastChecked = useRef<Record<string, string>>({});
  const checkKey = async (id: string, raw: string, again = false) => { const v = raw.trim(); if (!v || (!again && lastChecked.current[id] === v)) return; lastChecked.current[id] = v;
    const set = (s: KeyState) => { if (live.current && lastChecked.current[id] === v) setKeys(k => ({ ...k, [id]: s })); };
    set({ state: 'checking', text: 'Checking…' });
    try {
      await setupRequest('/api/settings/providers', setupBody('POST', { id, key: v }, sig()), '').catch((e: Error) => { throw new Error(e.message.replace(/\s*Try again\.$/, '').trim()); });
      const a = await fetch('/api/accounts?refresh=1', { signal: sig() }).then(r => r.json()).catch(() => null);
      const acc = (a?.accounts ?? []).find((x: any) => x.provider === id);
      if (acc?.keyCheck === 'rejected') { await fetch(`/api/settings/providers/${encodeURIComponent(id)}`, { method: 'DELETE', signal: sig() }).catch(() => 0);
        set({ state: 'bad', text: 'That key wasn’t accepted. Copy it again, or make a new one.' }); return; }
      set({ state: 'ok', text: acc?.keyCheck === 'ok' && typeof acc.balanceUsd === 'number' ? `Key works · $${acc.balanceUsd.toFixed(2)} in your account` : acc?.keyCheck === 'offline' ? 'Saved. It’s checked on your first run.' : 'Key saved' });
      void refreshAccounts();
    } catch (e) { set({ state: 'bad', text: plainCopy((e as Error).message) || 'Couldn’t check that key. Try again.' }); }
  };

  const connected = (c: RunChoice) => c === 'gpu' ? comfy.state === 'found' : c === 'comfy' ? okKey(keys.comfy) : DIRECT_KEYS.some(([id]) => okKey(keys[id]));
  /** Save the picked ways that work. Returns true when saved. */
  const finish = async (picked: RunChoice[]) => { if (busy) return false; const ways = picked.filter(connected); setBusy(true); setErr('');
    try {
      if (ways.includes('gpu') && comfy.url) {
        if (comfy.save) await setupRequest('/api/local/comfy', setupBody('PUT', { url: comfy.url }, sig()), 'Couldn’t save the ComfyUI address.');
        const b = await setupRequest('/api/me/routing', { ...setupBody('PUT', { global: { useLocal: true } }, sig()), headers: { 'content-type': 'application/json', 'x-openhiggsfield-source': 'web first-run' } }, 'Couldn’t turn on ComfyUI.'); setRouting(b);
      }
      await setupRequest('/api/setup', setupBody('PUT', { done: true, choices: ways }, sig()), 'Couldn’t save your setup.');
      if (!live.current) return false; markSeen(); refreshTools(); void refreshAccounts(); requestRequote(); return true;
    } catch (e) { if (live.current) setErr((e as Error).message); return false; } finally { if (live.current) setBusy(false); } };
  /** "Look around first": keys pasted so far are already saved, so say so; ComfyUI stays off until picked. */
  const skip = () => { markSeen(); const ways = (['comfy', 'direct'] as RunChoice[]).filter(connected);
    void fetch('/api/setup', setupBody('PUT', { done: true, choices: ways })).catch(() => undefined); if (ways.length) { refreshTools(); requestRequote(); } onClose(); };
  return { can, comfy, setComfy, look, checkAddress, keys, checkKey, connected, finish, skip, busy, err, backend };
}
export type Welcome = ReturnType<typeof useWelcome>;

/** Quiet status line: a spinner while it works, a tick when it works, a short reason when it doesn't. */
export function Status({ kind, children, testId }: { kind: 'busy' | 'ok' | 'bad' | 'calm'; children: ReactNode; testId?: string }) {
  return <p className={`wl-status wl-${kind}`} role="status" data-testid={testId}>{kind === 'busy' ? <span className="as-spin" aria-hidden /> : kind === 'ok' ? <span className="wl-tick" aria-hidden>{CHECK}</span> : null}<span>{children}</span></p>;
}

/** Your computer: the automatic look, the result, and the address field only behind "Use a different address". */
export function ComfyForm({ w }: { w: Welcome }) {
  const [other, setOther] = useState(false); const [addr, setAddr] = useState('');
  const c = w.comfy; const busy = c.state === 'looking' || c.state === 'checking';
  return <div className="wl-form" data-testid="wl-gpu">
    {c.state === 'looking' ? <Status kind="busy">Looking for ComfyUI on this computer…</Status>
      : c.state === 'found' ? <Status kind="ok" testId="wl-gpu-found">Found ComfyUI{c.version ? ` ${c.version}` : ''}</Status>
      : c.state === 'missing' ? <><Status kind="calm" testId="wl-gpu-missing">ComfyUI isn’t open on this computer.</Status>
        <p className="wl-hint">Open ComfyUI, then <button type="button" className="wl-link" onClick={() => void w.look()} data-testid="wl-look-again">look again</button>. <a className="wl-link" href={SET_UP_COMFYUI} target="_blank" rel="noreferrer">How to get it ↗</a></p></> : null}
    {!other ? (c.state !== 'looking' && <button type="button" className="wl-link wl-other" onClick={() => setOther(true)} data-testid="wl-other-addr">Use a different address</button>)
      : <form className="wl-row" onSubmit={e => { e.preventDefault(); void w.checkAddress(addr); }}>
        <label className="wl-field"><span>ComfyUI address</span><input type="url" value={addr} placeholder="http://127.0.0.1:8188" autoFocus onChange={e => { setAddr(e.target.value); if (c.state === 'bad') w.setComfy({ state: 'missing' }); }} data-testid="wl-addr" /></label>
        <button type="submit" className="btn btn-sm" disabled={!addr.trim() || busy}>{c.state === 'checking' ? 'Checking…' : 'Check'}</button></form>}
    {c.state === 'checking' && <Status kind="busy">Checking that address…</Status>}
    {c.state === 'bad' && <Status kind="bad" testId="wl-gpu-bad">{c.text}</Status>}
  </div>;
}

/** One key field that checks itself when a key is pasted (or on Enter / leaving the field). */
export function KeyField({ w, id, label, getUrl, autoFocus }: { w: Welcome; id: string; label: string; getUrl?: string; autoFocus?: boolean }) {
  const [v, setV] = useState(''); const st = w.keys[id]; const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (st && st.state !== 'checking') ref.current?.scrollIntoView({ block: 'nearest' }); }, [st?.state]); /* a short window: keep the answer in view */
  return <div className="wl-key" ref={ref}>
    <label className="wl-field"><span className="wl-label">{label}{getUrl && <a className="wl-link" href={getUrl} target="_blank" rel="noreferrer">Get a key ↗</a>}</span>
      <SecretInput placeholder={st?.state === 'ok' ? 'Paste a new key to replace it' : 'Paste your key'} value={v} autoFocus={autoFocus} disabled={w.can === false}
        aria-invalid={st?.state === 'bad' || undefined} className={st?.state === 'bad' ? 'bad' : st?.state === 'ok' ? 'ok' : ''}
        onChange={e => setV(e.target.value)} onPaste={e => { const t = e.clipboardData.getData('text'); if (t.trim()) { e.preventDefault(); setV(t.trim()); void w.checkKey(id, t); } }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void w.checkKey(id, v, true); } }} onBlur={() => void w.checkKey(id, v)} data-testid={`wl-key-${id}`} /></label>
    {st && <Status kind={st.state === 'checking' ? 'busy' : st.state === 'ok' ? 'ok' : 'bad'} testId={`wl-key-${id}-status`}>{st.text}</Status>}
  </div>;
}
const NoStore = () => <Status kind="calm">Keys can be added here only when the app runs on this computer. Add them in the app’s settings file instead.</Status>;

export function CloudForm({ w }: { w: Welcome }) {
  return <div className="wl-form" data-testid="wl-comfy">{w.can === false ? <NoStore /> : <KeyField w={w} id="comfy" label="Comfy API key" getUrl={COMFY_KEYS_URL} />}</div>;
}
/** Your own keys: one provider at a time (chips), so eight empty boxes never show at once. */
export function OwnKeysForm({ w }: { w: Welcome }) {
  const [p, setP] = useState<string | null>(null); const name = DIRECT_KEYS.find(([id]) => id === p)?.[1];
  return <div className="wl-form" data-testid="wl-direct">{w.can === false ? <NoStore /> : <>
    <p className="wl-hint">Pick an account to add its key.</p>
    <div className="wl-chips" role="group" aria-label="Accounts">{DIRECT_KEYS.map(([id, l]) => { const ok = w.keys[id]?.state === 'ok';
      return <button key={id} type="button" className={`chip${p === id ? ' on' : ''}${ok ? ' ok' : ''}`} aria-pressed={p === id} onClick={() => setP(id)} data-testid={`wl-chip-${id}`}>{ok && <span className="wl-tick" aria-hidden>{CHECK}</span>}{l}</button>; })}</div>
    {p && <KeyField key={p} w={w} id={p} label={`${name} key`} autoFocus />}</>}
  </div>;
}
export const FORMS: Record<RunChoice, (p: { w: Welcome }) => ReactNode> = { gpu: ComfyForm, comfy: CloudForm, direct: OwnKeysForm };

/** The last step: what works now and one thing to try first. */
export function Ready({ w, ways }: { w: Welcome; ways: RunChoice[] }) {
  return <div className="wl-ready" data-testid="wl-ready">
    <ul className="wl-done">{ways.map(id => { const c = WELCOME_CHOICES.find(x => x.id === id)!;
      return <li key={id}><ChoiceVisual id={id} /><span><b>{c.name}</b><small>{id === 'gpu' ? 'Free runs on this computer' : 'You see the price before every run'}</small></span><span className="wl-tick" aria-hidden>{CHECK}</span></li>; })}</ul>
    <div className="wl-try"><b>Try this first</b><span>Describe a picture in one sentence, like “a cozy cabin in the snow at night”.</span></div>
    {w.backend === 'mock' && <SampleModeNote saved testId="wl-sample-note" />}
  </div>;
}
export const tryFirst = (close: () => void) => () => { close(); navigate('/image'); };

/** The sheet frame both layouts use: header, a body that scrolls on its own, and a footer that never covers it. Escape = Look around first. */
export function Sheet({ w, step, view, body, foot, label, testId }: { w: Welcome; step?: ReactNode; view: string; body: ReactNode; foot: ReactNode; label: string; testId: string }) {
  const box = useRef<HTMLDivElement>(null); const back = useRef<HTMLElement | null>(null); const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); if (!box.current?.contains(document.activeElement)) box.current?.focus({ preventScroll: true }); }, [view]); /* each step starts at its top, focus stays in the sheet (Escape, Tab) */
  useEffect(() => { back.current = document.activeElement as HTMLElement; requestAnimationFrame(() => box.current?.focus({ preventScroll: true })); /* the sheet itself, so no card looks picked */ return () => back.current?.focus?.(); }, []);
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); w.skip(); return; }
    if (e.key === 'Tab') { const f = [...(box.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]') ?? [])]; if (!f.length) return; const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } } };
  return createPortal(<div className="dlg-scrim wl-scrim" onKeyDown={onKey}>
    <div ref={box} className="dlg wl-sheet" tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} data-testid={testId}>
      <header className="wl-head"><OrbitIntro size={28} /><div><h2>{RUN_SETUP_TITLE}</h2><p>{RUN_SETUP_TAGLINE}</p></div>{step}</header>
      <div ref={scroller} className="wl-body">{body}{w.err && <Status kind="bad" testId="wl-error">{w.err}</Status>}</div>
      <footer className="wl-foot">{foot}</footer>
    </div></div>, document.body);
}
/** The orange button, at a calm size. */
export function Primary({ children, onClick, disabled, busy, testId }: { children: ReactNode; onClick: () => void; disabled?: boolean; busy?: boolean; testId: string }) {
  return <button type="button" className="gen-btn wl-go" disabled={disabled || busy} aria-busy={busy || undefined} onClick={onClick} data-testid={testId}><span className="gen-l">{busy ? <><span className="as-spin" aria-hidden />Saving…</> : children}</span></button>;
}
export const LookAround = ({ w }: { w: Welcome }) => <button type="button" className="wl-link wl-skip" onClick={w.skip} data-testid="wl-skip">Look around first</button>;
