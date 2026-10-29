import { toolOpenHref } from '../../shared/workflowLinks';
import { Notice } from '../../shared/Notice';
import { InlineError, useLoad, getJSON } from '../../shared/InlineError';
import { Skeleton } from '../../shared/Skeleton';
import { communityHref, isSample, sampleLabel } from '../../shared/sample';
import { useEffect, useRef, useState } from 'react';
import type { ToolInfo } from '../../api';
import { Link, navigate } from '../../platform/router';
import Page, { Code, useTabs } from './Page';
import { ToolIconFor } from '../Icons';
import ExampleCard from '../b1/ExampleCard';

/** Registry fields from Platform items 17–19 (typed loosely until api.ts adds them). */
export type Media = 'image' | 'video' | 'audio';
export type Badge = 'new' | 'free' | 'top';
export const mediaOf = (t: any): Media => t?.media ?? 'video';
export const badgeOf = (t: any): Badge | null => t?.badge ?? null;
import { StandInArt } from '../../shared/StandInArt';
import { repoDoc, MCP_SERVER_KEY } from '../../shared/brand';
export const posterOf = (t: any) => t?.posterUrl ?? (t?.id && !t?.posterStandIn ? `/api/posters/${t.id}.jpg` : undefined); // posterStandIn: no art yet, the branded stand-in shows (no 404)
export const BadgePill = ({ b }: { b: Badge | null }) => b ? <span className={`nb nb-${b}`}>{b === 'new' ? 'New' : b === 'free' ? 'Free' : 'Top'}</span> : null;

function useJson<T>(url: string | null) {
  const { data, error, loading, retry } = useLoad<T | null>(sig => url ? getJSON<T>(url, sig) : Promise.resolve(null), [url]);
  return { d: data, err: error, loading, retry };
}
const Poster = ({ src, alt, ratio = '16/10' }: { src?: string; alt: string; ratio?: string }) =>
  <div className="poster" style={{ aspectRatio: ratio }}>{src && <img src={src} alt={alt} loading="lazy" onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />}</div>;

export function ToolTile({ t }: { t: any }) {
  return <Link to={toolOpenHref(t)} className="app-tile">{/* One Video page: a video tool's tile opens its workflow there */}{t.posterStandIn && !t.posterUrl ? <div className="poster" style={{ aspectRatio: '16/10', position: 'relative' }}><StandInArt id={t.id} toolId={t.id} group={t.category} /></div> : <Poster src={posterOf(t)} alt={t.name} />}<div className="app-meta"><ToolIconFor id={t.id} ui={t.ui} size={15} /><b>{t.name}</b><BadgePill b={badgeOf(t)} />{t.freeGensCovered && <span className="fg-hint">Free gens</span>}</div><p className="helper">{(t.description ?? '').split('.')[0]}.</p></Link>;
}

const LEDE: Record<Media, string> = { image: 'Generate and edit stills. Open weights by default, hosted models when you want them.', video: 'Swap, restyle, re-shoot and move the camera on real footage.', audio: 'Soundtracks and sound design for your clips.' };
/** /image, /video, /audio: real data from GET /api/browse/:media. */
export function Browse({ media }: { media: Media }) {
  const { d, err, retry } = useJson<{ tools: any[] }>(`/api/browse/${media}`);
  return <Page eyebrow="Browse" title={media[0].toUpperCase() + media.slice(1)} lede={LEDE[media]}>
    {/* B34: the tile list loads late; its slot fills the first screen so the footer never jumps up into view and back */}<div className="br-body">
    {!!err && <InlineError what={`${media} tools`} error={err} onRetry={retry} />}
    {!d && !err && <Skeleton variant="tiles" count={8} className="apps-grid" label={`Loading ${media} tools`} />}
    {d && <div className="apps-grid">{d.tools.map(t => <ToolTile key={t.id} t={t} />)}{!d.tools.length && <div className="xcard xcard-empty"><b>No {media} tools yet</b></div>}</div>}
    </div>
  </Page>;
}


