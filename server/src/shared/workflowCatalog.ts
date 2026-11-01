/**
 * Workflows page catalogue (2026-10-27, redesign options behind ?wf=a|b|c). ONE list of every workflow the app really runs today, by the job
 * you want done (not by tech), plus the multi-step chains that join them. Data only: the page (web/src/ui/pages/Workflows.tsx) adds the real
 * models, prices and places from GET /api/tools and the image examples from GET /api/workflow-hub.
 *  - Every entry sits in exactly ONE category (`cat`) and may carry tags (search words, never a second home).
 *  - `href` opens the exact tab with the workflow picked (nothing runs until Generate): Image's bar, the Video page, Audio, 3D.
 *  - `models`: the model keys this workflow offers on its tool, the one shown first; empty = every model of the tool (image workflows: the
 *    feature's own engines).
 *  - Media: a real output of ours (shared/featured.ts key) or a shipped image example (shared/showcase.ts); else `art`, our own flow drawing.
 * Isomorphic (no server imports). Test: server/test/workflow-catalog.test.ts (every href lands on a real tool, every model key is offered there,
 * every featured / showcase key ships, each entry in one category, every chain step is a real entry).
 */
import { VIDEO_WORKFLOWS, VIDEO_FLOW_SHORTCUTS, videoWorkflowHref, type VideoWorkflow } from './videoWorkflows.js';
import { audioRoute, audioWorkflowById, AUDIO_WORKFLOW_IDS, type AudioWorkflowId } from './audioWorkflows.js';
import { threeDRoute, threeDWorkflowById } from './threeD.js';
import { featureById, IMAGE_FEATURES } from './imageFeatures.js';
import { THREE_D_WORKFLOWS } from './threeD.js';
import { FOOTAGE_EFFECTS, FOOTAGE_FX_TOOL, footageEffect, isCloudOnly } from './footageFx.js';
import { LTX_LORAS } from './ltxLoras.js';
import { featuredRecreateHref, LTX_LAYOUT } from './featured.js';
import type { FlowArt } from './exploreFlows.js';
import { goalById, goalOf, WF_START_HERE, type WfGoal } from './workflowGoals.js';

export type WfCat = 'video' | 'talk' | 'character' | 'film' | 'image' | 'photo' | 'product' | 'clip' | 'music' | '3d' | 'fix';
export type WfMedium = 'image' | 'video' | 'audio' | '3d';
/** The categories, in page order, with our one line each. Shown only when they hold a workflow. */
export const WF_CATS: { id: WfCat; label: string; line: string }[] = [
  { id: 'video', label: 'Make a video', line: 'Text or a photo into a clip with sound. Loops, morphs and longer takes too.' },
  { id: 'talk', label: 'Voices & talking', line: 'Give a portrait the words, read a script, change or translate a voice.' },
  { id: 'character', label: 'Characters', line: 'One character on every panel, then into any clip or photo.' },
  { id: 'film', label: 'Sketch → Film', line: 'Block the shot, point the camera, film it for real.' },
  { id: 'image', label: 'Make an image', line: 'Describe it and pick the model. Camera, lens and layers if you want them.' },
  { id: 'photo', label: 'Change a photo', line: 'Drop a photo in, get it back changed.' },
  { id: 'product', label: 'Product & ads', line: 'Clean product shots, try-ons and short ads that sell.' },
  { id: 'clip', label: 'Change a clip', line: 'Restyle, re-cut, cut out or add effects to footage you already have.' },
  { id: 'music', label: 'Music & sound', line: 'Songs, covers, sound effects and a score for your clip.' },
  { id: '3d', label: '3D & worlds', line: 'One picture into a model you can spin, download and film.' },
  { id: 'fix', label: 'Fix & upscale', line: 'Sharper, bigger, smoother: finish what you made.' },
];

export interface WfEntry {
  id: string; name: string; line: string; cat: WfCat; tags: string[]; medium: WfMedium;
  /** the tool that runs it (prices and models come from it) */ toolId: string; href: string;
  /** model keys on the tool, the shown one first ([] = the tool's own list) */ models: string[];
  /** true: ONLY these models (a shortcut that is one model's setting: Loop, Morph on LTX-2.5); else they lead the tool's list */ modelsOnly?: boolean;
  /** the tool mode it runs (Audio: music / sfx…; Lip Sync: lipsync): the page lists the models that offer it */ mode?: string;
  /** what it takes, in plain words */ needs: string;
  /** a real output of ours (shared/featured.ts) */ featured?: string; /** a shipped image example (shared/showcase.ts id) */ showcase?: string;
  /** our own drawing when there is no output */ art?: FlowArt;
  /** where its own example opens as Recreate (featured only) */ recreate?: string | null;
  /** the image workflow id (GET /api/workflow-hub card) */ hubId?: string;
  /** three short steps */ how?: [string, string][];
  /** the tool preset it opens with (?preset=, a Footage Effects effect): the page shows it only while the tool still offers that preset */ preset?: string;
  /** the tab workflow it stands for (WF_SOURCES key, e.g. 'video:extend'); set by the helpers */ source: string;
  /** a real run of ours with no featured / showcase record (Try-On): its before / after pictures (shipped) and the run behind them */
  example?: WfExample;
  /** the name its tab's menu uses, when the page says it plainer (Extend → "Make a clip longer"): the sheet names it, search still finds it */
  tabName?: string;
  /** a real sound of ours with no featured record (Voiceover: the presenter's script, read by Qwen3 TTS): the file (shipped) and the run behind it */
  listen?: { url: string; jobId: string };
}
export interface WfExample { before: string; after: string; beforeLabel: string; afterLabel: string; run: { jobId: string; model: string; place: string; costUsd: number } }

