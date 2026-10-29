/**
 * OpenSoul presets: 22 looks (our own names and prompts).
 * Each look = existing community LoRA(s) + strength on the base they were trained for, or a prompt-only fallback (`fallback: true`)
 * when no suitable LoRA exists. No training anywhere. Licence facts live here as data but are only surfaced on /api/licenses + LICENSES.md.
 * Sizes / SHA-256 / triggers read from the Civitai and Hugging Face APIs on 2026-10-16.
 */
export type SoulBase = 'zit' | 'flux1dev' | 'qwen';
export interface SoulLora {
  id: string; name: string; file: string; base: SoulBase; sizeMB: number; sha256: string; trigger: string | null;
  source: string; download: string; license: string;
  /** Civitai allowCommercialUse (or 'apache-2.0' for HF). Shown only on the licence page. */ commercial: string[];
  /** fal-ai/z-image/turbo/lora accepts a URL or HF repo as `path` (docs: max 3 LoRAs, scale 0–4). Only ZIT LoRAs qualify. */ hosted: boolean;
}
const civ = (model: number, version: number) => ({ source: `https://civitai.com/models/${model}?modelVersionId=${version}`, download: `https://civitai.com/api/download/models/${version}` });
const CIV_FULL = ['Image', 'RentCivit', 'Rent', 'Sell', 'SellMerge'];
export const SOUL_LORAS: Record<string, SoulLora> = {
  'zit-realism': { id: 'zit-realism', name: 'Z-Image-Turbo Realism LoRA', file: 'Z-Image-Turbo-Realism-LoRA.safetensors', base: 'zit', sizeMB: 0, sha256: '', trigger: null,
    source: 'https://huggingface.co/suayptalha/Z-Image-Turbo-Realism-LoRA', download: 'https://huggingface.co/suayptalha/Z-Image-Turbo-Realism-LoRA/resolve/main/pytorch_lora_weights.safetensors', license: 'Apache-2.0', commercial: ['apache-2.0'], hosted: true },
  'flux-realskin': { id: 'flux-realskin', name: 'FluxRealSkin v2', file: 'fluxRealSkin-V2.safetensors', base: 'flux1dev', sizeMB: 164, sha256: 'C9FAB54482CD', trigger: 'realskin', ...civ(651043, 827325), license: 'Civitai model licence', commercial: ['RentCivit'], hosted: false },
  'zit-cinematic-photo': { id: 'zit-cinematic-photo', name: 'Cinematic Photography (ZIT)', file: 'Modeling 101 v1.5.safetensors', base: 'zit', sizeMB: 162.2, sha256: 'B76838D5D854', trigger: 'cinematic dslr photography style', ...civ(214956, 2555690), license: 'Civitai model licence', commercial: ['RentCivit'], hosted: true },
  'zit-noir': { id: 'zit-noir', name: '50s Noir Movie (ZIT)', file: '50sNoirZ.safetensors', base: 'zit', sizeMB: 81.2, sha256: 'D8A889903719E162', trigger: '50s Noir Movie Still,', ...civ(804984, 2596514), license: 'Civitai model licence', commercial: ['RentCivit', 'Image'], hosted: true },
  'zit-velatrix': { id: 'zit-velatrix', name: 'Cinematic Portrait Lighting (ZIT)', file: 'Velatrix.safetensors', base: 'zit', sizeMB: 162.2, sha256: 'A287900C32A70310', trigger: 'velatrix', ...civ(2595570, 2975453), license: 'Civitai model licence', commercial: ['RentCivit', 'Rent', 'Image'], hosted: true },
  'zit-studio': { id: 'zit-studio', name: 'Realistic Skin & Face Professional (ZIT)', file: 'Professional_studio_quality_-_ZIT_epoch_13.safetensors', base: 'zit', sizeMB: 324.4, sha256: '01334FC34375BE96', trigger: null, ...civ(1426727, 3107206), license: 'Civitai model licence', commercial: ['RentCivit'], hosted: true },
  'zit-35mm': { id: 'zit-35mm', name: '35mm Photo (ZIT)', file: 'Z-TURBO_Photography_35mmPhoto_1536.safetensors', base: 'zit', sizeMB: 162.2, sha256: '677E30C53F297904', trigger: null, ...civ(660731, 2466153), license: 'Civitai model licence', commercial: ['RentCivit', 'Image'], hosted: true },
  'zit-film-color': { id: 'zit-film-color', name: 'Cinematic Film Color (ZIT)', file: 'Cinematic Film Color style v1.2.safetensors', base: 'zit', sizeMB: 162.2, sha256: '65F72557E6BEA78B', trigger: 'Cinematic', ...civ(541698, 2537802), license: 'Civitai model licence', commercial: ['RentCivit'], hosted: true },
  'zit-instax': { id: 'zit-instax', name: 'Candid Instax Photo (ZIT)', file: 'CandidInstaxphotoZ.safetensors', base: 'zit', sizeMB: 81.2, sha256: '67900D65E6056DFB', trigger: 'Candid Instax Photo,', ...civ(1683324, 2597365), license: 'Civitai model licence', commercial: ['Image', 'RentCivit'], hosted: true },
  'zit-selfie': { id: 'zit-selfie', name: 'Ultra Real Amateur Selfies (ZIT)', file: 'amateur_selfie.safetensors', base: 'zit', sizeMB: 60.9, sha256: 'AD90710C8A985972', trigger: 'amateur_selfie', ...civ(2233658, 2514521), license: 'Civitai model licence', commercial: ['RentCivit', 'Image'], hosted: true },
  'zit-instapic': { id: 'zit-instapic', name: 'InstaPic (ZIT)', file: 'Z_Instapic_V1.safetensors', base: 'zit', sizeMB: 324.4, sha256: 'ae61dfa15e4a5f1f9e683f84f03ba25d79a73e456ad8161551d3b3d6b3865e5c', trigger: 'instapic', ...civ(2168120, 2909558), license: 'Civitai model licence', commercial: ['Image', 'RentCivit'], hosted: true },
  'flux-direct-flash': { id: 'flux-direct-flash', name: 'Direct Flash (FLUX.1-dev)', file: 'd1rectflash.safetensors', base: 'flux1dev', sizeMB: 604.7, sha256: '466478E5DC40', trigger: 'D1rectFlash', ...civ(1661207, 1880243), license: 'Civitai model licence (base FLUX.1-dev non-commercial)', commercial: CIV_FULL, hosted: false },
  'flux-fashion': { id: 'flux-fashion', name: 'Flux Fashion Editorial (FLUX.1-dev)', file: 'flux-fash.safetensors', base: 'flux1dev', sizeMB: 73.1, sha256: '0E45E80ABC6C', trigger: 'flux-fash', ...civ(2138223, 2418642), license: 'Civitai model licence (base FLUX.1-dev non-commercial)', commercial: ['Image', 'RentCivit', 'Rent'], hosted: false },
  'qwen-coolshot': { id: 'qwen-coolshot', name: 'CoolShot 2000s (Qwen-Image)', file: 'CoolShot_2000s_qwen.safetensors', base: 'qwen', sizeMB: 45.1, sha256: '0546831DF4E5', trigger: 'd1g1c2m', ...civ(2163880, 2436841), license: 'Civitai model licence', commercial: CIV_FULL, hosted: false },
  'qwen-ccd': { id: 'qwen-ccd', name: 'Siemens CX70 CCD Dreams (Qwen-Image)', file: 'CCD_Dreams_qwen2507.safetensors', base: 'qwen', sizeMB: 202.8, sha256: 'B5C483F8D03F', trigger: '22mm lens f/2.2, CCD sensor aesthetic, 0.5 megapixel resolution', ...civ(2744351, 3086732), license: 'Civitai model licence', commercial: CIV_FULL, hosted: false },
};
/** Base realism stack per base (the "realism LoRA at 0.5" rule). Qwen-Image has none: it is photoreal out of the box. */
export const REALISM: Record<SoulBase, { lora: string; strength: number } | null> = { zit: { lora: 'zit-realism', strength: 0.5 }, flux1dev: { lora: 'flux-realskin', strength: 0.5 }, qwen: null };

