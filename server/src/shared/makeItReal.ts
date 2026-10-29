/**
 * Direct a Shot step 3, "Render" (2026-10-24). Isomorphic (no server imports): the sheet on the web and the server read the same rules.
 *
 * A Direct a Shot recording (tool plan-a-shot, outputs[0] = the Clay or Simple MP4) becomes a real-looking shot on LTX-2.5 22B (distilled, GGUF
 * Q4_K_M) with Lightricks' official Layout to Render IC-LoRA, locally and free. The recipe follows the LoRA's model card
 * (https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render):
 *  - the layout clip at 24 fps, width and height divisible by 64, the frame count snapped DOWN to 8k + 1 (a 72-frame clip becomes 65)
 *  - two stages: stage 1 at half size, 8 steps; the latent upscaled x2, stage 2 at full size, 3 steps; CFG 1, euler_ancestral, seed 42
 *  - an art-directed first frame (REQUIRED, docs.ltx.io): the plan's frame 0 repainted into the finished look by an image model, never the grey
 *    clay frame itself. The sheet can paint it for free on this computer with FLUX 3 Klein when it can run here, else FLUX.2 [klein] 4B (Create Image's local edit routes), or take a picture
 *  - a short prompt (one or two sentences about the finished shot) that never says "clay", "3D" or "Unreal"
 * On a Mac we keep drafts small: Draft = 768×448 (the default; stage 1 at 384×224), Sharper = 1024×576 (stage 1 at 512×288). Lightricks' known-good
 * size is 1920×1088, far too heavy for Apple graphics memory, so it is not offered.
 */

export const MAKE_REAL_TOOL = 'make-it-real';
export const MAKE_REAL_PROVIDER = 'comfy-ltx25-layout';
export const MAKE_REAL_WORKFLOW = 'ltx25-layout-to-render-api.json';
export const MAKE_REAL_FPS = 24;
export const MAKE_REAL_SEED = 42;

export type MakeRealAspect = '16:9' | '9:16' | '1:1';
export type MakeRealSize = 'standard' | 'quick';
/** Final (stage 2) sizes, every side divisible by 64, so stage 1 (half) sits on LTX's 32 grid. Direct a Shot records 1280×720 / 720×1280 / 960×960,
 *  so Standard scales without cropping; Quick 16:9 / 9:16 crops a sliver (768×448 is 1.71:1). */
export const MAKE_REAL_SIZES: Record<MakeRealSize, { label: string; note: string; dims: Record<MakeRealAspect, [number, number]> }> = {
  standard: { label: 'Sharper', note: 'About twice as slow', dims: { '16:9': [1024, 576], '9:16': [576, 1024], '1:1': [768, 768] } },
  quick: { label: 'Draft', note: 'Fastest; safest on memory', dims: { '16:9': [768, 448], '9:16': [448, 768], '1:1': [512, 512] } },
};
/** Draft lengths on LTX's 8k + 1 frame grid at 24 fps. 65 frames (2.7 s) is the default: every recording (3 s or longer) has enough frames. */
export const MAKE_REAL_LENGTHS = [41, 65, 97, 121] as const;
export const MAKE_REAL_DEFAULT_FRAMES = 65;
export const MAKE_REAL_DEFAULT_SIZE: MakeRealSize = 'quick';

/** Snap a frame count DOWN to 8k + 1 (Lightricks' recipe trims, it never pads). */
export const snap8k1 = (n: number) => (n < 9 ? 1 : Math.floor((Math.floor(n) - 1) / 8) * 8 + 1);
/** Frames a recording holds once resampled to 24 fps, snapped to 8k + 1: 3 s → 65, 6 s → 137. */
export const framesAvailable = (seconds: number) => snap8k1(Math.floor(seconds * MAKE_REAL_FPS + 1e-6));
/** The draft lengths a recording of `seconds` can give (never longer than the recording). */
export const lengthsFor = (seconds: number) => MAKE_REAL_LENGTHS.filter((f) => f <= framesAvailable(seconds));
export const secondsOf = (frames: number) => Math.round((frames / MAKE_REAL_FPS) * 10) / 10;
export const aspectOf = (w: number, h: number): MakeRealAspect => (Math.abs(w - h) <= Math.max(w, h) * 0.05 ? '1:1' : w > h ? '16:9' : '9:16');

