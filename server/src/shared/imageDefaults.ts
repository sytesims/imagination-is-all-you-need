/**
 * Per-workflow default models, based on the app's default-model review. Each image feature / workflow names the
 * model it starts on, one for a local GPU and one for a hosted key, with a short line on why (our words).
 * The hosted (cloud) model comes from shared/cloudDefaults.ts, the one table of cloud-first defaults. Isomorphic: the server resolves
 * which one applies (routing/defaults.ts: saved pick > this default for the active setup, if it runs > the first model that runs), and the
 * web marks it "Default" in the picker.
 *
 * Every id here must be a model the feature really offers (imageFeatures providers, and the workflow's /api/image-workflows models list);
 * test/image-defaults.test.ts checks that. `local: null` = no local route is wired for that feature yet.
 */
import type { ImageFeatureId } from './imageFeatures.js';
import { cloudModel } from './cloudDefaults.js';

export interface WorkflowDefaults {
  /** Local (Use local ComfyUI on and the model installed). */ local: string | null;
  /** On a hosted key (Comfy key, or the route's own provider key such as fal). */ hosted: string | null;
  /** Sample server (mock backend, no keys): open on the local pick even with Use local off (Generate Video: LTX-2.5 22B). */ sampleLocal?: boolean;
  /** Tried after `hosted` when `hosted` can't run (Generate Video: Seedance 2.0 on the Comfy key when the Seedance 2.5 lab key is missing). */ hostedFallback?: string | null;
  /** When neither `hosted` nor `hostedFallback` really runs, name `hosted` (true) rather than the fallback (default). Video leaves it off: its fallback is
   *  on the common Comfy key. Voiceover sets it: ElevenLabs is on the Comfy key and the MiniMax Speech fallback needs MiniMax's own key. */ hostedFirstWhenNeither?: boolean;
  /** Used instead of `local` when `local` is too heavy for this computer (Create Image: Z-Image-Turbo on small GPUs). */ localLight?: string | null;
  /** Used instead of `local` on a Mac with Apple Silicon (PyTorch MPS), whose local default can't run there (Generate Video: Wan 2.2 5B instead of MiniMax H3). */ localApple?: string | null;
  /** One short line for the Apple Silicon local pick's hover card (falls back to why.local). */ whyApple?: string;
  /** One short line each, shown on the Default row's hover card. */ why: { local?: string; hosted?: string };
  /** Why the pick differs from the research proposal, if it does (kept for the docs and the report). */ note?: string;
}

const LOCAL_GEN = 'Best free model locally for new images';
const LOCAL_EDIT = 'Best free local model for edits';
const HOSTED_Q = 'Best hosted quality for the price';

export const IMAGE_DEFAULTS: Record<ImageFeatureId, WorkflowDefaults> = {
  'create-image': { local: 'comfy-qwen21', localLight: 'comfy-zimage-turbo', hosted: cloudModel('create-image'), why: { local: LOCAL_GEN, hosted: HOSTED_Q } },
  'edit-image': { local: 'comfy-qwen21', hosted: cloudModel('edit-image'), why: { local: LOCAL_EDIT, hosted: 'Best hosted edits for the price' } },
  upscale: { local: 'comfy-seedvr2-image', hosted: cloudModel('upscale'), why: { local: 'Most detail you can add for free, locally', hosted: 'Most added detail per dollar, up to 8x' } },
  relight: { local: 'comfy-qwen21', hosted: cloudModel('relight'), why: { local: LOCAL_EDIT, hosted: 'Keeps the subject while the light changes' },
    note: 'Sponsors first (2026-10-27): FLUX 3 Image on the Comfy key (shared/cloudDefaults.ts); Nano Banana 2.1 stays in the menu.' },
  'face-swap': { local: 'comfy-qwen21', hosted: cloudModel('face-swap'), why: { local: 'Free two-photo edit locally', hosted: 'Keeps the face and the scene most reliably' } },
  'person-swap': { local: 'comfy-qwen21', hosted: cloudModel('person-swap'), why: { local: 'Free two-photo edit locally', hosted: 'Keeps the person and the scene most reliably' } },
  'character-sheet': { local: 'comfy-qwen21', hosted: cloudModel('character-sheet'), why: { local: 'Free and consistent across panels locally', hosted: 'Keeps one character the same across panels' } },
  'product-shot': { local: 'comfy-qwen21', hosted: cloudModel('product-shot'), why: { local: 'Free product scenes locally', hosted: 'Keeps the product exact for the price' } },
  'camera-angles': { local: 'comfy-qwen-angles', hosted: cloudModel('camera-angles'), why: { local: 'Built for new camera angles: free, locally', hosted: 'Holds the subject steady across angles' } },
  'camera-lens': { local: 'comfy-qwen21', hosted: cloudModel('camera-lens'), why: { local: LOCAL_GEN, hosted: 'Follows camera and lens wording closely' } },
  'brush-edit': { local: 'comfy-flux3-klein', hosted: cloudModel('brush-edit'), why: { local: 'Fast masked edits for free, locally', hosted: 'Cleanest masked edits we route' } },
  'remove-bg': { local: null, hosted: cloudModel('remove-bg'), why: { hosted: 'Clean cut-outs, made for this job' } },
  expand: { local: null, hosted: cloudModel('expand'), why: { hosted: 'Made for extending photos' } },
  erase: { local: null, hosted: cloudModel('erase'), why: { hosted: 'Made for removing objects' } },
  'try-on': { local: null, hosted: cloudModel('try-on'), why: { hosted: 'Made for trying on clothes' } },
  'image-layers': { local: 'comfy-qwen-image-layered', hosted: cloudModel('image-layers'), why: { local: 'Free layers locally once its files are downloaded', hosted: 'Fast, low-cost layer splits' } },
};

