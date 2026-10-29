// Per-model Create Image capabilities: /api/models caps + priceMatrix, /api/models/quote, job validation (400, nothing charged),
// shown (quote / matrix × n) = charged. Usage: BASE=http://localhost:8797 node server/scripts/test-image-caps.mjs (own server; spends mock credits)
const BASE = process.env.BASE || 'http://localhost:8797';
// cloud-first default (2026-10-17): own mock server needs local on + mocked hosted keys; restored on exit
const { legacyRouting } = await import('../../scripts/qa/legacy-routing.mjs'); const restoreRouting = await legacyRouting(BASE);
let pass = 0, fail = 0; const ok = (c, m, x) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${m}${c ? '' : ' ' + JSON.stringify(x ?? '').slice(0, 300)}`); };
const get = async (u) => { const r = await fetch(BASE + u); return { status: r.status, body: await r.json() }; };
const post = async (f) => { const fd = new FormData(); fd.set('types', '["generate"]'); fd.set('prompt', 'a red fox'); fd.set('rights', '1'); for (const [k, v] of Object.entries(f)) fd.set(k, String(v)); const r = await fetch(`${BASE}/api/tools/create-image/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() }; };
const bal = async () => (await get('/api/ledger')).body.balance;
const models = (await get('/api/models?toolId=create-image')).body.groups[0].models; const by = Object.fromEntries(models.map((m) => [m.id, m]));
ok(models.every((m) => m.capabilities && m.priceMatrix), 'every create-image model has capabilities + priceMatrix', models.filter((m) => !m.capabilities).map((m) => m.id));
ok(models.filter((m) => m.openWeights).every((m) => Object.values(m.priceMatrix).every((r) => Object.values(r).every((v) => v === 0))), 'local / open-weights matrix is all 0');
ok(by['api-seedream'].priceMatrix.default['1K'] === 5 && by['api-seedream'].priceMatrix.default['2K'] === 9, 'seedream 1K 5 / 2K 9 credits', by['api-seedream'].priceMatrix);
ok(by['api-grok-image'].priceMatrix.low['1K'] === 4 && by['api-grok-image'].priceMatrix.med['2K'] === 8, 'grok tier × res matrix', by['api-grok-image'].priceMatrix);
ok(by['api-gpt-image'].priceMatrix.med['1K'] === null, 'gpt-image medium has no published price → null', by['api-gpt-image'].priceMatrix);
for (const [f, m] of [[{ provider: 'api-seedream', imageResolution: '4K' }, 'seedream 4K'], [{ provider: 'api-seedream', quality: 'high' }, 'tierless model quality=high'],
  [{ provider: 'api-grok-image', quality: 'high' }, 'grok quality=high'], [{ provider: 'api-seedream', aspect: 'auto' }, 'explicit Auto on a no-Auto model'],
  [{ provider: 'api-seedream', aspect: '21:9' }, 'seedream 21:9'], [{ provider: 'comfy-zimage', imageResolution: '4K' }, 'local 4K'], [{ provider: 'api-gpt-image', quality: 'med' }, 'unpriced cell']]) {
  const b0 = await bal(); const r = await post(f); const b1 = await bal();
  ok(r.status === 400 && b0 === b1, `rejects ${m} (400, nothing charged)`, r.body);
}
for (const [model, q] of [['api-seedream', { imageResolution: '2K', n: 3 }], ['api-grok-image', { quality: 'low', imageResolution: '2K', n: 2 }], ['api-kling-image', { imageResolution: '4K', n: 4, aspect: '16:9' }], ['api-ideogram', { quality: 'high', n: 2 }], ['comfy-qwen-image', { imageResolution: '2K', n: 4, aspect: '3:2' }]]) {
  const quote = await get(`/api/models/quote?${new URLSearchParams({ model, ...Object.fromEntries(Object.entries(q).map(([k, v]) => [k, String(v)])) })}`);
  const cell = by[model].priceMatrix[q.quality ?? (by[model].capabilities.qualityTiers.length ? by[model].capabilities.defaultTier : 'default')][q.imageResolution ?? by[model].capabilities.defaultResolution];
  const r = await post({ provider: model, ...q });
  ok(quote.status === 200 && quote.body.credits === cell * q.n && r.status === 200 && r.body.cost === quote.body.credits, `${model} ${JSON.stringify(q)}: matrix ${cell}×${q.n} = quote ${quote.body.credits} = charged ${r.body.cost}`, { quote: quote.body, r: r.body });
}
const qa = await get('/api/models/quote?model=api-seedream&aspect=auto'); ok(qa.status === 400, 'quote validates too (explicit Auto on seedream)');
console.log(`\n${pass} passed, ${fail} failed`); await restoreRouting(); process.exit(fail ? 1 : 0);
