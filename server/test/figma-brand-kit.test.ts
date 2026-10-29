// Brand Kit Figma plugin (integrations/figma-brand-kit/code.js): the token → variable mapping and the update-by-name rule, with a stand-in for
// the Figma API (the plugin itself has not been run inside Figma). Our own tokens file (shared/brandKit tokensOf) and the newer DTCG value forms
// (colour objects, {value, unit} dimensions, aliases) map to COLOR / FLOAT / STRING variables, paint styles bound to the colour variables and text
// styles; a second import of the same kit updates by name and creates nothing; a missing font is skipped with a note.
// Run: npx tsx test/figma-brand-kit.test.ts   (no server, no network)
import assert from 'node:assert/strict'; import { createRequire } from 'node:module'; import path from 'node:path';
import { BUILTIN_KIT, tokensOf } from '../src/shared/brandKit.ts';
const req = createRequire(import.meta.url);
const P = req(path.resolve(import.meta.dirname, '../../integrations/figma-brand-kit/code.js'));
const ok = (m: string) => console.log('ok ' + m);

// mapping
assert.deepEqual(P.parseColor('#FF7A1A'), { r: 1, g: 122 / 255, b: 26 / 255, a: 1 }); assert.deepEqual(P.parseColor('#fff'), { r: 1, g: 1, b: 1, a: 1 });
assert.deepEqual(P.parseColor({ colorSpace: 'srgb', components: [1, 0.5, 0], alpha: 0.5 }), { r: 1, g: 0.5, b: 0, a: 0.5 }); assert.equal(P.parseColor('red'), null); assert.equal(P.parseColor({ colorSpace: 'oklch', components: [0.7, 0.1, 40] }), null);
assert.equal(P.parseDimension('16px'), 16); assert.equal(P.parseDimension('1.5rem'), 24); assert.equal(P.parseDimension({ value: 8, unit: 'px' }), 8); assert.equal(P.parseDimension('auto'), null);
assert.equal(P.parseFontFamily(['Space Grotesk', 'sans-serif']), 'Space Grotesk');
const plan = P.planFromTokens(tokensOf(BUILTIN_KIT));
assert.equal(plan.kitName, 'Imagination');
assert.deepEqual(plan.colors.map((c: any) => c.name), ['color/primary', 'color/secondary', 'color/accent', 'color/background', 'color/text']);
assert.ok(plan.colors.every((c: any) => ['r', 'g', 'b'].every((k) => c.color[k] >= 0 && c.color[k] <= 1)), 'colours in 0..1');
assert.deepEqual(plan.fonts.map((f: any) => [f.name, f.family]), [['font/heading', 'Space Grotesk'], ['font/body', 'Manrope']]);
assert.ok(plan.numbers.some((n: any) => n.name === 'spacing/md' && n.value === 16)); assert.ok(plan.numbers.some((n: any) => n.name === 'radius/pill' && n.value === 999));
assert.deepEqual(P.textStylesOf(plan).map((t: any) => [t.name, t.size]), [['Imagination/Heading', 32], ['Imagination/Body', 16]]);
const p2 = P.planFromTokens({ brand: { $type: 'color', main: { $value: { colorSpace: 'srgb', components: [0, 0.5, 1] } }, link: { $value: '{brand.main}' } }, gap: { $type: 'dimension', s: { $value: { value: 4, unit: 'px' } } }, odd: { $type: 'shadow', x: { $value: {} } } });
assert.equal(p2.kitName, 'Brand'); assert.deepEqual(p2.colors[1].color, { r: 0, g: 0.5, b: 1, a: 1 }, 'an alias resolves'); assert.equal(p2.numbers[0].value, 4); assert.deepEqual(p2.skipped, ['odd/x']);
assert.throws(() => P.planFromTokens([]), /tokens file/); assert.throws(() => P.planFromTokens({ a: { $type: 'shadow', b: { $value: 1 } } }), /No colour/);
ok('tokens → plan (our file, DTCG object values, aliases, skipped types)');

