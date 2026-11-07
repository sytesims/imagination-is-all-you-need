/**
 * Plugins (/plugins, plan step 7): turn parts of the app on or off, add new ones, or make your own. Reached from the header's Plugins button
 * and a link in Settings. Sections: Made by us (grouped places to run / studios / money / features, each row with an orange switch; kie.ai and
 * RunPod with Install), Community (coming soon), Made by you (coming later). Search on top; a row opens its details on the right.
 * Your workflows (the ComfyUI workflows you added) moved to /workflows/yours. Data: shared/plugins.ts (GET /api/plugins and the changes).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, navigate } from '../../platform/router';
import { usePluginList, connectionsHref, PLUGIN_GROUPS, type PluginRow } from '../../shared/plugins';
import { MADE_BY_US, repoDoc } from '../../shared/brand';
import { PluginTile, PluginSwitch, StateTag, Tags, usePluginToggle } from '../plugins/PluginParts';
import { AddPluginMenu } from '../plugins/AddPluginMenu';
import { SearchIcon, ResetIcon, PlusIcon, ChevronDownIcon, ChevronRightIcon, KeyIcon, AlertIcon, CloseIcon, DownloadIcon, GenerateIcon, CommunityIcon } from '../Icons';
import '../plugins/plugins-ui.css';

export function PluginsHub() {
  const { data, error, reload } = usePluginList(); const { busy, toggle, install } = usePluginToggle();
  const [q, setQ] = useState(''); const [sel, setSel] = useState<string | null>(null); const [spin, setSpin] = useState(false);
  const add = useRef<HTMLButtonElement>(null); const [addOpen, setAddOpen] = useState(false);
  /* #places (Browse plugins): scroll to the places, where the ones ready to install are */
  useEffect(() => { if (!data || !location.hash) return; const el = document.getElementById(`pgx-${location.hash.slice(1)}`); el?.scrollIntoView({ block: 'start' }); }, [!!data]);
  const ps = data?.plugins ?? [];
  const ours = ps.filter((p) => p.source === 'ours'); const community = ps.filter((p) => p.source === 'community');
  const failed = ps.filter((p) => p.state === 'failed');
  const hits = useMemo(() => { const t = q.trim().toLowerCase(); return t ? ps.filter((p) => `${p.name} ${p.description}`.toLowerCase().includes(t)) : null; }, [q, ps]);
  const picked = ps.find((p) => p.id === sel) ?? null;
  const refresh = async () => { setSpin(true); try { await reload(); } finally { setSpin(false); } };
  const row = (p: PluginRow) => <Row key={p.id} p={p} q={q} sel={sel === p.id} busy={busy === p.id} onPick={() => setSel(p.id)} onToggle={(on) => toggle(p, on)} onInstall={() => install(p)} />;
  return <div className={`pgx${picked ? ' pgx-with-det' : ''}`} data-testid="plugins-hub">
    <div className="pgx-main">
      <header className="pgx-head">
        <div><h1>Plugins</h1><p>Turn parts of the app on or off, add new ones, or make your own.</p></div>
        <div className="pgx-head-a">
          <button type="button" className="btn btn-sm btn-ghost" onClick={refresh} disabled={spin} data-testid="plugins-refresh"><ResetIcon size={14} />Refresh</button>
          <button ref={add} type="button" className="btn btn-sm pgx-pri" aria-haspopup="menu" aria-expanded={addOpen} onClick={() => setAddOpen((x) => !x)} data-testid="plugins-add"><PlusIcon size={14} />Add plugin<span className="pgx-sep" aria-hidden /><ChevronDownIcon size={13} /></button>
          <AddPluginMenu open={addOpen} anchor={add} onClose={() => setAddOpen(false)} onBrowse={() => { setAddOpen(false); document.getElementById('pgx-places')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} />
        </div>
      </header>
      {error && !data && <p className="pgx-note pgx-note-err" role="alert">Couldn’t load the plugins. Is the app still running? <button type="button" className="pgx-link-btn" onClick={refresh}>Try again</button></p>}
      {failed.length > 0 && <div className="pgx-banner pgx-banner-err" role="status" data-testid="plugins-failed-banner"><span className="pgx-banner-ic" aria-hidden><AlertIcon size={16} /></span>
        <span className="pgx-rt"><b>{failed.length === 1 ? '1 plugin didn’t start' : `${failed.length} plugins didn’t start`}</b><small>{failed.map((p) => p.name).join(', ')} {failed.length === 1 ? 'is' : 'are'} off until it’s fixed. The rest of the app is fine.</small></span>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setQ(''); setSel(failed[0].id); document.querySelector(`[data-testid=plugin-row-${failed[0].id}]`)?.scrollIntoView({ block: 'center' }); }}>Show it</button></div>}
      {data && <label className={`pgx-search${q ? ' typed' : ''}`}><SearchIcon size={15} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search plugins" aria-label="Search plugins" data-testid="plugins-search" />
        {hits && <span className="pgx-count">{hits.length} of {ps.length}</span>}</label>}
      {!data && !error && <div className="pgx-list pgx-skel" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="pgx-prow" />)}</div>}
      {hits ? <section className="pgx-sec"><h3 className="pgx-gl">Results</h3>
        {hits.length ? <div className="pgx-list">{hits.map(row)}</div> : <p className="pgx-note">No plugin matches “{q.trim()}”.</p>}
        <p className="pgx-note">Not here? <button type="button" className="pgx-link-btn" onClick={() => { setQ(''); requestAnimationFrame(() => document.getElementById('pgx-places')?.scrollIntoView({ block: 'start' })); }}>Browse plugins to install</button></p></section>
      : data && <>
        <section className="pgx-sec"><div className="pgx-sech"><h2>{MADE_BY_US}</h2></div>
          {PLUGIN_GROUPS.map((g) => { const rows = ours.filter((p) => p.group === g.id); return rows.length ? <div key={g.id} id={`pgx-${g.id}`} className="pgx-grp"><h3 className="pgx-gl">{g.label}</h3><div className="pgx-list">{rows.map(row)}</div></div> : null; })}
        </section>
        <section className="pgx-sec" id="pgx-community"><div className="pgx-sech"><h2>Community</h2></div>
          {community.length ? <div className="pgx-list">{community.map(row)}</div>
            : <div className="pgx-empty pgx-empty-sm" data-testid="plugins-community-empty"><span className="pgx-tile" aria-hidden><CommunityIcon size={17} /></span><span className="pgx-rt"><b>Plugins made by other people</b><small>Coming soon. You’ll see what each one does, what it can use and what it costs before you install it.</small></span></div>}
        </section>
        <section className="pgx-sec" id="pgx-yours"><div className="pgx-sech"><h2>Made by you</h2></div>
          <div className="pgx-empty" data-testid="plugins-yours-empty"><span className="pgx-tile pgx-tile-accent" aria-hidden><GenerateIcon size={18} /></span>
            <h3>Describe a plugin and Claude builds it<span className="pgx-tag pgx-tag-soon">Coming later</span></h3>
            <p>Say what you want, like “a pixel-art theme”. Claude makes it, shows you a safe preview, and only installs it when you say yes.</p>
            <p className="pgx-note">Your own ComfyUI workflows are in <Link to="/workflows/yours">Your workflows</Link>.</p></div>
        </section>
      </>}
      {/* at the bottom, sticky: it appears without pushing the list under your pointer */}
      {data?.restartNeeded && <div className="pgx-banner pgx-banner-sticky" role="status" data-testid="plugins-restart-banner"><span className="pgx-banner-ic" aria-hidden><ResetIcon size={16} /></span>
        <span className="pgx-rt"><b>Some changes apply after a restart</b><small>Your choices are saved. Quit the app and open it again to use them.</small></span></div>}
    </div>
    {picked && <Details p={picked} busy={busy === picked.id} nameOf={(id) => ps.find((x) => x.id === id)?.name ?? id} onClose={() => setSel(null)} onToggle={(on) => toggle(picked, on)} onInstall={() => install(picked)} />}
  </div>;
}

