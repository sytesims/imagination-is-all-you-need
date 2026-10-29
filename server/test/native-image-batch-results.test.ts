// Offline transport contract: real tiny PNG bytes, fake Comfy responses, no server/GPU/provider.
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-image-batch-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: dir, OPENHIGGSFIELD_ENV_FILE: '/dev/null', OPENHIGGSFIELD_FILMING_FILE: '/dev/null', OPENHIGGSFIELD_BACKEND: 'mock', COMFY_BASE_URL: '', OPENHIGGSFIELD_CAPTURE_GRAPHS: '' });
for (const name of Object.keys(process.env)) if (/^(OPENHIGGSFIELD_|OPENJUTSU_)?(?:.*API_KEY|.*TOKEN|FAL_KEY|REPLICATE_API_TOKEN)$/.test(name)) delete process.env[name];
globalThis.fetch = (async () => { throw new Error('Network forbidden in native image batch test'); }) as typeof fetch;
const { runNative } = await import('../src/comfy/runNative.js');
const { storeOutputs } = await import('../src/comfy/resume.js');
const { resumeNative } = await import('../src/comfy/resume.js');
const { imageDimsOfFile } = await import('../src/imageDims.js');
const pngs = Array.from({ length: 4 }, (_, k) => execFileSync('ffmpeg', ['-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${k + 2}x2`, '-i', 'pipe:0', '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1'], { input: Buffer.from(Array((k + 2) * 2).fill([30 + k * 40, 70, 110, 128]).flat()) }));
const records = (n: number) => Array.from({ length: n }, (_, k) => ({ filename: 'same.png', subfolder: String(k), type: 'output', kind: 'images' }));
const calls: { record: any; dest: string }[] = [];
const transport = (outputs: Record<string, any[]>) => ({
  upload: async () => { throw new Error('No uploads expected'); },
  run: async () => ({ promptId: 'offline-prompt', outputs }),
  download: async (record: any, dest: string) => { calls.push({ record, dest }); fs.writeFileSync(dest, pngs[Number(record.subfolder)]); return dest; },
});
const pass = (label = 'Result', output = '9', extraOutputs?: any[]) => ({ label, workflow: 'offline-image.json', graph: { [output]: { class_type: 'SaveImage', inputs: {} } }, output, extraOutputs, expect: {} });
const plan = (passes = [pass()], extra: any = {}): any => ({ tool: 'create-image', passes, post: { kind: 'each' }, outKind: 'image', muxSourceAudio: false, notes: [], ...extra });
const job = (id: string, input: any = {}): any => ({ id, toolId: 'create-image', provider: 'comfy-zimage-turbo', route: 'local:comfy-zimage-turbo', input: { outKind: 'image', alpha: true, ...input }, status: 'queued', outputs: [], warnings: [], resultUrl: null, progress: 0, createdAt: Date.now() });
const summary = (j: any) => ({ downloads: calls.length, targets: calls.map(c => path.basename(c.dest)), outputs: j.outputs.map((o: any) => ({ ...o, dimensions: imageDimsOfFile(path.join(dir, path.basename(o.url))), sha256: createHash('sha256').update(fs.readFileSync(path.join(dir, path.basename(o.url)))).digest('hex') })) });
try {
  const fresh = job('fresh'); await runNative(fresh, transport({ '9': records(4) }) as any, () => plan());
  const before = summary(fresh); calls.length = 0;
  const resumed = job('resumed'); resumed.status = 'running'; resumed.comfyPrompt = { id: 'offline', base: 'http://never-used.invalid', pass: 0, passes: 1, outputs: ['9'], labels: ['Result'], resumable: true };
  assert.equal(await storeOutputs(resumed, transport({}) as any, { outputs: { '9': { images: records(4) } } }), null);
  const recovery = summary(resumed);
  console.log(JSON.stringify({ fresh: before, resumed: recovery }));
  assert.equal(before.downloads, 4, 'fresh SaveImage batch must download all four records');
  assert.equal(fresh.outputs.length, 4); assert.equal(recovery.downloads, 4); assert.equal(resumed.outputs.length, 4);
  for (const j of [fresh, resumed]) {
    assert.deepEqual(j.outputs.map((o: any) => o.label), ['Result 1', 'Result 2', 'Result 3', 'Result 4']);
    assert.equal(new Set(j.outputs.map((o: any) => o.url)).size, 4);
    for (let k = 0; k < 4; k++) assert.deepEqual(fs.readFileSync(path.join(dir, path.basename(j.outputs[k].url))), pngs[k], 'ordered distinct PNG bytes and alpha preserved');
    assert.equal(j.resultUrl, j.outputs[0].url);
  }
  const evidence = process.env.NATIVE_BATCH_EVIDENCE_DIR;
  if (evidence) { fs.mkdirSync(evidence, { recursive: true }); for (const j of [fresh, resumed]) for (const o of j.outputs) fs.copyFileSync(path.join(dir, path.basename(o.url)), path.join(evidence, path.basename(o.url))); }
  console.log('ok fresh/resumed: four downloads, unique paths, stable labels/order, actual dimensions/content/alpha');

  calls.length = 0;
  const single = job('single'); await runNative(single, transport({ '9': records(1) }) as any, () => plan());
  assert.deepEqual(single.outputs, [{ label: 'Result', url: '/files/single-out0.png' }]);
  assert.equal(path.basename(calls[0].dest), 'single-p0-9.png', 'single-output raw filename stays unchanged');
  const oldImage = job('old-single'); delete oldImage.input.outKind; oldImage.comfyPrompt = { ...resumed.comfyPrompt, outputs: ['9'], labels: ['Legacy'] };
  await storeOutputs(oldImage, transport({}) as any, { outputs: { '9': { images: records(1) } } });
  assert.deepEqual(oldImage.outputs, [{ label: 'Legacy', url: '/files/old-single-out0.png' }]);
  const oldBatch = job('old-batch'); delete oldBatch.input.outKind; oldBatch.comfyPrompt = { ...resumed.comfyPrompt, labels: ['Legacy'] };
  await storeOutputs(oldBatch, transport({}) as any, { outputs: { '9': { images: records(4) } } });
  assert.deepEqual(oldBatch.outputs.map((o: any) => o.label), ['Legacy 1', 'Legacy 2', 'Legacy 3', 'Legacy 4']);
  console.log('ok singleton labels, primary URL and raw paths unchanged, including old history without outKind');

  const jpeg = execFileSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'mjpeg', 'pipe:1'], { input: pngs[0] });
  const mixedRecords = [records(1)[0], { ...records(1)[0], filename: 'same.jpg' }];
  const mixedTransport = transport({ '9': mixedRecords }); mixedTransport.download = async (r, dest) => { fs.writeFileSync(dest, r.filename.endsWith('.jpg') ? jpeg : pngs[0]); return dest; };
  const mixed = job('mixed'); await runNative(mixed, mixedTransport as any, () => plan());
  assert.deepEqual(mixed.outputs.map((o: any) => path.extname(o.url)), ['.png', '.jpg']);
  assert.deepEqual(fs.readFileSync(path.join(dir, path.basename(mixed.outputs[1].url))), jpeg);
  assert.deepEqual(imageDimsOfFile(path.join(dir, path.basename(mixed.outputs[1].url))), { width: 2, height: 2 });
  const cloud = job('cloud-fake'); cloud.route = 'comfy-cloud:offline-image-contract';
  await runNative(cloud, transport({ '9': records(4) }) as any, () => plan()); assert.equal(cloud.outputs.length, 4);
  console.log('ok mixed image extensions/decodable metadata and shared cloud-workflow image transport collection');

  const two = records(2); const other = records(4).slice(2);
  const extras = job('extras', { draft: true }); calls.length = 0;
  const extraPlan = plan([pass('Primary', '9', [{ node: '10', label: 'Depth' }])]);
  await runNative(extras, transport({ '9': two, '10': other }) as any, () => extraPlan);
  assert.deepEqual(extras.outputs.map((o: any) => o.label), ['Primary 1 (draft 480p)', 'Primary 2 (draft 480p)', 'Depth 1 (draft 480p)', 'Depth 2 (draft 480p)']);
  assert.equal(new Set(calls.map(c => c.dest)).size, 4);
  const re = job('resume-extras', { draft: true }); re.comfyPrompt = { ...resumed.comfyPrompt, outputs: ['9', '10'], labels: ['Primary', 'Depth'] };
  await storeOutputs(re, transport({}) as any, { outputs: { '9': { images: two }, '10': { images: other }, diag: { images: records(1) } } });
  assert.deepEqual(re.outputs.map((o: any) => o.label), extras.outputs.map((o: any) => o.label));
  for (let k = 0; k < 4; k++) assert.deepEqual(fs.readFileSync(path.join(dir, path.basename(re.outputs[k].url))), pngs[k]);
  console.log('ok primary/extra-node batches use their own labels, stable node→batch order, draft suffix, no recovery diagnostic leakage');

  let run = 0; calls.length = 0;
  const angles = job('angles'); const angleTransport = { ...transport({}), run: async () => ({ promptId: 'angle', outputs: { '9': [records(4)[run++]] } }) };
  await runNative(angles, angleTransport as any, () => plan([pass('front'), pass('side')], { labels: ['Front view', 'Side view'] }));
  assert.deepEqual(angles.outputs.map((o: any) => o.label), ['Front view', 'Side view']); assert.equal(run, 2);
  const only = job('only'); run = 0;
  const onlyTransport = { ...transport({}), run: async () => ({ promptId: 'only', outputs: { '9': run++ ? other : two } }) };
  await runNative(only, onlyTransport as any, () => plan([pass('Hidden'), pass('Selected')], { post: { kind: 'each', only: [1] } }));
  assert.deepEqual(only.outputs.map((o: any) => o.label), ['Selected 1', 'Selected 2']);
  assert.deepEqual(fs.readFileSync(path.join(dir, path.basename(only.outputs[0].url))), pngs[2]);
  console.log('ok two-pass Camera Angles-style labels and post.only filtering are per pass, not flattened file index');

  calls.length = 0; const diagnostic = job('diagnostic');
  const dp = plan(); dp.passes[0].diagnostics = [{ node: 'mask', label: 'Mask evidence', stage: 'selection', note: 'Not a result' }];
  await runNative(diagnostic, transport({ '9': records(4), mask: records(1) }) as any, () => dp);
  assert.equal(diagnostic.outputs.length, 4); assert.equal(diagnostic.diagnostics.length, 1); assert.equal(calls.length, 5);
  assert.ok(diagnostic.outputs.every((o: any) => !o.url.includes('diagnostic-p')));
  assert.match(diagnostic.diagnostics[0].url, /diagnostic-p0-mask\.png$/);
  const noDiag = job('diagnostic-missing'); await runNative(noDiag, transport({ '9': records(1) }) as any, () => dp);
  assert.equal(noDiag.outputs.length, 1); assert.match(noDiag.warnings[0], /diagnostic preview unavailable/);
  console.log('ok diagnostics stored separately; unavailable evidence does not remove primary results');

  calls.length = 0; const missing = job('missing');
  await assert.rejects(runNative(missing, transport({ '9': [] }) as any, () => plan()), /returned no output on node 9/);
  assert.equal(calls.length, 0); assert.equal(missing.outputs.length, 0); assert.notEqual(missing.status, 'done');
  const missingExtra = job('missing-extra'); await assert.rejects(runNative(missingExtra, transport({ '9': records(4) }) as any, () => extraPlan), /no output on node 10/);
  assert.equal(missingExtra.outputs.length, 0); assert.notEqual(missingExtra.status, 'done');
  const recoveryMissing = job('resume-missing'); recoveryMissing.outputs = [{ label: 'Existing', url: '/files/existing.png' }]; recoveryMissing.comfyPrompt = { ...resumed.comfyPrompt, outputs: ['9', '10'], labels: ['Primary', 'Depth'] };
  assert.match((await storeOutputs(recoveryMissing, transport({}) as any, { outputs: { '9': { images: records(4) } } }))!, /no output on node 10/);
  assert.deepEqual(recoveryMissing.outputs, [{ label: 'Existing', url: '/files/existing.png' }]);
  const failed = job('failed'); const failing = transport({ '9': records(4) }); const download = failing.download;
  failing.download = async (r, dest) => { if (r.subfolder === '2') throw new Error('fake download failure'); return download(r, dest); };
  await assert.rejects(runNative(failed, failing as any, () => plan()), /fake download failure/);
  assert.equal(failed.outputs.length, 0); assert.notEqual(failed.status, 'done');
  console.log('ok missing nodes/download failures do not publish a falsely completed or partial batch; recovery preserves existing results');

  calls.length = 0; const canceled = job('canceled'); const canceling = transport({ '9': records(4) }); const cancelDownload = canceling.download;
  canceling.download = async (r, dest) => { const f = await cancelDownload(r, dest); if (r.subfolder === '1') canceled.status = 'canceled'; return f; };
  await runNative(canceled, canceling as any, () => plan());
  assert.equal(canceled.status, 'canceled'); assert.equal(calls.length, 2); assert.deepEqual(canceled.outputs, []);
  const canceledRun = job('canceled-before-download'); calls.length = 0;
  await runNative(canceledRun, { ...transport({}), run: async () => { canceledRun.status = 'canceled'; return { promptId: 'canceled', outputs: { '9': records(4) } }; } } as any, () => plan());
  assert.equal(canceledRun.status, 'canceled'); assert.equal(calls.length, 0);
  let views = 0;
  const cancelResume = job('cancel-resume'); cancelResume.status = 'running'; cancelResume.comfyPrompt = { ...resumed.comfyPrompt };
  globalThis.fetch = (async (url: any) => {
    if (String(url) === 'http://never-used.invalid/history/offline') return new Response(JSON.stringify({ offline: { status: { completed: true }, outputs: { '9': { images: records(4) } } } }));
    if (String(url).startsWith('http://never-used.invalid/view?')) { const b = pngs[views++]; if (views === 2) cancelResume.status = 'canceled'; return new Response(new Uint8Array(b)); }
    throw new Error(`Unexpected fake client URL ${url}`);
  }) as typeof fetch;
  await resumeNative(cancelResume, { sleep: async () => { throw new Error('No polling expected'); } });
  assert.equal(cancelResume.status, 'canceled'); assert.equal(views, 2); assert.deepEqual(cancelResume.outputs, []);
  views = 0; const fullResume = job('full-resume'); fullResume.status = 'running'; fullResume.comfyPrompt = { ...resumed.comfyPrompt };
  globalThis.fetch = (async (url: any) => {
    if (String(url) === 'http://never-used.invalid/history/offline') return new Response(JSON.stringify({ offline: { status: { completed: true }, outputs: { '9': { images: records(4) } } } }));
    if (String(url).startsWith('http://never-used.invalid/view?')) return new Response(new Uint8Array(pngs[views++]));
    throw new Error(`Unexpected fake client URL ${url}`);
  }) as typeof fetch;
  await resumeNative(fullResume, { sleep: async () => { throw new Error('No polling expected'); } });
  assert.equal(fullResume.status, 'done'); assert.equal(fullResume.outputs.length, 4); assert.equal(views, 4); assert.equal(fullResume.comfyPrompt, null);
  assert.deepEqual(fullResume.outputs.map((o: any) => o.label), fresh.outputs.map((o: any) => o.label));
  const failedHistory = job('failed-history'); failedHistory.status = 'running'; failedHistory.comfyPrompt = { ...resumed.comfyPrompt };
  globalThis.fetch = (async () => new Response(JSON.stringify({ offline: { status: { status_str: 'error', messages: ['fake validation failure'] } } }))) as typeof fetch;
  await resumeNative(failedHistory); assert.equal(failedHistory.status, 'failed'); assert.equal(failedHistory.outputs.length, 0);
  globalThis.fetch = (async () => { throw new Error('Network forbidden'); }) as typeof fetch;
  console.log('ok cancellation during fresh/recovered downloads; full fake-history recovery keeps four results; failed history stays failed');

  const opaque = job('opaque', { alpha: false }); await runNative(opaque, transport({ '9': records(2) }) as any, () => plan());
  for (const o of opaque.outputs) { const f = path.join(dir, path.basename(o.url)); const rgba = execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-frames:v', '1', '-pix_fmt', 'rgba', '-f', 'rawvideo', 'pipe:1']); assert.ok([...rgba].filter((_, k) => k % 4 === 3).every(a => a === 255)); }
  const { nativeOutputItems } = await import('../src/comfy/nativeImageOutputs.js');
  assert.equal(nativeOutputItems(records(4), false, 'Other media').length, 1, 'video/audio plans retain first-record behavior');
  assert.equal(nativeOutputItems([{ ...records(1)[0], kind: 'videos', filename: 'v.mp4' }, { ...records(1)[0], kind: 'videos', filename: 'v2.mp4' }], true, 'Video').length, 1);
  calls.length = 0; const text = job('text'); const textTransport = transport({ '9': [{ text: 'first' }, { text: 'second' }] });
  await runNative(text, textTransport as any, () => plan()); assert.equal(calls.length, 0); assert.equal(fs.readFileSync(path.join(dir, path.basename(text.outputs[0].url)), 'utf8'), 'first\nsecond'); assert.equal(text.outputs[0].label, 'Result');
  console.log('ok opaque/transparent policy, non-image first-record behavior and multi-record text aggregation unchanged');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
