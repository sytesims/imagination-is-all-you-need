/**
 * Film (2026-10-27): the FilmProject document and its ops, from the one shared definition the server uses (server/src/shared/filmProject.ts).
 * The page also uses its pure helpers: applyOps (edits shown before the server answers), filmStitchBody (what Stitch and the rough cut
 * leave out) and shotSubmit (what a card still needs before it can render).
 */
import type { FilmShot, FilmAudioTrack } from '../../../../server/src/shared/filmProject';
export type { FilmProject, FilmShot, FilmTake, FilmSummary, FilmOp, FilmPost, FilmCard, ShotStatus, TakeStatus, OpError } from '../../../../server/src/shared/filmProject';
export { applyOps, filmStitchBody, shotSubmit, startStillOf, zShot, BRIDGE_DEFAULTS, FILM_VIDEO_TOOL, FILM_MAX_SHOTS, FILM_ASPECTS } from '../../../../server/src/shared/filmProject';
export type FilmAudio = FilmAudioTrack;
export type AudioKind = FilmAudioTrack['kind'];
export type FilmTransition = NonNullable<FilmShot['transitionOut']>;
export type TransitionType = FilmTransition['type'];
/** GET /api/films/samples items */
export interface FilmSample { name: string; title: string; note: string | null; available: boolean; missingJobs: string[]; shotCount?: number; aspect?: string | null }
