/**
 * `openhiggsfield-mcp setup claude|chatgpt|all`: writes agent configs from the running server's /api/config.mcp.
 * Prep only: writes local files, uploads and publishes nothing.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { staleWarning } from './freshness.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
type Opts = { target: string; api: string; publicUrl?: string; npx: boolean; home: string; dry: boolean };

function parse(argv: string[]): Opts {
  const o: Opts = { target: argv[0] ?? '', api: (process.env.OPENHIGGSFIELD_API || 'http://localhost:8787').replace(/\/$/, ''), npx: false, home: os.homedir(), dry: false };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--api') o.api = argv[++i].replace(/\/$/, ''); else if (a === '--public-url') o.publicUrl = argv[++i].replace(/\/$/, '');
    else if (a === '--npx') o.npx = true; else if (a === '--home') o.home = path.resolve(argv[++i]); else if (a === '--dry-run') o.dry = true;
    else throw new Error(`unknown option ${a}`);
  }
  if (!['claude', 'chatgpt', 'all'].includes(o.target)) throw new Error('usage: openhiggsfield-mcp setup claude|chatgpt|all [--api URL] [--public-url URL] [--npx] [--home DIR] [--dry-run]');
  return o;
}

/** Skill files: repo agent-skills/ (dev) or the copy packed into the npm tarball (skills/). */
function skillsDir() {
  for (const d of [path.resolve(HERE, '../../agent-skills'), path.resolve(HERE, '../skills')]) if (fs.existsSync(path.join(d, 'claude/openhiggsfield/SKILL.md'))) return d;
  throw new Error('agent skill files not found (expected agent-skills/ next to mcp/)');
}

/** The creative skills (repo skills/, or skills/creative in the package): one folder per skill with SKILL.md. */
function creativeSkills(): { dir: string; names: string[] } | null {
  for (const d of [path.resolve(HERE, '../../skills'), path.resolve(HERE, '../skills/creative')]) if (fs.existsSync(d)) {
    const names = fs.readdirSync(d).filter((n) => fs.existsSync(path.join(d, n, 'SKILL.md'))); if (names.length) return { dir: d, names };
  }
  return null;
}

async function serverMcp(o: Opts) {
  try {
    const r = await fetch(`${o.api}/api/config`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) { const c: any = await r.json(); if (c?.mcp?.stdio) return { mcp: c.mcp, from: `${o.api}/api/config` }; }
  } catch { /* server not running */ }
  const entry = path.resolve(HERE, 'index.js');
  const inCache = /[\\/]_npx[\\/]/.test(entry);
  const env = { OPENHIGGSFIELD_API: o.api };
  return { mcp: { stdio: { command: 'node', args: [entry], env }, npx: { command: 'npx', args: ['-y', 'openhiggsfield-mcp'], env }, httpUrl: 'http://127.0.0.1:8788/mcp', apiUrl: o.api, preferNpx: inCache }, from: 'local fallback (API not reachable)' };
}

/** The server's name in client configs (mcpServers key). Earlier versions used LEGACY_KEY; setup replaces that entry. */
const SERVER_KEY = 'imagination';
const LEGACY_KEY = 'openhiggsfield';
const log: string[] = [];
function write(o: Opts, file: string, data: string | Buffer) {
  log.push(`${o.dry ? 'would write' : 'wrote'} ${file}`);
  if (o.dry) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}
function mergeJson(o: Opts, file: string, server: object) {
  let j: any = {};
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file, 'utf8');
    try { j = raw.trim() ? JSON.parse(raw) : {}; } catch { throw new Error(`${file} is not valid JSON; fix it or move it away first`); }
    if (!o.dry) fs.copyFileSync(file, `${file}.bak`); log.push(`${o.dry ? 'would back up' : 'backed up'} ${file} -> ${file}.bak`);
  }
  const { [LEGACY_KEY]: _old, ...rest } = j.mcpServers ?? {}; void _old; // the entry earlier versions wrote under the old name, replaced so the tools don't show up twice
  j.mcpServers = { ...rest, [SERVER_KEY]: server };
  write(o, file, JSON.stringify(j, null, 2) + '\n');
}
function claudeDesktopConfig(home: string) {
  if (process.platform === 'darwin') return path.join(home, 'Library/Application Support/Claude/claude_desktop_config.json');
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData/Roaming'), 'Claude/claude_desktop_config.json');
  return path.join(home, '.config/Claude/claude_desktop_config.json');
}

