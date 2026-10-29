/** Video › Look › Style (2026-10-27): 12 looks that each give a clearly different result, with our own names and one-line descriptions.
 *  Separate from Create Image's STYLE_PRESETS (mediaPresets.ts), which keeps its own list. Sent as job field `videoPreset` = `style-<id>`;
 *  the server appends `prompt` to the user's prompt ("<prompt>. <look prompt>", h3/index.ts).
 *  Covers: one fixed subject and seed per look, made locally with FLUX.2 [klein] 4B (free) with this exact phrase appended → web/public/examples/covers/video-looks/<id>.webp.
 *  They are stills of the look, not clips, so the tile says so (`posterNote`). */
export const VIDEO_LOOK_COVER_MODEL = 'FLUX.2 [klein] 4B';
export const VIDEO_LOOKS: { id: string; label: string; description: string; prompt: string }[] = [
  { id: 'golden-hour', label: 'Golden hour', description: 'Low warm sun, long shadows and a soft glow.', prompt: 'golden hour, low warm sun, long shadows, rim light, soft haze' },
  { id: 'noir', label: 'Noir', description: 'Black and white, one hard light, deep shadows.', prompt: 'black and white film noir, single hard light, venetian-blind shadows, deep blacks' },
  { id: 'neon-night', label: 'Neon night', description: 'Night city glow in cyan and magenta on wet ground.', prompt: 'night city, neon reflections, wet pavement, cyan and magenta' },
  { id: 'cinematic-teal', label: 'Teal & orange', description: 'Blockbuster grade: teal shadows, warm skin, lens flare.', prompt: 'cinematic teal and orange grade, anamorphic flare' },
  { id: 'film-35', label: 'Film photo', description: 'Grainy 35mm film with faded, nostalgic colour.', prompt: 'shot on 35mm film, natural grain, gentle halation, slightly faded colours' },
  { id: 'documentary', label: 'Documentary', description: 'Natural light and a candid, real-life feel.', prompt: 'documentary photo, available light, candid' },
  { id: 'high-key', label: 'Bright studio', description: 'Clean, bright light on a plain backdrop, almost no shadow.', prompt: 'high-key bright studio light, clean white backdrop, minimal shadows, crisp editorial' },
  { id: 'stage-light', label: 'Spotlight', description: 'One theatrical spotlight; everything else falls to dark.', prompt: 'theatrical spotlight, dark surroundings, dramatic shadows' },
  { id: 'pastel', label: 'Soft pastel', description: 'Airy light, pale colours, gentle contrast.', prompt: 'pastel palette, airy light, low contrast' },
  { id: 'anime-cel', label: 'Anime', description: 'Hand-drawn anime with clean lines and flat colour.', prompt: 'cel-shaded anime illustration, clean line art' },
  { id: 'watercolor', label: 'Watercolour', description: 'Loose paint washes on textured paper.', prompt: 'loose watercolour painting, paper texture' },
  { id: 'clay-3d', label: 'Clay 3D', description: 'Soft, rounded clay models, like stop-motion.', prompt: 'soft clay 3D render, rounded forms, studio light' },
];
/** Removed look ids → the kept look that does the same job. Old jobs, Recreate links and MCP calls send these and still work. */
export const VIDEO_LOOK_ALIASES: Record<string, string> = {
  'warm-ambient': 'golden-hour',
  mono: 'noir', 'low-key': 'noir',
  editorial: 'high-key', product: 'high-key', 'flat-light': 'high-key', // Product shot and Flat light sheet are workflows (Product Shot, Character Sheet), not looks
  'vintage-polaroid': 'film-35', 'street-2000s': 'film-35',
};
/** `style-<old>` → `style-<kept>`; any other id unchanged. */
export const videoLookId = (id: string) => { const m = /^style-(.+)$/.exec(id); const to = m ? VIDEO_LOOK_ALIASES[m[1]] : undefined; return to ? `style-${to}` : id; };
export const videoLookCover = (id: string) => `/examples/covers/video-looks/${id}.webp`;
