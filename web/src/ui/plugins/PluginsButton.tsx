/**
 * The header's Plugins button (next to Assets) and its quick menu: the Plugins page's sections in short form. The edition (Change shows the
 * list, read-only for now), safe mode, what needs you (a key to add, a plugin that didn't start), a few of ours that are turned off, what is
 * ready to install, the spend guard's locked line, and Add plugin / All plugins. An orange dot on the button when something needs you.
 */
import { useEffect, useRef, useState } from 'react';
import { Popover } from '../../shared/Popover';
import { Link, navigate } from '../../platform/router';
import { usePluginList, refreshPluginList, setSafeMode, needsYou, connectionsHref, type PluginRow } from '../../shared/plugins';
import { useToast } from '../../shared/Toast';
import { tip } from '../../shared/Tooltip';
import { PuzzleIcon, ShieldIcon, LaptopIcon, LockIcon, ChevronRightIcon, ChevronDownIcon, PlusIcon, KeyIcon, DownloadIcon } from '../Icons';
import { PluginTile, PluginSwitch, usePluginToggle } from './PluginParts';
import { AddPluginMenu } from './AddPluginMenu';
import '../../shared/barPop.css';
import './plugins-ui.css';

const SAFE_OFF = 'Turns outside plugins off. Ours stay on.';
const SAFE_ON = 'Outside plugins paused. Ours stay on.'; /* as short as the off line: one line both ways, nothing jumps */
const GUARD = <><b>Spend guard</b> is always on: every paid run shows its price and waits for your OK.</>;

export function PluginsButton({ path }: { path: string }) {
  const btn = useRef<HTMLButtonElement>(null); const [open, setOpen] = useState(false);
  const { data } = usePluginList();
  const dot = !!data?.plugins.some(needsYou);
  const on = path === '/plugins' || path.startsWith('/plugins/');
  return <>
    {/* safe mode shows as an amber puzzle icon (the button keeps its size, so Assets never moves) */}
    <button ref={btn} type="button" className={`tn-btn tn-assets tn-plugins${on ? ' on' : ''}${open ? ' open' : ''}${data?.safeMode ? ' safe' : ''}`} aria-haspopup="dialog" aria-expanded={open} data-testid="nav-plugins" onClick={() => setOpen((o) => !o)}
      {...tip(data?.safeMode ? 'Plugins · safe mode is on' : 'Plugins')}>
      <PuzzleIcon size={15} /><span className="tn-assets-l">Plugins{data?.safeMode && <span className="sr-only"> (safe mode on)</span>}</span>
      {dot && <b className="tn-dot" aria-label="Something needs you" />}
    </button>
    <Popover open={open} anchor={btn} onClose={() => setOpen(false)} label="Plugins" placement="bottom" align="end" width={404} className="bp pgx-pop" testId="plugins-menu">
      {data ? <QuickMenu close={() => setOpen(false)} /> : <p className="pgx-qm-empty">Loading plugins…</p>}
    </Popover>
  </>;
}

