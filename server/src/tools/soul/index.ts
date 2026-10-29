/** OpenSoul registration side effects: licences (shown only on /api/licenses + LICENSES.md), the local provider, components table. */
import { registerLicense, registerWorkflowLicense, registerLicenseComponents } from '../../licenses.js';
import { registerProvider } from '../../providers.js';
import { SOUL_LORAS } from './presets.js';
export { soulTool } from './tool.js';

registerLicense({ id: 'flux1-dev-nc', name: 'FLUX.1 [dev] Non-Commercial License', osi: false, url: 'https://huggingface.co/black-forest-labs/FLUX.1-dev/blob/main/LICENSE.md' });
registerLicense({ id: 'infiniteyou-nc', name: 'CC BY-NC 4.0 (InfiniteYou weights; code Apache-2.0)', osi: false, url: 'https://huggingface.co/ByteDance/InfiniteYou' });
registerLicense({ id: 'insightface-nc', name: 'InsightFace antelopev2 models: non-commercial research only', osi: false, url: 'https://github.com/deepinsight/insightface#license' });
registerLicense({ id: 'aceplus-flux', name: 'ACE++ LoRAs: no licence stated (no licence file); README says follow the FLUX.1-dev licence (non-commercial)', osi: false, url: 'https://huggingface.co/ali-vilab/ACE_Plus' });
registerLicense({ id: 'civitai-lora', name: 'Civitai community LoRA licences (per-model permissions; see components)', osi: false, url: 'https://civitai.com/content/licenses' });
const W = (f: string, parts: string[]) => registerWorkflowLicense(f, parts);
W('soul-zit-api.json', ['apache-2.0', 'civitai-lora']); W('soul-qwen-api.json', ['apache-2.0', 'civitai-lora']); W('soul-flux1dev-api.json', ['flux1-dev-nc', 'civitai-lora']);
W('soul-ref-pulid-api.json', ['flux1-dev-nc', 'insightface-nc', 'apache-2.0']); W('soul-ref-infiniteyou-api.json', ['infiniteyou-nc', 'flux1-dev-nc', 'insightface-nc']);
W('soul-ref-aceplus-api.json', ['aceplus-flux', 'flux1-dev-nc']); W('soul-ref-qwenedit-api.json', ['apache-2.0']);
registerProvider({ id: 'comfy-soul', name: 'Z-Image-Turbo + look LoRAs (local ComfyUI)', kind: 'open-weights', docUrl: 'https://huggingface.co/Tongyi-MAI/Z-Image-Turbo',
  via: 'local ComfyUI, workflows/soul-*-api.json (mock unless OPENHIGGSFIELD_BACKEND=comfy)', workflows: ['soul-zit-api.json', 'soul-flux1dev-api.json', 'soul-qwen-api.json', 'soul-ref-pulid-api.json', 'soul-ref-infiniteyou-api.json', 'soul-ref-aceplus-api.json', 'soul-ref-qwenedit-api.json'],
  nodes: ['LoraLoaderModelOnly', 'ColorTransfer', 'ApplyPulidFlux', 'InfuseNetApply', 'TextEncodeQwenImageEditPlus', 'ImageUpscaleWithModel'],
  licenseParts: ['apache-2.0', 'flux1-dev-nc', 'infiniteyou-nc', 'insightface-nc', 'aceplus-flux', 'civitai-lora'] });

type C = 'yes' | 'no' | 'restricted';
const civC = (c: string[]): C => (c.includes('apache-2.0') ? 'yes' : c.includes('Sell') ? 'restricted' : 'no');
registerLicenseComponents('soul', [
  { model: 'Z-Image-Turbo (Tongyi-MAI)', license: 'Apache-2.0', commercial: 'yes', url: 'https://huggingface.co/Tongyi-MAI/Z-Image-Turbo' },
  { model: 'Qwen-Image-2512', license: 'Apache-2.0', commercial: 'yes', url: 'https://huggingface.co/Qwen/Qwen-Image-2512' },
  { model: 'Qwen-Image-Edit-2511', license: 'Apache-2.0', commercial: 'yes', url: 'https://huggingface.co/Qwen/Qwen-Image-Edit-2511' },
  { model: 'FLUX.1 [dev] (fp8, Comfy-Org repack)', license: 'FLUX.1 [dev] Non-Commercial License', commercial: 'no', url: 'https://huggingface.co/black-forest-labs/FLUX.1-dev' },
  { model: 'FLUX.1 Fill [dev] (ACE++ base)', license: 'FLUX.1 [dev] Non-Commercial License', commercial: 'no', url: 'https://huggingface.co/black-forest-labs/FLUX.1-Fill-dev' },
  { model: 'PuLID-FLUX v0.9.1 (guozinan/PuLID)', license: 'Apache-2.0 (needs FLUX.1-dev + insightface antelopev2, both non-commercial)', commercial: 'no', url: 'https://huggingface.co/guozinan/PuLID' },
  { model: 'ComfyUI-PuLID-Flux node pack @a80912f', license: 'Apache-2.0', commercial: 'yes', url: 'https://github.com/balazik/ComfyUI-PuLID-Flux' },
  { model: 'InfiniteYou infu_flux_v1.0 (ByteDance)', license: 'CC BY-NC 4.0', commercial: 'no', url: 'https://huggingface.co/ByteDance/InfiniteYou' },
  { model: 'ComfyUI_InfiniteYou node pack @1c97939', license: 'Apache-2.0', commercial: 'yes', url: 'https://github.com/bytedance/ComfyUI_InfiniteYou' },
  { model: 'InsightFace antelopev2', license: 'Non-commercial research only', commercial: 'no', url: 'https://github.com/deepinsight/insightface#license' },
  { model: 'ACE++ portrait / subject LoRAs (ali-vilab/ACE_Plus)', license: 'No licence stated (no licence file); README: follow FLUX.1-dev licence', commercial: 'no', url: 'https://huggingface.co/ali-vilab/ACE_Plus' },
  { model: 'Real-ESRGAN x2plus / x4plus', license: 'BSD-3-Clause', commercial: 'yes', url: 'https://github.com/xinntao/Real-ESRGAN' },
  ...Object.values(SOUL_LORAS).map((l) => ({ model: `${l.name} LoRA`, license: l.commercial.includes('apache-2.0') ? 'Apache-2.0' : `${l.license}; Civitai permissions: ${l.commercial.join(', ')}`,
    commercial: l.base === 'flux1dev' ? ('no' as C) : civC(l.commercial), url: l.source })),
]);