export interface MakeRealPlan { width: number; height: number; stage1: { width: number; height: number }; frames: number; seconds: number; fps: number; aspect: MakeRealAspect; size: MakeRealSize }
/** Everything the graph and the conform step need, from the recording and the sheet's choices. Unknown choices fall back to the safe defaults. */
export function makeRealPlan(rec: { width: number; height: number; seconds: number }, ask: { frames?: number | string; size?: string } = {}): MakeRealPlan {
  const aspect = aspectOf(rec.width, rec.height); const size: MakeRealSize = ask.size === 'standard' || ask.size === 'quick' ? ask.size : MAKE_REAL_DEFAULT_SIZE;
  const [width, height] = MAKE_REAL_SIZES[size].dims[aspect];
  const ok = lengthsFor(rec.seconds); const want = Number(ask.frames);
  const frames = ok.includes(want as any) ? want : ok.includes(MAKE_REAL_DEFAULT_FRAMES) ? MAKE_REAL_DEFAULT_FRAMES : (ok[ok.length - 1] ?? Math.min(MAKE_REAL_DEFAULT_FRAMES, framesAvailable(rec.seconds)));
  return { width, height, stage1: { width: width / 2, height: height / 2 }, frames, seconds: secondsOf(frames), fps: MAKE_REAL_FPS, aspect, size };
}

/**
 * The Comfy Cloud place (2026-10-27, comfy/ltx25LayoutCloud.ts): the same recipe on shared Comfy Cloud (official int8 ConvRot files + the user's
 * imported Layout to Render LoRA). It adds a 720p size (1280×704 / 704×1280 / 960×960, rendered then scaled to the recording's 1280×720 in the graph)
 * and whole-second lengths up to the recording (at most 10 s): frames = 24·s + 1 (8k + 1). The Mac's Draft / Sharper and 41–121 frame lengths
 * stay as they are (makeRealPlan above). A recording of exactly 8.0 s (192 frames) gives 8 s = 193 frames: the conform holds its last frame once.
 */
export const MAKE_REAL_CLOUD_PLACE = 'comfy-cloud:cloud-ltx25-layout';
export type MakeRealCloudSize = MakeRealSize | 'hd';
export const MAKE_REAL_CLOUD_SIZES: Record<MakeRealCloudSize, { label: string; note: string; tier: '448p' | '576p' | '720p'; dims: Record<MakeRealAspect, [number, number]> }> = {
  quick: { ...MAKE_REAL_SIZES.quick, note: 'Cheapest', tier: '448p' },
  standard: { ...MAKE_REAL_SIZES.standard, note: 'Sharper', tier: '576p' },
  hd: { label: '720p', note: 'Rendered at 1280×704, scaled to 1280×720', tier: '720p', dims: { '16:9': [1280, 704], '9:16': [704, 1280], '1:1': [960, 960] } },
};
export const MAKE_REAL_CLOUD_DEFAULT_SIZE: MakeRealCloudSize = 'hd';
export const MAKE_REAL_CLOUD_SECONDS = { min: 2, max: 10 } as const;
/** Whole-second lengths the Cloud place can render from a recording of `seconds` (a 1/20 s tolerance: an 8.0 s recording gives 8 s). */
export const cloudLengthsFor = (seconds: number) => { const top = Math.min(MAKE_REAL_CLOUD_SECONDS.max, Math.floor(seconds + 0.05)); const out: number[] = []; for (let s = MAKE_REAL_CLOUD_SECONDS.min; s <= top; s++) out.push(s); return out; };
/** The final size the Cloud place hands back: 720p is scaled from 1280×704 to the recording's own 16:9 / 9:16 size; Draft / Sharper as rendered. */
export const cloudOutSize = (size: MakeRealCloudSize, aspect: MakeRealAspect): { width: number; height: number } =>
  size === 'hd' && aspect !== '1:1' ? (aspect === '16:9' ? { width: 1280, height: 720 } : { width: 720, height: 1280 }) : { width: MAKE_REAL_CLOUD_SIZES[size].dims[aspect][0], height: MAKE_REAL_CLOUD_SIZES[size].dims[aspect][1] };
