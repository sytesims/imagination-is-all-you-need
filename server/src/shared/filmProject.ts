/**
 * Film (2026-10-27): one film = an ordered list of shots, each a start still → video takes (one active), plus music / voice, post settings
 * and the cast. The document is JSON (server: filmProjects.ts, SQLite `films`); edits arrive as ops on a rev (stale rev → 409).
 *
 * Shared by the server and the web (the types; the web may also use applyOps / filmStitchBody for optimistic edits and previews).
 * Pure: no jobs, no files, no network. The server fills takes from job state on read and does every paid step through the existing
 * job pipeline (POST /api/tools/h3-video/jobs with the quote handshake).
 *
 * A shot's kind is "shot" or "bridge": a bridge is a short first-and-last-frame clip (types ["flf"]) from the previous shot's last frame
 * (startFrom) to the next shot's start still (endFrame), usually LTX-2.5 on Comfy Cloud, 3–5 s (skills/film-making "Bridges").
 */
import { z } from 'zod';
import { CARD_STYLES, CARD_SEC, TRANSITIONS, REFRAME_FITS, TRANSITION_SEC } from './stitchTimeline.js';

export const FILM_ASPECTS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'] as const;
export const FILM_MAX_SHOTS = 60;
export const FILM_MAX_TAKES = 30;
export const FILM_TITLE_MAX = 120;
export const FILM_PROMPT_MAX = 8000;
/** The tool every shot renders on (Generate Video: any model / route the user picks). */
export const FILM_VIDEO_TOOL = 'h3-video';
/** Bridge defaults (skills/film-making: LTX-2.5 on Comfy Cloud does first-and-last-frame cheaply, 4 s at 720p). */
export const BRIDGE_DEFAULTS = { modelKey: 'ltx-2.5-22b', runOn: 'comfy-cloud', durationSec: 4, resolution: '720p', types: ['flf'] } as const;

const id = z.string().trim().min(1).max(64).regex(/^[\w-]+$/, 'ids are letters, numbers, - and _');
const url = z.string().trim().max(2000);
const sec = z.number().finite().min(0).max(600);

export const zTrim = z.object({ inSec: sec.default(0), outSec: z.number().finite().min(0.1).max(600).nullable().default(null) }).strict()
  .refine((t) => t.outSec == null || t.outSec - t.inSec >= 0.1, { message: 'trim: outSec must be at least 0.1 s after inSec.', path: ['outSec'] });
export const zFrameRef = z.object({ url: url.nullable().default(null), jobId: id.nullable().default(null) }).strict();
export const zStartFrom = z.object({ kind: z.enum(['none', 'still', 'last_frame']).default('none'), url: url.nullable().default(null), jobId: id.nullable().default(null) }).strict();
export const TAKE_STATUSES = ['queued', 'running', 'done', 'failed', 'canceled', 'missing'] as const;
export const zTake = z.object({
  id, jobId: id, status: z.enum(TAKE_STATUSES).default('queued'),
  /** the take's video (first video output) and poster once done */
  url: url.nullable().default(null), posterUrl: url.nullable().default(null), durationSec: z.number().nullable().default(null),
  /** what counts against limits (spend log countedUsd; $0 local / sample / uncharged failures), null until known */
  costUsd: z.number().nullable().default(null),
  /** the quote at submit (estimate) and what the provider really billed, when it reports it (EDITOR-NOTES: "show what each draft really billed next to the quote") */
  quotedUsd: z.number().nullable().default(null), actualUsd: z.number().nullable().default(null), local: z.boolean().default(false), sample: z.boolean().default(false),
  createdAt: z.number().default(0), star: z.boolean().default(false), error: z.string().nullable().default(null),
}).strict();
export const SHOT_STATUSES = ['draft', 'queued', 'rendering', 'done', 'failed'] as const;
/** cut | crossfade (picture and sound together) | fade (through black; "dip" is the same) | jcut (the next shot's sound starts `sec` before its
 *  picture) | lcut (this shot's sound runs `sec` past the cut, under the next shot). J and L are free: Stitch places the sound on the timeline. */
