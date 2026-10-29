/** The tab feeds' toolbar (Image and Video, 2026-10-27, layout A: "one calm row, about 6 items").
 *  Left: Project ▾ · Filter (n) ▾ · the filters that are on as small orange pills with × · Clear · "40 videos" · "12 failed" (only when runs failed).
 *  Right: the queue · today's spend (opens Spend) · Compare models (Image) · Select.
 *  Filter holds everything else: Search, Type (the tab's chip list), From (yours / Uploads / Featured), Show (All / Liked / Failed · N), Sort, Grid.
 *  Phones: one row (project ▾, Filter, count, Select, Compare icon); the pills scroll sideways on their own line; spend moves into the Filter sheet. */
import { useEffect, useRef, useState } from 'react';
import { Popover } from '../../../shared/Popover';
import { tip } from '../../../shared/Tooltip';
import { Link } from '../../../platform/router';
import { useToast } from '../../../shared/Toast';
import { useSpendDay, useOwnAccounts, runPrice } from '../../../shared/billing';
import { useFeedProject } from '../../../shared/feedProject';
import { ProjectPicker, useProjectList, type ProjectPick } from '../../../shared/ProjectPicker';
import { ChevronDownIcon, CloseIcon, CompareIcon, FilterIcon, SearchIcon, SelectIcon } from '../../Icons';
import type { FeedGroup } from '../../../../../server/src/shared/mediaFeed';
import { activeCount, activePills, clearedFilter, filterSummary, typeGroups, ALL_GROUP, type FeedFilter, type FeedSource, type FeedShow } from './feedFilter';
import './feed.css';
/** The Featured star (the toolbar chip). */
export const StarMark = () => <svg className="ff-star" aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" /></svg>;

/** Projects for the feed: the shared list plus the feed's picked project (a project deleted in Assets resets the pick to No project). */
export function useProjects(): ProjectPick {
  const { list, reload } = useProjectList(); const [pid, setPid] = useFeedProject(); const toast = useToast();
  useEffect(() => { if (list && pid && !list.some(p => p.id === pid)) { setPid(null); toast('That project was deleted. New results go to No project.', 'warn'); } }, [list, pid]); // eslint-disable-line react-hooks/exhaustive-deps
  return { list, pid, setPid, reload, current: list?.find(p => p.id === pid) ?? null };
}

/** "Today: 14 runs · ≈ $0.42 · saved ≈ $3.10 locally" (sample and simulated runs left out; team mode in ✦). Opens Spend. */
export function SpendToday({ className = '' }: { className?: string }) {
  const day = useSpendDay(); const own = useOwnAccounts(); if (!day) return null; const t: any = day.totals ?? {};
  const runs = typeof t.realRuns === 'number' ? t.realRuns : Math.max(0, (t.runs ?? 0) - (day.providers ?? []).reduce((s: number, p: any) => s + (p.demoRuns ?? 0) + (p.simulatedRuns ?? 0), 0));
  const spent = Number(t.spentUsd ?? 0); const saved = Number(t.savedUsd ?? 0);
  const money = (usd: number) => runPrice({ own, usd, credits: own === false ? Math.round(usd * 100) : null }) ?? '';
  const text = runs === 0 && !(saved > 0) ? 'No runs yet today' : [`Today: ${runs} run${runs === 1 ? '' : 's'}`, spent > 0 ? money(spent) : own === false ? 'Free' : '$0.00', saved > 0 ? `saved ${money(saved)} locally` : null].filter(Boolean).join(' · ');
  return <Link to="/spend" className={`fd-spend ${className}`} data-testid="fd-spend" {...tip(`${own === false ? 'Usage' : 'Spend'} today. Sample and test runs aren’t counted. Open ${own === false ? 'Usage' : 'Spend'}`)}>{text}</Link>;
}

/** One segmented radio group (From, Show, Sort, Grid). The Popover's arrow keys move between the options; Space / Enter pick. `off` greys it out. */
function Seg<K extends string>({ label, value, opts, onPick, testPre, wide, off }: { label: string; value: K; opts: readonly (readonly [K, React.ReactNode, string?])[]; onPick: (k: K) => void; testPre: string; wide?: boolean; off?: string | null }) {
  return <div className={`fd-sec${off ? ' fd-off' : ''}`} {...(off ? tip(off) : {})}><span className="fd-pop-h" id={`fd-h-${testPre}`}>{label}</span>
    <div className={`fd-seg${wide ? ' fd-seg-wide' : ''}`} role="radiogroup" aria-labelledby={`fd-h-${testPre}`} aria-disabled={off ? true : undefined}>
      {opts.map(([k, l, aria]) => <button key={k} type="button" role="radio" aria-checked={value === k} aria-label={aria} disabled={!!off} className={value === k ? 'on' : ''} data-testid={`fd-${testPre}-${k}`} onClick={() => onPick(k)}>{l}</button>)}
    </div></div>;
}
const keyOf = (id: string) => id.replace('group:', '');
/** "1 video", "40 videos" (phones show the number only) */
const countWords = (n: number, noun: string) => `${n.toLocaleString()} ${n === 1 ? noun.replace(/s$/, '') : noun}`;

