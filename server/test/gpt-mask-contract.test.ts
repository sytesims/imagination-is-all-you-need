// Actual GPT request mask bytes, offline only: no server, credentials, estimator or generation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gpt-mask-contract-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: dir, OPENHIGGSFIELD_ENV_FILE: '/dev/null', OPENHIGGSFIELD_FILMING_FILE: '/dev/null', OPENHIGGSFIELD_BACKEND: 'mock', COMFY_BASE_URL: '', COMFY_API_KEY: '' });
for (const name of Object.keys(process.env)) if (/^(OPENHIGGSFIELD_|OPENJUTSU_)?(?:.*API_KEY|.*TOKEN|FAL_KEY|REPLICATE_API_TOKEN)$/.test(name)) delete process.env[name];
globalThis.fetch = (async () => { throw new Error('Network forbidden in mask contract test'); }) as typeof fetch;
const { ROUTER_MODELS: R } = await import('../src/routing/routerModels.js');
const O = await import('../src/providers/openai.js');
const png = (w: number, h: number, rgba: Buffer) => execFileSync('ffmpeg', ['-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-i', 'pipe:0', '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1'], { input: rgba });
const decode = (bytes: Buffer) => execFileSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { input: bytes });
const write = (name: string, bytes: Buffer) => { const file = path.join(dir, name); fs.writeFileSync(file, bytes); return file; };
const source = write('source.png', png(4, 1, Buffer.from(Array(4).fill([20, 40, 60, 255]).flat())));
const canonical = png(4, 1, Buffer.from([0, 0, 0, 255, 64, 64, 64, 255, 128, 128, 128, 255, 255, 255, 255, 255]));
const mask = write('mask.png', canonical);
const input = { types: ['inpaint'], mode: 'inpaint', prompt: 'change painted area', imagePath: source, refPaths: [source], maskPath: mask, aspect: '1:1', imageResolution: '1K' };
const alpha = (bytes: Buffer) => [...decode(bytes)].filter((_, k) => k % 4 === 3);
const observations: Record<string, number[]> = {};
// Optional private evidence, never required for the test and never written into the repo by default.
const evidence = process.env.MASK_CONTRACT_EVIDENCE_DIR;
if (evidence) { fs.mkdirSync(evidence, { recursive: true }); fs.writeFileSync(path.join(evidence, 'canonical.png'), canonical); }
const builders: [string, (i: Record<string, any>) => Promise<Buffer>][] = [
  ...['api-gpt-image', 'api-gpt-image-25-flare', 'api-gpt-image-25-sunburst', 'api-gpt-image-15'].map((engine): [string, (i: Record<string, any>) => Promise<Buffer>] =>
    [engine, async (i) => Buffer.from(String((await R[engine].body(i, 0)).mask).split(',')[1], 'base64')]),
  ...(['gpt-image-2', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'] as const).map((model): [string, (i: Record<string, any>) => Promise<Buffer>] =>
    [model, async (i) => Buffer.from(await ((await O.openaiSpec(model).build({ id: 'offline', input: i })).form!.get('mask') as File).arrayBuffer())]),
];
try {
  for (const engine of ['api-gpt-image', 'api-gpt-image-25-flare', 'api-gpt-image-25-sunburst', 'api-gpt-image-15']) {
    const body = await R[engine].body(input, 0);
    assert.equal(body.n, 1); assert.equal(body.output_format, 'png'); assert.ok(Array.isArray(body.image));
    assert.deepEqual(Object.keys(body).sort(), ['image', 'mask', 'n', 'output_format', 'prompt', 'quality', 'size']);
    assert.equal(body.prompt, input.prompt); assert.equal(body.quality, 'medium'); assert.equal(body.size, '1024x1024');
    assert.deepEqual(Buffer.from(String((body.image as string[])[0]).split(',')[1], 'base64'), fs.readFileSync(source), 'Router sends the original source');
    const bytes = Buffer.from(String(body.mask).split(',')[1], 'base64');
    observations[`router:${engine}`] = alpha(bytes);
    if (evidence && engine === 'api-gpt-image') fs.writeFileSync(path.join(evidence, 'router-mask.png'), bytes);
  }
  for (const model of ['gpt-image-2', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'] as const) {
    const req = await O.openaiSpec(model).build({ id: 'offline', input });
    assert.equal(req.url, 'https://api.openai.com/v1/images/edits'); assert.equal(req.body, undefined);
    assert.equal(req.form!.getAll('image[]').length, 1); assert.equal((req.form!.get('mask') as File).type, 'image/png');
    assert.deepEqual([...req.form!.keys()].sort(), ['image[]', 'mask', 'model', 'n', 'output_format', 'prompt', 'quality', 'size']);
    assert.equal(req.form!.get('prompt'), input.prompt); assert.equal(req.form!.get('quality'), 'medium'); assert.equal(req.form!.get('size'), '1024x1024');
    assert.deepEqual(Buffer.from(await (req.form!.get('image[]') as File).arrayBuffer()), fs.readFileSync(source), 'Direct sends the original source');
    const bytes = Buffer.from(await (req.form!.get('mask') as File).arrayBuffer());
    observations[`direct:${model}`] = alpha(bytes);
    if (evidence && model === 'gpt-image-2') fs.writeFileSync(path.join(evidence, 'direct-mask.png'), bytes);
  }
  console.log(JSON.stringify({ maskAlpha: observations, expectedAlpha: [255, 191, 127, 0], canonicalUnchanged: fs.readFileSync(mask).equals(canonical) }));
  for (const [name, values] of Object.entries(observations)) assert.deepEqual(values, [255, 191, 127, 0], `${name}: white paint must become transparent, soft paint must remain soft`);
  assert.deepEqual(fs.readFileSync(mask), canonical, 'never overwrite canonical input');
  console.log('ok GPT Router ×4 and direct OpenAI ×3 mask bytes and unchanged request shape');

  const native = png(4, 1, Buffer.from([30, 50, 70, 0, 30, 50, 70, 64, 30, 50, 70, 128, 30, 50, 70, 255]));
  const nativePath = write('native-alpha.png', native);
  const empty = write('empty.png', png(4, 1, Buffer.from(Array(4).fill([0, 0, 0, 255]).flat())));
  const wrongShape = write('wrong-shape.png', png(4, 4, Buffer.alloc(4 * 4 * 4, 255)));
  const corrupt = write('corrupt.png', canonical.subarray(0, 33));
  const wrongType = write('renamed.png', execFileSync('ffmpeg', ['-v', 'error', '-i', source, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'mjpeg', 'pipe:1']));
  for (const [name, build] of builders) {
    assert.deepEqual(alpha(await build({ ...input, maskPath: nativePath })), [0, 64, 128, 255], `${name}: native alpha is already provider polarity`);
    for (const [fields, error] of [
      [{ maskPath: undefined }, /PNG mask is required/],
      [{ imagePath: undefined, refPaths: [] }, /source photo/],
      [{ maskPath: wrongType }, /use a PNG mask/],
      [{ maskPath: corrupt }, /could not decode|could not be read/],
      [{ maskPath: wrongShape }, /does not match source photo/],
      [{ maskPath: empty }, /no editable area/],
      [{ imagePath: corrupt, refPaths: [corrupt] }, /could not decode|could not be read/],
    ] as const) await assert.rejects(build({ ...input, ...fields }), error, `${name}: refuses invalid input before provider`);
  }
  assert.deepEqual(fs.readFileSync(nativePath), native, 'native input is byte-identical too');
  console.log('ok all seven builders: native alpha, missing mask/source, wrong type, corrupt mask/source, wrong aspect and empty paint');

  // Match the UI: photos prepare to max side4096; masks can be proportionally smaller/larger, never cropped or stretched.
  const largeSource = write('normal-4096.png', png(4096, 64, Buffer.from(Array(4096 * 64).fill([20, 40, 60, 255]).flat())));
  const smallPixels = Buffer.alloc(2048 * 32 * 4);
  for (let k = 0; k < smallPixels.length; k += 4) { const v = (k / 4) % 2048 < 1024 ? 0 : 255; smallPixels.set([v, v, v, 255], k); }
  const smallMask = write('smaller.png', png(2048, 32, smallPixels));
  const { imageDimsOf } = await import('../src/imageDims.js');
  const resized = await builders[0][1]({ ...input, imagePath: largeSource, refPaths: [largeSource], maskPath: smallMask });
  assert.deepEqual(imageDimsOf(resized), { width: 4096, height: 64 });
  const ra = alpha(resized); assert.equal(ra[0], 255); assert.equal(ra[4095], 0); assert.ok(ra.some(a => a > 0 && a < 255), 'proportional resize retains a soft boundary');
  // JPEG source photos are legitimate; only the mask must be PNG. Sources are not rewritten.
  const jpeg = write('source.jpg', fs.readFileSync(wrongType));
  assert.deepEqual(alpha(await builders[0][1]({ ...input, imagePath: jpeg, refPaths: [jpeg] })), [255, 191, 127, 0]);
  // Same 1×1 lossless WebP fixture as media-accept-webp.test.ts; no optional libwebp encoder required.
  const webp = write('source.webp', Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64'));
  const oneMask = write('one-mask.png', png(1, 1, Buffer.from([255, 255, 255, 255])));
  assert.deepEqual(alpha(await builders[0][1]({ ...input, imagePath: webp, refPaths: [webp], maskPath: oneMask })), [0]);
  console.log('ok UI-bound4096 source, proportionally resized mask with soft boundary, JPEG/WebP source photos');

  // Non-GPT routes still see canonical white=edit; Ideogram alone inverts its own luminance.
  const { FAL_EDIT_BODIES: F } = await import('../src/tools/imageFalModels.js');
  const fromUri = (u: unknown) => Buffer.from(String(u).split(',')[1], 'base64');
  assert.deepEqual(fromUri((await F.genfill(input)).mask_url), canonical);
  assert.deepEqual(Buffer.from(String((await R['api-bria-fibo2'].body(input, 0)).mask), 'base64'), canonical);
  const inverted = decode(fromUri((await F.ideogram45(input, 'offline-polarity')).mask_url));
  assert.deepEqual([...inverted].filter((_, k) => k % 4 === 0), [255, 191, 127, 0]);
  assert.deepEqual(fs.readFileSync(mask), canonical);
  console.log('ok Bria canonical bytes and Ideogram inverse-luminance polarity unchanged');

  // The actual runner builds/validates before estimating. Fake estimator captures bytes then refuses on price;
  // any attempt to generate is an assertion failure, never a network request.
  const { runRouter, setRouterFetch } = await import('../src/routing/routerRun.js');
  let estimates = 0, generations = 0;
  setRouterFetch((async (url: any, init: any) => {
    if (!String(url).endsWith('/estimate')) { generations++; throw new Error('Generation forbidden'); }
    estimates++; assert.deepEqual(alpha(fromUri(JSON.parse(init.body).mask)), [255, 191, 127, 0]);
    return new Response(JSON.stringify({ source: 'exact', amount: 10 }), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch);
  const route: any = { routeId: 'comfy-router:api-gpt-image', kind: 'comfy-router', modelId: 'api-gpt-image' };
  const j = (i: any): any => ({ id: 'offline-mask', toolId: 'create-image', provider: 'api-gpt-image', input: i, cost: 1, status: 'running' });
  await assert.rejects(runRouter(j({ ...input, maskPath: empty }), route, { n: 1 } as any, 1000), /no editable area/);
  assert.equal(estimates, 0, 'invalid masks never reach estimate');
  await assert.rejects(runRouter(j(input), route, { n: 1 } as any, 1000), /10\.0000.*0\.0100/);
  assert.equal(estimates, 1); assert.equal(generations, 0); setRouterFetch(null);
  console.log('ok fake runner estimator sees normalized mask; invalid mask never estimates; guard prevents every generation');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
