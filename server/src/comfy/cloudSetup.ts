/**
 * One-time Comfy Cloud setup (2026-10-27, docs/COMFY-CLOUD-SETUP.md): the three imports into the user's Comfy Cloud model library and CrossView's
 * deployment, in one list for Settings → Connections → One-time setup (GET /api/comfy-cloud/setup). Each row: what it unlocks, a one-click Hugging Face
 * link, the plain steps (the same steps a refused run shows: comfy/cloudImports.ts importSteps / importMissing), and a free check.
 * The checks are GET only and reuse the routes' own probes: the Model Library search + object_info (checkCharswapLora, checkLayoutLora,
 * checkH3FastModel) and, for CrossView, the deployment probe (probeDeploy: health, job list, object_info). Nothing is uploaded or run.
 */
import { CHARSWAP_LORA_URL, CHARSWAP_LORA_HF_FILE, CHARSWAP_LORA_STEPS, checkCharswapLora } from './h3CharSwapCloud.js';
import { LAYOUT_LORA_IMPORT_STEPS, checkLayoutLora } from './ltx25LayoutCloud.js';
import { LAYOUT_LORA_FILE, LAYOUT_LORA_REPO } from '../shared/makeItReal.js';
import { H3F_HF, H3F_UNET, H3F_IMPORT_STEPS, checkH3FastModel } from './h3FastCloud.js';
import { PIKA_HF, PIKA_LORA, PIKA_IMPORT_STEPS, checkPikaLora } from './pikaH3Flex.js';
import { deployState, probeDeploy } from './deploy.js';

export type SetupState = 'ready' | 'missing' | 'unknown' | 'no_key' | 'not_checked';
export interface CloudSetupItem { id: 'charswap' | 'layout' | 'h3fast' | 'pika' | 'crossview'; name: string; unlocks: string; kind: 'import' | 'deployment'; file: string | null; type: string | null;
  size: string | null; link: string; linkLabel: string; steps: string[]; route: string }
export const CLOUD_SETUP: CloudSetupItem[] = [
  { id: 'charswap', name: 'Character Swap LoRA', unlocks: 'H3 Character Swap on Comfy Cloud: Object Swap and Motion Transfer with MiniMax H3', kind: 'import', file: CHARSWAP_LORA_HF_FILE, type: 'LoRA', size: '0.16 GB',
    link: CHARSWAP_LORA_URL, linkLabel: 'Hugging Face', steps: CHARSWAP_LORA_STEPS, route: 'comfy-cloud:cloud-h3-charswap' },
  { id: 'layout', name: 'Layout to Render LoRA', unlocks: 'Direct a Shot’s film on Comfy Cloud (LTX-2.5 + Layout to Render), at 720p and up to 10 s', kind: 'import', file: LAYOUT_LORA_FILE, type: 'LoRA', size: '1.31 GB',
    link: LAYOUT_LORA_REPO, linkLabel: 'Hugging Face (accept the licence)', steps: LAYOUT_LORA_IMPORT_STEPS, route: 'comfy-cloud:cloud-ltx25-layout' },
  { id: 'h3fast', name: 'FastH3 checkpoint', unlocks: 'MiniMax H3 Fast on Comfy Cloud: video in 8 steps', kind: 'import', file: H3F_UNET, type: 'Diffusion model', size: null,
    link: H3F_HF, linkLabel: 'Hugging Face', steps: H3F_IMPORT_STEPS, route: 'comfy-cloud:cloud-h3-fast' },
  // Pika H3 Flex (2026-11-01): likely in Comfy Cloud's shared library already (the docs' "Run on Comfy Cloud" button); the check says so, else import it once.
  { id: 'pika', name: 'Pika H3 Flex LoRA', unlocks: 'Pika H3 Flex on Comfy Cloud: start and end frames into video with sound, in 6 steps', kind: 'import', file: PIKA_LORA, type: 'LoRA', size: '1.96 GB',
    link: PIKA_HF, linkLabel: 'Hugging Face', steps: PIKA_IMPORT_STEPS, route: 'comfy-cloud:cloud-h3-pika' },
  { id: 'crossview', name: 'CrossView deployment', unlocks: 'New angle (H3 CrossView) in Re-shoot: re-film your clip from a camera you point', kind: 'deployment', file: null, type: null, size: null,
    link: 'https://platform.comfy.org', linkLabel: 'Comfy platform',
    steps: ['On platform.comfy.org, create a deployment (a Build) with the CrossView custom nodes and their model files (docs/COMFY-CLOUD-SETUP.md lists them).',
      'Copy the deployment’s address and add it in your env file as COMFY_DEPLOY_URL (your Comfy key is used with it), then restart the app.',
      'Come back here and press Check: the free probe looks for every node and file before any run.'], route: 'comfy-deploy:cloud-h3-crossview' },
];
type Get = (p: string) => Promise<Response>;
/** The free checks (GET only). get = null: no Comfy key, so the imports can't be checked. */
export async function checkCloudSetup(get: Get | null, deployProbe: () => Promise<{ connected: boolean; recipes: { id: string; ready: boolean | null }[] }> = () => probeDeploy({ nodes: true }) as any):
  Promise<Record<CloudSetupItem['id'], { state: SetupState; note: string | null }>> {
  const imp = async (f: () => Promise<{ state: string }>) => { if (!get) return { state: 'no_key' as SetupState, note: 'Add your Comfy key first' };
    try { const c = await f(); return { state: (c.state === 'present' ? 'ready' : c.state === 'missing' ? 'missing' : 'unknown') as SetupState, note: c.state === 'unknown' ? 'Comfy Cloud didn’t answer; the run checks again' : null }; }
    catch { return { state: 'unknown' as SetupState, note: 'Comfy Cloud didn’t answer; the run checks again' }; } };
  const [charswap, layout, h3fast, pika] = await Promise.all([imp(() => checkCharswapLora(get!)), imp(() => checkLayoutLora(get!)), imp(() => checkH3FastModel(get!)), imp(() => checkPikaLora(get!))]);
  let crossview: { state: SetupState; note: string | null };
  const st = deployState();
  if (!st.configured) crossview = { state: 'missing', note: st.reason };
  else { try { const p = await deployProbe(); const r = p.recipes.find((x) => /crossview/i.test(x.id));
    crossview = !p.connected ? { state: 'unknown', note: 'Your deployment didn’t answer' } : r?.ready === true ? { state: 'ready', note: null } : r?.ready === false ? { state: 'missing', note: 'Your deployment is missing CrossView nodes or files' } : { state: 'unknown', note: null }; }
    catch { crossview = { state: 'unknown', note: 'Your deployment didn’t answer' }; } }
  return { charswap, layout, h3fast, pika, crossview };
}
