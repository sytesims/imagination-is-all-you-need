/**
 * Camera & Lens (image feature): a rig picked from our lists becomes one camera sentence added to the prompt, on any Create Image model.
 * Prompt-driven look, not a physical simulation (we say so in the UI). Isomorphic: the web shows the exact sentence before you generate.
 *
 * Vocabulary: our own. Names of real cameras, lenses and film stocks are facts; every description and prompt phrase is our own wording
 * (no preset list copied from any other project). The film / phone / instant entries carry the prompt part of the former OpenSoul looks
 * (Film 35mm, Disposable, Polaroid, Digital Camera, Old Smartphone, Retro B&W), without their LoRAs, so they work on every model.
 * Optional extra: the community custom node film_prompt_styler by Mexes1978 (no licence stated) can be installed from the author's repo and
 * used in ComfyUI; we only link it (FILM_STYLER_NODE), never ship its code or presets.
 */
export interface RigOption { id: string; label: string; group: string; phrase: string; hint: string }
const o = (group: string) => (id: string, label: string, phrase: string, hint: string): RigOption => ({ id, label, group, phrase, hint });

// ---------------- camera bodies ----------------
const cine = o('Digital cinema'), still = o('Stills'), filmCam = o('Film cameras'), snap = o('Snapshot');
export const CAMERA_BODIES: RigOption[] = [
  cine('digital-s35', 'Digital cinema S35', 'shot on a Super 35 digital cinema camera, clean detail, wide dynamic range', 'Clean, modern film look'),
  cine('full-frame-cine', 'Full-frame cine digital', 'shot on a full-frame digital cinema camera, rich colour, gentle highlight roll-off', 'Bigger sensor, softer depth'),
  cine('large-format-digital', 'Large-format digital', 'shot on a large-format digital camera, very fine detail, smooth focus falloff', 'Most detail, most falloff'),
  cine('arri-alexa-35', 'ARRI ALEXA 35', 'shot on an ARRI ALEXA 35, natural skin tones, soft highlight roll-off, filmic latitude', 'Soft, natural digital cinema'),
  cine('arri-alexa-mini-lf', 'ARRI ALEXA Mini LF', 'shot on an ARRI ALEXA Mini LF large-format sensor, shallow depth, creamy tonality', 'Large-format cinema'),
  cine('red-v-raptor', 'RED V-RAPTOR', 'shot on a RED V-RAPTOR 8K, crisp detail, punchy contrast', 'Sharp, high-resolution'),
  cine('sony-venice-2', 'Sony VENICE 2', 'shot on a Sony VENICE 2, clean low-light image, smooth colour', 'Clean night scenes'),
  cine('blackmagic-ursa-12k', 'Blackmagic URSA Mini Pro 12K', 'shot on a Blackmagic URSA Mini Pro 12K, dense detail, neutral colour', 'Detailed, neutral'),
  filmCam('film-65mm', '65 mm film camera', 'shot on 65 mm large-format motion picture film, fine grain, deep tonality', 'Epic, fine-grain film'),
  filmCam('arriflex-435', 'Arriflex 435 (35 mm)', 'shot on 35 mm motion picture film with an Arriflex 435, organic grain, gentle halation', 'Classic 35 mm cinema'),
  filmCam('arriflex-416', 'Arriflex 416 (16 mm)', 'shot on 16 mm film with an Arriflex 416, visible grain, soft highlights', 'Grainy, documentary feel'),
  filmCam('leica-m6', 'Leica M6', 'photographed on a Leica M6 rangefinder, 35 mm film, candid street feel', 'Street rangefinder'),
  filmCam('nikon-f3', 'Nikon F3', 'photographed on a Nikon F3 35 mm film SLR, crisp and honest', '35 mm SLR classic'),
  filmCam('canon-ae1', 'Canon AE-1', 'photographed on a Canon AE-1 35 mm film SLR, warm everyday snapshot', 'Everyday 70s SLR'),
  filmCam('hasselblad-500cm', 'Hasselblad 500C/M', 'photographed on a Hasselblad 500C/M, 6×6 medium-format film, square frame, rich tonality', 'Square medium format'),
  filmCam('pentax-67', 'Pentax 67', 'photographed on a Pentax 67, 6×7 medium-format film, shallow depth, big tonal range', 'Medium format portraits'),
  filmCam('mamiya-rz67', 'Mamiya RZ67', 'photographed on a Mamiya RZ67 studio medium-format camera, very fine detail', 'Studio medium format'),
  filmCam('contax-t2', 'Contax T2', 'snapshot from a Contax T2 premium compact, sharp centre, flash-friendly look', 'Premium point-and-shoot'),
  filmCam('olympus-mju-ii', 'Olympus mju-II', 'snapshot from an Olympus mju-II compact, punchy colour, direct flash', 'Party compact'),
  still('fujifilm-x100v', 'Fujifilm X100V', 'photographed on a Fujifilm X100V, film-like colour rendering, compact 35 mm view', 'Film-like digital'),
  still('full-frame-mirrorless', 'Full-frame mirrorless', 'photographed on a full-frame mirrorless camera, clean modern detail', 'Clean modern stills'),
  still('film-bw', 'Black & white film camera', 'black and white film photograph, high contrast, classic film grain', 'Monochrome, punchy'),
  snap('compact-digital', 'Compact digital (2000s)', 'point-and-shoot digital camera photo, small-sensor look, date-stamp era colours', 'Early-2000s snapshot'),
  snap('disposable', 'Disposable camera', 'disposable camera snapshot, on-camera flash, warm cast, light leaks', 'Flash, warm, imperfect'),
  snap('polaroid-sx70', 'Polaroid SX-70', 'Polaroid SX-70 instant photo, soft dreamy colour, white instant-print frame', 'Dreamy instant print'),
  snap('early-phone', 'Early phone camera', 'early phone camera photo, low resolution, muted colours, soft focus', 'Lo-fi phone photo'),
  snap('camcorder', 'DV camcorder still', 'still frame from a 2000s DV camcorder, interlaced softness, video colours', 'Home-video look'),
];

