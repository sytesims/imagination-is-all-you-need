// Canvas nodes: the shared node registry, port-linking rules, the actual tldraw arrow binding linkShapes writes, group
// membership, and the two-press Run all (a first press only prices; a run list comes back only on a fresh second press).
// Run: npx tsx test/canvas-nodes.test.ts   (no server, no network, no browser)
import assert from 'node:assert/strict';
import { NODE_DEFS, NODE_KINDS, NODE_TYPES, GEN_TYPE, RESULT_TYPE, PROMPT_TYPE, UPLOAD_TYPE, NOTE_TYPE, COMPARE_TYPE, GROUP_TYPE, AD_TYPE, nodeDefOf, adCardFit, adCardHeight } from '../../web/src/canvas/nodeTypes.ts';
import { canConnectTo, pickPortTarget, groupGenIds } from '../../web/src/canvas/nodeLogic.ts';
import { linkShapes, inputOfShape, withInputs } from '../../web/src/canvas/graph.ts';
import { boardOf } from '../../web/src/canvas/boardApiTldraw.ts';
import { addVersions, MAX_VERSIONS } from '../../web/src/canvas/cardModel.ts';
import { runOrder, settleProposal, type ProposalCard } from '../../web/src/canvas/nodeLogic.ts';
import { outKindOf, genIns, canFeed, legalTargets, pickTypedTarget, takesLine, type PortInfo } from '../../web/src/canvas/nodeLogic.ts';
const ok = (m: string) => console.log('ok ' + m);

// ---- the registry: every node kind, one unique tldraw type, honest ports and sizes ----
assert.equal(NODE_KINDS.length, 8); assert.equal(new Set(NODE_TYPES).size, 8);
assert.deepEqual(NODE_TYPES, [GEN_TYPE, RESULT_TYPE, PROMPT_TYPE, UPLOAD_TYPE, NOTE_TYPE, COMPARE_TYPE, GROUP_TYPE, AD_TYPE]);
for (const k of NODE_KINDS) { const d = NODE_DEFS[k]; assert.equal(nodeDefOf(d.type), d); assert.ok(d.minW <= d.defaultW && d.defaultW <= d.maxW); assert.ok(d.minH <= d.defaultH && d.defaultH <= d.maxH); }
assert.equal(NODE_DEFS.gen.input, true); assert.equal(NODE_DEFS.gen.output, true);
assert.equal(NODE_DEFS.result.input, false); assert.equal(NODE_DEFS.result.output, true);
assert.equal(NODE_DEFS.prompt.input, false); assert.equal(NODE_DEFS.prompt.output, true);
assert.equal(NODE_DEFS.upload.input, false); assert.equal(NODE_DEFS.upload.output, true);
assert.equal(NODE_DEFS.note.input, false); assert.equal(NODE_DEFS.note.output, true);
assert.equal(NODE_DEFS.compare.input, true); assert.equal(NODE_DEFS.compare.inputMax, 2); assert.equal(NODE_DEFS.compare.output, false);
assert.equal(NODE_DEFS.group.input, false); assert.equal(NODE_DEFS.group.output, false);
assert.equal(NODE_DEFS.ad.input, true); assert.equal(NODE_DEFS.ad.inputMax, 1); assert.equal(NODE_DEFS.ad.output, false);
assert.equal(nodeDefOf('ohf-nope'), null);
ok('registry: 8 kinds, unique types, ports, input max, size limits');

