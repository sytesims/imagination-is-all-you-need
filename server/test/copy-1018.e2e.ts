// DP copy asks (N): user-facing descriptions and hints on /api/tools and /api/models carry no file path, env var or '.json'.
// Run: npx tsx test/copy-1018.e2e.ts (own mock server :8983, temp data dir)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-')); const ok = (m: string) => console.log('ok ' + m);
const PORT = testPort(8983); const B = `http://localhost:${PORT}`; const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock' } });
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const texts: [string, string][] = []; const add = (w: string, v: unknown) => { if (typeof v === 'string' && v) texts.push([w, v]); };
  const tools = await get('/api/tools');
  for (const t of tools) { add(`tool ${t.id}`, t.description); for (const pr of t.providers ?? []) { add(`${t.id}/${pr.id}.description`, pr.description); add(`${t.id}/${pr.id}.hint`, pr.hint); }
    for (const g of (await get(`/api/models?toolId=${t.id}`)).groups ?? []) for (const m of g.models) { add(`model ${t.id}/${m.id}.description`, m.description); add(`model ${t.id}/${m.id}.hint`, m.hint); } }
  const PATHISH = /workflows\/|\.json\b|\b(OPENHIGGSFIELD|OPENJUTSU|COMFY)_[A-Z_]+\b|\b[A-Z][A-Z0-9]+_[A-Z0-9_]{3,}\b/;
  const bad = texts.filter(([, v]) => PATHISH.test(v)); assert.deepEqual(bad, [], 'no path / env var / .json in user-facing copy');
  ok(`N1: ${texts.length} descriptions/hints on /api/tools + /api/models: no file path, env var or .json`);
  // N2: plain language; technical detail lives in the separate `tech` field
  const JARGON = /\bLoRAs?\b|BF16|FP8|INT8|W6A8|\bSFT\b|step-distill|partner nodes?|our open graph|pose guide/i;
  const jb = texts.filter(([, v]) => JARGON.test(v)); assert.deepEqual(jb, [], 'no jargon in descriptions/hints');
  const ms = new Map<string, any>(); for (const t of tools) for (const g of (await get(`/api/models?toolId=${t.id}`)).groups ?? []) for (const m of g.models) ms.set(`${t.id}/${m.id}`, m);
  assert.match(ms.get('create-image/comfy-moss-image').description, /text and posters/); assert.equal(ms.get('create-image/comfy-moss-image').tech, 'MOSS-Image 5B (tuned release)');
  // DP: plain model copy (no checkpoint jargon, no training implications)
  for (const [k, m] of ms) for (const f of ['description', 'tech', 'hint']) assert.doesNotMatch(String((m as any)[f] ?? ''), /\bSFT\b|LoRA work|LoRA training|custom training/i, `${k}.${f}: ${(m as any)[f]}`);
  { const pr = await get('/api/pricing'); assert.doesNotMatch(JSON.stringify(pr.explanation ?? pr), /usd null/i, 'pricing explanation has no "usd null"'); }
  assert.equal(ms.get('h3-video/comfy-h3').tech, 'BF16 / INT8 / FP8-scaled / W6A8 repacks'); assert.equal(ms.get('object-swap/comfy-open').tech, 'SAM2 masks, lightx2v step-distill LoRA');
  const api = [...ms.values()].filter((m) => /^api-/.test(m.id)); assert.ok(api.length >= 20); for (const m of api) assert.equal(m.tech, 'Comfy partner node (API)', m.id);
  assert.ok(api.filter((m) => m.hint === "In the cloud; priced before you run.").length >= 20);
  ok(`N2: no jargon (LoRA, BF16, FP8, INT8, W6A8, SFT, step-distill, partner nodes, 'our open graph', 'pose guide') in ${texts.length} texts; tech field carries it (${api.length} api-* = 'Comfy partner node (API)')`);
  // N3: /api/routes via.text never carries a price (prices come from the quote only)
  { let n = 0; for (const t of tools) { const r = await get(`/api/routes?toolId=${t.id}`); for (const m of r.routes ?? []) if (m.via?.text) { n++; assert.ok(!/✦|\d+\s*credits|list/i.test(m.via.text), `${t.id}/${m.modelId} via.text "${m.via.text}"`); } }
    const rs = (await get('/api/routes?toolId=reshoot')).routes.map((m: any) => m.via?.text); assert.ok(!rs.some((x: string) => /Demo preview ·/.test(x ?? '')), JSON.stringify(rs));
    ok(`N3: ${n} via.text values without prices (reshoot: ${JSON.stringify([...new Set(rs)])})`); }
  // N4: /api/models/:id description = the card description (was null), plus tech + minComfyVersion
  { const md = await get('/api/models/comfy-open'); assert.equal(typeof md.description, 'string'); assert.ok(md.description.length > 5); assert.ok('tech' in md && 'minComfyVersion' in md);
    const mm = await get('/api/models/comfy-moss-image'); assert.equal(mm.description, ms.get('create-image/comfy-moss-image').description); assert.equal(mm.minComfyVersion, '0.41.3'); assert.equal(mm.tech, 'MOSS-Image 5B (tuned release)');
    const h = await get('/api/models/api-flux2'); assert.equal(h.description, ms.get('create-image/api-flux2').description);
    ok(`N4: /api/models/:id description from the card ("${mm.description.slice(0, 40)}…"), tech, minComfyVersion ${mm.minComfyVersion}`); }
  // N5: Re-shoot's local provider is named after the model its graph loads (LTX-2 19B), never 'Open weights'
  { const rt = (await get('/api/routes?toolId=reshoot&modelId=comfy-open')).routes[0]; assert.equal(rt.displayName, 'LTX-2 19B');
    const tp = tools.find((t: any) => t.id === 'reshoot').providers.find((p: any) => p.id === 'comfy-open'); assert.equal(tp.displayName, 'LTX-2 19B'); assert.notEqual(tp.name, 'Open weights');
    assert.equal(ms.get('reshoot/comfy-open').name, 'LTX-2 19B'); assert.match(ms.get('reshoot/comfy-open').tech, /pose IC-LoRA/);
    ok(`N5: reshoot comfy-open = LTX-2 19B on /api/routes, /api/tools (name "${tp.name}"), /api/models`); }
  console.log('ALL OK copy-1018');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); }
