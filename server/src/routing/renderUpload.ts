/**
 * Public links for the Render clips (2026-10-26). Kling 3.0 Omni Edit refuses an inline (data URI) video (a real run came back invalid_input) and
 * Seedance takes a video only as a link, so both get a link from the shared media hand-off (mediaHandoff.ts): OPENHIGGSFIELD_PUBLIC_BASE_URL when
 * the server has one, else Comfy's storage upload with the Comfy key (comfy/storage.ts, the official partner-node flow), cached per file hash.
 * Runway Aleph 2 (videoUri: "HTTPS URL, Runway upload URI, or data URI") and Luma Ray 3.2 (source.data: base64) take the clip inline per their schemas.
 */
import { handOff, publicBase } from '../mediaHandoff.js';
export type ClipUploader = (filePath: string, mime: string) => Promise<string>;
const viaHandoff: ClipUploader = (p, mime) => handOff(p, 'video', 'comfy-router', { accepts: ['url'], mime });
let uploader: ClipUploader | null = viaHandoff;
/** Tests set the uploader directly (null = no upload helper). */
export const setClipUploader = (f: ClipUploader | null) => { uploader = f; };
export async function loadClipUploader(): Promise<ClipUploader | null> { return uploader; }
/** True when a clip can become a link: the server's public address, or Comfy's storage upload. */
export const hasClipUpload = () => !!publicBase() || !!uploader;
/** The clip as a link for the model (never a data URI). Throws, before any Router call, when neither way exists. */
export async function clipLink(filePath: string, mime = 'video/mp4', who = 'This model'): Promise<string> {
  if (publicBase()) return handOff(filePath, 'video', 'comfy-router', { accepts: ['url'], mime, who });
  if (!uploader) throw new Error(`${who} needs Comfy’s upload helper to send your mockup as a link, or a public server address (OPENHIGGSFIELD_PUBLIC_BASE_URL)`);
  return uploader === viaHandoff ? handOff(filePath, 'video', 'comfy-router', { accepts: ['url'], mime, who }) : uploader(filePath, mime);
}
