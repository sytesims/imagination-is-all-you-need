/**
 * B2 (Oct 19): the Comfy Cloud workflow registry, one entry per runnable Comfy Cloud workflow route.
 * Each route names its local twin (the provider whose plan builder already drives the same graph locally) and maps every local
 * workflow file it may use to its graph in workflows/cloud/. A cloud run builds the twin's plan, then swaps each pass onto the cloud
 * graph: the cloud graph's own widget values (e.g. H3's fp16 VAE) replace the local defaults, while every value the plan builder set
 * (prompt, seed, frames, size, LoRA, uploaded files) is kept. A pass whose workflow has no cloud graph is refused before anything is
 * uploaded or submitted, so a cloud route never runs a graph that was not validated for Comfy Cloud (workflows/cloud/README.md).
 * Transport: comfy/cloudV2.ts (public Comfy API v2, docs.comfy.org/api-reference/v2). Runnable only with a key on a live backend (routing/runnable.ts).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { WORKFLOWS_DIR } from '../config.js';
import { buildPlan, setIn, planModelKeyOf, type Plan } from './plans.js';
import { withRefGrammar } from '../shared/promptRefs.js';
import { CROSSVIEW_GRAPH, CROSSVIEW_REQUIRES, crossviewPlan } from './crossview.js';
import { LTX25_CLOUD_PROVIDER, LTX25_CLOUD_ROUTE, LTX25_CLOUD_EXTEND_PROVIDER, LTX25_CLOUD_EXTEND_ROUTE, LTX25_CLOUD_GRAPHS, LTX25_CONTINUE_GRAPH, LTX25_CLOUD_REQUIRES, ltx25CloudPlan, ltx25CloudPreflight } from './ltx25Cloud.js';
import { LTX25_DFR_CLOUD_GRAPH } from './ltx25Dfr.js';
import { LAYOUT_CLOUD_PROVIDER, LAYOUT_CLOUD_ROUTE, LAYOUT_CLOUD_GRAPH, LAYOUT_CLOUD_REQUIRES, LAYOUT_LORA_MISSING, layoutCloudPlan, checkLayoutLora } from './ltx25LayoutCloud.js';
import { H3X_CLOUD_GRAPH, H3X_CLOUD_LABEL, H3X_CLOUD_PROVIDER, H3X_CLOUD_REQUIRES, H3X_CLOUD_ROUTE, h3xCloudPlan, prepareH3xCloud } from './h3ExtendCloud.js';
import { VFX_CLOUD_PROVIDER, VFX_CLOUD_ROUTE, VFX_CLOUD_GRAPHS, VFX_CLOUD_REQUIRES, VFX_CLOUD_NAME, vfxCloudPlan } from './ltx23VfxCloud.js';
import { H3F_PROVIDER, H3F_ROUTE, H3F_GRAPHS, H3F_REQUIRES, H3F_NAME, H3F_MISSING, h3FastPlan, checkH3FastModel } from './h3FastCloud.js';
import { PIKA_PROVIDER, PIKA_ROUTE, PIKA_GRAPHS, PIKA_REQUIRES, PIKA_NAME, pikaPlan, pikaPreflight } from './pikaH3Flex.js';
import { H3KF_PROVIDER, H3KF_ROUTE, H3KF_GRAPH, H3KF_REQUIRES, H3KF_NAME, h3KeyframesPlan } from './h3KeyframesCloud.js';
import { IT_ROUTE, IT_PROVIDER, IT_GRAPH, IT_REQUIRES, infiniteTalkPlan } from './infiniteTalkCloud.js';
import { LTX_API_CLOUD, LTX_API_TEMPLATES, LTX_API_NODE, ltxApiCloudPlan, prepareLtxApiCloud } from './ltx25ApiCloud.js';
import { CHARSWAP_CLOUD_GRAPH, CHARSWAP_CLOUD_PROVIDER, CHARSWAP_CLOUD_REQUIRES, CHARSWAP_CLOUD_ROUTE, CHARSWAP_LORA_MISSING, charswapCloudPlan, checkCharswapLora, checkCharswapTurbo } from './h3CharSwapCloud.js';

export interface CloudWorkflowRoute {
  /** Route id in the routing table. */ routeId: string;
  /** Provider id of the Comfy Cloud model. */ provider: string;
  /** Provider whose plan builder produces the same graphs locally. */ twin: string;
  /** Local workflow file → workflows/ relative cloud graph. */ files: Record<string, string>;
}
/**
 * H3 runner Step 1 (Oct 26): a STANDALONE cloud workflow, a graph with no local twin (custom nodes and LoRAs that only live in the user's own
 * Comfy API deployment, e.g. MiniMax H3 character swap / CrossView). It has its own plan builder, so cloudOverrides' node-for-node check does not
 * apply. target 'deploy' = it runs on the user's deployment (comfy/deploy.ts: COMFY_DEPLOY_URL, or COMFY_RUNNER_URL), never on shared Comfy Cloud.
 * requires = what the deployment must have; the free probe (GET /api/comfy-deploy/probe) checks it against the host's object_info.
 * target 'cloud' (Oct 26, H3 Character Swap · Comfy Cloud): the same standalone shape on SHARED Comfy Cloud (COMFY_API_KEY), for a graph that needs
 * a model the user imported into their Comfy Cloud model library (Creator plan). preflight = a free GET-only check before any upload or submit;
 * it may refuse (throws with reasonCode) or return input fields the plan builder reads (e.g. the imported LoRA's loader path).
 * Pattern credit: Comfy-Org/comfy-reshoot (MIT), a clonable app that calls a Comfy API deployment through the same v2 jobs/assets API.
 */
