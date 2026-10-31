/**
 * The three ways to run (first-run setup and Settings → Connections share this copy; MODEL-ROUTE-SPEC §2.5). One source for each card's
 * name, line and meta: Connections uses them as its section heads; the Welcome (ui/setup) has its own shorter card lines. Place names come from the shared run-on
 * labels (server/src/shared/modelIds.ts), never new literals. Ids are what PUT /api/setup stores: gpu | comfy | direct. No sample choice
 * since 2026-10-29 (the user's option a): with nothing connected, Generate asks to connect a Comfy key or your ComfyUI.
 */
import { LOCAL_LABEL, RUN_ON_LABELS } from '../../../server/src/shared/modelIds';
import { deviceWhere } from './eta';

export type RunChoice = 'gpu' | 'comfy' | 'direct';
/** "Your own keys": the providers the sheet asks for, in order (ids as in /api/settings/providers). */
export const DIRECT_KEYS: readonly [string, string][] = [['bfl', 'Black Forest Labs'], ['minimax', 'MiniMax'], ['ltx', 'LTX'], ['openai', 'OpenAI'], ['google', 'Google Gemini API'], ['byteplus', 'BytePlus'], ['fal', 'fal'], ['replicate', 'Replicate']];

export type RunChoiceCopy = { id: RunChoice; title: string; line: string; meta: string; tag?: string };

export const RUN_SETUP_TITLE = 'Welcome to Imagination';
export const RUN_SETUP_TAGLINE = 'If you can imagine it, you can make it here.';

/** "on your computer" (eta.ts deviceWhere). */
const where = deviceWhere();

export const RUN_CHOICES: readonly RunChoiceCopy[] = [
  { id: 'gpu', title: LOCAL_LABEL, line: `Free and private, ${where}.`, meta: 'We’ll look for ComfyUI' },
  { id: 'comfy', title: RUN_ON_LABELS['comfy-cloud'], line: 'One key, most models: open workflows plus partners like Kling and Veo.', meta: 'Billed to your Comfy account' },
  { id: 'direct', title: 'Your own keys', line: 'Official lab keys (Black Forest Labs, MiniMax, LTX), plus fal and Replicate.', meta: 'Each bills you directly' },
];
export const runChoice = (id: RunChoice): RunChoiceCopy => RUN_CHOICES.find(c => c.id === id)!;
