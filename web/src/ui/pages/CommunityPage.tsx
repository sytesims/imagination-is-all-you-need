import { InlineError } from '../../shared/InlineError';
import { Skeleton } from '../../shared/Skeleton';
import { onReconnect } from '../../shared/connectivity';
import { isSample } from '../../shared/sample';
import { useEffect, useState } from 'react';
import Hub from './Hub';
import { Link } from '../../platform/router';
import { listPublicProjects, PublicProject } from '../../api';
import { setAssetOrder, setOpener } from '../../shared/assetOrder';
import { useSearch } from '../../platform/router';
import JobPage from '../../platform/JobPage';
import { LikeButton } from '../../shared/LikeButton';
import { clientId } from '../../shared/clientId';
import { SearchIcon, VideoIcon, LogoMark } from '../Icons';
import { useProfile, nameOf, UserAvatar } from '../../shared/profile';
import type { ToolInfo } from '../../api';
/** Page 17 Community: Shots (GET /api/community/shots) · Projects (GET /api/projects/public) · Models (LoRA / workflow hub). */
type Shot = { liked?: boolean; id: string; toolId?: string; toolName?: string; posterUrl?: string; previewUrl?: string; prompt?: string | null; likes?: number; createdAt?: string | number; author?: string; shareToken?: string; title?: string; sampleCredit?: string | boolean | null; aiGenerated?: boolean | null; kind?: string | null };
/** Seed samples (sampleCredit) carry a visible credit and no tool or prompt info; aiGenerated adds an 'AI-generated' badge. Both fields are optional. */
const SAMPLE_CREDIT = 'Sample · CC BY Blender Foundation';
const sampleCredit = (s: Shot) => typeof s.sampleCredit === 'string' && s.sampleCredit.trim() ? s.sampleCredit.trim() : s.sampleCredit || isSample(s) ? SAMPLE_CREDIT : '';
const TABS = [['shots', 'Shots'], ['projects', 'Projects'], ['models', 'Models & workflows']] as const;
/** C10: a short badge on the card; the full credit lives in the tooltip and the viewer. */
const shortCredit = (c: string) => /blender/i.test(c) ? 'CC BY · Blender' : 'Sample';
export default function CommunityPage({ tools = [] }: { tools?: ToolInfo[] }) {
  const [tab, setTab] = useState<typeof TABS[number][0]>(() => (new URLSearchParams(location.search).get('tab') as any) || 'shots');
  const search = useSearch(); const shot = new URLSearchParams(search).get('shot');
  useEffect(() => { const q = new URLSearchParams(location.search); if (q.get('tab') === tab) return; q.set('tab', tab); history.replaceState(history.state, '', `${location.pathname}?${q}`); }, [tab]);
  /* J8/C3: a shot opens the viewer here (?shot=<id>), without a page load; closing returns to this grid at the same scroll. */
  const shotHref = (id: string) => { const q = new URLSearchParams(location.search); q.set('tab', 'shots'); q.set('shot', id); return `/community?${q}`; };
  const closeTo = (() => { const q = new URLSearchParams(location.search); q.delete('shot'); return `/community?${q}`; })();
  return <div className="page comm-page" data-testid="community">
    <div {...(shot ? { inert: '', 'aria-hidden': true } as any : {})}>
      <div className="pre-head"><h1 className="pre-h">COMMUNITY</h1><p className="helper">Work people chose to make public, plus models and workflows to install.</p></div>
      <div className="seg comm-tabs" role="tablist" aria-label="Community">{TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} data-testid={`comm-tab-${k}`} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'shots' ? <Shots hrefOf={shotHref} /> : tab === 'projects' ? <PublicProjects /> : <Hub />}
    </div>
    {shot && <JobPage key="comm-viewer" id={shot} tools={tools} closeTo={closeTo} closeLabel="Back to Community" hrefOf={shotHref} src="community" />}
  </div>;
}
type Kind = 'all' | 'image' | 'video';
const isVid = (s: Shot) => !!s.previewUrl && /\.(mp4|webm|mov)$/i.test(s.previewUrl);
function Shots({ hrefOf }: { hrefOf: (id: string) => string }) {
  const [sort, setSort] = useState<'trending' | 'new'>('trending'); const [items, setItems] = useState<Shot[] | null>(null); const [next, setNext] = useState<string | null>(null); const [err, setErr] = useState<unknown>(null); const [copied, setCopied] = useState(''); const [rt, setRt] = useState(0);
  const [q, setQ] = useState(''); const [kind, setKind] = useState<Kind>('all'); const [flat, setFlat] = useState<Record<string, boolean>>({});
  const load = (cursor?: string) => fetch(`/api/community/shots?${new URLSearchParams({ sort, limit: '24', ...(cursor ? { cursor } : {}) })}`, { headers: { 'x-client-id': clientId() }, signal: AbortSignal.timeout(12000) }).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)));
  useEffect(() => { setItems(null); setErr(null); load().then(j => { setItems(j.items ?? []); setNext(j.nextCursor ?? null); }).catch(e => setErr(e)); }, [sort, rt]);
  useEffect(() => onReconnect(() => setRt(n => n + 1)), []);
  const qq = q.trim().toLowerCase();
  const shown = (items ?? []).filter(s => (kind === 'all' || (kind === 'video') === isVid(s)) && (!qq || [s.title, s.prompt, s.toolName, s.author].some(x => String(x ?? '').toLowerCase().includes(qq))));
  const setLikes = (id: string, likes: number, liked: boolean) => setItems(xs => xs?.map(x => x.id === id ? { ...x, likes, liked } : x) ?? xs);
  const open = (s: Shot) => { setAssetOrder(shown.map(x => x.id), 'community'); setOpener(s.id, 'community'); };
  return <>
    <div className="comm-bar">
      <div className="pills comm-sort" role="tablist" aria-label="Sort">{(['trending', 'new'] as const).map(k => <button key={k} type="button" role="tab" aria-selected={sort === k} data-testid={`comm-sort-${k}`} className={`pill ${sort === k ? 'on' : ''}`} onClick={() => setSort(k)}>{k === 'trending' ? 'Trending' : 'New'}</button>)}</div>
      <div className="seg comm-kind" role="radiogroup" aria-label="Show">{([['all', 'All'], ['image', 'Images'], ['video', 'Videos']] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} data-testid={`comm-kind-${k}`} onClick={() => setKind(k)}>{l}</button>)}</div>
      <label className="comm-search"><SearchIcon size={16} /><input type="search" placeholder="Search shots" aria-label="Search shots" value={q} onChange={e => setQ(e.target.value)} data-testid="comm-search" /></label>
    </div>
    {err ? <InlineError what="shots" error={err} onRetry={() => setRt(n => n + 1)} />
      : !items ? <Skeleton variant="tiles" count={8} className="comm-grid4" label="Loading shots" />
      : !items.length ? <div className="xcard xcard-empty" data-testid="comm-shots-empty"><b>Nothing public yet</b><p className="helper">Open a result, choose Share, then Public on Community, and it shows up here.</p><Link to="/assets" className="btn btn-sm">Pick a result</Link></div>
      : <>{sort === 'trending' && !qq && kind === 'all' && <Featured items={items} hrefOf={hrefOf} onOpen={open} />}
        {!shown.length && <div className="xcard xcard-empty" data-testid="comm-no-match"><b>No matches</b><p className="helper">Try another word, or show All.</p></div>}
        <div className="comm-grid4" data-testid="comm-shots">{shown.map(s => { const credit = sampleCredit(s); const vid = isVid(s) ? s.previewUrl! : null; const card = !!flat[s.id];
        const title = credit ? s.title || 'Sample clip' : s.title || (s.prompt ? s.prompt.slice(0, 80) : s.toolName ?? 'Untitled');
        return <article key={s.id} className="comm-card" data-testid={`comm-shot-${s.id}`}>
          <Link to={hrefOf(s.id)} className="comm-media" data-testid={`comm-shot-link-${s.id}`} aria-label={`Open ${title}`} onClick={() => open(s)}>{s.posterUrl ? <Poster src={s.posterUrl} prompt={credit ? s.title || '' : s.prompt || ''} onCard={f => setFlat(m => m[s.id] === f ? m : { ...m, [s.id]: f })} /> : vid ? null : <span className="cg-blank">{credit ? 'Sample' : s.toolName ?? 'Result'}</span>}{vid && <video src={vid} poster={s.posterUrl ?? `/api/media/thumb?url=${encodeURIComponent(vid)}`} muted loop playsInline preload="none" onMouseEnter={e => e.currentTarget.play().catch(() => 0)} onMouseLeave={e => e.currentTarget.pause()} />}
            {vid && <span className="comm-kind-ic" aria-label="Video"><VideoIcon size={16} /></span>}
            {(credit || s.aiGenerated === true) && <span className="comm-badges">{credit && <em className="comm-badge comm-badge-sample" title={credit} data-testid={`comm-sample-${s.id}`}>{shortCredit(credit)}</em>}{s.aiGenerated === true && <em className="comm-badge comm-badge-ai" data-testid={`comm-ai-${s.id}`}>AI-generated</em>}</span>}</Link>
          <div className="comm-meta"><AuthorAv author={credit ? s.author ?? 'Sample' : s.author} /><span className="comm-t"><b title={title}>{card ? (credit ? (s.aiGenerated ? 'AI-generated sample' : 'Sample image') : s.toolName ?? 'AI-generated') : title}</b><small>{credit ? (s.author ? `by ${s.author}` : 'Sample media') : <>by <AuthorName author={s.author} />{s.toolName && !card ? ` · ${s.toolName}` : ''}</>}</small></span>
            <LikeButton id={s.id} likes={s.likes ?? 0} liked={!!s.liked} size={16} className="comm-like" onChange={(n, on) => setLikes(s.id, n, on)} /></div>
          {s.shareToken && <div className="comm-acts"><button type="button" className="link-btn" data-testid={`comm-copy-${s.id}`} onClick={() => { navigator.clipboard?.writeText(new URL(shareUrl(s), location.origin).href).catch(() => 0); setCopied(s.id); setTimeout(() => setCopied(''), 1500); }}>{copied === s.id ? 'Link copied' : 'Copy link'}</button></div>}
        </article>; })}</div></>}
    {next && <div className="pre-more"><button type="button" className="btn" onClick={() => load(next).then(j => { setItems(xs => [...(xs ?? []), ...(j.items ?? [])]); setNext(j.nextCursor ?? null); })}>Show more</button></div>}
  </>;
}

