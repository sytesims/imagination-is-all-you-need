import { toolPage } from '../../../../server/src/shared/pages';
import { Notice } from '../../shared/Notice';
import ScrollFade from '../../shared/ScrollFade';
import { ApiEndpoints } from './Backlog';
import { useEffect, useState } from 'react';
import type { ToolInfo } from '../../api';
import { listTools } from '../../api';
import { Link } from '../../platform/router';
import Page, { Code } from './Page';
import MediaArt from '../MediaArt';
import { exampleAt } from '../examples';
import { presetArt, PLACEHOLDER_TITLE } from '../../shared/posterSlots';
import { ToolIconFor } from '../Icons';
import { ApiDocsLinks, ToolTile } from './Live';
import './presets.css'; /* PP: Presets page styles (scoped to .pp-presets) */
export { Mcp } from './Live';
export { default as Community } from './CommunityPage';
export { default as Workflows } from './Workflows';
export { default as Models } from './Models';
export { default as Profile } from './ProfilePage';
export { default as RecipeImport } from './RecipeImport';

const API: [string, string, string][] = [
  ['GET', '/api/tools', 'Tool registry: ids, models (one per model, with where each runs and its from-price), presets, limits, licences'],
  ['GET', '/api/tools/:id/price', 'Price for model, runOn (auto, local, comfy-cloud, fal…), quality, duration, passes, types'],
  ['POST', '/api/tools/:id/jobs', 'Start a job (multipart form: model, runOn, video, refs, prompt, seed…)'],
  ['GET', '/api/models/resolve?toolId=&model=', 'A model key or an old engine id → the model, engine and run-on for a tool'],
  ['GET · PUT', '/api/me/routing', 'Where each model runs, per tool (perTool), and Local / fallback switches'],
  ['GET', '/api/jobs', 'List jobs (optionally ?toolId=)'],
  ['GET', '/api/jobs/:id', 'Job state, progress, outputs, errors'],
  ['POST', '/api/jobs/:id/cancel', 'Cancel while queued'],
  ['GET', '/api/jobs/:id/support', 'Support bundle for a failed job'],
  ['DELETE', '/api/jobs/:id/share', 'Revoke a share link'],
  ['POST', '/api/jobs/:id/favourite', 'Favourite / unfavourite'],
  ['POST', '/api/jobs/:id/project', 'Move to a project'],
  ['POST', '/api/jobs/:id/restore', 'Restore from Trash'],
  ['DELETE', '/api/jobs/:id', 'Move to Trash'],
  ['GET', '/api/assets?section=', 'Assets: all, favourites, trash, project:<id>'],
  ['GET · POST', '/api/projects', 'List / create projects'], ['DELETE', '/api/projects/:id', 'Delete project'],
  ['GET · POST', '/api/media', 'Media library (uploads, samples, generations, liked) / upload'],
  ['GET', '/api/media/thumb?url=', 'Thumbnail for a media URL'],
  ['GET', '/api/examples', 'Recreate examples'], ['GET', '/api/examples/:id/prefill', 'Everything needed to prefill a tool'],
  ['GET', '/api/models?toolId=&q=&model=', 'Model cards per tool'],
  ['POST', '/api/mentions/validate', 'Validate @mentions against attached media'],
  ['GET', '/api/ledger', 'Team balance ledger (amounts in cents): charges, refunds, grants'], ['GET', '/api/usage', 'Usage summary'],
  ['GET', '/api/plugins', 'Installed plugins'], ['GET', '/api/roadmap', 'Upcoming tools'],
];

