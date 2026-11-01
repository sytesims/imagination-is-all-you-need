/**
 * Explore "IIAYN FILMS" (2026-10-27): our film label's finished films, including the lighthouse (moved here from its standalone section). Four layouts for the user to pick
 * from (round 2: an A and a B of the shelf and of the feature): ?films=1a|1b|2a|2b, a small switch shows in dev builds; 1a is the default.
 *  1a. Shelf: a row of wide cards (MUM, a coming-soon card, Your film here); MUM opens a big player with the credits under the row.
 *  1b. Catalogue: tall 2:3 posters with a title set on each; hovering or focusing a film grows it into a wide silent preview, a click opens the
 *      same player as 1a. With two films (2026-10-28, the user's call) they fill the row as two wide cards (is-duo), with no Your film here card.
 *      With three (2026-10-28: MUM, IS THAT SO?, The Airport Run) three posters fill the row and the hovered one widens (is-trio).
 *  2a. Feature: one cinematic full-width MUM (a letterboxed loop with the title; Play opens the frame to 16:9 and plays the film), then a small
 *      "More from IIAYN FILMS" strip.
 *  2b. Split: a silent trailer (four cuts) on the left, the title, logline and Play on the right, a row of the film's scenes under it (a scene
 *      plays the film from there and is lit while on screen), then "More from IIAYN FILMS".
 * Every layout: the film the viewer pressed Play on keeps the page's sound while it plays, over scroll-follow (shared/soundDirector.ts), the real
 * models in the credit line, Make your own (Video › Stitch) and How it was made (the steps and the shots, start frame → clip). Previews
 * use separate silent loop files; selecting a film always plays its complete cut from 0:00, ident included. Players mount only near the screen (posters before that); reduced motion:
 * posters with a play button (the shared ShowcaseFilm / HoverClip). A film that can't play keeps its poster.
 * Data: server/src/shared/exploreShowcase.ts EXPLORE_FILMS.
 */
import { useId, useRef, useState } from 'react';
import { Link, navigate, useSearch } from '../../platform/router';
import { ShowcaseFilm } from '../../shared/ShowcaseFilm';
import { turnSoundOn } from '../../shared/soundDirector';
import { HoverClip } from '../../shared/HoverClip';
import { Segmented } from '../../shared/BarPop';
import { useNearView } from '../../shared/useNearView';
import { PlayIcon, CloseIcon, PlusIcon } from '../Icons';
import { RunChip } from '../../shared/RunChip';
import { EXPLORE_FILMS, type FilmsNext, type FilmsShot, type FilmsStep } from '../../../../server/src/shared/exploreShowcase';
import './exploreFilms.css';

const X = EXPLORE_FILMS; const M = X.feature; const S: FilmsShot[] = M.shots;
/** a playable film: MUM (the feature), the short comedy (그래요? · IS THAT SO?) or The Airport Run teaser (no Korean title) */
type Feature = Omit<typeof M, 'shots'> & { shots: FilmsShot[]; steps?: FilmsStep[]; editor?: { label: string; href: string }; make?: { label: string; href: string } };
const FILMS: Feature[] = [M, X.teaser, X.horror, X.counterOffer, X.lighthouse];
const nameOf = (f: Feature) => f.ko ? `${f.ko} · ${f.en}` : f.en;
const Arrow = () => <span className="xv-arrow" aria-hidden>→</span>;
const tc = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const NAME = `${M.ko} · ${M.en}`;
const LAYOUTS = ['1a', '1b', '2a', '2b'] as const; type Layout = typeof LAYOUTS[number];
const layoutOf = (search: string): Layout => { const v = (new URLSearchParams(search).get('films') ?? '').toLowerCase(); return (LAYOUTS as readonly string[]).includes(v) ? v as Layout : '1a'; };
type Seek = { t: number; n: number } | undefined;

/** the label, as on the film's ident: spaced caps over one thin orange line */
const Mark = ({ small = false }: { small?: boolean }) => <span className={`xpfm-mark${small ? ' is-small' : ''}`} aria-label={X.label}><b aria-hidden>{X.label}</b><i aria-hidden /></span>;

