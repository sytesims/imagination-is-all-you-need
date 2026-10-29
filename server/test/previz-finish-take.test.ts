import assert from 'node:assert/strict';
import { defaultPlanShot, normalizePlanShot } from '../src/shared/previzTemplates';
import { chooseFinishedTake } from '../../web/src/shared/previz/finishTake';

const shot = normalizePlanShot({ ...defaultPlanShot('open-city'), cameraPath: { chosen: 'take-1', takes: [1, 2].map((n) => ({
  id: `take-${n}`, name: n === 2 ? 'Performance 1' : 'Earlier camera',
  keys: [0, 2].map((t) => ({ t, pos: [n, 3, t], yaw: 0, pitch: 0, fov: 45 })),
  ...(n === 2 ? { actor: { keys: [0, 2].map((t) => ({ t, pos: [t, 0, 0], heading: 0, v: 1, d: t })), beats: [], ride: { car: 'kv.taxi', park: [0, 0, 0, 0], spans: [[0, 2]] } } } : {}),
})) } });
const before = JSON.stringify(shot);
const used = chooseFinishedTake(shot, 'take-2', 'free')!;
assert.equal(used.cameraPath!.chosen, 'take-2', 'handoff explicitly selects the newly saved take, not the earlier camera');
assert.equal(used.cameraPath!.takes, shot.cameraPath!.takes, 'camera keys, actor/drive performance, trim and speed are retained verbatim');
assert.equal(JSON.stringify(shot), before, 'original recording remains unchanged');
assert.equal(chooseFinishedTake(shot, 'missing', 'free'), null, 'no fallback to another take');
assert.equal(chooseFinishedTake(shot, 'take-2', 'rec'), null, 'must stop/save active recording first');
assert.equal(chooseFinishedTake(shot, 'take-2', 'count'), null, 'countdown cancellation is not a successful take');
console.log('ok Stop → Use take handoff: exact saved source, preserved camera/drive data, no stale fallback, no active/countdown handoff');
