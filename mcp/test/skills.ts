/**
 * Skill pack harness: follows each skill's SKILL.md (skills/<name>/) step by step with an MCP client, the way an agent would, against a MOCK app
 * (never a real paid call). Per skill it checks:
 *  - the SKILL.md itself: frontmatter name + description, the money rules (quote, quote_id, max_usd, status, receipt/recipe), and every tool id,
 *    describe id and model key it names exists in the live catalogue;
 *  - the flow: find (search_capabilities) → describe → quote → run (free: run_on local + max_usd 0; paid: refused without quote_id, then
 *    quote → run with quote_id + budget_id) → status → get_outputs → stitch_video → budget receipt / recipe export, as the skill describes;
 *  - the MCP prompt (slash command) for the skill is listed, and the old viral-template is gone.
 * Mock app: OPENHIGGSFIELD_MCP_URL=<http MCP endpoint> (e.g. http://127.0.0.1:8875/mcp, a sandbox MCP with toolsets core,library), else
 * OPENHIGGSFIELD_API=<mock API> (stdio MCP spawned here), else boots a mock API itself (temp data dir, port SKILLS_PORT or 8874).
 * Refuses to run unless /api/health says backend "mock". Run: npm run test:skills [-- <skill> …]
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)); const MCP = path.resolve(HERE, '..'); const ROOT = path.resolve(MCP, '..');
const SERVER = path.join(ROOT, 'server'); const SKILLS = path.join(ROOT, 'skills'); const SAMPLES = path.join(SERVER, 'samples');
const PACK = ['viral-format', 'ugc-ad', 'product-photo-pack', 'ad-multiplier', 'footage-fx-pass', 'drama-series', 'release-kit', 'faceless-explainer'];
const only = process.argv.slice(2).filter((a) => !a.startsWith('-')); const pick = only.length ? PACK.filter((s) => only.includes(s)) : PACK;
const ok = (m: string) => console.log('ok ' + m);
const TAG = Date.now().toString(36); // client_request_ids are unique per harness run (the skills tell agents to tag theirs per session)
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'ohf-skills-')); // stands in for the user's working folder (series.json, captions.srt)

let api: ChildProcess | null = null; let apiDir: string | null = null;
const mcpUrl = process.env.OPENHIGGSFIELD_MCP_URL;
const API = mcpUrl ? null : await (async () => {
  if (process.env.OPENHIGGSFIELD_API) return process.env.OPENHIGGSFIELD_API.replace(/\/$/, '');
  const port = Number(process.env.SKILLS_PORT) || 8874; const url = `http://localhost:${port}`;
  if (await fetch(`${url}/api/health`).then(() => true, () => false)) throw new Error(`:${port} is in use; set SKILLS_PORT, OPENHIGGSFIELD_API or OPENHIGGSFIELD_MCP_URL`);
  apiDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohf-skills-api-'));
  api = spawn('npx', ['tsx', 'src/index.ts'], { cwd: SERVER, detached: true, stdio: 'ignore', env: { ...process.env, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: apiDir, OPENHIGGSFIELD_ENV_FILE: path.join(apiDir, 'x.env'),
    OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_API_PROXY: url,
    COMFY_API_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', REPLICATE_API_TOKEN: '', OPENHIGGSFIELD_BILLING_MODE: '' } });
  for (let i = 0; i < 160; i++) { try { if ((await fetch(`${url}/api/health`)).ok) return url; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error(`mock API on :${port} did not start`);
})();

const client = new Client({ name: 'ohf-skills-harness', version: '1' });
type J = any;
/** Call a tool; parse its first text block. expectError: the call must fail (refusals come back as isError). */
async function call(name: string, args: Record<string, unknown> = {}, expectError = false): Promise<J> {
  const r: any = await client.callTool({ name, arguments: args }, undefined, { timeout: 300_000 });
  const t = r.content?.find((c: any) => c.type === 'text')?.text ?? ''; let j: J; try { j = JSON.parse(t); } catch { j = t; }
  if (expectError) assert.ok(r.isError, `${name} should fail: ${t.slice(0, 300)}`); else assert.ok(!r.isError, `${name}(${JSON.stringify(args).slice(0, 300)}) failed: ${t.slice(0, 600)}`);
  return j;
}
const filesPath = (u: string) => { try { return new URL(u).pathname; } catch { return u; } };
/** status until done (the skills' "wait_sec:0, then status {id, wait_sec:60}"). */
async function waitDone(id: string): Promise<J> { const s = await call('status', { id, wait_sec: 60 }); assert.equal(s.status, 'done', `job ${id}: ${JSON.stringify(s).slice(0, 400)}`); return s; }
/** A free step as the skills write it: quote says $0 → run {run_on:"local", max_usd:0, wait_sec:0} → status → get_outputs. */
async function free(label: string, req: Record<string, unknown>): Promise<{ id: string; url: string; job: J }> {
  const q = await call('quote', req); assert.equal(q.usd, 0, `${label}: expected a free quote, got ${JSON.stringify(q).slice(0, 300)}`); assert.equal(q.quote_id, null, `${label}: free runs need no quote_id`); assert.equal(q.runnable, true, `${label}: ${q.blockedReason}`);
  const r = await call('run', { ...req, max_usd: 0, wait_sec: 0 }); assert.ok(r.id, `${label}: no job id`); assert.equal(r.quote.usd, 0);
  const s = await waitDone(r.id); assert.equal(s.estimate.usd, 0); if (req.run_on) assert.equal(s.run_on, req.run_on, `${label}: ran on ${s.run_on}`);
  if (req.model) assert.equal(s.model?.id, req.model, `${label}: real model shown`);
  const o = await call('get_outputs', { id: r.id }); const url = filesPath(o.outputs?.[0]?.url ?? s.result_url); assert.ok(url?.startsWith('/files/'), `${label}: an output link, got ${JSON.stringify(o).slice(0, 300)}`);
  return { id: r.id, url, job: s };
}
/** A paid step as the skills write it: run without quote_id is refused (nothing charged) → quote → run with quote_id + budget_id → status. */
async function paid(label: string, req: Record<string, unknown>, budget_id?: string): Promise<{ id: string; usd: number }> {
  const no = await call('run', { ...req, budget_id, wait_sec: 0 }, true); assert.equal(no.refused, true); assert.equal(no.charged, false); assert.match(no.reason, /quote_id/);
  const q = await call('quote', { ...req, budget_id }); assert.ok(q.usd > 0 && q.quote_id, `${label}: expected a paid quote with a quote_id: ${JSON.stringify(q).slice(0, 300)}`);
  const r = await call('run', { ...req, budget_id, quote_id: q.quote_id, client_request_id: `${label}-${TAG}`, wait_sec: 0 }); assert.ok(r.id);
  const s = await waitDone(r.id); assert.equal(s.estimate.usd, q.usd, `${label}: estimate matches the quote`);
  return { id: r.id, usd: q.usd };
}
/** compare:true → the cheapest runnable paid row (a hero / cloud upgrade the skill offers). */
async function paidRow(req: Record<string, unknown>, prefer: string[] = []): Promise<{ model: string; run_on: string }> {
  const c = await call('quote', { ...req, compare: true }); const rows = (c.compare as J[]).filter((r) => r.runnable && r.usd > 0 && r.runOn);
  assert.ok(rows.length, `a paid row to offer for ${req.tool_id}: ${JSON.stringify(c).slice(0, 400)}`);
  assert.ok((c.compare as J[]).some((r) => r.free && r.runnable), `compare shows a free local row for ${req.tool_id}`);
  const row = prefer.map((m) => rows.find((r) => r.model === m)).find(Boolean) ?? rows[0]; return { model: row.model, run_on: row.runOn };
}
const receipt = async (budget_id: string, n: number) => { const r: any = await client.callTool({ name: 'budget', arguments: { action: 'receipt', budget_id } }); assert.ok(!r.isError, r.content?.[0]?.text);
  const txt = r.content[0].text as string; assert.match(txt, /Receipt/i); const j = JSON.parse(r.content[1]?.text ?? r.content[0].text); assert.ok((j.items ?? []).length >= n, `receipt lists ≥ ${n} runs, got ${(j.items ?? []).length}`); return j; };
