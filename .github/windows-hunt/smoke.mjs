// Temporary Windows hunt (test/windows-hunt): real user flows against a running app (mock backend, no keys).
// node smoke.mjs <api base> <web base> <data dir> <work dir>
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
const [API, WEB, DATA, WORK] = process.argv.slice(2);
let fail = 0; const ok = (c, m, extra = '') => { if (!c) fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${m}${extra ? `  ${extra}` : ''}`); return c; };
const j = async (url, init) => { const r = await fetch(url, init); const t = await r.text(); let b = null; try { b = JSON.parse(t); } catch { /* not json */ } return { status: r.status, body: b, text: t }; };
const winPath = /[A-Za-z]:\\\\/; // an absolute Windows path inside JSON text

// 1. health, tools, models, self-host (models manifest), MCP tool list
const h = await j(`${API}/api/health`); ok(h.status === 200 && h.body?.backend === 'mock', 'API /api/health is the mock backend', h.text.slice(0, 200));
const hw = await j(`${WEB}/api/health`); ok(hw.status === 200, 'web proxy /api/health');
const tools = await j(`${API}/api/tools`); const list = Array.isArray(tools.body) ? tools.body : tools.body?.tools ?? tools.body?.items ?? [];
ok(tools.status === 200 && list.length > 0, `/api/tools lists tools (${list.length})`);
ok(!winPath.test(tools.text), '/api/tools carries no absolute Windows path', (tools.text.match(/.{60}[A-Za-z]:\\\\.{60}/) ?? [''])[0]);
const swap = list.find((t) => t.id === 'object-swap'); if (swap) ok((swap.workflows ?? []).every((w) => !/[\\/:]/.test(w)), 'object-swap workflows are bare file names', JSON.stringify(swap.workflows));
const models = await j(`${API}/api/models`); ok(models.status === 200, '/api/models answers');
const sh = await j(`${API}/api/health/self-host`); ok(sh.status === 200 && sh.body?.models?.total > 0, `/api/health/self-host reads the models manifest (total ${sh.body?.models?.total})`);
const mt = await j(`${API}/api/mcp/tools`); ok(mt.status === 200 && mt.body?.total > 0, `/api/mcp/tools reads the MCP server source (total ${mt.body?.total}, note ${mt.body?.note ?? '-'})`);

// 2. a mock image job: output file exists on disk and is served by the API and through the web proxy
await fetch(`${API}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ global: { mode: 'auto', allowFallback: false, useLocal: true, mockKeys: true } }) });
const fd = new FormData(); fd.set('types', '["generate"]'); fd.set('prompt', 'a red fox in snow'); fd.set('n', '1');
const job = await j(`${API}/api/tools/create-image/jobs`, { method: 'POST', body: fd }); ok(job.status === 200 && job.body?.id, 'create-image mock job accepted', job.text.slice(0, 300));
let done = null; for (let i = 0; i < 90 && job.body?.id; i++) { await new Promise((r) => setTimeout(r, 1000)); const s = await j(`${API}/api/jobs/${job.body.id}`); if (['done', 'failed', 'blocked', 'canceled'].includes(s.body?.status)) { done = s.body; break; } }
ok(done?.status === 'done' && done.outputs?.length, `mock job finished (${done?.status})`, done?.error ?? '');
const out = done?.outputs?.[0]?.url;
if (out) {
  const onDisk = out.startsWith('/files/') ? path.join(DATA, decodeURIComponent(out.slice('/files/'.length))) : null;
  if (onDisk) ok(fs.existsSync(onDisk) && fs.statSync(onDisk).size > 0, 'output file is on disk in the data folder', out);
  for (const base of [API, WEB]) { const r = await fetch(base + out); const b = Buffer.from(await r.arrayBuffer()); ok(r.ok && b.length > 0, `output served from ${base === API ? 'API' : 'web'}`, `${r.status} ${b.length} bytes ${out}`); }
}

// 3. an upload whose name has spaces and non-ASCII letters
const png = path.join(WORK, 'my holiday photo éÑ.png');
const ff = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=orange:s=96x64', '-frames:v', '1', png]);
if (ok(ff.status === 0 && fs.existsSync(png), 'made a test PNG with ffmpeg', String(ff.error ?? ff.stderr ?? ''))) {
  const up = new FormData(); up.set('file', new Blob([fs.readFileSync(png)], { type: 'image/png' }), path.basename(png));
  const u = await j(`${API}/api/media`, { method: 'POST', body: up }); const url = u.body?.url ?? u.body?.item?.url ?? u.body?.items?.[0]?.url;
  ok(u.status === 200 && url, 'upload with spaces + non-ASCII name accepted', u.text.slice(0, 300));
  if (url) { const r = await fetch(WEB + url); ok(r.ok, 'uploaded file served through the web proxy', `${r.status} ${url}`); }
  ok(!winPath.test(u.text), 'upload response carries no absolute Windows path');
}

// 4. library export (.tar.gz via the system tar) and import (tar list + extract)
const ex = await fetch(`${API}/api/export`); const tgz = Buffer.from(await ex.arrayBuffer()); const tgzFile = path.join(WORK, 'export.tar.gz'); fs.writeFileSync(tgzFile, tgz);
ok(ex.ok && tgz.length > 1000, `export downloads (${tgz.length} bytes)`, ex.headers.get('x-export-manifest') ?? '');
const manifestHdr = JSON.parse(ex.headers.get('x-export-manifest') ?? '{}');
ok((manifestHdr.mediaEntries ?? 0) >= 2, `export includes the job output and the upload (mediaEntries ${manifestHdr.mediaEntries}, orphans excluded ${manifestHdr.orphansExcluded})`);
const im = await j(`${API}/api/import`, { method: 'POST', headers: { 'content-type': 'application/gzip' }, body: tgz }); ok(im.status === 200 && im.body?.staged, 'import checks and stages the export', im.text.slice(0, 300));

// 5. nothing in the database text holds a host path (data-dir paths are stored relative)
const jobRow = done?.id ? await j(`${API}/api/jobs/${done.id}`) : null; if (jobRow) ok(!winPath.test(jobRow.text), 'job JSON carries no absolute Windows path', (jobRow.text.match(/.{40}[A-Za-z]:\\\\.{40}/) ?? [''])[0]);

console.log(`\n${fail ? `${fail} FAILED` : 'all passed'}`); process.exit(fail ? 1 : 0);
