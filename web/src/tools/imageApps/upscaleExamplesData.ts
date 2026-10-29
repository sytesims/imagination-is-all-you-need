/* Upscale page → Examples popup data (2026-10-22). Real runs, not mock-ups: each source is one of the user's own 1024 px Z-Image Turbo
 * renders made in this app, shrunk to 384 px (Lanczos), then upscaled ×4 on a local ComfyUI (Apple GPU) through POST
 * /api/tools/image-upscale/jobs with provider comfy-realesrgan (RealESRGAN_x4plus.pth) and comfy-ultrasharp (4x-UltraSharp.pth).
 * seconds = the job's renderStartedAt → finishedAt; bytes = the PNG the workflow saved (1536×1536).
 * Files (web/public/examples/upscale/examples): <id>-source.(png|jpg) the 384 px source ("Try this one" loads it), <id>-source-crop.png
 * its 128 px detail, <id>-<model>-1024.jpg the whole output shrunk to 1024 px, <id>-<model>-crop.jpg the matching 512 px detail
 * at full output resolution. Credits: ASSETS-CREDITS.md. */
export type ExampleModel = 'realesrgan' | 'ultrasharp';
export interface ExampleRun { full: string; crop: string; seconds: number; bytes: number }
export interface UpscaleExample {
  id: string; title: string; source: string; sourceCrop: string; cropSize: number;
  sourceSize: { width: number; height: number }; outputSize: { width: number; height: number };
  runs: Record<ExampleModel, ExampleRun>;
}
export const UPSCALE_EXAMPLES_DIR = '/examples/upscale/examples';
export const EXAMPLE_MODELS: Record<ExampleModel, { name: string; provider: string; file: string }> = {
  realesrgan: { name: 'Real-ESRGAN', provider: 'comfy-realesrgan', file: 'RealESRGAN_x4plus.pth' },
  ultrasharp: { name: '4x-UltraSharp', provider: 'comfy-ultrasharp', file: '4x-UltraSharp.pth' },
};
/** The model the examples cover for an upscale provider id (QA #18: the popup follows the picked model), or null when there is no example for it. */
export const exampleModelOf = (provider?: string | null): ExampleModel | null =>
  (Object.keys(EXAMPLE_MODELS) as ExampleModel[]).find(k => EXAMPLE_MODELS[k].provider === provider) ?? null;
/** "Real-ESRGAN vs 4x-UltraSharp": the models every example compares, named on the popup so it never reads as another model's example. */
export const EXAMPLES_COMPARE = (Object.keys(EXAMPLE_MODELS) as ExampleModel[]).map(k => EXAMPLE_MODELS[k].name).join(' vs ');
const S = { width: 384, height: 384 }; const O = { width: 1536, height: 1536 };
const ex = (id: string, title: string, source: string, re: [number, number], us: [number, number]): UpscaleExample => ({
  id, title, source, sourceCrop: `${id}-source-crop.png`, cropSize: 512, sourceSize: S, outputSize: O,
  runs: {
    realesrgan: { full: `${id}-realesrgan-1024.jpg`, crop: `${id}-realesrgan-crop.jpg`, seconds: re[0], bytes: re[1] },
    ultrasharp: { full: `${id}-ultrasharp-1024.jpg`, crop: `${id}-ultrasharp-crop.jpg`, seconds: us[0], bytes: us[1] },
  },
});
export const UPSCALE_EXAMPLES: UpscaleExample[] = [
  ex('ice-straw', 'Pink ice', 'ice-straw-source.png', [2.3, 4091473], [2.0, 5170179]),
  ex('armor', 'Armour', 'armor-source.jpg', [2.0, 4569063], [2.0, 5215215]),
  ex('steak', 'Steak', 'steak-source.png', [2.0, 4455313], [2.2, 5327172]),
  ex('brutalist', 'Brutalist balconies', 'brutalist-source.jpg', [1.9, 5619064], [2.0, 6006846]),
  ex('knitted-farm', 'Knitted farm', 'knitted-farm-source.jpg', [2.0, 5456155], [1.9, 6315488]),
];
