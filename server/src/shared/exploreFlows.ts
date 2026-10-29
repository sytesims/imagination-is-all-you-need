/**
 * Explore (2026-10-26): the home page's hero and rows, one row per thing you can really do in the app, in the app's own names. Data only, so the
 * page (web/src/ui/Home.tsx), the header menus' "Flows" and the tests share it. Every card opens the exact tool with its settings filled in
 * (nothing runs until Generate) and names the real model; its price comes from GET /api/tools (Free when it runs on your computer).
 * Media: a real output of ours (shared/featured.ts key) wherever one exists, else our own flow art (never a stand-in "result").
 * Test: server/test/explore-flows.test.ts (every href opens a real tool, every model key is offered there, every featured key ships).
 */
import { VIDEO_PAGE, videoWorkflowHref } from './videoWorkflows.js';
import { threeDRoute, THREE_D_PAGE } from './threeD.js';
import { audioRoute } from './audioWorkflows.js';
import { VIRAL_TEMPLATES, VIRAL_MODEL_KEY, fillTemplate } from './viralTemplates.js';
import { featuredRecreateHref, XMAS_VIDEO_PROMPT } from './featured.js';

export type FlowArt = 'video' | 'photo' | 'object' | 'reshoot' | 'move' | 'cloud' | 'swap' | 'angle' | 'loop' | 'fx' | 'viral' | 'music' | 'voice' | 'talk' | 'cube' | 'turntable' | 'agent' | 'canvas' | 'skills' | 'stage' | 'restore' | 'erase' | 'untext' | 'outpaint' /* Footage Effects · Comfy Cloud cards (2026-10-27) */
  | 'tryon' | 'cover' | 'sfx' | 'score' | 'foley' /* Workflows page picks (2026-10-28): one drawing per card */;
export interface ExploreCard {
  id: string; title: string; line: string; href: string;
  /** the tool that opens (the test checks the href lands on it) */ toolId: string;
  /** the model it opens on (tool's models[].key): the card shows its name and price */ modelKey?: string;
  /** a real output of ours (shared/featured.ts) as the card's media */ featured?: string;
  /** our own art when there is no output to show */ art?: FlowArt;
  /** a Photo FX effect drawn by the app's own stand-in art */ standIn?: { id: string; toolId: string };
  /** a chip on the media: "New", "Free" (runs on your computer), "Cloud" */ badge?: string;
  /** price words when the card isn't one model (an agent, a free browser step) */ priceText?: string;
}
export interface ExploreRow { id: string; title: string; line: string; /** the row's "See all" */ more?: { label: string; href: string }; cards: ExploreCard[] }

const q = (base: string, p: Record<string, string>) => { const [path, q0 = ''] = base.split('?'); const u = new URLSearchParams(q0); for (const [k, v] of Object.entries(p)) u.set(k, v); return `${path}?${u}`; };
/** The seed id of a featured generation is server-side (featuredSeed.ts); the web adds ?recreate= from the job list. Here: where its flow opens. */
const DIRECT = threeDRoute('plan-a-shot');
/** A featured output's card opens it as Recreate: its prompt, model, settings and input frames in the bar (featured.ts). */
const recreateOf = (key: string, extra?: Record<string, string>) => featuredRecreateHref(key, extra);

/** The hero: Direct a Shot, Mockup → Render side by side, on our own takes. */
export const EXPLORE_HERO = {
  eyebrow: 'Direct a Shot · Stage → Mockup → Render',
  title: 'Block it in 3D. Film it for real.',
  line: 'Stage the scene and move the camera in your browser. You get a real film back, sound included. Free on your computer.',
  takes: ['ltx-christmas-take', 'ltx-street-take'],
  cta: { label: 'Direct a shot', href: DIRECT },
  facts: [['LTX-2.5 22B', 'with Layout to Render'], ['Free', 'on your computer'], ['5 s · 24 fps', 'picture and sound together']] as [string, string][],
};

