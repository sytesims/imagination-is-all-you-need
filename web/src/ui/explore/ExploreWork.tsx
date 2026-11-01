/**
 * "Made for your work" (2026-11-01; layout user pick 2026-11-02, the tab rail): real results for shops and brands, each with its model, where it
 * ran, its real price and "Make your own" (the workflow opened as Recreate, the example's photos and words already in). Data: EXPLORE_WORK
 * (server/src/shared/exploreShowcase.ts); files, models and prices: the featured entries (shared/featured.ts, FEATURED_SHOP).
 * Left: the headline, the tabs as a rail (Shop · Ads, each with its title), then the open tab's words, looks and button. Right: one big stage
 * with its run line under it (Explore's run-line rule: "Model · where it ran · $X each / for 3", a caption, never over the picture).
 * Two tabs (Image to layers has its own chapter, XpLayers). Every stage is a before / after: a slider when the frames line up (Material Swap),
 * else the result big with its "before" in the corner.
 */
import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Link } from '../../platform/router';
import { CompareFrame } from '../../shared/CompareSlider';
import { RunChip } from '../../shared/RunChip';
import { chipOfFeatured } from '../../../../server/src/shared/runChip';
import { featuredByKey, type FeaturedItem } from '../../../../server/src/shared/featured';
import { EXPLORE_WORK, workHref, type WorkItem, type WorkVariant } from '../../../../server/src/shared/exploreShowcase';
import './exploreWork.css';

const Arrow = () => <span className="xv-arrow" aria-hidden>→</span>;
const W = EXPLORE_WORK;

/** An item with its featured entry (model, place, price); null when its files are not in this build. */
type Work = { it: WorkItem; f: FeaturedItem };
const works = (): Work[] => W.items.map((it) => { const f = featuredByKey(it.priceKey); return f ? { it, f } : null; }).filter((x): x is Work => !!x);
/** the media's shape on the stage: each keeps its pictures' own shape */
const ratio = (it: WorkItem) => it.compare ? '3 / 4' : '4 / 5';

/** the run line under the stage: model · where it ran · real price (one run's "each", or the whole pack's "for 3"), the shared run chip */
const Facts = ({ w }: { w: Work }) => <span className="xw-facts" data-testid={`xp-work-facts-${w.it.id}`}>
  <RunChip c={chipOfFeatured(w.f, { model: w.it.model, note: w.it.per || undefined })} testId={`xp-work-price-${w.it.id}`} /></span>;
/** the panel's one button: the workflow with this look's photos and words in (nothing runs until Generate) */
const MakeOwn = ({ it, v }: { it: WorkItem; v: WorkVariant }) =>
  <Link to={workHref(v)} className="xv-btn xw-make" data-testid={`xp-work-make-${it.id}`} aria-label={`${it.cta}: ${W.cta} with ${it.flow}`}>{it.cta}<Arrow /></Link>;
const tag = (side: string, label: string) => `${side} · ${label}`;

/** Every look stacked, the picked one shown: switching fades and never waits on a download (no blank frame, no layout shift). */
const Looks = ({ it, v }: { it: WorkItem; v: WorkVariant }) => <>{it.variants.map((x) => <img key={x.url} className={`xw-img${x === v ? ' on' : ''}`} src={x.url}
  alt={x === v ? `${x.label}: ${it.flow}` : ''} aria-hidden={x !== v || undefined} decoding="async" draggable={false} />)}</>;

/** The result, big: before / after on the shared slider (same framing), else the result with its "before" in the corner. */
function Stage({ it, v }: { it: WorkItem; v: WorkVariant }) {
  if (it.compare) return <CompareFrame className="xw-stage" start={38} intro="nudge" labels={[tag(W.beforeTag, it.before.label), tag(W.afterTag, v.label)]} testId={`xp-work-stage-${it.id}`}
    before={<img className="xw-img on" src={it.before.url} alt={`${it.before.label}: the original`} decoding="async" draggable={false} />}
    after={<Looks it={it} v={v} />} />;
  return <div className="xw-stage xw-looks" data-testid={`xp-work-stage-${it.id}`}>
    <Looks it={it} v={v} />
    <span className="cmpf-tag cmpf-tag-r">{tag(W.afterTag, v.label)}</span>
    <span className="xw-from"><img src={it.before.url} alt={`${it.before.label}: the original`} loading="lazy" decoding="async" draggable={false} /><i><b>{W.beforeTag}</b>{it.before.label}</i></span>
  </div>;
}
/** The stage in its frame: a soft glow of the picked look behind it, the media centred at its own shape, its run line under it. */
const Frame = ({ w, v }: { w: Work; v: WorkVariant }) => <div className="xw-frame">
  <img className="xw-glow" src={v.thumb} alt="" aria-hidden decoding="async" draggable={false} />
  <figure className="xw-shot" style={{ ['--ar' as string]: ratio(w.it) } as CSSProperties}><Stage it={w.it} v={v} /><figcaption><Facts w={w} /></figcaption></figure>
