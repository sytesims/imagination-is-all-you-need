/**
 * Quick actions on a result (a result card, or a finished generate card): small icon buttons that show on hover / selection, each with a
 * tooltip naming its price. A picture: Upscale, Remove background, Image to layers, Relight, To video, To 3D. A clip: Extend, Upscale.
 * Each one only makes a NEW draft generate card beside the result, wired to it with an arrow (the result is its input) and pre-filled with
 * the workflow; the draft shows its price. Nothing runs until that card's Generate.
 * The tooltip prices are the same GET /price quote a card would show (shared priceToken words), fetched once per action and kind on first hover.
 */
import { useEffect, useState } from 'react';
import type { Editor, TLShapeId } from 'tldraw';
import { availableFlows, flowById, flowSpec, placeInputs, type InputKind } from '../shared/genFlows';
import { readQuoteBody, shownCredits } from '../shared/quote';
import { quoteParams } from '../shared/usePrefill';
import { priceToken, ownAccountsNow } from '../shared/billing';
import { tip } from '../shared/Tooltip';
import { catalogNow, useCatalog } from './catalog';
import { QUICK_ACTIONS, quickCard } from './quickActionsModel';

/* One price per action and input kind (an Upscale of this picture costs what an Upscale of another picture costs at the same model) */
const prices = new Map<string, Promise<string | null>>();
export function actionPrice(flowId: string, kind: InputKind, url: string): Promise<string | null> {
  const k = `${flowId}:${kind}`; const cat = catalogNow(); const f = flowById(flowId); if (!cat || !f) return Promise.resolve(null);
  if (!prices.has(k)) prices.set(k, (async () => {
    const input = { key: 'src', kind, url, poster: '', jobId: '', label: '' }; const s0 = flowSpec(f, cat, { filled: {} }); if (!s0) return null;
    const spec = flowSpec(f, cat, { filled: placeInputs(s0.slots, [input]).bySlot }) ?? s0;
    const u = new URLSearchParams({ ...quoteParams(), ...(spec.provider ? { provider: spec.provider } : {}), ...spec.quote });
    const q = await fetch(`/api/tools/${spec.tool.id}/price?${u}`).then(readQuoteBody).catch(() => null); if (!q) return null;
    return q.demo === true ? 'Sample' : priceToken({ q, own: ownAccountsNow(), credits: shownCredits(q) });
  })().catch(() => null));
  return prices.get(k)!;
}

/** The icon bar. `show`: hovered or selected (the bar fades in). */
export function QuickActions({ editor, sourceId, kind, url, show }: { editor: Editor; sourceId: TLShapeId; kind: string; url: string; show: boolean }) {
  const cat = useCatalog(); const have = new Set(availableFlows(cat).map(f => f.id)); const acts = (QUICK_ACTIONS[kind as 'image' | 'video'] ?? []).filter(a => have.has(a.flow));
  const [p, setP] = useState<Record<string, string | null>>({});
  useEffect(() => { if (!show || !acts.length) return; let on = true; acts.forEach(a => { if (a.id in p) return; void actionPrice(a.flow, kind as InputKind, url).then(t => { if (on) setP(m => ({ ...m, [a.id]: t })); }); }); return () => { on = false; }; }, [show, acts.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!acts.length) return null;
  return <div className={`cv-qa${show ? ' on' : ''}`} role="toolbar" aria-label="Quick actions" data-card-control data-testid="cv-quick">
    {acts.map(a => <button key={a.id} type="button" className="cv-qa-b" data-testid={`cv-quick-${a.id}`} aria-label={`${a.label}: makes a new card${p[a.id] ? `, ${p[a.id]}` : ''}`}
      {...tip(`${a.label}${p[a.id] ? ` · ${p[a.id]}` : ''}. A new card; runs when you press Generate`)} onClick={e => { e.stopPropagation(); quickCard(editor, sourceId, a); }}><a.icon size={15} /></button>)}
  </div>;
}
