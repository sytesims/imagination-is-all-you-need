import { useLayoutEffect, useRef, useState, type MouseEvent as RMouseEvent } from 'react';
import type { HoverCardProps } from './hoverIntent';
import { createPortal } from 'react-dom';
import { Link } from '../platform/router';
import { shownName, type ToolModel, type RunOnRow } from './models';
import { cardFactsOf, exampleOf, modelPageOf } from './modelSpec';
import { CardHead, FactGrid } from './ModelPreviewCard';
import { PlaceList, livePlaces } from './ModelHoverCard';
import { runPrice, priceDetail } from './billing';
import { CloseIcon } from '../ui/Icons';
import { PromptGrammarTip } from './PromptGrammarTip';
import { linksOf, releasedText, type ModelLinks } from '../../../server/src/shared/modelLinks';
import { THREE_D_MODELS } from '../../../server/src/shared/threeD';
import './modelMenu.css';
import './modelHoverCard.css';
import './modelCard.css';
import './modelInfoCard.css';
/**
 * The Models page card (2026-10-25): hovering, keyboard-focusing or (phones) tapping a model opens one card with everything about it:
 * maker and model (one maker tile), what it's good at, an example when the app has one, the key facts as the picker card's icon grid
 * (ModelPreviewCard CardHead / FactGrid, modelSpec cardFactsOf), ONE price: every place it runs with its price per run (an estimate) and what
 * that place still needs (ModelHoverCard PlaceList), the licence with its link, the release month, the maker's own links as the shared pills
 * (modelCard.css .mc-links; server/src/shared/modelLinks.ts) and an "Open in <medium>" button (dark ink on orange).
 * Desktop: a fixed card beside the hovered row, kept inside the window. Phones: a bottom sheet with a close button.
 * Same pieces and styles as the model menu's preview card (modelCard.css), so both read as one design (2026-10-29).
 */
export interface InfoTarget { key: string; title: string; maker?: string | null; makerName?: string | null; medium: string; to: string; m?: ToolModel; tool?: any; soon?: string | null; open?: boolean }

const MEDIUM_WORD: Record<string, string> = { image: 'Image', video: 'Video', audio: 'Audio', '3d': '3D' };
const LINK_ROWS: [keyof ModelLinks, string][] = [['announce', 'Announcement'], ['paper', 'Paper'], ['card', 'Model card'], ['site', 'Official page'], ['docs', 'Docs']];