const recipe = async (id: string) => { const r = await call('recipe', { action: 'export', id }); assert.ok(JSON.stringify(r).match(/https?:\/\//), `recipe export gives a link: ${JSON.stringify(r).slice(0, 200)}`); return r; };
const stitch = async (args: Record<string, unknown>) => { const r = await call('stitch_video', args); assert.equal(r.status, 'done'); assert.equal(r.cost, 0); assert.match(r.result_url, /\.mp4$/); return r; };
const budgetSet = async (usd: number) => (await call('budget', { action: 'set', name: 'Claude', budget_usd: usd })).budget_id as string;
const searchHas = async (query: string, id: string) => { const s = await call('search_capabilities', { query }); const all = [...(s.top ?? []), ...(s.tools ?? []), ...(s.modes ?? []), ...(s.workflows ?? [])].map((x: J) => x.id);
  assert.ok(all.includes(id), `search "${query}" should find ${id}; got ${all.slice(0, 10).join(', ')}`); return s; };
const L = { run_on: 'local' } as const;

// ---------- static checks on every SKILL.md ----------
async function staticChecks(tools: J[], caps: Set<string>) {
  const toolIds = new Set(tools.map((t) => t.id)); const models = new Set(tools.flatMap((t) => (t.models ?? []).map((m: J) => m.key)));
  const modes = new Set(tools.flatMap((t) => { const ty = (t.inputs ?? []).find((i: J) => i.name === 'types'); return [...(ty?.options ?? []).map((o: J) => `${t.id}/${o}`), ...(t.presets ?? []).map((p: J) => `${t.id}/${p.id}`)]; }));
  for (const name of pick) {
    const file = path.join(SKILLS, name, 'SKILL.md'); assert.ok(fs.existsSync(file), `${file} exists`); const t = fs.readFileSync(file, 'utf8');
    const m = /^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(t); assert.ok(m, `${name}: frontmatter name + description`); assert.equal(m[1].trim(), name); assert.ok(m[2].length > 120 && /Use when/.test(m[2]), `${name}: a description that says when to use it`);
    for (const w of ['search_capabilities', 'describe', 'quote', 'quote_id', 'max_usd:0', 'status', 'get_outputs|stitch_video', 'recipe', 'sample: true']) assert.ok(new RegExp(w).test(t), `${name}: mentions ${w}`);
    assert.ok(t.split('\n').length <= 60, `${name}: SKILL.md stays tight (≤ 60 lines), long banks go in reference.md`);
    if (/reference\.md/.test(t)) assert.ok(fs.existsSync(path.join(SKILLS, name, 'reference.md')), `${name}: reference.md exists`);
    for (const [, id] of t.matchAll(/tool_id:"([\w.-]+)"/g)) assert.ok(toolIds.has(id), `${name}: tool_id "${id}" is a real tool`);
    for (const [, id] of t.matchAll(/describe \{id:"([^"<]+)"\}/g)) assert.ok(toolIds.has(id) || caps.has(id) || modes.has(id), `${name}: describe id "${id}" exists`);
    for (const [, id] of t.matchAll(/model:"([\w.-]+)"/g)) assert.ok(models.has(id), `${name}: model "${id}" is a real model key`);
    for (const [, id] of t.matchAll(/`(app-[\w-]+|footage-fx|photo-fx|object-swap|restyle|reframe|fps-boost|sdr-hdr|image-upscale|create-image)[ `]/g)) assert.ok(toolIds.has(id), `${name}: \`${id}\` is a real tool`);
  }
  ok(`static: ${pick.length} SKILL.md files have frontmatter, the money rules, and only real tool ids, describe ids and model keys`);
}

// ---------- the flows ----------
const PRODUCT = path.join(SAMPLES, 'sample-product.png'); const CHARACTER = path.join(SAMPLES, 'sample-character.png'); const CLIP = path.join(SAMPLES, 'sample-take.mp4');
const LTX = { model: 'ltx-2.5-22b', ...L };

const FLOWS: Record<string, () => Promise<string>> = {
  async 'viral-format'() {
    await searchHas('viral template', 'template/glass-asmr');
    const d = await call('describe', { id: 'template/glass-asmr' }); assert.equal(d.run.model, 'ltx-2.5-22b');
    const prompt = String(d.run.fields.prompt).replace(/peach/g, 'pomegranate'); assert.match(prompt, /pomegranate/);
    const tpl = await free('template', { tool_id: d.run.tool_id, model: d.run.model, ...L, fields: { ...d.run.fields, prompt, resolution: '448p' } });
    const kf = await free('keyframe', { tool_id: 'create-image', model: 'z-image-turbo', ...L, fields: { types: ['generate'], prompt: 'a cosy reading nook, rain on the window', aspect: '16:9' } });
    const dl = await call('describe', { id: 'video/loop' }); assert.equal(dl.run.fields.loop, 1);
    await free('loop', { tool_id: 'h3-video', ...LTX, from_job: kf.id, fields: { types: ['i2v'], loop: 1, prompt: 'only the rain on the window moves', duration: '4', aspect: '16:9', audio: '1' } });
    const dm = await call('describe', { id: 'video/morph' }); assert.equal(dm.run.tool_id, 'app-transition');
    const b = await free('still-b', { tool_id: 'create-image', model: 'z-image-turbo', ...L, fields: { types: ['generate'], prompt: 'the same nook at night, lamp on', aspect: '16:9' } });
    const morph = await free('morph', { tool_id: 'app-transition', ...LTX, fields: { transition: 'morph', image: kf.url, lastFrame: b.url, prompt: 'day melts into night', duration: '4' } });
    const zoom = await free('zoom-hop', { tool_id: 'app-transition', ...LTX, fields: { transition: 'zoom-through', image: b.url, lastFrame: kf.url, prompt: 'zoom into the window', duration: '3' } });
    await stitch({ clips: [morph.id, zoom.id], title: 'Infinite zoom' });
    await free('photo-fx', { tool_id: 'photo-fx', ...LTX, fields: { types: ['freeze'], image: CHARACTER, prompt: 'everything freezes mid-air' } });
    const hero = await paidRow({ tool_id: 'h3-video', fields: { types: ['t2v'], prompt, duration: '4', aspect: '9:16' } });
    const bid = await budgetSet(5); const p = await paid('vf-hero', { tool_id: 'h3-video', ...hero, fields: { types: ['t2v'], prompt, duration: '4', aspect: '9:16' } }, bid);
    await recipe(tpl.id); await receipt(bid, 1);
    return `template (slot swapped) + keyframe → loop, morph, zoom hops stitched, Photo FX, hero ${hero.model} $${p.usd.toFixed(2)} after a quote`;
  },

  async 'ugc-ad'() {
    const bid = await budgetSet(3);
    const prod = await call('upload', { file: PRODUCT }); assert.match(prod.url, /^\/files\//);
    const creator = await free('creator', { tool_id: 'create-image', model: 'z-image-turbo', ...L, budget_id: bid, fields: { types: ['generate'], prompt: 'fictional creator, phone selfie look, friendly', aspect: '9:16' } });
    await searchHas('ugc ad', 'app-ugc-ad'); const dh = await call('describe', { id: 'h3-video' }); const du = await call('describe', { id: 'app-ugc-ad' });
    assert.ok(dh.fields.properties.types && du.fields.properties.presenter, 'describe gives the fields the skill uses');
    const lines = ['Why did nobody tell me about this mug sooner?', 'My coffee used to go cold in minutes.', 'Link is below, go try it.']; const shots: string[] = [];
    for (const [i, line] of lines.entries()) shots.push((await free(`line-${i}`, { tool_id: 'h3-video', ...LTX, budget_id: bid, fields: { types: ['i2v'], image: creator.url, prompt: `the creator holds the mug and says "${line}"`, duration: '4', aspect: '9:16', audio: '1' } })).id);
    const ps = await free('product-shot', { tool_id: 'app-product-shot', model: 'qwen-image-2.1', ...L, budget_id: bid, fields: { image: prod.url, scene: 'kitchen', aspect: '9:16' } });
    const broll = await free('b-roll', { tool_id: 'h3-video', ...LTX, budget_id: bid, from_job: ps.id, fields: { types: ['i2v'], prompt: 'slow orbit around the product', duration: '3', aspect: '9:16', audio: '0' } });
    const heroReq = { tool_id: 'h3-video', fields: { types: ['i2v'], image: creator.url, prompt: `the creator says "${lines[0]}"`, duration: '5', aspect: '9:16', audio: '1' } };
    const hero = await paidRow(heroReq, ['kling-v3', 'seedance-2.0']); const h = await paid('ugc-hero', { ...heroReq, ...hero }, bid);
    const cut = await stitch({ clips: [h.id, shots[1], broll.id, shots[2]], keep_clip_audio: true, title: 'Mug UGC 9:16' }); assert.equal(cut.layout, 'sequence');
    const sq = await stitch({ clips: [h.id, shots[1], broll.id, shots[2]], keep_clip_audio: true, aspect: '1:1', title: 'Mug UGC 1:1' }); assert.equal(sq.aspect, '1:1'); assert.equal(sq.width, sq.height);
    fs.writeFileSync(path.join(WORK, 'captions.srt'), lines.map((l, i) => `${i + 1}\n00:00:0${i * 4},000 --> 00:00:0${i * 4 + 4},000\n${l}\n`).join('\n'));
    await recipe(cut.id); const rc = await receipt(bid, 6); assert.ok(rc.items.some((i: J) => i.estUsd > 0 || i.estimateUsd > 0 || /\$/.test(JSON.stringify(i))), 'the hero is on the receipt');
    return `creator + 3 talking shots + product B-roll (free), hero ${hero.model} $${h.usd.toFixed(2)} quoted, 9:16 and 1:1 cuts with clip sound, captions.srt`;
  },

  async 'product-photo-pack'() {
    const up = await call('upload', { file: PRODUCT }); await searchHas('product photo', 'app-product-shot'); await searchHas('packshot', 'app-product-shot');
    for (const id of ['app-product-shot', 'app-shots', 'app-relight', 'image-upscale']) assert.ok((await call('describe', { id })).fields, id);
    const plan = await call('budget', { action: 'plan', steps: [
      { label: 'packshot', tool_id: 'app-product-shot', params: { model: 'qwen-image-2.1', runOn: 'local', scene: 'studio-white', aspect: '1:1', image: 1 } },
      { label: 'kitchen', tool_id: 'app-product-shot', params: { model: 'qwen-image-2.1', runOn: 'local', scene: 'kitchen', aspect: '3:4', image: 1 } },
      { label: 'expand', tool_id: 'app-expand', params: { model: 'bria-expand', runOn: 'fal', target: '9:16', image: 1 } }] });
    assert.ok(JSON.stringify(plan).match(/total/i), 'plan has a total');
    const white = await free('packshot', { tool_id: 'app-product-shot', model: 'qwen-image-2.1', ...L, fields: { image: up.url, scene: 'studio-white', aspect: '1:1', prompt: 'terracotta mug, label sharp and unchanged' } });
    const scenes: string[] = []; for (const [scene, aspect] of [['kitchen', '3:4'], ['marble', '1:1'], ['flat-lay', '9:16']]) scenes.push((await free(`scene-${scene}`, { tool_id: 'app-product-shot', model: 'qwen-image-2.1', ...L, fields: { image: up.url, scene, aspect } })).id);
    const ang = await free('angles', { tool_id: 'app-shots', model: 'qwen-image-edit-2509-angles', ...L, fields: { image: up.url, shots: ['three-quarter-left', 'side', 'close-up'] } });
    const relit = await free('relight', { tool_id: 'app-relight', model: 'qwen-image-2.1', ...L, from_job: scenes[1], fields: { look: 'studio-softbox' } });
    await free('upscale-hero', { tool_id: 'image-upscale', model: 'seedvr2-3b-image', ...L, from_job: relit.id, fields: { scale: '2' } });
    await free('upscale-pack', { tool_id: 'image-upscale', model: 'seedvr2-3b-image', ...L, from_job: white.id, fields: { scale: '2' } });
    const exq = await call('quote', { tool_id: 'app-expand', model: 'bria-expand', run_on: 'fal', fields: { image: white.url, target: '4:5' } }); assert.ok(typeof exq.usd === 'number', 'expand is priced before it runs');
    const bid = await budgetSet(1); const ex = await paid('label-fix', { tool_id: 'app-product-shot', model: 'gpt-image-2.5-flare', run_on: 'comfy-cloud', fields: { image: up.url, scene: 'marble', aspect: '1:1', prompt: 'terracotta mug, label text exact' } }, bid);
    await free('orbit', { tool_id: 'app-orbit-shot', model: 'ltx-2-19b', ...L, fields: { image: white.url, orbit: 'arc-left', duration: '5', aspect: '1:1' } });
    void ang; await recipe(relit.id); await receipt(bid, 1);
    return `packshot + 3 scenes at marketplace aspects + angles + relit hero + 2 upscales + orbit (free), expand priced, one label-fidelity image $${ex.usd.toFixed(2)} after a quote`;
  },

  async 'ad-multiplier'() {
    const bid = await budgetSet(6); const ad = await call('upload', { file: CLIP });
    await searchHas('video swap', 'video/object-swap'); const d = await call('describe', { id: 'video/object-swap' });
    assert.ok(d.tool.presets.some((p: J) => p.id === 'main-person') && d.tool.fields.properties.keepAudio, 'object-swap presets + keepAudio');
    assert.ok((await call('describe', { id: 'video/restyle' })).tool.fields.properties.preset);
    const talent = await free('talent', { tool_id: 'create-image', model: 'z-image-turbo', ...L, fields: { types: ['generate'], prompt: 'fictional woman in her thirties, neutral background, front view', aspect: '9:16' } });
    const swap = { tool_id: 'object-swap', fields: { video: ad.url, preset: 'main-person', swapType: 'person', refs: [talent.url], prompt: 'replace the main person with the reference; keep motion and timing', keepAudio: '1' } };
    const row = await paidRow(swap, ['kling-v3-omni-edit']);
    const plan = await call('budget', { action: 'plan', budget_id: bid, steps: [
      { label: 'var-1 talent (cloud)', tool_id: 'object-swap', params: { model: row.model, runOn: row.run_on, keepAudio: '1', video: 1 } },
      { label: 'var-2 talent (local)', tool_id: 'object-swap', params: { model: 'wan-2.2-animate-14b', runOn: 'local', keepAudio: '1', video: 1 } }] });
    assert.ok(JSON.stringify(plan).match(/fits|total/i));
    const v1 = await paid('var-1', { ...swap, ...row }, bid);
    const v2 = await free('var-2', { ...swap, model: 'wan-2.2-animate-14b', ...L, budget_id: bid, client_request_id: `var-2-${TAG}` } as J);
    const again = await call('run', { ...swap, model: 'wan-2.2-animate-14b', ...L, budget_id: bid, client_request_id: `var-2-${TAG}`, max_usd: 0, wait_sec: 0 }); assert.equal(again.id, v2.id, 'same client_request_id → the first job, nothing new started');
    const v3 = await free('var-3 setting', { tool_id: 'restyle', model: 'wan-2.1-vace-14b', ...L, budget_id: bid, fields: { video: ad.url, preset: 'live-action', prompt: 'the same scene in a bright gym', keepAudio: '1' } });
    const v4 = await free('var-4 language', { tool_id: 'app-translate-video', model: 'translate-chatterbox', ...L, budget_id: bid, fields: { video: ad.url, language: 'es', voice: 'original' } });
    const fixed = await stitch({ clips: [v3.id], music: ad.url, music_volume: 1, title: 'Variant 3 with the original audio' }); assert.equal(fixed.music, true);
    void v4; await recipe(v1.id); await receipt(bid, 4);
    return `talent swap on ${row.model} $${v1.usd.toFixed(2)} (quoted, planned), local talent swap (idempotent replay), local restyle + translation, original audio put back`;
  },

  async 'footage-fx-pass'() {
    const up = await call('upload', { file: CLIP }); const s = await call('search_capabilities', { query: 'remove people' }); assert.equal(s.top[0].id, 'footage-fx/vanish');
    const d = await call('describe', { id: 'footage-fx/vanish' }); assert.deepEqual(d.run.fields, { types: ['vanish'] });
    const req = { tool_id: 'footage-fx', model: 'comfy-ltx25-iclora', ...L, fields: { video: up.url, types: ['vanish'], duration: '2', resolution: '448p', keepAudio: '1', prompt: 'remove the people; keep the street exactly as it is' } };
    const draft = await free('fx-draft', req);
    const full = await free('fx-full', { ...req, fields: { ...req.fields, duration: '5', resolution: '576p' } });
    const upx = await free('upscale', { tool_id: 'app-video-upscale', model: 'seedvr2', ...L, from_job: full.id, fields: {} });
    await free('fps', { tool_id: 'fps-boost', model: 'rife-4.9', ...L, from_job: upx.id, fields: { targetFps: '60' } });
    await free('hdr', { tool_id: 'sdr-hdr', model: 'ffmpeg-hdr10', ...L, from_job: full.id, fields: {} });
    const ba = await stitch({ clips: [up.url, full.id], layout: 'side-by-side', keep_clip_audio: true, title: 'Before / after' }); assert.equal(ba.layout, 'side-by-side');
    const vert = await stitch({ clips: [up.url, full.id], aspect: '9:16', title: 'Before then after' }); assert.equal(vert.aspect, '9:16');
    void draft; await recipe(full.id);
    return 'vanish found by "remove people", 2 s draft then 5 s Sharper, upscale → 60 fps, HDR, side-by-side and 9:16 before/after, all $0';
  },

  async 'drama-series'() {
    const cast = [{ name: 'Lemona', look: 'glossy 3D cartoon lemon with long lashes' }, { name: 'Grapefroid', look: 'glossy 3D cartoon grapefruit with a smirk' }];
    const series: J = { title: 'Bowl Drama', look: 'glossy 3D cartoon fruit', cast: [], episodes: [] };
    for (const c of cast) {
      const still = await free(`still-${c.name}`, { tool_id: 'create-image', model: 'z-image-turbo', ...L, fields: { types: ['generate'], prompt: `${c.look}, front view, plain background`, aspect: '9:16' } });
      const sheet = await free(`sheet-${c.name}`, { tool_id: 'app-character-sheet', model: 'qwen-image-2.1', ...L, from_job: still.id, fields: { layout: 'turnaround' } });
      series.cast.push({ ...c, still: still.url, sheet: sheet.url, stillJob: still.id, sheetJob: sheet.id });
    }
    await searchHas('consistent character', 'app-character-sheet');
    fs.writeFileSync(path.join(WORK, 'series.json'), JSON.stringify(series, null, 2));
    const back = JSON.parse(fs.readFileSync(path.join(WORK, 'series.json'), 'utf8')); assert.equal(back.cast[0].still, series.cast[0].still, 'series.json keeps the cast URLs for the next episode');
    const shot = (k: number, who: J, line: string) => ({ tool_id: 'h3-video', ...LTX, client_request_id: `ep1-s${k}-${TAG}`, fields: { types: ['i2v'], image: who.still, prompt: `${who.look} on a kitchen counter, ${who.name} says "${line}"`, duration: '5', aspect: '9:16', audio: '1', resolution: '448p' } });
    assert.equal((await call('quote', shot(0, back.cast[0], 'x'))).usd, 0);
    const r2v = { tool_id: 'h3-video', fields: { types: ['r2v'], image: [back.cast[0].sheet, back.cast[1].sheet], prompt: 'Lemona and Grapefroid face off on the counter', duration: '5', aspect: '9:16', audio: '1' } };
    const row = await paidRow(r2v, ['kling-v3']); const bid = await budgetSet(4);
    const shots: string[] = [];
    shots.push((await free('s1', shot(1, back.cast[0], 'I trusted you.'))).id);
    shots.push((await free('s2', shot(2, back.cast[1], 'You were never part of the bowl.'))).id);
    const bad = await free('s3', shot(3, back.cast[0], 'What was that?'));
    const redo = await free('s3-b', { ...shot(3, back.cast[0], 'What was that?'), client_request_id: `ep1-s3-b-${TAG}` }); assert.notEqual(redo.id, bad.id, 'a redo is a new job; the good shots stay');
    shots.push(redo.id); const face = await paid('ep1-s4', { ...r2v, ...row }, bid); shots.push(face.id);
    const score = await free('score', { tool_id: 'audio', model: 'ace-step-1.5', ...L, fields: { types: ['music'], prompt: 'soap opera drama underscore, tense strings, no vocals', duration: '60' } });
    const ep = await stitch({ clips: shots, keep_clip_audio: true, music: score.id, music_volume: 0.25, title: 'Bowl Drama · Ep 1' }); assert.equal(ep.music, true);
    back.episodes.push({ n: 1, episodeJob: ep.id, shots }); fs.writeFileSync(path.join(WORK, 'series.json'), JSON.stringify(back, null, 2));
    await recipe(shots[0]); await receipt(bid, 1);
    return `2 fictional characters (still + sheet) saved to series.json, 3 local shots + 1 redo, an r2v shot on ${row.model} $${face.usd.toFixed(2)} quoted, score, episode with dialogue kept`;
  },

  async 'release-kit'() {
    const song = await free('song', { tool_id: 'audio', model: 'ace-step-1.5', ...L, fields: { types: ['music'], prompt: 'dreamy synth-pop, 100 bpm, warm pads', lyrics: '[verse]\nNeon on the water\n[chorus]\nWe glow, we glow', duration: '30' } });
    const cover = await free('cover', { tool_id: 'create-image', model: 'z-image-turbo', ...L, fields: { types: ['generate'], prompt: 'album cover, neon reflections on a night lake, minimal', aspect: '1:1' } });
    const bid = await budgetSet(1); const titled = await paid('cover-text', { tool_id: 'create-image', model: 'gpt-image-2.5-flare', run_on: 'comfy-cloud', fields: { types: ['generate'], prompt: 'album cover with the title "WE GLOW" in clean type', aspect: '1:1' } }, bid);
    const dl = await call('describe', { id: 'video/loop' }); assert.equal(dl.run.model, 'ltx-2.5-22b'); await searchHas('spotify canvas', 'video/loop');
    const loop = await free('canvas', { tool_id: 'h3-video', ...LTX, from_job: cover.id, fields: { types: ['i2v'], loop: 1, prompt: 'only the neon reflections ripple', duration: '5', aspect: '9:16', audio: '0' } });
    const secs: string[] = []; for (const [i, p] of ['a figure walks along the lake at night, slow tracking shot', 'liquid neon shapes pulse in the dark, macro'].entries())
      secs.push((await free(`sec-${i}`, { tool_id: 'h3-video', ...LTX, client_request_id: `rk-sec-${i}-${TAG}`, fields: { types: ['t2v'], prompt: p, duration: '5', aspect: '16:9', audio: '0' } })).id);
    const singer = await free('singer', { tool_id: 'create-image', model: 'z-image-turbo', ...L, fields: { types: ['generate'], prompt: 'fictional singer, front-facing, mouth visible, plain background', aspect: '16:9' } });
    const morph = await free('morph', { tool_id: 'app-transition', ...LTX, fields: { transition: 'morph', image: singer.url, lastFrame: cover.url, prompt: 'the singer dissolves into the cover', duration: '4' } });
    await searchHas('lip sync', 'video/lip-sync');
    const perf = await free('performance', { tool_id: 'voice', model: 'minimax-h3-talking-photo', ...L, fields: { types: ['lipsync'], image: singer.url, speech: song.url } });
    const full = await stitch({ clips: [...secs, morph.id], music: song.id, music_volume: 1, title: 'We Glow visualiser' }); assert.equal(full.music, true);
    const cut = await stitch({ clips: [secs[1], morph.id], music: song.id, aspect: '9:16', title: 'We Glow 9:16 cutdown' }); assert.equal(cut.aspect, '9:16'); assert.ok(cut.height > cut.width);
    void perf; void titled; await recipe(loop.id); await receipt(bid, 1);
    return 'song + cover (free), titled cover after a quote, canvas loop from the cover, 2 section clips + morph, lip-sync performance, full video + 9:16 cutdown';
  },

  async 'faceless-explainer'() {
    const s = await call('search_capabilities', { query: 'text to speech', kind: 'mode' }); assert.ok(s.modes.some((m: J) => m.id === 'voice/voiceover'));
    const d = await call('describe', { id: 'voice/voiceover' }); assert.ok(d.tool.models.some((m: J) => m.model === 'chatterbox'), 'a local TTS model'); await call('describe', { id: 'create-image' });
    const script = ['Octopuses have three hearts.', 'Two pump blood to the gills, one to the body.', 'And their blood is blue.'];
    const vo = await free('voiceover', { tool_id: 'voice', model: 'chatterbox', ...L, fields: { types: ['voiceover'], prompt: script.join(' '), voice: 'narrator-warm' } });
    const studio = await call('quote', { tool_id: 'voice', model: 'elevenlabs-v4', run_on: 'comfy-cloud', fields: { types: ['voiceover'], prompt: script.join(' '), voice: 'narrator-warm' } });
    assert.ok(studio.usd > 0 && studio.quote_id, 'a studio voice is priced with a quote_id before any run');
    const look = 'glossy 3D cartoon render, rounded shapes, bright colours'; const clips: string[] = [];
    for (const [i, line] of script.entries()) {
      const still = await free(`still-${i}`, { tool_id: 'create-image', model: 'z-image-turbo', ...L, seed: 1234, client_request_id: `fx-still-${i}-${TAG}`, fields: { types: ['generate'], prompt: `${look}, ${line}`, aspect: '9:16' } });
      clips.push((await free(`move-${i}`, { tool_id: 'h3-video', ...LTX, from_job: still.id, fields: { types: ['i2v'], prompt: 'slow push in', duration: '3', aspect: '9:16', audio: '0' } })).id);
    }
    const bed = await free('music', { tool_id: 'audio', model: 'ace-step-1.5', ...L, fields: { types: ['music'], prompt: 'calm curious instrumental, no vocals', duration: '30' } });
    const v = await stitch({ clips, voice: vo.id, music: bed.id, music_volume: 0.2, title: 'Octopus hearts' }); assert.equal(v.voice, true); assert.equal(v.music, true);
    fs.writeFileSync(path.join(WORK, 'captions.srt'), script.map((l, i) => `${i + 1}\n00:00:0${i * 3},000 --> 00:00:0${i * 3 + 3},000\n${l}\n`).join('\n'));
    await recipe(clips[0]);
    return 'local TTS voiceover (studio voice quoted, not run), 3 stills in one look + motion, music bed, stitched with voice over music, captions.srt';
  },
};

let failed = 0;
try {
  if (mcpUrl) await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl)));
  else await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(MCP, 'node_modules/tsx/dist/cli.mjs'), path.join(MCP, 'src/index.ts')], cwd: MCP,
    env: { ...process.env, OPENHIGGSFIELD_API: API!, OPENHIGGSFIELD_MCP_PERMISSIONS: '', OPENHIGGSFIELD_MCP_DEFAULT: 'allow', OPENHIGGSFIELD_MCP_TOOLSETS: 'core,library', OPENHIGGSFIELD_MCP_POLL_MS: '300' } as Record<string, string> }));
  const overview = await call('search_capabilities', {}); const apiUrl = API ?? process.env.OPENHIGGSFIELD_API ?? 'http://localhost:8874';
  const health = await (await fetch(`${apiUrl}/api/health`)).json() as J; assert.equal(health.backend, 'mock', 'mock backend only: this harness never makes real (paid) calls'); void overview;
  const names = (await client.listTools()).tools.map((t) => t.name); assert.ok(names.includes('stitch_video'), 'the MCP server needs the library toolset (core,library) for stitch_video');
  const prompts = (await client.listPrompts()).prompts.map((p) => p.name);
  for (const s of PACK) assert.ok(prompts.includes(s), `prompt /${s} listed`); assert.ok(!prompts.includes('viral-template'), 'viral-template is gone (now viral-format)');
  const pr: any = await client.getPrompt({ name: 'ugc-ad', arguments: { request: 'a mug ad' } }); assert.match(pr.messages[0].content.text, /quote_id/);
  ok(`MCP prompts: all ${PACK.length} skills are slash commands; viral-template replaced by viral-format`);
  const tools = await (await fetch(`${apiUrl}/api/tools`)).json() as J[]; const caps = new Set(((await (await fetch(`${apiUrl}/api/capabilities`)).json()) as J).items.map((c: J) => c.id as string));
  await staticChecks(tools, caps);
  for (const name of pick) {
    try { const msg = await FLOWS[name](); ok(`${name}: ${msg}`); } catch (e) { failed++; console.error(`FAIL ${name}: ${e instanceof Error ? e.message : e}`); }
  }
  if (failed) throw new Error(`${failed} skill flow(s) failed`);
  console.log(`ALL OK skills (${pick.length} flows, mock backend, nothing billed)`);
} finally {
  await client.close().catch(() => {}); if (api) try { process.kill(-api.pid!, 'SIGTERM'); } catch { /* gone */ }
  if (apiDir) fs.rmSync(apiDir, { recursive: true, force: true }); fs.rmSync(WORK, { recursive: true, force: true });
}