const COPY = async (s: string, set: (b: boolean) => void) => { try { await navigator.clipboard.writeText(s); set(true); setTimeout(() => set(false), 1500); } catch { /* ignore */ } };
function CopyCode({ label, code }: { label: string; code: string }) {
  const [ok, setOk] = useState(false);
  void ok; void setOk; /* B19 (P13): one Copy per snippet, the one inside the code block */
  return <div className="copy-code"><div className="copy-head"><b>{label}</b></div><Code>{code}</Code></div>;
}
const MCP_URL = 'http://127.0.0.1:8788/mcp';
const STDIO_FALLBACK = `{ "mcpServers": { "${MCP_SERVER_KEY}": { "command": "node", "args": ["/path/to/openhiggsfield/mcp/dist/index.js"], "env": { "OPENHIGGSFIELD_API": "http://localhost:8787" } } } }`;
/** /mcp: server URL + Claude / Cursor snippets (from README). */
/* B20 (P13): prompts grouped by task; each opens the matching tool ("Try in app"). The tool route comes from the live registry. */
const MCP_TASKS: [string, [string, string][]][] = [
  ['Video', [['Make a 5 s clip of a fox in snow, then upscale it', 'h3-video'], ['Swap the car in clip.mp4 for a red vintage bus', 'object-swap'], ['Restyle my video as a watercolour', 'restyle'], ['Push the camera in slowly on my photo', 'camera']]],
  ['Image', [['Generate 4 product shots of my bottle on marble', 'app-product-shot'], ['Remove the background from logo.png', 'remove-bg'], ['Upscale this photo to 4x', 'image-upscale']]],
  ['Audio', [['Write a voiceover for this script and add music', 'voice'], ['Make a 30 s calm piano track for my clip', 'soundtrack']]],
  ['Library', [['List the open-weights models I can run locally', '/licenses'], ['Show my last five finished videos', '/assets']]],
];
type McpState = 'checking' | 'up' | 'down';
/** Asks the MCP server's own health route (GET <origin>/health, CORS-enabled, read-only) from this browser.
 *  If the browser can't read it, the app server's self-host check (mcp.reachable) answers instead. */
