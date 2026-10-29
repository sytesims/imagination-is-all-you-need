/* Actual /canvas built-in demo regression. Requires an already-running, isolated keyless mock API/UI and installed Chromium CDP.
   QA_BASE=http://127.0.0.1:5283 QA_CDP=http://127.0.0.1:9363 QA_SCREENSHOTS=/scratch node scripts/qa/canvas-agent-scroll.cjs
   Writes only a new mock board. Never point this at the user's app. No browser download, provider call or real generation. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const WebSocket = require('ws');
const base = process.env.QA_BASE; const cdp = process.env.QA_CDP;
assert.ok(base && cdp && !/:5174\b|:8787\b/.test(base), 'Supply isolated QA_BASE / QA_CDP, not the live app');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const health = await fetch(`${base}/api/health`).then(r => r.json());
  assert.equal(health.backend, 'mock'); assert.equal(health.comfyReady, false);
  const connections = await fetch(`${base}/api/settings/providers`).then(r => r.json());
  assert.ok(connections.providers.every(p => !p.configured && !p.mockedKey), 'QA sandbox must have zero configured keys/connections');
  const tabs = await fetch(`${cdp}/json/list`).then(r => r.json());
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));
  let seq = 0; const pending = new Map(); const errors = [];
  ws.on('message', bytes => { const m = JSON.parse(bytes); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text); });
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async expression => { const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); assert.ok(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const until = async expression => { for (let i = 0; i < 150; i++) { if (await ev(expression)) return; await sleep(100); } throw Error(`Timed out: ${expression}`); };
  const click = async selector => { await until(`!!document.querySelector(${JSON.stringify(selector)})`); const p = await ev(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); };
  const metrics = () => ev(`(()=>{const e=document.querySelector('.ap-feed'),c=document.querySelector('.ap-compose'),r=e.getBoundingClientRect();return {top:e.scrollTop,height:e.clientHeight,total:e.scrollHeight,y:r.y,bottom:r.bottom,compose:c.getBoundingClientRect().toJSON(),display:getComputedStyle(document.querySelector('[data-testid="agent-panel"]')).display}})()`);
  const wheel = async deltaY => { const m = await metrics(); await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 180, y: m.y + m.height / 2, deltaX: 0, deltaY }); await sleep(250); return metrics(); };
  const key = async key => { await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: { End: 35, Home: 36, PageDown: 34 }[key] }); await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key }); await sleep(350); };
  const screenshot = async name => { if (!process.env.QA_SCREENSHOTS) return; const { data } = await call('Page.captureScreenshot', { format: 'jpeg', quality: 65 }); fs.writeFileSync(`${process.env.QA_SCREENSHOTS}/${name}.jpg`, Buffer.from(data, 'base64')); };
  const report = [];
  try {
    await call('Runtime.enable'); await call('Page.enable');
    await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    // Load Audio first, then use the SPA link: a hard Canvas reload hides the CSS collision.
    await call('Page.navigate', { url: `${base}/audio` });
    await until(`!!document.querySelector('[data-testid="audio-page"]')`);
    await ev(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Skip for now')?.click()`);
    await click('a[href="/canvas"]'); await until(`!!document.querySelector('[data-testid="cv-switch"]')`); await sleep(1000);
    await click('[data-testid="cv-switch"]'); await click('[data-testid="cv-board-new"]');
    await until(`!!document.querySelector('[data-testid="agent-starter-product"]')`);
    if (await ev(`document.querySelector('[data-testid="agent-panel"]').getAttribute('aria-hidden')==='true'`)) await click('[data-testid="cv-agent-toggle"]');
    await sleep(1500); // editor bridge must finish opening the newly created board before demo POST
    await click('[data-testid="agent-starter-product"]');
    await until(`document.querySelectorAll('[data-testid="agent-toolcard"]').length>=1`);
    await sleep(150); const following = await metrics();
    assert.ok(following.total - following.height - following.top < 3, 'Live demo growth follows while already at latest');
    await wheel(-10000); const reading = await metrics();
    await until(`!!document.querySelector('[data-testid="agent-go"]')`); await sleep(1200);
    const stayed = await metrics(); assert.ok(Math.abs(stayed.top - reading.top) < 3, 'New cards / typed text must not pull the reader back down');
    assert.equal(stayed.display, 'flex'); assert.ok(stayed.total > stayed.height + 400);
    assert.ok(stayed.compose.bottom <= 720 && stayed.compose.y >= stayed.bottom - 1, 'Composer stays pinned below transcript');
    const down = await wheel(10000); assert.ok(down.top > 400, 'Wheel scrolls the actual transcript after Audio');
    await screenshot('canvas-agent-laptop-latest');
    // Only inspect sample proposal; never submit Go (even the mock run is unnecessary).
    assert.ok(await ev(`document.querySelector('[data-testid="agent-proposal-total"]').textContent==='Sample'`));
    assert.ok(await ev(`['agent-go','agent-cancel'].every(id=>{const r=document.querySelector('[data-testid="'+id+'"]').getBoundingClientRect(),e=document.querySelector('.ap-feed').getBoundingClientRect();return r.top>=e.top&&r.bottom<=e.bottom})`), 'Go and Cancel reachable');
    await ev(`document.querySelector('.ap-feed').focus()`); await key('Home'); const home = await metrics(); assert.ok(home.top < 3);
    await key('PageDown'); assert.ok((await metrics()).top > home.top + 100); await key('End');
    const end = await metrics(); assert.ok(end.total - end.height - end.top < 3);
    report.push({ viewport: '1280x720', reading, stayed, wheel: down, end });
    // Native scrollbar hit/drag, with persistent scrollbar width for headless macOS overlay scrollbars.
    await ev(`document.querySelector('.ap-feed').style.scrollbarWidth='auto';const s=document.createElement('style');s.textContent='.ap-feed::-webkit-scrollbar{width:12px}.ap-feed::-webkit-scrollbar-thumb{background:#777}';document.head.append(s);document.querySelector('.ap-feed').scrollTop=0`);
    await sleep(200); const drag = await ev(`(()=>{let e=document.querySelector('.ap-feed'),r=e.getBoundingClientRect();return {x:r.right-6,y:r.top+e.clientHeight*e.clientHeight/e.scrollHeight/2,bottom:r.bottom-10}})()`);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: drag.x, y: drag.y, button: 'left', clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: drag.x, y: drag.bottom, button: 'left', buttons: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: drag.x, y: drag.bottom, button: 'left' }); await sleep(300);
    assert.ok((await metrics()).top > 300, 'Scrollbar drag moves transcript');
    for (const [width, height] of [[1024, 600], [390, 844]]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await sleep(500);
      await wheel(-10000); assert.ok((await metrics()).top < 3); await wheel(10000); const m = await metrics();
      assert.ok(m.total - m.height - m.top < 3); assert.ok(m.compose.bottom <= height && m.height > 100);
      await screenshot(`canvas-agent-${width}-latest`); report.push({ viewport: `${width}x${height}`, ...m });
    }
    await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await wheel(-10000); const touchStart = await metrics();
    await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: touchStart.bottom - 40 }] });
    for (let i = 1; i <= 8; i++) { await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y: touchStart.bottom - 40 - i * 35 }] }); await sleep(25); }
    await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(400);
    assert.ok((await metrics()).top > 100, 'Touch swipe scrolls transcript');
    await call('Emulation.setTouchEmulationEnabled', { enabled: false });
    // A separate scripted starter reaches the free confirmation step, without Go or any model run.
    await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }); await sleep(500);
    await click('[data-testid="cv-switch"]'); await click('[data-testid="cv-board-new"]');
    await until(`!!document.querySelector('[data-testid="agent-starter-short"]')`); await sleep(1500);
    await click('[data-testid="agent-starter-short"]'); await until(`!!document.querySelector('[data-testid="agent-confirm"]')`);
    await wheel(-10000); const confirmReading = await metrics(); await sleep(1300);
    assert.ok(Math.abs((await metrics()).top - confirmReading.top) < 3, 'Confirmation never steals the reader scroll position');
    await wheel(10000); await sleep(1000); const typed = await metrics();
    assert.ok(typed.total - typed.height - typed.top < 3, 'Latest stays reachable after animated message growth');
    report.push({ confirmation: typed });
    assert.deepEqual(errors, []); console.log(JSON.stringify({ ok: true, report }, null, 2));
  } finally { ws.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
