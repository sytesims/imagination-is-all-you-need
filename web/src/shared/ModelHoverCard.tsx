import { MakerTile } from './MakerTile';
import { runPrice, priceToken, priceDetail } from './billing';
import { blockOf, reasonBody } from './menuPrice';
import { shownName, RUN_ON_CHIP, rowPlaceLabel, type RunOnRow, type ToolModel } from './models';
import { gbText } from './fit';
import { placeIconFor } from '../ui/Icons';
import { LOCAL_LABEL } from '../../../server/src/shared/modelIds';
/**
 * The model menu's details on phones (the row's "i" opens them inside the sheet): the model, its best-for line, and every place it runs with
 * the price there and what that place still needs ("Ready", "Download 53 GB", "Add a Comfy key"). Desktop uses the preview card
 * (shared/ModelPreviewCard.tsx) beside the menu instead.
 * No network: prices come from the model listing (runsOn[].credits, list price per run) and the menu's batch quote for the row's place.
 */
const KEY_WORD: Record<string, string> = { 'comfy-cloud': 'Comfy Cloud', fal: 'fal', replicate: 'Replicate', bfl: 'BFL', minimax: 'MiniMax', dashscope: 'Alibaba Cloud', luma: 'Luma', ltx: 'LTX', openai: 'OpenAI', google: 'Google', byteplus: 'BytePlus' };
export const keyWord = (runOn: string, label?: string | null) => KEY_WORD[runOn] ?? RUN_ON_CHIP[runOn] ?? label ?? runOn;
const live = (r: RunOnRow) => r.status !== 'coming-soon' && r.status !== 'unavailable';

/** What a place still needs, in a few words ("Ready", "Download 53 GB", "Add a Comfy key", "Turn on Local"). */
export function placeNeed(r: Pick<RunOnRow, 'id' | 'label' | 'status' | 'action'>): { text: string; ready: boolean } {
  if (r.status === 'ready') return { text: 'Ready', ready: true };
  if (r.status === 'sample') return { text: 'Sample run', ready: true };
  const a = r.action;
  if (a?.kind === 'download') return { text: a.missingBytes ? `Download ${gbText(a.missingBytes)}` : 'One-time download', ready: false };
  if (a?.kind === 'add_key' || r.status === 'needs-key') return { text: `Add a ${keyWord(r.id, r.label)} key`, ready: false };
  if (a?.kind === 'turn_on' || r.status === 'off') return { text: `Turn on ${LOCAL_LABEL}`, ready: false };
  if (a?.kind === 'install_node') return { text: 'Needs a custom node', ready: false };
  return { text: a?.text ?? 'Not set up', ready: false };
}

/** Every place a model runs, with its price there and what that place still needs (the phone card here and the Models page card). */
export function PlaceList({ places, priceAt, detailAt }: { places: RunOnRow[]; priceAt: (r: RunOnRow) => string | null; /** the price's detail line ("184 Comfy credits · on your Creator plan · price checked …") */ detailAt?: (r: RunOnRow) => string | null }) {
  return <ul className="mhc-places" aria-label="Where it runs">{places.map(r => { const Icon = placeIconFor(r.id); const need = placeNeed(r); const price = priceAt(r);
    return <li key={r.id} data-testid={`mhc-place-${r.id}`} data-ready={need.ready ? '1' : undefined}>
      <Icon size={14} className="mhc-pic" /><span className="mhc-pl">{rowPlaceLabel(r)}</span>
      <span className="mhc-pr">{price ? <b>{price}{r.id === 'local' ? '' : ' / run'}</b> : null}<span className={need.ready ? 'mhc-ok' : 'mhc-need'}>{need.text}</span></span>
      {(() => { const d = price && detailAt ? detailAt(r) : null; return d ? <small className="mhc-dt" data-testid={`mhc-detail-${r.id}`}>{d}</small> : null; })()}</li>; })}</ul>;
}
/** Places that run it now (coming-soon and unavailable rows left out). */
export const livePlaces = (m: ToolModel) => m.runsOn.filter(live);

