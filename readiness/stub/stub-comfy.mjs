// Stub ComfyUI: speaks the native API (/object_info, /upload/image, /prompt, /history/:id, /view, /interrupt, /queue, WS /ws
// with execution_start / executing / progress / executed / execution_success). Validates each graph against the
// validator's object_info (class exists, required inputs present, links resolve to real outputs) like ComfyUI does,
// then "executes" it in ~1-2 s and returns tiny real media (ffmpeg) on every output node. No models, no GPU.
// Usage: node stub-comfy.mjs [port]   env STUB_OBJECT_INFO, STUB_DIR, STUB_STEP_MS
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process'; import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../server/package.json', import.meta.url)); const { WebSocketServer } = require('ws');
const PORT = Number(process.argv[2] || process.env.STUB_PORT || 8288);
const OI = JSON.parse(fs.readFileSync(process.env.STUB_OBJECT_INFO || new URL('./object_info.json', import.meta.url).pathname, 'utf8'));
const DIR = process.env.STUB_DIR || fs.mkdtempSync('/tmp/stub-comfy-'); for (const d of ['input', 'output']) fs.mkdirSync(path.join(DIR, d), { recursive: true });
const STEP = Number(process.env.STUB_STEP_MS || 15);
const history = {}; const clients = new Map(); const log = []; let interrupted = false;
const send = (cid, type, data) => { const ws = clients.get(cid); if (ws?.readyState === 1) ws.send(JSON.stringify({ type, data })); };
const isLink = (v) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'number';