const vw = (id: string): VideoWorkflow => { const w = VIDEO_WORKFLOWS.find((x) => x.id === id) ?? VIDEO_FLOW_SHORTCUTS.find((x) => x.id === id); if (!w) throw new Error(`video workflow ${id}`); return w; };
const vhref = (id: string) => (VIDEO_FLOW_SHORTCUTS.find((x) => x.id === id)?.href ?? videoWorkflowHref(id));
const withQ = (href: string, q: Record<string, string>) => { const [p, s = ''] = href.split('?'); const u = new URLSearchParams(s); for (const [k, v] of Object.entries(q)) u.set(k, v); return `${p}?${u}`; };

/** A Video tab workflow (or flow shortcut). */
function V(id: string, cat: WfCat, o: Partial<WfEntry> & { model?: string } = {}): WfEntry {
  const w = vw(id); const href = o.model ? withQ(vhref(id), { model: o.model }) : vhref(id);
  return { id: `v-${id}`, source: `video:${id}`, name: w.name, tabName: o.name && o.name !== w.name ? w.name : undefined, line: w.tagline, cat, tags: [], medium: 'video', toolId: w.toolId, href, models: o.model ? [o.model] : [], needs: w.needs, how: w.how,
    modelsOnly: !!VIDEO_FLOW_SHORTCUTS.find((x) => x.id === id), mode: w.params?.mode,
    recreate: o.featured ? featuredRecreateHref(o.featured) : null, ...o };
}
/** An Image tab workflow (Create Image's bar with it picked). */
function I(id: string, cat: WfCat, o: Partial<WfEntry> = {}): WfEntry {
  const f = featureById(id); if (!f) throw new Error(`image workflow ${id}`);
  return { id: `i-${id}`, source: `image:${id}`, name: f.name, tabName: o.name && o.name !== f.name ? f.name : undefined, line: f.tagline, cat, tags: [], medium: 'image', toolId: f.toolId, href: f.route,
    models: [], needs: id === 'create-image' || id === 'camera-lens' ? 'A prompt' : 'A photo', hubId: id, ...o };
}
/** An Audio tab workflow. */
function A(id: AudioWorkflowId, cat: WfCat, o: Partial<WfEntry> & { model?: string } = {}): WfEntry {
  const a = audioWorkflowById(id); if (!a) throw new Error(`audio workflow ${id}`);
  return { id: `a-${id}`, source: `audio:${id}`, name: a.name, tabName: o.name && o.name !== a.name ? a.name : undefined, line: a.tagline, cat, tags: [], medium: 'audio', toolId: a.tool, href: o.model ? withQ(audioRoute(id), { model: o.model }) : audioRoute(id),
    models: o.model ? [o.model] : [], mode: a.mode, needs: a.slots.some((s) => s.required) ? a.slots.filter((s) => s.required).map((s) => s.label).join(' + ') : 'A prompt', ...o };
}
/** A 3D tab workflow (ready ones only). */
function D(id: string, cat: WfCat, o: Partial<WfEntry> = {}): WfEntry {
  const d = threeDWorkflowById(id); if (!d || d.status !== 'ready' || !d.toolId) throw new Error(`3D workflow ${id}`);
  return { id: `d-${id}`, source: `3d:${id}`, name: d.name, line: d.tagline, cat, tags: [], medium: '3d', toolId: d.toolId, href: threeDRoute(id), models: [], mode: d.mode ?? undefined, needs: d.needs, ...o };
}

/** A Footage Effects effect (shared/footageFx.ts): the Video tab's Footage Effects with that effect picked (?preset=), named after the effect
 *  and credited to the Lightricks IC-LoRA that does it. Each effect is its own card: the effect IS the workflow you came for. */