// ---------------- lenses ----------------
const cl = o('Cinema lenses'), ana = o('Anamorphic'), sl = o('Stills lenses'), sp = o('Special');
export const LENSES: RigOption[] = [
  cl('modern-prime', 'Modern prime', 'modern spherical prime lens, sharp and neutral', 'Sharp, neutral'),
  cl('cooke-s4', 'Cooke S4/i', 'Cooke S4/i prime, warm gentle rendering, smooth focus falloff', 'Warm, gentle'),
  cl('cooke-panchro', 'Cooke Panchro/i Classic', 'Cooke Panchro/i Classic, vintage softness, warm flares', 'Vintage warmth'),
  cl('zeiss-master-prime', 'Zeiss Master Prime', 'Zeiss Master Prime, very clean, high contrast, minimal breathing', 'Clean, contrasty'),
  cl('zeiss-ultra-prime', 'Zeiss Ultra Prime', 'Zeiss Ultra Prime, crisp neutral cinema rendering', 'Crisp, neutral'),
  cl('zeiss-super-speed', 'Zeiss Super Speed', 'Zeiss Super Speed, fast vintage glass, soft glowing highlights', 'Fast vintage glass'),
  cl('arri-signature', 'ARRI Signature Prime', 'ARRI Signature Prime, soft natural skin, round bokeh', 'Soft, flattering'),
  cl('leica-summilux-c', 'Leica Summilux-C', 'Leica Summilux-C, clean even sharpness, subtle warmth', 'Even and refined'),
  cl('panavision-primo', 'Panavision Primo', 'Panavision Primo, classic Hollywood sharpness and contrast', 'Classic Hollywood'),
  cl('panavision-ultra-speed', 'Panavision Ultra Speed', 'Panavision Ultra Speed, fast vintage lens, glowing low-light look', 'Vintage low light'),
  cl('canon-k35', 'Canon K35', 'Canon K35, 1970s cinema glass, warm low contrast, soft flares', '70s cinema glass'),
  cl('canon-cne', 'Canon CN-E prime', 'Canon CN-E cinema prime, clean warm rendering', 'Clean, warm'),
  ana('classic-anamorphic', 'Classic anamorphic', 'anamorphic lens, oval bokeh, horizontal flares', 'Oval bokeh, streak flares'),
  ana('panavision-c-series', 'Panavision C-Series anamorphic', 'Panavision C-Series anamorphic, oval bokeh, blue streak flares, vintage edges', 'Classic widescreen'),
  ana('cooke-anamorphic', 'Cooke Anamorphic/i', 'Cooke Anamorphic/i, warm anamorphic look, gentle streaks', 'Warm anamorphic'),
  ana('atlas-orion', 'Atlas Orion anamorphic', 'Atlas Orion anamorphic, bold blue streaks, oval bokeh', 'Bold flares'),
  ana('hawk-v-lite', 'Hawk V-Lite anamorphic', 'Hawk V-Lite anamorphic, clean squeeze, subtle edge falloff', 'Clean anamorphic'),
  ana('kowa-prominar', 'Kowa Cine Prominar', 'Kowa Cine Prominar anamorphic, vintage character, warm flares', 'Vintage anamorphic'),
  ana('lomo-roundfront', 'LOMO Roundfront anamorphic', 'LOMO Roundfront anamorphic, swirly edges, painterly bokeh', 'Painterly, imperfect'),
  sl('helios-44', 'Helios 44-2 58mm f/2', 'Helios 44-2 58 mm lens, swirling background bokeh', 'Swirly bokeh'),
  sl('leica-summicron-35', 'Leica Summicron-M 35mm f/2', 'Leica Summicron-M 35 mm, crisp and compact rendering', 'Street classic'),
  sl('leica-noctilux', 'Leica Noctilux-M 50mm f/0.95', 'Leica Noctilux-M 50 mm at a very wide aperture, dreamy razor-thin focus', 'Dreamy, razor-thin focus'),
  sl('leica-summilux-50', 'Leica Summilux-M 50mm f/1.4', 'Leica Summilux-M 50 mm, smooth bokeh, gentle glow wide open', 'Smooth and gentle'),
  sl('zeiss-planar-50', 'Zeiss Planar 50mm f/1.4', 'Zeiss Planar 50 mm, classic contrast, soft wide open', 'Classic standard'),
  sl('zeiss-otus-55', 'Zeiss Otus 55mm f/1.4', 'Zeiss Otus 55 mm, extremely sharp, clean bokeh', 'Extremely sharp'),
  sl('canon-85-12', 'Canon EF 85mm f/1.2L', 'Canon EF 85 mm f/1.2L, creamy portrait bokeh', 'Creamy portraits'),
  sl('canon-50-095', 'Canon 50mm f/0.95 "Dream Lens"', 'Canon 50 mm f/0.95, soft dreamy wide-open glow', 'Dreamy glow'),
  sl('nikon-105-14', 'Nikon AF-S 105mm f/1.4E', 'Nikon 105 mm f/1.4, smooth compression, soft background', 'Smooth telephoto portrait'),
  sl('sigma-35-art', 'Sigma 35mm f/1.4 DG Art', 'Sigma 35 mm Art lens, sharp modern rendering', 'Sharp modern'),
  sl('sony-24-70-gm', 'Sony FE 24-70mm f/2.8 GM', 'Sony 24-70 mm GM zoom, clean modern detail', 'Clean zoom'),
  sl('voigtlander-40', 'Voigtländer Nokton 40mm f/1.2', 'Voigtländer Nokton 40 mm, soft glow wide open, character bokeh', 'Character bokeh'),
  sl('hasselblad-planar-80', 'Zeiss Planar 80mm f/2.8 (Hasselblad)', 'Zeiss Planar 80 mm medium-format lens, smooth tonal transitions', 'Medium-format standard'),
  sl('mamiya-110', 'Mamiya Sekor 110mm f/2.8', 'Mamiya 110 mm medium-format portrait lens, gentle falloff', 'Medium-format portrait'),
  sp('petzval-85', 'Petzval 85mm (Lomography)', 'Petzval-style 85 mm lens, swirling bokeh, sharp centre, vignette', 'Swirl and vignette'),
  sp('trioplan-100', 'Meyer-Optik Trioplan 100mm', 'Trioplan 100 mm, soap-bubble bokeh highlights', 'Soap-bubble bokeh'),
  sp('canon-ts-e-24', 'Canon TS-E 24mm (tilt-shift)', 'tilt-shift lens, miniature-like selective focus', 'Miniature effect'),
  sp('laowa-probe', 'Laowa 24mm probe lens', 'probe macro lens, bug\'s-eye close-up perspective', 'Bug\'s-eye macro'),
  sp('macro-100', 'Canon EF 100mm f/2.8 Macro', 'macro lens, extreme close-up detail', 'Tiny details up close'),
  sp('fisheye', 'Canon EF 8-15mm fisheye', 'fisheye lens, strong barrel distortion, circular feel', 'Fisheye'),
  sp('clinical-sharp', 'Clinical sharp', 'clinically sharp lens, high micro-contrast', 'Crisp edges everywhere'),
  sp('halation', 'Halation diffusion filter', 'diffusion filter, soft halation around highlights', 'Glowing highlights'),
  sp('vintage-prime', 'Vintage prime', 'vintage prime lens, lower contrast, gentle glow', 'Soft contrast, glow'),
];

