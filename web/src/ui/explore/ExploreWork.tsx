/**
 * "Made for your work" (2026-11-01, redesign options 2026-11-02): real results for shops and brands, each with its model, where it ran, its real
 * price and "Make your own" (the workflow opened as Recreate, the example's photos and words already in). Data: EXPLORE_WORK
 * (server/src/shared/exploreShowcase.ts); files, models and prices: the featured entries (shared/featured.ts, FEATURED_SHOP).
 * Three layouts to pick from (?worksection=a|b|c, default a), all built from the same parts (Stage, Picker, Facts, MakeOwn, Tabs):
 *  - A, tab rail: the tabs as a rail with each one's title, its words and looks under it; one big stage beside it.
 *  - B, bento: the big stage as the anchor tile, a words tile and a tile of every look the run made.
 *  - C, focused: one centred stage, round swatches under it, then the words, the chip and the button.
 * Two tabs, Shop and Ads (Image to layers has its own chapter, XpLayers). Every stage is a before / after: a slider when the frames line up (Material Swap), else the result big with its "before" in the corner.
 */
import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Link } from '../../platform/router';
import { CompareFrame } from '../../shared/CompareSlider';
import { RunChip } from '../../shared/RunChip';
import { chipOfFeatured } from '../../../../server/src/shared/runChip';
import { featuredByKey, type FeaturedItem } from '../../../../server/src/shared/featured';
import { EXPLORE_WORK, workHref, type WorkItem, type WorkVariant } from '../../../../server/src/shared/exploreShowcase';
import './exploreWork.css';

type Opt = 'a' | 'b' | 'c';
/** the layout being previewed: ?worksection=a|b|c (default a) */
const option = (): Opt => { try { const v = new URLSearchParams(window.location.search).get('worksection'); return v === 'b' || v === 'c' ? v : 'a'; } catch { return 'a'; } };

const Arrow = () => <span className="xv-arrow" aria-hidden>→</span>;
const W = EXPLORE_WORK;

/** An item with its featured entry (model, place, price); null when its files are not in this build. */
type Work = { it: WorkItem; f: FeaturedItem };
const works = (): Work[] => W.items.map((it) => { const f = featuredByKey(it.priceKey); return f ? { it, f } : null; }).filter((x): x is Work => !!x);
/** the media's shape on the stage: each keeps its pictures' own shape */
const ratio = (it: WorkItem) => it.compare ? '3 / 4' : '4 / 5';

/** model · where it ran · real price (one run's, or the whole pack's): the shared run chip */
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
  const style = { ['--ar' as string]: ratio(it) } as CSSProperties;
  if (it.compare) return <CompareFrame className="xw-stage" style={style} start={38} intro="nudge" labels={[tag(W.beforeTag, it.before.label), tag(W.afterTag, v.label)]} testId={`xp-work-stage-${it.id}`}
    before={<img className="xw-img on" src={it.before.url} alt={`${it.before.label}: the original`} decoding="async" draggable={false} />}
    after={<Looks it={it} v={v} />} />;
  return <div className="xw-stage xw-looks" style={style} data-testid={`xp-work-stage-${it.id}`}>
    <Looks it={it} v={v} />
    <span className="cmpf-tag cmpf-tag-r">{tag(W.afterTag, v.label)}</span>
    <span className="xw-from"><img src={it.before.url} alt={`${it.before.label}: the original`} loading="lazy" decoding="async" draggable={false} /><i><b>{W.beforeTag}</b>{it.before.label}</i></span>
  </div>;
}
/** The stage in its frame: a soft glow of the picked look behind it, the media centred at its own shape. */
const Frame = ({ it, v }: { it: WorkItem; v: WorkVariant }) => <div className="xw-frame">
  <img className="xw-glow" src={v.thumb} alt="" aria-hidden decoding="async" draggable={false} />
  <Stage it={it} v={v} />
</div>;

/** The looks a run made, to pick from. chips: swatch + name (A) · tiles: the results themselves (B) · dots: round swatches, the name above (C). */
function Picker({ it, cur, onPick, look }: { it: WorkItem; cur: number; onPick: (k: number) => void; look: 'chips' | 'tiles' | 'dots' }) {
  if (it.variants.length < 2) return null;
  const name = it.compare ? 'Materials' : 'Ads';
  return <div className={`xw-pick xw-pick-${look}`} data-n={it.variants.length}>
    {look === 'dots' && <span className="xw-pick-name" aria-live="polite">{it.variants[cur]?.label}</span>}
    <div className="xw-pick-row" role="group" aria-label={name}>
      {it.variants.map((x, k) => <button key={x.url} type="button" className={k === cur ? 'on' : undefined} aria-pressed={k === cur} aria-label={x.label}
        onClick={() => onPick(k)} onFocus={() => onPick(k)} data-testid={`xp-work-pick-${it.id}-${k}`}>
        <img src={look === 'tiles' ? x.thumb : x.swatch ?? x.thumb} alt="" loading="lazy" decoding="async" draggable={false} />
        {look === 'tiles' && x.swatch && <img className="xw-sw" src={x.swatch} alt="" loading="lazy" decoding="async" draggable={false} />}
        {look !== 'dots' && <span>{x.label}</span>}
      </button>)}
    </div>
  </div>;
}

