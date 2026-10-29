/**
 * The dancing bean's brain (pure logic, no DOM, so tests import it): poses for a small 2-D rig, a library of keyframed moves (ballet, groove and
 * one set per style pack: rap nods, love-song sways, headbangs, EDM bounces, lo-fi nods, conducting, peaceful sways; packs in beanStyle.ts), smooth blending between them, a light "music sense" built from the Web Audio analyser (loudness, bass vs treble,
 * onsets, tempo, rising energy, drops) and a choreographer that picks the next move on the beat.
 *
 * Rig conventions (see beanDancer.ts): angles in degrees. Arms and legs are mirrored, so one number means the same thing on both sides:
 *  - sh / hip: how far the limb swings out and up from hanging straight down (0 = down, 90 = straight out to the side, 170 = overhead);
 *  - el: the elbow keeps curling the same way (positive rounds the arm, as in ballet's rounded arms);
 *  - knee: negative tucks the shin back toward the middle (a turned-out plié or a passé).
 *  torso / head / tilt: clockwise lean on screen. y: down is positive (a plié sinks, a jump is negative). spin: turn about the vertical axis
 *  (drawn as a horizontal squeeze, 0..360). squash: vertical stretch (1 = none). nod: the head dips forward (a nod or a bow).
 */

import { PACKS, type Pack, type PackId } from './beanStyle';

export type Pose = {
  x: number; y: number; tilt: number; spin: number; squash: number;
  torso: number; head: number; nod: number;
  lSh: number; lEl: number; rSh: number; rEl: number;
  lHip: number; lKnee: number; rHip: number; rKnee: number;
};
export const POSE_KEYS = ['x', 'y', 'tilt', 'spin', 'squash', 'torso', 'head', 'nod', 'lSh', 'lEl', 'rSh', 'rEl', 'lHip', 'lKnee', 'rHip', 'rKnee'] as const satisfies readonly (keyof Pose)[];

/** Standing at rest: arms soft at the sides, heels together with a little turn-out. */
export const REST: Pose = { x: 0, y: 0, tilt: 0, spin: 0, squash: 1, torso: 0, head: 0, nod: 0, lSh: 12, lEl: 10, rSh: 12, rEl: 10, lHip: 4, lKnee: -4, rHip: 4, rKnee: -4 };
export const pose = (p: Partial<Pose>): Pose => ({ ...REST, ...p });

export type Face = 'happy' | 'smile' | 'surprised' | 'sleepy' | 'wink' | 'dreamy' | 'calm' | 'shout' | 'cool';
export type MoveName = 'breathe' | 'sway' | 'portDeBras' | 'plie' | 'releve' | 'arabesque' | 'pirouette' | 'saute' | 'sideStep' | 'headBob' | 'flourish' | 'bow' | 'listen' | 'startle' | 'spin'
  | 'rapNod' | 'shoulderBounce' | 'rapGesture' | 'slowSway' | 'heartHands' | 'headbang' | 'airGuitar' | 'rockJump' | 'bounce' | 'armsUp' | 'chillNod' | 'chillSway' | 'conduct' | 'softBreathe' | 'floatSway' | 'armFloat'
  /* little moments outside the dance: a hello on play, a cheer when a track is ready, a wave on the welcome screen, a warm-up while it generates */
  | 'hello' | 'cheer' | 'wave' | 'warmUp';
export type Key = { t: number; p: Pose };
export type Move = { name: MoveName; beats: number; keys: Key[]; face: Face; /** Stays on its last key until something else is chosen (the bow). */ hold?: boolean };

const ARMS_LOW = { lSh: 18, lEl: 28, rSh: 18, rEl: 28 };          // en bas: rounded, low
const ARMS_FRONT = { lSh: 62, lEl: 34, rSh: 62, rEl: 34 };        // en avant: rounded, chest height
const ARMS_SECOND = { lSh: 82, lEl: 14, rSh: 82, rEl: 14 };       // à la seconde: open to the sides
const ARMS_FIFTH = { lSh: 146, lEl: 16, rSh: 146, rEl: 16 };      // en haut: lifted overhead (opened to a soft V so the hands clear the big head)
const PLIE = { y: 8, lHip: 28, lKnee: -56, rHip: 28, rKnee: -56 }; // knees out over the toes
const LEGS_TIGHT = { lHip: 2, lKnee: 0, rHip: 2, rKnee: 0 };

const k = (t: number, p: Partial<Pose>): Key => ({ t, p: pose(p) });
/* style packs (beanStyle.ts) */
const LOOSE = { lSh: 22, lEl: 64, rSh: 22, rEl: 64 };                  // rap: loose bent arms at the sides
const BOUNCE_LEGS = { lHip: 8, lKnee: -14, rHip: 8, rKnee: -14 };
const HEART = { lSh: 32, lEl: -140, rSh: 32, rEl: -140 };              // both hands on the chest
const L_CHEST = { lSh: 30, lEl: -100 }, R_CHEST = { rSh: 30, rEl: -100 };
const ROCK_LEGS = { lHip: 14, lKnee: -12, rHip: 14, rKnee: -12 };
const GUITAR = { lSh: 64, lEl: 18, rSh: 22, ...ROCK_LEGS, y: 1.5, torso: -3 }; // left hand on the neck, right hand strums at the hip
const CHILL = { lSh: 14, lEl: 30, rSh: 14, rEl: 30 };
const SOFT = { lSh: 16, lEl: 22, rSh: 16, rEl: 22 };                  // peaceful: arms soft and a little open

