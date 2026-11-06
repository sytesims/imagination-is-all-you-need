// Small, clearly-wrong UI words (UI audit 2026-11-03): template ids, doubled labels, render time read as a clip length, a slow local model
// shown as plainly "Ready", the mode chip vs the button. Pure helpers are called; React files (CSS imports) are checked by their source.
// Run: npx tsx test/ui-raw-text-labels.test.ts   (no server, no network)
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'uitext-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'), OPENHIGGSFIELD_BACKEND: 'mock',
  OPENHIGGSFIELD_HW_MOCK: JSON.stringify({ gpu: { name: 'Apple M1 Max', type: 'mps' }, ramGB: 64 }) });
delete process.env.COMFY_BASE_URL;
const ok = (m: string) => console.log('ok ' + m);
const rd = (f: string) => fs.readFileSync(path.resolve(import.meta.dirname, '../../web/src', f), 'utf8');

// 1. Workflow names as words: never the template id (Workflows dialog, viewer Source row, credit line).
{
  const { workflowName, workflowLine } = await import('../src/shared/imageFeatures.ts');
  assert.equal(workflowName('Nano Banana 2: Image Edit (api_google_nano_banana2_image_edit)'), 'Nano Banana 2: Image Edit');
  assert.equal(workflowName('cloud/h3-i2v-api.json'), 'h3-i2v-api.json');
  assert.equal(workflowName('Ideogram v4: Text to Image (API) (api_ideogram_v4_t2i)'), 'Ideogram v4: Text to Image (API)');
  assert.equal(workflowName('Swap (also used by Relight)'), 'Swap');
  assert.equal(workflowName('BFS Head Swap V1 Flux 2 Klein 4b_9b (base_distill).json'), 'BFS Head Swap V1 Flux 2 Klein 4b_9b (base_distill).json', 'a file name stays');
  assert.equal(workflowName(null), '');
  assert.equal(workflowLine({ source: 'official', name: 'Nano Banana 2: Image Edit (api_google_nano_banana2_image_edit)', url: null, author: 'Comfy Org', licence: 'MIT' }), 'Official Comfy template · Nano Banana 2: Image Edit');
  assert.match(rd('ui/pages/Workflows.tsx'), /\{workflowName\(r\.source\.name\)\}/, 'the Workflows dialog Source row');
  assert.match(rd('shared/ResultViewer.tsx'), /const shortWf = \(n: string\) => \{ const s = workflowName\(n\);/, 'the viewer Source row');
  ok('workflow names never show a template id');
}

// 2. Doubled labels: Run on group heading, Models eyebrow, viewer Info place.
{
  const { soloGroup, SLOW_HERE, modelStateLine } = await import('../../web/src/shared/models.ts');
  assert.equal(soloGroup('Comfy Cloud', ['Comfy Cloud']), true, 'COMFY CLOUD › Comfy Cloud: no heading');
  assert.equal(soloGroup('Your computer', ['Your computer']), true);
  assert.equal(soloGroup('Your keys', ['OpenAI']), false); assert.equal(soloGroup('Comfy Cloud', ['Comfy Cloud', 'Your Comfy deployment']), false);
  assert.match(rd('ui/routing/RunOn.tsx'), /\{!soloGroup\(g\.label, rs\.map\(x => rowPlaceLabel\(x\.r\)\)\) && <span className="ro-grp">/);
  const models = rd('ui/pages/Models.tsx'); assert.match(models, /<span className="eyebrow">More<\/span><h1>Models<\/h1>/); assert.doesNotMatch(models, /eyebrow">Models<\/span><h1>Models/);
  const rv = rd('shared/ResultViewer.tsx'); assert.match(rv, /placeR\.length && compositeCostText\(job\) == null[\s\S]{0,260}label: 'Billing'/, 'viewer Source: the billing only when the Model group names the place');
  assert.match(rv, /\.\.\.placeR,\n/, 'the Model group keeps the place row');
  // 5 (words): a slow local place says so, never a plain Ready
  const m = (here: any) => ({ key: 'm', name: 'MiniMax Music 3', runsOn: [{ id: 'local', label: 'Your computer', status: 'ready', here }], rowStatus: { kind: 'ready', text: 'Your computer', runOn: 'local', credits: 0 } }) as any;
  assert.equal(modelStateLine(m({ memGB: 11, etaSeconds: 3600, etaSource: 'estimate', samples: 0, slow: true })).s, SLOW_HERE);
  assert.match(modelStateLine(m({ memGB: 11, etaSeconds: 3600, etaSource: 'estimate', samples: 0, slow: true })).t, /NVIDIA/);
  assert.equal(modelStateLine(m({ memGB: 11, etaSeconds: 60, etaSource: 'estimate', samples: 0 })).s, 'Ready', 'a fitting local model stays Ready');
  assert.match(rd('ui/routing/RunOn.tsx'), /r\.here\?\.slow \? \{ word: SLOW_HERE, tone: 'warn'/); assert.match(rd('shared/ModelHoverCard.tsx'), /text: r\.here\?\.slow \? SLOW_HERE : (?:'Ready'|READY_WORD)/);
  ok('no doubled labels: Run on heading, Models eyebrow, viewer place; a slow local place says Slow here');
}

// 3. The bar's chip and button say the same word once a picture is attached.
{
  const ic = rd('ui/next/ImageCanvas.tsx');
  assert.match(ic, /const editWord = fid === 'edit-image' && !!p\.image;/);
  assert.match(ic, /name=\{r\?\.name \?\? \(editWord \? 'Edit' : 'Create'\)/, 'the chip'); assert.match(ic, /\{editWord \? 'Edit' : 'Generate'\}<\/span>/, 'the button');
  ok('mode chip and button agree (Edit / Edit, Create / Generate)');
}

// 4. A turntable card shows the clip length, never the render time.
{
  const { clipLengthText } = await import('../src/shared/jobTiming.ts');
  assert.equal(clipLengthText(6), '6 s'); assert.equal(clipLengthText(4.53), '4.5 s'); assert.equal(clipLengthText(0), ''); assert.equal(clipLengthText(null), ''); assert.equal(clipLengthText('x'), ''); assert.equal(clipLengthText(90), '1 min 30 s');
  const t3 = rd('ui/three/ThreeDStudio.tsx'); assert.match(t3, /title="Turntable video" parts=\{\['Free', clipLengthText\(\(j\.input as any\)\?\.duration\) \|\| 'recorded in your browser'\]/);
  ok('turntable cards: clip length, not render time');
}

// 5. MiniMax Music 3 on Apple chips: slow, with its measured time (the int8 text encoder runs on the processor), never a plain "fits".
{
  const { etaFor } = await import('../src/timing.ts');
  const e = etaFor({ id: 'audio' }, { providerId: 'comfy-minimax-music3' }); assert.equal((e.eta.byGpu as any).mseries.standard, 30); assert.equal(Object.keys((e.eta.byGpu as any).rtx4090 ?? {}).length, 0, 'no made-up NVIDIA time');
  const { getTool } = await import('../src/tools/registry.js'); const R = await import('../src/hardware/requirements.js'); const { currentHardware } = await import('../src/hardware.js');
  const tool = getTool('audio')!; const hw = currentHardware();
  const f = R.fitFor(tool, 'comfy-minimax-music3', { duration: 120, resolution: 'standard', types: ['music'], mode: 'music' }, hw);
  assert.equal(f.verdict, 'slow', JSON.stringify(f)); assert.ok((f.etaSeconds ?? 0) >= 3000, `about an hour: ${f.etaSeconds}`); assert.match(String(f.reason), /NVIDIA/);
  const nv = R.fitFor(tool, 'comfy-minimax-music3', { duration: 120, resolution: 'standard', types: ['music'], mode: 'music' }, { ...hw, gpu: { ...(hw.gpu as any), name: 'NVIDIA RTX 4090', type: 'cuda', vramGB: 24 }, tier: 'all' } as any);
  assert.notEqual(nv.verdict, 'too_heavy', 'fully available on NVIDIA'); assert.doesNotMatch(String(nv.reason ?? ''), /Apple/);
  ok(`MiniMax Music 3 on Apple chips: slow, about ${Math.round((f.etaSeconds ?? 0) / 60)} min; NVIDIA: ${nv.verdict}`);
}

// 6. Recorder notes: a failed dance-style save never raises the global banner; the feed's Type stays when a workflow switch remounts the page.
{
  const api = rd('api.ts'); const i = api.indexOf('export const saveDanceStyle'); const body = api.slice(i, api.indexOf('\n', api.indexOf('return r.json()', i)));
  assert.match(body, /globalThis\.fetch\(/); assert.doesNotMatch(body, /\bpost\(/, 'not the retrying helper (restartListeners → "Can’t reach the server")');
  const rf = rd('ui/next/feed/ResultFeed.tsx'); assert.match(rf, /useState<FeedFilter>\(\(\) => FILTER_THIS_VISIT\.get\(filterKey\) \?\? parseSavedFilter/); assert.match(rf, /FILTER_THIS_VISIT\.set\(filterKey, f\)/);
  ok('dance-style save is quiet; the feed filter survives a workflow switch (not a reload)');
}
console.log('ALL OK');
