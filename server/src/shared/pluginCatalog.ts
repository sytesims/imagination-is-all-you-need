/**
 * The Plugins page's catalogue of the plugins we ship (plan step 7): the plain name, one-line description and group each one shows, what it
 * needs, and how it can change. Isomorphic data (no imports): the server's GET /api/plugins builds its list from it, and the web reads the
 * same types. The ids are the profile ids (server/profiles/*.yml, boot.ts BUILTIN_PLUGINS).
 *
 * Not listed: `legacy` (the server itself) and `web-static` (the page you are looking at): they are the app, not parts you switch.
 * The spend guard is listed as a core row (CORE_ROWS): always on, no switch.
 */

export type PluginGroup = 'places' | 'studios' | 'money' | 'features';
export const PLUGIN_GROUPS: { id: PluginGroup; label: string }[] = [
  { id: 'places', label: 'Places to run' }, { id: 'studios', label: 'Studios' }, { id: 'money', label: 'Money' }, { id: 'features', label: 'Features' },
];

export interface CatalogEntry {
  id: string; name: string; group: PluginGroup; description: string;
  /** The key it runs with: the Connections card (#conn-<connection>) and its plain name ("Add <label>"). */
  key?: { connection: string; label: string };
  /** Plugins it can't run without (turning one of these off turns this one off too; turning this on turns them on). */
  needs?: string[];
  /** Changes only when the app starts again (it writes into shared tables at start, or a loop outside it keeps running). */
  restartOnly?: boolean;
  /** Shipped but not in the edition: you add it yourself with Install (no download: it is already in the app). */
  installable?: boolean;
  /** A short tag next to the name (e.g. "Reseller"). */
  tag?: string;
  /** It can start a paid run (always only after you OK the price: the spend guard). */
  canSpend?: boolean;
  /** Its settings live elsewhere in the app: a label and the link. */
  settings?: { label: string; to: string }[];
}

const place = (id: string, name: string, description: string, o: Partial<CatalogEntry> = {}): CatalogEntry => ({ id, name, group: 'places', description, ...o });
const key = (connection: string, label: string) => ({ key: { connection, label }, canSpend: true });

export const PLUGIN_CATALOG: CatalogEntry[] = [
  place('place-comfy-local', 'Your computer', 'Free runs on your own graphics card with ComfyUI', { settings: [{ label: 'Your computer', to: '/settings#gpu' }] }),
  place('place-comfy-cloud', 'Comfy Cloud', 'Run ComfyUI workflows on rented graphics cards', key('comfy', 'Comfy key')),
  place('place-comfy-router', 'Comfy Router', 'One account for many paid models', key('comfy', 'Comfy key')),
  place('place-fal', 'fal', 'Fast paid image, video and audio models', key('fal', 'fal key')),
  place('place-replicate', 'Replicate', 'Paid open and closed models, billed per run', key('replicate', 'Replicate token')),
  place('place-sunra', 'Sunra', 'Paid video and image models', key('sunra', 'Sunra key')),
  place('place-direct', 'Direct from the maker', 'Use a model maker’s own service with your key', { canSpend: true, settings: [{ label: 'Keys', to: '/settings#connections' }] }),
  place('place-sample', 'Samples', 'Pretend runs with example results, nothing is made or paid'),
  place('place-kie', 'kie.ai', 'Cheap paid models through a reseller. Prices and terms can change without notice', { ...key('kie', 'kie.ai key'), installable: true, tag: 'Reseller' }),
  place('place-runpod', 'RunPod', 'Rent a graphics card by the hour and run ComfyUI on it', { ...key('runpod', 'RunPod key'), installable: true, settings: [{ label: 'Endpoint ID', to: '/settings#conn-runpod' }] }),

  { id: 'studio-image', name: 'Image', group: 'studios', description: 'Make and edit pictures' },
  { id: 'studio-video', name: 'Video', group: 'studios', description: 'Make clips from words or pictures' },
  { id: 'studio-audio', name: 'Audio', group: 'studios', description: 'Music, voices and sound effects' },
  { id: 'studio-3d', name: '3D', group: 'studios', description: 'Turn a picture into a 3D model' },
  { id: 'studio-edit', name: 'Edit', group: 'studios', description: 'Reframe, clean up and polish your videos' },
  { id: 'apps-gallery', name: 'Apps gallery', group: 'studios', description: 'Ready-made apps where we write the prompt' },
  { id: 'workflow-folders', name: 'Workflow folders', group: 'studios', description: 'Load your own ComfyUI workflows from a folder', settings: [{ label: 'Your workflows', to: '/workflows/yours' }] },

  { id: 'spend-cap', name: 'Spend limit', group: 'money', description: 'Stop paid runs after a monthly amount', settings: [{ label: 'Monthly limit', to: '/account/usage' }] },
  { id: 'agent-budgets', name: 'Agent budgets', group: 'money', description: 'Give an AI assistant a fixed amount to spend' },
  { id: 'billing-team-mode', name: 'Team billing', group: 'money', description: 'One person pays, everyone gets credit' },
  { id: 'hosted-grant', name: 'Hosted credit', group: 'money', description: 'Welcome credit for a shared online copy' },

  { id: 'canvas', name: 'Canvas', group: 'features', description: 'A board to plan and chain your runs' },
  { id: 'canvas-agent', name: 'Canvas agent', group: 'features', description: 'Let your AI assistant work on your board', needs: ['canvas'] },
  { id: 'canvas-demo', name: 'Canvas demo', group: 'features', description: 'A guided helper that builds a board for you', needs: ['canvas'] },
  { id: 'film', name: 'Film', group: 'features', description: 'Put clips, music and titles together' },
  { id: 'discover', name: 'Discover', group: 'features', description: 'The examples and feeds on Explore' },
  { id: 'hub', name: 'Hub', group: 'features', description: 'Browse and add shared workflows' },
  { id: 'share', name: 'Share', group: 'features', description: 'Share cards, logo and text on results' },
  { id: 'captions', name: 'Captions', group: 'features', description: 'Subtitles made on your computer, burned in or as a file' },
  { id: 'backup', name: 'Backup', group: 'features', description: 'Save and restore your whole library', settings: [{ label: 'Backup & data', to: '/settings#backup' }] },
  { id: 'brand-kits', name: 'Brand kits', group: 'features', description: 'Your colours, fonts and mood on every result', settings: [{ label: 'Brands', to: '/assets/brands' }] },
  { id: 'hardware', name: 'Hardware', group: 'features', description: 'Checks what your computer can run and how fast', settings: [{ label: 'Your computer', to: '/settings#gpu' }] },
  { id: 'preflight', name: 'Preflight', group: 'features', description: 'Checks a run before it starts' },
  { id: 'prompt-grammar', name: 'Prompt grammar', group: 'features', description: 'How each model reads its prompt' },
  { id: 'open-models', name: 'Open models', group: 'features', description: 'Only allow models you could run yourself', settings: [{ label: 'Open models only', to: '/settings#open-models' }] },
  { id: 'openapi', name: 'API docs', group: 'features', description: 'Every tool and job as a web address' },
  { id: 'edge', name: 'Job list', group: 'features', description: 'Your job list, queue and bulk downloads' },
  { id: 'comfy-featured', name: 'Comfy templates', group: 'features', description: 'Official ComfyUI templates as ready workflows', restartOnly: true },
  { id: 'eta-learning', name: 'ETA learning', group: 'features', description: 'Learns how long runs take on your computer' },
  { id: 'comfy-deploy', name: 'Comfy deploy', group: 'features', description: 'Send your own workflow to Comfy Cloud', settings: [{ label: 'Your deployment', to: '/settings#conn-deploy' }] },
  { id: 'webhooks', name: 'Webhooks', group: 'features', description: 'Tell another app when a run finishes', restartOnly: true },
];

