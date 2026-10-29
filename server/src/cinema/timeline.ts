/**
 * Director prompt grammar (per spec: type # for a movement; the move starts where the tag sits, several moves run in order).
 *   '#dolly-in 0-2s #orbit 2-5s'  → timed camera timeline
 *   '#crane-up'                   → untimed: starts where the tag sits, fills to the next move / end
 * Each move maps onto our camera presets: LTX-2 camera LoRAs where one exists, else Wan 2.2 Fun Camera, else a prompt phrase.
 */
export interface CameraMove { id: string; label: string; phrase: string; ltx?: string; funCamera?: string }
export const CAMERA_MOVES: CameraMove[] = [
  { id: 'dolly-in', label: 'Dolly in', phrase: 'camera dollies in', ltx: 'ltx-dolly-in', funCamera: 'Zoom In' },
  { id: 'dolly-out', label: 'Dolly out', phrase: 'camera dollies out', ltx: 'ltx-dolly-out', funCamera: 'Zoom Out' },
  { id: 'dolly-left', label: 'Dolly left', phrase: 'camera trucks left', ltx: 'ltx-dolly-left', funCamera: 'Pan Left' },
  { id: 'dolly-right', label: 'Dolly right', phrase: 'camera trucks right', ltx: 'ltx-dolly-right', funCamera: 'Pan Right' },
  { id: 'crane-up', label: 'Crane up', phrase: 'camera cranes up', ltx: 'ltx-jib-up', funCamera: 'Pan Up' },
  { id: 'crane-down', label: 'Crane down', phrase: 'camera cranes down', ltx: 'ltx-jib-down', funCamera: 'Pan Down' },
  { id: 'static', label: 'Static', phrase: 'locked-off static camera', ltx: 'ltx-static', funCamera: 'Static' },
  { id: 'orbit', label: 'Orbit', phrase: 'camera orbits around the subject', funCamera: 'Pan Left' },
  // Orbit Shot types (ids from cameraCatalog.ts). No orbit LoRA on disk for LTX-2, so these carry the move by prompt phrase (+ the nearest Wan Fun Camera pose).
  { id: 'orbit-l', label: 'Arc left', phrase: 'camera arcs to the left around the subject, keeping it centred', funCamera: 'Pan Left' },
  { id: 'orbit-r', label: 'Arc right', phrase: 'camera arcs to the right around the subject, keeping it centred', funCamera: 'Pan Right' },
  { id: 'orbit-360', label: 'Full orbit', phrase: 'camera circles 360 degrees around the subject', funCamera: 'Pan Left' },
  { id: 'spin-3d', label: 'Object spin', phrase: 'subject rotates on its axis as if on a turntable, camera fixed', funCamera: 'Static' },
  { id: 'time-freeze', label: 'Frozen-time orbit', phrase: 'time freezes while the camera orbits around the frozen subject', funCamera: 'Pan Left' },
  { id: 'handheld', label: 'Handheld', phrase: 'handheld camera with subtle shake' },
  { id: 'whip-pan', label: 'Whip pan', phrase: 'fast whip pan' },
  { id: 'push-in', label: 'Slow push-in', phrase: 'slow push-in', ltx: 'ltx-dolly-in', funCamera: 'Zoom In' },
  { id: 'tilt-up', label: 'Tilt up', phrase: 'camera tilts up', funCamera: 'Pan Up' },
  { id: 'tilt-down', label: 'Tilt down', phrase: 'camera tilts down', funCamera: 'Pan Down' },
  { id: 'fpv', label: 'FPV fly-through', phrase: 'FPV drone-style fly-through' },
];
const ALIASES: Record<string, string> = { zoom: 'push-in', 'zoom-in': 'push-in', 'zoom-out': 'dolly-out', 'jib-up': 'crane-up', 'jib-down': 'crane-down', 'truck-left': 'dolly-left', 'truck-right': 'dolly-right', locked: 'static', 'arc-left': 'orbit-l', 'arc-right': 'orbit-r', 'orbit-left': 'orbit-l', 'orbit-right': 'orbit-r', 'orbit-full': 'orbit-360', 'full-orbit': 'orbit-360', turntable: 'spin-3d', 'freeze-orbit': 'time-freeze' };
export interface TimelineSeg { move: string; label: string; start: number; end: number; phrase: string; ltx: string | null; funCamera: string | null; timed: boolean }
export interface TimelineIssue { code: 'unknown_move' | 'bad_range' | 'overlap' | 'out_of_range'; tag: string; message: string }

const TAG_SRC = String.raw`#([a-z][a-z0-9-]*)(?:\s+(\d+(?:\.\d+)?)\s*(?:s)?\s*[-–]\s*(\d+(?:\.\d+)?)\s*s)?`;
const strip = (t: string) => t.replace(new RegExp(TAG_SRC, 'gi'), '');