function FilterMenu({ f, setF, groups, noun, total, failed, from }: { f: FeedFilter; setF: (f: FeedFilter) => void; groups: FeedGroup[]; noun: string; total: number; failed?: number | null; from?: FeedSource[] }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLButtonElement>(null);
  const n = activeCount(f); const set = (p: Partial<FeedFilter>) => setF({ ...f, ...p });
  const off = f.source !== 'mine' ? `Type and Show apply to your ${noun}. Pick Your ${noun} under From.` : null;
  const types = typeGroups(groups);
  const failN = f.source === 'mine' && typeof failed === 'number' && failed > 0 ? ` · ${failed.toLocaleString()}` : '';
  const sources = ([['mine', `Your ${noun}`], ['uploads', 'Uploads'], ['featured', <><StarMark />Featured</>, 'Featured']] as (readonly [FeedSource, React.ReactNode, string?])[]).filter(([k]) => !from || from.includes(k));
  const shows: (readonly [FeedShow, string, string?])[] = [['all', 'All'], ['liked', 'Liked'], ['failed', `Failed${failN}`, `Failed${failN ? `, ${failed}` : ''}`]];
  return <>
    <button ref={ref} type="button" className={`fd-btn fd-filter${n ? ' on' : ''}${open ? ' open' : ''}`} aria-haspopup="dialog" aria-expanded={open} aria-label={filterSummary(f)} data-testid="fd-filter" data-active={n} onClick={() => setOpen(o => !o)} {...tip('Search, type, source, sort and grid size')}>
      <FilterIcon size={15} /><span className="fd-filter-l">Filter</span>{n > 0 && <span className="fd-filter-n" data-testid="fd-filter-n" aria-hidden>{n}</span>}<ChevronDownIcon size={13} /></button>
    <Popover open={open} anchor={ref} onClose={() => setOpen(false)} label="Filter" placement="bottom" testId="fd-pop-filter" width={384}>
      <div className="fd-pop fd-pop-filter">
        <label className="fd-search"><SearchIcon size={14} /><input type="search" placeholder="Search prompts" aria-label="Search prompts" value={f.q} onChange={e => set({ q: e.target.value })} onKeyDown={e => { if (e.key === 'Escape' && f.q) { e.stopPropagation(); set({ q: '' }); } }} data-testid="fd-search" /></label>
        <div className={`fd-sec${off ? ' fd-off' : ''}`} {...(off ? tip(off) : {})}><span className="fd-pop-h" id="fd-h-type">Type</span>
          <div className="fd-chips" role="radiogroup" aria-labelledby="fd-h-type" aria-disabled={off ? true : undefined} data-testid="fd-types">{types.map(g => { const on = f.group === g.id || (g.id === ALL_GROUP && !types.some(t => t.id === f.group));
            return <button key={g.id} type="button" role="radio" aria-checked={on} disabled={!!off} className={`fd-chip${on ? ' on' : ''}`} data-testid={`fd-type-${keyOf(g.id)}`} onClick={() => set({ group: g.id })}>{g.label}</button>; })}</div></div>
        <Seg label="From" value={f.source} opts={sources} onPick={k => set({ source: k })} testPre="source" wide />
        <Seg label="Show" value={f.show} opts={shows} onPick={k => set({ show: k })} testPre="show" wide off={off} />
        <div className="fd-row2">
          <Seg label="Sort" value={f.sort} opts={[['new', 'Newest'], ['old', 'Oldest']] as const} onPick={k => set({ sort: k })} testPre="sort" wide />
          <Seg label="Grid" value={f.size} opts={[['small', 'S', 'Small tiles'], ['medium', 'M', 'Medium tiles'], ['large', 'L', 'Large tiles']] as const} onPick={k => set({ size: k })} testPre="size" wide />
        </div>
        <SpendToday className="fd-spend-sheet" />
        <div className="fd-pop-foot"><span className="fd-showing" data-testid="fd-showing" aria-live="polite">Showing <b>{total.toLocaleString()}</b> {f.source === 'uploads' ? (total === 1 ? 'upload' : 'uploads') : total === 1 ? noun.replace(/s$/, '') : noun}</span>
          <button type="button" className="fd-clear" data-testid="fd-reset" disabled={!n} onClick={() => setF(clearedFilter(f))}>Clear all</button></div>
      </div>
    </Popover>
  </>;
}

