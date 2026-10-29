// Focused, keyless component browser test. Uses existing Chromium only; never starts the API or contacts ComfyUI.
// Run: npx tsx test/workflow-dialog-ui.test.ts (one process). Optional WORKFLOW_DIALOG_WEB_PORT / WORKFLOW_DIALOG_SHOTS.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { findChromium, openPage } from './_cdp.js';
import { testPort } from './_ports.js';
import type { WorkflowInfo } from '../../web/src/shared/WorkflowDialog.js';

if (!findChromium()) { console.log('SKIP workflow-dialog-ui: existing Chromium not installed (nothing downloaded)'); process.exit(0); }
const root = path.resolve(import.meta.dirname, '../../web');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-dialog-ui-'));
const port = Number(process.env.WORKFLOW_DIALOG_WEB_PORT) || testPort(5287);
assert.ok(![5174, 8787, 8788, 8188].includes(port), 'Never use a live app/service port');
const graph = '{"42":{"class_type":"OpenAIGPTImageNodeV2","inputs":{"prompt":"original prompt — untouched","seed":123}}}\n';
const info: WorkflowInfo = {
  jobId: 'fixture', toolId: 'gpt-image', available: true, exact: false, source: 'partner',
  ranOn: { id: 'openai', label: 'OpenAI', kind: 'api' }, headline: 'Partner-node workflow for this provider call.',
  notes: ['Fixture source and licence attribution remains available.'],
  passes: [{ index: 0, label: 'Result', workflow: 'partner/OpenAIGPTImageNodeV2-long-workflow-name-with-original-settings-and-input-bindings.json', nodes: 1247, partnerNodes: ['OpenAIGPTImageNodeV2'], url: '/api/graph' }],
  media: [{ pass: 0, node: '42', field: 'image', file: 'long-original-reference-image-file-name-preserved-without-truncating-its-copyable-value.png', what: 'Load the original image.', how: 'ffmpeg -i original.mp4 frame-%04d.png' }],
  runtime: [{ pass: 0, node: '43', field: 'prompt', what: 'Use the original runtime prompt.' }],
  formats: { api: true, ui: false, uiNote: 'API-format JSON without a saved canvas layout.' },
  comfy: { url: 'http://127.0.0.1:8188', opensApiFormat: true, howTo: ['Open ComfyUI.', 'Load the JSON, add the inputs, then press Run.'], docs: 'https://docs.comfy.org' },
};
const fixtureHtml = `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react'; import {createRoot} from 'react-dom/client';
import {WorkflowDialog} from '/src/shared/WorkflowDialog.tsx'; import '/src/tokens.css'; import '/src/styles.css'; import '/src/ui-states.css'; import '/src/runon.css';
const style=document.createElement('style');style.textContent='body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font-ui)}*{box-sizing:border-box}.mp-scrim{position:fixed;inset:0;padding:24px;display:grid;place-items:center;background:rgba(0,0,0,.7)}';document.head.append(style);
window.fixture=${JSON.stringify(info)}; window.graph=${JSON.stringify(graph)};window.copied=[];window.opens=[];window.downloads=[];window.requests=[];window.mode='ok';
window.fetch=async input=>{const u=String(input);window.requests.push(u);if(u.includes('/workflow')){if(window.mode==='error')return new Response(JSON.stringify({error:'Fixture export failed'}),{status:500});return new Response(JSON.stringify(window.fixture));}if(u.includes('/api/graph'))return new Response(window.graph);throw new Error('Unexpected fixture request: '+u);};
Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{if(window.mode==='denied')throw Error('denied');window.copied.push(text)}}});
window.open=(...args)=>{window.opens.push(args);return window.mode==='blocked'?null:{}};
URL.createObjectURL=blob=>{window.downloads.push(blob);return 'blob:fixture'};URL.revokeObjectURL=()=>{};
document.addEventListener('click',e=>{if(e.target instanceof HTMLAnchorElement && e.target.download){window.downloadName=e.target.download;e.preventDefault()}});
function App(){const [open,setOpen]=React.useState(false);return React.createElement(React.Fragment,null,React.createElement('button',{id:'trigger',onClick:()=>setOpen(true)},'View workflow'),open&&React.createElement(WorkflowDialog,{jobId:'fixture',onClose:()=>setOpen(false)}))}
createRoot(document.getElementById('root')).render(React.createElement(App));
</script></body></html>`;
const server = await createServer({
  root, configFile: false, cacheDir: path.join(scratch, 'cache'), esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1', port, strictPort: true },
  optimizeDeps: { include: ['react', 'react-dom/client'] },
  plugins: [{ name: 'workflow-dialog-fixture', configureServer(s) { s.middlewares.use(async (req, res, next) => { if (req.url !== '/workflow-dialog-test') return next(); try { res.setHeader('Content-Type', 'text/html'); res.end(await s.transformIndexHtml('/workflow-dialog-test', fixtureHtml)); } catch (e) { next(e); } }); } }],
});
let page: Awaited<ReturnType<typeof openPage>> = null;
try {
  await server.listen(); page = await openPage(); assert.ok(page);
  await page.goto(`http://127.0.0.1:${port}/workflow-dialog-test`);
  assert.ok(await page.waitFor('document.querySelector("#trigger")'));
  const click = async (selector: string) => { assert.ok(await page!.click(selector), selector); };
  const status = async (text: string) => assert.ok(await page!.waitFor(`document.querySelector('[role=status]')?.textContent.includes(${JSON.stringify(text)})`), text);
  await click('#trigger'); assert.ok(await page.waitFor('document.querySelector("[data-testid=wf-download]")'));
  const contrast = await page.eval<{ muted: string; surface: string; ink: string; accent: string }>(`(()=>{const s=getComputedStyle(document.querySelector('.wf-sub')),d=getComputedStyle(document.querySelector('.wf-dlg')),b=getComputedStyle(document.querySelector('.wf-primary'));return {muted:s.color,surface:d.backgroundColor,ink:b.color,accent:b.backgroundColor}})()`);
  const luminance = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
  const ratio = (a: string, b: string) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  assert.ok(ratio(contrast.muted, contrast.surface) >= 4.5, 'Body copy contrast');
  assert.ok(ratio(contrast.ink, contrast.accent) >= 4.5, 'Primary action contrast');
  for (const [width, height] of [[1440, 900], [1280, 720], [390, 844]]) {
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await page.eval('document.querySelectorAll("details").forEach(el=>el.open=true)');
    assert.ok(await page.eval(`(()=>{const d=document.querySelector('[role=dialog]'),r=d.getBoundingClientRect(),f=d.querySelector('footer').getBoundingClientRect();return r.top>=0&&r.bottom<=${height}+1&&f.bottom<=${height}&&document.documentElement.scrollWidth<=${width}})()`), `${width}: viewport and pinned footer`);
    if (process.env.WORKFLOW_DIALOG_SHOTS) { fs.mkdirSync(process.env.WORKFLOW_DIALOG_SHOTS, { recursive: true }); await page.screenshot(path.join(process.env.WORKFLOW_DIALOG_SHOTS, `workflow-test-${width}.png`)); }
  }
  await page.eval('document.querySelector("[aria-label=Close]").focus()');
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', modifiers: 8 });
  assert.equal(await page.eval('document.activeElement.dataset.testid'), 'wf-open-comfy');
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab' });
  assert.equal(await page.eval('document.activeElement.getAttribute("aria-label")'), 'Close');
  await click('[data-testid=wf-download]'); await status('Workflow downloaded');
  assert.equal(await page.eval('window.downloads[0].text()'), graph);
  assert.match(await page.eval('window.downloadName'), /gpt-image-fixture-api\.json$/);
  assert.equal(await page.eval('new URL(window.requests.find(u=>u.includes("/api/graph")),location.href).searchParams.get("download")'), '0');
  await click('[data-testid=wf-copy]'); await status('Workflow JSON copied'); assert.equal(await page.eval('window.copied[0]'), graph);
  await click('[data-testid=wf-open-comfy]'); await status('ComfyUI opened'); assert.equal(await page.eval('window.opens[0][0]'), 'http://127.0.0.1:8188');
  await page.eval('window.mode="blocked"'); await click('[data-testid=wf-open-comfy]'); await status('Pop-up blocked');
  await page.eval('window.mode="denied"'); await click('[data-testid=wf-copy]'); await status('Clipboard access was blocked');
  await click('.wf-files button'); await status('Select and copy the command below');
  await page.eval('window.mode="ok"'); await click('.wf-files button'); await status('ffmpeg command copied');
  assert.equal(await page.eval('window.copied.at(-1)'), info.media[0].how);
  await page.eval('window.underlyingEsc=0;addEventListener("keydown",e=>{if(e.key==="Escape")window.underlyingEsc++})');
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  assert.ok(await page.waitFor('!document.querySelector("[role=dialog]")'));
  assert.equal(await page.eval('document.activeElement.id'), 'trigger'); assert.equal(await page.eval('window.underlyingEsc'), 0);
  await page.eval('window.fixture.source="rebuilt";window.fixture.exact=true'); await click('#trigger');
  assert.ok(await page.waitFor('document.querySelector("[data-testid=wf-badge]")?.textContent==="Rebuilt from settings"'));
  await click('[aria-label=Close]'); await page.eval('window.mode="error"'); await click('#trigger');
  assert.ok(await page.waitFor('document.querySelector("[role=alert]")'));
  await page.eval('window.mode="ok"'); await click('.wf-empty button'); assert.ok(await page.waitFor('document.querySelector("[data-testid=wf-download]")'));
  await click('[aria-label=Close]'); await page.eval('window.fixture.comfy.url=null'); await click('#trigger');
  assert.ok(await page.waitFor('document.querySelector("[data-testid=wf-open-comfy]")?.disabled'));
  assert.ok(await page.eval(`!!document.querySelector('a[href="/settings#conn-local"]')`));
  await click('[aria-label=Close]'); await page.eval('window.fixture.available=false;window.fixture.reason="Historical graph unavailable"'); await click('#trigger');
  assert.ok(await page.waitFor('document.querySelector("[data-testid=wf-unavailable]")?.textContent.includes("Historical graph unavailable")'));
  assert.equal(await page.eval('!!document.querySelector("[data-testid=wf-download]")'), false);
  await click('[aria-label=Close]');
  await page.eval('document.body.style.minHeight="2000px";scrollTo(0,300);document.querySelector("#trigger").focus({preventScroll:true});document.querySelector("#trigger").click()');
  assert.ok(await page.waitFor('document.querySelector("[role=dialog]")')); assert.equal(await page.eval('scrollY'), 300);
  await click('[aria-label=Close]'); assert.equal(await page.eval('scrollY'), 300);
  console.log(`Contrast: body ${ratio(contrast.muted, contrast.surface).toFixed(2)}:1; primary ${ratio(contrast.ink, contrast.accent).toFixed(2)}:1. Nonzero page scroll preserved.`);
  console.log('workflow-dialog-ui: PASS (3 viewport sizes; preserved JSON; captured open/copy; denied/blocked; inputs; Escape/focus; rebuilt; retry; setup; unavailable)');
} finally {
  await page?.close(); await server.close(); fs.rmSync(scratch, { recursive: true, force: true });
}
