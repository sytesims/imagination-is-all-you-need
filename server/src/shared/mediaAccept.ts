/**
 * The one list of file types each kind of input slot takes (2026-10-29), shared by every upload button, drop zone and the server.
 * Pictures: PNG, JPEG, WebP (a WebP is turned into a PNG on upload, server/src/imageNormalize.ts, so every model and route gets PNG/JPEG).
 * Clips: MP4, MOV, WebM. Sound: MP3, WAV, M4A, AAC, OGG, FLAC (the submit check in index.ts uploadTypeOk takes the same).
 * AVIF / HEIC are not listed: the bundled ffmpeg can't convert them reliably.
 */
export type MediaKind = 'image' | 'video' | 'audio';

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp';
export const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.webm,.m4v';
export const AUDIO_ACCEPT = 'audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,audio/flac,.mp3,.wav,.m4a,.aac,.ogg,.flac';
export const ACCEPT: Record<MediaKind, string> = { image: IMAGE_ACCEPT, video: VIDEO_ACCEPT, audio: AUDIO_ACCEPT };

const EXT: Record<MediaKind, RegExp> = { image: /\.(png|jpe?g|webp)$/i, video: /\.(mp4|mov|webm|m4v)$/i, audio: /\.(mp3|wav|m4a|aac|ogg|flac)$/i };
const MIME: Record<MediaKind, RegExp> = { image: /^image\/(png|jpe?g|webp)$/i, video: /^video\/(mp4|quicktime|webm|x-m4v)$/i, audio: /^audio\/(mpeg|mp3|wav|x-wav|wave|mp4|x-m4a|aac|ogg|flac|x-flac)$/i };

/** Does this file fit a slot of this kind? By type, or by its name when the browser gives no type (some .m4a / .flac). */
export function fileFits(kind: MediaKind, f: { type?: string; name?: string }): boolean {
  const t = String(f.type ?? ''); if (t && MIME[kind].test(t)) return true;
  return (!t || !/^(image|video|audio)\//.test(t)) && EXT[kind].test(String(f.name ?? ''));
}
/** The kind a file is, among the ones a slot takes (null: none of them). */
export function kindOfFile(f: { type?: string; name?: string }, kinds: MediaKind[] = ['image', 'video', 'audio']): MediaKind | null {
  return kinds.find(k => fileFits(k, f)) ?? null;
}
const WORDS: Record<MediaKind, string> = { image: 'PNG, JPG or WebP pictures', video: 'MP4, MOV or WebM clips', audio: 'MP3, WAV, M4A, AAC, OGG or FLAC sound' };
/** The plain message for a refused file: "photo.heic can't be used here. This takes PNG, JPG or WebP pictures." */
export function wrongTypeText(name: string, kinds: MediaKind[]): string {
  return `${name ? `${name} can’t be used here` : 'That file can’t be used here'}. This takes ${kinds.map(k => WORDS[k]).join(', or ')}.`;
}