function FX(id: string, o: Partial<WfEntry> = {}): WfEntry {
  const fx = footageEffect(id); const w = vw(FOOTAGE_FX_TOOL); if (!fx) throw new Error(`footage effect ${id}`);
  const cloudOnly = isCloudOnly(fx); const lora = cloudOnly ? fx.cloud!.loraLabel : LTX_LORAS[fx.lora]?.label ?? fx.lora;
  // both places (Vanish, Day to night, Rain, Flood): LTX-2.5 on your computer, the LTX-2.3 version of the same Lightricks LoRA on Comfy Cloud
  const made = cloudOnly ? `${lora} on LTX-2.3 22B, official Comfy template, on Comfy Cloud` : `Lightricks ${lora} on LTX-2.5 22B${fx.cloud ? ', or its LTX-2.3 version on Comfy Cloud' : ''}`;
  return { id: `fx-${id}`, source: `fx:${id}`, name: fx.label, line: fx.tagline, cat: 'clip', tags: ['footage effects', 'vfx', 'ic-lora', 'ltx', ...(cloudOnly ? ['comfy cloud'] : fx.cloud ? ['local', 'comfy cloud'] : ['local']), lora.toLowerCase()], medium: 'video', toolId: w.toolId,
    href: `${videoWorkflowHref(FOOTAGE_FX_TOOL)}&preset=${encodeURIComponent(id)}`, models: [], needs: fx.needsLine ? '1 clip + what to remove' : '1 clip', preset: id, art: 'fx',
    how: [cloudOnly ? ['Add your clip', 'Upload one, pick it from your media, or use a result. Up to 5 s at a time.'] : w.how[0], ['Pick the effect', `${fx.label} is picked for you: ${fx.tagline.charAt(0).toLowerCase()}${fx.tagline.slice(1)} (${made}).`], cloudOnly ? ['Generate', 'Runs on Comfy Cloud with the price on the button. Your sound is kept.'] : w.how[2]], ...o };
}

