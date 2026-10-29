// B2: the expanding editor must not inherit the old result-caption mask.
// Actual Chromium focus/type/hit-test regression is recorded in the private workflow audit.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../../web/src/canvas/node.css', import.meta.url), 'utf8');
const rule = css.match(/\.gc \.gc-prompt\{([^}]+)\}/)?.[1] ?? '';
assert.match(rule, /overflow:visible!important/);
assert.match(rule, /-webkit-mask-image:none/);
assert.match(rule, /(?:^|;)mask-image:none/);
assert.match(css, /\.gc-prompt\.open \.gc-prompt-in\{[^}]*z-index:6/);
console.log('ok Canvas prompt overlay clears the legacy caption mask with higher specificity');
