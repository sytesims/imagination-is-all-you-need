/**
 * "One app, every way to run" (2026-11-01): right under the hero. Every run picks where it happens (Your computer · Comfy Cloud · Comfy Router)
 * and shows its price before Go, plus honest workflow counts. Copy and links: EXPLORE_RUN (server/src/shared/exploreShowcase.ts).
 * Prices are the Video tab's real Run on rows (the tools list), in the picker's own words (shared/models.ts listPrice); counts are the
 * workflow lists' own lengths. Three layouts until the user picks one (preview only, ?run=a|b|c):
 *  A: three place tiles (icon, tech chip, one line, a price example, See it) over a counts strip;
 *  B: the places as a list beside the real Run on picker look (runon.css .ro-*), stepping through the places with the price changing on Go;
 *  C: one quiet band, three place chips and the counts.
 * Reduced motion: B stays on the place you pick (no stepping).
 */
import { useEffect, useState } from 'react';
import type { ToolInfo } from '../../api';
import { Link } from '../../platform/router';
import { prefersReducedMotion } from '../../shared/HoverClip';
import { listPrice, rowPlaceLabel } from '../../shared/models';
import { YourGpuIcon, ComfyPlaceIcon, SparkleIcon } from '../Icons';
import { EXPLORE_RUN, type RunPlace, type RunPlaceId } from '../../../../server/src/shared/exploreShowcase';
import { WORKFLOW_IDS } from '../../../../server/src/shared/workflows';
import { VIDEO_WORKFLOWS } from '../../../../server/src/shared/videoWorkflows';
import { AUDIO_WORKFLOW_IDS } from '../../../../server/src/shared/audioWorkflows';
import { THREE_D_WORKFLOWS } from '../../../../server/src/shared/threeD';
import './exploreRun.css';

const R = EXPLORE_RUN;
const Arrow = () => <span className="xv-arrow" aria-hidden>→</span>;
const ICON: Record<RunPlaceId, (p: { size?: number; className?: string }) => JSX.Element> = { local: YourGpuIcon, 'comfy-cloud': ComfyPlaceIcon, 'comfy-router': SparkleIcon };
const PlaceIcon = ({ id, size = 20 }: { id: RunPlaceId; size?: number }) => { const I = ICON[id]; return <span className="xr-ic" aria-hidden><I size={size} /></span>; };

type Model = { key: string; name: string; runsOn: { id: string; label: string; detail?: string | null; credits?: number | null; status?: string }[] };
const modelOf = (tools: ToolInfo[], toolId: string, key: string): Model | null => ((tools.find((t) => t.id === toolId) as any)?.models ?? []).find((m: any) => m.key === key) ?? null;
const nameOf = (m: Model | null) => (m as any)?.displayName ?? m?.name ?? '';
/** A place's price in the picker's words (Free on your computer, else ≈ dollars); null when the row isn't there (old server, model gone). */
function priceAt(tools: ToolInfo[], ex: RunPlace['example']): { model: string; price: string } | null {
  const m = modelOf(tools, ex.toolId, ex.modelKey); const row = m?.runsOn.find((r) => r.id === ex.runOn); if (!m || !row) return null;
  const price = listPrice(row.credits ?? null, row.id, true); return price ? { model: nameOf(m), price } : null;
}

/** The counts, from the lists themselves (apps and camera moves from the tools list, once it's loaded). */
function useCounts(tools: ToolInfo[]) {
  const apps = tools.filter((t) => t.id.startsWith('app-')).length; const moves = ((tools.find((t) => t.id === 'camera') as any)?.presets ?? []).length;
  return [
    { n: WORKFLOW_IDS.length, l: 'image' }, { n: VIDEO_WORKFLOWS.length, l: 'video' }, { n: AUDIO_WORKFLOW_IDS.length, l: 'audio' },
    { n: THREE_D_WORKFLOWS.filter((w) => w.status === 'ready').length, l: '3D' }, { n: apps, l: 'one-click apps' }, { n: moves, l: 'camera moves' },
  ].filter((c) => c.n > 0);
}