export interface MakeRealCloudPlan extends Omit<MakeRealPlan, 'size'> { size: MakeRealCloudSize; tier: '448p' | '576p' | '720p'; out: { width: number; height: number }; place: 'cloud' }
/** The Cloud plan: the asked size and whole seconds (the defaults: 720p, the whole recording up to 10 s). null when the recording is under 2 s.
 *  720p fits the recording by scaling (no crop: 1280×720 → 1280×704 and back), so the render lines up with the mockup frame for frame. */
export function makeRealCloudPlan(rec: { width: number; height: number; seconds: number }, ask: { seconds?: number | string; size?: string } = {}): MakeRealCloudPlan | null {
  const ok = cloudLengthsFor(rec.seconds); if (!ok.length) return null;
  const aspect = aspectOf(rec.width, rec.height); const size: MakeRealCloudSize = ask.size === 'hd' || ask.size === 'standard' || ask.size === 'quick' ? ask.size : MAKE_REAL_CLOUD_DEFAULT_SIZE;
  const want = Number(ask.seconds); const seconds = ok.includes(want) ? want : ok[ok.length - 1];
  const [width, height] = MAKE_REAL_CLOUD_SIZES[size].dims[aspect]; const frames = seconds * MAKE_REAL_FPS + 1;
  return { width, height, stage1: { width: width / 2, height: height / 2 }, frames, seconds, fps: MAKE_REAL_FPS, aspect, size, tier: MAKE_REAL_CLOUD_SIZES[size].tier, out: cloudOutSize(size, aspect), place: 'cloud' };
}
/** The LoRA the Cloud place needs in the user's Comfy Cloud model library (not in Cloud's shared library, 2026-10-26). The repo is gated (auto-approve):
 *  accept Lightricks' licence on Hugging Face, add a Hugging Face read token in Comfy Cloud → Settings → Secrets, then Model Library → Import. */
export const LAYOUT_LORA_FILE = 'ltx-2.5-22b-ic-lora-layout-to-render-1.0.safetensors';
export const LAYOUT_LORA_REPO = 'https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render';
export const LAYOUT_LORA_URL = `${LAYOUT_LORA_REPO}/resolve/main/${LAYOUT_LORA_FILE}`;
/** The name Comfy Cloud gives an import from Hugging Face: <owner>__<repo>__<file> (seen on the Character Swap import, 2026-10-26). */
export const LAYOUT_LORA_IMPORTED = `Lightricks__LTX-2.5-22b-IC-LoRA-Layout-To-Render__${LAYOUT_LORA_FILE}`;
export const LAYOUT_LORA_STEPS = [
  `Accept Lightricks' licence on ${LAYOUT_LORA_REPO} (the repo is gated; approval is instant).`,
  'In Comfy Cloud → Settings → Secrets, add a Hugging Face read token (needed for gated repos).',
  `Comfy Cloud → Model Library → Import → paste ${LAYOUT_LORA_URL} → type LoRA.`,
  `It shows up as ${LAYOUT_LORA_IMPORTED}. Come back and Render.`,
] as const;

