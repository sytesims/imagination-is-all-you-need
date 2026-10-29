/** Validate every plugin manifest and write each plugin's workflow mapped with sample inputs to /tmp/ohf-plugin-<id>-*.json (no Comfy calls). */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadPlugins, mapGraph } from '../src/plugins.js';
const st = await loadPlugins();
for (const s of st) {
  console.log(`${s.ok ? 'LOADED ' : 'SKIPPED'} ${s.id}${s.errors.length ? ' — ' + s.errors.join('; ') : ''}${s.warnings.length ? ' (warn: ' + s.warnings.join('; ') + ')' : ''}`);
  if (!s.ok) continue;
  const m = JSON.parse(readFileSync(path.join(s.dir, 'plugin.json'), 'utf8'));
  const g = JSON.parse(readFileSync(path.join(s.dir, m.workflow), 'utf8'));
  const nm = m.nodeMap ? JSON.parse(readFileSync(path.join(s.dir, m.nodeMap), 'utf8')) : null;
  writeFileSync(`/tmp/ohf-plugin-${s.id}-raw.json`, JSON.stringify(g));
  for (const p of m.presets) {
    const fields = Object.fromEntries((m.inputs?.fields ?? []).map((f: any) => [f.name, f.kind === 'select' ? f.options.at(-1).value : f.default]));
    writeFileSync(`/tmp/ohf-plugin-${s.id}-${p.id}.json`, JSON.stringify(mapGraph(g, nm, { videoPath: '/x/oj_source.mp4', imagePath: '/x/oj_ref.png', types: [p.id], fields, seed: 7, resolution: '720p', prompt: p.prompt })));
  }
}
process.exit(0);
