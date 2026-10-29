/**
 * The 3D page (2026-10-23): one page at /tools/3d with its workflows in the bar's first chip, like Image, Video and Audio.
 * Isomorphic (no server imports): the web reads the same lists. GET /api/3d-workflows serves them with the live defaults.
 *
 *  - Workflows: Image to 3D (default, runs on tool `three-d`), Turntable video (tool `three-d-turntable`: the browser records an orbit of the
 *    model and the server keeps it as a normal video result, free), and the roadmap rows (Text to 3D, Multi-view to 3D, Retexture, Rig),
 *    listed as "Coming soon" and never runnable. Direct a Shot (tool `plan-a-shot`, shared/previzTemplates.ts) records a planned 3D shot as a video.
 *  - Models: what each 3D model takes (detail, texture, face count, seed, symmetry, format) so the bar shows only the chips a model reads.
 *  - Price key: hosted 3D prices depend on detail, texture and face count, not on a video resolution. The job's `resolution` carries
 *    `threeDPriceKey()` (ToolDef.routeInput sets it on quotes and submits alike), and each hosted price row has one rate per key (quote = charge).
 */

export type ThreeDWorkflowId = 'image-to-3d' | 'turntable' | 'plan-a-shot' | 'text-to-3d' | 'multiview-to-3d' | 'retexture' | 'rig';
export type ThreeDCategory = 'create' | 'edit' | 'video';
export interface ThreeDWorkflow {
  id: ThreeDWorkflowId; name: string; tagline: string; icon: string; category: ThreeDCategory;
  /** What it takes, in a few words ("1 image", "1 model"). */ needs: string;
  /** ready = runs now; soon = listed on the roadmap, never runnable. */ status: 'ready' | 'soon';
  /** Tool and mode that run it (null for roadmap rows). */ toolId: string | null; mode: string | null;
  /** How it works, for the picker's ⓘ (our own words). */ how: [string, string][];
  /** Generate's label. */ generateLabel: string;
  /** Where the workflow (graph) comes from. */ source: { kind: 'official' | 'community' | 'ours'; note: string };
}
export const THREE_D_PAGE = '/tools/3d';
export const THREE_D_TOOL = 'three-d';
export const TURNTABLE_TOOL = 'three-d-turntable';
/** Direct a Shot (shared/previzTemplates.ts): the browser records a planned 3D shot frame by frame; the server keeps it as an MP4 (free). */
export const PLAN_SHOT_TOOL = 'plan-a-shot';
export const threeDRoute = (id: ThreeDWorkflowId | string) => `${THREE_D_PAGE}?workflow=${id}`;

