// Pass 2-3 checks: examples per tool with distinct poster/preview, 27 camera move previews, Photo FX optional
// location/products inputs, provider names without a " · mock" suffix (backend in providers[].backend).
// Usage: BASE=http://localhost:8798 node server/scripts/test-examples-media.mjs  (own port, never the shared dev server)
const BASE = process.env.BASE || 'http://localhost:8798';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); };
const get = async (u) => (await fetch(BASE + u)).json();
const head = async (u) => { const r = await fetch(BASE + u); const b = await r.arrayBuffer(); return { ok: r.ok, size: b.byteLength, type: r.headers.get('content-type') }; };
const tools = await get('/api/tools'); const ex = await get('/api/examples');
for (const t of tools) ok(ex.some((e) => e.toolId === t.id), `example exists for ${t.id} (${ex.filter((e) => e.toolId === t.id).length})`);
ok(ex.every((e) => e.posterUrl && e.previewUrl), 'every example has posterUrl + previewUrl');
ok(new Set(ex.map((e) => e.posterUrl)).size === ex.length && new Set(ex.map((e) => e.previewUrl)).size === ex.length, 'posters/previews are distinct per example');
const media = await Promise.all(ex.flatMap((e) => [head(e.posterUrl), head(e.previewUrl)]));
ok(media.every((m) => m.ok && m.size > 1000), `all ${media.length} example media files are served`);
const cam = tools.find((t) => t.id === 'camera');
ok(cam.presets.length === 27, `camera has 27 moves (${cam.presets.length})`);
ok(cam.presets.every((p) => p.previewUrl && p.previewWebm && p.previewGif), 'every move has previewUrl/webm/gif');
const cm = await Promise.all(cam.presets.flatMap((p) => [head(p.previewUrl), head(p.previewWebm), head(p.previewGif)]));
ok(cm.every((m) => m.ok && m.size < 200_000), `all ${cm.length} camera preview files served, each < 200 KB`);
const fx = tools.find((t) => t.id === 'photo-fx');
for (const n of ['location', 'products']) { const i = fx.inputs.find((x) => x.name === n); ok(i && i.kind === 'files' && !i.required, `photo-fx has optional ${n} image input`); }
const provs = tools.flatMap((t) => t.providers);
ok(provs.every((p) => !/·\s*mock|\(mock/i.test(p.name)), 'no provider display name carries a mock suffix');
ok(provs.every((p) => p.backend && ['mock', 'comfy'].includes(p.backend.mode)), 'providers[].backend.mode present');
const com = (await get('/api/community?limit=200')).items.filter((x) => x.kind === 'example');
ok(com.length && new Set(com.map((x) => x.posterUrl)).size === com.length, `community: ${com.length} example items, distinct posterUrl each`);
const hubRes = await get('/api/hub/items?limit=100').catch(() => null);
const hubItems = (hubRes?.items ?? hubRes?.results ?? []);
ok(hubItems.length > 0 && hubItems.every((h) => h.posterUrl) && new Set(hubItems.map((h) => h.posterUrl)).size === hubItems.length, `hub: ${hubItems.length} items, distinct posterUrl each`);
const hm = await Promise.all(hubItems.map((h) => head(h.posterUrl)));
ok(hm.every((m) => m.ok && m.size > 1000), `hub thumbnails served (${hm.length})`);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
