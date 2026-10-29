/**
 * The board's spend chip (top bar, next to the board switcher): "This board" in dollars + runs, with a thin cap bar when the
 * server has one. Clicking opens an Orbit-style popover with the board's latest runs (thumbnail, model, price) and a link to
 * /spend. Summed by the server from the jobs started on this board (GET /api/canvas/boards/:id/spend, the Spend page's log).
 * Sample runs say so and show what real runs would have cost, marked as an estimate. Refreshes when a run starts or ends,
 * and every 8 s while one runs.
 */
import { useEffect, useRef, useState } from 'react';
import { BarPopover, PopNote, PopRow, PopSection } from '../shared/BarPop';
import { fmtUsd } from '../shared/billing';
import { Link } from '../platform/router';
import { ImageIcon, VideoIcon, AudioIcon } from '../ui/Icons';
import { SPEND_EVT } from './genRun';
import { CoinIcon, ChevronRightIcon } from './icons';

interface SpendRun { id: string; model: string; status: string; url: string; poster: string; createdAt: number; demo: boolean; local: boolean; estUsd: number; countedUsd: number }
type Spend = { runs: number; running: number; estUsd: number; countedUsd: number; simulated: number; local: number; recent?: SpendRun[] };

const kindOf = (r: SpendRun): 'image' | 'video' | 'audio' => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(r.url) ? 'video' : /\.(mp3|wav|m4a|ogg|aac)(\?|$)/i.test(r.url) ? 'audio' : 'image';
const runPrice = (r: SpendRun) => r.demo ? 'Sample' : r.local ? 'Free' : fmtUsd(r.countedUsd || r.estUsd);
const runHint = (r: SpendRun) => r.status === 'running' ? 'Running' : r.status === 'queued' ? 'Queued' : r.status === 'failed' ? 'Failed' : r.demo ? 'Sample run' : r.local ? 'Local run' : 'Done';

export function SpendChip({ boardId }: { boardId: string }) {
  const [s, setS] = useState<Spend | null>(null); const [open, setOpen] = useState(false); const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { let on = true; let t = 0;
    const load = () => fetch(`/api/canvas/boards/${encodeURIComponent(boardId)}/spend`).then(r => (r.ok ? r.json() : null)).then(d => { if (!on || !d) return; setS(d); clearTimeout(t); if (d.running) t = window.setTimeout(load, 8000); }).catch(() => undefined);
    void load(); const f = () => { clearTimeout(t); t = window.setTimeout(load, 600); }; addEventListener(SPEND_EVT, f);
    return () => { on = false; clearTimeout(t); removeEventListener(SPEND_EVT, f); }; }, [boardId]);
  if (!s) return null;
  const samples = s.runs > 0 && s.simulated === s.runs; const free = s.runs > 0 && s.local === s.runs;
  const money = !s.runs ? '$0.00' : free ? 'Free' : samples ? (s.estUsd > 0 ? `≈ ${fmtUsd(s.estUsd)}` : 'Sample') : fmtUsd(s.countedUsd);
  const title = !s.runs ? 'Runs started on this board add up here.' : free ? 'Every run on this board ran locally: nothing was billed.'
    : samples ? `Sample runs on this server: nothing was billed.${s.estUsd > 0 ? ` Real runs would cost about ${fmtUsd(s.estUsd)} (an estimate).` : ''}`
    : `What runs started here cost${s.estUsd !== s.countedUsd ? ` (estimated at ${fmtUsd(s.estUsd)} when started)` : ''}. Details on the Spend page.`;
  return <>
    <button ref={btn} type="button" className="cv-spend2" data-testid="cv-spend" data-samples={samples ? '1' : undefined} aria-haspopup="dialog" aria-expanded={open}
      aria-label={`This board: ${s.runs} run${s.runs === 1 ? '' : 's'}, ${money}. ${title}`} onClick={() => setOpen(o => !o)}>
      <span className="cv-spend2-ico" aria-hidden><CoinIcon size={15} /></span>
      <span className="cv-spend2-t"><small>This board</small><b data-testid="cv-spend-usd">{money}</b></span>
      <span className="cv-spend2-runs"><span data-testid="cv-spend-runs">{s.runs}</span><i>run{s.runs === 1 ? '' : 's'}</i></span>
      {s.running > 0 && <span className="cv-spend2-live" aria-hidden />}
    </button>
    <BarPopover open={open} anchor={btn} onClose={() => setOpen(false)} label="This board's spend" placement="bottom" width={360} testId="cv-spend-pop" className="cv-spend2-pop">
      <PopSection label="This board" aside={money}>
        <div className="cv-spend2-stats">
          <div className="cv-spend2-stat"><b>{s.runs}</b><small>Run{s.runs === 1 ? '' : 's'}</small></div>
          <div className="cv-spend2-stat"><b>{s.running}</b><small>Running now</small></div>
        </div>
        {samples && <PopNote>Sample runs on this server: nothing was billed.{s.estUsd > 0 ? ` Real runs would cost about ${fmtUsd(s.estUsd)}.` : ''}</PopNote>}
        {free && <PopNote>Every run here ran locally: nothing was billed.</PopNote>}
      </PopSection>
      <PopSection label="Recent runs" aside={s.recent?.length ? `${s.recent.length}` : undefined}>
        {s.recent?.length ? <div className="bp-list" role="list">{s.recent.map(r => { const kind = kindOf(r); const Icon = kind === 'video' ? VideoIcon : kind === 'audio' ? AudioIcon : ImageIcon;
          const thumb = kind === 'audio' ? <Icon size={15} /> : <img src={kind === 'video' ? (r.poster || `/api/media/thumb?url=${encodeURIComponent(r.url)}`) : r.url} alt="" loading="lazy" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />;
          return <PopRow key={r.id} role="option" icon={thumb} label={r.model || 'Run'} hint={runHint(r)} aside={runPrice(r)} testId="cv-spend-run" />; })}</div>
          : <div className="cv-spend2-empty"><PopNote>No runs on this board yet. Press Generate on a node; its price shows there first.</PopNote></div>}
      </PopSection>
      <Link to="/spend" className="cv-spend2-more" onClick={() => setOpen(false)}>Open Spend <ChevronRightIcon size={14} /></Link>
    </BarPopover>
  </>;
}
