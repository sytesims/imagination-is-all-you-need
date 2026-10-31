/**
 * A card's name, renamed in place (B13, 2026-10-31): a double-click on the name on the card, or a click on it in the card panel, turns it
 * into a field; Enter or a click away keeps it, Esc puts it back. It writes meta.name (what the board, the panel, the agent and the
 * zoomed-out view already read) as one undo step; an empty name clears it, so the card shows its workflow again.
 */
import { useEffect, useRef, useState } from 'react';
import { useEditor, type Editor, type TLShapeId } from 'tldraw';
import { cleanName, NAME_MAX } from './cardLook';
import { tip } from '../shared/Tooltip';

/** Rename a card (one undo step). */
export function renameCard(editor: Editor, id: TLShapeId, name: string) {
  const s = editor.getShape(id); if (!s) return; const next = cleanName(name); const was = String((s.meta as any)?.name ?? '');
  if (next === was) return;
  editor.markHistoryStoppingPoint('rename card');
  editor.updateShape({ id, type: s.type, meta: { ...s.meta, name: next } });
}

/** The name, and the field that replaces it while renaming. `board`: on a card (a double-click, caught before the board reads it);
 *  otherwise (the panel) a click. */
export function CardName({ id, name, shown, empty, className, testId, board = true }: { id: TLShapeId; /** meta.name now */ name: string; /** what shows (the name, else the card's own title) */ shown: string; /** shown is a placeholder ("Untitled") */ empty?: boolean; className: string; testId?: string; board?: boolean }) {
  const editor = useEditor(); const [edit, setEdit] = useState(false); const last = useRef(0);
  const start = () => setEdit(true);
  if (edit) return <NameField id={id} name={name || (empty ? '' : shown)} className={className} onDone={() => setEdit(false)} />;
  if (!board) return <button type="button" className={`${className} cn-btn`} data-testid={testId} title={shown} {...tip('Rename')} onClick={start}>{shown}</button>;
  /* on the board the first press still selects and drags the card; the second, within 400 ms, renames it */
  return <h3 className={className} data-testid={testId} title={empty ? 'Double-click to name this card' : shown}
    onPointerDown={e => { if (e.button !== 0) return; if (e.timeStamp - last.current < 400) { e.stopPropagation(); e.preventDefault(); last.current = 0; if (!editor.getSelectedShapeIds().includes(id)) editor.select(id); start(); } else last.current = e.timeStamp; }}>{shown}</h3>;
}

function NameField({ id, name, className, onDone }: { id: TLShapeId; name: string; className: string; onDone: () => void }) {
  const editor = useEditor(); const [v, setV] = useState(name); const done = useRef(false); const ref = useRef<HTMLInputElement>(null);
  const close = (keep: boolean) => { if (done.current) return; done.current = true; if (keep) renameCard(editor, id, v); onDone(); };
  /* Enter and Esc are read before the board's own keys (which would deselect the card first) */
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key !== 'Enter' && e.key !== 'Escape') return; e.stopPropagation(); e.preventDefault(); close(e.key === 'Enter'); };
    addEventListener('keydown', key, true); return () => removeEventListener('keydown', key, true); }); // eslint-disable-line react-hooks/exhaustive-deps
  return <input ref={ref} className={`${className} cn-in`} data-card-control data-testid="card-name-in" value={v} maxLength={NAME_MAX} placeholder="Name this card" aria-label="Card name"
    onChange={e => setV(e.target.value)} onBlur={() => close(true)} onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} onKeyUp={e => e.stopPropagation()} />;
}