export const EXPLORE_ROWS: ExploreRow[] = [
  { id: 'video', title: 'Make a video', line: 'Text or a photo into a clip with sound. Free on your computer, or priced up front in the cloud.', more: { label: 'All video models', href: VIDEO_PAGE },
    cards: [
      { id: 'ltx-multishot', title: 'Three shots, one prompt', line: 'Name the cuts and the lines of dialogue. It cuts and voices them for you.', href: recreateOf('ltx-rain-city') ?? q(VIDEO_PAGE, { model: 'ltx-2.5-22b' }), toolId: 'h3-video', modelKey: 'ltx-2.5-22b', featured: 'ltx-rain-city', badge: 'Free' },
      { id: 'ltx-t2v', title: 'Text to video with sound', line: 'Describe the shot and the sound. Waves, gulls and wind arrive with the picture.', href: recreateOf('ltx-lighthouse') ?? q(VIDEO_PAGE, { model: 'ltx-2.5-22b' }), toolId: 'h3-video', modelKey: 'ltx-2.5-22b', featured: 'ltx-lighthouse', badge: 'Free' },
      { id: 'cloud-seedance-mini', title: 'Seedance 2.0 Mini', line: 'Picture and sound in one go.', href: q(VIDEO_PAGE, { model: 'seedance-2.0-mini' }), toolId: 'h3-video', modelKey: 'seedance-2.0-mini', art: 'cloud', badge: 'Cloud' },
      { id: 'cloud-kling', title: 'Kling 3.0 Omni', line: 'Text, first and last frame, or up to seven reference images.', href: q(VIDEO_PAGE, { model: 'kling-v3' }), toolId: 'h3-video', modelKey: 'kling-v3', art: 'cloud', badge: 'Cloud' },
    ] },
  { id: 'direct', title: 'Direct a Shot', line: 'Stage → Mockup → Render. The mockup is free and takes seconds; the render keeps its camera and layout.', more: { label: 'Open Direct a Shot', href: DIRECT },
    cards: [
      { id: 'take-xmas', title: 'Diorama world', line: 'A slow push-in on a toy village, mocked up in your browser, then filmed for real.', href: recreateOf('ltx-christmas-take') ?? q(DIRECT, { preset: 'diorama', realPrompt: XMAS_VIDEO_PROMPT }), toolId: 'make-it-real', modelKey: 'ltx-2.5-22b', featured: 'ltx-christmas-take', badge: 'Free' },
      { id: 'take-street', title: 'Walk-by', line: 'A side-tracking shot along a street. The person and camera path come from the mockup.', href: recreateOf('ltx-street-take') ?? q(DIRECT, { preset: 'walk-by' }), toolId: 'make-it-real', modelKey: 'ltx-2.5-22b', featured: 'ltx-street-take', badge: 'Free' },
      { id: 'stage-new', title: 'Stage your own', line: 'Pick a set, choose the move, speed and length, or bring your own scene file.', href: DIRECT, toolId: 'plan-a-shot', art: 'stage', priceText: 'Free · in your browser' },
    ] },
  { id: 'swap', title: 'Swap a character', line: 'Keep the motion, camera and sound of a clip; change who or what is in it.',
    cards: [
      { id: 'motion-control', title: 'Motion Control', line: 'Your character performs the moves of any clip.', href: q(videoWorkflowHref('motion-control'), { model: 'kling-v3-omni-edit' }), toolId: 'motion-transfer', modelKey: 'kling-v3-omni-edit', art: 'swap', badge: 'Cloud' },
      { id: 'object-swap', title: 'Object Swap', line: 'Replace a product, person or place in your clip.', href: q(videoWorkflowHref('object-swap'), { model: 'kling-v3-omni-edit' }), toolId: 'object-swap', modelKey: 'kling-v3-omni-edit', art: 'object', badge: 'Cloud' },
      { id: 'swap-local', title: 'Swap on your computer', line: 'The same swap, free on your computer.', href: q(videoWorkflowHref('motion-control'), { model: 'wan-2.2-animate-14b' }), toolId: 'motion-transfer', modelKey: 'wan-2.2-animate-14b', art: 'swap', badge: 'Free' },
    ] },
  { id: 'angle', title: 'New angle', line: 'The same moment, filmed from somewhere else. Turn and tilt a virtual camera over your take.',
    cards: [
      { id: 'crossview', title: 'Pick the angle', line: 'Turn a dial to pick the angle, and the same moment is filmed again from there.', href: q(videoWorkflowHref('reshoot'), { model: 'minimax-h3-crossview' }), toolId: 'reshoot', modelKey: 'minimax-h3-crossview', art: 'angle', badge: 'New' },
      { id: 'reshoot-ltx', title: 'Re-shoot', line: 'Up to four new angles from one take, each on its own time range.', href: q(videoWorkflowHref('reshoot'), { model: 'ltx-2-19b' }), toolId: 'reshoot', modelKey: 'ltx-2-19b', art: 'reshoot' },
      { id: 'camera-moves', title: 'Camera Moves', line: 'One still into a shot with a dolly, orbit or crane move.', href: q(videoWorkflowHref('camera-moves'), { model: 'ltx-2-19b' }), toolId: 'camera', modelKey: 'ltx-2-19b', art: 'move', badge: 'Free' },
    ] },
  { id: 'loop', title: 'Loop & Morph', line: 'Two tricks, free on your computer: a clip that plays forever, and one scene growing into another.',
    cards: [
      { id: 'loop', title: 'Loop', line: 'A start frame and Loop on: the clip ends exactly where it began, so it plays forever.', href: recreateOf('ltx-village-loop', { loop: '1' }) ?? q(VIDEO_PAGE, { model: 'ltx-2.5-22b' }), toolId: 'h3-video', modelKey: 'ltx-2.5-22b', featured: 'ltx-village-loop', badge: 'New' },
      { id: 'morph', title: 'Morph', line: 'A start and an end image; the first scene turns into the second.', href: recreateOf('ltx-morph') ?? q(videoWorkflowHref('transitions'), { model: 'ltx-2.5-22b', preset: 'morph' }), toolId: 'app-transition', modelKey: 'ltx-2.5-22b', featured: 'ltx-morph', badge: 'New' },
    ] },
  { id: 'fx', title: 'Exploded view & effects', line: 'Bring a photo to life with an effect. Exploded view is free on your computer.', more: { label: 'Every effect', href: videoWorkflowHref('photo-fx') },
    cards: [
      { id: 'exploded-view', title: 'Exploded view', line: 'Your object comes apart into a neat, ordered exploded view. Name it in the prompt.', href: q(videoWorkflowHref('photo-fx'), { preset: 'exploded-view', model: 'ltx-2.5-22b' }), toolId: 'photo-fx', modelKey: 'ltx-2.5-22b', art: 'fx', badge: 'New' },
      { id: 'photo-fx', title: 'Photo FX', line: '32 effects for a photo: levitate, shatter, freeze, portal and more.', href: q(videoWorkflowHref('photo-fx'), { model: 'minimax-h3' }), toolId: 'photo-fx', modelKey: 'minimax-h3', art: 'photo' },
      { id: 'orbit-shot', title: 'Orbit Shot', line: 'The camera circles your subject, from one photo.', href: q(videoWorkflowHref('orbit-shot'), { model: 'minimax-h3' }), toolId: 'app-orbit-shot', modelKey: 'minimax-h3', art: 'turntable' },
    ] },
  { id: 'viral', title: 'Viral templates', line: 'Fill in the blanks, get a ready-to-post clip with dialogue, cuts and sound. Also under Look → Viral in Video.',
    cards: VIRAL_TEMPLATES.map((t) => ({ id: `vt-${t.id}`, title: t.name, line: t.line, href: q(VIDEO_PAGE, { model: VIRAL_MODEL_KEY, prompt: fillTemplate(t), template: t.id }), toolId: 'h3-video', modelKey: VIRAL_MODEL_KEY, art: 'viral' as FlowArt, badge: t.settings.aspect })) },
  { id: 'sound', title: 'Make music & make it talk', line: 'Songs, voices and sound effects, most of them free on your computer. Then give a portrait the words.',
    cards: [
      /* YuE2: installed and run here (job d967cfc3). ACE-Step 1.5 is listed too but needs setting up first, so it is not the card's "Free" pick */
      { id: 'music', title: 'Music', line: 'A song or a track from a prompt, with lyrics if you like.', href: q(audioRoute('music'), { model: 'yue2' }), toolId: 'audio', modelKey: 'yue2', art: 'music', badge: 'Free' },
      { id: 'voiceover', title: 'Voiceover', line: 'A voice reads your script, over a clip or on its own.', href: q(audioRoute('voiceover'), { model: 'chatterbox' }), toolId: 'voice', modelKey: 'chatterbox', art: 'voice', badge: 'Free' },
      { id: 'lip-sync', title: 'Make it talk', line: 'A photo and a voice clip become a talking clip, lips in sync. Free on your computer.', href: q(videoWorkflowHref('lip-sync'), { model: 'ltx-2.5-talking-photo' }), toolId: 'voice', modelKey: 'ltx-2.5-talking-photo', art: 'talk', badge: 'New' },
    ] },
  { id: '3d', title: '3D', line: 'One picture into a textured model you can spin, download and film.', more: { label: 'Open 3D', href: THREE_D_PAGE },
    cards: [
      { id: 'image-to-3d', title: 'Image to 3D', line: 'One picture in, a 3D model out, ready to spin and download.', href: q(threeDRoute('image-to-3d'), { model: 'cloud-tripo-31' }), toolId: 'three-d', modelKey: 'cloud-tripo-31', art: 'cube', badge: 'Cloud' },
      { id: 'turntable', title: 'Turntable video', line: 'Your model spins once on camera, recorded in your browser.', href: threeDRoute('turntable'), toolId: 'three-d-turntable', art: 'turntable', priceText: 'Free · in your browser' },
    ] },
  { id: 'agents', title: 'Agents', line: 'Let your AI assistant make things for you. It shows the price first and waits for your Go.',
    cards: [
      { id: 'mcp', title: 'Connect your assistant', line: 'Every workflow in one link: it prices, makes, checks and fetches your results.', href: '/mcp', toolId: '', art: 'agent', priceText: 'Free · your own AI' },
      { id: 'canvas', title: 'Canvas with your AI', line: 'An infinite board your assistant can lay results out on.', href: '/canvas', toolId: '', art: 'canvas', priceText: 'Free' },
      { id: 'skills', title: 'Skills for Claude', line: 'Seventeen ready-made skills ship with the app: UGC ads, product photo packs, viral formats, drama series, release kits and more.', href: '/mcp', toolId: '', art: 'skills', priceText: 'Free' },
    ] },
];
/** Every card on Explore (hero takes excluded), in page order. */
export const EXPLORE_CARDS: ExploreCard[] = EXPLORE_ROWS.flatMap((r) => r.cards);
