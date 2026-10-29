#!/usr/bin/env node
// Outline text into SVG path data, so brand artwork renders the same everywhere without shipping fonts.
//
// Library:  import { loadFont, outline } from './outline-text.mjs'
//           const f = loadFont('/path/SpaceGrotesk-Bold.ttf')
//           const t = outline(f, 'Imagination', { x: 0, y: 40, size: 48, tracking: -0.02, anchor: 'start' })
//           t.d (path data), t.width (advance width incl. tracking), t.bbox ({x1,y1,x2,y2})
// CLI:      node scripts/brand/outline-text.mjs --font <file.ttf> --size 48 [--x 0] [--y 0] [--tracking -0.02]
//                [--anchor start|middle|end] [--fill #F7F7F8] "Text to outline"
//           Prints one <path> element. --font may be left out when BRAND_FONT is set.
//
// Needs opentype.js (https://github.com/opentypejs/opentype.js, MIT). It is not a repo dependency: install it in a scratch
// folder (`npm i opentype.js@1.3.4`) and point NODE_PATH at that folder's node_modules, or run from there.
// Use static (non-variable) font files: opentype.js draws a variable font's default instance only.
// Fonts used by the brand: Space Grotesk 700 and Inter 500/400 (both SIL OFL 1.1, from Google Fonts).

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let opentype;
function ot() {
  if (!opentype) {
    // Look next to this script, then in the current folder's node_modules, then in OPENTYPE_DIR (a node_modules folder).
    const tries = [() => require('opentype.js'), () => createRequire(`${process.cwd()}/`)('opentype.js')];
    if (process.env.OPENTYPE_DIR) tries.push(() => require(`${process.env.OPENTYPE_DIR}/opentype.js`));
    for (const t of tries) { try { opentype = t(); break; } catch { /* next */ } }
    if (!opentype) throw new Error('opentype.js not found: run `npm i opentype.js@1.3.4` in a scratch folder and run from there (or set OPENTYPE_DIR to its node_modules)');
  }
  return opentype;
}

/** Load a TTF/OTF (static instance). */
export function loadFont(file) {
  if (!file) throw new Error('No font file given (pass a path, or set BRAND_FONT)');
  return ot().loadSync(file);
}

const r = (n) => {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? '0' : String(v);
};

/** Measure the advance width of text at size, with tracking in em (CSS letter-spacing; not added after the last glyph). */
export function measure(font, text, { size, tracking = 0, kerning = true } = {}) {
  const glyphs = font.stringToGlyphs(text);
  const scale = size / font.unitsPerEm;
  let w = 0;
  glyphs.forEach((g, i) => {
    w += (g.advanceWidth || 0) * scale;
    if (i < glyphs.length - 1) {
      if (kerning) w += font.getKerningValue(g, glyphs[i + 1]) * scale;
      w += tracking * size;
    }
  });
  return w;
}

/** Outline text. y is the baseline. anchor: start | middle | end (on the advance width). */
export function outline(font, text, { x = 0, y = 0, size = 16, tracking = 0, anchor = 'start', kerning = true } = {}) {
  const width = measure(font, text, { size, tracking, kerning });
  let cx = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
  const glyphs = font.stringToGlyphs(text);
  const scale = size / font.unitsPerEm;
  const parts = [];
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  glyphs.forEach((g, i) => {
    const p = g.getPath(cx, y, size);
    const bb = p.getBoundingBox();
    if (p.commands.length) {
      x1 = Math.min(x1, bb.x1); y1 = Math.min(y1, bb.y1); x2 = Math.max(x2, bb.x2); y2 = Math.max(y2, bb.y2);
    }
    for (const c of p.commands) {
      if (c.type === 'M' || c.type === 'L') parts.push(`${c.type}${r(c.x)} ${r(c.y)}`);
      else if (c.type === 'Q') parts.push(`Q${r(c.x1)} ${r(c.y1)} ${r(c.x)} ${r(c.y)}`);
      else if (c.type === 'C') parts.push(`C${r(c.x1)} ${r(c.y1)} ${r(c.x2)} ${r(c.y2)} ${r(c.x)} ${r(c.y)}`);
      else if (c.type === 'Z') parts.push('Z');
    }
    cx += (g.advanceWidth || 0) * scale;
    if (i < glyphs.length - 1) {
      if (kerning) cx += font.getKerningValue(g, glyphs[i + 1]) * scale;
      cx += tracking * size;
    }
  });
  return { d: parts.join(''), width, bbox: { x1, y1, x2, y2 } };
}

/** Font metrics scaled to size: cap height, x-height, ascender, descender (descender is negative). */
export function metrics(font, size) {
  const s = size / font.unitsPerEm;
  const os2 = font.tables.os2 || {};
  return {
    cap: (os2.sCapHeight || font.charToGlyph('H').getBoundingBox().y2) * s,
    xh: (os2.sxHeight || font.charToGlyph('x').getBoundingBox().y2) * s,
    asc: font.ascender * s,
    desc: font.descender * s,
  };
}

function cli(argv) {
  const opts = { size: 16, x: 0, y: 0, tracking: 0, anchor: 'start', fill: '#F7F7F8', font: process.env.BRAND_FONT };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2); const v = argv[++i];
      opts[k] = ['size', 'x', 'y', 'tracking'].includes(k) ? Number(v) : v;
    } else rest.push(a);
  }
  if (!rest.length) {
    console.error('usage: outline-text.mjs --font <file.ttf> --size <px> [--x] [--y] [--tracking em] [--anchor start|middle|end] [--fill #hex] "text"');
    process.exit(2);
  }
  const t = outline(loadFont(opts.font), rest.join(' '), opts);
  console.log(`<path fill="${opts.fill}" d="${t.d}"/>`);
  console.error(`width ${r(t.width)}  bbox ${r(t.bbox.x1)},${r(t.bbox.y1)} ${r(t.bbox.x2)},${r(t.bbox.y2)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) cli(process.argv.slice(2));
