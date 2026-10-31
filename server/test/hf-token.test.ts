// Setup step 3: the Hugging Face read token. In-process, mock fetch, temp folders; no network.
//  - Settings → Connections lists an 'hf' card (hf_ format check), never a paid provider, never a mock "sample" key, never counts as "set up".
//  - The downloader sends the token to huggingface.co only (exact host), HF_TOKEN works as an alias; Civitai keeps CIVITAI_TOKEN.
//  - A 401/403 from Hugging Face → errorCode hf_gated + helpUrl (the model page) + "Accept the licence … then connect Hugging Face"; the token never shows.
// Run: npx tsx test/hf-token.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'hftok-')); const MODELS = path.join(D, 'models'); fs.mkdirSync(MODELS); const ENVF = path.join(D, 'env.local');
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_COMFY_MODELS_DIR: MODELS, OPENHIGGSFIELD_ENV_FILE: ENVF, OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_MOCK_KEYS: '1',
  OPENHIGGSFIELD_DISK_FREE_GB: '500' /* the download job below needs ~13 GB free: pin it, never the runner's real disk (CI had 8 GB) */ });
for (const k of ['OPENHIGGSFIELD_HF_TOKEN', 'HF_TOKEN', 'CIVITAI_TOKEN', 'OPENHIGGSFIELD_HW_MOCK']) delete process.env[k];
const S = await import('../src/routing/settings.js'); const DL = await import('../src/hardware/downloads.js');
const ok = (m: string) => console.log('ok ' + m);
const TOKEN = 'hf_testNotARealToken1234567890';

// ---- settings card ----
{ const hf = S.providerSettings().find((p) => p.id === 'hf')!; assert.ok(hf, 'hf card listed'); assert.equal(hf.name, 'Hugging Face'); assert.equal(hf.envKey, 'OPENHIGGSFIELD_HF_TOKEN'); assert.deepEqual(hf.envAliases, ['HF_TOKEN']);
  assert.match(hf.keysUrl, /^https:\/\/huggingface\.co\/settings\/tokens/); assert.equal(hf.configured, false, 'mock keys never fake a Hugging Face token'); assert.equal(hf.disabledReason, null);
  assert.match(S.keyProblem('hf', 'abcdefghijkl')!, /start with "hf_"/); assert.equal(S.keyProblem('hf', TOKEN), null);
  const r = S.storeKey('hf', TOKEN, ENVF); assert.ok('ok' in r && r.ok); assert.equal(process.env.OPENHIGGSFIELD_HF_TOKEN, TOKEN); assert.match(fs.readFileSync(ENVF, 'utf8'), /^OPENHIGGSFIELD_HF_TOKEN=/m);
  const after = S.providerSettings().find((p) => p.id === 'hf')!; assert.equal(after.configured, true); assert.equal(after.keySource, 'saved'); assert.equal(after.keyFormat, 'ok');
  assert.ok(!S.cloudProvidersEnabled().includes('hf'), 'not a paid provider'); assert.ok(!JSON.stringify(S.providerSettings()).includes(TOKEN.slice(0, 12)), 'never returned'); }
ok('settings: hf card (hf_ check, read-token link), saved like other keys, never a paid provider or a mock key');

// ---- authFor ----
{ assert.deepEqual(DL.authFor('https://huggingface.co/black-forest-labs/FLUX.1-Fill-dev/resolve/main/flux1-fill-dev.safetensors'), { Authorization: `Bearer ${TOKEN}` });
  for (const u of ['https://cdn-lfs.huggingface.co/x', 'https://evil-huggingface.co/a/b', 'https://huggingface.co.evil.com/a/b', 'https://civitai.com/api/download/models/1', 'http://127.0.0.1:8188/x', 'not a url'])
    assert.deepEqual(DL.authFor(u), {}, `no HF token to ${u}`);
  delete process.env.OPENHIGGSFIELD_HF_TOKEN; process.env.HF_TOKEN = 'hf_alias_token_abcdef'; assert.deepEqual(DL.authFor('https://huggingface.co/a/b/resolve/main/c'), { Authorization: 'Bearer hf_alias_token_abcdef' }, 'HF_TOKEN alias');
  delete process.env.HF_TOKEN; assert.deepEqual(DL.authFor('https://huggingface.co/a/b/resolve/main/c'), {}, 'no token → no header'); process.env.OPENHIGGSFIELD_HF_TOKEN = TOKEN;
  process.env.CIVITAI_TOKEN = 'civ-test-token'; assert.deepEqual(DL.authFor('https://civitai.com/api/download/models/1'), { Authorization: 'Bearer civ-test-token' }); delete process.env.CIVITAI_TOKEN;
  assert.equal(DL.hfModelPage('https://huggingface.co/black-forest-labs/FLUX.1-Fill-dev/resolve/main/flux1-fill-dev.safetensors'), 'https://huggingface.co/black-forest-labs/FLUX.1-Fill-dev'); assert.equal(DL.hfModelPage('https://civitai.com/x/y'), null); }