export interface StandaloneCloudWorkflow {
  routeId: string; provider: string; standalone: true; target: 'deploy' | 'cloud';
  /** the model key whose prompt grammar this graph follows, when the twin provider has none of its own (Footage Effects: the LTX IC-LoRA engine's) */ refModel?: string;
  /** Plain name for the Settings card and docs. */ label: string;
  /** workflows/ relative graphs this entry may submit. */ graphs: string[];
  /** Node classes and model files the deployment needs (model: the loader class + widget whose choice list must contain the file). */
  requires: { nodes: string[]; models: { loader: string; field: string; file: string }[] };
  plan: (j: { id: string; toolId: string; provider: string; input: Record<string, any> }) => Plan;
  /** Free GET-only check on the target host before anything is uploaded or submitted. get(path) sends the route's own auth to its own host. */
  preflight?: (get: (p: string) => Promise<Response>, input?: Record<string, any>) => Promise<Record<string, any> | void>;
  /** Free local prep on this computer (ffmpeg), after the preflight and before anything is uploaded; it may write job.input (H3 Extend: the conformed
   *  clip and its context). A thrown error with a reasonCode refuses the run with nothing sent. */
  prepare?: (job: { id: string; input: Record<string, any> }) => Promise<void>;
  /** The graph has partner (API) nodes: the Comfy key goes once in extra_data.api_key_comfy_org (comfy/cloudV2.ts run partnerAuth), as the Topaz / Tripo runners send it. */
  partnerAuth?: boolean;
}
export type CloudWorkflowEntry = CloudWorkflowRoute | StandaloneCloudWorkflow;
export const isStandalone = (w: CloudWorkflowEntry | undefined): w is StandaloneCloudWorkflow => !!w && (w as StandaloneCloudWorkflow).standalone === true;
/** Deployment smoke test: LoadImage → ImageInvert → SaveImage, core nodes only, no model files. It proves upload → submit → poll → download on the
 *  user's deployment for a few GPU-seconds (plus any cold start). Run it with POST /api/comfy-deploy/smoke (refused until its price is measured). */
