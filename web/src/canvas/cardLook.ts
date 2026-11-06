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
import { placeOf as sharedPlaceOf } from '../../../server/src/shared/modelIds';

export const FAR_ZOOM = 0.4;
export const TINY_ZOOM = 0.2;
export const OVERVIEW_ZOOM = 0.6;
/** Where the run goes, in the app's one set of place words (server/src/shared/modelIds.ts placeOf; the server's own place first): "Your computer",
 *  "Comfy Cloud", "Your Comfy deployment", "fal"… A lab's own API reads its billing name ("OpenAI"). */
export function placeWord(q: any): string | null {
  if (!q || typeof q !== 'object' || q.demo === true) return null;
  const id = placeOfQuote(q); if (!id) return null;
  const own = q.place && typeof q.place === 'object' ? String(q.place.label ?? '') : ''; if (own) return own;
  const name = q.cost && typeof q.cost === 'object' ? String(q.cost.billedToName ?? '') : '';
  if (id === 'direct' && name) return name;
  const rid = String(q.routeId ?? q.route ?? '');
  return sharedPlaceOf({ kind: q.routeKind ?? null, routeId: rid || null, runOn: id, comfyVariant: q.comfyVariant ?? null })?.label || name || null;
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

/* ------------------------------------------------------------------ auto titles (2026-11-06, Canvas release 1: never "Untitled") */
/** Words that carry no subject ("a", "make", "image of"…): skipped when a prompt becomes a title. */
const STOP = new Set(('a an the of in on at to for from with without by into onto over under near and or but as is are be it its this that these those '
  + 'my your our their his her she he they we i me you them us some very really just please make create generate show render draw give get turn add put '
  + 'image picture photo photograph shot clip video sound song music track of style').split(' '));
/** One title word: letters and digits only (keeps an inner hyphen or apostrophe). */
const word = (w: string) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
const cap = (s: string) => (s ? s[0].toLocaleUpperCase() + s.slice(1) : s);
/** True when the text is written without spaces between words (Chinese, Japanese, Thai…): titles take its first characters instead. */
const unspaced = (s: string) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u.test(s);

/** A prompt as a short title: its first 3–4 content words ("A woman in a red coat" → "Woman red coat"); text written without
 *  spaces keeps its first 24 characters. '' when there's nothing to say. */
export function promptTitle(prompt: string): string {
  const t = prompt.replace(/\s+/g, ' ').trim(); if (!t) return '';
  if (unspaced(t)) { const c = [...t.replace(/[\s"“”'‘’.,;:!?。、，！？]+/g, ' ').trim()]; return c.length > 24 ? `${c.slice(0, 24).join('').trim()}…` : c.join(''); }
  const ws = t.split(' ').map(word).filter(Boolean); const content = ws.filter((w) => !STOP.has(w.toLowerCase()));
  const pick = (content.length ? content : ws).slice(0, 4);
  /* three words; a fourth only while the title stays short */
  const out = pick.join(' ').length > 18 ? pick.slice(0, 3) : pick;
  return cap(out.join(' ')); /* later words keep their case ("Tokyo", "DJ") */
}

/** What a card's title is made from (plain data, so the board, the panel and the tests share one rule). */
export interface TitleFacts {
  /** the name you gave it (meta.name): always wins */ name?: string | null;
  kind: 'gen' | 'result' | 'upload' | 'other';
  /** gen: its workflow id and shown name */ flow?: string; flowName?: string;
  prompt?: string;
  /** gen: what's wired in, by slot (`many`: the several-file slot, e.g. Material Swap's swatches) */ inputs?: { label: string; many?: boolean }[];
  /** upload: the file's name; result: the title it was placed with */ fileName?: string; title?: string;
}
/** A card's title, never "Untitled": your name; else Material Swap → "<swatch> <object>" ("Velvet armchair"); an upload → its file name
 *  without the extension; anything with a prompt → its first content words; else the workflow's name. */
export function autoTitle(f: TitleFacts): string {
  const own = cleanName(f.name ?? ''); if (own) return own;
  if (f.kind === 'upload') return stem(f.fileName ?? '') || 'Upload';
  if (f.kind === 'result') return cleanName(f.title ?? '') || promptTitle(f.prompt ?? '') || 'Result';
  if (f.kind === 'gen') {
    if (f.flow === 'material-swap' && f.inputs?.length) {
      const sw = f.inputs.filter((i) => i.many).map((i) => stem(i.label)).filter(Boolean); const obj = stem(f.inputs.find((i) => !i.many)?.label ?? '');
      const swatch = sw.length > 1 ? `${sw.length} materials` : sw[0] ?? '';
      if (swatch && obj) return cap(`${swatch} ${obj.toLocaleLowerCase()}`); if (obj) return cap(obj);
    }
    return promptTitle(f.prompt ?? '') || (f.flowName ?? '').trim() || 'Generate';
  }
  return promptTitle(f.prompt ?? '') || 'Card';
}
/** A file or card label without its folder or extension, tidy spaces ("velvet_swatch.jpg" → "velvet swatch"). */
const stem = (s: string) => cleanName((s.split(/[\\/]/).pop() ?? '').replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_]+/g, ' '));
