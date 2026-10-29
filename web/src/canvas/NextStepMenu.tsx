/**
 * "What next?" (2026-10-27): a drag from a card's output let go on empty board opens this short list of sensible workflows for what that
 * card makes (a picture: Animate, Upscale, Relight…; a clip: Add sound, Extend, Upscale; text: Picture, Clip, Music, Read it aloud). Picking
 * one drops a DRAFT card there, wired from the source, with its price on the card. Nothing runs until Generate. The list is the shared
 * NEXT_STEPS (quickActionsModel.ts, the hover bar's own set) filtered to the workflows this server has; the prices are the hover bar's.
 */
import { useEffect, useRef, useState } from 'react';
import { useEditor, useValue, type TLShapeId } from 'tldraw';
import { Popover } from '../shared/Popover';
import { availableFlows, type InputKind } from '../shared/genFlows';
import { useCatalog } from './catalog';
import { nextStepAtom } from './nodeFrameModel';
import { NEXT_STEPS, nextStepCard } from './quickActionsModel';
import { actionPrice } from './QuickActions';
import { PORT_WORDS } from './nodeLogic';
import { LOCAL_FREE } from '../../../server/src/shared/modelIds';

export function NextStepMenu() {
  const editor = useEditor(); const cat = useCatalog(); const ns = useValue('next step', () => nextStepAtom.get(), []);
  const anchor = useRef<HTMLSpanElement>(null); const [prices, setPrices] = useState<Record<string, string | null>>({});
  const have = new Set(availableFlows(cat).map((f) => f.id)); const acts = ns ? NEXT_STEPS[ns.kind].filter((a) => have.has(a.flow)) : [];
  useEffect(() => { if (!ns || ns.kind === 'text') return; let on = true; setPrices({});
    for (const a of acts) void actionPrice(a.flow, ns.kind as InputKind, '').then((t) => { if (on) setPrices((m) => ({ ...m, [a.id]: t })); });
    return () => { on = false; }; }, [ns?.fromId, ns?.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ns) return null;
  const close = () => nextStepAtom.set(null);
  const pick = (i: number) => { const a = acts[i]; if (!a) return; const id = nextStepCard(editor, ns.fromId as TLShapeId, a, ns.page); editor.select(id); close(); };
  return <>
    <span ref={anchor} className="cv-next-anchor" style={{ left: ns.screen.x, top: ns.screen.y }} aria-hidden />
    <Popover open anchor={anchor} onClose={close} label="What next?" role="menu" placement="bottom" align="start" className="cv-next" testId="cv-next-step" width={260} gap={6}>
      <div className="cv-next-h"><span className="cv-next-k">What next?</span><small>From {PORT_WORDS[ns.kind]}. A new card, priced before it runs.</small></div>
      {acts.length ? acts.map((a, i) => <button key={a.id} type="button" role="menuitem" className="cv-next-i" data-testid={`cv-next-${a.id}`} onClick={() => pick(i)}>
          <i aria-hidden><a.icon size={15} /></i><b>{a.label}</b>{prices[a.id] && <small>{prices[a.id] === LOCAL_FREE ? 'Free' : prices[a.id]}</small>}</button>)
        : <p className="cv-next-none">Nothing on this server takes {PORT_WORDS[ns.kind]} yet.</p>}
    </Popover>
  </>;
}
