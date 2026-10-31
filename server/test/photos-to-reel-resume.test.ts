import assert from 'node:assert/strict';
import { parseReelOptions, reelResumePlan, type ReelOptions } from '../src/shared/photosToReel.js';
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
