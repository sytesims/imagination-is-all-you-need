/**
 * Audio workflow chip and picker, using the same controls and keys as
 * Create Image's (ui/next/WorkflowBar.tsx) and Video's (ui/video/VideoWorkflows.tsx). The list is shared/audioWorkflows.ts; a picked workflow is
 * ?workflow=<id> on /audio and runs on its own tool and mode (audio / voice / soundtrack: inputs, quote and submit unchanged).
 * GET /api/audio-workflows adds the live part (models per mode, each model's name and workflow credit, the Default for this setup).
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { WorkflowPicker, wantsPicker, usePickerParam, clearPickerParam } from '../../shared/WorkflowPicker';
import { navigate } from '../../platform/router';
import { WorkflowChip } from '../../shared/WorkflowChip';
import { MusicIcon, AudioIcon, MicIcon, ChangeVoiceIcon, TranslateIcon, MusicBedIcon, VideoIcon } from '../Icons';
import type { ToolInfo } from '../../api';
import { AUDIO_PAGE, AUDIO_WORKFLOW_IDS, AUDIO_WORKFLOW_CATEGORIES, AUDIO_DEFAULT_WORKFLOW, audioWorkflowById, audioRoute, type AudioWorkflowId } from '../../../../server/src/shared/audioWorkflows';

export { AUDIO_PAGE };
export type AudioRecipe = NonNullable<ReturnType<typeof audioWorkflowById>>;
/** What a workflow needs, in the picker's words (the server's needsOf: "1 clip", "1 clip or audio file", "Prompt"). */
export function needsOf(d: AudioRecipe): string {
  if (d.oneOf?.length) return '1 clip or audio file';
  const req = d.slots.filter(s => s.required); if (req.length) return req.map(s => `1 ${s.label.toLowerCase()}`).join(' + ');
  return d.slots.some(s => s.name === 'video') ? 'Clip optional' : 'Prompt';
}
/** The live recipe from GET /api/audio-workflows (models, modelInfo, defaults.active). */
export type AudioRecipeLive = AudioRecipe & { models: Record<string, string[]>; modelInfo?: Record<string, { name: string | null; workflow: { line: string; url: string | null; source: string } | null }>;
  defaults?: { local: string | null; hosted: string | null; why: Record<string, string>; active: { id: string; runs: boolean; reason: string | null; why: string | null; defaultProvider: string | null } | null } };

/** The workflow on screen now (from ?workflow=; unknown ids fall back to Music). */
export const currentAudioWorkflow = (search = location.search): AudioRecipe => audioWorkflowById(new URLSearchParams(search).get('workflow') ?? '') ?? audioWorkflowById(AUDIO_DEFAULT_WORKFLOW)!;
/** The workflow a tool screen is showing on the Audio page, or null when the tool isn't on the Audio page. */
export function audioPageWorkflow(toolId: string): AudioRecipe | null {
  if (typeof location === 'undefined' || location.pathname.replace(/\/+$/, '') !== AUDIO_PAGE) return null;
  const w = currentAudioWorkflow(); return w.tool === toolId ? w : null;
}
/** The workflows this server can run (their tool is registered). */
export const availableAudioWorkflows = (tools: ToolInfo[]): AudioRecipe[] => { const have = new Set(tools.map(t => t.id)); return AUDIO_WORKFLOW_IDS.map(id => audioWorkflowById(id)!).filter(w => !tools.length || have.has(w.tool)); };

/** GET /api/audio-workflows, once per page load (shared by every bar). */
let LIVE: Promise<Record<string, AudioRecipeLive>> | null = null;
export function useAudioRecipes(): Record<string, AudioRecipeLive> {
  const [m, setM] = useState<Record<string, AudioRecipeLive>>({});
  useEffect(() => { LIVE ??= fetch('/api/audio-workflows').then(r => r.ok ? r.json() : null).then(d => Object.fromEntries(((d?.workflows ?? []) as AudioRecipeLive[]).map(w => [w.id, w]))).catch(() => { LIVE = null; return {}; });
    let live = true; LIVE.then(x => { if (live) setM(x); }); return () => { live = false; }; }, []);
  return m;
}

/* Switching keeps the prompt where it makes sense: a description carries to the next workflow that takes a description (Music → Sound effects →
 * Music for a video …). A voiceover script is not a description, so it never carries into a music prompt and a music prompt never becomes a script. */
let CARRY: { text: string; kind: 'describe' | 'script' } | null = null;
const promptKind = (w: AudioRecipe): 'describe' | 'script' | null => w.prompt.mode === 'hidden' ? null : w.id === 'voiceover' ? 'script' : 'describe';
export function pickAudioWorkflow(id: AudioWorkflowId | string, prompt?: string) {
  const cur = currentAudioWorkflow(); const k = promptKind(cur); CARRY = prompt?.trim() && k ? { text: prompt, kind: k } : null;
  const w = audioWorkflowById(id); navigate(w ? audioRoute(w.id) : AUDIO_PAGE);
}
/** The carried text for this workflow's empty prompt box (taken once). */
export function takeCarriedPrompt(w: AudioRecipe): string { const c = CARRY; CARRY = null; return c && c.kind === promptKind(w) ? c.text : ''; }

