// Coming back to the same place (web/src/shared/tabRestore.ts): the per-page scroll key, saved positions, when a position is reachable,
// and the ?view=<id> param of the open result. Run: npx tsx test/tab-restore.test.ts   (no server, no DOM)
import assert from 'node:assert/strict';
import { scrollKey, parseScroll, canReach, withViewParam, viewParam, ssGet, ssSet, ssJson } from '../../web/src/shared/tabRestore.ts';
const ok = (m: string) => console.log('ok ' + m);

assert.equal(scrollKey('/tools/h3-video', ''), 'ohf:scroll:/tools/h3-video');
assert.equal(scrollKey('/tools/h3-video/', '?view=abc'), 'ohf:scroll:/tools/h3-video', 'the open viewer is not another page');
assert.equal(scrollKey('/tools/h3-video', '?workflow=swap&view=a'), scrollKey('/tools/h3-video', '?view=b&workflow=swap'));
assert.notEqual(scrollKey('/tools/h3-video', '?workflow=swap'), scrollKey('/tools/h3-video', '?workflow=extend'), 'each workflow keeps its own spot');
assert.equal(scrollKey('/', ''), 'ohf:scroll:/'); assert.equal(scrollKey('/Assets', ''), scrollKey('/assets/', ''));
ok('scroll key: path + sorted query, without ?view');

assert.deepEqual(parseScroll('{"y":1200,"h":5000}'), { y: 1200, h: 5000 });
assert.equal(parseScroll('{"y":0}'), null); assert.equal(parseScroll('{"y":-5}'), null); assert.equal(parseScroll('nope'), null); assert.equal(parseScroll(null), null);
assert.deepEqual(parseScroll('{"y":"300.4"}'), { y: 300, h: 0 });
ok('saved positions: only real ones');

assert.equal(canReach(1200, 2000, 800), true); assert.equal(canReach(1200, 1500, 800), false); assert.equal(canReach(1230, 2000, 800), true, 'within 40 px');
ok('reachable once the page is tall enough');

assert.equal(withViewParam('/tools/h3-video?workflow=swap', 'j1'), '/tools/h3-video?workflow=swap&view=j1');
assert.equal(withViewParam('/tools/h3-video?workflow=swap&view=j1', null), '/tools/h3-video?workflow=swap');
assert.equal(withViewParam('/image?view=a#x', 'b'), '/image?view=b#x');
assert.equal(withViewParam('http://localhost:5174/tools/h3-video', 'id with space'), '/tools/h3-video?view=id+with+space');
assert.equal(viewParam('?view=j1&workflow=x'), 'j1'); assert.equal(viewParam('?view='), null); assert.equal(viewParam(''), null);
ok('?view=<id>: set, replace, remove; other params and the hash stay');

/* no sessionStorage in Node: every helper is a quiet no-op */
assert.equal(ssGet('x'), null); ssSet('x', '1'); assert.deepEqual(ssJson('x', { a: 1 }), { a: 1 });
(globalThis as any).sessionStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('blocked'); } };
assert.equal(ssGet('x'), null); ssSet('x', '1'); assert.deepEqual(ssJson('x', 7), 7);
const store = new Map<string, string>(); (globalThis as any).sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
ssSet('k', '{"a":2}'); assert.deepEqual(ssJson('k', null), { a: 2 }); ssSet('bad', '{'); assert.equal(ssJson('bad', 'fb'), 'fb');
ok('sessionStorage helpers never throw (missing, blocked, full, bad JSON)');
console.log('tab-restore: all ok');
