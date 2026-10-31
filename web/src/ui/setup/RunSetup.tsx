/**
 * First-run setup (MODEL-ROUTE-SPEC §2.5): "Welcome to Imagination", then "How would you like to start?" (card copy: shared/runChoices.ts). Shown once, on a first visit when nothing is set up yet
 * (GET /api/setup → suggest), and again from Settings → Connections → "Run setup again". Never blocks the app: "Skip for now" and Escape
 * close it. It writes the same settings as Connections: keys (POST /api/settings/providers, only when the server runs on this computer),
 * Local (PUT /api/me/routing global.useLocal) and the answer itself (PUT /api/setup). Remembered in localStorage too (try/catch).
 */
import { Notice } from '../../shared/Notice';
import { setupRequest, setupBody, testedComfyUrl } from '../../shared/setupConnection';
import { SampleModeNote, useBackend } from '../../shared/SampleMode';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from '../../platform/router';
import { plainCopy } from '../../shared/plainCopy';
import { refreshTools } from '../../shared/useTools';
import { refreshAccounts, useAccounts } from '../../shared/billing';
import { requestRequote } from '../../shared/quote';
import { setRouting } from '../../shared/models';
import { repoDoc } from '../../shared/brand';
import { getHardware, type Hardware } from '../../shared/hardware';
import { RUN_CHOICES, RUN_SETUP_TITLE, RUN_SETUP_TAGLINE, RUN_SETUP_QUESTION, RUN_SETUP_NOTE, RUN_SETUP_GO, RUN_SETUP_SKIP, isRunChoice, choicesForSetup, choiceStatus, STATUS_TAG, DIRECT_KEYS, type RunChoice, type SetupFacts } from '../../shared/runChoices';
import { OrbitIntro } from '../../shared/OrbitIntro';
import { MakerTile } from '../../shared/MakerTile';
import { Waveform, fallbackPeaks } from '../../shared/Waveform';
import { LaptopIcon, KeyIcon } from '../Icons';
import { SHOWCASE_HERO, SHOWCASE_GALLERY, showcaseById } from '../../../../server/src/shared/showcase';
import { THREE_D_SHOWCASE } from '../../../../server/src/shared/threeD';

const OPEN_EVT = 'ohf:run-setup'; const SEEN = 'ohf:setup:seen';
export const openRunSetup = () => { try { dispatchEvent(new Event(OPEN_EVT)); } catch { /* ignore */ } };
const seen = () => { try { return localStorage.getItem(SEEN) === '1'; } catch { return false; } };
const markSeen = () => { try { localStorage.setItem(SEEN, '1'); } catch { /* private mode */ } };
type Choice = RunChoice;
/** Our own showcase results (SHOWCASE_HERO first), two Scenario 3D stills (as on the 3D tab) and a waveform: the living background. */
const heroThumbs = SHOWCASE_HERO.map(id => showcaseById(id)).filter(Boolean).map(s => ({ src: s!.thumb, alt: s!.name }));
const moreThumbs = SHOWCASE_GALLERY.filter(id => !SHOWCASE_HERO.includes(id)).slice(0, 3).map(id => showcaseById(id)).filter(Boolean).map(s => s!.thumb);
type Tile = { kind: 'img'; src: string } | { kind: '3d'; src: string } | { kind: 'wave' };
const TILES: Tile[] = [
  ...heroThumbs.slice(0, 2).map(t => ({ kind: 'img' as const, src: t.src })), { kind: '3d', src: THREE_D_SHOWCASE[0].preview }, { kind: 'wave' },
  ...heroThumbs.slice(2).map(t => ({ kind: 'img' as const, src: t.src })), ...moreThumbs.slice(0, 2).map(src => ({ kind: 'img' as const, src })),
  { kind: '3d', src: THREE_D_SHOWCASE[5].preview }, ...moreThumbs.slice(2).map(src => ({ kind: 'img' as const, src })), { kind: 'wave' }];