/** The name with the search words marked. */
function Mark({ text, q }: { text: string; q: string }) {
  const t = q.trim(); if (!t) return <>{text}</>; const i = text.toLowerCase().indexOf(t.toLowerCase()); if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + t.length)}</mark>{text.slice(i + t.length)}</>;
}

function Row({ p, q, sel, busy, onPick, onToggle, onInstall }: { p: PluginRow; q: string; sel: boolean; busy: boolean; onPick: () => void; onToggle: (on: boolean) => void; onInstall: () => void }) {
  const err = p.state === 'failed';
  let right: ReactNode;
  if (p.state === 'not-installed') right = <button type="button" className="btn btn-sm btn-ghost pgx-install" disabled={busy} onClick={(e) => { e.stopPropagation(); onInstall(); }} data-testid={`plugin-install-${p.id}`}><DownloadIcon size={13} />Install</button>;
  else if (err) right = <StateTag p={p} />;
  else right = <>{p.state === 'needs-key' && p.key ? <Link to={connectionsHref(p.key.connection)} className="pgx-key-link" onClick={(e) => e.stopPropagation()}><KeyIcon size={13} />{p.key.rejected ? `Check ${p.key.label}` : p.key.set ? 'Add Endpoint ID' : `Add ${p.key.label}`}<ChevronRightIcon size={12} /></Link>
    : (p.core || p.state !== 'on' || p.restartNeeded) && <StateTag p={p} />}{!p.core && <PluginSwitch p={p} busy={busy} onToggle={onToggle} />}</>;
  return <div className={`pgx-prow${sel ? ' sel' : ''}${err ? ' err' : ''}`} role="button" tabIndex={0} aria-pressed={sel} data-testid={`plugin-row-${p.id}`} onClick={onPick} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onPick(); } }}>
    <PluginTile id={p.id} />
    <span className="pgx-rt"><b><span><Mark text={p.name} q={q} /></span>{p.tag && <span className="pgx-tag pgx-tag-warn">{p.tag}</span>}{p.installable && <span className="pgx-tag">{MADE_BY_US}</span>}</b>
      <small>{err ? p.reason : <Mark text={p.description} q={q} />}</small>
      {err && <span className="pgx-row-a"><button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={(e) => { e.stopPropagation(); onToggle(false); }} data-testid={`plugin-turn-off-${p.id}`}>Turn off</button><button type="button" className="pgx-link-btn" onClick={(e) => { e.stopPropagation(); onPick(); }}>Details</button></span>}</span>
    <span className="pgx-row-r">{right}</span>
  </div>;
}