export const WF_ENTRIES: WfEntry[] = [
  // Make a video
  V('create', 'video', { line: 'Turn words or a photo into video.', name: 'Create Video', featured: 'ltx-pro-painter', tags: ['text to video', 'image to video', 'sound', 'ltx', 'multi-shot', 'dialogue'] }),
  V('photos-to-reel', 'video', { line: 'Your photos, cut into a vertical reel.', name: 'Photos into a reel', art: 'move', tags: ['photos', 'reel', 'listing', 'event', 'hotel', 'trip'], needs: '8–15 photos + a title' }),
  V('loop', 'video', { line: 'A clip that plays forever.', featured: 'ltx-village-loop', model: 'ltx-2.5-22b', tags: ['seamless', 'gif', 'local'] }),
  V('morph', 'video', { line: 'One scene melts into another.', featured: 'ltx-morph', model: 'ltx-2.5-22b', tags: ['transition', 'start and end frame'] }),
  V('transitions', 'video', { art: 'viral', tags: ['start and end frame', 'morph'] }),
  V('photo-fx', 'video', { art: 'fx', tags: ['effect', 'animate a photo', 'levitate', 'shatter', 'portal'] }),
  V('extend', 'video', { line: 'Keep any shot going.', name: 'Make a clip longer', featured: 'h3-fox-extend', model: 'minimax-h3-extend', tags: ['longer', 'continue', 'long take'] }),
  // Voices & talking
  V('lip-sync', 'talk', { line: 'Give any portrait your words.', name: 'Make a photo talk', model: 'ltx-2.5-talking-photo' /* free locally; InfiniteTalk and H3 Talking Photo follow */,
    featured: 'presenter-talk' /* our presenter, InfiniteTalk on Comfy Cloud (job 3f3fa8b8): the sheet names that model under the example */, tags: ['lip sync', 'talking photo', 'presenter', 'avatar', 'portrait'] }),
  A('voiceover', 'talk', { line: 'A clear voice reads your script.', model: 'chatterbox', art: 'voice', listen: { url: '/examples/starter/presenter-talk-speech.mp3', jobId: '952f0862' } /* the presenter's script, Qwen3 TTS on our computer */, tags: ['text to speech', 'narration', 'script', 'tts'] }),
  A('change-voice', 'talk', { art: 'voice', model: 'chatterbox-voice-changer', tags: ['voice changer', 'speech to speech'] }),
  A('translate', 'talk', { line: 'Hear your clip in another language.', name: 'Translate a video', art: 'voice', model: 'translate-chatterbox', tags: ['dub', 'language', 'subtitles'] }),
  // Characters
  I('character-sheet', 'character', { line: 'One character, the same every time.', showcase: 'fad0bbe6', tags: ['turnaround', 'model sheet', 'consistent character', 'cast'] }),
  I('face-swap', 'character', { tags: ['face', 'portrait'] }),
  I('phone-photo', 'character', { art: 'photo', tags: ['ugc', 'selfie', 'mirror selfie', 'phone', 'social', 'candid', 'portrait', 'influencer'] }),
  I('person-swap', 'character', { tags: ['body', 'outfit'] }),
  V('motion-control', 'character', { line: 'Your character moves like any clip.', name: 'Copy the moves', featured: 'kling-dance-swap', model: 'kling-v3-omni-edit', tags: ['dance', 'motion transfer', 'swap a character'] }),
  V('object-swap', 'character', { line: 'Replace a person, product or place.', name: 'Swap in a clip', featured: 'h3-char-swap', model: 'minimax-h3-character-swap', tags: ['swap', 'replace a person', 'object swap', 'person swap', 'character swap'] }),
  // Sketch → Film
  V('direct-a-shot', 'film', { line: 'Block it in 3D, film it for real.', name: 'Plan a shot in 3D', featured: 'mossbun-mockup-film', tags: ['previz', 'mockup', '3d blocking', 'camera path', 'storyboard', 'local'] }),
  V('reshoot', 'film', { art: 'reshoot', model: 'ltx-2-19b', tags: ['new camera angle', 'coverage'] }),
  V('new-angle', 'film', { art: 'angle', model: 'minimax-h3-crossview', tags: ['camera angle', 'crossview'] }),
  V('camera-moves', 'film', { art: 'move', model: 'ltx-2-19b', tags: ['dolly', 'orbit', 'crane', 'camera move'] }),
  // Make an image
  I('create-image', 'image', { line: 'Describe it, get a picture.', showcase: '032054ec', tags: ['text to image', 'edit with a prompt', 'picture'] }),
  I('camera-lens', 'image', { art: 'photo', tags: ['lens', 'film stock', 'aperture', 'cinematic still'] }),
  I('image-layers', 'image', { line: 'Every part on its own layer.', name: 'Split into layers', featured: 'image-layers-paw', tags: ['psd', 'layers', 'poster', 'split'] }),
  // Change a photo
  I('edit-image', 'photo', { line: 'Change any photo with a few words.', art: 'photo', tags: ['edit with a prompt', 'change a photo', 'retouch', 'flux 3 klein'] }),
  I('relight', 'photo', { line: 'Move the light, change the mood.', showcase: '0f1a0117', tags: ['light', 'golden hour', 'studio light'] }),
  I('camera-angles', 'photo', { art: 'angle', tags: ['new angle', 'shots', 'coverage'] }),
  I('brush-edit', 'photo', { art: 'photo', tags: ['inpaint', 'paint a change', 'mask'] }),
  I('expand', 'photo', { art: 'photo', tags: ['outpaint', 'reframe', 'bigger canvas'] }),
  I('erase', 'photo', { name: 'Erase anything', line: 'Paint over it, and it’s gone.', art: 'erase', tags: ['remove object', 'clean up'] }),
  // Product & ads
  I('product-shot', 'product', { line: 'Studio-clean photos of anything you sell.', art: 'object', tags: ['packshot', 'ecommerce', 'studio'] }),
  /* our real run (2026-10-28, job 6123e3ac): Bria Virtual Try-On on Comfy Router, $0.057; the jacket made free on our computer (FLUX.2 [klein] 4B) */
  I('try-on', 'product', { line: 'See any outfit on any person.', name: 'Try clothes on', needs: 'A person photo + a garment photo', models: ['bria-virtual-tryon'] /* Comfy Router: one key runs it (FASHN on fal follows) */, art: 'tryon', tags: ['fashion', 'garment', 'outfit', 'bria'],
    example: { before: '/examples/workflows/i-try-on-before.webp', after: '/examples/workflows/i-try-on.webp', beforeLabel: 'Before', afterLabel: 'Try-on',
      run: { jobId: '6123e3ac', model: 'Bria Virtual Try-On', place: 'Comfy Cloud', costUsd: 0.057 } } }),
  I('material-swap', 'product', { line: 'Dress any object in a new material.', needs: 'An object photo + a material photo', art: 'object', tags: ['material', 'texture', 'fabric', 'leather', 'marble', 'qwen image 2.1', 'local'] }),
  I('ad-pack', 'product', { line: 'Ready-to-post ads from one product photo.', needs: 'A product photo + your offer', art: 'photo' /* its own tool icon */, tags: ['ad', 'ads', 'offer', 'sale', 'brand', 'logo', 'social', 'instagram', 'tiktok', 'marketing'] }),
  I('remove-bg', 'product', { line: 'Cut out the subject, background gone.', name: 'Remove Background', art: 'photo' /* its own tool icon */, tags: ['cutout', 'transparent', 'png'] }),
  V('ugc-ad', 'product', { line: 'A presenter sells your product, phone-style.', art: 'talk', tags: ['ad', 'presenter', 'phone', 'social'] }),
  V('orbit-shot', 'product', { line: 'Spin the camera around your product.', art: 'turntable', tags: ['360', 'spin', 'product video'] }),
  V('exploded-view', 'product', { art: 'fx', model: 'ltx-2.5-22b', tags: ['parts', 'lora', 'local'] }),
  // Change a clip
  V('restyle', 'clip', { art: 'video', tags: ['style transfer', 'look'] }),
  V('anime-restyle', 'clip', { art: 'video', tags: ['anime', 'cel shaded', 'cartoon'] }),
  FX('vanish', { tags: ['remove people', 'clean plate', 'empty street', 'footage effects', 'vfx', 'local', 'comfy cloud'] }),
  FX('day-to-night', { tags: ['night', 'relight', 'footage effects', 'vfx', 'local', 'comfy cloud'] }),
  FX('rain', { tags: ['water', 'wet', 'weather', 'water simulation', 'footage effects', 'vfx', 'local', 'comfy cloud'] }),
  FX('flood', { tags: ['water', 'water simulation', 'footage effects', 'vfx', 'local', 'comfy cloud'] }),
  FX('alpha-matte', { tags: ['matte', 'alpha', 'alpha gen', 'green screen', 'compositing', 'footage effects', 'vfx', 'local'] }),
  // Comfy Cloud effects (2026-10-27): the official Comfy LTX-2.3 templates
  FX('restore', { art: 'restore', tags: ['restore', 'old film', 'archival', 'colorize', 'remaster', 'footage effects', 'vfx', 'comfy cloud'] }),
  FX('remove-object', { art: 'erase', tags: ['remove object', 'erase', 'inpaint', 'clean up', 'footage effects', 'vfx', 'comfy cloud'] }),
  FX('remove-text', { art: 'untext', tags: ['remove subtitles', 'captions', 'watermark', 'text', 'footage effects', 'vfx', 'comfy cloud'] }),
  FX('extend-frame', { art: 'outpaint', tags: ['outpaint', 'extend frame', 'reframe', 'vertical', 'widen', 'zoom out', 'footage effects', 'vfx', 'comfy cloud'] }),
  V('reframe', 'clip', { line: 'Fit any clip to any screen.', name: 'Make it vertical', art: 'outpaint', tags: ['aspect ratio', 'vertical', 'outpaint'] }),
  V('remove-bg', 'clip', { name: 'Remove Video Background', art: 'video', tags: ['cutout', 'green screen'] }),
  V('cutout', 'clip', { art: 'video', tags: ['alpha', 'matte', 'compositing'] }),
  V('depth-map', 'clip', { art: 'video', tags: ['depth', 'compositing', 'vfx'] }),
  // Music & sound
  A('music', 'music', { line: 'Write a song from a few words.', name: 'Make music', model: 'yue2' /* installed and run here (job d967cfc3); ACE-Step 1.5 needs setting up */, featured: 'audio-last-train', art: 'music', tags: ['song', 'lyrics', 'track', 'beat'] }),
  A('cover', 'music', { line: 'Your song, new style, same melody.', art: 'cover', tags: ['song', 'remix', 'new style'] }),
  A('sfx', 'music', { line: 'Any sound, from a few words.', model: 'stable-audio-open-1.0' /* free on your computer; ElevenLabs and Seed Audio follow */, featured: 'audio-rain-roof', art: 'sfx', tags: ['sound effect', 'foley', 'ambience'] }),
  A('soundtrack-music', 'music', { line: 'A score made for your clip.', name: 'Add music to a clip', model: 'yue2', art: 'score', tags: ['score', 'music bed', 'for a clip'] }),
  A('soundtrack-sound', 'music', { model: 'mmaudio', art: 'foley', tags: ['foley', 'video to sound', 'mmaudio'] }),
  // 3D & worlds
  D('image-to-3d', '3d', { line: 'Turn one picture into a 3D model.', models: ['cloud-tripo-31'] /* our real run: Mossbun, job 092abb03 */, art: 'cube', tags: ['glb', 'model', 'mesh', 'tripo', 'trellis', 'hunyuan'] }),
  D('text-to-3d', '3d', { models: ['cloud-tripo-31'], modelsOnly: true, art: 'cube', tags: ['text', 'glb', 'mesh', 'tripo'] }),
  D('multiview-to-3d', '3d', { models: ['cloud-tripo-31'], modelsOnly: true, art: 'cube', tags: ['views', 'photos', 'glb', 'tripo'] }),
  D('turntable', '3d', { art: 'turntable', tags: ['spin', 'spin video', 'showcase'] }),
  // Fix & upscale
  I('upscale', 'fix', { line: 'Bigger, crisper pictures, up to 8x.', name: 'Make it sharper', showcase: '1492ccf1', tags: ['sharper', '4x', 'enhance'] }),
  V('upscale', 'fix', { art: 'video', tags: ['4k', 'sharper', 'enhance'] }),
  V('draft-upscale', 'fix', { art: 'video', tags: ['1080p', 'draft'] }),
  V('fps-boost', 'fix', { art: 'video', tags: ['60 fps', 'smooth', 'interpolation', 'rife'] }),
  V('sdr-hdr', 'fix', { art: 'video', tags: ['hdr10', 'colour', 'dynamic range'] }),
  V('prompt-edit', 'fix', { art: 'video', tags: ['edit with words', 'instruction edit', 'make it night', 'remove an object', 'change colour', 'bernini'] }),
  V('finish', 'fix', { art: 'video', tags: ['grain', 'glow', 'light leak', 'glitch', 'push-in', 'vignette', 'cinematic', 'polish'] }),
];
export const wfEntryById = (id: string): WfEntry | undefined => WF_ENTRIES.find((e) => e.id === id);

