import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const dir=path.resolve(import.meta.dirname,'../../.preview/reel-camera-test');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'empty.env'),'');
Object.assign(process.env,{OPENHIGGSFIELD_BACKEND:'mock',OPENHIGGSFIELD_DATA_DIR:dir,OPENHIGGSFIELD_ENV_FILE:path.join(dir,'empty.env'),COMFY_BASE_URL:'http://127.0.0.1:9',OPENHIGGSFIELD_COMFY_DETECT_URLS:'http://127.0.0.1:9',OPENHIGGSFIELD_REQUEUE_ON_RESTART:'0'});
const {reelCameraFields}=await import('../src/photosToReel.js');
const {cameraDefaultMove,cameraPresetOff}=await import('../src/tools/apps.js');
const {fillPattern}=await import('../src/shared/promptPatterns.js');
const move=(f:ReturnType<typeof reelCameraFields>)=>JSON.parse(f.types)[0];
for(const provider of ['api-minimax-h3','comfy-open','cloud-ltx-camera','router-seedance']) {
  for(const kind of ['listing','event','hotel','trip','product']) {
    const fields=Array.from({length:6},(_,i)=>reelCameraFields({provider,kind},i));
    assert.equal(move(fields[0]),cameraDefaultMove(provider));
    assert.ok(new Set(fields.map(move)).size>=3,`${provider}/${kind} alternates supported moves`);
    for(const f of fields){assert.equal(cameraPresetOff([move(f)],provider),null);assert.ok(!f.prompt.includes('push in'),'no contradictory push-in appended');}
  }
}
assert.deepEqual([0,1,2].map(i=>move(reelCameraFields({provider:'api-minimax-h3',kind:'listing'},i))),['push-in','pan-left','crane-up']);
assert.deepEqual([0,1,2].map(i=>move(reelCameraFields({provider:'comfy-open',model:'ltx-2-19b',kind:'listing'},i))),['ltx-dolly-in','ltx-dolly-left','ltx-jib-up']);
const event=reelCameraFields({provider:'api-minimax-h3',kind:'event'},1);
assert.equal(event.prompt,fillPattern('camera-scene','minimax-h3',{pace:'brisk, lively and controlled'}));
const hotel=reelCameraFields({provider:'cloud-ltx-camera',kind:'hotel'},1);
assert.equal(hotel.prompt,fillPattern('camera-scene','ltx-2-19b',{pace:'very slow, smooth and steady'}));
assert.notEqual(event.prompt,hotel.prompt);
console.log('PASS: reel moves alternate by kind, stay on supported camera engine and use registry scene wording');
