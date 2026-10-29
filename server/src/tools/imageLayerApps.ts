/**
 * Image to layers (2026-10-24): the model cards. The request bodies are in routing/routerModels.ts (api-seedream-layers-*), prices in
 * shared/hostedPrices.ts, the workflow in shared/workflows.ts and the app in tools/apps.ts (app-image-layers). Ids, sizes and sources: shared/imageLayers.ts.
 *  - Seedream 5.0 Flash / Pro layer separation: hosted on Comfy Router with the Comfy key (sample output without one, like every hosted image model).
 *  - Qwen-Image-Layered (Apache-2.0): listed for Local with its download size; nothing is downloaded and it never runs until a runner and the files exist.
 */
import { registerProvider } from '../providers.js';
import { COMING_SOON } from '../routing/routes.js';
import { registerLicenseComponents } from '../licenses.js';
import { LAYERS_FLASH, LAYERS_PRO, LAYERS_LOCAL, LAYER_ROUTER_IDS, QWEN_LAYERED_TEMPLATE, QWEN_LAYERED_NEEDS, QWEN_LAYERED_GB } from '../shared/imageLayers.js';
import type { Job } from '../jobs.js';
import type { ToolDef } from './types.js';

const NODE = 'ByteDanceSeedreamLayerSeparationNodeV2';
const stages = (label: string): [string, string][] => [['uploading', 'Uploading'], ['submitted', `Submitted to ${label}`], ['rendering', `${label} splitting layers`], ['downloading', 'Downloading layers']];
/** Without a Comfy key (or on the mock backend) the tool's own sample render runs: our own sample layers (tools/shared.ts), never a provider call. */
const sample = (job: Job, tool: ToolDef) => tool.run(job);
for (const [id, name] of [[LAYERS_FLASH, 'ByteDance Seedream 5.0 Flash · layers'], [LAYERS_PRO, 'ByteDance Seedream 5.0 Pro · layers']] as const)
  registerProvider({ id, name: `${name} (hosted)`, kind: 'hosted', via: `Comfy partner node ${NODE}; runs on Comfy Router ${LAYER_ROUTER_IDS[id]} with layer_decomposition (sample output without a key)`,
    stages: stages('Seedream'), run: sample, docUrl: `https://docs.comfy.org/built-in-nodes/${NODE}`, nodes: [NODE], licenseUrl: `https://docs.comfy.org/built-in-nodes/${NODE}` });
registerProvider({ id: LAYERS_LOCAL, name: 'Qwen-Image-Layered', kind: 'open-weights', via: `local ComfyUI, official template image_qwen_image_layered (needs ${QWEN_LAYERED_GB} of files; not downloaded)`,
  docUrl: QWEN_LAYERED_TEMPLATE, licenseParts: ['apache-2.0'] } as any);
/** Listed with its download size; it never runs (or downloads) until the user approves the download and a runner is added. */
COMING_SOON[LAYERS_LOCAL] = QWEN_LAYERED_NEEDS;
/** Download PSD (2026-10-24): the layered .psd is written in the browser by ag-psd (web/src/shared/layerPsd.ts) and its two dependencies. Code, not a model. */
registerLicenseComponents('app-image-layers', [
  { model: 'ag-psd 31.0.3 (Download PSD: writes the layered .psd in the browser)', license: 'MIT', commercial: 'yes', url: 'https://github.com/Agamnentzar/ag-psd/blob/master/LICENSE' },
  { model: 'pako 2.1.0 (zlib for ag-psd)', license: 'MIT AND Zlib', commercial: 'yes', url: 'https://github.com/nodeca/pako/blob/master/LICENSE' },
  { model: 'base64-js 1.5.1 (used by ag-psd)', license: 'MIT', commercial: 'yes', url: 'https://github.com/beatgammit/base64-js/blob/master/LICENSE' },
] as any);