const Head = ({ id }: { id: string }) => <header className="xr-head">
  <span className="xv-eb">{R.eyebrow}</span>
  <h2 id={id} className="xps-h xr-h">{R.title.map((l) => <span key={l}>{l}</span>)}</h2>
  <p className="xps-p xr-p">{R.line}</p>
</header>;

/** The counts strip: big numbers (A, B) or one quiet line (C). */
function Counts({ tools, quiet }: { tools: ToolInfo[]; quiet?: boolean }) {
  const cs = useCounts(tools);
  if (quiet) return <div className="xr-cline" data-testid="xp-run-counts"><p><span className="xr-cline-h">{R.countsLabel}</span>{cs.map((c, k) => <span key={c.l}>{k ? <i aria-hidden> · </i> : null}<b>{c.n}</b> {c.l}</span>)}</p>
    <Link to={R.all.href} className="xr-lnk" data-testid="xp-run-all">{R.all.label}<Arrow /></Link></div>;
  return <div className="xr-counts" data-testid="xp-run-counts">
    <span className="xr-counts-h">{R.countsLabel}</span>
    <ul className="xr-nums">{cs.map((c) => <li key={c.l}><b>{c.n}</b><span>{c.l}</span></li>)}</ul>
    <p className="xr-foot"><span>{R.templates}</span><Link to={R.all.href} className="xr-lnk" data-testid="xp-run-all">{R.all.label}<Arrow /></Link></p>
  </div>;
}

/* ---------------------------------------------------------------- A: three tiles */
function RunA({ tools }: { tools: ToolInfo[] }) {
  return <>
    <div className="xr-a-top"><Head id="xp-h-run" /></div>
    <div className="xr-tiles">{R.places.map((p) => { const ex = priceAt(tools, p.example);
      return <Link key={p.id} to={p.see.href} className="xr-tile" data-place={p.id} data-testid={`xp-run-see-${p.id}`}>
        <span className="xr-tile-top"><PlaceIcon id={p.id} size={22} /><span className="xr-chip">{p.chip}</span></span>
        <b className="xr-name">{p.name}</b>
        <span className="xr-line">{p.line}</span>
        <span className="xr-ex">{ex ? <><span className="xr-ex-m">Video · {ex.model}</span><span className={`xr-price${p.id === 'local' ? ' is-free' : ''}`} data-testid={`xp-run-price-${p.id}`}>{ex.price}</span></> : <span className="xr-ex-m">{p.short}</span>}</span>
        <span className="xr-see">{p.see.label}<Arrow /></span>
      </Link>; })}</div>
    <Counts tools={tools} />
  </>;
}