export const THREE_D_WORKFLOWS: ThreeDWorkflow[] = [
  { id: 'image-to-3d', name: 'Image to 3D', tagline: 'One picture in, a textured 3D model out', icon: 'cube', category: 'create', needs: '1 image', status: 'ready', toolId: THREE_D_TOOL, mode: 'image-to-3d',
    how: [['Add one image', 'A single object or character on a plain background works best. Remove the background first if it is busy.'], ['Pick a model and its detail', 'Each model reads its own settings: detail, texture, face count.'], ['Get a GLB', 'Orbit it, download it, or make a turntable video from it.']],
    generateLabel: 'Generate', source: { kind: 'official', note: 'Tripo: official Comfy template api_tripo3_1_image_to_model; fal models: the provider’s own API' } },
  { id: 'turntable', name: 'Turntable video', tagline: 'A model spins once in front of the camera, saved as a video', icon: 'orbit', category: 'video', needs: '1 model', status: 'ready', toolId: TURNTABLE_TOOL, mode: 'turntable',
    how: [['Pick a 3D result', 'Any GLB from your 3D feed.'], ['Record in the browser', 'Your browser renders the orbit and records it: nothing is sent to a provider.'], ['Get an MP4', 'Saved like any video result, free. Send it to Video as a start frame from there.']],
    generateLabel: 'Record turntable', source: { kind: 'ours', note: 'recorded in the browser from the 3D viewer' } },
  { id: 'plan-a-shot', name: 'Direct a Shot', tagline: 'Stage the scene and camera in simple 3D, record a mockup, then render real video', icon: 'previz', category: 'video', needs: 'A preset', status: 'ready', toolId: PLAN_SHOT_TOOL, mode: 'plan-a-shot',
    how: [['1 · Stage', 'Pick a preset, set the camera move, speed and length, and scrub through it. Free, right in your browser.'], ['2 · Mockup', 'Record mockup: your browser draws every frame exactly and saves an MP4 in your feed. Free, takes seconds.'], ['3 · Render', 'LTX-2.5 22B with Lightricks’ Layout to Render IC-LoRA turns your mockup into real video, keeping the camera path and where things are. Free, on your computer (slow: minutes).']],
    generateLabel: 'Record mockup', source: { kind: 'ours', note: 'Our own scenes, drawn in your browser' } },
  { id: 'text-to-3d', name: 'Text to 3D', tagline: 'Describe an object, get a model', icon: 'type', category: 'create', needs: 'Prompt', status: 'soon', toolId: null, mode: null,
    how: [['Write a prompt', 'Image makes a picture first.'], ['Image to 3D', 'That picture becomes the model.']], generateLabel: 'Generate', source: { kind: 'ours', note: 'coming soon' } },
  { id: 'multiview-to-3d', name: 'Multi-view to 3D', tagline: 'Front, side and back views for a closer match', icon: 'views', category: 'create', needs: '2–4 images', status: 'soon', toolId: null, mode: null,
    how: [['Add the views', 'Front first, then the sides and back.'], ['Get a GLB', 'The extra views fill in what one picture can’t show.']], generateLabel: 'Generate', source: { kind: 'official', note: 'coming soon' } },
  { id: 'retexture', name: 'Retexture', tagline: 'New surface, same shape', icon: 'brush', category: 'edit', needs: '1 model', status: 'soon', toolId: null, mode: null,
    how: [['Pick a model', 'Any GLB.'], ['Describe the new look', 'The shape stays; only the texture changes.']], generateLabel: 'Retexture', source: { kind: 'official', note: 'coming soon' } },
  { id: 'rig', name: 'Rig', tagline: 'Add a skeleton so a character can move', icon: 'rig', category: 'edit', needs: '1 model', status: 'soon', toolId: null, mode: null,
    how: [['Pick a character', 'A standing figure works best.'], ['Get a rigged GLB', 'Ready to pose or animate.']], generateLabel: 'Rig', source: { kind: 'official', note: 'coming soon' } },
];
export const THREE_D_DEFAULT_WORKFLOW: ThreeDWorkflowId = 'image-to-3d';
export const THREE_D_CATEGORIES: { id: ThreeDCategory | 'all'; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'create', label: 'Create' }, { id: 'edit', label: 'Edit' }, { id: 'video', label: 'Video' }];
export const threeDWorkflowById = (id: string | null | undefined): ThreeDWorkflow | null => THREE_D_WORKFLOWS.find((w) => w.id === id) ?? null;
/** tool:mode → workflow (routing/defaults.ts resolves the per-workflow default with it). */
export const threeDWorkflowForToolMode = (toolId: string, mode: string | null): ThreeDWorkflowId | null =>
  THREE_D_WORKFLOWS.find((w) => w.status === 'ready' && w.toolId === toolId && (!mode || w.mode === mode))?.id ?? null;
/** /tools/3d?workflow=<id> for a known workflow; unknown ids open the default. */
export const currentThreeDWorkflow = (search: string): ThreeDWorkflow => threeDWorkflowById(new URLSearchParams(search.replace(/^\?/, '')).get('workflow')) ?? THREE_D_WORKFLOWS[0];
/** Old / alias URLs → the 3D page. Query parameters (?fromJob=…) are kept by the caller. */
export const THREE_D_REDIRECTS: Record<string, string> = { '/3d': THREE_D_PAGE, '/tools/three-d': THREE_D_PAGE, '/tools/image-to-3d': threeDRoute('image-to-3d'), '/tools/turntable': threeDRoute('turntable'), '/tools/three-d-turntable': threeDRoute('turntable'), '/tools/plan-a-shot': threeDRoute('plan-a-shot') };
export function threeDRedirectTarget(pathname: string, search = '', hash = ''): string | null {
  const p = (pathname.replace(/\/+$/, '') || '/').toLowerCase(); const to = THREE_D_REDIRECTS[p]; if (!to) return null;
  const q = new URLSearchParams(search.replace(/^\?/, '')); const t = new URLSearchParams(to.split('?')[1] ?? '');
  for (const [k, v] of q) if (!t.has(k)) t.set(k, v); const qs = t.toString(); return `${to.split('?')[0]}${qs ? `?${qs}` : ''}${hash}`;
}
/** "Send to 3D": an image result opens Image to 3D with that image in the slot. */
export const sendTo3dHref = (jobId: string, out = 0) => `${threeDRoute('image-to-3d')}&fromJob=${encodeURIComponent(jobId)}&out=${out}`;