/** The move library. Every move starts and ends near a neutral stance, so any move can follow any other; `beats` is its length on the beat clock. */
export const MOVES: Record<MoveName, Move> = {
  breathe: { name: 'breathe', beats: 4, face: 'smile', keys: [k(0, {}), k(0.5, { squash: 1.018, lSh: 15, rSh: 15, head: 2 }), k(1, {})] },
  sway: { name: 'sway', beats: 4, face: 'smile', keys: [
    k(0, { ...ARMS_LOW }), k(0.25, { ...ARMS_LOW, tilt: -4, torso: -4, head: 7, lSh: 34, lEl: 30, x: -1.5 }), k(0.5, { ...ARMS_LOW }),
    k(0.75, { ...ARMS_LOW, tilt: 4, torso: 4, head: -7, rSh: 34, rEl: 30, x: 1.5 }), k(1, { ...ARMS_LOW })] },
  portDeBras: { name: 'portDeBras', beats: 8, face: 'smile', keys: [
    k(0, { ...ARMS_LOW }), k(0.25, { ...ARMS_FRONT, head: -4 }), k(0.5, { ...ARMS_FIFTH, y: -2, head: 6, torso: -2, ...LEGS_TIGHT }),
    k(0.75, { ...ARMS_SECOND, head: -5, torso: 2 }), k(1, { ...ARMS_LOW })] },
  plie: { name: 'plie', beats: 2, face: 'happy', keys: [
    k(0, { ...ARMS_SECOND, lHip: 8, lKnee: -8, rHip: 8, rKnee: -8 }), k(0.5, { ...ARMS_SECOND, ...PLIE, lSh: 66, rSh: 66, lEl: 26, rEl: 26, squash: 0.97 }),
    k(1, { ...ARMS_SECOND, lHip: 8, lKnee: -8, rHip: 8, rKnee: -8 })] },
  releve: { name: 'releve', beats: 2, face: 'happy', keys: [
    k(0, { ...ARMS_FRONT }), k(0.4, { ...ARMS_FIFTH, ...LEGS_TIGHT, y: -6, squash: 1.04, head: -4 }), k(0.75, { ...ARMS_FIFTH, ...LEGS_TIGHT, y: -6, squash: 1.04, head: 4 }),
    k(1, { ...ARMS_LOW })] },
  arabesque: { name: 'arabesque', beats: 4, face: 'happy', keys: [
    k(0, { ...ARMS_LOW }), k(0.3, { x: -7, y: -2, tilt: -5, torso: -12, head: -8, lSh: 128, lEl: 8, rSh: 96, rEl: 6, lHip: -1, lKnee: 0, rHip: 86, rKnee: 2 }),
    k(0.7, { x: -7, y: -3, tilt: -6, torso: -14, head: -10, lSh: 136, lEl: 6, rSh: 100, rEl: 4, lHip: -1, lKnee: 0, rHip: 92, rKnee: 2 }), k(1, { ...ARMS_LOW })] },
  pirouette: { name: 'pirouette', beats: 4, face: 'happy', keys: [
    k(0, { ...ARMS_FRONT, ...PLIE, y: 5 }), k(0.2, { ...ARMS_FRONT, lEl: 62, rEl: 62, y: -6, squash: 1.04, lHip: 1, lKnee: 0, rHip: 52, rKnee: -100 }),
    k(0.75, { ...ARMS_FRONT, lEl: 62, rEl: 62, y: -6, squash: 1.04, lHip: 1, lKnee: 0, rHip: 52, rKnee: -100, spin: 720 }),
    k(0.88, { ...ARMS_SECOND, ...PLIE, y: 4, spin: 720 }), k(1, { ...ARMS_SECOND, spin: 720 })] },
  saute: { name: 'saute', beats: 1, face: 'happy', keys: [
    k(0, { ...ARMS_LOW, ...PLIE, y: 6, squash: 0.94 }), k(0.45, { ...ARMS_FIFTH, lEl: 22, rEl: 22, y: -16, squash: 1.06, lHip: 8, lKnee: 0, rHip: 8, rKnee: 0 }),
    k(0.85, { ...ARMS_SECOND, ...PLIE, y: 6, squash: 0.94 }), k(1, { ...ARMS_SECOND, y: 2, lHip: 12, lKnee: -20, rHip: 12, rKnee: -20 })] },
  sideStep: { name: 'sideStep', beats: 4, face: 'happy', keys: [
    k(0, { lSh: 26, rSh: 26, lEl: 40, rEl: 40 }), k(0.25, { x: -7, tilt: -3, head: 6, lSh: 44, rSh: 18, lEl: 50, rEl: 30, lHip: 20, lKnee: -8, y: -1 }),
    k(0.5, { x: -7, y: 2, lSh: 26, rSh: 26, lEl: 40, rEl: 40, lHip: 10, lKnee: -14, rHip: 10, rKnee: -14 }),
    k(0.75, { x: 0, tilt: 3, head: -6, rSh: 44, lSh: 18, rEl: 50, lEl: 30, rHip: 20, rKnee: -8, y: -1 }), k(1, { y: 2, lSh: 26, rSh: 26, lEl: 40, rEl: 40, lHip: 10, lKnee: -14, rHip: 10, rKnee: -14 })] },
  headBob: { name: 'headBob', beats: 2, face: 'happy', keys: [
    k(0, { lSh: 30, rSh: 30, lEl: 70, rEl: 70 }), k(0.25, { y: 3, head: 9, nod: 1.6, torso: 2, lSh: 34, rSh: 26, lEl: 80, rEl: 64, lHip: 8, lKnee: -14, rHip: 8, rKnee: -14 }),
    k(0.5, { lSh: 30, rSh: 30, lEl: 70, rEl: 70 }), k(0.75, { y: 3, head: -9, nod: 1.6, torso: -2, lSh: 26, rSh: 34, lEl: 64, rEl: 80, lHip: 8, lKnee: -14, rHip: 8, rKnee: -14 }),
    k(1, { lSh: 30, rSh: 30, lEl: 70, rEl: 70 })] },
  flourish: { name: 'flourish', beats: 4, face: 'happy', keys: [
    k(0, { ...ARMS_LOW }), k(0.3, { lSh: 152, lEl: 14, rSh: 84, rEl: 12, y: -4, ...LEGS_TIGHT, head: -6, torso: -3 }),
    k(0.6, { rSh: 152, rEl: 14, lSh: 84, lEl: 12, y: -4, ...LEGS_TIGHT, head: 6, torso: 3 }), k(0.82, { lSh: 140, rSh: 140, lEl: -6, rEl: -6, y: -5, ...LEGS_TIGHT, squash: 1.03 }),
    k(1, { ...ARMS_LOW })] },
  bow: { name: 'bow', beats: 4, face: 'wink', hold: true, keys: [
    k(0, {}), k(0.3, { rSh: 96, rEl: 6, lSh: 22, lEl: 118, head: -4 }),
    k(0.65, { y: 6, nod: 3.4, head: -6, squash: 0.95, rSh: 40, rEl: 10, lSh: 26, lEl: 120, lHip: 14, lKnee: -30, rHip: 18, rKnee: -34 }),
    k(1, { y: 6, nod: 3.4, head: -6, squash: 0.95, rSh: 36, rEl: 10, lSh: 26, lEl: 120, lHip: 14, lKnee: -30, rHip: 18, rKnee: -34 })] },
  listen: { name: 'listen', beats: 4, face: 'smile', keys: [
    k(0, { lSh: 16, lEl: 26, rSh: 16, rEl: 26 }), k(0.2, { nod: 1.8, head: 6, lSh: 16, lEl: 26, rSh: 16, rEl: 26 }), k(0.4, { head: 6, lSh: 16, lEl: 26, rSh: 16, rEl: 26 }),
    k(0.6, { nod: 1.6, head: 5, lSh: 16, lEl: 26, rSh: 16, rEl: 26, tilt: 1 }), k(1, { lSh: 16, lEl: 26, rSh: 16, rEl: 26 })] },
  startle: { name: 'startle', beats: 2, face: 'surprised', keys: [
    k(0, {}), k(0.14, { y: -9, squash: 1.07, lSh: 128, lEl: -12, rSh: 128, rEl: -12, lHip: 12, lKnee: 0, rHip: 12, rKnee: 0 }),
    k(0.32, { y: 3, squash: 0.95, lSh: 110, lEl: -6, rSh: 110, rEl: -6, lHip: 14, lKnee: -22, rHip: 14, rKnee: -22 }),
    k(0.7, { lSh: 60, lEl: 40, rSh: 60, rEl: 40, head: 6 }), k(1, {})] },
  spin: { name: 'spin', beats: 2, face: 'happy', keys: [
    k(0, { ...ARMS_FRONT }), k(0.15, { ...ARMS_FIFTH, ...LEGS_TIGHT, y: -5, squash: 1.04 }), k(0.85, { ...ARMS_FIFTH, ...LEGS_TIGHT, y: -5, squash: 1.04, spin: 360 }),
    k(1, { ...ARMS_LOW, spin: 360 })] },
  /* rap: nods on the beat, shoulder bounce, arm gestures */
  rapNod: { name: 'rapNod', beats: 2, face: 'smile', keys: [
    k(0, { ...LOOSE }), k(0.15, { ...LOOSE, ...BOUNCE_LEGS, y: 3, nod: 2.4, head: 5, torso: 2, lSh: 26, lEl: 70, rSh: 18, rEl: 58 }), k(0.5, { ...LOOSE }),
    k(0.65, { ...LOOSE, ...BOUNCE_LEGS, y: 3, nod: 2.4, head: -3, torso: -1, lSh: 18, lEl: 58, rSh: 26, rEl: 70 }), k(1, { ...LOOSE })] },
  shoulderBounce: { name: 'shoulderBounce', beats: 2, face: 'smile', keys: [
    k(0, { ...LOOSE }), k(0.25, { torso: 4, head: -3, y: 2, nod: 1, lSh: 34, lEl: 80, rSh: 14, rEl: 50, ...BOUNCE_LEGS }), k(0.5, { ...LOOSE }),
    k(0.75, { torso: -4, head: 3, y: 2, nod: 1, rSh: 34, rEl: 80, lSh: 14, lEl: 50, ...BOUNCE_LEGS }), k(1, { ...LOOSE })] },
  rapGesture: { name: 'rapGesture', beats: 4, face: 'happy', keys: [
    k(0, { ...LOOSE }), k(0.18, { ...L_CHEST, rSh: 82, rEl: 14, nod: 1.6, y: 2, head: 5, ...BOUNCE_LEGS }), k(0.3, { ...L_CHEST, rSh: 56, rEl: 44, head: 2 }),
    k(0.42, { ...L_CHEST, rSh: 82, rEl: 14, nod: 1.6, y: 2, head: 5, ...BOUNCE_LEGS }), k(0.52, { ...L_CHEST, rSh: 56, rEl: 44, head: 1 }),
    k(0.67, { ...R_CHEST, lSh: 82, lEl: 14, nod: 1.6, y: 2, head: -5, ...BOUNCE_LEGS }), k(0.74, { ...R_CHEST, lSh: 56, lEl: 44, head: -2 }),
    k(0.82, { ...R_CHEST, lSh: 82, lEl: 14, nod: 1.6, y: 2, head: -5, ...BOUNCE_LEGS }), k(1, { ...LOOSE })] },
  /* love song: slow sway, hands on the heart */
  slowSway: { name: 'slowSway', beats: 8, face: 'smile', keys: [
    k(0, { lSh: 16, lEl: 22, rSh: 16, rEl: 22 }), k(0.25, { tilt: -3, torso: -4, head: 8, x: -2, y: 1, lSh: 26, lEl: 30, rSh: 12, rEl: 20 }), k(0.5, { lSh: 16, lEl: 22, rSh: 16, rEl: 22 }),
    k(0.75, { tilt: 3, torso: 4, head: -8, x: 2, y: 1, rSh: 26, rEl: 30, lSh: 12, lEl: 20 }), k(1, { lSh: 16, lEl: 22, rSh: 16, rEl: 22 })] },
  heartHands: { name: 'heartHands', beats: 8, face: 'smile', keys: [
    k(0, { ...ARMS_LOW }), k(0.2, { ...HEART, head: 6, tilt: -1 }), k(0.42, { ...HEART, tilt: -3, torso: -3, head: 9, x: -1, y: 1 }),
    k(0.64, { ...HEART, tilt: 3, torso: 3, head: -9, x: 1, y: 1 }), k(0.8, { ...HEART, head: 4 }), k(1, { ...ARMS_LOW })] },
  /* rock: headbang, air guitar, jumps */
  headbang: { name: 'headbang', beats: 2, face: 'happy', keys: [
    k(0, { lSh: 20, lEl: 30, rSh: 20, rEl: 30, ...ROCK_LEGS }), k(0.18, { lSh: 26, lEl: 40, rSh: 140, rEl: 16, ...ROCK_LEGS, nod: 3.6, head: -6, torso: 3, y: 3, squash: 0.96 }),
    k(0.5, { lSh: 20, lEl: 30, rSh: 100, rEl: 30, ...ROCK_LEGS, head: 10, torso: -2 }), k(0.68, { lSh: 26, lEl: 40, rSh: 140, rEl: 16, ...ROCK_LEGS, nod: 3.6, head: -6, torso: 3, y: 3, squash: 0.96 }),
    k(1, { lSh: 20, lEl: 30, rSh: 20, rEl: 30, ...ROCK_LEGS })] },
  airGuitar: { name: 'airGuitar', beats: 4, face: 'happy', keys: [
    k(0, { lSh: 30, lEl: 20, rSh: 22, rEl: -30 }), k(0.1, { ...GUITAR, rEl: -55, head: 4 }), k(0.225, { ...GUITAR, rEl: -95, nod: 1.6, y: 3 }), k(0.35, { ...GUITAR, rEl: -55, head: 6 }),
    k(0.475, { ...GUITAR, rEl: -95, nod: 1.6, y: 3 }), k(0.6, { ...GUITAR, rEl: -55, head: 4 }), k(0.725, { ...GUITAR, rEl: -95, nod: 1.6, y: 3 }), k(0.85, { ...GUITAR, rEl: -55, head: 6 }),
    k(1, { lSh: 30, lEl: 20, rSh: 22, rEl: -30 })] },
  rockJump: { name: 'rockJump', beats: 2, face: 'happy', keys: [
    k(0, { ...ARMS_LOW, ...PLIE, y: 6, squash: 0.94 }), k(0.3, { y: -16, squash: 1.05, lHip: 38, lKnee: -40, rHip: 38, rKnee: -40, lSh: 150, lEl: 10, rSh: 70, rEl: 30, head: -6 }),
    k(0.6, { ...ARMS_LOW, ...PLIE, y: 5, squash: 0.95 }), k(1, { lSh: 20, lEl: 30, rSh: 20, rEl: 30, y: 1, lHip: 10, lKnee: -12, rHip: 10, rKnee: -12 })] },
  /* EDM: bounce, arms up */
  bounce: { name: 'bounce', beats: 1, face: 'happy', keys: [
    k(0, { lSh: 30, lEl: 50, rSh: 30, rEl: 50 }), k(0.5, { y: 4, lHip: 14, lKnee: -24, rHip: 14, rKnee: -24, lSh: 38, lEl: 62, rSh: 38, rEl: 62, squash: 0.97, nod: 1 }),
    k(1, { lSh: 30, lEl: 50, rSh: 30, rEl: 50 })] },
  armsUp: { name: 'armsUp', beats: 2, face: 'happy', keys: [
    k(0, { lSh: 40, lEl: 40, rSh: 40, rEl: 40 }), k(0.2, { lSh: 150, lEl: 8, rSh: 150, rEl: 8, y: -2, squash: 1.03, head: -4 }),
    k(0.45, { lSh: 132, lEl: 24, rSh: 132, rEl: 24, y: 3, lHip: 12, lKnee: -20, rHip: 12, rKnee: -20 }), k(0.7, { lSh: 152, lEl: 6, rSh: 152, rEl: 6, y: -2, head: 4 }),
    k(1, { lSh: 40, lEl: 40, rSh: 40, rEl: 40 })] },
  /* lo-fi: gentle nod and sway */
  chillNod: { name: 'chillNod', beats: 2, face: 'smile', keys: [
    k(0, { ...CHILL }), k(0.3, { ...CHILL, nod: 1.4, head: 5, y: 1 }), k(0.5, { ...CHILL }), k(0.8, { ...CHILL, nod: 1.4, head: 3, y: 1 }), k(1, { ...CHILL })] },
  chillSway: { name: 'chillSway', beats: 4, face: 'smile', keys: [
    k(0, { ...CHILL }), k(0.25, { ...CHILL, tilt: -2, torso: -3, head: 6, x: -1, lSh: 20 }), k(0.5, { ...CHILL, nod: 1 }),
    k(0.75, { ...CHILL, tilt: 2, torso: 3, head: -6, x: 1, rSh: 20 }), k(1, { ...CHILL })] },
  /* classical: a conductor's four-beat pattern with the right arm */
  conduct: { name: 'conduct', beats: 4, face: 'smile', keys: [
    k(0, { lSh: 30, lEl: 30, rSh: 30, rEl: 30 }), k(0.1, { lSh: 50, lEl: 40, rSh: 125, rEl: 15, head: -3 }), k(0.25, { lSh: 50, lEl: 40, rSh: 60, rEl: 30, nod: 0.8 }),
    k(0.45, { lSh: 50, lEl: 40, rSh: 70, rEl: -50, head: 4 }), k(0.65, { lSh: 50, lEl: 40, rSh: 110, rEl: 20, head: -4 }), k(0.85, { lSh: 50, lEl: 40, rSh: 135, rEl: 10 }),
    k(1, { lSh: 30, lEl: 30, rSh: 30, rEl: 30 })] },
  /* peaceful: calm and gentle (never droopy): soft breathing, a slow sway, arms that float up and settle */
  softBreathe: { name: 'softBreathe', beats: 8, face: 'smile', keys: [
    k(0, { ...SOFT }), k(0.5, { lSh: 26, lEl: 28, rSh: 26, rEl: 28, squash: 1.03, y: -0.6, head: 2 }), k(1, { ...SOFT })] },
  floatSway: { name: 'floatSway', beats: 8, face: 'smile', keys: [
    k(0, { ...SOFT }), k(0.25, { tilt: -2.5, torso: -3, head: 5, x: -1.5, squash: 1.01, lSh: 32, lEl: 30, rSh: 14, rEl: 20 }), k(0.5, { ...SOFT, squash: 1.015 }),
    k(0.75, { tilt: 2.5, torso: 3, head: -5, x: 1.5, squash: 1.01, rSh: 32, rEl: 30, lSh: 14, lEl: 20 }), k(1, { ...SOFT })] },
  armFloat: { name: 'armFloat', beats: 8, face: 'smile', keys: [
    k(0, { ...SOFT }), k(0.4, { lSh: 80, lEl: 18, rSh: 80, rEl: 18, y: -1, squash: 1.025, head: 3, ...LEGS_TIGHT }),
    k(0.6, { lSh: 86, lEl: 12, rSh: 86, rEl: 12, y: -1.2, squash: 1.03, head: -3, ...LEGS_TIGHT }), k(1, { ...SOFT })] },
  /* a hello when you press play: a small hop and a wave, then the dance */
  hello: { name: 'hello', beats: 2, face: 'happy', keys: [
    k(0, {}), k(0.22, { y: -7, squash: 1.04, rSh: 150, rEl: 20, lSh: 22, lEl: 20, ...LEGS_TIGHT, head: 4 }),
    k(0.45, { y: 2, squash: 0.97, rSh: 146, rEl: 55, lSh: 18, lEl: 24, lHip: 10, lKnee: -16, rHip: 10, rKnee: -16, head: 6 }),
    k(0.7, { rSh: 150, rEl: 12, lSh: 16, lEl: 20, head: 3 }), k(1, { rSh: 40, rEl: 30, lSh: 16, lEl: 20 })] },
  /* a track is ready: a happy hop with both arms up */
  cheer: { name: 'cheer', beats: 2, face: 'happy', keys: [
    k(0, { ...PLIE, y: 4, squash: 0.96, lSh: 30, rSh: 30, lEl: 40, rEl: 40 }), k(0.35, { ...ARMS_FIFTH, y: -12, squash: 1.05, ...LEGS_TIGHT, head: -4 }),
    k(0.62, { lSh: 132, lEl: 26, rSh: 132, rEl: 26, y: 3, squash: 0.96, lHip: 12, lKnee: -20, rHip: 12, rKnee: -20 }), k(1, {})] },
  /* the welcome screen: a friendly wave, on loop */
  wave: { name: 'wave', beats: 4, face: 'happy', keys: [
    k(0, { rSh: 150, rEl: 18, head: 4 }), k(0.25, { rSh: 156, rEl: 58, head: 7, torso: 1.5 }), k(0.5, { rSh: 150, rEl: 14, head: 4 }),
    k(0.75, { rSh: 156, rEl: 58, head: 7, torso: 1.5 }), k(1, { rSh: 150, rEl: 18, head: 4 })] },
  /* while a track generates: stretch up, lean side to side, hands on hips and tap a foot */
  warmUp: { name: 'warmUp', beats: 8, face: 'smile', keys: [
    k(0, {}), k(0.16, { lSh: 160, lEl: 8, rSh: 160, rEl: 8, squash: 1.04, y: -1, ...LEGS_TIGHT }),
    k(0.28, { lSh: 160, lEl: 8, rSh: 160, rEl: 8, tilt: -4, torso: -9, head: -4, x: -1 }), k(0.42, { lSh: 160, lEl: 8, rSh: 160, rEl: 8, tilt: 4, torso: 9, head: 4, x: 1 }),
    k(0.55, { lSh: 34, lEl: 96, rSh: 34, rEl: 96 }), k(0.63, { lSh: 34, lEl: 96, rSh: 34, rEl: 96, rHip: 18, rKnee: -14, head: 5, nod: 0.8 }),
    k(0.71, { lSh: 34, lEl: 96, rSh: 34, rEl: 96 }), k(0.79, { lSh: 34, lEl: 96, rSh: 34, rEl: 96, rHip: 18, rKnee: -14, head: 5, nod: 0.8 }),
    k(0.87, { lSh: 34, lEl: 96, rSh: 34, rEl: 96 }), k(1, {})] },
};

