/** "Before you generate" (the Video and Audio bars, Image's pre-flight look): one row per note, in the stage it belongs to (Inputs → Model → Setup),
 *  opened by a click on a blocked Generate. Hard notes block Generate; the rest are notes. */
import type { RefObject, ReactNode } from 'react';
import { Popover } from './Popover';

export type PreflightNote = { key: string; stage: string; node: ReactNode; hard?: boolean };

export function PreflightNotes({ open, notes, anchor, dock, onClose, testId }: { open: boolean; notes: PreflightNote[]; anchor: RefObject<HTMLElement | null>; dock: RefObject<HTMLElement | null>; onClose: () => void; /** "vs-notes" (Video), "ap-notes" (Audio) */ testId: string }) {
  const hard = notes.filter(n => n.hard).length;
  return <Popover open={open && notes.length > 0} anchor={anchor as RefObject<HTMLElement>} avoid={dock as RefObject<HTMLElement>} watch={dock as RefObject<HTMLElement>} placement="top" align="end" gap={8} onClose={onClose} label="Before you generate" testId={testId} className="pf-pop vs-notes-pop" width={360}>
    <div className="pf" data-testid={`${testId}-list`}><p className="pf-h"><b>{hard ? (hard === 1 ? 'One thing to fix first' : `${hard} things to fix first`) : notes.length === 1 ? 'One note' : `${notes.length} notes`}</b></p>
      <ol className="pf-list">{notes.map(n => <li key={n.key} className="pf-row" data-stage={n.stage}><span className="pf-t"><small>{n.stage}</small><span>{n.node}</span></span></li>)}</ol></div>
  </Popover>;
}
