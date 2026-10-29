/**
 * The workflow chip: the first chip of the Create bar's row 2 on Image, Video, Audio and 3D (one component, one look).
 *  - The default workflow: "<icon> Create ⌃" (Image, Video), "Music ⌃" (Audio), "Image to 3D ⌃" (3D). A click opens the page's picker.
 *  - Another workflow: the orange "<icon> Name ✕" (wf-chip-on); ✕ goes back to the default.
 * The page owns its list and the picker (shared/WorkflowPicker.tsx, Image's ui/next/WorkflowBar.tsx WorkflowPicker); this chip only shows the
 * current workflow and calls onOpen / onClear. Styles: ui/next/workflowBar.css (dock), ui/video/videoWorkflows.css (the panel variant).
 */
import type { ReactNode, RefObject } from 'react';
import { tip } from './Tooltip';
import { CloseIcon } from '../ui/Icons';
import '../ui/next/workflowBar.css';

export const WfCaret = () => <svg className="wf-caret" width="12" height="12" viewBox="0 0 16 16" aria-hidden><path d="M4 10l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export function WorkflowChip({ name, icon, title, picked, open, onOpen, onClear, chipRef, backTo, testId = 'wf-chip', clearTestId = 'wf-chip-clear', wrapTestId = 'wf-chip-picked', variant = 'dock', className = '' }: {
  /** the label on the chip ("Create", "Relight", "Music") */ name: string; icon: ReactNode;
  /** the tooltip (hidden while the picker is open) */ title: string;
  /** a workflow other than the page's default is on: orange, with ✕ */ picked: boolean;
  open: boolean; onOpen: () => void; onClear: () => void; chipRef: RefObject<HTMLButtonElement>;
  /** the default's name for ✕ ("Create", "Create Video", "Music", "Image to 3D") */ backTo: string;
  testId?: string; clearTestId?: string; wrapTestId?: string;
  /** 'dock': in the bar's chip row (all four pages); 'panel': a full-width chip at the top of a Video workflow's own panel */ variant?: 'dock' | 'panel'; className?: string }) {
  const panel = variant === 'panel';
  const btn = <button ref={chipRef} type="button" className={`ic-chip wf-chip${panel ? ' vwf-chip' : ''}${picked ? ' wf-chip-picked' : ''}${open ? ' on' : ''}${className ? ` ${className}` : ''}`} aria-haspopup="listbox" aria-expanded={open}
    aria-label={`Workflow: ${name}. Change workflow`} data-testid={testId} {...tip(open ? null : title)} onClick={onOpen}>
    {icon}<span className="wf-name">{name}</span>{(!picked || panel) && <WfCaret />}</button>;
  const clear = picked && <button type="button" className="wf-chip-x" aria-label={`Stop using ${name}, back to ${backTo}`} data-testid={clearTestId} {...tip(`Back to ${backTo}`)} onClick={onClear}><CloseIcon size={12} strokeWidth={2} /></button>;
  if (panel) return <span className={`vwf-chip-wrap vwf-panel${picked ? ' wf-chip-on' : ''}`} data-testid={wrapTestId}>{btn}{clear}</span>;
  return picked ? <span className="wf-chip-on" data-testid={wrapTestId}>{btn}{clear}</span> : btn;
}