/* ---------------- easing, sampling, blending ---------------- */

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Ease in and out (a sine curve): starts and ends at rest, so poses glide rather than snap. */
export const ease = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** The shortest way round between two angles (degrees). */
const lerpAngle = (a: number, b: number, t: number) => { const d = ((((b - a) % 360) + 540) % 360) - 180; return a + d * t; };
export const wrapSpin = (s: number) => ((s % 360) + 360) % 360;

/** `a` at t=0, `b` at t=1 (any t in between, clamped). Spin takes the shortest way round, so a finished pirouette never unwinds. */
export function blendPose(a: Pose, b: Pose, t: number): Pose {
  const u = clamp01(t); const o = {} as Pose;
  for (const key of POSE_KEYS) o[key] = key === 'spin' ? lerpAngle(a.spin, b.spin, u) : lerp(a[key], b[key], u);
  return o;
}
/** The same move to the other side: left and right limbs swap, leans and steps flip. */
export function mirrorPose(p: Pose): Pose {
  return { ...p, x: -p.x, tilt: -p.tilt, torso: -p.torso, head: -p.head, spin: -p.spin, lSh: p.rSh, lEl: p.rEl, rSh: p.lSh, rEl: p.lEl, lHip: p.rHip, lKnee: p.rKnee, rHip: p.lHip, rKnee: p.lKnee };
}
/** The pose `t` (0..1) of the way through a move: eased between its keyframes. */
export function sampleMove(m: Move, t: number, mirror = false): Pose {
  const ks = m.keys; const u = clamp01(t); let i = 0;
  while (i < ks.length - 2 && u > ks[i + 1].t) i++;
  const a = ks[i], b = ks[i + 1] ?? a; const span = b.t - a.t;
  const p = blendPose(a.p, b.p, span > 0 ? ease((u - a.t) / span) : 1);
  p.spin = lerp(a.p.spin, b.p.spin, span > 0 ? ease((u - a.t) / span) : 1); /* inside a move the spin keeps its full turn */
  return mirror ? mirrorPose(p) : p;
}
/** Bigger moves for louder music: `amount` 0 is the rest pose, 1 is the move as written (spin is never scaled). */
export function scalePose(p: Pose, amount: number): Pose { const o = blendPose(REST, p, amount); o.spin = p.spin; return o; }

