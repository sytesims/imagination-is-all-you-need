// Recreate replaces, never appends (2026-10-26 bug: Motion Control Recreate showed the LAST job's two people as Image 1–2, the job's own as 3–4, and
// dimmed duplicates as 5–6). web/src/shared/prefillDelivery.ts: which handler gets which file (each slot once), the slot reducer, the one-at-a-time gate.
// Run: npx tsx test/recreate-replace.test.ts   (pure, no server)
import assert from 'node:assert/strict';
const { planJobFiles, slotsReducer, prefillGate } = await import('../../web/src/shared/prefillDelivery.ts');
type S = Record<string, string[]>;
const all = { onVideo: 1, onImage: 1, onRefs: 1, onFiles: 1 };
/** What a page ends with after a Recreate: reset, then each delivery put into its slot (the Video bar's mapping: video → video, refs → refs, files → by name). */
const recreate = (start: S, h: Record<string, unknown>, ex: { video?: string; image?: string; refs?: string[] }, fl: S) => {
  const plan = planJobFiles(h, ex, fl); let s = slotsReducer<string>(start, { kind: 'reset' });
  for (const d of plan) s = slotsReducer(s, { kind: 'put', slot: d.slot, files: d.urls }); return { s, plan };
};

// 1. multi-file ordered (Motion Control, Kling 3.0 Omni Edit: video + 2 characters), over a bar that still holds another job's two people
{ const before: S = { video: ['/files/a420-video0.mp4'], refs: ['/files/a420-refs1.png', '/files/a420-refs2.png'] };
  const ex = { video: '/files/873b-video0.mp4', refs: ['/files/873b-refs1.png', '/files/873b-refs2.png'] };
  const { s, plan } = recreate(before, all, ex, { video: [ex.video], refs: ex.refs });
  assert.deepEqual(s.refs, ex.refs, 'exactly the job refs, same order (Image 1 = refs1)'); assert.deepEqual(s.video, [ex.video]);
  assert.equal(plan.filter(d => d.slot === 'refs').length, 1, 'refs delivered once (not onRefs + onFiles)');
  assert.equal(plan.flatMap(d => d.urls).filter(u => /refs/.test(u)).length, 2, 'no duplicate refs');
  console.log('ok multi-file ordered: replace, not append; refs once'); }

// 2. the old behaviour, for contrast: appending (a hand-off) keeps what was there (up to the model's most)
{ const s = slotsReducer<string>({ refs: ['a', 'b'] }, { kind: 'add', slot: 'refs', files: ['c', 'd', 'e'], max: 4 }); assert.deepEqual(s.refs, ['a', 'b', 'c', 'd'], 'a hand-off adds up to the max');
  console.log('ok hand-off still adds'); }

// 3. single file (Upscale / Extend: one clip) replaces the last clip, and a job with fewer slots empties the others
{ const { s } = recreate({ video: ['/files/old.mp4'], refs: ['/files/old-style.png'] }, all, { video: '/files/new.mp4' }, { video: ['/files/new.mp4'] });
  assert.deepEqual(s, { video: ['/files/new.mp4'] }, 'old style images gone too'); console.log('ok single file'); }

// 4. audio (Lip Sync: portrait + speech) through onFiles by slot name
{ const ex = { image: '/files/p.png' }; const fl = { image: ['/files/p.png'], speech: ['/files/s.wav'] };
  const { s, plan } = recreate({ image: ['/files/oldp.png'], speech: ['/files/olds.wav'] }, all, ex, fl);
  assert.deepEqual(s.speech, ['/files/s.wav']); assert.deepEqual(s.image, ['/files/p.png']);
  assert.deepEqual(plan.map(d => `${d.to}:${d.slot}`), ['image:image', 'files:image', 'files:speech'], 'image via onImage; onFiles gets every slot (the page picks)');
  console.log('ok audio'); }

// 5. start / end frames (Create Video, Transitions)
{ const fl = { image: ['/files/start.png'], lastFrame: ['/files/end.png'] };
  const { s } = recreate({ image: ['/files/x.png'], lastFrame: ['/files/y.png'], refs: ['/files/z.png'] }, all, { image: '/files/start.png' }, fl);
  assert.deepEqual(s, { image: ['/files/start.png'], lastFrame: ['/files/end.png'] }); console.log('ok start/end frames'); }

// 6. a reference is never promoted to the start image when the page has its own refs slot; pages without onRefs get refs via onFiles once
{ assert.deepEqual(planJobFiles({ onImage: 1, onRefs: 1 }, { refs: ['/r1'] }, {}).map(d => d.to), ['refs']);
  assert.deepEqual(planJobFiles({ onVideo: 1, onFiles: 1 }, { refs: ['/r1', '/r2'] }, { refs: ['/r1', '/r2'] }), [{ to: 'files', slot: 'refs', urls: ['/r1', '/r2'] }]);
  assert.deepEqual(planJobFiles({ onImage: 1 }, { refs: ['/r1'] }, {}), [{ to: 'image', slot: 'image', urls: ['/r1'] }], 'a one-photo page (no refs slot) takes the first ref');
  console.log('ok refs routing'); }

// 7. Recreate → Recreate (two different jobs): the second leaves only its own inputs; and a late file of the first is dropped by the gate
{ const A = { video: '/files/A.mp4', refs: ['/files/A1.png', '/files/A2.png'] }, B = { video: '/files/B.mp4', refs: ['/files/B1.png', '/files/B2.png', '/files/B3.png'] };
  let s = recreate({}, all, A, { video: [A.video], refs: A.refs }).s; s = recreate(s, all, B, { video: [B.video], refs: B.refs }).s;
  assert.deepEqual(s, { video: [B.video], refs: B.refs });
  const g = prefillGate(); const liveA = g.begin(); const liveB = g.begin(); assert.equal(liveA(), false, 'first Recreate is stale'); assert.equal(liveB(), true);
  // the stale one's deliveries are skipped: simulate A's refs arriving after B started
  let t: S = slotsReducer<string>({}, { kind: 'reset' }); if (liveA()) t = slotsReducer(t, { kind: 'put', slot: 'refs', files: A.refs }); t = slotsReducer(t, { kind: 'put', slot: 'refs', files: B.refs });
  assert.deepEqual(t.refs, B.refs); console.log('ok Recreate → Recreate'); }

// 8. no double apply: the same Recreate applied twice ends the same as once (idempotent)
{ const ex = { video: '/v.mp4', refs: ['/1.png', '/2.png'] }; const fl = { video: ['/v.mp4'], refs: ex.refs };
  const once = recreate({}, all, ex, fl).s; const twice = recreate(once, all, ex, fl).s; assert.deepEqual(twice, once); assert.equal(twice.refs.length, 2); console.log('ok no double apply'); }
