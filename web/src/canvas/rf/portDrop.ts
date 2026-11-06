/**
 * Dropping a file, an Assets item or a link onto a card's input port (Canvas release 1, design plan §4.6). Pure, so the server tests check it.
 *  - While something is dragged, the ports that can take it glow (dropKindAtom); the others stay quiet.
 *  - The wrong kind: the port shakes and says what it takes ("This port takes a picture").
 *  - An empty port: the file goes in. A filled one: a small menu, Replace and rerun (↵), Replace only (⇧), Add as a new card (⌥).
 *    "Rerun" makes a proposal (prices first) for this card and the cards after it: it never runs straight away.
 *  - A pasted or dropped link becomes a Link card, unless it points straight at a picture, clip or sound.
 */
import { atom } from '../boardApi';
import { PORT_WORDS, type PortKind } from '../nodeLogic';

export type MediaKind = 'image' | 'video' | 'audio';
export type DropChoice = 'rerun' | 'replace' | 'new';
/** What is being dragged over the board right now (its kinds), so the ports that take it glow. */
export const dropKindAtom = atom<{ kinds: MediaKind[] } | null>('ohf-drop-kind', null);

/** A file's kind from its MIME type or name. */
export function kindOfType(type: string | null | undefined, name = ''): MediaKind | null {
  const t = String(type ?? '').toLowerCase();
  if (t.startsWith('image/')) return 'image'; if (t.startsWith('video/')) return 'video'; if (t.startsWith('audio/')) return 'audio';
  return kindOfUrl(name);
}
const EXT: Record<string, MediaKind> = { png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', avif: 'image', mp4: 'video', webm: 'video', mov: 'video', m4v: 'video', mp3: 'audio', wav: 'audio', m4a: 'audio', ogg: 'audio', aac: 'audio', flac: 'audio' };
/** A link that points straight at a picture, clip or sound (by its file extension): its kind; else null. */
export function kindOfUrl(u: string): MediaKind | null { const m = /\.([a-z0-9]{2,5})(?:$|[?#])/i.exec(String(u ?? '').trim()); return m ? EXT[m[1].toLowerCase()] ?? null : null; }
/** One web address and nothing else (what a paste of a link looks like). */
export function asUrl(text: string | null | undefined): string | null {
  const t = String(text ?? '').trim(); if (!/^https?:\/\/\S+$/i.test(t) || t.length > 2000) return null;
  try { return new URL(t).href; } catch { return null; }
}
/** A pasted or dropped link: a media file to bring in, or a page to show as a Link card. */
export const urlPlan = (u: string): { as: 'media'; kind: MediaKind } | { as: 'link' } => { const k = kindOfUrl(u); return k ? { as: 'media', kind: k } : { as: 'link' }; };

/** The words a port says when it can't take what was dropped. */
export const wrongKindText = (port: PortKind) => (port === 'text' ? 'This port takes text' : `This port takes ${PORT_WORDS[port]}`);
/** What a drop on a port does: refuse (wrong kind), fill it (empty), or ask (filled: the small menu). */
export function portDropPlan(port: { kind: PortKind; filled: boolean }, kind: MediaKind | null): { do: 'refuse'; why: string } | { do: 'fill' } | { do: 'ask' } {
  if (!kind || port.kind !== kind) return { do: 'refuse', why: wrongKindText(port.kind) };
  return port.filled ? { do: 'ask' } : { do: 'fill' };
}
/** The menu's keys: ↵ Replace and rerun, ⇧ Replace only, ⌥ Add as a new card (Esc: nothing). */
export function choiceForKey(e: { key: string }): DropChoice | 'cancel' | null {
  if (e.key === 'Enter') return 'rerun'; if (e.key === 'Shift') return 'replace'; if (e.key === 'Alt') return 'new'; if (e.key === 'Escape') return 'cancel'; return null;
}
/** The cards a "Replace and rerun" proposes: this card, then every generate card after it (graph order is the server's). */
export function rerunIds(cardId: string, after: Iterable<string>, isGen: (id: string) => boolean): string[] { return [cardId, ...[...after].filter((id) => id !== cardId && isGen(id))]; }