function useMcpUp(url: string | null) {
  const [st, setSt] = useState<McpState>('checking'); const [n, setN] = useState(0); const [at, setAt] = useState<Date | null>(null); const [ver, setVer] = useState<string | null>(null);
  useEffect(() => { if (!url) return; let live = true; setSt('checking'); const c = new AbortController(); const t = setTimeout(() => c.abort(), 4000);
    let health: string; try { health = new URL('/health', url).href; } catch { health = url; }
    const done = (up: boolean, v?: string | null) => { if (!live) return; setSt(up ? 'up' : 'down'); setVer(up && v && v !== 'unknown' ? v : null); setAt(new Date()); };
    fetch(health, { cache: 'no-store', signal: c.signal }).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(j => done(j?.ok === true, j?.version))
      .catch(() => fetch('/api/health/self-host', { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(h => done(h?.mcp?.reachable === true, h?.mcp?.version)).catch(() => done(false)))
      .finally(() => clearTimeout(t));
    return () => { live = false; clearTimeout(t); c.abort(); }; }, [url, n]);
  return { st, at, ver, recheck: () => setN(x => x + 1) };
}
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
export function Mcp({ tools }: { tools?: ToolInfo[] } = {}) {
  /* Snippets from GET /api/config → mcp (real paths); tools from GET /api/mcp/tools (live list). Constants are fallbacks only. */
  const [cfg, setCfg] = useState<any>(null); const [live, setLive] = useState<{ name: string; title?: string; description?: string }[] | null>(null); const [liveErr, setLiveErr] = useState(false); const [tick, setTick] = useState(0);
  useEffect(() => { fetch('/api/config').then(r => r.ok ? r.json() : null).then(j => setCfg(j?.mcp ?? null)).catch(() => 0); }, []);
  /* GAP 23: the tool list is only ever the server's own (no hard-coded copy that drifts); loading and failure say so. */
  useEffect(() => { setLiveErr(false); fetch('/api/mcp/tools').then(r => r.ok ? r.json() : Promise.reject(r.status)).then(j => { if (Array.isArray(j?.items)) setLive(j.items.filter((t: any) => t.default !== false) /* the default toolset (core); others need OPENHIGGSFIELD_MCP_TOOLSETS */); else setLiveErr(true); }).catch(() => setLiveErr(true)); }, [tick]);
  const httpUrl: string = cfg?.httpUrl ?? MCP_URL; const entry: string | undefined = cfg?.entry; const node: string = cfg?.stdio?.command ?? 'node';
  const STDIO = cfg?.snippets?.stdio ?? (cfg?.stdio ? JSON.stringify({ mcpServers: { [MCP_SERVER_KEY]: cfg.stdio } }, null, 2) : JSON.stringify(JSON.parse(STDIO_FALLBACK), null, 2)); /* B20: same shape as the real one, so the block doesn't grow when the config lands */
  /* B21: local build only (the repo stays private, nothing is published to npm), so no npx toggle */
  const mcp = useMcpUp(cfg ? httpUrl : null);
  const inner = cfg?.stdio ?? null; /* the server's local node command */
  const cursorLink = inner ? `cursor://anysphere.cursor-deeplink/mcp/install?name=${MCP_SERVER_KEY}&config=${encodeURIComponent(b64(JSON.stringify(inner)))}` : null;
  const [ptab, setPtab] = useState(0); const toolRoute = (id: string) => id.startsWith('/') ? id : tools?.find(t => t.id === id)?.route ?? null;
  const CLAUDE_CODE0 = entry ? `claude mcp add ${MCP_SERVER_KEY} -e OPENHIGGSFIELD_API=${cfg?.apiUrl ?? 'http://localhost:8787'} -- ${node} ${entry}` : `claude mcp add ${MCP_SERVER_KEY} -- node /path/to/openhiggsfield/mcp/dist/index.js`;
  const CLAUDE_CODE = CLAUDE_CODE0;
  const STDIO_RUN = STDIO;
  const MCP_TOOLS: [string, string][] = (live ?? []).map(t => [t.name, t.description ?? t.title ?? '']);
  const cmds = cfg?.commands ?? {};
  const CLI0 = [cmds.stdio && `# stdio (clients that launch the server)\n${cmds.stdio}`, cmds.http && `# Streamable HTTP on ${httpUrl}\n${cmds.http}`].filter(Boolean).join('\n\n') || (entry ? `${node} ${entry}\n${node} ${entry} --http` : 'node /path/to/openhiggsfield/mcp/dist/index.js --http');
  const CLI = CLI0;
  const HTTP = `{ "mcpServers": { "${MCP_SERVER_KEY}": { "url": "${httpUrl}" } } }`;
  const CLIENTS: [string, string[], string, string][] = [
    ['Claude Desktop', ['Open Settings → Developer → Edit config.', 'Paste this into claude_desktop_config.json.', 'Restart Claude Desktop.'], 'claude_desktop_config.json', STDIO_RUN],
    ['Claude Code', ['Run this in your project folder.', 'Check it with /mcp inside Claude Code.'], 'terminal', CLAUDE_CODE],
    ['Cursor', ['Open Settings → MCP → Add new server.', 'Or paste this into .cursor/mcp.json.', 'Reload the window.'], '.cursor/mcp.json', STDIO_RUN],
    ['ChatGPT', ['Start the HTTP server: npm run mcp:http.', 'Expose it over HTTPS (for example a tunnel).', 'In ChatGPT, add a connector with that URL.'], 'Server URL', httpUrl],
    ['CLI', ['Run the server yourself from a terminal.', 'Use stdio for clients that launch it, or HTTP for clients that connect to a URL.', cfg?.built === false ? 'Build it first: npm run mcp:build.' : 'Stop it with Ctrl+C.'], 'terminal', CLI],
    ['Other', ['Any client that speaks Streamable HTTP can connect.', 'Use this config, or the server URL directly.'], 'mcp.json', HTTP],
  ];
  const [tab, setTab, tabKey] = useTabs(CLIENTS.map(x => x[0])); const [c] = [CLIENTS[tab]]; const [copiedP, setCopiedP] = useState(-1);
  return <div className="page mcp-page" data-testid="mcp">
    <section className="mcp-hero"><span className="eyebrow">Developers</span><h1>MCP server</h1><p className="mcp-sub" data-testid="mcp-sub">Let your AI assistant make images, videos and sound for you.</p><p className="lede">It can see your tools, run jobs and bring back the results.</p></section>
    <div className="mcp-status-row">
      <span className={`mcp-pill mcp-pill-${!cfg ? 'checking' : cfg.built === false ? 'down' : mcp.st}`} data-testid="mcp-status" role="status" title={mcp.st === 'down' ? 'Clients that launch the server themselves (Claude Desktop, Cursor) don’t need it running. URL clients do.' : mcp.at ? `Checked from this browser at ${mcp.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : undefined}><span className="mcp-pill-dot" aria-hidden />
        {!cfg || mcp.st === 'checking' ? 'Checking the MCP server…' : cfg.built === false ? 'MCP server not built yet' : mcp.st === 'up' ? `HTTP server running${mcp.ver ? ` · v${mcp.ver}` : ''}` : <>HTTP server not running<small className="mcp-pill-hint" data-testid="mcp-status-hint"> · start it from the CLI tab</small></>}</span>
      <button type="button" className="btn btn-sm" data-testid="mcp-recheck" disabled={!cfg || mcp.st === 'checking'} onClick={mcp.recheck}>Re-check</button>
    </div>
    <div className="mcp-tabs" role="tablist" aria-label="Client" onKeyDown={tabKey} data-testid="mcp-tabs">{CLIENTS.map(([n], i) => <button key={n} type="button" role="tab" aria-selected={tab === i} tabIndex={tab === i ? 0 : -1} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>{n}</button>)}</div>
    <section className="mcp-setup"><ol className="mcp-steps">{c[1].map((x, i) => <li key={i}><span>{i + 1}</span>{x}</li>)}</ol><div className="mcp-code-col"><CopyCode label={c[2]} code={c[3]} />
      {c[0] === 'Cursor' && cursorLink && <p className="mcp-add"><a className="btn btn-primary btn-sm" data-testid="mcp-add-cursor" href={cursorLink}>Add to Cursor</a><span className="helper">Opens Cursor and asks before adding the server.</span></p>}</div></section>
    <p className="helper">The snippet tells your agent where your Imagination Is All You Need server is (this computer by default). <Link to={repoDoc('docs/MCP.md')}>Details ↗</Link></p>
    <h2 className="mcp-h">Try these prompts</h2>
    <div className="mcp-ptabs pills" role="tablist" aria-label="Task" data-testid="mcp-ptabs" onKeyDown={e => { /* B22 B23: ←/→ (Home/End) move and select, as on the Client tabs */ const n = MCP_TASKS.length; const k = e.key === 'ArrowRight' ? (ptab + 1) % n : e.key === 'ArrowLeft' ? (ptab - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1; if (k < 0) return; e.preventDefault(); setPtab(k); (e.currentTarget.children[k] as HTMLElement | undefined)?.focus(); }}>{MCP_TASKS.map(([n], i) => <button key={n} type="button" role="tab" aria-selected={ptab === i} tabIndex={ptab === i ? 0 : -1} className={`pill ${ptab === i ? 'on' : ''}`} onClick={() => setPtab(i)}>{n}</button>)}</div>
    <div className="mcp-carousel" data-testid="mcp-prompts">{MCP_TASKS[ptab][1].map(([p, tid], i) => { const to = toolRoute(tid); return <article key={p} className="mcp-prompt"><span className="mcp-q" aria-hidden>“</span><span className="mcp-ptext">{p}</span>
      <span className="mcp-pact"><button type="button" className="mcp-copy" data-testid="mcp-copy-prompt" onClick={() => navigator.clipboard?.writeText(p).then(() => { setCopiedP(i); setTimeout(() => setCopiedP(c => c === i ? -1 : c), 1600); }).catch(() => 0)} aria-label={`Copy prompt: ${p}`}><span aria-live="polite">{copiedP === i ? 'Copied' : 'Copy'}</span></button>{to && <Link to={to} className="mcp-try" data-testid="mcp-try">Try in app →</Link>}</span></article>; })}</div>
    {cfg && cfg.built === false && <p className="inline-err" data-testid="mcp-not-built">The MCP server isn’t built yet. Run <code>npm run build</code> in {cfg.dir}.</p>}
    <h2 className="mcp-h">Tools your assistant gets <small className="helper" data-testid="mcp-tool-count">{live ? MCP_TOOLS.length : ''}</small></h2>
    {liveErr && !live ? <Notice kind="error" testId="mcp-tools-err" action={<button type="button" className="btn btn-sm" onClick={() => setTick(t => t + 1)}>Retry</button>}>Couldn’t load the tool list from your server.</Notice>
      : <div className="mcp-tools" data-testid="mcp-tools" aria-busy={!live}>{live ? MCP_TOOLS.map(([n, d]) => <div key={n} className="mcp-tool"><code>{n}</code><span className="helper">{d}</span></div>)
        : Array.from({ length: 12 }, (_, i) => <div key={i} className="mcp-tool mcp-tool-ph shimmer" aria-hidden><code>&nbsp;</code><span className="helper">&nbsp;</span></div>)}</div>}
  </div>;
}

type Item = { id: string; title: string; toolName?: string | null; kind?: string | null; sampleCredit?: string | null; aiGenerated?: boolean; posterUrl?: string; route: string; author?: string; recreates?: number; likes?: number };
export function useCommunity(sort: 'trending' | 'new') { return useJson<{ items: Item[] }>(`/api/community?sort=${sort}`); }
export function CommunityGrid({ sort }: { sort: 'trending' | 'new' }) {
  const { d, err, retry } = useCommunity(sort);
  if (err) return <InlineError what="community posts" error={err} onRetry={retry} />;
  if (!d) return <Skeleton variant="tiles" count={8} label="Loading community" />;
  return <div className="masonry xmasonry comm-grid">{d.items.map((it, i) => <div key={it.id} className="masonry-item"><ExampleCard title={it.title} mode={isSample(it) ? sampleLabel(it) : `${it.toolName ?? ''}${it.aiGenerated ? ' · AI-generated' : ''}${it.likes ? ` · ♥ ${it.likes}` : ''}`} poster={it.posterUrl} ratio={['3/4', '1/1', '4/5', '9/12'][i % 4]} href={communityHref(it.route, it.id)} /></div>)}</div>;
}

/** /api-docs: link to the live spec. */
export function ApiDocsLinks() {
  return <div className="xgrid3 api-links"><a className="xcard" href="/api/docs" target="_blank" rel="noreferrer"><b>Interactive docs ↗</b><p className="helper">/api/docs</p></a><a className="xcard" href="/api/openapi.json" target="_blank" rel="noreferrer"><b>OpenAPI spec ↗</b><p className="helper">/api/openapi.json</p></a></div>;
}

/** Global search overlay: GET /api/search?q= across tools, presets, models, examples, assets. */
type Hit = { type: string; id: string; title: string; subtitle?: string; route: string; media?: string };
const TYPES: Record<string, string> = { tool: 'Features', preset: 'Looks', model: 'Models', example: 'Examples', asset: 'Assets' };
const CHIP_IC: Record<string, string> = { all: '', tool: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z', preset: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z', model: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z', example: 'M4 5h16v14H4zM10 9l5 3-5 3z', asset: 'M3 7h7l2 2h9v10H3z' };
const Ic = ({ d, s = 16 }: { d: string; s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
const RKEY = 'ohf:search-recents';
const recentsGet = (): any[] => { try { return (JSON.parse(localStorage.getItem(RKEY) || '[]') as any[]).filter(x => !/^\/tools\/(cinema|director)(\/|\?|$)/.test(String(x?.route ?? ''))); /* Director was removed (2026-10-23): drop a remembered visit */ } catch { return []; } };
const SRow = ({ t, onGo, kind }: { t: any; onGo: () => void; kind?: string }) => <button type="button" className="sr-row" onClick={onGo}>
  <span className="sr-ic"><ToolIconFor id={t.id} ui={t.ui} size={18} /></span>
  <span className="sr-txt"><span className="sr-name">{t.name ?? t.title}<BadgePill b={badgeOf(t)} />{kind && <em className="sr-kind">{kind}</em>}</span><span className="sr-desc">{t.description ?? t.subtitle ?? ''}</span></span></button>;
export function SearchOverlay({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState(''); const [hits0, setHits] = useState<Hit[] | null>(null); const [sel, setSel] = useState(0); const inp = useRef<HTMLInputElement>(null); const [ft, setFt] = useState('all');
  const [cat, setCat] = useState<any[]>([]);
  useEffect(() => { Promise.all(['video', 'image', 'audio'].map(m => fetch(`/api/browse/${m}`).then(r => r.ok ? r.json() : { tools: [] }).catch(() => ({ tools: [] })))).then(rs => setCat(rs.flatMap(r => r.tools ?? []))); }, []);
  const hits = hits0 && ft !== 'all' ? hits0.filter(h => h.type === ft) : hits0;
  useEffect(() => { inp.current?.focus(); const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  useEffect(() => { if (!q.trim()) { setHits(null); return; } const c = new AbortController(); const id = setTimeout(() => fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: c.signal }).then(r => r.json()).then(j => { setHits(j.results ?? []); setSel(0); }).catch(() => undefined), 150); return () => { clearTimeout(id); c.abort(); }; }, [q]);
  const remember = (t: any) => { const r = [{ id: t.id, name: t.name ?? t.title, description: t.description ?? t.subtitle ?? '', route: t.route, badge: t.badge ?? null, ui: t.ui }, ...recentsGet().filter(x => x.route !== t.route)].slice(0, 3); localStorage.setItem(RKEY, JSON.stringify(r)); };
  const goT = (t: any) => { remember(t); onClose(); navigate(t.id ? toolOpenHref(t) : t.route); };
  const go = (h: Hit) => goT(h);
  const groups = Object.keys(TYPES).map(t => [t, (hits ?? []).filter(h => h.type === t)] as const).filter(([, l]) => l.length);
  const flat = groups.flatMap(([, l]) => l);
  const byId = (id: string) => cat.find(t => t.id === id);
  const recents = (recentsGet().length ? recentsGet() : ['create-image', 'h3-video'].map(byId).filter(Boolean)).slice(0, 2);
  const popular = ['create-image', 'h3-video', 'app-relight'].map(byId).filter(Boolean).slice(0, 3);
  const trending = cat.filter(t => !popular.includes(t)).sort((a, b) => (b.badge ? 1 : 0) - (a.badge ? 1 : 0)).slice(0, 6);
  return <div className="search-scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div className="search-box" role="dialog" aria-label="Search">
      <div className="sx-top"><div className="sx-field" onClick={() => inp.current?.focus()}><span className="sx-ic"><Ic d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" s={20} /></span>
        <input ref={inp} className="search-input" placeholder="Search" value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(flat.length - 1, s + 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); } if (e.key === 'Enter' && flat[sel]) go(flat[sel]); }} />
        {q && <button type="button" className="sx-clear" aria-label="Clear" data-testid="sx-clear" onMouseDown={e => e.preventDefault()} onClick={() => { setQ(''); inp.current?.focus(); }}>×</button>}</div><button type="button" className="sx-close" aria-label="Close search" onClick={onClose}><Ic d="M6 6l12 12M18 6L6 18" s={18} /></button></div>
      <div className="search-chips" role="tablist" aria-label="Filter">{[['all', 'All'], ...Object.entries(TYPES)].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={ft === k} className={`search-chip ${ft === k ? 'on' : ''}`} onClick={() => { setFt(k); setSel(0); inp.current?.focus(); }}>{CHIP_IC[k] && <Ic d={CHIP_IC[k]} s={14} />}{l}</button>)}</div>
      <div className="search-results">
        {hits && !hits.length && <p className="search-empty">No results for “{q}”.</p>}
        {!hits && <>
          {recents.length > 0 && <div className="sx-sec"><span className="search-gh">Recents</span>{recents.map(t => <SRow key={t.route} t={t} onGo={() => goT(t)} />)}</div>}
          {popular.length > 0 && <div className="sx-sec"><span className="search-gh">Popular products</span><div className="sx-cards">{popular.map(t => <button key={t.id} type="button" className="sx-card" onClick={() => goT(t)}>
            {/* The poster can 404 (no ffmpeg to render it): the dark card and the tool glyph show instead of the button's default light face */}<span className="sx-card-ic" aria-hidden><ToolIconFor id={t.id} ui={t.ui} size={28} /></span>{posterOf(t) && <img className="sx-card-img" src={posterOf(t)} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = 'none'; }} />}
            <span className="sx-card-top"><span className="sx-cat">{t.media === 'image' ? 'Image' : t.media === 'audio' ? 'Audio' : 'Video'}</span><BadgePill b={badgeOf(t) ?? 'top'} /></span>
            <span className="sx-card-b"><b>{t.name} <span aria-hidden>↗</span></b><small>{t.description}</small></span></button>)}</div></div>}
          {trending.length > 0 && <div className="sx-sec"><span className="search-gh">Trending</span><div className="sx-grid">{trending.map(t => <SRow key={t.id} t={t} onGo={() => goT(t)} />)}</div></div>}
        </>}
        {groups.map(([t, l]) => <div key={t} className="search-group sx-sec"><span className="search-gh">{TYPES[t]}</span>{l.map(h => { const i = flat.indexOf(h); return <div key={h.type + h.id} className={`sr-wrap search-hit ${i === sel ? 'on' : ''}`} onMouseEnter={() => setSel(i)}><SRow t={{ ...h, ...(h.type === 'tool' ? byId(h.id) ?? {} : {}), name: h.title, description: h.subtitle }} onGo={() => go(h)} kind={h.media} /></div>; })}</div>)}
      </div>
    </div>
  </div>;
}
