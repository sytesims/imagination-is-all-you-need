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
