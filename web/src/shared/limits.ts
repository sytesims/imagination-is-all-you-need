/** Mirrors server/src/media.ts LIMITS. */
export const LIMITS = { minSec: 4, maxSec: 30, minPixels: 409_600, maxRefs: 30, refsPerCall: 8, maxPrompt: 10_000, maxBytes: 200 * 1024 * 1024 };
export const RESOLUTIONS = ['480p', '720p', '1080p'];
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
