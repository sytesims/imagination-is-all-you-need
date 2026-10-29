/**
 * The bean mascot as a profile picture (our own drawing; same head and ears as web/src/ui/Mascot.tsx), as an SVG string so the web app and the
 * server-rendered share page (/s/:token) draw exactly the same picture. A soft tinted surface behind it, the bean centred (ears included) with even
 * padding at every size, a face per mood, a tint.
 */
import { AVATAR_MOODS, AVATAR_TINTS, DEFAULT_AVATAR, type AvatarMood, type AvatarTint, type AvatarChoice } from './avatar.js';

/** hi / mid / lo: the head gradient; rim: the outline; blush: cheeks and inner ears; the disc behind is SURFACE washed with mid. */
export const TINTS: Record<AvatarTint, { name: string; hi: string; mid: string; lo: string; rim: string; blush: string }> = {
  orange: { name: 'Orange', hi: '#FF9A4D', mid: '#FF7A1A', lo: '#F0660A', rim: '#D95E0B', blush: '#FFD0B8' },
  ember: { name: 'Ember', hi: '#FF7F61', mid: '#F2542D', lo: '#D9401C', rim: '#B8330F', blush: '#FFC2B0' },
  peach: { name: 'Peach', hi: '#FFD2B0', mid: '#FFAE7A', lo: '#F2925A', rim: '#D27740', blush: '#FFE6D6' },
  honey: { name: 'Honey', hi: '#FFD978', mid: '#FFB830', lo: '#F09E14', rim: '#C98106', blush: '#FFEAB8' },
  rose: { name: 'Rose', hi: '#FFAEC2', mid: '#F47A9A', lo: '#E05A80', rim: '#BF4468', blush: '#FFD8E2' },
  lilac: { name: 'Lilac', hi: '#D6C4FF', mid: '#A98BF5', lo: '#8F6EE6', rim: '#7254C7', blush: '#ECE2FF' },
  mint: { name: 'Mint', hi: '#A6EBD2', mid: '#5CCFA6', lo: '#3DB88C', rim: '#2A9670', blush: '#D6F6EA' },
};
export const MOOD_NAMES: Record<AvatarMood, string> = { wink: 'Wink', happy: 'Happy', smile: 'Smile', sleepy: 'Sleepy', surprised: 'Surprised', calm: 'Calm', shy: 'Shy' };

const INK = '#2A1A10';
/** The disc: our raised surface (--surface-3) with a light wash of the bean's own colour, so the picture reads as one clean tinted circle. */
const SURFACE = '#27292C'; const BG_WASH = 0.2;
/** The bean's drawn box in its 32-unit art (ears with their stroke at the top, the head's rim at the bottom and sides): x 2.4–29.6, y 0.8–29.6.
 *  FIT scales it so the ear tips sit about 2 units inside the circle; the translate puts the box's centre (16, 15.2) on the disc's centre. */
const FIT = 0.82; const PLACE = `translate(${+(16 - 16 * FIT).toFixed(3)} ${+(16 - 15.2 * FIT).toFixed(3)}) scale(${FIT})`;
const EARS = 'M8.3 6.5 6.8 1.9l5.6 2.6z M23.7 6.5l1.5-4.6-5.6 2.6z';
const HEAD = 'M16 3c7.7 0 13 5.6 13 13.2C29 24 23.4 29 16 29S3 24 3 16.2C3 8.6 8.3 3 16 3z';
const line = (d: string, w = 1.7) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round"/>`;
const eye = (cx: number, cy: number, dx = 0, dy = 0, ry = 2.9) => `<ellipse cx="${cx}" cy="${cy}" rx="2.4" ry="${ry}" fill="${INK}"/><circle cx="${+(cx + 0.9 + dx).toFixed(2)}" cy="${+(cy - 1.2 + dy).toFixed(2)}" r=".85" fill="#fff"/><circle cx="${+(cx - 0.6 + dx).toFixed(2)}" cy="${+(cy + 1.3 + dy).toFixed(2)}" r=".45" fill="#fff"/>`;
const EYES = {
  open: eye(11.6, 15.6) + eye(20.4, 15.6),
  wink: eye(11.6, 15.6) + line('M18.2 16.2q2.2-2.1 4.4 0', 1.8),
  happy: line('M9.4 16.4q2.2-2.4 4.4 0') + line('M18.2 16.4q2.2-2.4 4.4 0'),
  sleepy: line('M9.5 15.6q2.1 1.9 4.2 0') + line('M18.3 15.6q2.1 1.9 4.2 0'),
  up: eye(11.8, 15.2, 0.4, -0.3) + eye(20.6, 15.2, 0.4, -0.3),
  down: eye(11.6, 16.4, -0.3, 0.9, 2.5) + eye(20.4, 16.4, -0.3, 0.9, 2.5),
};
const MOUTHS = {
  smile: line('M14.4 20.4q1.6 1.5 3.2 0', 1.4), small: line('M14.9 20.6q1.1.9 2.2 0', 1.3), flat: line('M14.8 21h2.4', 1.3),
  o: `<ellipse cx="16" cy="21.1" rx=".95" ry="1.1" fill="${INK}"/>`, wobble: line('M14.2 21.2q.9-.8 1.8 0t1.8 0', 1.2),
  grin: `<path d="M13.7 20.1q2.3 2.6 4.6 0z" fill="${INK}" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>`,
};
const FACE: Record<AvatarMood, [keyof typeof EYES, keyof typeof MOUTHS]> = {
  wink: ['wink', 'smile'], happy: ['happy', 'grin'], smile: ['open', 'smile'], sleepy: ['sleepy', 'small'], surprised: ['up', 'o'], calm: ['open', 'flat'], shy: ['down', 'wobble'],
};