/** The complete film from its first scene (the IIAYN FILMS opener is skipped, 2026-10-31), never the thumbnail loop. Explicit play owns the sound while watching. */
function Film({ className = '', onTick, seek, f = M }: { className?: string; onTick?: (f: number) => void; seek?: Seek; f?: Feature }) {
  const [failed, setFailed] = useState(false);
  return <div className={`xpfm-film-box${failed ? ' is-failed' : ''}`}>
    <ShowcaseFilm className={`xpfm-film ${className}`} testId="xp-films-film" label={`${X.label}: ${nameOf(f)}, ${f.episode}`} take={f.key} onTake={() => 0}
      explicit onFail={() => setFailed(true)} onTick={onTick} seek={seek}
      takes={[{ key: f.key, url: f.url, poster: f.poster, label: nameOf(f), sound: true, start: f.identEnd || undefined }]} />
  </div>;
}

/** the title block: 엄마 · MUM, the episode, genre · length · language */
const Title = ({ as: H = 'h3', id, f = M }: { as?: 'h2' | 'h3'; id?: string; f?: Feature }) => <div className="xpfm-title">
  <H id={id} className="xpfm-name">{f.ko ? <><span lang="ko">{f.ko}</span><em aria-hidden>·</em><span>{f.en}</span></> : <span>{f.en}</span>}</H>
  <p className="xpfm-meta"><b>{f.episode}</b><span>{f.genre}</span><span>{f.sec} s</span><span>{f.lang}</span></p>
</div>;

/** the credit line, Make your own (Stitch), How it was made (and its panel, unless the layout shows it elsewhere) */
function Credits({ logline = true, how, lead, f = M }: { logline?: boolean; /** [open, setOpen, panel id] when the layout places the panel */ how?: [boolean, (o: boolean) => void, string]; /** a first action (2b: Play) */ lead?: React.ReactNode; f?: Feature }) {
  const own = useState(false); const ownId = useId(); const [open, setOpen] = how ?? own; const id = how?.[2] ?? ownId; const ed = f.editor ?? X.editor;
  return <div className="xpfm-credits">
    {logline && <p className="xpfm-log">{f.logline}</p>}
    <RunChip c={f.chip} className="xpfm-chip" testId="xp-films-chip" />
    <p className="xpfm-credit" data-testid="xp-films-credit">{f.credit}</p>
    <span className="xpfm-acts">
      {lead}
      <Link to={ed.href} className={lead ? 'xv-quiet' : 'xv-btn xv-btn-sm'} data-testid="xp-films-editor">{ed.label}{!lead && <Arrow />}</Link>
      {f.make && <Link to={f.make.href} className="xv-quiet" data-testid="xp-films-make">{f.make.label}</Link>}
      <button type="button" className="xpl-read" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} data-testid="xp-films-how">{open ? 'Hide how it was made' : 'How it was made'}</button>
    </span>
    {open && !how && <How id={id} f={f} />}
  </div>;
}

/** How it was made: the steps, then the shots (the start frame → a frame of the clip as cut), then the cost */
function How({ id, f = M }: { id: string; f?: Feature }) {
  return <div className="xpfm-how" id={id} role="region" aria-label={`How ${nameOf(f)} was made`} data-testid="xp-films-steps">
    <ol className="xpfm-steps">{(f.steps ?? X.steps).map((s, i) => <li key={s.name}><span className="n">{String(i + 1).padStart(2, '0')}</span><b>{s.name}</b><p>{s.what}</p></li>)}</ol>
    {f.shots.length > 0 && <><h4 className="xpfm-how-h">The shots</h4>
    <ol className="xpfm-how-shots" data-testid="xp-films-how-shots">{f.shots.map((s) => <li key={s.key}>
      <span className="xpfm-pair" aria-hidden><img src={s.start} alt="" loading="lazy" decoding="async" /><i>→</i><img src={s.frame} alt="" loading="lazy" decoding="async" /></span>
      <b>{s.name}</b><em>{s.model} · {s.sec} s</em></li>)}</ol></>}
    {f.cost && <p className="xpfm-cost">{f.cost}</p>}
  </div>;
}

/** a coming-soon card: no media yet, just the title on black with the label's orange line */
const Next = ({ n, small = false }: { n: FilmsNext; small?: boolean }) => <div className={`xpfm-next${small ? ' is-small' : ''}`} data-testid={`xp-films-next-${n.key}`} aria-label={`${n.title}, ${n.genre}, coming soon`} role="group">
  <span className="xpfm-next-in"><small>{n.genre}</small><b>{n.title}</b><i aria-hidden /><span className="xpfm-next-l">{n.line}</span></span>
  <span className="xpfm-soon">Coming soon</span>