// ---- port linking rules ----
assert.equal(canConnectTo(GEN_TYPE, GEN_TYPE), true, 'a finished generate node feeds another');
assert.equal(canConnectTo(RESULT_TYPE, GEN_TYPE), true, 'a result feeds a generate node');
assert.equal(canConnectTo(UPLOAD_TYPE, GEN_TYPE), true); assert.equal(canConnectTo(UPLOAD_TYPE, COMPARE_TYPE), true);
assert.equal(canConnectTo(PROMPT_TYPE, GEN_TYPE), true, 'a prompt feeds the prompt of a generate node');
assert.equal(canConnectTo(NOTE_TYPE, GEN_TYPE), true, 'a note can feed a prompt too');
assert.equal(canConnectTo(PROMPT_TYPE, COMPARE_TYPE), false, 'text is not a picture');
assert.equal(canConnectTo(GEN_TYPE, NOTE_TYPE), false, 'a note never takes an input');
assert.equal(canConnectTo(GEN_TYPE, GROUP_TYPE), false, 'a group never takes an input');
assert.equal(canConnectTo(COMPARE_TYPE, GEN_TYPE), false, 'compare has no output');
assert.equal(canConnectTo(GEN_TYPE, COMPARE_TYPE, 2), false, 'compare takes exactly two');
assert.equal(canConnectTo(GEN_TYPE, COMPARE_TYPE, 1), true);
assert.equal(canConnectTo(UPLOAD_TYPE, AD_TYPE), true, 'a picture feeds an ad layout'); assert.equal(canConnectTo(RESULT_TYPE, AD_TYPE, 1), false, 'an ad layout takes one picture');
assert.equal(canConnectTo(PROMPT_TYPE, AD_TYPE), false, 'its words are typed on the card'); assert.equal(canConnectTo(AD_TYPE, GEN_TYPE), false, 'an ad layout has no output');
const cands = [{ id: 'shape:a', type: GEN_TYPE }, { id: 'shape:b', type: NOTE_TYPE }, { id: 'shape:c', type: COMPARE_TYPE, inputs: 2 }, { id: 'shape:d', type: COMPARE_TYPE, inputs: 1 }];
assert.deepEqual(pickPortTarget(cands, 'shape:a', GEN_TYPE), { id: 'shape:d', type: COMPARE_TYPE }, 'skips self, a note and a full compare');
assert.equal(pickPortTarget(cands, 'shape:a', PROMPT_TYPE), null, 'a prompt drag cannot land on compare / note');
assert.deepEqual(pickPortTarget([{ id: 'shape:x', type: GEN_TYPE }], 'shape:x', GEN_TYPE), null, 'never connects to itself');
ok('port linking: media / text rules, self and full inputs refused, topmost valid target');

// ---- the actual tldraw arrow linkShapes writes through the board seam (BoardApi over a stub tldraw editor, no browser) ----
const shapes: Record<string, any> = { 'shape:a': { maxX: 100, midY: 50 }, 'shape:b': { minX: 300, midY: 80 } };
const created: any[] = [], bindings: any[] = [];
const editor = {
  getShapePageBounds: (id: string) => shapes[id] ?? null,
  createShape: (s: any) => { created.push(s); return s; },
  createBindings: (b: any[]) => { bindings.push(...b); },
} as any;
const arrowId = linkShapes(boardOf(editor), 'shape:a', 'shape:b');
assert.ok(arrowId && arrowId.startsWith('shape:'));
assert.equal(created.length, 1); assert.equal(created[0].type, 'arrow');
assert.equal(created[0].props.kind, 'arc', 'curved'); assert.ok(created[0].props.bend > 0);
assert.equal(created[0].props.color, 'grey'); assert.equal(created[0].props.size, 's');
assert.equal(created[0].props.arrowheadStart, 'none'); assert.equal(created[0].props.arrowheadEnd, 'arrow');
assert.equal(bindings.length, 2); assert.equal(bindings[0].props.terminal, 'start'); assert.equal(bindings[0].toId, 'shape:a');
assert.equal(bindings[1].props.terminal, 'end'); assert.equal(bindings[1].toId, 'shape:b');
assert.equal(bindings[0].fromId, arrowId); assert.equal(bindings[1].fromId, arrowId);
ok('linkShapes: thin grey arc, one arrowhead, both ends bound (start → end)');
// ---- history through the seam (R1): a job's result is written with history 'ignore', so an Undo never removes it ----
{ const runs: any[] = []; const b = boardOf({ run: (fn: () => void, o?: any) => { runs.push(o); fn(); } } as any);
  b.batch(() => undefined, { history: 'ignore' }); b.batch(() => undefined);
  assert.deepEqual(runs, [{ history: 'ignore' }, undefined], "'ignore' reaches the engine untouched; a plain batch records (one undo step)");
  ok('history: ignore stays ignore through BoardApi'); }

// ---- what the camera frames for an agent's card (2026-10-28): the card and the nodes wired into it, so a source clip stays in view ----
{ const sh: Record<string, any> = { 'shape:src': { id: 'shape:src', index: 'a1' }, 'shape:ext': { id: 'shape:ext', index: 'a2' }, 'shape:arr': { id: 'shape:arr', index: 'a3' }, 'shape:lone': { id: 'shape:lone', index: 'a4' } };
  const board = { getNode: (id: string) => sh[id] ?? null,
    linksInto: (id: string) => (id === 'shape:ext' ? [{ id: 'shape:arr', from: 'shape:src', to: 'shape:ext', meta: {} }] : []) } as any;
  assert.deepEqual(withInputs(board, ['shape:ext']), ['shape:ext', 'shape:src'], 'an Extend card brings its source clip');
  assert.deepEqual(withInputs(board, ['shape:lone', 'shape:gone']), ['shape:lone'], 'no inputs: just the card; a missing id is skipped');
  ok('camera area: a card plus the nodes wired into it'); }

