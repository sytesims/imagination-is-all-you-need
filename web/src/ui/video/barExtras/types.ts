/**
 * One Video page, step 3 (2026-10-25): the extra step a few workflows need, inside the Video page's own bar (ui/video/VideoWorkflowBar.tsx).
 * A workflow's recipe (server/src/shared/videoBar.ts) covers its slots, prompt and plain options; an extra adds what a recipe can't say:
 * Object Swap's "what to replace" (name it, click it on a frame, a mask clip, the person to swap), Re-shoot's angle pad and time ranges.
 * It renders as one more chip with a popover in the same bar, adds its fields to the same form and its words to the same Generate checks.
 */
import type { ReactNode, RefObject } from 'react';
import type { JobState, ToolInfo } from '../../../api';
import type { VideoBar, VBarControl, VBarSlot } from '../../../../../server/src/shared/videoBar';
import type { VideoWorkflow } from '../../../../../server/src/shared/videoWorkflows';

/** One file in a slot: the file, its preview URL and what the browser could read of it (seconds, size). */
export type SlotFile = { file: File; url: string; sec?: number; w?: number; h?: number; /** a photo in a slot that also takes one (altImage) */ photo?: boolean };
type Provider = ToolInfo['providers'][number];

/** What an extra knows when the bar first renders (before the model is picked). */
export interface BarCtx { tool: ToolInfo; wf: VideoWorkflow; bar: VideoBar; vals: Record<string, string>; setVal: (k: string, v: string) => void; toast: (m: string, kind?: any) => void }
/** What an extra knows while the bar renders. */
export interface BarLive extends BarCtx {
  prov: string; setProvider: (id: string) => void; providers: Provider[]; files: Record<string, SlotFile[]>; prompt: string; /** Extend: pre-fill the next segment's words */ setPrompt: (p: string) => void; busy: boolean;
  pop: string; setPop: (p: string) => void; anchorOf: (gid: string) => { readonly current: HTMLButtonElement | null }; chipRef: (gid: string) => (el: HTMLButtonElement | null) => void;
  dock: RefObject<HTMLDivElement>; valOf: (field: string) => string; slotShown: (s: VBarSlot) => boolean;
}
/** A reason Generate can't run yet, opening the extra's own popover (group) or a slot's picker (slot). */
export interface ExtraNeed { missing: string; group?: string; slot?: string; /** the fix is another model */ model?: boolean }
export interface BarExtra {
  /** the models this run can use (Object Swap: the models of the picked swap type) */ providers?: (ps: Provider[]) => Provider[];
  /** the model to start on when the current one isn't in the list */ firstProvider?: (ps: Provider[]) => string | undefined;
  /** the slot's words on this model (Object Swap on a cloud person swap: 'Character', one image) */ slotInfo?: (s: VBarSlot, c: BarLive) => Partial<Pick<VBarSlot, 'label' | 'hint' | 'missing'>> | undefined;
  slotShown?: (s: VBarSlot, c: BarLive) => boolean; slotRequired?: (s: VBarSlot, c: BarLive) => boolean | undefined; slotMax?: (s: VBarSlot, c: BarLive) => number | undefined;
  controlShown?: (c: VBarControl, l: BarLive) => boolean;
  needs?: (c: BarLive) => ExtraNeed[];
  /** fields set on top of the recipe's (wins over them) */ form?: (c: BarLive) => Record<string, string>;
  /** the price on Generate when this run is more than one job (Talking Video: the voice made from the script + the talking video) */ wrapQuote?: (q: any, c: BarLive) => any;
  /** a step before the submit (Talking Video: make the voice from the script first, then send it as the speech); null = stop, nothing sent */ beforeSubmit?: (fd: FormData, c: BarLive) => Promise<FormData | null>;
  /** fields to leave out (the old screen didn't send them in this state) */ omit?: (c: BarLive) => string[];
  files?: (c: BarLive) => [string, File][];
  /** quote fields set on top of the bar's own (null drops one) */ quote?: (c: BarLive) => Record<string, string | null>;
  chips?: (c: BarLive) => ReactNode; pops?: (c: BarLive) => ReactNode; /** the recipe group the extra's chip follows (default: first) */ chipsAfter?: string;
  label?: (c: BarLive) => string | undefined;
  onRecreate?: (form: Record<string, string>) => void;
  /** a Recreate / example is about to fill the bar: drop the files the extra holds (Object Swap's mask, first frame) so the last job's never stay */ onReset?: () => void;
  /** a Recreate or hand-off file for a field that isn't a slot (Object Swap's mask clip); true = taken */ onFiles?: (slot: string, files: File[]) => boolean;
  /** a file landed in a slot (Re-shoot: a photo on a model that needs a clip picks one that takes photos) */ onSlot?: (s: VBarSlot, f: SlotFile, c: BarLive) => void;
  /** the viewer's More items for a clip made here this visit (Re-shoot: re-roll one angle) */ viewerActions?: (j: JobState, close: () => void, c: BarLive, rerun: (fd: FormData) => void, formOf: (id: string) => FormData | undefined) => ReactNode;
}
export type UseBarExtra = (c: BarCtx) => BarExtra;