</div>;

/** Your film here: a link to Video › Stitch */
const Yours = ({ className = '', ghost = false }: { className?: string; /** empty shot cards (1b, when there's room) */ ghost?: boolean }) => <Link to={X.yours.href} className={`xpfm-yours ${className}`} data-testid="xp-films-yours">
  {ghost && <span className="xpfm-ghost" aria-hidden>{['01', '02', '03'].map((n) => <span key={n}><small>Shot {n}</small></span>)}</span>}
  <span className="xpfm-yours-ic" aria-hidden><PlusIcon size={20} /></span>
  <b>{X.yours.title}</b><span>{X.yours.line}</span><em>{X.yours.label}<Arrow /></em>
</Link>;

/** The big player under the posters: the full film from its beginning, credits beside it, How it was made full width. */
function OpenPlayer({ refEl, onClose, f = M }: { refEl: React.RefObject<HTMLDivElement>; onClose: () => void; f?: Feature }) {
  const [how, setHow] = useState(false); const howId = useId();
  return <div ref={refEl} className="xpfm-open" id="xp-films-player" data-testid="xp-films-player" data-film={f.key}>
    <Film f={f} />
    <div className="xpfm-open-side">
      <button type="button" className="xpfm-close" onClick={onClose} aria-label="Close the player" data-testid="xp-films-close"><CloseIcon size={16} /></button>
      <Mark small /><Title f={f} /><Credits how={[how, setHow, howId]} f={f} />
    </div>
    {how && <How id={howId} f={f} />}
  </div>;
}
function usePlayer() {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  const toggle = () => { if (open) { setOpen(false); return; } setOpen(true); requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })); };
  return { open, toggle, close: () => setOpen(false), ref };
}

// ---------------------------------------------------------------- 1a. the shelf
function Shelf() {
  const p = usePlayer();
  return <div className="xp-in xpfm-shelf" data-testid="xp-films-shelf">
    <header className="xpfm-row-h"><Mark /><h2 id="xp-h-films" className="xpfm-h">{X.title}</h2><p className="xpfm-p">{X.line}</p></header>
    <ul className="xpfm-cards">
      <li><button type="button" className={`xpfm-card${p.open ? ' is-on' : ''}`} data-hover-play="" onClick={p.toggle} aria-expanded={p.open} aria-controls="xp-films-player" data-testid="xp-films-card-mum">
        <HoverClip src={M.loop} poster={M.poster} className="xpfm-card-m" />
        <span className="xpfm-card-shade" aria-hidden />
        <span className="xpfm-card-t"><small><Mark small /></small><b><span lang="ko">{M.ko}</span> · {M.en}</b><span>{M.episode} · {M.sec} s · {M.genre}</span></span>
        <span className="xpfm-card-play" aria-hidden><PlayIcon size={20} /></span>
        <span className="sr-only-vis">{p.open ? 'Close the player' : `Play ${NAME}`}</span>
      </button></li>
      {X.next.map((n) => <li key={n.key}><Next n={n} /></li>)}
      <li><Yours /></li>
    </ul>
    {p.open && <OpenPlayer refEl={p.ref} onClose={p.close} />}
  </div>;
}

