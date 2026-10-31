import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
const base=path.resolve(import.meta.dirname,'../../.preview');fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'reel-boot-'));fs.writeFileSync(path.join(dir,'empty.env'),'');
Object.assign(process.env,{OPENHIGGSFIELD_BACKEND:'mock',OPENHIGGSFIELD_DATA_DIR:dir,OPENHIGGSFIELD_ENV_FILE:path.join(dir,'empty.env'),OPENHIGGSFIELD_REQUEUE_ON_RESTART:'0',COMFY_BASE_URL:'http://127.0.0.1:9',OPENHIGGSFIELD_COMFY_DETECT_URLS:'http://127.0.0.1:9'});
const {jobs,persistJob}=await import('../src/jobs.js');
const make=(id:string,toolId:string,status:any,parentId:string|null=null,input:any={})=>({id,toolId,status,parentId,input,provider:'api-minimax-h3',stage:status,progress:0,queuePos:0,eta:0,resultUrl:null,outputs:[],error:null,warnings:[],cost:0,createdAt:Date.now()});
// Child inserted before parent tests recovery ordering; legacy music's parent was the compose step.
for(const j of [make('legacy-child','camera','queued','parent'),make('legacy-music','app-music-bed','queued','compose'),make('ordinary','camera','queued','parent'),make('parent','app-photos-to-reel','running',null,{childIds:['legacy-child'],musicJobId:'legacy-music',composeJobId:'compose'}),make('retry-parent','app-photos-to-reel','queued','parent',{photoJobs:{0:'legacy-child'},musicJobId:'legacy-music',composeJobId:'compose'}),make('marked','camera','done','parent',{reelParentId:'parent'})]){jobs.set(j.id,j);persistJob(j);}
jobs.get('retry-parent')!.input.photoJobs[1]='marked';
await import('../src/queue.js');
assert.equal(jobs.get('legacy-child')!.status,'canceled');assert.equal(jobs.get('legacy-music')!.status,'canceled');assert.equal(jobs.get('legacy-music')!.parentId,'parent');assert.equal(jobs.get('legacy-music')!.input.reelParentId,'parent');
assert.equal(jobs.get('marked')!.input.reelParentId,'parent','retry references never take ownership of original paid steps');assert.equal(jobs.get('legacy-child')!.input.reelParentId,'parent');
assert.equal(jobs.get('ordinary')!.status,'failed','unrelated follow-up follows ordinary recovery, never reel cancellation');assert.equal(jobs.get('retry-parent')!.status,'failed','retry parent remains retryable');assert.equal(jobs.get('parent')!.input.childCost,0);
console.log('PASS: queued legacy camera/music steps cancel before dispatch; unrelated follow-ups untouched; retry parents remain retryable');
