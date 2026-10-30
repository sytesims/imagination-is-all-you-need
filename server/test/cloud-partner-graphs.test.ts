// Comfy Cloud graphs and the Topaz rejection (2026-10-26, job a1a46750: "Topaz partner node failed … workflow_invalid", no Cloud job id, no reason kept).
// 1. Every Comfy Cloud partner graph (Topaz: every model × every size; Tripo 3.1) and every workflows/cloud/*.json graph passes the offline check
//    (comfy/cloudGraphCheck.ts) against Comfy Cloud's object_info (fixture cut from the 2026-10-26 copy: the classes these graphs use).
// 2. The check catches what Cloud refuses: a dynamic-combo option's inputs missing or not named "<parent>.<child>", a value not in the list,
//    an uploaded file on a socket that is not a loader widget.
// 3. Upload: content_type and file_path go BEFORE the file part (Cloud reads nothing after it; the cause of the Topaz 422).
// 4. Partner graphs send the key once as extra_data.api_key_comfy_org; core-node runs send no extra_data.
// 5. A refused upload / graph / failed job keeps Comfy's own words on the job (providerError, sanitised; node_errors one line each), never the key.
// In process, fake fetch, no network, no spend. Run: npx tsx test/cloud-partner-graphs.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'cpg-')); const KEY = 'comfyui-test0000000000000000000000000000000000000000000000';
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', COMFY_API_KEY: KEY, COMFY_CLOUD_URL: 'http://cloud.test' });
const HERE = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(HERE, '../..');
const OI = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures/object-info-comfy-cloud-2026-10-26.json'), 'utf8'));
/** Graphs added after that cut are checked with the base classes plus their own cut of the same copy (the fixture their own test uses). */
const OWN_OI: [RegExp, string][] = [[/^bernini-/, 'bernini-cloud-2026-10-26'], [/^ltx23-/, 'ltx23-vfx-cloud-2026-10-26'], [/^ltx25-dfr-/, 'ltx25-dfr'], [/^h3-fast-/, 'h3-fast-cloud-2026-10-26']];
const oiFor = (file: string) => { const own = OWN_OI.find(([re]) => re.test(file))?.[1]; return own ? { ...OI, ...JSON.parse(fs.readFileSync(path.join(HERE, `fixtures/object-info-${own}.json`), 'utf8')) } : OI; };
const { checkCloudGraph } = await import('../src/comfy/cloudGraphCheck.ts');
const { ComfyCloudV2, CloudError, cloudFailure } = await import('../src/comfy/cloudV2.ts');
const { topazGraph } = await import('../src/tools/videoUpscaleModels.ts');
const { tripoGraph } = await import('../src/tools/threeD.ts');
const { TOPAZ_MODEL, VUP_MODELS } = await import('../src/shared/videoUpscale.ts');
const { NATIVE_DIRECT } = await import('../src/routing/directRoutes.ts');
const ok = (m: string) => console.log('ok ' + m);
const ASSET = { __type: 'core/ASSET', info: { id: 'asset_1', hash: 'blake3:00', file_path: 'clip.mp4' } };
/** User-imported models are not in the shared list (the run's free preflight checks them instead). */
const IMPORTED = new Set(['akatz-ai__MiniMax-H3-Character-Swap-LoRA__h3_character_swap_v1.5.safetensors', 'Lightricks__LTX-2.5-22b-IC-LoRA-Layout-To-Render__ltx-2.5-22b-ic-lora-layout-to-render-1.0.safetensors' /* the user's imports (Model Library → Import) */,
  'fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors' /* H3 Fast: newer than the 2026-10-26 list; checked by the run's free preflight (h3-fast-cloud.test.ts) */]);
const clean = (name: string, g: Record<string, any>, oi = OI) => { const r = checkCloudGraph(g, oi); const errs = r.errors.filter((e) => ![...IMPORTED].some((m) => e.includes(JSON.stringify(m))));
  assert.deepEqual(errs, [], `${name}: ${errs.join(' | ')}`); return r; };

