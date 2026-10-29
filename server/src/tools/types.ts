import type { Job } from '../jobs.js';

export interface ToolInputSpec {
  name: string;
  kind: 'file' | 'files' | 'text' | 'number' | 'select' | 'list';
  required?: boolean;
  accept?: string;
  options?: string[];
  max?: number;
  /** Per-file byte cap (e.g. Restyle character refs: 64 MiB). */
  maxBytes?: number;
  default?: string;
  /** Display label when the field name alone is unclear (e.g. Product Shot `image` = "Product image"). */
  label?: string;
}

export interface Preset { id: string; label: string; prompt: string; /** One-line card text (our own wording). */ description?: string; /** Set (live) when the tile art is still missing and the web shows the branded stand-in. */ standIn?: boolean; /** Tile art is an AI-generated still (interim tiles); show an 'AI-generated' badge. */ aiGenerated?: boolean; /** Credit line for the tile art, e.g. 'AI-generated preview'. */ credit?: string | null; group?: string; /** ISO date the preset shipped (Camera Moves 'New' group). */ addedAt?: string; /** Optional looping demo clip (our own media). */ previewUrl?: string | null; /** Still poster for the preset tile (our own sample-derived image). */ posterUrl?: string | null; /** Restyle: style swatch image (server/samples/styles). */ swatchUrl?: string | null; /** Restyle: prompt template with {subject}. */ promptTemplate?: string; /** Set when the preset needs non-default weights (e.g. LTX camera LoRAs). */ license?: import('../licenses.js').LicenseId }

export interface ToolDef {
  /** P0 (BUG-HUNT-7): job-shape routing fields parseInput always sets (fixed mode, duration…), applied by routing/select.ts resolveRoute to quotes and submits alike. */
  routeInput?: (input: Record<string, any>) => Record<string, any>;
  id: string;
  name: string;
  description?: string;
  /** Nav category, e.g. "Swap & Motion" (read by web/src/ui/registryFields.ts CATEGORY_FIELD). */
  category: string;
  /** Omit for stable tools; otherwise a short badge like 'new' / 'beta' (registryFields.ts STATUS_FIELD). */
  status?: string;
  /** Tool accepts the mock free-run allowance (useFree=1). */
  freeGens?: boolean;
  /** Optional looping demo clip for Explore tiles (our own media). */
  previewUrl?: string | null;
  /** Web route for this tool. */
  route: string;
  /** false = kept for the API, MCP and saved jobs but hidden from menus, browse and search (the former OpenSoul page). */
  listed?: boolean;
  /** Which shared web screen renders it ('video-swap' | 'reshoot' | 'app'). */
  ui: string;
  inputs: ToolInputSpec[];
  /** App-template options for ui 'app' (see tools/apps.ts). */
  app?: Record<string, any>;
  presets?: Preset[];
  /** Workflow file(s) under workflows/ this tool uses in comfy mode. */
  workflows: string[];
  /** Open model(s) we intend to use. Informational. */
  model?: string;
  /** Estimated GPU seconds per second of source video, by resolution (shown instead of credits). */
  gpuSecPerSec: Record<string, number>;
  /** Per-tool price overrides (plugins): factors by preset/type id and by provider id. */
  pricing?: { optionFactors?: Record<string, number>; providerFactors?: Record<string, number> };
  /** Set for tools loaded from plugins/. */
  plugin?: { id: string; dir: string; version?: string; license: { id: string; name: string; osi: boolean; url: string | null }; handler: boolean };
  /** Provider ids this tool supports; the first is the default (open weights). */
  providers: string[];
  /** Mock pipeline stages, in order: [key, label]. */
  stages: [string, string][];
  /** Validate multipart fields/files (files = saved names in DATA_DIR). Return input or { error }. */
  parseInput: (fields: Record<string, string>, files: Record<string, string[]>) => Promise<Record<string, any> | { error: string }>;
  /** Run the job; resolves when job reaches a terminal status. Should not throw. */
  run: (job: Job) => Promise<void>;
  /** Routed (fal/Replicate) runs: per-job request extras (reference data URIs, size, aspect), computed at run time. */
  routedExtras?: (job: Job) => Promise<{ imageUrls?: string[]; imageSize?: { width: number; height: number }; aspect?: string }>;
  /** Routed runs: post-process the downloaded outputs (OpenSoul: server colour match + fal-ai/esrgan upscale). */
  routedPost?: (job: Job, ctx: { live: boolean; falKey?: string | null }) => Promise<void>;
}