function Details({ p, busy, nameOf, onClose, onToggle, onInstall }: { p: PluginRow; busy: boolean; nameOf: (id: string) => string; onClose: () => void; onToggle: (on: boolean) => void; onInstall: () => void }) {
  const box = useRef<HTMLElement>(null);
  /* sit below the app's top bar (and the promo line above it while it shows): its bottom edge moves as the page scrolls */
  const [top, setTop] = useState(56);
  useLayoutEffect(() => { const h = document.querySelector<HTMLElement>('header.topnav'); const f = () => setTop(Math.max(0, Math.round(h?.getBoundingClientRect().bottom ?? 0)));
    f(); addEventListener('scroll', f, { passive: true }); addEventListener('resize', f); const ro = h && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(f) : null; if (h) ro?.observe(h);
    return () => { removeEventListener('scroll', f); removeEventListener('resize', f); ro?.disconnect(); }; }, []);
  useEffect(() => { box.current?.focus({ preventScroll: true }); const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [p.id]);
  const KV = ({ k, children }: { k: string; children: ReactNode }) => <div className="pgx-kv"><span>{k}</span><b>{children}</b></div>;
  return <aside ref={box} className="pgx-det" style={{ top }} tabIndex={-1} aria-label={`${p.name} details`} data-testid="plugin-details">
    <div className="pgx-det-top"><PluginTile id={p.id} size="lg" /><button type="button" className="pgx-x" aria-label="Close details" onClick={onClose}><CloseIcon size={15} /></button></div>
    <h2>{p.name}</h2><p className="pgx-det-d">{p.description}</p><Tags p={p} />
    {/* the switch first: the notes below it come and go as you switch, and must never move it */}
    <div className="pgx-kvs">{p.core ? <KV k="Turned on">Always on</KV> : p.state === 'not-installed' ? <KV k="Installed"><button type="button" className="btn btn-sm btn-ghost pgx-install" disabled={busy} onClick={onInstall}><DownloadIcon size={13} />Install</button></KV>
      : <div className="pgx-kv"><span id="pgx-det-on">Turned on</span><PluginSwitch p={p} busy={busy} onToggle={onToggle} /></div>}</div>
    {p.state === 'needs-key' && p.key && <div className="pgx-call"><span className="pgx-rt"><b>{p.key.rejected ? `Your ${p.key.label} wasn’t accepted` : p.key.set ? 'Add its Endpoint ID to use it' : `Add your ${p.key.label} to use it`}</b><small>Until then its models show as “needs a key” and won’t run. Keys stay on this computer.</small></span>
      <button type="button" className="btn btn-sm pgx-pri" onClick={() => navigate(connectionsHref(p.key!.connection))}>Open Connections</button></div>}
    {p.state === 'failed' && <div className="pgx-call pgx-call-err"><span className="pgx-rt"><b>It didn’t start</b><small>{p.reason}</small></span><button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => onToggle(false)}>Turn off</button></div>}
    {p.core && <div className="pgx-call" data-testid="plugin-core-note"><span className="pgx-rt"><b>Always on</b><small>It is part of the app and can’t be turned off: every paid run shows its price and waits for your OK.</small></span></div>}
    {p.restartNeeded && <div className="pgx-call"><span className="pgx-rt"><b>Applies after restart</b><small>{p.reason}. Your choice is saved.</small></span></div>}
    <div className="pgx-kvs">
      {p.needs.length > 0 && <KV k="Needs">{p.needs.map(nameOf).join(', ')}</KV>}
      {p.neededBy.length > 0 && <KV k="Needed by">{p.neededBy.map(nameOf).join(', ')}</KV>}
      <KV k="Uses">{p.key ? `Your ${p.key.label}` : 'No key'}</KV>
      <KV k="Can spend">{p.core ? 'Never: it checks every paid run' : p.canSpend ? 'Only after you OK the price' : 'No'}</KV>
      <KV k="Health">{p.state === 'on' && !p.restartNeeded ? <span className="pgx-ok">Started fine</span> : p.reason}</KV>
      <KV k="Licence">{p.source === 'ours' ? <a href={repoDoc('LICENSE')} target="_blank" rel="noreferrer">{p.licence} ↗</a> : p.licence}</KV>
    </div>
    {p.settings.length > 0 && <div className="pgx-det-set"><h3 className="pgx-gl">Settings</h3>{p.settings.map((s) => <Link key={s.to} to={s.to} className="pgx-set-link">{s.label}<ChevronRightIcon size={13} /></Link>)}</div>}
    {p.neededBy.length > 0 && !p.core && <p className="pgx-note">Turning it off also turns off what needs it. What you made with it is kept.</p>}
  </aside>;
}