// ---------------- 1. every graph passes ----------------
{ let n = 0;
  for (const [id, model] of Object.entries<string>(TOPAZ_MODEL)) for (const t of VUP_MODELS[id].targets) {
    const g = topazGraph(id, { maxOutput: t }, ASSET); const r = clean(`${id} ${t}`, g); assert.deepEqual(r.warnings, [], `${id} ${t}: ${r.warnings}`);
    assert.equal(g['2'].inputs.upscaler_model, model); assert.equal(g['2'].inputs['upscaler_model.upscaler_resolution'], t === '4k' ? '4K (2160p)' : 'FullHD (1080p)'); n++; }
  assert.ok(n >= 8, 'four Topaz models × two sizes');
  for (const texture of ['off', 'standard', 'hd', 'pbr']) for (const detail of ['standard', 'high']) clean(`tripo ${texture}/${detail}`, tripoGraph({ texture, detail, seed: 7 }, ASSET));
  const files = fs.readdirSync(path.join(ROOT, 'workflows/cloud')).filter((f) => f.endsWith('.json')); assert.ok(files.length >= 5);
  for (const f of files) clean(f, JSON.parse(fs.readFileSync(path.join(ROOT, 'workflows/cloud', f), 'utf8')), oiFor(f));
  ok(`${n} Topaz graphs, 8 Tripo graphs and ${files.length} workflows/cloud graphs pass the object_info check`);
}
// ---------------- 2. the check catches what Cloud refuses ----------------
{ const base = () => structuredClone(topazGraph('cloud-topaz-astra2', { maxOutput: '1080p' }, ASSET));
  const bad = (mut: (g: any) => void, re: RegExp) => { const g = base(); mut(g); const r = checkCloudGraph(g, OI); assert.ok(r.errors.some((e) => re.test(e)), `${re}: ${r.errors}`); };
  bad((g) => { delete g['2'].inputs['upscaler_model.creativity']; }, /required input "upscaler_model\.creativity" is missing/); // what the Astra 2 graph lacked before
  bad((g) => { g['2'].inputs.upscaler_resolution = g['2'].inputs['upscaler_model.upscaler_resolution']; delete g['2'].inputs['upscaler_model.upscaler_resolution']; }, /"upscaler_model\.upscaler_resolution" is missing/);
  bad((g) => { g['2'].inputs.upscaler_model = 'Starlight Precise 2'; }, /is not one of/);
  bad((g) => { g['2'].inputs['upscaler_model.upscaler_resolution'] = '8K'; }, /not in the list/);
  bad((g) => { g['2'].inputs.video = ASSET; }, /not a loader widget/);
  bad((g) => { g['3'].inputs.format = 'gif'; }, /is not one of/);
  bad((g) => { g['2'].inputs.video = ['9', 0]; }, /missing node 9/);
  bad((g) => { g['2'].inputs['upscaler_model.creativity'] = 2; }, /outside/);
  bad((g) => { g['4'] = { class_type: 'NotANode', inputs: {} }; }, /class not on this server/);
  ok('missing dynamic-combo inputs, wrong naming, bad choices, misplaced uploads, bad links, ranges and unknown classes are caught');
}
// ---------------- fake Comfy Cloud ----------------
type Call = { url: string; method: string; body: any; headers: Record<string, string> };
const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const fake = (h: (c: Call) => Response | Promise<Response>) => { const calls: Call[] = [];
  const f = (async (u: any, init: any = {}) => { const c: Call = { url: String(u), method: init.method ?? 'GET', body: init.body, headers: { ...(init.headers ?? {}) } }; calls.push(c); return h(c); }) as typeof fetch; return { f, calls }; };
