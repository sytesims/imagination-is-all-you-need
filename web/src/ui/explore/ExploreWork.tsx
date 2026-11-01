/**
 * "Made for your work" (2026-11-01): real results for shops and brands, each with its model, where it ran, its real price and "Make your own"
 * (the workflow opened as Recreate, the example's photos and words already in). Data: EXPLORE_WORK (server/src/shared/exploreShowcase.ts);
 * files, models and prices: the featured entries (shared/featured.ts, FEATURED_SHOP and 'image-layers-paw').
 * Three layouts for the user to pick from, one shared set of parts (stage, picker, facts, button); Explore picks one with ?xp=a|b|c (default a):
 *  - A (XpWorkTabs): one section, audience tabs (Shop · Ads · Design), one big panel per tab: the result left, its words and looks right.
 *  - B (XpWorkRow): "For shops and brands", three equal cards in a row, each its result, words, chips and button.
 *  - C (XpWorkSpotlight): one big before / after with the four materials, then the ad pack as a strip (photo → three ads).
 */
import { useState } from 'react';
import { Link } from '../../platform/router';
import { CompareFrame } from '../../shared/CompareSlider';
import { HoverClip } from '../../shared/HoverClip';
import { featuredByKey, type FeaturedItem } from '../../../../server/src/shared/featured';
import { EXPLORE_WORK, workHref, type WorkItem, type WorkVariant } from '../../../../server/src/shared/exploreShowcase';
import './exploreWork.css';

const Arrow = () => <span className="xv-arrow" aria-hidden>→</span>;
const usd = (n: number) => `$${n.toFixed(2)}`;

/** An item with its featured entry (model, place, price); null when its files are not in this build. */
function resolve(it: WorkItem) { const f = featuredByKey(it.priceKey); return f ? { it, f } : null; }
type Work = { it: WorkItem; f: FeaturedItem };
const works = (): Work[] => EXPLORE_WORK.items.map(resolve).filter((x): x is Work => !!x);

/** model · where it ran · real price (one run's, or the whole pack's) */
function Facts({ w }: { w: Work }) {
  const { it, f } = w; const place = f.runOn === 'local' ? 'Free on your computer' : 'Comfy Cloud';
  return <span className="xw-facts" data-testid={`xp-work-facts-${it.id}`}>
    <span className="xv-pill xv-pill-dark">{it.model ?? f.model}</span><span className="xv-pill xv-pill-dark">{place}</span>
    {f.costUsd != null && <span className="xv-pill xw-price" data-testid={`xp-work-price-${it.id}`}>{usd(f.costUsd)}{it.per ? <small>{it.per}</small> : null}</span>}
  </span>;
}
/** "Make your own": the workflow with this look's photos and words in (nothing runs until Generate) */
const MakeOwn = ({ it, v, small }: { it: WorkItem; v: WorkVariant; small?: boolean }) =>
  <Link to={workHref(v)} className={`xv-btn${small ? ' xv-btn-sm' : ''} xw-make`} data-testid={`xp-work-make-${it.id}`}>{EXPLORE_WORK.cta}<Arrow /></Link>;

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
function Picker({ it, cur, onPick, big }: { it: WorkItem; cur: number; onPick: (k: number) => void; big?: boolean }) {
  if (it.variants.length < 2) return null;
  return <div className={`xw-pick${big ? ' is-big' : ''}`} role="group" aria-label={it.compare ? 'Materials' : 'Styles'}>
    {it.variants.map((x, k) => <button key={x.url} type="button" className={k === cur ? 'on' : undefined} aria-pressed={k === cur} onClick={() => onPick(k)} onMouseEnter={() => onPick(k)} onFocus={() => onPick(k)}
      data-testid={`xp-work-pick-${it.id}-${k}`}><img src={x.swatch ?? x.thumb} alt="" loading="lazy" decoding="async" draggable={false} /><span>{x.label}</span></button>)}
  </div>;
}
const Head = ({ title }: { title?: string[] }) => <header className="xw-head">
  <span className="xv-eb">{EXPLORE_WORK.eyebrow}</span>
  <h2 id="xp-h-work" className="xps-h xw-h">{(title ?? EXPLORE_WORK.title).map((l) => <span key={l}>{l}</span>)}</h2>
  <p className="xps-p xw-p">{EXPLORE_WORK.line}</p>
</header>;

