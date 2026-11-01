/**
 * Explore (2026-10-26, v3 from the approved mockups). Top to bottom:
 *  - the full-bleed header (the LTX-2.5 Pro painter clip, looping with sound) with the tagline and the quick links (explore/ExploreShowcase.tsx XpHero),
 *    then Made for your work (explore/ExploreWork.tsx: real shop and brand results, each with Make your own),
 *    then 3D and IIAYN FILMS (including A Star to Steer By, formerly its own lighthouse section);
 *  - From one still (XpStill): two LTX-2.5 Pro image-to-video takes from one still, a wipe from the still into the clip, a Take 1 / Take 2 switch;
 *  - Make your own cartoon (XpKoi): a MiniMax H3 take extended by H3 Extend into one 20 s take, in a letterbox; it leads into the H3 chapter below;
 *  - chapters: Same dance. Two new casts. (H3 Character Swap and Kling 3.0 Omni Edit on Comfy Cloud), One picture. Every layer. (Image to layers, Seedream 5.0 Flash on Comfy Router), One character. Every angle. (four GPT Image 2.5 Flare character sheets, Mossbun in 3D), Image · made here, Your agent builds the board, then Block it in 3D. Film it for real. (Mockup to film: Direct a Shot, its first frame painted, the LTX film), One drawing. A whole film. (Mossbun: sheet → 3D → city → film, explore/Explore3D.tsx);
 *  - Real results: a shared MediaRail of our own outputs (clips play on hover, stills), each opening as Recreate;
 *  - the flow rows (server/src/shared/exploreFlows.ts): numbered heads, bento strips of media tiles naming the real model and its price;
 *  - Learn / Spend, every tool, the footer.
 * Showcase data: server/src/shared/exploreShowcase.ts; featured media: shared/featured.ts. Every card opens the exact tool with its settings
 * filled in. Posters first; clips mount on hover / on screen; reduced motion gets posters only. Our own copy, accent and icons.
 */
import { useEffect, useState } from 'react';
import type { ToolInfo } from '../api';
import { Link } from '../platform/router';
import { REPO_URL } from '../shared/brand';
import { footerCols, FOOT_NAME } from '../shared/footerLinks';
import { MakerTile } from '../shared/MakerTile';
import { StandInArt } from '../shared/StandInArt';
import { HoverClip, prefersReducedMotion } from '../shared/HoverClip';
import { MediaRail } from '../shared/MediaRail';
import { XpHero, XpStill, XpKoi, XpSwap, XpLayers, XpSheets, XpLooks, XpYourTurn, XpBoard, XpFilm } from './explore/ExploreShowcase';
import { EXPLORE_ROWS, type ExploreCard, type ExploreRow, type FlowArt } from '../../../server/src/shared/exploreFlows';
import { featuredByKey, featuredRecreateHref, type FeaturedItem } from '../../../server/src/shared/featured';
import { VideoIcon, MotionTransferIcon, ReshootIcon, LoopIcon, PhotoFxIcon, MusicIcon, MicIcon, PortraitIcon, CubeIcon, OrbitIcon, GridIcon, GenerateIcon, PrevizIcon, TransitionIcon, PriceTagIcon, ChevronRightIcon } from './Icons';
import { Xp3D } from './explore/Explore3D';
import { XpFilms } from './explore/ExploreFilms';
import { XpPresenter } from './explore/ExplorePresenter';
import { XpWork } from './explore/ExploreWork';
import { FlowDiagram, hasDiagram } from './exploreArt';
import './explore.css';

const ART: Partial<Record<FlowArt, (p: { size: number }) => JSX.Element>> = {
  video: VideoIcon, photo: PhotoFxIcon, cloud: VideoIcon, swap: MotionTransferIcon, angle: ReshootIcon, loop: LoopIcon, fx: PhotoFxIcon, viral: TransitionIcon, music: MusicIcon, voice: MicIcon,
  talk: PortraitIcon, cube: CubeIcon, turntable: OrbitIcon, agent: GenerateIcon, canvas: GridIcon, skills: GenerateIcon, stage: PrevizIcon,
};
const isClip = (u?: string) => !!u && /\.mp4$/.test(u);
const two = (n: number) => String(n).padStart(2, '0');

