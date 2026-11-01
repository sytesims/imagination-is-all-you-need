/**
 * Explore: "Create your character. Bring it to life." (rebuilt 2026-10-31; copy as actions 2026-11-02). One headline in the chapter style (#xp-swap's classes), the finished film big
 * (the shared ShowcaseFilm with its on-brand controls and sound, no overlay), then the four steps behind it, one card each (picture, step,
 * one model, one price; runs read from the featured entry, shared/featured.ts runByJob), and one bottom row: the whole chain's price, Recreate,
 * Make your own and a Credits tip. The 3D card turns Mossbun's GLB slowly while on screen (the shared Model3D, at the lowest priority of the
 * one-live-viewer slot, so any other viewer takes it). Data: EXPLORE_3D in server/src/shared/exploreShowcase.ts.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from '../../platform/router';
import { prefersReducedMotion } from '../../shared/HoverClip';
import { Model3D } from '../../shared/model3d';
import { tip } from '../../shared/Tooltip';
import { InfoIcon } from '../Icons';
import { RunChip } from '../../shared/RunChip';
import { chipOfChain, chipPlace, chipUsd } from '../../../../server/src/shared/runChip';
import { featuredByKey, featuredRecreateHref, featuredRuns, runByJob, FEATURED_BIG_POSTER, type FeaturedRun } from '../../../../server/src/shared/featured';
import { ShowcaseFilm } from '../../shared/ShowcaseFilm';
import { EXPLORE_3D, type X3dStep } from '../../../../server/src/shared/exploreShowcase';
import './explore3d.css';

const X = EXPLORE_3D;

/** WebGL here at all? (without it the viewer loads a blank canvas: keep the still) */
const hasWebGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') ?? c.getContext('webgl')); } catch { return false; } };
/** The 3D card's picture: the still, then Mossbun turning slowly while the card is on screen (never under reduced motion or without WebGL). */
function Spin({ s }: { s: X3dStep }) {
  const box = useRef<HTMLSpanElement>(null); const [near, setNear] = useState(false);
  useEffect(() => { const el = box.current; if (!el || !s.spin || prefersReducedMotion() || typeof IntersectionObserver === 'undefined' || !hasWebGL()) return;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { threshold: 0.4 }); io.observe(el); return () => io.disconnect(); }, [s.spin]);
  return <span ref={box} className="x3-pic">
    {near ? <Model3D src={s.spin!} poster={s.thumb} alt={s.alt} slot="explore-x3d-spin" pri={0} controls={false} rotateDelay={0} cameraOrbit="60deg 78deg 100%" testId="x3-spin" />
      : <img src={s.thumb} alt={s.alt} loading="lazy" decoding="async" draggable={false} />}
  </span>;
}

function Step({ s, n, plain = false, media, peek }: { s: X3dStep; n: number; /** a small still, never the live 3D (the split's rail) */ plain?: boolean;
  /** the picture's place holds this instead (the scroll story's last card: the film itself) */ media?: React.ReactNode; /** hover / focus shows this step in the split's stage */ peek?: (on: boolean) => void }) {
  const r = runByJob(s.job); if (!r) return null;
  const tools = (s.tools ?? []).map((t) => ({ t, r: runByJob(t.job) })).filter((x): x is { t: typeof x.t; r: FeaturedRun } => !!x.r);
  /* the shared run chip: the step's model, place and the step's whole price; its other tools (with their role) as "+N" */
  const chip = { ...chipOfChain(r, tools.map((x) => x.r)), ...(tools.length ? { also: tools.map(({ t, r: x }) => `${t.tool ?? x.model} (${t.role}) · ${chipPlace(x.place)} · ${chipUsd(x.costUsd, x.est)}`) } : {}) };
  return <li className="x3-step" data-testid={`x3-step-${n}`} data-n={n} {...(peek ? { tabIndex: 0, onMouseEnter: () => peek(true), onMouseLeave: () => peek(false), onFocus: () => peek(true), onBlur: () => peek(false) } : {})}>
    {media ? <span className="x3-pic x3-pic-film">{media}</span>
      : s.spin && !plain ? <Spin s={s} /> : <span className="x3-pic"><img src={s.thumb} alt={s.alt} loading="lazy" decoding="async" draggable={false} />
      {s.before && !plain && <span className="x3-before" data-testid={`x3-step-${n}-before`}><img src={s.before} alt="Before: the grey Direct a Shot capture" loading="lazy" decoding="async" draggable={false} /><small>Before</small></span>}
      {s.caption && !plain && <span className="x3-cap">{s.caption}</span>}</span>}
    <span className="x3-name"><span className="x3-n" aria-hidden>{String(n).padStart(2, '0')}</span><b>{s.step}</b></span>
    <span className="x3-run"><RunChip c={chip} testId={`x3-step-${n}-model`} /></span>
  </li>;
}

