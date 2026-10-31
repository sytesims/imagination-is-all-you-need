/**
 * "AI for e-commerce: from one product photo to a full launch" (2026-10-24): the pop-up book at /learn/ai-ecommerce.
 * Pure data (no DOM, no React), so the page and server/test/learn-ecom-book.test.ts share it. Our own writing.
 *
 * Every "Try it" opens a tool page of this app with the example prompt in the bar (usePrefill reads ?prompt=) and a model
 * picked (?model=). Nothing runs until the person presses Generate there. Local models first (free on your own machine);
 * a cloud model only where local can't do the job well, with its price on the page.
 * Pictures on the pages come from the art slots in ecomArt.ts (placeholders until real images made in the app are dropped in;
 * the list of what to make is docs/learn/ecom-book-art-list.md).
 */
import { VIDEO_PAGE } from '../../../server/src/shared/videoWorkflows';
import type { ArtSlot } from './ecomArt';

export const BOOK_PATH = '/learn/ai-ecommerce';
export const BOOK_TITLE = 'AI for e-commerce';
export const BOOK_SUBTITLE = 'From one product photo to a full launch';

/** A link into the app with the prompt (and model) filled in. */
export interface TryLink { label: string; /** the tool page, maybe with its own query (?workflow=…) */ base: string; model?: string; /** which of the chapter's prompts goes in (default 0) */ prompt?: number }
export interface Hotspot { id: string; label: string; text: string }
export type ShotView = 'overview' | 'close' | 'low' | 'side' | 'top';
export interface TourShot { view: ShotView; /** look at this hotspot (else the whole diagram) */ at?: string; caption: string; seconds: number }
export type Diagram = 'photo' | 'studio' | 'lifestyle' | 'consistency' | 'poster' | 'video' | 'sound' | 'launch';
export interface Chapter {
  id: string; n: number; title: string; kicker: string;
  lesson: string[]; prompts: string[]; why: string;
  cost: { local: string; cloud: string; time: string };
  tryIt: TryLink; more?: { label: string; to: string }[];
  diagram: Diagram; figure: string; hotspots: Hotspot[]; tour: TourShot[]; art: ArtSlot[];
}