// ------------------------------------------------------------------ the Workflows page's own selection (user picks, 2026-11-01: "P1")
/** What the Workflows PAGE shows: "Start here" (shared/workflowGoals.ts WF_START_HERE, the same list the menus will call "For you"), then one
 *  short section per goal (shared/workflowGoals.ts WF_GOALS), each with the user's picks in order. Ids are entry ids or `chain:<id>`, each in
 *  its own goal (GOAL_OF) and on the page once. Everything else stays in WF_ENTRIES / WF_CHAINS: its tab, its menus, direct links, search (the
 *  page lists matches under "Also in the tabs"), Explore, Recreate, /workflows/:id and the MCP catalogue all keep it. To move a card: edit these lists. */
export const WF_PAGE_PICKS: Record<WfGoal, string[]> = {
  create: ['v-loop', 'v-morph', 'd-image-to-3d'],
  shop: ['i-try-on', 'i-material-swap', 'v-orbit-shot', 'i-remove-bg'],
  ads: ['i-ad-pack', 'v-ugc-ad', 'v-reframe', 'a-translate', 'v-photos-to-reel'],
  people: ['i-character-sheet', 'v-motion-control', 'v-object-swap', 'chain:presenter'],
  film: ['chain:kdrama', 'v-direct-a-shot', 'v-extend'],
  music: ['a-soundtrack-music', 'a-sfx', 'a-cover'],
  fix: ['i-relight', 'i-erase', 'i-image-layers'],
};
/** Every card on the page, Start here first, then the goals in order. */
export const WF_PAGE_ALL: string[] = [...WF_START_HERE, ...Object.values(WF_PAGE_PICKS).flat()];
/** Shown on the Workflows page (Start here or a goal's picks). */
export const onWorkflowsPage = (id: string): boolean => WF_PAGE_ALL.includes(id);
export const isStartHere = (id: string): boolean => WF_START_HERE.includes(id);
/** The page cards' own pictures (2026-10-28): one 720×600 WebP per card (2× the card, its 6:5 shape), the strongest frame of the card's shipped
 *  example (Upscale: before | after on a diagonal; Split into layers: the picture with its layers fanned out behind it), no metadata, under
 *  web/public/examples/workflows. A card with no picture to show keeps our drawing: no example yet, or a sound (its sheet plays it). The sheet
 *  keeps the full example (the clip, the before / after, the sound). Every file ships with the repo, so a fresh install shows them (test:
 *  server/test/workflow-catalog.test.ts). */