// ---------------- models ----------------
export type Detail = 'low' | 'standard' | 'high';
export type Texture = 'off' | 'standard' | 'hd' | 'pbr';
export type Faces = 'auto' | '10k' | '50k' | '200k';
export const DETAILS: Detail[] = ['low', 'standard', 'high'];
export const TEXTURES: Texture[] = ['off', 'standard', 'hd', 'pbr'];
export const FACES: Faces[] = ['auto', '10k', '50k', '200k'];
export const FACE_COUNT: Record<Exclude<Faces, 'auto'>, number> = { '10k': 10_000, '50k': 50_000, '200k': 200_000 };
type Opt<T extends string> = { value: T; label: string; note?: string };
export interface ThreeDModel {
  id: string; name: string; maker: string; makerName: string;
  /** Where it runs: Comfy (partner node, Comfy key), fal (fal key), or this computer. */ place: 'comfy' | 'fal' | 'local';
  detail: Opt<Detail>[] | null; texture: Opt<Texture>[] | null; faces: Opt<Faces>[] | null;
  seed: boolean; symmetry: boolean; formats: string[];
  defaults: { detail: Detail; texture: Texture; faces: Faces };
  licence: { id: string; name: string; url: string; note?: string };
  /** The model's weights are public (whatever place runs it here), checked on the maker's model card 2026-10-28. Unconfirmed = false. */ openWeights: boolean;
  /** Local models: the files a first run needs (nothing is downloaded without the user's OK). */ download?: { bytes: number; files: { file: string; bytes: number; url: string }[]; template: string; templateUrl: string };
  /** Price notes for the model menu. */ priceNote: string; /** Typical run time, seconds (estimated; Generate's time) */ typicalSec: number;
}
const HF = (repo: string, p: string) => `https://huggingface.co/${repo}/resolve/main/${p}`;
export const PIXAL3D_FILES = [
  { file: 'pixal3d_int8_convrot.safetensors', bytes: 5_585_000_000, url: HF('Comfy-Org/Pixal3D', 'diffusion_models/pixal3d_int8_convrot.safetensors') },
  { file: 'trellis_2_int8_convrot.safetensors', bytes: 5_253_000_000, url: HF('Comfy-Org/TRELLIS.2', 'diffusion_models/trellis_2_int8_convrot.safetensors') },
  { file: 'dino_v3_L_naf_fp32.safetensors', bytes: 1_215_000_000, url: HF('Comfy-Org/Pixal3D', 'clip_vision/dino_v3_L_naf_fp32.safetensors') },
  { file: 'trellis_2_shape_vae_bf16.safetensors', bytes: 1_096_000_000, url: HF('Comfy-Org/Pixal3D', 'vae/trellis_2_shape_vae_bf16.safetensors') },
  { file: 'trellis_2_texture_vae_bf16.safetensors', bytes: 948_000_000, url: HF('Comfy-Org/Pixal3D', 'vae/trellis_2_texture_vae_bf16.safetensors') },
  { file: 'moge_2_vitl_normal_fp16.safetensors', bytes: 662_000_000, url: HF('Comfy-Org/MoGe', 'geometry_estimation/moge_2_vitl_normal_fp16.safetensors') },
  { file: 'birefnet.safetensors', bytes: 444_000_000, url: HF('Comfy-Org/BiRefNet', 'background_removal/birefnet.safetensors') },
];
export const THREE_D_MODELS: ThreeDModel[] = [
  { id: 'cloud-tripo-31', name: 'Tripo 3.1', maker: 'tripo', makerName: 'Tripo AI (VAST)', place: 'comfy',
    detail: [{ value: 'standard', label: 'Standard', note: 'Standard geometry' }, { value: 'high', label: 'High', note: 'Detailed geometry' }],
    texture: [{ value: 'off', label: 'Off', note: 'Bare geometry' }, { value: 'standard', label: 'Standard', note: 'Colour textures' }, { value: 'hd', label: 'HD', note: 'Detailed textures' }, { value: 'pbr', label: 'PBR', note: 'Standard textures + PBR maps' }],
    faces: [{ value: 'auto', label: 'Auto', note: 'Model decides' }, { value: '10k', label: '10k', note: 'Light, for games' }, { value: '50k', label: '50k', note: 'Balanced' }, { value: '200k', label: '200k', note: 'Most detail' }],
    seed: true, symmetry: false, formats: ['glb'], defaults: { detail: 'standard', texture: 'pbr', faces: 'auto' },
    openWeights: false, licence: { id: 'tripo-terms', name: 'Tripo terms of service (hosted)', url: 'https://www.tripo3d.ai/terms' }, priceNote: '$0.20–$0.60 a model on Comfy credits (texture and detail)', typicalSec: 90 },
  { id: 'fal-trellis2', name: 'TRELLIS.2', maker: 'microsoft', makerName: 'Microsoft', place: 'fal',
    detail: [{ value: 'low', label: 'Low', note: '512 resolution' }, { value: 'standard', label: 'Standard', note: '1024 resolution' }, { value: 'high', label: 'High', note: '1536 resolution' }],
    texture: [{ value: 'standard', label: 'Standard', note: '2K texture' }, { value: 'hd', label: 'HD', note: '4K texture' }],
    faces: [{ value: 'auto', label: 'Auto', note: 'Model decides' }, { value: '10k', label: '10k', note: 'Light, for games' }, { value: '50k', label: '50k', note: 'Balanced' }, { value: '200k', label: '200k', note: 'Most detail' }],
    seed: true, symmetry: false, formats: ['glb'], defaults: { detail: 'standard', texture: 'standard', faces: 'auto' },
    openWeights: true /* huggingface.co/microsoft/TRELLIS.2-4B, MIT */, licence: { id: 'mit', name: 'MIT (TRELLIS.2 weights and code)', url: 'https://huggingface.co/microsoft/TRELLIS.2-4B' }, priceNote: '$0.25 / $0.30 / $0.35 by resolution on fal', typicalSec: 60 },
  { id: 'fal-hunyuan3d-31', name: 'Hunyuan 3D 3.1', maker: 'tencent-hunyuan', makerName: 'Tencent Hunyuan', place: 'fal',
    detail: null,
    texture: [{ value: 'standard', label: 'Standard', note: 'Colour textures' }, { value: 'pbr', label: 'PBR', note: 'Adds PBR maps' }],
    faces: [{ value: 'auto', label: 'Auto', note: 'About 500k' }, { value: '50k', label: '50k', note: 'Lighter mesh' }, { value: '200k', label: '200k', note: 'Medium mesh' }],
    seed: false, symmetry: false, formats: ['glb'], defaults: { detail: 'standard', texture: 'standard', faces: 'auto' },
    openWeights: false /* 3.x is API-only as far as we could confirm (Comfy docs: partner node); 2.x weights are public */, licence: { id: 'tencent-hunyuan-3d', name: 'Tencent Hunyuan 3D (hosted on fal)', url: 'https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/main/LICENSE', note: 'Tencent’s Hunyuan 3D community licence does not apply in the EU, the UK or South Korea; hosted runs follow fal’s terms.' },
    priceNote: '$0.375 a model on fal; PBR or a set face count +$0.15 each', typicalSec: 120 },
  { id: 'comfy-pixal3d-trellis2', name: 'Pixal3D + TRELLIS.2', maker: 'pixal3d', makerName: 'Pixal3D authors', place: 'local',
    detail: null, texture: null, faces: null, seed: true, symmetry: false, formats: ['glb'], defaults: { detail: 'standard', texture: 'standard', faces: 'auto' },
    openWeights: true, licence: { id: 'mit', name: 'MIT (Pixal3D, TRELLIS.2, MoGe, BiRefNet); DINOv3 under Meta’s DINOv3 licence', url: 'https://huggingface.co/Comfy-Org/Pixal3D' },
    download: { bytes: PIXAL3D_FILES.reduce((a, f) => a + f.bytes, 0), files: PIXAL3D_FILES, template: '3d_pixal3d_trellis2_image_to_model', templateUrl: 'https://github.com/Comfy-Org/workflow_templates/blob/main/templates/3d_pixal3d_trellis2_image_to_model.json' },
    priceNote: 'Needs download (15.2 GB) · then free, locally · MIT', typicalSec: 300 }, /* 15.2 GB = PIXAL3D_FILES (test checks) */
];
export const THREE_D_MODEL_IDS = THREE_D_MODELS.map((m) => m.id);
export const threeDModel = (id: string | null | undefined) => THREE_D_MODELS.find((m) => m.id === id) ?? null;
export const fmtGB = (bytes: number) => `${(bytes / 1e9).toFixed(1)} GB`;
/** The model's own value for a setting: the asked value when the model offers it, else the nearest it does, else its default. */
function near<T extends string>(order: T[], opts: Opt<T>[] | null, want: unknown, def: T, tieHigh = false): T {
  if (!opts?.length) return def; const vals = opts.map((o) => o.value); if (vals.includes(want as T)) return want as T;
  const i = order.indexOf(want as T); if (i < 0) return vals.includes(def) ? def : vals[0];
  const d = (v: T) => Math.abs(order.indexOf(v) - i); // a tie goes to the cheaper value (detail, texture), or to a set count rather than Auto (faces)
  return vals.reduce((b, v) => (d(v) < d(b) || (tieHigh && d(v) === d(b)) ? v : b), vals[0]);
}
/** Settings a model really runs with (unknown or unsupported values snap to what it offers). Texture 'pbr' falls back to standard, not HD. */
export function normalizeSettings(modelId: string, s: { detail?: unknown; texture?: unknown; faces?: unknown }): { detail: Detail; texture: Texture; faces: Faces } {
  const m = threeDModel(modelId); if (!m) return { detail: 'standard', texture: 'standard', faces: 'auto' };
  const tex = m.texture && s.texture === 'pbr' && !m.texture.some((o) => o.value === 'pbr') ? 'standard' : s.texture;
  return { detail: near(DETAILS, m.detail, s.detail, m.defaults.detail), texture: near(TEXTURES, m.texture, tex, m.defaults.texture), faces: near(FACES, m.faces, s.faces, m.defaults.faces, true) };
}
/** The price key a 3D job carries in `resolution` (routeInput): `<detail>.<texture>.<faces>`, as sent; each price row maps every key to the
 *  rate of the settings that model really runs (normalizeSettings), so an unsupported value quotes what runs. */
