// a/an helper for user copy (shared/userText.ts article/withArticle). Run: npx tsx test/article.test.ts
import assert from 'node:assert/strict';
import { article, withArticle } from '../src/shared/userText.js';
const an = [8, 11, 18, 80, 83, 800, 8000, 11000, 18000, '8.5', 'image', 'open-weights model', 'hour'];
const a = [1, 2, 5, 6, 10, 12, 15, 100, 110, 180, 1100, 1800, '5.5', 'clip', 'user', 'unique take', 'one-off', 'European voice', 'video'];
for (const x of an) assert.equal(article(x), 'an', String(x));
for (const x of a) assert.equal(article(x), 'a', String(x));
assert.equal(withArticle(8), 'an 8'); assert.equal(withArticle(5), 'a 5');
assert.equal(`Estimate for ${withArticle(8)} s clip`, 'Estimate for an 8 s clip');
console.log('ok article: an 8 / an 11 / an 18 / a 5 / a 110 / an image / a user');