export type DefaultSetup = 'local' | 'hosted';
/** What the resolver needs to know about one model (routing/defaults.ts ModelStatus fits). */
export interface DefaultModelState { runnable: boolean; demo: boolean; routeKind: string | null; reasonCode: string | null; reason: string | null }
export interface EditorialPick {
  /** The default for the active setup (null = the feature has none for any setup). */ id: string | null; setup: DefaultSetup | null;
  /** It runs now (a real run, or the sample run on a keyless try-it server). */ runs: boolean;
  /** Why it can't run (null when it runs). */ reason: string | null; why: string | null;
}
const runsHere = (s: DefaultModelState | undefined, local: boolean) => !!s && (s.runnable || s.demo) && (local ? s.routeKind === 'local' : s.routeKind !== 'local');
/** The hosted default that really runs: `hosted`, else `hostedFallback` when that one runs. A sample run (keyless mock server) is not a real run when
 *  the workflow has a fallback: with neither really running, `hostedFallback` (the common Comfy key) wins over a `hosted` default that needs a rarer lab
 *  key. Without a fallback, `hosted` stays (its reason is shown; a sample run still counts as running, as for the image features). */
const realRun = (s: DefaultModelState | undefined) => !!s && s.runnable && s.routeKind !== 'local';
const hostedOf = (d: WorkflowDefaults, state: (id: string) => DefaultModelState | undefined) => {
  const real = [d.hosted, d.hostedFallback].find((id) => !!id && (d.hostedFallback ? realRun(state(id)) : runsHere(state(id), false)));
  return real ?? (d.hostedFallback && !d.hostedFirstWhenNeither && state(d.hostedFallback) ? d.hostedFallback : d.hosted);
};
/**
 * Pick the editorial default for the active setup. `useLocal` = Use local ComfyUI is on (the user's "run on" preference): with it on, the
 * local default wins when it runs; otherwise the hosted default (a key) wins, and local only when there is no hosted default.
 * When neither runs, the default for the user's setup is still named (with its reason), and the caller falls back to the first that runs.
 */
export function pickEditorial(d: WorkflowDefaults | undefined, state: (id: string) => DefaultModelState | undefined, useLocal: boolean, opts: { apple?: boolean } = {}): EditorialPick {
  if (!d) return { id: null, setup: null, runs: false, reason: null, why: null };
  let L = d.local; if (L && d.localLight && state(L)?.reasonCode === 'too_heavy' && state(d.localLight)) L = d.localLight;
  const apple = !!(opts.apple && d.localApple && state(d.localApple)); if (apple) L = d.localApple!; // Apple Silicon: the Mac-safe local model
  const whyOf = (setup: DefaultSetup) => (setup === 'local' && apple ? d.whyApple ?? d.why.local : d.why[setup]) ?? null;
  const H = hostedOf(d, state); const lOk = !!L && runsHere(state(L), true); const hOk = !!H && (d.hostedFallback ? realRun(state(H)) : runsHere(state(H), false));
  const at = (id: string, setup: DefaultSetup, runs: boolean): EditorialPick => ({ id, setup, runs, reason: runs ? null : state(id)?.reason ?? 'Not available here', why: whyOf(setup) });
  if (useLocal && lOk) return at(L!, 'local', true);
  if (hOk) return at(H!, 'hosted', true);
  if (lOk && (!H || !state(H))) return at(L!, 'local', true); // no hosted default here (none, or hidden: open-weights-only mode)
  const id = useLocal && L && state(L) ? L : H && state(H) ? H : L && state(L) ? L : null;
  return id ? at(id, id === L ? 'local' : 'hosted', false) : { id: null, setup: null, runs: false, reason: null, why: null };
}
/** The feature a tool's mode runs as (Create Image: generate / edit / inpaint; app tools: their one feature). */
export const featureForToolMode = (features: { id: ImageFeatureId; toolId: string; inMenu: boolean }[], toolId: string, mode: string | null): ImageFeatureId | null => {
  if (toolId === 'create-image') return mode === 'edit' ? 'edit-image' : mode === 'inpaint' ? 'brush-edit' : 'create-image';
  return features.find((f) => f.toolId === toolId)?.id ?? null;
};
/** The static table for clients (GET /api/image-workflows `defaults`, GET /api/image-features). */
export const defaultsOfFeature = (id: string): WorkflowDefaults | null => (IMAGE_DEFAULTS as Record<string, WorkflowDefaults>)[id] ?? null;