const CLIP = path.join(D, 'clip.mp4'); fs.writeFileSync(CLIP, Buffer.alloc(64, 1));
// ---------------- 3. upload field order ----------------
{ const { f, calls } = fake((c) => { const keys = [...(c.body as FormData).keys()];
    return keys[keys.length - 1] === 'file' && keys.indexOf('content_type') === 0 ? json({ id: 'asset_9', hash: 'blake3:ab', file_path: 'clip.mp4' }, 201)
      : json({ error: { code: 'invalid_body', message: 'content_type is required and must be sent before the file field' } }, 422); });
  const a = await new ComfyCloudV2('http://cloud.test', KEY, 'j-a1', f, 1).upload(CLIP);
  assert.deepEqual([...(calls[0].body as FormData).keys()], ['content_type', 'file_path', 'file']); assert.equal((calls[0].body as FormData).get('content_type'), 'video/mp4');
  assert.deepEqual(a, { __type: 'core/ASSET', info: { id: 'asset_9', hash: 'blake3:ab', file_path: 'clip.mp4' } });
  ok('upload: content_type, file_path, then the file (Cloud reads nothing after the file part)');
}
// ---------------- 4 + 5. the Topaz runner end to end ----------------
const topaz = NATIVE_DIRECT['cloud-topaz-precise'] as any; const route = { routeId: 'cloud-topaz-precise', envKey: 'COMFY_API_KEY' } as any;
const runTopaz = async (h: (c: Call) => Response | Promise<Response>) => { const { f, calls } = fake(h); const real = globalThis.fetch; globalThis.fetch = f;
  const job: any = { id: `tz${Math.random().toString(36).slice(2, 7)}`, toolId: 'upscale', provider: 'cloud-topaz-precise', status: 'running', outputs: [], input: { videoPath: CLIP, maxOutput: '1080p', duration: 8, fps: 24, hasAudio: false } };
  let err: any = null; try { await topaz.cloudRun(job, route, { n: 1 }); } catch (e) { err = e; } finally { globalThis.fetch = real; } return { job, calls, err }; };
{ // the a1a46750 failure as Cloud answers it: upload refused with 422
  const r = await runTopaz(() => json({ error: { code: 'invalid_body', message: 'content_type is required and must be sent before the file field' } }, 422));
  assert.equal(r.job.reasonCode, 'upload_failed', 'an upload refusal is not "a model or node is missing"'); assert.equal(r.job.cloudJobId, undefined);
  assert.match(r.err.message, /upload to Comfy Cloud failed.*Comfy said: content_type is required/); assert.ok(!r.calls.some((c) => c.url.endsWith('/api/v2/jobs')), 'nothing submitted');
  assert.equal(r.job.providerError.step, 'upload'); assert.equal(r.job.providerError.errorType, 'invalid_body'); assert.equal(r.job.providerError.httpStatus, 422);
  assert.ok(!JSON.stringify(r.job).includes(KEY) && !r.err.message.includes(KEY), 'the key is never kept');
  ok('upload 422 → upload_failed with Comfy’s own words kept (providerError.step upload), no job id, no key');
}
{ // a graph Cloud refuses: node_errors kept one line each
  const r = await runTopaz((c) => c.url.endsWith('/api/v2/assets') ? json({ id: 'asset_9', file_path: 'clip.mp4' }, 201)
    : json({ error: { code: 'invalid_workflow', message: 'Prompt outputs failed validation', details: { node_errors: { '2': { class_type: 'TopazVideoEnhanceV2', errors: [{ type: 'required_input_missing', message: 'Required input is missing', details: 'upscaler_model.creativity', extra_info: { input_name: 'upscaler_model.creativity' } }] } } } } }, 422));
  const sub = r.calls.find((c) => c.url.endsWith('/api/v2/jobs')); const body = JSON.parse(sub!.body);
  assert.deepEqual(body.extra_data, { api_key_comfy_org: KEY }, 'partner node: the key once in extra_data'); assert.equal(body.workflow['1'].inputs.file.info.id, 'asset_9');
  assert.deepEqual(checkCloudGraph(body.workflow, OI).errors, [], 'the graph sent is the one the check passes');
  assert.equal(r.job.reasonCode, 'workflow_invalid'); assert.equal(r.job.providerError.step, 'submit'); assert.equal(r.job.providerError.errorType, 'invalid_workflow');
  assert.deepEqual(r.job.providerError.nodeErrors, ['node 2 TopazVideoEnhanceV2: Required input is missing (upscaler_model.creativity)']);
  assert.match(r.err.message, /Comfy refused the graph.*Comfy said: node 2 TopazVideoEnhanceV2: Required input is missing/); assert.ok(!JSON.stringify(r.job.providerError).includes(KEY));
  ok('submit 422 invalid_workflow → node_errors kept on the job; the submitted body carries extra_data.api_key_comfy_org');
}
{ // a job that fails while running keeps Cloud's error too
  const r = await runTopaz((c) => c.url.endsWith('/api/v2/assets') ? json({ id: 'asset_9' }, 201) : c.method === 'POST' ? json({ id: 'cj-1', status: 'queued' }, 201)
    : json({ id: 'cj-1', status: 'failed', error: { code: 'node_error', class_type: 'TopazVideoEnhanceV2', message: 'Topaz API returned 400: video codec not supported' } }));
  assert.equal(r.job.cloudJobId, 'cj-1'); assert.equal(r.job.reasonCode, 'cloud_job_failed'); assert.equal(r.job.providerError.requestId, 'cj-1');
  assert.match(r.job.providerError.detail, /TopazVideoEnhanceV2: Topaz API returned 400/); assert.match(r.err.message, /Comfy said: TopazVideoEnhanceV2: Topaz API returned 400/);
  ok('a failed Cloud job keeps its error on the job');
}
{ // core-node graphs send no extra_data
  const { f, calls } = fake((c) => c.method === 'POST' ? json({ id: 'cj-2' }, 201) : json({ id: 'cj-2', status: 'succeeded', outputs: [] }));
  await new ComfyCloudV2('http://cloud.test', KEY, 'j-a1', f, 1).run({ '1': { class_type: 'X', inputs: {} } });
  assert.equal(JSON.parse(calls[0].body).extra_data, undefined);
  const e = new CloudError('workflow_invalid', 'x.', 422); const job: any = { id: 'q' }; cloudFailure(job, e, 'r'); assert.equal(job.providerError, undefined, 'nothing said → nothing invented');
  ok('core-node runs send no extra_data; a bare error keeps no providerError');
}
console.log('cloud-partner-graphs: all ok');
