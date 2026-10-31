// Ad Pack (2026-10-31): product photo(s) + headline / offer + Brand → one ad per picked style (shared/adPack.ts, promptPatterns 'ad' / 'ad-text'),
// in the platform's shape; the kit's logo added after the run by our code (adPackLogo.ts) inside the platform's safe area.
// Covers: the exact prompt per style and model family, the words and brand parts dropped when empty, the logo box (margins, safe zones,
// wide logos), the tool (styles → one output each, brand kit, aspect, errors) and the logo really composited onto a picture.
// Run: npx tsx test/ad-pack.test.ts   (in-process, temp data dir, mock backend, no network, no ComfyUI)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-pack-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock' });
const ok = (m: string) => console.log('ok ' + m);
const A = await import('../src/shared/adPack.ts');
const { BUILTIN_KIT } = await import('../src/shared/brandKit.ts');
const { PROMPT_PATTERNS } = await import('../src/shared/promptPatterns.ts');

// ---- 1. the prompt: exact per style × family ----
{
  const base = { headline: 'Run lighter', offer: '20% off this weekend', details: 'white running shoe', placement: 'meta-4x5', corner: 'tl', logo: true } as const;
  assert.equal(A.adPrompt({ ...base, style: 'studio', provider: 'api-gpt-image' }),
    'Image 1 is the product photo. Create a finished portrait 4:5 social media ad for this product. Scene: The product stands centred on a seamless studio backdrop in a soft, even tone, lit by a large soft key light with a gentle floor shadow, sharp focus on the product, plenty of clean empty space around it. About the product: white running shoe. Product: keep it exactly as in image 1, with the same shape, colours, label and printed text. Text, verbatim, each once and perfectly legible: the headline "Run lighter" and the offer "20% off this weekend". Typography: a bold, clean sans-serif, in the empty space above the product, the second line smaller beneath the first. Layout: keep the top-left corner as plain background with nothing in it, for a logo added later. No other words, watermarks or logos.');
  assert.equal(A.adPrompt({ ...base, style: 'poster', provider: 'api-nano-banana' }),
    'Using the provided image of the product (image 1), create a high-resolution portrait 4:5 advertising photograph of it. A bold graphic poster: the product large and crisp against a flat, saturated background colour, strong contrast, simple confident composition with room for big type. The product: white running shoe. The product stays exactly as it is in the image, with its shape, colours and label unchanged. The ad shows the offer "20% off this weekend" and the headline "Run lighter" in a very large, heavy sans-serif, as the biggest element, close to the product, the other line smaller above it. The top-left corner is clean, empty background with no text or objects. There is no other text or logo in the image.');
  // the brand: colours in words (hex for FLUX), its heading font as a type feel, its mood; a story size names its covered edges
  const q = A.adPrompt({ ...base, style: 'studio', provider: 'comfy-qwen21', placement: 'meta-9x16', kit: BUILTIN_KIT, extraPhotos: 2 });
  assert.ok(q.startsWith('Turn the product in image 1 into a vertical 9:16 advertising photo. Images 2 and 3 show the same product from other sides.'), q);
  assert.match(q, /in a bold display sans-serif, /); assert.match(q, /Colour palette: orange, ink and mint\./); assert.match(q, /with a bold, playful, premium, cinematic feel\./);
  assert.match(q, /clear of the top 14%, bottom 35% and sides 6% of the frame\.$/);
  const f = A.adPrompt({ ...base, style: 'flatlay', provider: 'api-flux2', kit: BUILTIN_KIT });
  assert.match(f, /Background and accents in bright orange \(colour #FF7A1A\), deep charcoal \(colour #14151A\) and teal \(colour #3DDC97\)\./); assert.doesNotMatch(f, /No other|no other/, 'FLUX: no negative wording');
  // empty parts drop out: no words, no brand, no logo
  const bare = A.adPrompt({ style: 'lifestyle', provider: 'api-gpt-image' });
  assert.doesNotMatch(bare, /Text, verbatim|Brand colours|corner|clear of the/); assert.match(bare, /portrait 4:5/, 'default placement: Instagram & Facebook feed');
  // typed words can't break the quotes; long words are cut
  assert.match(A.adPrompt({ style: 'studio', provider: 'api-gpt-image', offer: 'Say "hi"\nnow' }), /the offer "Say 'hi' now"/);
  assert.equal(A.adWords('x'.repeat(80)).length, A.AD_TEXT_MAX);
  // families by provider; unknown → our default wording
  assert.deepEqual(['api-gpt-image', 'api-nano-banana', 'comfy-qwen21', 'api-flux2', 'comfy-flux3-klein', 'api-seedream'].map(A.adFamilyOf), ['gpt-image', 'nano-banana', 'qwen-edit', 'flux', 'flux', 'any']);
  for (const fam of ['gpt-image', 'nano-banana', 'flux', 'qwen-edit', 'any']) for (const task of ['ad', 'ad-text']) {
    const p = PROMPT_PATTERNS.find((x) => x.model === fam && x.task === task); assert.ok(p, `${fam}/${task}`); if (fam !== 'any') assert.ok(p!.sources.length, `${fam}/${task}: source`); }
  ok('prompt: exact per style × family, brand colours / type / mood, safe edges, empty parts dropped, quotes kept clean');
}

// ---- 2. the logo box ----
{
  assert.deepEqual(A.adLogoBox(1080, 1350, 'tl', { w: 512, h: 512 }), { x: 49, y: 49, w: 130, h: 130 }, 'feed: 4.5% margin, 12% of the short side');
  const st = A.placementOf('meta-9x16');
  assert.deepEqual(A.adLogoBox(1080, 1920, 'tl', { w: 1, h: 1 }, st.safe), { x: 65, y: 269, w: 130, h: 130 }, 'story: inside the 14% top / 6% side cover');
  assert.deepEqual(A.adLogoBox(1080, 1920, 'br', { w: 1, h: 1 }, st.safe), { x: 885, y: 1118, w: 130, h: 130 }, 'story: above the 35% bottom cover');
  assert.deepEqual(A.adLogoBox(1080, 1080, 'tr', { w: 800, h: 100 }), { x: 671, y: 49, w: 360, h: 45 }, 'a wide wordmark: at most a third of the width');
  ok('logo box: margin, platform safe zones, wide logos capped');
}

// ---- 3. the tool ----
const { getTool } = await import('../src/tools/registry.ts');
const t: any = getTool('app-ad-pack'); assert.ok(t, 'app-ad-pack is registered');
{ const { IMAGE_DEFAULTS } = await import('../src/shared/imageDefaults.ts'); const { CLOUD_DEFAULTS } = await import('../src/shared/cloudDefaults.ts');
  assert.equal(CLOUD_DEFAULTS['ad-pack'].model, 'api-gpt-image', 'cloud default: GPT Image (best text, user 2026-10-31)'); assert.equal(IMAGE_DEFAULTS['ad-pack'].hosted, 'api-gpt-image'); assert.equal(IMAGE_DEFAULTS['ad-pack'].local, 'comfy-qwen21');
  const ids = t.providers.map((p: any) => p.id ?? p); assert.equal(ids[0], 'api-gpt-image'); assert.ok(ids.includes('api-nano-banana'), 'Nano Banana 2 still selectable'); }
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC', 'base64');
fs.mkdirSync(path.join(D, 'uploads'), { recursive: true }); for (const f of ['p1.png', 'p2.png']) fs.writeFileSync(path.join(D, 'uploads', f), PNG);
const run = (fields: Record<string, string>, files: Record<string, string[]> = { image: ['uploads/p1.png'] }) => t.parseInput({ rights: '1', ...fields }, files);
{
  const r = await run({ provider: 'api-nano-banana', headline: ' Run   lighter ', offer: '20% off', placement: 'tiktok-9x16', logoCorner: 'tr', brandKit: 'imagination' }, { image: ['uploads/p1.png'], product2: ['uploads/p2.png'] });
  assert.ok(!('error' in r), JSON.stringify(r));
  assert.deepEqual(r.shots.map((s: any) => s.id), A.AD_STYLE_DEFAULT, 'nothing picked: the three default styles'); assert.equal(r.n, 3);
  assert.deepEqual(r.shots.map((s: any) => s.label), ['Studio hero', 'In use', 'Offer poster']);
  assert.equal(r.shots[0].prompt, A.adPrompt({ style: 'studio', provider: 'api-nano-banana', headline: 'Run lighter', offer: '20% off', placement: 'tiktok-9x16', corner: 'tr', kit: BUILTIN_KIT, logo: true, extraPhotos: 1 }));
  assert.match(r.shots[0].prompt, /the headline "Run lighter"/, 'spaces collapsed'); assert.match(r.shots[0].prompt, /top-right corner/);
  assert.equal(r.refPaths.length, 2, 'image 1 + another side');
  assert.equal(r.aspect, '9:16', 'the platform shape'); assert.equal(r.brandKitId, 'imagination');
  assert.deepEqual(r.adLogo, { kit: 'imagination', corner: 'tr', placement: 'tiktok-9x16' });
  const one = await run({ provider: 'api-gpt-image', shots: '["flatlay"]' }); assert.equal(one.n, 1); assert.equal(one.adLogo, undefined, 'Brand off: no logo step');
  assert.doesNotMatch(one.shots[0].prompt, /corner/, 'Brand off: no corner kept');
  const e1 = await run({ provider: 'api-gpt-image', offer: 'x'.repeat(41) }); assert.equal(e1.issues?.[0]?.field, 'offer'); assert.equal(e1.issues[0].code, 'too_long');
  const e2 = await run({ provider: 'api-gpt-image', shots: '["neon"]' }); assert.equal(e2.issues?.[0]?.field, 'shots');
  const e3 = await run({ provider: 'api-gpt-image', shots: '[]' }); assert.equal(e3.issues?.[0]?.code, 'required');
  const e4 = await run({ provider: 'api-gpt-image' }, {}); assert.equal(e4.issues?.[0]?.field, 'image');
  ok('tool: one output per style, brand kit and logo step, platform aspect, other sides as refs; long words, unknown / no styles, no photo refused');
}

// ---- 4. the logo really lands in its box ----
{
  const { stampAdLogos } = await import('../src/adPackLogo.ts');
  const src = path.join(D, 'job1-out0.png');
  assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x808080:s=400x500', '-frames:v', '1', src]).status, 0);
  const job: any = { id: 'job1', status: 'done', stage: 'done', progress: 100, input: { adLogo: { kit: 'imagination', corner: 'tl', placement: 'meta-4x5' } }, outputs: [{ label: 'Studio hero', url: '/files/job1-out0.png' }], resultUrl: '/files/job1-out0.png' };
  await stampAdLogos(job);
  assert.equal(job.status, 'done'); assert.equal(job.outputs[0].url, '/files/job1-out0-ad.png'); assert.equal(job.outputs[0].plainUrl, '/files/job1-out0.png'); assert.equal(job.resultUrl, job.outputs[0].url);
  const px = (f: string, x: number, y: number) => spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-vf', `crop=1:1:${x}:${y},format=gray`, '-f', 'rawvideo', '-'], { encoding: 'buffer' }).stdout[0];
  const out = path.join(D, 'job1-out0-ad.png'); const b = A.adLogoBox(400, 500, 'tl', { w: 512, h: 512 });
  assert.notEqual(px(out, b.x + Math.round(b.w / 2), b.y + Math.round(b.h / 2)), 128, 'the logo is in the box');
  assert.equal(px(out, 300, 400), 128, 'the rest of the ad is untouched'); assert.equal(px(src, b.x + 10, b.y + 10), 128, 'the plain ad is kept');
  await stampAdLogos(job); assert.equal(job.outputs[0].url, '/files/job1-out0-ad.png', 'once per job');
  ok('logo: composited into its box by code, the rest untouched, the plain ad kept');
}
