/**
 * Plugins (2026-11-01 redesign): "Bring your own workflow". A plugin is a folder (plugins/<id>/: plugin.json, a ComfyUI workflow in API format,
 * node-map.json); after a restart it shows up in its tab next to the built-in ones (server shared/pluginPlacement.ts), runs for real on your own ComfyUI and
 * gives a sample result everywhere else. The page: a plain-words hero, how it works (folder → app), the installed plugins as cards (what it
 * makes, input → output, where it runs, licence, author, Plugin badge, Runs code, on/off, Open), the real sample files, and the built-in apps.
 * Layout: the user's pick "A" (2026-11-01): hero beside the flow, the cards, the files beside the small print, the built-ins.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { listTools, type ToolInfo } from '../../api';
import { Link } from '../../platform/router';
import { Notice } from '../../shared/Notice';
import { PluginBadge } from '../../shared/PluginBadge';
import { tip } from '../../shared/Tooltip';
import { repoDoc } from '../../shared/brand';
import { ToolIconFor } from '../Icons';
import { Code } from './Page';
import { pluginHref, pluginLine, TAB_LABEL, type PluginTab } from '../../../../server/src/shared/pluginPlacement';
import { toolPage } from '../../../../server/src/shared/pages';
import './plugins.css';

/** GET /api/plugins row (older servers omit the placement fields). */
type P = { id: string; ok: boolean; errors?: string[]; warnings?: string[]; toolId?: string; name?: string; description?: string | null; version?: string | null; icon?: string | null;
  homepageUrl?: string | null; enabled?: boolean; tab?: PluginTab | null; category?: string | null; goal?: string | null; author?: string | null; input?: 'image' | 'video' | null;
  output?: 'image' | 'video' | null; runsCode?: boolean; license?: { id: string; name: string } | null };

const SAMPLE_PLUGIN = `{
  "schema": 1,
  "id": "my-look",
  "name": "My Look",
  "tab": "image",
  "category": "edit",
  "goal": "create",
  "author": "Your name",
  "description": "Restyle a photo with my own ComfyUI workflow.",
  "input": "image",
  "output": "image",
  "inputs": { "prompt": true, "resolutions": ["720p", "1080p"] },
  "presets": [
    { "id": "default", "label": "My look", "prompt": "soft film look" }
  ],
  "license": { "id": "mit" },
  "components": [
    { "kind": "model", "name": "My model", "license": "mit",
      "url": "https://example.com/my-model" }
  ],
  "pricing": { "gpuSecPerSec": { "720p": 4, "1080p": 8 } },
  "workflow": "workflow.json",
  "nodeMap": "node-map.json"
}`;
const SAMPLE_MAP = `{
  "inputs": {
    "image": { "node": "1", "field": "image" },
    "prompt": { "node": "6", "field": "text" },
    "seed": { "node": "9", "field": "seed" }
  },
  "output": { "node": "11" }
}`;

