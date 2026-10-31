/**
 * One Video page (2026-10-23): the workflow chip and picker in the Video bar, same look and keys as Create Image's (ui/next/WorkflowBar.tsx).
 * The list is shared/videoWorkflows.ts; a picked workflow is ?workflow=<id> on /tools/h3-video and renders its own tool's screen
 * (inputs, controls, models, quote and submit unchanged). "How it works" for each workflow is in the picker (each row's ⓘ), like Image's
 * picker carries its info and credits; the chip itself has no ⓘ (2026-10-23, bar match).
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { WorkflowPicker, wantsPicker, usePickerParam, clearPickerParam } from '../../shared/WorkflowPicker';
import { navigate } from '../../platform/router';
import { WorkflowChip } from '../../shared/WorkflowChip';
import { ToolIconFor } from '../Icons';
import type { ToolInfo } from '../../api';
import { VIDEO_PAGE, VIDEO_WORKFLOWS, VIDEO_WORKFLOW_CATEGORIES, VIDEO_FLOW_SHORTCUTS, videoWorkflowById, videoWorkflowHref, isEditHub, isPanelWorkflow, type VideoWorkflow, type VideoFlowShortcut } from '../../../../server/src/shared/videoWorkflows';
import { useToast } from '../../shared/Toast';
import '../next/workflowBar.css';
import './videoWorkflows.css';

export { VIDEO_WORKFLOWS, VIDEO_PAGE, videoWorkflowById, videoWorkflowHref, isPanelWorkflow };
/** The tool registry App loaded (set on each App render), so any workflow screen can show the chip without passing the list down. */
let KNOWN: ToolInfo[] = [];
export const setVideoWorkflowTools = (tools: ToolInfo[]) => { KNOWN = tools; };
/** The workflows this server can run: the tool is registered (Edit Video's list shows when any edit is). */
export function availableVideoWorkflows(tools: ToolInfo[]): VideoWorkflow[] {
  const have = new Set(tools.map(t => t.id));
  /* Edit Video is no longer a row of its own (2026-10-25): it was a second list of the same edits; the picker's Edit tab is that list */
  /* Stitch runs POST /api/compose (ffmpeg here), not a registry tool: always there */
  return VIDEO_WORKFLOWS.filter(w => w.surface !== 'edit-hub' && (have.has(w.toolId) || isPanelWorkflow(w)));
}
/** The flow shortcuts this server can open (their tool is registered): Direct a Shot, Loop, Morph, Exploded view, New angle. */
export const availableFlowShortcuts = (tools: ToolInfo[]): VideoFlowShortcut[] => { const have = new Set(tools.map(t => t.id)); return VIDEO_FLOW_SHORTCUTS.filter(w => have.has(w.toolId)); };
const isShortcut = (w: VideoWorkflow): w is VideoFlowShortcut => typeof (w as VideoFlowShortcut).href === 'string';
/** The workflow on screen now (from ?workflow=; unknown ids, and the old Edit Video list, show Create Video). */
export const currentVideoWorkflow = (search = location.search): VideoWorkflow => { const w = videoWorkflowById(new URLSearchParams(search).get('workflow')); return w && w.surface !== 'edit-hub' ? w : VIDEO_WORKFLOWS[0]; };

/* Switching workflows never carries a prompt (2026-10-26 fix): each workflow's box starts with its own saved draft, or empty. The old carry
 * copied whatever text box was on screen into the next workflow, where its draft then saved it, so one old prompt (a Motion Control Recreate's,
 * in Kling's <<<video_1>>> form) kept showing up in every workflow picked after it. */
export function pickVideoWorkflow(id: string) { navigate(videoWorkflowHref(id)); }

const WIcon = ({ w, size = 16 }: { w: VideoWorkflow; size?: number }) => <ToolIconFor id={w.surface === 'edit-hub' ? 'reframe' : w.id === 'loop' ? 'loop' : w.id === 'new-angle' ? 'reshoot' : w.toolId} size={size} />;

/** The workflow chip with its picker: the shared WorkflowChip (shared/WorkflowChip.tsx, all four pages) over the video list. `dock`: first chip
 *  of the Create bar's chip row ("Create ⌃"; a picked workflow is the orange "<icon> Name ✕"); otherwise a full-width chip at the top of a
 *  workflow's panel. How it works is in the picker. */