/** The head without a face, in the 32-unit art (ears, rim, gradient fill `url(#gradId)`, inner ears, cheeks): the dancing bean (web shared/beanDancer.ts) reuses it. */
export function beanHeadShell(tint: AvatarTint, gradId: string): string {
  const t = TINTS[tint] ?? TINTS.orange;
  return `<g stroke="${t.rim}" stroke-linejoin="round" fill="${t.rim}"><path d="${EARS}" stroke-width="2.2"/><path d="${HEAD}" stroke-width="1.2"/></g>`
    + `<path d="${EARS}" fill="url(#${gradId})" stroke="url(#${gradId})" stroke-width="1" stroke-linejoin="round"/><path d="${HEAD}" fill="url(#${gradId})"/>`
    + `<path d="M8.7 5.3 8 3.1l2.8 1.3z M23.3 5.3 24 3.1l-2.8 1.3z" fill="${t.blush}" opacity=".7"/>`
    + `<ellipse cx="8.4" cy="20" rx="2" ry="1.2" fill="${t.blush}" opacity=".8"/><ellipse cx="23.6" cy="20" rx="2" ry="1.2" fill="${t.blush}" opacity=".8"/>`;
}
/** Just the eyes and mouth for a mood, in the same 32-unit art. */
export const beanFace = (mood: AvatarMood): string => { const [e, m] = FACE[mood] ?? FACE.happy; return EYES[e] + MOUTHS[m]; };

export const avatarChoiceOf = (a: Partial<AvatarChoice> | null | undefined): AvatarChoice => ({
  mood: AVATAR_MOODS.includes(a?.mood as AvatarMood) ? a!.mood as AvatarMood : DEFAULT_AVATAR.mood,
  tint: AVATAR_TINTS.includes(a?.tint as AvatarTint) ? a!.tint as AvatarTint : DEFAULT_AVATAR.tint,
});
const escAttr = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** The bean picture as an SVG string. `uid` keeps gradient ids unique when several are on one page. No `label`: decorative (aria-hidden). */
export function beanSvg(o: { mood?: AvatarMood; tint?: AvatarTint; size?: number | string; uid: string; label?: string; disc?: boolean }): string {
  const { mood, tint } = avatarChoiceOf(o); const t = TINTS[tint]; const [e, m] = FACE[mood]; const g = `bean-${o.uid.replace(/[^\w-]/g, '')}`; const s = o.size ?? '100%';
  const shy = mood === 'shy';
  const a11y = o.label ? `role="img" aria-label="${escAttr(o.label)}"` : 'aria-hidden="true"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${s}" height="${s}" ${a11y} data-mood="${mood}" data-tint="${tint}">`
    + `<defs><radialGradient id="${g}" gradientUnits="userSpaceOnUse" cx="12" cy="9" r="22"><stop offset="0" stop-color="${t.hi}"/><stop offset=".5" stop-color="${t.mid}"/><stop offset="1" stop-color="${t.lo}"/></radialGradient></defs>`
    + (o.disc === false ? '' : `<circle cx="16" cy="16" r="16" fill="${SURFACE}"/><circle cx="16" cy="16" r="16" fill="${t.mid}" opacity="${BG_WASH}"/>`)
    + `<g transform="${PLACE}">`
    + `<g stroke="${t.rim}" stroke-linejoin="round" fill="${t.rim}"><path d="${EARS}" stroke-width="2.2"/><path d="${HEAD}" stroke-width="1.2"/></g>`
    + `<path d="${EARS}" fill="url(#${g})" stroke="url(#${g})" stroke-width="1" stroke-linejoin="round"/><path d="${HEAD}" fill="url(#${g})"/>`
    + `<path d="M8.7 5.3 8 3.1l2.8 1.3z M23.3 5.3 24 3.1l-2.8 1.3z" fill="${t.blush}" opacity=".7"/>`
    + `<ellipse cx="8.4" cy="20" rx="${shy ? 2.6 : 2}" ry="${shy ? 1.5 : 1.2}" fill="${t.blush}" opacity="${shy ? 1 : 0.8}"/><ellipse cx="23.6" cy="20" rx="${shy ? 2.6 : 2}" ry="${shy ? 1.5 : 1.2}" fill="${t.blush}" opacity="${shy ? 1 : 0.8}"/>`
    + EYES[e] + MOUTHS[m] + `</g></svg>`;
}
