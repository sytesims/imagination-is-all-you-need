/**
 * The three ways to run (first-run setup and Settings → Connections share this copy; MODEL-ROUTE-SPEC §2.5). One source for each card's
 * name, line and meta: RunSetup shows them as cards, Connections uses them as its section heads. Place names come from the shared run-on
 * labels (server/src/shared/modelIds.ts), never new literals. Ids are what PUT /api/setup stores: gpu | comfy | direct. No sample choice
 * since 2026-10-29 (the user's option a): with nothing connected, Generate asks to connect a Comfy key or your ComfyUI.
 */
import { LOCAL_LABEL, RUN_ON_LABELS } from '../../../server/src/shared/modelIds';
import { deviceWhere } from './eta';

export type RunChoice = 'gpu' | 'comfy' | 'direct';
/** The choices the real setup already covers (GET /api/setup → setup: cloud | local | both | none): the sheet starts on them, tagged Connected. */
export const choicesForSetup = (s: unknown): RunChoice[] => (s === 'both' ? ['comfy', 'gpu'] : s === 'cloud' ? ['comfy'] : s === 'local' ? ['gpu'] : []);
export const CONNECTED_TAG = 'Connected';
export type RunChoiceCopy = { id: RunChoice; title: string; line: string; meta: string; tag?: string };

export const RUN_SETUP_TITLE = 'Welcome to Imagination';
export const RUN_SETUP_TAGLINE = 'If you can imagine it, you can make it here.';
export const RUN_SETUP_QUESTION = 'How would you like to start?';
export const RUN_SETUP_NOTE = 'Choose one or more connections. You see the price before every run.';
export const RUN_SETUP_GO = 'Save and continue';
export const RUN_SETUP_SKIP = 'Explore examples';

/** "on your computer" (eta.ts deviceWhere). */
const where = deviceWhere();

export const RUN_CHOICES: readonly RunChoiceCopy[] = [
  { id: 'gpu', title: LOCAL_LABEL, line: `Free and private, ${where}.`, meta: 'We’ll look for ComfyUI' },
  { id: 'comfy', title: RUN_ON_LABELS['comfy-cloud'], line: 'One key, most models: open workflows plus partners like Kling and Veo.', meta: 'Billed to your Comfy account' },
  { id: 'direct', title: 'Your own keys', line: 'Official lab keys (Black Forest Labs, MiniMax, LTX), plus fal and Replicate.', meta: 'Each bills you directly' },
];
export const runChoice = (id: RunChoice): RunChoiceCopy => RUN_CHOICES.find(c => c.id === id)!;
export const isRunChoice = (v: unknown): v is RunChoice => typeof v === 'string' && RUN_CHOICES.some(c => c.id === v);