export const WF_CARD_THUMBS: Record<string, string> = Object.fromEntries(
  ['i-create-image', 'v-create', 'v-lip-sync', 'i-upscale', 'v-loop', 'v-morph', 'i-try-on', 'i-character-sheet', 'v-motion-control', 'v-object-swap', 'chain:kdrama', 'v-direct-a-shot',
    'v-extend', 'i-relight', 'i-image-layers']
    .map((id) => [id, `/examples/workflows/${id.replace(':', '-')}.webp`]));
export const cardThumb = (id: string): string | null => WF_CARD_THUMBS[id] ?? null;
/** The same picture before the change (Try-On: the person in the pink top; Relight: the room before), same crop: the card fades from it to its picture on hover. */
export const WF_CARD_BEFORE: Record<string, string> = { 'i-try-on': '/examples/workflows/i-try-on-before.webp', 'i-relight': '/examples/workflows/i-relight-before.webp' };
export const cardBefore = (id: string): string | null => WF_CARD_BEFORE[id] ?? null;

// ------------------------------------------------------------------ coverage (the contract: test/workflow-contract.test.ts)
/** Every workflow the app's tabs offer today, by key (`video:extend`, `image:relight`, `audio:music`, `3d:turntable`, `fx:vanish`): the
 *  Video picker's workflows and shortcuts, Create Image's workflows, the Audio picker, the 3D tab's ready workflows and each Footage Effects
 *  effect. The page must show each one exactly once, or name it in WF_EXCLUDED with the reason. */