export const TRANSITION_TYPES = ['cut', 'crossfade', 'fade', 'dip', 'jcut', 'lcut'] as const;
export const zTransition = z.object({ type: z.enum(TRANSITION_TYPES).default('cut'), sec: z.number().min(0).max(TRANSITION_SEC.max).default(0) }).strict();
void TRANSITIONS;
export const zShot = z.object({
  id, index: z.number().int().min(0).optional(),
  kind: z.enum(['shot', 'bridge']).default('shot'),
  beatId: id.nullable().default(null),
  prompt: z.string().max(FILM_PROMPT_MAX).default(''), negative: z.string().max(2000).default(''),
  /** a model key from /api/models (e.g. minimax-h3, ltx-2.5-22b) or null = the tool's default; runOn: local | comfy-cloud | … | auto (null = auto) */
  modelKey: z.string().trim().max(120).nullable().default(null), runOn: z.string().trim().max(40).nullable().default(null),
  /** the job's mode: ["i2v"] (start still), ["flf"] (start + end frame), ["t2v"] (text only) */
  types: z.array(z.string().trim().min(1).max(20)).min(1).max(3).default(['i2v']),
  /** seconds; null = the model's default length (each model has its own allowed lengths: the quote says which) */ durationSec: z.number().finite().min(1).max(60).nullable().default(null),
  /** '' = the model's default resolution */ resolution: z.string().trim().max(20).default(''),
  /** null = the film's aspect */ aspect: z.string().trim().max(10).nullable().default(null),
  seed: z.number().int().min(0).nullable().default(null), audio: z.boolean().default(true),
  startFrom: zStartFrom.default({ kind: 'none', url: null, jobId: null }),
  /** bridges (types ["flf"]): the still the clip lands on (the next shot's start still) */ endFrame: zFrameRef.nullable().default(null),
  continueFromPrev: z.boolean().default(false), characterIds: z.array(id).max(12).default([]),
  /** the shot's own still (made with Create Image or picked from Assets); startFrom is what a render sends */
  stillJobId: id.nullable().default(null), stillUrl: url.nullable().default(null),
  takes: z.array(zTake).max(FILM_MAX_TAKES).default([]), activeTakeId: id.nullable().default(null),
  status: z.enum(SHOT_STATUSES).default('draft'), changed: z.boolean().default(false),
  trim: zTrim.default({ inSec: 0, outSec: null }),
  /** the join into the next shot; null = the film-wide post.transition (a cut by default) */ transitionOut: zTransition.nullable().default(null),
  /** left out of the cut and the preview, its takes kept (EDITOR-NOTES: "hide or remove a card without losing its takes") */ hidden: z.boolean().default(false),
  notes: z.string().max(4000).default(''),
}).strict();
export const zAudioTrack = z.object({ id, kind: z.enum(['music', 'vo', 'sfx']), jobId: id.nullable().default(null), url: url.nullable().default(null),
  volume: z.number().min(0).max(2).default(1), fadeOutSec: z.number().min(0).max(5).nullable().default(null), loop: z.boolean().default(false) }).strict();
export const zCard = z.object({ text: z.string().max(200).nullable().default(null), style: z.enum(CARD_STYLES as ['clean', 'bold', 'quiet', 'lower']).default('clean'),
  mode: z.enum(['black', 'over']).default('black'), sec: z.number().min(CARD_SEC.min).max(CARD_SEC.max).default(2.5) }).strict();
