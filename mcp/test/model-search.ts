/**
 * Plain-word model search (agent path audit 2026-11-07 #5, #9): parseIntent pulls seconds, mode, resolution and free / local out of the query;
 * search_capabilities returns modelMatches with ready run arguments and why each fits; "kling" never finds FLUX Klein; describe {id, model}
 * narrows a tool's fields to that model with its defaults.
 * Unit part needs nothing; the MCP part needs a mock API with mock keys + local (OPENHIGGSFIELD_API=<url>, never :8787), else it is skipped.
 * Run: npx tsx test/model-search.ts
 */
import assert from 'node:assert/strict';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { parseIntent, nameScore, narrowSchema, limitsFromEngines } from '../src/modelSearch.js';
import { queryWords } from '../src/search.js';
const ok = (m: string) => console.log('ok ' + m);

// ---- unit: parseIntent ----
const p = (q: string) => { const x = parseIntent(q); return { s: x.seconds, m: x.mode, r: x.resolution, f: x.free, l: x.local, media: x.media, w: x.words.join(' ') }; };
assert.deepEqual(p('Kling 15 s from an image'), { s: 15, m: 'i2v', r: null, f: false, l: false, media: 'video', w: 'kling' });
assert.deepEqual(p('seedance image to video'), { s: null, m: 'i2v', r: null, f: false, l: false, media: 'video', w: 'seedance' });
assert.deepEqual(p('veo 8 s'), { s: 8, m: null, r: null, f: false, l: false, media: null, w: 'veo' });
assert.deepEqual(p('free video'), { s: null, m: null, r: null, f: true, l: false, media: 'video', w: '' });
assert.deepEqual(p('a 10-second clip on my computer'), { s: 10, m: null, r: null, f: true, l: true, media: 'video', w: '' });
assert.deepEqual(p('kling first and last frame 1080p'), { s: null, m: 'flf', r: '1080p', f: false, l: false, media: 'video', w: 'kling' });
assert.deepEqual(p('text to video 6s 4k'), { s: 6, m: 't2v', r: '4K', f: false, l: false, media: 'video', w: '' });
assert.equal(parseIntent('free video').words.length, 0); assert.equal(parseIntent('free video').free, true, 'regexes keep no state between calls');
ok('parseIntent: seconds, mode (from an image / image to video / first and last frame / text to video), resolution, free / on my computer, name words');

// ---- unit: names never stem ("kling" is not "kl…" → Klein) ----
const t = { id: 'create-image', name: 'Create Image' }; const klein = { key: 'flux-3-klein', displayName: 'FLUX.3 Klein', family: 'FLUX', maker: 'bfl' };
const kling = { key: 'kling-v3', displayName: 'Kling 3.0 Omni', aliases: ['kling', 'kuaishou'], maker: 'kling' };
assert.equal(nameScore(t, klein, ['kling']), 0); assert.ok(nameScore(t, kling, ['kling']) > 0); assert.ok(nameScore(t, klein, ['klein']) > 0);
const veo = { key: 'veo-3.1', displayName: 'Veo 3.1' }; const omni = { key: 'gemini-omni-1.1-flash', displayName: 'Gemini Omni', aliases: ['veo'] };
assert.ok(nameScore(t, veo, ['veo']) > nameScore(t, omni, ['veo']), 'its own name beats an alias');
assert.deepEqual(queryWords('kling'), ['kling']);
ok('names: whole words or word starts, never stems; own name beats an alias');

// ---- unit: narrowSchema ----
{ const schema = { type: 'object', properties: { types: { type: 'array', items: { type: 'string', enum: ['t2v', 'i2v', 'flf', 'r2v', 'keyframes'] } }, duration: { type: 'string', enum: ['2', '3', '30'], default: '4' }, resolution: { type: 'string', enum: ['768p', '480p', '720p', '1080p'], default: '768p' } } };
  const lim = limitsFromEngines([{ modelKey: 'kling-v3', modes: ['t2v', 'i2v', 'flf', 'r2v'], capabilities: { minSeconds: 3, maxSeconds: 15, durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolutions: ['720p', '1080p'] } }]);
  const n = narrowSchema(schema, lim);
  assert.deepEqual(n.properties.types.items.enum, ['t2v', 'i2v', 'flf', 'r2v']); assert.equal(n.properties.duration.enum[0], '3'); assert.equal(n.properties.duration.enum.at(-1), '15');
  assert.equal(n.properties.duration.default, '5'); assert.deepEqual(n.properties.resolution.enum, ['720p', '1080p']); assert.equal(n.properties.resolution.default, '720p');
  assert.equal(schema.properties.duration.default, '4', 'the tool schema is not changed');
  ok('narrowSchema: Kling on Generate Video → its modes, 3–15 s (default 5), 720p / 1080p (default 720p)'); }

