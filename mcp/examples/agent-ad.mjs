#!/usr/bin/env node
/**
 * Agent ad demo: drives the Imagination Is All You Need MCP server through the whole "make a 20-second ad with a $2 budget" flow, the way an agent
 * (Claude, Cursor…) would: set_budget → plan_budget → product shot (local, $0) → 3 clips (Comfy Cloud) → music bed → a 4th clip the server
 * REFUSES (over budget, nothing sent) → stitch_video → get_receipt.
 *
 *   node mcp/examples/agent-ad.mjs                      # boots its own mock API (temp data dir, mock keys, no network, no spend), then cleans up
 *   OPENHIGGSFIELD_API=http://localhost:8787 node mcp/examples/agent-ad.mjs   # use a running API instead (mock backend recommended: a real
 *                                                       # backend spends real money on your accounts, within the $2 budget)
 * Needs: mcp/node_modules (npm run mcp:install), ffmpeg on PATH. Uses mcp/dist/index.js when built, else runs mcp/src with tsx.
 * Env: AGENT_AD_PORT (own mock API port, default 8890), AGENT_AD_BUDGET (USD, default 2).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)); const MCP_DIR = path.resolve(HERE, '..'); const SERVER_DIR = path.resolve(MCP_DIR, '../server');
const BUDGET = Number(process.env.AGENT_AD_BUDGET) || 2;
let api = process.env.OPENHIGGSFIELD_API?.replace(/\/$/, ''); let own = null; let dataDir = null;
const cleanup = () => { if (own) try { process.kill(-own.pid, 'SIGTERM'); } catch { /* gone */ } if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true }); };
process.on('SIGINT', () => { cleanup(); process.exit(130); });

if (!api) {
  const port = Number(process.env.AGENT_AD_PORT) || 8890; api = `http://localhost:${port}`;
  if (await fetch(`${api}/api/health`).then(() => true, () => false)) { console.error(`:${port} is already in use. Set AGENT_AD_PORT to a free port, or OPENHIGGSFIELD_API to use that server.`); process.exit(1); }
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-ad-'));
  own = spawn('npx', ['tsx', 'src/index.ts'], { cwd: SERVER_DIR, detached: true, stdio: 'ignore', env: { ...process.env, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: dataDir, OPENHIGGSFIELD_ENV_FILE: path.join(dataDir, '.env.local'),
    OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_USE_LOCAL: '', COMFY_API_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '' } });
  let up = false; for (let i = 0; i < 120 && !up; i++) { up = await fetch(`${api}/api/health`).then((r) => r.ok, () => false); if (!up) await new Promise((r) => setTimeout(r, 500)); }
  if (!up) { cleanup(); console.error('the mock API did not start'); process.exit(1); }
  console.log(`mock API on ${api} (temp data, mock keys: prices are real list prices, nothing is sent or charged)\n`);
}
const health = await fetch(`${api}/api/health`).then((r) => r.json()).catch(() => ({}));
if (health.backend && health.backend !== 'mock') console.log(`WARNING: ${api} runs the ${health.backend} backend: these runs are REAL and bill your accounts (capped at $${BUDGET}).\n`);

const dist = path.join(MCP_DIR, 'dist/index.js');
const transport = fs.existsSync(dist) ? new StdioClientTransport({ command: process.execPath, args: [dist], env: { ...process.env, OPENHIGGSFIELD_API: api, OPENHIGGSFIELD_MCP_POLL_MS: '500' } })
  : new StdioClientTransport({ command: 'npx', args: ['tsx', 'src/index.ts'], cwd: MCP_DIR, env: { ...process.env, OPENHIGGSFIELD_API: api, OPENHIGGSFIELD_MCP_POLL_MS: '500' } });
const mcp = new Client({ name: 'agent-ad-demo', version: '1' }); await mcp.connect(transport);