export const DEPLOY_SMOKE_GRAPH = 'deploy/smoke-invert-api.json';
const smokePlan: StandaloneCloudWorkflow['plan'] = (j) => {
  if (!j.input.imagePath) throw new Error('The deployment test needs an input image');
  const g = load(DEPLOY_SMOKE_GRAPH); setIn(g, '1', 'image', { __file: j.input.imagePath });
  return { tool: j.toolId, passes: [{ label: 'Deployment test', workflow: DEPLOY_SMOKE_GRAPH, graph: g, output: '3', expect: {} }], post: { kind: 'each' }, outKind: 'image', muxSourceAudio: false, notes: ['Your Comfy deployment: test job'] };
};
export const CLOUD_WORKFLOWS: Record<string, CloudWorkflowEntry> = {
  'comfy-cloud:cloud-h3-wf': { routeId: 'comfy-cloud:cloud-h3-wf', provider: 'cloud-h3-wf', twin: 'comfy-h3',
    files: { 'h3-t2v-api.json': 'cloud/h3-t2v-api.json', 'h3-i2v-api.json': 'cloud/h3-i2v-api.json' } },
  'comfy-cloud:cloud-ltx-camera': { routeId: 'comfy-cloud:cloud-ltx-camera', provider: 'cloud-ltx-camera', twin: 'comfy-open',
    files: { 'camera-ltx-api.json': 'cloud/camera-ltx-api.json', 'camera-ltx-flf-api.json': 'cloud/camera-ltx-flf-api.json' } },
  'comfy-cloud:cloud-reshoot': { routeId: 'comfy-cloud:cloud-reshoot', provider: 'cloud-reshoot', twin: 'comfy-open',
    files: { 'reshoot-api.json': 'cloud/reshoot-cloud-api.json' } },
  // Oct 27: MiniMax Music 3 · Comfy Cloud (Audio Music, Music for a video, Music Bed): the official template audio_minimax_music_3 on shared Comfy Cloud,
  // byte for byte our local graph (songPlan: caption, lyrics or "[Instrumental]", seed, max_duration). A twin route of the MiniMax Music 3 card (routes.ts TWINS).
  'comfy-cloud:cloud-minimax-music': { routeId: 'comfy-cloud:cloud-minimax-music', provider: 'cloud-minimax-music', twin: 'comfy-minimax-music3',
    files: { 'audio-minimax-music3-local-api.json': 'cloud/audio-minimax-music3-api.json' } },
  'comfy-deploy:deploy-smoke': { routeId: 'comfy-deploy:deploy-smoke', provider: 'deploy-smoke', standalone: true, target: 'deploy', label: 'Deployment test',
    graphs: [DEPLOY_SMOKE_GRAPH], requires: { nodes: ['LoadImage', 'ImageInvert', 'SaveImage'], models: [] }, plan: smokePlan },
  // H3 runner Step 3 (Oct 26): New angle · H3 CrossView · cloud (Re-shoot), Comfy's Reshoot recipe on the user's deployment (comfy/crossview.ts)
  'comfy-deploy:cloud-h3-crossview': { routeId: 'comfy-deploy:cloud-h3-crossview', provider: 'cloud-h3-crossview', standalone: true, target: 'deploy', label: 'New angle · H3 CrossView',
    graphs: [CROSSVIEW_GRAPH], requires: CROSSVIEW_REQUIRES, plan: crossviewPlan },
  // Oct 26–27: H3 Character Swap · Comfy Cloud (Object / Person Swap only; not offered on Motion Transfer), the Openjutsu recipe on shared Comfy Cloud with the user's
  // imported Character Swap LoRA and a core-node SAM 3.1 edit mask (comfy/h3CharSwapCloud.ts). A twin route of the H3 Character Swap card (routing/routes.ts TWINS).
  [CHARSWAP_CLOUD_ROUTE]: { routeId: CHARSWAP_CLOUD_ROUTE, provider: CHARSWAP_CLOUD_PROVIDER, standalone: true, target: 'cloud', label: 'H3 Character Swap · Comfy Cloud',
    graphs: [CHARSWAP_CLOUD_GRAPH], requires: CHARSWAP_CLOUD_REQUIRES, plan: charswapCloudPlan,
    preflight: async (get) => { const c = await checkCharswapLora(get);
      if (c.state === 'missing') throw Object.assign(new Error(CHARSWAP_LORA_MISSING), { reasonCode: 'cloud_import_missing', errorType: 'validation' });
      const t = await checkCharswapTurbo(get); // optional: Openjutsu's 768p turbo build when the user has imported it (else the shared build)
      return { ...(c.loaderPath ? { charswapLora: c.loaderPath } : {}), ...(t.loaderPath ? { charswapTurbo: t.loaderPath } : {}) }; } },
  // Oct 27: LTX-2.5 22B · Comfy Cloud, the open LTX-2.5 22B on shared Comfy Cloud (comfy/ltx25Cloud.ts): Generate Video / Loop / Morph, and Extend
  // (picture-and-sound continuation by default, or the last-frames guide). Twin routes of the local LTX-2.5 22B cards (routing/routes.ts TWINS).
  // Oct 27: H3 Extend · Comfy Cloud, the Comfy Cloud twin of the local H3 Extend graph (comfy/h3ExtendCloud.ts): one segment per job, the last 22 frames
  // of picture and sound as context, joined by the shared Extend join. A twin route of the H3 Extend card (routing/routes.ts TWINS).
  [H3X_CLOUD_ROUTE]: { routeId: H3X_CLOUD_ROUTE, provider: H3X_CLOUD_PROVIDER, standalone: true, target: 'cloud', label: H3X_CLOUD_LABEL,
    graphs: [H3X_CLOUD_GRAPH], requires: H3X_CLOUD_REQUIRES, plan: h3xCloudPlan, prepare: prepareH3xCloud,
    preflight: async (get) => { const t = await checkCharswapTurbo(get); return t.loaderPath ? { h3xTurbo: t.loaderPath } : {}; } /* optional: the user's imported 768p turbo build */ },
  [LTX25_CLOUD_ROUTE]: { routeId: LTX25_CLOUD_ROUTE, provider: LTX25_CLOUD_PROVIDER, standalone: true, target: 'cloud', label: 'LTX-2.5 22B · Comfy Cloud',
    graphs: [...Object.values(LTX25_CLOUD_GRAPHS), LTX25_DFR_CLOUD_GRAPH], requires: LTX25_CLOUD_REQUIRES, plan: ltx25CloudPlan,
    preflight: ltx25CloudPreflight /* DFR jobs: a free check for the detailing IC-LoRA (shared library or the user's import) */ },
  [LTX25_CLOUD_EXTEND_ROUTE]: { routeId: LTX25_CLOUD_EXTEND_ROUTE, provider: LTX25_CLOUD_EXTEND_PROVIDER, standalone: true, target: 'cloud', label: 'LTX-2.5 22B Extend · Comfy Cloud',
    graphs: [LTX25_CONTINUE_GRAPH, LTX25_CLOUD_GRAPHS['ltx25-ti2v-api.json']], requires: LTX25_CLOUD_REQUIRES, plan: ltx25CloudPlan },
  // Oct 27: LTX-2.5 Pro / Fast · Comfy Cloud: image to video and first + last frame through the LTX-2.5 partner node (comfy/ltx25ApiCloud.ts), the Comfy Cloud
  // place of the LTX-2.5 Pro / Fast cards (routing/routes.ts TWINS); text to video stays on Comfy Router. Graph built in code from the official templates.
  ...Object.fromEntries(Object.values(LTX_API_CLOUD).map((t) => [t.route, { routeId: t.route, provider: t.provider, standalone: true, target: 'cloud', label: `${t.name} · Comfy Cloud (partner node)`,
    graphs: [LTX_API_TEMPLATES.i2v, LTX_API_TEMPLATES.flf], requires: { nodes: ['LoadImage', LTX_API_NODE, 'SaveVideo'], models: [] }, plan: ltxApiCloudPlan(t.tier), partnerAuth: true,
    prepare: (job: { id: string; input: Record<string, any> }) => prepareLtxApiCloud(job, t.tier) } satisfies StandaloneCloudWorkflow])),
  // Oct 27: Render · LTX-2.5 + Layout to Render · Comfy Cloud (Direct a Shot step 3, comfy/ltx25LayoutCloud.ts): the Comfy Cloud place of the local Render
  // route, with the user's imported Layout to Render LoRA (a free GET-only check first; a clear refusal with the import steps when it isn't there).
  [LAYOUT_CLOUD_ROUTE]: { routeId: LAYOUT_CLOUD_ROUTE, provider: LAYOUT_CLOUD_PROVIDER, standalone: true, target: 'cloud', label: 'LTX-2.5 + Layout to Render · Comfy Cloud',
    graphs: [LAYOUT_CLOUD_GRAPH], requires: LAYOUT_CLOUD_REQUIRES, plan: layoutCloudPlan,
    preflight: async (get) => { const c = await checkLayoutLora(get);
      if (c.state === 'missing') throw Object.assign(new Error(LAYOUT_LORA_MISSING), { reasonCode: 'cloud_import_missing', errorType: 'validation' });
      return c.loaderPath ? { layoutLora: c.loaderPath } : {}; } },
  // Oct 27: InfiniteTalk (Wan 2.1) · Comfy Cloud, Lip Sync up to 60 s (comfy/infiniteTalkCloud.ts): the official template video_wan2_1_infinitetalk, one window per 3.24 s.
  // Oct 27: Footage Effects · Comfy Cloud (comfy/ltx23VfxCloud.ts): the official Comfy LTX-2.3 templates Restore old footage, Remove an object, Remove subtitles and
  // Extend the frame, every LoRA in Comfy Cloud's shared library (no import, no preflight). A twin route of the Footage Effects card (routing/routes.ts TWINS).
  [VFX_CLOUD_ROUTE]: { routeId: VFX_CLOUD_ROUTE, provider: VFX_CLOUD_PROVIDER, standalone: true, target: 'cloud', label: VFX_CLOUD_NAME, refModel: 'comfy-ltx25-iclora' /* the Footage Effects model this place serves: '@image1' → plain words, as on your computer */,
    graphs: [...new Set(Object.values(VFX_CLOUD_GRAPHS).map((g) => g.graph))], requires: VFX_CLOUD_REQUIRES, plan: vfxCloudPlan },
  // Oct 27: MiniMax H3 Fast · Comfy Cloud (comfy/h3FastCloud.ts): the official FastVideo FastH3 templates, text / image to video in 8 steps. A free GET-only
  // check for the FastH3 checkpoint first (not in Comfy Cloud's object_info of 2026-10-26): missing → refused with the import steps, nothing sent.
  [H3F_ROUTE]: { routeId: H3F_ROUTE, provider: H3F_PROVIDER, standalone: true, target: 'cloud', label: H3F_NAME, graphs: Object.values(H3F_GRAPHS), requires: H3F_REQUIRES, plan: h3FastPlan,
    preflight: async (get) => { const c = await checkH3FastModel(get);
      if (c.state === 'missing') throw Object.assign(new Error(H3F_MISSING), { reasonCode: 'cloud_import_missing', errorType: 'validation' });
      return c.loaderPath ? { h3FastUnet: c.loaderPath } : {}; } },
  // Nov 1: Pika H3 Flex · Comfy Cloud (comfy/pikaH3Flex.ts): the official Pika H3 Flex templates (FL2VA adapter: text, start frame, start + end frame),
  // six steps. A free GET-only check for the Pika LoRA first (newer than Comfy Cloud's object_info of 2026-10-26): missing → refused, nothing sent.
  [PIKA_ROUTE]: { routeId: PIKA_ROUTE, provider: PIKA_PROVIDER, standalone: true, target: 'cloud', label: PIKA_NAME, graphs: Object.values(PIKA_GRAPHS), requires: PIKA_REQUIRES,
    plan: (j) => pikaPlan(j, 'cloud'), preflight: pikaPreflight },
  // Oct 27: MiniMax H3 Keyframes · Comfy Cloud (comfy/h3KeyframesCloud.ts): the official template video_minimax_h3_multiframe_reference, 2–5 stills at
  // chosen times into one shot. The Keyframes mode of the MiniMax H3 card (routing/routes.ts TWINS). Every file is in Comfy Cloud's shared library: no preflight.
  [H3KF_ROUTE]: { routeId: H3KF_ROUTE, provider: H3KF_PROVIDER, standalone: true, target: 'cloud', label: H3KF_NAME, graphs: [H3KF_GRAPH], requires: H3KF_REQUIRES, plan: h3KeyframesPlan },
  [IT_ROUTE]: { routeId: IT_ROUTE, provider: IT_PROVIDER, standalone: true, target: 'cloud', label: 'InfiniteTalk (Wan 2.1) · Comfy Cloud', graphs: [IT_GRAPH], requires: IT_REQUIRES, plan: infiniteTalkPlan },
};
export const cloudWorkflowFor = (providerOrRoute: string) => CLOUD_WORKFLOWS[providerOrRoute] ?? Object.values(CLOUD_WORKFLOWS).find((w) => w.provider === providerOrRoute);