export const zPost = z.object({
  titleCard: zCard.nullable().default(null), endCard: zCard.nullable().default(null),
  /** the film-wide join between shots (compose has one transition for the whole cut) */
  transition: zTransition.default({ type: 'cut', sec: 0.5 }),
  fit: z.enum(REFRAME_FITS as ['fit', 'fill', 'blur']).nullable().default(null),
  keepClipAudio: z.boolean().default(true), duck: z.boolean().default(true), duckAmount: z.number().min(0).max(1).default(0.6),
  normalize: z.boolean().default(true), fadeOutSec: z.number().min(0).max(5).default(1), videoFade: z.boolean().default(true),
  clipVolume: z.number().min(0).max(2).nullable().default(null),
  captionsJobId: id.nullable().default(null),
}).strict();
export const zCast = z.object({ id, name: z.string().trim().min(1).max(80), sheetJobId: id.nullable().default(null), stillUrl: url.nullable().default(null), lookLine: z.string().max(1000).default('') }).strict();
export const zBeat = z.object({ id, t0: sec.default(0), t1: sec.default(0), summary: z.string().max(1000).default('') }).strict();
export const zExport = z.object({ jobId: id, url: url.nullable().default(null), createdAt: z.number().default(0), durationSec: z.number().nullable().default(null) }).strict();
export const zFilm = z.object({
  id, kind: z.literal('film').default('film'), rev: z.number().int().min(0).default(0),
  title: z.string().trim().min(1).max(FILM_TITLE_MAX), aspect: z.string().trim().regex(/^\d{1,2}:\d{1,2}$/).default('16:9'), fps: z.number().int().min(1).max(120).default(24),
  budgetId: z.string().max(64).nullable().default(null), spentUsd: z.number().default(0),
  /** what you mean to spend on this film in USD (the header's meter; Generate stops when a quote is over what's left), null = no budget */
  budgetUsd: z.number().finite().min(0).max(100_000).nullable().default(null),
  cast: z.array(zCast).max(24).default([]), script: z.object({ markdown: z.string().max(40_000).default('') }).strict().default({ markdown: '' }),
  beats: z.array(zBeat).max(200).default([]), shots: z.array(zShot).max(FILM_MAX_SHOTS).default([]),
  audio: z.array(zAudioTrack).max(12).default([]), post: zPost.default(() => zPost.parse({})),
  exports: z.array(zExport).max(100).default([]),
  /** the latest rough cut (POST /api/films/:id/preview), not in Assets */ preview: z.object({ url: url, createdAt: z.number(), durationSec: z.number().nullable(), shotIds: z.array(id) }).strict().nullable().default(null),
  /** what the film's takes cost: counted (what counts against limits), billed (provider-reported, where known), quoted (estimates at submit) */
  spend: z.object({ countedUsd: z.number(), actualUsd: z.number(), actualRuns: z.number().int(), quotedUsd: z.number(), runs: z.number().int(), sampleRuns: z.number().int() }).strict()
    .default({ countedUsd: 0, actualUsd: 0, actualRuns: 0, quotedUsd: 0, runs: 0, sampleRuns: 0 }),
  createdAt: z.number().default(0), updatedAt: z.number().default(0),
  /** a built-in sample this film came from (server/samples/films/<name>.json), else null */ sample: z.string().max(40).nullable().default(null),
}).strict();

export type FilmShot = z.output<typeof zShot>;
export type FilmTake = z.output<typeof zTake>;
export type FilmAudioTrack = z.output<typeof zAudioTrack>;
export type FilmPost = z.output<typeof zPost>;
export type FilmCast = z.output<typeof zCast>;
export type FilmCard = z.output<typeof zCard>;
export type FilmProject = z.output<typeof zFilm>;
export type ShotStatus = (typeof SHOT_STATUSES)[number];
export type TakeStatus = (typeof TAKE_STATUSES)[number];
/** GET /api/films items */
export interface FilmSummary { id: string; title: string; aspect: string; shotCount: number; updatedAt: number; createdAt: number; posterUrl: string | null; rev: number; sample: string | null }