/** The layout being picked (2026-11-02): ?charsection=a (split: headline and a step rail, the stage on the right), b (media first: the film
 *  full bleed, the headline small on it, the steps as a strip under it), c (scroll story: the headline pinned, the steps as big cards); else 0 (today). */
export type CharLayout = '0' | 'a' | 'b' | 'c';
export const charLayout = (): CharLayout => { const v = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('charsection') : null; return v === 'a' || v === 'b' || v === 'c' ? v : '0'; };

export function Xp3D() {
  const f = featuredByKey(X.key); const [lay] = useState(charLayout); const [peek, setPeek] = useState<number | null>(null); const [on, setOn] = useState(0);
  const cards = useRef<HTMLOListElement>(null);
  /* the scroll story: the step card nearest the middle of the screen lights its name on the left */
  useEffect(() => {
    const el = cards.current; if (lay !== 'c' || !el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) setOn(Number((e.target as HTMLElement).dataset.n) - 1); }, { rootMargin: '-45% 0px -45% 0px' });
    el.querySelectorAll('.x3-step').forEach((c) => io.observe(c)); return () => io.disconnect();
  }, [lay]);
  if (!f) return null;
  const rec = featuredRecreateHref(f.key); const all = featuredRuns(f); const total = all.reduce((n, r) => n + r.costUsd, 0);
  const centred = lay === '0';
  const head = <header className={centred ? 'xsdc-head' : 'x3-head'}>
    <h2 id="xp-h-x3d" className={`xps-h${centred ? ' xsdc-h' : ''}`}>{X.title.map((l) => <span key={l}>{l}</span>)}</h2>
    <p className={`xps-p${centred ? ' xsdc-p' : ''}`}>{X.line}</p>
  </header>;
  /* the film lives in one place: the featured entry's `out` (shared/featured.ts 'mossbun-golden-hour') */
  const film = <ShowcaseFilm className="x3-film" testId="x3-film" label={`${f.title}, made with ${f.model}`} take={f.key} onTake={() => 0} controls restartOnSound
    takes={[{ key: f.key, url: f.out.url, poster: FEATURED_BIG_POSTER[f.key] ?? f.out.poster, label: f.title, sec: f.out.sec, sound: f.out.sound }]} />;
  const label = `How it was made: ${X.steps.map((s) => s.step).join(', then ')}`;
  const steps = (o: { plain?: boolean; peek?: boolean; filmLast?: boolean } = {}) => <ol ref={o.filmLast ? cards : undefined} className="x3-steps" aria-label={label} data-testid="x3-steps">
    {X.steps.map((s, k) => <Step key={s.job} s={s} n={k + 1} plain={o.plain} media={o.filmLast && k === X.steps.length - 1 ? film : undefined}
      peek={o.peek ? (v) => setPeek((p) => (v ? k : p === k ? null : p)) : undefined} />)}
  </ol>;
  const foot = <div className="x3-foot" data-testid="x3-foot">
    <p className="x3-total" data-testid="x3-total">Every step was made in this app<span aria-hidden> · </span><b>about ${total.toFixed(2)}</b>
      <span className="x3-credits" tabIndex={0} {...tip(X.credit)} aria-label={`Credits: ${X.credit}`} data-testid="x3-credits"><InfoIcon size={14} />Credits</span></p>
    <span className="x3-ctas">
      {rec && <Link to={rec} className="xv-btn xv-btn-sm" data-testid="x3-recreate">{X.recreate}<span className="xv-arrow" aria-hidden>→</span></Link>}
      <Link to={X.make.href} className="xv-quiet" data-testid="x3-make">{X.make.label}</Link>
    </span>
  </div>;
  return <section className={`xv-sec x3 x3-l${lay}`} id="xp-x3d" data-testid="xp-x3d" data-layout={lay} aria-labelledby="xp-h-x3d">
    {lay === 'a' ? <div className="x3-split">
      <div className="x3-side">{head}{steps({ plain: true, peek: true })}{foot}</div>
      {/* the stage: the film; a step under the pointer (or keyboard focus) shows its picture over it (all four stacked, so nothing moves) */}
      <div className="x3-stage">{film}{X.steps.slice(0, -1).map((s, k) => <img key={s.job} className={`x3-peek${peek === k ? ' on' : ''}`} src={s.thumb} alt="" aria-hidden loading="lazy" decoding="async" draggable={false} />)}</div>
    </div>
    : lay === 'b' ? <>
      <div className="x3-bleed">{film}<div className="x3-over">{head}</div></div>
      {steps()}{foot}
    </>
    : lay === 'c' ? <div className="x3-story">
      <div className="x3-pin">{head}
        <ol className="x3-prog" aria-hidden>{X.steps.map((s, k) => <li key={s.job} className={on === k ? 'on' : ''}><i>{String(k + 1).padStart(2, '0')}</i>{s.step}</li>)}</ol>
        {foot}</div>
      {steps({ filmLast: true })}
    </div>
    : <>{head}{film}{steps()}{foot}</>}
  </section>;
}
