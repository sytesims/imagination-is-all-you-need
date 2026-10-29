/*
 * Brand Kit for Figma (AGPL-3.0-or-later, part of Imagination Is All You Need). Reads a brand kit's <name>.tokens.json (W3C Design Tokens format, as the
 * app's Assets > Brand exports it) and makes, in the open file:
 *   - a Variables collection "<kit> brand": COLOR variables (color/primary…), FLOAT variables (spacing/md, radius/lg…) and STRING variables (font/heading…)
 *   - paint styles "<kit>/<colour>" bound to those colour variables
 *   - text styles "<kit>/Heading" and "<kit>/Body" in the kit's fonts (when the font is installed)
 * Running it again with the same kit updates everything by name; nothing is duplicated.
 * Written against the public Figma Plugin API only. Plain JavaScript (no build step): the plain functions below are also loaded by the repo's
 * unit test (server/test/figma-brand-kit.test.ts), which checks the token → variable mapping and the update-by-name logic with a stand-in API.
 */

/* ---------------------------------------------------------------- tokens → plan (pure) */
function clamp01(n) { return Math.max(0, Math.min(1, n)); }
/** "#FF7A1A" / "#f7a" / {colorSpace:'srgb', components:[r,g,b], alpha} / {hex} → {r,g,b,a} in 0..1, or null. */
function parseColor(v) {
  if (v && typeof v === 'object') {
    if (Array.isArray(v.components) && (!v.colorSpace || v.colorSpace === 'srgb') && v.components.length >= 3 && v.components.every(function (x) { return typeof x === 'number'; })) {
      return { r: clamp01(v.components[0]), g: clamp01(v.components[1]), b: clamp01(v.components[2]), a: typeof v.alpha === 'number' ? clamp01(v.alpha) : 1 };
    }
    if (typeof v.hex === 'string') return parseColor(v.hex);
    return null;
  }
  if (typeof v !== 'string') return null;
  var s = v.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.split('').map(function (c) { return c + c; }).join('');
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s)) return null;
  var n = function (i) { return parseInt(s.slice(i, i + 2), 16) / 255; };
  return { r: n(0), g: n(2), b: n(4), a: s.length === 8 ? n(6) : 1 };
}
/** "16px" / "1rem" / {value:16, unit:'px'} / 16 → px number, or null. */
function parseDimension(v) {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && typeof v.value === 'number') return v.unit === 'rem' ? v.value * 16 : v.value;
  if (typeof v !== 'string') return null;
  var m = /^(-?\d+(?:\.\d+)?)(px|rem)?$/.exec(v.trim()); if (!m) return null;
  return m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1]);
}
/** "Space Grotesk" / ["Space Grotesk", "sans-serif"] → "Space Grotesk". */
function parseFontFamily(v) { var x = Array.isArray(v) ? v[0] : v; return typeof x === 'string' && x.trim() ? x.trim() : null; }

/** A tokens file → what to make. Walks every group; a token's $type comes from itself or the nearest group. Aliases ("{color.primary}") are resolved. */
function planFromTokens(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('That isn’t a tokens file (expected a JSON object).');
  var ext = json.$extensions && json.$extensions['app.imagination.brand-kit'];
  var kitName = (ext && typeof ext.name === 'string' && ext.name.trim()) ? ext.name.trim() : 'Brand';
  var flat = {}; var order = [];
  (function walk(o, path, type) {
    var ty = typeof o.$type === 'string' ? o.$type : type;
    if (Object.prototype.hasOwnProperty.call(o, '$value')) { flat[path.join('/')] = { type: ty, value: o.$value, description: typeof o.$description === 'string' ? o.$description : '' }; order.push(path.join('/')); return; }
    Object.keys(o).forEach(function (k) { if (k.charAt(0) === '$') return; var v = o[k]; if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, path.concat(k), ty); });
  })(json, [], undefined);
  var resolve = function (v, depth) {
    if (typeof v === 'string' && /^\{[^{}]+\}$/.test(v) && (depth || 0) < 8) { var t = flat[v.slice(1, -1).split('.').join('/')]; return t ? resolve(t.value, (depth || 0) + 1) : null; }
    return v;
  };
  var plan = { kitName: kitName, colors: [], numbers: [], fonts: [], skipped: [] };
  order.forEach(function (name) {
    var t = flat[name]; var v = resolve(t.value);
    if (t.type === 'color') { var c = parseColor(v); if (c) plan.colors.push({ name: name, color: c, description: t.description }); else plan.skipped.push(name); }
    else if (t.type === 'dimension' || t.type === 'number') { var d = parseDimension(v); if (d != null) plan.numbers.push({ name: name, value: d, description: t.description }); else plan.skipped.push(name); }
    else if (t.type === 'fontFamily') { var f = parseFontFamily(v); if (f) plan.fonts.push({ name: name, family: f, description: t.description }); else plan.skipped.push(name); }
    else plan.skipped.push(name);
  });
  if (!plan.colors.length && !plan.numbers.length && !plan.fonts.length) throw new Error('No colour, size or font tokens found in that file.');
  return plan;
}
/** Text styles to make from the font tokens: font/heading → Heading 32 px, font/body → Body 16 px, any other font → its own name at 16 px. */
function textStylesOf(plan) {
  return plan.fonts.map(function (f) {
    var leaf = f.name.split('/').pop(); var heading = /head|display|title/i.test(leaf);
    return { name: plan.kitName + '/' + leaf.charAt(0).toUpperCase() + leaf.slice(1), family: f.family, size: heading ? 32 : 16, lineHeight: heading ? 120 : 150 };
  });
}