// ---------------------------------------------------------------- ops (POST /api/films/:id/ops {baseRev, ops})
const obj = z.record(z.string(), z.unknown());
export const zOp = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set_title'), title: z.string().trim().min(1).max(FILM_TITLE_MAX) }).strict(),
  /** Film settings besides the title (an addition to the first contract): aspect, fps, script, beats, budgetId, budgetUsd. */
  z.object({ op: z.literal('set_meta'), aspect: z.string().trim().regex(/^\d{1,2}:\d{1,2}$/).optional(), fps: z.number().int().min(1).max(120).optional(),
    script: z.object({ markdown: z.string().max(40_000) }).strict().optional(), beats: z.array(zBeat).max(200).optional(), budgetId: z.string().max(64).nullable().optional(),
    budgetUsd: z.number().finite().min(0).max(100_000).nullable().optional() }).strict(),
  /** shot: fields of a shot. No id (or an unknown id) = a new shot, inserted at `index` (default: the end). An existing id = those fields
   *  changed. takes: [{jobId}] attaches existing video jobs as takes (e.g. picked from Assets); other take fields are the server's. */
  z.object({ op: z.literal('upsert_shot'), shot: obj, index: z.number().int().min(0).optional() }).strict(),
  z.object({ op: z.literal('delete_shot'), shotId: id }).strict(),
  /** order: every shot id, in the new order */ z.object({ op: z.literal('reorder_shots'), order: z.array(id) }).strict(),
  z.object({ op: z.literal('set_active_take'), shotId: id, takeId: id.nullable() }).strict(),
  z.object({ op: z.literal('set_trim'), shotId: id, inSec: sec.optional(), outSec: z.number().finite().min(0.1).max(600).nullable().optional() }).strict(),
  /** tracks: the whole audio list (music, vo, sfx), replacing the old one */ z.object({ op: z.literal('set_audio'), tracks: z.array(obj).max(12) }).strict(),
  /** post: the fields to change (merged) */ z.object({ op: z.literal('set_post'), post: obj }).strict(),
  /** cast: the whole cast list */ z.object({ op: z.literal('set_cast'), cast: z.array(obj).max(24) }).strict(),
]);
export type FilmOp = z.output<typeof zOp>;
export const FILM_OPS = ['set_title', 'set_meta', 'upsert_shot', 'delete_shot', 'reorder_shots', 'set_active_take', 'set_trim', 'set_audio', 'set_post', 'set_cast'] as const;
export interface OpError { error: string; code: string; field: string; opIndex: number }
export interface OpCtx { newId: (prefix: string) => string; now: number; /** a job id that exists (attaching takes) */ jobExists?: (jobId: string) => boolean }

const issueText = (e: z.ZodError) => e.issues.slice(0, 3).map((i) => `${i.path.join('.') || '(value)'}: ${i.message}`).join('; ');
/** A shot from loose fields (defaults filled, unknown fields refused). */
export function parseShot(raw: unknown): { shot: FilmShot } | { error: string; field: string } {
  const r = zShot.safeParse(raw); return r.success ? { shot: r.data } : { error: issueText(r.error), field: r.error.issues[0]?.path.join('.') ?? 'shot' };
}
/** A new film document. */
export function newFilm(o: { id: string; title: string; aspect?: string | null; now: number; sample?: string | null }): FilmProject {
  return zFilm.parse({ id: o.id, title: o.title, ...(o.aspect ? { aspect: o.aspect } : {}), createdAt: o.now, updatedAt: o.now, sample: o.sample ?? null });
}
/** The shot's status from its takes: the active take's state, else the newest take's (draft with none). */
export function shotStatusOf(s: Pick<FilmShot, 'takes' | 'activeTakeId'>): ShotStatus {
  if (!s.takes.length) return 'draft';
  const newest = s.takes[s.takes.length - 1]; const act = s.takes.find((t) => t.id === s.activeTakeId);
  if (newest.status === 'queued') return 'queued'; if (newest.status === 'running') return 'rendering';
  const t = act ?? newest; return t.status === 'done' ? 'done' : t.status === 'queued' ? 'queued' : t.status === 'running' ? 'rendering' : 'failed';
}
/** Positions, statuses and the active take kept consistent after any change (an active take that is gone is cleared; none is picked here:
 *  the server makes a take active when it finishes on a shot that has none, so set_active_take null sticks until then). */
export function normalizeFilm(f: FilmProject): FilmProject {
  f.shots.forEach((s, i) => {
    s.index = i;
    if (s.activeTakeId && !s.takes.some((t) => t.id === s.activeTakeId)) s.activeTakeId = null;
    s.status = shotStatusOf(s);
  });
  return f;
}

