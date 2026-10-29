/** SoundToggle's words and state (shared/SoundToggle.tsx), kept pure so they can be tested without a DOM. `waiting`: the viewer wants
 *  sound but the browser refused it before any gesture, so the clip plays muted and the button says so. */
export type SoundState = 'off' | 'on' | 'waiting';
export function soundToggleText(on: boolean, waiting = false): { state: SoundState; pressed: boolean; aria: string; tip: string; label: string } {
  const state: SoundState = waiting ? 'waiting' : on ? 'on' : 'off';
  return { state, pressed: state === 'on', aria: state === 'on' ? 'Sound on' : 'Sound off',
    tip: state === 'waiting' ? 'Sound starts with your first click or key' : state === 'on' ? 'Sound on: click to mute' : 'Sound off: click for sound',
    label: state === 'waiting' ? 'Click for sound' : state === 'on' ? 'Sound on' : 'Sound off' };
}