/* ---------------- tempo ---------------- */

export const BPM_MIN = 75; export const BPM_MAX = 150;
/** Fold any tempo into [BPM_MIN, BPM_MAX) by halving / doubling (80 and 160 BPM dance the same steps). */
export function foldBpm(bpm: number): number { let b = bpm; if (!(b > 0) || !isFinite(b)) return 0; while (b < BPM_MIN) b *= 2; while (b >= BPM_MAX) b /= 2; return b; }

/** Tempo from onset times (ms): every pair of onsets 0.25–2 s apart votes for its interval (folded into range, nearer neighbours weigh more)
 *  into a smoothed histogram; the peak is the tempo. confidence 0..1: how much of the vote the peak got. Null with fewer than 4 onsets. */
export function estimateTempo(onsetsMs: readonly number[]): { bpm: number; confidence: number } | null {
  const on = onsetsMs.filter(t => isFinite(t)).slice().sort((a, b) => a - b); if (on.length < 4) return null;
  const lo = BPM_MIN, n = BPM_MAX - BPM_MIN; const hist = new Float64Array(n); let total = 0;
  for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length && j <= i + 4; j++) {
    const d = on[j] - on[i]; if (d < 250 || d > 2000) continue;
    const b = foldBpm(60000 / d); const w = 1 / (j - i);
    for (let o = -3; o <= 3; o++) { const idx = Math.round(b - lo) + o; if (idx >= 0 && idx < n) { const g = w * Math.exp(-(o * o) / 2.5); hist[idx] += g; total += g; } }
  }
  if (!(total > 0)) return null;
  let best = 0; for (let i = 1; i < n; i++) if (hist[i] > hist[best]) best = i;
  /* refine with the neighbours (centre of mass of the peak) */
  let s = 0, ws = 0; for (let o = -2; o <= 2; o++) { const i = best + o; if (i >= 0 && i < n) { s += hist[i] * (lo + i); ws += hist[i]; } }
  const peak = hist[best] + (hist[best - 1] ?? 0) + (hist[best + 1] ?? 0);
  return { bpm: ws > 0 ? s / ws : lo + best, confidence: clamp01(peak / total * 1.6) };
}