/** Apply ops in order, all or nothing. Returns the new document (rev not bumped: the caller does that once). */
export function applyOps(film: FilmProject, ops: unknown[], ctx: OpCtx): { film: FilmProject } | OpError {
  const f: FilmProject = structuredClone(film);
  const shotAt = (sid: string) => f.shots.findIndex((s) => s.id === sid);
  for (const [k, raw] of ops.entries()) {
    const p = zOp.safeParse(raw);
    if (!p.success) return { error: `ops[${k}]: ${issueText(p.error)}`, code: 'invalid_op', field: `ops[${k}]`, opIndex: k };
    const op = p.data; const fail = (code: string, error: string, field = `ops[${k}]`): OpError => ({ error: `ops[${k}] ${op.op}: ${error}`, code, field, opIndex: k });
    switch (op.op) {
      case 'set_title': f.title = op.title; break;
      case 'set_meta': {
        if (op.aspect != null) f.aspect = op.aspect; if (op.fps != null) f.fps = op.fps; if (op.script) f.script = op.script;
        if (op.beats) f.beats = op.beats.map((b) => zBeat.parse(b)); if (op.budgetId !== undefined) f.budgetId = op.budgetId;
        if (op.budgetUsd !== undefined) f.budgetUsd = op.budgetUsd; break;
      }
      case 'upsert_shot': {
        const patch = { ...op.shot } as Record<string, unknown>; const addTakes = patch.takes; delete patch.takes; delete patch.index; delete patch.status;
        if (addTakes != null && (!Array.isArray(addTakes) || addTakes.some((t) => !t || typeof (t as any).jobId !== 'string'))) return fail('invalid_take', 'takes is a list of {jobId} (existing video jobs).', `ops[${k}].shot.takes`);
        const at = typeof patch.id === 'string' ? shotAt(patch.id) : -1;
        let shot: FilmShot;
        if (at >= 0) { const r = parseShot({ ...f.shots[at], ...patch, id: f.shots[at].id }); if ('error' in r) return fail('invalid_shot', r.error, `ops[${k}].shot.${r.field}`); shot = r.shot; }
        else {
          if (f.shots.length >= FILM_MAX_SHOTS) return fail('too_many_shots', `a film has at most ${FILM_MAX_SHOTS} shots.`);
          const base = patch.kind === 'bridge' ? { types: [...BRIDGE_DEFAULTS.types], durationSec: BRIDGE_DEFAULTS.durationSec, modelKey: BRIDGE_DEFAULTS.modelKey, runOn: BRIDGE_DEFAULTS.runOn, resolution: BRIDGE_DEFAULTS.resolution } : {};
          const r = parseShot({ ...base, ...patch, id: typeof patch.id === 'string' && patch.id ? patch.id : ctx.newId('shot') }); if ('error' in r) return fail('invalid_shot', r.error, `ops[${k}].shot.${r.field}`); shot = r.shot;
        }
        for (const t of (addTakes as { jobId: string }[] | undefined) ?? []) {
          if (ctx.jobExists && !ctx.jobExists(t.jobId)) return fail('unknown_job', `no job ${t.jobId}.`, `ops[${k}].shot.takes`);
          if (shot.takes.some((x) => x.jobId === t.jobId)) continue;
          if (shot.takes.length >= FILM_MAX_TAKES) return fail('too_many_takes', `a shot keeps at most ${FILM_MAX_TAKES} takes.`);
          shot.takes.push(zTake.parse({ id: ctx.newId('take'), jobId: t.jobId, status: 'queued', createdAt: ctx.now }));
        }
        if (at >= 0) f.shots[at] = shot; else f.shots.splice(Math.min(op.index ?? f.shots.length, f.shots.length), 0, shot);
        break;
      }
      case 'delete_shot': { const at = shotAt(op.shotId); if (at < 0) return fail('unknown_shot', `no shot ${op.shotId}.`); f.shots.splice(at, 1); break; }
      case 'reorder_shots': {
        const ids = f.shots.map((s) => s.id);
        if (op.order.length !== ids.length || new Set(op.order).size !== ids.length || op.order.some((x) => !ids.includes(x))) return fail('invalid_order', 'order must list every shot id exactly once.');
        f.shots = op.order.map((x) => f.shots[shotAt(x)]); break;
      }
      case 'set_active_take': {
        const at = shotAt(op.shotId); if (at < 0) return fail('unknown_shot', `no shot ${op.shotId}.`);
        if (op.takeId != null && !f.shots[at].takes.some((t) => t.id === op.takeId)) return fail('unknown_take', `shot ${op.shotId} has no take ${op.takeId}.`);
        f.shots[at].activeTakeId = op.takeId; break;
      }
      case 'set_trim': {
        const at = shotAt(op.shotId); if (at < 0) return fail('unknown_shot', `no shot ${op.shotId}.`);
        const cur = f.shots[at].trim; const t = zTrim.safeParse({ inSec: op.inSec ?? cur.inSec, outSec: op.outSec === undefined ? cur.outSec : op.outSec });
        if (!t.success) return fail('invalid_trim', issueText(t.error)); f.shots[at].trim = t.data; break;
      }
      case 'set_audio': { const out: FilmAudioTrack[] = [];
        for (const [i, t] of op.tracks.entries()) { const r = zAudioTrack.safeParse({ ...t, id: typeof t.id === 'string' && t.id ? t.id : ctx.newId('aud') }); if (!r.success) return fail('invalid_audio', `tracks[${i}]: ${issueText(r.error)}`); out.push(r.data); }
        f.audio = out; break; }
      case 'set_post': { const r = zPost.safeParse({ ...f.post, ...op.post }); if (!r.success) return fail('invalid_post', issueText(r.error)); f.post = r.data; break; }
      case 'set_cast': { const out: FilmCast[] = [];
        for (const [i, c] of op.cast.entries()) { const r = zCast.safeParse({ ...c, id: typeof c.id === 'string' && c.id ? c.id : ctx.newId('cast') }); if (!r.success) return fail('invalid_cast', `cast[${i}]: ${issueText(r.error)}`); out.push(r.data); }
        f.cast = out; break; }
    }
  }
  return { film: normalizeFilm(f) };
}

