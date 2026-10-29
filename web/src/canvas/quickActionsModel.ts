/** The quick actions' list and what one does (QuickActions.tsx draws the bar). Each only makes a NEW draft card wired to the result. */
import type { Editor, TLShapeId } from 'tldraw';
import { UpscaleIcon, CutoutIcon, LayerSheetsIcon, LightIcon, VideoIcon, CubeIcon, SoundIcon, ImageIcon, MicIcon, MusicIcon, type IconProps } from '../ui/Icons';
import type { VecLike } from 'tldraw';
import type { PortKind } from './nodeLogic';
import { createCard, reveal } from './agentApi';
import { GEN_TYPE, CARD_W, CARD_H } from './cardModel';
import { freeSpot } from './placement';
import { OPEN_GROUP_EVT } from './canvasEvents';
import { ExtendIcon } from './icons';

export type Act = { id: string; label: string; flow: string; icon: (p: IconProps) => JSX.Element; group?: string };
export const QUICK_ACTIONS: Record<'image' | 'video', Act[]> = {
  image: [{ id: 'upscale', label: 'Upscale', flow: 'upscale', icon: UpscaleIcon }, { id: 'remove-bg', label: 'Remove background', flow: 'remove-bg', icon: CutoutIcon },
    { id: 'layers', label: 'Image to layers', flow: 'image-layers', icon: LayerSheetsIcon }, { id: 'relight', label: 'Relight', flow: 'relight', icon: LightIcon, group: 'light' },
    { id: 'to-video', label: 'To video', flow: 'video', icon: VideoIcon }, { id: 'to-3d', label: 'To 3D', flow: 'image-to-3d', icon: CubeIcon }],
  video: [{ id: 'extend', label: 'Extend', flow: 'extend', icon: ExtendIcon as any }, { id: 'video-upscale', label: 'Upscale', flow: 'video-upscale', icon: UpscaleIcon },
    /* Add sound (shared/addSoundLogic.ts): MMAudio, free on your ComfyUI */ { id: 'add-sound', label: 'Add sound', flow: 'add-sound', icon: SoundIcon }],
};

/** The draft card for an action: right of the source, an arrow from the source into it, selected. Never submits. */
export function quickCard(editor: Editor, sourceId: TLShapeId, a: Act): TLShapeId | null {
  const b = editor.getShapePageBounds(sourceId); if (!b) return null;
  const taken = editor.getCurrentPageShapes().filter(s => s.type === GEN_TYPE && (s.props as any).parents?.includes(sourceId)).length; /* a second action from the same result goes below the first */
  editor.markHistoryStoppingPoint('quick action');
  const id = createCard(editor, { flow: a.flow, from: [sourceId], parents: [sourceId], at: { x: b.maxX + 110 + 160, y: b.minY + 130 + taken * 300 } });
  reveal(editor, id);
  if (a.group) setTimeout(() => dispatchEvent(new CustomEvent(OPEN_GROUP_EVT, { detail: { g: a.group, cardId: id } })), 220);
  return id;
}

/** "What next?" after a drag from an output onto empty board (2026-10-27): the sensible workflows for that medium, shortest list first. The
 *  picture list is the same set the hover bar offers (QUICK_ACTIONS), with the clip first, so the two never disagree. */
export const NEXT_STEPS: Record<PortKind, Act[]> = {
  image: [{ id: 'animate', label: 'Animate', flow: 'video', icon: VideoIcon }, ...QUICK_ACTIONS.image.filter((a) => a.id !== 'to-video')],
  video: [QUICK_ACTIONS.video[2], QUICK_ACTIONS.video[0], QUICK_ACTIONS.video[1]],
  audio: [{ id: 'lip-sync', label: 'Make a portrait talk', flow: 'lip-sync', icon: MicIcon }],
  text: [{ id: 'image', label: 'Picture', flow: 'create', icon: ImageIcon }, { id: 'clip', label: 'Clip', flow: 'video', icon: VideoIcon },
    { id: 'music', label: 'Music', flow: 'music', icon: MusicIcon }, { id: 'voice', label: 'Read it aloud', flow: 'voice', icon: MicIcon }],
};
/** A next step dropped at a point: a draft card centred there, wired from the source, selected. Never submits. */
export function nextStepCard(editor: Editor, sourceId: TLShapeId, a: Act, at: VecLike): TLShapeId {
  editor.markHistoryStoppingPoint('next step');
  const id = createCard(editor, { flow: a.flow, from: [sourceId], parents: [sourceId], at: freeSpot(editor, CARD_W, CARD_H, { x: at.x + CARD_W / 2, y: at.y }) }); /* at the drop point, nudged off any card */
  if (a.group) setTimeout(() => dispatchEvent(new CustomEvent(OPEN_GROUP_EVT, { detail: { g: a.group, cardId: id } })), 220);
  return id;
}
