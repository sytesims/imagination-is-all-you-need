import { chosenTake, PREVIZ_MOVES, takeShotSeconds, type PlanShot } from '../../../../server/src/shared/previzTemplates';
import { isPerformance } from '../../../../server/src/shared/previzActor';

/** Explain the exported shot clock separately from the longer editable source take. */
export function mockupSummary(shot: PlanShot): string {
  const take = chosenTake(shot);
  if (!take) return `${PREVIZ_MOVES.find((m) => m.id === shot.move)?.label ?? 'Preset'} camera`;
  const end = Math.min(take.trimEnd, take.trimStart + shot.seconds * take.speed);
  const length = takeShotSeconds(take);
  const tail = length > shot.seconds + 0.05 ? ' (remaining action not included)' : length < shot.seconds - 0.05 ? ' (holds at the end)' : '';
  return `${take.name}${isPerformance(take) ? ' · follow camera' : ''} · take ${take.trimStart.toFixed(1)}–${end.toFixed(1)} s${tail}`;
}
