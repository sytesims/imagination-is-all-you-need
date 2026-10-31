/**
 * Files dropped on the board (B2, 2026-10-31). Over a generate card each file goes, in order, into the first empty slot of its kind (else
 * one with room left); what doesn't fit says why, in the picker's words, or becomes an Upload node when several files were dropped. On
 * empty board every file becomes an Upload node. Pure (no tldraw), so it's tested in plain Node; Board.tsx does the uploads and shapes.
 */
import { kindOfFile, wrongTypeText, type MediaKind } from '../../../server/src/shared/mediaAccept';
import type { BoardInput } from './cardModel';

export interface DropSlot { name: string; label: string; accept: MediaKind; max: number }
export interface FileDropPlan {
  /** file index → the slot it fills */ fills: { file: number; slot: string; kind: MediaKind }[];
  /** the files that don't go into the card, with the reason (kind null: no slot anywhere takes that file) */ rest: { file: number; kind: MediaKind | null; why: string }[];
}
const ALL: MediaKind[] = ['image', 'video', 'audio'];

export function planFileDrop(files: { name: string; type?: string }[], slots: DropSlot[], filled: Record<string, number> = {}): FileDropPlan {
  const n: Record<string, number> = { ...filled }; const plan: FileDropPlan = { fills: [], rest: [] };
  files.forEach((f, file) => {
    const kind = kindOfFile(f); const takers = kind ? slots.filter(s => s.accept === kind) : []; const free = takers.filter(s => (n[s.name] ?? 0) < s.max);
    const slot = free.find(s => !n[s.name]) ?? free[0];
    if (kind && slot) { n[slot.name] = (n[slot.name] ?? 0) + 1; plan.fills.push({ file, slot: slot.name, kind }); return; }
    const takes = [...new Set(slots.map(s => s.accept))];
    const why = !kind ? wrongTypeText(f.name, ALL) : takers.length ? `${takers[0].label} is full. Remove one to use ${f.name || 'this file'}.`
      : takes.length ? wrongTypeText(f.name, takes) : 'This card takes no files.';
    plan.rest.push({ file, kind, why });
  });
  return plan;
}

/** The still a card or node shows for an uploaded file (a picture is its own still; a clip gets a thumbnail; a sound has none). */
export const mediaPoster = (kind: string, url: string) => (kind === 'image' ? url : kind === 'video' ? `/api/media/thumb?url=${encodeURIComponent(url)}` : '');
let seq = 0;
/** A card input for an uploaded file (unique key even when several land in the same millisecond). */
export const uploadedInput = (kind: MediaKind, url: string, label: string): BoardInput =>
  ({ key: `u:${Date.now().toString(36)}${(seq++).toString(36)}`, kind, url, poster: mediaPoster(kind, url), jobId: '', label });