const usd = (n) => (n == null ? '-' : `$${Number(n).toFixed(2)}`);
const filePath = (u) => { try { return new URL(u).pathname; } catch { return u; } }; // web links → /files/… (the MCP server fetches media from the API)
async function call(name, args, show) {
  console.log(`→ ${name}(${JSON.stringify(args)})`);
  const r = await mcp.callTool({ name, arguments: args }, undefined, { timeout: 600_000 });
  const t = r.content?.find((c) => c.type === 'text')?.text ?? ''; let j; try { j = JSON.parse(t); } catch { j = t; }
  console.log(`  ${r.isError ? '✗' : '✓'} ${show ? show(j, r) : typeof j === 'string' ? j.slice(0, 200) : ''}`);
  return { ok: !r.isError, j, r };
}
const done = (j) => `${j.status} · ${j.model ?? ''} on ${j.run_on ?? '?'} · ${filePath(j.result_url)}`;
let failed = false;
try {
  console.log(`User: "Make a 20-second ad for our terracotta mug. Budget ${usd(BUDGET)}. Show me the receipt."\n`);
  await call('set_budget', { name: 'Claude', budget_usd: BUDGET }, (j) => `budget ${j.id}: ${usd(j.budgetUsd)}`);
  const CLIP = { model: 'minimax-h3', runOn: 'comfy-cloud', duration: 6, types: '["i2v"]', image: 1 };
  await call('plan_budget', { steps: [
    { label: 'product shot (FLUX 3 Klein, your GPU)', tool_id: 'create-image', params: { model: 'flux-3-klein', runOn: 'local' } },
    { label: 'clip 1', tool_id: 'h3-video', params: CLIP }, { label: 'clip 2', tool_id: 'h3-video', params: CLIP }, { label: 'clip 3', tool_id: 'h3-video', params: CLIP },
    { label: 'music bed', tool_id: 'audio', params: { model: 'minimax-music-3', runOn: 'comfy-cloud', types: '["music"]', duration: 30 } }] },
    (j) => `\n${j.steps.map((s) => `      ${s.label.padEnd(38)} ${usd(s.usd).padStart(6)}  ${s.local ? 'your GPU' : s.billedTo}`).join('\n')}\n      total ${usd(j.totalUsd)} of ${usd(j.budget?.remainingUsd)} left → fits: ${j.fits}`);

  const shot = await call('generate_image', { prompt: 'a matte terracotta coffee mug on a pale oak table, soft morning window light, studio product photo', model: 'flux-3-klein', run_on: 'local' }, done);
  if (!shot.ok) throw new Error('product shot failed');
  const image = filePath(shot.j.result_url);
  const beats = ['slow push-in on the mug as steam rises', 'a hand lifts the mug, warm light, shallow depth of field', 'the mug on a sunny windowsill, camera orbits slowly'];
  const subs = [];
  for (const prompt of beats) subs.push(await call('generate_video', { prompt, mode: 'i2v', image, duration: 6, model: 'minimax-h3', run_on: 'comfy-cloud', wait: false }, (j) => `submitted ${j.submitted?.id} (${usd(j.submitted?.estimate?.estUsd)} on ${j.submitted?.estimate?.billedToName ?? '?'})`));
  const clips = [];
  for (const s of subs) { if (!s.ok) continue; const w = await call('wait_for_job', { id: s.j.submitted.id, timeout_sec: 600 }, done); if (w.ok) clips.push(w.j.id); }
  const music = await call('generate_audio', { prompt: 'warm acoustic guitar, light percussion, cosy morning feel', mode: 'music', duration: 30, model: 'minimax-music-3', run_on: 'comfy-cloud' }, done);
  await call('get_budget', {}, (j) => `spent ${usd(j.spentUsd)} of ${usd(j.budgetUsd)}, ${usd(j.remainingUsd)} left`);
  const extra = await call('generate_video', { prompt: 'close-up of coffee pouring into the mug', mode: 'i2v', image, duration: 6, model: 'minimax-h3', run_on: 'comfy-cloud' },
    (j) => (j.refused ? `REFUSED by the server: needs ${usd(j.neededUsd)}, only ${usd(j.remainingUsd)} left. Nothing was sent or charged.` : done(j)));
  if (extra.ok) { failed = true; console.log('  (expected a refusal here)'); }
  const ad = await call('stitch_video', { clips, music: music.ok ? music.j.id : undefined, title: 'Terracotta mug, 18 s ad' }, (j) => `${j.status} · ${j.durationSec}s ${j.width}x${j.height}${j.music ? ' with music' : ''} · ${filePath(j.result_url)} · ${usd(j.cost)}`);
  if (!ad.ok) failed = true;
  console.log('→ get_receipt({})');
  const rc = await mcp.callTool({ name: 'get_receipt', arguments: {} });
  console.log(`\n${rc.content?.[0]?.text ?? ''}\n`);
  if (rc.isError) failed = true;
} catch (e) { failed = true; console.error(`\nFAILED: ${e.message}`); }
finally { await mcp.close().catch(() => undefined); cleanup(); }
process.exit(failed ? 1 : 0);
