// Input-stage controls must remain hit-testable despite the transparent overlay container.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../../web/src/shared/resultViewer.css', import.meta.url), 'utf8');
const bar = css.match(/html body \.rvx-inbar\s*\{([^}]+)\}/)?.[1] ?? '';
const button = css.match(/html body \.rvx-inbtn\s*\{([^}]+)\}/)?.[1] ?? '';
assert.match(bar, /pointer-events:none/, 'empty overlay space must not intercept the player');
assert.match(button, /pointer-events:auto/, 'Back to result and Use as reference must accept clicks');
assert.ok(button.indexOf('pointer-events:auto') > button.indexOf('all:unset'), 'restore hit testing after the reset, not before it');
console.log('ok input-stage controls explicitly restore pointer events after all:unset (CSS contract)');
const viewer = readFileSync(new URL('../../web/src/shared/ResultViewer.tsx', import.meta.url), 'utf8');
assert.match(viewer, /\? 'poster' : 'thumb'/, 'bundled video inputs use the poster endpoint, not the uploads-only thumbnail route');
assert.match(viewer, /t\.kind === 'video' \? setFailedPoster\(t\.url\) : onBad\(\)/, 'poster failure cannot mark the underlying video unavailable');
const prefill = readFileSync(new URL('../../web/src/shared/usePrefill.ts', import.meta.url), 'utf8');
assert.match(prefill, /isBundledInputUrl\(ru\)/, 'Use as reference accepts the same narrowly checked bundled inputs');
console.log('ok bundled poster fallback and reference handoff contracts');
