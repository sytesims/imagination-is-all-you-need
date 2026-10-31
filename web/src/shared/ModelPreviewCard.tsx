import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MakerTile } from './MakerTile';
import { shownName, type ToolModel, type RunOnRow } from './models';
import { exampleOf, modelPageOf, priceOf, listRateOf, cardFactsOf, cardDetailsOf, type FactIcon, type CardFact } from './modelSpec';
import type { HoverCardProps } from './hoverIntent';
import { placeNeed, keyWord } from './ModelHoverCard';
import { usdPrice } from './billing';
import { quoteParamsOf } from './quote';
import { gbText } from './fit';
import { aboutLink, moreLinksOf, linksOf, releasedText } from '../../../server/src/shared/modelLinks';
import { ClockIcon, ResolutionIcon, SoundIcon, ImageStackIcon, BrushIcon, MusicIcon, MicIcon, CubeIcon, AspectIcon, ImageIcon, UpscaleIcon, SparkleIcon, CloseIcon, InfoIcon } from '../ui/Icons';
import './modelCard.css';
/**
 * The model menu's preview card (2026-10-29, user pick "b"): hovering or keyboard-focusing a row opens a 304 px card beside the menu, on the
 * right, flipped to the left when the right has no room; no card when neither side has room (narrow windows) and never on phones (the menu
 * hides it there). Understood in two seconds, plain words, ONE price: an example made with the model (shared/modelSpec.ts exampleOf; else a
 * large maker tile), the name, maker and Open tag, one best-at line, 2–3 key facts in a two-column grid with icons (modelSpec cardFactsOf),
 * the price of the user's current settings from the live row quote ("≈ $0.30 for this clip", "Estimate") and one quiet other-places line.
 * More details opens a small panel beside the card: attachments, prompt naming, limits, the price's units and date, licence and links.
 * One component for every menu (Image, Video, Audio, 3D). Hover intent (shared/hoverIntent.ts): the pointer can move from the row onto the
 * card and click its links; Tab from the row goes into it, Esc goes back.
 */
type RunInfo = { price: string; place: string; detail: string | null };
type BodyProps = { m: ToolModel; engine?: string | null; tool?: any; provider?: any; /** one extra line (why it's the default, why it can't run) */ note?: string | null;
  /** this run's price at the place that would run it ('≈ $0.88' on 'Comfy Cloud') and its detail line (units, plan, price date) */ run?: RunInfo | null;
  /** the menu's live quote for this row: estimate, sample, key and other places */ rq?: any };
const descOf = (m: ToolModel) => m.bestFor || (m.blurb ? String(m.blurb).split(/(?<=\.)\s/)[0].replace(/\.$/, '') : null);
const licOf = (m: ToolModel) => m.license?.name?.replace(/\s*\((hosted API|hosted)\)$/i, '') ?? null;

/** What one result is called on this page, for "≈ $0.30 for this clip". */
function nounOf(m: ToolModel, tool: any): string {
  if (m.medium === 'video') return 'clip';
  if (m.medium === '3d') return 'model';
  if (m.medium === 'audio') { const k = String((m.caps as any)?.kind ?? ''); return k === 'voice' || k === 'voice-change' ? 'clip' : 'track'; }
  const n = Number(quoteParamsOf(tool?.id)?.n ?? 1); return n > 1 ? `${n} images` : 'image';
}
const live = (r: RunOnRow) => r.status !== 'coming-soon' && r.status !== 'unavailable';
const usdOfPlace = (p: any): number | null => (p?.cost && typeof p.cost.estUsd === 'number' ? p.cost.estUsd : typeof p?.credits === 'number' ? p.credits / 100 : null);