/** A beat clock that runs at the tempo and leans toward detected onsets (a soft phase lock), so moves land on the beat. `pos`: beats played. */
export class BeatClock {
  pos = 0; bpm: number;
  constructor(bpm = 110) { this.bpm = bpm; }
  advance(dtSec: number) { this.pos += Math.max(0, dtSec) * (this.bpm / 60); }
  /** An onset near a beat pulls the clock onto it (`pull` of the error each time); onsets far between beats are ignored. */
  onset(pull = 0.35) { const err = this.pos - Math.round(this.pos); if (Math.abs(err) < 0.3) this.pos -= err * pull; }
}

/* ---------------- music sense ---------------- */

export type Features = { rms: number; bass: number; treble: number; flux: number; bassFlux: number;
  /** Linear loudness 0..1 (amplitude). The analyser's bytes are decibels (0..255 over its dB range), so `rms` of the bytes is log-compressed:
   *  a breakdown 12 dB softer only lowers it by ~25 %. Calm sections are judged on this one instead. */
  power: number };
/** The analyser's dB span (audioGraph.ts: minDecibels -88 .. maxDecibels -8). */
export const ANALYSER_DB_RANGE = 80;

/** 0..1 loudness of bins [a, b). */
function band(bins: ArrayLike<number>, a: number, b: number) { const e = Math.min(bins.length, b); if (e <= a) return 0; let s = 0; for (let i = a; i < e; i++) { const v = bins[i] / 255; s += v * v; } return Math.sqrt(s / (e - a)); }
/** Features of one analyser frame (128 byte bins at fftSize 256): loudness, bass (≲ 1 kHz at 44.1 kHz: bins 1–5), treble (≈ 4–15 kHz: bins 24–90),
 *  spectral flux (how much got louder since the last frame: onsets) overall and in the bass. */