/** Driven by GET /api/config `hosted`: true = this API is reachable by other people, false = local-only install. */
function ApiExposure() {
  const [hosted, setHosted] = useState<boolean | null | undefined>(undefined);
  useEffect(() => { fetch('/api/config').then(r => r.json()).then(c => setHosted(typeof c.hosted === 'boolean' ? c.hosted : null)).catch(() => setHosted(null)); }, []);
  if (hosted === undefined) return <div className="api-expo api-expo-hold" aria-hidden />; /* holds the line's height while the config loads, so the links below don't jump */
  if (hosted == null) return null;
  return <div className={`api-expo ${hosted ? 'on' : 'off'}`} role="status" data-testid="api-exposure" data-hosted={String(hosted)}><span className="api-expo-dot" aria-hidden />
    {hosted ? <><b>Public API exposed</b><span className="helper">This install is hosted, so other people can reach this API. Requests need an API key.</span></> : <><b>Local only</b><span className="helper">This API isn’t exposed publicly. Only this machine (and anything you point at it) can call it.</span></>}</div>;
}
export function ApiDocs() {
  return <Page eyebrow="Developers" title="Local REST API" lede="Everything the app does goes through a plain JSON API on your computer. Script it, batch it, or wire it into your own tools.">
    <ApiExposure />
    <ApiDocsLinks />
    <ApiEndpoints />
    <Code>{`curl -s http://localhost:8787/api/tools | jq '.[].id'\ncurl -s -F video=@clip.mp4 -F prompt="replace the mug with a cactus" -F refs=@cactus.png \\\n  http://localhost:8787/api/tools/object-swap/jobs`}</Code>
    <table className="usage-table api-table" hidden><thead><tr><th>Method</th><th>Path</th><th>What it does</th></tr></thead>
      <tbody>{API.map(([m, p, d]) => <tr key={m + p}><td><span className={`meth meth-${m.split(' ')[0].toLowerCase()}`}>{m}</span></td><td><code>{p}</code></td><td className="helper">{d}</td></tr>)}</tbody></table>
  </Page>;
}


