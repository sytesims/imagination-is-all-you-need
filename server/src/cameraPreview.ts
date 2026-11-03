/**
 * Camera Moves: the short muted loop that previews a move (scripts/gen-example-media.py → server/samples/camera/<clip>.{mp4,webm,gif}).
 * A move uses its own clip; a few moves share the clip of the very same move under another name (Track left = the LTX "dolly left" clip,
 * Jib up = "jib up"). Moves with no clip get none: the picker then draws the move as an icon card (web/src/shared/PresetTile.tsx), never a stock photo.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CAMERA_PREVIEW_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../samples/camera');
/** Same move, other name: the preset id → the clip it reuses. */
export const SAME_MOVE_CLIP: Record<string, string> = { 'track-left': 'ltx-dolly-left', 'track-right': 'ltx-dolly-right', 'jib-up': 'ltx-jib-up', 'jib-down': 'ltx-jib-down' };

export function movePreview(toolId: string, presetId: string): { previewUrl: string; previewWebm: string; previewGif: string } | null {
  if (toolId !== 'camera') return null;
  const clip = existsSync(path.join(CAMERA_PREVIEW_DIR, `${presetId}.mp4`)) ? presetId : SAME_MOVE_CLIP[presetId];
  if (!clip || !existsSync(path.join(CAMERA_PREVIEW_DIR, `${clip}.mp4`))) return null;
  return { previewUrl: `/samples/camera/${clip}.mp4`, previewWebm: `/samples/camera/${clip}.webm`, previewGif: `/samples/camera/${clip}.gif` };
}