export function featuresFromBins(bins: ArrayLike<number>, prev?: ArrayLike<number> | null, dbRange = ANALYSER_DB_RANGE): Features {
  const rms = band(bins, 1, 64), bass = band(bins, 1, 6), treble = band(bins, 24, 90);
  let pw = 0; const e = Math.min(64, bins.length); for (let i = 1; i < e; i++) pw += Math.pow(10, ((bins[i] / 255 - 1) * dbRange) / 10); /* back to linear power */
  const power = e > 1 ? Math.sqrt(pw / (e - 1)) : 0;
  let flux = 0, bassFlux = 0;
  if (prev && prev.length === bins.length) {
    for (let i = 1; i < 64 && i < bins.length; i++) { const d = bins[i] - prev[i]; if (d > 0) { flux += d; if (i < 6) bassFlux += d; } }
    flux /= 63 * 255; bassFlux /= 5 * 255;
  }
  return { rms, bass, treble, flux, bassFlux, power };
}
/** No analyser (another site's file): a stand-in from one 0..1 level (the decoded waveform at the play head). */
export function featuresFromLevel(level: number, prevLevel: number): Features {
  const l = clamp01(isFinite(level) ? level : 0); const d = Math.max(0, l - clamp01(prevLevel || 0));
  return { rms: l * 0.8, bass: l, treble: l * 0.45, flux: d * 0.5, bassFlux: d, power: l };
}

export type Sense = {
  /** loudness: fast (~0.15 s) and slow (~1.5 s) */
  level: number; rms: number; bass: number; treble: number;
  /** treble / (bass + treble), 0..1: bright vs heavy */
  bright: number;
  /** fast / slow loudness over the last few seconds: > 1 rising, < 1 falling */
  trend: number;
  bpm: number; confidence: number;
  /** ms since the last onset / bass hit / big change (Infinity: none yet) */
  onsetAgo: number; bassHitAgo: number; dropAgo: number;
  /** strength of the latest onset, 0..1 */
  onsetStrength: number;
  /** quiet overall, or a calm section (well below the last few seconds: a breakdown) */
  quiet: boolean;
  /** linear loudness now / the recent loud reference (0..1; < ~0.42 is a calm section) */
  power: number; calmRatio: number;
};

/** Follows the music frame by frame: smoothed levels, onsets (spectral flux over an adaptive threshold), bass hits, tempo (re-estimated twice a
 *  second from the last 8 s of onsets) and drops (the loudness jumping well above the last few seconds). `update` returns whether this frame is an onset. */