/** /api/plugins row. name/description/version/icon/homepageUrl/toolId are optional: older manifests omit them, so every field falls back. */
const titleCase = (id: string) => id.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
function PluginCard({ p }: { p: any }) {
  const id = String(p.id ?? p.dir?.split('/').pop() ?? 'plugin'); const name = p.name || titleCase(id);
  const errs: string[] = Array.isArray(p.errors) ? p.errors : []; const warns: string[] = Array.isArray(p.warnings) ? p.warnings : [];
  // GAP 26: on/off without a restart (POST /api/plugins/:id {enabled}); optimistic, rolled back on failure
  const [on, setOn] = useState<boolean>(p.enabled !== false); const [busy, setBusy] = useState(false); const [tErr, setTErr] = useState('');
  const failed = p.ok === false || errs.length > 0;
  const toggle = async () => { if (busy) return; const next = !on; setOn(next); setBusy(true); setTErr('');
    try { const r = await fetch(`/api/plugins/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: next }) });
      if (!r.ok) throw new Error(String(r.status)); const j = await r.json().catch(() => ({})); if (typeof j.enabled === 'boolean') setOn(j.enabled); }
    catch { setOn(!next); setTErr(next ? 'Couldn’t turn it on. Try again.' : 'Couldn’t turn it off. Try again.'); } finally { setBusy(false); } };
  const st = failed ? ['err', 'Failed to load'] : !on ? ['off', 'Off'] : ['ok', 'Loaded'];
  const tool = p.toolId ? toolPage(p.toolId) : null;
  return <div className="xcard plug-card" data-testid={`plugin-${id}`}>
    <div className="plug-head">{p.icon ? <img className="plug-ic" src={p.icon} alt="" /> : <span className="plug-ic plug-ic-fb" aria-hidden>{name.slice(0, 1)}</span>}
      <b>{name}</b><span className={`plug-st plug-${st[0]}`}>{st[1]}</span></div>
    <p className={p.description ? 'helper' : 'helper plug-fb'}>{p.description || 'No description in this plugin’s manifest.'}</p>
    <div className="plug-meta"><span className="xpill">{p.version ? `v${p.version}` : 'unversioned'}</span><code>{id}</code>
      {tool && on && !failed && <Link to={tool}>Open app →</Link>}{p.homepageUrl && <a href={p.homepageUrl} target="_blank" rel="noreferrer">Homepage</a>}</div>
    <div className={`plug-tg ${on ? 'on' : ''}`}><span id={`plug-tg-${id}`}>{failed ? 'Fix the errors below, then restart the server' : on ? 'On · its app shows in the menus' : 'Off · its app is hidden'}</span>
      <button type="button" role="switch" aria-checked={on} aria-label={`${name} plugin`} aria-describedby={`plug-tg-${id}`} className={`plug-sw ${on ? 'on' : ''}`} data-testid={`plugin-toggle-${id}`} disabled={busy || failed} onClick={toggle}><i /></button></div>
    {tErr && <Notice as="p" kind="error" tone="line" className="plug-tg-err">{tErr}</Notice>}
    {(errs.length > 0 || warns.length > 0) && <ul className="plug-issues">{errs.map((e, i) => <li key={'e' + i} className="err">{e}</li>)}{warns.map((w, i) => <li key={'w' + i} className="helper">{w}</li>)}</ul>}
  </div>;
}
/** Two built-in apps with one name (Upscale, Remove Background): the chip says which medium. */
const mediumOf = (t: ToolInfo) => { const m = t.media ?? (t.app?.input === 'video' ? 'video' : t.app?.input ? 'image' : null); return m ? m[0].toUpperCase() + m.slice(1) : t.category || 'Other'; };
const PLUGIN_SAMPLE = `{
  "schema": 1,
  "id": "my-look",
  "name": "My Look",
  "category": "Image",
  "description": "Restyle a photo with my own ComfyUI workflow.",
  "input": "image",
  "output": "image",
  "inputs": { "prompt": true, "resolutions": ["720p", "1080p"] },
  "presets": [{ "id": "default", "label": "My look", "prompt": "soft film look" }],
  "license": { "id": "mit" },
  "components": [{ "kind": "model", "name": "My model", "license": "mit", "url": "https://example.com/my-model" }],
  "pricing": { "gpuSecPerSec": { "720p": 4, "1080p": 8 } },
  "workflow": "workflow.json",
  "nodeMap": "node-map.json"
}`;
const NODE_MAP_SAMPLE = `{
  "inputs": {
    "image": { "node": "1", "field": "image" },
    "prompt": { "node": "6", "field": "text" },
    "seed": { "node": "9", "field": "seed" }
  },
  "output": { "node": "11" }
}`;
export function Plugins() {
  const [ps, setPs] = useState<any[] | null>(null);
  const [tl, setTl] = useState<ToolInfo[] | null>(null); useEffect(() => { listTools().then(setTl).catch(() => setTl([])); }, []);
  useEffect(() => { fetch('/api/plugins').then(r => r.ok ? r.json() : []).then(j => setPs(Array.isArray(j) ? j : j.plugins ?? [])).catch(() => setPs([])); }, []);
  return <Page eyebrow="Extend" title="Plugins" lede="Add your own apps from a ComfyUI workflow. A plugin runs for real on your own ComfyUI, and gives a sample result everywhere else.">
    <div className="xgrid3" data-testid="plugins-grid" aria-busy={!ps}>{!ps && <div className="xcard plug-card plug-ph shimmer" aria-hidden />}{(ps ?? []).map((p, i) => <PluginCard key={p.id ?? i} p={p} />)}
      {ps && !ps.length && <div className="xcard xcard-empty"><b>No plugins installed</b><p className="helper">No plugins yet. The minimal plugin below shows how to add your own.</p></div>}</div>
    <h2 className="xh2">Add your own</h2>
    <ol className="pl-steps" data-testid="plugins-howto">
      <li><b>Make a plugin folder</b> next to the Cutout plugin that ships with the app, and give it a short id.</li>
      <li><b>Describe the app</b> in <code>plugin.json</code>: name, category, input, presets and licence. Add the ComfyUI workflow (API format) and a <code>node-map.json</code> that says which node gets your file, prompt, seed and settings.</li>
      <li><b>Restart the app.</b> The plugin is checked on start: it shows here with a Loaded badge, or with the errors to fix.</li>
      <li><b>Open it like any app.</b> On your own ComfyUI it runs for real (install the workflow’s custom nodes and models first). Without it you get a sample result and the workflow it would send.</li>
    </ol>
    <h2 className="xh2">Minimal plugin</h2>
    <p className="helper"><code>plugins/my-look/plugin.json</code></p>
    <Code>{PLUGIN_SAMPLE}</Code>
    <p className="helper"><code>plugins/my-look/node-map.json</code> (node ids from your <code>workflow.json</code>)</p>
    <Code>{NODE_MAP_SAMPLE}</Code>
    {/* BH12: the tools that ship with the app, from the live tool list (plugin tools excluded) */}
    {(() => { const pids = new Set((ps ?? []).map(p => p.toolId ?? p.id)); const bi = (tl ?? []).filter(t => !pids.has(t.id) && (t as any).listed !== false); if (tl && !bi.length) return null;
      const dup = (n: string) => bi.filter(t => t.name === n).length > 1; const label = (t: ToolInfo) => dup(t.name) ? `${t.name} · ${mediumOf(t)}` : t.name;
      const cats = [...new Set(bi.map(t => t.category || 'Other'))];
      return <section className="pl-builtins" data-testid="plugins-builtins" aria-busy={!tl}><h2 className="xh2">Built-in{tl ? <span className="helper"> · {bi.length} apps</span> : null}</h2>
        <p className="helper">These come with the app. A plugin adds an app to this list the same way.</p>
        {!tl ? <div className="pl-bi-ph shimmer" aria-hidden /> : cats.map(c => <div key={c} className="pl-bi-row"><b className="pl-bi-c">{c}</b><div className="pl-bi-list">{bi.filter(t => (t.category || 'Other') === c).map(t => <Link key={t.id} to={t.route ?? toolPage(t.id)} className="chip pl-bi-chip">{label(t)}</Link>)}</div></div>)}</section>; })()}
  </Page>;
}

export function Presets({ tools }: { tools: ToolInfo[] }) {
  /* Page 16: GET /api/presets?source=&sort=&toolId=&media=&category=&q=&cursor= → {items[{id,toolId,label,mode,posterUrl,previewWebm,previewUrl,refThumbs[],uses,prefill}], nextCursor, communityAvailable, note, categories[], byTool{}}. Falls back to the tool registry.
     PP (Page Polisher): HF-style uniform poster grid, tool tabs, one filter row, label on the card; styles live in ./presets.css under .pp-presets. */
  type P = { id: string; toolId: string; toolName?: string; label: string; group?: string; category?: string; mode?: string | null; posterUrl?: string | null; previewWebm?: string | null; previewUrl?: string | null; refThumbs?: string[]; uses?: number; isNew?: boolean };
  const [src, setSrc] = useState<'ours' | 'trending' | 'new'>('ours'); const [toolId, setToolId] = useState(''); const [q, setQ] = useState(''); const [dq, setDq] = useState('');
  const [media, setMedia] = useState<'' | 'image' | 'video' | 'audio'>(''); const [cat, setCat] = useState(''); const [cats, setCats] = useState<string[]>([]); const [byTool, setByTool] = useState<Record<string, number> | null>(null);
  const [items, setItems] = useState<P[] | null>(null); const [next, setNext] = useState<string | null>(null); const [note, setNote] = useState(''); const [fallback, setFallback] = useState(false); const [loadErr, setLoadErr] = useState(false); const [tick, setTick] = useState(0); /* B21 B16 */ const [busy, setBusy] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setCat(''); setCats([]); }, [toolId]);
  const qs = (cursor?: string) => new URLSearchParams({ source: src === 'ours' ? 'ours' : 'community', ...(src !== 'ours' ? { sort: src } : {}), ...(toolId ? { toolId } : media ? { media } : {}), ...(toolId && cat ? { category: cat } : {}), ...(dq ? { q: dq } : {}), limit: '40', ...(cursor ? { cursor } : {}) });
  const catOf = (p: P) => String(p.category ?? p.group ?? '');
  const reg = (): P[] => tools.flatMap(t => (t.presets ?? []).filter(p => !/^mode$/i.test(String((p as any).group ?? ''))).map(p => ({ ...(p as any), toolId: t.id, toolName: t.name }))).filter(p => (!toolId || p.toolId === toolId) && (!cat || catOf(p) === cat) && (!dq || p.label.toLowerCase().includes(dq.toLowerCase())));
  useEffect(() => { const c = new AbortController(); setItems(null); setNote(''); setLoadErr(false);
    fetch('/api/presets?' + qs(), { signal: c.signal }).then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status)))).then(j => { setFallback(false); setItems((j.items ?? []).filter((p: any) => p.id !== 'free' && !/^mode$/i.test(String(p.group ?? '')))); setNext(j.nextCursor ?? null); if (src !== 'ours' && j.communityAvailable === false) setNote(j.note || 'No community looks yet.');
        if (toolId && !cat) setCats(((j.categories ?? []) as string[]).filter(k => !/^(mode|trending|new)$/i.test(k) && !/^[a-z0-9]+$/.test(k)));
        if (!toolId && !media && !dq && src === 'ours' && j.byTool) setByTool(j.byTool); })
      .catch(e => { if (e.name === 'AbortError') return; const r = src === 'ours' ? reg() : []; setFallback(r.length > 0); setLoadErr(!r.length); setItems(r); setNext(null); if (!r.length) setNote('Couldn’t load looks'); });
    return () => c.abort(); }, [src, toolId, media, cat, dq, tick]);
  const more = () => { if (!next || busy) return; setBusy(true); fetch('/api/presets?' + qs(next)).then(r => r.json()).then(j => { setItems(xs => [...(xs ?? []), ...(j.items ?? [])]); setNext(j.nextCursor ?? null); }).finally(() => setBusy(false)); };
  const toolsWith = tools.filter(t => (t.presets ?? []).length > 0 && (!byTool || (byTool[t.id] ?? 0) > 0));
  const route = (id: string) => tools.find(t => t.id === id)?.route ?? toolPage(id);
  /* Stand-in art: the server marks it, or it is one of the interim diagram posters in /samples/presets/ (they carry baked-in text). Those get a branded tile instead. */
  const hash = (s: string) => { let h = 7; for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) >>> 0; return h; };
  const chips: [string, string][] = toolId ? [['', 'All'], ...cats.map(k => [k, k] as [string, string])] : [['', 'All'], ['image', 'Image'], ['video', 'Video'], ['audio', 'Audio']];
  const chipOn = (k: string) => (toolId ? cat : media) === k;
  const pickChip = (k: string) => (toolId ? setCat(k) : setMedia(k as typeof media));
  return <div className="page presets-page pp-presets" data-testid="presets">
    <header className="pp-presets-head"><h1 className="pp-presets-h">Looks</h1><p className="pp-presets-lede">Ready-made looks, moves and scenes for every workflow. Pick one and it opens ready to go.</p></header>
    <section className="pp-presets-panel">
    <div className="pp-presets-top">
      <ScrollFade className="pp-presets-tabs-wrap"><div className="pp-presets-tabs" role="tablist" aria-label="Tool">
        <button type="button" role="tab" aria-selected={!toolId} data-testid="pre-tool-all" className={`pp-presets-tab ${!toolId ? 'on' : ''}`} onClick={() => setToolId('')}>All workflows</button>
        {toolsWith.map(t => <button key={t.id} type="button" role="tab" aria-selected={toolId === t.id} data-testid={`pre-tool-${t.id}`} className={`pp-presets-tab ${toolId === t.id ? 'on' : ''}`} onClick={() => setToolId(t.id)}>
          <ToolIconFor id={t.id} ui={(t as any).ui} size={20} />{t.name}{byTool?.[t.id] ? <span className="pp-presets-count">{byTool[t.id]}</span> : null}</button>)}
      </div></ScrollFade>
      <label className="pp-presets-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input type="search" placeholder="Search looks..." aria-label="Search looks" data-testid="pre-q" value={q} onChange={e => setQ(e.target.value)} /></label>
    </div>
    <div className="pp-presets-bar">
      <ScrollFade className="pp-presets-chips-wrap"><div className="pp-presets-chips" role="group" aria-label={toolId ? 'Category' : 'Media'}>
        {chips.map(([k, l]) => <button key={k || 'all'} type="button" aria-pressed={chipOn(k)} data-testid={`pre-chip-${k || 'all'}`} className={`pp-presets-chip ${chipOn(k) ? 'on' : ''}`} onClick={() => pickChip(k)}>{l}</button>)}
      </div></ScrollFade>
      <div className="pp-presets-src" role="tablist" aria-label="Source">{([['ours', 'Ours'], ['trending', 'Community trending'], ['new', 'Community new']] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={src === k} data-testid={`pre-src-${k}`} className={`pp-presets-seg ${src === k ? 'on' : ''}`} onClick={() => setSrc(k)}>{l}</button>)}</div>
    </div>
    {fallback && <p className="pp-presets-note">Showing the built-in looks while the rest load.</p>}
    {!items ? <div className="pp-presets-grid" aria-busy="true">{Array.from({ length: 10 }, (_, i) => <div key={i} className="pp-presets-shim" />)}</div>
      : !items.length ? <div className="pp-presets-empty" data-testid="pre-empty"><b>{note || (loadErr || (fallback && !q.trim() && !toolId) ? 'Looks didn’t load.' : q.trim() ? `No looks match “${q.trim()}”.` : 'No looks match')}</b>{loadErr ? <><p>That didn’t load. Try again in a moment.</p><button type="button" className="btn" data-testid="pre-retry" onClick={() => setTick(t => t + 1)}>Try again</button></> : <p>{src !== 'ours' ? 'Looks you and others share will show up here.' : 'Try another search or workflow.'}</p>}</div>
      : <div className="pp-presets-grid" data-testid="pre-grid">{items.map(p => {
          const art = presetArt(p); const rawPoster = p.posterUrl || (p.previewUrl && /\.(jpe?g|png|webp)$/i.test(p.previewUrl) ? p.previewUrl : null);
          const stub = art.marked || !rawPoster || /\/samples\/presets\//.test(rawPoster); const poster = stub ? null : rawPoster;
          const loop = stub ? null : (p as any).loopUrl || p.previewWebm || (p.previewUrl && /\.(mp4|webm)$/i.test(p.previewUrl) ? p.previewUrl : null);
          const c = catOf(p) || p.mode || ''; const tName = p.toolName ?? tools.find(t => t.id === p.toolId)?.name ?? ''; const v = hash(c || p.toolId) % 6; const m = hash(p.toolId) % 4; const s = hash(p.id) % 5;
          return <article key={p.toolId + p.id} className="pp-presets-card" data-testid={`pre-card-${p.id}`} onMouseEnter={e => e.currentTarget.querySelector('video')?.play().catch(() => 0)} onMouseLeave={e => e.currentTarget.querySelector('video')?.pause()}>
            <div className="pp-presets-media">
              {poster ? <img src={poster} alt="" loading="lazy" /> : <span className={`pp-presets-tile v${v} m${m} s${s}`} aria-hidden><i className="pp-presets-glyph"><ToolIconFor id={p.toolId} size={22} strokeWidth={1.4} /></i></span>}
              {loop && <video src={loop} poster={poster ?? undefined} muted loop playsInline preload="none" aria-hidden />}
              <span className="pp-presets-shade" aria-hidden />
              {(toolId ? c : tName) && <span className="pp-presets-tag">{!toolId && <ToolIconFor id={p.toolId} size={14} />}{toolId ? c : tName}</span>}
              {typeof p.uses === 'number' && p.uses > 0 && <span className="pp-presets-uses" title="Times used"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" /><path d="M18 3v4h-4M6 21v-4h4" /></svg>{p.uses.toLocaleString()}</span>}
              {(p.refThumbs?.length ?? 0) > 0 && <span className="pp-presets-refs">{p.refThumbs!.slice(0, 3).map(u => <img key={u} src={u} alt="" />)}</span>}
              <span className="pp-presets-cap"><b className="pp-presets-label">{p.label}</b></span>
              <a className="pp-presets-recreate" data-testid={`pre-recreate-${p.id}`} href={`${route(p.toolId)}?recreatePreset=${encodeURIComponent(p.id)}`} aria-label={`Recreate ${p.label} in ${tName}`}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg><span className="pp-presets-rc-t">Recreate</span></a>
            </div></article>; })}
        </div>}
    {next && <div className="pp-presets-more"><button type="button" className="btn pp-presets-morebtn" data-testid="pre-more" disabled={busy} onClick={more}>{busy ? 'Loading…' : 'Show more'}</button></div>}
    </section>
  </div>;
}

