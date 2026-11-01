import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { env } from './env.js';

export type Backend = 'mock' | 'comfy';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const WORKFLOWS_DIR = path.resolve(HERE, '../../workflows');
/** Plugin folder (docs/PLUGINS.md): repo-root plugins/, override with OPENHIGGSFIELD_PLUGINS_DIR. */
export const PLUGINS_DIR = path.resolve(process.env.OPENHIGGSFIELD_PLUGINS_DIR || process.env.OPENJUTSU_PLUGINS_DIR || path.resolve(HERE, '../../plugins'));
/** Persistent data dir (SQLite db + uploads + outputs). OPENHIGGSFIELD_DATA_DIR, default server/data (gitignored). */
export const DATA_DIR = path.resolve(env('DATA_DIR') || path.resolve(HERE, '../data'));
/** Workflows people add in the app ("Add a workflow", workflowImport.ts): one plugin folder each, kept with the library so an app update never
 *  touches them. OPENHIGGSFIELD_USER_PLUGINS_DIR, default <data>/plugins. The folders in PLUGINS_DIR are the ones that ship with the app. */
export const USER_PLUGINS_DIR = path.resolve(env('USER_PLUGINS_DIR') || path.join(DATA_DIR, 'plugins'));
/** Our own demo media (scripts/make-samples.sh); also the source of mock results. */
/** [R44] Days to keep finished results (0 = keep forever). OPENHIGGSFIELD_RESULT_TTL_DAYS. */
export const RESULT_TTL_DAYS = Math.max(0, Number(env('RESULT_TTL_DAYS')) || 0);
export const SAMPLES_DIR = path.resolve(HERE, '../samples');
/** The web app's shipped public files (web/public): the Featured generations in /showcase are read from here by the sample server and the seed. */
export const WEB_PUBLIC_DIR = path.resolve(HERE, '../../web/public');

export interface NodeBinding {
  node: string;
  field: string;
}

export interface NodeMap {
  workflowFile: string;
  inputs: {
    image: NodeBinding;
    video: NodeBinding;
    prompt: NodeBinding;
  };
  output: { node: string };
}

function parseNodeField(raw: string | undefined, fallback: NodeBinding): NodeBinding {
  if (!raw?.trim()) return fallback;
  const [node, field] = raw.split(':');
  if (!node || !field) return fallback;
  return { node, field };
}

function loadNodeMap(): NodeMap {
  const defaults: NodeMap = {
    workflowFile: 'object-swap-wan-animate-api.json', // legacy fallback: object-swap-api.json (WORKFLOW=object-swap-api.json)
    inputs: {
      image: { node: '10', field: 'image' },
      video: { node: '145', field: 'file' },
      prompt: { node: '21', field: 'text' },
    },
    output: { node: '277' },
  };
  const p = path.join(WORKFLOWS_DIR, 'node-map.json');
  if (!existsSync(p)) return defaults;
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as Partial<NodeMap> & {
      inputs?: Partial<NodeMap['inputs']>;
      output?: Partial<NodeMap['output']>;
    };
    return {
      workflowFile: raw.workflowFile || defaults.workflowFile,
      inputs: {
        image: raw.inputs?.image ?? defaults.inputs.image,
        video: raw.inputs?.video ?? defaults.inputs.video,
        prompt: raw.inputs?.prompt ?? defaults.inputs.prompt,
      },
      output: { node: raw.output?.node ?? defaults.output.node },
    };
  } catch {
    return defaults;
  }
}

const baseMap = loadNodeMap();

export const config = {
  /** comfy (the default since 2026-10-29: real runs, or a connect sheet when nothing is set up) · mock = development and tests only (sample results). */
  backend: (env('BACKEND') === 'mock' ? 'mock' : 'comfy') as Backend,
  comfyApiKey: process.env.COMFY_API_KEY || '',
  comfyBaseUrl: process.env.COMFY_BASE_URL || '',
  workflowPath: path.join(
    WORKFLOWS_DIR,
    env('WORKFLOW') || baseMap.workflowFile,
  ),
  nodes: {
    image: parseNodeField(env('NODE_IMAGE'), baseMap.inputs.image),
    video: parseNodeField(env('NODE_VIDEO'), baseMap.inputs.video),
    prompt: parseNodeField(env('NODE_PROMPT'), baseMap.inputs.prompt),
    output: env('NODE_OUTPUT')?.trim() || baseMap.output.node,
  },
  jobTimeoutMs: Number(env('COMFY_TIMEOUT_MS')) || 30 * 60 * 1000,
  /** Local / native ComfyUI runs (comfy/native.ts): fail only after this long with NO progress while our prompt runs (OPENHIGGSFIELD_COMFY_STALL_MS, default 10 min). */
  comfyStallMs: Number(env('COMFY_STALL_MS')) || 10 * 60 * 1000,
  /** Native runs' hard cap on running time: max(60 min, 4× the calibrated ETA) unless OPENHIGGSFIELD_COMFY_TIMEOUT_MS is set (then exactly that). */
  comfyHardCapOverrideMs: Number(env('COMFY_TIMEOUT_MS')) || null,
  comfyHardCapFloorMs: 60 * 60 * 1000,
};

/** True when targeting Comfy Cloud (default base) without a key. */
export function comfyNeedsKey(): boolean {
  const base = config.comfyBaseUrl.trim();
  if (!base) return true; // defaults to cloud.comfy.org
  if (/cloud\.comfy\.org/i.test(base)) return true;
  if (/\.run\.comfy\.app/i.test(base)) return true; // deployments require key
  return false; // local proxy / custom host — key optional
}

export function workflowLooksLikeStub(workflowPath: string): boolean {
  if (!existsSync(workflowPath)) return true;
  try {
    const text = readFileSync(workflowPath, 'utf8');
    return text.includes('PLACEHOLDER_') || text.includes('OpenHiggsfield stub');
  } catch {
    return true;
  }
}