const Glyph = ({ d, size = 22 }: { d: string; size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
const FOLDER = 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z';
const RESTART = 'M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4';
const APP = 'M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 9h16M8 13h5M8 16h8';
const STEPS: { icon: string; title: string; line: ReactNode }[] = [
  { icon: FOLDER, title: 'Drop in a folder', line: <>Your ComfyUI workflow, a <code>node-map.json</code> and a <code>plugin.json</code> in <code>plugins/&lt;id&gt;/</code>.</> },
  { icon: RESTART, title: 'Restart the app', line: 'It checks the folder on start and lists anything to fix right here.' },
  { icon: APP, title: 'It shows up next to the built-in ones', line: 'In its tab’s menu, on the Workflows page and in search, with a Plugin badge.' },
];
/** How it works: folder → app, three steps on a vertical rail. */
function Flow() {
  return <ol className="plx-flow" data-testid="plugins-howto">{STEPS.map((s, i) => <li key={s.title} className="plx-step">
    <span className="plx-step-ic"><Glyph d={s.icon} /><i>{i + 1}</i></span>
    <span className="plx-step-t"><b>{s.title}</b><small>{s.line}</small></span></li>)}</ol>;
}
/** The honest small print, said once. */
function Honest() {
  return <ul className="plx-honest" data-testid="plugins-honest">
    <li><b>Runs on your own ComfyUI.</b> Install the workflow’s custom nodes and models there first.</li>
    <li><b>Anywhere else you get a sample</b> and the exact workflow a real run would send. Nothing is billed.</li>
    <li><b>Not on Comfy Cloud yet.</b> A plugin’s workflow only runs on your own ComfyUI for now.</li>
    <li><b>Runs code</b> means the folder ships a handler that runs inside the app. Only add folders you trust.</li>
  </ul>;
}
const KIND: Record<string, string> = { image: 'Photo', video: 'Clip' };
/** "Clip → Clip": what goes in and what comes out. */
const io = (p: P) => p.input ? `${KIND[p.input]} → ${KIND[p.output ?? p.input]}` : null;

/** One installed plugin: what it makes, in → out, where it runs and where it shows up, licence, author, badge, on/off, Open. */
function PluginCard({ p, tool }: { p: P; tool?: ToolInfo }) {
  const name = p.name || p.id; const errs = p.errors ?? []; const warns = p.warnings ?? []; const failed = p.ok === false || errs.length > 0;
  const [on, setOn] = useState(p.enabled !== false); const [busy, setBusy] = useState(false); const [tErr, setTErr] = useState('');
  const toggle = async () => { if (busy) return; const next = !on; setOn(next); setBusy(true); setTErr('');
    try { const r = await fetch(`/api/plugins/${encodeURIComponent(p.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: next }) });
      if (!r.ok) throw new Error(String(r.status)); const j = await r.json().catch(() => ({})); if (typeof j.enabled === 'boolean') setOn(j.enabled); }
    catch { setOn(!next); setTErr(next ? 'Couldn’t turn it on. Try again.' : 'Couldn’t turn it off. Try again.'); } finally { setBusy(false); } };
  const like = { id: p.toolId ?? p.id, name, description: p.description ?? '', route: tool?.route, plugin: { id: p.id, tab: p.tab, category: p.category, input: p.input ?? undefined } };
  const open = p.toolId ? (p.tab ? pluginHref(like) : tool?.route ?? toolPage(p.toolId)) : null;
  const where = p.tab ? `${TAB_LABEL[p.tab]}${p.category ? ` › ${p.category[0].toUpperCase()}${p.category.slice(1)}` : ''}` : 'Plugins page only';
  const st = failed ? ['err', 'Needs a fix'] : !on ? ['off', 'Off'] : ['ok', 'On'];
  return <article className={`plx-card${failed ? ' is-failed' : ''}${!on ? ' is-off' : ''}`} data-testid={`plugin-${p.id}`}>
    <header className="plx-card-head">
      <span className="plx-card-ic" aria-hidden>{p.icon ? <img src={p.icon} alt="" /> : p.toolId ? <ToolIconFor id={p.toolId} size={22} /> : name.slice(0, 1)}</span>
      <span className="plx-card-t"><b>{name}<PluginBadge b={{ author: p.author ?? null, licence: p.license?.name ?? 'Unknown licence', runsCode: !!p.runsCode }} /></b>
        <small>{p.author ? `by ${p.author}` : 'Author not given'}{p.version ? ` · v${p.version}` : ''}</small></span>
      {st[0] !== 'ok' && <span className={`plx-st plx-st-${st[0]}`}>{st[1]}</span>}
    </header>
    <p className="plx-card-line">{p.description ? pluginLine(like) : 'No description in this plugin’s manifest.'}</p>
    <div className="plx-chips">
      {io(p) && <span className="plx-chip plx-chip-io" {...tip('What goes in and what comes out')}>{io(p)}</span>}
      <span className="plx-chip plx-chip-here" {...tip('Runs on your own ComfyUI; a sample anywhere else')}><Glyph size={13} d="M4 6h16v10H4zM2 20h20" />Your computer</span>
      <span className="plx-chip" {...tip('Where it shows up in the app')}>{where}</span>
      {p.license && <Link className="plx-chip plx-chip-lic" to={`/licenses#${encodeURIComponent(p.license.id)}`}>{p.license.name}</Link>}
      {p.runsCode && <span className="plx-chip plx-chip-code" {...tip('Its folder ships a handler: code that runs inside the app')}>Runs code</span>}
    </div>
    <footer className="plx-card-foot">
      <label className="plx-switch"><button type="button" role="switch" aria-checked={on} aria-label={`${name} plugin`} className={`plug-sw ${on ? 'on' : ''}`} data-testid={`plugin-toggle-${p.id}`} disabled={busy || failed} onClick={toggle}><i /></button>
        <span>{failed ? 'Fix it, then restart the app' : on ? 'Shows in the app' : 'Hidden from the app'}</span></label>
      <span className="plx-card-links">{p.homepageUrl && <a href={p.homepageUrl} target="_blank" rel="noreferrer">Homepage ↗</a>}
        {open && on && !failed && <Link className="btn plx-open" to={open} data-testid={`plugin-open-${p.id}`}>Open</Link>}</span>
    </footer>
    {tErr && <Notice as="p" kind="error" tone="line" className="plug-tg-err">{tErr}</Notice>}
    {(errs.length > 0 || warns.length > 0) && <ul className="plug-issues">{errs.map((e, i) => <li key={'e' + i} className="err">{e}</li>)}{warns.map((w, i) => <li key={'w' + i} className="helper">{w}</li>)}</ul>}
  </article>;
}
function Installed({ ps, tools }: { ps: P[] | null; tools: ToolInfo[] }) {
  return <div className="plx-cards" data-testid="plugins-grid" aria-busy={!ps}>
    {!ps && <div className="plx-card plx-ph shimmer" aria-hidden />}
    {(ps ?? []).map((p) => <PluginCard key={p.id} p={p} tool={tools.find((t) => t.id === p.toolId)} />)}
    {ps && !ps.length && <div className="plx-card plx-empty"><b>No plugins yet</b><p>Add a folder with the sample files below and restart the app.</p></div>}
  </div>;
}
/** The real sample files, one at a time, each copyable. */
function Sample() {
  const [f, setF] = useState<'plugin' | 'map'>('plugin');
  return <div className="plx-sample" data-testid="plugins-sample">
    <div className="plx-tabs" role="tablist" aria-label="Sample files">{([['plugin', 'plugin.json'], ['map', 'node-map.json']] as const).map(([k, l]) =>
      <button key={k} type="button" role="tab" aria-selected={f === k} className={f === k ? 'on' : ''} onClick={() => setF(k)} data-testid={`plugins-sample-${k}`}>{l}</button>)}
      <small>plugins/my-look/{f === 'plugin' ? 'plugin.json' : 'node-map.json'}{f === 'map' ? ' · node ids from your workflow.json' : ''}</small></div>
    <Code>{f === 'plugin' ? SAMPLE_PLUGIN : SAMPLE_MAP}</Code>
    <p className="plx-fine"><code>tab</code> is image, video, audio or 3d; <code>category</code> is one of that tab’s groups (video: create, edit, motion, camera, apps). <a href={repoDoc('docs/PLUGINS.md')} target="_blank" rel="noreferrer">Every field ↗</a></p>
  </div>;
}
const MEDIA: [string, string][] = [['image', 'Image'], ['video', 'Video'], ['audio', 'Audio'], ['3d', '3D']];
const mediumOf = (t: ToolInfo): string => t.media ?? (/^(three-d|plan-a-shot|make-it-real)/.test(t.id) ? '3d' : t.app?.input === 'video' ? 'video' : 'image');
/** The apps that come with the app, by tab, each name once per tab (plugins and hidden tools left out). */
function BuiltIns({ tools, pluginIds }: { tools: ToolInfo[] | null; pluginIds: Set<string> }) {
  const groups = useMemo(() => { const bi = (tools ?? []).filter((t) => !pluginIds.has(t.id) && !t.plugin && (t as any).listed !== false);
    return MEDIA.map(([m, l]) => { const seen = new Set<string>(); return { m, l, list: bi.filter((t) => mediumOf(t) === m && !seen.has(t.name) && seen.add(t.name)).sort((a, b) => a.name.localeCompare(b.name)) }; }).filter((g) => g.list.length); }, [tools, pluginIds]);
  const n = groups.reduce((a, g) => a + g.list.length, 0);
  return <section className="plx-builtins" data-testid="plugins-builtins" aria-busy={!tools}>
    <div className="plx-sec-h"><h2>Built-in apps<span>{tools ? ` · ${n}` : ''}</span></h2><p>These come with the app. A plugin joins them the same way.</p></div>
    {!tools ? <div className="plx-bi-ph shimmer" aria-hidden /> : <div className="plx-bi">{groups.map((g) => <div key={g.m} className="plx-bi-g"><b>{g.l}<span>{g.list.length}</span></b>
      <div className="plx-bi-list">{g.list.map((t) => <Link key={t.id} to={t.route ?? toolPage(t.id)} className="plx-bi-chip"><ToolIconFor id={t.id} ui={t.ui} size={14} />{t.name}</Link>)}</div></div>)}</div>}
  </section>;
}
function Hero() {
  return <header className="plx-hero">
    <span className="wn-brand">Plugins</span>
    <h1 className="plx-h1">Bring your own workflow</h1>
    <p className="plx-lede">Drop a folder in and your workflow shows up in the app, next to the built-in ones. It runs for real on your own ComfyUI.</p>
    <div className="plx-tech" aria-label="What a plugin is made of"><span>ComfyUI workflow</span><span>plugin.json</span><span>node-map.json</span><span>optional handler</span></div>
  </header>;
}
const Sec = ({ h, p, children, id }: { h: string; p?: string; children: ReactNode; id?: string }) => <section className="plx-sec" id={id}><div className="plx-sec-h"><h2>{h}</h2>{p && <p>{p}</p>}</div>{children}</section>;

export function Plugins() {
  const [ps, setPs] = useState<P[] | null>(null); const [tl, setTl] = useState<ToolInfo[] | null>(null);
  useEffect(() => { listTools().then(setTl).catch(() => setTl([])); }, []);
  useEffect(() => { fetch('/api/plugins').then((r) => (r.ok ? r.json() : [])).then((j) => setPs(Array.isArray(j) ? j : j.plugins ?? [])).catch(() => setPs([])); }, []);
  const tools = tl ?? []; const pluginIds = useMemo(() => new Set((ps ?? []).map((p) => p.toolId ?? p.id)), [ps]);
  const installedH = `Installed${ps ? ` · ${ps.length}` : ''}`;
  /* hero beside the flow, your plugins as cards, the files beside the small print */
  return <div className="xpage plx" data-testid="plugins-page">
    <div className="plx-top"><Hero /><div className="plx-top-flow"><Flow /></div></div>
    <Sec h={installedH} p="Each one is a workflow in the app, with its own Plugin badge."><Installed ps={ps} tools={tools} /></Sec>
    <Sec h="Make your own" p="Copy these two files into a new folder, point them at your workflow, then restart."><div className="plx-make"><Sample /><Honest /></div></Sec>
    <BuiltIns tools={tl} pluginIds={pluginIds} /></div>;
}
