#!/usr/bin/env node
// Redraws the app name in the brand artwork as outlined paths (no fonts needed to view the files).
//
//   node scripts/brand/build-name-art.mjs --display <SpaceGrotesk-Bold.ttf> --text <Inter-Medium.ttf> --body <Inter-Regular.ttf> [--repo <dir>]
//   (or set BRAND_FONT_DISPLAY, BRAND_FONT_TEXT, BRAND_FONT_BODY)
//
// Static font files from Google Fonts (all SIL OFL 1.1): Space Grotesk 700, Inter 500, Inter 400. They are not in the repo.
// opentype.js must be installed in a scratch folder: see outline-text.mjs. Run from that folder, with absolute paths.
//
// What it writes:
//   brand/wordmark.svg, wordmark-light.svg                    inline lockup: mark, "Imagination", "is all you need" (256.31 x 36.5)
//   brand/wordmark-stacked.svg, wordmark-stacked-light.svg    stacked lockup, as in the app header (36.5 tall)
//   brand/preview.svg, brand/social/*.svg, brand/video/*.svg  only the parts between <!--slot:x--> and <!--/slot:x--> markers,
//                                                             the <title>, and any <g data-shift="x" transform="..."> offsets.
// Everything else in those files (background art, chips, links) is left as it is. Rasterise with: sips -s format png in.svg --out out.png

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFont, outline } from './outline-text.mjs';

const NAME = 'Imagination Is All You Need';
const T1 = 'Imagination';
const T2 = 'is all you need';
const SUBTITLE = 'An open studio for images, video, audio and 3D';
const TAGLINE = 'If you can imagine it, you can make it here.';

const C = {
  dark: { t1: '#F7F7F8', t2: '#FF7A1A', core: '#F7F7F8' },
  light: { t1: '#14151A', t2: '#E0640A', core: '#14151A' },
  grey: '#898A8B',
};

// The Orbit mark, unchanged from brand/logo-mark.svg (48-unit grid). Visual box is 5.75..42.25 (36.5 units) with the round caps.
const markArcs = '<g fill="none" stroke="#FF7A1A" stroke-width="5.5" stroke-linecap="round"><path d="M32.89 11.3A15.5 15.5 0 0 1 38.05 30.55"/><path d="M30.55 38.05A15.5 15.5 0 0 1 11.3 32.89"/><path d="M8.56 22.65A15.5 15.5 0 0 1 22.65 8.56"/></g>';
const MARK_BOX = 36.5;
const r = (n) => String(Math.round(n * 100) / 100);

// Proportions from the app header (web/src/styles.css .wm-*): mark 26 px, gap 8, "Imagination" 17 px (-0.02em),
// stacked: "is all you need" 10.5 px (+0.06em) on the next line (baseline 13.94 px lower); inline: 13 px beside it, gap 6.
const P = {
  mark: 26 / 17, gap: 8 / 17, t1Track: -0.02,
  stack: { t2: 10.5 / 17, t2Track: 0.06, lead: 13.94 / 17 },
  inline: { t2: 13 / 17, t2Track: 0.02, gap: 6 / 17 },
};

function args() {
  const a = process.argv.slice(2); const o = {};
  for (let i = 0; i < a.length; i += 2) o[a[i].replace(/^--/, '')] = a[i + 1];
  const here = path.dirname(fileURLToPath(import.meta.url));
  return {
    display: o.display || process.env.BRAND_FONT_DISPLAY,
    text: o.text || process.env.BRAND_FONT_TEXT,
    body: o.body || process.env.BRAND_FONT_BODY,
    repo: o.repo || path.resolve(here, '../..'),
  };
}

function mark(x, y, size, core, { grid48 = false } = {}) {
  // (x, y) = top-left of the mark's visual box.
  const k = size / MARK_BOX;
  const inner = `${markArcs}<circle cx="24" cy="24" r="6" fill="${core}"/>`;
  if (grid48) return `<g transform="translate(${r(x - 5.75 * k)} ${r(y - 5.75 * k)}) scale(${r(k * 1000) / 1000})">${inner}</g>`;
  return `<g transform="translate(${r(x)} ${r(y)}) scale(${Math.round(k * 10000) / 10000})"><g transform="translate(-5.75 -5.75) scale(1)">${inner}</g></g>`;
}