/** Price words for a model on a tool: Free when it runs on your computer, else its from-price (1 credit = $0.01). */
function priceOf(tools: ToolInfo[], toolId: string, key?: string): { text: string; free: boolean } | null {
  if (!key) return null; const m: any = tools.find(t => t.id === toolId)?.models?.find((x: any) => x.key === key); if (!m) return null;
  const c = Number(m.fromPrice); if (m.fromPrice == null || !Number.isFinite(c)) return null;
  return c === 0 ? { text: 'Free', free: true } : { text: `from $${(c / 100).toFixed(2)}`, free: false };
}
function modelOf(tools: ToolInfo[], toolId: string, key?: string): { name: string; maker?: string; makerName?: string } | null {
  if (!key) return null; const m: any = tools.find(t => t.id === toolId)?.models?.find((x: any) => x.key === key); return m ? { name: m.displayName ?? m.name, maker: m.maker, makerName: m.makerName } : null;
}

/** Column spans (of 12) for a row's tiles: real outputs get the room, the rest stay narrow; rows alternate so the page doesn't repeat. */
function spansOf(cards: ExploreCard[], rowIdx: number): number[] {
  const real = cards.map(c => !!c.featured); const n = cards.length; const flip = rowIdx % 2 === 1;
  if (n === 1) return [12];
  if (n === 2) return real.every(Boolean) ? [7, 5] : flip ? [5, 7] : [7, 5];
  if (n === 3) { if (real[0] && real[1]) return [5, 5, 2]; return [[6, 3, 3], [3, 3, 6], [4, 4, 4]][rowIdx % 3]; }
  if (n === 4) return real[0] && real[1] ? [4, 4, 2, 2] : [3, 3, 3, 3];
  return cards.map(() => 3);
}

/** One flow card: the media fills the tile, the caption sits on it (model, price), the whole tile is the link. */
function Tile({ c, tools, span, tall }: { c: ExploreCard; tools: ToolInfo[]; span?: number; tall?: boolean }) {
  const f = c.featured ? featuredByKey(c.featured) : null; const m = modelOf(tools, c.toolId === 'make-it-real' ? 'h3-video' : c.toolId, c.modelKey);
  const price = c.toolId === 'make-it-real' ? { text: 'Free', free: true } : priceOf(tools, c.toolId, c.modelKey); const Art = c.art ? ART[c.art] : null;
  const free = !!price?.free || /^Free/.test(c.priceText ?? ''); const priceWords = price ? `${price.text}${price.free ? ' · on your computer' : ''}` : c.priceText ?? '';
  const pair = !!f && isClip(f.before?.url); const narrow = (span ?? 12) <= 2;
  const modelName = c.toolId === 'make-it-real' ? 'LTX-2.5 + Layout to Render' : m?.name;
  return <Link to={c.href} className={`xp-tile${f ? ' is-real' : ' is-art'}${narrow ? ' is-narrow' : ''}${tall ? ` is-tall${c.badge === '16:9' ? ' is-wide' : c.badge === '9:16' ? ' is-portrait' : ''}` : ''}`} style={span ? { gridColumn: `span ${span}` } : undefined}
    data-testid={`xp-card-${c.id}`} data-tool={c.toolId} data-hover-play>
    <span className="xp-tile-media">
      {f ? <HoverClip src={f.out.url} poster={f.out.poster} label={f.title} />
        : c.standIn ? <StandInArt id={c.standIn.id} toolId={c.standIn.toolId} className="xp-standin" />
        : <span className={`xp-art xp-art-${c.art}`} aria-hidden>{c.art === 'cloud' && m?.maker ? <MakerTile maker={m.maker} makerName={m.makerName} fallback={m.name} medium="video" className="xp-mk" /> : c.art && hasDiagram(c.art) ? <FlowDiagram art={c.art} /> : Art ? <Art size={44} /> : null}</span>}
    </span>
    {pair && f?.before && <span className="xp-pip" aria-hidden><HoverClip src={f.before.url} poster={f.before.poster} /><i>Mockup</i></span>}
    <span className="xp-chips-top">
      {c.badge && <span className={`xp-badge${c.badge === 'New' ? ' is-new' : ''}`}>{c.badge}</span>}
    </span>
    <span className="xp-cap">
      <b className="xp-title">{c.title}</b>
      <span className="xp-line">{c.line}</span>
      <span className="xp-meta">
        {modelName ? <span className="xp-model" title={modelName}>{m?.maker && <MakerTile maker={m.maker} makerName={m.makerName} fallback={m.name} medium="video" className="xp-mk-sm" />}<span>{modelName}</span></span> : <span className="xp-model" />}
        {priceWords && <span className={`xp-price${free ? ' is-free' : ''}`}>{priceWords}</span>}
      </span>
    </span>
    <span className="xp-go" aria-hidden><ChevronRightIcon size={18} /></span>
  </Link>;
}