/** Words the LoRA card says to leave out of the prompt: they push the model to copy the rough shapes. */
export const PROMPT_AVOID = /\b(clay|3d|3-d|blockout|block-out|playblast|unreal|blender|viewport|grey ?box|gray ?box|mannequin)\b/i;
/** Strip the words the card says to avoid ("clay", "3D", "Unreal"…) from a prompt, tidying the spaces they leave. */
export const stripAvoidWords = (p: string) => p.replace(new RegExp(PROMPT_AVOID.source, 'gi'), '').replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').replace(/\(\s*\)/g, '').replace(/[,;:]+([.,;:!?])/g, '$1').replace(/^[\s,;:.]+/, '').trim();
/** What a still can show, from a video prompt (2026-10-26): the look, the place, the people, the light and the time of day stay; camera moves, motion,
 *  timings, action beats ("The person: 0–2 s walks…") and sound go. Motion verbs become poses ("walks down a street" → "mid-stride on a street"). */
const CAMERA_WORDS = /\b(camera|cameras|tracking|track(s|ing)? (shot|alongside)|dolly|dollies|pans?|panning|tilts?|tilting|orbits?|orbiting|push(es|ing)?[- ]in|pull(s|ing)?[- ](out|back)|crane|craning|zooms?|zooming|handheld|steadicam|slow[- ]motion|time[- ]lapse|follows?|following|one continuous shot|no cuts?|cuts? to)\b/i;
const MOTION_ONLY = /\b(motion|movement|moves smoothly|smooth(ly)? moving)\b/i;
const SOUND_WORDS = /\b(sound|sounds|audio|music|musical|soundtrack|score|footsteps?|birdsong|ambien(t|ce)|dialogue|voices?|noise|silence|we hear|whispers?|hum(s|ming)?)\b/i;
const TIMING = /(\b\d+(\.\d+)?\s*(–|-|to)\s*\d+(\.\d+)?\s*s\b|\b\d+(\.\d+)?\s*(s|secs?|seconds?)\b|\bfor (a few|several) seconds\b|\b(then|afterwards|after that|finally|at the end|later)\b)/i;
const ADVERB = '(?:\\s+(?:slowly|quickly|gently|smoothly|nervously|briskly|calmly|steadily|fast))?';
const STRIDE = new RegExp(`\\b(walks|walking|strolls|strolling|steps|stepping)${ADVERB}(\\s+(down|along|across|up|over|past))?\\b`, 'gi');
const RUN = new RegExp(`\\b(runs|running|jogs|jogging|sprints|sprinting)${ADVERB}(\\s+(down|along|across|up|over|past))?\\b`, 'gi');
const MOVING = new RegExp(`\\b(crosses|crossing|moves|moving|drives|driving|flies|flying|drifts|drifting|glides|gliding|slides|sliding|rolls|rolling|travels|travelling|traveling|turns|turning|spins|spinning|rotates|rotating|passes|passing|approaches|approaching)${ADVERB}(\\s+(on|over|across|along|down|up|past|through|into|by))?\\b`, 'gi');
const stillClause = (c: string) => c
  .replace(/\b(a|an)\s+(?:(?:slow|gentle|quick|short)\s+)?(\w+\s+)?walk(?:-through)?\s+(?:through|around|into|along)\b/gi, (_m, _a, adj) => `a ${adj ?? ''}view of`) // "a slow daylight walk through a home" → "a daylight view of a home"
  .replace(STRIDE, (_m, _v, prep) => (prep ? 'mid-stride on' : 'mid-stride')).replace(RUN, (_m, _v, prep) => (prep ? 'mid-run on' : 'mid-run'))
  .replace(/\b(jumps|jumping|leaps|leaping)\b/gi, 'mid-jump').replace(MOVING, (_m, _v, prep) => { const p = String(prep ?? '').trim().toLowerCase(); return p === 'over' ? 'over' : p === 'through' || p === 'into' ? 'in' : p ? 'on' : ''; })
  .replace(/\b(slowly|quickly|gently|smoothly)\b/gi, '').replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
