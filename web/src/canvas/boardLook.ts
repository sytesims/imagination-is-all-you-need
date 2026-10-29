/**
 * The board's background look (2026-10-27): a per-viewer choice kept in this browser. Three looks, all endless as you pan and zoom,
 * all static under reduced motion (BoardBackground.tsx draws them):
 *  - space: a slow parallax star and dust field with a soft orange glow at the edges;
 *  - haze:  soft drifting colour clouds over a faint dot grid;
 *  - night: a calm dot grid with a gentle vignette (the default: the cleanest board and best contrast, user 2026-10-27).
 */
import { atom } from 'tldraw';

export type BoardLook = 'space' | 'haze' | 'night';
export const BOARD_LOOKS: { id: BoardLook; label: string; hint: string }[] = [
  { id: 'night', label: 'Night', hint: 'A calm dot grid' },
  { id: 'space', label: 'Space', hint: 'Stars and a warm glow' },
  { id: 'haze', label: 'Haze', hint: 'Soft drifting colour' },
];
const KEY = 'ohf-canvas-look';
const read = (): BoardLook => { try { const v = localStorage.getItem(KEY); return v === 'haze' || v === 'night' || v === 'space' ? v : 'night'; } catch { return 'night'; } };
export const boardLookAtom = atom<BoardLook>('ohf-board-look', read());
export function setBoardLook(v: BoardLook) { boardLookAtom.set(v); try { localStorage.setItem(KEY, v); } catch { /* private window */ } }
