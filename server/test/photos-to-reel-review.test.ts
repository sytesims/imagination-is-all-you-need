import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const dir=path.resolve(import.meta.dirname,'../../.preview/reel-review-test');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'empty.env'),'');
Object.assign(process.env,{OPENHIGGSFIELD_BACKEND:'mock',OPENHIGGSFIELD_DATA_DIR:dir,OPENHIGGSFIELD_ENV_FILE:path.join(dir,'empty.env'),COMFY_BASE_URL:'http://127.0.0.1:9',OPENHIGGSFIELD_COMFY_DETECT_URLS:'http://127.0.0.1:9',OPENHIGGSFIELD_REQUEUE_ON_RESTART:'0'});
const {quoteReel,reelErrorText}=await import('../src/photosToReel.js');
const {clipArgs}=await import('../src/shareExport.js');
const camera={credits:65,routeId:'comfy-router:api-minimax-h3',valid:true,runnable:true,cost:{billedTo:'comfy',billedToName:'Comfy',estUsd:.65,realRunUsd:.65,estUnits:137,unitLabel:'Comfy credits'}};
const music={credits:43,routeId:'fal:music',valid:true,runnable:true,cost:{billedTo:'fal',billedToName:'fal',estUsd:.43,realRunUsd:.43}};
const app={inject:async({url}:any)=>({statusCode:200,json:()=>url.includes('/camera/')?camera:music})} as any;
const quote=await quoteReel(app,{photoCount:8,music:'on'});assert.equal(quote.body.routeId,camera.routeId);assert.equal(quote.body.cost.billedTo,null);assert.deepEqual(quote.body.cost.accounts.map((a:any)=>a.billedTo),['comfy','fal']);assert.equal(quote.body.cost.estUnits,undefined);
const onlyMusic=await quoteReel(app,{photoCount:8,music:'on'},0,1);assert.equal(onlyMusic.body.cost.billedTo,'fal');assert.equal(onlyMusic.body.cost.estUsd,.43);
assert.match(reelErrorText({error:'route_changed'},'Fallback'),/price changed/i);assert.equal(reelErrorText({error:'unknown_internal_code'},'Try again.'),'Try again.');
// A landscape photo keeps both edge markers; its foreground grows visibly while remaining entirely in frame.
const png=path.join(dir,'edges.png'),mp4=path.join(dir,'blur.mp4');
function ff(args:string[]){const r=spawnSync('ffmpeg',['-y','-v','error',...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
ff(['-f','lavfi','-i','color=c=white:s=320x180','-vf','drawbox=x=0:y=0:w=24:h=180:color=red:t=fill,drawbox=x=296:y=0:w=24:h=180:color=blue:t=fill','-frames:v','1',png]);
const args=clipArgs(png,'still',null,mp4,{W:180,H:320,secs:2,blurFit:true,zoomSeconds:2});const r=spawnSync('ffmpeg',args,{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
const pixels=(at:string)=>spawnSync('ffmpeg',['-v','error','-ss',at,'-i',mp4,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-']).stdout;
function span(b:Buffer){const hits:number[]=[];for(let x=0;x<180;x++){const i=(160*180+x)*3;if(b[i]>150&&b[i]>b[i+1]*1.8&&b[i]>b[i+2]*1.8)hits.push(x)}return hits;}
const early=span(pixels('0')),late=span(pixels('1.9'));assert.ok(early.length>5&&late.length>5,'red left edge retained');assert.ok(Math.min(...early)-Math.min(...late)>=6,'foreground visibly expands by at least6pixels');
console.log('PASS: quote approval route, mixed/sole accounts, plain errors and blur-fit visible zoom retaining landscape edge');
