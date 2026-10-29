// Feed cards render only when something they show changed (2026-10-25 UI lag fix): web shared/jobMerge.ts keeps the same job object
// (and list) when a poll changed nothing, and ui/next/feed/feedMemo.ts (FeedCard's React.memo test) tells a changed card from an unchanged one.
// Run: npx tsx test/feed-memo.test.ts   (no server, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
import { createElement as h } from 'react';
import { mergeJob, mergeById } from '../../web/src/shared/jobMerge.ts';
import { feedPropsEqual } from '../../web/src/ui/next/feed/feedMemo.ts';
const ok = (m: string) => console.log('ok ' + m);

// ---- mergeJob / mergeById ----
const j1 = { id: 'a', status: 'running', progress: 40, progressInfo: { stage: 'generating', percent: 40 }, outputs: [] as any[] };
const j2 = { id: 'b', status: 'queued', progress: 0, progressInfo: { stage: 'queued' }, outputs: [] as any[] };
assert.equal(mergeJob(j1, JSON.parse(JSON.stringify(j1))), j1, 'a poll with the same values keeps the object');
const moved = mergeJob(j1, { ...j1, progress: 41, progressInfo: { stage: 'generating', percent: 41 } });
assert.notEqual(moved, j1); assert.equal(moved.progress, 41); assert.equal(moved.progressInfo.percent, 41);
assert.equal(mergeJob({ ...j1, spend: { usd: 1 } } as any, { progress: 40 } as any).spend.usd, 1, 'fields the poll lacks stay');
const list = [j1, j2];
assert.equal(mergeById(list, [JSON.parse(JSON.stringify(j1)), JSON.parse(JSON.stringify(j2))]), list, 'nothing changed → the same list (no re-render)');
const l2 = mergeById(list, [{ ...j2, status: 'running' }]); assert.notEqual(l2, list); assert.equal(l2[0], j1, 'the unchanged job keeps its object'); assert.equal(l2[1].status, 'running');
assert.equal(mergeById(list, [{ ...j1, status: 'running', progress: 99 }], (id) => id === 'a'), list, 'skip (a cancel in flight) leaves it');
assert.equal(mergeById(list, [{ id: 'zz', status: 'done' } as any]), list, 'a job not in the list changes nothing');
ok('mergeJob / mergeById: same object and list when a poll changed nothing; only the changed job is new');

// ---- feedPropsEqual (FeedCard memo) ----
const job = { id: 'a', status: 'done' };
const props = (over: Record<string, unknown> = {}) => ({ job, k: 0, of: 1, ar: 1.5, active: false, on: false, selecting: false, testId: 'ic-tile-a', tag: 'Edit',
  run: h('span', { className: 'gt', job }), media: h('img', { src: '/x.png', alt: '', onLoad: () => 0 }), caption: h('span', { parts: ['Model', '$0.04'] }),
  children: [false, h('span', { className: 'ic-tile-cap' }, 'Front')], onOpen: () => 0, onTogglePick: () => 0, ...over });
assert.ok(feedPropsEqual(props(), props()), 'rebuilt JSX and new callbacks with the same values → skip the render');
assert.ok(!feedPropsEqual(props(), props({ job: { ...job } })), 'a new job object → render');
assert.ok(!feedPropsEqual(props(), props({ on: true })), 'open in the viewer → render');
assert.ok(!feedPropsEqual(props(), props({ ar: 1.2 })), 'a new shape → render');
assert.ok(!feedPropsEqual(props(), props({ media: h('img', { src: '/y.png', alt: '', onLoad: () => 0 }) })), 'new media → render');
assert.ok(!feedPropsEqual(props(), props({ caption: h('span', { parts: ['Model', '$0.05'] }) })), 'a new price in the caption → render');
assert.ok(!feedPropsEqual(props(), props({ children: [false, h('span', { className: 'ic-tile-cap' }, 'Back')] })), 'new child text → render');
assert.ok(!feedPropsEqual(props(), props({ run: h('b', { className: 'gt', job }) })), 'another element type → render');
assert.ok(!feedPropsEqual(props(), props({ picked: true })), 'a prop added → render');
ok('feedPropsEqual: skips a card whose job, values and media are unchanged; renders on any shown change');

// ---- wiring ----
const WEB = path.resolve(import.meta.dirname, '../../web/src'); const src = (f: string) => fs.readFileSync(path.join(WEB, f), 'utf8');
assert.match(src('ui/next/feed/FeedCard.tsx'), /export default memo\(FeedCard, feedPropsEqual\)/, 'FeedCard is memoised with feedPropsEqual');
const uj = src('shared/useJobs.ts'); assert.match(uj, /getJobs\(ids\)/, 'useJobs polls with one request'); assert.doesNotMatch(uj, /ids\.map\(id => getJob\(/, 'no per-job poll left');
assert.match(src('shared/gentile.css'), /@keyframes gt-drift\{from\{transform:/, 'the tile colour drifts with transform (compositor), not background-position');
ok('wiring: memoised FeedCard, one batched poll in useJobs, transform drift on the generating tile');
console.log('ALL OK feed-memo');
