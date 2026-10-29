/** Compact, natural-ratio remixes. Playback, hover sound and policy recovery stay in the shared player. */
import { useRef, useState, type CSSProperties } from 'react';
import { Link } from '../../platform/router';
import { ShowcaseFilm } from '../../shared/ShowcaseFilm';
import { ChevronRightIcon } from '../Icons';
import { featuredByKey, featuredRecreateHref, type FeaturedItem } from '../../../../server/src/shared/featured';
import './exploreTrending.css';

const REMIXES = [
  { key: 'trend-mic', number: '01', flow: 'Object / Person Swap', firstLine: 'Same mic.', secondLine: 'New energy.', line: 'A new lead on the right.', refIndex: 0 },
  { key: 'trend-dance', number: '02', flow: 'Object / Person Swap', firstLine: 'Same moves.', secondLine: 'New face.', line: 'Only the right dancer changes.', refIndex: 1 },
] as const;
type RemixItem = { key: string; number: string; flow: string; firstLine: string; secondLine: string; line: string };
type RemixMedia = { before: FeaturedItem['out']; out: FeaturedItem['out']; photo: string; href: string; credit: string };
type Example = { item: RemixItem; f: RemixMedia };
function examples(): Example[] {
  return REMIXES.flatMap(item => {
    const f = featuredByKey(item.key); if (!f?.before) return [];
    return [{ item, f: { before: f.before, out: f.out, photo: (f.input.refUrls as string[])[item.refIndex],
      // The historical two-pass dance run changed only the right dancer. Its showcase
      // uses the matching reference and single-person workflow, not the two-person route.
      href: item.key === 'trend-dance' ? `/tools/h3-video?workflow=object-swap&swap=person&model=${encodeURIComponent(f.modelKey)}` : featuredRecreateHref(f.key)!,
      credit: `${f.model} · Comfy Cloud`,
    } }];
  });
}
const EXAMPLES = examples();

function Remix({ example: { item, f }, selected, select }: { example: Example; selected: boolean; select: () => void }) {
  const [view, setView] = useState<'original' | 'result'>('result');
  const played = useRef(0); const [seek, setSeek] = useState<{ t: number; n: number }>();
  const media = view === 'original' ? f.before : f.out;
  const title = `${item.firstLine} ${item.secondLine}`.trim();
  const choose = (next: typeof view) => {
    if (next === view) return;
    const duration = (next === 'original' ? f.before : f.out).sec ?? 0;
    setView(next); setSeek(s => ({ t: Math.max(0, Math.min(played.current, duration - .1)), n: (s?.n ?? 0) + 1 }));
  };
  return <article className={`xpt-card${selected ? ' is-selected' : ''}`} data-testid={`xp-${item.key}`} data-example={item.key} aria-label={`${item.flow}: ${title}`}
    style={{ '--ratio': (f.out.width ?? 405) / (f.out.height ?? 720) } as CSSProperties}
    onPointerEnter={e => { if (e.pointerType !== 'touch' && window.matchMedia('(hover: hover)').matches) select(); }} onFocusCapture={select}>
    <div className="xpt-picture">
      <ShowcaseFilm className="xpt-film" label={`${title} · ${view}`} testId={`${item.key}-film`}
        takes={[{ key: view, url: media.url, poster: media.poster, label: view, sec: media.sec, sound: true }]}
        take={view} onTake={() => 0} seek={seek} controls hoverSound onTick={frac => { played.current = frac * (media.sec ?? 0); }} />
      <div className="xpt-compare" role="group" aria-label={`${item.flow}: compare original and result`}>
        <button type="button" aria-pressed={view === 'original'} onClick={() => choose('original')} data-testid={`${item.key}-original`}>Original</button>
        <button type="button" aria-pressed={view === 'result'} onClick={() => choose('result')} data-testid={`${item.key}-result`}>Result</button>
      </div>
      <span className="xpt-index" aria-hidden>{item.number}</span>
      <button type="button" className="xpt-caption" aria-label={`Select remix ${item.number}: ${title}`} aria-pressed={selected} onClick={select} title={item.line || undefined}>
        <img src={f.photo} alt="Replacement reference photo" /><span>{title}</span><span className="xpt-select-mark" aria-hidden>{selected ? '●' : '○'}</span>
      </button>
    </div>
    <p className="xpt-model">{f.credit}</p>
  </article>;
}

export function XpTrending() {
  const [active, setActive] = useState(0); const rail = useRef<HTMLDivElement>(null);
  const current = EXAMPLES[active];
  const select = (index: number) => {
    setActive(index);
    if (window.matchMedia('(max-width: 760px)').matches) rail.current?.scrollTo({ left: index * (rail.current.clientWidth + 20), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  return <section className="xpt" id="xp-trending" data-testid="xp-trending" aria-labelledby="xp-h-trending">
    <header className="xpt-head"><div><span className="xv-eb">Made to be reimagined</span><h2 id="xp-h-trending">Make the trend <span>your own.</span></h2></div>
      <p>{current.item.flow}<br /><span>One person recast. Two real clips.</span></p>
    </header>
    <div className="xpt-phone-nav"><span aria-live="polite">Remix {active + 1} of {EXAMPLES.length}</span><div>
      <button type="button" aria-label="Previous remix" disabled={!active} onClick={() => select(active - 1)}><ChevronRightIcon size={18} className="xpt-prev" /></button>
      <button type="button" aria-label="Next remix" disabled={active === EXAMPLES.length - 1} onClick={() => select(active + 1)}><ChevronRightIcon size={18} /></button>
    </div></div>
    <div className="xpt-rail" ref={rail} role="region" tabIndex={0} aria-label="Two remix films; scroll horizontally on a phone"
      onScroll={e => { if (window.matchMedia('(max-width: 760px)').matches) setActive(Math.min(EXAMPLES.length - 1, Math.max(0, Math.round(e.currentTarget.scrollLeft / (e.currentTarget.clientWidth + 20))))); }}>
      {EXAMPLES.map((example, i) => <Remix key={example.item.key} example={example} selected={active === i} select={() => select(i)} />)}
    </div>
    <div className="xpt-action" data-selected-remix={current.item.key}><div><b>{current.item.number} · {current.item.flow}</b>{current.item.line && <small>{current.item.line}</small>}</div>
      <Link to={current.f.href} className="btn xpt-try" data-testid="trend-try" aria-label={`Try remix ${current.item.number}: ${`${current.item.firstLine} ${current.item.secondLine}`.trim()}`}>Try this swap<ChevronRightIcon size={16} /></Link>
    </div>
  </section>;
}