// ---------------------------------------------------------------- 1b. the catalogue: tall posters; a film grows into a wide preview
/** One watch session at a time. Every poster press is a new watch from 0:00, including reselecting the open film. */
function useOpenFilm() {
  const [open, setOpen] = useState<string | null>(null); const [watch, setWatch] = useState(0); const ref = useRef<HTMLDivElement>(null);
  /* opening a film turns the page's sound on (this click is the viewer asking to watch it), even if they muted the hero earlier */
  const select = (key: string) => { turnSoundOn(); setOpen(key); setWatch(n => n + 1); requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })); };
  return { open, watch, select, close: () => setOpen(null), ref };
}
function Catalogue() {
  const p = useOpenFilm(); const on = FILMS.find((f) => f.key === p.open);
  /* Three or more films: posters fill the row; the hovered one widens into its silent preview (is-trio). */
  const n = FILMS.length + X.next.length;
  return <div className="xp-in xpfm-cat" data-testid="xp-films-catalogue">
    <header className="xpfm-cat-h"><div><Mark /><h2 id="xp-h-films" className="xpfm-h">{X.title}</h2></div><p className="xpfm-p">{X.line}</p></header>
    {/* two films fill the row as wide cards (is-duo); three or more fill it as posters (is-trio) */}
    <ul className={`xpfm-posters${n === 2 ? ' is-duo' : ''}${n >= 3 ? ' is-trio' : ''}${n >= 6 ? ' is-six' : ''}`}>
      {FILMS.map((f) => { const isOn = p.open === f.key; return <li key={f.key} className={`xpfm-pc is-film${isOn ? ' is-on' : ''}`} data-hover-play="" data-film={f.key}>
        <button type="button" className="xpfm-pc-btn" onClick={() => p.select(f.key)} aria-expanded={isOn} aria-controls="xp-films-player" data-testid={f === M ? 'xp-films-poster-mum' : `xp-films-poster-${f.key}`} aria-label={`${isOn ? 'Watch' : 'Play'} ${nameOf(f)} from the beginning, ${f.episode}`}>
          <img className="xpfm-pc-tall" src={f.tall} alt="" loading="lazy" decoding="async" />
          <HoverClip src={f.loop} poster={f.poster} className="xpfm-pc-wide" />
          <span className="xpfm-pc-shade" aria-hidden />
          <span className="xpfm-pc-top" aria-hidden><Mark small /></span>
          <span className={`xpfm-pc-title${f.en.length > 6 ? ' is-long' : ''}${f.ko ? '' : ' is-en'}`} aria-hidden>{f.ko ? <><b lang="ko">{f.ko}</b><i /><span className="en">{f.en}</span></> : <><b>{f.en}</b><i /></>}<small>{f.episode}</small></span>
          <span className="xpfm-pc-more" aria-hidden><span><RunChip onMedia c={f.chip} testId={`xp-films-chip-${f.key}`} /></span><span className="xpfm-pc-play"><PlayIcon size={16} />Play</span></span>
        </button>
      </li>; })}
      {X.next.map((n) => <li key={n.key} className="xpfm-pc is-soon" data-testid={`xp-films-next-${n.key}`} role="group" aria-label={`${n.title}, ${n.genre}, coming soon`}>
        <span className="xpfm-pc-seven" aria-hidden>7</span>
        <span className="xpfm-pc-top" aria-hidden><Mark small /></span>
        <span className="xpfm-pc-title" aria-hidden><small>{n.genre}</small><b>{n.title}</b><i /><span className="line">{n.line}</span></span>
        <span className="xpfm-soon">Coming soon</span>
      </li>)}
    </ul>
    {/* Only a new poster selection remounts the session. Sound, pause/resume, seeking and progress do not change this key. */}
    {on && <OpenPlayer key={`${on.key}:${p.watch}`} refEl={p.ref} onClose={p.close} f={on} />}
  </div>;
}

/** More from IIAYN FILMS (2a, 2b): the coming-soon card and Your film here */
const More = () => <div className="xp-in xpfm-more" data-testid="xp-films-more">
  <h3 className="xpfm-more-h">More from {X.label}</h3>
  <ul className="xpfm-more-row">{X.next.map((n) => <li key={n.key}><Next n={n} small /></li>)}<li><Yours className="is-small" /></li></ul>
</div>;

// ---------------------------------------------------------------- 2a. the feature
function Feature() {
  const [playing, setPlaying] = useState(false); const [box, near] = useNearView<HTMLDivElement>('600px');
  return <div className="xpfm-feature" data-testid="xp-films-feature">
    <div className="xp-in xpfm-row-h is-left"><Mark /></div>
    <div ref={box} className={`xpfm-cine${playing ? ' is-playing' : ''}`}>
      {playing ? <Film className="xpfm-film-contain" />
        : <>
          {near ? <HoverClip src={M.loop} poster={M.poster} mode="view" className="xpfm-cine-m" /> : <img className="xpfm-cine-m" src={M.poster} alt="" loading="lazy" decoding="async" />}
          <span className="xpfm-cine-shade" aria-hidden />
          <div className="xpfm-cine-in">
            <h2 id="xp-h-films" className="xpfm-cine-name"><span lang="ko">{M.ko}</span><span className="xpfm-cine-en">{M.en}</span></h2>
            <p className="xpfm-cine-ep">{M.episode}<span>{M.genre} · {M.sec} s · {M.lang}</span></p>
            <p className="xpfm-cine-log">{M.logline}</p>
            <button type="button" className="xv-btn xpfm-cine-play" onClick={() => setPlaying(true)} data-testid="xp-films-play"><PlayIcon size={18} />Play the film</button>
          </div>
        </>}
    </div>
    <div className="xp-in xpfm-under"><Credits logline={false} /></div>
    <More />
  </div>;
}