/* ---------------------------------------------------------------- plan → Figma (update by name) */
/** Find by name or make: the update-by-name rule every object here follows. */
function upsert(list, name, make) { for (var i = 0; i < list.length; i++) if (list[i].name === name) return { item: list[i], created: false }; var x = make(); list.push(x); return { item: x, created: true }; }

/** Apply a plan with a Figma-like API (the real `figma` global in the plugin, a stand-in in the test). → counts and notes. */
async function applyPlan(api, plan) {
  var out = { created: 0, updated: 0, notes: [] };
  var count = function (r) { if (r.created) out.created++; else out.updated++; return r.item; };
  var collName = plan.kitName + ' brand';
  var colls = await api.variables.getLocalVariableCollectionsAsync();
  var coll = count(upsert(colls, collName, function () { return api.variables.createVariableCollection(collName); }));
  var mode = coll.defaultModeId;
  var all = (await api.variables.getLocalVariablesAsync()).filter(function (v) { return v.variableCollectionId === coll.id; });
  var variable = function (name, type) {
    var found = all.filter(function (v) { return v.name === name; })[0];
    if (found && found.resolvedType === type) { out.updated++; return found; }
    if (found) { found.remove(); out.notes.push(name + ' changed type, so it was made again.'); }
    var v = api.variables.createVariable(name, coll, type); all.push(v); out.created++; return v;
  };
  var colourVars = {};
  plan.colors.forEach(function (c) { var v = variable(c.name, 'COLOR'); v.setValueForMode(mode, c.color); if (c.description) v.description = c.description; colourVars[c.name] = v; });
  plan.numbers.forEach(function (n) { var v = variable(n.name, 'FLOAT'); v.setValueForMode(mode, n.value); if (n.description) v.description = n.description; });
  plan.fonts.forEach(function (f) { var v = variable(f.name, 'STRING'); v.setValueForMode(mode, f.family); });

  var paints = await api.getLocalPaintStylesAsync();
  plan.colors.forEach(function (c) {
    var st = count(upsert(paints, plan.kitName + '/' + c.name.replace(/^colou?r\//, ''), function () { return api.createPaintStyle(); }));
    st.name = plan.kitName + '/' + c.name.replace(/^colou?r\//, '');
    var paint = { type: 'SOLID', color: { r: c.color.r, g: c.color.g, b: c.color.b }, opacity: c.color.a };
    st.paints = [api.variables.setBoundVariableForPaint ? api.variables.setBoundVariableForPaint(paint, 'color', colourVars[c.name]) : paint];
    if (c.description) st.description = c.description;
  });

  var texts = await api.getLocalTextStylesAsync(); var fonts = null;
  for (var i = 0, ts = textStylesOf(plan); i < ts.length; i++) {
    var t = ts[i];
    if (!fonts) fonts = await api.listAvailableFontsAsync();
    var styles = fonts.filter(function (f) { return f.fontName.family === t.family; }).map(function (f) { return f.fontName.style; });
    if (!styles.length) { out.notes.push(t.family + ' isn’t installed, so ' + t.name + ' was skipped. Install it and run again.'); continue; }
    var style = styles.indexOf('Regular') >= 0 ? 'Regular' : styles[0];
    if (/Heading$/.test(t.name)) { var bold = ['Bold', 'SemiBold', 'Semi Bold'].filter(function (s) { return styles.indexOf(s) >= 0; })[0]; if (bold) style = bold; }
    await api.loadFontAsync({ family: t.family, style: style });
    var ts1 = count(upsert(texts, t.name, function () { return api.createTextStyle(); }));
    ts1.name = t.name; ts1.fontName = { family: t.family, style: style }; ts1.fontSize = t.size; ts1.lineHeight = { unit: 'PERCENT', value: t.lineHeight };
  }
  if (plan.skipped.length) out.notes.push('Skipped ' + plan.skipped.length + ' token' + (plan.skipped.length === 1 ? '' : 's') + ' of a type Figma variables don’t take (' + plan.skipped.slice(0, 3).join(', ') + (plan.skipped.length > 3 ? '…' : '') + ').');
  return out;
}

/* ---------------------------------------------------------------- the plugin */
if (typeof figma !== 'undefined') {
  figma.showUI(__html__, { width: 380, height: 460, themeColors: true });
  figma.ui.onmessage = async function (msg) {
    if (!msg || msg.type === 'close') { figma.closePlugin(); return; }
    if (msg.type !== 'import') return;
    try {
      var plan = planFromTokens(JSON.parse(msg.text));
      var r = await applyPlan(figma, plan);
      var line = plan.kitName + ': ' + r.created + ' made, ' + r.updated + ' updated.';
      figma.notify(line); figma.ui.postMessage({ type: 'done', line: line, notes: r.notes, plan: { colors: plan.colors.length, numbers: plan.numbers.length, fonts: plan.fonts.length } });
    } catch (e) { figma.ui.postMessage({ type: 'error', message: (e && e.message) || String(e) }); }
  };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { parseColor: parseColor, parseDimension: parseDimension, parseFontFamily: parseFontFamily, planFromTokens: planFromTokens, textStylesOf: textStylesOf, applyPlan: applyPlan, upsert: upsert };