// a stand-in Figma API: just enough of figma.variables / styles / fonts to watch what is made
function fakeFigma(installed: string[]) {
  let n = 0; const colls: any[] = []; const vars: any[] = []; const paints: any[] = []; const texts: any[] = []; const loaded: string[] = [];
  const api = {
    variables: {
      getLocalVariableCollectionsAsync: async () => colls.slice(),
      createVariableCollection: (name: string) => { const c = { id: `c${++n}`, name, defaultModeId: `m${n}` }; colls.push(c); return c; },
      getLocalVariablesAsync: async () => vars.slice(),
      createVariable: (name: string, coll: any, type: string) => { const v: any = { id: `v${++n}`, name, variableCollectionId: coll.id, resolvedType: type, values: {}, setValueForMode(m: string, x: unknown) { this.values[m] = x; }, remove() { vars.splice(vars.indexOf(this), 1); } }; vars.push(v); return v; },
      setBoundVariableForPaint: (p: any, field: string, v: any) => ({ ...p, boundVariables: { [field]: { type: 'VARIABLE_ALIAS', id: v.id } } }),
    },
    getLocalPaintStylesAsync: async () => paints.slice(), createPaintStyle: () => { const s = { id: `s${++n}`, name: '', paints: [] }; paints.push(s); return s; },
    getLocalTextStylesAsync: async () => texts.slice(), createTextStyle: () => { const s = { id: `t${++n}`, name: '' }; texts.push(s); return s; },
    listAvailableFontsAsync: async () => installed.flatMap((f) => ['Regular', 'Bold'].map((style) => ({ fontName: { family: f, style } }))),
    loadFontAsync: async (f: any) => { loaded.push(`${f.family} ${f.style}`); },
  };
  return { api, colls, vars, paints, texts, loaded };
}
const F = fakeFigma(['Space Grotesk']);
const r1 = await P.applyPlan(F.api, plan);
assert.equal(F.colls.length, 1); assert.equal(F.colls[0].name, 'Imagination brand');
assert.equal(F.vars.filter((v) => v.resolvedType === 'COLOR').length, 5); assert.equal(F.vars.filter((v) => v.resolvedType === 'FLOAT').length, plan.numbers.length); assert.equal(F.vars.filter((v) => v.resolvedType === 'STRING').length, 2);
const prim = F.vars.find((v) => v.name === 'color/primary'); assert.deepEqual(prim.values[F.colls[0].defaultModeId], plan.colors[0].color);
assert.deepEqual(F.paints.map((s) => s.name), ['Imagination/primary', 'Imagination/secondary', 'Imagination/accent', 'Imagination/background', 'Imagination/text']);
assert.equal(F.paints[0].paints[0].boundVariables.color.id, prim.id, 'paint style bound to its variable');
assert.deepEqual(F.texts.map((t) => [t.name, t.fontName.family, t.fontName.style]), [['Imagination/Heading', 'Space Grotesk', 'Bold']]);
assert.ok(r1.notes.some((x: string) => /Manrope isn’t installed/.test(x)), 'a missing font is a note, not a failure');
ok(`first import: ${r1.created} made`);

// second import, a colour changed: same objects, updated in place
const t2 = tokensOf({ ...BUILTIN_KIT, colors: BUILTIN_KIT.colors.map((c, i) => (i ? c : { ...c, hex: '#00AAFF' })) });
const before = { c: F.colls.length, v: F.vars.length, p: F.paints.length, t: F.texts.length };
const r2 = await P.applyPlan(F.api, P.planFromTokens(t2));
assert.deepEqual({ c: F.colls.length, v: F.vars.length, p: F.paints.length, t: F.texts.length }, before, 'nothing duplicated');
assert.equal(r2.created, 0); assert.ok(r2.updated > 0);
assert.deepEqual(F.vars.find((v) => v.name === 'color/primary').values[F.colls[0].defaultModeId], { r: 0, g: 170 / 255, b: 1, a: 1 }, 'value updated');
ok(`second import: ${r2.updated} updated, 0 made`);
console.log('PASS figma-brand-kit');