/** Small strip over the feed: the most-liked public shots in this page of results. Only real likes count (round 1), so it hides until someone likes a shot. */
function Featured({ items, hrefOf, onOpen }: { items: Shot[]; hrefOf: (id: string) => string; onOpen: (s: Shot) => void }) {
  const top = [...items].filter(s => (s.likes ?? 0) > 0 && (s.posterUrl || s.previewUrl)).sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0)).slice(0, 3);
  if (!top.length) return null;
  return <section className="comm-feat" aria-labelledby="comm-feat-h" data-testid="comm-featured">
    <h2 id="comm-feat-h" className="comm-feat-h">Most liked</h2>
    <div className="comm-feat-row">{top.map(s => { const credit = sampleCredit(s); const name = credit ? s.title || 'Sample clip' : s.title || (s.prompt ? s.prompt.slice(0, 48) : s.toolName ?? 'Untitled');
      return <Link key={s.id} to={hrefOf(s.id)} className="comm-feat-card" data-testid={`comm-feat-${s.id}`} onClick={() => onOpen(s)}>
        <span className="comm-feat-art" style={{ backgroundImage: `url(${s.posterUrl ?? `/api/media/thumb?url=${encodeURIComponent(s.previewUrl ?? '')}`})` }} aria-hidden />
        <span className="comm-feat-t"><b>{name}</b><small>by <AuthorName author={credit ? s.author ?? 'Sample' : s.author} /> · <span aria-label={`${s.likes} like${s.likes === 1 ? '' : 's'}`}>{s.likes} like{s.likes === 1 ? '' : 's'}</span></small></span>
      </Link>; })}</div>
  </section>;
}

