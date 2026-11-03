/**
 * Pictures on a canvas board (2026-11-03): one source of truth for what a dropped or attached picture is called and how your agent
 * reads it. Shared by the board drop (web Board.tsx), the dock's picture attachments (web AgentPanel.tsx), the live board summary
 * (web agentBridge.ts), the saved board summary and the dock message (server canvasAgent.ts) (the channel push reads its labels).
 * Pure, no imports beyond mediaAccept, so the server tests read it in plain Node.
 */
import { kindOfFile, wrongTypeText, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from './mediaAccept.js';

/** The most pictures one dock message carries. */
export const MAX_DOCK_PICTURES = 6;

/** A file's name as a card name: no folder, no extension, tidy spaces ("chair.final.png" → "chair.final"). */
export function pictureName(fileName: string | null | undefined, fallback = 'Picture'): string {
  const base = String(fileName ?? '').split(/[\\/]/).pop() ?? '';
  const stem = base.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_\s]+/g, ' ').trim();
  return stem.slice(0, 60) || fallback;
}

/** The name an Upload node shows and your agent reads: the name you gave it, else its file's name (older boards kept the extension). */
export function uploadNodeName(shape: { meta?: any; props?: any }): string | null {
  const own = shape?.meta?.name; if (typeof own === 'string' && own.trim()) return own.trim();
  const label = shape?.props?.label; return typeof label === 'string' && label.trim() ? pictureName(label) : null;
}

/** An Upload node in a board summary (canvas_read_board): its name, kind and file. null when it has no file yet. */
export function uploadNodeSummary(shape: { id: string; meta?: any; props?: any }) {
  const p = shape?.props ?? {}; if (!p.url) return null; const name = uploadNodeName(shape);
  const kind = p.mediaKind ?? null;
  return { id: shape.id, type: 'upload' as const, kind: kind as string | null, name, title: name ?? (kind === 'image' ? 'Picture' : 'Upload'), results: [{ url: p.url, kind, poster: p.poster || null }] };
}

/** Which of these files the dock can take (pictures only, within the size limit, up to the free places left), and why the others can't. */
export function planDockPictures(files: { name: string; type?: string; size?: number }[], already = 0): { take: number[]; refused: { file: number; why: string }[] } {
  const take: number[] = []; const refused: { file: number; why: string }[] = []; let room = Math.max(0, MAX_DOCK_PICTURES - already);
  files.forEach((f, file) => {
    if (kindOfFile(f, ['image']) !== 'image') refused.push({ file, why: wrongTypeText(f.name, ['image']) });
    else if ((f.size ?? 0) > MAX_UPLOAD_BYTES) refused.push({ file, why: `${f.name || 'That picture'} is too big. Pictures can be up to ${MAX_UPLOAD_MB} MB.` });
    else if (room <= 0) refused.push({ file, why: `Up to ${MAX_DOCK_PICTURES} pictures per message.` });
    else { take.push(file); room--; }
  });
  return { take, refused };
}

export interface DockPicture { card_id: string; name: string; url: string }
/** How a message names its pictures for your agent, in order: "image 1: chair (card shape:abc)". */
export const pictureLines = (pics: DockPicture[] | null | undefined): string[] =>
  (pics ?? []).map((p, i) => `image ${i + 1}: ${p.name} (card ${p.card_id})`);