export class MusicSense {
  level = 0; rms = 0; bass = 0; treble = 0; longRms = 0; fluxAvg = 0.01; bassFluxAvg = 0.02;
  bpm = 110; confidence = 0; onsets: number[] = []; lastOnset = -Infinity; lastBass = -Infinity; lastDrop = -Infinity; onsetStrength = 0;
  private lastT = -1; private lastTempo = 0; private calmSince = 0; private startT = 0;
  /** linear loudness (~0.6 s) and its reference, the average of the last ~6 s (it barely moves inside a calm section, so a long breakdown stays calm) */
  pow = 0; powRef = 0; calm = false; private calmT = 0;
  static CALM_IN = 0.45; static CALM_OUT = 0.7; static CALM_HOLD_MS = 350;
  /** The first seconds only learn what "normal" is here: no drops, no calm sections yet. */
  static WARMUP_MS = 3000;
  update(f: Features, nowMs: number): boolean {
    const dt = this.lastT < 0 ? 0.016 : Math.min(0.1, Math.max(0.001, (nowMs - this.lastT) / 1000)); const first = this.lastT < 0; if (first) this.startT = nowMs; this.lastT = nowMs; const warm = nowMs - this.startT >= MusicSense.WARMUP_MS;
    const ema = (prev: number, v: number, tau: number) => prev + (v - prev) * (1 - Math.exp(-dt / tau));
    const prevLevel = this.level;
    this.level = first ? f.rms : ema(this.level, f.rms, 0.15); this.rms = first ? f.rms : ema(this.rms, f.rms, 1.5); this.longRms = first ? f.rms : ema(this.longRms, f.rms, warm ? 6 : 0.8);
    this.bass = ema(this.bass, f.bass, 0.2); this.treble = ema(this.treble, f.treble, 0.3);
    const fp = isFinite(f.power) ? f.power : f.rms;
    this.pow = first ? fp : ema(this.pow, fp, 0.45); this.powRef = first ? fp : ema(this.powRef, this.pow, !warm ? 0.8 : this.calm ? 30 : 6);
    /* onsets */
    let onset = false;
    if (!first && f.flux > this.fluxAvg * 1.6 + 0.006 && nowMs - this.lastOnset > 140 && f.rms > 0.04) {
      onset = true; this.lastOnset = nowMs; this.onsetStrength = clamp01(f.flux / (this.fluxAvg * 4 + 0.02)); this.onsets.push(nowMs);
    }
    if (!first && f.bassFlux > this.bassFluxAvg * 1.8 + 0.02 && f.bass > 0.3 && nowMs - this.lastBass > 200) this.lastBass = nowMs;
    this.fluxAvg = ema(this.fluxAvg, f.flux, 0.5); this.bassFluxAvg = ema(this.bassFluxAvg, f.bassFlux, 0.5);
    /* a drop: loud again after a calmer stretch, or a sudden jump well above the last few seconds */
    if (this.level < this.longRms * 0.75) this.calmSince = this.calmSince || nowMs; else if (this.level > this.longRms) { /* keep calmSince until the jump is judged */ }
    const jump = this.level > Math.max(0.12, this.longRms * 1.45) && prevLevel <= this.level;
    const afterCalm = this.calmSince > 0 && nowMs - this.calmSince > 1500 && this.level > this.longRms * 1.15 && this.level > 0.15;
    let dropped = false;
    if (warm && (jump || afterCalm) && nowMs - this.lastDrop > 4000) { this.lastDrop = nowMs; this.calmSince = 0; dropped = true; }
    /* a calm section (on linear loudness, with a short hold going in and hysteresis coming out) */
    const ratio = this.powRef > 1e-6 ? this.pow / this.powRef : 1;
    if (!this.calm) { if (warm && ratio < MusicSense.CALM_IN) { this.calmT = this.calmT || nowMs; if (nowMs - this.calmT >= MusicSense.CALM_HOLD_MS) this.calm = true; } else this.calmT = 0; }
    else if (ratio > MusicSense.CALM_OUT || dropped) {
      /* coming back loud after a real calm section is a drop too */
      if (!dropped && nowMs - this.calmT > 1500 && nowMs - this.lastDrop > 4000) this.lastDrop = nowMs;
      this.calm = false; this.calmT = 0;
    }
    if (this.level >= this.longRms * 0.75 && !afterCalm && this.calmSince && nowMs - this.calmSince < 1500) this.calmSince = 0;
    /* tempo */
    while (this.onsets.length && nowMs - this.onsets[0] > 8000) this.onsets.shift();
    if (nowMs - this.lastTempo > 500) {
      this.lastTempo = nowMs; const est = estimateTempo(this.onsets);
      if (est && est.confidence > 0.2) {
        const near = Math.abs(est.bpm - this.bpm) < 6;
        this.bpm = this.confidence < 0.2 || !near ? (this.confidence < 0.2 ? est.bpm : this.bpm * 0.6 + est.bpm * 0.4) : this.bpm * 0.8 + est.bpm * 0.2;
      }
      this.confidence = est ? (this.confidence * 0.5 + est.confidence * 0.5) : this.confidence * 0.7;
    }
    return onset;
  }
  snapshot(nowMs: number): Sense {
    const b = this.bass, t = this.treble;
    return { level: this.level, rms: this.rms, bass: b, treble: t, bright: b + t > 0.02 ? t / (b + t) : 0.5, trend: this.rms > 0.02 ? this.level / Math.max(0.02, this.longRms) : 1,
      bpm: this.bpm, confidence: this.confidence, onsetAgo: nowMs - this.lastOnset, bassHitAgo: nowMs - this.lastBass, dropAgo: nowMs - this.lastDrop,
      onsetStrength: this.onsetStrength, quiet: this.calm || this.rms < 0.07 || this.pow < 2e-4 || (nowMs - this.startT >= MusicSense.WARMUP_MS && this.level < this.longRms * 0.62),
      power: this.pow, calmRatio: this.powRef > 1e-6 ? this.pow / this.powRef : 1 };
  }
}

/* ---------------- choreographer ---------------- */

export type DanceKind = 'music' | 'voice' | 'sfx';
export type ChoiceCtx = {
  kind: DanceKind; prev: MoveName | null; /** moves chosen so far (most recent last) */ history: MoveName[];
  /** beats since the last drop move (a spin, pirouette or drop jump) */ beatsSinceSpin: number; /** the track is about to end */ ending: boolean; rnd: () => number;
  /** the style pack (beanStyle.ts); default: voice / sfx by kind, else the neutral groove */ pack?: PackId;
};
const pickOther = (list: MoveName[], c: ChoiceCtx): MoveName => {
  const opts = list.filter(m => m !== c.prev); const last2 = c.history.slice(-3);
  const fresh = opts.filter(m => !last2.includes(m)); const pool = fresh.length ? fresh : opts.length ? opts : list;
  return pool[Math.floor(c.rnd() * pool.length) % pool.length];
};
/** The pack a dance uses: a voice / sound effect by its kind, music by its detected style (the neutral groove when unknown). */
export const packOf = (kind: DanceKind, pack?: PackId): Pack => PACKS[kind === 'voice' ? 'voice' : kind === 'sfx' ? 'sfx' : pack && pack !== 'voice' && pack !== 'sfx' ? pack : 'groove'];
const JUMPS: MoveName[] = ['saute', 'rockJump'];