export const WF_SOURCES: { key: string; name: string; toolId: string }[] = [
  ...[...VIDEO_WORKFLOWS, ...VIDEO_FLOW_SHORTCUTS].map((w) => ({ key: `video:${w.id}`, name: w.name, toolId: w.toolId })),
  ...IMAGE_FEATURES.map((f) => ({ key: `image:${f.id}`, name: f.name, toolId: f.toolId })),
  ...AUDIO_WORKFLOW_IDS.map((id) => { const a = audioWorkflowById(id)!; return { key: `audio:${id}`, name: a.name, toolId: a.tool }; }),
  ...THREE_D_WORKFLOWS.filter((d) => d.status === 'ready' && d.toolId).map((d) => ({ key: `3d:${d.id}`, name: d.name, toolId: d.toolId! })),
  ...FOOTAGE_EFFECTS.map((e) => ({ key: `fx:${e.id}`, name: e.label, toolId: FOOTAGE_FX_TOOL })),
];
/** Tab workflows the page leaves out on purpose, and why. */
export const WF_EXCLUDED: Record<string, string> = {
  'video:edit-video': 'a list of the edits (the Video picker’s Edit tab), not a workflow: each edit has its own card',
  'video:footage-fx': 'shown as its nine effects (fx:*), each its own card',
  'video:stitch': 'Stitch joins clips through the compose route, not a generator tool; it lives in the Video picker (a card here is a follow-up)',
  '3d:plan-a-shot': 'the same Direct a Shot as video:direct-a-shot (the Video menu shortcut opens the 3D tab)',
};
/** Server tools no card points at, and why (every other tool on GET /api/tools has a card). */
export const WF_TOOLS_EXCLUDED: Record<string, string> = {
  'photos-reel': 'the hidden base tool behind Photos → Reel (app-photos-to-reel), not a separate workflow',
  'make-it-real': 'the Render step inside Direct a Shot (v-direct-a-shot), not a workflow you open on its own',
  cinema: 'Director, retired (2026-10-23): its page opens Create Video',
  soul: 'legacy look LoRAs page: Create Image has the looks now',
  'app-change-voice': 'the engine behind Audio › Change voice (a-change-voice)',
  'app-translate-video': 'the engine behind Audio › Translate (a-translate)',
  'app-music-bed': 'the engine behind Audio › Music for a video (a-soundtrack-music)',
  'two-person-swap': 'retired as a workflow choice: its links open Object / Person Swap (videoWorkflows.ts videoRedirect); the tool stays for old runs and their history feed',
};

// ------------------------------------------------------------------ chains
export interface WfStep { entry: string; /** what you do in this step, our words */ say: string; /** the model the step is shown with (on that entry's tool) */ model?: string;
  /** the model in words when it isn't one of the tool's models (Direct a Shot's render step) */ modelName?: string;
  /** the runs of ours that did this step, in order (job ids; featured.ts runByJob): the step shows their model and cost, and "Made here" only when set */ jobs?: string[] }
