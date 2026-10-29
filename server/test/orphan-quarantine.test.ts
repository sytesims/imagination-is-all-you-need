// BH4 #3 follow-up: orphan cleanup is reversible. --apply --yes MOVES input-of-no-job + pre-* files into a quarantine (relative paths kept,
// manifest {path, size}), review-only and referenced files stay, --restore moves everything back byte-identical.
// Run: npx tsx test/orphan-quarantine.test.ts (temp dirs only).
import assert from 'node:assert/strict'; import { execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import Database from 'better-sqlite3';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-data-')); const Q = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'orq-q-')), 'orphans');
try {
  const db = new Database(path.join(D, 'openhiggsfield.db')); for (const t of ['jobs', 'job_meta', 'kv']) db.exec(`CREATE TABLE ${t} (id TEXT PRIMARY KEY, data TEXT)`);
  db.prepare('INSERT INTO jobs VALUES (?, ?)').run('aaaaaaaa', JSON.stringify({ input: { videoPath: path.join(D, 'aaaaaaaa-video0.mp4') }, outputs: [{ url: '/files/aaaaaaaa-out0.png' }] })); db.close();
  const files: Record<string, string> = { 'aaaaaaaa-video0.mp4': 'ref-in', 'aaaaaaaa-out0.png': 'ref-out', 'aaaaaaaa-extra.png': 'review', 'deadbeef-video0.mp4': 'orphan-input-' + 'x'.repeat(1000), 'pre-0123abcd.png': 'pre', 'cafef00d-out0.png': 'orphan-output' };
  const old = new Date(Date.now() - 3 * 3600_000); for (const [f, c] of Object.entries(files)) { fs.writeFileSync(path.join(D, f), c); fs.utimesSync(path.join(D, f), old, old); }
  const run = (...a: string[]) => execFileSync('npx', ['tsx', 'scripts/orphan-uploads.ts', '--data', D, '--quarantine', Q, ...a], { cwd: ROOT }).toString();
  const dry = run(); assert.match(dry, /DRY-RUN/); assert.ok(Object.keys(files).every((f) => fs.existsSync(path.join(D, f))), 'dry run moves nothing'); console.log('ok dry run touches nothing');
  const ap = run('--apply', '--yes'); assert.match(ap, /QUARANTINED 2 files/, ap);
  for (const f of ['deadbeef-video0.mp4', 'pre-0123abcd.png']) { assert.ok(!fs.existsSync(path.join(D, f))); assert.equal(fs.readFileSync(path.join(Q, f), 'utf8'), files[f]); }
  for (const f of ['aaaaaaaa-video0.mp4', 'aaaaaaaa-out0.png', 'aaaaaaaa-extra.png', 'cafef00d-out0.png']) assert.ok(fs.existsSync(path.join(D, f)), `${f} stays (referenced, review-only, or not in --cats)`);
  const man = JSON.parse(fs.readFileSync(path.join(Q, 'manifest.json'), 'utf8')); assert.equal(man.entries.length, 2); assert.ok(man.entries.every((e: any) => e.path.startsWith(D) && e.size > 0 && e.rel));
  assert.equal(man.entries.find((e: any) => e.rel === 'deadbeef-video0.mp4').size, files['deadbeef-video0.mp4'].length); console.log('ok --apply moves input-of-no-job + pre-* into quarantine with a manifest; referenced/review/output stay');
  assert.match(run('--apply', '--yes'), /QUARANTINED 0 files/); console.log('ok second --apply is a no-op');
  const rs = run('--restore'); assert.match(rs, /moved back 2 files/, rs);
  for (const [f, c] of Object.entries(files)) assert.equal(fs.readFileSync(path.join(D, f), 'utf8'), c, `${f} restored`);
  assert.ok(JSON.parse(fs.readFileSync(path.join(Q, 'manifest.json'), 'utf8')).entries.every((e: any) => e.restoredAt)); console.log('ok --restore puts every file back byte-identical');
  console.log('ALL OK orphan-quarantine');
} finally { fs.rmSync(D, { recursive: true, force: true }); fs.rmSync(path.dirname(Q), { recursive: true, force: true }); }
