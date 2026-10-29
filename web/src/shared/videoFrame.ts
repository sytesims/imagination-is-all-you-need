/**
 * A frame of a video as an image (2026-10-26): POST /api/media/frame (server videoFrame.ts) grabs the exact frame (first, last or a time) at full
 * size as a PNG with no metadata and lists it in the library. Used by the result viewer ("Save frame as image") and the media picker
 * ("Pick a frame" in every image slot). The hand-off into Video → Generate goes through the prefill instead (workflowLinks.frameHandoffHref).
 */
export type FrameAt = 'first' | 'last' | number;
export interface SavedFrame { item: { id: string; url: string; name: string; type: 'image'; width: number | null; height: number | null; frameOf?: any }; frame: { at: string; index: number | null; frames: number | null; t: number | null } }
/** The source: a result's output ({jobId, out}) or a library video ({url}). */
export async function saveVideoFrame(src: { jobId?: string | null; out?: number; url?: string; at: FrameAt }): Promise<SavedFrame> {
  const body: Record<string, unknown> = { at: typeof src.at === 'number' ? Math.round(src.at * 1000) / 1000 : src.at };
  if (src.jobId) { body.jobId = src.jobId; body.out = src.out ?? 0; } else body.url = src.url;
  const r = await fetch('/api/media/frame', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error ?? `HTTP ${r.status}`);
  return d as SavedFrame;
}
