/**
 * Runnable gate (Oct 18, plan change 4 / conflict 1). A route is runnable only when a live executor exists for it:
 *  - fal / Replicate (falRun / replicateRun, image builders or the route's own `request`), official lab APIs (`direct`: BFL, MiniMax, LTX),
 *  - the Comfy Cloud workflow runner (CLOUD_RUNNER_ROUTES: cloud-h3-wf, cloud-ltx-camera, cloud-reshoot; real whenever a Comfy key is set),
 *  - the Comfy Router runner (ROUTER_RUNNER_ROUTES: comfy-router:<id> for every model in routing/routerModels.ts; real whenever a Comfy key is set),
 *  - local routes (0 credits: native plan, legacy ComfyUI runner, or this-computer ffmpeg / whisper; the mock backend renders samples).
 * Every other cloud route (partner models not on Comfy Router, Comfy Cloud API nodes and not-yet-run workflows, MiniMax / DashScope / other
 * direct APIs) only has the hostedMock executor: with its key set it reports reason 'not available on this server yet' / reasonCode 'not_wired', so Auto and
 * fallback never pick it and a pinned submit gets 409 route_not_runnable with nothing charged. Keyless, it stays key_missing, so the
 * mock-backend demo preview (free) still works.
 */
import type { RouteDef } from './types.js';
import { config } from '../config.js';
import { env, FILMING } from '../env.js';
import { ROUTER_RUNNER_ROUTES } from './routerModels.js';
export { ROUTER_RUNNER_ROUTES };
/** B2: the Comfy Cloud workflow routes with a real runner (keys of comfy/cloudWorkflows.ts CLOUD_WORKFLOWS; test cloud-runner asserts they match). */
export const CLOUD_RUNNER_ROUTES = new Set(['comfy-cloud:cloud-ltx25-fast-api', 'comfy-cloud:cloud-ltx25-pro-api', 'comfy-cloud:cloud-infinitetalk', 'comfy-cloud:cloud-h3-extend', 'comfy-cloud:cloud-ltx25-layout', 'comfy-cloud:cloud-h3-wf', 'comfy-cloud:cloud-ltx-camera', 'comfy-cloud:cloud-reshoot', /* H3 runner Step 1: the user's own Comfy deployment */ 'comfy-deploy:deploy-smoke', 'comfy-deploy:cloud-h3-crossview' /* Step 3 */, 'comfy-cloud:cloud-h3-charswap' /* Oct 26: H3 Character Swap · Comfy Cloud (imported LoRA) */, 'comfy-cloud:cloud-ltx25-video', 'comfy-cloud:cloud-ltx25-extend' /* Oct 27: LTX-2.5 22B · Comfy Cloud */, 'comfy-cloud:cloud-minimax-music' /* Oct 27: MiniMax Music 3 · Comfy Cloud */, 'comfy-cloud:cloud-ltx23-vfx' /* Oct 27: Footage Effects · Comfy Cloud */, 'comfy-cloud:cloud-h3-fast' /* Oct 27: MiniMax H3 Fast · Comfy Cloud */, 'comfy-cloud:cloud-h3-keyframes' /* Oct 27: MiniMax H3 Keyframes · Comfy Cloud */]);
/** The Comfy Cloud workflow runner is real whenever a Comfy key is set (any backend): with a key these routes are runnable and every run goes
 *  to Comfy Cloud (never a mock render, so nothing is charged for mock output). Without a key they stay key_missing (needsKey; on the mock backend
 *  the sample run). cloudRunnerLive() is kept for callers that ask whether the backend itself is live. */
