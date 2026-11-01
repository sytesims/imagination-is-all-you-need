/**
 * Workflow goals (2026-11-01, the user's pick "T1"): ONE list of what you want to do, shared by the Workflows page (its rail and sections) and,
 * later, every workflow menu (Image, Video, Audio, 3D). A goal says what you want done, never the tech behind it.
 *  - WF_GOALS: the seven goals in page order, each with its label and one plain line. The labels are the same everywhere they show.
 *  - GOAL_OF: every workflow (WF_ENTRIES id) and every multi-step chain (`chain:<id>`) in exactly one goal. It is kept apart from WF_ENTRIES on
 *    purpose: a branch that adds a workflow adds one line here, and the test names any workflow without a goal.
 * "Start here" on the page (and "For you" in the menus) is a hand-picked list, not a goal.
 * Isomorphic, data only (no imports). Test: server/test/workflow-goals.test.ts.
 */
export type WfGoal = 'create' | 'shop' | 'ads' | 'people' | 'film' | 'music' | 'fix';

export const WF_GOALS: { id: WfGoal; label: string; line: string }[] = [
  { id: 'create', label: 'Make something new', line: 'Pictures, clips and 3D models from a few words.' },
  { id: 'shop', label: 'Products & shop', line: 'Product photos that sell, try-ons and spins.' },
  { id: 'ads', label: 'Ads & social', line: 'Ads ready to post, in any shape or language.' },
  { id: 'people', label: 'People & voices', line: 'Characters that stay themselves, faces that talk.' },
  { id: 'film', label: 'Stories & film', line: 'Plan the shot, film the script, keep it rolling.' },
  { id: 'music', label: 'Music & sound', line: 'Songs, sound effects and a score for every clip.' },
  { id: 'fix', label: 'Fix & finish', line: 'Sharpen, relight and clean up what you already have.' },
];

const G = (goal: WfGoal, ids: string[]): [string, WfGoal][] => ids.map((id) => [id, goal]);
/** Every workflow and chain, in one goal each. */
export const GOAL_OF: Record<string, WfGoal> = Object.fromEntries([
  ...G('create', ['v-create', 'v-loop', 'v-morph', 'v-transitions', 'v-photo-fx', 'i-create-image', 'i-camera-lens', 'd-image-to-3d', 'd-turntable', 'chain:picture-3d']),
  ...G('shop', ['i-product-shot', 'i-try-on', 'i-material-swap', 'i-remove-bg', 'i-camera-angles', 'v-orbit-shot', 'v-exploded-view']),
  ...G('ads', ['i-ad-pack', 'v-ugc-ad', 'v-reframe', 'a-translate', 'v-photos-to-reel', 'chain:product-ad', 'chain:product-ad-multishot']),
  ...G('people', ['i-character-sheet', 'i-face-swap', 'i-person-swap', 'v-motion-control', 'v-object-swap', 'v-lip-sync', 'a-voiceover', 'a-change-voice', 'chain:presenter']),
  ...G('film', ['v-direct-a-shot', 'v-reshoot', 'v-new-angle', 'v-camera-moves', 'v-extend', 'v-restyle', 'v-anime-restyle', 'fx-day-to-night', 'fx-rain', 'fx-flood',
    'chain:sketch-film', 'chain:kdrama', 'chain:long-take']),
  ...G('music', ['a-music', 'a-cover', 'a-sfx', 'a-soundtrack-music', 'a-soundtrack-sound', 'chain:music-video']),
  /* Split into layers sits here (not in Ads): it takes a picture you have apart, like the other fixes */
  ...G('fix', ['i-edit-image', 'i-relight', 'i-brush-edit', 'i-expand', 'i-erase', 'i-image-layers', 'i-upscale', 'v-upscale', 'v-draft-upscale', 'v-fps-boost', 'v-sdr-hdr',
    'v-prompt-edit', 'v-finish', 'v-remove-bg', 'v-cutout', 'v-depth-map', 'fx-vanish', 'fx-alpha-matte', 'fx-restore', 'fx-remove-object', 'fx-remove-text', 'fx-extend-frame']),
]);
/** "Start here" on the Workflows page, "For you" in the menus (2026-11-01, the user's pick "A", beginner first): the first things people try,
 *  one job per card, most of them free on your computer. Entry ids (shared/workflowCatalog.ts WF_ENTRIES), in order. */
export const WF_START_HERE: string[] = ['i-create-image', 'i-edit-image', 'i-product-shot', 'v-create', 'v-lip-sync', 'a-voiceover', 'a-music', 'i-upscale'];
/** The goal of a workflow or chain id (`chain:<id>` for a chain); undefined for an id it doesn't know. */
export const goalOf = (id: string): WfGoal | undefined => GOAL_OF[id];
export const goalById = (g: string) => WF_GOALS.find((x) => x.id === g);
export const isGoal = (g: string): g is WfGoal => WF_GOALS.some((x) => x.id === g);