export const CHAPTERS: Chapter[] = [
  {
    id: 'one-photo', n: 1, kicker: 'Start here', title: 'One good product photo', diagram: 'photo', figure: 'A clean photo is half the work',
    lesson: [
      'Every picture in this book grows from one photo of your product. The better that photo, the less the AI has to guess.',
      'Shoot by a window or under one soft lamp, at the height of the product, on a plain sheet of paper. Fill the frame and keep the label sharp.',
      'No photo yet? Describe the product and let a local model draw a clean reference you can work from.',
    ],
    prompts: [
      'Studio product photo of a frosted glass serum bottle with a matte black dropper cap, centred on seamless white paper, soft light from the left, gentle shadow, sharp label, 50 mm lens',
      'Clean catalogue photo of a white canvas sneaker, three-quarter view from the side, plain light grey background, even soft light, crisp stitching',
      'Simple packshot of a kraft paper coffee bag with a folded top, front view, warm white background, soft daylight, no props',
    ],
    why: 'Plain words about light, angle and background give the model the same checklist a photographer uses.',
    cost: { local: 'Free on your computer', cloud: 'About $0.005 in the cloud', time: 'About 20 s' },
    tryIt: { label: 'Make a clean reference', base: '/tools/create-image', model: 'z-image-turbo' },
    more: [{ label: 'Upscale your photo (free on your computer)', to: '/tools/create-image?workflow=upscale&model=real-esrgan' }],
    hotspots: [
      { id: 'light', label: 'Soft light', text: 'One big soft light from the side shapes the product without hard glare. A window or a lamp behind thin paper works.' },
      { id: 'angle', label: 'Eye-level angle', text: 'Shoot at the height of the product. Looking down makes bottles look short; three-quarter views show depth.' },
      { id: 'backdrop', label: 'Plain background', text: 'A sweep of paper with no clutter. It makes cut-outs, edits and new scenes much easier later.' },
      { id: 'upscale', label: 'Upscale', text: 'Phone photo too small? Upscale it free on your computer before you edit, so details hold up in big layouts.' },
    ],
    tour: [
      { view: 'overview', caption: 'One product, one light, one plain background.', seconds: 3.2 },
      { view: 'side', at: 'light', caption: 'Close up: the soft light comes in from the side.', seconds: 3.4 },
      { view: 'low', at: 'angle', caption: 'Low side view: the camera sits at product height.', seconds: 3.4 },
      { view: 'close', at: 'backdrop', caption: 'The paper sweep hides the horizon line.', seconds: 3.2 },
    ],
    art: ['ch1-reference'],
  },
  {
    id: 'studio', n: 2, kicker: 'Clean shots', title: 'Studio shots', diagram: 'studio', figure: 'Three backdrops, one product',
    lesson: [
      'Shops need the same product on white for the listing, on colour for ads and on a stand for a hero banner.',
      'Name the backdrop, the surface and the light. Keep the product words the same each time so it stays the same product.',
      'Have a real photo? Use Edit Image to change only the background and keep your product exactly as it is.',
    ],
    prompts: [
      'The same serum bottle standing on a round white plinth, soft peach backdrop, single soft key light, subtle floor reflection, minimal premium look',
      'Serum bottle on pure white, soft contact shadow under the base, bright even light, e-commerce listing photo, square',
      'Serum bottle on a terracotta orange paper backdrop with a hard sunlight shadow cast at an angle, bold summer ad look',
    ],
    why: 'Backdrop, surface and light are three separate words. Change one at a time and you learn what each does.',
    cost: { local: 'Free on your computer', cloud: 'About $0.005 per image in the cloud', time: 'About 20 s each' },
    tryIt: { label: 'Try a studio shot', base: '/tools/create-image', model: 'z-image-turbo' },
    more: [{ label: 'Change the background of your photo (local)', to: '/tools/create-image?mode=edit&model=flux-2-klein-4b' }],
    hotspots: [
      { id: 'white', label: 'White sweep', text: 'Marketplaces often ask for a pure white background. Ask for a soft contact shadow so the product doesn’t float.' },
      { id: 'colour', label: 'Colour backdrop', text: 'A coloured paper backdrop sells a mood. Pick a colour that echoes the label.' },
      { id: 'plinth', label: 'Plinth', text: 'A round stand lifts the product and reads as premium. Ask for a matching colour so it feels designed.' },
    ],
    tour: [
      { view: 'overview', caption: 'Three stages: white, colour, plinth.', seconds: 3 },
      { view: 'close', at: 'white', caption: 'White for the listing.', seconds: 3 },
      { view: 'side', at: 'colour', caption: 'Colour for the ad.', seconds: 3 },
      { view: 'low', at: 'plinth', caption: 'Low angle: the plinth makes it a hero.', seconds: 3.4 },
    ],
    art: ['ch2-plinth', 'ch2-white'],
  },
  {
    id: 'lifestyle', n: 3, kicker: 'In the real world', title: 'Lifestyle scenes', diagram: 'lifestyle', figure: 'Put the product where it lives',
    lesson: [
      'People buy what they can picture at home. A lifestyle shot shows the product in use: on a kitchen counter, in a bag, in a hand.',
      'Say where the light comes from in the scene and keep it on the same side as in your product photo, so the two match.',
      'Add your photo in Edit Image and describe the new scene. Models on your computer do it for free. For a tricky label, a cloud edit shows its price before you run it.',
    ],
    prompts: [
      'Put this bottle on a pale oak kitchen counter next to a small potted herb and a linen towel, morning window light from the left, shallow depth of field',
      'This sneaker on a city pavement after rain, low camera near the ground, soft overcast light, reflections in puddles, lifestyle ad',
      'This coffee bag on a wooden breakfast table with a ceramic mug and croissant, warm sunlight, cosy weekend mood',
    ],
    why: 'Matching light direction is what makes a placed product look photographed, not pasted.',
    cost: { local: 'Free with FLUX.2 [klein] 4B', cloud: 'About $0.07 with Nano Banana 2.1', time: 'About 40 s' },
    tryIt: { label: 'Place your product', base: '/tools/create-image?mode=edit', model: 'flux-2-klein-4b' },
    more: [{ label: 'Or use the Product Shot workflow', to: '/tools/create-image?workflow=product-shot' }],
    hotspots: [
      { id: 'window', label: 'Window light', text: 'Name the light source in the scene. Here it is a window on the left, the same side as in the product photo.' },
      { id: 'counter', label: 'The surface', text: 'A counter, a table, a shelf: one surface the product clearly stands on keeps scale believable.' },
      { id: 'props', label: 'A few props', text: 'One or two props tell the story. Too many, and the product gets lost.' },
      { id: 'person', label: 'On a model', text: 'Virtual Try-On and Person Swap put clothes and accessories on a person. Ask for the pose and the crop.' },
    ],
    tour: [
      { view: 'overview', caption: 'A kitchen scene built around one bottle.', seconds: 3 },
      { view: 'side', at: 'window', caption: 'The window sets the light direction.', seconds: 3.4 },
      { view: 'close', at: 'counter', caption: 'Close up: the bottle stands on the counter, not over it.', seconds: 3.4 },
      { view: 'low', at: 'person', caption: 'A model shows size and use.', seconds: 3.2 },
    ],
    art: ['ch3-kitchen'],
  },
  {
    id: 'same-look', n: 4, kicker: 'Brand look', title: 'Same look every time', diagram: 'consistency', figure: 'One recipe, many pictures',
    lesson: [
      'A shop looks trustworthy when every picture feels like the same brand. The trick is a recipe you reuse.',
      'Write your style words once (light, colours, lens, mood) and paste them at the end of every prompt. Keep the product words fixed.',
      'Same seed keeps the randomness the same, so a small change to the words makes a small change to the picture. Save it as a Look to reuse later.',
    ],
    prompts: [
      'Serum bottle on a sage green stone slab — brand style: soft morning light, muted sage and cream palette, 85 mm lens, calm and clean',
      'Serum bottle beside a folded cream towel — brand style: soft morning light, muted sage and cream palette, 85 mm lens, calm and clean',
      'Serum bottle held in an open palm — brand style: soft morning light, muted sage and cream palette, 85 mm lens, calm and clean',
    ],
    why: 'The model reads the same style words the same way, so a fixed ending works like a brand guide.',
    cost: { local: 'Free on your computer', cloud: 'Priced per image before you generate', time: 'About 30 s each' },
    tryIt: { label: 'Start your brand recipe', base: '/tools/create-image', model: 'qwen-image-2.1-turbo' },
    more: [{ label: 'Character sheet for a mascot (local)', to: '/tools/create-image?workflow=character-sheet' }],
    hotspots: [
      { id: 'recipe', label: 'Style recipe', text: 'The same ending on every prompt: light, palette, lens, mood. Save it as a Look so it is one click next time.' },
      { id: 'seed', label: 'Same seed', text: 'Turn on Same seed in the bar. Change a word, keep the seed, and only that part of the picture moves.' },
      { id: 'reference', label: 'Reference photo', text: 'Add your product photo as a reference so its shape and label stay the same in every scene.' },
    ],
    tour: [
      { view: 'overview', caption: 'One recipe feeds three pictures.', seconds: 3 },
      { view: 'close', at: 'recipe', caption: 'The recipe card: the words you reuse.', seconds: 3.2 },
      { view: 'side', at: 'seed', caption: 'The seed die: same seed, small changes.', seconds: 3.2 },
      { view: 'top', at: 'reference', caption: 'From above: every frame starts from the reference.', seconds: 3.2 },
    ],
    art: ['ch4-slab', 'ch4-towel', 'ch4-palm'],
  },
  {
    id: 'poster', n: 5, kicker: 'Words on pictures', title: 'Ad poster with text', diagram: 'poster', figure: 'Plan the space before the words',
    lesson: [
      'An ad needs room for a headline, the product and a price. Ask for the empty space first; the layout matters more than the style.',
      'Put the exact words in quotes and keep them short. Say where they go: top third, bottom left, on a sticker.',
      'Qwen Image writes clean text and runs free on your computer. For a tricky layout, GPT Image 2.5 Flare in the cloud costs about $0.03 an image.',
    ],
    prompts: [
      'Vertical ad poster: serum bottle on the right on a peach backdrop, big bold headline "GLOW, BOTTLED" in the top left, small text "20% off this week" on an orange sticker bottom left, clean modern layout',
      'Square social post: white sneaker floating over a soft blue gradient, headline "LIGHT ON YOUR FEET" across the top in heavy sans serif, lots of empty space',
      'Banner 3:1: coffee bag on the left, warm beige background, headline "MORNING, SORTED" in the middle, small "Free shipping" line under it',
    ],
    why: 'Quoted words are copied letter by letter; describing where they sit stops them landing on the product.',
    cost: { local: 'Free with Qwen Image 2.1', cloud: 'About $0.03 with GPT Image 2.5 Flare', time: 'About 45 s' },
    tryIt: { label: 'Lay out a poster', base: '/tools/create-image', model: 'qwen-image-2.1' },
    more: [{ label: 'Cloud option: GPT Image 2.5 Flare (~$0.03)', to: '/tools/create-image?model=gpt-image-2.5-flare' }],
    hotspots: [
      { id: 'headline', label: 'Headline', text: 'Short words in quotes, with a place: “top left, big bold sans serif”. Three or four words read best.' },
      { id: 'space', label: 'Empty space', text: 'Ask for “lots of empty space” on one side. It keeps the text off the product.' },
      { id: 'price', label: 'Price sticker', text: 'Offers on a sticker or badge read at a glance. Keep the number big and the rest small.' },
    ],
    tour: [
      { view: 'overview', caption: 'Headline, product, price: three zones.', seconds: 3 },
      { view: 'close', at: 'headline', caption: 'The headline lives in the empty top corner.', seconds: 3.2 },
      { view: 'side', at: 'price', caption: 'The price tag catches the eye last.', seconds: 3.2 },
      { view: 'low', at: 'space', caption: 'Low angle: space keeps the product clear.', seconds: 3 },
    ],
    art: ['ch5-poster'],
  },
  {
    id: 'video', n: 6, kicker: 'Motion', title: 'Short product video', diagram: 'video', figure: 'Direct the move, then render it',
    lesson: [
      'A five-second clip with one slow camera move beats a long busy one. Pick one move: push in, orbit, or slide past.',
      'Direct a Shot lets you stage the camera in simple 3D for free, so you know the move works before you spend anything.',
      'Then turn your best still into video. Start short and low resolution; video is the one step that can cost real money in the cloud.',
    ],
    prompts: [
      'Slow orbit around the serum bottle on its plinth, soft studio light, the label turns to face the camera at the end, calm premium mood',
      'Camera slowly pushes in on the sneaker on wet pavement, a few raindrops fall, reflections ripple, cinematic',
      'Steam rises from a mug beside the coffee bag, the camera slides gently left to right across the table, morning light',
    ],
    why: 'One named move and one small action give the model a clear plan, so it doesn’t invent extra motion.',
    cost: { local: 'Direct a Shot is free in your browser', cloud: 'About $0.08 per second (6 s ≈ $0.48)', time: 'A few minutes per clip' },
    tryIt: { label: 'Write the shot', base: VIDEO_PAGE, model: 'minimax-h3' },
    more: [{ label: 'Direct it free in 3D first', to: '/tools/3d?workflow=plan-a-shot' }],
    hotspots: [
      { id: 'move', label: 'One camera move', text: 'Orbit, push in or slide. One move per clip, said in plain words.' },
      { id: 'turntable', label: 'Turntable', text: 'A slow turn shows every side of the product. Ask for the label to face the camera at the end.' },
      { id: 'plan', label: 'Direct a Shot', text: 'Stage the camera in simple 3D for free, record it, and use it as your guide.' },
      { id: 'frames', label: 'Short first', text: 'Try 5 seconds at low resolution first. Make the long, sharp version only once the move looks right.' },
    ],
    tour: [
      { view: 'overview', caption: 'A camera on a curved track around the product.', seconds: 3 },
      { view: 'side', at: 'move', caption: 'One move: a slow orbit.', seconds: 3.4 },
      { view: 'low', at: 'turntable', caption: 'Low angle: the turntable turns the label to us.', seconds: 3.4 },
      { view: 'close', at: 'frames', caption: 'Short clips first, then the final one.', seconds: 3 },
    ],
    art: ['ch6-still'],
  },
  {
    id: 'sound', n: 7, kicker: 'Sound', title: 'Sound and music bed', diagram: 'sound', figure: 'A mood you can hear',
    lesson: [
      'Sound makes a clip feel finished. A soft music bed under a product video keeps people watching.',
      'Describe the mood, the instruments and the tempo, and ask for no vocals if words will be on screen.',
      'YuE2 makes music free on your computer. Need a voice? Voiceover reads a short script over your clip.',
    ],
    prompts: [
      'Calm lo-fi beat with soft piano and brushed drums, warm and clean, 80 bpm, no vocals, for a skincare ad',
      'Upbeat funky bass and claps, bright and playful, 110 bpm, no vocals, for a sneaker launch clip',
      'Gentle acoustic guitar with light shaker, cosy morning feel, 90 bpm, instrumental, for a coffee brand video',
    ],
    why: 'Mood plus instruments plus tempo is enough for a model to land close on the first try.',
    cost: { local: 'Free with YuE2', cloud: 'Priced before you generate in the cloud', time: 'A minute or two' },
    tryIt: { label: 'Make a music bed', base: '/tools/audio?workflow=music', model: 'yue2' },
    more: [{ label: 'Add a voiceover', to: '/tools/audio?workflow=voiceover' }],
    hotspots: [
      { id: 'mood', label: 'Mood', text: 'Calm, playful, cosy: one word for the feeling comes first.' },
      { id: 'tempo', label: 'Tempo', text: 'Beats per minute set the pace. 80 feels relaxed, 110 feels lively.' },
      { id: 'phone', label: 'Plays on phones', text: 'Most people watch on a phone. Keep the music simple so it still sounds good on a small speaker.' },
    ],
    tour: [
      { view: 'overview', caption: 'A speaker, a wave and a phone.', seconds: 3 },
      { view: 'close', at: 'mood', caption: 'The notes carry the mood.', seconds: 3 },
      { view: 'side', at: 'tempo', caption: 'The wave beats at the tempo you ask for.', seconds: 3.2 },
      { view: 'low', at: 'phone', caption: 'Test it on a phone speaker.', seconds: 3 },
    ],
    art: ['ch7-cover'],
  },
  {
    id: 'launch', n: 8, kicker: 'Put it together', title: 'Launch kit, A/B tests and cost', diagram: 'launch', figure: 'From photo to cart',
    lesson: [
      'A launch kit is a small set: one listing photo, two ad versions, one short video and one music bed. That is enough to start selling.',
      'Make two versions of each ad (A and B) that differ in one thing only, like the backdrop colour. Post both and keep the winner.',
      'Lay everything out on a Canvas board, and check Spend to see what each picture cost. Made on your computer, the whole kit can cost nothing.',
    ],
    prompts: [
      'Version A: serum bottle on a soft peach backdrop with a round plinth, headline space top left, premium skincare ad, square',
      'Version B: serum bottle on a soft sage backdrop with a round plinth, headline space top left, premium skincare ad, square',
      'Flat lay of a product launch kit on a desk: phone showing a shop page, a gift box, a price tag and colour swatches, top-down, soft light',
    ],
    why: 'Changing one thing between A and B tells you which thing made the difference.',
    cost: { local: 'Whole kit free on your computer', cloud: 'Usually under $2 for a mixed kit', time: 'An afternoon' },
    tryIt: { label: 'Make version A', base: '/tools/create-image', model: 'z-image-turbo' },
    more: [{ label: 'Lay it out on Canvas', to: '/canvas' }, { label: 'See what it cost', to: '/spend' }],
    hotspots: [
      { id: 'ab', label: 'A / B', text: 'Two versions, one difference. Post both, keep the one people click.' },
      { id: 'canvas', label: 'Canvas board', text: 'Put the photo, ads, video and music side by side on a Canvas board to see the whole launch.' },
      { id: 'spend', label: 'Spend', text: 'Spend shows what every picture cost. Runs on your computer show as free.' },
      { id: 'cart', label: 'To the cart', text: 'Every picture has one job: get a shopper one step closer to the cart.' },
    ],
    tour: [
      { view: 'overview', caption: 'Photo, ads, phone, cart: the whole launch.', seconds: 3 },
      { view: 'close', at: 'ab', caption: 'Version A and version B.', seconds: 3.2 },
      { view: 'side', at: 'spend', caption: 'The coins: what it cost.', seconds: 3 },
      { view: 'low', at: 'cart', caption: 'Low angle: everything leads to the cart.', seconds: 3.4 },
    ],
    art: ['ch8-a', 'ch8-b'],
  },
];

/** The page the Try-it link opens, with the prompt and model in the query (pure; tested). */
export function tryHref(ch: Chapter, link: TryLink = ch.tryIt): string {
  const [path, q0 = ''] = link.base.split('?'); const q = new URLSearchParams(q0);
  if (link.model) q.set('model', link.model);
  q.set('prompt', ch.prompts[link.prompt ?? 0] ?? ch.prompts[0]);
  return `${path}?${q.toString()}`;
}
/** The same link with another of the chapter's prompts. */
export const tryHrefWith = (ch: Chapter, i: number): string => tryHref(ch, { ...ch.tryIt, prompt: i });
/** The tool name a Try-it button names ("in Create Image"). */
export function tryToolName(base: string): string {
  if (base.startsWith(VIDEO_PAGE)) return 'Video';
  if (base.startsWith('/tools/audio')) return 'Audio';
  if (base.includes('workflow=product-shot')) return 'Product Shot';
  if (base.includes('mode=edit')) return 'Edit Image';
  return 'Create Image';
}
