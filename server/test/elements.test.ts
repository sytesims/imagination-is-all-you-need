/** Saved Elements auto-attach. Run: npx tsx test/elements.test.ts [baseUrl]  (HTTP part needs a running server). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveElements } from '../src/elements/resolve.js';

const els = [{ id: 'a', name: 'Flat', url: '/files/a.png' }, { id: 'b', name: 'flat two', url: '/files/b.png' }, { id: 'c', name: 'Hero', url: '/files/c.png' }];
let r = resolveElements('@Flat_Two at night with @hero and @HERO', els);
assert.deepEqual(r.attached.map((e) => e.id), ['b', 'c']); assert.equal(r.mentions.length, 3); assert.deepEqual(r.unknown, []);
assert.deepEqual(resolveElements('@flat-two', els).attached.map((e) => e.id), ['b']);      // separators interchangeable, longest wins
assert.deepEqual(resolveElements('@flat 2', els).attached.map((e) => e.id), ['a']);        // "flat two" doesn't match, "Flat" does
assert.deepEqual(resolveElements('@flatter', els).unknown, ['@flatter']);                  // word boundary
assert.deepEqual(resolveElements('@ghost @image1 @video a@b.com @ @@', els), { attached: [], mentions: [], unknown: ['@ghost'] });
console.log('unit ok');

const base = process.argv[2];
if (base) {
  const png = readFileSync(new URL('../samples/sample-character.png', import.meta.url));
  const mk = async (name: string) => { const fd = new FormData(); fd.append('image', new Blob([png], { type: 'image/png' }), 'x.png'); fd.append('name', name); fd.append('kind', 'character');
    return (await (await fetch(`${base}/api/elements`, { method: 'POST', body: fd })).json()) as any; };
  const post = async (tool: string, f: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v);
    const res = await fetch(`${base}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); return { status: res.status, body: await res.json() as any }; };
  const bal = async () => ((await (await fetch(`${base}/api/usage`)).json()) as any).balance;
  const tag = 'T' + Date.now().toString(36);
  const e1 = await mk(`${tag} Nova`), e2 = await mk(`${tag} Nova Prime`);
  try {
    const pv = await (await fetch(`${base}/api/elements/resolve?prompt=${encodeURIComponent(`@${tag}_nova_prime meets @${tag}-NOVA and @ghost`)}`)).json() as any;
    assert.deepEqual(pv.attached.map((e: any) => e.id), [e2.id, e1.id]); assert.deepEqual(pv.unknown, ['@ghost']); assert.equal(pv.ok, false);
    const b0 = await bal();
    let j = await post('cinema', { prompt: `@${tag}_nova walks @ghost`, rights: '1' });
    assert.equal(j.status, 400); assert.equal(j.body.error, 'Unknown element @ghost. Add it in Cast & props');
    j = await post('restyle', { prompt: `@ghost in watercolour`, preset: 'watercolor', rights: '1' }); assert.equal(j.status, 400); assert.match(j.body.error, /Unknown element @ghost/);
    assert.equal(await bal(), b0, 'no charge on 400');
    j = await post('cinema', { prompt: `@${tag}_nova_prime walks past @${tag} nova`, rights: '1' });
    assert.equal(j.status, 200, JSON.stringify(j.body));
    const job = await (await fetch(`${base}/api/jobs/${j.body.id}`)).json() as any;
    assert.deepEqual(job.elements.map((e: any) => [e.id, e.refIndex]), [[e2.id, 1], [e1.id, 2]]);
    assert.equal(job.input.refUrls.length, 2);
    const many: Record<string, string> = { prompt: Array.from({ length: 9 }, (_, i) => `@${tag}x${i}`).join(' ') };
    const extra = []; for (let i = 0; i < 9; i++) extra.push(await mk(`${tag}x${i}`));
    j = await post('cinema', many); assert.equal(j.status, 400); assert.match(j.body.error, /over the 8 limit|Up to 8 assets/); // cinema's own maxRefs check can answer first
    for (const e of extra) await fetch(`${base}/api/elements/${e.id}`, { method: 'DELETE' });
    console.log('http ok');
  } finally { for (const e of [e1, e2]) await fetch(`${base}/api/elements/${e.id}`, { method: 'DELETE' }); }
}
