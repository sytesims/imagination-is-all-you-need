// The shared in-progress screen's rules (web shared/runStageLogic.ts, 2026-10-25): step mapping for local ComfyUI and hosted runs, the
// friendly time words (never raw seconds), and the honest cost + cancel sentence (no "can't cancel… credits go back" on a free local run).
// Run: npx tsx test/run-stage-logic.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { runStepsOf, timeLeftText, runTimeOf, runTimeLine, runMoneyOf, placeLine, settingChips, aspectOf, makeRealInputs, mediumOf, shortDuration } from '../../web/src/shared/runStageLogic.ts';
const ok = (m: string) => console.log('ok ' + m);

// The real Render job that started this (88 %, 2 of 3 steps of the 3rd sampler, local ComfyUI).
const mir = { id: 'x', toolId: 'make-it-real', status: 'running', stage: 'generating', route: 'local:comfy-ltx25-layout', runOn: 'local', cancellable: true, cost: 0, percent: 88,
  steps: { value: 2, max: 3, sampler: 3, samplers: 3 }, progressInfo: { stage: 'generating', source: 'local-comfy', step: 2, steps: 3, percent: 88, etaSeconds: 323 }, eta: 323, calibrating: false,
  etaRange: { seconds: 1282, low: 897, high: 1667, source: 'learned' }, startedAt: Date.UTC(2026, 9, 25, 21, 26), renderStartedAt: Date.UTC(2026, 9, 25, 21, 26), spend: { billedTo: 'local', estUsd: 0 },
  input: { outKind: 'video', prompt: 'p', seed: 42, duration: 5, resolution: '448p', aspect: '16:9', width: 768, height: 448, fps: 24, makeReal: { planUrl: '/files/plan.mp4', firstFrameUrl: '/files/first.png' } } };

// ---- steps ----
{
  const s = runStepsOf(mir);
  assert.deepEqual(s.steps.map(x => x.key), ['load', 'pass1', 'pass2', 'pass3', 'decode', 'save']);
  assert.equal(s.steps[3].label, 'Rendering · pass 3 of 3'); assert.equal(s.cur, 3, 'third sampler is the current step'); assert.ok(Math.abs((s.fill ?? 0) - 2 / 3) < 1e-9);
  assert.equal(s.local, true);
  const two = runStepsOf({ ...mir, steps: { value: 1, max: 4, sampler: 1, samplers: 2 }, progressInfo: { ...mir.progressInfo, step: 1, steps: 4 } });
  assert.deepEqual(two.steps.map(x => x.label).slice(1, 3), ['Rendering · draft pass', 'Rendering · detail pass']); assert.equal(two.cur, 1);
  const one = runStepsOf({ ...mir, steps: null, progressInfo: { stage: 'generating', source: 'local-comfy', step: 5, steps: 20 } });
  assert.deepEqual(one.steps.map(x => x.label), ['Loading the model', 'Rendering', 'Decoding the frames', 'Saving the video']); assert.equal(one.cur, 1); assert.equal(one.fill, 0.25);
  assert.equal(runStepsOf({ ...mir, progressInfo: { stage: 'loading', source: 'local-comfy' } }).cur, 0);
  const dl = runStepsOf({ ...mir, stage: 'downloading_model', stageDetail: { stage: 'downloading_model', bytesDone: 5e9, bytesTotal: 2e10 }, progressInfo: { stage: 'loading', source: 'local-comfy' } });
  assert.equal(dl.steps[0].label, 'Downloading the model'); assert.equal(dl.cur, 0); assert.equal(dl.fill, 0.25);
  assert.equal(runStepsOf({ ...mir, progressInfo: { stage: 'finishing', source: 'local-comfy' } }).steps[runStepsOf({ ...mir, progressInfo: { stage: 'finishing', source: 'local-comfy' } }).cur].key, 'decode');
  assert.equal(runStepsOf({ ...mir, stage: 'muxing', progressInfo: { stage: 'finishing', source: 'local-comfy' } }).cur, 5, 'muxing = saving');
  assert.equal(runStepsOf({ ...mir, status: 'queued', progressInfo: { stage: 'queued', queuePosition: 2 } }).cur, -1, 'queued: nothing started');
  assert.equal(runStepsOf({ ...mir, status: 'done', progressInfo: { stage: 'done' } }).cur, 6, 'done: all steps done');
  ok('local steps: load → one step per sampler pass (draft/detail for two) → decode → save; download first when it downloads; current from sampler / stage');
  const cloud = { id: 'c', toolId: 'create-image', status: 'running', route: 'fal:fal-ai/nano-banana-2', runOn: 'fal', progressInfo: { stage: 'generating', percent: 40, source: 'fal' }, input: { prompt: 'k' } };
  const cs = runStepsOf(cloud, { placeLabel: 'fal' });
  assert.deepEqual(cs.steps.map(x => x.label), ['Sending to fal', 'Making the image', 'Bringing the image back']); assert.equal(cs.cur, 1); assert.equal(cs.fill, 0.4); assert.equal(cs.local, false);
  assert.equal(runStepsOf({ ...cloud, status: 'queued', progressInfo: { stage: 'queued' } }).cur, -1, 'waiting in our queue: nothing sent');
  assert.equal(runStepsOf({ ...cloud, progressInfo: { stage: 'generating', source: 'fal' } }).fill, null, 'no percent: indeterminate');
  ok('hosted steps: Sending to <place> → Making → Bringing it back; percent only when the place reports one');
}