/** The filters that are on, as small removable pills beside Filter, then Clear. Nothing when no filter is on. */
function FilterPills({ f, setF }: { f: FeedFilter; setF: (f: FeedFilter) => void }) {
  const pills = activePills(f); if (!pills.length) return null;
  return <div className="fd-pills" role="group" aria-label="Filters on" data-testid="fd-pills">
    {pills.map(p => <span key={p.key} className="fd-pill" data-testid={`fd-pill-${p.key}`}><span className="fd-pill-l">{p.label}</span>
      <button type="button" className="fd-pill-x" aria-label={`Remove filter: ${p.label}`} data-testid={`fd-pill-${p.key}-x`} onClick={() => setF({ ...f, ...p.clear })}><CloseIcon size={11} /></button></span>)}
    <button type="button" className="fd-pill-clear" data-testid="fd-clear-all" onClick={() => setF(clearedFilter(f))}>Clear</button>
  </div>;
}

export interface FeedToolbarProps { f: FeedFilter; setF: (f: FeedFilter) => void; /** the tab's Type list (IMAGE_FEED_GROUPS / VIDEO_FEED_GROUPS) */ groups: FeedGroup[]; /** "videos" / "images" */ noun: string;
  total: number; /** failed runs the same filters hold (the "N failed" link; null = unknown) */ failed?: number | null; loading: boolean; pj: ReturnType<typeof useProjects>; selecting: boolean; onSelect: () => void;
  /** Compare models: null = available; a string = why it isn't here (tooltip on the disabled button). Leave onCompare out for no button (Video). */ compareOff?: string | null; onCompare?: () => void; compareRef?: React.RefObject<HTMLButtonElement>; /** the queue activity pill */ live?: React.ReactNode;
  /** the From choices this tab has (default all three; Audio has no Uploads) */ from?: FeedSource[] }
export default function FeedToolbar(p: FeedToolbarProps) {
  const { f } = p; const words = countWords(p.total, f.source === 'uploads' ? 'uploads' : p.noun); const unit = words.slice(words.indexOf(' '));
  return <div className="fd-bar" data-testid="feed-toolbar" role="toolbar" aria-label="Your generations">
    <div className="fd-l">
      <ProjectPicker pj={p.pj} />
      <FilterMenu f={f} setF={p.setF} groups={p.groups} noun={p.noun} total={p.total} failed={p.failed} from={p.from} />
      <FilterPills f={f} setF={p.setF} />
      <span className="fd-sep" aria-hidden />
      <span className="fd-count" data-testid="ic-gal-n" data-n={p.total} aria-live="polite" aria-label={words}><b>{p.total.toLocaleString()}</b><span className="fd-count-l">{unit}</span></span>
      {f.source === 'mine' && f.show !== 'failed' && !!p.failed && <button type="button" className="fd-failed" data-testid="fd-failed" onClick={() => p.setF({ ...f, show: 'failed' })} {...tip('Show the runs that didn’t finish, with Retry')}>{p.failed.toLocaleString()} failed</button>}
    </div>
    <div className="fd-r">
      {p.live}<SpendToday className="fd-spend-bar" />
      {p.onCompare && <button ref={p.compareRef} type="button" className="fd-btn fd-cmp-btn" data-testid="fd-compare" aria-haspopup="dialog" aria-disabled={!!p.compareOff || undefined} onClick={() => { if (!p.compareOff) p.onCompare?.(); }} {...tip(p.compareOff ?? 'Run the same prompt on 2–4 models and compare')}>
        <CompareIcon size={15} /><span className="fd-cmp-l">Compare models</span></button>}
      <button type="button" className={`fd-btn fd-sq fd-sel${p.selecting ? ' on' : ''}`} aria-pressed={p.selecting} aria-label="Select" data-testid="fd-select" onClick={p.onSelect} {...tip(p.selecting ? 'Stop selecting (Esc)' : 'Select results')}><SelectIcon size={15} /></button>
    </div>
  </div>;
}
