// A canvas card keeps every setting its tool takes (2026-10-28). BUG: the Extend card kept only extendSeconds and direction, so an LTX-2.5
// Extend asked for at 576p over MCP ran and quoted at 448p (≈ $0.13 instead of $0.20). Now the Extend card has its resolution and (LTX-2.5)
// method and guide frames per model, and every flow keeps the other select / number inputs of its tool that the agent set (Create Video's
// quality, Text to Speech's speaker, Video Upscale's scene…), checked against the tool's own options. Quote = submit: both carry them.
// Own mock server (fake keys so cloud routes are priced). Run: cd server && npx tsx test/canvas-flow-settings.test.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { flowById, flowSpec, placeInputs, type GenCatalog } from '../../web/src/shared/genFlows.ts';
import { runForm } from '../../web/src/canvas/cardModel.ts';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(8901); const B = `http://localhost:${PORT}`;
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'cv-flowset-')), OPENHIGGSFIELD_ENV_FILE: path.join(os.tmpdir(), 'cv-flowset-none.env'),
  OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', COMFY_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '' }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const ok = (m: string) => console.log('ok ' + m);
const LTX = 'comfy-ltx25-extend', H3X = 'comfy-h3-extend';
const clip = { key: 'c', kind: 'video' as const, url: '/files/c.mp4', poster: '', jobId: 'j1', label: 'clip' };
try {
  for (let i = 0; i < 160; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
  const tools = await get('/api/tools'); const cat: GenCatalog = { tools, recipes: (await get('/api/image-workflows')).workflows, models: {} };
  const spec = (flow: string, provider: string | undefined, vals: Record<string, string>, inputs: typeof clip[] = []) => {
    const f = flowById(flow)!; const s0 = flowSpec(f, cat, { provider, vals, filled: {} })!; const pl = placeInputs(s0.slots, inputs);
    const s = flowSpec(f, cat, { provider, vals, filled: pl.bySlot })!; return { s, bySlot: placeInputs(s.slots, inputs).bySlot }; };
  const price = async (toolId: string, s: { provider: string; quote: Record<string, string> }) => get(`/api/tools/${toolId}/price?${new URLSearchParams({ provider: s.provider, ...s.quote })}`);

  // ---- the run from the bug: LTX-2.5 Extend, +5 s, picture-and-sound continuation, 576p ----
  { const { s, bySlot } = spec('extend', LTX, { extendSeconds: '5', extendMethod: 'continue', resolution: '576p' }, [clip]);
    assert.equal(s.provider, LTX); assert.equal(s.vals.resolution, '576p', 'the card keeps 576p'); assert.equal(s.vals.extendMethod, 'continue');
    assert.equal(s.quote.resolution, '576p', 'the quote asks for 576p'); assert.equal(s.quote.extendMethod, 'continue'); assert.equal(s.quote.extendSeconds, '5');
    const form = runForm(s, bySlot, [clip], 'next', { projectId: null, boardId: 'brd_x' });
    assert.equal(form.fields.resolution, '576p', 'the submit sends 576p'); assert.equal(form.fields.extendMethod, 'continue'); assert.equal(form.fields.provider, LTX);
    const q576 = await price('h3-extend', s); const q448 = await price('h3-extend', spec('extend', LTX, { extendSeconds: '5', extendMethod: 'continue' }, [clip]).s);
    assert.ok(typeof q576.cost?.estUsd === 'number' && typeof q448.cost?.estUsd === 'number', `both priced: ${JSON.stringify(q576).slice(0, 160)}`);
    assert.ok(q576.cost.estUsd > q448.cost.estUsd, `576p ($${q576.cost.estUsd}) costs more than the 448p default ($${q448.cost.estUsd})`);
    ok(`LTX-2.5 Extend at 576p: the card, its quote ($${q576.cost.estUsd}) and its submit keep 576p and the method (448p default: $${q448.cost.estUsd})`); }

  // ---- the Extend card's chips, per model ----
  { const ltx = spec('extend', LTX, {}).s; const fields = ltx.recipe.controls.map((c: any) => c.field);
    for (const f of ['extendSeconds', 'direction', 'resolution', 'extendMethod']) assert.ok(fields.includes(f), `LTX-2.5 Extend shows ${f}`);
    const opt = (s: any, f: string) => s.recipe.controls.find((c: any) => c.field === f)?.options.map((o: any) => o.value);
    assert.deepEqual(opt(ltx, 'resolution'), ['448p', '576p', '720p']); assert.equal(ltx.vals.resolution, '448p', 'its own default size');
    assert.deepEqual(opt(ltx, 'extendSeconds'), ['2', '3', '4', '5'], 'its own lengths'); assert.ok(!opt(ltx, 'direction').includes('backward'), 'LTX-2.5 extends forward only');
    assert.equal(ltx.recipe.controls.find((c: any) => c.field === 'resolution').options.find((o: any) => o.value === '576p').label, 'Sharper', 'our words for its sizes');
    assert.equal(ltx.vals.extendMethod, 'auto'); assert.ok(!('extendMethod' in ltx.quote) && !('extendMethod' in ltx.fields), 'Auto sends no method: the place decides');
    assert.equal(spec('extend', LTX, { extendSeconds: '3' }).s.quote.extendSeconds, '3', '+3 s is kept on LTX-2.5 (was snapped to the H3 list)');
    const guide = spec('extend', LTX, { extendMethod: 'guide', guideFrames: '17', crossfade: '2' }).s;
    assert.ok(guide.recipe.controls.some((c: any) => c.field === 'guideFrames'), 'the guide method shows its guide frames'); assert.equal(guide.quote.guideFrames, '17'); assert.equal(guide.fields.crossfade, '2', 'crossfade (no chip) is kept');
    assert.equal(spec('extend', LTX, { guideFrames: '5' }).s.quote.guideFrames, undefined, 'a value the tool does not take is never sent');
    const h3 = spec('extend', H3X, { resolution: '576p', extendMethod: 'continue', guideFrames: '17', extendSeconds: '12' }).s;
    assert.ok(!h3.recipe.controls.some((c: any) => c.field === 'extendMethod'), 'H3 Extend has no method chip');
    assert.equal(h3.vals.resolution, '768p', 'H3 does not render 576p: its own default'); assert.equal(h3.quote.extendMethod, undefined); assert.equal(h3.quote.guideFrames, undefined, 'LTX-only settings stay off an H3 run');
    assert.equal(h3.quote.extendSeconds, '12', 'H3 Extend · Comfy Cloud adds 2–14 s');
    ok('Extend chips per model: lengths, sizes (Draft / Sharper / 720p), forward only and the method on LTX-2.5; H3 keeps its own; LTX-only settings never reach H3'); }

  // ---- the same kind of drop in other flows: settings without a chip are kept when the tool takes them ----
  { const v = spec('video', undefined, { quality: 'fast', bitrate: 'high', enhance: '1', seed: '7' }).s;
    assert.equal(v.quote.quality, 'fast', 'Create Video keeps quality'); assert.equal(v.fields.bitrate, 'high'); assert.equal(v.fields.enhance, '1');
    assert.equal(v.fields.seed, undefined, 'a seed is drawn per run, never pinned from the card');
    assert.equal(spec('video', undefined, { quality: 'ultra' }).s.quote.quality, undefined, 'a value the tool lacks is dropped');
    const tts = spec('voice', undefined, { speaker: 'Vivian', speechLanguage: 'en', speed: '1.2' }).s; assert.equal(tts.quote.speaker, 'Vivian', 'Text to Speech keeps its speaker'); assert.equal(tts.fields.speed, '1.2');
    const up = spec('video-upscale', undefined, { scene: 'old-film', maxOutput: '4k' }).s; assert.equal(up.fields.scene, 'old-film', 'Video Upscale keeps its scene'); assert.equal(up.quote.maxOutput, '4k');
    const tr = spec('transition', undefined, { transition: 'whip', seed: '3' }).s; assert.equal(tr.fields.transition, 'whip');
    const cr = spec('create', undefined, { style: 'mono', enhance: '1' }).s; assert.equal(cr.fields.style, 'mono', 'Create Image keeps its style'); assert.equal(cr.quote.enhance, '1');
    ok('other flows keep their chip-less settings (Create Video quality / bitrate, Text to Speech speaker, Video Upscale scene, Create Image style); bad values dropped'); }
} finally { try { process.kill(-srv.pid!); } catch { /* gone */ } }
