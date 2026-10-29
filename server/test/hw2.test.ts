// HW2 item 5 unit check (in-process, temp data dir, no network): checkComfy classifies fetch failures (injected with setComfyFetch) into
// errorCode refused | timeout | not_found | bad_response | unreachable | not_set | cloud, each with its plain sentence. Run: tsx test/hw2.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'hw2u-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
delete process.env.OPENHIGGSFIELD_HW_MOCK; delete process.env.COMFY_BASE_URL;
const HW = await import('../src/hardware.js');
const fail = (code: string) => (async () => { const e: any = new TypeError('fetch failed'); e.cause = Object.assign(new Error(code), { code }); throw e; }) as any;
const U = 'http://user:pw@192.168.1.20:8188';
HW.setComfyFetch(fail('ECONNREFUSED')); let c = await HW.checkComfy(U); assert.equal(c.errorCode, 'refused'); assert.equal(c.error, "Couldn't connect to ComfyUI at http://192.168.1.20:8188. Is it running?", 'no user:password in the sentence');
HW.setComfyFetch(fail('ENOTFOUND')); c = await HW.checkComfy('http://comfy.lan:8188'); assert.equal(c.errorCode, 'not_found'); assert.equal(c.error, "Couldn't find comfy.lan.");
HW.setComfyFetch(fail('EAI_AGAIN')); assert.equal((await HW.checkComfy('http://comfy.lan:8188')).errorCode, 'not_found');
HW.setComfyFetch((async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); }) as any); c = await HW.checkComfy('http://127.0.0.1:8188', { timeoutMs: 3000 }); assert.equal(c.errorCode, 'timeout'); assert.equal(c.error, "ComfyUI at http://127.0.0.1:8188 didn't answer within 3 seconds.");
HW.setComfyFetch(fail('UND_ERR_CONNECT_TIMEOUT')); assert.equal((await HW.checkComfy('http://127.0.0.1:8188', { timeoutMs: 2500 })).error, "ComfyUI at http://127.0.0.1:8188 didn't answer within 2.5 seconds.");
HW.setComfyFetch((async () => new Response('nope', { status: 502 })) as any); c = await HW.checkComfy('http://127.0.0.1:8188'); assert.equal(c.errorCode, 'bad_response'); assert.equal(c.error, 'Something answered at http://127.0.0.1:8188, but not like ComfyUI (HTTP 502).');
HW.setComfyFetch(fail('EHOSTUNREACH')); c = await HW.checkComfy('http://10.0.0.9:8188'); assert.equal(c.errorCode, 'unreachable'); assert.equal(c.error, "Couldn't reach ComfyUI at http://10.0.0.9:8188.");
HW.setComfyFetch((async () => new Response(JSON.stringify({ system: { comfyui_version: '0.41.3' }, devices: [] }), { status: 200 })) as any); c = await HW.checkComfy('http://127.0.0.1:8188', { gguf: false }); assert.equal(c.reachable, true); assert.equal(c.errorCode, null); assert.equal(c.error, null);
c = await HW.checkComfy(''); assert.equal(c.errorCode, 'not_set'); assert.equal(c.error, 'No ComfyUI address is set.');
c = await HW.checkComfy('https://cloud.comfy.org'); assert.equal(c.errorCode, 'cloud');
assert.equal(HW.TIER_LABELS.unknown, "Couldn't check the hardware, so nothing is blocked");
HW.setComfyFetch(null);
console.log('hw2.test: all passed'); process.exit(0);
