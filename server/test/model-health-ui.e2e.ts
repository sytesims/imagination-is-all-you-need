// Video model health check, UI half: a headless click-through, front to back (own mock API + Vite web, no keys, nothing spent).
// For every video tool × model × mode the bar offers: open the page with that model (and mode), add tiny generated inputs, type a prompt, press
// Generate, then check the request reached the backend with the right fields (provider = the model, types = the mode), the job was created,
// the in-progress card showed in the feed and the mock result card landed. Failures get a screenshot in $MODEL_HEALTH_DIR/shots.
// Writes $MODEL_HEALTH_DIR/ui.json for scripts/model-health-report.mjs. Chromium: the headless shell Playwright caches (test/_cdp.ts); skipped without it.
// Ports: MODEL_HEALTH_API_PORT / MODEL_HEALTH_WEB_PORT (default testPort(8812) / 5195 alone, testPort(9195) in the parallel runner).
// Run: npx tsx test/model-health-ui.e2e.ts   (MODEL_HEALTH_ONLY=<tool id> narrows it)
import { testPort } from './_ports.js'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { openPage, findChromium } from './_cdp.js'; import { VIDEO_TOOLS, CAPS_TOOLS, knownFor } from './_model-health.js';
const ROOT = path.resolve(import.meta.dirname, '..'); const WEB = path.resolve(ROOT, '../web'); const t0 = Date.now();
if (!findChromium()) { console.log('skip: no Chromium headless shell (npx playwright install chromium-headless-shell)'); console.log('model-health-ui: ALL OK (skipped)'); process.exit(0); }
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'mhui-')); const OUT = process.env.MODEL_HEALTH_DIR ?? path.join(os.tmpdir(), 'model-health'); const SHOTS = path.join(OUT, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const API = Number(process.env.MODEL_HEALTH_API_PORT) || testPort(8812); const WPORT = Number(process.env.MODEL_HEALTH_WEB_PORT) || (process.env.TEST_PORT_OFFSET ? testPort(9195) : 5195);
const A = `http://127.0.0.1:${API}`; const W = `http://127.0.0.1:${WPORT}`;
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_USE_LOCAL: '',
  OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_LTX_API_KEY: '', OPENHIGGSFIELD_ARK_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_LUMA_API_KEY: '' };
