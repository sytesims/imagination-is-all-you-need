// B7: a clean installation must not invite a sample whose source jobs are missing.
// Source contract; both rendered states are checked separately in the mock browser sandbox.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page = readFileSync(new URL('../../web/src/ui/film/FilmPage.tsx', import.meta.url), 'utf8');
const start = readFileSync(new URL('../../web/src/ui/film/FilmStart.tsx', import.meta.url), 'utf8');
assert.match(page, /const ready = samples\.filter\(x => x\.available\)/);
assert.match(page, /ready\.length \? 'Start from the sample to see how one comes together, or begin with a blank film\.' : 'Start with a blank film and add your first shot\.'/);
assert.match(page, /<FilmStart samples=\{samples\} busy=\{busy\} onSample=\{x => void sample\(x\)\} onBlank=\{\(\) => void make\(\)\}/, 'sample and blank actions remain unchanged');
assert.match(start, /samples\.filter\(x => x\.available\)/, 'the invitation uses the same availability rule as the sample tiles');
console.log('ok B7 empty Editor invitation follows sample availability');
