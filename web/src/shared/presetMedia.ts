/**
 * What a preset tile shows (shared/PresetTile.tsx), from a preset as GET /api/presets, /api/tools or /api/video-presets list it.
 * One rule for every preset grid (the Presets picker on Video, the Camera Moves and Photo FX galleries):
 *  - its own preview clip, with its own poster when that poster is real art;
 *  - else its own still (a placeholder poster, posterPlaceholder: true, never counts);
 *  - a camera move with neither gets `motion`, and the tile draws the move as an icon card (never a shared stock photo).
 * Pure data (no React), so server/test/preset-media.test.ts checks every camera preset against it.
 */
export interface PresetMedia {
  video: { mp4?: string | null; webm?: string | null; poster?: string | null } | null;
  image: string | null;
  motion: { id: string; category?: string | null } | null;
}

export interface PresetLike {
  id: string; category?: string | null; toolId?: string | null;
  previewUrl?: string | null; previewWebm?: string | null; posterUrl?: string | null; posterPlaceholder?: boolean; swatchUrl?: string | null;
}

/** `camera`: the preset is a camera move (Camera Moves, the Presets picker's Camera tab), so it always carries its move for the glyph and the icon card. */
export function presetMedia(p: PresetLike, { camera = p.toolId === 'camera' }: { camera?: boolean } = {}): PresetMedia {
  const still = (p.posterPlaceholder ? null : p.posterUrl) || p.swatchUrl || null;
  const video = p.previewUrl || p.previewWebm ? { mp4: p.previewUrl ?? null, webm: p.previewWebm ?? null, poster: still } : null;
  return { video, image: still, motion: camera ? { id: p.id, category: p.category ?? null } : null };
}
