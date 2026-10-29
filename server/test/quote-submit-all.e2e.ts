// P0 (BUG-HUNT-7): quote and submit resolve the route with ONE shared resolver. For EVERY tool and app in /api/tools: quote with default
// params (uploads marked as on submit), submit with quotedRouteId + quotedCredits → never 409 route_changed; on 200 the routeId and credits match.
// Run: npx tsx test/quote-submit-all.e2e.ts (port 8976; temp data dir, no keys, mock backend).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'qsa-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' };
const PORT = testPort(8976); const B = `http://localhost:${PORT}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_MAX_QUEUED: '500', OPENHIGGSFIELD_HOSTED: '' }, stdio: 'ignore', detached: true });
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a]);
const MP4 = path.join(D, 'clip.mp4'); ff('-f', 'lavfi', '-i', 'testsrc2=size=854x480:rate=24', '-f', 'lavfi', '-i', 'sine=d=4', '-t', '4', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', MP4);
const PNG = path.join(D, 'img.png'); ff('-f', 'lavfi', '-i', 'testsrc2=size=768x768', '-frames:v', '1', PNG);
const WAV = path.join(D, 'a.wav'); ff('-f', 'lavfi', '-i', 'sine=d=4', '-ar', '44100', WAV);
const fileFor = (accept = '', name = '') => /video/.test(accept) || /video|clip|source/i.test(name) && !/image|audio/.test(accept) ? [MP4, 'video/mp4'] : /audio/.test(accept) || /audio|voice|speech/i.test(name) ? [WAV, 'audio/wav'] : [PNG, 'image/png'];
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const tl = (await (await fetch(`${B}/api/tools`)).json()) as any; const tools: any[] = Array.isArray(tl) ? tl : tl.tools;
  const bad: string[] = []; let checked = 0, ran = 0; const skipped: string[] = []; const ids: [string, string, string][] = [];
  for (const t of tools) {
    const fields: Record<string, string> = { rights: '1' }; const files: [string, string, string][] = [];
    for (const inp of t.inputs ?? []) {
      if (inp.kind === 'file' && inp.required) { const [f, ty] = fileFor(inp.accept, inp.name); files.push([inp.name, f, ty]); }
      else if (inp.kind === 'text' && inp.required) fields[inp.name] = 'a calm test scene';
      else if (inp.kind === 'select' && inp.required) fields[inp.name] = String(inp.default ?? inp.options?.[0]?.value ?? t.presets?.[0]?.id ?? '');
      else if (inp.kind === 'files' && inp.name === 'refs' && /swap|motion/.test(t.id)) files.push(['refs', PNG, 'image/png']); // swap tools need ≥1 reference
      else if (inp.kind === 'file' && inp.name === 'mask') files.push(['mask', PNG, 'image/png']);
    }
    if (!fields.prompt) fields.prompt = 'a calm test scene';
    if (t.presets?.length && !fields.types) fields.types = JSON.stringify([t.presets[0].id]); // default mode / type, as the UI preselects
    for (const inp of t.inputs ?? []) if (inp.kind === 'file' && !inp.required && /^(image|video)$/.test(inp.name) && !files.some(([n]) => n === inp.name)) { // apps that need their source upload
      const need = /image/.test(inp.accept ?? '') ? 'image' : 'video'; if ((t.app?.input ?? '').includes(need) || /^app-/.test(t.id)) { const [f, ty] = fileFor(inp.accept, inp.name); files.push([inp.name, f, ty]); } }
    const qs = new URLSearchParams(Object.entries(fields).filter(([k]) => k !== 'rights')); for (const [n] of files) qs.set(n, '1'); // upload markers, as the 409 fresh quote and POST /price use
    const qr = await fetch(`${B}/api/tools/${t.id}/price?${qs}`); const q = (await qr.json()) as any; checked++;
    if (qr.status >= 400 || typeof q.credits !== 'number' || !q.routeId) { skipped.push(`${t.id}: quote ${qr.status} ${q.error ?? q.reason ?? ''}`.slice(0, 160)); continue; }
    const fd = new FormData(); for (const [k, v] of Object.entries({ ...fields, quotedRouteId: q.routeId, quotedCredits: String(q.credits) })) fd.append(k, v);
    for (const [n, f, ty] of files) fd.append(n, new Blob([fs.readFileSync(f)], { type: ty }), path.basename(f));
    const r = await fetch(`${B}/api/tools/${t.id}/jobs`, { method: 'POST', body: fd }); const b = (await r.json()) as any;
    if (r.status === 409 && b.error === 'route_changed') { bad.push(`${t.id}: quote ${q.routeId}/${q.credits} → submit now ${b.quote?.routeId}/${b.quote?.credits}`); continue; }
    if (r.status === 200) { ran++; ids.push([t.id, b.id, b.route]); if (b.route !== q.routeId || b.cost !== q.credits) bad.push(`${t.id}: 200 but route ${b.route}/${b.cost} vs quote ${q.routeId}/${q.credits}`); }
    else skipped.push(`${t.id}: submit ${r.status} ${b.error ?? ''}`.slice(0, 160));
  }
  // LOW-ROWS app variants (uploads switch the mode / engine; app defaults pick the length): quote = submit for each
  const variants: [string, Record<string, string>, string[]][] = [
    ['app-product-shot', { scene: 'marble' }, []], ['app-product-shot', { scene: 'kitchen' }, ['image']],
    ['app-transition', { transition: 'morph' }, ['image', 'lastFrame']], ['app-transition', { duration: '10' }, ['image', 'lastFrame']],
    ['app-ugc-ad', { presenter: 'cafe-table', hook: 'question' }, []], ['app-ugc-ad', {}, ['image']], ['app-ugc-ad', {}, ['image', 'presenterImage']],
    ['app-ugc-ad', { provider: 'router-veo' }, []], ['app-ugc-ad', { provider: 'router-kling' }, []],
    ['app-orbit-shot', { orbit: 'arc-right' }, ['image']], ['app-orbit-shot', { duration: '10', provider: 'comfy-funcamera' }, ['image']],
    ['app-relight', { direction: 'left', color: '#5FD3C6', brightness: '20' }, ['image']],
    // Camera Moves without a start image (text-to-video routes only; Auto never picks an image-only route)
    ['camera', { types: '["ltx-dolly-in"]', duration: '5' }, []], ['camera', { types: '["ltx-jib-up"]', provider: 'cloud-ltx-camera', duration: '3' }, []],
    ['camera', { types: '["push-in"]', duration: '5' }, []], ['camera', { types: '["orbit"]', provider: 'api-minimax-h3', duration: '8' }, []],
  ];
  let vran = 0;
  for (const [id, f0, up] of variants) {
    const fields: Record<string, string> = { prompt: 'a calm test scene', ...f0 }; const qs = new URLSearchParams(fields); for (const n of up) qs.set(n, '1');
    const qr = await fetch(`${B}/api/tools/${id}/price?${qs}`); const q = (await qr.json()) as any; if (!qr.ok) { bad.push(`${id} ${JSON.stringify(f0)}: quote ${qr.status} ${q.error}`); continue; }
    const fd = new FormData(); for (const [k, v] of Object.entries({ rights: '1', ...fields, quotedRouteId: q.routeId, quotedCredits: String(q.credits) })) fd.append(k, v);
    for (const n of up) fd.append(n, new Blob([fs.readFileSync(PNG)], { type: 'image/png' }), `${n}.png`);
    const r = await fetch(`${B}/api/tools/${id}/jobs`, { method: 'POST', body: fd }); const b = (await r.json()) as any;
    if (r.status !== 200) bad.push(`${id} ${JSON.stringify(f0)} +${up}: submit ${r.status} ${b.error}${b.quote ? ` now ${b.quote.routeId}/${b.quote.credits} vs ${q.routeId}/${q.credits}` : ''}`);
    else if (b.route !== q.routeId || b.cost !== q.credits) bad.push(`${id} ${JSON.stringify(f0)}: route ${b.route}/${b.cost} vs quote ${q.routeId}/${q.credits}`); else { vran++; ids.push([id, b.id, b.route]); }
  }
  console.log(`app variants: ${vran}/${variants.length} quote = charge`);
  // BH10 P1-4: every route that ran names its engine (job.modelName / model): never empty, never a generic label
  await new Promise((r) => setTimeout(r, 1500)); const named: string[] = []; const GENERIC = /^(open weights|auto|opensoul|local comfyui|comfy cloud|this computer|fal|replicate|demo)$/i;
  const EXPECT: [RegExp, RegExp][] = [[/^remove-bg@.*bria/i, /Bria/], [/^reframe@.*ray-2/i, /Luma Ray 2/], [/^app-anime-restyle@comfy-open/, /Wan 2\.1 VACE/], [/^soul@.*(fal|replicate)/, /Z-Image-Turbo.*LoRA/]];
  for (const [tid, jid, route] of ids) {
    const j = (await (await fetch(`${B}/api/jobs/${jid}`)).json()) as any; const nm = String(j.modelName ?? '').trim();
    if (!nm || GENERIC.test(nm) || nm !== j.model) bad.push(`${tid} ${route}: modelName "${nm}" (model "${j.model}")`); else named.push(`${tid} ${route} → ${nm}`);
    for (const [k, re] of EXPECT) if (k.test(`${tid}@${route}`) && !re.test(nm)) bad.push(`${tid} ${route}: modelName "${nm}" should match ${re}`);
  }
  console.log(`modelName on ${named.length}/${ids.length} runs:\n  ` + named.join('\n  '));
  // BH10 P2: /api/jobs never returns a host path (refBatches, *Path) of this data dir
  { const all = await (await fetch(`${B}/api/jobs?limit=500`)).text(); if (all.includes(D)) { // name every key that carries it, so the fix knows where to look
    const where = new Set<string>(); const walk = (o: any, at: string): void => { if (typeof o === 'string') { if (o.includes(D)) where.add(at.replace(/\[\d+\]/g, '[]')); } else if (Array.isArray(o)) o.forEach((v, i) => walk(v, `${at}[${i}]`)); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, `${at}.${k}`); };
    walk(JSON.parse(all), '$'); bad.push(`/api/jobs leaks the data dir path (${D}) at ${[...where].join(', ') || '(unknown key)'}`); } }
  console.log(`checked ${checked} tools/apps, ${ran} submitted 200 with matching route+credits`); if (skipped.length) console.log('not submitted (validation, not route_changed):\n  ' + skipped.join('\n  '));
  assert.deepEqual(bad, [], 'quote/submit route mismatch:\n' + bad.join('\n'));
  assert.ok(ran >= tools.length * 0.6, `too few tools ran (${ran}/${tools.length})`);
  console.log('ALL OK quote-submit-all');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); try { fs.rmSync(D, { recursive: true, force: true }); } catch { /* the server was still writing: leave the temp dir */ } }
