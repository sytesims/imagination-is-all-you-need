// Canvas nodes: the shared node registry, port-linking rules, the actual tldraw arrow binding linkShapes writes, group
// membership, and the two-press Run all (a first press only prices; a run list comes back only on a fresh second press).
// Run: npx tsx test/canvas-nodes.test.ts   (no server, no network, no browser)
import assert from 'node:assert/strict';
import { NODE_DEFS, NODE_KINDS, NODE_TYPES, GEN_TYPE, RESULT_TYPE, PROMPT_TYPE, UPLOAD_TYPE, NOTE_TYPE, COMPARE_TYPE, GROUP_TYPE, nodeDefOf } from '../../web/src/canvas/nodeTypes.ts';
import { canConnectTo, pickPortTarget, groupGenIds, runAllConfirm, runAllCommit, runAllTotal, runAllPriceLabel } from '../../web/src/canvas/nodeLogic.ts';
import { linkShapes, inputOfShape, withInputs } from '../../web/src/canvas/graph.ts';
import { addVersions, MAX_VERSIONS } from '../../web/src/canvas/cardModel.ts';
import { runOrder } from '../../web/src/canvas/nodeLogic.ts';
import { outKindOf, genIns, canFeed, legalTargets, pickTypedTarget, takesLine, type PortInfo } from '../../web/src/canvas/nodeLogic.ts';
const ok = (m: string) => console.log('ok ' + m);

// ---- the registry: every node kind, one unique tldraw type, honest ports and sizes ----
assert.equal(NODE_KINDS.length, 7); assert.equal(new Set(NODE_TYPES).size, 7);
assert.deepEqual(NODE_TYPES, [GEN_TYPE, RESULT_TYPE, PROMPT_TYPE, UPLOAD_TYPE, NOTE_TYPE, COMPARE_TYPE, GROUP_TYPE]);
for (const k of NODE_KINDS) { const d = NODE_DEFS[k]; assert.equal(nodeDefOf(d.type), d); assert.ok(d.minW <= d.defaultW && d.defaultW <= d.maxW); assert.ok(d.minH <= d.defaultH && d.defaultH <= d.maxH); }
assert.equal(NODE_DEFS.gen.input, true); assert.equal(NODE_DEFS.gen.output, true);
assert.equal(NODE_DEFS.result.input, false); assert.equal(NODE_DEFS.result.output, true);
assert.equal(NODE_DEFS.prompt.input, false); assert.equal(NODE_DEFS.prompt.output, true);
assert.equal(NODE_DEFS.upload.input, false); assert.equal(NODE_DEFS.upload.output, true);
assert.equal(NODE_DEFS.note.input, false); assert.equal(NODE_DEFS.note.output, true);
assert.equal(NODE_DEFS.compare.input, true); assert.equal(NODE_DEFS.compare.inputMax, 2); assert.equal(NODE_DEFS.compare.output, false);
assert.equal(NODE_DEFS.group.input, false); assert.equal(NODE_DEFS.group.output, false);
assert.equal(nodeDefOf('ohf-nope'), null);
ok('registry: 7 kinds, unique types, ports, input max, size limits');

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
const cands = [{ id: 'shape:a', type: GEN_TYPE }, { id: 'shape:b', type: NOTE_TYPE }, { id: 'shape:c', type: COMPARE_TYPE, inputs: 2 }, { id: 'shape:d', type: COMPARE_TYPE, inputs: 1 }];
assert.deepEqual(pickPortTarget(cands, 'shape:a', GEN_TYPE), { id: 'shape:d', type: COMPARE_TYPE }, 'skips self, a note and a full compare');
assert.equal(pickPortTarget(cands, 'shape:a', PROMPT_TYPE), null, 'a prompt drag cannot land on compare / note');
assert.deepEqual(pickPortTarget([{ id: 'shape:x', type: GEN_TYPE }], 'shape:x', GEN_TYPE), null, 'never connects to itself');
ok('port linking: media / text rules, self and full inputs refused, topmost valid target');

// ---- the actual arrow linkShapes writes (stub editor, no browser) ----
const shapes: Record<string, any> = { 'shape:a': { maxX: 100, midY: 50 }, 'shape:b': { minX: 300, midY: 80 } };
const created: any[] = [], bindings: any[] = [];
const editor = {
  getShapePageBounds: (id: string) => shapes[id] ?? null,
  createShape: (s: any) => { created.push(s); return s; },
  createBindings: (b: any[]) => { bindings.push(...b); },
} as any;
const arrowId = linkShapes(editor, 'shape:a' as any, 'shape:b' as any);
assert.ok(arrowId && arrowId.startsWith('shape:'));
assert.equal(created.length, 1); assert.equal(created[0].type, 'arrow');
assert.equal(created[0].props.kind, 'arc', 'curved'); assert.ok(created[0].props.bend > 0);
assert.equal(created[0].props.color, 'grey'); assert.equal(created[0].props.size, 's');
assert.equal(created[0].props.arrowheadStart, 'none'); assert.equal(created[0].props.arrowheadEnd, 'arrow');
assert.equal(bindings.length, 2); assert.equal(bindings[0].props.terminal, 'start'); assert.equal(bindings[0].toId, 'shape:a');
assert.equal(bindings[1].props.terminal, 'end'); assert.equal(bindings[1].toId, 'shape:b');
assert.equal(bindings[0].fromId, arrowId); assert.equal(bindings[1].fromId, arrowId);
ok('linkShapes: thin grey arc, one arrowhead, both ends bound (start → end)');