/** Real results: our own outputs, clips and stills mixed, in a rail. Each opens as Recreate. */
const MADE_KEYS = ['ltx-rain-city', 'ltx-fox-meadow-close', 'sc-032054ec', 'sc-016bdc27', 'ltx-street-take', 'sc-baf606ef', 'sc-fad0bbe6', 'ltx-lighthouse', 'sc-0f1a0117', 'sc-31465e96', 'ltx-morph',
  'sc-98ba27ae', 'sc-b718e875', 'ltx-village-loop', 'sc-334bb02e', 'sc-396554e1', 'sc-f7699cd4', 'sc-5846d360', 'sc-fa96f109'];
function RealResults() {
  const items = MADE_KEYS.map(featuredByKey).filter((x): x is FeaturedItem => !!x);
  if (!items.length) return null;
  return <section className="xp-sec xp-made-sec" id="xp-made" data-testid="xp-made" aria-labelledby="xp-h-made">
    <header className="xp-head"><span className="xp-num" aria-hidden>00</span><div><h2 id="xp-h-made">Made with Imagination</h2><p>Free on your own computer. Hover to play, open one to make it again.</p></div></header>
    <MediaRail label="Made with Imagination" testId="xp-made-rail">{items.map(f => {
      const href = (f.tab === 'image' ? f.recreateHref : featuredRecreateHref(f.key)) ?? f.recreateHref ?? '/'; const clip = isClip(f.out.url);
      const ar = clip ? Math.max(1.2, f.out.width / f.out.height) : Math.min(1.4, Math.max(0.72, f.out.width / f.out.height * 0.8));
      return <Link key={f.key} to={href} className={`xp-shot${clip ? ' is-clip' : ''}`} style={{ aspectRatio: String(ar) }} data-testid={`xp-made-${f.key}`} data-hover-play>
        <HoverClip src={clip ? f.out.url : f.out.url} poster={clip ? f.out.poster : f.out.url} label={f.title} position={clip ? undefined : '50% 30%'} />
        {clip && <span className="xp-shot-play" aria-hidden />}
        <span className="xp-shot-cap"><small>{f.flow}</small><b>{f.title}</b><span>{f.model} · Free · on your computer</span></span>
      </Link>;
    })}</MediaRail>
  </section>;
}

function Row({ r, i, tools }: { r: ExploreRow; i: number; tools: ToolInfo[] }) {
  const rail = r.id === 'viral'; const spans = spansOf(r.cards, i);
  return <section id={`xp-${r.id}`} className="xp-sec xp-row" data-testid={`xp-row-${r.id}`} aria-labelledby={`xp-h-${r.id}`}>
    <header className="xp-head"><span className="xp-num" aria-hidden>{two(i + 1)}</span><div><h2 id={`xp-h-${r.id}`}>{r.title}</h2><p>{r.line}</p></div>
      {r.more && <Link to={r.more.href} className="xp-more">{r.more.label}<ChevronRightIcon size={14} /></Link>}</header>
    {rail ? <MediaRail label={r.title} className="xp-rail">{r.cards.map(c => <Tile key={c.id} c={c} tools={tools} tall />)}</MediaRail>
      : <div className={`xp-bento${r.cards.some(c => c.featured) ? ' has-real' : ''}`}>{r.cards.map((c, k) => <Tile key={c.id} c={c} tools={tools} span={spans[k]} />)}</div>}
  </section>;
}

