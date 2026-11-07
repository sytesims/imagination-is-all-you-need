// Canvas dock model: a proposal's state only moves forward when replies arrive out of order (agentDockModel.mergeProposals).
// 2026-10-28: Go's POST answer ("running") landed after the live "failed" update, and the card stayed on "Starting the runs…".
// Run: npx tsx test/canvas-dock-model.test.ts   (no server, no network, no browser)
import assert from 'node:assert/strict';
import { mergeProposals } from '../../web/src/canvas/proposalMerge.ts';

const P = (status: string, extra: any = {}) => ({ id: 'prop_1', boardId: 'b', cardIds: [], note: null, items: [], totalUsd: 0, totalCredits: 0, budget: null, overBudget: false, overByUsd: null, reason: null, status, createdAt: 1, decidedAt: null, jobIds: [], error: null, ...extra }) as any;
assert.equal(mergeProposals([P('failed', { error: 'No generate card to run.' })], [P('running')])[0].status, 'failed');
assert.equal(mergeProposals([P('approved')], [P('running')])[0].status, 'approved');
assert.equal(mergeProposals([P('pending')], [P('running')])[0].status, 'running');
assert.equal(mergeProposals([P('running')], [P('failed')])[0].status, 'failed');
assert.equal(mergeProposals([], [P('pending')]).length, 1);
console.log('ok canvas dock: a late reply never moves a proposal back');

// A price stop reads as ONE card (2026-11-06): the stopped approval and its ask-again pair up; the log lines that only repeat it are hidden.
{ const { repricePairs, hiddenByReprice, repriceRows, isPriceStop } = await import('../../web/src/canvas/proposalMerge.ts');
  const item = (cardId: string, usd: number, extra: any = {}) => ({ cardId, title: cardId, workflow: 'create', model: 'M', status: 'draft', usd, credits: usd * 100, quote: { cost: { estUsd: usd } }, problem: null, ...extra });
  const origin = P('failed', { id: 'o', createdAt: 1, items: [item('a', 0.03, { priceChanged: { wasUsd: 0.03, nowUsd: 0.039, reason: 'dearer' } })], runCardIds: ['a'], failedIds: ['a'], jobIds: [] });
  const child = P('pending', { id: 'c', createdAt: 2, repriceOf: 'o', items: [item('a', 0.039)], runCardIds: ['a'], totalUsd: 0.039 });
  assert.equal(isPriceStop(origin), true); assert.equal(isPriceStop(child), false);
  assert.equal(isPriceStop({ ...origin, failedIds: ['a', 'b'] }), false, 'another refusal is not a calm price stop');
  const all = [origin, child]; const pairs = repricePairs(all); const byId = new Map(all.map((p: any) => [p.id, p]));
  assert.equal(pairs.childOf.get('o')?.id, 'c'); assert.equal(pairs.originOf.get('c')?.id, 'o');
  const hid = (e: any) => hiddenByReprice(e, byId as any, pairs);
  assert.equal(hid({ type: 'decision', decision: 'go', text: 'Approved the run.', proposalId: 'o' }), true);
  assert.equal(hid({ type: 'activity', text: 'Started 0 runs · 1 didn’t start', proposalId: 'o' }), true);
  assert.equal(hid({ type: 'activity', text: 'Proposed 1 run · $0.04', proposalId: 'c' }), true, 'no second card');
  assert.equal(hid({ type: 'decision', decision: 'cancel', text: 'Cancelled the run.', proposalId: 'c' }), true, 'Cancel turns the card into one quiet line');
  assert.equal(hid({ type: 'decision', decision: 'go', text: 'Approved the run.', proposalId: 'c' }), false, 'a real run keeps its log lines');
  const mixed = P('approved', { id: 'm', items: [item('a', 0.03), item('b', 0.03, { priceChanged: { wasUsd: 0.03, nowUsd: 0.039, reason: 'dearer' } }), item('s', 0.03, { problem: 'No model' })], runCardIds: ['a', 'b'], failedIds: ['b'], jobIds: ['j1'] });
  assert.equal(hid({ type: 'activity', text: 'Started 1 run · 1 didn’t start', proposalId: 'm' }), false, 'a run that started keeps its line');
  assert.deepEqual(repriceRows(mixed, P('pending', { id: 'm2', items: [item('b', 0.039)] })).map((r: any) => [r.cardId, r.state, r.wasUsd, r.nowUsd]), [['a', 'started', 0.03, null], ['b', 'moved', 0.03, 0.039], ['s', 'skipped', 0.03, null]]);
  console.log('ok canvas dock: a price stop and its ask-again are one card'); }