/** The free-on-this-computer line in plain words, with what it still needs ("after a one-time 21.4 GB download"). `also`: under another price. */
function localWords(r: RunOnRow, also: boolean): string {
  const need = placeNeed(r); const a = r.action; const lead = also ? 'Free on your computer' : 'Runs';
  if (need.ready) return also ? 'Also free on your computer' : 'Ready to run';
  if (a?.kind === 'download') { const size = /(\d[\d.,]*\s?[GM]B)/.exec(a.text ?? '')?.[1] ?? (a.missingBytes ? gbText(a.missingBytes) : null); // the row's own figure ("21.4 GB")
    return `${lead} after a one-time ${size ? `${size} ` : ''}download`; }
  if (a?.kind === 'turn_on' || r.status === 'off') return `${lead} once it’s set up`;
  if (a?.kind === 'install_node') return `${lead} after adding one custom node`;
  return `${lead} · ${need.text}`;
}
export interface CardPrice {
  /** 'run' this run's price · 'free' runs free on this computer · 'sample' a free sample run · 'key' the price once a key is added ·
   *  'list' no quote yet: the published rate · 'blocked' this run can't go anywhere as set · 'none' nothing published */
  kind: 'run' | 'free' | 'sample' | 'key' | 'list' | 'blocked' | 'none';
  /** the figure, without '≈' ("$0.30", "Free", "From $0.13 /s") */ big: string; /** "for this clip", "on your computer" */ what: string;
  /** "on Comfy Cloud", "once you add a MiniMax key" */ where: string | null; est: boolean; /** one quiet line: "Other places from ≈ $0.13" */ other: string | null;
  /** the price's units and date (More details) */ detail: string | null;
}
/** ONE price for the card: what the user's current settings cost (the live quote the row and Generate use), else what's honest to say. */
export function cardPriceOf(m: ToolModel, o: { rq?: any; run?: RunInfo | null; tool?: any; engine?: string | null }): CardPrice {
  const { rq, run } = o; const noun = nounOf(m, o.tool); const places = m.runsOn.filter(live);
  const localRow = places.find(r => r.id === 'local') ?? null;
  const qPlaces: any[] = Array.isArray(rq?.priceRange?.places) ? rq.priceRange.places : [];
  const curOn: string | null = rq?.runOn ?? null;
  /** one quiet line about the other places: free on this computer wins (with what it still needs), else the cheapest other quote */
  const otherLine = (): string | null => {
    if (curOn !== 'local' && localRow) return localWords(localRow, true);
    const others = qPlaces.filter(p => p?.runOn && p.runOn !== curOn && p.runOn !== 'local').map(usdOfPlace).filter((x): x is number => x != null && x > 0);
    if (!others.length) return null; const lo = Math.min(...others); const cur = usdOfPlace(rq);
    return cur != null && Math.abs(lo - cur) < 0.005 ? null : `Other places from ${usdPrice(lo, { approx: true })}`;
  };
  if (run?.price) {
    if (/^Free\b/.test(run.price)) return { kind: 'free', big: 'Free', what: 'on your computer', where: localRow && !placeNeed(localRow).ready ? localWords(localRow, false) : null, est: false, other: otherLine(), detail: null };
    const est = run.price.startsWith('≈') || rq?.cost?.estimated === true;
    return { kind: 'run', big: run.price.replace(/^≈\s*/, ''), what: `for this ${noun}`, where: run.place ? `on ${run.place}` : null, est, other: otherLine(), detail: run.detail };
  }
  if (!places.length) { const soon = m.rowStatus?.kind === 'coming_soon' || m.state === 'coming-soon';
    return { kind: 'none', big: soon ? 'Coming soon' : 'Not available here', what: '', where: soon ? 'No price yet' : (m.rowStatus?.text && m.rowStatus.text !== 'Not available' ? m.rowStatus.text : null), est: false, other: null, detail: null }; }
  if (rq?.demo === true) { const real = rq?.cost?.realRunUsd; const at = rq?.cost?.billedToName ?? keyWord(rq?.runOn ?? '');
    return { kind: 'sample', big: 'Free', what: 'sample run', where: null, est: false, other: typeof real === 'number' && real > 0 ? `A real run ≈ ${usdPrice(real).replace(/^≈\s*/, '')}${at ? ` on ${at}` : ''}, once a key is added` : otherLine(), detail: null }; }
  const so = Array.isArray(rq?.setupOptions) ? rq.setupOptions.find((x: any) => typeof x?.credits === 'number' && x.credits > 0) : null;
  if (so) return { kind: 'key', big: usdPrice(so.credits / 100), what: `for this ${noun}`, where: `once you add a ${keyWord(so.runOn, so.runOnLabel)} key`, est: true, other: localRow ? otherLine() : null, detail: null };
  if (localRow && places.length === 1) { const need = placeNeed(localRow); return { kind: 'free', big: 'Free', what: 'on your computer', where: need.ready ? null : localWords(localRow, false), est: false, other: null, detail: null }; }
  if (rq && (rq.runnable === false || rq.ok === false) && !rq.pending && !rq.failed) return { kind: 'blocked', big: 'Can’t run as set', what: '', where: null, est: false, other: localRow ? otherLine() : null, detail: null };
  const rate = listRateOf(m, o.engine); const paid = rate?.text ?? priceOf(m, o.engine)?.replace(/^Free · /, '') ?? null;
  if (paid && paid !== 'Free') { const lo = /^\$([\d.]+)(?:–[\d.]+)?(.*)$/.exec(paid); const from = lo ? `From $${lo[1]}${lo[2] ?? ''}` : paid;
    return { kind: 'list', big: from, what: '', where: `List rate${rate ? ` on ${rate.where}` : ''}; your price shows once it’s checked`, est: false, other: localRow ? otherLine() : null, detail: null }; }
  return { kind: 'none', big: 'Price not published', what: '', where: null, est: false, other: localRow ? otherLine() : null, detail: null };
}

