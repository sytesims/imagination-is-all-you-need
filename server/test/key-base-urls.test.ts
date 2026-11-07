// Address overrides a key goes to (security review 2026-11-07, F6, F8).
//  - baseWarnings: a line for an override that isn't the provider's own https host, or plain http to another computer; nothing for
//    the provider's own host, this computer, or an unset one. Doctor shows them (from the env file); GET /api/settings/providers has them.
//  - COMFY_DEPLOY_URL: https only (plain http only on this computer); the deployment says why it isn't used.
//  - Hugging Face / Civitai tokens only over https.
// Run: npx tsx test/key-base-urls.test.ts (in process, no network, fake keys only).
import assert from 'node:assert/strict';
const ok = (m: string) => console.log('ok ' + m);
Object.assign(process.env, { OPENHIGGSFIELD_BACKEND: 'mock' });

const { baseWarnings, BASE_OVERRIDES } = await import('../src/security/baseUrls.js');
{ const vals: Record<string, string> = { BFL_BASE_URL: 'https://api.eu1.bfl.ai', OPENAI_BASE_URL: 'https://openai-proxy.example.org/v1', GEMINI_BASE_URL: 'http://192.168.1.9:8080',
    COMFY_ROUTER_URL: 'http://127.0.0.1:9100', COMFY_RUNNER_URL: 'https://runner.example.org', TRANSLATE_URL: 'http://10.0.0.3:5000', PLACE_KIE_BASE_URL: 'https://api.kie.ai' };
  const w = baseWarnings((n) => vals[n]);
  assert.deepEqual(w.map((x) => [x.name, x.reason]), [['OPENAI_BASE_URL', 'not-official'], ['GEMINI_BASE_URL', 'not-https'], ['TRANSLATE_URL', 'not-https']]);
  assert.equal(w[0].text, 'OPENAI_BASE_URL sends your OpenAI key to https://openai-proxy.example.org, which isn’t OpenAI’s own address. Remove it unless you trust that server.');
  assert.equal(w[1].text, 'GEMINI_BASE_URL sends your Google Gemini key to http://192.168.1.9:8080 without https, so it can be read on the way. Use an https address.');
  assert.deepEqual(baseWarnings(() => undefined), []);
  assert.ok(!JSON.stringify(baseWarnings(() => 'https://user:secret@evil.example/x')).includes('secret'), 'credentials in an address are never repeated');
  assert.ok(BASE_OVERRIDES.length >= 14);
  ok('base overrides: official https hosts, this computer and unset ones are fine; others get one plain line each (no credentials repeated)'); }

// ---- Doctor: from the env file, app stopped ----
{ const D = await import('../src/doctor/doctor.js');
  const ef = D.readEnvFile('/x.env', { existsSync: () => true, readFileSync: (() => 'OPENHIGGSFIELD_BFL_BASE_URL=https://bfl.evil.example\nCOMFY_DEPLOY_URL=http://deploy.example.org\nOPENHIGGSFIELD_FAL_KEY=fake\n') as any });
  assert.equal(ef.values.OPENHIGGSFIELD_BFL_BASE_URL, 'https://bfl.evil.example'); assert.equal(ef.values.COMFY_DEPLOY_URL, 'http://deploy.example.org');
  assert.equal(ef.values.OPENHIGGSFIELD_FAL_KEY, undefined, 'a key value is still never read');
  const fakeEnv = { fetch: (async () => { throw new Error('refused'); }) as any, exec: () => ({ ok: false, out: '' }),
    fs: { existsSync: () => false, readFileSync: (() => { throw new Error('ENOENT'); }) as any, statfsSync: (() => ({ bavail: 1e6, bsize: 4096 })) as any },
    platform: 'darwin' as const, arch: 'arm64', release: '27.0.0', cpus: () => [{ model: 'x' }], totalmem: () => 2 ** 34, nodeVersion: 'v24.1.0',
    env: { OPENHIGGSFIELD_OPENAI_BASE_URL: 'https://openai-proxy.example.org/v1', OPENHIGGSFIELD_OPENAI_API_KEY: 'fake-openai' }, repoRoot: '/repo', now: () => new Date('2026-11-07T00:00:00Z') };
  const r = await D.runDoctor(fakeEnv, { envFile: '/none.env', timeoutMs: 10 });
  const c = r.checks.find((x) => x.id === 'base-OPENAI_BASE_URL'); assert.ok(c && c.status === 'warn' && /isn’t OpenAI’s own address/.test(c.text) && /OPENAI_BASE_URL/.test(c.fix ?? ''));
  assert.ok(!JSON.stringify(r).includes('fake-openai'), 'no key value in the report');
  ok('doctor reads the address overrides (env and env file; keys still names only) and warns about one off the provider’s hosts'); }

// ---- COMFY_DEPLOY_URL https only ----
{ const { deployTarget, deployState, DEPLOY_INSECURE_REASON } = await import('../src/comfy/deploy.js');
  const read = (vals: Record<string, string>) => (k: string) => vals[k];
  assert.equal(deployTarget(read({ COMFY_DEPLOY_URL: 'http://deploy.example.org', COMFY_API_KEY: 'fake' })), null, 'plain http: the key is not sent');
  assert.equal(deployTarget(read({ COMFY_DEPLOY_URL: 'https://me.run.comfy.app', COMFY_API_KEY: 'fake' }))?.via, 'comfy-deploy');
  assert.equal(deployTarget(read({ COMFY_DEPLOY_URL: 'http://127.0.0.1:8190', COMFY_API_KEY: 'fake' }))?.via, 'comfy-deploy', 'this computer is fine');
  Object.assign(process.env, { COMFY_DEPLOY_URL: 'http://deploy.example.org', COMFY_API_KEY: 'fake' });
  assert.deepEqual([deployState().reasonCode, deployState().reason], ['deploy_url_insecure', DEPLOY_INSECURE_REASON]);
  delete process.env.COMFY_DEPLOY_URL; delete process.env.COMFY_API_KEY;
  ok('COMFY_DEPLOY_URL: https only (this computer may use http); the deployment says why'); }

// ---- Hugging Face / Civitai tokens: https only ----
{ Object.assign(process.env, { OPENHIGGSFIELD_HF_TOKEN: 'fake-hf', CIVITAI_TOKEN: 'fake-civ' });
  const { authFor } = await import('../src/hardware/downloads.js');
  assert.ok(authFor('https://huggingface.co/a/b/resolve/main/x').Authorization); assert.ok(authFor('https://civitai.com/api/download/models/1').Authorization);
  assert.deepEqual(authFor('http://huggingface.co/a/b/resolve/main/x'), {}); assert.deepEqual(authFor('http://civitai.com/api/download/models/1'), {});
  ok('Hugging Face and Civitai tokens only over https'); }