// ---------------- film stocks ----------------
const neg = o('Colour negative'), cine2 = o('Motion picture'), rev = o('Slide'), bw = o('Black & white'), inst = o('Instant');
export const FILM_STOCKS: RigOption[] = [
  neg('portra-160', 'Kodak Portra 160', 'Kodak Portra 160 colour negative, soft pastel skin tones, fine grain', 'Soft pastel skin'),
  neg('portra-400', 'Kodak Portra 400', 'Kodak Portra 400 colour negative, warm natural skin, gentle grain', 'Warm natural skin'),
  neg('portra-800', 'Kodak Portra 800', 'Kodak Portra 800 colour negative, warm, visible grain, low-light friendly', 'Warm low light'),
  neg('ektar-100', 'Kodak Ektar 100', 'Kodak Ektar 100, saturated colour, very fine grain', 'Saturated, fine grain'),
  neg('gold-200', 'Kodak Gold 200', 'Kodak Gold 200, golden warm consumer colour', 'Golden warm'),
  neg('ultramax-400', 'Kodak UltraMax 400', 'Kodak UltraMax 400, punchy everyday colour, visible grain', 'Punchy everyday'),
  neg('colorplus-200', 'Kodak ColorPlus 200', 'Kodak ColorPlus 200, warm budget-film colour', 'Warm budget film'),
  neg('fuji-pro-400h', 'Fujifilm Pro 400H', 'Fujifilm Pro 400H, airy pastel greens and blues', 'Airy pastels'),
  neg('fuji-superia-400', 'Fujifilm Superia X-TRA 400', 'Fujifilm Superia 400, cool greens, snappy contrast', 'Cool greens'),
  neg('fuji-c200', 'Fujicolor C200', 'Fujicolor C200, slightly cool, everyday colour', 'Cool everyday'),
  neg('lomo-800', 'Lomography Color Negative 800', 'Lomography 800 colour negative, saturated, grainy night colour', 'Grainy, saturated'),
  neg('agfa-vista-200', 'Agfa Vista 200', 'Agfa Vista 200, bright reds, nostalgic colour', 'Nostalgic reds'),
  neg('cinestill-800t', 'CineStill 800T', 'CineStill 800T tungsten film, red halation around lights, cool night tones', 'Neon halation'),
  neg('cinestill-50d', 'CineStill 50D', 'CineStill 50D daylight film, clean fine grain, natural colour', 'Clean daylight'),
  cine2('vision3-50d', 'Kodak Vision3 50D 5203', 'Kodak Vision3 50D motion picture film, fine grain daylight colour', 'Fine-grain daylight'),
  cine2('vision3-250d', 'Kodak Vision3 250D 5207', 'Kodak Vision3 250D motion picture film, natural daylight colour, soft grain', 'Natural daylight'),
  cine2('vision3-200t', 'Kodak Vision3 200T 5213', 'Kodak Vision3 200T tungsten motion picture film, clean interior colour', 'Clean interiors'),
  cine2('vision3-500t', 'Kodak Vision3 500T 5219', 'Kodak Vision3 500T tungsten motion picture film, rich shadows, cinematic grain', 'Cinematic night'),
  cine2('eterna-500t', 'Fujifilm Eterna 500T', 'Fujifilm Eterna 500T motion picture film, muted desaturated colour', 'Muted cinema'),
  cine2('double-x-5222', 'Kodak Double-X 5222', 'Kodak Double-X 5222 black and white motion picture film, deep blacks, classic grain', 'Classic B&W cinema'),
  rev('ektachrome-e100', 'Kodak Ektachrome E100', 'Kodak Ektachrome E100 slide film, clean cool colour, crisp contrast', 'Clean slide colour'),
  rev('kodachrome-64', 'Kodak Kodachrome 64', 'Kodachrome 64 look, rich reds and deep blues, vintage slide colour', 'Vintage slide'),
  rev('velvia-50', 'Fujifilm Velvia 50', 'Fujifilm Velvia 50 slide film, very saturated landscape colour', 'Very saturated'),
  rev('provia-100f', 'Fujifilm Provia 100F', 'Fujifilm Provia 100F slide film, accurate colour, fine grain', 'Accurate slide'),
  rev('astia-100f', 'Fujifilm Astia 100F', 'Fujifilm Astia 100F slide film, soft contrast, gentle skin', 'Soft slide'),
  bw('tri-x-400', 'Kodak Tri-X 400', 'Kodak Tri-X 400 black and white film, gritty contrast, classic grain', 'Gritty classic'),
  bw('tmax-100', 'Kodak T-Max 100', 'Kodak T-Max 100 black and white film, very fine grain, smooth tones', 'Smooth fine grain'),
  bw('tmax-3200', 'Kodak T-Max P3200', 'Kodak T-Max P3200 black and white film, heavy grain, low light', 'Heavy grain'),
  bw('hp5-plus', 'Ilford HP5 Plus', 'Ilford HP5 Plus black and white film, flexible mid-contrast grain', 'Documentary B&W'),
  bw('fp4-plus', 'Ilford FP4 Plus', 'Ilford FP4 Plus black and white film, fine grain, rich mid-tones', 'Rich mid-tones'),
  bw('delta-3200', 'Ilford Delta 3200', 'Ilford Delta 3200 black and white film, coarse grain, moody night', 'Moody, coarse'),
  bw('pan-f-50', 'Ilford Pan F Plus 50', 'Ilford Pan F Plus 50 black and white film, ultra-fine grain, high contrast', 'Ultra-fine grain'),
  bw('acros-100', 'Fujifilm Neopan Acros 100 II', 'Fujifilm Acros 100 black and white film, smooth tones, deep blacks', 'Smooth and deep'),
  inst('polaroid-600', 'Polaroid 600 colour', 'Polaroid 600 instant film, soft faded colour, slight colour cast', 'Faded instant'),
  inst('instax-mini', 'Fujifilm Instax Mini', 'Fujifilm Instax Mini instant photo, bright soft colour, small print feel', 'Bright instant'),
];

