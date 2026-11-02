/**
 * Explore (2026-10-26, v3 from the approved mockups; reordered into four acts on 2026-11-02, the plan in the Explore journey notes). Top to bottom:
 *  - Act 1, Wonder: the full-bleed header (XpHero, the LTX-2.5 Pro painter clip with sound), Create your character. Bring it to life. (Xp3D,
 *    Mossbun: design it → spin it in 3D → place it → film it), What if it could move? (XpStill: a still becomes a moving shot, full bleed),
 *    One character. Every angle. (XpSheets),
 *    Make your own cartoon (XpKoi: MiniMax H3 + H3 Extend), then our song with SyteSim dancing (XpSong, explore/ExploreSong.tsx);
 *  - Act 2, Control: Block it in 3D. Film it for real. (XpFilm, Mockup to film), Same dance. Two new casts. (XpSwap), One idea. Every look.
 *    (XpLooks), Give a character a voice (XpPresenter);
 *  - Act 3, Work: Made for your work (XpWork, explore/ExploreWork.tsx), One picture. Every layer. (XpLayers);
 *  - Act 4, Trust and you: Your agent builds the board (XpBoard, Canvas), IIAYN FILMS (XpFilms, full width), Now it's your turn (XpYourTurn), the footer.
 *  - Hidden: Made on your computer. Free. (RealResults, a shared MediaRail of local LTX clips), kept in code. The flow rows (Row, EXPLORE_ROWS)
 *    and the jump bar are not mounted.
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
import { featuredByKey, featuredRecreateHref } from '../../../server/src/shared/featured';
import { EXPLORE_LOCAL, exploreLocalClips } from '../../../server/src/shared/exploreShowcase';
import { chipOfFeatured, chipText } from '../../../server/src/shared/runChip';
import { RunChip } from '../shared/RunChip';
import { VideoIcon, MotionTransferIcon, ReshootIcon, LoopIcon, PhotoFxIcon, MusicIcon, MicIcon, PortraitIcon, CubeIcon, OrbitIcon, GridIcon, GenerateIcon, PrevizIcon, TransitionIcon, PriceTagIcon, ChevronRightIcon } from './Icons';
import { Xp3D } from './explore/Explore3D';
import { XpFilms } from './explore/ExploreFilms';
import { XpPresenter } from './explore/ExplorePresenter';
import { XpWork } from './explore/ExploreWork';
import { XpSong } from './explore/ExploreSong';
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

/** Made on your computer. Free.: local LTX clips in a rail (data: shared/exploreShowcase.ts EXPLORE_LOCAL, local runs only). Each opens as Recreate. */
function RealResults() {
  const L = EXPLORE_LOCAL; const items = exploreLocalClips();
  if (!items.length) return null;
  return <section className="xv-sec xp-made-sec" id="xp-made" data-testid="xp-made" aria-labelledby="xp-h-made">
    <header className="xv-head"><div><span className="xv-eb">{L.eyebrow}</span><h2 id="xp-h-made">{L.title}</h2><p>{L.line}</p></div></header>
    <MediaRail label={L.title} testId="xp-made-rail">{items.map(f => {
      const href = featuredRecreateHref(f.key) ?? f.recreateHref ?? '/';
      return <Link key={f.key} to={href} className="xp-shot is-clip" style={{ aspectRatio: String(f.out.width / f.out.height) }} data-testid={`xp-made-${f.key}`} data-hover-play aria-label={`${f.title}: ${chipText(chipOfFeatured(f))}`}>
        <HoverClip src={f.out.url} poster={f.out.poster} label={f.title} />
        <span className="xp-shot-play" aria-hidden />
        <span className="xp-shot-cap" aria-hidden><small>{f.flow}</small><b>{f.title}</b></span>
        <RunChip c={chipOfFeatured(f)} onMedia className="xp-shot-chip" testId={`xp-made-chip-${f.key}`} />
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
    {/* Act 1, Wonder: the hero, then what a character, a picture and a song can become */}
    <XpHero />
    <div className="xp-in">
      <Xp3D />
      <XpStill />
      <XpSheets />
      <XpKoi />
      {/* our song, SyteSim dancing (explore/ExploreSong.tsx) */}
      <XpSong />
    </div>
    {/* Act 2, Control: direct the shot, swap the cast, pick the look, give it a voice */}
    <div className="xp-in">
      <XpFilm />
      {/* "Made on your computer. Free." (RealResults) is hidden: the user never asked for this section (2026-11-02). Kept in code; render <RealResults /> here to bring it back. */}
      <XpSwap />
      <XpLooks />
      <XpPresenter />
    </div>
    {/* Act 3, Work: real results for shops and brands, then a poster split into layers */}
    <div className="xp-in">
      <XpWork />
      <XpLayers />
    </div>
    {/* Act 4, Trust and you: your agent on the Canvas, our finished films (IIAYN FILMS, full width), then your turn */}
    <div className="xp-in"><XpBoard /></div>
    <XpFilms />
    {/* the closing moment, full width: a prompt box over a wall of things made here */}
    <XpYourTurn />
    <footer className="xp-footer" data-sec="footer"><div className="xp-foot-in">
      <div className="xp-fbrand"><h2>Imagination is<br />all you need</h2><a className="xp-fgh" href={repoUrl} target="_blank" rel="noopener noreferrer" data-testid="home-github">GitHub <span aria-hidden>↗</span></a></div>
      <div className="xp-fcols">{footerCols(repoUrl).map(([h, ls]) => <nav key={h} aria-label={h}><span className="xp-fh">{h}</span><span className="xp-flinks">{ls.map(([l, to]) => /^https?:/.test(to) ? <a key={l} href={to} target="_blank" rel="noopener noreferrer">{l}</a> : <Link key={l} to={to}>{l}</Link>)}</span></nav>)}</div></div>
      <p className="xp-fbot">© {new Date().getFullYear()} {FOOT_NAME} · Everything the tools make is <span className="xp-nw">AI-generated</span>.</p></footer>
  </div>;
}
