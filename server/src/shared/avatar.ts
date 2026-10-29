/** Profile picture and cover choices (shared by the server's validation and the web picker). The bean mascot is the default picture. */
export const AVATAR_MOODS = ['wink', 'happy', 'smile', 'sleepy', 'surprised', 'calm', 'shy'] as const;
export type AvatarMood = typeof AVATAR_MOODS[number];
/** Colour tints for the bean. Orange is the brand default; the rest stay warm or soft so the bean still reads as ours. */
export const AVATAR_TINTS = ['orange', 'ember', 'peach', 'honey', 'rose', 'lilac', 'mint'] as const;
export type AvatarTint = typeof AVATAR_TINTS[number];
/** Banner strips: brand gradients, or one of your own images (cover.kind = 'image'). */
export const COVER_GRADIENTS = ['sunrise', 'ember', 'dusk', 'night'] as const;
export type CoverGradient = typeof COVER_GRADIENTS[number];

export interface AvatarChoice { mood: AvatarMood; tint: AvatarTint }
export type Cover = { kind: 'gradient'; id: CoverGradient } | { kind: 'image'; url: string };
export interface ProfileData {
  displayName: string | null;
  /** local @name: letters, digits, dot, dash and underscore, 2–30 characters */
  handle: string | null;
  /** a photo (uploaded /files/avatar-… or an older saved URL); when set it wins over the bean */
  avatarUrl: string | null;
  avatar: AvatarChoice | null;
  cover: Cover | null;
  /** first time the profile was read (member since) */
  createdAt: number | null;
}
export const DEFAULT_AVATAR: AvatarChoice = { mood: 'wink', tint: 'orange' };
export const HANDLE_RE = /^[a-z0-9][a-z0-9._-]{1,29}$/i;
export const NAME_MAX = 60;
/** Uploaded pictures are cropped to a circle and scaled in the browser first, so a real one is a few tens of KB. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_PX = 256;