export const threeDPriceKey = (s: { detail?: unknown; texture?: unknown; faces?: unknown }) =>
  `${DETAILS.includes(s.detail as Detail) ? s.detail : 'standard'}.${TEXTURES.includes(s.texture as Texture) ? s.texture : 'standard'}.${FACES.includes(s.faces as Faces) ? s.faces : 'auto'}`;
export const ALL_PRICE_KEYS = DETAILS.flatMap((d) => TEXTURES.flatMap((t) => FACES.map((f) => `${d}.${t}.${f}`)));
const k3 = (k: string) => { const [detail, texture, faces] = k.split('.'); return { detail, texture, faces }; };

/** Published prices, USD per model (read 2026-10-23). Comfy partner nodes bill Comfy credits at 211 credits = $1. */
export const THREE_D_USD: Record<string, (s: { detail: Detail; texture: Texture; faces: Faces }) => number> = {
  /** Tripo v3.x Image to Model (docs.comfy.org partner-node pricing, credits): texture off / standard / detailed × geometry standard / detailed:
   *  42.2 / 84.4 · 63.3 / 105.5 · 84.4 / 126.6. PBR maps don't change the price; face_limit doesn't either. */
  'cloud-tripo-31': (s) => { const geo = s.detail === 'high' ? 1 : 0; const tex = s.texture === 'off' ? 0 : s.texture === 'hd' ? 2 : 1; return [[42.2, 84.4], [63.3, 105.5], [84.4, 126.6]][tex][geo] / 211; },
  /** fal-ai/trellis-2: "$0.25 for 512p resolution, $0.30 for 1024p resolution and $0.35 for 1536p resolution". Texture size and decimation are free. */
  'fal-trellis2': (s) => (s.detail === 'low' ? 0.25 : s.detail === 'high' ? 0.35 : 0.3),
  /** fal-ai/hunyuan-3d/v3.1/pro/image-to-3d: "$0.375 per generation", "Enabling PBR materials adds $0.15", "Custom face count adds $0.15". */
  'fal-hunyuan3d-31': (s) => 0.375 + (s.texture === 'pbr' ? 0.15 : 0) + (s.faces !== 'auto' ? 0.15 : 0),
};
/** One USD rate per price key for a model (the HostedPrice usdByQuality table). */
export const usdByKey = (modelId: string): Record<string, number> => Object.fromEntries(ALL_PRICE_KEYS.map((k) => [k, Math.round(THREE_D_USD[modelId](normalizeSettings(modelId, k3(k))) * 1e5) / 1e5]));
/** A huge GLB: warn before loading it in the viewer (bytes). */
export const BIG_GLB_BYTES = 60 * 1024 * 1024;

