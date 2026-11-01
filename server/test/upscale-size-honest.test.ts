// Video Upscale makes the size it quotes (audit U-07), and a quote that can't run never says "Free on your computer" (P2-18). No server, no keys.
import assert from 'node:assert/strict'; import fs from 'node:fs';
import { vupSizing, vupFactor, vupBlock, vupOutputSize, VUP_MAX_FACTOR } from '../src/shared/videoUpscale.ts';
import { honestBreakdown, priceOf, FREE_LOCAL_LINE } from '../src/shared/pricing.ts';
import { adjustNotesFor } from '../src/routing/select.ts';
import { getTool } from '../src/tools/registry.ts';
import { routesFor } from '../src/routing/routes.ts';

const job = (p: string, w: number, h: number, maxOutput: string) => vupSizing(p, { duration: 5, types: ['precise'], scale: 2 /* the parser's default factor: no longer caps the size */ }, { maxOutput, width: w, height: h });

// U-07: Crystal, 4K on a 720p clip → asks for 3× and makes 3840×2160 (was 2× → 2560×1440 while the quote said 2160p)
{ const j = job('router-crystal-video', 1280, 720, '4k');
  assert.deepEqual(j.outputSize, { width: 3840, height: 2160 }); assert.equal(j.resolution, '2160p'); assert.equal(vupFactor(j), 3, 'the Router body sends scale_factor 3');
  assert.equal(j.adjustNote, undefined); assert.equal(vupBlock('router-crystal-video', j), null);
  const q = job('router-crystal-video', 1280, 720, '1440p'); assert.deepEqual(q.outputSize, { width: 2560, height: 1440 }); assert.equal(vupFactor(q), 2);
  assert.notDeepEqual(j.outputSize, q.outputSize, '1440p and 4K are different jobs (and prices)');
  const portrait = job('router-crystal-video', 720, 1280, '4k'); assert.deepEqual(portrait.outputSize, { width: 2160, height: 3840 }); }
// FLUX Video Upscale reaches 4K from 720p (3×), but not from 480p: it says what it makes and the job's resolution is that size
{ assert.deepEqual(job('direct-flux3-upscale', 1280, 720, '4k').outputSize, { width: 3840, height: 2160 });
  const j = job('direct-flux3-upscale', 854, 480, '4k');
  assert.deepEqual(j.outputSize, { width: 2562, height: 1440 }); assert.equal(j.resolution, '1440p', 'quality = the size made, not 2160p'); assert.equal(vupFactor(j), VUP_MAX_FACTOR['direct-flux3-upscale']);
  assert.equal(j.adjustNote, 'FLUX Video Upscale enlarges 3× at most, so it makes 2562×1440 (1440p), not 4K.');
  const t: any = getTool('upscale'); const r = routesFor('direct-flux3-upscale', t).find((x) => x.routeId === 'comfy-router:direct-flux3-upscale')!;
  assert.ok(adjustNotesFor(t, r, j).includes(j.adjustNote), 'the note reaches the quote and the job'); }
// a size within reach keeps the old results (1024×576 → 1080p = 1.88×; capped at the target)
assert.deepEqual(job('direct-flux3-upscale', 1024, 576, '1080p').outputSize, { width: 1920, height: 1080 });
assert.equal(vupOutputSize('router-crystal-video', 1280, 720, '4k').reached, true); assert.equal(vupOutputSize('direct-flux3-upscale', 854, 480, '4k').reached, false);
assert.equal(vupOutputSize('direct-flux3-upscale', 1280, 720, '4k', 2).width, 2560, 'an explicit factor still caps it');

// P2-18: a quote that can't run gets its reason as the breakdown line; a runnable free one keeps "Free on your computer"
{ const free = priceOf({ quality: '720p' } as any); assert.equal(free.breakdown[0].label, FREE_LOCAL_LINE);
  const blocked = honestBreakdown({ runnable: false, breakdown: free.breakdown, priceLine: 'Needs a Comfy key. Price once it’s added: ≈ $0.42.' });
  assert.deepEqual(blocked.breakdown, [{ label: 'Needs a Comfy key. Price once it’s added: ≈ $0.42.', factor: 0 }]);
  assert.equal(honestBreakdown({ runnable: false, breakdown: free.breakdown, blockedReason: 'Download the model first.', priceLine: 'Free' }).breakdown[0].label, 'Download the model first.');
  assert.equal(honestBreakdown({ runnable: false, breakdown: free.breakdown }).breakdown[0].label, 'Can’t run here yet');
  const ok = { runnable: true, breakdown: free.breakdown }; assert.equal(honestBreakdown(ok), ok, 'runnable: unchanged');
  const priced = { runnable: false, breakdown: [{ label: 'Comfy Router · $0.42', factor: 1 }] }; assert.equal(honestBreakdown(priced), priced, 'a real price line stays');
  const http = fs.readFileSync(new URL('../src/routing/http.ts', import.meta.url), 'utf8');
  assert.equal((http.match(/return honestBreakdown\(blockCam\(/g) ?? []).length, 2, 'both quote exits (can run / can’t run) go through it');
  assert.doesNotMatch(http, /return blockCam\(/); }
console.log('upscale-size-honest: ok');
process.exit(0);