function QuickMenu({ close }: { close: () => void }) {
  const { data } = usePluginList(); const toast = useToast(); const { busy, toggle, install } = usePluginToggle();
  const [editions, setEditions] = useState(false); const [safeBusy, setSafeBusy] = useState(false);
  const add = useRef<HTMLButtonElement>(null); const [addOpen, setAddOpen] = useState(false);
  /* which rows sit in which group is fixed while the menu is open: a row you switch or install stays where it is (its state updates), so the
     menu never jumps under your pointer; it regroups the next time it opens */
  const groupsOf = (ps: PluginRow[]) => ({
    need: ps.filter(needsYou).map((p) => p.id),
    off: ps.filter((p) => p.source === 'ours' && !p.core && p.installed && !p.wanted && p.state === 'off').slice(0, 3).map((p) => p.id),
    ready: ps.filter((p) => p.state === 'not-installed').map((p) => p.id) });
  /* grouped from the list as it is when the menu opens (a fresh read, not the cached one), then fixed until it closes */
  const frozen = useRef<ReturnType<typeof groupsOf> | null>(null); const [fresh, setFresh] = useState(false);
  useEffect(() => { let live = true; void refreshPluginList().then(() => { if (live) setFresh(true); }); return () => { live = false; }; }, []);
  if (!data) return null;
  if (fresh && !frozen.current) frozen.current = groupsOf(data.plugins);
  const groups = frozen.current ?? groupsOf(data.plugins);
  const ps = data.plugins; const pick = (ids: string[]) => ids.map((id) => ps.find((p) => p.id === id)).filter((p): p is PluginRow => !!p);
  const need = pick(groups.need), off = pick(groups.off), ready = pick(groups.ready);
  /* one right-hand control for the row's current state, whatever group it sits in */
  const right = (p: PluginRow) => p.state === 'not-installed' ? <button type="button" className="btn btn-sm btn-ghost pgx-install" disabled={busy === p.id} onClick={() => install(p)} data-testid={`plugins-install-${p.id}`}><DownloadIcon size={13} />Install</button>
    : p.state === 'needs-key' && p.key ? <Link to={connectionsHref(p.key.connection)} className="pgx-key-link" onClick={close} data-testid={`plugins-add-key-${p.id}`}><KeyIcon size={13} />{p.key.set ? 'Add Endpoint ID' : `Add ${p.key.label}`}<ChevronRightIcon size={12} /></Link>
    : p.state === 'failed' ? <button type="button" className="btn btn-sm btn-ghost" disabled={busy === p.id} onClick={() => toggle(p, false)}>Turn off</button>
    : <PluginSwitch p={p} busy={busy === p.id} onToggle={(v) => toggle(p, v)} />;
  const sub = (p: PluginRow) => (p.state === 'needs-key' || p.state === 'failed' ? p.reason : p.description);
  const go = (to: string) => { close(); navigate(to); };
  const flipSafe = async () => { setSafeBusy(true); try { await setSafeMode(!data.safeMode); toast(data.safeMode ? 'Safe mode is off.' : 'Safe mode is on. Outside plugins are paused.', 'success'); } catch (e) { toast(String((e as Error).message), 'error'); } finally { setSafeBusy(false); } };
  return <div className="pgx-qm">
    <h2 className="pgx-qm-h">Plugins</h2>
    <div className="pgx-card">
      <span className="pgx-tile pgx-tile-sm" aria-hidden><LaptopIcon size={15} /></span>
      <span className="pgx-rt"><b>{data.edition.name}</b>{data.edition.description && <small>{data.edition.description}</small>}</span>
      <button type="button" className="pgx-link-btn" aria-expanded={editions} onClick={() => setEditions((x) => !x)} data-testid="plugins-edition-change">Change</button>
    </div>
    {editions && <div className="pgx-editions" data-testid="plugins-editions">
      {data.editions.map((e) => <div key={e.id} className={`pgx-edition${e.id === data.edition.id ? ' on' : ''}`}><b>{e.name}</b>{e.id === data.edition.id && <small>In use</small>}</div>)}
      <p>More editions, made for one kind of work, come later.</p>
    </div>}
    <div className={`pgx-card${data.safeMode ? ' pgx-card-on' : ''}`}>
      <span className="pgx-tile pgx-tile-sm" aria-hidden><ShieldIcon size={15} /></span>
      <span className="pgx-rt"><b id="pgx-safe-l">Safe mode</b><small>{data.safeMode ? SAFE_ON : SAFE_OFF}</small></span>
      <button type="button" role="switch" aria-checked={data.safeMode} aria-labelledby="pgx-safe-l" className={`plug-sw ${data.safeMode ? 'on' : ''}`} disabled={safeBusy} onClick={flipSafe} data-testid="plugins-safe-mode"><i /></button>
    </div>
    {need.length > 0 && <Group label="Needs you">{need.map((p) => <QRow key={p.id} p={p} sub={sub(p)} right={right(p)} />)}</Group>}
    {off.length > 0 && <Group label="Turned off">{off.map((p) => <QRow key={p.id} p={p} sub={sub(p)} right={right(p)} />)}</Group>}
    {ready.length > 0 && <Group label="Ready to install">{ready.map((p) => <QRow key={p.id} p={p} sub={sub(p)} right={right(p)} />)}</Group>}
    <p className="pgx-guard"><LockIcon size={14} /><span>{GUARD}</span></p>
    <div className="pgx-qm-foot">
      <button ref={add} type="button" className="btn btn-sm btn-ghost pgx-grow" aria-haspopup="menu" aria-expanded={addOpen} onClick={() => setAddOpen((x) => !x)}><PlusIcon size={14} />Add plugin<ChevronDownIcon size={13} /></button>
      <button type="button" className="btn btn-sm btn-ghost pgx-grow" onClick={() => go('/plugins')} data-testid="plugins-all">All plugins<ChevronRightIcon size={13} /></button>
    </div>
    <AddPluginMenu open={addOpen} anchor={add} onClose={() => setAddOpen(false)} onBrowse={() => { setAddOpen(false); go('/plugins#places'); }} />
  </div>;
}

const Group = ({ label, children }: { label: string; children: React.ReactNode }) => <section className="pgx-qm-g"><h3 className="pgx-gl">{label}</h3>{children}</section>;
function QRow({ p, sub, right }: { p: PluginRow; sub: string; right: React.ReactNode }) {
  return <div className="pgx-qrow" data-testid={`plugins-menu-row-${p.id}`}><PluginTile id={p.id} size="sm" />
    <span className="pgx-rt"><b>{p.name}{p.tag && <span className="pgx-tag pgx-tag-warn">{p.tag}</span>}</b><small>{sub}</small></span>{right}</div>;
}