function makeKit(F) {
  const text = (font, str, o) => {
    const t = outline(font, str, o);
    return { ...t, svg: `<path fill="${o.fill}" d="${t.d}"/>` };
  };
  const capOf = (A) => -outline(F.display, 'I', { size: A }).bbox.y1;

  /** Lockup. layout stack | inline. A = "Imagination" font size. (cx, cy) = centre of the whole lockup, or x = left edge with align 'start'. */
  function lockup({ layout, A, theme = 'dark', x = 0, cx, cy }) {
    const c = C[theme];
    const M = P.mark * A, G = P.gap * A;
    const w1 = outline(F.display, T1, { size: A, tracking: P.t1Track }).width;
    if (layout === 'stack') {
      const s2 = P.stack.t2 * A;
      const w2 = outline(F.text, T2, { size: s2, tracking: P.stack.t2Track }).width;
      // top of the block = highest ink of "Imagination" (the i dots sit just above cap height)
      const b1 = Math.max(capOf(A), -outline(F.display, T1, { size: A, tracking: P.t1Track }).bbox.y1), b2 = b1 + P.stack.lead * A;
      const bottom = b2 + outline(F.text, 'y', { size: s2, y: 0 }).bbox.y2;
      const h = Math.max(bottom, M), w = M + G + Math.max(w1, w2);
      const left = cx !== undefined ? cx - w / 2 : x;
      const textTop = cy - bottom / 2;
      const t1 = text(F.display, T1, { x: left + M + G, y: textTop + b1, size: A, tracking: P.t1Track, fill: c.t1 });
      const t2 = text(F.text, T2, { x: left + M + G, y: textTop + b2, size: s2, tracking: P.stack.t2Track, fill: c.t2 });
      return { svg: mark(left, cy - M / 2, M, c.core) + t1.svg + t2.svg, w, h, left, top: cy - h / 2 };
    }
    const s2 = P.inline.t2 * A;
    const w2 = outline(F.text, T2, { size: s2, tracking: P.inline.t2Track }).width;
    const gi = P.inline.gap * A;
    const w = M + G + w1 + gi + w2;
    const left = cx !== undefined ? cx - w / 2 : x;
    const base = cy + capOf(A) / 2;
    const t1 = text(F.display, T1, { x: left + M + G, y: base, size: A, tracking: P.t1Track, fill: c.t1 });
    const t2 = text(F.text, T2, { x: left + M + G + w1 + gi, y: base, size: s2, tracking: P.inline.t2Track, fill: c.t2 });
    return { svg: mark(left, cy - M / 2, M, c.core) + t1.svg + t2.svg, w, h: M, left, top: cy - M / 2 };
  }

  /** "Imagination" over "is all you need", centred on cx, no mark. b1 = first baseline. */
  function nameStack({ A, cx, b1, theme = 'dark' }) {
    const c = C[theme];
    const s2 = P.stack.t2 * A;
    return text(F.display, T1, { x: cx, y: b1, size: A, tracking: P.t1Track, anchor: 'middle', fill: c.t1 }).svg
      + text(F.text, T2, { x: cx, y: b1 + P.stack.lead * A, size: s2, tracking: P.stack.t2Track, anchor: 'middle', fill: c.t2 }).svg;
  }

  /** Width of the inline lockup per unit of A. */
  const inlineWidth = (A) => lockup({ layout: 'inline', A, cx: 0, cy: 0 }).w;
  return { text, lockup, nameStack, inlineWidth, capOf };
}