export function parseTimeline(prompt: string, duration: number): { segments: TimelineSeg[]; issues: TimelineIssue[]; cleanPrompt: string } {
  const issues: TimelineIssue[] = []; const raw: (Omit<TimelineSeg, 'end'> & { end: number | null; pos: number })[] = [];
  let m: RegExpExecArray | null; const TAG = new RegExp(TAG_SRC, 'gi');
  const textLen = Math.max(1, strip(prompt).trim().length);
  while ((m = TAG.exec(prompt))) {
    const id = ALIASES[m[1].toLowerCase()] ?? m[1].toLowerCase(); const mv = CAMERA_MOVES.find((c) => c.id === id);
    if (!mv) { issues.push({ code: 'unknown_move', tag: m[0], message: `Unknown camera move "#${m[1]}". Try: ${CAMERA_MOVES.map((c) => '#' + c.id).join(', ')}.` }); continue; }
    const timed = m[2] != null;
    const start = timed ? Number(m[2]) : Math.round((strip(prompt.slice(0, m.index)).trim().length / textLen) * duration * 10) / 10;
    const end = timed ? Number(m[3]) : null;
    if (timed && end! <= start) { issues.push({ code: 'bad_range', tag: m[0], message: `${m[0].trim()}: end must be after start.` }); continue; }
    if (timed && end! > duration + 1e-6) issues.push({ code: 'out_of_range', tag: m[0], message: `${m[0].trim()}: goes past the ${duration}s clip; trimmed.` });
    raw.push({ move: mv.id, label: mv.label, start, end, phrase: mv.phrase, ltx: mv.ltx ?? null, funCamera: mv.funCamera ?? null, timed, pos: m.index });
  }
  raw.sort((a, b) => a.start - b.start || a.pos - b.pos);
  const segments: TimelineSeg[] = raw.map((r, i) => {
    const next = raw[i + 1]?.start ?? duration;
    const end = Math.min(duration, r.end ?? next);
    if (r.timed && raw[i + 1] && raw[i + 1].start < end - 1e-6) issues.push({ code: 'overlap', tag: `#${r.move}`, message: `#${r.move} overlaps #${raw[i + 1].move}; the later move starts at ${raw[i + 1].start}s.` });
    const { pos, ...rest } = r; return { ...rest, start: Math.max(0, r.start), end: Math.max(r.start + 0.1, Math.min(end, next)) };
  });
  return { segments, issues, cleanPrompt: prompt.replace(new RegExp(TAG_SRC, 'gi'), ' ').replace(/\s+/g, ' ').trim() };
}
/** Prompt phrase for conditioning, e.g. "0-2s: camera dollies in; then 2-5s: camera orbits around the subject". */
export const timelinePhrase = (s: TimelineSeg[]) => s.map((x) => `${x.start}-${x.end}s: ${x.phrase}`).join('; then ');

/** Emotion wheel (spec: neutral + 8 emotions × 3 intensity levels). Our own wording. */
export const EMOTIONS = ['neutral', 'joy', 'trust', 'fear', 'surprise', 'sadness', 'disgust', 'anger', 'anticipation'] as const;
export const INTENSITIES = ['subtle', 'clear', 'intense'] as const;
const EMO_WORDS: Record<string, [string, string, string]> = {
  joy: ['a faint smile', 'visibly happy', 'beaming with joy'], trust: ['relaxed and open', 'warm and reassuring', 'deeply trusting, tender'],
  fear: ['slightly uneasy', 'frightened', 'terrified'], surprise: ['mildly curious', 'surprised', 'stunned, wide-eyed'],
  sadness: ['wistful', 'sad', 'grief-stricken, tearful'], disgust: ['faintly displeased', 'disgusted', 'revolted'],
  anger: ['irritated', 'angry', 'furious'], anticipation: ['attentive', 'eager', 'on the edge, breathless'],
};
export function emotionPhrase(emotion: string, intensity: string): string {
  if (emotion === 'neutral') return 'neutral expression, natural delivery';
  const i = Math.max(0, INTENSITIES.indexOf(intensity as any)); return `performance: ${EMO_WORDS[emotion][i]} (${emotion}, ${INTENSITIES[i]})`;
}
/** Conditioning scalar for backends with an emotion/strength input (0 neutral … 1 intense). */
export const emotionStrength = (emotion: string, intensity: string) => emotion === 'neutral' ? 0 : [0.35, 0.65, 0.95][Math.max(0, INTENSITIES.indexOf(intensity as any))];

/** 4 "Auto" panels: deterministic variants with different shot + camera choices (seeded). */
const SHOTS = ['wide establishing shot', 'medium shot', 'close-up', 'low-angle hero shot', 'over-the-shoulder shot', 'extreme close-up', 'high-angle shot'];
const AUTO_MOVES = ['push-in', 'orbit', 'dolly-left', 'crane-up', 'handheld', 'static', 'dolly-out', 'tilt-up'];
export interface AutoPanel { panel: number; label: string; shot: string; segments: TimelineSeg[]; seed: number }
export function autoPanels(seed: number, duration: number, userSegs: TimelineSeg[]): AutoPanel[] {
  const out: AutoPanel[] = [];
  for (let p = 0; p < 4; p++) {
    const shot = SHOTS[(seed + p * 3) % SHOTS.length];
    const segs = userSegs.length && p === 0 ? userSegs : (() => {
      const a = CAMERA_MOVES.find((c) => c.id === AUTO_MOVES[(seed + p * 2) % AUTO_MOVES.length])!; const b = CAMERA_MOVES.find((c) => c.id === AUTO_MOVES[(seed + p * 2 + 3) % AUTO_MOVES.length])!;
      const mid = Math.round(duration * 0.5 * 10) / 10;
      return [a, b].map((mv, i) => ({ move: mv.id, label: mv.label, start: i ? mid : 0, end: i ? duration : mid, phrase: mv.phrase, ltx: mv.ltx ?? null, funCamera: mv.funCamera ?? null, timed: false }));
    })();
    out.push({ panel: p + 1, label: `Auto ${p + 1} · ${shot} · ${segs.map((s) => s.label).join(' → ')}`, shot, segments: segs, seed: (seed + p * 7919) % 2_147_483_647 });
  }
  return out;
}