async function claude(o: Opts, mcp: any) {
  const server = o.npx || mcp.preferNpx ? mcp.npx : mcp.stdio;
  const skill = path.join(skillsDir(), 'claude/openhiggsfield');
  mergeJson(o, claudeDesktopConfig(o.home), server);
  mergeJson(o, path.join(o.home, '.claude.json'), { type: 'stdio', ...server });
  for (const f of fs.readdirSync(skill)) write(o, path.join(o.home, '.claude/skills/openhiggsfield', f), fs.readFileSync(path.join(skill, f)));
  const creative = creativeSkills();
  for (const n of creative?.names ?? []) for (const f of fs.readdirSync(path.join(creative!.dir, n))) write(o, path.join(o.home, '.claude/skills', n, f), fs.readFileSync(path.join(creative!.dir, n, f)));
  const out = path.join(o.home, '.openhiggsfield/agents/claude');
  write(o, path.join(out, 'mcp.json'), JSON.stringify({ mcpServers: { [SERVER_KEY]: server } }, null, 2) + '\n');
  const zip = path.join(out, 'openhiggsfield-skill.zip');
  if (!o.dry) {
    fs.mkdirSync(out, { recursive: true }); fs.rmSync(zip, { force: true });
    try { execFileSync('zip', ['-qr', zip, 'openhiggsfield'], { cwd: path.dirname(skill) }); log.push(`wrote ${zip}`); }
    catch {
      try { execFileSync('python3', ['-c', 'import shutil,sys; shutil.make_archive(sys.argv[1][:-4], "zip", sys.argv[2], "openhiggsfield")', zip, path.dirname(skill)]); log.push(`wrote ${zip}`); }
      catch { log.push(`skipped ${zip} (no zip or python3); upload the folder ${skill} instead`); }
    }
  } else log.push(`would write ${zip}`);
  return [`Claude Desktop: restart it; the "${SERVER_KEY}" tools appear in the tools menu.`,
    `Claude (skills): Customize -> Skills -> Upload skill -> ${zip}`,
    `Claude Code: skills installed at ~/.claude/skills/ (openhiggsfield${creative ? `, ${creative.names.join(', ')}` : ''}); MCP added to ~/.claude.json.`];
}

const ACTION_OPS: Record<string, [string, string, string]> = {
  listTools: ['get', '/api/tools', 'List tools with inputs, presets and providers'],
  listModels: ['get', '/api/models', 'Model cards per tool (licence, speed, quality)'],
  getToolPrice: ['get', '/api/tools/{toolId}/price', 'Price a run in credits (1 credit = $0.01) before starting it'],
  quoteImageModel: ['get', '/api/models/quote', 'Create Image price quote for a model'],
  createJob: ['post', '/api/tools/{toolId}/jobs', 'Start a job (multipart form fields)'],
  getJob: ['get', '/api/jobs/{id}', 'Job status, progress and outputs'],
  cancelJob: ['post', '/api/jobs/{id}/cancel', 'Cancel a queued job'],
  getConfig: ['get', '/api/config', 'Server config (local-free mode, draft settings)'],
};
async function chatgpt(o: Opts) {
  const out = path.join(o.home, '.openhiggsfield/agents/chatgpt');
  write(o, path.join(out, 'instructions.md'), fs.readFileSync(path.join(skillsDir(), 'chatgpt/instructions.md')));
  let spec: any;
  try { const r = await fetch(`${o.api}/api/openapi.json`, { signal: AbortSignal.timeout(5000) }); if (!r.ok) throw new Error(String(r.status)); spec = await r.json(); }
  catch (e) { throw new Error(`could not read ${o.api}/api/openapi.json (${(e as Error).message}); start the app first`); }
  const paths: any = {};
  for (const [opId, [m, p, summary]] of Object.entries(ACTION_OPS)) {
    const op = spec.paths?.[p]?.[m]; if (!op) continue;
    paths[p] = { ...(paths[p] ?? {}), [m]: { ...op, operationId: opId, summary: op.summary ?? summary, description: (op.description ?? op.summary ?? summary).slice(0, 300) } };
  }
  const server = o.publicUrl ?? o.api;
  const action = { openapi: '3.1.0', info: { title: 'Imagination Is All You Need', version: spec.info?.version ?? '0', description: 'Local Imagination Is All You Need API (private). Prices in credits, 1 credit = $0.01.' },
    servers: [{ url: server }], paths, components: spec.components ?? {} };
  write(o, path.join(out, 'openapi-action.json'), JSON.stringify(action, null, 2) + '\n');
  const notes = [`ChatGPT: create a custom GPT -> Instructions: paste ${path.join(out, 'instructions.md')}; Actions -> Import schema: paste ${path.join(out, 'openapi-action.json')} (${Object.keys(paths).length} paths).`];
  if (o.publicUrl) { let h = o.publicUrl; try { h = new URL(o.publicUrl).host; } catch { /* as given */ } notes.push(`The app answers only on localhost: start it with OPENHIGGSFIELD_ALLOWED_HOSTS=${h} so your tunnel can reach it.`); }
  if (!o.publicUrl) notes.push(`WARNING: the action server is ${server}; ChatGPT can't reach localhost. Re-run with --public-url https://<your tunnel> (add auth; the project is private).`);
  return notes;
}

export async function runSetup(argv: string[]) {
  let o: Opts;
  try { o = parse(argv); } catch (e) { console.error((e as Error).message); process.exit(2); }
  try {
    const { mcp, from } = await serverMcp(o);
    console.log(`[setup] MCP config from ${from}: ${JSON.stringify(o.npx || mcp.preferNpx ? mcp.npx : mcp.stdio)}`);
    const notes: string[] = [];
    if (o.target === 'claude' || o.target === 'all') notes.push(...await claude(o, mcp));
    if (o.target === 'chatgpt' || o.target === 'all') notes.push(...await chatgpt(o));
    const stale = staleWarning(); if (stale) notes.push(`WARNING: ${stale}, then re-run setup.`);
    for (const l of log) console.log(`  ${l}`);
    console.log('\nNext steps:'); for (const n of notes) console.log(`  - ${n}`);
  } catch (e) { for (const l of log) console.log(`  ${l}`); console.error(`[setup] ${(e as Error).message}`); process.exit(1); }
}