/** The tab bar: arrow keys, Home and End move between tabs (and pick), as tabs should. `rail`: each tab carries its title (A). */
function Tabs({ ws, tab, onTab, panel, rail = false }: { ws: Work[]; tab: string; onTab: (t: string) => void; panel: string; rail?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const key = (e: KeyboardEvent) => {
    const k = ws.findIndex((w) => w.it.tab === tab); const n = ws.length;
    const to = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (k + 1) % n : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (k + n - 1) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (to < 0) return; e.preventDefault(); onTab(ws[to].it.tab); ref.current?.querySelectorAll<HTMLElement>('[role=tab]')[to]?.focus();
  };
  return <div ref={ref} className={rail ? 'xw-rail' : 'xpc-cast xw-tabs'} role="tablist" aria-label="Made for" onKeyDown={key}>
    {ws.map(({ it }, k) => { const on = it.tab === tab; const label = W.tabs.find((t) => t.id === it.tab)?.label ?? it.tab;
      return <button key={it.id} type="button" role="tab" aria-selected={on} aria-controls={panel} tabIndex={on ? 0 : -1} className={on ? 'on' : ''}
        onClick={() => onTab(it.tab)} data-testid={`xp-work-tab-${it.tab}`}>
        {rail ? <><span className="xw-rail-n" aria-hidden>{String(k + 1).padStart(2, '0')}</span><span className="xw-rail-l">{label}<small>{it.flow}</small></span>
          <span className="xw-rail-t">{it.title}</span></> : label}
      </button>; })}
  </div>;
}

const Head = ({ center = false }: { center?: boolean }) => <header className={`xw-head${center ? ' is-center' : ''}`}>
  <span className="xv-eb">{W.eyebrow}</span>
  <h2 id="xp-h-work" className="xps-h xw-h">{W.title.map((l) => <span key={l}>{l}</span>)}</h2>
  <p className="xps-p xw-p">{W.line}</p>
</header>;

export function XpWork() {
  const [opt] = useState(option); const panel = useId();
  const all = works(); const [tab, setTab] = useState(all[0]?.it.tab ?? ''); const [cur, setCur] = useState(0);
  const w = all.find((x) => x.it.tab === tab) ?? all[0]; if (!w) return null;
  const { it } = w; const k = Math.min(cur, it.variants.length - 1); const v = it.variants[k];
  const onTab = (t: string) => { setTab(t); setCur(0); };
  const tabs = (rail = false) => <Tabs ws={all} tab={w.it.tab} onTab={onTab} panel={panel} rail={rail} />;
  const pick = (look: 'chips' | 'tiles' | 'dots') => <Picker it={it} cur={k} onPick={setCur} look={look} />;
  const words = <><span className="xw-flow">{it.flow}</span><h3 className="xw-t">{it.title}</h3><p className="xw-line">{it.line}</p></>;
  const acts = <span className="xw-acts"><MakeOwn it={it} v={v} /><Facts w={w} /></span>;
  const pan = { id: panel, role: 'tabpanel', 'aria-label': it.flow, 'data-testid': `xp-work-panel-${it.id}` } as const;

  return <section className={`xv-sec xw xw-${opt}`} id="xp-work" data-testid="xp-work" data-option={opt} aria-labelledby="xp-h-work">
    {opt === 'a' && <div className="xw-a-grid">
      <div className="xw-a-side"><Head />{tabs(true)}
        <div className="xw-a-panel" {...pan}><h3 className="xw-t xw-a-mt">{it.title}</h3><p className="xw-line">{it.line}</p>{pick('chips')}{acts}</div>
      </div>
      <Frame it={it} v={v} />
    </div>}

    {opt === 'b' && <>
      <div className="xw-b-top"><Head />{tabs()}</div>
      <div className="xw-bento" {...pan}>
        <div className="xw-tile xw-tile-stage"><Frame it={it} v={v} /></div>
        <div className="xw-tile xw-tile-words">{words}{acts}</div>
        <div className="xw-tile xw-tile-looks">
          <span className="xw-flow">{it.compare ? 'Pick a finish' : `All ${it.variants.length} ads, one run`}</span>
          {pick('tiles')}
        </div>
      </div>
    </>}

    {opt === 'c' && <>
      <Head center />
      <div className="xw-c-tabs">{tabs()}</div>
      <div className="xw-c-body" {...pan}>
        <Frame it={it} v={v} />
        {pick('dots')}
        <div className="xw-c-words">{words}{acts}</div>
      </div>
    </>}
  </section>;
}
