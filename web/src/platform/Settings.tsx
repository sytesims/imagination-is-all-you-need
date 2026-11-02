import { useEffect, useRef, useState } from 'react';
import { getLearned, resetLearned } from '../shared/hardware';
import { isDemoMode, jobPromptsOff, setJobPromptsOff } from '../shared/quietMode';
import { askConfirm } from '../shared/Dialog';
import { fmtBytes } from '../api';
import { plainCopy } from '../shared/plainCopy';
import { TechDetails } from '../shared/InlineError';
import { useToast } from '../shared/Toast';
import { Connections, RoutingPrefs } from '../ui/routing/Connections';
import { getNotifyOnDone, setNotifyOnDone } from '../shared/activeJobs';
import { OpenWeightsOnlyPill, useOpenWeightsOnly } from '../shared/OpenWeights';
import { sharePromptDefault, setSharePromptDefault, shareStyleDefault, setShareStyleDefault, type ShareStyle } from '../shared/sharePrefs';
import { useOwnAccounts } from '../shared/billing';
import { Link } from './router';
import GpuModels from './GpuModels';
import { REPO_URL } from '../shared/brand';
import { UserIcon, DocsIcon } from '../ui/Icons';
import './settings.css';
import { useProfile, nameOf, UserAvatar } from '../shared/profile';
/**
 * Settings (PAGES-ROUND2 ST1/C3; calm panel 2026-10-31): a soft grouped nav panel on desktop and a chip row on phones, one section at a time. Profile (PB-30: your local profile
 * plus a Help card) sits at the top of the rail; Connections stays the default section.
 * The section lives in the URL hash (#connections, #gpu (alias #local), #routing, #preferences, #data; ?section=gpu works too); old anchors (#conn-fal, #use-local, #open-models,
 * #notifications, #backup, #learned-timings, #providers) open the section that holds them. The last section is remembered per browser.
 */
