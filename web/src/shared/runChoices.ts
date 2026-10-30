/**
 * The three ways to run (first-run setup and Settings → Connections share this copy; MODEL-ROUTE-SPEC §2.5). One source for each card's
 * name, line and meta: RunSetup shows them as cards, Connections uses them as its section heads. Place names come from the shared run-on
 * labels (server/src/shared/modelIds.ts), never new literals. Ids are what PUT /api/setup stores: gpu | comfy | direct. No sample choice
 * since 2026-10-29 (the user's option a): with nothing connected, Generate asks to connect a Comfy key or your ComfyUI.
 */
import { LOCAL_LABEL, RUN_ON_LABELS } from '../../../server/src/shared/modelIds';
import { deviceWhere } from './eta';

export type RunChoice = 'gpu' | 'comfy' | 'direct';
/** The choices the real setup already covers (GET /api/setup → setup: cloud | local | both | none): the sheet starts on them picked. */
export const choicesForSetup = (s: unknown): RunChoice[] => (s === 'both' ? ['comfy', 'gpu'] : s === 'cloud' ? ['comfy'] : s === 'local' ? ['gpu'] : []);
/** "Your own keys": the providers the sheet asks for, in order (ids as in /api/settings/providers). */
export const DIRECT_KEYS: readonly [string, string][] = [['bfl', 'Black Forest Labs'], ['minimax', 'MiniMax'], ['ltx', 'LTX'], ['openai', 'OpenAI'], ['google', 'Google Gemini API'], ['byteplus', 'BytePlus'], ['fal', 'fal'], ['replicate', 'Replicate']];

/** A card's badge: what works right now, never just what was saved. No badge when the choice isn't set up. */
export type ChoiceStatus = 'connected' | 'checking' | 'unreachable' | 'rejected' | 'missing';
export const STATUS_TAG: Record<ChoiceStatus, string> = { connected: 'Connected', checking: 'Checking…', unreachable: 'Not reachable', rejected: 'Key not accepted', missing: 'Key missing' };
/** GET /api/accounts → keyCheck per provider: ok (the provider read the account), rejected (it refused the key), offline (no answer just now). Absent = the app can't tell, so a saved key counts. */
export type KeyCheck = 'ok' | 'rejected' | 'offline';
export interface SetupFacts {
  /** GET /api/setup: the saved answer, provider ids with a real key, the "Use local ComfyUI" switch and the real setup kind */
  choices: readonly string[]; keys: readonly string[]; useLocal: boolean; setup: unknown;
  /** the sheet's own ComfyUI check (POST /api/local/comfy/test): null until it answers */
  comfyReach: boolean | null;
  /** keyCheck by provider from GET /api/accounts; null until it answers */
  keyChecks: Record<string, KeyCheck | undefined> | null;
}
export function choiceStatus(id: RunChoice, f: SetupFacts): ChoiceStatus | null {
  if (id === 'gpu') {
    const saved = f.choices.includes('gpu') || f.useLocal; const found = choicesForSetup(f.setup).includes('gpu');
    if (f.comfyReach === true) return saved || found ? 'connected' : null; // found on its own (not saved) shows only once it really answers
    return saved ? (f.comfyReach === false ? 'unreachable' : 'checking') : null;
  }
  const ids = id === 'comfy' ? ['comfy'] : DIRECT_KEYS.map(([k]) => k);
  const have = ids.filter(k => f.keys.includes(k));
  if (!have.length) return f.choices.includes(id) ? 'missing' : null;
  if (!f.keyChecks) return 'checking';
  const checks = have.map(k => f.keyChecks![k] ?? 'ok');
  return checks.includes('ok') ? 'connected' : checks.includes('offline') ? 'unreachable' : 'rejected';
}
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
