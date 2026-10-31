/**
 * A generate card's input slots: thumbnails with ✕ (an arrow input deletes its arrow); an empty slot shows a quiet Add chip with its name,
 * a slot with something in it the bars' dashed "+" (shared/AddTile, 2026-10-31). One component for the card body and the card panel's "Set it up", so picking in one place fills the other: both
 * read the same card (cardState.bySlot) and write the same props (inputs + pins).
 */
import { useRef, useState } from 'react';
import { useEditor, type TLShapeId } from 'tldraw';
import { ACCEPT, kindOfFile, wrongTypeText } from '../../../server/src/shared/mediaAccept';
import { gridSrc } from '../shared/thumbs';
import { uploadMedia } from '../shared/batch1';
import { useToast } from '../shared/Toast';
import { tip } from '../shared/Tooltip';
import { AddTile } from '../shared/AddTile';
import { AudioIcon, VideoIcon, CloseIcon, PlusIcon } from '../ui/Icons';
import type { GenSlot, InputKind } from '../shared/genFlows';
import { GEN_TYPE, type BoardInput, type GenCardProps } from './cardModel';
import { setCard, addCardInputs } from './agentApi';
import { uploadedInput } from './fileDrop';

export function CardInputs({ cardId, slots, bySlot, showAdd, className = '', testPrefix = 'gc' }: { cardId: TLShapeId; slots: GenSlot[]; bySlot: Record<string, BoardInput[]>; showAdd: boolean; className?: string; /** 'gc' on the card, 'cp' in the panel */ testPrefix?: string }) {
  const editor = useEditor(); const toast = useToast(); const file = useRef<HTMLInputElement>(null); const [upFor, setUpFor] = useState<GenSlot | null>(null);
  const props = () => (editor.getShape(cardId)?.props as GenCardProps | undefined);
  const remove = (i: BoardInput) => { if (i.arrowId) { editor.markHistoryStoppingPoint('remove input'); editor.deleteShapes([i.arrowId as TLShapeId]); return; }
    const p = props(); if (!p) return; const { [i.key]: _gone, ...pins } = p.pins ?? {}; setCard(editor, cardId, { inputs: p.inputs.filter(x => x.key !== i.key), pins }); };
  const onFile = async (f: File | undefined) => { const s = upFor; setUpFor(null); if (!f || !s) return; const kind: InputKind | null = kindOfFile(f);
    if (kind !== s.accept) { toast(wrongTypeText(f.name, [s.accept]), 'warn'); return; }
    try { const [m] = await uploadMedia([f]); if (!m?.url) throw new Error('Upload failed'); if (editor.getShape(cardId)?.type !== GEN_TYPE) return;
      addCardInputs(editor, cardId, [{ input: uploadedInput(s.accept, m.url, f.name), slot: s.name }]); }
    catch (e) { toast((e as Error).message || 'Upload failed', 'error'); } };
  const pick = (s: GenSlot) => { setUpFor(s); requestAnimationFrame(() => file.current?.click()); };
  return <div className={`nf-ins${className ? ` ${className}` : ''}`} data-testid={`${testPrefix}-inputs`}>
    <input ref={file} type="file" hidden accept={ACCEPT[upFor?.accept === 'video' ? 'video' : upFor?.accept === 'audio' ? 'audio' : 'image']} onChange={e => { void onFile(e.target.files?.[0]); e.currentTarget.value = ''; }} />
    {slots.map(s => { const list = bySlot[s.name] ?? [];
      return <span key={s.name} className="nf-slot" data-testid={`${testPrefix}-slot-${s.name}`} data-n={list.length}>
        {list.map(i => <span key={i.key} className="nf-in-thumb" {...tip(`${s.label}: ${i.label}`)}>{i.poster ? <img src={gridSrc(i.poster, 54)} alt="" draggable={false} /> : i.kind === 'audio' ? <AudioIcon size={16} /> : <VideoIcon size={16} />}
          <small>{s.label}</small><button type="button" className="nf-in-x" aria-label={`Remove ${s.label.toLowerCase()}`} data-testid={`${testPrefix}-in-x-${s.name}`} onClick={() => remove(i)}><CloseIcon size={9} strokeWidth={2.4} /></button></span>)}
        {showAdd && !list.length && <button type="button" className={`nf-add${s.required ? ' req' : ''}`} aria-label={`Add ${s.label.toLowerCase()}${s.required ? '' : ' (optional)'}`} data-card-control data-testid={`${testPrefix}-add-${s.name}`} {...tip(`${s.hint}. Draw an arrow into the node from a result or upload, or pick a file`)} onClick={() => pick(s)}><PlusIcon size={12} />{s.label}</button>}
        {/* with something in it: the bar's dashed "+" (shared/AddTile: the limit in its tooltip, a badge near it, disabled at it) */}
        {showAdd && list.length > 0 && s.max > 1 && <AddTile size="card" used={list.length} max={s.max} noun={s.accept === 'video' ? 'clip' : s.accept === 'audio' ? 'sound' : 'picture'} testId={`${testPrefix}-add-${s.name}`} onAdd={() => pick(s)} />}
      </span>; })}
  </div>;
}
