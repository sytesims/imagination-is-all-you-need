/**
 * The Canvas demo's media (2026-10-31): what each card of a starter chip shows on the sample server, from the maintainer's own runs.
 * ONE table: DEMO_MEDIA[recipe][cardKey]. The chip plans (canvasDemo.ts) give each card a ref "recipe:key"; the demo agent tags the card
 * (tagDemoCard: board + prompt), the jobs route puts the ref on the job (mock backend only), and mockRun serves this file instead of a
 * random sample (tools/shared.ts renderDemoOutput). The card then says "Sample · made with <model>": the model that really made it.
 *
 * Honest by rule: every entry is the real output of that kind of step (a picture is a picture run, a clip a video run from the inputs the
 * plan wires into it), never a frame cut from a video. A step with no real run has no entry and the plan leaves its card out.
 * Files: web/public/examples/demo/<recipe>/ (WebP stills ≤ 1280 px with 480 px posters, ~540p H.264 + AAC clips, MP3; metadata stripped),
 * plus files that already ship (examples/starter, showcase).
 */
export type DemoKind = 'image' | 'video' | 'audio';
export interface DemoMedia {
  url: string; poster: string; w: number; h: number; sec?: number;
  /** the run that made it (credits) */ jobId?: string; model: string; place: string; costUsd: number;
  /** what the card says after "Sample · " instead of "made with <model>" (a sound taken from a clip) */ note?: string;
}
const D = (f: string) => `/examples/demo/${f}`;
const ST = (f: string) => `/examples/starter/${f}`;
const SC = (f: string) => `/showcase/${f}`;
const CLOUD = 'Comfy Cloud', LOCAL = 'Your computer';
const FLARE = 'GPT Image 2.5 Flare', LTX = 'LTX-2.5 22B', LTXPRO = 'LTX-2.5 Pro', H3 = 'MiniMax H3', YUE = 'YuE2', KLEIN = 'FLUX.2 [klein] 4B';
const still = (url: string, w: number, h: number, jobId: string, model: string, costUsd: number, place = CLOUD): DemoMedia => ({ url, poster: url.replace(/\.webp$/, '-480.webp'), w, h, jobId, model, place, costUsd });
const clip = (url: string, w: number, h: number, sec: number, jobId: string, model: string, costUsd: number): DemoMedia => ({ url, poster: url.replace(/\.mp4$/, '-480.webp'), w, h, sec, jobId, model, place: CLOUD, costUsd });
const sound = (url: string, sec: number, jobId: string, model: string, costUsd = 0, place = LOCAL): DemoMedia => ({ url, poster: '', w: 0, h: 0, sec, jobId, model, place, costUsd });

export const DEMO_MEDIA: Record<string, Record<string, DemoMedia>> = {
  /* Short film from idea, "The chalk whale". Wiring as the runs really went: k2 = the harbour + the whale sheet, k4 = k1 + the whale sheet,
     k5 = k0; clips c0 = k0 → k5 (first and last frame), c1 = k1, c2 = the harbour → k2, c3 = k3, c4 = k4. The spark and the final shot
     have no clip of their own. */
  short: {
    place: still(D('short/place.webp'), 1280, 720, '0fe3b4ca', FLARE, 0.0472), whale: still(ST('whale-sheet.webp'), 1536, 864, 'b8b83ca4', FLARE, 0.0472),
    k0: still(D('short/k0.webp'), 1280, 720, '9992d6f2', FLARE, 0.0471), k1: still(D('short/k1.webp'), 1280, 720, 'a444e573', FLARE, 0.0474),
    k2: still(D('short/k2.webp'), 1280, 720, '5c584d4b', FLARE, 0.0772), k3: still(D('short/k3.webp'), 1280, 720, '11e3cd0e', FLARE, 0.0472),
    k4: still(D('short/k4.webp'), 1280, 720, 'c1f5ac15', FLARE, 0.0773), k5: still(D('short/k5.webp'), 1280, 720, 'd00132cb', FLARE, 0.0618),
    c0: clip(D('short/c0.mp4'), 982, 540, 5.04, '700787c9', LTX, 0.14), c1: clip(D('short/c1.mp4'), 982, 540, 5.04, 'dd9fe744', LTX, 0.14),
    c2: clip(D('short/c2.mp4'), 982, 540, 5.04, 'fa517985', LTX, 0.14), c3: clip(D('short/c3.mp4'), 982, 540, 5.04, 'b8283de6', LTX, 0.14),
    c4: clip(ST('storm-whale.mp4'), 1280, 704, 5.04, '9a79ed7a', LTX, 0.14),
    voice: sound(D('short/voice.mp3'), 2.59, '3acedce2', 'Qwen3 TTS 1.7B'), music: sound(ST('music-box.mp3'), 30, 'd6d6bc65', YUE),
  },
  /* Make a 30s film, the lighthouse keeper: a real run of this recipe. Shots 3–5 were never animated, so they stay stills. */
  film: {
    f0: still(D('film/f0.webp'), 1024, 1024, '91eeee4c', 'Seedream 5.0 Pro', 0.045), f1: still(D('film/f1.webp'), 1024, 1024, '41b92a67', 'Seedream 5.0 Pro', 0.045),
    f2: still(D('film/f2.webp'), 1024, 1024, '0fe90b78', 'Seedream 5.0 Pro', 0.045), f3: still(D('film/f3.webp'), 1024, 1024, '0500e766', 'Seedream 5.0 Pro', 0.045),
    f4: still(D('film/f4.webp'), 1024, 1024, '57210472', 'Seedream 5.0 Pro', 0.045),
    c0: clip(D('film/c0.mp4'), 540, 540, 4.06, '76afd057', 'Seedance 2.0', 0.8739), c1: clip(D('film/c1.mp4'), 540, 540, 4.06, '95e1bd20', 'Seedance 2.0', 0.88),
    m: sound(ST('choir-score.mp3'), 30, '38d1d690', YUE),
  },
  /* Product ad: one MiniMax H3 text-to-video run, a 15 s ad in four shots. */
  product: { ad: clip(D('product/ad.mp4'), 972, 540, 15.08, '37b439c8', H3, 0.45) },
  /* Make a clip longer: a MiniMax H3 text-to-video take, then H3 Extend on that exact clip (+10 s, 20 s in all). */
  animate: {
    clip: clip(SC('h3-koi-take-in.mp4'), 1280, 714, 10.13, '42ceb1af', H3, 0.8),
    extend: clip(SC('h3-koi-take.mp4'), 1280, 714, 20.13, '2fb5ac80', 'H3 Extend', 0.52),
  },
  /* Mood board, the glass whale over the desert: the GPT Image still, the three LTX clips made from it, and the sound of one of them. */
  mood: {
    hero: still(ST('glass-whale.webp'), 1344, 1008, '98073a1f', FLARE, 0.0159),
    glide: clip(SC('ltx-pro-whale-glide.mp4'), 1920, 1080, 6.04, 'bc0005d7', LTXPRO, 1.46), dive: clip(SC('ltx-pro-whale-dive.mp4'), 1280, 720, 7.42, '39346ee1', LTXPRO, 2.44),
    dunes: clip(D('mood/dunes.mp4'), 982, 540, 5.04, '83a6fc4f', LTX, 0.14),
    sound: { ...sound(SC('ltx-pro-whale-glide.mp4'), 6.04, 'bc0005d7', LTXPRO, 1.46, CLOUD), note: `the sound of the ${LTXPRO} clip` },
  },
  /* Explore an idea, the red coat: one prompt, three looks, free on this computer. */
  free: {
    i0: still(SC('look-golden-hour.webp'), 1024, 576, 'b1398921', 'Qwen Image 2.1', 0, LOCAL),
    i1: still(SC('look-watercolour.webp'), 1024, 576, '58584c66', KLEIN, 0, LOCAL), i2: still(SC('look-anime.webp'), 1024, 576, '2fa09cbc', KLEIN, 0, LOCAL),
  },
};