const isLink = (v: any) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string';
const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
const load = (f: string) => JSON.parse(readFileSync(path.join(WORKFLOWS_DIR, f), 'utf8'));
/** Static widget differences cloud vs local: { node: { field: cloudValue } }. Throws when the graphs are not node-compatible. */
export function cloudOverrides(localFile: string, cloudFile: string): Record<string, Record<string, any>> {
  const l = load(localFile); const c = load(cloudFile); const out: Record<string, Record<string, any>> = {};
  const lk = Object.keys(l).sort(); const ck = Object.keys(c).sort();
  if (!same(lk, ck)) throw new Error(`${cloudFile} is not node-compatible with ${localFile}`);
  for (const id of ck) {
    if (c[id].class_type !== l[id].class_type) throw new Error(`${cloudFile} node ${id} is ${c[id].class_type}, local ${l[id].class_type}`);
    for (const [k, v] of Object.entries<any>(c[id].inputs ?? {})) {
      const lv = l[id].inputs?.[k];
      if (isLink(v) || isLink(lv)) { if (!same(v, lv)) throw new Error(`${cloudFile} node ${id}.${k} is wired differently from ${localFile}`); continue; }
      if (!same(v, lv)) (out[id] ??= {})[k] = v;
    }
  }
  return out;
}
const cache = new Map<string, { base: any; over: Record<string, Record<string, any>> }>();
/** The twin's plan with every pass moved onto its Comfy Cloud graph. Throws (plain message) when a pass has no cloud graph. */
export function buildCloudPlan(j: { id: string; toolId: string; provider: string; input: Record<string, any> }, o: { srcFps?: number } = {}): Plan {
  const w = cloudWorkflowFor(j.provider); if (!w) throw new Error(`${j.provider} has no Comfy Cloud workflow`);
  if (isStandalone(w)) { const plan = w.plan({ ...j, input: withRefGrammar(j.input, w.refModel ?? planModelKeyOf(j), 'local') }); /* prompt grammar: the same rewrite buildPlan applies (H3 CrossView: <Picture 1> / <Video 1>) */ plan.notes = [...plan.notes, w.target === 'cloud' ? `Comfy Cloud workflow (${w.provider})` : `Your Comfy deployment (${w.provider})`]; return plan; }
  const plan = buildPlan({ ...j, provider: w.twin }, o);
  for (const p of plan.passes) {
    const cf = w.files[p.workflow];
    if (!cf) throw new Error(`This job needs ${p.workflow.replace(/-api\.json$/, '')}, which has no Comfy Cloud graph yet, so it can't run on this route`);
    const key = `${p.workflow}→${cf}`; if (!cache.has(key)) cache.set(key, { base: load(p.workflow), over: cloudOverrides(p.workflow, cf) });
    const { base, over } = cache.get(key)!;
    for (const [id, fields] of Object.entries(over)) for (const [k, v] of Object.entries(fields)) {
      const n = p.graph[id]; if (!n) continue; // pruned by the plan builder
      if (same(n.inputs?.[k], base[id]?.inputs?.[k])) n.inputs[k] = v; // keep anything the plan builder set
    }
    p.workflow = cf;
  }
  plan.notes = [...plan.notes, `Comfy Cloud workflow (${w.provider})`];
  return plan;
}
