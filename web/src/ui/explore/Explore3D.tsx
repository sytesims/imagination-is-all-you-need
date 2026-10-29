/**
 * Explore: "Make it 3D. Then put it to work." (2026-10-27). Since 2026-10-28 (the user's call) only its hero film stays: Mossbun, from one
 * drawing to a film (shared ShowcaseFilm: plays muted while on screen, the shared SoundToggle, poster first, reduced motion = the poster), with the
 * real chain under it, Picture → 3D model → City → Film, each step's runs read from the featured entry (shared/featured.ts runByJob: model,
 * place, price). The live tiles (the city, Mossbun) and the kit shelf are off the page. Data: EXPLORE_3D in server/src/shared/exploreShowcase.ts.
 */
import { Link } from '../../platform/router';
import { prefersReducedMotion } from '../../shared/HoverClip';
import { featuredByKey, featuredRecreateHref, featuredRuns, runByJob, placeOfRoute, OUR_COMPUTER, FEATURED_BIG_POSTER, type FeaturedRun } from '../../../../server/src/shared/featured';
import { ShowcaseFilm } from '../../shared/ShowcaseFilm';
import { EXPLORE_3D } from '../../../../server/src/shared/exploreShowcase';
import './explore3d.css';

const X = EXPLORE_3D;
const Arrow = () => <span className="xv-arrow" aria-hidden>→</span>;
const Num = ({ n }: { n: number }) => <span className="x3-n" aria-hidden>{String(n).padStart(2, '0')}</span>;

/* ============================================================== the hero film ============================================================== */
const usd = (n: number, est?: boolean) => (n ? `${est ? '≈ ' : ''}$${n.toFixed(2)}` : 'Free');
/** a same-page link that scrolls (smoothly unless reduced motion) */
const jump = (e: React.MouseEvent, href: string) => { const el = document.getElementById(href.slice(1)); if (!el) return; e.preventDefault(); el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }); };
function HeroFilm() {
  const H = X.hero; const f = featuredByKey(H.key); if (!f) return null;
  const rec = featuredRecreateHref(f.key); const all = featuredRuns(f); const total = all.reduce((n, r) => n + r.costUsd, 0); const est = all.some((r) => r.est);
  const steps = H.steps.map((s) => ({ s, runs: s.jobs.map(runByJob).filter((r): r is FeaturedRun => !!r) }));
  return <div className="x3h" data-testid="x3-hero">
    {/* the film lives in one place: the featured entry's `out` (shared/featured.ts 'mossbun-golden-hour') */}
    <ShowcaseFilm className="x3h-film" testId="x3-hero-film" label={`${f.title}, made with ${f.model}`} take={f.key} onTake={() => 0} restartOnSound
      takes={[{ key: f.key, url: f.out.url, poster: FEATURED_BIG_POSTER[f.key] ?? f.out.poster, label: f.title, sound: f.out.sound }]}>
      <h3 className="x3h-h">{H.title}</h3>
      <p className="x3h-p">{H.line}</p>
      <span className="x3h-chips"><span className="xv-pill" data-testid="x3-hero-model">{f.model}</span><span className="xv-pill">{placeOfRoute(f.route)} · {usd(f.costUsd ?? 0, f.costEstimated)}</span></span>
    </ShowcaseFilm>
    <ol className="x3h-chain" aria-label={`How it was made: ${H.steps.map((s) => s.step).join(', then ')}`} data-testid="x3-hero-chain">
      {steps.map(({ s, runs }, k) => { const paid = runs.reduce((n, r) => n + r.costUsd, 0);
        return <li key={s.step} className={`x3h-step${k === steps.length - 1 ? ' is-end' : ''}`} data-testid={`x3-hero-step-${k + 1}`}>
          <span className={`x3h-thumb${s.thumb2 ? ' has-two' : ''}`}><img src={s.thumb} alt={s.alt} loading="lazy" decoding="async" draggable={false} />
            {s.thumb2 && <img className="x3h-thumb2" src={s.thumb2} alt="" aria-hidden loading="lazy" decoding="async" draggable={false} />}</span>
          <span className="x3h-name"><Num n={k + 1} /><b>{s.step}</b><span className="x3h-cost" data-testid={`x3-hero-price-${k + 1}`}>{usd(paid, runs.some((r) => r.est))}</span></span>
          <small className="x3h-what">{s.what}</small>
          <span className="x3h-runs">{runs.map((r) => { const credit = s.jobRoles?.[r.jobId];
            return <span key={r.jobId} className="x3h-run" data-job={r.jobId}>
              {credit && <small className="x3h-role">{credit.role}</small>}
              <em>{credit?.tool ?? r.model}</em>
              <span>{credit?.tool ? 'Recorded in browser' : r.place === OUR_COMPUTER ? 'Created locally' : r.place}</span>
            </span>; })}</span>
        </li>; })}
    </ol>
    <div className="x3h-foot">
      <p className="x3h-note" data-testid="x3-hero-note">{H.honest} <a href={H.honestLink.href} onClick={(e) => jump(e, H.honestLink.href)} data-testid="x3-hero-layout">{H.honestLink.label}</a></p>
      <span className="x3-ctas">
        <span className="x3h-total" data-testid="x3-hero-total">The whole chain: <b>{usd(total, est)}</b></span>
        {rec && <Link to={rec} className="xv-btn xv-btn-sm" data-testid="x3-hero-recreate">{H.recreate}<Arrow /></Link>}
        <Link to={H.make.href} className="xv-quiet" data-testid="x3-hero-make">{H.make.label}</Link>
      </span>
    </div>
  </div>;
}

export function Xp3D() {
  return <section className="xv-sec x3" id="xp-x3d" data-testid="xp-x3d" aria-labelledby="xp-h-x3d">
    <header className="xv-head"><div><span className="xv-eb">{X.eyebrow}</span><h2 id="xp-h-x3d">{X.title}</h2><p>{X.line}</p></div></header>
    <HeroFilm />
    <p className="x3-credit">{X.credit}</p>
  </section>;
}