const WAVE = fallbackPeaks(28);
/** The card's small picture: three sample thumbnails, a laptop, the Comfy maker tile, a key. */
function Visual({ id }: { id: Choice }) {
  if (id === 'comfy') return <span className="rs-vis"><MakerTile maker="comfy" title={false} /></span>;
  const G = id === 'gpu' ? LaptopIcon : KeyIcon;
  return <span className="rs-vis"><span className="rs-glyph"><G size={18} /></span></span>;
}
/** Slow-drifting, blurred strip behind the cards. Paused under reduced motion (CSS) and while the tab is hidden. */
function Drift() {
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  useEffect(() => { const f = () => setHidden(document.hidden); document.addEventListener('visibilitychange', f); return () => document.removeEventListener('visibilitychange', f); }, []);
  const row = (k: string) => TILES.map((t, i) => <span key={`${k}${i}`} className={`rs-dt rs-dt-${t.kind}`}>{t.kind === 'wave' ? <Waveform bars={WAVE} time={0} duration={0} decorative />
    : <img src={t.src} alt="" loading="lazy" decoding="async" onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} />}</span>);
  return <div className={`rs-drift${hidden ? ' paused' : ''}`} aria-hidden data-testid="setup-drift"><div className="rs-drift-track">{row('a')}{row('b')}</div></div>;
}

/** Mounted once (App): opens itself on a first visit, with ?setup=1 (the link `npm run setup` prints), or when openRunSetup() is called. */
export function RunSetupHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => { const f = () => setOpen(true); addEventListener(OPEN_EVT, f); return () => removeEventListener(OPEN_EVT, f); }, []);
  useEffect(() => { try { if (new URLSearchParams(location.search).get('setup')) { setOpen(true); return; } } catch { /* */ } // npm run setup prints …/?setup=1
    if (seen() || /^\/(share|jobs)\//.test(location.pathname)) return; let live = true;
    fetch('/api/setup').then(r => r.ok ? r.json() : null).then(s => { if (!live || !s) return; if (s.done) { markSeen(); return; } if (s.suggest) setOpen(true); }).catch(() => 0);
    return () => { live = false; }; }, []);
  return open ? <RunSetup onClose={() => setOpen(false)} /> : null;
}