/* ---------------------------------------------------------------- B: the places beside the Run on picker */
const STEP_MS = 2600;
function RunB({ tools }: { tools: ToolInfo[] }) {
  const [on, setOn] = useState(0); const [held, setHeld] = useState(false);
  useEffect(() => { if (held || prefersReducedMotion()) return; const t = setInterval(() => setOn((k) => (k + 1) % R.places.length), STEP_MS); return () => clearInterval(t); }, [held]);
  const p = R.places[on]; const m = modelOf(tools, p.example.toolId, p.example.modelKey);
  const rows = (m?.runsOn ?? []).filter((r) => r.status !== 'coming-soon' && r.status !== 'unavailable' && (r.id === 'local' || r.id === 'comfy-cloud'));
  const ex = priceAt(tools, p.example);
  const pick = (k: number) => { setOn(k); setHeld(true); };
  return <div className="xr-b">
    <div className="xr-b-l"><Head id="xp-h-run" />
      <div className="xr-list" role="tablist" aria-label="Where it runs">{R.places.map((x, k) => <button key={x.id} type="button" role="tab" aria-selected={k === on} className={k === on ? 'on' : ''}
        onClick={() => pick(k)} data-testid={`xp-run-place-${x.id}`}>
        <PlaceIcon id={x.id} /><span className="xr-li-t"><b>{x.name}<span className="xr-chip">{x.chip}</span></b><span>{x.line}</span></span></button>)}</div>
    </div>
    <div className="xr-b-r" onMouseEnter={() => setHeld(true)} onFocus={() => setHeld(true)}>
      <figure className="xr-stage" role="tabpanel" aria-label={`${p.name}: ${ex ? `${ex.model}, ${ex.price}` : p.short}`} data-testid="xp-run-stage" data-place={p.id}>
        <div className="xr-app" aria-hidden>
          <span className="xr-app-bar"><i /><i /><i /><span>Video · {nameOf(m) || '…'}</span></span>
          {/* the app's own Run on picker look (runon.css / barPop.css), standing still on the page */}
          <div className="apop bp apop-runon xr-pop">
            <div className="ro-pop">
              <div className="ro-h">Run {nameOf(m)} on</div>
              {rows.map((r) => { const sel = r.id === p.example.runOn; const price = listPrice(r.credits ?? null, r.id, true);
                return <div key={r.id} className="ro-g">
                  <div className={`ro-opt${sel ? ' on' : ''}`}><span className="ro-rad" /><span className="ro-ol">{rowPlaceLabel(r)}</span><span className="ro-op">{price ?? ''}</span>
                    <span className="ro-os">{r.id === 'local' ? 'Free and private' : String(r.detail ?? '')}</span></div></div>; })}
            </div>
          </div>
          <span className="xr-go"><b>Generate</b><span key={p.id} className="xr-go-p">{ex?.price ?? ''}</span></span>
        </div>
        <figcaption className="xr-cap"><span>{p.id === 'comfy-router' ? 'A partner model, one Comfy key' : on === 0 ? R.same.label : 'Same model, now on Comfy’s GPUs'}</span>
          <Link to={p.see.href} className="xr-lnk" data-testid={`xp-run-see-${p.id}`}>{p.see.label}<Arrow /></Link></figcaption>
      </figure>
    </div>
    <div className="xr-b-counts"><Counts tools={tools} /></div>
  </div>;
}

/* ---------------------------------------------------------------- C: one quiet band */
function RunC({ tools }: { tools: ToolInfo[] }) {
  return <div className="xr-band">
    <div className="xr-band-t"><h2 id="xp-h-run" className="xr-band-h">{R.title.join(' ')}</h2><p>{R.line}</p></div>
    <div className="xr-band-chips">{R.places.map((p) => { const ex = priceAt(tools, p.example);
      return <Link key={p.id} to={p.see.href} className="xr-bchip" data-place={p.id} data-testid={`xp-run-see-${p.id}`} title={`${p.name}: ${p.line}`}>
        <PlaceIcon id={p.id} size={16} /><b>{p.name}</b><span className={p.id === 'local' ? 'is-free' : ''}>{p.id === 'local' ? ex?.price ?? p.short : p.chip}</span></Link>; })}</div>
    <Counts tools={tools} quiet />
  </div>;
}

export type RunVariant = 'a' | 'b' | 'c';
/** Preview only (until the user picks): ?run=a|b|c. */
export const runVariant = (search = typeof location === 'undefined' ? '' : location.search): RunVariant => { const v = new URLSearchParams(search).get('run'); return v === 'a' || v === 'c' ? v : 'b'; };

export function XpRun({ tools, variant = runVariant() }: { tools: ToolInfo[]; variant?: RunVariant }) {
  return <section className={`xv-sec xr xr-v-${variant}`} id="xp-run" data-testid="xp-run" data-variant={variant} aria-labelledby="xp-h-run">
    {variant === 'a' ? <RunA tools={tools} /> : variant === 'c' ? <RunC tools={tools} /> : <RunB tools={tools} />}
  </section>;
}