// ---------------------------------------------------------------- render (what a shot submits) and stitch (what the cut sends to compose)
/** The fields a shot's render sends to POST /api/tools/h3-video/jobs (and its quote to GET /price): the same object for both, so quote = charge.
 *  files: the library URLs sent as `@file:<field>` (start still → image, bridge end still → lastFrame). */
export function shotSubmit(film: Pick<FilmProject, 'id' | 'aspect'>, s: FilmShot): { fields: Record<string, string>; files: Record<string, string>; missing: string[] } {
  const fields: Record<string, string> = { prompt: s.prompt, types: JSON.stringify(s.types), aspect: s.aspect ?? film.aspect, audio: s.audio ? '1' : '0', filmId: film.id, filmShotId: s.id };
  if (s.durationSec != null) fields.duration = String(s.durationSec); if (s.modelKey) fields.model = s.modelKey; if (s.runOn) fields.runOn = s.runOn; if (s.resolution) fields.resolution = s.resolution;
  if (s.seed != null) fields.seed = String(s.seed); /* negative: kept on the shot as a note; Generate Video has no negative prompt (H3 grammar: state what should appear) */
  const files: Record<string, string> = {}; const missing: string[] = [];
  const needStart = s.types.some((t) => t === 'i2v' || t === 'flf'); const start = s.startFrom.url ?? s.stillUrl;
  if (needStart) { if (start) files.image = start; else missing.push('image'); }
  if (s.types.includes('flf')) { if (s.endFrame?.url) files.lastFrame = s.endFrame.url; else missing.push('lastFrame'); }
  return { fields, files, missing };
}
/** The still a shot starts on (a bridge lands on the next shot's). */
export const startStillOf = (s: FilmShot): { url: string; jobId: string | null } | null => (s.startFrom.url ? { url: s.startFrom.url, jobId: s.startFrom.jobId } : s.stillUrl ? { url: s.stillUrl, jobId: s.stillJobId } : null);
export const activeTakeOf = (s: FilmShot): FilmTake | null => s.takes.find((t) => t.id === s.activeTakeId) ?? null;

