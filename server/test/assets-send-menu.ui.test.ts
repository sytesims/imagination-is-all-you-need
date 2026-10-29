/** Real History, real Chromium, synthetic keyless data; no API server or provider calls. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createServer } from 'vite';
import { openPage } from './_cdp';

const root = path.resolve(import.meta.dirname, '../..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'assets-send-'));
const evidence = process.env.ASSETS_SEND_EVIDENCE;
const before = process.env.ASSETS_SEND_BEFORE === '1';
const fixture = path.join(scratch, 'fixture.tsx');
const image = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#28535b"/><stop offset="1" stop-color="#191525"/></linearGradient></defs><path fill="url(#g)" d="M0 0h640v640H0z"/><circle cx="320" cy="300" r="140" fill="#bda37b"/><path d="M0 540 180 350 360 540 510 420 640 560v80H0" fill="#213e40"/></svg>');
const videoFile = path.join(scratch,'fixture.mp4');
execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=0x28535b:s=320x240:r=8','-t','1','-c:v','libx264','-pix_fmt','yuv420p',videoFile]);
const video = fs.readFileSync(videoFile);
fs.symlinkSync(path.join(root, 'node_modules'),path.join(scratch,'node_modules'));
fs.writeFileSync(fixture, `
import React from 'react';
import {createRoot} from 'react-dom/client';
import History from '${root}/web/src/platform/History.tsx';
import {usePath} from '${root}/web/src/platform/router.tsx';
import {navigate} from '${root}/web/src/platform/router.tsx';
import ResultView from '${root}/web/src/shared/ResultView.tsx';
import '${root}/web/src/pageStyles.ts';
import '${root}/web/src/tokens.css';
import '${root}/web/src/styles.css';
import '${root}/web/src/ui-states.css';
const tools = Array.from({length:32},(_,i)=>({id:i===31?'three-d':'target-'+i,name:i===31?'Image to 3D':i===30?'A very long tool name that must truncate without widening the submenu':'Tool '+String(i).padStart(2,'0'),media:i%3===0?'image':i%3===1?'video':'audio',ui:'image',route:'/tools/fixture-'+i,inputs:[{name:'image',kind:'file'}],providers:[],stages:[],workflows:[],gpuSecPerSec:{}}));
tools.push(...['video','audio'].map(kind=>({...tools[0],id:kind+'-only',name:kind+' target',media:kind,route:'/tools/fixture-'+kind,inputs:[{name:kind==='audio'?'sound':'video',kind:'file',accept:kind+'/*'}]})),{...tools[0],id:'text-only',name:'Invalid text target',inputs:[]});
const jobs=['image','video','audio','3d'].map((kind,i)=>({id:kind,toolId:kind==='3d'?'unknown-model-source':'target-0',status:'done',resultUrl:'/fixture.'+['png','mp4','wav','glb'][i],outputs:[{kind,url:'/fixture.'+['png','mp4','wav','glb'][i]}],input:{prompt:'Synthetic '+kind+' result'},createdAt:Date.now(),warnings:[],progress:100}));
window.__writes=[]; window.__nav=[];
window.fetch=async (url,opts={})=>{if(opts.method && opts.method!=='GET'){window.__writes.push(String(url));throw Error('Writes forbidden');}const u=String(url); const body=u.includes('/api/jobs?')?{items:u.includes('state=active')?[]:jobs,nextCursor:null}:u.includes('/api/projects')?[]:u.includes('/api/assets/counts')?{all:4,byMedia:{image:1,video:1,audio:1}}:u.includes('/api/jobs/')?jobs.find(j=>u.includes('/'+j.id))||{}:u.includes('/api/config')?{trashDays:30}:{};return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});};
localStorage.clear();localStorage.setItem('oj:assets-tip','1');
history.replaceState({},'', '/assets');
const push=history.pushState.bind(history);history.pushState=(s,t,u)=>{window.__nav.push(String(u));push(s,t,u);};
function Fixture(){const p=usePath();return p.startsWith('/tools/')?<input autoFocus aria-label="Destination"/>:<><History tools={tools}/>{p==='/jobs/video'&&<ResultView job={jobs[1]} beforeUrl="" title="Synthetic video" tools={tools} variant="viewer" onClose={()=>navigate('/assets')}/>}</>;}
createRoot(document.getElementById('root')).render(<Fixture/>);
`);
const server = await createServer({ configFile: path.join(root, 'web/vite.config.ts'), root: path.join(root, 'web'), cacheDir: path.join(scratch, 'vite-cache'), server: { port: 5291, host: '127.0.0.1', strictPort: true, fs: { allow: [root, scratch] } }, plugins: [{ name: 'assets-send-fixture', enforce:'pre', load(id) { if(before && id===path.join(root,'web/src/platform/History.tsx'))return execFileSync('git',['show','734d7d16:web/src/platform/History.tsx'],{cwd:root,encoding:'utf8'}); }, configureServer(s) { s.middlewares.use(async (req, res, next) => { if (req.url !== '/assets') return next(); res.setHeader('Content-Type', 'text/html'); res.end(await s.transformIndexHtml('/assets', `<html><body><div id="root"></div><script type="module" src="/@fs${fixture}"></script></body></html>`)); }); } }] });
let page: Awaited<ReturnType<typeof openPage>>;
const measurements: unknown[] = [];
try {
  await server.listen(); page = await openPage(); assert.ok(page, 'Existing headless Chromium required (no download)');
  await page.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  page.on(m => { if (m.method === 'Runtime.exceptionThrown') console.error(m.params.exceptionDetails); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.error(m.params.args); });
  page.on(m => {
    if (m.method !== 'Fetch.requestPaused') return; const p = m.params, u = new URL(p.request.url), requestId = p.requestId;
    const local = u.hostname === '127.0.0.1' && u.port === '5291';
    if (local && (u.pathname === '/fixture.png' || u.pathname === '/api/media/thumb')) { void page!.send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'image/svg+xml'}],body:image.toString('base64')}); return; }
    if (local && u.pathname === '/fixture.mp4') { void page!.send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'video/mp4'}],body:video.toString('base64')}); return; }
    const blocked = !local || /\/(api|files|samples)\//.test(u.pathname) || p.request.method !== 'GET';
    void page!.send(blocked ? 'Fetch.failRequest' : 'Fetch.continueRequest', blocked ? {requestId,errorReason:'BlockedByClient'} : {requestId});
  });
  await page.send('Fetch.enable', {patterns:[{urlPattern:'*'}]});
  const key = async (key: string) => { const code = ({Enter:13,Escape:27,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40} as Record<string,number>)[key]; await page!.send('Input.dispatchKeyEvent', {type:'keyDown',key,windowsVirtualKeyCode:code,...(key==='Enter'?{text:'\r'}:{})}); await page!.send('Input.dispatchKeyEvent', {type:'keyUp',key,windowsVirtualKeyCode:code}); };
  const wait = async (expr: string) => { const ok=await page!.waitFor(expr); if(!ok)console.error(await page!.eval('({active:document.activeElement?.outerHTML,menus:[...document.querySelectorAll(".apop")].map(e=>e.outerHTML.slice(0,600)),path:location.pathname})')); assert.ok(ok, expr); };
  for (const [width,height] of [[1440,900],[1280,720],[390,844]]) {
    await page.send('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:false}); await page.goto('http://127.0.0.1:5291/assets');
    await wait('document.querySelector("[data-testid=asset-more-image]")');
    await page.click('[data-testid=asset-more-image]'); await wait('document.querySelector("[data-testid=am-send-image]")');
    const hover = await page.eval(`(()=>{const r=document.querySelector('[data-testid=am-send-image]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await page.send('Input.dispatchMouseEvent', {type:'mouseMoved',...hover});
    await new Promise(r=>setTimeout(r,250));
    assert.equal(await page.eval('!!document.querySelector("[data-testid=am-send-list-image]")'), false, 'Hover must not activate Send to');
    const parentHeight = await page.eval('document.querySelector(".as-pop-asset").getBoundingClientRect().height');
    await page.click('[data-testid=am-send-image]'); await wait('document.querySelector("[data-testid=am-send-list-image]")');
    if (evidence) {fs.mkdirSync(evidence,{recursive:true}); await page.screenshot(path.join(evidence, `${before?'before':'after'}-${width}x${height}.png`));}
    measurements.push(await page.eval(`(()=>{const rect=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,scroll:e.scrollHeight,client:e.clientHeight}};return {width:innerWidth,height:innerHeight,parent:rect('.as-pop-asset'),submenu:rect('[data-testid=am-send-list-image]'),list:rect('.asset-send-results')||rect('.am-send-list'),toolbar:rect('#asset-image .asset-tools'),nativeGridControls:document.querySelectorAll('.asset video[controls]').length}})()`));
    if (before) continue;
    assert.ok(await page.eval(`(()=>{const r=document.querySelector('.asset-send-menu').getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&document.documentElement.scrollWidth<=innerWidth})()`),'Viewport bounded');
    if(width>=640)assert.equal(await page.eval('document.querySelector(".as-pop-asset").getBoundingClientRect().height'),parentHeight,'Parent stays compact');
    assert.equal(await page.eval('!!document.querySelector(".as-pop-asset [data-testid=am-send-list-image]")'),false,'Separate portal');
    assert.equal(await page.eval('document.querySelectorAll(".asset-send-results [role=menuitem]").length'),32,'Only valid image targets');
    await page.eval('document.querySelector(".asset-send-results").scrollTop=9999');
    assert.ok(await page.eval('document.querySelector(".asset-send-results").scrollTop>0'),'Internal scroll');
    assert.ok(await page.eval(`!!document.querySelector('[role=group][aria-label="3D tools"]')`),'3D grouping');
    await wait('document.activeElement?.getAttribute("aria-label")==="Find a tool"');
    await page.send('Input.insertText',{text:'not-a-tool'}); await wait('document.querySelector("[data-testid=am-send-list-image]")?.textContent.includes("No tool matches")');
    await key('ArrowLeft'); assert.equal(await page.eval('!!document.querySelector("[data-testid=am-send-list-image]")'),true,'Left edits search');
    await key('Home'); assert.equal(await page.eval('document.activeElement?.getAttribute("aria-label")'),'Find a tool','Search Home is text editing, not menu navigation');
    await page.eval('document.querySelector(".asset-send-menu input").select()'); await page.send('Input.insertText',{text:'A very long tool name'});
    await wait('document.querySelectorAll(".asset-send-results [role=menuitem]").length===1');
    assert.ok(await page.eval(`(()=>{const e=document.querySelector('.asset-send-results .am-l');return e.scrollWidth>e.clientWidth})()`),'Long name bounded with full title');
    await key('Escape'); await wait('!document.querySelector("[data-testid=am-send-list-image]")'); await wait('document.activeElement?.dataset.testid==="am-send-image"');
    await key('ArrowRight'); await wait('document.activeElement?.getAttribute("aria-label")==="Find a tool"');
    await key('Escape'); await key('Escape'); await wait('!document.querySelector(".as-pop-asset")'); await wait('document.activeElement?.dataset.testid==="asset-more-image"');
    await page.click('[data-testid=asset-more-image]'); await page.click('[data-testid=am-send-image]');
    await page.click('[data-testid=am-send-target-0]'); await wait('document.querySelector("[aria-label=Destination]")');
    assert.equal(await page.eval('window.__nav.filter(u=>u.includes("fromJob=image")).length'),1,'One handoff');
    await new Promise(r=>setTimeout(r,100)); assert.equal(await page.eval('document.activeElement?.getAttribute("aria-label")'),'Destination','No delayed focus theft');
    assert.deepEqual(await page.eval('window.__writes'),[]);
  }
  if(!before) {
    const bounds = async (label: string) => {
      const m = await page!.eval(`(()=>{const el=document.querySelector('.asset-send-menu'),r=el.getBoundingClientRect(),p=document.querySelector('.as-pop-asset').getBoundingClientRect(),t=document.querySelector('#asset-image .asset-tools').getBoundingClientRect();return {label:${JSON.stringify(label)},sheet:el.classList.contains('asset-send-sheet'),width:innerWidth,height:innerHeight,rect:{x:r.x,y:r.y,w:r.width,h:r.height},parent:{x:p.x,y:p.y,w:p.width,h:p.height},toolbar:{x:t.x,y:t.y,w:t.width,h:t.height},overflow:document.documentElement.scrollWidth>innerWidth,overlap:r.x<t.right&&r.right>t.left&&r.y<t.bottom&&r.bottom>t.top}})()`);
      measurements.push(m); assert.ok(m.rect.x>=0 && m.rect.y>=0 && m.rect.x+m.rect.w<=m.width && m.rect.y+m.rect.h<=m.height, label+' bounds'); assert.equal(m.overflow,false,label+' page overflow'); if(!m.sheet)assert.equal(m.overlap,false,label+' protected toolbar');
    };
    await page!.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false}); await page!.goto('http://127.0.0.1:5291/assets'); await wait('document.querySelector("[data-testid=asset-more-image]")');
    // Exercise real layout at the bottom/right edge, not a mocked rect.
    await page!.eval(`{const e=document.querySelector('#asset-image');e.style.cssText='position:fixed;right:8px;bottom:8px;width:230px;height:230px;z-index:2';}`);
    await page!.click('[data-testid=asset-more-image]'); await page!.click('[data-testid=am-send-image]'); await wait('document.activeElement?.getAttribute("aria-label")==="Find a tool"'); await bounds('right-bottom-edge');
    if(evidence)await page!.screenshot(path.join(evidence,'after-right-bottom-edge.png'));
    await page!.send('Emulation.setDeviceMetricsOverride',{width:640,height:480,deviceScaleFactor:1,mobile:false}); await wait('document.querySelector(".asset-send-sheet")'); await bounds('640-short-sheet');
    if(evidence)await page!.screenshot(path.join(evidence,'after-640x480.png'));
    await page!.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false}); await wait('document.querySelector(".asset-send-sheet")'); await bounds('resize-phone');
    await key('Escape'); await key('Escape'); await wait('!document.querySelector(".as-pop-asset")');
    assert.notEqual(await page!.eval('document.body.style.overflow'),'hidden','Scroll unlock after resize/close');
    await page!.goto('http://127.0.0.1:5291/assets'); await wait('document.querySelector("[data-testid=asset-more-video]")');
    // Actual ResultView adjacent flow: Open closes the gallery menu before viewer playback controls appear.
    await page!.click('[data-testid=asset-more-video]'); await page!.click('[data-testid=asset-menu-video] a'); await wait('document.querySelector("[data-testid=result-viewer]")');
    assert.equal(await page!.eval('!!document.querySelector(".as-pop-asset")'),false,'No gallery menu over actual viewer');
    assert.ok(await page!.eval('!!document.querySelector(".rvx video")'),'Real viewer video rendered');
    if(evidence)await page!.screenshot(path.join(evidence,'after-adjacent-video-viewer.png'));
    await key('Escape'); await wait('!document.querySelector(".rvx")');
    for(const kind of ['video','audio']) {
      await page!.click('[data-testid=asset-more-'+kind+']'); await wait('document.querySelector("[data-testid=am-send-'+kind+']")');
      await page!.eval('document.querySelector("[data-testid=am-send-'+kind+']").focus()'); await key('ArrowRight'); await wait('document.activeElement?.getAttribute("aria-label")==="Find a tool"');
      assert.deepEqual(await page!.eval('[...document.querySelectorAll(".asset-send-results [role=menuitem]")].map(e=>e.dataset.testid)'),['am-send-'+kind+'-only'],'Reopened type-specific targets');
      await key('ArrowDown'); await key('ArrowLeft'); await wait('!document.querySelector(".asset-send-menu")');
      await wait('document.activeElement?.dataset.testid==="am-send-'+kind+'"');
      await key('Enter'); await wait('document.querySelector(".asset-send-menu")');
      await page!.send('Input.dispatchMouseEvent',{type:'mousePressed',x:2,y:2,button:'left',clickCount:1}); await page!.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:2,y:2,button:'left',clickCount:1}); await wait('!document.querySelector(".as-pop-asset") && !document.querySelector(".asset-send-menu")');
    }
    await page!.click('[data-testid=asset-more-3d]'); assert.equal(await page!.eval('!!document.querySelector("[data-testid=am-send-3d]")'),false,'Unknown GLB medium has no invented targets'); await key('Escape');
  }
  if(evidence)fs.writeFileSync(path.join(evidence,`${before?'before':'after'}-measurements.json`),JSON.stringify(measurements,null,2));
  console.log(`${before?'Baseline reproduced':'Assets Send to UI checks passed'} (1440×900, 1280×720, 390×844)`);
} finally { await page?.close(); await server.close(); fs.rmSync(scratch,{recursive:true,force:true}); }
