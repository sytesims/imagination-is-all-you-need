// BH9 (f) unit: Comfy Cloud v2 REST client with a mocked fetch (no network, no key, no spend).
// 401/403 → key_invalid; success = upload → submit (Idempotency-Key) → poll the stored id → download via the signed URL WITHOUT the key;
// an ambiguous submit is never resent; poll errors keep polling the same id; the cloud plan uses workflows/cloud/h3-*.json.
// Run: npx tsx test/bh9-cloud.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { ComfyCloudV2, CloudError, cloudErrorFor } from '../src/comfy/cloudV2.ts';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'bh9c-')); const ok = (m: string) => console.log('ok ' + m);
const IMG = path.join(D, 'in.png'); fs.writeFileSync(IMG, Buffer.from('89504e470d0a1a0a', 'hex'));
type Call = { url: string; method: string; headers: Record<string, string>; body?: any };
const mk = (handler: (c: Call, n: number) => Response | Promise<Response>) => { const calls: Call[] = [];
  const f = (async (u: any, init: any = {}) => { const c: Call = { url: String(u), method: init.method ?? 'GET', headers: { ...(init.headers ?? {}) }, body: init.body }; calls.push(c); return handler(c, calls.length); }) as typeof fetch;
  return { f, calls }; };
const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
try {
  // key_invalid
  for (const st of [401, 403]) {
    const { f, calls } = mk(() => json({ error: { code: 'unauthorized', message: 'nope' } }, st)); const c = new ComfyCloudV2('https://cc.test', 'comfyui-obviously-invalid', 'job1-a1', f, 1);
    await assert.rejects(c.upload(IMG), (e: any) => e instanceof CloudError && e.reasonCode === 'key_invalid' && e.httpStatus === st && !/obviously-invalid/.test(e.message + e.detail));
    assert.equal(calls[0].headers.Authorization, 'Bearer comfyui-obviously-invalid'); assert.equal(calls.length, 1);
    await assert.rejects(c.run({ '1': { class_type: 'X', inputs: {} } }), (e: any) => e.reasonCode === 'key_invalid');
  }
  assert.equal(cloudErrorFor(402, 's').reasonCode, 'cloud_credits'); assert.equal(cloudErrorFor(422, 's').reasonCode, 'workflow_invalid'); assert.equal(cloudErrorFor(429, 's').temporary, true);
  assert.equal(cloudErrorFor(451, 's').reasonCode, 'content_blocked'); assert.equal(cloudErrorFor(503, 's').reasonCode, 'cloud_unreachable');
  ok('401/403 → key_invalid (plain message, key never in message/detail); 402 cloud_credits, 422 workflow_invalid, 429 temporary, 451 content_blocked');
  // happy path
  { let polls = 0; const { f, calls } = mk((c) => {
      if (c.url.endsWith('/api/v2/assets')) return json({ id: 'a-1', hash: 'blake3:00', file_path: 'in.png' }, 201);
      if (c.url.endsWith('/api/v2/jobs') && c.method === 'POST') return json({ id: 'cj-9', status: 'queued' }, 201);
      if (c.url.endsWith('/api/v2/jobs/cj-9')) { polls++; return json(polls < 2 ? { id: 'cj-9', status: 'queued', queue_position: 1 } : polls < 3 ? { id: 'cj-9', status: 'running', progress: { value: 0.5 } } : polls < 4 ? { id: 'cj-9', status: 'running' } : { id: 'cj-9', status: 'succeeded', outputs: [{ node_id: '92', name: 'out.mp4', type: 'video', content_type: 'video/mp4', id: 'o1', url: '/api/v2/assets/o1/content' }] }); }
      if (c.url.endsWith('/api/v2/assets/o1/content')) return new Response(null, { status: 302, headers: { location: 'https://signed.example/o1?sig=abc' } });
      if (c.url.startsWith('https://signed.example/')) return new Response(Buffer.from('MP4DATA'), { status: 200 });
      return json({}, 404); });
    const c = new ComfyCloudV2('https://cc.test/', 'comfyui-test', 'job2-a1', f, 1);
    const asset = await c.upload(IMG); assert.deepEqual(asset, { __type: 'core/ASSET', info: { id: 'a-1', hash: 'blake3:00', file_path: 'in.png' } });
    let stored = ''; const pr: number[] = [];
    const res = await c.run({ '114': { class_type: 'LoadImage', inputs: { image: asset } } }, { onSubmitted: (id) => { stored = id; }, onProgress: (p) => pr.push(p.percent) });
    assert.equal(stored, 'cj-9'); assert.equal(res.promptId, 'cj-9'); assert.ok(pr.includes(50) && pr.at(-1) === 100);
    const sub = calls.filter((x) => x.url.endsWith('/api/v2/jobs') && x.method === 'POST'); assert.equal(sub.length, 1, 'one submit');
    assert.match(sub[0].headers['Idempotency-Key'], /^job2-a1-p\d+$/); assert.deepEqual(JSON.parse(sub[0].body).workflow['114'].inputs.image.info.id, 'a-1'); assert.equal(JSON.parse(sub[0].body).metadata, undefined, 'no metadata (Cloud rejects it)');
    const out = res.outputs['92'][0]; assert.equal(out.filename, 'out.mp4'); const dest = path.join(D, 'o.mp4'); await c.download(out, dest); assert.equal(fs.readFileSync(dest, 'utf8'), 'MP4DATA');
    const signed = calls.find((x) => x.url.startsWith('https://signed.example/'))!; assert.equal(signed.headers.Authorization, undefined, 'signed URL fetched without the key');
    ok('upload → core/ASSET; one submit with Idempotency-Key job2-a1-p…; id stored before polling; progress 50 → 100; output via 302 signed URL without the key');
  }
  // ambiguous submit: never resent
  { const { f, calls } = mk((c) => { if (c.url.endsWith('/api/v2/jobs')) throw new TypeError('fetch failed'); return json({}); }); const c = new ComfyCloudV2('https://cc.test', 'k-xxxxxxxx', 'job3-a1', f, 1);
    await assert.rejects(c.run({}), (e: any) => e.reasonCode === 'submit_uncertain' && /not sent again/.test(e.message)); assert.equal(calls.filter((x) => x.url.endsWith('/api/v2/jobs')).length, 1);
    const { f: f5, calls: c5 } = mk(() => json({ error: { code: 'upstream_error' } }, 502)); await assert.rejects(new ComfyCloudV2('https://cc.test', 'k-xxxxxxxx', 'j', f5, 1).run({}), (e: any) => e.reasonCode === 'submit_uncertain'); assert.equal(c5.length, 1);
    ok('network error / 502 on submit → submit_uncertain, exactly 1 submit (no blind resubmit)'); }
  // poll errors → keep polling the same id; failed job → cloud_job_failed; cancel
  { let n = 0; const { f, calls } = mk((c) => { if (c.method === 'POST' && c.url.endsWith('/jobs')) return json({ id: 'cj-1' }, 201); if (c.url.endsWith('/cj-1')) { n++; if (n < 3) throw new TypeError('socket'); return json({ status: 'failed', error: { code: 'node_execution_error', message: 'oom' } }); } return json({}); });
    await assert.rejects(new ComfyCloudV2('https://cc.test', 'k-xxxxxxxx', 'j4', f, 1).run({}), (e: any) => e.reasonCode === 'cloud_job_failed' && /node_execution_error/.test(e.detail));
    assert.equal(calls.filter((x) => x.method === 'POST').length, 1); assert.equal(calls.filter((x) => x.url.endsWith('/cj-1')).length, 3);
    const { f: fc, calls: cc } = mk((c) => c.method === 'POST' && c.url.endsWith('/jobs') ? json({ id: 'cj-2' }, 201) : json({ status: 'running' }));
    await assert.rejects(new ComfyCloudV2('https://cc.test', 'k-xxxxxxxx', 'j5', fc, 1).run({}, { isCanceled: () => true }), /canceled/); assert.ok(cc.some((x) => x.url.endsWith('/api/v2/jobs/cj-2/cancel') && x.method === 'POST'));
    ok('poll errors keep polling the stored id (1 submit, 3 polls); failed → cloud_job_failed; cancel → POST /jobs/{id}/cancel'); }
  // plan uses the cloud twin
  { const { buildPlan } = await import('../src/comfy/plans.ts'); const p = buildPlan({ id: 'x', toolId: 'h3-video', provider: 'cloud-h3-wf', input: { mode: 'i2v', prompt: 'p', duration: 5, imagePath: IMG } } as any);
    assert.equal(p.passes[0].workflow, 'cloud/h3-i2v-api.json'); assert.match(JSON.stringify(p.passes[0].graph), /minimax_h3_video_vae_fp16/); assert.deepEqual(p.passes[0].graph['114'].inputs.image, { __file: IMG });
    const pl = buildPlan({ id: 'y', toolId: 'h3-video', provider: 'comfy-h3', input: { mode: 't2v', prompt: 'p', duration: 5 } } as any); assert.equal(pl.passes[0].workflow, 'h3-t2v-api.json');
    ok('plan: cloud-h3-wf → workflows/cloud/h3-i2v-api.json (fp16 VAE, image via {__file} → asset); comfy-h3 keeps the local graph'); }
  console.log('ALL OK bh9-cloud');
} finally { fs.rmSync(D, { recursive: true, force: true }); }