// ---- friendly time ----
{
  assert.equal(timeLeftText(323), 'About 5 min left'); assert.equal(timeLeftText(30), 'Almost done'); assert.equal(timeLeftText(70), 'About 1 min left');
  assert.equal(timeLeftText(4800), 'About 1 h 20 min left'); assert.equal(timeLeftText(3600), 'About 1 h left'); assert.equal(timeLeftText(0), ''); assert.equal(timeLeftText(null), ''); assert.equal(timeLeftText(NaN), '');
  const t = runTimeOf(mir, mir.startedAt + 60_000, 'en-US');
  assert.equal(t.left, 'About 5 min left'); assert.match(t.started, /^\d{1,2}:\d{2}\s?(AM|PM)$/); assert.equal(runTimeLine(t), `About 5 min left · started ${t.started}`); assert.ok(!/\d+s\b/.test(runTimeLine(t)), 'no raw seconds');
  const first = runTimeOf({ ...mir, eta: 0, calibrating: true, etaRange: null, progressInfo: { stage: 'loading', source: 'local-comfy' } });
  assert.equal(first.note, 'First run on this computer: timing it'); assert.equal(first.left, '');
  const late = runTimeOf({ ...mir, eta: 0, progressInfo: { stage: 'generating', source: 'local-comfy' } }, mir.startedAt + 2000 * 1000);
  assert.equal(late.slow, true); assert.equal(late.note, 'Taking longer than usual');
  assert.deepEqual(runTimeOf({ ...mir, status: 'queued', progressInfo: { stage: 'queued' } }), { left: '', started: '', note: '', slow: false });
  assert.equal(shortDuration(12_000), '12 s'); assert.equal(shortDuration(240_000), '4 min'); assert.equal(shortDuration(3_900_000), '1 h 5 min'); assert.equal(shortDuration(0), '');
  ok('time: "About 5 min left · started 9:26 PM", first run is timed, long runs say so, queued shows none; never raw seconds');
}

