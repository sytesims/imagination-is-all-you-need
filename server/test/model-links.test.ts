/** Models page card data (2026-10-25): every model a tool offers (and every 3D model) has a maker the registry knows; every link in
 *  shared/modelLinks.ts is a well-formed https URL on a model the app offers, the release month is YYYY-MM, and most models have a link.
 *  No network (the URLs were opened by hand on the date in modelLinks.ts).
 *  Run: npx tsx test/model-links.test.ts (temp data dir, mock backend, no keys). */
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'modellinks-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
const { listTools } = await import('../src/tools/registry.js');
const R = await import('../src/routing/modelRegistry.js');
const { MAKERS, MODEL_MAKER, MODELS, makerOf } = await import('../src/shared/modelIds.js');
const { THREE_D_MODELS } = await import('../src/shared/threeD.js');
const { MODEL_LINKS, linksOf, releasedText } = await import('../src/shared/modelCatalog.js');
const ok = (m: string) => console.log('ok ' + m);

// 1. every catalog model has a maker mapping (registry table, every tool's models, the 3D list)
const offered = new Set<string>();
for (const k of Object.keys(MODELS)) { assert.ok(MODEL_MAKER[k], `MODELS ${k}: no MODEL_MAKER entry`); assert.ok(MAKERS[MODEL_MAKER[k]], `${k}: maker ${MODEL_MAKER[k]} not in MAKERS`); offered.add(k); }
for (const tool of listTools()) for (const m of R.toolModels(tool)) { offered.add(m.key); if (m.def.derived) continue; assert.ok(makerOf(m.key), `${tool.id}/${m.key} has no maker`); }
for (const m of THREE_D_MODELS) { assert.ok(makerOf(m.id), `3D ${m.id} has no maker`); offered.add(m.id); }
ok(`${offered.size} model keys: every registry and 3D model has a maker in MAKERS`);

// 2. links: known model, https, parseable, no duplicates inside one model, sane release month
const FIELDS = new Set(['announce', 'site', 'paper', 'card', 'docs', 'released']);
let urls = 0;
for (const [key, l] of Object.entries(MODEL_LINKS)) {
  assert.ok(offered.has(key), `MODEL_LINKS ${key}: not a model the app offers`);
  const seen = new Set<string>();
  for (const [f, v] of Object.entries(l)) {
    assert.ok(FIELDS.has(f), `${key}.${f}: unknown field`); assert.equal(typeof v, 'string', `${key}.${f}`);
    if (f === 'released') { assert.match(v as string, /^20\d\d-(0[1-9]|1[0-2])$/, `${key}.released`); assert.ok(releasedText(v as string), `${key}.released text`); assert.ok((v as string) <= '2026-10', `${key}.released in the future`); continue; }
    const u = new URL(v as string); assert.equal(u.protocol, 'https:', `${key}.${f}: https only (${v})`); assert.ok(u.hostname.includes('.'), `${key}.${f}: host`);
    assert.ok(!/\s/.test(v as string), `${key}.${f}: no spaces`); assert.ok(!seen.has(v as string) || f === 'docs', `${key}.${f}: same URL twice`); seen.add(v as string); urls++;
    if (f === 'paper') assert.match(v as string, /^https:\/\/arxiv\.org\/abs\/\d{4}\.\d{4,5}$/, `${key}.paper: an arXiv abstract page`);
    if (f === 'card') assert.match(v as string, /^https:\/\/huggingface\.co\/[\w.-]+\/[\w.-]+$/, `${key}.card: a Hugging Face model page`);
  }
}
const linked = Object.keys(MODEL_LINKS).filter((k) => Object.keys(linksOf(k)).some((f) => f !== 'released'));
assert.ok(linked.length >= 100, `at least 100 models have a link (${linked.length})`);
assert.deepEqual(linksOf('local-turntable'), {}, 'our own in-browser tools have no links'); assert.deepEqual(linksOf(null), {});
assert.equal(releasedText('2025-11'), 'Nov 2025'); assert.equal(releasedText('bad'), null);
// 2026-10-31: the new Router models each have an About link on the maker's own site (never Comfy or fal)
for (const k of ['veo-3.1-lite', 'wan-3.0-prime', 'p-video-2', 'grok-imagine-video-1.5-lite', 'heygen-voice']) { const l = linksOf(k); const urls = [l.announce, l.site].filter(Boolean) as string[];
  assert.ok(urls.length || l.docs, `${k}: an About link`); for (const u of [...urls, l.docs].filter(Boolean) as string[]) assert.ok(!/comfy\.org|fal\.ai/.test(u), `${k}: maker link, not ${u}`); }
assert.equal(linksOf('veo-3.1-lite').announce, 'https://blog.google/innovation-and-ai/technology/ai/veo-3-1-lite/'); assert.equal(linksOf('p-video-2').site, 'https://www.pruna.ai/p-video-2');
ok(`${linked.length} models with links, ${urls} URLs, all https and well-formed; papers are arXiv, cards are Hugging Face`);
fs.rmSync(D, { recursive: true, force: true });
