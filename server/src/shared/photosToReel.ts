/** One ordered photo recipe, shared by submit, quote and the Video composer. */
export const REEL_KINDS = ['listing', 'event', 'hotel', 'trip', 'product'] as const;
export type ReelKind = typeof REEL_KINDS[number];
export interface ReelOptions { title: string; endLine: string; kind: ReelKind; seconds: 15 | 30; motion: 'all' | 'heroes'; music: 'on' | 'off' }
export const REEL_MOODS: Record<ReelKind, string> = {
  listing: 'Warm, calm instrumental music, gentle piano and light percussion, no vocals',
  event: 'Celebratory instrumental music, bright and lively, no vocals',
  hotel: 'Relaxed elegant instrumental music, soft piano and warm textures, no vocals',
  trip: 'Uplifting travel instrumental music, acoustic rhythm, no vocals',
  product: 'Clean confident instrumental music, light modern beat, no vocals',
};
export function parseReelOptions(v: Record<string, unknown>, count: number, quote = false): ReelOptions | { error: string; field: string } {
  if (!Number.isInteger(count) || count < 8 || count > 15) return { error: 'Add 8–15 photos, in the order you want them shown.', field: 'photos' };
  const title = String(v.title ?? '').trim(), endLine = String(v.endLine ?? '').trim();
  if ((!quote && !title) || title.length > 120) return { error: 'Add a title of up to 120 characters.', field: 'title' };
  if (endLine.length > 120) return { error: 'Keep the end line to 120 characters.', field: 'endLine' };
  const kind = String(v.kind ?? 'listing') as ReelKind;
  if (!REEL_KINDS.includes(kind)) return { error: 'Choose Listing, Event, Hotel, Trip or Product.', field: 'kind' };
  const seconds = Number(v.seconds ?? 30);
  if (seconds !== 15 && seconds !== 30) return { error: 'Choose 15 or 30 seconds.', field: 'seconds' };
  const motion = String(v.motion ?? 'heroes'), music = String(v.music ?? 'on');
  if (motion !== 'all' && motion !== 'heroes') return { error: 'Choose motion on all photos or hero photos.', field: 'motion' };
  if (music !== 'on' && music !== 'off') return { error: 'Choose music on or off.', field: 'music' };
  return { title, endLine, kind, seconds, motion, music };
}
export function heroIndices(count: number): number[] {
  const n = count <= 10 ? 3 : 4;
  return Array.from({ length: n }, (_, i) => Math.round(i * (count - 1) / (n - 1)));
}
export function reelPlan(count: number, o: ReelOptions) {
  const heroes = o.motion === 'all' ? Array.from({ length: count }, (_, i) => i) : heroIndices(count);
  return { heroes, cameraCount: heroes.length, photoSeconds: o.seconds / count, cameraSeconds: 5, aspect: '9:16' as const };
}
