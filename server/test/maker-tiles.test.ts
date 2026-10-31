/** Maker tiles (2026-10-24, initials 2026-10-29): every model the app offers has a maker in the registry (server/src/shared/modelIds.ts MAKERS,
 *  the one source), and that maker's tile is a real logo (web/src/shared/makers.ts MAKER_LOGO, file present), our app mark (MAKER_GLYPH), or
 *  the maker's initial; makers on the initial must be on NO_LOGO_YET below. No model falls to the generic medium glyph.
 *  Also: every /api/models card's model key resolves to a maker (the preSerialization hook adds maker from modelKeyOf), the 3D models'
 *  own maker keys match the registry, and the old name-guessing fallback gets the bug cases right.
 *  Run: npx tsx test/maker-tiles.test.ts (temp data dir, mock backend, no keys, no network). */
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'makertiles-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
const { listTools } = await import('../src/tools/registry.js');
const R = await import('../src/routing/modelRegistry.js');
const { MAKERS, MODEL_MAKER, makerOf } = await import('../src/shared/modelIds.js');
const { THREE_D_MODELS, THREE_D_SHOWCASE } = await import('../src/shared/threeD.js');
const ok = (m: string) => console.log('ok ' + m);

// makers.ts imports SVGs with ?raw (Vite only), so read its two maps from the source
const WEB = path.resolve(import.meta.dirname, '../../web/src/shared');
const src = fs.readFileSync(path.join(WEB, 'makers.ts'), 'utf8');
const block = (name: string) => { const m = src.match(new RegExp(`export const ${name}[^=]*= \\{([\\s\\S]*?)\\n\\};`)); assert.ok(m, `${name} block`); return m![1]; };
const keysOf = (body: string) => [...body.replace(/\/\/.*$/gm, '').matchAll(/(?:^|[\s,{])'?([a-z0-9-]+)'?\s*(?::|,|$)/gm)].map((x) => x[1]).filter((k) => !/^(app|open)$/.test(k));
const imports = new Map([...src.matchAll(/import (\w+) from '\.\.\/assets\/makers\/([\w-]+\.svg)\?raw';/g)].map((x) => [x[1], x[2]]));
const LOGO = new Map<string, string>(); for (const line of block('MAKER_LOGO').split('\n')) { const m = line.replace(/\/\/.*$/, '').match(/^\s*'?([a-z0-9-]+)'?(?::\s*(\w+))?,/); if (m) LOGO.set(m[1], m[2] ?? m[1]); }
const GLYPH = new Set(keysOf(block('MAKER_GLYPH')));
for (const [k, v] of LOGO) { const f = imports.get(v); assert.ok(f, `${k}: import ${v}`); assert.ok(fs.existsSync(path.resolve(WEB, '../assets/makers', f!)), `${k}: file ${f}`); assert.ok(MAKERS[k], `logo key ${k} is a registry maker`); }
for (const k of GLYPH) assert.ok(MAKERS[k], `glyph key ${k} is a registry maker`);
ok(`${LOGO.size} logos wired, every file present; ${GLYPH.size} makers on our own mark`);

/** Makers with no usable official mark (no Simple Icons icon and no square SVG on an official site): their initial. Keep this short. */
const NO_LOGO_YET = new Set(['xai', 'stability', 'topaz', 'heygen', 'bria', 'tripo', 'microsoft', 'resemble', 'sonilo', 'meshy', 'rodin', 'meigen',
  'real-esrgan', 'ultrasharp', 'phhofm', 'rife', 'depth-anything', 'birefnet', 'mmaudio', 'swivid', 'm-a-p', 'ace-step', 'openmoss', 'pixal3d', 'pruna' /* P-Video-2, 2026-10-31 */]);
for (const k of NO_LOGO_YET) assert.ok(!LOGO.has(k), `${k} has a logo now: take it off NO_LOGO_YET`);
const tileOf = (k: string) => (LOGO.has(k) ? 'logo' : GLYPH.has(k) ? 'glyph' : NO_LOGO_YET.has(k) ? 'initial' : null);

// every model every tool offers (/api/tools models[]) has a maker with a tile
const seen = new Map<string, string>(); let n = 0;
for (const tool of listTools()) for (const m of R.toolModels(tool)) {
  n++; const mk = makerOf(m.key); assert.ok(mk, `${tool.id}/${m.key} (${m.def.name}) has no maker`); assert.ok(tileOf(mk!.key), `${m.key}: maker ${mk!.key} has no logo or glyph and is not on NO_LOGO_YET`); seen.set(m.key, mk!.key);
}
const count = (t: string) => [...seen.values()].filter((k) => tileOf(k) === t).length;
ok(`${seen.size} models (${n} tool rows): every one has a maker; ${count('logo')} logo, ${count('glyph')} our mark, ${count('initial')} initial`);

// every /api/models card (one per tool engine) resolves to a maker the same way the preSerialization hook does
let cards = 0; for (const tool of listTools()) for (const e of tool.providers) { const key = R.modelKeyOf(tool.id, e); if (!key) continue; cards++; assert.ok(makerOf(key), `${tool.id}:${e} → ${key} has no maker`); }
ok(`${cards} /api/models engine cards resolve to a maker`);

// 3D: the model list's own maker keys are the registry's
for (const m of THREE_D_MODELS) { assert.equal(MODEL_MAKER[m.id], m.maker, `${m.id} maker`); assert.equal(MAKERS[m.maker]?.name, m.makerName, `${m.id} makerName`); }
for (const s of THREE_D_SHOWCASE) assert.ok(MAKERS[s.modelKey] && tileOf(s.modelKey), `showcase ${s.id}: maker ${s.modelKey}`);
assert.equal(MODEL_MAKER['fal-hunyuan3d-31'], 'tencent-hunyuan'); assert.equal(MODEL_MAKER['local-turntable'], 'openhiggsfield');
ok('3D models and showcase use registry maker keys (tencent → tencent-hunyuan, Turntable → our mark)');

// the name fallback (older rows that carry only a name): the cases that used to show initials
const BY = src.slice(src.indexOf('const BY_NAME'), src.indexOf('export const makerKeyFromName'));
const rules = [...BY.matchAll(/\[\/(.+?)\/(i?), '([a-z0-9-]+)'\]/g)].map((x) => [new RegExp(x[1], x[2]), x[3]] as const);
const guess = (s: string) => rules.find(([re]) => re.test(s))?.[1] ?? null;
for (const [name, want] of [['ACE-Step 1.5', 'ace-step'], ['Real-ESRGAN', 'real-esrgan'], ['4x-UltraSharp', 'ultrasharp'], ['Z-Image-Turbo 2K upscaler', 'tongyi'], ['YuE2', 'm-a-p'],
  ['TRELLIS.2', 'microsoft'], ['Pixal3D + TRELLIS.2', 'pixal3d'], ['Tripo 3.1', 'tripo'], ['FASHN Try-On', 'fashn'], ['fal Object Removal', 'fal'], ['Turntable', 'openhiggsfield'], ['Stable Audio Open 1.0', 'stability']] as const)
  assert.equal(guess(name), want, name);
ok('name fallback: ACE-Step, Real-ESRGAN, 4x-UltraSharp, Z-Image upscaler, YuE2, 3D and photo-app names resolve');
fs.rmSync(D, { recursive: true, force: true });
