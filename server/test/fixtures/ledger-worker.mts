// Child process for ledger-reconcile.test.ts: same DATA_DIR as the parent (a second server on the same DB).
const L = await import('../../src/ledger.js');
const [op, job, amt] = process.argv.slice(2);
if (op === 'charge') L.charge(job, 'object-swap', 'router-veo', Number(amt));
if (op === 'refund') console.log('refunded', L.refund(job, 'failed (temporary): auto-refund'));
if (op === 'attempt') console.log('refunded', L.refundAttempt(job, 1, Number(amt), 'failed (temporary): auto-refund'));
