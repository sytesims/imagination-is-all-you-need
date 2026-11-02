/**
 * Clip trimmer (2026-11-03): the ONE place that says how long a part of the source clip each video tool and model takes, and the one wrapper that
 * lets every tool with a clip take a trimStart / trimEnd range.
 *
 *   clipTrimLimits(toolId, providerId)  shortest and longest range, whole seconds. The model's own rule first (H3 Character Swap 2–15 s, Wan Animate 2,
 *                                       the per-model input limits in shared/videoFit.ts), then the tool's (Swap Two People, the Edit Video tools,
 *                                       Extend), else the shared upload limits (shared/mediaAccept.ts LIMITS). GET /api/tools lists it per model
 *                                       (providers[].clipSec), so the web's Trim sheet never carries its own numbers.
 *   withClipTrim(tool)                  a tool with a clip that doesn't cut a range itself gets trimStart / trimEnd: the same cut as Video Swap
 *                                       (tools/videoSwap.ts applySwapTrim) runs before its own parse, so the job, its checks and its price see only
 *                                       the range.
 */
import type { ToolDef } from './tools/types.js';
import { LIMITS } from './shared/mediaAccept.js';
import { videoInputLimits } from './shared/videoFit.js';
import { EXTEND_MAX_SEC, LTX25_EXTEND_ID } from './shared/clipLimits.js';
import { swapRangeSeconds } from './shared/cloudSwap.js';
import { CHARSWAP_CLOUD_SECONDS } from './comfy/h3CharSwapCloud.js';
import { TWO_SWAP_SECONDS } from './comfy/h3TwoPersonSwapCloud.js';
import { WA2_PROVIDER, WA2_MIN_SECONDS, WA2_MAX_SECONDS } from './comfy/wanAnimate2Cloud.js';
import { EDIT_VIDEO_LIMITS } from './tools/editVideo/index.js';
import { EDIT_MODELS } from './tools/promptEdit.js';
import { FINISH_TOOL, FINISH_MIN_SECONDS, FINISH_MAX_SECONDS } from './shared/finishPresets.js';
import { FOOTAGE_FX_TOOL, FOOTAGE_FX_MAX_SECONDS } from './shared/footageFx.js';
import { CROSSVIEW_PROVIDER, CROSSVIEW_SECONDS } from './shared/crossview.js';

export interface ClipTrimLimits { min: number; max: number }
type Span = { min?: number; max?: number };

/** Models whose range rule lives in their own module (not in shared/videoFit.ts VIDEO_INPUT_LIMITS). */
const byProvider = (id: string): Span | null => {
  if (id === 'comfy-h3-charswap') return CHARSWAP_CLOUD_SECONDS;
  if (id === WA2_PROVIDER) return { min: WA2_MIN_SECONDS, max: WA2_MAX_SECONDS };
  if (id === CROSSVIEW_PROVIDER) return { min: CROSSVIEW_SECONDS.padFrom /* a 4 s take is padded to 5 s */, max: CROSSVIEW_SECONDS.max }; // Re-shoot · H3 CrossView: 5–15 s
  const em = EDIT_MODELS[id]; if (em) return { min: em.minSec, max: em.maxSec }; // Prompt Edit: Bernini-R 1–5 s (a longer clip used its first 5 s), Kling 4.0 3–30 s
  return null;
};
/** Tools with a rule of their own. */
const byTool = (toolId: string, providerId: string): Span | null => {
  if (toolId === 'two-person-swap') return TWO_SWAP_SECONDS;
  if (toolId === FINISH_TOOL) return { min: FINISH_MIN_SECONDS, max: FINISH_MAX_SECONDS }; // Finish: up to 20 s (a longer clip used its start)
  if (toolId === FOOTAGE_FX_TOOL) return { min: 1, max: FOOTAGE_FX_MAX_SECONDS }; // Footage Effects: 5 s a run (a longer clip used its start; parse takes ≥ 0.7 s)
  if (toolId === 'h3-extend' && providerId === LTX25_EXTEND_ID) return { min: 1, max: EXTEND_MAX_SEC }; // LTX-2.5 Extend checks its own source rule (ownLimits)
  const ev = EDIT_VIDEO_LIMITS[toolId]; return ev ? { min: ev.minSeconds, max: ev.maxSeconds } : null;
};

/** The range a tool takes on a model: whole seconds, min ≤ max. */
export function clipTrimLimits(toolId: string, providerId?: string | null): ClipTrimLimits {
  const pid = providerId ?? '';
  const vl = pid ? videoInputLimits(toolId, pid) : null;
  const spans = [pid ? byProvider(pid) : null, vl && (vl.minSec || vl.maxSec) ? { min: vl.minSec, max: vl.maxSec } : null, byTool(toolId, pid)].filter((s): s is Span => !!s);
  const mins = spans.map((s) => s.min).filter((n): n is number => Number.isFinite(n)); const maxes = spans.map((s) => s.max).filter((n): n is number => Number.isFinite(n));
  const min = Math.max(1, Math.ceil(mins.length ? Math.max(...mins) : LIMITS.minSec));
  const max = Math.max(min, Math.floor(maxes.length ? Math.min(...maxes) : LIMITS.maxSec));
  return { min, max };
}

/** The tool whose range rule applies: an app (Draft Upscale, Anime Restyle…) takes its base tool's. */
export const trimToolId = (t: Pick<ToolDef, 'id'> & { app?: any }): string => t.app?.gallery?.base ?? t.id;
const hasClip = (t: ToolDef) => t.inputs.some((i) => i.name === 'video' && i.kind === 'file');
const cutsItself = (t: ToolDef) => t.inputs.some((i) => i.name === 'trimStart');

/** Give a tool with a clip the shared range (trimStart / trimEnd). Tools that already cut it themselves (Video Swap, Swap Two People) are left as
 *  they are. A range is billed as its own length, as the quote sends it (quote = charge). */
export function withClipTrim(tool: ToolDef): ToolDef {
  if (!hasClip(tool) || cutsItself(tool)) return tool;
  tool.inputs = [...tool.inputs, { name: 'trimStart', kind: 'number' }, { name: 'trimEnd', kind: 'number' }];
  const parse = tool.parseInput.bind(tool);
  tool.parseInput = async (fields, files) => {
    const { applySwapTrim } = await import('./tools/videoSwap.js');
    const t = await applySwapTrim(fields, files, clipTrimLimits(trimToolId(tool), fields.provider)); if ('error' in t) return t as any;
    const r: any = await parse(fields, files);
    if (!t.trim || !r || typeof r !== 'object' || 'error' in r) return r;
    /* the clip's seconds (probed from the cut, e.g. 11.02) become the range's own (11), as quoted; a duration that means something else (Extend's
       added seconds) is left alone */
    const len = swapRangeSeconds(t.trim); const d = Number(r.duration);
    return { ...r, trim: t.trim, ...(Number.isFinite(d) && Math.abs(d - len) < 0.5 ? { duration: len } : {}) };
  };
  return tool;
}
