/** GPT Images alone use transparent = edit; the app's canonical mask is white = edit.
 * Keep history/uploads untouched. Nonopaque PNGs already use the OpenAI alpha contract and retain it.
 * Sources: https://developers.openai.com/api/docs/guides/image-generation#edit-images
 * and web/src/ui/next/MaskSheet.tsx (opaque grayscale export, proportionally capped at 64 MP).
 */
import { spawn } from 'node:child_process';
import { imageDimsOf } from './imageDims.js';
import { videoSize } from './ffmpeg.js';
import { handOffBytes, HANDOFF_POLICY } from './mediaHandoff.js';

type Provider = 'comfy-router' | 'openai';
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_PIXELS = 64e6; // Same preparation budget as MaskSheet's export; never allocate unbounded decoded media.
const invalid = (message: string) => new Error(`GPT Image mask: ${message}`);

/** In-memory ffmpeg only: no derived file, upload, cache or overwrite of the canonical mask. */
function ffmpeg(input: Buffer, args: string[], maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const c = spawn('ffmpeg', ['-v', 'error', '-xerror', ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks: Buffer[] = []; let length = 0; let failed = false;
    const fail = () => { if (!failed) { failed = true; c.kill(); reject(invalid('could not decode or prepare this image. Add a readable PNG mask and source photo.')); } };
    const timer = setTimeout(fail, 30_000);
    c.on('error', fail); c.stdin.on('error', fail); c.stderr.resume();
    c.stdout.on('data', (b: Buffer) => { length += b.length; if (length > maxBytes) fail(); else chunks.push(b); });
    c.on('close', (code) => { clearTimeout(timer); if (code !== 0) fail(); else if (!failed) resolve(Buffer.concat(chunks)); });
    c.stdin.end(input);
  });
}

/** Validate actual source/mask bytes before a provider/estimate call and return the provider-specific PNG.
 * Proportional mask resampling is allowed (UI export/preparation may round each edge by one pixel);
 * changing aspect/cropping is not: it would move the painted area onto unrelated source pixels.
 */
export async function gptMaskBytes(maskFile: string | undefined, sourceFile: string | undefined, provider: Provider): Promise<Buffer> {
  if (!maskFile) throw invalid('paint the area to change first (a PNG mask is required).');
  if (!sourceFile) throw invalid('add the source photo first.');
  const mask = await handOffBytes(maskFile, 'image', provider);
  if (!mask.subarray(0, 8).equals(PNG)) throw invalid('use a PNG mask, not a renamed JPEG or another file type.');
  const source = await handOffBytes(sourceFile, 'image', provider);
  const webp = source.toString('ascii', 0, 4) === 'RIFF' && source.toString('ascii', 8, 12) === 'WEBP';
  const md = imageDimsOf(mask), sd = imageDimsOf(source) ?? (webp ? await videoSize(sourceFile) : null);
  if (!md?.width || !md.height || !sd?.width || !sd.height) throw invalid('the PNG mask or source photo could not be read.');
  if (md.width * md.height > MAX_PIXELS || sd.width * sd.height > MAX_PIXELS) throw invalid('the source or mask is too large to prepare (64 MP maximum). Use a smaller photo.');
  const scale = Math.min(sd.width / md.width, sd.height / md.height);
  if (Math.abs(md.width * scale - sd.width) > 1 || Math.abs(md.height * scale - sd.height) > 1)
    throw invalid(`mask ${md.width}×${md.height} does not match source photo ${sd.width}×${sd.height}. Paint the mask on this photo again.`);
  // A plausible header is not proof of a readable image. Decode the first source frame too.
  await ffmpeg(source, ['-i', 'pipe:0', '-frames:v', '1', '-f', 'null', '-'], 0);
  const pixels = await ffmpeg(mask, ['-i', 'pipe:0', '-vf', `scale=${sd.width}:${sd.height}:flags=bilinear`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], sd.width * sd.height * 4);
  if (pixels.length !== sd.width * sd.height * 4) throw invalid('the PNG mask could not be decoded completely.');
  let nativeAlpha = false;
  for (let k = 3; k < pixels.length; k += 4) if (pixels[k] !== 255) { nativeAlpha = true; break; }
  let editable = false;
  for (let k = 0; k < pixels.length; k += 4) {
    if (!nativeAlpha) {
      const paint = Math.round((299 * pixels[k] + 587 * pixels[k + 1] + 114 * pixels[k + 2]) / 1000);
      pixels[k + 3] = 255 - paint; // Grayscale stays exact; keep soft paint, never a binary threshold.
    }
    if (pixels[k + 3] < 255) editable = true;
  }
  if (!editable) throw invalid('no editable area was painted. Paint the area to change first.');
  const limit = HANDOFF_POLICY[provider].maxBytes.image ?? 50 * 1024 * 1024;
  return ffmpeg(pixels, ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${sd.width}x${sd.height}`, '-i', 'pipe:0', '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1'], limit);
}