/** The card's body: one model, every place with its price and its need. `rq` = the menu's quote for this row (this run's price at its place). */
export function InfoCardBody({ m, own, rq, note }: { m: ToolModel; own: boolean; rq?: any; /** one extra line (the workflow's Default: why it's the default) */ note?: string | null }) {
  const places = m.runsOn.filter(live);
  /* a real incompatibility picking can't fix (too many images, a mask on a model without one): the server's specific reason */
  const b = rq && !rq.priceRange?.places?.length ? blockOf(rq) : null; const blocked = b?.full ?? null; // shared/menuPrice.ts: the same reason the row shows
  const quoteAt = (r: RunOnRow): { q: any; so: any } | null => {
    if (r.id === 'local' || blocked || rq?.pending || rq?.failed) return null;
    const at = Array.isArray(rq?.priceRange?.places) ? rq.priceRange.places.find((p: any) => p?.runOn === r.id && typeof p.credits === 'number') : null;
    const q = at ?? (rq && rq.runOn === r.id && typeof rq.credits === 'number' && rq.demo !== true ? rq : null);
    const so = Array.isArray(rq?.setupOptions) ? rq.setupOptions.find((o: any) => o?.runOn === r.id && typeof o.credits === 'number') : null; return { q, so };
  };
  /** the detail line under a place's price: its own units, the plan and the price date (billing.ts priceDetail) */
  const detailAt = (r: RunOnRow): string | null => { const x = quoteAt(r); if (!x) return null; const { q, so } = x;
    return q?.cost ? priceDetail({ ...q, runOn: r.id }, { credits: q.credits }) : priceDetail(null, { runOn: r.id, credits: q?.credits ?? so?.credits ?? r.credits }); };
  const priceAt = (r: RunOnRow): string | null => {
    if (r.id === 'local') return 'Free';
    if (blocked || rq?.pending || rq?.failed) return null; // this run can't go anywhere on this model as set: no per-place price (the reason shows below)
    const at = Array.isArray(rq?.priceRange?.places) ? rq.priceRange.places.find((p: any) => p?.runOn === r.id && typeof p.credits === 'number') : null; // this run at this place, as it runs once picked
    const q = at ?? (rq && rq.runOn === r.id && typeof rq.credits === 'number' && rq.demo !== true ? rq : null); // this run, when the menu priced this place
    const so = Array.isArray(rq?.setupOptions) ? rq.setupOptions.find((o: any) => o?.runOn === r.id && typeof o.credits === 'number') : null;
    // this run's quote carries the place's own units (cost.estUnits: Comfy credits from the exact price), so the card says what the row says
    // (dollars; its units are the detail line); runPrice is only the list-price fallback
    if (q?.cost && typeof q.credits === 'number') return priceToken({ q: { ...q, runOn: r.id }, own, credits: q.credits }) ?? runPrice({ own, runOn: r.id, credits: q.credits });
    return runPrice({ own, runOn: r.id, credits: q?.credits ?? so?.credits ?? r.credits });
  };
  return <>
    <div className="mhc-h"><MakerTile className="mhc-ic" maker={m.maker} makerName={m.makerName} fallback={m.family || m.name} medium={m.medium} title={false} />
      <span className="mhc-n"><b>{shownName(m)}</b>{m.makerName && <small>{m.makerName}</small>}</span></div>
    {(m.bestFor || m.blurb) && <p className="mhc-d">{m.bestFor ?? String(m.blurb).split(/(?<=\.)\s/)[0]}</p>}
    {note && <p className="mhc-d mhc-def" data-testid="mhc-default">{note}</p>}
    {places.length > 0 ? <PlaceList places={places} priceAt={priceAt} detailAt={detailAt} /> : <p className="mhc-d">{m.rowStatus?.text ?? 'Not available here yet'}</p>}
    {b && <p className="mhc-d mhc-why" data-testid="mhc-blocked"><b>{b.short}.</b> {reasonBody(b.full)}</p>}
  </>;
}