export function stillPrompt(prompt: string): string {
  const text = stripAvoidWords(String(prompt ?? '')).replace(/\s+/g, ' ')
    .replace(/\s*(,\s*)?\b(with|and|to)\b[^,.;]*?\b(sound|sounds|audio|music|soundtrack|footsteps?|birdsong|ambien(t|ce)|dialogue|voices?|noise)\b[^,.;]*/gi, ''); // ", with birdsong and footsteps"
  const sentences = text.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean).filter((x) => !/^the (person|people|figure)\s*:/i.test(x)); // action beats
  const keep: string[] = [];
  for (const s0 of sentences) {
    const clauses = s0.replace(/[.!?]+$/, '').split(/\s*[,;]\s*|\s+(?:while|as|whilst)\s+(?=the camera|we |it |camera)/i).map((c) => c.trim()).filter(Boolean)
      .filter((c) => !CAMERA_WORDS.test(c) && !SOUND_WORDS.test(c) && !TIMING.test(c) && !(MOTION_ONLY.test(c) && c.split(/\s+/).length <= 4)).map(stillClause).filter((c) => c && !/^(and|with|a|an|the)$/i.test(c));
    if (clauses.length) keep.push(clauses.join(', ').replace(/^[a-z]/, (ch) => ch.toUpperCase()));
  }
  return keep.join('. ').replace(/\s{2,}/g, ' ').trim();
}
/** The free local first-frame painters: Create Image edit routes on this computer (2026-10-27). FLUX 3 Klein paints when its local route can run here
 *  (its files are on disk and it fits; GET /api/make-it-real/prep `painter`), else FLUX.2 [klein] 4B (bf16, small, runs on Apple Silicon). With a
 *  "Who is it?" picture it is always FLUX 3 Klein (multi-reference edit: the frame plus the person). Names = shared/modelIds.ts MODELS names. */
export const FIRST_FRAME_PAINTERS = {
  'comfy-flux3-klein': { tool: 'create-image', provider: 'comfy-flux3-klein', route: 'local:comfy-flux3-klein', name: 'FLUX 3 Klein' },
  'comfy-klein4b': { tool: 'create-image', provider: 'comfy-klein4b', route: 'local:comfy-klein4b', name: 'FLUX.2 [klein] 4B' },
} as const;
export type FirstFramePainter = (typeof FIRST_FRAME_PAINTERS)[keyof typeof FIRST_FRAME_PAINTERS];
/** The painter a job uses: FLUX 3 Klein when it can run here or with a "Who is it?" picture, else FLUX.2 [klein] 4B. */
export const firstFramePainter = (o: { flux3Ready?: boolean; who?: boolean }): FirstFramePainter => FIRST_FRAME_PAINTERS[o.who || o.flux3Ready ? 'comfy-flux3-klein' : 'comfy-klein4b'];
/** The line added when there is a "Who is it?" picture (the painter's second image). */
export const WHO_LINE = 'The person in the frame looks like the person in the second picture: the same face, hair and clothes.';
/** The prompt the first-frame painter gets (FIRST_FRAME_PAINTERS): the mockup's frame 0 repainted as a
 *  finished film still of what the user described (stillPrompt: no camera moves, motion, timings or sound), keeping the layout. Never says clay / 3D. */
export function firstFramePrompt(prompt: string, o: { who?: boolean } = {}): string {
  const still = stillPrompt(prompt).replace(/[.\s]+$/, '') || 'a real place in natural light';
  return `Turn this rough frame into a finished, photoreal film still: ${still}. Keep the exact composition, camera angle, horizon, and the position, size and outline of every object and figure. Add real materials, textures, light and colour.${o.who ? ` ${WHO_LINE}` : ''}`;
}
/** The sheet's starting prompt: the preset's short restyle prompt (already written for layout-to-render models) plus the "Describe your shot" note,
 *  then the acting beats of the person you played, if any (previzActor.ts actionPromptFor: "The person: 0–2 s walks nervously, 3 s waves"). */