/** The jump bar: numbered, the section on screen lit. */
function Jump({ rows }: { rows: ExploreRow[] }) {
  const [on, setOn] = useState('');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const els = rows.map(r => document.getElementById(`xp-${r.id}`)).filter((x): x is HTMLElement => !!x);
    const io = new IntersectionObserver(es => { const v = es.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setOn(v.target.id.slice(3)); }, { rootMargin: '-30% 0px -60% 0px' });
    els.forEach(e => io.observe(e)); return () => io.disconnect();
  }, [rows]);
  return <nav className="xp-jump" aria-label="On this page">{rows.map((r, i) => <a key={r.id} href={`#xp-${r.id}`} className={on === r.id ? 'on' : ''} aria-current={on === r.id ? 'true' : undefined}
    onClick={e => { e.preventDefault(); document.getElementById(`xp-${r.id}`)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }); }}><i>{two(i + 1)}</i>{r.title}</a>)}</nav>;
}

export default function Home({ tools }: { tools: ToolInfo[] }) {
  const [repoUrl, setRepoUrl] = useState<string>(REPO_URL);
  useEffect(() => { fetch('/api/config').then(r => r.ok ? r.json() : null).then(c => setRepoUrl(typeof c?.repoUrl === 'string' && /^https?:\/\//.test(c.repoUrl) ? c.repoUrl.replace(/\.git$/, '') : REPO_URL)).catch(() => 0); }, []);
  const has = (id: string) => !id || tools.some(t => t.id === id) || id === 'make-it-real' || id === 'plan-a-shot' || id === 'three-d-turntable';
  const rows = EXPLORE_ROWS.map(r => ({ ...r, cards: r.cards.filter(c => has(c.toolId)) })).filter(r => r.cards.length);
  const chips = tools.filter(x => (x as any).listed !== false).map(x => ({ id: x.id, name: x.name, route: x.route }));
  /* two tools with one name (Upscale for images and for clips): say which */ const dup = new Set(chips.map(c => c.name).filter((n, k, a) => a.indexOf(n) !== k)); chips.forEach(c => { if (dup.has(c.name)) { const m = (tools.find(t => t.id === c.id) as any)?.media ?? (/image|app-remove-bg/.test(c.id) ? 'image' : 'video'); c.name = `${c.name} · ${m === 'image' ? 'image' : 'video'}`; } });
  return <div className="home xp" data-testid="explore">
    <h1 className="sr-only-vis">Imagination Is All You Need: an open studio for video, images, sound and 3D</h1>
    <XpHero />
    <div className="xp-in"><XpWork /></div>
    {/* The lighthouse now lives in Films, not in a separate section (user, 2026-10-29). */}
    <div className="xp-in"><Xp3D /></div>
    {/* IIAYN FILMS: our finished films (explore/ExploreFilms.tsx; the feature layout runs full width) */}
    <XpFilms />
    <div className="xp-in">
      <XpStill />
      <XpFilm />
      <XpKoi />
      <XpBoard />
      <XpSwap />
      <XpLayers />
      <XpSheets />
      <XpPresenter />
      <XpLooks />
    </div>
    {/* the closing moment, full width: a prompt box over a wall of things made here */}
    <XpYourTurn />
    <footer className="xp-footer" data-sec="footer"><div className="xp-foot-in">
      <div className="xp-fbrand"><h2>Imagination is<br />all you need</h2><a className="xp-fgh" href={repoUrl} target="_blank" rel="noopener noreferrer" data-testid="home-github">GitHub <span aria-hidden>↗</span></a></div>
      <div className="xp-fcols">{footerCols(repoUrl).map(([h, ls]) => <nav key={h} aria-label={h}><span className="xp-fh">{h}</span><span className="xp-flinks">{ls.map(([l, to]) => /^https?:/.test(to) ? <a key={l} href={to} target="_blank" rel="noopener noreferrer">{l}</a> : <Link key={l} to={to}>{l}</Link>)}</span></nav>)}</div></div>
      <p className="xp-fbot">© {new Date().getFullYear()} {FOOT_NAME} · Everything the tools make is <span className="xp-nw">AI-generated</span>.</p></footer>
  </div>;
}
