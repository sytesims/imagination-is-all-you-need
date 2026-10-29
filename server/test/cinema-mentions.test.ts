/** P0 regression: Director @mentions. Run: npx tsx test/cinema-mentions.test.ts [baseUrl]  (HTTP part runs when a base URL is given). */
import assert from 'node:assert/strict';
import { unknownMentions } from '../src/shared/mentions.js';
import { parseTimeline } from '../src/cinema/timeline.js';

assert.deepEqual(unknownMentions('@ghost walks'), ['@ghost']);
assert.deepEqual(unknownMentions('walks @'), []);                       // @ at end
assert.deepEqual(unknownMentions('@@ @ x @1 a@b.com'), []);           // malformed / emails
assert.deepEqual(unknownMentions('@ghost @ghost @image1 @Ghost'), ['@ghost', '@Ghost']); // repeated, deduped
assert.deepEqual(unknownMentions('@image2 @img1 @video1 @video'), []);
for (const p of ['@ghost walks', 'walks @', '@', '@@@', '#orbit @', '@ #dolly-in 0-2s']) parseTimeline(p, 5); // never throws
console.log('unit ok');

const base = process.argv[2];
if (base) {
  const post = async (fields: Record<string, string>) => {
    const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    const r = await fetch(`${base}/api/tools/cinema/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any };
  };
  const bal = async () => ((await (await fetch(`${base}/api/usage`)).json()) as any).balance;
  const b0 = await bal();
  let r = await post({ prompt: '@ghost walks' });
  assert.equal(r.status, 400); assert.equal(r.body.error, 'Unknown element @ghost. Add it in Cast & props');
  r = await post({ prompt: '@ghost @ghost walks' }); assert.equal(r.status, 400);
  r = await post({ prompt: 'a man walks @' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await post({ prompt: '@@ @ walks' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await post({ prompt: '', auto: '1' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await post({ prompt: '' }); assert.equal(r.status, 400);
  if (b0 !== undefined) assert.equal(await bal(), b0, 'no ledger charge');
  assert.equal((await fetch(`${base}/api/tools`)).status, 200, 'process alive');
  console.log('http ok');
}
if (base) {
  const tools = await (await fetch(`${base}/api/tools`)).json() as any[];
  const ci = tools.find((t) => t.id === 'create-image'); const styles = ci.app.styles as any[];
  assert.ok(styles.length >= 4, 'create-image ≥4 style presets');
  const urls = styles.map((s) => s.posterUrl); assert.equal(new Set(urls).size, styles.length, 'distinct style posters');
  for (const u of urls) { const r = await fetch(base + u); assert.equal(r.status, 200, u); assert.match(r.headers.get("content-type") || "", /image/, u); }
  console.log(`create-image styles ok (${styles.length} with posters)`);
}
