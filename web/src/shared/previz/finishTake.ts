import type { PlanShot } from '../../../../server/src/shared/previzTemplates';

/** Finish only an idle, successfully saved take; never silently fall back to an older selected camera. */
export function chooseFinishedTake(shot: PlanShot, id: string, phase: 'free' | 'count' | 'rec'): PlanShot | null {
  const path = shot.cameraPath;
  if (phase !== 'free' || !path?.takes.some((take) => take.id === id)) return null;
  return { ...shot, cameraPath: { ...path, chosen: id } };
}
