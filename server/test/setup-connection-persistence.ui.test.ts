// Keyless real React/Chromium fixture for the first-run Welcome (ui/setup/WelcomeSteps: How → Connect → Ready) and the connect sheet.
// No API server, ComfyUI or provider traffic.
// Run sequentially: npx tsx test/setup-connection-persistence.ui.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { findChromium } from './_cdp.ts';
const require = createRequire(import.meta.url);
// Playwright is not a dependency and nothing is downloaded: skipped unless it (SETUP_PLAYWRIGHT, else a resolvable `playwright`) and a headless shell exist
const playwright = (() => { for (const id of [process.env.SETUP_PLAYWRIGHT, 'playwright', path.join(os.homedir(), '.npm/_npx/e41f203b7505f1fb/node_modules/playwright')]) { if (!id) continue; try { return require(id); } catch { /* next */ } } return null; })();
const chromiumPath = process.env.SETUP_CHROMIUM || findChromium();
if (!playwright || !chromiumPath) { console.log(`SKIP setup-connection-persistence: ${!playwright ? 'Playwright' : 'Chromium headless shell'} not installed (nothing downloaded)`); process.exit(0); }
const { chromium } = playwright;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-fixture-'));
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
const server = await createServer({root:path.resolve(import.meta.dirname,'../../web'),configFile:false,cacheDir:path.join(scratch,'cache'),esbuild:{jsx:'automatic'},server:{host:'127.0.0.1',port,strictPort:true},plugins:[{name:'setup-fixture',configureServer(s){s.middlewares.use(async(req,res,next)=>{if(!req.url?.startsWith('/setup-fixture'))return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/setup-fixture',html));});}}]});
let browser: any;
const results: any[] = [];
try {
 await server.listen();
 browser=await chromium.launch({headless:true,executablePath:chromiumPath});
 async function fixture(options: any = {}) {
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});const page=await context.newPage();
  const writes: any[]=[];const state={fail:options.fail || '',url:options.url || 'http://127.0.0.1:8000',keyCheck:'ok', ...options};
  await context.route('**/*',async(route: any)=>{const req=route.request();const u=new URL(req.url());if(u.origin!==origin)return route.abort();if(!u.pathname.startsWith('/api/')){if(/\.(png|jpg|webp|mp4|woff2?)$/.test(u.pathname))return route.abort();return route.continue();}
   const method=req.method();if(method!=='GET')writes.push({path:u.pathname,method,body:req.postDataJSON?.()});
   let body: any={};if(u.pathname==='/api/health')body={ok:true,backend:'mock'};
   else if(u.pathname==='/api/config')body={backend:'mock'};
   else if(u.pathname==='/api/setup')body=method==='GET'?{suggest:false,setup:state.existing?'local':'none',choices:[],keys:[]}:{done:true,choices:req.postDataJSON().choices};
   else if(u.pathname.startsWith('/api/settings/providers'))body={canStoreKeys:true,ok:true};
   else if(u.pathname==='/api/local/comfy/test'){if(state.delay)await new Promise(r=>setTimeout(r,state.delay));const typed=req.postDataJSON()?.url;body={reachable:!state.unreachable,url:typed||state.url,detected:!typed&&!state.existing,version:'fixture'};}
   else if(u.pathname==='/api/local/comfy')body={url:state.url,canChange:true};
   else if(u.pathname==='/api/me/routing')body={global:{useLocal:true},pins:{}};
   else if(u.pathname==='/api/hardware')body={tier:'unknown'};
   else if(u.pathname==='/api/accounts')body={accounts:[{provider:'comfy',balanceUsd:0,keyCheck:state.keyCheck}]};
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
 const paste=(p:any,id:string,text:string)=>p.getByTestId(id).evaluate((el:any,t:string)=>{el.focus();const dt=new DataTransfer();dt.setData('text/plain',t);el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));},text);
 const seen=(p:any)=>p.evaluate(()=>localStorage.getItem('ohf:setup:seen'));
 const paths=(f:any)=>f.writes.map((w:any)=>w.path);
 /** Open the Welcome, pick these ways and go to Connect. */
 const toConnect=async(f:any,picks:string[])=>{await f.page.click('#wizard');await f.page.getByTestId('wl-rec').waitFor();for(const id of picks)await click(f.page,'wl-opt-'+id);await click(f.page,'wl-next');};

 // ---------- Welcome (option A) ----------
 {
  const f=await fixture();await f.page.click('#wizard');await f.page.getByTestId('wl-rec').waitFor();
  for(const id of ['gpu','comfy','direct'])assert.equal(await f.page.getByTestId('wl-opt-'+id).getAttribute('aria-pressed'),'false','Nothing pre-picked');
  assert.ok(await f.page.getByTestId('wl-next').isDisabled(),'Continue waits for a pick');
  assert.equal(await f.page.getByTestId('wl-opt-gpu').getByTestId('wl-rec').count(),1,'ComfyUI found: your computer is recommended');
  assert.equal(await f.page.getByTestId('wl-gpu-bad').count(),0,'No error before anything was tried');
  await click(f.page,'wl-opt-gpu');await click(f.page,'wl-next');await wait(f.page,'wl-gpu-found','Found ComfyUI');
  assert.deepEqual(paths(f),['/api/local/comfy/test'],'The look alone saves nothing');
  await click(f.page,'wl-next');await f.page.getByTestId('wl-ready').waitFor();
  assert.deepEqual(paths(f),['/api/local/comfy/test','/api/local/comfy','/api/me/routing','/api/setup']);assert.equal(f.writes[1].body.url,'http://127.0.0.1:8000');assert.deepEqual(f.writes[3].body.choices,['gpu']);
  assert.equal(await seen(f.page),'1');await f.page.getByTestId('wl-try').waitFor();
  await f.page.keyboard.press('Escape');await f.page.waitForTimeout(100);assert.equal(await f.page.getByTestId('welcome-a').count(),0);assert.equal(paths(f).filter((p:string)=>p==='/api/setup').length,1,'Closing Ready saves nothing again');
  results.push({case:'pick → connect → ready (found)',writes:f.writes});await f.context.close();
 }
 {
  const f=await fixture({existing:true,url:'http://127.0.0.1:9191/custom'});await toConnect(f,['gpu']);await wait(f.page,'wl-gpu-found','Found');await click(f.page,'wl-next');await f.page.getByTestId('wl-ready').waitFor();
  assert.ok(!paths(f).includes('/api/local/comfy'),'An address already in use is not saved again');results.push({case:'existing address unchanged',writes:f.writes});await f.context.close();
 }
 {
  const f=await fixture({unreachable:true});await toConnect(f,['gpu']);
  assert.equal(await f.page.getByTestId('wl-opt-comfy').count(),0);await f.page.getByTestId('wl-gpu-missing').waitFor();assert.equal(await f.page.getByTestId('wl-addr').count(),0,'Address only behind the link');
  assert.ok(await f.page.getByTestId('wl-next').isDisabled());
  await click(f.page,'wl-other-addr');await f.page.getByTestId('wl-addr').fill('http://localhost:9191/nope');await f.page.getByTestId('wl-addr').press('Enter');await wait(f.page,'wl-gpu-bad','No answer');
  f.state.unreachable=false;await f.page.getByTestId('wl-addr').fill('http://localhost:9191/custom-path');await f.page.getByTestId('wl-addr').press('Enter');await wait(f.page,'wl-gpu-found','Found');
  await click(f.page,'wl-next');await f.page.getByTestId('wl-ready').waitFor();assert.equal(f.writes.find((w:any)=>w.path==='/api/local/comfy').body.url,'http://localhost:9191/custom-path');
  results.push({case:'not found → different address',writes:f.writes});await f.context.close();
 }
 {
  const f=await fixture({unreachable:true});await f.page.click('#wizard');await f.page.getByTestId('wl-rec').waitFor();assert.equal(await f.page.getByTestId('wl-opt-comfy').getByTestId('wl-rec').count(),1,'Not found: Comfy Cloud is recommended');
  await click(f.page,'wl-opt-comfy');await click(f.page,'wl-next');
  f.state.fail='/api/settings/providers';f.state.status=400;f.state.error='That doesn’t look like a Comfy Cloud key.';await paste(f.page,'wl-key-comfy','not-a-key-123');await wait(f.page,'wl-key-comfy-status','look like');assert.ok(await f.page.getByTestId('wl-next').isDisabled());
  f.state.fail='';f.state.keyCheck='rejected';await paste(f.page,'wl-key-comfy','comfyui-refused-fixture');await wait(f.page,'wl-key-comfy-status','wasn’t accepted');assert.ok(f.writes.some((w:any)=>w.method==='DELETE'&&w.path==='/api/settings/providers/comfy'),'A refused key is removed');
  f.state.keyCheck='ok';await paste(f.page,'wl-key-comfy','comfyui-good-fixture');await wait(f.page,'wl-key-comfy-status','$0.00');
  await click(f.page,'wl-next');await f.page.getByTestId('wl-ready').waitFor();assert.deepEqual(f.writes.find((w:any)=>w.path==='/api/setup').body.choices,['comfy']);assert.ok(!paths(f).includes('/api/me/routing'));
  results.push({case:'key check on paste: wrong format, refused, works',writes:f.writes});await f.context.close();
 }
 {
  const f=await fixture();await toConnect(f,['gpu','comfy']);await wait(f.page,'wl-gpu-found','Found');await click(f.page,'wl-back');assert.equal(await f.page.getByTestId('wl-opt-comfy').getAttribute('aria-pressed'),'true','Back keeps the picks');
  await click(f.page,'wl-next');await paste(f.page,'wl-key-comfy','comfyui-good-fixture');await wait(f.page,'wl-key-comfy-status','Key works');await click(f.page,'wl-next');await f.page.getByTestId('wl-ready').waitFor();
  assert.deepEqual([...f.writes.find((w:any)=>w.path==='/api/setup').body.choices].sort(),['comfy','gpu']);results.push({case:'two ways + back',writes:f.writes});await f.context.close();
 }
 {
  const f=await fixture({delay:300});await f.page.click('#wizard');await click(f.page,'wl-skip');await f.page.waitForTimeout(400);
  assert.equal(await f.page.getByTestId('welcome-a').count(),0);assert.equal(await seen(f.page),'1');assert.deepEqual(f.writes.find((w:any)=>w.path==='/api/setup').body.choices,[]);assert.ok(!paths(f).includes('/api/me/routing')&&!paths(f).includes('/api/local/comfy'));
  results.push({case:'look around first',writes:f.writes});await f.context.close();
 }
 {
  const f=await fixture({delay:300});await f.page.click('#wizard');await f.page.keyboard.press('Escape');await f.page.waitForTimeout(400);assert.equal(await f.page.getByTestId('welcome-a').count(),0);assert.ok(!paths(f).includes('/api/me/routing'));
  await f.page.click('#wizard');await f.page.getByTestId('welcome-a').waitFor();assert.equal(await f.page.getByTestId('wl-ready').count(),0,'Reopens at the start');results.push({case:'escape and reopen',writes:f.writes});await f.context.close();
 }
 for(const endpoint of ['/api/local/comfy','/api/me/routing','/api/setup'])for(const mode of ['500','badJSON','network']){
  const f=await fixture({fail:endpoint,status:mode==='badJSON'?200:500,badJson:mode==='badJSON',network:mode==='network'});await toConnect(f,['gpu']);await wait(f.page,'wl-gpu-found','Found');await click(f.page,'wl-next');await f.page.getByTestId('wl-error').waitFor();
  assert.equal(await seen(f.page),null);assert.equal(await f.page.getByTestId('wl-ready').count(),0);f.state.fail='';await click(f.page,'wl-next');await f.page.getByTestId('wl-ready').waitFor();assert.equal(await seen(f.page),'1');
  results.push({case:'save '+endpoint+' '+mode+' then retry',writes:f.writes});await f.context.close();
 }
 {
  const f=await fixture({unreachable:true});await toConnect(f,['gpu','comfy','direct']);await f.page.getByTestId('wl-gpu-missing').waitFor();await f.page.getByTestId('wl-chip-ltx').click();
  const measurements=[];
  for(const [width,height] of [[1440,900],[1280,720],[390,844],[1280,520]]){
   await f.page.setViewportSize({width,height});await f.page.waitForTimeout(100);
   const m=await f.page.evaluate(()=>Object.assign({scroll:document.documentElement.scrollWidth},...[['dialog','[role=dialog]'],['body','.wl-body'],['foot','.wl-foot'],['action','[data-testid=wl-next]']].map(([k,s])=>({[k]:document.querySelector(s)!.getBoundingClientRect().toJSON()}))));
   assert.ok(m.scroll<=width,'No sideways scroll');assert.ok(m.action.top>=0&&m.action.bottom<=height,'Continue visible');assert.ok(m.body.bottom<=m.foot.top+1,'Footer never covers the fields');
   await f.page.screenshot({path:path.join(evidence,`welcome-connect-${width}x${height}.png`)});measurements.push({width,height,...m});
  }
  results.push({case:'responsive connect step',measurements});await f.context.close();
 }

 // ---------- Connect sheet (Generate with nothing connected) ----------
 {
  const f=await fixture({fail:'/api/me/routing'});await f.page.click('#connect');await click(f.page,'cs-find');await wait(f.page,'cs-local-status','routing');assert.equal(await f.page.getByTestId('cs-close').innerText(),'Not now');assert.ok(!f.writes.some((w:any)=>w.path==='/api/setup'));
  results.push({case:'connect routing failure',writes:f.writes});await f.context.close();
 }
 for(const endpoint of ['/api/local/comfy','/api/me/routing','/api/setup'])for(const mode of ['403','500','badJSON','nullJSON','network']){
  const f=await fixture({fail:endpoint,status:mode==='403'?403:mode.endsWith('JSON')?200:500,badJson:mode==='badJSON',nullJson:mode==='nullJSON',network:mode==='network'});await f.page.click('#connect');await click(f.page,'cs-find');await wait(f.page,'cs-local-status','Couldn’t');assert.equal(await f.page.getByTestId('cs-close').innerText(),'Not now');f.state.fail='';await click(f.page,'cs-find');await wait(f.page,'cs-local-status','Found ComfyUI');results.push({case:'connect '+endpoint+' '+mode+' retry',writes:f.writes});await f.context.close();
 }
 for(const opts of [{unreachable:true},{fail:'/api/local/comfy/test',status:403},{fail:'/api/local/comfy/test',badJson:true,status:200},{fail:'/api/local/comfy/test',network:true}]){
  const f=await fixture(opts);await f.page.click('#connect');await click(f.page,'cs-find');await wait(f.page,'cs-local-status',opts.unreachable?'didn’t find':'Couldn’t test');assert.equal(f.writes.length,1);await f.context.close();results.push({case:'connect probe failure',opts});
 }
 {
  const f=await fixture({unreachable:true});await f.page.click('#connect');await click(f.page,'cs-find');await wait(f.page,'cs-local-status','didn’t find');f.state.unreachable=false;await f.page.getByTestId('cs-addr').fill('http://localhost:9191/custom-path');await f.page.getByRole('button',{name:'Use this address',exact:true}).click();await wait(f.page,'cs-local-status','Found');assert.equal(f.writes.find((w:any)=>w.path==='/api/local/comfy').body.url,'http://localhost:9191/custom-path');results.push({case:'connect custom URL',writes:f.writes});await f.context.close();
 }
 {
  const f=await fixture({fail:'/api/setup'});await f.page.click('#connect');await f.page.getByTestId('cs-key').fill('synthetic-fixture-only');await click(f.page,'cs-key-save');await wait(f.page,'cs-key-status','couldn’t save setup');assert.equal(await f.page.getByTestId('cs-close').innerText(),'Not now');f.state.fail='';await click(f.page,'cs-key-save');await wait(f.page,'cs-key-status','$0.00');assert.equal(f.writes.filter((w:any)=>w.path==='/api/settings/providers').length,1);results.push({case:'connect zero balance accepted + key setup retry',writes:f.writes});await f.context.close();
 }
 fs.writeFileSync(path.join(evidence,'after.json'),JSON.stringify(results,null,2));console.log(`PASS ${results.length} fixture cases`);
} finally {await browser?.close();await server.close();}