/** The maker's links for a model, deduped, with the tool's own doc page as the Docs fallback. */
export function linksFor(key: string, m?: ToolModel, tool?: any): { label: string; href: string; kind: string }[] {
  const l = { ...linksOf(key) }; if (!l.docs && m) { const p = modelPageOf(m, { tool }); if (p && !Object.values(l).includes(p)) l.docs = p; }
  const seen = new Set<string>(); const out: { label: string; href: string; kind: string }[] = [];
  for (const [k, label] of LINK_ROWS) { const href = l[k]; if (typeof href === 'string' && /^https:\/\//.test(href) && !seen.has(href)) { seen.add(href); out.push({ label, href, kind: k }); } }
  return out;
}
/** Licence name + link: the listing's licence, else the 3D model's own licence row. No URL (the tools listing leaves licence URLs to
 *  GET /api/licenses): the name links to the app's Models & licences page, where the text and terms are. */
function licenceOf(key: string, m?: ToolModel): { name: string; url: string | null } | null {
  const t3 = THREE_D_MODELS.find(x => x.id === key);
  const name = (m?.license?.name ?? t3?.licence.name ?? '').replace(/\s*\((hosted API|hosted)\)$/i, '').trim(); if (!name) return null;
  const url = m?.license?.url ?? t3?.licence.url ?? null; return { name, url: url && /^https:\/\//.test(url) ? url : null };
}

export function ModelInfoBody({ t, own }: { t: InfoTarget; own: boolean }) {
  const m = t.m; const ex = m ? exampleOf(m) : null; const [broken, setBroken] = useState(false); const img = ex && !broken ? ex : null;
  const desc = m?.bestFor || (m?.blurb ? String(m.blurb).split(/(?<=\.)\s/)[0].replace(/\.$/, '') : null);
  const facts = m ? cardFactsOf(m, { tool: t.tool }) : [];
  const places = m && !t.soon ? livePlaces(m) : [];
  /* one price: each place's list price per run ("≈ $0.20 / run"), an estimate until a real run is billed (no separate Price fact) */
  const priceAt = (r: RunOnRow) => r.id === 'local' ? 'Free' : runPrice({ own, runOn: r.id, credits: r.credits });
  const est = places.some(r => r.id !== 'local' && /^≈/.test(priceAt(r) ?? ''));
  const lic = licenceOf(t.key, m); const rel = releasedText(linksOf(t.key).released); const links = linksFor(t.key, m, t.tool);
  const medium = MEDIUM_WORD[t.medium] ?? t.medium;
  return <div className="mc">
    {img && <div className="mc-art" data-kind="image"><img src={img.src} alt={img.alt} loading="lazy" decoding="async" onError={() => setBroken(true)} />
      {img.credit && <a className="orb-pv-credit" href={img.creditUrl} target="_blank" rel="noreferrer">{img.credit}</a>}</div>}
    <div className="mc-bd">
      <CardHead name={m ? shownName(m) : t.title} maker={t.maker} makerName={t.makerName} medium={t.medium} fallback={t.title} open={!!t.open && t.maker !== 'openhiggsfield'} testid="mic-name" />
      {desc && <p className="mc-d">{desc}</p>}
      {t.soon && <p className="mc-note" data-testid="mic-soon"><b>{m?.state === 'unavailable' ? 'Not available here' : 'Coming soon'}</b> · {t.soon}</p>}
      <FactGrid facts={facts} />
      <PromptGrammarTip modelKey={t.key} />
      {places.length > 0 && <div className="mc-price mic-places" data-testid="mic-places">
        <div className="mic-sec-h"><span className="mic-lbl">Where it runs</span>{est && <em className="mc-est" title="An estimate: the bill follows the real run">Estimate</em>}</div>
        <PlaceList places={places} priceAt={priceAt} detailAt={r => r.id === 'local' ? null : priceDetail(null, { runOn: r.id, credits: r.credits })} /></div>}
      {(lic || rel) && <dl className="mc-dl">
        {lic && <div><dt>Licence</dt><dd>{lic.url ? <a href={lic.url} target="_blank" rel="noreferrer" data-testid="mic-licence">{lic.name} ↗</a> : <Link to="/licenses" data-testid="mic-licence" title="Licence text, terms and credit lines">{lic.name}</Link>}</dd></div>}
        {rel && <div><dt>Released</dt><dd data-testid="mic-released">{rel}</dd></div>}</dl>}
      <div className="mic-more"><span className="mic-lbl">Read more</span>
        {links.length ? <div className="mc-links" data-testid="mic-links">{links.map(l => <a key={l.href} href={l.href} target="_blank" rel="noreferrer" data-kind={l.kind} title={l.href}>{l.label} ↗</a>)}</div>
          : <p className="mic-none" data-testid="mic-nolinks">{t.maker === 'openhiggsfield' ? 'Built into this app: nothing to link to.' : 'No official page we could confirm yet.'}</p>}</div>
      <Link to={t.to} className={`mc-cta${t.soon ? ' off' : ''}`} data-testid="mic-open" aria-disabled={t.soon ? true : undefined} onClick={t.soon ? (e: RMouseEvent) => e.preventDefault() : undefined}>
        {t.soon ? 'Not available yet' : `Open in ${medium}`}</Link>
    </div>
  </div>;
}

/** Desktop card: fixed beside `anchor` (right, else left, else below), clamped to the window. Hovering or focusing the card keeps it open
 *  (`hover`: shared/hoverIntent.ts, the same rule as the model menu's preview card). */
export function ModelInfoCard({ t, own, anchor, id, hover }: { t: InfoTarget; own: boolean; anchor: HTMLElement; id: string; hover: HoverCardProps }) {
  const box = useRef<HTMLDivElement | null>(null); const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => { const el = box.current; if (!el) return; const a = anchor.getBoundingClientRect(); const w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, gap = 10, edge = 8;
      let left = a.right + gap; let top = a.top - 8;
      if (left + w > vw - edge) left = a.left - gap - w;
      if (left < edge) { left = Math.min(Math.max(edge, a.left), vw - edge - w); top = a.bottom + gap; if (top + h > vh - edge) top = a.top - gap - h; }
      top = Math.max(edge, Math.min(top, vh - edge - h)); setPos({ left: Math.round(left), top: Math.round(top) }); };
    place(); const ro = new ResizeObserver(place); if (box.current) ro.observe(box.current);
    window.addEventListener('scroll', place, true); window.addEventListener('resize', place);
    return () => { ro.disconnect(); window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [anchor, t.key]);
  if (typeof document === 'undefined') return null;
  const { ref: hoverRef, ...on } = hover;
  return createPortal(<div ref={el => { box.current = el; hoverRef(el); }} id={id} className={`orb-pv mic${pos ? ' in' : ''}`} role="dialog" aria-label={`${t.title} details`} data-apop-keep="" data-testid="model-info-card" data-model-key={t.key}
    style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }} {...on}><ModelInfoBody t={t} own={own} /></div>, document.body);
}

/** Phone sheet: the same body from the bottom, over a dimmed page; tap outside or the close button to dismiss. */
export function ModelInfoSheet({ t, own, onClose }: { t: InfoTarget; own: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { ref.current?.focus(); const k = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  if (typeof document === 'undefined') return null;
  return createPortal(<div className="mic-scrim" onClick={onClose} data-testid="model-info-scrim">
    <div ref={ref} tabIndex={-1} className="orb-pv mic mic-sheet in" role="dialog" aria-modal="true" aria-label={`${t.title} details`} data-testid="model-info-card" data-model-key={t.key} onClick={e => e.stopPropagation()}>
      <button type="button" className="mic-x" aria-label="Close" onClick={onClose}><CloseIcon size={16} /></button>
      <ModelInfoBody t={t} own={own} /></div></div>, document.body);
}