/** "short:k2" → its media (null for an unknown ref). */
export function demoMediaOf(ref: unknown): DemoMedia | null {
  const m = /^(\w+):(\w+)$/.exec(String(ref ?? '')); return m ? DEMO_MEDIA[m[1]]?.[m[2]] ?? null : null;
}
export const demoKindOf = (m: Pick<DemoMedia, 'url' | 'note'>): DemoKind => (m.note || /\.mp3$/i.test(m.url) ? 'audio' : /\.mp4$/i.test(m.url) ? 'video' : 'image');
/** The card's line: "Sample · made with LTX-2.5 22B". */
export const demoLabel = (m: Pick<DemoMedia, 'model' | 'note'>) => `Sample · ${m.note ?? `made with ${m.model}`}`;

/** The model id each run used (job.provider), so the demo's card names that model from its draft on: the proposal, the card and the
 *  result all say the same model. Not YuE2: it sings from lyrics, which a card can't send, so a music card keeps its own default (its result
 *  still says YuE2). A sound taken from a clip keeps the default too (no music model made it). */
const PROVIDER: Record<string, string> = { [FLARE]: 'api-gpt-image-25-flare', 'Seedream 5.0 Pro': 'api-seedream', 'Qwen Image 2.1': 'comfy-qwen21', [KLEIN]: 'comfy-klein4b',
  [LTX]: 'comfy-ltx25-video', [LTXPRO]: 'router-ltx-25-pro', 'Seedance 2.0': 'router-seedance', [H3]: 'comfy-h3', 'H3 Extend': 'comfy-h3-extend', 'Qwen3 TTS 1.7B': 'comfy-qwen3tts' };
export const demoProviderOf = (ref: unknown): string | undefined => { const m = demoMediaOf(ref); return m && !m.note ? PROVIDER[m.model] : undefined; };

// ---------------------------------------------------------------- which job shows which media
/* The demo agent tags each card it adds (board + the card's prompt → ref); a run started from that card carries the same board id and prompt,
   so POST /api/tools/:id/jobs finds the ref (mock backend only). A card whose prompt you change is no longer the demo's: it gets a plain sample. */
const tags = new Map<string, string>(); const TAGS_MAX = 2000;
const tagKey = (boardId: string, prompt: string) => `${boardId}\u0000${prompt.replace(/\s+/g, ' ').trim()}`;
export function tagDemoCard(boardId: string, prompt: string, ref: string) {
  if (!demoMediaOf(ref) || !prompt.trim()) return; const k = tagKey(boardId, prompt); tags.delete(k); tags.set(k, ref);
  if (tags.size > TAGS_MAX) tags.delete(tags.keys().next().value!);
}
export const demoRefFor = (boardId: string | null | undefined, prompt: string | null | undefined) => (boardId && prompt ? tags.get(tagKey(boardId, prompt)) ?? null : null);