</div>;

/** The looks a run made, to pick from: a material swatch or the ad's own thumbnail, with its name. Click or focus shows it. */
function Picker({ it, cur, onPick }: { it: WorkItem; cur: number; onPick: (k: number) => void }) {
  if (it.variants.length < 2) return null;
  return <div className="xw-pick" data-n={it.variants.length} role="group" aria-label={it.compare ? 'Materials' : 'Ads'}>
    {it.variants.map((x, k) => <button key={x.url} type="button" className={k === cur ? 'on' : undefined} aria-pressed={k === cur}
      onClick={() => onPick(k)} onFocus={() => onPick(k)} data-testid={`xp-work-pick-${it.id}-${k}`}>
      <img src={x.swatch ?? x.thumb} alt="" loading="lazy" decoding="async" draggable={false} /><span>{x.label}</span>
    </button>)}
  </div>;
}

/** The tabs as a rail, each with its title: arrow keys, Home and End move between tabs (and pick), as tabs should. */
function Tabs({ ws, tab, onTab, panel }: { ws: Work[]; tab: string; onTab: (t: string) => void; panel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const key = (e: KeyboardEvent) => {
    const k = ws.findIndex((w) => w.it.tab === tab); const n = ws.length;
    const to = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (k + 1) % n : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (k + n - 1) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (to < 0) return; e.preventDefault(); onTab(ws[to].it.tab); ref.current?.querySelectorAll<HTMLElement>('[role=tab]')[to]?.focus();
  };
  return <div ref={ref} className="xw-rail" role="tablist" aria-label="Made for" onKeyDown={key}>
    {ws.map(({ it }, k) => { const on = it.tab === tab; const label = W.tabs.find((t) => t.id === it.tab)?.label ?? it.tab;
      return <button key={it.id} type="button" role="tab" aria-selected={on} aria-controls={panel} tabIndex={on ? 0 : -1} className={on ? 'on' : ''}
        onClick={() => onTab(it.tab)} data-testid={`xp-work-tab-${it.tab}`}>
        <span className="xw-rail-n" aria-hidden>{String(k + 1).padStart(2, '0')}</span><span className="xw-rail-l">{label}<small>{it.flow}</small></span>
        <span className="xw-rail-t">{it.title}</span>
      </button>; })}
  </div>;
}

const Head = () => <header className="xw-head">
  <span className="xv-eb">{W.eyebrow}</span>
  <h2 id="xp-h-work" className="xps-h xw-h">{W.title.map((l) => <span key={l}>{l}</span>)}</h2>
  <p className="xps-p xw-p">{W.line}</p>
</header>;

export function XpWork() {
  const panel = useId();
  const all = works(); const [tab, setTab] = useState(all[0]?.it.tab ?? ''); const [cur, setCur] = useState(0);
  const w = all.find((x) => x.it.tab === tab) ?? all[0]; if (!w) return null;
  const { it } = w; const k = Math.min(cur, it.variants.length - 1); const v = it.variants[k];
  return <section className="xv-sec xw" id="xp-work" data-testid="xp-work" aria-labelledby="xp-h-work">
    <div className="xw-grid">
      <div className="xw-side"><Head /><Tabs ws={all} tab={it.tab} onTab={(t) => { setTab(t); setCur(0); }} panel={panel} />
        <div className="xw-panel" id={panel} role="tabpanel" aria-label={it.flow} data-testid={`xp-work-panel-${it.id}`}>
          <h3 className="xw-t xw-mt">{it.title}</h3><p className="xw-line">{it.line}</p>
          <Picker it={it} cur={k} onPick={setCur} />
          <span className="xw-acts"><MakeOwn it={it} v={v} /></span>
        </div>
      </div>
      <Frame w={w} v={v} />
    </div>
  </section>;
}
