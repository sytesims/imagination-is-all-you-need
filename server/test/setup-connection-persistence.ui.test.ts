// Keyless real React/Chromium fixture. No API server, ComfyUI or provider traffic.
// Run sequentially: npx tsx test/setup-connection-persistence.ui.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createServer } from 'vite';
import { findChromium } from './_cdp.ts';
const require = createRequire(import.meta.url);
// Playwright is not a dependency and nothing is downloaded: skipped unless it (SETUP_PLAYWRIGHT, else a resolvable `playwright`) and a headless shell exist
const playwright = (() => { for (const id of [process.env.SETUP_PLAYWRIGHT, 'playwright', path.join(os.homedir(), '.npm/_npx/e41f203b7505f1fb/node_modules/playwright')]) { if (!id) continue; try { return require(id); } catch { /* next */ } } return null; })();
const chromiumPath = process.env.SETUP_CHROMIUM || findChromium();
if (!playwright || !chromiumPath) { console.log(`SKIP setup-connection-persistence: ${!playwright ? 'Playwright' : 'Chromium headless shell'} not installed (nothing downloaded)`); process.exit(0); }
const { chromium } = playwright;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode/setup-fixture-'));
const evidence = process.env.SETUP_EVIDENCE || scratch;
fs.mkdirSync(evidence, { recursive: true });
const html = `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';
import {RunSetupHost,openRunSetup} from '/src/ui/setup/RunSetup.tsx';import {ConnectSheetHost,openConnectSheet} from '/src/shared/ConnectSheet.tsx';
import '/src/tokens.css';import '/src/styles.css';import '/src/ui-states.css';import '/src/runon.css';
createRoot(document.getElementById('root')).render(React.createElement(React.Fragment,null,React.createElement('button',{id:'wizard',onClick:openRunSetup},'Setup'),React.createElement('button',{id:'connect',onClick:openConnectSheet},'Connect'),React.createElement(RunSetupHost),React.createElement(ConnectSheetHost)));
</script></body></html>`;
const port = Number(process.env.SETUP_WEB_PORT) || 5293;
const origin = `http://127.0.0.1:${port}`;
const server = await createServer({root:path.resolve(import.meta.dirname,'../../web'),configFile:false,cacheDir:path.join(scratch,'cache'),esbuild:{jsx:'automatic'},server:{host:'127.0.0.1',port,strictPort:true},plugins:[{name:'setup-fixture',enforce:'pre',load(id){if(process.env.SETUP_BASELINE && /\/(RunSetup|ConnectSheet)\.tsx$/.test(id)){const relative=path.relative(path.resolve(import.meta.dirname,'../..'),id);return execFileSync('git',['show','734d7d16:'+relative],{cwd:path.resolve(import.meta.dirname,'../..'),encoding:'utf8'});}},configureServer(s){s.middlewares.use(async(req,res,next)=>{if(!req.url?.startsWith('/setup-fixture'))return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/setup-fixture',html));});}}]});
let browser: any;
const results: any[] = [];
try {
 await server.listen();
 browser=await chromium.launch({headless:true,executablePath:chromiumPath});
 async function fixture(options: any = {}) {
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});const page=await context.newPage();
  const writes: any[]=[];const state={fail:options.fail || '',url:options.url || 'http://127.0.0.1:8000', ...options};
  await context.route('**/*',async(route: any)=>{const req=route.request();const u=new URL(req.url());if(u.origin!==origin)return route.abort();if(!u.pathname.startsWith('/api/')){if(/\.(png|jpg|webp|mp4|woff2?)$/.test(u.pathname))return route.abort();return route.continue();}
   const method=req.method();if(method!=='GET')writes.push({path:u.pathname,method,body:req.postDataJSON()});
   let body: any={};if(u.pathname==='/api/health')body={ok:true,backend:'mock'};
   else if(u.pathname==='/api/config')body={backend:'mock'};
   else if(u.pathname==='/api/setup')body=method==='GET'?{suggest:false,setup:state.existing?'local':'none',choices:[]}:{done:true,choices:req.postDataJSON().choices};
   else if(u.pathname==='/api/settings/providers')body={canStoreKeys:true,ok:true};
   else if(u.pathname==='/api/local/comfy/test'){if(state.delay)await new Promise(r=>setTimeout(r,state.delay));body={reachable:!state.unreachable,url:state.url,detected:!state.existing,version:'fixture'};}
   else if(u.pathname==='/api/local/comfy')body={url:state.url,canChange:true};
   else if(u.pathname==='/api/me/routing')body={global:{useLocal:true},pins:{}};
   else if(u.pathname==='/api/hardware')body={tier:'unknown'};
   else if(u.pathname==='/api/accounts')body={accounts:[{provider:'comfy',balanceUsd:0}]};
   else if(u.pathname==='/api/tools')body=[];
   else throw Error('Unexpected API '+u.pathname);
   if(state.fail===u.pathname){if(state.network)return route.abort();return route.fulfill({status:state.status||500,contentType:'application/json',body:state.badJson?'not-json':state.nullJson?'null':JSON.stringify({error:state.error || 'Fixture '+u.pathname+' failed. Try again.'})});}
   await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(`${origin}/setup-fixture`);await page.waitForSelector('#wizard');assert.equal(await page.evaluate(()=>fetch('/api/health').then(r=>r.json()).then(j=>j.backend)),'mock');
  return {page,context,writes,state};
 }
 const click=async(p:any,id:string)=>p.getByTestId(id).click();
 const wait=async(p:any,id:string,text:string)=>{await p.getByTestId(id).filter({hasText:text}).waitFor();};
 const begin=async(f:any)=>{await f.page.click('#wizard');await click(f.page,'setup-opt-gpu');await wait(f.page,'setup-gpu','Found ComfyUI');};
 const baseline=!!process.env.SETUP_BASELINE;
 {
  const f=await fixture();await begin(f);assert.equal(f.writes.length,1,'Probe alone must not save/enable');await click(f.page,'setup-done');await wait(f.page,'setup-next-step','Saved');
  const order=f.writes.map((w:any)=>w.path);results.push({case:'detected Desktop 8000',order});
  await f.page.screenshot({path:path.join(evidence,baseline?'before-wizard.png':'after-wizard.png')});
  if(baseline)assert.ok(!order.includes('/api/local/comfy'),'Reproduced missing URL persistence');else {assert.deepEqual(order,['/api/local/comfy/test','/api/local/comfy','/api/me/routing','/api/setup']);assert.equal(f.writes[1].body.url,'http://127.0.0.1:8000');}
  await f.context.close();
 }
 {
  const f=await fixture({fail:'/api/me/routing'});await f.page.click('#connect');await click(f.page,'cs-find');
  if(baseline){await wait(f.page,'cs-local-status','Found ComfyUI');assert.equal(await f.page.getByTestId('cs-close').innerText(),'Done, back to Generate');}
  else {await wait(f.page,'cs-local-status','routing');assert.equal(await f.page.getByTestId('cs-close').innerText(),'Not now');assert.ok(!f.writes.some((w:any)=>w.path==='/api/setup'));}
  await f.page.screenshot({path:path.join(evidence,baseline?'before-routing-error.png':'after-routing-error.png')});results.push({case:'connect routing failure',writes:f.writes});await f.context.close();
 }
 if(!baseline){
  for(const endpoint of ['/api/local/comfy','/api/me/routing','/api/setup'])for(const mode of ['403','500','badJSON','nullJSON','network']){
   const f=await fixture({fail:endpoint,status:mode==='403'?403:mode.endsWith('JSON')?200:500,badJson:mode==='badJSON',nullJson:mode==='nullJSON',network:mode==='network'});await f.page.click('#connect');await click(f.page,'cs-find');await wait(f.page,'cs-local-status','Couldn’t');assert.equal(await f.page.getByTestId('cs-close').innerText(),'Not now');f.state.fail='';await click(f.page,'cs-find');await wait(f.page,'cs-local-status','Found ComfyUI');results.push({case:'connect '+endpoint+' '+mode+' retry',writes:f.writes});await f.context.close();
  }
  for(const endpoint of ['/api/local/comfy','/api/me/routing','/api/setup'])for(const mode of ['403','500','badJSON','nullJSON','network']){
   const f=await fixture({fail:endpoint,status:mode==='403'?403:mode.endsWith('JSON')?200:500,badJson:mode==='badJSON',nullJson:mode==='nullJSON',network:mode==='network'});await begin(f);await click(f.page,'setup-done');await f.page.getByTestId('setup-error').waitFor();assert.equal(await f.page.evaluate(()=>localStorage.getItem('ohf:setup:seen')),null);assert.equal(await f.page.getByTestId('setup-next-step').count(),0);
   f.state.fail='';await click(f.page,'setup-done');await wait(f.page,'setup-next-step','Saved');assert.equal(await f.page.evaluate(()=>localStorage.getItem('ohf:setup:seen')),'1');results.push({case:endpoint+' '+mode+' retry',writes:f.writes});await f.context.close();
  }
  for(const host of ['wizard','connect']){
   for(const opts of [{unreachable:true},{fail:'/api/local/comfy/test',status:403},{fail:'/api/local/comfy/test',badJson:true,status:200},{fail:'/api/local/comfy/test',network:true}]){
    const f=await fixture(opts);await f.page.click('#'+host);await click(f.page,host==='wizard'?'setup-opt-gpu':'cs-find');await wait(f.page,host==='wizard'?'setup-gpu':'cs-local-status',opts.unreachable?(host==='wizard'?'reachable':'didn’t find'):'Couldn’t test');assert.equal(f.writes.length,1);await f.context.close();results.push({case:host+' probe failure',opts});
   }
  }
  for(const host of ['wizard','connect']){
   const f=await fixture({existing:true,url:'http://127.0.0.1:9191/custom'});await f.page.click('#'+host);if(host==='connect')await click(f.page,'cs-find');await wait(f.page,host==='wizard'?'setup-gpu':'cs-local-status','Found ComfyUI');if(host==='wizard')await click(f.page,'setup-done');await f.page.waitForTimeout(100);assert.ok(!f.writes.some((w:any)=>w.path==='/api/local/comfy'));results.push({case:host+' existing address unchanged',writes:f.writes});await f.context.close();
  }
  for(const host of ['wizard','connect']){
   const f=await fixture({unreachable:host==='connect'});await f.page.click('#'+host);await click(f.page,host==='wizard'?'setup-opt-gpu':'cs-find');await wait(f.page,host==='wizard'?'setup-gpu':'cs-local-status',host==='wizard'?'Found ComfyUI':'didn’t find');f.state.unreachable=false;f.state.url='http://localhost:9191/custom-path';await f.page.getByTestId(host==='wizard'?'setup-addr':'cs-addr').fill(f.state.url);if(host==='wizard'){await f.page.getByRole('button',{name:'Check connection',exact:true}).click();await wait(f.page,'setup-gpu','Found');await click(f.page,'setup-done');await wait(f.page,'setup-next-step','Saved');}else{await f.page.getByRole('button',{name:'Use this address',exact:true}).click();await wait(f.page,'cs-local-status','Found');}assert.equal(f.writes.find((w:any)=>w.path==='/api/local/comfy').body.url,f.state.url);results.push({case:host+' custom URL',writes:f.writes});await f.context.close();
  }
  {
   const f=await fixture({delay:350});await f.page.click('#wizard');await click(f.page,'setup-opt-gpu');await click(f.page,'setup-opt-gpu');await f.page.waitForTimeout(500);assert.equal(await f.page.getByTestId('setup-gpu').count(),0);assert.equal(f.writes.length,1);await click(f.page,'setup-opt-comfy');await f.page.getByTestId('setup-key-comfy').fill('synthetic-fixture-only');f.state.fail='/api/setup';await click(f.page,'setup-done');await f.page.getByTestId('setup-error').waitFor();f.state.fail='';await click(f.page,'setup-done');await wait(f.page,'setup-next-step','Saved');assert.equal(f.writes.filter((w:any)=>w.path==='/api/settings/providers').length,1);assert.ok(!f.writes.some((w:any)=>w.path==='/api/me/routing'));results.push({case:'deselect probe + cloud-only retry without duplicate key saves',writes:f.writes});await f.context.close();
  }
  {
   const f=await fixture();await begin(f);await click(f.page,'setup-opt-comfy');await f.page.getByTestId('setup-key-comfy').fill('synthetic-fixture-only');await click(f.page,'setup-done');await wait(f.page,'setup-next-step','Saved');assert.deepEqual(f.writes.find((w:any)=>w.path==='/api/setup').body.choices.sort(),['comfy','gpu']);results.push({case:'multiple choices',writes:f.writes});await f.context.close();
  }
  for(const host of ['wizard','connect']){
   const f=await fixture({delay:350});await f.page.click('#'+host);await click(f.page,host==='wizard'?'setup-opt-gpu':'cs-find');await f.page.keyboard.press('Escape');await f.page.waitForTimeout(500);assert.ok(!f.writes.some((w:any)=>w.path==='/api/me/routing'||w.path==='/api/local/comfy'));assert.equal(await f.page.getByTestId(host==='wizard'?'run-setup':'connect-sheet').count(),0);await f.page.click('#'+host);assert.equal(await f.page.getByTestId(host==='wizard'?'setup-next-step':'cs-local-status').count(),0);results.push({case:host+' cancel and reopen',writes:f.writes});await f.context.close();
  }
  {
   const f=await fixture({fail:'/api/setup'});await f.page.click('#connect');await f.page.getByTestId('cs-key').fill('synthetic-fixture-only');await click(f.page,'cs-key-save');await wait(f.page,'cs-key-status','couldn’t save setup');assert.equal(await f.page.getByTestId('cs-close').innerText(),'Not now');f.state.fail='';await click(f.page,'cs-key-save');await wait(f.page,'cs-key-status','$0.00');assert.equal(f.writes.filter((w:any)=>w.path==='/api/settings/providers').length,1);results.push({case:'zero balance accepted + key setup retry',writes:f.writes});await f.context.close();
  }
  for(const host of ['wizard','connect']){
   const f=await fixture({url:'http://127.0.0.1:8188/'+ 'long-workspace-path-'.repeat(12),fail:'/api/setup',error:'The fixture could not store setup for '+ 'long-server-detail-'.repeat(25)+'. Try again.'});await f.page.click('#'+host);await click(f.page,host==='wizard'?'setup-opt-gpu':'cs-find');if(host==='wizard'){await wait(f.page,'setup-gpu','Found');await click(f.page,'setup-done');await f.page.getByTestId('setup-error').waitFor();}else await wait(f.page,'cs-local-status','couldn’t save setup');
   await f.page.setViewportSize({width:390,height:844});await f.page.evaluate(()=>{const d=document.querySelector('.rs-body') || document.querySelector('[role=dialog]')!;d.scrollTop=d.scrollHeight;});assert.ok(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await f.page.screenshot({path:path.join(evidence,`after-${host}-long-error-390.png`)});results.push({case:host+' long URL/error',error:await f.page.getByTestId(host==='wizard'?'setup-error':'cs-local-status').innerText(),writes:f.writes});await f.context.close();
  }
  for(const host of ['wizard','connect']){
   const f=await fixture({fail:host==='wizard'?'/api/setup':'/api/me/routing'});await f.page.click('#'+host);await click(f.page,host==='wizard'?'setup-opt-gpu':'cs-find');if(host==='wizard'){await wait(f.page,'setup-gpu','Found');await click(f.page,'setup-done');await f.page.getByTestId('setup-error').waitFor();}else await wait(f.page,'cs-local-status','routing');
   const measurements=[];
   for(const [width,height] of [[1440,900],[1280,720],[390,844]]){
    await f.page.setViewportSize({width,height});
    await f.page.evaluate(()=>{const d=document.querySelector('.rs-body') || document.querySelector('[role=dialog]')!;d.scrollTop=d.scrollHeight;});
    await f.page.screenshot({path:path.join(evidence,`after-${host}-error-${width}.png`)});
    const m=await f.page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,dialog:document.querySelector('[role=dialog]')!.getBoundingClientRect().toJSON(),action:document.querySelector('[data-testid=setup-done],[data-testid=cs-close]')!.getBoundingClientRect().toJSON(),error:document.querySelector('[data-testid=setup-error],[data-testid=cs-local-status]')!.getBoundingClientRect().toJSON()}));
    assert.ok(m.scroll<=width);assert.ok(m.action.bottom<=height&&m.action.top>=0,'Action visible');assert.ok(m.error.bottom<=m.action.top,'Error above action');measurements.push(m);
   }
   results.push({case:host+' responsive errors',measurements});await f.context.close();
  }
 }
 fs.writeFileSync(path.join(evidence,baseline?'before.json':'after.json'),JSON.stringify(results,null,2));console.log(`PASS ${baseline?'baseline reproductions':results.length+' fixture cases'}`);
} finally {await browser?.close();await server.close();}
