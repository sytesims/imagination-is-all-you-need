// Model menu rows adapt instead of "Not for these settings" (2026-10-27, shared/settingsFit.ts + routing/quotesBatch.ts):
// 1. Create Video at 15 s text to video: every LTX row is priced at the settings picking it gives (LTX-2.5 Pro 10 s, 22B 5 s) with row.fit
//    (values, changes, the bar's note, the hover); LTX-2.5 Fast on Comfy Cloud (image jobs only) says "Needs a start image" with its action;
// 2. quote = charge: the row's credits = GET /price at the fitted settings = the job submitted with them;
// 3. MiniMax H3 at 480p (live report): the row adapts to 768p (or keeps 480p on a place that makes it) and is never a resolution error;
// 4. Create Image: a row moved off Auto names the change; rows that fit carry no fit.
// Run: npx tsx test/models-quotes-fit.e2e.ts (own port; temp data dir, mock backend, mock keys)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'mqf-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_COMFY_API_KEY: '', OPENHIGGSFIELD_USE_LOCAL: '' };
const PORT = testPort(8991); const B = `http://localhost:${PORT}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, '.env.local'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_HOSTED: '', OPENHIGGSFIELD_SKIP_MCP: '1' }, stdio: 'ignore', detached: true });
const ok = (m: string) => console.log('ok ' + m);
const batch = async (toolId: string, params: Record<string, string>, models?: { model: string; runOn?: string | null }[]) => { const r = await fetch(`${B}/api/models/quotes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ toolId, params, range: false, ...(models ? { models } : {}) }) }); assert.equal(r.status, 200); return (await r.json()).quotes as Record<string, any>; };
const price = async (toolId: string, q: Record<string, string>) => { const r = await fetch(`${B}/api/tools/${toolId}/price?${new URLSearchParams(q)}`); return { status: r.status, body: (await r.json()) as any }; };
const T2V = { duration: '15', resolution: '768p', types: 't2v', quality: 'quality', aspect: 'auto', audio: '1', bitrate: 'standard' };
try {
  for (let i = 0; i < 160; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }

  // ---- 1. Create Video, 15 s text to video ----
  const qs = await batch('h3-video', T2V, [{ model: 'ltx-2.5-pro', runOn: 'comfy-cloud' }, { model: 'ltx-2.5-22b', runOn: 'comfy-cloud' }, { model: 'ltx-2.5-fast', runOn: 'comfy-cloud' }, { model: 'minimax-h3' }, { model: 'veo-3.1' }]);
  const pro = qs['ltx-2.5-pro']; assert.equal(pro.runnable, true, JSON.stringify(pro)); assert.equal(pro.fit.values.duration, '10'); assert.match(pro.fit.note, /LTX-2\.5 Pro/); assert.match(pro.fit.hint, /^Will use .*10 s/);
  assert.ok(!/Not for these settings/.test(JSON.stringify(pro))); ok(`LTX-2.5 Pro row priced at ${pro.fit.hint} (${pro.credits} cr): "${pro.fit.note}"`);
  const b22 = qs['ltx-2.5-22b']; assert.equal(b22.fit.values.duration, '5'); assert.equal(b22.need, undefined); ok(`LTX-2.5 22B row adapts: ${b22.fit.note}`);
  const fast = qs['ltx-2.5-fast']; assert.equal(fast.runnable, false); assert.equal(fast.need?.short, 'Needs a start image'); assert.equal(fast.need?.action, 'add-image'); ok('LTX-2.5 Fast on Comfy Cloud: "Needs a start image" + Add image');
  { const h3 = qs['minimax-h3']; assert.equal(h3.ok, true); if (h3.fit) assert.match(h3.fit.note, /MiniMax H3/); ok(`MiniMax H3 at 15 s on ${h3.routeId}: ${h3.fit?.note ?? 'nothing to change'}`); }
  assert.equal(qs['veo-3.1'].fit.values.duration, '8'); ok(`Veo 3.1: ${qs['veo-3.1'].fit.note}`);

  // ---- 2. quote = charge at the fitted settings ----
  const used = { ...T2V, ...pro.fit.values, model: 'ltx-2.5-pro', runOn: 'comfy-cloud' }; const one = await price('h3-video', used);
  assert.equal(one.status, 200); assert.equal(one.body.credits, pro.credits, 'row = the bar\'s quote after the switch'); assert.equal(one.body.routeId, pro.routeId);
  const fd = new FormData(); for (const [k, v] of Object.entries({ ...used, prompt: 'A lighthouse at dusk, waves on the rocks.', quotedCredits: String(pro.credits), quotedRouteId: String(pro.routeId) })) fd.append(k, v);
  const sub = await fetch(`${B}/api/tools/h3-video/jobs`, { method: 'POST', body: fd }); const sb: any = await sub.json(); assert.equal(sub.status, 200, JSON.stringify(sb));
  const j: any = await (await fetch(`${B}/api/jobs/${sb.id}`)).json(); const charged = typeof j.cost === "number" ? j.cost : j.credits ?? j.cost?.credits; assert.equal(Number(charged), pro.credits, `job ${JSON.stringify({ credits: j.credits, cost: j.cost })}`);
  assert.equal(Number(j.input?.duration ?? j.params?.duration ?? used.duration), 10); ok(`quote = charge: row ${pro.credits} = GET /price ${one.body.credits} = job ${charged}`);
  // D5 (2026-10-28): a length the model doesn't make is snapped to the nearest one it does, and the quote says so (never silently)
  const pinned = await price('h3-video', { ...T2V, model: 'ltx-2.5-pro', runOn: 'comfy-cloud' }); assert.equal(pinned.status, 200, JSON.stringify(pinned.body).slice(0, 300));
  assert.ok((pinned.body.adjustNotes ?? []).some((n: string) => /Made at 10 s, the closest length/.test(n)), JSON.stringify(pinned.body.adjustNotes)); ok('API: 15 s on LTX-2.5 Pro is made at 10 s, with a note');

  // ---- 3. MiniMax H3 at 480p (live report: "Resolution must be one of 768p, 2K") ----
  const h = (await batch('h3-video', { ...T2V, resolution: '480p' }, [{ model: 'minimax-h3' }]))['minimax-h3'];
  assert.ok(!/must be one of/i.test(JSON.stringify(h)), JSON.stringify(h).slice(0, 400)); assert.equal(h.ok, true);
  if (h.fit?.values.resolution) { assert.equal(h.fit.values.resolution, '768p'); assert.match(h.fit.note, /768p/); ok(`MiniMax H3 480p → ${h.routeId}: ${h.fit.note}`); }
  else { assert.match(String(h.routeId), /cloud-h3-wf|local:/); ok(`MiniMax H3 480p kept on ${h.routeId}, a place that makes 480p${h.fit ? ` (${h.fit.note})` : ''}`); }

  // ---- 4. Create Image: a model without Auto names its shape ----
  const iq = await batch('create-image', { aspect: 'auto', imageResolution: '1K', n: '1', refs: '0', mode: 'generate' });
  const moved = Object.values(iq).filter((r: any) => r.fit); assert.ok(moved.length > 0); for (const r of moved as any[]) { assert.ok(r.fit.note.length > 10); assert.ok(r.fit.changes.length > 0); }
  ok(`Create Image: ${moved.length} rows name what picking them changes, e.g. "${(moved[0] as any).fit.note}"`);
  console.log('models-quotes-fit: all ok');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } fs.rmSync(D, { recursive: true, force: true }); }
