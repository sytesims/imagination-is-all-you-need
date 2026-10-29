/**
 * The demo history (9 jobs, 1 project) used by `npm run demo:reset` (after it wipes the data dir) and by `npm run filming -- on`
 * (into the NEW scratch data dir only). Import this AFTER OPENHIGGSFIELD_DATA_DIR / the filming state are set: config reads them at import.
 * Jobs render on the mock backend from server/samples. Their Assets poster + caption come from the interim AI stills (src/interimTiles.ts
 * jobPoster: /examples/assets/demoNN.jpg once it exists, else the sample media's own thumb). No elements are seeded: Elements left the app UI
 * (2026-10-23), so seeded ones would be invisible yet still change how @words in prompts are checked.
 */
import { existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';

export async function seedDemo(log: (s: string) => void = (s) => process.stdout.write(s)) {
  const { DATA_DIR, SAMPLES_DIR } = await import('../src/config.js');
  if (!existsSync(path.join(SAMPLES_DIR, 'result-swap.mp4'))) throw new Error('Samples missing: run scripts/make-samples.sh');
  const { getTool } = await import('../src/tools/registry.js');
  const { enqueue, inFlight } = await import('../src/queue.js');
  const { estimateSeconds, passesFor } = await import('../src/tools/shared.js');
  const { jobs, flushJobs } = await import('../src/jobs.js');
  const lib = await import('../src/library.js');

  type Seed = { key: string; tool: string; fields: Record<string, string>; video?: string; refs?: string[]; image?: string; ago: number; fromDraft?: string; provider?: string };
  const S: Seed[] = [
    { key: 'swap', tool: 'object-swap', video: 'sample-take.mp4', refs: ['sample-product.png'], fields: { preset: 'product', prompt: 'replace the product in hand with @image1' }, ago: 26 * 60 },
    { key: 'motion', tool: 'motion-transfer', video: 'sample-take.mp4', refs: ['sample-character.png'], fields: { prompt: '@image1 performs the same moves on a rooftop' }, ago: 21 * 60 },
    { key: 'draft', tool: 'restyle', video: 'sample-pattern.mp4', fields: { preset: 'watercolor', draft: '1' }, ago: 17 * 60 },
    { key: 'final', tool: 'restyle', video: 'sample-pattern.mp4', fields: { preset: 'watercolor' }, fromDraft: 'draft', ago: 16 * 60 },
    { key: 'reshoot', tool: 'reshoot', video: 'sample-take.mp4', fields: { angles: JSON.stringify([{ start: 0, end: 3, angle: 'low angle' }, { start: 3, end: 6, angle: 'orbit left' }]), fullClip: '1' }, ago: 12 * 60 },
    { key: 'camera', tool: 'camera', image: 'sample-keyframe.png', fields: { types: JSON.stringify(['orbit']), prompt: 'slow reveal' }, ago: 8 * 60 },
    { key: 'fx', tool: 'photo-fx', image: 'sample-character.png', fields: { types: JSON.stringify(['float']) }, ago: 5 * 60 },
    { key: 'upscale', tool: 'upscale', video: 'sample-pattern.mp4', fields: { types: JSON.stringify(['precise']), resolution: '1080p' }, ago: 3 * 60 },
    { key: 'failed', tool: 'object-swap', video: 'sample-take.mp4', refs: ['sample-character.png'], fields: { preset: 'main-person', simulate: 'provider_outage' }, provider: 'router-kling', ago: 90 },
  ];
  const ids: Record<string, string> = {};
  for (const s of S) {
    const tool = getTool(s.tool)!; const id = `demo${String(Object.keys(ids).length + 1).padStart(2, '0')}`;
    if (jobs.has(id)) throw new Error(`${id} already exists in ${DATA_DIR}: seed only an empty data dir`);
    const files: Record<string, string[]> = {}; let n = 0;
    const cp = (field: string, src: string) => { const name = `${id}-${field}${n++}${path.extname(src)}`; copyFileSync(path.join(SAMPLES_DIR, src), path.join(DATA_DIR, name)); (files[field] ??= []).push(name); };
    if (s.video) cp('video', s.video); s.refs?.forEach((r) => cp('refs', r)); if (s.image) cp('image', s.image);
    const fields: Record<string, string> = { rights: '1', resolution: '720p', seed: String(1000 + n * 7919 % 9000), ...s.fields };
    let parentId: string | null = null;
    if (s.fromDraft) { const d = jobs.get(ids[s.fromDraft])!; fields.seed = String(d.input.seed); parentId = d.id; }
    const inp = (await tool.parseInput(fields, files)) as Record<string, any>;
    if (typeof inp.error === 'string') throw new Error(`${s.key}: ${inp.error}`);
    if (s.fromDraft) inp.fromDraft = ids[s.fromDraft];
    const cost = estimateSeconds(tool, inp, passesFor(inp));
    enqueue(tool.id, inp, cost, id, parentId, s.provider ?? tool.providers[0], cost);
    ids[s.key] = id;
    if (s.key === 'draft') while (jobs.get(id)!.status !== 'done') await new Promise((r) => setTimeout(r, 300)); // final needs the draft
  }
  log('rendering');
  while (inFlight() > 0) { await new Promise((r) => setTimeout(r, 500)); log('.'); }
  log('\n');
  const now = Date.now();
  for (const s of S) { const j = jobs.get(ids[s.key])!; const dt = j.finishedAt! - j.createdAt; j.createdAt = now - s.ago * 60_000; j.finishedAt = j.createdAt + dt; }
  flushJobs();
  lib.setFavourite(ids.swap, true); lib.setFavourite(ids.final, true); lib.setFavourite(ids.camera, true);
  const p = lib.createProject('Spring campaign');
  for (const k of ['swap', 'motion', 'final']) lib.setProject(ids[k], p.id);
  return { dataDir: DATA_DIR, jobs: S.map((s) => jobs.get(ids[s.key])!), project: p.id };
}
