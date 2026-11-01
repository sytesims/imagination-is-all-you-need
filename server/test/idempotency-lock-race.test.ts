// Idempotency lock (audit 2026-11-01 P3 #12): three requests with one key arrive together and the first fails (a 4xx is never stored).
// Only ONE of the two waiters may take the lock next; the third waits until that one finishes. Run: npx tsx test/idempotency-lock-race.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { EventEmitter } from 'node:events';
process.env.OPENHIGGSFIELD_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'idemrace-'));
const { idemLock } = await import('../src/idempotency.ts');
const reply = () => { const raw = new EventEmitter(); return { raw, finish: () => raw.emit('finish') } as any; };
const r1 = reply(), r2 = reply(), r3 = reply(); const order: string[] = [];
await idemLock('k', r1); order.push('1 holds');
const p2 = idemLock('k', r2).then(() => order.push('2 holds')); const p3 = idemLock('k', r3).then(() => order.push('3 holds'));
await new Promise((r) => setTimeout(r, 10)); assert.deepEqual(order, ['1 holds']);
r1.finish(); await new Promise((r) => setTimeout(r, 10));
assert.equal(order.length, 2, `exactly one waiter takes the lock after the first fails: ${order}`);
const second = order[1].startsWith('2') ? r2 : r3; second.finish(); await Promise.all([p2, p3]);
assert.equal(order.length, 3); console.log('ok idempotency lock: after a failed first request, waiters take the key one at a time');