function RunSetup({ onClose }: { onClose: () => void }) {
  const [pick, setPick] = useState<Set<Choice>>(() => new Set<Choice>()); const [saved, setSaved] = useState<Omit<SetupFacts, 'comfyReach' | 'keyChecks'> | null>(null); const [reach, setReach] = useState<boolean | null>(null); const [can, setCan] = useState<boolean | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({}); const [gpu, setGpu] = useState<{ busy: boolean; ok?: boolean; t?: string; url?: string; save?: boolean }>({ busy: false });
  const [addr, setAddr] = useState(''); const live = useRef(true); const probe = useRef(0); const edited = useRef(false); const saving = useRef(false);
  const abort = useRef(new AbortController()); const savedKeys = useRef<Record<string, string>>({});
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [closing, setClosing] = useState(false);
  /* sample mode (mock backend): saving a key or finding ComfyUI doesn't make real results until a restart, so say so before closing */
  const backend = useBackend(); const [nextStep, setNextStep] = useState(false);
  useEffect(() => { if (!nextStep) return; requestAnimationFrame(() => { box.current?.querySelector('.rs-foot')?.scrollIntoView({ block: 'end', behavior: 'smooth' }); box.current?.querySelector<HTMLElement>('[data-testid=setup-done]')?.focus({ preventScroll: true }); }); }, [nextStep]);
  const box = useRef<HTMLDivElement>(null); const back = useRef<HTMLElement | null>(null);
  useEffect(() => { if (err && box.current) { const body = box.current.querySelector('.rs-body'); if (body) body.scrollTop = body.scrollHeight; } }, [err]);
  useEffect(() => { back.current = document.activeElement as HTMLElement; requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus());
    fetch('/api/settings/providers', { signal: abort.current.signal }).then(r => r.ok ? r.json() : null).then(d => { if (live.current) setCan(!!d?.canStoreKeys); }).catch(() => { if (live.current) setCan(false); });
    /* start from the real setup (a Comfy key, your ComfyUI, both), plus what was picked last time; nothing is pre-picked on a fresh install.
       The badges come from what works now (choiceStatus): the ComfyUI check below and the key checks in /api/accounts. */
    fetch('/api/setup', { signal: abort.current.signal }).then(r => r.ok ? r.json() : null).then(v => { if (!live.current) return; const real = choicesForSetup(v?.setup);
      const list = (x: unknown) => (Array.isArray(x) ? x.map(String) : []); const choices = list(v?.choices); setSaved({ choices, keys: list(v?.keys), useLocal: !!v?.useLocal, setup: v?.setup });
      if (real.includes('gpu') || choices.includes('gpu') || v?.useLocal) void testGpu(); // the Your computer badge needs a fresh check, picked or not
      if (edited.current) return;
      const c: Choice[] = [...new Set([...real, ...(Array.isArray(v?.choices) ? v.choices.filter(isRunChoice) : [])])]; if (!c.length) return;
      setPick(new Set(c)); }).catch(() => 0);
    return () => { live.current = false; probe.current++; abort.current.abort(); }; }, []);
  const close = () => { live.current = false; probe.current++; abort.current.abort(); setClosing(true); setTimeout(() => { onClose(); back.current?.focus?.(); }, 140); };
  const answer = async (choices: Choice[]) => { await setupRequest('/api/setup', setupBody('PUT', { done: true, choices }, abort.current.signal), 'Couldn’t save setup.'); if (live.current) markSeen(); };
  // Skip is an explicit browser opt-out, not a claim that any connection was configured.
  const skip = () => { markSeen(); void fetch('/api/setup', setupBody('PUT', { done: true, choices: [] })).catch(() => undefined); close(); };
  const toggle = (c: Choice) => { if (busy || nextStep) return; edited.current = true; const n = new Set(pick); added.current = n.has(c) ? null : c; if (n.has(c)) { n.delete(c); if (c === 'gpu') { probe.current++; setGpu({ busy: false }); } } else { n.add(c); if (c === 'gpu') void testGpu(); } setPick(n); };
  const [hw, setHw] = useState<Hardware | null>(null);
  useEffect(() => { if (!pick.has('gpu') || !gpu.ok || hw) return; let active = true; void getHardware().then((r) => { if (active && live.current && r.ok) setHw(r.data); }); return () => { active = false; }; }, [pick, gpu.ok, hw]);
  const testGpu = async () => { const id = ++probe.current; const entered = addr.trim(); setGpu({ busy: true }); try {
    const j = await setupRequest('/api/local/comfy/test', setupBody('POST', entered ? { url: entered } : {}, abort.current.signal), 'Couldn’t test ComfyUI.');
    if (live.current && (j.reachable || !entered)) setReach(!!j.reachable); // the badge: does ComfyUI answer right now (a mistyped address doesn't count against the saved one)
    if (!live.current || id !== probe.current) return;
    if (!j.reachable) throw new Error(plainCopy(String(j.error ?? 'ComfyUI isn’t reachable yet. Start it, then look again.')));
    const url = testedComfyUrl(j.url);
    setGpu({ busy: false, ok: true, url, save: !!entered || !!j.detected, t: `Found ComfyUI${j.version ? ` ${j.version}` : ''} at ${url}. Models that fit will run here for free.` }); }
    catch (e) { if (live.current && id === probe.current) setGpu({ busy: false, ok: false, t: (e as Error).message }); if (live.current && !entered) setReach(r => r ?? false); } };
  const finish = async () => { if (saving.current) return; if (pick.has('gpu') && (!gpu.ok || !gpu.url)) { setErr('Test your ComfyUI address before continuing, or deselect this option.'); return; } saving.current = true; setBusy(true); setErr('');
    try {
      const want: [string, string][] = []; if (pick.has('comfy') && keys.comfy?.trim()) want.push(['comfy', keys.comfy.trim()]); if (pick.has('direct')) for (const [id] of DIRECT_KEYS) if (keys[id]?.trim()) want.push([id, keys[id].trim()]);
      for (const [id, key] of want) { if (savedKeys.current[id] === key) continue; await setupRequest('/api/settings/providers', setupBody('POST', { id, key }, abort.current.signal), `Couldn’t save the ${id} key.`); savedKeys.current[id] = key; }
      if (pick.has('gpu') && gpu.ok) {
        if (gpu.save) await setupRequest('/api/local/comfy', setupBody('PUT', { url: gpu.url }, abort.current.signal), 'Couldn’t save the ComfyUI address.');
        const b = await setupRequest('/api/me/routing', { ...setupBody('PUT', { global: { useLocal: true } }, abort.current.signal), headers: { 'content-type': 'application/json', 'x-openhiggsfield-source': 'web first-run' } }, 'Couldn’t enable ComfyUI routing.'); setRouting(b);
      }
      await answer([...pick]); if (!live.current) return; if (want.length || pick.has('gpu')) { refreshTools(); void refreshAccounts(); requestRequote(); }
      if (backend === 'mock' && (want.length || (pick.has('gpu') && gpu.ok))) { setNextStep(true); return; } close();
    } catch (e) { if (live.current) setErr((e as Error).message); } finally { saving.current = false; if (live.current) setBusy(false); } };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); skip(); return; }
    if (e.key === 'Tab') { const f = [...(box.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]') ?? [])]; if (!f.length) return; const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } } };
  const keyField = (id: string, label: string) => <label key={id} className="rs-key"><span>{label}{label.endsWith(' API') ? ' key' : ' API key'}</span><input type="password" disabled={busy || nextStep} autoComplete="off" spellCheck={false} placeholder="Paste your key" value={keys[id] ?? ''} onChange={e => setKeys(k => ({ ...k, [id]: e.target.value }))} data-testid={`setup-key-${id}`} /></label>;
  const acc = useAccounts();
  const facts: SetupFacts | null = saved && { ...saved, comfyReach: reach, keyChecks: acc ? Object.fromEntries(acc.accounts.map(a => [a.provider, a.keyCheck])) : null };
  /* the details sit in one fixed-height area (CSS .rs-details) so the sheet never changes size; a newly opened box scrolls into view inside it */
  const details = useRef<HTMLDivElement>(null); const added = useRef<Choice | null>(null);
  useEffect(() => { const c = added.current; added.current = null; const el = c && details.current?.querySelector<HTMLElement>(`[data-testid=setup-${c}]`); if (!el || !details.current) return;
    const d = details.current; const top = el.offsetTop - d.offsetTop; const want = Math.min(top, Math.max(d.scrollTop, top + el.offsetHeight - d.clientHeight)); // as little as needed to show it whole
    if (want !== d.scrollTop) d.scrollTo({ top: want, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }, [pick]);
  const noStore = can === false && <p className="helper rs-note">Keys can be saved from the browser only when the server runs on this computer. <Link to={repoDoc('docs/CONFIGURATION.md', 'provider-keys')}>How to add a key on the server ↗</Link></p>;
  return createPortal(<div className={`dlg-scrim rs-scrim${closing ? ' out' : ''}`} onMouseDown={e => e.target === e.currentTarget && skip()} onKeyDown={onKey}>
    <div ref={box} className="dlg rs-sheet" role="dialog" aria-modal="true" aria-labelledby="rs-h" aria-describedby="rs-sub" data-testid="run-setup">
      <Drift />
      <header className="rs-hero"><OrbitIntro size={40} /><div><h2 id="rs-h">{RUN_SETUP_TITLE}</h2><p className="rs-tagline">{RUN_SETUP_TAGLINE}</p></div></header>
      <div className="rs-body">
      <div className="rs-q"><h3 id="rs-q">{RUN_SETUP_QUESTION}</h3><p id="rs-sub" className="rs-sub">{RUN_SETUP_NOTE}</p></div>
      <div className="rs-opts" role="group" aria-labelledby="rs-q">{RUN_CHOICES.map((o, i) => { const on = pick.has(o.id);
        return <button key={o.id} type="button" className={`rs-oc${on ? ' on' : ''}`} aria-pressed={on} data-testid={`setup-opt-${o.id}`} data-autofocus={i === 0 ? true : undefined} onClick={() => toggle(o.id)}>
          <span className="rs-top"><Visual id={o.id} /></span><span className="rs-choice-copy"><b>{o.id === 'gpu' ? 'Run models on your computer' : o.title}</b><small>{o.id === 'gpu' ? 'Use local models through ComfyUI. Connect your existing installation or see how to set one up.' : o.id === 'comfy' ? 'Run models without a local GPU. One key, billed to your Comfy account.' : 'Connect supported providers with keys from your own accounts.'}</small></span>{(() => { const st = facts && choiceStatus(o.id, facts);
            return <span className={`rs-tag${st ? ' has-status' : ''}`}>{st ? <span className={`rs-rec rs-st-${st}`} data-testid={`setup-status-${o.id}`} data-status={st}>{STATUS_TAG[st]}</span> : on ? 'Selected' : 'Choose'}</span>; })()}</button>; })}</div>
      <div ref={details} className="rs-details" data-testid="setup-details">{!pick.size && <p className="helper rs-empty">Pick one or more ways above to see what each needs.</p>}
      {pick.has('gpu') && <div className="rs-more" style={{ overflowWrap: 'anywhere' }} data-testid="setup-gpu">{gpu.busy ? <p className="helper">Looking for ComfyUI…</p> : gpu.ok ? <><p className="helper rs-ok" role="status">{gpu.t}</p>{hw && <MachineLine hw={hw} />}</>
        : <p className="helper" role="status">{gpu.t ?? ''} <Link to={repoDoc('docs/LOCAL-MODELS-AND-HARDWARE.md')}>How to set up ComfyUI ↗</Link></p>}
        <div className="rs-keyrow"><label className="rs-key"><span>ComfyUI address</span><input type="url" value={addr} disabled={busy || nextStep} placeholder="http://127.0.0.1:8188" data-testid="setup-addr" onChange={e => { probe.current++; setAddr(e.target.value); setGpu({ busy: false }); }} /></label>
        <button type="button" className="btn btn-sm rs-check" disabled={gpu.busy || busy || nextStep} onClick={() => void testGpu()}>{gpu.busy ? 'Checking…' : 'Check connection'}</button></div><p className="helper">We look for ComfyUI automatically. Enter its address if it isn’t found.</p></div>}
      {pick.has('comfy') && <div className="rs-more" data-testid="setup-comfy">{can ? <div className="rs-keyrow">{keyField('comfy', 'Comfy')}<a className="btn btn-sm rs-get" href="https://platform.comfy.org/profile/api-keys" target="_blank" rel="noreferrer">Get a key ↗</a></div> : noStore}</div>}
      {pick.has('direct') && <div className="rs-more" data-testid="setup-direct"><p className="helper">Add keys for the accounts you use. Leave the rest empty.</p>{can ? <div className="rs-keygrid">{DIRECT_KEYS.map(([id, l]) => keyField(id, l))}</div> : noStore}</div>}
      </div>
      {err && <Notice as="p" kind="error" tone="line" testId="setup-error">{err}</Notice>}
      {nextStep && <SampleModeNote saved testId="setup-next-step" />}
      </div>
      <div className="rs-foot"><div className="rs-explore"><button type="button" className="btn btn-sm rs-skip" onClick={skip} data-testid="setup-skip">{RUN_SETUP_SKIP}</button><p>No connection needed. You can set this up later in Settings.</p></div>
        <button type="button" className="gen-btn rs-go" disabled={busy || !pick.size} aria-busy={busy} onClick={() => (nextStep ? close() : void finish())} data-testid="setup-done"><span className="gen-l">{busy ? 'Saving…' : <>{nextStep ? 'Got it, explore samples' : RUN_SETUP_GO} <span aria-hidden>→</span></>}</span></button></div>
    </div></div>, document.body);
}

/** Setup step 8 (summary only): this computer as the server classifies it, in one line under "Use my GPU". */
function MachineLine({ hw }: { hw: Hardware }) {
  if (!hw.profile || hw.tier === 'unknown') return null;
  const free = hw.disk?.freeBytes != null ? `${Math.round(hw.disk.freeBytes / 1e9)} GB free` : null;
  const parts = [hw.profile.label, hw.tierLabel, hw.comfy?.label ? `${hw.comfy.label}${hw.comfy.version ? ` ${hw.comfy.version}` : ''}` : null, free].filter(Boolean);
  return <p className="helper rs-machine" data-testid="setup-machine"><b>Your computer:</b> {parts.join(' · ')}</p>;
}
