/**
 * Why a run can't start, as ONE short reason and at most two actions (Generate area option A, 2026-11-02). Pure, so a unit test reads it.
 * The words are not new: they are the pre-flight list's own (server/src/shared/preflight.ts: the quote's setup step, a refused model, no
 * price), which the server builds from routing/defaults.ts + routing/select.ts. Only "nothing connected" has its own line, the Welcome's.
 * Generate itself never carries any of this: it always says "Generate" (+ the price) and is greyed while `blocks` is true.
 * Inputs (a prompt, a photo) are not a reason here: Generate's own click points at the empty field.
 */
import type { PreflightProblem } from '../../../server/src/shared/preflight';

export type SetupKind = 'cloud' | 'local' | 'both' | 'none';
/** connect = the one connect sheet · cloud = the Comfy key card · fix = the problem's own step · more = every place (setup popover) ·
 *  details = the "Before you generate" list · settings = Settings → Connections · anyway = run a too-big model after a warning */
export type GenActKind = 'connect' | 'cloud' | 'fix' | 'more' | 'details' | 'settings' | 'anyway';
export interface GenAct { kind: GenActKind; label: string }
export interface GenReasonSpec { code: string; reason: string; blocks: boolean; primary: GenAct | null; alt: GenAct | null; problem?: PreflightProblem }
/** The place a setup step is for (the shared SetupPlace's shape, without the UI types). */
export interface PlaceLite { runOn: string; action: { kind: string } }

export const COMFY_DOWN = 'ComfyUI isn’t open on this computer'; /* the Welcome's words (ui/setup/WelcomeParts.tsx) */
export const NO_PLACE = 'Set up a place to run first';
const CLOUD = 'comfy-cloud';
const FIX_LABEL: Record<string, string> = { 'add-key': 'Add key', 'turn-on': 'Turn on', 'install-node': 'How to install' };

/** Memory for a local run: the free-memory check now (server/src/shared/thisComputer.ts memoryCheck: block = shared memory, can freeze) or the
 *  route's own fit (requirements.ts: too big for this computer's memory). `accepted` = the user said Run anyway for this model. */
export interface MemLite { text: string; block: boolean; accepted?: boolean }

export function reasonOf(i: { setupKind: SetupKind | null; problems: PreflightProblem[]; places: PlaceLite[]; mem?: MemLite | null;
  /** the model has no place at all (no quote, no default route) */ noPlace?: boolean; /** the quote said no_connection */ noConnection?: boolean;
  /** the caller can open its "Before you generate" list */ canDetails?: boolean }): GenReasonSpec | null {
  const p = i.problems.find(x => x.stage !== 'inputs');
  const cloudAlt: GenAct = { kind: 'cloud', label: 'Use Comfy Cloud' };
  if (i.setupKind === 'none' && (i.noConnection || i.noPlace || i.places.length > 0 || p?.stage === 'setup'))
    return { code: 'no_connection', reason: COMFY_DOWN, blocks: true, primary: { kind: 'connect', label: 'Set up ComfyUI' }, alt: cloudAlt };
  if (!p) {
    if (i.noPlace) return { code: 'no_place', reason: NO_PLACE, blocks: true, primary: { kind: 'settings', label: 'Set up' }, alt: null };
    if (!i.mem) return null;
    /* too big for shared memory: it can freeze the computer, so the cloud first and Run anyway only after a warning */
    if (i.mem.block && !i.mem.accepted) return { code: 'too_big', reason: i.mem.text, blocks: true, primary: cloudAlt, alt: { kind: 'anyway', label: 'Run anyway…' } };
    return { code: 'memory_short', reason: i.mem.text, blocks: false, primary: i.mem.accepted ? null : cloudAlt, alt: null };
  }
  const details: GenAct | null = i.canDetails ? { kind: 'details', label: 'See what to fix' } : null;
  if (p.stage !== 'setup') return { code: p.code, reason: p.message, blocks: true, primary: details, alt: null, problem: p };
  const runOn = String(p.fix.args?.runOn ?? '');
  /* ComfyUI is what's missing for a local-only model: the same connect sheet */
  const local = p.fix.kind === 'set-up' && runOn === 'local';
  const primary: GenAct = local ? { kind: 'connect', label: 'Set up ComfyUI' } : { kind: 'fix', label: FIX_LABEL[p.fix.kind] ?? p.fix.label };
  const alt: GenAct | null = runOn !== CLOUD && i.places.some(x => x.runOn === CLOUD) ? cloudAlt
    : i.places.length > 1 ? { kind: 'more', label: 'More ways' } : null;
  return { code: p.code, reason: p.message, blocks: true, primary, alt, problem: p };
}