export interface SoulPreset { id: string; label: string; prompt: string; base: SoulBase; loras: { lora: string; strength: number }[]; /** No suitable community LoRA exists: prompt-only style. */ fallback: boolean; posterUrl: string }
const p = (id: string, label: string, base: SoulBase, loras: [string, number][], prompt: string): SoulPreset =>
  ({ id, label, base, prompt, loras: loras.map(([lora, strength]) => ({ lora, strength })), fallback: loras.length === 0, posterUrl: `/samples/presets/soul-${id}.jpg` });
export const SOUL_PRESETS: SoulPreset[] = [
  p('warm-ambient', 'Warm Ambient', 'zit', [['zit-cinematic-photo', 0.4]], 'warm ambient indoor light, soft tungsten glow, gentle shadows, natural skin'),
  p('retro-bw', 'Retro B&W', 'zit', [['zit-noir', 0.7]], 'black and white photograph, high contrast, classic film grain'),
  p('y2k-street', 'Y2K Street', 'qwen', [['qwen-coolshot', 0.8]], 'early-2000s street snapshot, compact digital camera, slight overexposure, candid'),
  p('subtle-flash', 'Subtle Flash', 'flux1dev', [['flux-direct-flash', 0.4]], 'soft on-camera flash, gentle falloff, evening setting'),
  p('flash-editorial', 'Flash Editorial', 'flux1dev', [['flux-direct-flash', 0.8], ['flux-fashion', 0.6]], 'hard direct flash fashion editorial, crisp shadows, styled outfit'),
  p('digital-camera', 'Digital Camera', 'qwen', [['qwen-coolshot', 0.9]], 'point-and-shoot digital camera photo, date-stamp era colours, small-sensor look'),
  p('old-smartphone', 'Old Smartphone', 'qwen', [['qwen-ccd', 0.8]], 'early phone camera photo, low resolution, muted colours, soft focus'),
  p('frutiger-aero', 'Frutiger Aero', 'zit', [], 'glossy optimistic mid-2000s aesthetic, bright sky blues and greens, bubbles, clean reflective surfaces, lens flare'),
  p('candy-pop', 'Candy Pop', 'zit', [], 'saturated candy colours, pastel pink and mint backdrop, playful pop styling, bright even light'),
  p('theatrical-light', 'Theatrical Light', 'zit', [['zit-velatrix', 0.7]], 'dramatic spotlight portrait, deep shadows, sculpted light'),
  p('studio-clean', 'Studio Clean', 'zit', [['zit-studio', 0.6]], 'clean studio portrait, seamless backdrop, softbox lighting, sharp detail'),
  p('film-35mm', 'Film 35mm Colour', 'zit', [['zit-35mm', 0.7]], '35mm colour film photo, natural grain, slightly lifted blacks'),
  p('teal-orange', 'Cinematic Teal-Orange', 'zit', [['zit-film-color', 0.7]], 'cinematic teal and orange colour grade, widescreen film still'),
  p('night-neon', 'Night Neon', 'flux1dev', [['flux-direct-flash', 0.3]], 'night city, neon signs, wet street reflections, flash fill'),
  p('disposable', 'Disposable Camera', 'qwen', [['qwen-coolshot', 0.6]], 'disposable camera snapshot, flash, warm cast, light leaks'),
  p('polaroid', 'Polaroid', 'zit', [['zit-instax', 0.8]], 'instant film photo, soft colours, white frame feel'),
  p('phone-selfie', 'Phone Selfie / UGC', 'zit', [['zit-instapic', 0.8]], 'casual phone photo for social media, natural light, authentic'),
  p('mirror-selfie', 'Mirror Selfie', 'zit', [['zit-selfie', 0.8]], 'mirror selfie holding a phone, bedroom or bathroom, everyday look'),
  p('overcast-street', 'Overcast Street Style', 'zit', [], 'street style photo on an overcast day, soft diffuse light, muted city tones'),
  p('golden-hour', 'Golden Hour Backlit', 'zit', [['zit-cinematic-photo', 0.3]], 'golden hour backlight, warm rim light, sun flare, hazy glow'),
  p('magazine-cover', 'Magazine Cover', 'flux1dev', [['flux-fashion', 0.8]], 'high-fashion magazine cover shot, polished retouching, confident pose'),
  p('grainy-lofi', 'Grainy Lo-fi', 'qwen', [['qwen-ccd', 0.5]], 'grainy lo-fi photo, low light noise, washed colours'),
];
/** Overcast Street Style keeps the realism LoRA only (no matching style LoRA) → counted as prompt-only fallback. */
export const presetById = (id: string) => SOUL_PRESETS.find((x) => x.id === id);
