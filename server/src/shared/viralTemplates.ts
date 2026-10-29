/**
 * Viral templates (2026-10-26): four prompt recipes for the Video tab, each a fill-in prompt with 1–3 slots ({fruit}, {object}, {place})
 * and the settings it works best with. No new model and nothing to download: they are written for local LTX-2.5 22B (free, makes its
 * own synced sound, follows quoted dialogue and multi-shot cuts in one prompt) and read fine on any other video model.
 * The prompt text is our own. LTX-2.5 prompting facts used (docs.comfy.org/tutorials/video/ltx/ltx-2-5): one flowing paragraph with
 * shot, action and camera; describe the sounds and dialogue you want, the model makes them in sync; 2–4 named cuts make a multi-shot clip.
 * Where they show: the Video bar's Look picker ("Viral" tab) and the Video Examples shelf / gallery ("Viral template" cards, ?template=).
 * Picking one fills the prompt with the slot values, selects the first slot, and applies the settings (VideoStudio). Isomorphic: no
 * server-only imports. Test: server/test/viral-templates.test.ts.
 */

export interface TemplateSlot { /** the {key} in the prompt */ key: string; /** what the field is called in the bar */ label: string; /** the value it starts with */ value: string; /** a few other values, shown as the field's hint */ ideas?: string[] }
export interface ViralTemplate {
  id: string; name: string; /** one line under the name */ line: string;
  /** the prompt with {key} slots */ prompt: string; slots: TemplateSlot[];
  /** recommended settings: model key (LTX-2.5 22B local), aspect, seconds, sound */ settings: { modelKey: string; aspect: '16:9' | '9:16'; seconds: number; sound: true };
  /** one short tip */ tip: string; /** search words in the Look picker */ keywords: string;
}

/** The model every template is written for: LTX-2.5 22B on this computer (comfy-ltx25-video). */
export const VIRAL_MODEL_KEY = 'ltx-2.5-22b';
export const VIRAL_ENGINE = 'comfy-ltx25-video';

export const VIRAL_TEMPLATES: ViralTemplate[] = [
  {
    id: 'fruit-drama', name: 'Fruit drama', line: 'Shiny cartoon fruit act out a soap-opera moment, with voices and a cliffhanger.',
    prompt: 'A glossy 3D cartoon soap opera on a sunny kitchen counter. Shot 1: close-up of a {hero} with big expressive eyes, trembling, saying "I trusted you. I trusted all of you." '
      + 'Cut to shot 2: a {rival} turns slowly toward the camera, smirking, and says "You were never part of the bowl." Dramatic violin sting. '
      + 'Cut to shot 3: wide shot, the {hero} gasps as a shadow falls over the counter, a sharp orchestral hit, then silence. Soft studio lighting, saturated colours, smooth shiny skins.',
    slots: [
      { key: 'hero', label: 'Hero', value: 'lemon', ideas: ['strawberry', 'avocado', 'banana'] },
      { key: 'rival', label: 'Rival', value: 'grapefruit', ideas: ['pineapple', 'coconut', 'kiwi'] },
    ],
    settings: { modelKey: VIRAL_MODEL_KEY, aspect: '9:16', seconds: 5, sound: true },
    tip: 'Put each line of dialogue in quotes: LTX-2.5 voices it and moves the mouths. Keep it to 2–3 cuts.',
    keywords: 'viral fruit drama soap opera talking objects dialogue multi-shot cliffhanger cartoon',
  },
  {
    id: 'glass-asmr', name: 'Glass ASMR', line: 'A knife slices a fruit made of glass, with crisp crunch and clink sounds.',
    prompt: 'Extreme macro close-up of a sharp chef’s knife slowly slicing through a {fruit} made entirely of clear crystal glass on a dark wooden cutting board. '
      + 'The glass splits into clean glittering slices that tip over and catch the light. Static camera, soft top light, shallow depth of field, black background. '
      + 'Sound: a crisp crystalline crunch as the blade goes in, tiny clinks as the slices land, quiet room tone, no music.',
    slots: [{ key: 'fruit', label: 'Fruit', value: 'peach', ideas: ['kiwi', 'apple', 'dragon fruit'] }],
    settings: { modelKey: VIRAL_MODEL_KEY, aspect: '9:16', seconds: 4, sound: true },
    tip: 'One slow cut works best. Name the sounds you want, and add “no music” to keep it pure ASMR.',
    keywords: 'viral asmr glass crystal knife cutting satisfying macro crunch sound',
  },
  {
    id: 'miniature-world', name: 'Miniature world', line: 'Tiny workers build or cook on a giant everyday object.',
    prompt: 'Macro photography of a giant {object} on a kitchen table, with a busy crew of tiny workers, each smaller than a fingertip, {task} across it. '
      + 'Little scaffolds, ladders and wheelbarrows, workers in orange hard hats carrying parts and waving to each other. '
      + 'Shallow depth of field with a soft blurry background, warm morning light, the camera drifts slowly sideways. '
      + 'Sound: tiny hammer taps, a small motor whirring, faint chatter and footsteps, gentle room ambience.',
    slots: [
      { key: 'object', label: 'Object', value: 'slice of toast', ideas: ['keyboard', 'birthday cake', 'sneaker'] },
      { key: 'task', label: 'Task', value: 'spreading butter like a road crew laying asphalt', ideas: ['repairing the keys', 'piping the icing', 'stitching the laces'] },
    ],
    settings: { modelKey: VIRAL_MODEL_KEY, aspect: '16:9', seconds: 5, sound: true },
    tip: 'Say “macro photography” and “shallow depth of field” rather than “tilt-shift”; fewer, bigger workers keep detail.',
    keywords: 'viral miniature tiny workers small world macro diorama construction cooking',
  },
  {
    id: 'cctv-found-footage', name: 'CCTV found footage', line: 'A fixed night-time security camera catches something uncanny.',
    prompt: 'Grainy black-and-white security camera footage at night, a fixed high-angle wide view of {place}. Nothing moves for a moment, a moth flickers past the lens. '
      + 'Then {event}. Low resolution, slight fisheye, soft infrared glow, compression noise. Static camera, no cuts. '
      + 'Sound: a low electrical hum and distant wind, a single creak, then a sudden faint knock, and the hum cuts out.',
    slots: [
      { key: 'place', label: 'Place', value: 'a suburban front porch with a doormat and a potted plant', ideas: ['an empty office corridor', 'a parking garage', 'a corner shop aisle'] },
      { key: 'event', label: 'Event', value: 'the porch light turns off by itself and a tall thin shadow slides across the door', ideas: ['a shopping cart rolls slowly into frame on its own', 'every door in the hallway opens at once'] },
    ],
    settings: { modelKey: VIRAL_MODEL_KEY, aspect: '16:9', seconds: 5, sound: true },
    tip: 'Let the sound carry the scare and keep the event small. Add a timestamp later as a text overlay, not in the prompt.',
    keywords: 'viral cctv security camera doorbell found footage horror night scary halloween',
  },
];

