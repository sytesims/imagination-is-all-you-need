#!/usr/bin/env node
// Writes MODEL-HEALTH.md beside the two local health-check outputs (free, mock, no keys):
//   cd server && npx tsx test/model-health.e2e.ts      → $MODEL_HEALTH_DIR/backend.json (schema, UI limits, price, backend submit)
//   cd server && npx tsx test/model-health-ui.e2e.ts   → $MODEL_HEALTH_DIR/ui.json      (headless click-through, front to back)
//   node scripts/model-health-report.mjs
// $MODEL_HEALTH_DIR defaults to <tmp>/model-health. The hand-written part between the NOTES markers is kept on every rewrite.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const DIR = process.env.MODEL_HEALTH_DIR ?? path.join(os.tmpdir(), 'model-health');
const OUT = path.join(DIR, 'MODEL-HEALTH.md');
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { return null; } };
const be = read('backend.json'); const ui = read('ui.json'); if (!be) { console.error(`no ${path.join(DIR, 'backend.json')}: run test/model-health.e2e.ts first`); process.exit(1); }
/** Real paid / local runs we know of (route → date and where it is written down). Everything else: not yet. */
const REAL_RUNS = { 'local:comfy-ltx25-video': '2026-10-25 local (videoCaps.ts: 5 s Draft ≈ 19 min on an M1 Max)' };
const TOOL_NAMES = { 'h3-video': 'Create Video', 'app-transition': 'Transitions', 'app-ugc-ad': 'UGC Ad', 'object-swap': 'Object Swap', 'motion-transfer': 'Motion Control', restyle: 'Restyle', reshoot: 'Re-shoot',
  camera: 'Camera Moves', 'photo-fx': 'Photo FX', 'app-orbit-shot': 'Orbit Shot', 'h3-extend': 'Extend', cinema: 'Director', 'make-it-real': 'Direct a Shot · Render' };
const MODE = { t2v: 'Text', i2v: 'Image', flf: 'Start + end', r2v: 'References' };
const mark = (v) => (v === 'pass' ? '✅' : v === 'fail' ? '❌' : v === 'skip' ? '·' : '–');
const uiBy = new Map((ui?.rows ?? []).map((r) => [`${r.tool}|${r.engine}|${r.mode}`, r]));
const rows = be.rows.slice().sort((a, b) => Object.keys(TOOL_NAMES).indexOf(a.tool) - Object.keys(TOOL_NAMES).indexOf(b.tool) || a.modelName.localeCompare(b.modelName) || a.routeId.localeCompare(b.routeId) || a.mode.localeCompare(b.mode));
const cnt = (k, v) => rows.filter((r) => r[k] === v).length; const uiRows = ui?.rows ?? [];
const models = new Set(rows.map((r) => `${r.tool}|${r.model}`)); const pairs = new Set(rows.map((r) => `${r.tool}|${r.model}|${r.mode}`));
let md = `# Model health: video models\n\nGenerated ${new Date(be.at).toLocaleDateString("en-CA")} by \`scripts/model-health-report.mjs\` from the free health check (mock backend, no keys, nothing spent). Regenerate:\n\n` +
  '```bash\ncd server && npx tsx test/model-health.e2e.ts && npx tsx test/model-health-ui.e2e.ts && cd .. && node scripts/model-health-report.mjs\n```\n\n' +
  `- **Schema**: the body our runner would send for that job (the app's own builder, from the job the server stored), validated against the provider's published request schema (Comfy Router / fal OpenAPI documents saved locally); local and Comfy Cloud graphs against ComfyUI \`/object_info\` (${be.objectInfo}). – = no live body on this route (samples only) or no published schema saved.\n` +
  '- **UI limits**: every option the bar offers (shortest and longest length, each resolution, each aspect, sound on / off, frames, references at the maximum) is accepted by the backend (length rule, the route\'s own check with a key set) and the body runs exactly what was picked.\n' +
  '- **Price**: the quote (GET /api/tools/:id/price, route pinned) has a price for every offered combination; local routes are free.\n' +
  '- **Mock e2e**: backend = the job was created on that route and the mock result landed; UI = headless click-through (pick model and mode, add inputs, Generate, request fields, job, in-progress card, result card).\n' +
  '- **Limits source**: ✓ = read from the provider docs (videoCaps `verified`), ? = not verified yet.\n\n' +
  `## Summary\n\n${models.size} tool × model pairs, ${pairs.size} tool × model × mode, ${rows.length} rows with routes, ${rows.reduce((a, r) => a + r.cases, 0)} option combinations.\n\n` +
  `| Check | Pass | Fail | n/a |\n|---|---|---|---|\n| Schema | ${cnt('schema', 'pass')} | ${cnt('schema', 'fail')} | ${cnt('schema', 'n/a')} |\n| UI limits | ${cnt('limits', 'pass')} | ${cnt('limits', 'fail')} | |\n| Price | ${cnt('price', 'pass')} | ${cnt('price', 'fail')} | |\n| Backend submit | ${cnt('submit', 'pass')} | ${cnt('submit', 'fail')} | |\n` +
  `| UI click-through (model × mode) | ${uiRows.filter((r) => r.status === 'pass').length} | ${uiRows.filter((r) => r.status === 'fail').length} | ${uiRows.filter((r) => r.status === 'skip').length} |\n\n`;
const old = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : ''; const notes = old.match(/<!-- NOTES -->[\s\S]*?<!-- \/NOTES -->/)?.[0] ?? '<!-- NOTES -->\n## Findings\n\n(hand-written: bugs fixed, bugs left)\n<!-- /NOTES -->';
md += `${notes}\n\n`;
for (const tool of Object.keys(TOOL_NAMES)) { const rs = rows.filter((r) => r.tool === tool); if (!rs.length) continue;
  md += `## ${TOOL_NAMES[tool]} (\`${tool}\`)\n\n| Model | Route | Mode | Schema | UI limits | Price | Mock e2e (backend / UI) | Real run | Notes |\n|---|---|---|---|---|---|---|---|---|\n`;
  for (const r of rs) { const u = uiBy.get(`${r.tool}|${r.engine}|${r.mode}`);
    const why = [...r.failures, ...r.notes].map((s) => s.replace(/\|/g, '/')).slice(0, 4).join('; ') + (u?.status === 'fail' ? `; UI: ${u.why}` : '');
    md += `| ${r.modelName} ${r.verified === true ? '✓' : r.verified === false ? '?' : ''} | \`${r.routeId}\`${r.wired ? '' : ' (samples only)'} | ${MODE[r.mode] ?? (r.mode || '–')} | ${mark(r.schema)} | ${mark(r.limits)} | ${mark(r.price)} | ${mark(r.submit)} / ${u ? mark(u.status) : '–'} | ${REAL_RUNS[r.routeId] ?? 'not yet'} | ${why.slice(0, 400)} |\n`; }
  md += '\n'; }
fs.writeFileSync(OUT, md); console.log(`wrote ${path.relative(REPO, OUT)} (${rows.length} rows)`);
