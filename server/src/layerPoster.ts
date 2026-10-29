/**
 * Image to layers (2026-10-24): the layered job's poster, every layer drawn in z order onto one picture (the same as the photo), made ONCE when the job
 * finishes (mock run and Comfy Router run) and kept as `job.layersPoster` (/files/<id>-layers.png). The feed card and the viewer's Output thumbnail show
 * it, so the feed never stacks a dozen PNGs per card. Jobs made before this existed get theirs on first view: GET /api/jobs/:id/layers-poster.png builds
 * it once and redirects to the file (the same lazy pattern as /api/media/poster for videos).
 * Layers normally sit on a canvas the base's size already (routing/routerRun.ts layerToCanvas); a layer that stayed cropped is placed at its box.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { probe } from './media.js';
import { runFfmpeg } from './ffmpeg.js';
import { localFileOf } from './outputMeta.js';
import { isLayerJob } from './shared/imageLayers.js';
import type { Job } from './jobs.js';

const IMG = /\.(png|jpe?g|webp)($|\?)/i;
const building = new Map<string, Promise<string | null>>();
export const layersPosterName = (id: string) => `${id}-layers.png`;
/** The poster URL a client should show for a finished layered job: the file once made, else the lazy route; null for any other job. */
export function layersPosterUrl(j: Pick<Job, 'id' | 'status' | 'input' | 'outputs'>): string | null {
  if (!isLayerJob(j) || j.status !== 'done' || (j.outputs ?? []).filter((o) => IMG.test(o.url)).length < 2) return null;
  const own = (j as any).layersPoster as string | undefined; return own && localFileOf(own) ? own : `/api/jobs/${encodeURIComponent(j.id)}/layers-poster.png`;
}
/** Composite the job's layers (bottom first) into DATA_DIR/<id>-layers.png and remember it on the job. Best effort: null when it can't (the card then
 *  falls back to the top layer). Concurrent calls share one ffmpeg run. */
export function writeLayerPoster(job: Job): Promise<string | null> {
  const run = building.get(job.id); if (run) return run;
  const p = (async () => {
    const files = (job.outputs ?? []).filter((o) => IMG.test(o.url)).map((o) => ({ o, f: localFileOf(o.url) }));
    if (files.length < 2 || files.some((x) => !x.f)) return null;
    const base = await probe(files[0].f!); if (!base?.width || !base?.height) return null; const W = base.width, H = base.height;
    const sizes = await Promise.all(files.map((x) => probe(x.f!)));
    const parts: string[] = [`[0:v]format=rgba[a0]`];
    for (let k = 1; k < files.length; k++) {
      const s = sizes[k]; const box = files[k].o.box; let src = `[${k}:v]`; let at = '0:0';
      if (!(s?.width === W && s?.height === H)) {
        if (Array.isArray(box) && box.length === 4) { const [l, t, r, b] = box.map((v) => Math.round(Number(v) || 0)); src = `[s${k}]`; at = `${l}:${t}`; parts.push(`[${k}:v]format=rgba,scale=${Math.max(1, r - l)}:${Math.max(1, b - t)}${src}`); }
        else { src = `[s${k}]`; parts.push(`[${k}:v]format=rgba,scale=${W}:${H}${src}`); }
      }
      parts.push(`[a${k - 1}]${src}overlay=${at}:format=rgb[a${k}]`);
    }
    const name = layersPosterName(job.id); const dst = path.join(DATA_DIR, name); const tmp = `${dst}.tmp.png`;
    const code = await runFfmpeg(['-v', 'error', '-y', ...files.flatMap((x) => ['-i', x.f!]), '-filter_complex', parts.join(';'), '-map', `[a${files.length - 1}]`, '-frames:v', '1', '-pix_fmt', 'rgba', tmp]);
    if (code !== 0 || !existsSync(tmp)) return null;
    await (await import('node:fs/promises')).rename(tmp, dst);
    const url = `/files/${name}`; (job as any).layersPoster = url; return url;
  })().catch(() => null).finally(() => building.delete(job.id));
  building.set(job.id, p); return p;
}
/** Share (2026-10-24): the composite's URL for a layered job, made now if it is missing (the share card, the link page). null for any other job. */
export async function ensureLayersPoster(j: Job): Promise<string | null> {
  const url = layersPosterUrl(j); if (!url) return null; if (url.startsWith('/files/')) return url; return writeLayerPoster(j);
}
