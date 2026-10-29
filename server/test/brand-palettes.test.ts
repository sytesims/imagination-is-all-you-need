// Brand palette files (shared/brandPalettes): each writer's output is read back by a small independent reader here and the colours must round-trip.
// .ase (Adobe), .swatches (Procreate: a zip of Swatches.json), .gpl (GIMP / Blender), .sketchpalette (Sketch Palettes plugin). 1, 5 and 12 colours,
// an empty kit, odd names (accents, emoji, tabs).
// Run: npx tsx test/brand-palettes.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { BUILTIN_KIT, BRAND_LIMITS, hexToRgb, type BrandColor } from '../src/shared/brandKit.ts';
import { aseOf, crc32, gplOf, hexToHsb, paletteFileOf, procreateOf, sketchPaletteOf } from '../src/shared/brandPalettes.ts';
const ok = (m: string) => console.log('ok ' + m);

// ---------------------------------------------------------------- independent readers
function readAse(b: Uint8Array) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength); let p = 0;
  const sig = String.fromCharCode(...b.slice(0, 4)); assert.equal(sig, 'ASEF'); p = 4;
  assert.equal(v.getUint16(p), 1); assert.equal(v.getUint16(p + 2), 0); p += 4; const count = v.getUint32(p); p += 4;
  const name = (at: number) => { const n = v.getUint16(at); let s = ''; for (let i = 0; i < n - 1; i++) s += String.fromCharCode(v.getUint16(at + 2 + i * 2)); assert.equal(v.getUint16(at + 2 + (n - 1) * 2), 0, 'name ends with 0'); return { s, end: at + 2 + n * 2 }; };
  const groups: string[] = []; const colors: { name: string; rgb: number[]; type: number }[] = []; let depth = 0;
  for (let i = 0; i < count; i++) {
    const type = v.getUint16(p), len = v.getUint32(p + 2); const body = p + 6; p = body + len;
    if (type === 0xc001) { groups.push(name(body).s); depth++; }
    else if (type === 0xc002) { assert.equal(len, 0); depth--; }
    else if (type === 0x0001) { const nm = name(body); const model = String.fromCharCode(...b.slice(nm.end, nm.end + 4)); assert.equal(model, 'RGB ');
      const rgb = [0, 1, 2].map((k) => v.getFloat32(nm.end + 4 + k * 4)); const t = v.getUint16(nm.end + 16); assert.equal(nm.end + 18, p, 'block length matches'); colors.push({ name: nm.s, rgb, type: t }); }
    else assert.fail(`unknown block ${type}`);
  }
  assert.equal(p, b.length, 'no trailing bytes'); assert.equal(depth, 0, 'groups closed');
  return { groups, colors };
}
function readZip(b: Uint8Array) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength); const e = b.length - 22; assert.equal(v.getUint32(e, true), 0x06054b50, 'end record');
  const n = v.getUint16(e + 10, true), cdSize = v.getUint32(e + 12, true), cdAt = v.getUint32(e + 16, true); assert.equal(cdAt + cdSize, e);
  const files: Record<string, Uint8Array> = {}; let p = cdAt;
  for (let i = 0; i < n; i++) {
    assert.equal(v.getUint32(p, true), 0x02014b50); const method = v.getUint16(p + 10, true), crc = v.getUint32(p + 16, true), size = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), at = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(b.slice(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl; assert.equal(method, 0, 'stored');
    assert.equal(v.getUint32(at, true), 0x04034b50); const lnl = v.getUint16(at + 26, true), lxl = v.getUint16(at + 28, true); const data = b.slice(at + 30 + lnl + lxl, at + 30 + lnl + lxl + size);
    assert.equal(crc32(data), crc, 'crc'); files[name] = data;
  }
  return files;
}
const hsbToRgb = (h: number, s: number, v: number) => { const f = (n: number) => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return [f(5), f(3), f(1)].map((x) => Math.round(x * 255)); };
function readGpl(t: string) {
  const lines = t.split('\n'); assert.equal(lines[0], 'GIMP Palette'); const out: { rgb: number[]; name: string }[] = []; let name = '';
  for (const l of lines.slice(1)) { if (!l.trim() || l.startsWith('#')) continue; const m = /^Name:\s*(.*)$/.exec(l); if (m) { name = m[1]; continue; } if (/^Columns:\s*\d+$/.test(l)) continue;
    const c = /^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s*(?:\t(.*))?$/.exec(l); assert.ok(c, `bad line: ${l}`); out.push({ rgb: [+c[1], +c[2], +c[3]], name: c[4] ?? '' }); }
  return { name, colors: out };
}

