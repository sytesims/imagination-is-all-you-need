// The Mockup bar must describe the export, not imply the whole source take is included.
import assert from 'node:assert/strict';
import { defaultPlanShot, normalizePlanShot } from '../src/shared/previzTemplates';
import { mockupSummary } from '../../web/src/shared/previz/shotSummary';

const shot = normalizePlanShot({ ...defaultPlanShot('open-city'), seconds: 8, cameraPath: { chosen: 'take-1', takes: [{
  id: 'take-1', name: 'Performance 1', trimStart: 0, trimEnd: 14.6, speed: 1,
  keys: [0, 14.6].map((t) => ({ t, pos: [0, 3, 0], yaw: 0, pitch: 0, fov: 45 })),
  actor: { keys: [0, 14.6].map((t) => ({ t, pos: [t, 0, 0], heading: 0, v: 1, d: t })), beats: [] },
}] } });
assert.equal(mockupSummary(shot), 'Performance 1 · follow camera · take 0.0–8.0 s (remaining action not included)');
const original = JSON.stringify(shot);
const variant = (trimStart: number, trimEnd: number, speed: number) => ({ ...shot, cameraPath: { ...shot.cameraPath!, takes: shot.cameraPath!.takes.map((k) => ({ ...k, trimStart, trimEnd, speed })) } });
assert.equal(mockupSummary(variant(2, 14, 2)), 'Performance 1 · follow camera · take 2.0–14.0 s (holds at the end)');
assert.equal(mockupSummary(variant(2, 10, 1)), 'Performance 1 · follow camera · take 2.0–10.0 s');
assert.equal(mockupSummary({ ...shot, cameraPath: { ...shot.cameraPath!, chosen: null } }), 'Crane camera');
assert.equal(JSON.stringify(shot), original, 'summary never edits the saved performance');
console.log('ok Mockup summary: selected camera, 14.6 s source / 8 s export, trim, speed, hold and preset; no mutation');
