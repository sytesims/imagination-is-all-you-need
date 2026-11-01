// Prompt enhance refuses an empty prompt (2026-11-01 review F12): POST /api/prompt/enhance with no words used to answer 200 with an
// invented prompt. Now an empty or whitespace-only prompt is a 400 with a plain message; a real prompt still enhances. (The Enhance
// button in web/src/ui/next/Enhance.tsx is already disabled while the prompt is empty.)
// Run: npx tsx test/enhance-empty-prompt.test.ts   (temp data dir, no network, no server port)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'enhance-empty-'));
const Fastify = (await import('fastify')).default;
const { registerCinema } = await import('../src/cinema/routes.ts');
const ok = (m: string) => console.log('ok ' + m);

const app = Fastify(); registerCinema(app); await app.ready();
const post = async (body: unknown) => { const r = await app.inject({ method: 'POST', url: '/api/prompt/enhance', payload: body as any }); return { status: r.statusCode, body: JSON.parse(r.body) }; };
for (const body of [{}, { prompt: '' }, { prompt: '   \n\t ' }, { prompt: '', kind: 'video' }]) {
  const r = await post(body); assert.equal(r.status, 400, JSON.stringify(body)); assert.equal(r.body.error, 'Type a prompt first, then enhance it.'); assert.equal(r.body.errorType, 'validation');
}
ok('empty or whitespace-only prompt: 400 with a plain message');
const good = await post({ prompt: 'a red fox in the snow', kind: 'image' });
assert.equal(good.status, 200); assert.equal(good.body.original, 'a red fox in the snow'); assert.ok(good.body.prompt.length > 0);
ok('a real prompt still enhances');
const ui = fs.readFileSync(new URL('../../web/src/ui/next/Enhance.tsx', import.meta.url), 'utf8');
assert.match(ui, /disabled=\{!prompt\.trim\(\) \|\| busy\}/, 'the Enhance button stays disabled for an empty prompt');
ok('the Enhance button is disabled for an empty prompt');
await app.close();