// ---------------------------------------------------------------- kits
const twelve: BrandColor[] = Array.from({ length: BRAND_LIMITS.colors }, (_, i) => ({ hex: '#' + [i * 21, 255 - i * 20, (i * 97) % 256].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase(), name: i === 3 ? 'Café\tcrème 🍦' : '', role: '' }));
const kits = [
  { name: 'Imagination', colors: BUILTIN_KIT.colors },
  { name: 'Solo', colors: [{ hex: '#000000', name: 'Black', role: 'primary' }] as BrandColor[] },
  { name: 'Twelve · Ünïcode 🍦', colors: twelve },
  { name: '', colors: [{ hex: '#ffffff', name: '', role: '' }] as BrandColor[] },
];
const near = (a: number[], b: number[], tol: number, what: string) => a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) <= tol, `${what}: ${a} vs ${b}`));

for (const kit of kits) {
  const want = kit.colors.map((c) => hexToRgb(c.hex.toUpperCase()));
  // ASE
  const ase = readAse(aseOf(kit)); assert.deepEqual(ase.groups, [kit.name || 'Brand']); assert.equal(ase.colors.length, want.length);
  ase.colors.forEach((c, i) => { near(c.rgb.map((x) => Math.round(x * 255)), want[i], 0, 'ase'); assert.equal(c.type, 2); });
  if (kit.colors[0].name) assert.equal(ase.colors[0].name, kit.colors[0].name);
  // Procreate
  const files = readZip(procreateOf(kit)); assert.deepEqual(Object.keys(files), ['Swatches.json']);
  const pj = JSON.parse(new TextDecoder().decode(files['Swatches.json'])); assert.ok(Array.isArray(pj) && pj.length === 1); assert.equal(pj[0].name, kit.name || 'Brand');
  assert.equal(pj[0].swatches.length, want.length);
  pj[0].swatches.forEach((s: any, i: number) => { for (const k of ['hue', 'saturation', 'brightness', 'alpha']) assert.ok(s[k] >= 0 && s[k] <= 1, k); assert.equal(s.colorSpace, 0); near(hsbToRgb(s.hue, s.saturation, s.brightness), want[i], 1, 'procreate'); });
  // GIMP
  const g = readGpl(gplOf(kit)); assert.equal(g.name, kit.name || 'Brand'); assert.deepEqual(g.colors.map((c) => c.rgb), want);
  assert.ok(g.colors.every((c) => !/[\t\n]/.test(c.name) && c.name.length > 0), 'every line has a one-line name');
  // Sketch
  const sk = JSON.parse(sketchPaletteOf(kit)); assert.equal(sk.compatibleVersion, '2.0'); assert.equal(sk.colors.length, want.length);
  sk.colors.forEach((c: any, i: number) => { near([c.red, c.green, c.blue].map((x: number) => Math.round(x * 255)), want[i], 0, 'sketch'); assert.equal(c.alpha, 1); });
}
ok('ase, swatches, gpl, sketchpalette round-trip 5, 1, 12 colours and an unnamed kit');

// HSB corners
assert.deepEqual(hexToHsb('#FF0000'), [0, 1, 1]); assert.deepEqual(hexToHsb('#000000'), [0, 0, 0]); assert.deepEqual(hexToHsb('#FFFFFF'), [0, 0, 1]);
near(hsbToRgb(...hexToHsb('#3DDC97')), [0x3d, 0xdc, 0x97], 0, 'hsb');
// a kit with no colours still makes valid, empty files
const none = { name: 'Empty', colors: [] as BrandColor[] };
assert.equal(readAse(aseOf(none)).colors.length, 0); assert.equal(JSON.parse(new TextDecoder().decode(readZip(procreateOf(none))['Swatches.json']))[0].swatches.length, 0); assert.equal(readGpl(gplOf(none)).colors.length, 0);
// bad hex values are left out, not written as black
assert.equal(readAse(aseOf({ name: 'x', colors: [{ hex: 'nope', name: '', role: '' }, { hex: '#abc', name: '', role: '' }] })).colors.length, 1);
// file names and types
assert.deepEqual(['ase', 'procreate', 'gpl', 'sketch'].map((k) => paletteFileOf({ name: 'Acme Co', colors: [] }, k as any).name), ['acme-co.ase', 'acme-co.swatches', 'acme-co.gpl', 'acme-co.sketchpalette']);
// known CRC
assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
ok('empty kit, bad hex, file names, crc32');