/** Which move comes next, from the style pack and what the music is doing right now (called on a beat, when the current move ends):
 *  end of track → bow; a drop → the pack's drop move (not too often); near silence → breathe; a calm section → the pack's gentle moves;
 *  bass hits → the pack's jump (a soft pack still jumps when it gets really loud); rising energy or a bright, loud mix → the pack's lift moves;
 *  slow or unclear tempo → gentle; a steady beat → the pack's steady moves. A voice gets a listening nod; a sound effect a startle on a hit,
 *  a spin when it stays loud. */
export function chooseMove(s: Sense, c: ChoiceCtx): MoveName {
  const beatMs = 60000 / Math.max(40, s.bpm || 110); const P = packOf(c.kind, c.pack);
  if (c.ending) return 'bow';
  if (c.kind === 'voice') return s.rms < 0.02 ? 'breathe' : 'listen';
  if (c.kind === 'sfx') {
    if (s.onsetAgo < 400 && s.onsetStrength > 0.35 && c.prev !== 'startle') return 'startle';
    if (s.level > 0.3 && s.trend > 1.05 && c.beatsSinceSpin >= 4) return 'spin';
    return s.rms < 0.03 ? 'breathe' : 'sway';
  }
  if (s.dropAgo < beatMs * 2.5 && c.beatsSinceSpin >= 8) return P.drop;
  if (s.rms < 0.025) return 'breathe';
  if (s.quiet) return pickOther(P.gentle, c);
  const jumps = c.history.slice(-2).filter(m => JUMPS.includes(m)).length;
  const hit = P.hit ?? (s.level > 0.34 && s.bass > 0.55 ? 'saute' : null); /* a soft pack only jumps when it really gets loud */
  if (hit && s.bassHitAgo < beatMs * 1.25 && s.bass > 0.42 && jumps < 2) return hit;
  if (s.trend > 1.18 || (s.bright > 0.42 && s.level > 0.28)) return pickOther(P.lift, c);
  if (s.bpm < 88 || s.confidence < 0.18) return pickOther(P.gentle, c);
  return pickOther(P.steady, c);
}

export type DanceFrame = { pose: Pose; face: Face; move: MoveName };

/** Runs the dance: keeps the current move on the beat clock, asks `chooseMove` at each move's last beat (so the next one starts on a beat), and
 *  blends from wherever the body is into the new move over an eased crossfade. A drop or the end of the track cuts in on the next beat; so does
 *  a calm section starting (the bean eases into a gentle move over a whole beat instead of finishing its steps); a sound effect's hit cuts in at once. */
export class Choreographer {
  /* the opening breath ends on the first beat, so the dance starts at once */
  move: Move = MOVES.breathe; start = 1 - MOVES.breathe.beats; mirror = false; history: MoveName[] = []; lastSpinBeat = -Infinity; readonly pack: Pack;
  private from: Pose | null = null; private fromAt = 0; private blendBeats = 0.5; private last: Pose = REST; private flip = false; private lastWhole = 0;
  private wasQuiet = false; private calmPending = false;
  constructor(public kind: DanceKind, private rnd: () => number = Math.random, pack?: PackId, o: { greet?: boolean } = {}) {
    this.pack = packOf(kind, pack);
    /* greet: start with a hello (a small hop and a wave) on the first beats instead of the opening breath */
    if (o.greet) { this.move = MOVES.hello; this.start = 0; }
  }
  private begin(name: MoveName, at: number, blend = 0.5) {
    this.from = this.last; this.fromAt = at; this.blendBeats = blend; this.move = MOVES[name]; this.start = at; this.calmPending = false;
    /* alternate sides so steps and arabesques travel both ways (never mirror a bow or the symmetric moves' timing) */
    this.flip = !this.flip; this.mirror = name !== 'bow' && this.flip;
    if (name === 'pirouette' || name === 'spin' || (name === this.pack.drop && this.kind === 'music')) this.lastSpinBeat = at;
    this.history.push(name); if (this.history.length > 12) this.history.shift();
  }
  /** `beat`: the clock's position in beats; `amount` 0..1 scales how big the moves are (louder music, bigger moves). */
  update(beat: number, s: Sense, o: { ending: boolean; amount?: number; cutIn?: boolean }): DanceFrame {
    const ctx = (): ChoiceCtx => ({ kind: this.kind, prev: this.move.name, history: this.history, beatsSinceSpin: beat - this.lastSpinBeat, ending: o.ending, rnd: this.rnd, pack: this.pack.id });
    const end = this.start + this.move.beats; const whole = Math.floor(beat); const onBeat = whole !== this.lastWhole; this.lastWhole = whole;
    if (s.quiet && !this.wasQuiet) this.calmPending = true; else if (!s.quiet) this.calmPending = false;
    this.wasQuiet = s.quiet;
    if (o.cutIn) { if (this.move.name !== 'startle' && chooseMove(s, ctx()) === 'startle') this.begin('startle', beat, 0.35); }
    else if (beat >= end) { if (!(this.move.hold && o.ending)) this.begin(chooseMove(s, ctx()), beat - end > 1 ? whole : end, s.quiet ? 1 : 0.5); }
    else if (onBeat && whole > this.start && !this.move.hold && this.move.name !== 'pirouette') {
      const beatMs = 60000 / Math.max(40, s.bpm);
      if (o.ending || s.dropAgo < beatMs * 1.5) {
        /* the end of the track or a drop doesn't wait for the move to finish: it cuts in on this beat */
        const next = chooseMove(s, ctx()); if (next === 'bow' || next === this.pack.drop) this.begin(next, whole, 0.35);
      } else if (this.calmPending && this.kind === 'music') {
        /* a calm section starts: ease into a gentle move now, over a whole beat, instead of finishing the steps */
        this.calmPending = false; if (!this.pack.gentle.includes(this.move.name)) this.begin(chooseMove(s, ctx()), whole, 1);
      }
    }
    const t = (beat - this.start) / this.move.beats;
    let p = sampleMove(this.move, t, this.mirror);
    if (this.move.name !== 'bow' && this.move.name !== 'hello') p = scalePose(p, (o.amount ?? 1) * this.pack.scale);
    if (this.from) { const k = (beat - this.fromAt) / this.blendBeats; if (k >= 1) this.from = null; else p = blendPose(this.from, p, ease(k)); }
    this.last = p;
    return { pose: p, face: this.pack.faces?.[this.move.face] ?? this.move.face, move: this.move.name };
  }
}