function validate(prompt) {
  const errors = {};
  // Like ComfyUI: only output nodes and what they depend on are validated / executed.
  const reach = new Set(); const st = Object.entries(prompt).filter(([, n]) => OI[n.class_type]?.output_node).map(([id]) => id);
  while (st.length) { const id = st.pop(); if (reach.has(id) || !prompt[id]) continue; reach.add(id); for (const v of Object.values(prompt[id].inputs ?? {})) if (isLink(v)) st.push(v[0]); }
  for (const [id, n] of Object.entries(prompt).filter(([id, n]) => reach.has(id) || !OI[n.class_type])) {
    const e = []; const info = OI[n.class_type];
    if (!info) { errors[id] = { errors: [{ type: 'missing_node_type', message: `Node type not found: ${n.class_type}` }], class_type: n.class_type }; continue; }
    const req = info.input?.required ?? {}; const opt = info.input?.optional ?? {};
    for (const [k, spec] of Object.entries(req)) {
      const v = n.inputs?.[k];
      // dynamic combos (e.g. resize_type) are sent as "key.sub" — accept those.
      if (/^COMFY_(AUTOGROW|DYNAMIC)/.test(spec?.[0])) continue; // dynamic inputs may be empty
      if (v === undefined && !Object.keys(n.inputs ?? {}).some((x) => x.startsWith(`${k}.`))) e.push({ type: 'required_input_missing', message: `Required input is missing: ${k}` });
    }
    for (const [k, v] of Object.entries(n.inputs ?? {})) {
      if (!isLink(v)) {
        const spec = req[k] ?? opt[k]; const t = spec?.[0];
        if (spec && t === 'INT' && typeof v === 'number' && !Number.isInteger(v)) e.push({ type: 'invalid_input_type', message: `${k}: INT expected, got ${v}` });
        if (spec && (t === 'INT' || t === 'FLOAT') && typeof v === 'number') { const o = spec[1] ?? {}; if (o.min != null && v < o.min) e.push({ type: 'value_smaller_than_min', message: `${k}=${v} < min ${o.min}` }); if (o.max != null && v > o.max) e.push({ type: 'value_bigger_than_max', message: `${k}=${v} > max ${o.max}` }); }
        continue;
      }
      const src = prompt[v[0]]; if (!src) { e.push({ type: 'bad_link', message: `${k} links to missing node ${v[0]}` }); continue; }
      const so = OI[src.class_type]?.output; if (so && v[1] >= so.length) e.push({ type: 'bad_link', message: `${k} links to output ${v[1]} of ${src.class_type} (has ${so.length})` });
    }
    if (e.length) errors[id] = { errors: e, class_type: n.class_type };
  }
  const outputs = Object.entries(prompt).filter(([, n]) => OI[n.class_type]?.output_node);
  if (!outputs.length) errors._ = { errors: [{ type: 'prompt_no_outputs', message: 'Prompt has no outputs' }] };
  return errors;
}
const fileFor = (kind, i) => {
  const name = `stub_${randomUUID().slice(0, 8)}_${i}.${kind === 'image' ? 'png' : kind === 'audio' ? 'mp3' : 'mp4'}`; const p = path.join(DIR, 'output', name);
  const a = kind === 'image' ? ['-f', 'lavfi', '-i', 'testsrc2=s=512x512', '-frames:v', '1'] : kind === 'audio' ? ['-f', 'lavfi', '-i', 'sine=f=440:d=2', '-c:a', 'libmp3lame'] :
    ['-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=16:d=2', '-f', 'lavfi', '-i', 'sine=f=330:d=2', '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac'];
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a, p]); return name;
};
const kindOf = (ct) => /Audio/i.test(ct) && !/Video/i.test(ct) ? 'audio' : /Video|VHS/i.test(ct) ? 'video' : 'image';
async function execute(pid, prompt, cid) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  send(cid, 'execution_start', { prompt_id: pid }); const outputs = {};
  for (const [id, n] of Object.entries(prompt)) {
    if (interrupted) { interrupted = false; history[pid] = { prompt: [0, pid, prompt], outputs: {}, status: { status_str: 'error', completed: false, messages: [['execution_interrupted', {}]] } }; send(cid, 'execution_interrupted', { prompt_id: pid }); return; }
    send(cid, 'executing', { node: id, prompt_id: pid });
    if (/Sampler|SeedVR2|RIFE|Upscaler|Rembg|MiniMaxH3/i.test(n.class_type)) { const max = Number(n.inputs?.steps) > 0 ? Number(n.inputs.steps) : 6; for (let v = 1; v <= max; v++) { send(cid, 'progress', { value: v, max, prompt_id: pid, node: id }); await wait(STEP); } }
    else await wait(2);
    if (OI[n.class_type]?.output_node) {
      if (n.class_type === 'PreviewAny') { outputs[id] = { text: ['Hello, this is the stub transcript.'] }; send(cid, 'executed', { node: id, output: outputs[id], prompt_id: pid }); continue; }
      const kind = kindOf(n.class_type); const f = { filename: fileFor(kind, id), subfolder: '', type: 'output' };
      outputs[id] = kind === 'audio' ? { audio: [f] } : { images: [f], ...(kind === 'video' ? { animated: [true] } : {}) };
      send(cid, 'executed', { node: id, output: outputs[id], prompt_id: pid });
    }
  }
  history[pid] = { prompt: [0, pid, prompt], outputs, status: { status_str: 'success', completed: true, messages: [] } };
  send(cid, 'executing', { node: null, prompt_id: pid }); send(cid, 'execution_success', { prompt_id: pid });
}
const body = (req) => new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
function multipart(buf, ct) {
  const b = '--' + /boundary=(?:"([^"]+)"|([^;]+))/.exec(ct).slice(1).find(Boolean); const parts = {}; let i = buf.indexOf(b);
  while (i >= 0) { const next = buf.indexOf(b, i + b.length); if (next < 0) break; const part = buf.subarray(i + b.length + 2, next - 2); const h = part.indexOf('\r\n\r\n');
    const head = part.subarray(0, h).toString(); const name = /name="([^"]+)"/.exec(head)?.[1]; const filename = /filename="([^"]*)"/.exec(head)?.[1];
    parts[name] = filename != null ? { filename, data: part.subarray(h + 4) } : part.subarray(h + 4).toString(); i = next; }
  return parts;
}
const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); log.push(`${req.method} ${u.pathname}`);
  try {
    if (req.method === 'GET' && u.pathname === '/object_info') return json(res, 200, OI);
    if (req.method === 'GET' && u.pathname === '/system_stats') return json(res, 200, { system: { os: 'stub', comfyui_version: 'stub' }, devices: [] });
    if (req.method === 'POST' && u.pathname === '/upload/image') { const p = multipart(await body(req), req.headers['content-type']); const f = p.image; if (!f) return json(res, 400, { error: 'no image' });
      fs.writeFileSync(path.join(DIR, 'input', path.basename(f.filename)), f.data); return json(res, 200, { name: path.basename(f.filename), subfolder: '', type: 'input' }); }
    if (req.method === 'POST' && u.pathname === '/prompt') {
      const { prompt, client_id } = JSON.parse((await body(req)).toString()); const errs = validate(prompt);
      // inputs that reference uploads must exist in input/
      for (const [id, n] of Object.entries(prompt).filter(([id]) => !errs[id])) for (const k of ['image', 'file', 'video', 'audio']) { const v = n.inputs?.[k]; if (/^Load(Image|Video|Audio)/.test(n.class_type) && typeof v === 'string' && !fs.existsSync(path.join(DIR, 'input', v))) (errs[id] ??= { errors: [], class_type: n.class_type }).errors.push({ type: 'value_not_in_list', message: `${k}: '${v}' not uploaded` }); }
      if (Object.keys(errs).length) return json(res, 400, { error: { type: 'prompt_outputs_failed_validation', message: 'Prompt outputs failed validation' }, node_errors: errs });
      const pid = randomUUID(); history[pid] = undefined; json(res, 200, { prompt_id: pid, number: Object.keys(history).length, node_errors: {} });
      setTimeout(() => execute(pid, prompt, client_id), 30); return;
    }
    if (req.method === 'GET' && u.pathname.startsWith('/history/')) { const id = decodeURIComponent(u.pathname.slice(9)); return json(res, 200, history[id] ? { [id]: history[id] } : {}); }
    if (req.method === 'GET' && u.pathname === '/view') { const p = path.join(DIR, u.searchParams.get('type') === 'input' ? 'input' : 'output', u.searchParams.get('subfolder') || '', path.basename(u.searchParams.get('filename') || ''));
      if (!fs.existsSync(p)) return json(res, 404, { error: 'not found' }); res.writeHead(200); return fs.createReadStream(p).pipe(res); }
    if (req.method === 'POST' && u.pathname === '/interrupt') { interrupted = true; return json(res, 200, {}); }
    if (req.method === 'POST' && u.pathname === '/translate') { const b = JSON.parse(String(await body(req)) || '{}'); return json(res, 200, { translatedText: `[${b.target}] ${b.q}` }); } // LibreTranslate-compatible stub
    if (u.pathname === '/queue') return json(res, 200, { queue_running: [], queue_pending: [] });
    if (u.pathname === '/__log') return json(res, 200, { log: log.slice(-500) });
    json(res, 404, { error: 'not found' });
  } catch (e) { json(res, 500, { error: String(e) }); }
});
const wss = new WebSocketServer({ noServer: true });
srv.on('upgrade', (req, sock, head) => { const u = new URL(req.url, 'http://x'); if (u.pathname !== '/ws') return sock.destroy();
  wss.handleUpgrade(req, sock, head, (ws) => { const cid = u.searchParams.get('clientId') || randomUUID(); clients.set(cid, ws); ws.send(JSON.stringify({ type: 'status', data: { sid: cid, status: { exec_info: { queue_remaining: 0 } } } })); ws.on('close', () => clients.delete(cid)); }); });
srv.listen(PORT, '127.0.0.1', () => console.log(`stub-comfy on http://127.0.0.1:${PORT} (dir ${DIR})`));
