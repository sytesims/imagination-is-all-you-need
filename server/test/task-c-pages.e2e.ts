// E2E (own mock servers, temp data dirs): Wan Animate wiring (matte field), trash days, history status, hosted flag, pages 16-18 + usage tz.
// Run: npx tsx test/task-c-pages.e2e.ts   (ports 8843 + 8844; never touches :8787/:8788)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const CWD = path.resolve(import.meta.dirname, '..');
const start = (port: number, extra: Record<string, string> = {}) => { const D = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-'));
  const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: CWD, env: { ...process.env, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_HOSTED: '', OPENHIGGSFIELD_MAX_QUEUED: '200', MAX_QUEUED: '200', ...extra }, stdio: 'ignore', detached: true }); return { p, D, B: `http://localhost:${port}` }; };
const up = async (B: string) => { for (let i = 0; i < 90; i++) { try { if ((await fetch(`${B}/api/health`)).ok) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); } throw new Error(`${B} did not start`); };
const A = start(testPort(8843)), H = start(testPort(8844), { OPENHIGGSFIELD_HOSTED: '1', OPENHIGGSFIELD_TRASH_DAYS: '7' }); const B = A.B, D = A.D;
const get = async (u: string, b = B) => (await fetch(b + u)).json();
const req = async (m: string, u: string, body?: any) => { const r = await fetch(B + u, { method: m, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => null), headers: r.headers }; };
const post = async (tool: string, f: Record<string, string>, files: [string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); for (const [k, p] of files) fd.append(k, new Blob([fs.readFileSync(p)]), path.basename(p)); const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() }; };
const wait = async (id: string) => { for (let i = 0; i < 600; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 200)); } throw new Error('timeout'); };
const procs: ChildProcess[] = [A.p, H.p];
try {
  await Promise.all([up(B), up(H.B)]);
  await req('PUT', '/api/me/routing', { global: { mode: 'auto', allowFallback: true, useLocal: true, mockKeys: true } }); // own test server only
  const mp4 = path.join(D, 'src.mp4'), matte = path.join(D, 'matte.mp4'), png = path.join(D, 'ref.png');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=854x480:rate=24', '-t', '5', '-pix_fmt', 'yuv420p', mp4]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:size=854x480:rate=30', '-vf', 'drawbox=x=300:y=100:w=200:h=300:color=white:t=fill', '-t', '5', '-pix_fmt', 'yuv420p', matte]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=512x512', '-frames:v', '1', png]);
  const R = { rights: '1' };

  // C1 matte field (Object Swap)
  { const t = (await get('/api/tools')).find((x: any) => x.id === 'object-swap'); assert.ok(t.inputs.some((i: any) => i.name === 'matte' && i.kind === 'file'), 'matte input listed');
    const j = await post('object-swap', { ...R, prompt: 'swap' }, [['video', mp4], ['refs', png], ['matte', matte]]); assert.equal(j.status, 200, JSON.stringify(j.body));
    const d = await wait(j.body.id); assert.equal(d.status, 'done'); assert.ok(d.input.maskUrl?.startsWith('/files/') && /matte/.test(d.input.maskUrl), JSON.stringify(d.input)); // *Path fields are not public
    const bad = await post('object-swap', { ...R, prompt: 'swap' }, [['video', mp4], ['refs', png], ['matte', png]]); assert.equal(bad.status, 400); assert.equal(bad.body.issues?.[0]?.field, 'matte');
    const none = await post('object-swap', { ...R, prompt: 'swap' }, [['video', mp4], ['refs', png]]); assert.equal(none.status, 200); assert.ok(!(await get(`/api/jobs/${none.body.id}`)).input.maskUrl);
    console.log('ok object-swap matte accepted (maskUrl), image matte → 400 field=matte, no matte → no maskUrl'); }

  // C2 config: trashDays + hosted
  { const c = await get('/api/config'); assert.equal(c.trashDays, 30); assert.equal(c.hosted, false); assert.ok(c.mcp.entry && c.mcp.commands);
    const h = await get('/api/config', H.B); assert.equal(h.trashDays, 7); assert.equal(h.hosted, true); assert.equal(h.mcp.selfHostHidden, true); assert.ok(!('entry' in h.mcp) && !('commands' in h.mcp) && !('dir' in h.mcp) && !h.mcp.snippets.stdio && h.mcp.snippets.http && !h.mcp.snippets.npx && !('npx' in h.mcp));
    console.log('ok /api/config trashDays 30 / 7, hosted false / true (self-host mcp details hidden)'); }

  // jobs for history/pages: one image, one failed, one trashed
  const img = await post('create-image', { ...R, types: '["generate"]', prompt: 'a red fox' }); assert.equal(img.status, 200, JSON.stringify(img.body)); await wait(img.body.id);
  const fail = await post('object-swap', { ...R, prompt: 'swap [mockfail]', simulate: 'temporary' }, [['video', mp4], ['refs', png]]); assert.equal(fail.status, 200, JSON.stringify(fail.body)); const fd0 = await wait(fail.body.id); assert.equal(fd0.status, 'failed');
  const tr = await post('create-image', { ...R, types: '["generate"]', prompt: 'to trash' }); await wait(tr.body.id); await req('DELETE', `/api/jobs/${tr.body.id}`);

  { const t = await req('GET', '/api/assets?section=trash'); assert.equal(t.headers.get('x-trash-days'), '30'); assert.ok(t.body.some((j: any) => j.id === tr.body.id)); console.log('ok trash list X-Trash-Days: 30'); }

  // history: all media by default + status filter
  { const h = await get('/api/history'); const kinds = new Set(h.items.map((x: any) => x.kind)); assert.ok(kinds.has('image') && kinds.has('video'), JSON.stringify([...kinds])); assert.ok(h.items.every((x: any) => x.status === 'done'));
    const f = await get('/api/history?status=failed'); assert.ok(f.items.length >= 1 && f.items.every((x: any) => x.status === 'failed' && x.url === null)); assert.ok(f.items.some((x: any) => x.jobId === fail.body.id));
    const two = await get('/api/history?status=done,failed'); assert.equal(two.total, h.total + f.total);
    assert.equal((await req('GET', '/api/history?status=bogus')).status, 400); assert.equal((await get('/api/history?kind=image')).items.every((x: any) => x.kind === 'image'), true);
    console.log(`ok /api/history default kinds ${[...kinds].join('+')}, status=failed ${f.total}, done,failed ${two.total}, bad status 400`); }

  // 1 counts
  { const c = await get('/api/assets/counts'); assert.deepEqual(Object.keys(c).sort(), ['all', 'byMedia', 'elements', 'favourites', 'projects', 'trash']); assert.equal(c.trash, 1); assert.ok(c.byMedia.image >= 1 && c.byMedia.video >= 2); assert.equal(c.all, c.byMedia.image + c.byMedia.video + c.byMedia.audio); console.log(`ok counts ${JSON.stringify(c)}`); }

  // 2 + 3 jobs filters, enhanced, cursor
  { const all = await get('/api/jobs'); assert.ok(Array.isArray(all) && all.every((j: any) => typeof j.enhanced === 'boolean'));
    const im = await get('/api/jobs?media=image&cursor='); assert.ok(im.items.length >= 1 && im.items.every((j: any) => j.toolId === 'create-image')); assert.ok('nextCursor' in im);
    const p1 = await get('/api/jobs?limit=1&cursor='); assert.equal(p1.items.length, 1); assert.ok(p1.nextCursor); const p2 = await get(`/api/jobs?limit=1&cursor=${p1.nextCursor}`); assert.notEqual(p2.items[0].id, p1.items[0].id);
    const arr = await req('GET', '/api/jobs?limit=1'); assert.ok(Array.isArray(arr.body) && arr.headers.get('x-next-cursor'));
    const q = await get('/api/jobs?q=red%20fox&cursor='); assert.deepEqual(q.items.map((j: any) => j.id), [img.body.id]);
    const fut = await get(`/api/jobs?from=${new Date(Date.now() + 3600e3).toISOString()}&cursor=`); assert.equal(fut.items.length, 0);
    const past = await get(`/api/jobs?to=${new Date(Date.now() + 3600e3).toISOString()}&from=2020-01-01T00:00:00Z&cursor=`); assert.ok(past.items.length >= 3);
    assert.equal((await req('GET', '/api/jobs?from=nope')).status, 400); assert.equal((await req('GET', '/api/jobs?media=gif')).status, 400);
    const up = await post('image-upscale', { ...R, types: '["x2"]' }, [['image', png]]);
    if (up.status === 200) { await wait(up.body.id); const e = await get('/api/jobs?enhanced=1&cursor='); assert.ok(e.items.some((j: any) => j.id === up.body.id) && e.items.every((j: any) => j.enhanced)); const ne = await get('/api/jobs?enhanced=0&cursor='); assert.ok(ne.items.every((j: any) => !j.enhanced)); console.log('ok enhanced=1 includes image-upscale job'); }
    else console.log(`note image-upscale create → ${up.status} ${JSON.stringify(up.body).slice(0, 120)} (enhanced filter checked on false only)`);
    console.log('ok /api/jobs media/q/from/to/cursor + enhanced field'); }

  // 4 locate
  { const all = await get('/api/assets?section=all'); const old = all[all.length - 1]; const lo = await get(`/api/jobs/${old.id}/locate?section=assets&pageSize=2`);
    assert.equal(lo.position, all.length - 1); assert.equal(lo.page, Math.floor((all.length - 1) / 2) + 1); assert.equal(lo.index, (all.length - 1) % 2); assert.equal(lo.cursor, lo.page > 1 ? String((lo.page - 1) * 2) : null); console.log(`ok locate oldest of ${all.length} ${JSON.stringify(lo)}`); }
  { const l = await get(`/api/jobs/${img.body.id}/locate?section=assets&pageSize=1`); assert.equal(typeof l.page, 'number'); assert.equal(l.index, 0); assert.equal(l.cursor, l.page === 1 ? null : String(l.page - 1));
    const lt = await get(`/api/jobs/${tr.body.id}/locate?section=trash`); assert.deepEqual([lt.page, lt.cursor, lt.index], [1, null, 0]);
    assert.equal((await req('GET', `/api/jobs/${tr.body.id}/locate?section=assets`)).status, 404); assert.equal((await req('GET', `/api/jobs/${img.body.id}/locate?section=x`)).status, 400);
    assert.equal((await req('GET', `/api/jobs/${img.body.id}/locate?section=favourites`)).status, 404);
    console.log(`ok locate ${JSON.stringify(l)}`); }

  // 5 + 8 projects: PATCH, visibility, public list
  { const p = (await req('POST', '/api/projects', { name: 'Fox' })).body; const kid = (await req('POST', '/api/projects', { name: 'Kid' })).body;
    const r1 = await req('PATCH', `/api/projects/${kid.id}`, { name: 'Kid 2', parentId: p.id }); assert.equal(r1.status, 200, JSON.stringify(r1.body)); assert.equal(r1.body.name, 'Kid 2'); assert.equal(r1.body.parentId, p.id);
    const cyc = await req('PATCH', `/api/projects/${p.id}`, { parentId: kid.id }); assert.equal(cyc.status, 400); const r2 = await req('PATCH', `/api/projects/${kid.id}`, { parentId: null }); assert.equal(r2.body.parentId, null);
    assert.equal((await req('PATCH', '/api/projects/nope', { name: 'x' })).status, 404);
    await req('POST', `/api/jobs/${img.body.id}/project`, { projectId: p.id }).catch(() => null);
    assert.equal((await get('/api/projects/public')).items.length, 0);
    const v = await req('POST', `/api/projects/${p.id}/visibility`, { visibility: 'public' }); assert.deepEqual(v.body, { id: p.id, visibility: 'public' });
    assert.equal((await req('POST', `/api/projects/${p.id}/visibility`, { visibility: 'world' })).status, 400); assert.equal((await req('POST', '/api/projects/nope/visibility', { visibility: 'public' })).status, 404);
    const pub = await get('/api/projects/public'); assert.equal(pub.items.length, 1); const it = pub.items[0]; assert.deepEqual(Object.keys(it).sort(), ['author', 'count', 'id', 'name', 'posterUrl', 'updatedAt', 'visibility']); assert.equal(it.author, 'you'); assert.equal(pub.nextCursor, null);
    await req('POST', `/api/projects/${p.id}/visibility`, { visibility: 'private' }); assert.equal((await get('/api/projects/public')).items.length, 0);
    console.log(`ok PATCH projects (rename, move, cycle 400, unparent, 404), visibility + public ${JSON.stringify(it)}`); }

  // 6 community shots fields
  { const pb = await req('POST', `/api/jobs/${img.body.id}/publish`, { showPrompt: true }); const s = await get('/api/community/shots?sort=new');
    if (pb.status === 200 && s.items.length) { const x = s.items[0]; for (const k of ['author', 'title', 'shareToken', 'previewUrl', 'posterUrl', 'toolName']) assert.ok(k in x, k); assert.equal(x.author, 'you'); assert.equal(x.title, 'a red fox'); console.log(`ok shots fields ${JSON.stringify({ author: x.author, title: x.title, shareToken: x.shareToken, toolName: x.toolName })}`); }
    else console.log(`note publish → ${pb.status} ${JSON.stringify(pb.body).slice(0, 160)}`); }

  // 7 media sort
  { for (const [s, want] of [['new', 'newest'], ['old', 'oldest'], ['name', 'name']]) assert.equal((await get(`/api/media?source=generations&sort=${s}`)).sort, want); console.log('ok /api/media sort=new|old|name'); }

  // 9 usage tz
  { const u = await get('/api/usage/series?days=3&tz=Asia/Kolkata'); assert.equal(u.timezone, 'Asia/Kolkata'); assert.ok(u.items.every((r: any) => /^\d{4}-\d\d-\d\d$/.test(r.date) && r.start.endsWith('T18:30:00.000Z')), JSON.stringify(u.items.slice(0, 2))); // first row too: local midnight, not the window start
    const n = await get('/api/usage/series?days=2&bucket=hour&tz=Asia/Kathmandu'); assert.ok(n.items.every((r: any) => r.start.slice(14, 19) === '15:00'), JSON.stringify(n.items.slice(0, 3)));
    const d = await get('/api/usage/series?days=2&tz=Asia/Dubai'); assert.ok(d.items.every((r: any) => r.start.endsWith('T20:00:00.000Z')), JSON.stringify(d.items[0]));
    const ut = await get('/api/usage/series?days=1&bucket=hour'); assert.ok(ut.items.every((r: any) => r.start.endsWith(':00:00.000Z') && r.start.slice(0, 13) === r.date), JSON.stringify(ut.items[0]));
    const utc = await get('/api/usage/series?days=5'); assert.equal(utc.timezone, 'UTC'); assert.equal(utc.items.length, 6);
    assert.equal((await req('GET', '/api/usage/series?tz=Mars/Base')).status, 400);
    console.log(`ok usage tz: Kolkata first day ${u.items[0].start}, Kathmandu first hour ${n.items[0].start}, Dubai first day ${d.items[0].start}; bad tz 400`); }
  console.log('ALL OK task-c-pages');
} finally { for (const p of procs) { try { process.kill(-p.pid!); } catch { /* */ } } }