function setSlot(src, name, content, file) {
  const re = new RegExp(`<!--slot:${name}-->[\\s\\S]*?<!--/slot:${name}-->`);
  if (!re.test(src)) throw new Error(`${file}: slot "${name}" not found`);
  return src.replace(re, `<!--slot:${name}-->${content}<!--/slot:${name}-->`);
}
function setShift(src, name, dy, file) {
  const re = new RegExp(`(<g data-shift="${name}" transform=")[^"]*(")`);
  if (!re.test(src)) throw new Error(`${file}: shift "${name}" not found`);
  return src.replace(re, `$1translate(0 ${r(dy)})$2`);
}
const setTitle = (src, t) => src.replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`);

function main() {
  const o = args();
  for (const k of ['display', 'text', 'body']) if (!o[k]) throw new Error(`Missing --${k} font file`);
  const F = { display: loadFont(o.display), text: loadFont(o.text), body: loadFont(o.body) };
  const K = makeKit(F);
  const B = (p) => path.join(o.repo, 'brand', p);
  const written = [];
  const write = (p, s) => { fs.writeFileSync(B(p), s); written.push(`brand/${p}`); };

  // 1. Inline wordmark, same 256.31 x 36.5 box as before: fill the width, centre vertically.
  {
    const W = 256.31, H = 36.5;
    const A = W / K.inlineWidth(1);
    for (const theme of ['dark', 'light']) {
      const l = K.lockup({ layout: 'inline', A, theme, x: 0, cy: H / 2 });
      write(theme === 'dark' ? 'wordmark.svg' : 'wordmark-light.svg',
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><title>${NAME}</title>${l.svg}</svg>\n`);
    }
  }
  // 2. Stacked wordmark (app header layout), 36.5 tall like the inline one; width follows the text.
  {
    const H = 36.5;
    const probe = K.lockup({ layout: 'stack', A: 10, cx: 0, cy: 0 });
    const A = 10 * H / probe.h;
    const W = Math.ceil(K.lockup({ layout: 'stack', A, x: 0, cy: H / 2 }).w * 100) / 100;
    for (const theme of ['dark', 'light']) {
      const l = K.lockup({ layout: 'stack', A, theme, x: 0, cy: H / 2 });
      write(theme === 'dark' ? 'wordmark-stacked.svg' : 'wordmark-stacked-light.svg',
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><title>${NAME}</title>${l.svg}</svg>\n`);
    }
  }

  const edit = (p, fn) => { const s = fs.readFileSync(B(p), 'utf8'); write(p, fn(s, p)); };

  // 3. Logo preview: stacked lockup, and the inline one under it, on each half.
  edit('preview.svg', (s, f) => {
    s = setTitle(s, `${NAME} logo preview`);
    for (const [slot, cx, theme] of [['dark', 400, 'dark'], ['light', 1200, 'light']]) {
      const st = K.lockup({ layout: 'stack', A: 54, theme, cx, cy: 592 });
      const il = K.lockup({ layout: 'inline', A: 24, theme, cx, cy: 706 });
      s = setSlot(s, `lockup-${slot}`, st.svg + il.svg, f);
    }
    return s;
  });

  // 4. README hero (1600 x 500): name, subtitle, tagline, then the chips that are already there.
  edit('social/readme-hero.svg', (s, f) => {
    s = setTitle(s, NAME);
    s = setSlot(s, 'name', K.lockup({ layout: 'inline', A: 76, cx: 800, cy: 184 }).svg, f);
    s = setSlot(s, 'subtitle', K.text(F.display, SUBTITLE, { x: 800, y: 310, size: 40, anchor: 'middle', fill: C.dark.t1 }).svg, f);
    s = setSlot(s, 'tagline', K.text(F.body, TAGLINE, { x: 800, y: 358, size: 24, anchor: 'middle', fill: C.grey }).svg, f);
    return s;
  });

  // 5. GitHub social preview (1280 x 640): left column. Stacked name, subtitle, then chips and link (shifted to keep the column centred).
  edit('social/github-social-preview.svg', (s, f) => {
    s = setTitle(s, NAME);
    const A = 76, left = 96;
    const probe = K.lockup({ layout: 'stack', A, x: left, cy: 0 });
    const subSize = 26, gapA = 44, gapB = 40, chipsH = 40, gapC = 43, linkH = 18;
    const subCap = 0.727 * subSize, subDesc = 0.24 * subSize;
    const total = probe.h + gapA + subCap + subDesc + gapB + chipsH + gapC + linkH;
    const top = 320 - total / 2;
    const name = K.lockup({ layout: 'stack', A, x: left, cy: top + probe.h / 2 });
    const subBase = top + probe.h + gapA + subCap;
    const chipsTop = subBase + subDesc + gapB;
    s = setSlot(s, 'name', name.svg, f);
    s = setSlot(s, 'subtitle', K.text(F.body, SUBTITLE, { x: left, y: subBase, size: subSize, fill: C.grey }).svg, f);
    s = setShift(s, 'info', chipsTop - 486, f);
    return s;
  });

  // 6. Post templates: small inline lockup where the old one was.
  edit('social/post-square-1080.svg', (s, f) => {
    s = setTitle(s, `${NAME} post template, square`);
    return setSlot(s, 'name', K.lockup({ layout: 'inline', A: 32, x: 64, cy: 96 }).svg, f);
  });
  edit('social/post-vertical-1080x1920.svg', (s, f) => {
    s = setTitle(s, `${NAME} post template, vertical`);
    return setSlot(s, 'name', K.lockup({ layout: 'inline', A: 42, cx: 540, cy: 170 }).svg, f);
  });

  // 7. Video cards.
  edit('video/end-card.svg', (s, f) => {
    s = setTitle(s, NAME);
    s = setSlot(s, 'name', K.lockup({ layout: 'inline', A: 72, cx: 960, cy: 410 }).svg, f);
    return setSlot(s, 'subtitle', K.text(F.display, SUBTITLE, { x: 960, y: 551, size: 40, anchor: 'middle', fill: C.dark.t1 }).svg, f);
  });
  edit('video/title-card.svg', (s, f) => {
    s = setTitle(s, NAME);
    const up = 42; // keeps mark + name + tagline centred where the old block was
    const A = 108, b1 = 680 - up;
    const M = MARK_BOX * 5.2; // same mark size as before (scale 5.2 on the 48 grid), centred on x 960
    const content = mark(960 - M / 2, 432 - up - M / 2, M, C.dark.core, { grid48: true })
      + K.nameStack({ A, cx: 960, b1 })
      + K.text(F.body, TAGLINE, { x: 960, y: b1 + P.stack.lead * A + 76, size: 36, anchor: 'middle', fill: C.grey }).svg;
    return setSlot(s, 'name', content, f);
  });
  edit('video/lower-third.svg', (s) => setTitle(s, `${NAME} lower third`));

  console.log(written.join('\n'));
}

main();