// ---- MCP: search_capabilities + describe over stdio ----
const API = process.env.OPENHIGGSFIELD_API;
if (!API || /:8787\b/.test(API)) { console.log('skip MCP part: set OPENHIGGSFIELD_API to a mock sandbox API with mock keys + local (never the live :8787)'); console.log('ALL OK model-search (unit)'); process.exit(0); }
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js'); const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const health = await (await fetch(`${API}/api/health`)).json() as any; assert.equal(health.backend, 'mock', 'mock backend only');
const c = new Client({ name: 'model-search', version: '1' });
await c.connect(new StdioClientTransport({ command: 'npx', args: ['tsx', path.resolve(HERE, '../src/index.ts')], env: { ...process.env, OPENHIGGSFIELD_API: API } as Record<string, string> }));
const call = async (name: string, args: any) => { const r: any = await c.callTool({ name, arguments: args }); return { err: !!r.isError, body: (() => { try { return JSON.parse(r.content[0].text); } catch { return r.content[0].text; } })() }; };
try {
  const k = (await call('search_capabilities', { query: 'Kling 15 s from an image' })).body;
  assert.deepEqual(k.understood, { seconds: 15, mode: 'i2v', resolution: null, free: false, local: false, names: ['kling'] });
  assert.equal(k.top[0].kind, 'model-run'); assert.deepEqual(k.top[0].run, { tool_id: 'h3-video', model: 'kling-v3', fields: { types: ['i2v'], duration: '15' } }, JSON.stringify(k.top[0]));
  assert.match(k.top[0].why, /image to video ✓; 15 s ✓ \(3–15 s\)/); assert.ok(k.modelMatches[0].fits);
  ok(`"Kling 15 s from an image" → ${JSON.stringify(k.top[0].run)} (${k.top[0].why})`);
  const sd = (await call('search_capabilities', { query: 'seedance image to video' })).body;
  assert.ok(sd.modelMatches.some((x: any) => x.model === 'seedance-2.0' && x.fits && x.run.tool_id === 'h3-video' && x.run.fields.types[0] === 'i2v'), JSON.stringify(sd.modelMatches?.slice(0, 3)));
  ok('"seedance image to video" → Seedance 2.0 on Generate Video, i2v');
  const v8 = (await call('search_capabilities', { query: 'veo 8 s' })).body; assert.equal(v8.top[0].run.model, 'veo-3.1'); assert.equal(v8.top[0].run.fields.duration, '8');
  const v5 = (await call('search_capabilities', { query: 'veo 5 s' })).body; const veo5 = v5.modelMatches.find((x: any) => x.model === 'veo-3.1');
  assert.equal(veo5.fits, false); assert.match(veo5.why, /5 s is outside its lengths \(4, 6, 8 s\)/);
  ok('"veo 8 s" → Veo 3.1, 8 s; "veo 5 s" → Veo 3.1 does not fit, says its lengths');
  const fv = (await call('search_capabilities', { query: 'free video' })).body; assert.ok(fv.modelMatches.length && fv.modelMatches.every((x: any) => !x.fits || x.run.run_on === 'local'));
  assert.ok(fv.modelMatches.some((x: any) => x.fits && x.run.run_on === 'local'), 'a free local video model');
  ok(`"free video" → local runs (${fv.modelMatches.filter((x: any) => x.fits).map((x: any) => x.model).slice(0, 3).join(', ')})`);
  const kl = (await call('search_capabilities', { query: 'kling' })).body;
  assert.ok(!(kl.models ?? []).some((x: any) => /klein/.test(x.model)), 'no FLUX Klein for "kling"'); assert.ok(!(kl.modelMatches ?? []).some((x: any) => /klein/.test(x.model)));
  assert.ok((kl.models ?? []).some((x: any) => x.model === 'kling-v3'));
  ok('"kling" finds Kling, never FLUX Klein');
  const d = (await call('describe', { id: 'h3-video', model: 'kling-v3' })).body;
  assert.equal(d.narrowedTo, 'kling-v3'); assert.equal(d.models.length, 1); assert.deepEqual(d.fields.properties.resolution.enum, ['720p', '1080p']);
  assert.equal(d.fields.properties.duration.enum[0], '3'); assert.equal(d.fields.properties.duration.enum.at(-1), '15'); assert.ok(d.atDefault?.fields?.duration);
  assert.ok(typeof d.atDefault.priceLabel === 'string' || d.atDefault.priceLabel === null);
  ok(`describe {h3-video, kling-v3}: 3–15 s, 720p / 1080p, priced at ${JSON.stringify(d.atDefault.fields)} → ${d.atDefault.priceLabel}`);
  const bad = await call('describe', { id: 'h3-video', model: 'kling' }); assert.ok(bad.err); assert.match(String(bad.body), /no model "kling"\. Did you mean: .*kling-v3/);
  ok('describe with a model the tool lacks → did you mean');
  // step 8: tool_id is a plain string checked live ("did you mean"); types takes "generate" or ["generate"] (same request, same quote)
  const typo = await call('run', { tool_id: 'create_image', fields: { prompt: 'a mug', types: ['generate'] }, run_on: 'local' }); assert.ok(typo.err); assert.match(String(typo.body), /Unknown tool .create_image.\. Did you mean: create-image/);
  const qa = (await call('quote', { tool_id: 'h3-video', fields: { prompt: 'x', types: 'i2v', image: '/samples/sample-pattern.png' }, model: 'kling-v3' })).body; const qb = (await call('quote', { tool_id: 'h3-video', fields: { prompt: 'x', types: ['i2v'], image: '/samples/sample-pattern.png' }, model: 'kling-v3' })).body;
  assert.equal(qa.credits, qb.credits); assert.equal(qa.runnable, qb.runnable);
  const fr = await call('run', { tool_id: 'create-image', fields: { prompt: 'a mug on a desk', types: 'generate' }, run_on: 'local', wait_sec: 60 }); assert.ok(!fr.err, JSON.stringify(fr.body).slice(0, 300)); assert.equal(fr.body.status, 'done');
  ok('tool_id typo → did you mean create-image; types "i2v" prices like ["i2v"]; a free run with types "generate" runs');
  console.log('ALL OK model-search');
} finally { await c.close(); }