/** Who made a card: no author (or the server's default 'you') is your own item, shown with your picture and display name from the shared
 *  profile (live: a change in Settings shows here at once). Anyone else keeps their own identity: our app mark on our samples, else their initial.
 *  Public projects are always yours (GET /api/projects/public lists this install's projects). */
const mine = (a?: string | null) => !a || a === 'you';
function AuthorAv({ author }: { author?: string | null }) {
  const prof = useProfile();
  if (mine(author)) return <UserAvatar profile={prof} size={24} className="comm-av comm-av-me" />;
  return <span className="comm-av" aria-hidden data-testid="comm-av-other">{author === 'Imagination Is All You Need samples' ? <LogoMark size={14} color="currentColor" /> : author![0].toUpperCase()}</span>;
}
function AuthorName({ author }: { author?: string | null }) { const prof = useProfile(); return <>{mine(author) ? nameOf(prof) : author}</>; }

/** Share links use the shot's shareToken (/s/:token); without one, fall back to the job page. */
const shareUrl = (s: Shot) => s.shareToken ? `/s/${s.shareToken}` : `/jobs/${s.id}`;
const ago = (t?: number) => { if (!t) return ''; const d = Math.round((Date.now() - t) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };
function PublicProjects() {
  const [items, setItems] = useState<PublicProject[] | null>(null); const [next, setNext] = useState<string | null>(null); const [total, setTotal] = useState(0); const [err, setErr] = useState<unknown>(null); const [rt, setRt] = useState(0);
  useEffect(() => { setErr(null); setItems(null); const t = setTimeout(() => setErr(Object.assign(new Error('timed out'), { kind: 'timeout' })), 12000); listPublicProjects().then(r => { clearTimeout(t); setItems(r.items); setNext(r.nextCursor); setTotal(r.total); }).catch(e => { clearTimeout(t); setErr(e); }); return () => clearTimeout(t); }, [rt]);
  useEffect(() => onReconnect(() => setRt(n => n + 1)), []);
  if (err && !items) return <InlineError what="projects" error={err} onRetry={() => setRt(n => n + 1)} />;
  if (!items) return <Skeleton variant="tiles" count={4} className="comm-grid4" label="Loading projects" />;
  if (!items.length) return <><div className="xcard xcard-empty" data-testid="comm-projects-empty"><b>No public projects yet</b><p className="helper">Open a project in Assets and set it to Public to list it here.</p><Link to="/assets?section=Projects" className="btn btn-sm">Open Projects</Link></div></>;
  return <>
    <p className="helper" data-testid="comm-projects-total">{total} public project{total === 1 ? '' : 's'}</p>
    <div className="comm-grid4" data-testid="comm-projects">{items.map(p => <article key={p.id} className="comm-card" data-testid={`comm-proj-${p.id}`}>
      <div className="comm-media">{p.posterUrl ? <Poster src={p.posterUrl} prompt="" /> : <span className="cg-blank">{p.name}</span>}</div>
      <div className="comm-meta"><AuthorAv /><span className="comm-t"><b>{p.name}</b><small>by <AuthorName /> · {p.count ?? 0} item{p.count === 1 ? '' : 's'}{p.updatedAt ? ` · ${ago(p.updatedAt)}` : ''}</small></span></div>
    </article>)}</div>
    {next && <div className="pre-more"><button type="button" className="btn" data-testid="comm-projects-more" onClick={() => listPublicProjects(next).then(r => { setItems(xs => [...(xs ?? []), ...r.items]); setNext(r.nextCursor); })}>Show more</button></div>}
  </>;
}

/** BH2 #7: a poster that is a flat colour field (mock image results) reads as a broken tile. Sample it on a tiny canvas; if it has no detail,
 *  show it as a prompt card (the prompt set large over the colour) instead. A poster that fails to load falls back the same way. */
const flatCache = new Map<string, boolean>();
function isFlat(img: HTMLImageElement): boolean {
  try { const c = document.createElement('canvas'); c.width = 16; c.height = 16; const g = c.getContext('2d', { willReadFrequently: true }); if (!g) return false; g.drawImage(img, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data; let edges = 0; // neighbour differences: a gradient changes slowly, a photo has edges
    for (let y = 0; y < 16; y++) for (let x = 1; x < 16; x++) { const i = (y * 16 + x) * 4, j = i - 4; if (Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]) > 36) edges++; }
    return edges < 6; } catch { return false; }
}
function Poster({ src, prompt, onCard }: { src: string; prompt: string; onCard?: (card: boolean) => void }) {
  const [flat, setFlat] = useState<boolean>(() => flatCache.get(src) ?? false); const [bad, setBad] = useState(false);
  const card = flat || bad; useEffect(() => { onCard?.(card); }, [card]); // eslint-disable-line react-hooks/exhaustive-deps
  return <>{!bad && <img src={src} alt="" loading="lazy" crossOrigin="anonymous" className={card ? 'comm-img-flat' : ''} onLoad={e => { const f = isFlat(e.currentTarget); flatCache.set(src, f); setFlat(f); }} onError={() => setBad(true)} />}
    {card && prompt && <span className="comm-pcard" data-testid="comm-prompt-card"><q>{prompt}</q></span>}</>;
}
