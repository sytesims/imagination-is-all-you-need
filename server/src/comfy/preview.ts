/**
 * Live sampler previews from a local ComfyUI (premium generating tile, TRANSPARENCY-PLAN 4i).
 *
 * ComfyUI's websocket sends binary frames next to its JSON messages (ComfyUI server.py encode_bytes / send_image, protocol.py BinaryEventTypes):
 *   [uint32 BE event type][payload]
 *   event 1 PREVIEW_IMAGE:                 payload = [uint32 BE image type: 1 JPEG, 2 PNG][image bytes]
 *   event 4 PREVIEW_IMAGE_WITH_METADATA:   payload = [uint32 BE metadata length][metadata JSON {node_id, prompt_id, display_node_id, …, image_type: 'image/jpeg'|'image/png'}][image bytes]
 *                                          (only sent to clients that announce the supports_preview_metadata feature flag; we don't, but we parse it anyway)
 *   event 3 TEXT:                          node text output (not a preview; ignored)
 *   event 2 UNENCODED_PREVIEW_IMAGE is internal: the server encodes it and sends it as event 1.
 * ComfyUI only sends previews when the prompt asks for a preview method (extra_data.preview_method) or ComfyUI was started with --preview-method;
 * see docs/LOCAL-MODELS-AND-HARDWARE.md "Live preview" and OPENHIGGSFIELD_COMFY_PREVIEW_METHOD.
 *
 * Store: only the LATEST frame per job, in memory. Frames over MAX_FRAME_BYTES are dropped, at most MAX_JOBS jobs are kept (oldest evicted),
 * at most one frame per MIN_INTERVAL_MS per job (≤ 2 frames/s), and a job's frame is dropped when the job ends (queue.ts settle).
 */
import { env } from '../env.js';

export interface PreviewFrame { mime: 'image/jpeg' | 'image/png'; data: Buffer; at: number; nodeId: string | null; promptId: string | null }
export type ParsedBinary = { kind: 'preview'; mime: 'image/jpeg' | 'image/png'; data: Buffer; nodeId: string | null; promptId: string | null } | { kind: 'other'; event: number } | null;

const JPEG = Buffer.from([0xff, 0xd8, 0xff]); const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
/** Sniff the bytes so a wrong / missing type field never serves an image under the wrong content type. */
const sniff = (b: Buffer): 'image/jpeg' | 'image/png' | null => (b.subarray(0, 3).equals(JPEG) ? 'image/jpeg' : b.subarray(0, 4).equals(PNG) ? 'image/png' : null);

/** Parse one binary websocket message from ComfyUI. Returns null for anything malformed (never throws). */
export function parseComfyBinary(raw: Buffer | ArrayBuffer | Buffer[]): ParsedBinary {
  const buf = Array.isArray(raw) ? Buffer.concat(raw) : Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  if (buf.length < 8) return null;
  const event = buf.readUInt32BE(0);
  if (event === 1) {
    const type = buf.readUInt32BE(4); const data = buf.subarray(8); const mime = sniff(data);
    if (!mime || (type === 1 && mime !== 'image/jpeg') || (type === 2 && mime !== 'image/png')) return null;
    return { kind: 'preview', mime, data, nodeId: null, promptId: null };
  }
  if (event === 4) {
    const len = buf.readUInt32BE(4); if (len > buf.length - 8) return null;
    let meta: any = {}; try { meta = JSON.parse(buf.subarray(8, 8 + len).toString('utf8')); } catch { return null; }
    const data = buf.subarray(8 + len); const mime = sniff(data); if (!mime) return null;
    return { kind: 'preview', mime, data, nodeId: meta?.node_id != null ? String(meta.node_id) : null, promptId: meta?.prompt_id != null ? String(meta.prompt_id) : null };
  }
  return { kind: 'other', event };
}

export const MAX_FRAME_BYTES = Math.max(16_384, Number(env('PREVIEW_MAX_BYTES')) || 200 * 1024);
export const MAX_JOBS = Math.max(1, Number(env('PREVIEW_MAX_JOBS')) || 8);
export const MIN_INTERVAL_MS = Math.max(0, Number(env('PREVIEW_MIN_INTERVAL_MS') ?? 500));
const frames = new Map<string, PreviewFrame>();

/** Keep this frame as the job's latest, unless it is too big or arrives within MIN_INTERVAL_MS of the last kept one. → kept? */
export function putPreview(jobId: string, f: { mime: PreviewFrame['mime']; data: Buffer; nodeId?: string | null; promptId?: string | null }, now = Date.now()): boolean {
  if (!f.data.length || f.data.length > MAX_FRAME_BYTES) return false;
  const prev = frames.get(jobId); if (prev && now - prev.at < MIN_INTERVAL_MS) return false;
  frames.delete(jobId); // re-insert: Map order = oldest first, for eviction
  frames.set(jobId, { mime: f.mime, data: Buffer.from(f.data) /* own copy: the socket buffer may be pooled */, at: now, nodeId: f.nodeId ?? null, promptId: f.promptId ?? null });
  while (frames.size > MAX_JOBS) frames.delete(frames.keys().next().value!);
  return true;
}
export const getPreview = (jobId: string): PreviewFrame | null => frames.get(jobId) ?? null;
export const dropPreview = (jobId: string) => { frames.delete(jobId); };
export const previewStats = () => ({ jobs: frames.size, bytes: [...frames.values()].reduce((a, f) => a + f.data.length, 0), maxJobs: MAX_JOBS, maxFrameBytes: MAX_FRAME_BYTES, minIntervalMs: MIN_INTERVAL_MS });

/** extra_data.preview_method sent with each local prompt (ComfyUI execution.py set_preview_method; per prompt, ComfyUI's own settings are untouched).
 *  OPENHIGGSFIELD_COMFY_PREVIEW_METHOD: auto (default; latent2rgb, no extra files) | taesd (better; needs the TAESD decoders in models/vae_approx)
 *  | latent2rgb | none (no previews) | default (send nothing: ComfyUI's launch setting decides). */
export function previewMethod(): string | null {
  const v = (env('COMFY_PREVIEW_METHOD') ?? 'auto').trim().toLowerCase();
  if (v === 'default' || v === '') return null;
  return ['auto', 'taesd', 'latent2rgb', 'none'].includes(v) ? v : 'auto';
}
