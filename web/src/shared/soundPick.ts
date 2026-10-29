/** The sound director's pure rules (shared/soundDirector.ts), kept free of React and the DOM so they can be tested (server/test/sound-director.test.ts). */
export const SOUND_KEY = 'ohf.explore.sound';
/** the per-section keys this choice replaced (migrated once, then removed) */
export const OLD_SOUND_KEYS = ['ohf.explore.heroSound', 'ohf.explore.stillSound', 'ohf.explore.koiSound', 'ohf.explore.swapSound', 'ohf.explore.layersSound', 'ohf.explore.filmSound', 'ohf.explore.x3dSound'];
/** crossfade length (a full fade; a partial one takes its share) */ export const FADE_MS = 400;
/** how long the view must hold still before the sound moves (fast scrolling doesn't flick through every clip) */ export const SETTLE_MS = 140;
/** a clip must show at least this share of itself (or of the screen, for a clip taller than it) to sound */ export const MIN_SHARE = 0.35;

/** The saved choice; with no saved choice, the old per-section keys decide (any on → on; else any off → off; none → on). */
export function readSoundChoice(get: (k: string) => string | null): { on: boolean; migrated: boolean } {
  const v = get(SOUND_KEY); if (v === '1' || v === '0') return { on: v === '1', migrated: false };
  const old = OLD_SOUND_KEYS.map(get);
  if (old.includes('1')) return { on: true, migrated: true };
  if (old.includes('0')) return { on: false, migrated: true };
  return { on: true, migrated: false };
}

export interface SoundCandidate { id: string; /** has a sound track and can play it now */ sound: boolean; /** 0–1: how much of it shows */ share: number;
  /** 0–1: its middle's distance from the screen's middle (in screen heights) */ off: number; /** a film the viewer pressed Play on */ explicit: boolean; playing: boolean; /** registration order */ order: number }
/** Temporary opt-in attention (playing and sufficiently visible); otherwise the existing explicit / preferred / most-in-view policy. */
export function pickSound(cs: SoundCandidate[], prefer?: string | null, attention?: string | null): string | null {
  // Opt-in, temporary hover/keyboard intent. Never promotes a poster, paused or offscreen clip.
  const attended = attention && cs.find(c => c.id === attention && c.sound && c.playing && c.share >= MIN_SHARE);
  if (attended) return attended.id;
  const ex = cs.filter((c) => c.explicit && c.sound && c.playing && c.share > 0).sort((a, b) => b.order - a.order);
  if (ex.length) return ex[0].id;
  const ok = cs.filter((c) => c.sound && c.share >= MIN_SHARE);
  if (!ok.length) return null;
  if (prefer) { const p = ok.find((c) => c.id === prefer); if (p) return p.id; }
  /* shares within 0.1 count as equal: then the one nearer the middle wins */
  return ok.sort((a, b) => (Math.abs(b.share - a.share) > 0.1 ? b.share - a.share : a.off - b.off || a.order - b.order))[0].id;
}