const FACT_ICON: Record<FactIcon, (p: { size?: number; className?: string }) => ReactNode> = {
  clock: ClockIcon, res: ResolutionIcon, sound: SoundIcon, refs: ImageStackIcon, edit: BrushIcon, mask: BrushIcon, music: MusicIcon, voice: MicIcon,
  sfx: SparkleIcon, cube: CubeIcon, text: AspectIcon, scale: UpscaleIcon, photo: ImageIcon };
function FactIc({ i }: { i: FactIcon }) { const I = FACT_ICON[i] ?? InfoIcon; return <I size={14} className="mc-fic" />; }

/** Name, maker and the Open tag (open weights, from the model listing; the header Models menu uses the same rule). One icon: the maker tile.
 *  Shared by the picker card and the Models page card (shared/ModelInfoCard.tsx). */
export function CardHead({ name, maker, makerName, medium, fallback, open, testid = 'mpv-name' }: { name: string; maker?: string | null; makerName?: string | null; medium?: string | null; fallback?: string | null; open?: boolean; testid?: string }) {
  return <div className="mc-h"><MakerTile className="orb-tile mc-tile" maker={maker} makerName={makerName} fallback={fallback ?? name} medium={medium} title={false} />
    <span className="mc-nm"><b data-testid={testid}>{name}</b>
      {(makerName || open) && <span className="mc-mk">{makerName && <span data-testid={`${testid}-maker`}>{makerName}</span>}{open && <em className="mc-open" title="Open weights: the model files are public" data-testid="mc-open">Open</em>}</span>}</span></div>;
}
function Head({ m }: { m: ToolModel }) {
  return <CardHead name={shownName(m)} maker={m.maker} makerName={m.makerName} medium={m.medium} fallback={m.family || m.name} open={!!m.openWeights && m.maker !== 'openhiggsfield'} />;
}
/** The key facts: a two-column grid with icons (modelSpec cardFactsOf). */
export function FactGrid({ facts }: { facts: CardFact[] }) {
  return facts.length ? <ul className="mc-grid" data-testid="mc-facts">{facts.map(f => <li key={f.text}><FactIc i={f.icon} /><span>{f.text}</span></li>)}</ul> : null;
}
function PriceBlock({ p }: { p: CardPrice }) {
  return <div className="mc-price" data-testid="mc-price" data-kind={p.kind}>
    <div className="mc-pr-main">
      <b className={`mc-big${p.kind === 'free' || p.kind === 'sample' ? ' mc-free' : ''}${p.kind === 'blocked' || p.kind === 'none' ? ' mc-word' : ''}`}>{p.est || p.kind === 'key' ? <span className="mc-approx" aria-label="about">≈ </span> : null}{p.big}</b>
      {p.what && <span className="mc-what">{p.what}</span>}
    </div>
    {(p.est || p.where) && <span className="mc-where">{p.est && <em className="mc-est" title="An estimate: the bill follows the real run">Estimate</em>}{p.est && p.where ? ' · ' : ''}{p.where}</span>}
    {p.other && <span className="mc-other" data-testid="mc-other">{p.other}</span>}
  </div>;
}
/** The rest, for power users: attachments, sizes, shapes, prompt naming, limits, the price's units and date, licence and links. */
function Details({ m, engine, tool, provider, price }: { m: ToolModel; engine?: string | null; tool?: any; provider?: any; price: CardPrice }) {
  const rows = cardDetailsOf(m, { engine, tool }); const lic = licOf(m); const page = modelPageOf(m, { engine, tool, provider });
  const about = aboutLink(m.key); const more = moreLinksOf(m.key, page); const rel = releasedText(linksOf(m.key).released); const rate = listRateOf(m, engine);
  /* the published rate is a different number from this run's price: it always says where it applies */
  const priceRows = [price.detail ? { label: 'This price', value: price.detail } : null,
    rate && price.kind !== 'list' ? { label: 'List rate', value: `${rate.text} on ${rate.where}` } : null].filter(Boolean) as { label: string; value: string }[];
  return <>
    <dl className="mc-dl" data-testid="mc-details">{[...rows, ...priceRows, ...(lic ? [{ label: 'Licence', value: lic }] : []), ...(rel ? [{ label: 'Released', value: rel }] : [])].map(r =>
      <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}</dl>
    {(about || more.length > 0) && <div className="mc-links" data-testid="mpv-links">
      {about && <a href={about} target="_blank" rel="noreferrer" data-testid="mpv-about">About ↗</a>}
      {more.map(l => <a key={l.href} href={l.href} target="_blank" rel="noreferrer">{l.label} ↗</a>)}</div>}
  </>;
}

/** The card's body: example or maker tile, head, best-at line, the fact grid, the price and More details (a small panel beside the card). */
function CardBody({ m, engine, tool, provider, note, run, rq }: BodyProps) {
  const [open, setOpen] = useState(false); const facts = cardFactsOf(m, { engine, tool }); const price = cardPriceOf(m, { rq, run, tool, engine }); const desc = descOf(m);
  const ex = exampleOf(m, engine); const [broken, setBroken] = useState(false); const img = ex && !broken ? ex : null;
  const self = useRef<HTMLDivElement | null>(null); const [side, setSide] = useState<'r' | 'l'>('r');
  /* the panel goes on the side away from the menu, else the side with room */
  useLayoutEffect(() => { if (!open) return; const card = self.current?.closest('.orb-pv') as HTMLElement | null; if (!card) return; const r = card.getBoundingClientRect(); const cs = card.dataset.side;
    setSide(cs === 'l' ? (r.left - 268 >= 8 ? 'l' : 'r') : (r.right + 268 <= window.innerWidth - 8 ? 'r' : 'l')); }, [open]);
  return <div ref={self} className="mc">
    <div className={`mc-art${img ? '' : ' mc-art-tile'}`} data-testid="mpv-art" data-kind={img ? 'image' : 'tile'}>{img ? <img src={img.src} alt={img.alt} loading="lazy" decoding="async" onError={() => setBroken(true)} />
      : <MakerTile className="orb-pv-big" maker={m.maker} makerName={m.makerName} fallback={m.family || m.name} medium={m.medium} title={false} />}
      {img?.credit && <a className="orb-pv-credit" href={img.creditUrl} target="_blank" rel="noreferrer">{img.credit}</a>}</div>
    <div className="mc-bd">
      <Head m={m} />
      {desc && <p className="mc-d">{desc}</p>}
      {note && <p className="mc-note" data-testid="mpv-note">{note}</p>}
      <FactGrid facts={facts} />
      <PriceBlock p={price} />
      <button type="button" className="mc-more" aria-expanded={open} data-testid="mc-more" onClick={() => setOpen(o => !o)}><InfoIcon size={14} />More details</button>
    </div>
    {open && <div className="mc-panel" data-side={side} role="dialog" aria-label={`${shownName(m)} details`} data-testid="mc-panel">
      <div className="mc-panel-h"><span>Details</span><button type="button" className="mc-x" aria-label="Close details" onClick={() => setOpen(false)}><CloseIcon size={14} /></button></div>
      <Details m={m} engine={engine} tool={tool} provider={provider} price={price} /></div>}
  </div>;
}

/** The card itself: a portal, fixed, beside the open menu (the row's `.apop`), top-aligned with the menu and kept inside the window. */
export function ModelPreviewCard({ row, hover, ...p }: { row: HTMLElement; /** shared/hoverIntent.ts: hovering / focusing the card keeps it open */ hover?: HoverCardProps } & BodyProps) {
  const box = useRef<HTMLDivElement | null>(null); const [pos, setPos] = useState<{ top: number; left: number; side: 'r' | 'l' } | null>(null);
  useLayoutEffect(() => {
    const el = box.current; if (!el) return; const menu = (row.closest('.apop') ?? row).getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, gap = 12, edge = 8;
    let left = menu.right + gap, side: 'r' | 'l' = 'r'; if (left + w > vw - edge) { left = menu.left - gap - w; side = 'l'; }
    if (left < edge) { setPos(null); return; } // no room on either side: no card
    const top = Math.max(edge, Math.min(menu.top, vh - edge - h));
    setPos({ left: Math.round(left), top: Math.round(top), side });
  }, [row, p.m.key]);
  if (typeof document === 'undefined') return null;
  const { ref: hoverRef, ...on } = hover ?? ({} as Partial<HoverCardProps>);
  /* data-apop-keep: a click in the card (its links) doesn't count as outside the menu (shared/Popover.tsx) */
  return createPortal(<div ref={el => { box.current = el; hoverRef?.(el); }} id="mpv-card" className={`orb-pv${pos ? ' in' : ''}`} role="dialog" aria-label={`${shownName(p.m)} preview`} data-apop-keep="" data-testid="model-hover-card" data-model-key={p.m.key} data-side={pos?.side}
    style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }} {...on}><CardBody key={p.m.key} {...p} /></div>, document.body);
}