// ---------------- lighting and era ----------------
const li = o('Lighting');
export const LIGHTING: RigOption[] = [
  li('daylight', 'Natural daylight', 'natural daylight', 'Even and natural'), li('golden-hour', 'Golden hour', 'low golden-hour sun, warm long shadows', 'Warm, low sun'),
  li('blue-hour', 'Blue hour', 'blue-hour twilight, cool ambient light', 'Cool twilight'), li('overcast', 'Overcast', 'soft overcast light, no hard shadows', 'Soft, shadowless'),
  li('hard-noon', 'Hard noon sun', 'hard midday sun, crisp shadows', 'Crisp shadows'), li('window', 'Window light', 'soft side light from a window', 'Soft side light'),
  li('rembrandt', 'Rembrandt', 'Rembrandt lighting, a small triangle of light on the shadow cheek', 'Classic portrait'), li('butterfly', 'Butterfly', 'butterfly lighting from above the camera, soft shadow under the nose', 'Glamour portrait'),
  li('split', 'Split', 'split lighting, half the face in shadow', 'Dramatic half-light'), li('rim', 'Rim light / backlight', 'strong backlight, glowing rim light', 'Glowing edges'),
  li('silhouette', 'Silhouette', 'subject in silhouette against a bright background', 'Shapes only'), li('neon', 'Neon practicals', 'lit by colourful neon practical lights', 'Neon signs in the scene light it'),
  li('candle', 'Candlelight', 'warm flickering candlelight', 'Warm and intimate'), li('tungsten', 'Tungsten interior', 'warm tungsten interior light', 'Warm interiors'),
  li('fluorescent', 'Fluorescent', 'flat greenish fluorescent overhead light', 'Office-cold'), li('flash', 'On-camera flash', 'direct on-camera flash, hard falloff', 'Party flash'),
  li('softbox', 'Studio softbox', 'large studio softbox key light, gentle fill', 'Clean studio'), li('moonlight', 'Moonlight', 'cool moonlight, deep night shadows', 'Night exterior'),
];
const er = o('Era');
export const ERAS: RigOption[] = [
  /* hints say what each era tends to look like (tooltips only; the model gets the phrase) */
  er('1920s', '1920s', '1920s photograph', 'Sepia tones, soft early lenses'), er('1950s', '1950s', '1950s photograph', 'Mid-century colour or crisp black and white'), er('1960s', '1960s', '1960s photograph', 'Rich slide-film colour'),
  er('1970s', '1970s', '1970s photograph', 'Warm, faded, grainy film'), er('1980s', '1980s', '1980s photograph', 'Punchy colour and flash'), er('1990s', '1990s', '1990s photograph', 'Everyday print film'),
  er('2000s', '2000s', '2000s photograph', 'Early digital, cool and crisp'), er('2010s', '2010s', '2010s photograph', 'Filtered, warm-and-teal'), er('today', 'Today', 'contemporary photograph', 'Clean, current photography'),
];
export const FOCAL_LENGTHS = [8, 14, 24, 35, 50, 85, 135, 200] as const;
const FOCAL_WORD: Record<number, string> = { 8: 'fisheye ultra-wide view', 14: 'ultra-wide view', 24: 'wide view', 35: 'natural wide-normal view', 50: 'natural perspective', 85: 'flattering portrait compression', 135: 'telephoto compression, background pulled close', 200: 'long telephoto, strongly compressed background' };
export const APERTURES = ['0.95', '1.4', '2', '2.8', '4', '5.6', '8', '11', '16'] as const;
const APERTURE_WORD: Record<string, string> = { '0.95': 'razor-thin depth of field', '1.4': 'very shallow depth of field', '2': 'shallow depth of field', '2.8': 'shallow depth of field', '4': 'moderate depth of field', '5.6': 'moderate depth of field', '8': 'deep depth of field', '11': 'deep focus, everything sharp', '16': 'deep focus, everything sharp' };

