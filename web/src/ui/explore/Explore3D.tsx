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

function Step({ s, n }: { s: X3dStep; n: number }) {
  const r = runByJob(s.job); if (!r) return null;
  const tools = (s.tools ?? []).map((t) => ({ t, r: runByJob(t.job) })).filter((x): x is { t: typeof x.t; r: FeaturedRun } => !!x.r);
  /* the shared run chip: the step's model, place and the step's whole price; its other tools (with their role) as "+N" */
  const chip = { ...chipOfChain(r, tools.map((x) => x.r)), ...(tools.length ? { also: tools.map(({ t, r: x }) => `${t.tool ?? x.model} (${t.role}) · ${chipPlace(x.place)} · ${chipUsd(x.costUsd, x.est)}`) } : {}) };
  return <li className="x3-step" data-testid={`x3-step-${n}`}>
    {s.spin ? <Spin s={s} /> : <span className="x3-pic"><img src={s.thumb} alt={s.alt} loading="lazy" decoding="async" draggable={false} />
      {s.before && <span className="x3-before" data-testid={`x3-step-${n}-before`}><img src={s.before} alt="Before: the grey Direct a Shot capture" loading="lazy" decoding="async" draggable={false} /><small>Before</small></span>}
      {s.caption && <span className="x3-cap">{s.caption}</span>}</span>}
    <span className="x3-name"><span className="x3-n" aria-hidden>{String(n).padStart(2, '0')}</span><b>{s.step}</b></span>
    <span className="x3-run"><RunChip c={chip} testId={`x3-step-${n}-model`} /></span>
  </li>;
}

export function Xp3D() {
  const f = featuredByKey(X.key); if (!f) return null;
  const rec = featuredRecreateHref(f.key); const all = featuredRuns(f); const total = all.reduce((n, r) => n + r.costUsd, 0);
  return <section className="xv-sec x3" id="xp-x3d" data-testid="xp-x3d" aria-labelledby="xp-h-x3d">
    <header className="xsdc-head">
      <h2 id="xp-h-x3d" className="xps-h xsdc-h">{X.title.map((l) => <span key={l}>{l}</span>)}</h2>
      <p className="xps-p xsdc-p">{X.line}</p>
    </header>
    {/* the film lives in one place: the featured entry's `out` (shared/featured.ts 'mossbun-golden-hour') */}
    <ShowcaseFilm className="x3-film" testId="x3-film" label={`${f.title}, made with ${f.model}`} take={f.key} onTake={() => 0} controls restartOnSound
      takes={[{ key: f.key, url: f.out.url, poster: FEATURED_BIG_POSTER[f.key] ?? f.out.poster, label: f.title, sec: f.out.sec, sound: f.out.sound }]} />
    <ol className="x3-steps" aria-label={`How it was made: ${X.steps.map((s) => s.step).join(', then ')}`} data-testid="x3-steps">
      {X.steps.map((s, k) => <Step key={s.job} s={s} n={k + 1} />)}
    </ol>
    <div className="x3-foot" data-testid="x3-foot">
      <p className="x3-total" data-testid="x3-total">Every step was made in this app<span aria-hidden> · </span><b>about ${total.toFixed(2)}</b>
        <span className="x3-credits" tabIndex={0} {...tip(X.credit)} aria-label={`Credits: ${X.credit}`} data-testid="x3-credits"><InfoIcon size={14} />Credits</span></p>
      <span className="x3-ctas">
        {rec && <Link to={rec} className="xv-btn xv-btn-sm" data-testid="x3-recreate">{X.recreate}<span className="xv-arrow" aria-hidden>→</span></Link>}
        <Link to={X.make.href} className="xv-quiet" data-testid="x3-make">{X.make.label}</Link>
      </span>
    </div>
  </section>;
}
