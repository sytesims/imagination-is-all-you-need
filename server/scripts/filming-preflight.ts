/**
 * Filming pre-flight (child of `npm run filming -- on | status | check`). Boots a throwaway copy of the server on PREFLIGHT_PORT (default
 * 8951) under the filming state file given in OPENHIGGSFIELD_FILMING_FILE (its own empty data dir: no jobs, nothing real touched, this
 * shell's env, the same way `npm run dev` would read it) and quotes the configured demo scenarios with
 * GET /api/tools/<id>/price. A beat FAILS when the page would show add-a-key instead of a real run: needsKey, a no_provider quote (402),
 * any non-200 quote, or a demo preview (sample output). Prints one line per beat, then PASS, or a FAIL block with the fix. Exit 0 = all pass,
 * 1 = at least one beat fails, 3 = the server didn't boot.
 */
import { spawn } from 'node:child_process'; import path from 'node:path'; import fs from 'node:fs'; import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(HERE, '..');
const PORT = Number(process.env.PREFLIGHT_PORT || 8951); const B = `http://127.0.0.1:${PORT}`;
const LOCAL = process.env.PREFLIGHT_LOCAL === '1'; // filming on --local: M3 is filmed on the local MiniMax H3 card
const SCRATCH_ENV = process.env.FILMING_SCRATCH_ENV || '<scratch data dir>/.env.local';
export const BEATS: { beat: string; tool: string; label: string; q: Record<string, string> }[] = [
  LOCAL ? { beat: 'M3', tool: 'h3-video', label: 'Generate Video · MiniMax H3 (local, --local)', q: { provider: 'comfy-h3', duration: '5', resolution: '768p', prompt: 'a paper boat in the rain', image: '1' } }
    : { beat: 'M3', tool: 'h3-video', label: 'Generate Video · MiniMax H3 · Comfy Cloud workflow', q: { provider: 'cloud-h3-wf', duration: '5', resolution: '768p', prompt: 'a paper boat in the rain', image: '1' } },
  { beat: 'M4', tool: 'object-swap', label: 'Object Swap · Wan 2.2 Animate (default)', q: { video: '1', refs: '1', seconds: '6', target: 'object', objectName: 'mug' } },
  { beat: 'M5', tool: 'camera', label: 'Camera Moves · Dolly in · LTX', q: { types: '["ltx-dolly-in"]', duration: '5', resolution: '720p', image: '1' } },
  { beat: 'M6', tool: 'reshoot', label: 'Re-shoot · LTX-2 19B', q: { video: '1', seconds: '5' } },
  { beat: 'M7', tool: 'create-image', label: 'Create Image · FLUX 3 Image Klein', q: { provider: 'comfy-flux3-klein', prompt: 'a red mug on a desk' } },
];
const bin = [path.join(ROOT, 'node_modules/.bin/tsx'), path.join(ROOT, '../node_modules/.bin/tsx')].find((p) => fs.existsSync(p))!;
const srv = spawn(bin, ['src/index.ts'], { cwd: ROOT, detached: true, stdio: ['ignore', 'ignore', 'pipe'],
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_DATA_DIR: '', OPENJUTSU_DATA_DIR: '', OPENJUTSU_FILMING_FILE: '' } });
let err = ''; srv.stderr!.on('data', (d) => { err = (err + d).slice(-2000); });
const stop = () => { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* gone */ } };
process.on('exit', stop);
let cfg: any = null;
for (let i = 0; i < 120 && !cfg; i++) { try { const r = await fetch(`${B}/api/config`); if (r.ok) cfg = await r.json(); } catch { /* booting */ } if (!cfg) await new Promise((r) => setTimeout(r, 500)); }
if (!cfg) { console.log(`  pre-flight: FAIL, the check server didn't start on :${PORT}. ${err.trim().split('\n').slice(-2).join(' ')}`); stop(); process.exit(3); }
const fails: string[] = [];
console.log(`  pre-flight (backend ${cfg.backend}, filming ${cfg.filming?.on ? 'on' : 'OFF?'}, open-weights-only ${cfg.openWeightsOnly}):`);
for (const b of BEATS) {
  const r = await fetch(`${B}/api/tools/${b.tool}/price?${new URLSearchParams(b.q)}`); const q: any = await r.json().catch(() => ({}));
  const why = r.status !== 200 ? (q.errorType === 'no_provider' || q.needsKey ? 'add-a-key (no provider set up)' : `quote ${r.status}: ${q.error ?? ''}`)
    : q.needsKey ? 'add-a-key (needsKey)' : q.noProvider ? 'add-a-key (no provider)' : q.demo ? 'demo preview (sample output, add-a-key note)' : '';
  if (why) fails.push(`${b.beat} ${b.label}: ${why}`);
  console.log(`    ${why ? 'FAIL' : 'ok  '} ${b.beat} ${b.label} → ${q.routeId ?? q.route ?? '-'}${why ? `  (${why})` : ` · ${q.credits ?? '?'} cr`}`);
}
stop();
if (fails.length) {
  console.log(['', '  ==================== FILMING PRE-FLIGHT: FAIL ====================',
    `  ${fails.length} of ${BEATS.length} demo-script beats would show add-a-key instead of a real run:`, ...fails.map((f) => `   - ${f}`),
    '  Fix one of:', `   - add the Comfy key: COMFY_API_KEY=… in ${SCRATCH_ENV} (or start with --keep-comfy-key), then re-run: npm run filming -- check`,
    '   - or run locally: npm run filming -- on --local   (turns Use local ComfyUI on for filming)', '  ==================================================================', ''].join('\n'));
  process.exit(1);
}
console.log('  pre-flight: PASS, every demo-script beat runs for real'); process.exit(0);
