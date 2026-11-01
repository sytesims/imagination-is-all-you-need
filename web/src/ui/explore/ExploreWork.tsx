/**
 * "Made for your work" (2026-11-01): real results for shops and brands, each with its model, where it ran, its real price and "Make your own"
 * (the workflow opened as Recreate, the example's photos and words already in). Data: EXPLORE_WORK (server/src/shared/exploreShowcase.ts);
 * files, models and prices: the featured entries (shared/featured.ts, FEATURED_SHOP and 'image-layers-paw').
 * Layout (user pick, 2026-11-01, option A): audience tabs (Shop · Ads · Design), one big panel per tab: the result left (a before / after slider,
 * or the look with its "before" in the corner, or the run's clip), its words, looks, chips and "Make your own" right.
 */
import { useState } from 'react';
import { Link } from '../../platform/router';
import { CompareFrame } from '../../shared/CompareSlider';
import { HoverClip } from '../../shared/HoverClip';
import { RunChip } from '../../shared/RunChip';
import { chipOfFeatured } from '../../../../server/src/shared/runChip';
import { featuredByKey, type FeaturedItem } from '../../../../server/src/shared/featured';
import { EXPLORE_WORK, workHref, type WorkItem, type WorkVariant } from '../../../../server/src/shared/exploreShowcase';
import './exploreWork.css';

const Arrow = () => <span className="xv-arrow" aria-hidden>→</span>;

/** An item with its featured entry (model, place, price); null when its files are not in this build. */
function resolve(it: WorkItem) { const f = featuredByKey(it.priceKey); return f ? { it, f } : null; }
type Work = { it: WorkItem; f: FeaturedItem };
const works = (): Work[] => EXPLORE_WORK.items.map(resolve).filter((x): x is Work => !!x);

/** model · where it ran · real price (one run's, or the whole pack's): the shared run chip */
function Facts({ w }: { w: Work }) {
  const { it, f } = w;
  return <span className="xw-facts" data-testid={`xp-work-facts-${it.id}`}><RunChip c={chipOfFeatured(f, { model: it.model, note: it.per || undefined })} testId={`xp-work-price-${it.id}`} /></span>;
}
/** "Make your own": the workflow with this look's photos and words in (nothing runs until Generate) */
const MakeOwn = ({ it, v }: { it: WorkItem; v: WorkVariant }) =>
  <Link to={workHref(v)} className="xv-btn xw-make" data-testid={`xp-work-make-${it.id}`}>{EXPLORE_WORK.cta}<Arrow /></Link>;

/** The result: before / after on a slider (same framing), else the look with its "before" as a small picture, or the run's clip. */
function Stage({ it, v, className = '' }: { it: WorkItem; v: WorkVariant; className?: string }) {
  if (it.compare) return <CompareFrame className={`xw-stage ${className}`} start={42} intro="nudge" labels={[it.before.label, v.label]} testId={`xp-work-stage-${it.id}`}
    before={<img className="xw-img" src={it.before.url} alt={`${it.before.label}: the original`} decoding="async" draggable={false} />}
    after={<img className="xw-img" src={v.url} alt={`${v.label}: ${it.flow}`} decoding="async" draggable={false} />} />;
  return <div className={`xw-stage xw-looks ${className}`} data-testid={`xp-work-stage-${it.id}`}>
    {it.film ? <HoverClip className="xw-film" src={it.film.url} poster={it.film.poster} mode="view" label={it.film.label} position="36% 50%" />
      : it.variants.map((x) => <img key={x.url} className={`xw-img${x === v ? ' on' : ''}`} src={x.url} alt={x === v ? `${x.label}: ${it.flow}` : ''} aria-hidden={x !== v || undefined} loading="lazy" decoding="async" draggable={false} />)}
    <span className="xw-from"><img src={it.before.url} alt="" loading="lazy" decoding="async" draggable={false} /><i>{it.before.label}</i></span>
  </div>;
}
/** The looks a run made, to pick from: a material swatch, or the look's own thumbnail. Hover, focus or click shows it. */
function Picker({ it, cur, onPick }: { it: WorkItem; cur: number; onPick: (k: number) => void }) {
  if (it.variants.length < 2) return null;
  return <div className="xw-pick" data-n={it.variants.length} role="group" aria-label={it.compare ? 'Materials' : 'Styles'}>
    {it.variants.map((x, k) => <button key={x.url} type="button" className={k === cur ? 'on' : undefined} aria-pressed={k === cur} onClick={() => onPick(k)} onMouseEnter={() => onPick(k)} onFocus={() => onPick(k)}
      data-testid={`xp-work-pick-${it.id}-${k}`}><img src={x.swatch ?? x.thumb} alt="" loading="lazy" decoding="async" draggable={false} /><span>{x.label}</span></button>)}
  </div>;
}
const Head = () => <header className="xw-head">
  <span className="xv-eb">{EXPLORE_WORK.eyebrow}</span>
  <h2 id="xp-h-work" className="xps-h xw-h">{EXPLORE_WORK.title.map((l) => <span key={l}>{l}</span>)}</h2>
  <p className="xps-p xw-p">{EXPLORE_WORK.line}</p>
</header>;

export function XpWork() {
  const all = works(); const tabs = EXPLORE_WORK.tabs.filter((t) => all.some((w) => w.it.tab === t.id));
  const [tab, setTab] = useState(tabs[0]?.id); const [cur, setCur] = useState(0);
  const w = all.find((x) => x.it.tab === tab) ?? all[0]; if (!w) return null;
  const { it } = w; const v = it.variants[Math.min(cur, it.variants.length - 1)];
  return <section className="xv-sec xw xw-a" id="xp-work" data-testid="xp-work" aria-labelledby="xp-h-work">
    <div className="xw-a-top"><Head />
      <div className="xpc-cast xw-tabs" role="tablist" aria-label="Made for">{tabs.map((t) => <button key={t.id} type="button" role="tab" aria-selected={t.id === tab} className={t.id === tab ? 'on' : ''}
        onClick={() => { setTab(t.id); setCur(0); }} data-testid={`xp-work-tab-${t.id}`}>{t.label}</button>)}</div></div>
    <div className="xw-panel" role="tabpanel" aria-label={it.flow} data-testid={`xp-work-panel-${it.id}`}>
      <Stage it={it} v={v} className="xw-a-stage" />
      <div className="xw-side">
        <span className="xw-flow">{it.flow}</span>
        <h3 className="xw-t">{it.title}</h3>
        <p className="xw-line">{it.line}</p>
        <Picker it={it} cur={cur} onPick={setCur} />
        <Facts w={w} />
        <span className="xw-acts"><MakeOwn it={it} v={v} /></span>
      </div>
    </div>
  </section>;
}