// ---- what the camera frames for an agent's card (2026-10-28): the card and the nodes wired into it, so a source clip stays in view ----
{ const sh: Record<string, any> = { 'shape:src': { id: 'shape:src', index: 'a1' }, 'shape:ext': { id: 'shape:ext', index: 'a2' }, 'shape:arr': { id: 'shape:arr', index: 'a3' }, 'shape:lone': { id: 'shape:lone', index: 'a4' } };
  const ed = { getShape: (id: string) => sh[id] ?? null,
    getBindingsToShape: (id: string) => (id === 'shape:ext' ? [{ fromId: 'shape:arr', props: { terminal: 'end' } }] : []),
    getBindingsFromShape: (id: string) => (id === 'shape:arr' ? [{ toId: 'shape:src', props: { terminal: 'start' } }, { toId: 'shape:ext', props: { terminal: 'end' } }] : []) } as any;
  assert.deepEqual(withInputs(ed, ['shape:ext']), ['shape:ext', 'shape:src'], 'an Extend card brings its source clip');
  assert.deepEqual(withInputs(ed, ['shape:lone', 'shape:gone']), ['shape:lone'], 'no inputs: just the card; a missing id is skipped');
  ok('camera area: a card plus the nodes wired into it'); }

// ---- typed ports (2026-10-27): what a node puts out, what it takes, legal targets, the hint on an illegal drop ----
assert.equal(outKindOf(GEN_TYPE, { medium: 'image', takes: [] }), 'image', 'a draft puts out what it will make');
assert.equal(outKindOf(GEN_TYPE, { medium: 'image', takes: [{ kind: 'image' }, { kind: 'video' }], take: 1 }), 'video', 'the active version decides');
assert.equal(outKindOf(GEN_TYPE, { medium: '3d', takes: [] }), null, '3D feeds nothing');
assert.equal(outKindOf(PROMPT_TYPE, {}), 'text'); assert.equal(outKindOf(NOTE_TYPE, {}), 'text');
assert.equal(outKindOf(RESULT_TYPE, { kind: 'audio' }), 'audio'); assert.equal(outKindOf(UPLOAD_TYPE, { mediaKind: 'video' }), 'video');
assert.equal(outKindOf(COMPARE_TYPE, {}), null); assert.equal(outKindOf(GROUP_TYPE, {}), null); assert.equal(outKindOf('image', {}), 'image');
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

// ---- Run all: the first press only prices; nothing runs without the second, fresh press ----
const quotes = [{ credits: 4, cost: { estUsd: 0.04 } }, { credits: 6, cost: { estUsd: 0.06 } }];
const total = runAllTotal(quotes); assert.equal(total.usd, 0.1); assert.equal(total.priced, 2); assert.equal(runAllPriceLabel(total), '≈ $0.10');
assert.equal(runAllTotal([{ credits: 3 }, { credits: 4 }]).credits, 7, 'falls back to credits');
assert.equal(runAllTotal([{ credits: 3 }, null]).priced, 1, 'never invents a total for an unpriced node');
const now = 1_000_000;
const confirm = runAllConfirm(['g1', 'g2'], quotes, now);
assert.equal(confirm.phase, 'confirm'); assert.equal(confirm.count, 2); assert.equal(confirm.total.usd, 0.1);
assert.equal('run' in confirm, false, 'the first press carries no run list');
assert.deepEqual(runAllCommit(null, now), null, 'no confirm, no run');
assert.deepEqual(runAllCommit(confirm, now + 500), ['g1', 'g2'], 'the second fresh press runs');
assert.deepEqual(runAllCommit(confirm, now + 10_001), null, 'a stale confirm never runs');
ok('Run all: first press only prices (no run list), second fresh press runs, stale press refused');

// ---- run order (2026-10-28): a card fed by another card in the same run waits for it, never runs without its input ----
{   const ups: Record<string, { id: string; name: string; status: string }[]> = { clip: [{ id: 'hero', name: 'Bike hero', status: 'draft' }], lone: [], orphan: [{ id: 'other', name: 'Other', status: 'draft' }], chained: [{ id: 'busy', name: 'Busy', status: 'running' }] };
  const r = runOrder(['hero', 'clip', 'lone', 'orphan', 'chained'], id => ups[id] ?? []);
  assert.deepEqual(r.now, ['hero', 'lone']); assert.deepEqual(r.later, ['clip', 'chained']); assert.deepEqual(r.blocked, [{ id: 'orphan', name: 'Other' }]);
  ok('run order: upstream first, downstream waits, a card whose input will never come is not started'); }
console.log('canvas-nodes: all ok');
process.exit(0);
