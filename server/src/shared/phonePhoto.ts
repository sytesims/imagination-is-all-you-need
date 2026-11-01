/**
 * Phone Photo (2026-11-01): a casual phone photo of an AI-made person, the look of everyday social posts. Isomorphic data + the prompt.
 * Two chip rows (who holds the phone, the light) and your words for who is in it; each model gets its own wording (shared/promptPatterns.ts
 * ugc-photo). Our own sentences. Made-up people only: the app's consent rules for real faces are unchanged.
 */
import { fillPattern, familyOfProvider, captionSubject } from './promptPatterns.js';

export interface PhoneOption { value: string; label: string; /** the sentence the prompt gets */ prompt: string }
/** Who holds the phone. */
export const PHONE_HOLDERS: PhoneOption[] = [
  { value: 'selfie', label: 'Selfie', prompt: "Taken with the phone's front camera at arm's length, the arm reaching toward the lens" },
  { value: 'mirror', label: 'Mirror', prompt: 'Taken in a mirror, the phone visible in their hand' },
  { value: 'propped', label: 'Propped', prompt: 'The phone propped on the counter, chest-up framing' },
  { value: 'friend', label: 'Friend', prompt: 'Taken by a friend with a phone from about two metres away, at chest height' },
];
/** The light in the room. */
export const PHONE_LIGHTS: PhoneOption[] = [
  { value: 'window', label: 'Window', prompt: 'Daylight from a window on one side, a warm lamp on the other' },
  { value: 'overhead', label: 'Overhead', prompt: 'Flat overhead indoor light' },
  { value: 'car', label: 'Car', prompt: 'Soft overcast light through the windscreen' },
  { value: 'flash', label: 'Flash', prompt: "The phone's flash at night, a dark background" },
  { value: 'outdoor', label: 'Outdoor', prompt: 'Bright shade on a sunny day' },
];
export const PHONE_DEFAULTS = { holder: 'selfie', light: 'window' } as const;
const pick = (list: PhoneOption[], v: unknown, d: string) => (list.find((o) => o.value === v) ?? list.find((o) => o.value === d)!).prompt;
const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/** The prompt for one phone photo on this engine. who = your words ("a fictional woman in her thirties laughing in a café"). */
export function phonePhotoPrompt(x: { who: string; holder?: string; light?: string; action?: string; setting?: string; detail?: string }, provider?: string | null): string {
  const fam = familyOfProvider(provider); const flux = fam === 'flux';
  const who = String(x.who ?? '').trim().replace(/[.;,\s]+$/, '') || 'a person';
  const holder = pick(PHONE_HOLDERS, x.holder, PHONE_DEFAULTS.holder), light = pick(PHONE_LIGHTS, x.light, PHONE_DEFAULTS.light);
  // FLUX reads one subject-first line: the subject with a capital, the chips as phrases after a comma
  return fillPattern('ugc-photo', fam, { who: flux ? captionSubject(who, 'A person') : who, action: x.action, setting: x.setting, detail: x.detail,
    holder: flux ? lowerFirst(holder) : holder, light: flux ? lowerFirst(light) : light });
}