export function VideoWorkflowChip({ tools: given, dock = false, watch }: { tools?: ToolInfo[]; dock?: boolean; watch?: RefObject<HTMLElement> }) {
  const tools = given?.length ? given : KNOWN; const w = currentVideoWorkflow(); const list = useMemo(() => availableVideoWorkflows(tools), [tools]); const shortcuts = useMemo(() => availableFlowShortcuts(tools), [tools]);
  const wfParam = () => new URLSearchParams(location.search).get('workflow');
  /* an old Edit Video link (/tools/edit-video, ?workflow=edit-video) opens the picker on its Edit tab */
  const [open, setOpen] = useState(() => wantsPicker() || isEditHub(wfParam())); const chip = useRef<HTMLButtonElement>(null);
  usePickerParam(setOpen); useEffect(() => { const f = () => { if (isEditHub(wfParam())) setOpen(true); }; addEventListener('popstate', f); return () => removeEventListener('popstate', f); }, []);
  /* a link to a workflow that doesn't exist (an old or mistyped ?workflow=) or that this server can't run: Create Video, with a note saying so */
  const toast = useToast(); const told = useRef('');
  useEffect(() => { if (!dock || !tools.length) return; const id = wfParam(); if (!id || id === 'create' || isEditHub(id) || told.current === id) return; const known = videoWorkflowById(id);
    if (known && list.some(x => x.id === id)) return; told.current = id;
    toast(known ? `${known.name} isn’t in this app, so Create Video is open.` : `There’s no video workflow called “${id.slice(0, 40)}”, so Create Video is open. Pick one from Create ⌃.`, 'warn');
    const u = new URL(location.href); u.searchParams.delete('workflow'); navigate(`${u.pathname}${u.search}${u.hash}`, { replace: true }); }, [tools.length, location.search]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => { setOpen(false); clearPickerParam(); if (isEditHub(wfParam())) { const u = new URL(location.href); u.searchParams.delete('workflow'); u.searchParams.delete('workflows'); history.replaceState(history.state, '', `${u.pathname}${u.search}${u.hash}`); } };
  return <>
    <WorkflowChip name={dock && w.id === 'create' ? 'Create' /* the bar says "Create", like Image's; the page is Video */ : w.name} icon={<WIcon w={w} />} title={`${w.name}: ${w.tagline}. Change workflow`}
      picked={w.id !== 'create'} backTo="Create Video" open={open} onOpen={() => setOpen(o => !o)} onClear={() => pickVideoWorkflow('create')} chipRef={chip}
      testId="vwf-chip" clearTestId="vwf-clear" wrapTestId="vwf-chip-wrap" variant={dock ? 'dock' : 'panel'} />
    <VideoWorkflowPicker open={open} anchor={chip} watch={watch} list={list} shortcuts={shortcuts} current={w.id} onClose={close} placement={dock ? 'top' : 'bottom'} />
  </>;
}

export function HowSteps({ w }: { w: VideoWorkflow }) {
  return <div className="vwf-how" data-testid={`vwf-how-${w.id}`}><p className="vwf-how-h"><b>How {w.name} works</b><small>{w.tagline}</small></p>
    <ol>{w.how.map(([h, p], i) => <li key={i}><span className="vwf-how-n" aria-hidden>{i + 1}</span><span><b>{h}</b><small>{p}</small></span></li>)}</ol>
    <p className="vwf-how-in"><small>Takes</small> {w.inputs.join(' · ')}</p></div>;
}

/** The picker: the shared WorkflowPicker (shared/WorkflowPicker.tsx, also the Audio bar's) with the video list, categories and How it works. */
export function VideoWorkflowPicker({ open, anchor, list, shortcuts = [], current, onClose, watch, placement = 'top' }: { open: boolean; anchor: RefObject<HTMLElement>; watch?: RefObject<HTMLElement>; list: VideoWorkflow[]; /** flow shortcuts (Direct a Shot, Loop, Morph…): rows that open their own link */ shortcuts?: VideoFlowShortcut[]; current: string; onClose: () => void; placement?: 'top' | 'bottom' }) {
  /* the shortcuts sit right after Create Video, so the newest flows are the first thing the picker offers */
  const all: VideoWorkflow[] = [...list.slice(0, 1), ...shortcuts, ...list.slice(1)];
  return <WorkflowPicker open={open} anchor={anchor} watch={watch} list={all} current={current} categories={VIDEO_WORKFLOW_CATEGORIES} onChoose={w => { if (isShortcut(w)) { onClose(); navigate(w.href); } else pickVideoWorkflow(w.id); }} onClose={onClose} placement={placement}
    label="Video workflows" prefix="vwf" noun="video" icon={w => <WIcon w={w} />} how={w => <HowSteps w={w} />} foot={`${list.length} video workflows and ${shortcuts.length} shortcuts`}
    initialTab={new URLSearchParams(location.search).get('workflows') ?? (isEditHub(new URLSearchParams(location.search).get('workflow')) ? 'edit' : 'all')} />;
}