// ---------------- showcase (Scenario's open 3D dataset) ----------------
/** "Made with these models": ten light examples from Scenario's open dataset on Hugging Face (scenario-labs/3d-collection, CC BY 4.0,
 *  credit "Scenario"). Loaded at runtime from their Hugging Face URLs; nothing is copied into this repo. Picked 2026-10-23 for size (GLB ≤ ~15 MB)
 *  and a mix of models; the Hunyuan examples live in a separate gated dataset, so none are here. */
export const SCENARIO_DATASET = { name: 'Scenario 3D Collection', url: 'https://huggingface.co/datasets/scenario-labs/3d-collection', credit: 'Scenario', licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/' };
const HFD = (p: string) => `https://huggingface.co/datasets/scenario-labs/3d-collection/resolve/main/${p}`;
export interface ShowcaseItem { id: string; model: string; /** maker key (modelIds MAKERS) */ modelKey: string; glb: string; glbMB: number; preview: string; input: string; title: string }
const sc = (asset: string, input: string, model: string, modelKey: string, glbMB: number, title: string): ShowcaseItem => ({
  id: asset, model, modelKey, glbMB, title, glb: HFD(`assets/scenario_${asset}/output.glb`), preview: HFD(`assets/scenario_${asset}/preview.jpg`), input: HFD(input) });
export const THREE_D_SHOWCASE: ShowcaseItem[] = [
  sc('asset_XnyHkwrbpE93GNL52i6niDSi', 'inputs/asset_zVErRdpnXEZSxZscsxb4qJ43.png', 'Tripo 3.1', 'tripo', 2.62, 'Spiky turtle'),
  sc('asset_Tk9vBGkC8JWorHomtKxnnqTn', 'inputs/asset_VabKB9YYDmyK64vQnshyBTp8.png', 'Tripo 3.1', 'tripo', 3.4, 'Sentry turret'),
  sc('asset_4q1cgygAYadUkgeivnvdJDVx', 'inputs/asset_TKXLQP9jsgTo2b1jS7ZL4aMT.png', 'Tripo 3.1', 'tripo', 3.16, 'Toy blaster'),
  sc('asset_kUKVj6BWsJLTXepsfu6ToAfk', 'inputs/asset_5hrEktGoF1VjQHUVtcmEfgyT.jpg', 'TRELLIS.2', 'microsoft', 15.19, 'Potion bottle'),
  sc('asset_v66kREa1NK6ntgMMsHDJtpd2', 'inputs/asset_h4bnTXqjcoHWqqSTzZaZw1nP.png', 'Meshy 7.1', 'meshy', 9.67, 'Carved owl'),
  sc('asset_cPzUEPqKjyz1RvGhWodJygJL', 'inputs/asset_PDuVzEtMhzinNfeDEzWf5EyU.png', 'Rodin Gen-2.5', 'rodin', 3.74, 'Fox cub'),
  sc('asset_sZCtAu1htZzksGGSmkCkrJy7', 'inputs/asset_nVpgfXaLFx4kPJxFYMVGo9z8.png', 'Rodin Gen-2.5', 'rodin', 9.31, 'Glazed donut'),
  sc('asset_8pum7JgJbuxfcwoMJn5kS8aZ', 'inputs/asset_EHvbM6zm1PE992ohj9SnBLX4.png', 'Rodin Gen-2.5 Fast', 'rodin', 2.0, 'Frog explorer'),
  sc('asset_95NZSL5PxdZjEMQL4QpoWaz7', 'inputs/asset_Czn38evSTzz7nSRPMovgjTFh.png', 'Pixal3D', 'pixal3d', 8.18, 'Runner'),
  sc('asset_TmBXvPuDDd6hQohRKc2xA7CD', 'inputs/asset_8W68tXrQJz4H4B6JFUSatwnT.png', 'Tripo P1', 'tripo', 1.89, 'Treehouse'),
];