/** Core rows: part of the app itself, shown locked ("Always on"), never a switch. */
export const CORE_ROWS: CatalogEntry[] = [
  { id: 'spend-guard', name: 'Spend guard', group: 'money', description: 'Every paid run shows its price and waits for your OK' },
];

export const catalogEntry = (id: string): CatalogEntry | undefined => PLUGIN_CATALOG.find((e) => e.id === id) ?? CORE_ROWS.find((e) => e.id === id);

/** Plugins that need `id` (directly or through another): what turning it off also turns off. */
export function neededBy(id: string, list: CatalogEntry[] = PLUGIN_CATALOG): string[] {
  const out: string[] = []; const walk = (x: string) => { for (const e of list) if (e.needs?.includes(x) && !out.includes(e.id)) { out.push(e.id); walk(e.id); } };
  walk(id); return out;
}
/** Everything `id` needs (directly or through another): what turning it on also turns on. */
export function needsAll(id: string, list: CatalogEntry[] = PLUGIN_CATALOG): string[] {
  const out: string[] = []; const walk = (x: string) => { for (const n of list.find((e) => e.id === x)?.needs ?? []) if (!out.includes(n)) { out.push(n); walk(n); } };
  walk(id); return out;
}

/** What GET /api/plugins answers for one plugin. */
export type PluginState = 'on' | 'off' | 'needs-key' | 'failed' | 'paused' | 'not-installed';
export interface PluginRow {
  id: string; name: string; group: PluginGroup; description: string;
  /** made by us (shipped with the app) or by someone else (step 9) or by you (step 8) */
  source: 'ours' | 'community' | 'yours';
  state: PluginState; /** a plain sentence for the state */ reason: string;
  /** on in your choices (what the switch shows), whatever the state */ wanted: boolean;
  canTurnOff: boolean; core: boolean; installable: boolean; installed: boolean;
  needs: string[]; neededBy: string[];
  /** your choice is saved but applies after a restart */ restartNeeded: boolean; restartOnly: boolean;
  /** rejected: the provider refused the key on its last check (a real problem: the orange dot) */
  key: { connection: string; label: string; set: boolean; rejected?: boolean } | null;
  canSpend: boolean; tag: string | null; settings: { label: string; to: string }[];
  licence: string;
}
export interface PluginsAnswer {
  edition: { id: string; name: string; description: string };
  editions: { id: string; name: string; description: string }[];
  safeMode: boolean; restartNeeded: boolean;
  plugins: PluginRow[];
}