// ---- cost + cancel ----
{
  const own = { own: true, where: 'on your computer' } as const;
  const local = runMoneyOf(mir, own);
  assert.equal(local.price, 'Free · on your computer'); assert.equal(local.canCancel, true); assert.equal(local.note, 'Runs on your computer, so stopping costs nothing.');
  assert.ok(!/credits/.test(local.note), 'no credits sentence on a free local run');
  const localStuck = runMoneyOf({ ...mir, cancellable: false }, own); assert.equal(localStuck.canCancel, false); assert.match(localStuck.note, /free, so nothing is charged/i);
  const paidQueued = { id: 'p', toolId: 'create-image', status: 'queued', route: 'comfy-router:x', runOn: 'comfy-router', cancellable: true, cost: 42, spend: { billedTo: 'comfy', estUsd: 0.42 } };
  const q = runMoneyOf(paidQueued, own); assert.equal(q.price, '≈ $0.42 · Comfy Cloud'); assert.equal(q.canCancel, true); assert.equal(q.note, 'Not sent to Comfy Cloud yet: cancel and nothing is charged.');
  const team = runMoneyOf(paidQueued, { own: false }); assert.equal(team.price, '$0.42 · Comfy Cloud'); assert.equal(team.note, 'Cancel and the $0.42 goes back to your balance.');
  const sent = { ...paidQueued, status: 'running', cancellable: false };
  const s1 = runMoneyOf(sent, { own: true, failureRule: 'not-charged' }); assert.equal(s1.canCancel, false); assert.equal(s1.note, 'Already with Comfy Cloud, so it can’t be stopped now. If it fails, Comfy Cloud doesn’t charge.');
  const s2 = runMoneyOf(sent, { own: true, failureRule: 'may-charge' }); assert.match(s2.note, /If it fails, Comfy Cloud may still charge\.$/);
  const s3 = runMoneyOf(sent, { own: false }); assert.match(s3.note, /If it fails, it goes back to your balance\.$/);
  const s4 = runMoneyOf({ ...sent, cost: 0, spend: { billedTo: 'fal', estUsd: 0.04 }, runOn: 'fal' }, { own: false }); assert.ok(!/back to your balance/.test(s4.note), 'nothing held, no money-back promise');
  assert.equal(runMoneyOf({ ...sent, cancellable: undefined, status: 'queued' }, own).canCancel, true, 'older server: queued = cancellable');
  assert.equal(runMoneyOf({ ...sent, cancellable: undefined }, own).canCancel, false, 'older server: running = not');
  assert.equal(runMoneyOf({ ...mir, status: 'done' }, own).canCancel, false);
  const sample = runMoneyOf({ ...sent, isSample: true }, own); assert.equal(sample.price, 'Sample · nothing is charged');
  ok('money: free local says so and Stop works; paid shows ≈ $ · place; cancel only when the server says it works, with the one matching sentence');
}

// ---- place, settings, shape, inputs ----
{
  assert.equal(placeLine(mir), 'On your computer'); assert.equal(placeLine(mir, 'on your computer'), 'On your computer');
  assert.equal(placeLine({ route: 'comfy-cloud:x', runOn: 'comfy-cloud' }), 'On Comfy Cloud'); assert.equal(placeLine({ route: 'fal:x', runOn: 'fal' }), 'On fal');
  assert.deepEqual(settingChips(mir), ['448p', '16:9', '5 s', '24 fps', 'Seed 42']);
  assert.deepEqual(settingChips({ toolId: 'create-image', input: { aspect: '1:1', duration: 1, seed: 7 } }), ['1:1', 'Seed 7'], 'images have no length');
  assert.ok(Math.abs(aspectOf(mir, 'video') - 768 / 448) < 1e-9); assert.equal(aspectOf({ input: { aspect: '4:3' } }, 'image'), 4 / 3); assert.equal(aspectOf({}, 'video'), 16 / 9); assert.equal(aspectOf({}, 'image'), 1);
  assert.deepEqual(makeRealInputs(mir), [{ url: '/files/plan.mp4', kind: 'video', label: 'Mockup' }, { url: '/files/first.png', kind: 'image', label: 'First frame' }]);
  assert.deepEqual(makeRealInputs({ input: { makeReal: { planUrl: 'https://evil/x.png' } } }), [], 'only our own files');
  assert.equal(mediumOf(mir), 'video'); assert.equal(mediumOf({ toolId: 'audio' }), 'audio'); assert.equal(mediumOf({ toolId: 'create-image' }), 'image'); assert.equal(mediumOf({ toolId: 'x' }, 'audio'), 'audio');
  ok('place words, settings chips, preview shape and Render inputs');
}