// ---- typed ports (2026-10-27): what a node puts out, what it takes, legal targets, the hint on an illegal drop ----
assert.equal(outKindOf(GEN_TYPE, { medium: 'image', takes: [] }), 'image', 'a draft puts out what it will make');
assert.equal(outKindOf(GEN_TYPE, { medium: 'image', takes: [{ kind: 'image' }, { kind: 'video' }], take: 1 }), 'video', 'the active version decides');
assert.equal(outKindOf(GEN_TYPE, { medium: '3d', takes: [] }), null, '3D feeds nothing');
assert.equal(outKindOf(PROMPT_TYPE, {}), 'text'); assert.equal(outKindOf(NOTE_TYPE, {}), 'text');
assert.equal(outKindOf(RESULT_TYPE, { kind: 'audio' }), 'audio'); assert.equal(outKindOf(UPLOAD_TYPE, { mediaKind: 'video' }), 'video');
assert.equal(outKindOf(COMPARE_TYPE, {}), null); assert.equal(outKindOf(AD_TYPE, {}), null); assert.equal(outKindOf(GROUP_TYPE, {}), null); assert.equal(outKindOf('image', {}), 'image');
const vidIns = genIns([{ accept: 'image', max: 1, label: 'First frame' }, { accept: 'image', max: 1, label: 'Last frame' }], { image: 1 }, false);
assert.deepEqual(vidIns.map((i) => [i.kind, i.room]), [['image', 1], ['text', 99]], 'a video card: one more frame and a prompt');
assert.deepEqual(genIns([], {}, true), [], 'a hidden-prompt card with no slots takes nothing');
const nodes: PortInfo[] = [
  { id: 'src', type: GEN_TYPE, out: 'image', ins: [{ kind: 'image', room: 4 }, { kind: 'text', room: 99 }] },
  { id: 'clip', type: GEN_TYPE, out: 'video', ins: vidIns },
  { id: 'music', type: GEN_TYPE, out: 'audio', ins: [{ kind: 'text', room: 99 }] },
  { id: 'full', type: COMPARE_TYPE, out: null, ins: [{ kind: 'image', room: 0 }, { kind: 'video', room: 0 }] },
  { id: 'note', type: NOTE_TYPE, out: 'text', ins: [] },
];
assert.deepEqual(legalTargets('image', 'src', nodes), ['clip'], 'a picture: only the clip card lights up (not itself, music, a full compare or a note)');
assert.deepEqual(legalTargets('text', 'note', nodes), ['src', 'clip', 'music'], 'text goes into any card with a prompt');
assert.deepEqual(legalTargets('audio', 'music', nodes), [], 'nothing here takes a sound');
assert.equal(canFeed(null, 'x', nodes[1]), false, 'nothing to pass on, no connection');
const overMusic = pickTypedTarget([nodes[2]], 'image', 'src'); assert.equal(overMusic.target, null); assert.equal(overMusic.over?.id, 'music', 'an illegal card under the pointer is reported');
assert.equal(takesLine('Music bed', nodes[2].ins), 'Music bed takes text');
assert.equal(takesLine('Shot 1 · clip', vidIns), 'Shot 1 · clip takes a picture or text');
assert.equal(pickTypedTarget([nodes[1], nodes[2]], 'image', 'src').target?.id, 'clip', 'the topmost legal card wins');
ok('typed ports: out kind from the active version, inputs with room, legal targets only, the "takes …" hint');

// ---- a connection carries the ACTIVE version, also while a newer run is going ----
const two = { id: 'shape:k', type: GEN_TYPE, props: { status: 'done', takes: [{ url: '/files/a.png', poster: '/files/a.png', kind: 'image', jobId: 'j1' }, { url: '/files/b.png', poster: '/files/b.png', kind: 'image', jobId: 'j2' }], take: 1, model: 'M' } } as any;
assert.equal(inputOfShape({} as any, two)?.url, '/files/b.png', 'the picked version flows on');
assert.equal(inputOfShape({} as any, { ...two, props: { ...two.props, take: 0 } })?.url, '/files/a.png', 'pick another, it changes downstream');
assert.equal(inputOfShape({} as any, { ...two, props: { ...two.props, status: 'running' } })?.url, '/files/b.png', 'a re-run keeps feeding the active version');
assert.equal(inputOfShape({} as any, { ...two, props: { ...two.props, take: 9 } })?.url, '/files/b.png', 'an out-of-range pick falls back to the last version');
assert.equal(inputOfShape({} as any, { ...two, props: { ...two.props, status: 'draft', takes: [] } }), null, 'a draft has nothing to pass on yet');
ok('a connection carries the active version');

