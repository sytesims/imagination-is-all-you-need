/**
 * H3 runner Step 3 (Oct 26): Re-shoot input for "New angle · H3 CrossView · cloud" (provider cloud-h3-crossview, route comfy-deploy:cloud-h3-crossview).
 * One camera for the whole take, given as numbers: azimuth / elevation / distance (fields), or the Re-shoot pad's yaw / tilt (one angle).
 * Take: 5–15 s. 4–5 s is padded to 5 s (last frame held, silence added); over 15 s the first 15 s are used. Size 480p or 768p (shape follows the take).
 * Sound: the take's own sound by default; generateAudio=1 keeps H3's generated sound instead. Graph + plan: comfy/crossview.ts.
 */
import path from 'node:path';
import { DATA_DIR } from '../config.js';
import { probe, trim } from '../media.js';
import { runFfmpeg } from '../ffmpeg.js';
import { CROSSVIEW_AZ, CROSSVIEW_DIST, CROSSVIEW_EL, CROSSVIEW_LABEL, CROSSVIEW_RESOLUTIONS, CROSSVIEW_SECONDS, CROSSVIEW_ZONE_WORDS, crossviewTooSmall, crossviewZone } from '../shared/crossview.js';

type Issue = { code: string; field: string; message: string; [k: string]: unknown };
const fail = (iss: Issue) => ({ error: iss.message, issues: [iss] } as any);
const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
const on = (v?: string) => /^(1|true|on|yes)$/i.test(v ?? '');
const r1 = (n: number) => Math.round(n * 10) / 10;
export const CROSSVIEW_SHORT = `${CROSSVIEW_LABEL} needs a take of ${CROSSVIEW_SECONDS.min}–${CROSSVIEW_SECONDS.max} s. Clips from ${CROSSVIEW_SECONDS.padFrom} s are padded to ${CROSSVIEW_SECONDS.min} s; this one is shorter.`;

/** The camera from the form: azimuth / elevation / distance win; else the one angle's yaw / tilt (or a pad preset), else top-level yaw / tilt. */
export function crossviewCamera(fields: Record<string, string>, presets: { label: string; yaw: number; tilt: number; zoom: number; move: string | null }[]): { cam?: { azimuth: number; elevation: number; distance: number }; issue?: Issue } {
  let az = num(fields.azimuth); let el = num(fields.elevation); let dist = num(fields.distance);
  if (az == null && el == null) {
    let raw: any[] = []; try { raw = JSON.parse(fields.angles || '[]'); } catch { return { issue: { code: 'invalid', field: 'angles', message: 'angles must be a JSON array.' } }; }
    if (!Array.isArray(raw)) raw = [];
    if (raw.length > 1) return { issue: { code: 'too_many', field: 'angles', message: `${CROSSVIEW_LABEL} renders one camera angle for the whole take. Keep one angle, or pick another model for a multi-angle cut.` } };
    const a = typeof raw[0] === 'string' ? { angle: raw[0] } : raw[0];
    if (a && (a.yaw != null || a.tilt != null)) { az = num(a.yaw) ?? 0; el = num(a.tilt) ?? 0; }
    else if (a?.angle) { const p = presets.find((x) => x.label.toLowerCase() === String(a.angle).trim().toLowerCase());
      if (!p || p.move) return { issue: { code: 'angle_needs_position', field: 'angles', message: `${CROSSVIEW_LABEL} needs a camera position: drag it on the angle pad (or send azimuth and elevation).` } };
      az = p.yaw; el = p.tilt; dist ??= p.zoom ? r1(1 / p.zoom) : 1; }
    else if (fields.yaw != null && fields.yaw !== '' || fields.tilt != null && fields.tilt !== '') { az = num(fields.yaw) ?? 0; el = num(fields.tilt) ?? 0; }
    else return { issue: { code: 'required', field: 'azimuth', message: `Pick the new camera angle: ${CROSSVIEW_LABEL} needs azimuth and elevation.` } };
  }
  az ??= 0; el ??= 0; dist ??= CROSSVIEW_DIST.default;
  if (!Number.isFinite(az) || az < CROSSVIEW_AZ.min || az > CROSSVIEW_AZ.max) return { issue: { code: 'out_of_range', field: 'azimuth', message: `Azimuth must be ${CROSSVIEW_AZ.min}° to ${CROSSVIEW_AZ.max}°: past ±90° the camera would look at a side the take never showed.`, min: CROSSVIEW_AZ.min, max: CROSSVIEW_AZ.max } };
  if (!Number.isFinite(el) || el < CROSSVIEW_EL.min || el > CROSSVIEW_EL.max) return { issue: { code: 'out_of_range', field: 'elevation', message: `Elevation must be ${CROSSVIEW_EL.min}° to +${CROSSVIEW_EL.max}°.`, min: CROSSVIEW_EL.min, max: CROSSVIEW_EL.max } };
  if (!Number.isFinite(dist) || dist < CROSSVIEW_DIST.min || dist > CROSSVIEW_DIST.max) return { issue: { code: 'out_of_range', field: 'distance', message: `Distance must be ${CROSSVIEW_DIST.min} to ${CROSSVIEW_DIST.max} (1 = the take's own).`, min: CROSSVIEW_DIST.min, max: CROSSVIEW_DIST.max } };
  return { cam: { azimuth: r1(az), elevation: r1(el), distance: Math.round(dist * 100) / 100 } };
}