const seamType = (t: string) => (t === 'fade' ? 'dip' : t);
/** The POST /api/compose body for the cut: active done takes in shot order with their trims, music / voice, post settings.
 *  Hidden shots and shots with no finished active take are left out and listed in `skipped`; each kept shot's transitionOut becomes the seam into
 *  the next kept shot (compose `seams`: crossfade = picture and sound together, fade = through black, jcut / lcut = a picture cut with the
 *  sound leading or trailing by sec). */
export function filmStitchBody(f: FilmProject): { body: Record<string, unknown>; shotIds: string[]; skipped: { shotId: string; reason: string }[] } {
  const clips: string[] = []; const trims: ({ in?: number; out?: number } | null)[] = []; const shotIds: string[] = []; const skipped: { shotId: string; reason: string }[] = [];
  const outs: (FilmShot['transitionOut'])[] = [];
  for (const s of f.shots) {
    if (s.hidden) { skipped.push({ shotId: s.id, reason: 'hidden' }); continue; }
    const t = activeTakeOf(s);
    if (!t) { skipped.push({ shotId: s.id, reason: s.takes.length ? 'no active take' : 'not rendered yet' }); continue; }
    if (t.status !== 'done' || !t.url) { skipped.push({ shotId: s.id, reason: `its take is ${t.status}` }); continue; }
    clips.push(t.url); shotIds.push(s.id); outs.push(s.transitionOut);
    const cut = s.trim.inSec > 0 || s.trim.outSec != null; trims.push(cut ? { ...(s.trim.inSec > 0 ? { in: s.trim.inSec } : {}), ...(s.trim.outSec != null ? { out: s.trim.outSec } : {}) } : null);
  }
  const music = f.audio.find((a) => a.kind === 'music' && (a.url || a.jobId)); const vo = f.audio.find((a) => a.kind === 'vo' && (a.url || a.jobId));
  const P = f.post; const splitWide = P.transition.type === 'jcut' || P.transition.type === 'lcut';
  const seamsIn = outs.slice(0, -1).map((o) => o ?? (splitWide ? P.transition : null));
  const card = (c: FilmCard | null) => (c ? { text: c.text, style: c.style, mode: c.mode, sec: c.sec } : null);
  const body: Record<string, unknown> = {
    clips, title: f.title, ...(trims.some(Boolean) ? { trims } : {}),
    ...(music ? { audio: music.url ?? music.jobId, musicVolume: music.volume, musicLoop: music.loop } : {}),
    ...(vo ? { voice: vo.url ?? vo.jobId, voiceVolume: vo.volume } : {}),
    keepClipAudio: P.keepClipAudio, duck: P.duck, duckAmount: P.duckAmount, duckClips: P.duck && P.keepClipAudio && !!music,
    normalize: P.normalize, fadeOutSec: P.fadeOutSec, videoFade: P.videoFade,
    /* compose's film-wide transition is cut / crossfade / dip; a film-wide J or L cut goes on every seam instead */
    transition: splitWide ? 'cut' : seamType(P.transition.type), ...(P.transition.type !== 'cut' && !splitWide ? { transitionSec: Math.max(TRANSITION_SEC.min, P.transition.sec || TRANSITION_SEC.default) } : {}),
    /* per seam: the shot's transitionOut into the next kept shot (null = the film-wide one) */
    ...(seamsIn.some(Boolean) ? { seams: seamsIn.map((o) => (o ? { type: seamType(o.type), ...(o.type !== 'cut' ? { sec: Math.max(TRANSITION_SEC.min, o.sec || TRANSITION_SEC.default) } : {}) } : null)) } : {}),
    ...(P.fit ? { fit: P.fit, aspect: f.aspect } : {}), ...(P.clipVolume != null ? { clipVolume: P.clipVolume } : {}),
    ...(card(P.titleCard) ? { titleCard: card(P.titleCard) } : {}), ...(card(P.endCard) ? { endCard: card(P.endCard) } : {}),
  };
  return { body, shotIds, skipped };
}