const procs: ChildProcess[] = [];
procs.push(spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, ...NOKEYS, PORT: String(API), HOST: '127.0.0.1', OPENHIGGSFIELD_DATA_DIR: D,
  OPENHIGGSFIELD_ENV_FILE: path.join(D, 'server.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '600', OPENHIGGSFIELD_MAX_QUEUED: '500', OPENHIGGSFIELD_MOCK_RENDER: 'copy',
  OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0', COMFY_BASE_URL: 'http://127.0.0.1:9' } }));
procs.push(spawn('npx', ['vite', '--host', '127.0.0.1'], { cwd: WEB, detached: true, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, WEB_PORT: String(WPORT), OPENHIGGSFIELD_API_PROXY: A } }));
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a]);
const PNG = path.join(D, 'a.png'); ff('-f', 'lavfi', '-i', 'testsrc2=size=1280x720', '-frames:v', '1', PNG);
const PNG2 = path.join(D, 'b.png'); ff('-f', 'lavfi', '-i', 'color=c=orange:s=1280x720', '-frames:v', '1', PNG2);
const MP4 = path.join(D, 'v.mp4'); ff('-f', 'lavfi', '-i', 'testsrc2=size=854x480:rate=24', '-f', 'lavfi', '-i', 'sine=d=5', '-t', '5', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', MP4);
const MP3 = path.join(D, 'a.mp3'); ff('-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', MP3);
const sl = (ms: number) => new Promise((r) => setTimeout(r, ms));
const up = async (u: string) => { for (let i = 0; i < 240; i++) { try { if ((await fetch(u)).ok) return true; } catch { /* */ } await sl(500); } return false; };
const { VIDEO_WORKFLOWS } = await import('../src/shared/videoWorkflows.ts') as any;

type UiRow = { tool: string; engine: string; model: string; mode: string; status: 'pass' | 'fail' | 'skip'; why: string; shot?: string; jobId?: string };
const rows: UiRow[] = []; let failed = 0;
try {
  if (!(await up(`${A}/api/health`)) || !(await up(`${W}/`))) throw new Error('API or web did not start');
  const health = await (await fetch(`${W}/api/health`)).json(); if (health.backend !== 'mock') throw new Error(`not on the mock backend: ${health.backend}`);
  const tools: any[] = await (await fetch(`${A}/api/tools`)).json();
  type Case = { tool: any; p: any; mode: string; file?: string };
  const cases: Case[] = [];
  for (const id of VIDEO_TOOLS) { if (process.env.MODEL_HEALTH_ONLY && !process.env.MODEL_HEALTH_ONLY.split(',').includes(id)) continue; const t = tools.find((x) => x.id === id); if (!t) continue; const g = t.app?.gallery;
    const tj = (x: any) => { try { return JSON.parse(x)[0]; } catch { return null; } };
    const am: { mode: string; file?: string }[] | null = g ? [...(tj(g.locked?.types) ? [{ mode: tj(g.locked.types) }] : []), ...Object.entries<any>(g.modeWhenFile ?? {}).map(([file, v]) => ({ mode: tj(v), file })).filter((x, k, l) => l.findIndex((y) => y.mode === x.mode) === k)] : null;
    for (const p of t.providers) { const pm: string[] | undefined = t.app?.providerModes?.[p.id];
      const modes = am?.length ? am.filter((x) => !pm || pm.includes(x.mode)) : CAPS_TOOLS.has(id) ? (pm ?? []).map((mode) => ({ mode })) : [{ mode: '' }];
      for (const m of modes) cases.push({ tool: t, p, ...m }); } }
  console.log(`${cases.length} UI cases (tool × model × mode)`);
  const pg = (await openPage())!; await pg.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('ohf:setup:seen','1')}catch(e){}" });
  const posts: { id: string; url: string }[] = []; const resp = new Map<string, number>();
  pg.on((m: any) => { if (m.method === 'Network.requestWillBeSent' && m.params.request.method === 'POST' && /\/api\/tools\/[^/]+\/jobs$/.test(m.params.request.url)) posts.push({ id: m.params.requestId, url: m.params.request.url });
    if (m.method === 'Network.responseReceived' && /\/api\/tools\/[^/]+\/jobs$/.test(m.params.response.url)) resp.set(m.params.requestId, m.params.response.status); });
  for (const c of cases) {
    const row: UiRow = { tool: c.tool.id, engine: c.p.id, model: c.p.modelKey ?? c.p.id, mode: c.mode, status: 'fail', why: '' }; rows.push(row); const tag = `${c.tool.id} ${c.p.id} ${c.mode}`.trim();
    const bad = async (why: string) => { row.why = why; console.log(`fail ${tag}: ${why}`); row.shot = path.join(SHOTS, `${tag.replace(/[^a-z0-9.-]+/gi, '_')}.png`); try { await pg.screenshot(row.shot); } catch { /* */ } };
    try {
      if (c.tool.id === 'cinema') { row.status = 'skip'; row.why = 'Director has no screen (removed from the app 2026-10-23; API and old jobs only)'; continue; }
      if (c.tool.id === 'make-it-real') { row.status = 'skip'; row.why = 'Direct a Shot Render starts from a staged 3D preview (planJob); covered by test/make-it-real.test.ts'; continue; }
      { const lq = c.p.routes?.every((r: any) => r.kind === 'local') ? await (await fetch(`${A}/api/tools/${c.tool.id}/price?provider=${encodeURIComponent(c.p.id)}`)).json().catch(() => null) : null;
        if (lq && lq.routeKind === 'local' && lq.runnable === false) { row.status = 'skip'; row.why = `local, not runnable on this computer: ${String(lq.reason ?? lq.reasonCode ?? '').slice(0, 100)}`; continue; } }
      const wf = VIDEO_WORKFLOWS.find((w: any) => w.toolId === c.tool.id && w.id !== 'create');
      const presetIds = (c.tool.presets ?? []).map((x: any) => x.id); const fits = (x: any) => !x.providers?.length || x.providers.includes(c.p.id);
      const preset = c.tool.id === 'camera' ? (/ltx/.test(c.p.modelKey ?? '') ? 'ltx-dolly-in' : (c.tool.presets ?? []).find(fits)?.id ?? '') : ['photo-fx', 'restyle', 'object-swap'].includes(c.tool.id) ? ((c.p.modes ?? []).find((m: string) => presetIds.includes(m)) ?? (c.tool.presets ?? []).find((x: any) => !x.providers?.length || x.providers.includes(c.p.id))?.id ?? '') : '';
      const url = c.tool.id === 'h3-video' ? `/tools/h3-video?model=${encodeURIComponent(c.p.id)}${c.mode ? `&mode=${c.mode}` : ''}` : wf ? `/tools/h3-video?workflow=${wf.id}&model=${encodeURIComponent(c.tool.id === 'camera' ? c.p.modelKey ?? c.p.id : c.p.id) /* Camera: one engine serves two models (Wan Fun Camera, LTX-2 19B): name the model */}${preset ? `&preset=${encodeURIComponent(preset)}` : ''}` : `/tools/${c.tool.id}?model=${encodeURIComponent(c.p.id)}`;
      posts.length = 0; resp.clear();
      try { await pg.eval("location.origin.startsWith('http') && (localStorage.clear(), sessionStorage.clear(), localStorage.setItem('ohf:setup:seen', '1'))"); } catch { /* about:blank */ } // every case starts from a fresh bar (no saved prompt, files or model)
      await pg.goto(`${W}${url}`);
      if (!(await pg.waitFor('document.querySelector("[data-testid=vs-generate], button[data-testid*=generate]")', 15000))) { await bad('no Generate button on the page'); continue; }
      await sl(900);
      // pick the model in the menu like a user (rows the menu shows directly; versions inside a group stay on the deep link)
      const nm = JSON.stringify(String(c.p.displayName ?? c.p.name ?? ''));
      const markRow = () => pg.eval<boolean>(`(() => { const rows = [...document.querySelectorAll('[data-testid="vs-model-${c.p.id}"]')]; const r = rows.find((e) => e.textContent.includes(${nm})) ?? rows[0]; if (!r) return false; r.setAttribute('data-mhrow', '1'); return true; })()`); // one engine, two models (Camera: Wan Fun Camera, LTX-2 19B): the row with this model's name
      const pickRow = async () => { if (!(await pg.click('[data-testid=vs-model]'))) return false; await sl(500); if (await markRow()) { await pg.click('[data-mhrow="1"]'); await sl(600); return true; } await pg.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sl(400); return false; };
      if (!(await pickRow()) && /swap/.test(c.tool.id) && await pg.click('[data-testid=vbar-group-swap]')) { await sl(400); await pg.click('[data-testid=vbar-opt-swapType-object]'); await sl(500); await pickRow(); } // the model list follows the swap type (person / object)
      // inputs: Create Video's own pickers, else the workflow bar's slots, else any file input the page has
      const studio = await pg.eval<boolean>('!!document.querySelector("[data-testid=vs-start-input]")');
      if (studio && c.tool.id === 'h3-video') {
        if (['i2v', 'flf', 'r2v'].includes(c.mode)) await pg.setFiles('[data-testid=vs-start-input]', [PNG]);
        if (c.mode === 'flf') await pg.setFiles('[data-testid=h3-last-frame-input]', [PNG2]);
        if (c.mode === 'r2v') await pg.setFiles('[data-testid=vs-ref-input]', [PNG2]);
      } else {
        const need = new Set<string>([...(c.tool.inputs ?? []).filter((i: any) => i.kind === 'file' && i.required).map((i: any) => i.name), ...(c.file ? [c.file] : []),
          ...(['camera', 'photo-fx', 'app-orbit-shot'].includes(c.tool.id) ? ['image'] : []), ...(/swap|motion/.test(c.tool.id) ? ['refs'] : []), ...(c.tool.id === 'app-transition' ? ['image', 'lastFrame'] : [])]);
        const slots: { sel: string; accept: string; name: string }[] = await pg.eval(`[...document.querySelectorAll('input[type=file]')].map((e, k) => { const t = e.dataset.testid || ''; const name = (t.match(/^vbar-slot-(.+)-input$/) || [])[1] || e.name || ''; if (!e.dataset.mhk) e.dataset.mhk = String(k); return { sel: '[data-mhk="' + e.dataset.mhk + '"]', accept: e.accept || '', name }; })`);
        const named = slots.some((s) => s.name); for (const s of slots) { if (s.name && !need.has(s.name)) continue; if (!s.name && (named || !need.size)) continue;
          const f = /video/.test(s.accept) && !/image/.test(s.accept) ? MP4 : /audio/.test(s.accept) && !/image|video/.test(s.accept) ? MP3 : s.name === 'lastFrame' ? PNG2 : /video/.test(s.accept) && /video|clip/i.test(s.name) ? MP4 : PNG;
          await pg.setFiles(s.sel, [f]); await sl(400); }
      }
      await sl(700);
      const TA = 'textarea#app-prompt, textarea[data-testid=vbar-prompt], [data-testid=vbar-prompt] textarea, main textarea';
      const esc = () => pg.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      if (c.tool.id === 'reshoot' && await pg.click('[data-testid=vbar-group-angles]')) { await sl(500); await pg.click('[data-testid=rs-pad-left-side]'); await sl(300); await esc(); await sl(300); } // one new angle
      if (/swap/.test(c.tool.id)) { if (!(await pg.eval<boolean>('!!document.querySelector("[data-testid=vbar-target]")'))) { await pg.click('[data-testid=vbar-group-replace]'); await sl(500); }
        if (await pg.eval<boolean>('!!document.querySelector("[data-testid=vbar-target]")')) { await pg.click('[data-testid=vbar-target]'); await pg.send('Input.insertText', { text: 'the person on the left' }); await pg.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sl(400); } }
      if (await pg.eval<boolean>(`!!document.querySelector(${JSON.stringify(TA)})`)) { await pg.click(TA); await pg.eval('document.execCommand("selectAll")'); await pg.send('Input.insertText', { text: 'A lighthouse on a calm sea at dusk, slow wide shot' }); }
      const genState = () => pg.eval<{ disabled: boolean; setup: boolean; why: string } | null>(`(() => { const b = document.querySelector('[data-testid=vs-generate]') || document.querySelector('button[data-testid*=generate]'); return b ? { disabled: b.disabled || b.getAttribute('aria-disabled') === 'true', setup: b.dataset.needsSetup === '1' || /set up a place|provider key/i.test(b.textContent + ' ' + (b.dataset.why || '') + ' ' + (b.title || '')), why: b.dataset.why || b.title || b.textContent.slice(0, 120) } : null; })()`);
      let gen = await genState();
      if (gen?.disabled && /Pick (a|an) (camera move|effect|style)/i.test(gen.why) && preset) { // a model-specific move (H3 camera LoRA, LTX moves) picked in the gallery itself
        const grp = await pg.eval<string | null>(`(document.querySelector('[data-testid=vbar-group-move], [data-testid=vbar-group-effect], [data-testid=vbar-group-style]') || {}).dataset?.testid || null`);
        if (grp) { await pg.click(`[data-testid=${grp}]`); await sl(600); await pg.click(`[data-testid="vbar-look-${preset}"]`); await sl(500); await pg.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sl(800); gen = await genState(); } } for (let i = 0; i < 40 && gen?.disabled && !gen.setup; i++) { await sl(200); gen = await genState(); } // file checks and the quote settle
      if (gen?.disabled && /Say who|Name the object/i.test(gen.why) && await pg.click('[data-testid=vbar-group-replace]')) { await sl(500); // the swap target, in the words the bar asks for
        if (await pg.click((await pg.eval<boolean>('!!document.querySelector("[data-testid=vbar-target]")')) ? '[data-testid=vbar-target]' : '[data-testid=mask-prompt]' /* object swap: describe it */)) { await pg.eval('document.execCommand("selectAll")'); await pg.send('Input.insertText', { text: /object/i.test(gen.why) ? 'the red mug on the table' : 'the person on the left' }); }
        await pg.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sl(800); gen = await genState(); }
      if (gen?.disabled && /price unavailable/i.test(gen.why) && (c.p.routes ?? []).some((r: any) => r.kind === 'local') && await (async () => { const q = await (await fetch(`${A}/api/tools/${c.tool.id}/price?${new URLSearchParams({ provider: c.p.id, ...(c.p.modelKey ? { model: c.p.modelKey } : {}), image: '1', video: '1' })}`)).json().catch(() => null); return q?.routeKind === 'local' && q?.runnable === false; })()) { row.status = 'skip'; row.why = 'local, not runnable on this computer (no price shown)'; continue; }
      if (!gen) { await bad('Generate button gone'); continue; }
      if (gen.setup) { row.status = 'skip'; row.why = `needs a key for this place (no sample run): ${gen.why.slice(0, 100)}`; continue; }
      if (gen.disabled) { await bad(`Generate is blocked: ${gen.why}`); continue; }
      await pg.click((await pg.eval<boolean>('!!document.querySelector("[data-testid=vs-generate]")')) ? '[data-testid=vs-generate]' : 'button[data-testid*=generate]');
      for (let i = 0; i < 60 && !posts.length; i++) await sl(100);
      if (!posts.length) { const msg = await pg.eval<string>(`[...document.querySelectorAll('[data-testid=vs-missing], [data-testid=vs-blocked], [role=alert], .toast, .apop, [role=dialog]')].map((e) => e.textContent.trim()).filter(Boolean).join(' / ').slice(0, 300)`); await bad(`Generate sent no request${msg ? `: ${msg.slice(0, 140)}` : ''}`); continue; }
      const post = posts[0]; let body = ''; try { body = (await pg.send('Network.getRequestPostData', { requestId: post.id })).postData ?? ''; } catch { /* large upload: no post data kept */ }
      const field = (n: string) => body.match(new RegExp(`name="${n}"\\r?\\n\\r?\\n([^\\r\\n]*)`))?.[1] ?? null;
      if (!post.url.endsWith(`/api/tools/${c.tool.id}/jobs`)) { await bad(`request went to ${post.url}`); continue; }
      if (body) { const pv = field('provider') ?? field('model'); if (pv && pv !== c.p.id && pv !== c.p.modelKey) { await bad(`request names model ${pv}, picked ${c.p.id}`); continue; }
        if (c.mode && CAPS_TOOLS.has(c.tool.id) && !c.tool.app?.gallery) { const ty = field('types'); if (ty && !ty.includes(`"${c.mode}"`)) { await bad(`request mode ${ty}, picked ${c.mode}`); continue; } } }
      for (let i = 0; i < 60 && !resp.has(post.id); i++) await sl(100);
      const st = resp.get(post.id); let id = ''; try { id = JSON.parse((await pg.send('Network.getResponseBody', { requestId: post.id })).body).id ?? ''; } catch { /* */ }
      if (st !== 200 || !id) { let txt = ''; try { txt = (await pg.send('Network.getResponseBody', { requestId: post.id })).body.slice(0, 160); } catch { /* */ } await bad(`submit answered ${st}: ${txt}`); continue; }
      row.jobId = id;
      const card = `[data-testid="vf-tile-${id}"]`;
      if (!(await pg.waitFor(`document.querySelector('${card}')`, 6000))) { await bad('no in-progress card for the job in the feed'); continue; }
      if (!(await pg.waitFor(`(() => { const t = document.querySelector('${card}'); return t && /st-done/.test(t.className) && t.querySelector('video, img'); })()`, 45000))) {
        const cls = await pg.eval<string>(`(document.querySelector('${card}') || {}).className || ''`); await bad(`result card did not land (${cls})`); continue; }
      row.status = 'pass';
    } catch (e: any) { await bad(`threw: ${String(e?.message ?? e).slice(0, 160)}`); }

  }
  await pg.close();
  fs.writeFileSync(path.join(OUT, 'ui.json'), JSON.stringify({ at: new Date().toISOString(), rows }, null, 1));
  const n = (s: string) => rows.filter((r) => r.status === s).length; console.log(`UI rows ${rows.length}: ${n('pass')} pass / ${n('fail')} fail`);
  const fresh = rows.filter((r) => r.status === 'fail' && !knownFor(`ui|${r.tool}|${r.engine}|${r.mode}`)); for (const r of rows) if (r.status === 'fail' && knownFor(`ui|${r.tool}|${r.engine}|${r.mode}`)) (r as any).known = true;
  fs.writeFileSync(path.join(OUT, 'ui.json'), JSON.stringify({ at: new Date().toISOString(), rows }, null, 1));
  if (fresh.length) { failed++; console.error(`${fresh.length} new UI findings (not in KNOWN)`); } else console.log('ok no new UI findings');
} catch (e) { failed++; console.error('FAIL', e); } finally { for (const p of procs) { try { process.kill(-p.pid!); } catch { /* */ } } fs.rmSync(D, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
console.log(`model-health-ui: ${failed ? 'FAILED' : 'ALL OK'} in ${((Date.now() - t0) / 1000).toFixed(0)} s`); process.exit(failed ? 1 : 0);