export const cloudRunnerLive = () => config.backend !== 'mock' || /^(1|true)$/i.test(env('ROUTING_LIVE') ?? '') || FILMING.on;
/** BUG-HUNT-10 PB re-check 2: plain user copy (reasonCode stays 'not_wired'). As a reason chip: "Not available on this server yet". */
export const NOT_WIRED_REASON = 'not ready in this app yet';
/** Sentence for 409s / notices: "<label> isn't available on this server yet." */
export const notWiredSentence = (label: string) => `${label.replace(/\bComfy Router\b/g, 'Comfy Cloud')} isn’t ready yet. Pick another model.`;
export function routeRunnable(r: Pick<RouteDef, 'kind' | 'routeId' | 'direct' | 'request' | 'routerOff'> & { cloudRun?: unknown }): boolean {
  if (r.kind === 'local' || r.kind === 'fal' || r.kind === 'replicate') return true;
  if (r.direct) return true; // official lab APIs (providers/direct.ts)
  if (r.cloudRun) return true; // 3D: a partner-node graph this route runs on Comfy Cloud itself (tools/threeD.ts)
  return CLOUD_RUNNER_ROUTES.has(r.routeId) || (ROUTER_RUNNER_ROUTES.has(r.routeId) && !r.routerOff); // + Comfy Router models (routing/routerModels.ts, routerRun.ts)
}
/** BH P3 (Oct 18): route reasons in plain words (no field=value, mode ids or env names). reasonCode / reasonDetail keep the machine form. */
export const LOCAL_UNREACHABLE_REASON = "ComfyUI isn’t running on your computer";
/** HW-SHAPES B3: a local route that needs more graphics memory than this computer has (reasonCode 'too_heavy'; reasonDetail = the fit reason). */
export const TOO_HEAVY_REASON = 'Too heavy for your computer';
/** A local route that runs, but slowly on this computer (fit verdict 'slow'). */
export const SLOW_LOCAL_NOTE = 'Free on your computer, but slow';
export const OPEN_WEIGHTS_ONLY_REASON = 'Hidden while Open models only is on';
export const NO_PRICE_REASON = 'Off until we can show you its exact price';
/** Comfy Cloud workflow rows whose price is a placeholder (hostedPrices priceUnmeasured): Comfy bills GPU-seconds incl. model load, which only a
 *  measured run can tell. Since 2026-10-27 (user: "remove this from the app") they run by default on their estimate, shown as an estimate;
 *  OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD=0 holds them again (the reason below). Sample runs (no key) are unaffected. */
export const UNMEASURED_PRICE_REASON = "Off until we can show you its exact price. Comfy Cloud bills by the second";
export const allowUnmeasuredCloud = () => !/^(0|false|off|no)$/i.test(env('ALLOW_UNMEASURED_CLOUD') ?? '');
/** Oct 19 (BH P3): a local route while Settings → Use local ComfyUI is off (reasonCode stays 'local_off'). */
export const LOCAL_OFF_REASON = 'Turn on Your computer in Settings to run this here';
/** Oct 19 b2 (DP #4): the secondary line under LOCAL_OFF_REASON (reasonDetail on local_off routes). */
export const LOCAL_OFF_DETAIL = "Your computer isn’t the default while it’s off. Turn it on, or pick Your computer in Run on.";
/** Oct 19 b2 (DP #1): a local route the user picked runs even with Use local off (reasonCode 'local_pinned', runnable). */
export const LOCAL_PINNED_REASON = 'Runs on your computer because you picked it';
/** Re-check 6 (BH P2): with Use local off, Auto runs a local route because nothing else can run this job on this server (mock backend only). */
export const LOCAL_AUTO_REASON = 'Free on your computer. Nothing else can run this here';
/** Oct 19 b2 (DP #2): a model whose only route is local runs locally even with Use local off (reasonCode 'local_only', runnable). */
export const LOCAL_ONLY_REASON = 'Runs on your computer. There’s no cloud version of this model';
/** Oct 19 (BH P3): a keyless cloud route running as a demo preview on the mock backend (reasonCode stays 'key_missing'). */
export const demoReason = (owner: string) => `You’ll get a free sample. Real runs need a ${owner} key in Settings → Connections`;
const MODE_WORDS: Record<string, string> = { t2v: 'text to video', i2v: 'image to video', flf: 'first and last frame', r2v: 'reference images', lipsync: 'talking photo', generate: 'new images from a prompt', edit: 'image edits',
  extend: 'extending a clip', 'character-1': 'one character', 'character-multi': 'several characters', voiceover: 'voiceover', 'change-voice': 'voice changes', translate: 'translation' };
const orList = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}` : xs[0] ?? '');
/** 'only t2v/i2v on this route' → 'This route only does text to video or image to video'; H3 camera moves → 'This route only runs the H3 camera moves'. */
export function modesReason(modes: string[]): string {
  if (modes.length && modes.every((m) => /^h3-/.test(m))) return 'This route only runs the H3 camera moves';
  return `This route only does ${orList(modes.map((m) => MODE_WORDS[m] ?? m.replace(/[-_]/g, ' ')))}`;
}
/** A reason as one sentence: capital first letter, one full stop. */
export const reasonSentence = (r: string) => { const t = String(r ?? '').trim().replace(/[.\s]+$/, ''); return t ? `${t[0].toUpperCase()}${t.slice(1)}.` : ''; };
