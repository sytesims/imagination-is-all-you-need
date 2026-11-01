/**
 * One-click install. LoRA → ComfyUI models/loras (mock: recorded in the db and shown as installed).
 * Workflow → a style preset (db) or a new tool: a plugin folder plugins/hub-<slug>/ that passes plugins:check
 * (loaded on the next server start, like every plugin). The tool runs our Z-Image Turbo template with the item's name as the style,
 * not the community workflow itself (that is not downloaded).
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { db } from '../db.js';
import { PLUGINS_DIR } from '../config.js';
import { env } from '../env.js';
import { validateManifest } from '../plugins.js';
import { commercialFlags, type HubItem } from './catalog.js';

db.exec('CREATE TABLE IF NOT EXISTS hub_installed (id TEXT PRIMARY KEY, data TEXT NOT NULL)');
const q = {
  put: db.prepare('INSERT INTO hub_installed (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data'),
  get: db.prepare('SELECT data FROM hub_installed WHERE id = ?'), del: db.prepare('DELETE FROM hub_installed WHERE id = ?'), all: db.prepare('SELECT data FROM hub_installed'),
};
export type InstallAs = 'lora' | 'style' | 'tool';
export interface Installed {
  id: string; itemId: string; type: HubItem['type']; as: InstallAs; name: string; installedAt: string; status: 'installed';
  mock: boolean; sample: boolean; path: string | null; pluginId: string | null; requiresRestart: boolean;
  style: { id: string; label: string; prompt: string; loras: string[] } | null;
  license: HubItem['license']; flags: ReturnType<typeof commercialFlags>;
}
export const listInstalled = (): Installed[] => (q.all.all() as { data: string }[]).map((r) => JSON.parse(r.data)).sort((a, b) => b.installedAt.localeCompare(a.installedAt));
export const getInstalled = (id: string): Installed | null => { const r = q.get.get(id) as { data: string } | undefined; return r ? JSON.parse(r.data) : null; };
export const installedIds = () => new Set(listInstalled().map((i) => i.itemId));

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'item';

/** Image-to-image template (Z-Image Turbo, Apache-2.0, core Comfy nodes) the imported workflow tool runs on. */
function templateWorkflow(prompt: string) {
  return {
    '1': { class_type: 'LoadImage', inputs: { image: 'oj_ref.png' }, _meta: { title: 'Input image' } },
    '2': { class_type: 'UNETLoader', inputs: { unet_name: 'z_image_turbo_bf16.safetensors', weight_dtype: 'default' } },
    '3': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_3_4b.safetensors', type: 'lumina2', device: 'default' } },
    '4': { class_type: 'VAELoader', inputs: { vae_name: 'ae.safetensors' } },
    '5': { class_type: 'ModelSamplingAuraFlow', inputs: { shift: 3, model: ['2', 0] } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['3', 0] }, _meta: { title: 'Prompt' } },
    '7': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['6', 0] } },
    '8': { class_type: 'VAEEncode', inputs: { pixels: ['1', 0], vae: ['4', 0] } },
    '9': { class_type: 'KSampler', inputs: { seed: 0, steps: 8, cfg: 1, sampler_name: 'res_multistep', scheduler: 'simple', denoise: 0.6, model: ['5', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['8', 0] } },
    '10': { class_type: 'VAEDecode', inputs: { samples: ['9', 0], vae: ['4', 0] } },
    '11': { class_type: 'SaveImage', inputs: { filename_prefix: 'openhiggsfield/hub', images: ['10', 0] } },
  };
}

