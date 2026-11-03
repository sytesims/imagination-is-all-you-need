/**
 * What the Trim sheet says about a swap range (2026-11-03). The range itself is the bar's (VideoWorkflowBar: the shared Trim sheet, shared/TrimSheet.tsx,
 * opened from the clip thumbnail, with the model's own limits from the server); the swap workflows only add their words: how a cloud swap runs the
 * range (passes of ≤ 10 s on Kling), that Who to swap and the first frame follow the range start, and the cloud motion notes.
 * (Until 2026-11-03 this file held a "Range" chip and popover of its own.)
 */
import type { BarExtra } from './types';
import { clock } from '../../../shared/TrimRange';
import { cloudSwapOf, passNote, MOTION_GENERATION_NOTE, MOTION_AUDIO_NOTE, SEEDANCE_TASK_NOTE } from '../../../../../server/src/shared/cloudSwap';

export function swapTrimNote(o: { motion?: boolean; /** the who-to-swap frame follows the start (Person swap) */ who?: boolean } = {}): NonNullable<BarExtra['trimNote']> {
  return (c, r) => { const cs = cloudSwapOf(c.prov); const len = r.end - r.start; const more: string[] = [];
    if (cs && o.motion) more.push(MOTION_GENERATION_NOTE, MOTION_AUDIO_NOTE);
    if (c.prov === 'router-seedance-25-edit') more.push(o.motion ? 'Output framing: adaptive (model-selected), not locked to the source.' : 'Edits the source scene: replacement and preservation are instructions, not a verified guarantee. Sound on keeps the original soundtrack; off is silent.', SEEDANCE_TASK_NOTE);
    if (cs && !o.motion && len > cs.maxPassSec) more.unshift(passNote(cs, len));
    return { note: o.who && r.start > 0 ? `Who to swap and the first frame now start at ${clock(r.start)}.` : null, more }; };
}