const ICONS: Record<string, (p: { size?: number }) => JSX.Element> = { music: MusicIcon, sfx: AudioIcon, voiceover: MicIcon, 'change-voice': ChangeVoiceIcon, translate: TranslateIcon, 'soundtrack-music': MusicBedIcon, 'soundtrack-sound': VideoIcon, cover: MusicIcon };
export const AWIcon = ({ w, size = 16 }: { w: { id: string }; size?: number }) => { const I = ICONS[w.id] ?? AudioIcon; return <I size={size} />; };

/** The workflow chip with its picker: the shared WorkflowChip (shared/WorkflowChip.tsx, all four pages), first chip of the Audio bar's chip row
 *  ("Music ⌃"; another workflow is the orange "<icon> Name ✕"). */
export function AudioWorkflowChip({ tools, watch, prompt }: { tools: ToolInfo[]; watch?: RefObject<HTMLElement>; /** the bar's prompt, carried to the next workflow when it fits */ prompt?: string }) {
  const w = currentAudioWorkflow(); const list = useMemo(() => availableAudioWorkflows(tools), [tools]);
  const [open, setOpen] = useState(() => wantsPicker()); const chip = useRef<HTMLButtonElement>(null);
  usePickerParam(setOpen);
  return <>
    <WorkflowChip name={w.name} icon={<AWIcon w={w} />} title={`${w.name}: ${w.tagline}. Change workflow`} picked={w.id !== AUDIO_DEFAULT_WORKFLOW} backTo="Music"
      open={open} onOpen={() => setOpen(o => !o)} onClear={() => pickAudioWorkflow(AUDIO_DEFAULT_WORKFLOW, prompt)} chipRef={chip} testId="awf-chip" clearTestId="awf-clear" wrapTestId="awf-chip-wrap" />
    <AudioWorkflowPicker open={open} anchor={chip} watch={watch} list={list} current={w.id} prompt={prompt} onClose={() => { setOpen(false); clearPickerParam(); }} />
  </>;
}

/** How a workflow works, from its recipe: what you add, what you write, then Generate. */
export function AudioHowSteps({ w }: { w: AudioRecipe }) {
  const files = w.slots.length ? [w.oneOf?.length ? `Add ${w.slots.filter(s => w.oneOf!.includes(s.name)).map(s => s.label.toLowerCase()).join(' or ')}` : `Add ${w.slots.filter(s => s.required).map(s => s.label.toLowerCase()).join(' and ') || w.slots[0].label.toLowerCase()}`,
    w.slots.map(s => `${s.label}: ${s.hint}`).join(' · ')] as [string, string] : null;
  const text: [string, string] | null = w.prompt.mode === 'hidden' ? null : [w.id === 'voiceover' ? 'Write the script' : w.prompt.mode === 'optional' ? 'Describe it (optional)' : 'Describe it', `${w.prompt.placeholder}${w.lyrics.mode !== 'hidden' ? `. Lyrics: ${w.lyrics.mode === 'required' ? 'needed' : 'optional, needed for YuE2'}` : ''}`];
  const steps = [files, text, ['Pick a model, then Generate', `${w.generateLabel}. The price and the time show on Generate before it runs.`] as [string, string]].filter(Boolean) as [string, string][];
  return <div className="vwf-how" data-testid={`awf-how-${w.id}`}><p className="vwf-how-h"><b>How {w.name} works</b><small>{w.tagline}</small></p>
    <ol>{steps.map(([h, p], i) => <li key={i}><span className="vwf-how-n" aria-hidden>{i + 1}</span><span><b>{h}</b><small>{p}</small></span></li>)}</ol>
    <p className="vwf-how-in"><small>Takes</small> {needsOf(w)}</p></div>;
}

/** The picker: the shared WorkflowPicker (shared/WorkflowPicker.tsx, also the Video bar's) with the audio list, categories and How it works. */
export function AudioWorkflowPicker({ open, anchor, list, current, onClose, watch, prompt }: { open: boolean; anchor: RefObject<HTMLElement>; watch?: RefObject<HTMLElement>; list: AudioRecipe[]; current: string; onClose: () => void; prompt?: string }) {
  const rows = useMemo(() => list.map(w => ({ ...w, needs: needsOf(w) })), [list]);
  return <WorkflowPicker open={open} anchor={anchor} watch={watch} list={rows} current={current} categories={AUDIO_WORKFLOW_CATEGORIES} onChoose={w => pickAudioWorkflow(w.id, prompt)} onClose={onClose}
    label="Audio workflows" prefix="awf" noun="audio" icon={w => <AWIcon w={w} />} how={w => <AudioHowSteps w={w} />} foot={`${list.length} audio workflows`} className="awf-pop" addTab="audio" />;
}
