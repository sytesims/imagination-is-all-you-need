// Model picker names: no duplicates per tool, no parentheticals / "(hosted)"-style tags, featured set present, every
// hosted Create Image model listed with family + description. Usage: BASE=http://localhost:8807 node server/scripts/test-model-names.mjs
const BASE = process.env.BASE || 'http://localhost:8807';
let pass = 0, fail = 0; const ok = (c, m, x) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${m}${c ? '' : ' ' + JSON.stringify(x ?? '').slice(0, 400)}`); };
const BAD = /[()]|·|\bhosted\b|\bdefault\b|\bApache\b|direct API/i;
const models = (await (await fetch(`${BASE}/api/models`)).json()).groups;
const tools = await (await fetch(`${BASE}/api/tools`)).json();
for (const g of models) {
  const names = g.models.map((m) => m.name); const dup = names.filter((n, i) => names.indexOf(n) !== i);
  ok(!dup.length, `${g.toolId}: no duplicate model names`, dup);
  const bad = names.filter((n) => BAD.test(n)); ok(!bad.length, `${g.toolId}: no parenthetical/tag names`, bad);
  ok(g.models.every((m) => m.family && typeof m.featured === 'boolean' && m.description && typeof m.isDefault === 'boolean'), `${g.toolId}: family/featured/description/isDefault on every card`, g.models.filter((m) => !m.family || !m.description).map((m) => m.id));
}
for (const t of tools) { const bad = t.providers.map((p) => p.name).filter((n) => BAD.test(n)); ok(!bad.length, `/api/tools ${t.id}: provider names clean`, bad); }
const ci = models.find((g) => g.toolId === 'create-image').models;
const feat = ci.filter((m) => m.featured).map((m) => m.name);
for (const want of ['Nano Banana 2', 'Grok Imagine', 'GPT Image', 'Seedream', 'FLUX.2 [pro]', 'Qwen Image 2.1', 'Z-Image-Turbo']) ok(feat.includes(want), `featured: ${want}`, feat);
const tool = tools.find((t) => t.id === 'create-image'); const hostedIds = tool.providers.filter((p) => p.kind !== 'open-weights').map((p) => p.id);
ok(hostedIds.length >= 17 && hostedIds.every((id) => ci.some((m) => m.id === id)), `all ${hostedIds.length} hosted image models listed in /api/models`, hostedIds);
ok(ci.filter((m) => m.isDefault).length === 1, 'exactly one default');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