export interface WfChain {
  id: string; name: string; line: string; steps: WfStep[]; tags: string[];
  /** a real output of the whole chain (shared/featured.ts) */ featured?: string; art?: FlowArt;
  /** a ready skill your AI agent can run end to end (skills/<id>) */ skill?: string;
  /** how the hand-off between steps works in the app, honestly */ handoff: string;
  /** the published workflow this chain follows (an official Comfy template run step by step here), credited on the card */ source?: { name: string; url: string; author: string; licence: string };
}
export const WF_CHAINS: WfChain[] = [
  /* our own presenter (2026-10-27): a GPT Image 2.5 Flare portrait plus a Flare edit adding the logo, the voice on Qwen3 TTS, then InfiniteTalk on Comfy Cloud */
  { id: 'presenter', name: 'A talking presenter', line: 'Your own presenter, reading your script.', tags: ['avatar', 'talking head', 'explainer'], art: 'talk',
    steps: [{ entry: 'i-create-image', say: 'Make a portrait, add your logo', model: 'gpt-image-2.5-flare', jobs: ['df027961', '160c5f7a'] },
      { entry: 'a-voiceover', say: 'Read your script aloud', model: 'qwen3-tts', jobs: ['952f0862'] }, { entry: 'v-lip-sync', say: 'Make the portrait say it', model: 'infinitetalk-wan-2.1', jobs: ['3f3fa8b8'] }],
    handoff: 'On the voice, press Make it talk, then add the portrait.' },
  { id: 'sketch-film', name: 'Sketch → Film', line: 'Block the shot in 3D, paint the first frame, film it with the same camera path.', tags: ['previz', 'mockup', 'camera'], featured: 'ltx-mockup-film', skill: 'direct-a-shot',
    steps: [{ entry: 'v-direct-a-shot', say: 'Stage the scene and the camera, record a free mockup', modelName: 'In your browser', jobs: ['a1a50672'] },
      { entry: 'i-create-image', say: 'Paint the mockup’s first frame into a photo', model: 'gpt-image-2.5-flare', jobs: ['645de70d'] }, { entry: 'v-direct-a-shot', say: 'Render the film: LTX-2.5 follows the mockup', modelName: LTX_LAYOUT, jobs: ['1a1a33c6'] }],
    handoff: 'Stage and render on the Direct a Shot page. We painted our first frame in Create Image; the page can paint one for you, free on your computer, or you can skip it.' },
  /* our own scene (Explore "Script → Screen", job fb0b44ca): one 15 s MiniMax H3 take from the script, voiced, on Comfy Cloud ($1.20) */
  { id: 'kdrama', name: 'Film a scene from a script', line: 'Paste a script, get a voiced scene.', tags: ['drama', 'story', 'series', 'dialogue', 'k-drama', 'script'], featured: 'h3-kdrama-script', skill: 'drama-series',
    steps: [{ entry: 'v-create', say: 'Paste the script, get the scene, voiced', model: 'minimax-h3', jobs: ['fb0b44ca'] }],
    handoff: 'Our scene is one 15-second take. Press Extend on it to keep it going.' },
  { id: 'long-take', name: 'One long take', line: 'A clip, then keep the shot going for 20 seconds and more.', tags: ['extend', 'continue'], featured: 'h3-koi-take',
    steps: [{ entry: 'v-create', say: 'Make the opening shot', model: 'minimax-h3', jobs: ['42ceb1af'] }, { entry: 'v-extend', say: 'Continue the same action and camera', model: 'minimax-h3-extend', jobs: ['50d2a3a0'] }],
    handoff: 'On a video result, Extend picks it up; “Continue from last frame” works on any model.' },
  { id: 'product-ad', name: 'Product photo → ad', line: 'A clean product shot, then a short ad with a presenter.', tags: ['ecommerce', 'ugc', 'social'], art: 'object', skill: 'ugc-ad',
    steps: [{ entry: 'i-product-shot', say: 'Make the product shot' }, { entry: 'v-orbit-shot', say: 'Spin the camera around it' }, { entry: 'v-ugc-ad', say: 'A phone-style ad with a presenter' }],
    handoff: 'On the product shot, “Turn to video” starts the next step; each step shows its price before you run it.' },
  /* Official Comfy template "Product Advertisement Video" (comfy.org/workflows c98e5c457e1e, 2026-10-27): up to 3 product photos → an LLM (Gemini 3.1 Pro
   * partner node) writes one time-cued multi-shot prompt → MiniMax H3 Reference to Video renders it. Here: the same two halves on our tabs. The LLM step is
   * not a model we run, so the shot list is yours (the template's shape: "0–3 s Shot 1…"); Create Video's Reference to video takes the photos as Image 1–3. */
  { id: 'product-ad-multishot', name: 'Product ad in shots', line: 'Up to three product photos, one take cut into shots, the product the same in every one.', tags: ['ecommerce', 'commercial', 'multi-shot', 'brand'], art: 'object',
    steps: [{ entry: 'i-product-shot', say: 'Make the hero shot: the product in its scene (Image 1)' }, { entry: 'v-create', say: 'Reference to video: hero shot plus two detail photos, the shots written with their times', model: 'minimax-h3' }],
    handoff: 'Write the shots with their times in one prompt, like “0–3 s: slow push-in on the bottle. 3–6 s: macro on the cap.” Image 1 sets the scene for every shot; Images 2 and 3 show product details.',
    source: { name: 'Product Advertisement Video (official Comfy template)', url: 'https://comfy.org/workflows/c98e5c457e1e-c98e5c457e1e/', author: 'Rob', licence: 'as published on comfy.org/workflows (no licence stated on the page)' } },
  { id: 'music-video', name: 'Song → music video', line: 'Make the track, then clips cut to its beats.', tags: ['song', 'clips', 'visualiser'], art: 'music', skill: 'music-video',
    steps: [{ entry: 'a-music', say: 'Make the song', model: 'yue2' }, { entry: 'v-create', say: 'One clip per beat', model: 'ltx-2.5-22b' }],
    handoff: 'The music-video skill lets your AI agent plan the beats and stitch the clips. Have a clip already? “Music for a video” scores it instead.' },
  { id: 'picture-3d', name: 'Picture → 3D → spin', line: 'One picture into a 3D model, then a turntable video of it.', tags: ['glb', 'model', 'turntable'], art: 'cube',
    steps: [{ entry: 'i-create-image', say: 'Make or pick the picture', model: 'gpt-image-2.5-flare', jobs: ['9564386e'] }, { entry: 'd-image-to-3d', say: 'Turn it into a textured model', model: 'cloud-tripo-31', jobs: ['092abb03'] },
      { entry: 'd-turntable', say: 'Record it spinning, free in your browser' }],
    handoff: 'On an image result, “Send to 3D” fills the slot; a 3D result’s “Make a video” records the turntable.' },
];

/** Plain-words search: every word must hit the name, the line, the category, a tag or a model name the caller adds. */
export function matchesQuery(hay: string, q: string): boolean {
  const words = q.toLowerCase().replace(/[→>]/g, ' ').split(/\s+/).filter(Boolean); if (!words.length) return true;
  const h = hay.toLowerCase(); return words.every((w) => h.includes(w));
}
/** a goal's label as search words (shared/workflowGoals.ts): "shop" or "ads" finds that goal's workflows */
const goalWords = (id: string) => goalById(goalOf(id) ?? '')?.label ?? '';
export const entryHay = (e: WfEntry, extra = ''): string => [e.name, e.tabName, e.line, e.needs, WF_CATS.find((c) => c.id === e.cat)?.label, goalWords(e.id), e.medium, ...e.tags, extra].join(' ');
export const chainHay = (c: WfChain): string => [c.name, c.line, goalWords(`chain:${c.id}`), ...c.tags, ...c.steps.map((s) => `${wfEntryById(s.entry)?.name ?? ''} ${s.say}`)].join(' ');
/** Category counts for the given entries; empty categories left out (the page hides them). */
export function catCounts(list: WfEntry[]): { id: WfCat; label: string; line: string; n: number }[] {
  return WF_CATS.map((c) => ({ ...c, n: list.filter((e) => e.cat === c.id).length })).filter((c) => c.n > 0);
}
