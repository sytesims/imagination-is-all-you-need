/**
 * Ad Pack logo (2026-10-31): after the run, the brand kit's own logo file goes onto each ad, exactly as uploaded (never redrawn by a model).
 * Place: shared/adPack.ts adLogoBox (the picked corner, inside the platform's safe area). The kit's light or dark logo is picked by the
 * brightness behind that corner (shared/brandKit.ts logoForBackground; a kit with one logo uses it everywhere). ffmpeg overlays it, as
 * "Add logo and text" does (routesStamp.ts). Each ad becomes <job>-out<k>-ad.png; the plain picture stays as plainUrl on the output.
 * Free (no model). Called from providers.runWithProvider once the run is done; a logo that can't be read (an SVG this ffmpeg can't open)
 * leaves the ads as they are, with a note.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR, WEB_PUBLIC_DIR } from './config.js';
import { dataFileOf } from './cleanMedia.js';
import { runFfmpeg, videoSize } from './ffmpeg.js';
import { getBrandKit } from './brandKits.js';
import { logoForBackground } from './shared/brandKit.js';
import { adLogoBox, adLogoSafe, adLogoSize, asCorner, type AdLogoRec } from './shared/adPack.js';
import { addAdjustNote } from './shared/snap.js';
import type { Job } from './jobs.js';

/** A kit logo URL → its file: /files/… in the data folder, else a file the web app ships (the built-in kit's /app-icon-512.png). */
export function logoFileOf(url: string | null | undefined): string | null {
  if (!url) return null; if (url.startsWith('/files/')) return dataFileOf(url);
  const p = path.resolve(WEB_PUBLIC_DIR, `.${url.split('?')[0]}`); return p.startsWith(WEB_PUBLIC_DIR + path.sep) && existsSync(p) ? p : null;
}
/** The ffmpeg args that put the logo, scaled to the box, onto the ad (exported for the test). */
export function adLogoArgs(src: string, logo: string, out: string, box: { x: number; y: number; w: number; h: number }): string[] {
  return ['-y', '-v', 'error', '-i', src, '-i', logo, '-filter_complex', `[1:v]scale=${box.w}:${box.h}:flags=lanczos,format=rgba[l];[0:v][l]overlay=${box.x}:${box.y}:format=auto`,
    '-frames:v', '1', '-map_metadata', '-1', out];
}
/** Mean brightness (0..1) of a box of an image: the box scaled to one grey pixel. null when unreadable. */
function areaLum(file: string, b: { x: number; y: number; w: number; h: number }): Promise<number | null> {
  return new Promise((ok) => {
    const c = spawn('ffmpeg', ['-v', 'error', '-i', file, '-vf', `crop=${b.w}:${b.h}:${b.x}:${b.y},scale=1:1:flags=area,format=gray`, '-frames:v', '1', '-f', 'rawvideo', '-'], { stdio: ['ignore', 'pipe', 'ignore'] });
    const parts: Buffer[] = []; c.stdout.on('data', (d: Buffer) => parts.push(d)); c.on('error', () => ok(null));
    c.on('close', (code) => { const buf = Buffer.concat(parts); ok(code === 0 && buf.length ? buf[0] / 255 : null); });
  });
}

const stamped = new Set<string>();
/** Put the logo on every finished ad of the job (job.input.adLogo, set by the app's finish: Ad Pack, and Product Shot / Phone Photo with Brand). */
export async function stampAdLogos(job: Job): Promise<void> {
  const a = job.input?.adLogo as AdLogoRec | undefined;
  if (!a || job.status !== 'done' || stamped.has(job.id)) return; stamped.add(job.id); // once per job (a rerun is a new job; nested route runs call this twice)
  const kit = getBrandKit(String(a.kit)); if (!kit) return;
  job.status = 'running'; job.stage = 'finishing'; job.progress = 99; // hold 'done' until the ads carry the logo
  try {
    const safe = adLogoSafe(a), logoSize = adLogoSize(a); const corner = asCorner(a.corner); let missed = 0;
    for (let k = 0; k < (job.outputs ?? []).length; k++) {
      const o = job.outputs[k]; const src = dataFileOf(o.url); if (!src) { missed++; continue; }
      const size = await videoSize(src); if (!size) { missed++; continue; }
      // the box is laid out with the main logo's shape first, so the brightness behind it picks light / dark
      const main = logoFileOf(kit.logos.main?.url ?? kit.logo?.url); const mainSize = main ? await videoSize(main) : null;
      const box0 = adLogoBox(size.width, size.height, corner, mainSize ? { w: mainSize.width, h: mainSize.height } : { w: 1, h: 1 }, safe, logoSize);
      const lum = await areaLum(src, box0); const pick = logoForBackground(kit, lum ?? 0.5); const file = logoFileOf(pick?.url) ?? main;
      const ls = file ? await videoSize(file) : null; if (!file || !ls) { missed++; continue; }
      const box = adLogoBox(size.width, size.height, corner, { w: ls.width, h: ls.height }, safe, logoSize);
      const name = `${job.id}-out${k}-ad.png`; const out = path.join(DATA_DIR, name);
      if (await runFfmpeg(adLogoArgs(src, file, out, box)) !== 0) { missed++; continue; }
      o.plainUrl = o.url; o.url = `/files/${name}`;
    }
    if (missed) addAdjustNote(job.input, 'Your logo couldn’t be added to every ad. Use a PNG logo in Assets › Brands, or add it from the viewer.');
  } finally {
    job.resultUrl = job.outputs?.[0]?.url ?? job.resultUrl; job.status = 'done'; job.stage = 'done'; job.progress = 100;
  }
}
