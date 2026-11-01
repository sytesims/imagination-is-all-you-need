import assert from 'node:assert/strict';
import { parseReelOptions, reelResumePlan, reelMusicAction, type ReelOptions } from '../src/shared/photosToReel.js';
const o = parseReelOptions({title:'Trip',music:'on'},8) as ReelOptions;
const clips = Object.fromEntries(Array.from({length:8},(_,i)=>[i,`/files/photo-${i}.mp4`]));
assert.deepEqual(reelResumePlan(8,o),{unchangedVisual:false,pendingCameraCount:3,pendingMusicCount:1});
for(const musicStatus of ['queued','running','needs_decision','done']) {
  assert.deepEqual(reelResumePlan(8,o,{clipsByPhoto:clips,musicStatus}),{unchangedVisual:true,pendingCameraCount:0,pendingMusicCount:0},`${musicStatus}: never pay twice for unchanged visual/music`);
}
assert.deepEqual(reelResumePlan(8,o,{clipsByPhoto:clips,musicStatus:'failed'}),{unchangedVisual:true,pendingCameraCount:0,pendingMusicCount:1});
const partial = {...clips}; delete partial[0];
assert.deepEqual(reelResumePlan(8,o,{clipsByPhoto:partial,musicStatus:'done'}),{unchangedVisual:false,pendingCameraCount:1,pendingMusicCount:1},'rebuilding a failed hero invalidates the old soundtrack video');
const missingStill = {...clips}; delete missingStill[1];
assert.deepEqual(reelResumePlan(8,o,{clipsByPhoto:missingStill,musicStatus:'done'}),{unchangedVisual:false,pendingCameraCount:0,pendingMusicCount:1},'a changed still also changes the edit');
assert.equal(reelResumePlan(8,{...o,music:'off'},{clipsByPhoto:partial}).pendingMusicCount,0);
console.log('PASS: restart resumes unchanged visual/music without duplicate cost; changed photos invalidate soundtrack; failed music retried; no-music stays off');

const approvedResume = reelResumePlan(8,o,{clipsByPhoto:clips,musicStatus:'running'});
assert.equal(approvedResume.pendingMusicCount,0);
assert.equal(reelMusicAction('running',approvedResume.pendingMusicCount),'wait');
assert.equal(reelMusicAction('failed',approvedResume.pendingMusicCount),'retry','a reused running job failing cannot start paid music under the old zero-cost approval');
assert.equal(reelMusicAction('done',approvedResume.pendingMusicCount),'reuse');
const freshRetry = reelResumePlan(8,o,{clipsByPhoto:clips,musicStatus:'failed'});
assert.equal(reelMusicAction('failed',freshRetry.pendingMusicCount),'submit','an explicit retry includes a fresh paid music quote');
console.log('PASS: running-to-failed reused music requires fresh-priced retry');
