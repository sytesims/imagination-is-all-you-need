// Canvas "This board" spend chip (GET /api/canvas/boards/:id/spend, canvasBoards.ts boardSpend): a failed or canceled run adds only what it
// was charged (countedUsd), never its estimate; done and running runs keep the estimate. A board whose runs all failed on a sample server
// (e.g. mock "out of credits") shows $0, not the estimate of runs that never happened.
// Run: npx tsx test/canvas-board-spend.test.ts   (temp data dir, mock backend, no network, no server port)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'board-spend-')), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_COUNT_SIMULATED_SPEND: '' });
const BL = await import('../src/billing.ts'); const CB = await import('../src/canvasBoards.ts'); const { jobs } = await import('../src/jobs.ts');
const ok = (m: string) => console.log('ok ' + m);

let n = 0;
const run = (boardId: string, status: string, o: Record<string, unknown> = {}) => {
  const job: any = { id: `job_${++n}`, toolId: 'create-image', provider: 'fal-qwen', status: 'queued', createdAt: Date.now() + n, route: 'fal:fal-ai/qwen-image', input: { boardId }, outputs: [], simulated: true, ...o };
  jobs.set(job.id, job); BL.recordSpend(job, 4); // $0.04 estimate
  if (status !== 'queued' && status !== 'running') { Object.assign(job, { status, startedAt: Date.now(), finishedAt: Date.now() }); BL.settleSpend(job); } else job.status = status;
  return job;
};

// all runs failed (sample server, out of credits): nothing charged, nothing estimated
const failed = 'brd_failedonly';
run(failed, 'failed', { error: 'out of credits', reasonCode: 'cloud_credits' }); run(failed, 'failed', { error: 'out of credits', reasonCode: 'cloud_credits' });
let s = CB.boardSpend(failed);
assert.equal(s.runs, 2); assert.equal(s.countedUsd, 0); assert.equal(s.estUsd, 0, 'failed runs add no estimate');
assert.deepEqual(s.recent.map((r: any) => [r.status, r.countedUsd]), [['failed', 0], ['failed', 0]]);
ok('all-failed board: $0 counted, $0 estimated');

// mixed: one done, one running, one canceled, one failed: only the done and running runs keep their estimate
const mixed = 'brd_mixed';
run(mixed, 'done'); run(mixed, 'running'); run(mixed, 'canceled'); run(mixed, 'failed');
s = CB.boardSpend(mixed);
assert.equal(s.runs, 4); assert.equal(s.running, 1); assert.equal(s.estUsd, 0.08, 'done + running estimates only'); assert.equal(s.countedUsd, 0, 'sample runs count $0');
ok('mixed board: estimate = done + running runs; failed and canceled add nothing');
