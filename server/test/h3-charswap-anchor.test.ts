// H3 Character Swap · Comfy Cloud (2026-11-02): Comfy's Openjutsu prompt contract and first-frame anchor. FAKE fetches only (no network, no key, no spend).
//  - prompt: Openjutsu's swapPrompt verbatim with our {who} slot, the anchor sentence only with an anchor, the user's direction; the old contract
//    (LEGACY_CORES) is recognised so Recreate never stacks two contracts
//  - plan: anchor → LoadImage + ImageScale (lanczos, center, the video's size) → <Picture 2> (ref_image_1) and the frame-0 guide (+ video VAE); off,
//    failed, Motion transfer → today's graph; every variant passes Cloud's object_info; 9:16 720×1280 at 480p and 768p
//  - prep: the range's first frame (the clip is already cut to the range) + the character → GPT Image 2.5 Sunburst (low, auto, ANCHOR_PROMPT + who),
//    once per job; a failure swaps without it and says so
//  - price: the anchor's credits on top of the route price for quote and submit alike (one function), its own breakdown line; none when off
// Run: npx tsx test/h3-charswap-anchor.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'h3anchor-')); Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json') });
for (const k of ['COMFY_API_KEY', 'COMFY_ROUTER_URL', 'COMFY_CLOUD_URL', 'COMFY_DEPLOY_URL', 'COMFY_RUNNER_URL']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const { h3SwapPrompt, composeH3SwapPrompt, LEGACY_CORES, H3_ANCHOR_SENTENCE } = await import('../src/shared/h3SwapPrompt.ts');
const A = await import('../src/comfy/h3CharSwapAnchor.ts');
const CS = await import('../src/comfy/h3CharSwapCloud.ts');
const { buildCloudPlan, CLOUD_WORKFLOWS } = await import('../src/comfy/cloudWorkflows.ts');
const { checkCloudGraph } = await import('../src/comfy/cloudGraphCheck.ts');
const { routesFor } = await import('../src/routing/routes.ts');
const { routeCredits } = await import('../src/routing/select.ts');
const { routeQuoteInput } = await import('../src/routing/http.ts');
const { priceOf } = await import('../src/shared/pricing.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { cutRange } = await import('../src/swapClips.ts');
const OI = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures/object-info-comfy-cloud-2026-10-26.json'), 'utf8'));

// ---- prompt
{
  const OJ = 'Replace the selected person in <Video 1> with the character in <Picture 1>. Preserve the source performance, scene and audio timing.';
  assert.equal(h3SwapPrompt(), OJ, "no who → Openjutsu's words verbatim");
  assert.equal(h3SwapPrompt(undefined, { anchor: true }), `${OJ} Start from the first frame in <Picture 2>.`, 'anchor sentence, as theirs');
  assert.equal(h3SwapPrompt('the woman on the right'), OJ.replace('the selected person', 'the woman on the right'), 'our {who} slot');
  assert.equal(composeH3SwapPrompt({ target: 'the man', prompt: 'darker jacket', anchor: true }), `${h3SwapPrompt('the man', { anchor: true })} darker jacket`, 'direction last, space-joined as theirs');
  assert.equal(composeH3SwapPrompt({ target: 'the man', prompt: '' }), h3SwapPrompt('the man'));
  for (const target of [undefined, 'the man on the left']) for (const anchor of [true, false]) {
    const legacy = LEGACY_CORES[0](target); const want = h3SwapPrompt(target, { anchor });
    assert.equal(composeH3SwapPrompt({ target, prompt: legacy, anchor }), want, 'legacy contract alone → today\'s');
    assert.equal(composeH3SwapPrompt({ target, prompt: `${legacy}\n\nAdditional direction: keep the glasses`, anchor }), `${want} keep the glasses`, 'Recreate of an old job: one contract, the direction kept');
    assert.equal(composeH3SwapPrompt({ target, prompt: `${h3SwapPrompt(target, { anchor: !anchor })} keep the glasses`, anchor }), `${want} keep the glasses`, 'a run with the other anchor setting is recomposed, not stacked');
    const out = composeH3SwapPrompt({ target, prompt: `${legacy} x`, anchor }); assert.equal(out.split('Replace ').length, 2); assert.equal(out.includes(H3_ANCHOR_SENTENCE), anchor);
  }
  assert.match(composeH3SwapPrompt({ target: 'the man', prompt: LEGACY_CORES[0]('the woman') }), /^Replace the man in <Video 1>.*Replace the woman/, 'another target\'s contract is never silently taken');
  assert.ok(composeH3SwapPrompt({ prompt: 'x'.repeat(5000) }).length <= 4000);
  ok("prompt: Openjutsu's contract + {who} + anchor sentence + direction; legacy and other-anchor prompts recomposed (Recreate never stacks two)");
}

// ---- anchor prompt + on/off
{
  assert.ok(A.ANCHOR_PROMPT.startsWith('Replace the person in image 1 with the character from image 2'));
  assert.equal(A.anchorPrompt({}), A.ANCHOR_PROMPT, 'no click, no name → their prompt verbatim');
  assert.equal(A.anchorPrompt({ target: 'the woman in red' }), `${A.ANCHOR_PROMPT} The person to replace in image 1 is the woman in red.`);
  assert.match(A.anchorPrompt({ point: { x: 0.8, y: 0.3 } }), /The person to replace is the one on the right of image 1, around 80% from the left and 30% from the top\.$/);
  assert.match(A.anchorPrompt({ target: 'the man', point: { x: 0.1, y: 0.5 } }), /is the man, on the left of image 1, around 10% from the left/);
  const b = A.anchorBody({}, 'data:image/png;base64,AA', 'data:image/png;base64,BB');
  assert.deepEqual({ ...b, prompt: undefined }, { prompt: undefined, image: ['data:image/png;base64,AA', 'data:image/png;base64,BB'], quality: 'low', size: 'auto', n: 1, moderation: 'auto' }, "Openjutsu's request: frame first, character second");
  assert.equal(A.charswapAnchorOn({ mode: 'object_swap' }), true, 'on by default');
  assert.equal(A.charswapAnchorOn({ charswapAnchor: 'off' }), false); assert.equal(A.charswapAnchorOn({ mode: 'motion_transfer' }), false, 'never for Motion transfer');
  assert.deepEqual(CS.charswapFields({ charswapAnchor: 'off' }), { charswapAnchor: 'off' }); assert.deepEqual(CS.charswapFields({ charswapAnchor: 'auto' }), {});
  assert.ok('error' in CS.charswapFields({ charswapAnchor: 'maybe' }));
  ok('anchor prompt: ANCHOR_PROMPT verbatim + which person (name, click side); body at their settings; on by default, off switch, never motion');
}

// ---- plan
const base = { videoPath: '/fake/source.mp4', refPaths: ['/fake/person.png'], duration: 6, width: 720, height: 1280, seed: 7, target: 'the woman on the right', point: { x: 0.7, y: 0.4 }, mode: 'object_swap', hasAudio: true, keepAudio: true };
const make = (extra: Record<string, any> = {}, toolId = 'object-swap') => buildCloudPlan({ id: 'anc', toolId, provider: 'cloud-h3-charswap', input: { ...base, ...extra } }).passes[0];
const links = (g: Record<string, any>) => { for (const n of Object.values<any>(g)) for (const v of Object.values(n.inputs)) if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string') assert.ok(g[v[0]], `dangling ${v[0]}`); };
const schema = (g: Record<string, any>) => { const r = checkCloudGraph(g, OI); assert.deepEqual(r.errors.filter((e: string) => !e.includes(CS.CHARSWAP_LORA_DEFAULT)), [], JSON.stringify(r.errors)); links(g); };
{
  const AP = '/fake/anchor.png';
  for (const [res, size] of [['480p', { width: 512, height: 928 }], ['720p', { width: 736, height: 1344 }]] as const) {
    const p = make({ resolution: res, charswapAnchorPath: AP }); const g = p.graph;
    assert.deepEqual(g['14'].inputs.image, { __file: AP }); assert.equal(g['14'].class_type, 'LoadImage');
    assert.deepEqual(g['15'].inputs, { image: ['14', 0], upscale_method: 'lanczos', width: size.width, height: size.height, crop: 'center' }, `9:16 at ${res}: the anchor fits the video's size`);
    assert.deepEqual([g['20'].inputs.width, g['20'].inputs.height], [size.width, size.height]);
    assert.deepEqual(g['20'].inputs['ref_images.ref_image_1'], ['15', 0], '<Picture 2>'); assert.deepEqual(g['20'].inputs['ref_images.ref_image_0'], ['12', 0], '<Picture 1> unchanged');
    assert.deepEqual(g['19'].inputs.image, ['15', 0]); assert.deepEqual(g['19'].inputs.vae, ['5', 0]); assert.equal(g['19'].inputs.frame_idx, 0); assert.deepEqual(g['19'].inputs.audio, ['11', 1], 'source audio guide kept');
    assert.ok(g['13'].inputs.value.includes(H3_ANCHOR_SENTENCE)); assert.equal(p.expect.anchor, true); schema(g);
  }
  for (const extra of [{ charswapMask: 'off' }, { hasAudio: false }, { point: undefined, target: 'the man on the left' }, { maskPath: '/fake/m.mp4', maskMode: 'upload' }]) {
    const g = make({ ...extra, charswapAnchorPath: AP }).graph; assert.deepEqual(g['20'].inputs['ref_images.ref_image_1'], ['15', 0]); schema(g);
    if ((extra as any).hasAudio === false) { assert.equal(g['19'].inputs.audio, undefined); assert.equal(g['19'].inputs.audio_vae, undefined); assert.deepEqual(g['24'].inputs.conditioning, ['19', 0], 'silent clip: the guide carries the first frame only'); }
  }
  const plain = (p: ReturnType<typeof make>, why: string) => { const g = p.graph; assert.equal(g['14'], undefined, why); assert.equal(g['15'], undefined, why); assert.equal(g['20'].inputs['ref_images.ref_image_1'], undefined, why);
    assert.equal(g['19'].inputs.image, undefined, why); assert.ok(!String(p.expect.prompt).includes('Picture 2'), why); assert.equal(p.expect.anchor, false); schema(g); };
  plain(make(), 'no anchor made (first-frame call failed or not run)');
  plain(make({ charswapAnchorPath: AP, charswapAnchor: 'off' }), 'anchor off');
  plain(make({ charswapAnchorPath: AP, mode: 'motion_transfer' }, 'motion-transfer'), 'motion transfer');
  assert.deepEqual(make({ hasAudio: false }).graph['24'].inputs.conditioning, ['20', 0], 'silent clip without anchor: today\'s graph');
  // Recreate of an old job: its saved typed prompt (the old contract) → one contract
  const old = make({ prompt: `${LEGACY_CORES[0](base.target)}\n\nAdditional direction: keep her glasses`, charswapAnchorPath: AP }).graph['13'].inputs.value;
  assert.equal(old, `${h3SwapPrompt(base.target, { anchor: true })} keep her glasses`);
  ok('plan: anchor → LoadImage + ImageScale (lanczos, center) → <Picture 2> + frame-0 guide; 9:16 480p 512×928 / 768p 736×1344; mask off / silent / side / upload pass object_info; off, failed, motion = old graph; Recreate of an old job');
}

// ---- prep (fake Router)
const ff = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
const pixel = (png: string) => [...execFileSync('ffmpeg', ['-v', 'error', '-i', png, '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])];
{
  // a 9:16 720×1280 clip: 1 s red then 2 s blue; the swap range starts at 1 s, so the job's clip (already cut to the range) starts blue
  const red = path.join(D, 'r.mp4'), blue = path.join(D, 'b.mp4'), src = path.join(D, 'src.mp4'), cut = path.join(D, 'src-range.mp4'), list = path.join(D, 'l.txt');
  ff(['-f', 'lavfi', '-i', 'color=c=red:s=720x1280:r=24:d=1', '-pix_fmt', 'yuv420p', red]); ff(['-f', 'lavfi', '-i', 'color=c=blue:s=720x1280:r=24:d=2', '-pix_fmt', 'yuv420p', blue]);
  fs.writeFileSync(list, `file '${red}'\nfile '${blue}'\n`); ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', src]); await cutRange(src, cut, 1, 2);
  const char = path.join(D, 'char.png'); ff(['-f', 'lavfi', '-i', 'color=c=green:s=64x64', '-frames:v', '1', char]);
  const out = path.join(D, 'anchor-src.png'); ff(['-f', 'lavfi', '-i', 'color=c=yellow:s=64x112', '-frames:v', '1', out]); const PNG = fs.readFileSync(out).toString('base64');
  const calls: { url: string; method: string; body: any; headers: any }[] = [];
  const router = (mode: 'ok' | 'fail') => (async (u: any, init: any = {}) => { const url = String(u); calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : null, headers: init.headers });
    const j = (o: unknown, s = 200, h: Record<string, string> = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', ...h } });
    if (url.includes('/requests') && init.method === 'POST') return mode === 'fail' ? j({ detail: 'upstream broke' }, 500) : j({ request_id: 'r1', status_url: 'https://api.comfy.org/s/r1', response_url: 'https://api.comfy.org/o/r1', cancel_url: 'https://api.comfy.org/c/r1' }, 201);
    if (url.endsWith('/s/r1')) return j({ status: 'COMPLETED' });
    if (url.endsWith('/o/r1')) return j({ data: [{ b64_json: PNG }] }, 200, { 'x-comfy-credits-used': '5.3' });
    throw new Error('unexpected ' + url); }) as typeof fetch;
  const job: any = { id: 'anc1', input: { ...base, videoPath: cut, refPaths: [char] }, warnings: [] };
  await A.prepareCharswapAnchor(job, { key: 'fake-key', fetch: router('ok'), sleep: async () => {} });
  assert.equal(job.input.charswapAnchorError, undefined, job.input.charswapAnchorError); assert.ok(fs.existsSync(job.input.charswapAnchorPath)); assert.equal(job.input.charswapAnchorCost, 5.3);
  const sub = calls.find((c) => c.method === 'POST')!; assert.match(sub.url, /\/v2\/models\/openai\/gpt-image-2\.5-sunburst\/requests/);
  assert.equal(sub.headers['X-API-Key'], 'fake-key'); assert.equal(sub.body.quality, 'low'); assert.equal(sub.body.size, 'auto'); assert.equal(sub.body.prompt, A.anchorPrompt(base));
  assert.equal(sub.body.image.length, 2); assert.ok(sub.body.image.every((x: string) => x.startsWith('data:image/png;base64,')));
  const framePng = path.join(D, 'anc1-charswap-frame0.png'); const [r, g, b] = pixel(framePng); assert.ok(b > 200 && r < 60, `the range's first frame (blue), got ${r},${g},${b}`);
  const n = calls.length; await A.prepareCharswapAnchor(job, { key: 'fake-key', fetch: router('ok') }); assert.equal(calls.length, n, 'once per job: a retry or pick-up never pays again');
  const p = buildCloudPlan({ id: 'anc1', toolId: 'object-swap', provider: 'cloud-h3-charswap', input: job.input }).passes[0]; assert.deepEqual(p.graph['14'].inputs.image, { __file: job.input.charswapAnchorPath });
  // failure → swap without it, plain warning
  const bad: any = { id: 'anc2', input: { ...base, videoPath: cut, refPaths: [char] }, warnings: [] };
  await A.prepareCharswapAnchor(bad, { key: 'fake-key', fetch: router('fail'), sleep: async () => {} });
  assert.ok(bad.input.charswapAnchorError); assert.equal(bad.input.charswapAnchorPath, undefined); assert.match(bad.warnings[0], /^The first frame couldn't be made \(.+\), so the swap ran without it\.$/);
  const pb = buildCloudPlan({ id: 'anc2', toolId: 'object-swap', provider: 'cloud-h3-charswap', input: bad.input }).passes[0]; assert.equal(pb.graph['14'], undefined); assert.ok(!pb.expect.prompt.includes('Picture 2'));
  const nokey: any = { id: 'anc3', input: { ...base, videoPath: cut, refPaths: [char] } }; await A.prepareCharswapAnchor(nokey, {}); assert.match(nokey.warnings[0], /no Comfy key/);
  for (const skip of [{ charswapAnchor: 'off' }, { mode: 'motion_transfer' }]) { const k = calls.length; const j: any = { id: 'anc4', input: { ...base, ...skip, videoPath: cut, refPaths: [char] } };
    await A.prepareCharswapAnchor(j, { key: 'fake-key', fetch: router('ok') }); assert.equal(calls.length, k); assert.equal(j.input.charswapAnchorPath, undefined); assert.equal(j.warnings, undefined); }
  assert.equal((CLOUD_WORKFLOWS['comfy-cloud:cloud-h3-charswap'] as any).prepare, A.prepareCharswapAnchor, 'runs as the route\'s prep, after the free LoRA check, before any upload');
  ok("prep: the range's first frame (9:16, start 1 s) + character → GPT Image 2.5 Sunburst low/auto with the Comfy key; once per job; failure / no key → swap without it + plain warning; off and motion make nothing");
}

// ---- price: quote = submit, anchor line
{
  const tool = getTool('object-swap')!; const r = routesFor('comfy-h3-charswap', tool).find((x: any) => x.routeId === 'comfy-cloud:cloud-h3-charswap')!; // the twin the quote and the submit both price
  const anchor = A.charswapAnchorCredits(base); assert.ok(anchor >= 2 && anchor <= 6, `about $0.03 (${anchor} credits)`);
  assert.equal(A.charswapAnchorCredits({ target: 'x'.repeat(120), point: { x: 0.5, y: 0.5 } }), anchor, 'a long name stays in the same prompt bucket');
  for (const res of ['480p', '720p']) {
    const swap = priceOf({ toolId: 'object-swap', rates: tool.gpuSecPerSec, quality: res, durationSec: 6, provider: 'cloud-h3-charswap' }).credits;
    const quoteIn = routeQuoteInput(tool, { seconds: '6', resolution: res, swapType: 'person', target: base.target, point: '0.7,0.4' });
    const submitIn = { ...base, resolution: res, duration: 6, swapType: 'person', ...CS.charswapFields({}) };
    assert.equal(routeCredits(tool, r, quoteIn), swap + anchor, `${res}: quote = swap + first frame`); assert.equal(routeCredits(tool, r, submitIn), routeCredits(tool, r, quoteIn), `${res}: quote = submit`);
    const offQ = routeQuoteInput(tool, { seconds: '6', resolution: res, swapType: 'person', target: base.target, point: '0.7,0.4', charswapAnchor: 'off' });
    const offS = { ...submitIn, ...CS.charswapFields({ charswapAnchor: 'off' }) };
    assert.equal(routeCredits(tool, r, offQ), swap); assert.equal(routeCredits(tool, r, offS), swap, `${res}: off = no first-frame price, quote and submit`);
    console.log(`  6 s 9:16 ${res}: swap ${swap} + first frame ${anchor} = ${swap + anchor} credits ($${((swap + anchor) / 100).toFixed(2)})`);
  }
  assert.match(r.extraLine!(base)!, /^First frame: GPT Image 2\.5 Sunburst edit, low \(Comfy Router, estimated\) · \$0\.0\d$/); assert.equal(r.extraLine!({ charswapAnchor: 'off' }), null);
  assert.equal(r.extraCredits!({ mode: 'motion_transfer' }), 0);
  ok('price: first frame added to the route price on quote and submit alike (routeCredits), own breakdown line; off / motion = none');
}
console.log('ALL OK h3-charswap-anchor');