/** Pad a 4–5 s take to exactly 5 s (hold the last frame, add silence). */
async function padTo(src: string, seconds: number, hasAudio: boolean): Promise<string | null> {
  const dst = src.replace(/(\.[^.]+)?$/, '-pad5.mp4'); const p = await probe(src); if (!p) return null;
  const extra = Math.max(0.05, seconds - p.duration + 0.05);
  const args = ['-y', '-v', 'error', '-i', src, ...(hasAudio ? [] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']), '-vf', `tpad=stop_mode=clone:stop_duration=${extra.toFixed(2)}`,
    ...(hasAudio ? ['-af', 'apad'] : ['-map', '0:v:0', '-map', '1:a:0']), '-t', String(seconds), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'aac', dst];
  return (await runFfmpeg(args)) === 0 ? dst : null;
}

/** Re-shoot parse for the CrossView model. c = parseCommon's result (or its error). */
export async function parseCrossView(fields: Record<string, string>, files: Record<string, string[]>, c: any, presets: { label: string; yaw: number; tilt: number; zoom: number; move: string | null }[]) {
  if ('error' in c) { const short = (c.issues ?? []).find((i: Issue) => i.code === 'too_short'); return short ? fail({ ...short, message: CROSSVIEW_SHORT, min: CROSSVIEW_SECONDS.padFrom }) : c; }
  if (files.audio?.length) return fail({ code: 'unsupported', field: 'audio', message: `${CROSSVIEW_LABEL} keeps the take's own sound or makes its own; it doesn't take a replacement soundtrack.` });
  if ((files.refs ?? []).length) return fail({ code: 'unsupported', field: 'refs', message: `${CROSSVIEW_LABEL} works from the take alone; remove the reference pictures.` });
  if ((files.videoRefs ?? []).length) return fail({ code: 'unsupported', field: 'videoRefs', message: 'Video references work only on the Seedance model.' });
  if (Number(fields.angleCount || 1) > 1) return fail({ code: 'unsupported', field: 'angleCount', message: `${CROSSVIEW_LABEL} renders one angle per run; batches aren't available on it.` });
  if (on(fields.fullClip)) return fail({ code: 'unsupported', field: 'fullClip', message: `${CROSSVIEW_LABEL} always renders the whole take from the new angle.` });
  const size = c.draft ? '480p' : (fields.resolution || '480p');
  if (!(CROSSVIEW_RESOLUTIONS as string[]).includes(size)) return fail({ code: 'invalid', field: 'resolution', message: `${CROSSVIEW_LABEL} renders 480p or 768p (the shape follows your take).`, allowed: CROSSVIEW_RESOLUTIONS });
  const { cam, issue } = crossviewCamera(fields, presets); if (issue) return fail(issue);
  const warnings: string[] = [...(c.warnings ?? []).filter((w: string) => !/^Clip trimmed/.test(w))];
  let videoPath: string = c.videoPath; let duration: number = c.duration; let padded = false; let trimmed = false;
  if (duration < CROSSVIEW_SECONDS.min) {
    const p = await padTo(videoPath, CROSSVIEW_SECONDS.min, c.hasAudio !== false); if (!p) return fail({ code: 'unreadable', field: 'video', message: `Couldn't pad the take to ${CROSSVIEW_SECONDS.min} s.` });
    warnings.push(`Your take is ${r1(duration)} s; it was padded to ${CROSSVIEW_SECONDS.min} s by holding its last frame (${CROSSVIEW_LABEL} needs ${CROSSVIEW_SECONDS.min}–${CROSSVIEW_SECONDS.max} s).`);
    videoPath = p; duration = CROSSVIEW_SECONDS.min; padded = true;
  } else if (duration > CROSSVIEW_SECONDS.max + 0.05) {
    const t = videoPath.replace(/(\.[^.]+)?$/, '-cv15$1'); if (!(await trim(videoPath, t, CROSSVIEW_SECONDS.max))) return fail({ code: 'unreadable', field: 'video', message: `Couldn't cut the take to ${CROSSVIEW_SECONDS.max} s.` });
    warnings.push(`${CROSSVIEW_LABEL} uses the first ${CROSSVIEW_SECONDS.max} s of your ${r1(duration)} s take.`); videoPath = t; duration = CROSSVIEW_SECONDS.max; trimmed = true;
  }
  const zone = crossviewZone(cam!.azimuth, cam!.elevation);
  if (zone !== 'green') warnings.push(CROSSVIEW_ZONE_WORDS[zone] + '.');
  if (crossviewTooSmall(cam!.azimuth, cam!.elevation)) warnings.push('A very small move can come back looking like the take itself; try at least 10° of azimuth or elevation.');
  if (size === '768p' && duration > 10) warnings.push('768p over 10 s is the slowest setting (about twice the GPU time of 480p).');
  const generated = on(fields.generateAudio);
  const words = `camera ${cam!.azimuth === 0 ? 'in front' : `${Math.abs(cam!.azimuth)}° ${cam!.azimuth < 0 ? 'left' : 'right'}`}, ${cam!.elevation === 0 ? 'eye level' : `${Math.abs(cam!.elevation)}° ${cam!.elevation > 0 ? 'above' : 'below'}`}`;
  return { ...c, videoPath, videoUrl: `/files/${path.relative(DATA_DIR, videoPath)}`, duration: r1(duration), warnings, resolution: size, crossviewSize: size, crossview: { ...cam!, zone }, crossviewAudio: generated ? 'generated' : 'original',
    crossviewClip: { padded, trimmed }, angles: [{ start: 0, end: r1(duration), angle: words, yaw: cam!.azimuth, tilt: cam!.elevation, preset: null }], angleCount: 1, fullClip: false, slot: fields.slot != null && fields.slot !== '' ? Number(fields.slot) : null,
    mode: 'reshoot', target: '', sourceKind: 'video', audioPath: '', audioReplaced: false, promptOnly: false, videoRefPaths: [], videoRefUrls: [], refVideoSeconds: 0, generateAudio: generated, audio: generated, keepAudio: true, refPaths: [], refUrls: [], refBatches: [[]] };
}