// ---- the version strip: a new run's versions join the old ones, the first new one is active, nothing is lost below the cap ----
const v = (n: number) => ({ url: `/files/v${n}.png`, poster: '', kind: 'image' as const, jobId: `j${n}`, out: 0 });
assert.deepEqual(addVersions([], [v(1)]), { takes: [v(1)], take: 0 }, 'first run: one version, active');
const r2 = addVersions([v(1)], [v(2), v(3)]); assert.deepEqual(r2.takes.map((t) => t.url), ['/files/v1.png', '/files/v2.png', '/files/v3.png']); assert.equal(r2.take, 1, 'the first new version is active');
assert.deepEqual(addVersions(r2.takes, [v(2)]), { takes: r2.takes, take: 1 }, 'the same output twice is not a new version');
const many = addVersions(Array.from({ length: MAX_VERSIONS }, (_, i) => v(i)), [v(100)]); assert.equal(many.takes.length, MAX_VERSIONS); assert.equal(many.takes.at(-1)!.url, '/files/v100.png'); assert.equal(many.take, MAX_VERSIONS - 1, 'over the cap the oldest drops and the new one stays active');
ok('version strip: runs add versions on the card (no new card), the newest is active, capped');

// ---- group membership: generate nodes whose centre is inside the frame; never notes / results / groups ----
const frame = { minX: 0, minY: 0, maxX: 1000, maxY: 700 };
const members = groupGenIds(frame, [
  { id: 'g1', type: GEN_TYPE, bounds: { minX: 10, minY: 10, maxX: 110, maxY: 110 } },
  { id: 'g2', type: GEN_TYPE, bounds: { minX: 1200, minY: 10, maxX: 1300, maxY: 110 } },
  { id: 'n1', type: NOTE_TYPE, bounds: { minX: 20, minY: 20, maxX: 80, maxY: 80 } },
  { id: 'r1', type: RESULT_TYPE, bounds: { minX: 30, minY: 30, maxX: 90, maxY: 90 } },
  { id: 'grp', type: GROUP_TYPE, bounds: { minX: 40, minY: 40, maxX: 100, maxY: 100 } },
]);
assert.deepEqual(members, ['g1']); assert.deepEqual(groupGenIds(null, []), []);
ok('group membership: only generate nodes inside the frame');

// (release 2: the two-press Run all is gone; a Group's "Run the flow" is tested in canvas-group.test.ts)

// ---- run order (2026-10-28): a card fed by another card in the same run waits for it, never runs without its input ----
{   const ups: Record<string, { id: string; name: string; status: string }[]> = { clip: [{ id: 'hero', name: 'Bike hero', status: 'draft' }], lone: [], orphan: [{ id: 'other', name: 'Other', status: 'draft' }], chained: [{ id: 'busy', name: 'Busy', status: 'running' }] };
  const r = runOrder(['hero', 'clip', 'lone', 'orphan', 'chained'], id => ups[id] ?? []);
  assert.deepEqual(r.now, ['hero', 'lone']); assert.deepEqual(r.later, ['clip', 'chained']); assert.deepEqual(r.blocked, [{ id: 'orphan', name: 'Other' }]);
  ok('run order: upstream first, downstream waits, a card whose input will never come is not started'); }
