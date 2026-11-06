// Try it (sample mode): the price grid. The four studios' Generate prices for every model, every place it runs on (and each named way to run
// there), and the settings that change a price (length × resolution for video, size × shape for images, kind × length for audio, the 3D
// options), asked once from the MOCK server while scripts/try/build.mjs runs. web/try/sw.js answers a price query from it, so changing the
// model, Run on, length or resolution in sample mode shows the price the app shows for those settings.
//   cells: {key: credits | 'e<n>'} (key = cellKey; 'e<n>' = errs[n], a refused setting's answer {s, b});
//   tpl:   {tool|model|runOn|route: a full answer at the tool's base settings} (the price fields are rescaled to a cell's credits);
//   auto:  {tool|model: {runOn, route}} (where a model runs with no saved choice);
//   factors: {tool|model|runOn|route: {param=value: ratio}} (settings priced as a ratio of the base: sound off, start image…);
//   spec:  per tool {path, dims, factors, linear, base, engineParam}.
// SPDX-License-Identifier: AGPL-3.0-or-later

const VIDEO_RES = ['480p', '720p', '768p', '1080p', '1440p', '2K', '4K'];
export const SPEC = {
  'create-image': { path: '/api/models/quote', engineParam: 'model', dims: { imageResolution: ['1K', '2K', '4K'], aspect: ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'] }, factors: { mode: ['edit'] }, linear: ['n'] },
  'h3-video': { path: '/api/tools/h3-video/price', dims: { resolution: VIDEO_RES, duration: 'seconds', audio: ['1', '0'], types: ['t2v', 'i2v'] }, factors: { types: ['flf', 'r2v'] }, linear: [] },
  audio: { path: '/api/tools/audio/price', dims: { types: ['music', 'sfx', 'voice', 'cover'], duration: ['', '5', '10', '15', '20', '30', '47', '60', '120', '180', '240', '300'] }, factors: {}, linear: [] },
  'three-d': { path: '/api/tools/three-d/price', dims: { types: ['image-to-3d', 'text-to-3d', 'multiview-to-3d'], detail: ['low', 'standard', 'high'], texture: ['off', 'standard', 'hd', 'pbr'], faces: ['auto', '10k', '50k', '200k'] }, factors: {}, linear: [] },
};
/** The same function is in web/try/sw.js (cellKey): keep them equal. */
export const cellKey = (tool, model, runOn, route, spec, q) => [tool, model, runOn ?? '', route ?? '', ...Object.keys(spec.dims).map(d => q[d] ?? spec.base[d] ?? '')].join('|');

/** Ask the mock server (api = its origin) for the grid. routes = the recorded answers (for each tool's base settings), tools = GET /api/tools. */
export async function harvestGrid(api, routes, tools, log = () => {}) {
  const out = { spec: {}, cells: {}, tpl: {}, auto: {}, factors: {}, errs: [] }; const errIdx = new Map(); let asked = 0;
  const get = async (path, q) => { asked++; const r = await fetch(`${api}${path}?${new URLSearchParams(Object.entries(q).filter(([, v]) => v !== '' && v != null))}`); const b = await r.text(); return { s: r.status, b }; };
  const cellOf = (r) => { if (r.s < 400) { try { const j = JSON.parse(r.b); return j.demo && typeof j.listCredits === 'number' ? j.listCredits : typeof j.credits === 'number' ? j.credits : (typeof j.listCredits === 'number' ? j.listCredits : null); /* a sample place (a mock key): its list price, what the app charges with a real key */ } catch { return null; } }
    const k = r.b; if (!errIdx.has(k)) { errIdx.set(k, out.errs.length); out.errs.push({ s: r.s, b: r.b }); } return `e${errIdx.get(k)}`; };
  for (const [toolId, sp] of Object.entries(SPEC)) {
    const t = tools.find(x => x.id === toolId); if (!t) continue;
    // the tool's base settings: its first recorded price query (no model, place or route in it)
    const baseKey = Object.keys(routes).filter(k => k.startsWith(`GET ${sp.path}?`)).sort((a, b) => a.length - b.length)[0]; if (!baseKey) continue;
    const base = Object.fromEntries(new URLSearchParams(baseKey.split('?')[1])); for (const k of ['model', 'provider', 'runOn', 'route', '__route', 'image']) delete base[k];
    const spec = { ...sp, base }; out.spec[toolId] = { path: sp.path, engineParam: sp.engineParam ?? null, dims: Object.keys(sp.dims), factors: sp.factors, linear: sp.linear, base };
    for (const m of t.models ?? []) {
      const ident = (engine) => (sp.engineParam === 'model' ? { model: engine } : { model: m.key, provider: engine });
      // where it runs with no saved choice (the mock's routing prefs are reset before this runs)
      { const r = await get(sp.path, { ...base, ...ident(m.primaryEngine ?? m.engines?.[0]) }); try { const j = JSON.parse(r.b); if (j.runOn) out.auto[`${toolId}|${m.key}`] = { runOn: j.runOn, route: j.routeId ?? null }; } catch { /* refused */ } }
      // no saved place (the server picks one for these settings, as the page asks with the model's own engine), then each place, then each named way
      const rows = [{ id: '', engines: [m.primaryEngine ?? m.engines?.[0]], status: 'ready', choices: [] }, ...(m.runsOn ?? [])];
      for (const row of rows) {
        if (row.status !== 'ready' && row.status !== 'sample') continue;
        const ways = (row.choices ?? []).filter(c => c.status === 'ready' || c.status === 'sample');
        const routesOf = [{ route: null, engine: row.engines?.[0] }, ...(ways.length > 1 ? ways.map(c => ({ route: c.routeId, engine: c.engine })) : [])];
        for (const { route, engine } of routesOf) {
          const fixed = { ...ident(engine), ...(row.id ? { runOn: row.id } : {}), ...(route ? { route } : {}) };
          const combo = `${toolId}|${m.key}|${row.id}|${route ?? ''}`;
          const tplR = await get(sp.path, { ...base, ...fixed }); if (tplR.s < 400) out.tpl[combo] = tplR.b;
          // the dims: every value, the bad ones answered once (a resolution the model doesn't make is refused at any length)
          const dimVals = Object.entries(sp.dims).map(([d, vs]) => [d, vs === 'seconds' ? secondsOf(m) : vs]);
          let combos = [{}];
          for (const [d, vs] of dimVals) combos = combos.flatMap(c => vs.map(v => ({ ...c, [d]: v })));
          const dead = new Map(); const seen = new Set(); // first dim value refused at the base of the other dims → skip the rest of its row
          for (const c of combos) {
            const q = { ...base, ...c, ...fixed, ...(c.types === 'i2v' ? { image: '1' } : {}) }; const first = Object.entries(c)[0]; const dk = first ? first.join('=') : '';
            const key = cellKey(toolId, m.key, row.id, route, spec, q); if (key in out.cells) continue;
            if (dead.has(dk)) { out.cells[key] = dead.get(dk); continue; }
            const v = cellOf(await get(sp.path, q)); out.cells[key] = v; const firstOfRow = !seen.has(dk); seen.add(dk);
            if (firstOfRow && typeof v === 'string' && first && /resolution/i.test(out.errs[Number(v.slice(1))].b)) dead.set(dk, v);
          }
          // the factors: the ratio to the base price
          const b0 = cellOf(tplR); const f = {};
          if (typeof b0 === 'number' && b0 > 0) for (const [p, vs] of Object.entries(sp.factors)) for (const v of vs) { const x = cellOf(await get(sp.path, { ...base, ...fixed, [p]: v, ...(p === 'types' || p === 'mode' ? { image: '1', refs: '1' } : {}) })); if (typeof x === 'number') f[`${p}=${v}`] = x / b0; }
          if (Object.keys(f).length) out.factors[combo] = f;
        }
      }
    }
    log(`price grid: ${toolId} done (${asked} answers so far)`);
  }
  return out;
}
/** A video model's lengths: its caps (whole seconds), else the usual ones. */
function secondsOf(m) { const lo = Number(m.caps?.minSeconds), hi = Number(m.caps?.maxSeconds); if (lo > 0 && hi >= lo) { const r = []; for (let s = Math.ceil(lo); s <= Math.floor(hi); s++) r.push(String(s)); return r; } return ['5', '8', '10']; }