export const viralTemplate = (id: string | null | undefined): ViralTemplate | undefined => VIRAL_TEMPLATES.find((t) => t.id === id);

/** The prompt with every slot filled ({key} → value). A slot with no value keeps its default. */
export function fillTemplate(t: ViralTemplate, values: Record<string, string> = {}): string {
  return t.prompt.replace(/\{(\w+)\}/g, (all, k: string) => { const s = t.slots.find((x) => x.key === k); return s ? (values[k]?.trim() || s.value) : all; });
}
/** The slot keys in the order they first appear in the prompt. */
export const slotOrder = (t: ViralTemplate): string[] => [...new Set([...t.prompt.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))];
/** Where the first slot's value sits in the filled prompt, for selecting it in the prompt field. */
export function firstSlotRange(t: ViralTemplate, values: Record<string, string> = {}): [number, number] | null {
  const k = slotOrder(t)[0]; if (!k) return null; const at = t.prompt.indexOf(`{${k}}`);
  const before = fillTemplate({ ...t, prompt: t.prompt.slice(0, at) }, values); const v = values[k]?.trim() || t.slots.find((s) => s.key === k)!.value;
  return [before.length, before.length + v.length];
}
/**
 * One slot changed in a prompt the user may have edited since: the old value is swapped for the new one everywhere it appears. When the old
 * value is gone (the user rewrote that part) the prompt is left as it is and the result says so.
 */
export function replaceSlot(prompt: string, oldValue: string, newValue: string): { prompt: string; ok: boolean } {
  if (!oldValue || !prompt.includes(oldValue)) return { prompt, ok: false };
  return { prompt: prompt.split(oldValue).join(newValue), ok: true };
}

/**
 * What picking a template sets. `soundOk`: the model in the bar makes sound. A model the user picked stays, unless it makes silent clips: then
 * the plan suggests LTX-2.5 22B local (`suggestEngine`) instead of switching silently. `fresh`: opened from a card (?template=) with no model of
 * its own, so the template's model is used straight away.
 */
export function templatePlan(t: ViralTemplate, o: { soundOk: boolean; fresh?: boolean; engines: string[] }): { switchTo: string | null; suggestEngine: string | null } {
  const has = o.engines.includes(VIRAL_ENGINE);
  if (o.fresh && has) return { switchTo: VIRAL_ENGINE, suggestEngine: null };
  return { switchTo: null, suggestEngine: !o.soundOk && has ? VIRAL_ENGINE : null };
}