// ---- run proposal (2026-11-02): a chain of any length is proposed whole; only an input with no source at all is skipped ----
{ const card = (id: string, usd: number, o: Partial<ProposalCard> = {}): ProposalCard => ({ id, title: id, usd, credits: usd * 100, missing: null, missingFed: null, ups: [], other: null, ...o });
  const up = (id: string, status = 'draft') => ({ id, name: id, status });
  /* Picture → Character sheet → Image to 3D: the sheet's image is optional, the 3D card's isn't ("Add an image" until the sheet has run) */
  const chain = [card('pic', 0.04), card('sheet', 0.08, { ups: [up('pic')] }), card('to3d', 0.3, { missing: 'Add an image', ups: [up('sheet')] })];
  const r = settleProposal(chain);
  assert.deepEqual(r.problems, { pic: null, sheet: null, to3d: null }, 'every card of a 3-card chain runs'); assert.equal(r.totalUsd, 0.42); assert.equal(r.totalCredits, 42);
  const o = runOrder(chain.map(c => c.id), id => chain.find(c => c.id === id)!.ups);
  assert.deepEqual(o.now, ['pic']); assert.deepEqual(o.later, ['sheet', 'to3d']); assert.deepEqual(o.blocked, []);
  /* branch and merge: A feeds B and C, both feed D (two images) */
  const bm = [card('a', 0.1), card('b', 0.1, { missing: 'Add an image', ups: [up('a')] }), card('c', 0.1, { missing: 'Add an image', ups: [up('a')] }), card('d', 0.2, { missing: 'Add an image', ups: [up('b'), up('c')] })];
  const rb = settleProposal(bm); assert.ok(Object.values(rb.problems).every(p => p === null), 'branch + merge: all four run'); assert.equal(rb.totalUsd, 0.5);
  /* fed by a card already running: waits for it */
  assert.equal(settleProposal([card('clip', 0.5, { missing: 'Add a first frame', ups: [up('busy', 'running')] })]).problems.clip, null);
  /* truly missing: no arrow at all → skipped with its reason, and so is the card after it; still missing something else once fed → that reason */
  const miss = settleProposal([card('lone', 0.3, { missing: 'Add an image' }), card('next', 0.2, { missing: 'Add an image', ups: [up('lone')] }), card('ok', 0.1),
    card('noPrompt', 0.1, { missing: 'Add an image', missingFed: 'Write a prompt', ups: [up('ok')] })]);
  assert.equal(miss.problems.lone, 'Add an image'); assert.equal(miss.problems.next, 'Waits on “lone”, which can’t run here'); assert.equal(miss.problems.noPrompt, 'Write a prompt');
  assert.equal(miss.problems.ok, null); assert.equal(miss.totalUsd, 0.1, 'only what Go starts is priced');
  /* fed by a draft left out of the run → skipped (Go would never get its input); a quote problem still skips */
  const out = settleProposal([card('clip', 0.5, { missing: 'Add a first frame', ups: [up('elsewhere')] }), card('x', 0.2, { other: 'No price for these settings' })]);
  assert.equal(out.problems.clip, 'Waits for “elsewhere”, which isn’t in this run'); assert.equal(out.problems.x, 'No price for these settings'); assert.equal(out.totalUsd, 0);
  ok('run proposal: 3-card chain and branch/merge proposed whole (total = every quote), truly missing inputs still skipped with their reason'); }
/* the Ad layout card is compact (2026-10-31): old default sizes take the new one, a too-short card grows, others stay */
// the ad card is mostly its preview: its height follows the ad's shape at the card's width
assert.deepEqual([NODE_DEFS.ad.defaultW, NODE_DEFS.ad.defaultH], [360, adCardHeight(360, 4 / 5)], 'the default fits a 4:5 ad');
assert.equal(adCardHeight(360, 4 / 5), 514); assert.equal(adCardHeight(360, 9 / 16), 694); assert.equal(adCardHeight(360, 1), 428); assert.equal(adCardHeight(360, 1.91), 265);
assert.ok(adCardHeight(360, 9 / 16) > adCardHeight(360, 1) && adCardHeight(360, 1) > adCardHeight(360, 1.91), '9:16 is tall, 1.91:1 is short');
for (const a of [4 / 5, 9 / 16, 1, 1.91]) { const h = adCardHeight(360, a); const pv = (360 - 18) * ((360 - 18) / a); assert.ok(pv / (360 * h) > (a > 1.5 ? 0.6 : 0.75), `the preview is most of the card at ${a}`); }
assert.deepEqual(adCardFit(400, 840, 9 / 16), { w: 360, h: 694 }, 'the old 400 x 840 default takes today\'s width, the height follows the shape');
assert.deepEqual(adCardFit(400, 700, 4 / 5), { w: 360, h: 514 }, 'so does the older 400 x 700');
assert.deepEqual(adCardFit(360, 640, 4 / 5), { w: 360, h: 514 }, 'the last default gets shorter for a 4:5 ad');
assert.deepEqual(adCardFit(360, 514, 9 / 16), { w: 360, h: 694, grow: true }, 'a taller shape grows the card (when nothing is in the way)');
assert.equal(adCardFit(360, 514, 4 / 5), null, 'already right'); assert.equal(adCardFit(500, adCardHeight(500, 1), 1), null, 'a wider card keeps its width');
ok('ad card: preview first, height follows the ad shape, old cards adapt');

console.log('canvas-nodes: all ok');
process.exit(0);