type Tab = 'profile' | 'connections' | 'gpu' | 'routing' | 'preferences' | 'data';
const TAB_KEY = 'ohf:settingsTab';
const ICON: Record<Tab, JSX.Element> = {
  profile: <UserIcon size={16} />,
  connections: <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M8 12l4-4" /><path d="M9 5.5l1.2-1.2a3.2 3.2 0 0 1 4.5 4.5L13.5 10M10.5 14.5l-1.2 1.2a3.2 3.2 0 0 1-4.5-4.5L6 10" /></svg>,
  gpu: <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="5" width="10" height="10" rx="2" /><rect x="8" y="8" width="4" height="4" rx=".5" /><path d="M8 2.5V5M12 2.5V5M8 15v2.5M12 15v2.5M2.5 8H5M2.5 12H5M15 8h2.5M15 12h2.5" /></svg>,
  routing: <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="15" r="2" /><circle cx="15" cy="5" r="2" /><path d="M7 15h3.5a3 3 0 0 0 3-3V7" /></svg>,
  preferences: <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 6h7M15 6h1M4 14h1M9 14h7" /><circle cx="13" cy="6" r="2" /><circle cx="7" cy="14" r="2" /></svg>,
  data: <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><ellipse cx="10" cy="5.5" rx="6" ry="2.5" /><path d="M4 5.5v9c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-9M4 10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5" /></svg>,
};
const TABS: [Tab, string][] = [['profile', 'Profile'], ['connections', 'Connections'], ['gpu', 'Your computer'], ['routing', 'Routing'], ['preferences', 'Preferences'], ['data', 'Backup & data']];
/** The rail in three small groups, each under a quiet label (2026-10-31). Spend opens its own page, so it sits under Account with a chevron. */
const GROUPS: [string, Tab[]][] = [['Account', ['profile']], ['Where models run', ['connections', 'gpu', 'routing']], ['App', ['preferences', 'data']]];
function tabOf(hash: string): Tab | null {
  const h = hash.replace(/^#/, ''); if (!h) return null;
  if (h === 'profile' || h === 'help') return 'profile';
  if (h === 'routing') return 'routing';
  if (h === 'gpu' || h === 'local' || h === 'local-setup' || h === 'comfy-address' || h === 'model-files' || h === 'nodes') return 'gpu'; /* the old /self-host#local-setup lands here */
  if (h === 'preferences' || h === 'notifications' || h === 'sharing') return 'preferences';
  if (h === 'data' || h === 'backup' || h === 'learned-timings') return 'data';
  if (h === 'connections' || h === 'providers' || h === 'use-local' || h === 'open-models' || h.startsWith('conn-') || h.startsWith('cloud-setup')) return 'connections'; /* #cloud-setup-<id>: One-time setup (a run's "Show the steps") */
  return null;
}
/** ?section=gpu works too (the hash is the canonical form). */
const sectionTab = (): Tab | null => { const s = new URLSearchParams(location.search).get('section'); return s ? tabOf(s) : null; };
const storedTab = (): Tab | null => { try { const v = localStorage.getItem(TAB_KEY); return v && TABS.some(([t]) => t === v) ? v as Tab : null; } catch { return null; } };

/** Turns off the one-time "Want a notification…" prompt and the "Generation finished" toast. */
function QuietSetting() {
  const [show, setShow] = useState(!jobPromptsOff()); const demo = isDemoMode();
  return <><label className="settings-row" data-testid="job-prompts">
      <span className="set-sw-txt"><span id="job-prompts-lbl">Finish tips</span><small className="helper settings-help" id="job-prompts-help">The one-time notification offer and the “Generation finished” message.</small></span>
      <input type="checkbox" role="switch" aria-labelledby="job-prompts-lbl" aria-describedby="job-prompts-help" checked={show} onChange={e => { setShow(e.target.checked); setJobPromptsOff(!e.target.checked); }} />
    </label>
    {demo && <p className="helper" data-testid="demo-mode-note">Demo mode is on for this tab, so these tips stay hidden. Close the tab to end it.</p>}</>;
}

export default function Settings() {
  const owOnly = useOpenWeightsOnly(); const own = useOwnAccounts();
  const [tab, setTab] = useState<Tab>(() => tabOf(location.hash) ?? sectionTab() ?? storedTab() ?? 'connections');
  /* in-app links to /settings#conn-fal etc. arrive as popstate (pushState), back/forward too */
  useEffect(() => { const f = () => { const t = tabOf(location.hash) ?? sectionTab(); if (t) setTab(t); }; addEventListener('popstate', f); addEventListener('hashchange', f); return () => { removeEventListener('popstate', f); removeEventListener('hashchange', f); }; }, []);
  useEffect(() => { try { localStorage.setItem(TAB_KEY, tab); } catch { /* private mode */ }
    /* phones: keep the current chip in view in the sideways chip row */
    const rail = document.querySelector<HTMLElement>('.st-rail'); const cur = rail?.querySelector<HTMLElement>('[aria-current=page]');
    if (rail && cur && rail.scrollWidth > rail.clientWidth) { const l = cur.getBoundingClientRect().left - rail.getBoundingClientRect().left + rail.scrollLeft, r = l + cur.offsetWidth; if (l < rail.scrollLeft || r > rail.scrollLeft + rail.clientWidth - 24) rail.scrollTo({ left: Math.max(0, l - 16), behavior: 'smooth' }); }
    /* an anchor inside a section (#backup, #learned-timings): scroll to it once the section is shown; Connections scrolls its own */
    const h = location.hash.slice(1); if (h === tab) setTimeout(() => window.scrollTo({ top: 0 }), 0); /* the section id itself: stay at the top */
    else if (h && tab !== 'connections') setTimeout(() => document.getElementById(h)?.scrollIntoView({ block: 'start' }), 60); }, [tab]);
  const pick = (t: Tab) => (e: React.MouseEvent) => { e.preventDefault(); setTab(t); history.replaceState(history.state, '', `#${t}`); window.scrollTo({ top: 0 }); };
  return <section className="settings-page st" data-testid="settings-page">
    {owOnly && <p className="settings-row ow-only-row" data-testid="settings-ow-only"><OpenWeightsOnlyPill /><span>Open models only: closed cloud models are hidden. Change it in Settings → Connections.</span></p>}
    <div className="st-grid">
      <div className="st-side">
      <header className="mh st-head"><h1 className="pg-h1">Settings</h1></header>
      <nav className="st-rail" aria-label="Settings sections" data-testid="settings-nav">
        {GROUPS.map(([g, ts], gi) => <div key={g} className="st-group" role="group" aria-labelledby={`st-g-${gi}`}>
          <span className="group-label st-group-l" id={`st-g-${gi}`}>{g}</span>
          {ts.map(t => <a key={t} href={`#${t}`} className="st-tab" aria-current={tab === t ? 'page' : undefined} data-testid={`settings-tab-${t}`} onClick={pick(t)}>{ICON[t]}<span>{TABS.find(([x]) => x === t)![1]}</span></a>)}
          {gi === 0 && <Link to="/spend" className="st-tab st-tab-out" data-testid="settings-tab-spend"><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 16V9M10 16V4M16 16v-5" /></svg><span>{own === false ? 'Usage' : 'Spend'}</span><i aria-hidden>›</i></Link>}
        </div>)}
      </nav>
      </div>
      <div className="st-main">
        {tab === 'profile' && <ProfileSettings />}
        {tab === 'connections' && <Connections />}
        {tab === 'gpu' && <GpuModels />}
        {tab === 'routing' && <RoutingPrefs />}
        {tab === 'preferences' && <Preferences />}
        {tab === 'data' && <><BackupSettings /><LearnedTimings /></>}
      </div>
    </div>
  </section>;
}

/** PB-30: the local profile at the top of Settings (name and picture are edited on /profile and stored on this machine; there's no sign-in)
 *  and a small Help card: the docs, the API, and Copy support info (app and browser facts only: never keys, prompts or file paths). */
function ProfileSettings() {
  const pr = useProfile(); const [n, setN] = useState<number | null>(null);
  const [copied, setCopied] = useState<'' | 'ok' | 'fail'>(''); const [text, setText] = useState(''); const toast = useToast(); const [ver, setVer] = useState('');
  useEffect(() => {
    fetch('/api/me/stats').then(r => r.ok ? r.json() : null).then(st => { if (typeof st?.generations === 'number') setN(st.generations); }).catch(() => 0); /* the plain /api/jobs list stops at 50 */
    fetch('/api/health').then(r => r.ok ? r.json() : null).then(h => { if (typeof h?.version === 'string') setVer(h.version); }).catch(() => 0); }, []);
  const support = async () => {
    const [h, c] = await Promise.all([fetch('/api/health').then(r => r.ok ? r.json() : null).catch(() => null), fetch('/api/config').then(r => r.ok ? r.json() : null).catch(() => null)]);
    const lines = ['Imagination Is All You Need support info', h?.version ? `Version: ${h.version}` : '', `Time: ${new Date().toISOString()}`,
      h ? `Backend: ${h.backend} · ComfyUI ready: ${h.comfyReady ? 'yes' : `no${h.comfyReason ? ` (${h.comfyReason})` : ''}`}` : 'Backend: the server didn’t answer',
      h ? `Tools: ${Array.isArray(h.tools) ? h.tools.length : '?'} · Open-weights only: ${h.openWeightsOnly ? 'yes' : 'no'}` : '',
      c ? `Queue: ${c.concurrency ?? '?'} at a time, ${c.maxQueued ?? '?'} can wait · Use local ComfyUI: ${c.useLocal ? 'on' : 'off'}` : '',
      `Browser: ${navigator.userAgent}`, `Window: ${innerWidth}×${innerHeight} @${devicePixelRatio}x · Language: ${navigator.language}`].filter(Boolean).join('\n');
    setText(lines);
    try { await navigator.clipboard.writeText(lines); setCopied('ok'); toast('Support info copied'); } catch { setCopied('fail'); }
  };
  const name = nameOf(pr);
  return <section className="set-sec st-profile" id="profile" aria-labelledby="set-prof-h" data-testid="settings-profile">
    <h2 id="set-prof-h">Profile</h2>
    <div className="st-pcard st-prof-card" data-testid="settings-profile-card">
      <UserAvatar profile={pr} size={48} className="st-prof-av" />
      <div className="st-prof-t"><b>{pr ? name : ' '}</b><small className="helper">Stored on your computer. No sign-in, no account to delete.{n != null ? ` ${n === 0 ? 'Nothing made yet.' : n === 1 ? '1 generation so far.' : `${n.toLocaleString()} generations so far.`}` : ''}</small></div>
      <Link to="/profile" className="btn" data-testid="settings-profile-edit">Edit profile</Link>
    </div>
    <p className="helper">Your name and picture show on work you share to Community. To back up your library, open Backup &amp; data.</p>
    <h3 className="st-sub" id="help">Help</h3>
    <div className="st-pcard st-help" data-testid="settings-help">
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="st-help-row" data-testid="settings-docs"><span className="st-help-ic" aria-hidden><DocsIcon size={16} /></span><span className="st-help-t"><b>Docs (GitHub)</b><small className="helper">Install, run locally, fix common problems</small></span><i aria-hidden>↗</i></a>
      <Link to="/api-docs" className="st-help-row"><span className="st-help-ic" aria-hidden><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M7 6l-4 4 4 4M13 6l4 4-4 4" /></svg></span><span className="st-help-t"><b>API and MCP</b><small className="helper">Drive every tool from code or an agent</small></span><i aria-hidden>›</i></Link>
      <button type="button" className="st-help-row" data-testid="settings-copy-support" onClick={support}><span className="st-help-ic" aria-hidden><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><rect x="7" y="7" width="9" height="10" rx="2" /><path d="M4 13V5a2 2 0 0 1 2-2h6" /></svg></span><span className="st-help-t"><b>{copied === 'ok' ? 'Copied ✓' : 'Copy support info'}</b><small className="helper">For a bug report: app state and your browser. No keys, no prompts.</small></span></button>
    </div>
    {copied === 'fail' && <div className="st-support-fallback" data-testid="settings-support-text"><p className="helper" role="status">Your browser blocked copying. Select the text below and copy it.</p><textarea readOnly rows={7} value={text} onFocus={e => e.currentTarget.select()} /></div>}
    {/* the app's version (root package.json via /api/health); updating is `npm run update`, see docs/INSTALL.md */}
    {ver && <p className="helper st-version" data-testid="settings-version">Version {ver} · <a href={`${REPO_URL}/releases`} target="_blank" rel="noopener noreferrer" data-testid="settings-whats-new">What’s new</a></p>}
  </section>;
}

/** ST2: notifications + sharing. (No theme switch: the app has one theme. No sample/real switch: the server decides that, see Connections.) */
function Preferences() {
  const [on, setOn] = useState(getNotifyOnDone()); const [sp, setSp] = useState(sharePromptDefault); const [ds, setDs] = useState<ShareStyle>(shareStyleDefault);
  const [perm, setPerm] = useState<string>(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  return <section className="set-sec" id="preferences" aria-labelledby="set-pref-h" data-testid="settings-preferences">
    <h2 id="set-pref-h">Preferences</h2>
    <h3 className="st-sub" id="notifications">Notifications</h3>
    <label className="settings-row" data-testid="notify-on-done">
      <span className="set-sw-txt"><span id="notify-lbl">Run alerts</span><small className="helper settings-help" id="notify-help">Notify me when a run finishes, only while this tab is in the background.</small></span>
      <input type="checkbox" role="switch" aria-labelledby="notify-lbl" aria-describedby="notify-help" checked={on} onChange={async (e) => { const v = e.target.checked; setOn(v); setPerm(await setNotifyOnDone(v)); }} />
    </label>
    {on && perm === 'denied' && <p className="helper st-note" data-testid="notify-denied">Notifications are blocked for this site. Allow them in your browser’s site settings, then turn this on again. The tab title still shows a (n) count.</p>}
    {perm === 'unsupported' && <p className="helper">This browser doesn't support notifications.</p>}
    <QuietSetting />
    <h3 className="st-sub" id="sharing">Sharing</h3>
    <label className="settings-row" data-testid="share-prompt-default">
      <span className="set-sw-txt"><span id="sp-lbl">Show my prompt on Community posts</span><small className="helper settings-help" id="sp-help">Results stay private until you share one. This sets the starting choice in Share; you can still change it for each post.</small></span>
      <input type="checkbox" role="switch" aria-labelledby="sp-lbl" aria-describedby="sp-help" checked={sp} onChange={e => { setSp(e.target.checked); setSharePromptDefault(e.target.checked); }} />
    </label>
    <div className="settings-row" data-testid="share-style-default"><span className="set-sw-txt"><span id="ds-lbl">Default download</span><small className="helper settings-help">What Share starts on. Clean is the file without hidden data; Branded adds the Imagination badge. Share remembers your last choice.</small></span>
      <div className="seg" role="radiogroup" aria-labelledby="ds-lbl">{(['clean', 'branded'] as const).map(v => <button key={v} type="button" role="radio" aria-checked={ds === v} className={ds === v ? 'on' : ''} data-testid={`share-style-${v}`} onClick={() => { setDs(v); setShareStyleDefault(v); }}>{v === 'clean' ? 'Clean' : 'Branded'}</button>)}</div></div>
  </section>;
}

const RESTART_LINE = 'Restart Imagination Is All You Need to switch to this backup. Your current library is kept in a backup folder.';
/** Back up / restore: export downloads the whole library as one file; import checks a backup and stages it for the next restart. */
function BackupSettings() {
  const pick = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false); const toast = useToast();
  const [exp, setExp] = useState<'' | 'all' | 'db'>(''); const [expNote, setExpNote] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; msg: string; detail?: string } | null>(null);
  /* ST5: the browser downloads the file itself (no size known up front), so: a short busy state, then a lasting note where to find it */
  const onExport = (k: 'all' | 'db') => { setExp(k); setExpNote(false); setTimeout(() => { setExp(''); setExpNote(true); toast('Export started. Your browser shows the download.'); }, 2500); };
  const onFile = async (f: File | undefined) => {
    if (pick.current) pick.current.value = ''; if (!f) return; setRes(null);
    const go = await askConfirm({ title: 'Replace your library with this backup?', danger: true, confirm: 'Replace library', cancel: 'Cancel',
      body: [`Importing “${f.name}” (${fmtBytes(f.size)}) replaces your current library: results, projects and history.`,
        'Nothing changes until you restart Imagination Is All You Need. Your current library is moved to a backup folder, not deleted.',
        'Not sure? Export a backup of your current library first.'],
      extra: { label: 'Export first', testid: 'backup-export-first', onClick: () => { const a = document.createElement('a'); a.href = '/api/export'; a.download = ''; document.body.appendChild(a); a.click(); a.remove(); } } });
    if (!go) return; setBusy(true);
    try { const r = await fetch('/api/import', { method: 'POST', headers: { 'content-type': 'application/gzip' }, body: f }); const b = await r.json().catch(() => ({}));
      if (!r.ok) setRes({ ok: false, msg: plainCopy(String(b.error ?? 'This backup couldn’t be imported.')), detail: typeof b.detail === 'string' ? b.detail : undefined });
      else { setRes({ ok: true, msg: plainCopy(String(b.message ?? 'Backup checked and ready.')) }); toast('Backup checked. Restart to switch to it.'); }
    } catch { setRes({ ok: false, msg: 'Couldn’t reach the server. Nothing was imported.' }); } finally { setBusy(false); }
  };
  return <section className="set-backup set-sec" id="backup" aria-labelledby="set-backup-h" data-testid="settings-backup">
    <h2 id="set-backup-h">Backup &amp; data</h2>
    <h3 className="st-sub">Backup</h3>
    <div className="st-pcard st-card-col">
    <p className="helper">Download your whole library (results, projects and history) as one file, or restore one you saved earlier.</p>
    <div className="row set-backup-acts">
      <a className="btn btn-primary" href="/api/export" download data-testid="backup-export" aria-busy={exp === 'all'} onClick={() => onExport('all')}>{exp === 'all' ? 'Preparing…' : 'Export library'}</a>
      <a className="btn btn-ghost" href="/api/export?media=0" download data-testid="backup-export-nomedia" aria-busy={exp === 'db'} onClick={() => onExport('db')}>{exp === 'db' ? 'Preparing…' : 'Export without media'}</a>
      <button type="button" className="btn btn-ghost" disabled={busy} aria-busy={busy} data-testid="backup-import" onClick={() => pick.current?.click()}>{busy ? 'Checking backup…' : 'Import backup…'}</button>
      <input ref={pick} type="file" accept=".gz,.tgz,application/gzip" hidden data-testid="backup-file" onChange={e => onFile(e.target.files?.[0])} />
    </div>
    <p className="helper" role="status" data-testid="backup-export-note">{exp ? 'Packing your library on the server. A big library with media can take a minute.' : expNote ? 'Export started: find the .tar.gz file in your browser’s downloads.' : ''}</p>
    {res && <div className={`set-backup-res ${res.ok ? 'ok' : 'bad'}`} role={res.ok ? 'status' : 'alert'} data-testid="backup-result"><p>{res.msg}</p>{res.ok && <p><b>{RESTART_LINE}</b></p>}<TechDetails text={res.detail} /></div>}
    </div>
  </section>;
}

/** Batch 28: local run times this computer has learned (they replace the estimates after a few runs). Reset starts over. */
function LearnedTimings() {
  const [n, setN] = useState<number | null>(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  useEffect(() => { getLearned().then(r => setN(r.ok ? Number(r.data.samples) || 0 : null)); }, []);
  const reset = async () => {
    const go = await askConfirm({ title: 'Reset learned timings?', danger: true, confirm: 'Reset', cancel: 'Cancel',
      body: [`This forgets ${n === 1 ? '1 timed run' : `${n ?? 0} timed runs`} on this computer. The next run of each local model is timed again before it shows an estimate.`] });
    if (!go) return; setBusy(true); setMsg(null); const r = await resetLearned(); setBusy(false);
    if (r.ok) { setN(0); setMsg({ ok: true, t: 'Learned timings reset.' }); } else setMsg({ ok: false, t: r.error });
  };
  const none = !n; const why = n == null ? 'Couldn’t read the timings' : 'Nothing to reset yet';
  return <section className="set-learned set-sec" id="learned-timings" aria-labelledby="set-learned-h" data-testid="settings-learned">
    <h3 className="st-sub" id="set-learned-h">Learned timings</h3>
    <div className="st-pcard st-card-col">
    <p className="helper">Runs on your computer get timed, so the time shown is your own and gets closer with each run.{n != null ? ` ${n === 0 ? 'Nothing timed yet.' : n === 1 ? '1 run timed so far.' : `${n} runs timed so far.`}` : ''}</p>
    <div className="row st-learned-row"><button type="button" className="btn btn-ghost" data-testid="learned-reset" disabled={busy || none} aria-busy={busy} aria-describedby={none ? 'learned-why' : undefined} title={none ? why : undefined} onClick={reset}>{busy ? 'Resetting…' : 'Reset learned timings'}</button>
      {none && !msg && <span className="helper" id="learned-why" data-testid="learned-why">{why}</span>}
      {msg && <span className={msg.ok ? 'helper' : 'inline-err'} role={msg.ok ? 'status' : 'alert'} data-testid="learned-msg">{msg.t}</span>}</div>
    </div>
  </section>;
}
