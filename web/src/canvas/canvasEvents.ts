/** Window events the board's pieces use to talk to each other (kept out of the .tsx view files so hot reload stays a Fast Refresh). */

/** The board listens for this to open the shared 3D viewer (a double-click or "View 3D" on a 3D card). */
export const OPEN_3D_EVENT = 'ohf-canvas-open-3d';
export const open3d = (jobId: string) => dispatchEvent(new CustomEvent(OPEN_3D_EVENT, { detail: { jobId } }));

/** A quick action asks its new card to open one of its settings groups (Relight opens the light controls). */
export const OPEN_GROUP_EVT = 'ohf-canvas-open-group';

/** The board asks a card to run (Enter on a selected card). Only explicit run presses send it. */
export const RUN_EVT = 'ohf-canvas-run';
export const runCard = (cardId: string) => dispatchEvent(new CustomEvent(RUN_EVT, { detail: { cardId } }));