function writePlugin(item: HubItem): { pluginId: string; dir: string } | { error: string } {
  const pluginId = `hub-${slug(item.name)}`.slice(0, 40).replace(/-+$/, '');
  const dir = path.join(PLUGINS_DIR, pluginId);
  if (existsSync(dir)) return { error: `plugin folder ${pluginId} already exists` };
  const prompt = `${item.name}, ${item.tags.join(', ')}`;
  const manifest = {
    schema: 1, id: pluginId, name: item.name.slice(0, 60), version: '0.1.0', category: 'Community', status: 'new',
    description: `Imported from the Community hub (${item.sample ? 'sample entry' : `${item.source} #${item.sourceId}`}). Runs the app's own Z-Image Turbo image-to-image template with this item's name as the style, not the original workflow.`.slice(0, 500),
    input: 'image',
    inputs: { prompt: true, resolutions: ['720p', '1080p'], fields: [{ name: 'strength', label: 'Strength', kind: 'select', default: 'medium', options: [{ value: 'light', label: 'Light' }, { value: 'medium', label: 'Medium' }, { value: 'strong', label: 'Strong' }] }] },
    presets: [{ id: 'default', label: item.name.slice(0, 60), prompt, group: 'Style' }],
    providers: ['comfy-open'], license: { id: 'apache-2.0' },
    components: [{ kind: 'model', name: 'Z-Image Turbo (Tongyi-MAI)', license: 'apache-2.0', url: 'https://huggingface.co/Tongyi-MAI/Z-Image-Turbo' }],
    pricing: { gpuSecPerSec: { '720p': 4, '1080p': 8 } },
    workflow: 'workflow.json', nodeMap: 'node-map.json', model: 'Z-Image Turbo (Apache-2.0)',
    stages: [['uploading', 'Uploading'], ['generating', 'Generating'], ['saving', 'Saving']],
    hub: { itemId: item.id, source: item.source, sourceId: item.sourceId, sample: item.sample, url: item.url, creator: item.creator.username, sourceLicense: item.license },
  };
  const nodeMap = {
    inputs: { image: { node: '1', field: 'image' }, prompt: { node: '6', field: 'text' }, seed: { node: '9', field: 'seed' } },
    fields: { strength: { node: '9', field: 'denoise', map: { light: 0.4, medium: 0.6, strong: 0.8 } } },
    output: { node: '11' },
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(path.join(dir, 'workflow.json'), JSON.stringify(templateWorkflow(prompt), null, 2) + '\n');
  writeFileSync(path.join(dir, 'node-map.json'), JSON.stringify(nodeMap, null, 2) + '\n');
  const v = validateManifest(manifest, dir);
  if (v.errors.length) { rmSync(dir, { recursive: true, force: true }); return { error: `generated plugin failed validation: ${v.errors.join('; ')}` }; }
  return { pluginId, dir };
}

export function install(item: HubItem, asRaw?: string): Installed | { error: string; status: number } {
  const as: InstallAs = item.type === 'lora' ? 'lora' : asRaw === 'tool' ? 'tool' : 'style';
  if (item.type === 'lora' && asRaw && asRaw !== 'lora') return { error: 'a LoRA installs as "lora"', status: 400 };
  if (item.type === 'workflow' && asRaw && !['style', 'tool'].includes(asRaw)) return { error: 'a workflow installs as "style" or "tool"', status: 400 };
  const id = `${item.id}:${as}`;
  if (getInstalled(id)) return { error: 'already installed', status: 409 };
  const base = { id, itemId: item.id, type: item.type, as, name: item.name, installedAt: new Date().toISOString(), status: 'installed' as const, sample: item.sample,
    license: item.license, flags: commercialFlags(item.license), pluginId: null, requiresRestart: false, style: null, path: null };
  let rec: Installed;
  if (as === 'lora') {
    const modelsDir = env('COMFY_MODELS_DIR');
    const file = item.files[0]?.name ?? `${slug(item.name)}.safetensors`;
    // Mock (and every install for now): recorded, not downloaded. Real download needs the comfy backend + COMFY_MODELS_DIR + a live item.
    rec = { ...base, mock: true, path: path.join(modelsDir ?? 'ComfyUI/models', 'loras', file) };
  } else if (as === 'style') {
    rec = { ...base, mock: false, style: { id: `hub-${slug(item.name)}`, label: item.name, prompt: `${item.name}, ${item.tags.join(', ')}`, loras: [] } };
  } else {
    const r = writePlugin(item); if ('error' in r) return { error: r.error, status: 409 };
    rec = { ...base, mock: false, pluginId: r.pluginId, path: r.dir, requiresRestart: true };
  }
  q.put.run(id, JSON.stringify(rec));
  return rec;
}

export function uninstall(id: string): Installed | null {
  const rec = getInstalled(id); if (!rec) return null;
  if (rec.as === 'tool' && rec.pluginId?.startsWith('hub-')) {
    const dir = path.join(PLUGINS_DIR, rec.pluginId);
    if (path.dirname(dir) === path.resolve(PLUGINS_DIR) && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
  q.del.run(id);
  return rec;
}