export const RIG_DEFAULT = { body: 'digital-s35', lens: 'modern-prime', focal: 35, aperture: '4', film: '', lighting: '', era: '' } as const;
export interface Rig { body: string; lens: string; focal: number; aperture: string; /** '' = none */ film?: string; lighting?: string; era?: string }
export const RIG_FIELDS = ['cameraBody', 'lens', 'focal', 'aperture', 'film', 'lighting', 'era'] as const;
/** The rig's option lists, for UIs and the API (GET /api/image-features → camera). */
export const RIG_OPTIONS = { cameraBody: CAMERA_BODIES, lens: LENSES, film: FILM_STOCKS, lighting: LIGHTING, era: ERAS, focal: FOCAL_LENGTHS, aperture: APERTURES };

/** Validate rig fields; null when none were sent. Blank ones take the default rig's value (film, lighting and era default to none). */
export function parseRig(f: Record<string, unknown>): { rig: Rig } | { error: string; field: string } | null {
  const sent = RIG_FIELDS.filter((k) => f[k] != null && String(f[k]).trim() !== ''); if (!sent.length) return null;
  const v = (k: string) => String(f[k] ?? '').trim();
  const body = v('cameraBody') || RIG_DEFAULT.body, ln = v('lens') || RIG_DEFAULT.lens, focal = Number(v('focal') || RIG_DEFAULT.focal), aperture = (v('aperture') || RIG_DEFAULT.aperture).replace(/^f\//i, '');
  const film = v('film'), lighting = v('lighting'), era = v('era');
  const one = (list: RigOption[], id: string, field: string, what: string) => (!list.some((x) => x.id === id) ? { error: `${what} must be one of ${list.map((x) => x.id).join(', ')}.`, field } : null);
  const bad = one(CAMERA_BODIES, body, 'cameraBody', 'Camera body') ?? one(LENSES, ln, 'lens', 'Lens') ?? (film ? one(FILM_STOCKS, film, 'film', 'Film stock') : null)
    ?? (lighting ? one(LIGHTING, lighting, 'lighting', 'Lighting') : null) ?? (era ? one(ERAS, era, 'era', 'Era') : null);
  if (bad) return bad;
  if (!(FOCAL_LENGTHS as readonly number[]).includes(focal)) return { error: `Focal length must be one of ${FOCAL_LENGTHS.join(', ')} mm.`, field: 'focal' };
  if (!(APERTURES as readonly string[]).includes(aperture)) return { error: `Aperture must be one of ${APERTURES.map((a) => `f/${a}`).join(', ')}.`, field: 'aperture' };
  return { rig: { body, lens: ln, focal, aperture, ...(film ? { film } : {}), ...(lighting ? { lighting } : {}), ...(era ? { era } : {}) } };
}
const find = (list: RigOption[], id?: string) => (id ? list.find((x) => x.id === id) : undefined);
/** The camera sentence added to the prompt. */
export function rigSentence(r: Rig): string {
  const b = find(CAMERA_BODIES, r.body)!, l = find(LENSES, r.lens)!;
  return [b.phrase, l.phrase, `${r.focal} mm focal length, ${FOCAL_WORD[r.focal]}`, `f/${r.aperture}, ${APERTURE_WORD[r.aperture]}`,
    find(FILM_STOCKS, r.film)?.phrase, find(LIGHTING, r.lighting)?.phrase, find(ERAS, r.era)?.phrase].filter(Boolean).join(', ');
}
/** Short label: "ARRI ALEXA 35 · Cooke S4/i · 35 mm · f/4 · Kodak Vision3 500T 5219". */
export const rigLabel = (r: Rig) => [find(CAMERA_BODIES, r.body)?.label, find(LENSES, r.lens)?.label, `${r.focal} mm`, `f/${r.aperture}`, find(FILM_STOCKS, r.film)?.label, find(LIGHTING, r.lighting)?.label, find(ERAS, r.era)?.label].filter(Boolean).join(' · ');
export const withRig = (prompt: string, r: Rig) => [prompt.trim().replace(/[.;,]+$/, ''), rigSentence(r)].filter(Boolean).join('. ');

/** Optional community custom node for the same job inside ComfyUI. Linked only: no code or preset list is shipped; the user installs it from the author's repo. */
export const FILM_STYLER_NODE = { name: 'film_prompt_styler', author: 'Mexes1978', nodeClass: 'FilmPromptStyler', repo: 'https://github.com/Mexes1978/film_prompt_styler',
  licence: 'no licence stated (all rights reserved by default)', credit: 'Community · film_prompt_styler by Mexes1978 (no licence stated, installed from the author\'s repo)',
  note: 'Optional and not part of this app. Get it from the author\'s page if you want the same looks inside ComfyUI.' };