ok('authFor: token to huggingface.co only (not its CDN, look-alike hosts, Civitai or ComfyUI); HF_TOKEN alias; Civitai unchanged');

// ---- gated 401/403 ----
{ const calls: { url: string; auth: string | null }[] = []; const orig = globalThis.fetch; let status = 401;
  globalThis.fetch = (async (u: any, init: any = {}) => { calls.push({ url: String(u), auth: new Headers(init.headers).get('authorization') }); return new Response('{"error":"Access to model is restricted"}', { status }); }) as any;
  try {
    const f = { file: 'flux1-fill-dev.safetensors', folder: 'diffusion_models', url: 'https://huggingface.co/black-forest-labs/FLUX.1-Fill-dev/resolve/main/flux1-fill-dev.safetensors', bytesTotal: 10, bytesDone: 0, sha256: null, status: 'queued' as const };
    for (const st of [401, 403]) { status = st; calls.length = 0;
      await assert.rejects(DL.httpTransport.fetch(f, path.join(MODELS, 'diffusion_models', f.file), () => undefined, new AbortController().signal), (e: any) => {
        assert.equal(e.code, 'hf_gated'); assert.equal(e.pageUrl, 'https://huggingface.co/black-forest-labs/FLUX.1-Fill-dev'); assert.match(e.message, /Accept the licence on the model page \(https:\/\/huggingface\.co\/black-forest-labs\/FLUX\.1-Fill-dev\), then connect Hugging Face/);
        assert.ok(!e.message.includes(TOKEN)); return true; });
      assert.equal(calls[0].auth, `Bearer ${TOKEN}`, 'the token was sent to huggingface.co'); }
    // without a token: same advice, no "your token is set" note
    delete process.env.OPENHIGGSFIELD_HF_TOKEN; status = 401;
    await assert.rejects(DL.httpTransport.fetch(f, path.join(MODELS, 'diffusion_models', f.file), () => undefined, new AbortController().signal), (e: any) => e.code === 'hf_gated' && !/token is set/.test(e.message));
    process.env.OPENHIGGSFIELD_HF_TOKEN = TOKEN;
    // a 401 from somewhere else stays a plain failure
    status = 401; await assert.rejects(DL.httpTransport.fetch({ ...f, url: 'https://civitai.com/api/download/models/9' }, path.join(MODELS, 'loras', 'c.safetensors'), () => undefined, new AbortController().signal), (e: any) => !e.code && /HTTP 401/.test(e.message));
    // through a real download job: errorCode + helpUrl on the download, token nowhere in the view
    DL.setDownloadTransport({ name: 'http', fetch: (ff, dest, on, sig) => DL.httpTransport.fetch({ ...ff, url: f.url }, dest, on, sig) });
    const d = DL.startDownload({ variantId: 'qwen-image-q4km' }); const end = (await DL.waitDownload(d.id))!;
    assert.equal(end.status, 'failed'); assert.equal(end.errorCode, 'hf_gated'); assert.equal(end.helpUrl, 'https://huggingface.co/black-forest-labs/FLUX.1-Fill-dev');
    assert.ok(!JSON.stringify(DL.downloadView(end)).includes(TOKEN.slice(3)), 'token never in the download view');
  } finally { globalThis.fetch = orig; DL.setDownloadTransport(null); } }
ok('gated: 401/403 from huggingface.co → hf_gated, model page link, "Accept the licence … then connect Hugging Face"; other hosts unchanged; token never shown');
