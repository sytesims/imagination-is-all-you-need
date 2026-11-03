/**
 * Comfy Cloud's own maximum runtime per workflow (docs.comfy.org/development/deploy/cloud-usage, "Runtime and queue limits", read 3 Nov 2026):
 * Standard 30 min, Creator 30 min, Pro 1 hour. Cloud cancels a run past it by itself; the app never stops a Cloud run earlier
 * (config.cloudSafetyNetMs only catches a job that never ends). Shared by the server (the failure reason) and the web (the note before Generate).
 */
export const CLOUD_MAX_RUN_MIN = { standard: 30, creator: 30, pro: 60 } as const;
/** The plain words for it. */
export const CLOUD_LIMIT_TEXT = 'Comfy Cloud stops a run after 30 min (1 hour on the Pro plan)';
/** A run that ended this close to the shortest limit was most likely stopped by it. */
export const nearCloudLimit = (runMs: number) => runMs >= (CLOUD_MAX_RUN_MIN.standard - 1) * 60_000;
/** The calm note before Generate when a Comfy Cloud run's estimate (its high end, seconds) comes near the shortest limit (2/3 of 30 min); else null. */
export function cloudLimitNote(highSec: number | null | undefined): string | null {
  const s = Number(highSec); if (!(s >= CLOUD_MAX_RUN_MIN.standard * 60 * (2 / 3))) return null;
  return `This may take about ${Math.max(1, Math.round(s / 60))} min. ${CLOUD_LIMIT_TEXT}.`;
}