export function makeRealPrompt(previz: { restyle?: { short?: string | null } | null; shot?: { note?: string | null } | null; action?: string | null } | null | undefined): string {
  const base = String(previz?.restyle?.short ?? '').trim(); const note = String(previz?.shot?.note ?? '').trim().replace(/\s+/g, ' '); const action = String(previz?.action ?? '').trim().replace(/\s+/g, ' ');
  const join = (a: string, b: string) => (!a ? b : !b ? a : `${a.replace(/[.\s]+$/, '')}. ${b.replace(/^[a-z]/, (c) => c.toUpperCase())}${/[.!?]$/.test(b) ? '' : '.'}`);
  return join(join(base, note), action);
}

/** First estimate of the run time on Apple Silicon (M1 Max class), in seconds, before this computer has timed a run (stepEta learns it after).
 *  Calibrated (2026-10-25) on our measured run: a 5 s Draft (768×448, 121 frames) took about 19 min; 2.7 s Draft reads about 10 min.
 *  LTX-2.5 22B Q4 with a doubled token count (the guide), 8 + 3 steps; the first run also loads ~42 GB of files. */
export function makeRealEtaSeconds(plan: Pick<MakeRealPlan, 'width' | 'height' | 'frames'>): { low: number; high: number } {
  const px = (plan.width * plan.height) / (768 * 448); const len = plan.frames / 65;
  const mid = 60 + 540 * Math.pow(px * len, 1.12); // 60 s of loading + 540 s of sampling and decode at Draft 2.7 s → 600 s; Draft 5 s → ~1140 s
  return { low: Math.round(mid * 0.85), high: Math.round(mid * 1.15) };
}
/** Comfy Cloud place: a first time range (queue + model load + render), from today's LTX-2.5 22B Cloud runs (2026-10-27: 5 s 720p text-to-video
 *  in ~36 s, a 10 s continuation in ~45 s) with the layout guide doubling the video tokens. 8 s 720p reads about 3 min. */
export function makeRealCloudEtaSeconds(plan: Pick<MakeRealPlan, 'width' | 'height' | 'frames'>): { low: number; high: number } {
  const mid = 60 + 15 * ((plan.frames - 1) / MAKE_REAL_FPS) * ((plan.width * plan.height) / (1280 * 704));
  return { low: Math.round(mid * 0.7), high: Math.round(mid * 1.5) };
}
/** "about 19 min": the middle of the range (an estimate or this computer's learned range). */
export const minutesText = (r: { low: number; high: number }) => `about ${Math.max(1, Math.round((r.low + r.high) / 2 / 60))} min`;

/** Files this route needs (the sheet's "Files needed" list; sizes from the Hugging Face API, 2026-10-24). Kept here so the web can name them. */
export const MAKE_REAL_FILES = [
  { file: 'ltx-2.5-22b-distilled-Q4_K_M.gguf', folder: 'diffusion_models', bytes: 13584703872, role: 'LTX-2.5 22B distilled (GGUF Q4_K_M)' },
  { file: 'gemma4-12b-with-proj-ltx-2.5-bf16.safetensors', folder: 'text_encoders', bytes: 26263858182, role: 'Gemma 4 12B text encoder (bf16)' },
  { file: 'ltx-2.5-video-vae-conv-bf16.safetensors', folder: 'vae', bytes: 1452269922, role: 'Video VAE' },
  { file: 'ltx-2.5-audio-vae-bf16.safetensors', folder: 'vae', bytes: 364866540, role: 'Audio VAE' },
  { file: 'ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors', folder: 'latent_upscale_models', bytes: 995778752, role: 'x2 latent upscaler' },
  { file: 'ltx-2.5-22b-ic-lora-layout-to-render-1.0.safetensors', folder: 'loras', bytes: 1308787439, role: 'Layout to Render IC-LoRA' },
] as const;
