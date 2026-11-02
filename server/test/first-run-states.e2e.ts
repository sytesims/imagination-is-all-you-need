// First-run states (2026-11-02): what the Generate bar and a Canvas card would say for each kind of model in the 4 first-run states,
// read from the same GET /api/tools/:id/price the UI reads (cost.billedTo / runOn → the place; needsKey + runnable → "Needs a key").
// States: (1) no key + no ComfyUI, (2) Comfy key only, (3) ComfyUI connected only, (4) both. Mock backend, temp data, no network.
// Rule: "Free · Your computer" only when this computer can run it; nothing can run it → "Needs a key" or the quote's own reason; cloud can → its real price.
// Run: npx tsx test/first-run-states.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_LUMA_API_KEY: '', OPENHIGGSFIELD_OPENAI_API_KEY: '', OPENAI_API_KEY: '' };
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'firstrun-')); const procs: ChildProcess[] = [];
const boot = (port: number, extra: Record<string, string>) => { const dd = fs.mkdtempSync(path.join(D, 'd-'));
  procs.push(spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, ...NOKEYS, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: dd, OPENHIGGSFIELD_ENV_FILE: path.join(dd, '.env.local'),
    OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_DEMO_AUTO: '0', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(dd, 'nofilm.json'), COMFY_DETECT_URLS: 'http://127.0.0.1:9', ...extra } })); return `http://localhost:${port}`; };
const ready = async (B: string) => { for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) return; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); } throw new Error(`${B} did not start`); };
const ok = (m: string) => console.log('ok ' + m);
const NO_LOCAL = { OPENHIGGSFIELD_LOCAL_AVAILABLE: '0', OPENHIGGSFIELD_USE_LOCAL: '0' }, LOCAL = { OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '1' }, KEY = { COMFY_API_KEY: 'test-not-a-key' };
const STATES = [{ name: 'no key, no ComfyUI', env: { ...NO_LOCAL }, key: false, local: false }, { name: 'Comfy key only', env: { ...NO_LOCAL, ...KEY }, key: true, local: false },
  { name: 'ComfyUI only', env: { ...LOCAL }, key: false, local: true }, { name: 'both', env: { ...LOCAL, ...KEY }, key: true, local: true }] as const;
const MODELS = (process.env.FIRSTRUN_MODELS ? JSON.parse(process.env.FIRSTRUN_MODELS) : [['create-image', 'comfy-zimage-turbo'], ['h3-video', 'router-kling'], ['create-image', 'api-gpt-image-25-flare'], ['h3-video', 'comfy-h3'], ['h3-video', 'comfy-ltx25-video']]) as [string, string][];
/** The place and price words the card row / Generate button would show (canvas/cardLook.placeWord + shared/DockGenerate + GenPrice), from the quote. */
const shown = (q: any) => { const key = q.needsKey === true && q.runnable === false; const local = q.localRun === true || q.cost?.billedTo === 'local' || q.runOn === 'local';
  return { local, price: q.demo ? 'Sample' : key ? 'Needs a key' : local ? 'Free · Your computer' : typeof q.cost?.estUsd === 'number' && q.runnable !== false ? `≈ $${q.cost.estUsd}` : (q.reason || q.priceLine || null) }; };
try {
  const Bs = STATES.map((s, i) => boot(testPort(9551 + i), s.env)); await Promise.all(Bs.map(ready));
  for (const [i, s] of STATES.entries()) for (const [tool, prov] of MODELS) {
    const q = await (await fetch(`${Bs[i]}/api/tools/${tool}/price?provider=${prov}&prompt=a%20cat${tool === 'h3-video' ? '&mode=t2v' /* the Video bar sends its mode */ : ''}`)).json() as any; const w = shown(q); const tag = `${s.name} · ${prov}`;
    if (process.env.FIRSTRUN_DEBUG) console.log(tag, JSON.stringify({ runnable: q.runnable, needsKey: q.needsKey, routeKind: q.routeKind, runOn: q.runOn, local: q.local, localRun: q.localRun, billed: q.cost?.billedTo, est: q.cost?.estUsd, reason: q.reason }), '→', JSON.stringify(w));
    if (w.local) { assert.ok(s.local, `${tag}: says Free · Your computer with no ComfyUI connected`); assert.equal(q.routeKind ?? 'local', 'local', `${tag}: local price on a ${q.routeKind} route`); }
    if (q.runnable === false && !q.demo) { assert.ok(w.price && !/^Free/.test(w.price), `${tag}: can't run but says ${w.price}`); assert.ok(!w.local || q.routeKind === 'local', `${tag}: no place is not local`); }
    if (q.runnable === true && q.routeKind && q.routeKind !== 'local') { assert.ok(q.cost?.estUsd > 0 && !w.local, `${tag}: cloud run without its real price (${JSON.stringify(q.cost)})`); assert.match(w.price!, /^≈ \$/, tag); }
    if (!s.key && !s.local) assert.equal(q.runnable, false, `${tag}: nothing connected, yet it runs on ${q.routeKind}`);
    const cloudOnly = prov === 'router-kling' || prov === 'api-gpt-image-25-flare';
    if (cloudOnly) { assert.equal(w.local, false, `${tag}: a cloud-only model is never local`); assert.equal(q.runnable, s.key, `${tag}: runs exactly when the Comfy key is set`); if (!s.key) assert.equal(w.price, 'Needs a key', tag); }
    if (prov === 'comfy-zimage-turbo' && s.local) assert.equal(w.price, 'Free · Your computer', `${tag}: a local model on a connected ComfyUI is free here`);
  }
  ok(`${STATES.length} first-run states × ${MODELS.length} models: Free · Your computer only when this computer runs it; Needs a key / the reason when nothing can; the real price on the cloud`);
} finally { for (const p of procs) try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } fs.rmSync(D, { recursive: true, force: true }); }