/* ---------------------------------------------------------------- A: audience tabs, one big panel */
export function XpWorkTabs() {
  const all = works(); const tabs = EXPLORE_WORK.tabs.filter((t) => all.some((w) => w.it.tab === t.id));
  const [tab, setTab] = useState(tabs[0]?.id); const [cur, setCur] = useState(0);
  const w = all.find((x) => x.it.tab === tab) ?? all[0]; if (!w) return null;
  const { it } = w; const v = it.variants[Math.min(cur, it.variants.length - 1)];
  return <section className="xv-sec xw xw-a" id="xp-work" data-testid="xp-work" data-xp="a" aria-labelledby="xp-h-work">
    <div className="xw-a-top"><Head />
      <div className="xpc-cast xw-tabs" role="tablist" aria-label="Made for">{tabs.map((t) => <button key={t.id} type="button" role="tab" aria-selected={t.id === tab} className={t.id === tab ? 'on' : ''}
        onClick={() => { setTab(t.id); setCur(0); }} data-testid={`xp-work-tab-${t.id}`}>{t.label}</button>)}</div></div>
    <div className="xw-panel" role="tabpanel" aria-label={it.flow} data-testid={`xp-work-panel-${it.id}`}>
      <Stage it={it} v={v} className="xw-a-stage" />
      <div className="xw-side">
        <span className="xw-flow">{it.flow}</span>
        <h3 className="xw-t">{it.title}</h3>
        <p className="xw-line">{it.line}</p>
        <Picker it={it} cur={cur} onPick={setCur} big />
        <Facts w={w} />
        <span className="xw-acts"><MakeOwn it={it} v={v} /></span>
      </div>
    </div>
  </section>;
}

/* ---------------------------------------------------------------- B: one row of equal cards */
function Card({ w }: { w: Work }) {
  const { it } = w; const [cur, setCur] = useState(0); const v = it.variants[cur];
  return <article className="xw-card" data-testid={`xp-work-card-${it.id}`}>
    <Stage it={it} v={v} className="xw-card-stage" />
    <div className="xw-card-b">
      <span className="xw-flow">{it.flow}</span>
      <h3 className="xw-t">{it.title}</h3>
      <p className="xw-line">{it.line}</p>
      <Picker it={it} cur={cur} onPick={setCur} />
      <Facts w={w} />
      <span className="xw-acts"><MakeOwn it={it} v={v} small /></span>
    </div>
  </article>;
}
export function XpWorkRow() {
  const all = works(); if (!all.length) return null;
  return <section className="xv-sec xw xw-b" id="xp-work" data-testid="xp-work" data-xp="b" aria-labelledby="xp-h-work">
    <Head title={EXPLORE_WORK.rowTitle} />
    <div className="xw-row">{all.map((w) => <Card key={w.it.id} w={w} />)}</div>
  </section>;
}

/* ---------------------------------------------------------------- C: one big before / after, then the ads as a strip */
export function XpWorkSpotlight() {
  const all = works(); const swap = all.find((w) => w.it.compare); const ads = all.find((w) => w.it.id === 'ad-pack');
  const [cur, setCur] = useState(0); if (!swap) return null;
  const v = swap.it.variants[cur];
  return <section className="xv-sec xw xw-c" id="xp-work" data-testid="xp-work" data-xp="c" aria-labelledby="xp-h-work">
    <div className="xw-spot">
      <Stage it={swap.it} v={v} className="xw-c-stage" />
      <div className="xw-side">
        <Head />
        <span className="xw-flow">{swap.it.flow}</span>
        <h3 className="xw-t">{swap.it.title}</h3>
        <p className="xw-line">{swap.it.line}</p>
        <Picker it={swap.it} cur={cur} onPick={setCur} big />
        <Facts w={swap} />
        <span className="xw-acts"><MakeOwn it={swap.it} v={v} /></span>
      </div>
    </div>
    {ads && <div className="xw-strip" data-testid={`xp-work-card-${ads.it.id}`}>
      <div className="xw-strip-text"><span className="xw-flow">{ads.it.flow}</span><h3 className="xw-t">{ads.it.title}</h3><p className="xw-line">{ads.it.line}</p>
        <Facts w={ads} /><span className="xw-acts"><MakeOwn it={ads.it} v={ads.it.variants[0]} small /></span></div>
      <ol className="xw-strip-media" aria-label={`${ads.it.before.label} to ${ads.it.variants.length} ads`}>
        <li className="xw-strip-in"><img src={ads.it.before.url} alt={`${ads.it.before.label}: the original`} loading="lazy" decoding="async" draggable={false} /><span className="xv-tag">{ads.it.before.label}</span></li>
        <li className="xw-strip-arrow" aria-hidden>→</li>
        {ads.it.variants.map((x) => <li key={x.url} className="xw-strip-ad"><img src={x.url} alt={`${x.label}: ${ads.it.flow}`} loading="lazy" decoding="async" draggable={false} /><span className="xv-tag">{x.label}</span></li>)}
      </ol>
    </div>}
  </section>;
}

/** The option on show: ?xp=a|b|c (preview only, until the user picks one); default A. */
export function XpWork() {
  const xp = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('xp') : null;
  return xp === 'b' ? <XpWorkRow /> : xp === 'c' ? <XpWorkSpotlight /> : <XpWorkTabs />;
}
