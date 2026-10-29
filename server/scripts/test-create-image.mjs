// Create Image API checks: n 1–4, aspect, quality low/med/high, price = per image × n (shown = charged), local = 0, failed job refunds.
// Usage: BASE=http://localhost:8797 node server/scripts/test-create-image.mjs   (never point at a shared dev server: it spends mock credits)
const BASE = process.env.BASE || 'http://localhost:8797';
// cloud-first default (2026-10-17): own mock server needs local on + mocked hosted keys; restored on exit
const { legacyRouting } = await import('../../scripts/qa/legacy-routing.mjs'); const restoreRouting = await legacyRouting(BASE);
const J = `${BASE}/api/tools/create-image/jobs`;
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); };
const post = async (f) => { const fd = new FormData(); fd.set('types', '["generate"]'); fd.set('prompt', 'a red fox in snow'); for (const [k, v] of Object.entries(f)) fd.set(k, String(v)); const r = await fetch(J, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() }; };
const price = async (q) => (await (await fetch(`${BASE}/api/tools/create-image/price?${new URLSearchParams(q)}`)).json()).credits;
for (const [f, m] of [[{ n: 0 }, 'n=0'], [{ n: 5 }, 'n=5'], [{ n: 'x' }, 'n=x'], [{ aspect: '7:5' }, 'aspect=7:5'], [{ quality: 'ultra' }, 'quality=ultra']]) {
  const r = await post(f); ok(r.status === 400 && r.body.errorType === 'validation' && r.body.refund?.charged === false, `rejects ${m} (400 validation, nothing charged)`);
}
const one = await price({ provider: 'api-seedream', resolution: '720p' });
for (const n of [1, 2, 3, 4]) {
  const shown = await price({ provider: 'api-seedream', resolution: '720p', n });
  const r = await post({ provider: 'api-seedream', n, aspect: '16:9' });
  ok(r.status === 200 && shown === one * n && r.body.cost === shown, `hosted n=${n}: shown ${shown} = ${one}×${n} = charged ${r.body.cost}`);
}
const loc = await post({ n: 4, aspect: '9:16' });
ok(loc.status === 200 && loc.body.cost === 0, `local (${loc.body.provider}) n=4 costs 0 (got ${loc.body.cost})`);
const before0 = 0; let f; for (let i = 0; i < 60; i++) { f = await post({ provider: 'api-seedream', n: 2, simulate: 'temporary' }); if (f.status !== 429) break; await new Promise((r) => setTimeout(r, 1000)); } // wait out the parallel-job limit
const before = (await (await fetch(`${BASE}/api/ledger`)).json()).balance + f.body.cost;
let job; for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 1000)); job = await (await fetch(`${BASE}/api/jobs/${f.body.id}`)).json(); if (['failed', 'done', 'blocked', 'canceled'].includes(job.status)) break; }
const after = (await (await fetch(`${BASE}/api/ledger`)).json()).balance;
ok(job?.status === 'failed' && job.refund?.refunded && job.refund.amount === f.body.cost && after === before, `failed job: ${f.body.cost} credits back to the app balance (balance ${before} → ${after})`);
console.log(`\n${pass} passed, ${fail} failed`); await restoreRouting(); process.exit(fail ? 1 : 0);
