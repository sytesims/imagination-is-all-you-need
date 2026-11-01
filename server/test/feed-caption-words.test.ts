// Feed tile captions and place words (app audit 2026-11-01): a hosted result never reads "Free" (the built-in examples were captioned "Free"
// although they ran on Comfy Cloud), an example shows its own title and the price it really cost, and the web's place words come from the
// one shared table (server/src/shared/modelIds.ts), so a run on your own deployment reads "Your Comfy deployment", never "Comfy Cloud".
// Run: npx tsx test/feed-caption-words.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import fs from 'node:fs'; import path from 'node:path';
import { captionPrice, captionTitle, examplePrice } from '../../web/src/shared/feedCaptionText.ts';
import { placeLine } from '../../web/src/shared/runStageLogic.ts';
import { placeWord } from '../../web/src/canvas/cardLook.ts';
import { RUN_ON_LABEL } from '../../web/src/shared/models.ts';
import { RUN_ON_LABELS, PLACE_LABELS, COMFY_DEPLOY_DETAIL, placeOf } from '../src/shared/modelIds.ts';
const ok = (m: string) => console.log('ok ' + m);
const job = (x: any) => ({ id: 'j', toolId: 'h3-video', status: 'done', ...x }) as any;

// 1. "Free" only for a run on your computer (or a free generation); never for a hosted result, whatever its stored cost.
for (const own of [true, false, null]) {
  for (const runOn of ['comfy-cloud', 'fal', 'replicate', 'openai', 'direct', undefined]) for (const cost of [0, null, undefined]) {
    const t = captionPrice(job({ runOn, cost, place: { label: 'Comfy Cloud' } }), own); assert.ok(!/\bFree\b/.test(t), `${runOn} cost ${cost} own ${own}: "${t}"`);
    const f = captionPrice(job({ runOn, cost, status: 'failed' }), own); assert.ok(!/\bFree\b/.test(f), `failed ${runOn}: "${f}"`);
  }
  assert.equal(captionPrice(job({ runOn: 'local', cost: 0 }), own), 'Free');
}
assert.equal(captionPrice(job({ runOn: 'comfy-cloud', cost: 0, free: true }), true), 'Free', 'a free generation (the free lane) still says Free');
assert.equal(captionPrice(job({ runOn: 'comfy-cloud', cost: 172 }), true), '≈ $1.72', 'a paid run keeps its price');
ok('captions: "Free" only on your computer or a free generation');

// 2. The built-in examples: where they ran and their real price (shared/featured.ts costUsd), never "Free" off your computer.
const ex = (e: any, place = 'Comfy Cloud') => captionPrice(job({ runOn: 'comfy-cloud', cost: 0, place: { label: place }, example: { title: 'A drawing comes alive', ...e } }), true);
assert.equal(ex({ runOn: 'comfy-cloud', costUsd: 1.716 }), 'Comfy Cloud · $1.72');
assert.equal(ex({ runOn: 'comfy-cloud', costUsd: 0.3, costEstimated: true }), 'Comfy Cloud · ≈ $0.30');
assert.equal(ex({ runOn: 'comfy-cloud', costUsd: null }), 'Comfy Cloud', 'unknown price: the place only, no made-up price');
assert.equal(ex({ runOn: 'comfy-cloud', costUsd: 0 }), 'Comfy Cloud');
assert.equal(captionPrice(job({ runOn: 'local', cost: 0, example: { runOn: 'local', costUsd: 0 } }), true), 'Your computer · Free');
assert.equal(examplePrice({ runOn: 'comfy-cloud', costUsd: 1.01 }, ''), 'Comfy Cloud · $1.01');
ok('examples: place and real price, never Free off your computer');

// 3. Titles, not prompts: the example's title, else yours, else the prompt.
assert.equal(captionTitle(job({ example: { title: 'Kaito Vey, anime character sheet' }, input: { prompt: 'Use the provided start image as the first frame…' } })), 'Kaito Vey, anime character sheet');
assert.equal(captionTitle(job({ title: 'My fox', input: { prompt: 'a fox' } })), 'My fox');
assert.equal(captionTitle(job({ input: { prompt: '  a red\n fox ' } })), 'a red fox');
assert.equal(captionTitle(job({ input: {} })), '');
ok('caption titles: example title, then yours, then the prompt');

// 4. One set of place words: the web's tables are the server's, and a deployment run says so.
assert.equal(RUN_ON_LABEL, RUN_ON_LABELS, 'web RUN_ON_LABEL is the server table itself, not a copy');
assert.ok(!Object.values(RUN_ON_LABELS).includes('Direct API'), 'no "Direct API"');
assert.equal(PLACE_LABELS['comfy-deploy'], COMFY_DEPLOY_DETAIL);
assert.equal(placeOf({ routeId: 'comfy-deploy:cloud-h3-crossview' })?.label, 'Your Comfy deployment');
assert.equal(placeOf({ routeId: 'direct:openai/gpt-image-2' })?.label, 'OpenAI', 'a lab API names the lab');
const dep = { route: 'comfy-deploy:cloud-h3-crossview', runOn: 'comfy-cloud', place: { label: 'Your Comfy deployment', billing: 'gpu-time' } };
assert.equal(placeLine(dep), 'On your Comfy deployment', 'RunStage: a deployment run never reads "On Comfy Cloud"');
assert.equal(placeLine({ route: 'comfy-deploy:cloud-h3-crossview', runOn: 'comfy-cloud' }), 'On your Comfy deployment', 'from the route alone too');
assert.equal(placeLine({ route: 'comfy-cloud:x', runOn: 'comfy-cloud' }), 'On Comfy Cloud');
assert.equal(placeWord({ runOn: 'comfy-cloud', routeId: 'comfy-deploy:cloud-h3-crossview' }), 'Your Comfy deployment');
assert.equal(placeWord({ runOn: 'local' }), 'Your computer'); assert.equal(placeWord({ runOn: 'fal' }), 'fal');
const WEB = path.resolve(import.meta.dirname, '../../web/src'); const src = (f: string) => fs.readFileSync(path.join(WEB, f), 'utf8');
for (const f of ['shared/models.ts', 'shared/runStageLogic.ts', 'canvas/cardLook.ts', 'shared/ResultView.tsx'])
  assert.ok(!/'comfy-router': 'Comfy Cloud'|direct: '(Direct API|the provider)'/.test(src(f)), `${f}: no local copy of the place table`);
ok('place words: one shared table; deployment runs read "Your Comfy deployment"');
