/**
 * How a board card reads, as plain functions (no React, no tldraw), so the card, the board and the tests share one set of words:
 *  - placeWord: where a quoted or finished run goes ("Your computer", "Comfy Cloud", "fal"); null for a sample run (its price says Sample).
 *  - FAR_ZOOM: under this zoom the board draws cards without drop shadows or looping animations (CameraMotion.tsx); same card otherwise.
 *  - OVERVIEW_ZOOM: under this zoom a card shows only its title (large), its media and one status line (node.css, data-far).
 *  - TINY_ZOOM: under this zoom cards and what is in them draw square corners (rounded ones are 4 px or less by then and cost half the frame rate on a full board).
 *  - cardLabel: a card's short label (the shot name, else the workflow).
 *  - emptyLine: what a draft's picture box says before the first run.
 *  - cleanName: a typed card name as it is kept (meta.name).
 *  - linkedFrom: where a card's prompt comes from when Prompt / Note cards feed it ("From a prompt", "From a note").
 *  - panelSlide: how far the board slides so a card clears the card panel.
 */
import { placeOfQuote } from '../shared/billing';

export const FAR_ZOOM = 0.4;
export const TINY_ZOOM = 0.2;
export const OVERVIEW_ZOOM = 0.6;
const PLACES: Record<string, string> = { local: 'Your computer', 'comfy-cloud': 'Comfy Cloud', 'comfy-router': 'Comfy Cloud', comfy: 'Comfy Cloud', fal: 'fal', replicate: 'Replicate' };

/** Where the run goes, in the board's words. */
export function placeWord(q: any): string | null {
  if (!q || typeof q !== 'object' || q.demo === true) return null;
  const id = placeOfQuote(q); if (!id) return null;
  if (PLACES[id]) return PLACES[id];
  const name = q.cost && typeof q.cost === 'object' ? String(q.cost.billedToName ?? '') : '';
  return name || null;
}

/** The label of a card when the board is zoomed out. */
export const cardLabel = (shot: string, workflow: string) => (shot.trim() || workflow.trim() || 'Card');

/** A draft's empty picture box, by medium. */
export function emptyLine(medium: string): string {
  return medium === 'video' ? 'Your clip shows up here' : medium === 'audio' ? 'Your sound shows up here' : medium === '3d' ? 'Your model shows up here' : 'Your picture shows up here';
}

/** The most a card's name keeps (the board and the panel cut it with an ellipsis long before). */
export const NAME_MAX = 80;
/** A typed card name as it's kept in meta.name: one line, single spaces, at most NAME_MAX characters ('' clears it). */
export const cleanName = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();

/** Where a card's prompt comes from when other cards feed it: "From a prompt", "From a note", or both (B15). */
export function linkedFrom(types: string[]): string {
  const p = types.includes('ohf-prompt'), n = types.includes('ohf-note');
  return p && n ? 'From a prompt and a note' : n ? 'From a note' : 'From a prompt';
}

/** How far (screen px, to the left) the board slides so a card clears the card panel: its right edge 24 px inside the board's visible
 *  width, never pushing its left edge past 80 px. 0 when it already fits (B19: also after a resize, not only a new selection). */
export function panelSlide(left: number, right: number, boardW: number): number {
  const over = right + 24 - boardW; return over > 0 ? Math.min(over, Math.max(0, left - 80)) : 0;
}