// ---------------------------------------------------------------- 2b. split: the trailer and the title side by side, the scenes under it
function Split() {
  const [playing, setPlaying] = useState(false); const [seek, setSeek] = useState<Seek>(); const [at, setAt] = useState(-1); const last = useRef(-1);
  const [box, near] = useNearView<HTMLDivElement>('600px'); const [how, setHow] = useState(false); const howId = useId();
  /* the scene on screen, from how far the film has played (re-render only when it changes) */
  const onTick = (f: number) => { const t = f * M.sec; let i = -1; S.forEach((s, k) => { if (t >= s.t0) i = k; }); if (t >= M.endAt) i = -1; if (i !== last.current) { last.current = i; setAt(i); } };
  const playFrom = (t?: number) => { setPlaying(true); if (t != null) setSeek((x) => ({ t: t + 0.05, n: (x?.n ?? 0) + 1 })); };
  const play = <button type="button" className="xv-btn xv-btn-sm" onClick={() => playFrom()} data-testid="xp-films-play" disabled={playing}><PlayIcon size={16} />{playing ? 'Playing' : 'Play the film'}</button>;
  return <div className="xp-in xpfm-split" data-testid="xp-films-split">
    <div className="xpfm-split-grid">
      <div ref={box} className="xpfm-split-media">
        {playing ? <Film onTick={onTick} seek={seek} />
          : <button type="button" className="xpfm-trailer" onClick={() => playFrom()} aria-label={`Play ${NAME}`} data-testid="xp-films-trailer">
            {near ? <HoverClip src={M.trailer} poster={M.poster} mode="view" className="xpfm-trailer-m" /> : <img className="xpfm-trailer-m" src={M.poster} alt="" loading="lazy" decoding="async" />}
            <span className="xpfm-trailer-tag" aria-hidden>Trailer</span>
            <span className="xpfm-trailer-play" aria-hidden><PlayIcon size={22} /></span>
          </button>}
      </div>
      <div className="xpfm-split-side">
        <Mark />
        <h2 id="xp-h-films" className="xpfm-split-name"><span lang="ko">{M.ko}</span><span className="xpfm-cine-en">{M.en}</span></h2>
        <p className="xpfm-cine-ep">{M.episode}<span>{M.genre} · {M.sec} s · {M.lang}</span></p>
        <Credits lead={play} how={[how, setHow, howId]} />
      </div>
    </div>
    <ol className="xpfm-scenes" aria-label="Scenes">
      {S.map((s, i) => <li key={s.key}><button type="button" className={`xpfm-scene${i === at ? ' is-on' : ''}`} aria-current={i === at ? 'true' : undefined} onClick={() => playFrom(s.t0)}
        data-testid={`xp-films-scene-${s.key}`} aria-label={`Play from ${s.name} (${tc(s.t0)})`}>
        <span className="xpfm-scene-m"><img src={s.frame} alt="" loading="lazy" decoding="async" /><span className="xpfm-tc">{tc(s.t0)}</span></span>
        <b>{s.name}</b><small>{s.what}</small>
      </button></li>)}
    </ol>
    {how && <How id={howId} />}
    <More />
  </div>;
}

/** the dev switch between the layouts (?films=1a|1b|2a|2b) */
function Switch({ v }: { v: Layout }) {
  return <div className="xpfm-switch bp-host" data-testid="xp-films-switch">
    <Segmented<Layout> label="IIAYN FILMS layout" value={v} onChange={(n) => { const q = new URLSearchParams(location.search); q.set('films', n); navigate(`${location.pathname}?${q}${location.hash}`, { replace: true }); }}
      options={[{ value: '1a', label: '1A · Shelf' }, { value: '1b', label: '1B · Posters' }, { value: '2a', label: '2A · Feature' }, { value: '2b', label: '2B · Split' }]} />
  </div>;
}

export function XpFilms() {
  // 1B · Posters, the user's pick (2026-10-27); the other layouts stay in this file for reference (?films= no longer switches)
  return <section className="xv-sec xpfm is-1b" id="xp-films" data-testid="xp-films" data-layout="1b" aria-labelledby="xp-h-films">
    <Catalogue />
  </section>;
}
